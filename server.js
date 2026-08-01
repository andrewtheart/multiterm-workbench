/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const childProcess = require("node:child_process");
const pty = require("@homebridge/node-pty-prebuilt-multiarch");
const { isAllowedHttpHost, isAllowedWebSocketOrigin } = require("./ws-origin");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3177);
let allowRemote = process.env.ALLOW_REMOTE === "1";
const publicDir = path.join(__dirname, "public");
const maxMessageSize = 1024 * 1024;
// Concurrency ceilings. These are not access control -- the loopback bind and the
// Origin check are -- but every session is a real ConPTY and every client holds an
// open socket, so an unbounded create loop (a renderer bug as easily as a hostile
// same-user process) can exhaust the machine. Both sit far above real usage.
const maxClients = 32;
const maxSessions = 64;
const updatePreferencesMaxSize = 4096;
const websocketAcceptHash = ["sha", "1"].join("");

const sessions = new Map();
const clients = new Set();

// JavaScript dependencies are expressed as small capability objects rather than
// nominal interfaces. Tests can provide the same one-method contract without
// mutating process-wide module state.
/**
 * @typedef {object} SessionDependencies
 * @property {(file: string, args: string[], options: object) => object} spawnPty
 */
/** @type {Readonly<SessionDependencies>} */
const defaultSessionDependencies = Object.freeze({
  spawnPty: pty.spawn.bind(pty)
});

// Session teardown timings. Force-killing a ConPTY is genuinely dangerous — see
// killSessionPty — so a closing session is given two chances to exit on its own:
// first a plain "exit", then an interrupt in case the shell is busy in a
// foreground command and never sees it. Measured PowerShell exit latency is
// ~1.2s, so the first window has real headroom rather than racing the shell.
const SESSION_EXIT_GRACE_MS = 2500;
const SESSION_INTERRUPT_GRACE_MS = 2500;

// Tearing several ConPTYs down at the same moment aborts the process natively with
// an access violation (0xC0000005), even when every shell exits gracefully and no
// kill() is involved. Reproducible on node-pty 0.13.1 and 0.14.1 from ~8 concurrent
// closes; spacing them out is reliable. Closing one session stays immediate.
const SESSION_TEARDOWN_STAGGER_MS = 150;
let nextTeardownAt = 0;

// Quitting has to outlast a staggered close of every open session, but must still
// give up rather than hanging if a shell refuses to exit.
const SHUTDOWN_MAX_WAIT_MS = 8000;
const SHUTDOWN_POLL_MS = 100;

// A pty hands us output in whatever slices the shell happens to write — measured
// at ~11k chunks/second averaging ~100 bytes for a colorized build log. Forwarding
// each one as its own WebSocket message costs a fixed ~6us of browser event
// plumbing regardless of size, so the renderer spends most of a heavy stream
// inside WebSocket dispatch rather than drawing. Holding chunks for a few
// milliseconds and sending one message collapses that by more than an order of
// magnitude and roughly halves the wire bytes (one JSON envelope instead of
// thousands). The renderer already re-batches per animation frame, so nothing
// about what the user sees changes.
const OUTPUT_COALESCE_MAX_MS = 100;
const OUTPUT_COALESCE_DEFAULT_MS = 8;
let outputCoalesceMs = OUTPUT_COALESCE_DEFAULT_MS;

function isOutputCoalesced() {
  return outputCoalesceMs > 0;
}

// Clamped rather than rejected: the value arrives from renderer settings, and a
// nonsense number should fall back to the default instead of dropping output
// batching (or holding it for an unbounded time).
function setOutputCoalesceMs(value) {
  const requested = Number(value);
  if (Number.isFinite(requested)) {
    outputCoalesceMs = Math.min(OUTPUT_COALESCE_MAX_MS, Math.max(0, Math.round(requested)));
  } else {
    outputCoalesceMs = OUTPUT_COALESCE_DEFAULT_MS;
  }
  return outputCoalesceMs;
}

function getOutputCoalesceMs() {
  return outputCoalesceMs;
}

function applyClientConfig(client, message) {
  const applied = setOutputCoalesceMs(message.outputCoalesceMs);
  client.send({ type: "config", outputCoalesceMs: applied });
}

function hasPendingOutput(session) {
  return session.pendingOutput.length > 0;
}

function hasOutputFlushTimer(session) {
  return Boolean(session.outputTimer);
}

function queueSessionOutput(session, data) {
  if (isOutputCoalesced()) {
    session.pendingOutput.push(data);
    scheduleOutputFlush(session);
  } else {
    broadcast({ type: "output", id: session.id, stream: "pty", data });
  }
}

function scheduleOutputFlush(session) {
  if (hasOutputFlushTimer(session)) {
    return;
  } else {
    session.outputTimer = setTimeout(() => flushSessionOutput(session), outputCoalesceMs);
    session.outputTimer.unref();
  }
}

// Also called before "exited" so a shell's final bytes can never arrive after the
// frame that tells the renderer the session is gone.
function flushSessionOutput(session) {
  clearTimeout(session.outputTimer);
  session.outputTimer = null;
  if (hasPendingOutput(session)) {
    const data = session.pendingOutput.join("");
    session.pendingOutput = [];
    broadcast({ type: "output", id: session.id, stream: "pty", data });
  } else {
    // Timer raced a flush that already drained the buffer; nothing to send.
  }
}

function scheduleSessionTeardown(run) {
  const now = Date.now();
  const runAt = Math.max(now, nextTeardownAt);
  nextTeardownAt = runAt + SESSION_TEARDOWN_STAGGER_MS;

  const delay = runAt - now;
  if (delay <= 0) {
    run();
    return;
  }

  setTimeout(run, delay).unref();
}

// Test hook: the stagger cursor is module state, so suites that drive teardown with
// fake timers need a clean starting point.
function __resetTeardownSchedule() {
  nextTeardownAt = 0;
}

// Memory stats are computed entirely in this bridge process (never the
// renderer) so the UI thread is never blocked. Gated behind an env flag set by
// the Electron main process and Windows-only, so tests and other platforms are
// completely inert. Extracted so both operands are directly exercisable.
function computeMemStatsDefault() {
  return process.env.MEMSTATS === "1" && process.platform === "win32";
}

// Each reading spawns a PowerShell CIM query (~1s), so the periodic push above
// is deliberately opt-in. The status bar instead asks for a reading only while
// the user is actually looking at it (hovering the memory chip), which must
// work even when the background poll is off — including plain browser mode,
// where nothing sets MEMSTATS. That on-demand path is gated on the platform
// alone, since Win32_Process is the only supported source.
function memStatsSupported() {
  return process.platform === "win32";
}
let memStatsEnabled = computeMemStatsDefault();
let memStatsInterval = null;
let memSettleTimer = null;
let memStatsInFlight = false;
let lastMemStats = null;
// Clients waiting on the in-flight reading, so a burst of hovers coalesces into
// a single CIM query instead of one PowerShell process per request.
let memStatsWaiters = [];
// Each reading costs ~1.2s of wall time and ~360ms of CPU in a fresh PowerShell
// process. The status bar only shows the figure while the memory chip is open,
// and polls on its own while it is, so the background refresh follows the same
// contract: it runs only in the window after somebody actually asked. Without
// this the bridge burned ~360 PowerShell spawns an hour for a chip nobody was
// looking at.
const MEM_INTEREST_WINDOW_MS = 30000;
let lastMemStatsRequestAt = 0;

function noteMemStatsInterest() {
  lastMemStatsRequestAt = Date.now();
}

function hasRecentMemStatsInterest() {
  return lastMemStatsRequestAt > 0 && Date.now() - lastMemStatsRequestAt < MEM_INTEREST_WINDOW_MS;
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".png", "image/png"],
  [".webmanifest", "application/manifest+json"]
]);

const securityHeaders = Object.freeze({
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' ws://127.0.0.1:* ws://localhost:* https://api.github.com",
    "frame-src 'self'",
    "manifest-src 'self'",
    "media-src 'none'",
    "worker-src 'none'"
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});

function setSecurityHeaders(response, { allowSameOriginFrame = false } = {}) {
  if (!response || response.headersSent || typeof response.setHeader !== "function") return;
  for (const [name, value] of Object.entries(securityHeaders)) {
    if (allowSameOriginFrame && name === "Content-Security-Policy") {
      response.setHeader(name, value.replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
    } else if (allowSameOriginFrame && name === "X-Frame-Options") {
      response.setHeader(name, "SAMEORIGIN");
    } else {
      response.setHeader(name, value);
    }
  }
}

const server = http.createServer((request, response) => {
  const pathname = getPathname(request.url);
  setSecurityHeaders(response, { allowSameOriginFrame: pathname === "/help.html" });

  // Anti-DNS-rebinding. Skipped when remote access is explicitly opted into, since
  // remote clients legitimately reach the bridge under some other hostname.
  if (!allowRemote && !isAllowedHttpHost(request.headers.host)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  if (pathname === "/api/update-preferences") {
    handleUpdatePreferencesRequest(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  if (pathname === "/health") {
    sendJsonResponse(response, 200, {
      ok: true,
      sessions: sessions.size,
      cwd: process.cwd()
    });
    return;
  }

  serveStaticFile(pathname, response, request.method === "HEAD");
});

server.on("upgrade", (request, socket) => {
  const pathname = getPathname(request.url);

  if (pathname !== "/ws") {
    socket.destroy();
    return;
  }

  if (!allowRemote && !isLocalAddress(socket.remoteAddress)) {
    socket.destroy();
    return;
  }

  // Reject cross-site WebSocket handshakes (CSWSH). Skipped when remote access is
  // explicitly opted into, since remote clients legitimately carry other origins.
  if (!allowRemote && !isAllowedWebSocketOrigin(request.headers.origin, request.headers.host)) {
    socket.destroy();
    return;
  }

  const key = request.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  // RFC 6455 defines this handshake for version 13 only. Anything else is a
  // pre-standard client or a probe, and must not be answered with a 101.
  if (request.headers["sec-websocket-version"] !== "13") {
    socket.destroy();
    return;
  }

  if (clients.size >= maxClients) {
    console.warn(`[bridge] Refused a WebSocket client: already at the ${maxClients}-client limit.`);
    socket.destroy();
    return;
  }

  const accept = crypto
    // RFC 6455 requires SHA-1 for the WebSocket accept header.
    .createHash(websocketAcceptHash)
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  const client = {
    buffer: Buffer.alloc(0),
    socket,
    send(message) {
      client.sendFrame(encodeFrame(JSON.stringify(message)));
    },
    // Writes bytes that have already been encoded. broadcast() builds one frame
    // for the whole fan-out and hands the same buffer to every client.
    sendFrame(frame) {
      if (!socket.destroyed) {
        socket.write(frame);
      }
    }
  };

  clients.add(client);
  client.send({
    type: "welcome",
    cwd: process.cwd(),
    sessions: [...sessions.values()].map(toSessionSummary)
  });

  if (memStatsEnabled) {
    if (lastMemStats) {
      client.send(memStatsFrame(lastMemStats));
    }
    scheduleMemStats(500);
  }

  socket.on("data", (chunk) => {
    try {
      readFrames(client, chunk);
    } catch (error) {
      // A single malformed frame or a throwing message handler must never take
      // down the whole bridge — that would drop every other terminal session.
      // Isolate the failure to this client and keep the bridge serving others.
      console.error("[bridge] Error handling client data:", error && error.stack ? error.stack : error);
      try {
        client.send({ type: "error", message: "Internal bridge error while handling a message." });
      } catch {
        /* socket may already be gone; nothing else to do */
      }
    }
  });
  socket.on("close", () => clients.delete(client));
  socket.on("error", () => clients.delete(client));
});

function start(callback, overridePort, overrideHost) {
  const listenPort = overridePort === undefined ? port : overridePort;
  const listenHost = overrideHost === undefined ? host : overrideHost;
  server.listen(listenPort, listenHost, () => {
    const address = server.address();
    const boundPort = address && typeof address === "object" ? address.port : listenPort;
    console.log(`MultiTerm bridge running on ${listenHost}:${boundPort}`);
    console.log("PowerShell sessions are available only to this local machine by default.");
    if (typeof callback === "function") {
      callback({ host: listenHost, port: boundPort });
    }
  });
  startMemStats();
  return server;
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", handleProcessExit);

// A terminal multiplexer must survive isolated failures. node-pty's Windows
// ConPTY path (e.g. the console-list helper's "AttachConsole failed") and native
// kill/spawn calls can occasionally throw or reject; without these nets Node's
// defaults would terminate the entire bridge and drop every live session. Log
// loudly and keep serving the remaining terminals instead of crashing.
process.on("uncaughtException", handleUncaughtException);
process.on("unhandledRejection", handleUnhandledRejection);

function handleUncaughtException(error) {
  console.error("[bridge] Uncaught exception (continuing):", error && error.stack ? error.stack : error);
}

function handleUnhandledRejection(reason) {
  console.error("[bridge] Unhandled rejection (continuing):", reason && reason.stack ? reason.stack : reason);
}

function handleProcessExit() {
  closeSessions(false);
}

/* v8 ignore next 3 -- only executes when server.js is the process entry point */
if (require.main === module) {
  start();
}

function __setAllowRemote(value) {
  allowRemote = value;
}

function __setMemStatsEnabled(value) {
  memStatsEnabled = Boolean(value);
}

module.exports = {
  server,
  start,
  host,
  port,
  sessions,
  clients,
  mimeTypes,
  securityHeaders,
  maxMessageSize,
  maxClients,
  maxSessions,
  updatePreferencesMaxSize,
  __setAllowRemote,
  __setMemStatsEnabled,
  getPathname,
  setSecurityHeaders,
  serveStaticFile,
  sendJsonResponse,
  getUpdatePreferencesPath,
  normalizeUpdatePreferences,
  readUpdatePreferences,
  writeUpdatePreferences,
  handleUpdatePreferencesRequest,
  readFrames,
  encodeFrame,
  handleClientMessage,
  createSession,
  writeSession,
  rememberSize,
  killSession,
  killSessionPty,
  interruptAndExit,
  scheduleSessionTeardown,
  __resetTeardownSchedule,
  isOutputCoalesced,
  setOutputCoalesceMs,
  getOutputCoalesceMs,
  applyClientConfig,
  queueSessionOutput,
  scheduleOutputFlush,
  flushSessionOutput,
  OUTPUT_COALESCE_DEFAULT_MS,
  OUTPUT_COALESCE_MAX_MS,
  killAllSessions,
  closeSessions,
  endSessionInput,
  isSessionRunning,
  shutdown,
  handleProcessExit,
  broadcast,
  toSessionSummary,
  sanitizeId,
  getShell,
  normalizeTmuxTarget,
  getTmuxShell,
  normalizeWslOutput,
  parseTmuxSessions,
  listWslTmuxSessions,
  getWorkingDirectory,
  isLocalAddress,
  isAllowedHttpHost,
  isAllowedWebSocketOrigin,
  startLog,
  stopLog,
  closeLog,
  sanitizeLogName,
  stripAnsiForLog,
  revealPath,
  openPath,
  pickScript,
  launchElevatedTerminal,
  launchElevatedHost,
  handleElevatedConnection,
  registerElevatedSession,
  finishElevatedSession,
  finishElevationAttempt,
  describeElevationError,
  elevationErrorMessage,
  timingSafeStringEqual,
  encodeElevationData,
  decodeElevationData,
  defaultElevationServerFactory,
  __setElevationServerFactory,
  computeMemStats,
  computeMemStatsDefault,
  memStatsSupported,
  memStatsFrame,
  runMemStats,
  broadcastMemStats,
  requestMemStats,
  collectProcessStatistics,
  collectProcessTreeMetrics,
  buildStatisticsFrame,
  requestStatistics,
  pushMemStats,
  pushMemStatsIfWatched,
  scheduleMemStats,
  noteMemStatsInterest,
  hasRecentMemStatsInterest,
  startMemStats,
  stopMemStats,
  handleUncaughtException,
  handleUnhandledRejection
};

function getPathname(rawUrl) {
  const pathPart = String(rawUrl || "/").split("?", 1)[0];
  return pathPart || "/";
}

function serveStaticFile(rawPathname, response, headOnly) {
  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname === "/" ? "/index.html" : rawPathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }

  const filePath = path.normalize(path.join(publicDir, pathname));
  const relative = path.relative(publicDir, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    } else {
      response.writeHead(200, {
        "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
        "Cache-Control": "no-store"
      });

      if (headOnly) {
        response.end();
      } else {
        response.end(content);
      }
    }
  });
}

function sendJsonResponse(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function getUpdatePreferencesPath() {
  if (process.env.MULTITERM_PREFERENCES_PATH) {
    return path.resolve(process.env.MULTITERM_PREFERENCES_PATH);
  }
  const localData = process.env.LOCALAPPDATA
    || (process.platform === "win32"
      ? path.join(os.homedir(), "AppData", "Local")
      : path.join(os.homedir(), ".local", "share"));
  return path.join(localData, "MultiTerm", "update-preferences.json");
}

function normalizeUpdatePreferences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Update preferences must be an object.");
  }
  if (typeof value.configured !== "boolean" || typeof value.enabled !== "boolean") {
    throw new TypeError("Update preference flags must be boolean values.");
  }
  const intervalHours = Math.round(Number(value.intervalHours));
  if (!Number.isFinite(intervalHours)) {
    throw new TypeError("The update interval must be a number.");
  }
  return {
    configured: value.configured,
    enabled: value.configured && value.enabled,
    intervalHours: Math.min(168, Math.max(1, intervalHours))
  };
}

async function readUpdatePreferences(filePath = getUpdatePreferencesPath()) {
  let content;
  try {
    content = await fs.promises.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  return normalizeUpdatePreferences(JSON.parse(content));
}

async function writeUpdatePreferences(value, filePath = getUpdatePreferencesPath()) {
  const preferences = normalizeUpdatePreferences(value);
  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  await fs.promises.mkdir(directory, { recursive: true });
  try {
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(preferences)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await fs.promises.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
  return preferences;
}

function handleUpdatePreferencesRequest(request, response) {
  if (!isLocalAddress(request.socket?.remoteAddress)
      || request.headers["x-multiterm-request"] !== "Renderer") {
    sendJsonResponse(response, 403, { ok: false, error: "Forbidden" });
    return;
  }

  if (request.method === "GET") {
    readUpdatePreferences().then(
      (preferences) => sendJsonResponse(response, 200, { ok: true, preferences }),
      (error) => sendJsonResponse(response, 500, { ok: false, error: String(error.message || error) })
    );
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    sendJsonResponse(response, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  const declaredSize = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredSize) && declaredSize > updatePreferencesMaxSize) {
    request.resume();
    sendJsonResponse(response, 413, { ok: false, error: "Request too large" });
    return;
  }

  let body = "";
  let tooLarge = false;
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    if (tooLarge) return;
    body += chunk;
    if (Buffer.byteLength(body, "utf8") > updatePreferencesMaxSize) {
      tooLarge = true;
      body = "";
    }
  });
  request.on("error", (error) => {
    if (!response.headersSent) {
      sendJsonResponse(response, 400, { ok: false, error: String(error.message || error) });
    }
  });
  request.on("end", () => {
    if (tooLarge) {
      sendJsonResponse(response, 413, { ok: false, error: "Request too large" });
      return;
    }
    let value;
    try {
      value = JSON.parse(body);
    } catch {
      sendJsonResponse(response, 400, { ok: false, error: "Invalid JSON" });
      return;
    }
    writeUpdatePreferences(value).then(
      (preferences) => sendJsonResponse(response, 200, { ok: true, preferences }),
      (error) => {
        const status = error instanceof TypeError ? 400 : 500;
        sendJsonResponse(response, status, { ok: false, error: String(error.message || error) });
      }
    );
  });
}

function readFrames(client, chunk, dependencies = defaultSessionDependencies) {
  client.buffer = Buffer.concat([client.buffer, chunk]);

  while (client.buffer.length >= 2) {
    const firstByte = client.buffer[0];
    const secondByte = client.buffer[1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let length = secondByte & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (client.buffer.length < 4) return;
      length = client.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (client.buffer.length < 10) return;
      length = Number(client.buffer.readBigUInt64BE(2));
      offset = 10;
    }

    if (length > maxMessageSize || !masked) {
      client.socket.end(encodeFrame("", 0x8));
      return;
    }

    const frameLength = offset + 4 + length;
    if (client.buffer.length < frameLength) return;

    const mask = client.buffer.subarray(offset, offset + 4);
    offset += 4;

    const payload = Buffer.alloc(length);
    for (let index = 0; index < length; index += 1) {
      payload[index] = client.buffer[offset + index] ^ mask[index % 4];
    }

    client.buffer = client.buffer.subarray(frameLength);

    if (opcode === 0x8) {
      client.socket.end(encodeFrame("", 0x8));
      return;
    }

    if (opcode === 0x9) {
      client.socket.write(encodeFrame(payload, 0xA));
      continue;
    }

    if (opcode === 0x1) {
      handleClientMessage(client, payload.toString("utf8"), dependencies);
    }
  }
}

function encodeFrame(payload, opcode = 0x1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;

  if (data.length < 126) {
    header = Buffer.alloc(2);
    header[1] = data.length;
  } else if (data.length <= 65535) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }

  header[0] = 0x80 | opcode;
  return Buffer.concat([header, data]);
}

function handleClientMessage(client, rawMessage, dependencies = defaultSessionDependencies) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    client.send({ type: "error", message: "Invalid bridge message." });
    return;
  }

  switch (message.type) {
    case "create":
      createSession(client, message, dependencies);
      break;
    case "listTmux":
      listWslTmuxSessions(client, message.requestId);
      break;
    case "input":
      writeSession(message.id, message.data);
      break;
    case "resize":
      rememberSize(message.id, message.cols, message.rows);
      break;
    case "kill":
      killSession(message.id);
      break;
    case "killAll":
      killAllSessions();
      break;
    case "logStart":
      startLog(client, message.id);
      break;
    case "logStop":
      stopLog(client, message.id);
      break;
    case "reveal":
      revealPath(client, message);
      break;
    case "openPath":
      openPath(client, message);
      break;
    case "pickScript":
      pickScript(client, message);
      break;
    case "elevate":
      launchElevatedTerminal(client, message);
      break;
    case "list":
      client.send({ type: "sessions", sessions: [...sessions.values()].map(toSessionSummary) });
      break;
    case "memstats":
      requestMemStats(client);
      break;
    case "config":
      applyClientConfig(client, message);
      break;
    case "statistics":
      requestStatistics(client, message);
      break;
    default:
      client.send({ type: "error", message: `Unsupported message type: ${message.type}` });
      break;
  }
}

function createSession(client, options, dependencies = defaultSessionDependencies) {
  const id = sanitizeId(options.id);
  if (sessions.has(id)) {
    client.send({ type: "error", id, message: "A session with this id already exists." });
    return;
  }

  if (sessions.size >= maxSessions) {
    client.send({ type: "createFailed", id, message: `The bridge is limited to ${maxSessions} terminals.` });
    return;
  }

  const tmux = normalizeTmuxTarget(options.tmux);
  if (options.tmux && !tmux) {
    client.send({ type: "createFailed", id, message: "Invalid WSL tmux target." });
    return;
  }

  const shell = tmux ? getTmuxShell(tmux) : getShell(options.shell);
  const cwd = tmux ? process.cwd() : getWorkingDirectory(options.cwd);
  const cols = Number(options.cols) || 120;
  const rows = Number(options.rows) || 30;
  let terminal;

  try {
    terminal = dependencies.spawnPty(shell.file, shell.args, {
      cols,
      cwd,
      env: {
        ...process.env,
        COLORTERM: process.env.COLORTERM || "truecolor",
        TERM: process.env.TERM || "xterm-256color"
      },
      name: "xterm-256color",
      rows,
      useConpty: true
    });
  } catch (error) {
    client.send({ type: "createFailed", id, message: error.message });
    return;
  }

  const title = typeof options.title === "string" && options.title.trim() ? options.title.trim() : shell.label;
  const session = {
    bytesIn: 0,
    bytesOut: 0,
    cols,
    cwd,
    exited: false,
    id,
    keystrokesIn: 0,
    keystrokesOut: 0,
    killed: false,
    closing: false,
    logStream: null,
    logPath: null,
    pendingOutput: [],
    outputTimer: null,
    rows,
    shell: tmux ? "wsl" : shell.label,
    startedAt: new Date().toISOString(),
    terminal,
    title,
    tmux
  };

  sessions.set(id, session);

  terminal.onData((data) => {
    session.keystrokesOut += data.length;
    session.bytesOut += Buffer.byteLength(data, "utf8");
    if (session.logStream) {
      try {
        session.logStream.write(stripAnsiForLog(data));
      } catch {
        // A failed log write should never break the live session.
      }
    }
    queueSessionOutput(session, data);
  });

  terminal.onExit(({ exitCode, signal }) => {
    session.exited = true;
    flushSessionOutput(session);
    closeLog(session);
    sessions.delete(id);
    broadcast({ type: "exited", id, code: exitCode, signal });
    scheduleMemStats(1500);
  });

  const created = { type: "created", ...toSessionSummary(session) };
  client.send(created);
  // External automation clients (for example Yagu's visible update downloader) create sessions over
  // their own WebSocket. Notify every other client so the new terminal appears in the open workbench UI.
  broadcast(created, client);
  scheduleMemStats(2000);
}

function writeSession(id, data) {
  const session = sessions.get(id);
  if (!session || typeof data !== "string") return;

  if (isSessionRunning(session)) {
    session.keystrokesIn += data.length;
    session.bytesIn += Buffer.byteLength(data, "utf8");
    session.terminal.write(data);
  }
}

function rememberSize(id, cols, rows) {
  if (!sessions.has(id)) return;
  const session = sessions.get(id);

  session.cols = Number(cols) || session.cols;
  session.rows = Number(rows) || session.rows;

  if (!isSessionRunning(session)) return;

  try {
    session.terminal.resize(session.cols, session.rows);
  } catch {
    // The pty may have closed between the size event and the resize call.
  }
}

// On Windows, node-pty frees the native ConPTY synchronously inside kill(), but the
// JS-side exit signal only arrives later from the native onExit callback. Any write,
// resize, clear or second kill issued in that gap dereferences freed memory and takes
// the whole bridge down with an access violation (0xC0000005) or heap corruption
// (0xC0000374). Mark the session dead synchronously so nothing can touch it afterwards.
//
// Even a single well-formed kill() can abort the process inside node-pty's own ConPTY
// teardown (reproducible with bare spawn/kill churn on 0.13.1 and 0.14.1, on both the
// conpty and conpty.dll paths), so callers should exhaust the graceful routes in
// killSession before reaching for this.
function killSessionPty(session) {
  if (!isSessionRunning(session)) return;

  session.killed = true;

  try {
    session.terminal.kill();
  } catch {
    // The pty may have already torn itself down; the session is dead either way.
  }
}

// Ask a session to end without force-killing it. A shell sitting at its prompt honours
// "exit"; one busy in a foreground command never sees it, so interrupt it first.
function interruptAndExit(session) {
  if (!isSessionRunning(session)) return;

  if (session.tmux) {
    killSessionPty(session);
    return;
  } else {
    try {
      session.terminal.write("\u0003");
      session.terminal.write("exit\r");
    } catch {
      killSessionPty(session);
    }
  }
}

function killSession(id) {
  const session = sessions.get(id);
  if (!isSessionRunning(session) || session.closing) return;

  session.closing = true;

  scheduleSessionTeardown(() => {
    endSessionInput(session);

    setTimeout(() => {
      interruptAndExit(session);
    }, SESSION_EXIT_GRACE_MS).unref();

    setTimeout(() => {
      killSessionPty(session);
    }, SESSION_EXIT_GRACE_MS + SESSION_INTERRUPT_GRACE_MS).unref();
  });
}

function killAllSessions() {
  for (const session of [...sessions.values()]) {
    killSession(session.id);
  }
}

function closeSessions(graceful) {
  for (const session of sessions.values()) {
    if (graceful) {
      scheduleSessionTeardown(() => endSessionInput(session));
    } else {
      // Reached from the process 'exit' handler, which cannot wait for staggering.
      killSessionPty(session);
    }
  }
}

function endSessionInput(session) {
  if (!isSessionRunning(session)) return;

  try {
    // Detach only MultiTerm's tmux client. The standard prefix works immediately;
    // a custom prefix falls back to killing this WSL client after the grace period,
    // which still leaves the tmux server and its shells alive.
    session.terminal.write(session.tmux ? "\u0002d" : "exit\r");
  } catch {
    killSessionPty(session);
  }
}

function isSessionRunning(session) {
  return Boolean(session && session.terminal && !session.exited && !session.killed);
}

function startLog(client, id) {
  const session = sessions.get(id);
  if (!session) {
    return;
  } else if (session.logStream) {
    client.send({ type: "logStarted", id, path: session.logPath, already: true });
    return;
  } else {
    try {
      const dir = path.join(os.homedir(), "MultiTerm", "logs");
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const base = sanitizeLogName(session.title || session.shell || "session");
      const file = path.join(dir, `${base}-${stamp}.log`);
      session.logStream = fs.createWriteStream(file, { flags: "a" });
      session.logPath = file;
      session.logStream.write(`# MultiTerm log for "${session.title}" (${session.shell}) started ${new Date().toISOString()}\r\n`);
      client.send({ type: "logStarted", id, path: file });
    } catch (error) {
      client.send({ type: "logError", id, message: error.message });
    }
  }
}

function stopLog(client, id) {
  const session = sessions.get(id);
  if (!session || !session.logStream) return;

  const file = session.logPath;
  closeLog(session);
  client.send({ type: "logStopped", id, path: file });
}

function closeLog(session) {
  if (session && session.logStream) {
    try {
      session.logStream.end();
    } catch {
      // Ignore errors closing the log stream.
    }
    session.logStream = null;
  }
}

function sanitizeLogName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60) || "session";
}

// Terminals emit ANSI/OSC escape sequences; strip them so the log file is
// readable plain text while keeping tabs and line breaks intact.
function stripAnsiForLog(data) {
  return String(data)
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[=>()#][A-Za-z0-9]?/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function revealPath(client, message) {
  const target = typeof message.path === "string" ? message.path.trim() : "";
  if (!target) {
    return;
  } else {
    let dir;
    try {
      const resolved = path.resolve(target);
      dir = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
    } catch {
      client.send({ type: "revealError", message: "Path not found." });
      return;
    }

    try {
      const command = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
      childProcess.spawn(command, [dir], { detached: true, stdio: "ignore" }).unref();
    } catch (error) {
      client.send({ type: "revealError", message: error.message });
    }
  }
}

// Opens a native "choose a script" dialog on the user's desktop and reports the
// chosen path back. The browser cannot do this: a file input never exposes a
// real path, so the bridge has to own the dialog. Windows only — the picker is
// a Win32 common dialog, driven from a short-lived STA PowerShell process
// because Node has no way to show one.
function pickScript(client, message) {
  const requestId = typeof message.requestId === "string" ? message.requestId : "";
  const answer = (chosen) => client.send({ type: "scriptPicked", requestId, path: chosen || null });

  if (process.platform !== "win32") {
    answer(null);
    return;
  }

  let initialDir = "";
  try {
    const candidate = path.resolve(String(message.cwd || "").trim() || process.cwd());
    if (fs.statSync(candidate).isDirectory()) {
      initialDir = candidate;
    } else {
      // File paths are not valid initial directories for the picker.
    }
  } catch {
    initialDir = "";
  }

  // -STA is required: the shell-based file dialog cannot run on an MTA thread.
  // The initial directory travels in the environment rather than being interpolated
  // into the command text, so a directory name can never terminate the string
  // literal and inject PowerShell. The chosen path is written to stdout on its own
  // line so an empty result reads as a cancellation rather than a failure.
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$d = New-Object System.Windows.Forms.OpenFileDialog",
    "$d.Title = 'Select a script to run'",
    "$d.Filter = 'Scripts (*.ps1;*.bat;*.cmd)|*.ps1;*.bat;*.cmd|PowerShell (*.ps1)|*.ps1|Batch (*.bat;*.cmd)|*.bat;*.cmd|All files (*.*)|*.*'",
    "if ($env:MT_PICK_DIR) { $d.InitialDirectory = $env:MT_PICK_DIR }",
    "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.FileName) }"
  ].join("; ");

  let child;
  try {
    child = childProcess.spawn(
      "powershell.exe",
      ["-NoProfile", "-STA", "-Command", script],
      { windowsHide: true, env: { ...process.env, MT_PICK_DIR: initialDir } }
    );
  } catch (error) {
    console.error("[bridge] Script picker failed to start:", error.message);
    answer(null);
    return;
  }

  let out = "";
  let settled = false;
  const settle = (chosen) => {
    if (settled) {
      return;
    } else {
      settled = true;
      answer(chosen);
    }
  };

  child.stdout.on("data", (chunk) => { out += chunk.toString(); });
  child.on("error", (error) => {
    console.error("[bridge] Script picker failed:", error.message);
    settle(null);
  });
  child.on("close", () => settle(out.trim()));
}

// Opens a file with whatever the OS has associated with it, so a log can be read in
// the user's default text viewer. Distinct from revealPath, which opens the folder.
function openPath(client, message) {
  const target = typeof message.path === "string" ? message.path.trim() : "";
  if (!target) {
    return;
  } else {
    let resolved;
    try {
      resolved = path.resolve(target);
      fs.statSync(resolved);
    } catch {
      client.send({ type: "openError", message: "Path not found." });
      return;
    }

    try {
      if (process.platform === "win32") {
        // Association lookup is a shell operation, but it must NOT go through cmd.exe:
        // Windows only quotes an argument that contains whitespace, so a path holding
        // `&` or `|` (both legal in a file name) would reach `cmd /c` unquoted and be
        // re-parsed as extra commands. Hand the path to PowerShell through the
        // environment instead, where it is never part of a command line, and use
        // -LiteralPath so wildcards are not expanded either.
        childProcess.spawn(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", "Start-Process -LiteralPath $env:MT_OPEN_PATH"],
          {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            env: { ...process.env, MT_OPEN_PATH: resolved }
          }
        ).unref();
      } else {
        const command = process.platform === "darwin" ? "open" : "xdg-open";
        childProcess.spawn(command, [resolved], { detached: true, stdio: "ignore" }).unref();
      }
    } catch (error) {
      client.send({ type: "openError", message: error.message });
    }
  }
}

// Sentinel the elevation launcher prints (to stdout) ahead of an error message so the
// bridge can distinguish a genuine failure from normal output.
const ELEVATE_ERROR_PREFIX = "MT_ELEVATE_ERR:";

// Absolute path to the elevated PTY helper. It runs at HIGH integrity (via UAC) and owns
// the elevated shell's pseudo-console on that side of the integrity boundary, streaming its
// I/O back to this (medium-integrity) bridge over an authenticated loopback channel.
const ELEVATED_HOST_SCRIPT = path.join(__dirname, "elevated-pty-host.js");

// A generous window for the whole "raise the UAC prompt, user approves, helper elevates and
// connects back" round-trip. If nothing connects by then, the attempt is torn down.
const ELEVATION_CONNECT_TIMEOUT_MS = 120000;

// Once a connection arrives it must authenticate quickly; otherwise a stray loopback
// connection could consume the one-shot listener and hang the tab forever.
const ELEVATION_AUTH_TIMEOUT_MS = 15000;

// Overridable so tests can supply a fake one-shot server without opening real sockets.
function defaultElevationServerFactory(onConnection) {
  return net.createServer(onConnection);
}
let elevationServerFactory = defaultElevationServerFactory;
function __setElevationServerFactory(factory) {
  elevationServerFactory = factory;
}

// Constant-time comparison for the channel token. Guards the length first because
// timingSafeEqual throws on differing buffer lengths.
function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function encodeElevationData(text) {
  return Buffer.from(String(text), "utf8").toString("base64");
}

function decodeElevationData(text) {
  return Buffer.from(String(text), "base64").toString("utf8");
}

// Best-effort teardown helpers, funnelled through one place so every call site tears down
// the same way. node's socket.destroy() and server.close() are safe to call repeatedly and
// never throw synchronously (a non-listening server surfaces its error via callback), so no
// defensive try/catch is needed here.
function destroySocket(socket) {
  socket.destroy();
}

function closeElevationServer(server) {
  server.close();
}

// Host an administrator terminal INSIDE MultiTerm. A UAC-elevated shell runs at high
// integrity, which ConPTY cannot attach across from this medium-integrity bridge, so the
// pseudo-console is owned by a high-integrity helper (elevated-pty-host.js) launched via
// UAC. The helper streams the terminal back over a loopback channel guarded by a one-time
// token; crucially, the helper independently verifies (by PID) that it is talking to THIS
// bridge before it applies any of our input to the elevated shell — so a lower-integrity
// process cannot drive the elevated session. Success is wired into the normal session map,
// so the renderer treats it like any other terminal tab.
function launchElevatedTerminal(client, message) {
  if (process.platform !== "win32") {
    client.send({ type: "elevateError", message: "Administrator terminals are only supported on Windows." });
    return;
  }

  const id = sanitizeId(message.id);
  if (sessions.has(id)) {
    client.send({ type: "error", id, message: "A session with this id already exists." });
  } else if (sessions.size >= maxSessions) {
    client.send({ type: "elevateError", id, message: `The bridge is limited to ${maxSessions} terminals.` });
  } else {
    beginElevationAttempt(client, id, message);
  }
}

// Set up the loopback listener + UAC launcher for a fresh (non-duplicate) admin terminal.
function beginElevationAttempt(client, id, message) {
  const shell = getShell(message.shell);
  const cwd = getWorkingDirectory(message.cwd);
  const cols = Number(message.cols) || 120;
  const rows = Number(message.rows) || 30;
  const title = typeof message.title === "string" && message.title.trim() ? message.title.trim() : shell.label;
  const token = crypto.randomBytes(32).toString("hex");

  const attempt = {
    id,
    client,
    cols,
    rows,
    cwd,
    title,
    token,
    label: shell.label,
    settled: false,
    session: null,
    server: null,
    timer: null
  };

  const server = elevationServerFactory((socket) => handleElevatedConnection(attempt, socket));
  attempt.server = server;
  server.on("error", (error) => finishElevationAttempt(attempt, error.message));

  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const listenPort = address && typeof address === "object" ? address.port : 0;
    launchElevatedHost(attempt, {
      port: listenPort,
      token,
      bridgePid: process.pid,
      shellFile: shell.file,
      shellArgs: shell.args,
      cwd,
      cols,
      rows,
      label: shell.label
    });
  });

  attempt.timer = setTimeout(
    () => finishElevationAttempt(attempt, "Administrator terminal did not connect in time."),
    ELEVATION_CONNECT_TIMEOUT_MS
  );
  attempt.timer.unref();
}

// Spawn the helper elevated via ShellExecute "runas" (which raises the UAC prompt), reusing
// the hardened launcher. It MUST run attached — detached:true silently no-ops "runas" — and
// its stdout/stderr are piped so a declined prompt or launch failure is relayed rather than
// lost. We elevate the SAME node runtime this bridge runs under (process.execPath) so the
// helper's node-pty prebuilt binary matches the ABI.
//
// TWO windows have to be suppressed here, via two different mechanisms:
//   * The launcher powershell.exe — hidden by spawn's windowsHide below.
//   * The elevated helper itself — hidden by -WindowStyle Hidden. process.execPath is
//     node.exe, a CONSOLE-subsystem binary, so without this Windows gives it a visible
//     console window. windowsHide does not reach it: that option only affects the child
//     this process creates, and the helper is created by the UAC broker, not by us.
//     -WindowStyle Hidden lands in ShellExecuteEx's nShow, which the broker forwards into
//     the elevated process's STARTUPINFO, so the console is never shown in the first place.
//     The UAC consent dialog is drawn by a separate secure-desktop process and is unaffected.
//     The elevated shell itself is a ConPTY pseudo-console and never had a window.
function launchElevatedHost(attempt, config) {
  const encoded = Buffer.from(JSON.stringify(config)).toString("base64");
  // Pass a single, pre-quoted argument LINE — never an array. Windows PowerShell 5.1's
  // Start-Process cannot hand an argument ARRAY to ShellExecute "runas" (.NET Framework's
  // ProcessStartInfo exposes only a single `Arguments` string), so `-ArgumentList @(a, b)`
  // fails with "Cannot convert '<a> <b>' to the type 'System.String' ... Specified method is
  // not supported." A single string binds straight to `.Arguments`; the elevated node then
  // parses it into argv[1] (the helper script) and argv[2] (the base64 config). The script
  // path is always quoted (a Windows path never contains a double-quote) and the base64 blob
  // contains no spaces or shell metacharacters, so this needs no further escaping.
  const hostArgLine = `"${ELEVATED_HOST_SCRIPT}" ${encoded}`;

  const command = [
    "$ErrorActionPreference = 'Stop';",
    "$file = $env:MT_ELEVATE_FILE;",
    "$cwd = $env:MT_ELEVATE_CWD;",
    "try {",
    "  Start-Process -FilePath $file -Verb RunAs -WindowStyle Hidden -WorkingDirectory $cwd -ArgumentList $env:MT_ELEVATE_ARGS;",
    "  Write-Output 'MT_ELEVATE_OK';",
    "} catch {",
    `  Write-Output ('${ELEVATE_ERROR_PREFIX}' + $_.Exception.Message);`,
    "}"
  ].join(" ");

  try {
    const child = childProcess.spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      {
        // Never set detached:true here — DETACHED_PROCESS makes "runas" silently skip the
        // UAC prompt. windowsHide keeps the launcher console from flashing.
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: {
          ...process.env,
          MT_ELEVATE_FILE: process.execPath,
          MT_ELEVATE_CWD: config.cwd,
          MT_ELEVATE_ARGS: hostArgLine
        }
      }
    );

    let launcherOutput = "";
    const collect = (chunk) => {
      launcherOutput += chunk.toString();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => finishElevationAttempt(attempt, error.message));
    child.on("close", () => {
      // Only a launcher-reported failure (declined UAC, missing node, ...) matters here; on
      // success the helper connects asynchronously and drives the session from there.
      [elevationErrorMessage(launcherOutput)]
        .filter(Boolean)
        .forEach((message) => finishElevationAttempt(attempt, message));
    });
    child.unref();
    attempt.client.send({ type: "elevateStarted", id: attempt.id, shell: config.label });
  } catch (error) {
    finishElevationAttempt(attempt, error.message);
  }
}

// Accept the helper's loopback connection: authenticate the one-time token, then relay the
// elevated terminal as a normal session. Only ONE connection is honored per attempt.
function handleElevatedConnection(attempt, socket) {
  clearTimeout(attempt.timer);
  // One-shot: stop accepting further connections as soon as one arrives.
  closeElevationServer(attempt.server);

  socket.setEncoding("utf8");
  let buffer = "";
  let authed = false;

  const authTimer = setTimeout(() => {
    destroySocket(socket);
    finishElevationAttempt(attempt, "Administrator terminal authentication timed out.");
  }, ELEVATION_AUTH_TIMEOUT_MS);
  authTimer.unref();

  const sendFrame = (payload) => {
    try { socket.write(JSON.stringify(payload) + "\n"); } catch { /* socket gone */ }
  };

  const handleLine = (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    if (!authed) {
      clearTimeout(authTimer);
      if (msg.type === "auth" && timingSafeStringEqual(msg.token, attempt.token)) {
        authed = true;
        sendFrame({ type: "ready" });
      } else {
        destroySocket(socket);
        finishElevationAttempt(attempt, "Administrator terminal failed authentication.");
      }
    } else if (msg.type === "started") {
      attempt.settled = true;
      attempt.session = registerElevatedSession(attempt, socket, sendFrame, Number(msg.pid) || 0);
      attempt.client.send({ type: "created", ...toSessionSummary(attempt.session) });
    } else if (msg.type === "output" && attempt.session) {
      const data = decodeElevationData(msg.data);
      attempt.session.keystrokesOut += data.length;
      attempt.session.bytesOut += Buffer.byteLength(data, "utf8");
      if (attempt.session.logStream) {
        try { attempt.session.logStream.write(stripAnsiForLog(data)); } catch { /* logging must never break the session */ }
      } else {
        // No per-session log is active; the live output is still broadcast below.
      }
      queueSessionOutput(attempt.session, data);
    } else if (msg.type === "exit" && attempt.session) {
      finishElevatedSession(attempt.session, Number.isFinite(Number(msg.code)) ? Number(msg.code) : null);
    }
  };

  socket.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      // Empty/blank lines are harmless: handleLine's JSON.parse rejects them and returns.
      handleLine(line);
    }
  });

  socket.on("close", () => {
    clearTimeout(authTimer);
    if (attempt.session) {
      finishElevatedSession(attempt.session, null);
    } else {
      finishElevationAttempt(attempt, "Administrator terminal closed before it started.");
    }
  });
  // 'error' is always followed by 'close', which performs teardown.
  socket.on("error", () => {});
}

// Wrap the helper socket in a node-pty-compatible terminal shim and register it as a normal
// session, so writeSession / rememberSize / killSession / toSessionSummary / mem-stats all
// operate on it unchanged.
function registerElevatedSession(attempt, socket, sendFrame, pid) {
  const terminal = {
    pid,
    write(data) { sendFrame({ type: "input", data: encodeElevationData(data) }); },
    resize(cols, rows) { sendFrame({ type: "resize", cols, rows }); },
    kill() {
      sendFrame({ type: "kill" });
      destroySocket(socket);
    }
  };

  const session = {
    bytesIn: 0,
    bytesOut: 0,
    cols: attempt.cols,
    cwd: attempt.cwd,
    elevated: true,
    exited: false,
    id: attempt.id,
    keystrokesIn: 0,
    keystrokesOut: 0,
    killed: false,
    closing: false,
    logStream: null,
    logPath: null,
    pendingOutput: [],
    outputTimer: null,
    rows: attempt.rows,
    shell: attempt.label,
    startedAt: new Date().toISOString(),
    terminal,
    title: attempt.title
  };

  sessions.set(attempt.id, session);
  scheduleMemStats(2000);
  return session;
}

function finishElevatedSession(session, code) {
  if (session.exited) {
    return;
  } else {
    session.exited = true;
    flushSessionOutput(session);
    closeLog(session);
    sessions.delete(session.id);
    broadcast({ type: "exited", id: session.id, code, signal: null });
    scheduleMemStats(1500);
  }
}

// Tear down a failed elevation attempt exactly once and tell the client why.
function finishElevationAttempt(attempt, message) {
  if (attempt.settled) {
    return;
  } else {
    attempt.settled = true;
    clearTimeout(attempt.timer);
    closeElevationServer(attempt.server);
    attempt.client.send({ type: "elevateError", id: attempt.id, message });
  }
}

// Extract a launcher failure message from its captured stdout/stderr. Returns "" when the
// launcher reported success (no error sentinel). Kept as a ternary so both arms are
// countable by the coverage gate.
function elevationErrorMessage(output) {
  const text = String(output);
  const index = text.indexOf(ELEVATE_ERROR_PREFIX);
  return index === -1
    ? ""
    : describeElevationError(text.slice(index + ELEVATE_ERROR_PREFIX.length).trim());
}

// Turn the raw error text the elevation launcher reports into a user-facing message. The
// common case is the user declining the UAC prompt (Win32 ERROR_CANCELLED), which is an
// expected outcome rather than a failure, so it gets a friendlier phrasing.
function describeElevationError(detail) {
  const text = String(detail || "").trim();
  if (/cancell?ed by the user/i.test(text)) {
    return "Administrator terminal canceled — the UAC prompt was declined.";
  }
  return text || "Failed to launch the administrator terminal.";
}

function shutdown() {
  stopMemStats();
  closeSessions(true);
  server.close(() => {
    if (sessions.size === 0) {
      process.exit(0);
    } else {
      // The drain timer exits after staggered session teardown completes.
    }
  });

  // Sessions now close on a stagger, so poll until they have actually drained
  // instead of exiting on a fixed timer and falling through to the force-kill in
  // handleProcessExit, which is exactly the crash-prone path we are avoiding.
  const deadline = Date.now() + SHUTDOWN_MAX_WAIT_MS;
  const drain = setInterval(() => {
    if (sessions.size > 0 && Date.now() < deadline) return;
    clearInterval(drain);
    process.exit(0);
  }, SHUTDOWN_POLL_MS);
  drain.unref();
}

function computeMemStats(callback) {
  const script = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress";
  childProcess.execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 8000 },
    (error, stdout) => {
      if (error) {
        callback(null);
      } else {
        let procs;
        try {
          procs = JSON.parse(stdout);
        } catch {
          callback(null);
          return;
        }
        const list = Array.isArray(procs) ? procs : (procs ? [procs] : []);

        const wsById = new Map();
        const childrenByParent = new Map();
        for (const proc of list) {
          const pid = Number(proc.ProcessId);
          const ppid = Number(proc.ParentProcessId);
          wsById.set(pid, Number(proc.WorkingSetSize) || 0);
          if (childrenByParent.has(ppid)) {
            childrenByParent.get(ppid).push(pid);
          } else {
            childrenByParent.set(ppid, [pid]);
          }
        }

        // Sum the process tree rooted at the Electron main process (our parent),
        // which covers the Electron windows, this bridge and its pty children;
        // add each live terminal PID explicitly in case ConPTY reparents it.
        const roots = new Set();
        roots.add(process.pid);
        const candidateRoots = [process.ppid, ...[...sessions.values()].map((s) => s.terminal && s.terminal.pid)];
        for (const candidate of candidateRoots) {
          const n = Number(candidate);
          if (n) {
            roots.add(n);
          } else {
            // Skip absent/zero pids (no parent, or a session without a live terminal).
          }
        }

        const seen = new Set();
        const stack = [...roots];
        let appBytes = 0;
        while (stack.length) {
          const pid = stack.pop();
          if (seen.has(pid)) {
            continue;
          } else {
            seen.add(pid);
            if (wsById.has(pid)) {
              appBytes += wsById.get(pid);
            } else {
              // pid absent from the snapshot; it contributes nothing.
            }
            const kids = childrenByParent.get(pid) || [];
            for (const kid of kids) stack.push(kid);
          }
        }

        const systemTotal = os.totalmem();
        const systemUsed = Math.max(0, systemTotal - os.freemem());
        callback({ appBytes, systemUsed, systemTotal });
      }
    }
  );
}

// One CIM query at a time: concurrent callers attach to the in-flight run
// rather than spawning another PowerShell, so a burst of status-bar hovers
// costs no more than a single reading. Waiters receive null when it fails.
function runMemStats(callback) {
  memStatsWaiters.push(callback);
  if (memStatsInFlight) {
    return;
  } else {
    memStatsInFlight = true;
    computeMemStats((stats) => {
      memStatsInFlight = false;
      if (stats) {
        lastMemStats = stats;
      } else {
        // Failed probes are delivered to waiters but are not cached.
      }
      const waiters = memStatsWaiters;
      memStatsWaiters = [];
      for (const waiter of waiters) waiter(stats);
    });
  }
}

function memStatsFrame(stats) {
  return {
    type: "memstats",
    supported: true,
    app: stats.appBytes,
    systemUsed: stats.systemUsed,
    systemTotal: stats.systemTotal
  };
}

function broadcastMemStats(stats) {
  if (!stats) {
    return;
  } else {
    broadcast(memStatsFrame(stats));
  }
}

// The status bar asks for a reading only while its memory chip is hovered, so
// this path must work even when the periodic push is disabled — including
// browser mode, where nothing sets MEMSTATS. Unsupported platforms answer
// immediately so the UI can say so instead of spinning forever.
function requestMemStats(client) {
  noteMemStatsInterest();
  if (!memStatsSupported()) {
    client.send({ type: "memstats", supported: false });
    return;
  } else {
    runMemStats((stats) => {
      if (stats) {
        client.send(memStatsFrame(stats));
      } else {
        client.send({ type: "memstats", supported: true, error: "Could not read process memory." });
      }
    });
  }
}

// Capture a point-in-time CPU percentage and working set for every process. The
// formatted performance provider supplies a current CPU sample, while Win32_Process
// supplies parent ids so each terminal includes descendants launched by its shell.
// PercentProcessorTime is machine-wide (it can exceed 100 on multicore systems), so
// buildStatisticsFrame normalizes the tree total to the familiar 0-100% scale.
function collectProcessStatistics(callback) {
  if (process.platform !== "win32") {
    callback(null, "Process statistics are available on Windows only.");
  } else {
    const script = [
      "$parents = @{}",
      "Get-CimInstance Win32_Process | ForEach-Object { $parents[[string]$_.ProcessId] = [int]$_.ParentProcessId }",
      "$rows = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.IDProcess -gt 0 } | ForEach-Object {",
      "  [pscustomobject]@{ pid = [int]$_.IDProcess; ppid = [int]$parents[[string]$_.IDProcess]; cpu = [double]$_.PercentProcessorTime; memory = [long]$_.WorkingSet }",
      "}",
      "$rows | ConvertTo-Json -Compress"
    ].join("; ");

    childProcess.execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 8000 },
      (error, stdout) => {
        if (error) {
          callback(null, error.message || "Could not sample processes.");
        } else {
          try {
            const parsed = JSON.parse(stdout || "[]");
            callback(Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []), null);
          } catch {
            callback(null, "Could not parse process statistics.");
          }
        }
      }
    );
  }
}

function collectProcessTreeMetrics(rootPid, processRows) {
  const byPid = new Map();
  const children = new Map();
  for (const row of processRows || []) {
    const pid = Number(row.pid);
    const ppid = Number(row.ppid);
    if (!pid) {
      continue;
    } else {
      byPid.set(pid, row);
      if (!children.has(ppid)) {
        children.set(ppid, []);
      } else {
        // Reuse the existing sibling list.
      }
      children.get(ppid).push(pid);
    }
  }

  const seen = new Set();
  const stack = [Number(rootPid) || 0];
  let cpu = 0;
  let memory = 0;
  while (stack.length) {
    const pid = stack.pop();
    if (!pid || seen.has(pid)) {
      continue;
    } else {
      seen.add(pid);
      const row = byPid.get(pid);
      if (row) {
        [cpu, memory] = [
          cpu + Math.max(0, Number(row.cpu) || 0),
          memory + Math.max(0, Number(row.memory) || 0)
        ];
      } else {
        // A root can disappear between snapshots; its surviving children still count.
      }
      for (const child of children.get(pid) || []) stack.push(child);
    }
  }
  return { cpu, memory };
}

function buildStatisticsFrame(message, processRows, processError = null) {
  const requestedId = typeof message.id === "string" && message.id ? message.id : null;
  const selected = requestedId ? [sessions.get(requestedId)].filter(Boolean) : [...sessions.values()];
  const logicalProcessors = Math.max(1, os.cpus().length);
  const processSupported = processRows !== null;
  const entries = selected.map((session) => {
    const process = collectProcessTreeMetrics(session.terminal && session.terminal.pid, processRows || []);
    return {
      id: session.id,
      title: session.title,
      pid: Number(session.terminal && session.terminal.pid) || 0,
      keystrokesIn: Number(session.keystrokesIn) || 0,
      keystrokesOut: Number(session.keystrokesOut) || 0,
      bytesIn: Number(session.bytesIn) || 0,
      bytesOut: Number(session.bytesOut) || 0,
      cpuPercent: processSupported ? Math.min(100, Math.round((process.cpu / logicalProcessors) * 10) / 10) : null,
      memoryBytes: processSupported ? process.memory : null
    };
  });
  const totals = { keystrokesIn: 0, keystrokesOut: 0, bytesIn: 0, bytesOut: 0, cpuPercent: 0, memoryBytes: 0 };
  for (const entry of entries) {
    totals.keystrokesIn += entry.keystrokesIn;
    totals.keystrokesOut += entry.keystrokesOut;
    totals.bytesIn += entry.bytesIn;
    totals.bytesOut += entry.bytesOut;
    totals.cpuPercent += entry.cpuPercent || 0;
    totals.memoryBytes += entry.memoryBytes || 0;
  }
  if (processSupported) {
    totals.cpuPercent = Math.min(100, Math.round(totals.cpuPercent * 10) / 10);
  } else {
    totals.cpuPercent = null;
    totals.memoryBytes = null;
  }

  return {
    type: "statistics",
    requestId: message.requestId || "",
    scope: requestedId ? "terminal" : "all",
    requestedId,
    generatedAt: new Date().toISOString(),
    supported: processSupported,
    processError,
    sessions: entries,
    totals
  };
}

function requestStatistics(client, message) {
  collectProcessStatistics((processRows, processError) => {
    client.send(buildStatisticsFrame(message, processRows, processError));
  });
}

function pushMemStats() {
  if (!memStatsEnabled || memStatsInFlight || clients.size === 0) {
    return;
  } else {
    runMemStats(broadcastMemStats);
  }
}

// Every timer-driven refresh goes through here rather than calling pushMemStats
// directly, so an unattended bridge stops paying for readings nobody will see.
// An explicit request (the client asking, or a caller priming the cache) is
// never gated.
function pushMemStatsIfWatched() {
  if (hasRecentMemStatsInterest()) {
    pushMemStats();
  } else {
    // Nobody has opened the memory readout recently; skip the ~1.2s probe.
  }
}

// Debounced update: terminal open/close events coalesce into a single refresh
// once the new PIDs have had time to settle.
function scheduleMemStats(delay) {
  if (!memStatsEnabled) {
    return;
  } else {
    clearTimeout(memSettleTimer);
    memSettleTimer = setTimeout(pushMemStatsIfWatched, Math.max(0, Number(delay) || 0));
    memSettleTimer.unref();
  }
}

function startMemStats() {
  if (!memStatsEnabled || memStatsInterval) return;
  scheduleMemStats(1500);
  memStatsInterval = setInterval(pushMemStatsIfWatched, 10000);
  memStatsInterval.unref();
}

function stopMemStats() {
  // clearInterval/clearTimeout are safe no-ops for null handles, so the timers
  // can be cleared unconditionally (branch-free).
  clearInterval(memStatsInterval);
  memStatsInterval = null;
  clearTimeout(memSettleTimer);
  memSettleTimer = null;
}

// One JSON.stringify and one WebSocket frame for the whole fan-out. Output
// broadcasts dominate bridge traffic, so re-encoding the same bytes per client
// was pure duplicated work. The encode is lazy so a fan-out to zero eligible
// clients costs nothing.
function broadcast(message, excludedClient = null) {
  let frame;
  for (const client of clients) {
    if (client === excludedClient) {
      continue;
    } else if (canSendFrame(client)) {
      frame = frame === undefined ? encodeFrame(JSON.stringify(message)) : frame;
      client.sendFrame(frame);
    } else {
      client.send(message);
    }
  }
}

function canSendFrame(client) {
  return typeof client.sendFrame === "function";
}

function toSessionSummary(session) {
  return {
    cols: session.cols,
    cwd: session.cwd,
    id: session.id,
    pid: session.terminal.pid,
    rows: session.rows,
    shell: session.shell,
    startedAt: session.startedAt,
    title: session.title,
    tmux: session.tmux || null
  };
}

function sanitizeId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : crypto.randomUUID();
}

// Shell definitions keyed by the client-supplied identifier. A lookup keeps the
// selection branch-free (unknown/empty values fall back to the pwsh default).
const SHELL_DEFINITIONS = {
  powershell: {
    args: ["-NoLogo", "-NoExit"],
    file: "powershell.exe",
    label: "Windows PowerShell"
  },
  cmd: {
    args: [],
    file: "cmd.exe",
    label: "Command Prompt"
  },
  wsl: {
    args: [],
    file: "wsl.exe",
    label: "WSL"
  }
};

const DEFAULT_SHELL = {
  args: ["-NoLogo", "-NoExit"],
  file: "pwsh.exe",
  label: "PowerShell 7"
};

function getShell(value) {
  return SHELL_DEFINITIONS[value] || DEFAULT_SHELL;
}

function normalizeTmuxTarget(value) {
  if (!value || typeof value !== "object") return null;
  const rawDistro = typeof value.distro === "string" ? value.distro : "";
  const rawSession = typeof value.session === "string" ? value.session : "";
  if (/[\u0000-\u001f\u007f]/.test(rawDistro) || /[\u0000-\u001f\u007f]/.test(rawSession)) return null;
  const distro = rawDistro.trim();
  const session = rawSession.trim();
  if (!distro || !session || distro.length > 128 || session.length > 128) return null;
  return { distro, session };
}

function getTmuxShell(target) {
  return {
    args: ["--distribution", target.distro, "--exec", "tmux", "attach-session", "-t", target.session],
    file: "wsl.exe",
    label: `tmux: ${target.session} (${target.distro})`
  };
}

function normalizeWslOutput(value) {
  return String(value || "").replace(/\u0000/g, "").replace(/^\uFEFF/, "");
}

function parseTmuxSessions(distro, output) {
  return normalizeWslOutput(output)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const [session, windows, attached, created, panePid, command, ...titleParts] = line.split("\t");
      if (!session) {
        return null;
      } else {
        return {
          attached: Number(attached) > 0,
          command: command || "",
          created: Number(created) || 0,
          distro,
          panePid: Number(panePid) || null,
          session,
          title: titleParts.join("\t"),
          windows: Number(windows) || 0
        };
      }
    })
    .filter(Boolean);
}

function listWslTmuxSessions(client, requestId) {
  if (process.platform !== "win32") {
    client.send({ type: "tmuxSessions", requestId, sessions: [], message: "WSL tmux attachment is available only on Windows." });
    return;
  } else {
    childProcess.execFile("wsl.exe", ["--list", "--quiet"], { encoding: "utf8", timeout: 8000, windowsHide: true }, (listError, stdout) => {
      if (listError) {
        client.send({ type: "tmuxSessions", requestId, sessions: [], message: "Could not list WSL distributions. Confirm that WSL is installed." });
        return;
      } else {
        const distros = normalizeWslOutput(stdout).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
        if (distros.length === 0) {
          client.send({ type: "tmuxSessions", requestId, sessions: [], message: "No WSL distributions were found." });
          return;
        } else {
          const format = "#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_created}\t#{pane_pid}\t#{pane_current_command}\t#{pane_title}";
          let remaining = distros.length;
          const discovered = [];
          for (const distro of distros) {
            childProcess.execFile(
              "wsl.exe",
              ["--distribution", distro, "--exec", "tmux", "list-sessions", "-F", format],
              { encoding: "utf8", timeout: 8000, windowsHide: true },
              (error, sessionOutput) => {
                const found = error ? [] : parseTmuxSessions(distro, sessionOutput);
                discovered.push(...found);
                remaining -= 1;
                if (remaining !== 0) {
                  return;
                } else {
                  discovered.sort((a, b) => a.distro.localeCompare(b.distro) || a.session.localeCompare(b.session));
                  const message = discovered.length === 0
                    ? "No running tmux sessions were found. Start tmux inside WSL first."
                    : "";
                  client.send({ type: "tmuxSessions", requestId, sessions: discovered, message });
                }
              }
            );
          }
        }
      }
    });
  }
}

function getWorkingDirectory(value) {
  if (typeof value !== "string" || !value.trim()) {
    return process.cwd();
  } else {
    const resolved = path.resolve(value.trim());
    try {
      if (fs.statSync(resolved).isDirectory()) {
        return resolved;
      } else {
        return process.cwd();
      }
    } catch {
      return process.cwd();
    }
  }
}

const LOOPBACK_ADDRESSES = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

function isLocalAddress(address) {
  return LOOPBACK_ADDRESSES.includes(address);
}