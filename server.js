const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
// `pty` is a mutable binding so tests can inject a fake terminal factory
// via `__setPty` without spawning real shells.
let pty = require("@homebridge/node-pty-prebuilt-multiarch");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3177);
let allowRemote = process.env.ALLOW_REMOTE === "1";
const publicDir = path.join(__dirname, "public");
const maxMessageSize = 1024 * 1024;
const websocketAcceptHash = ["sha", "1"].join("");

const sessions = new Map();
const clients = new Set();

// Memory stats are computed entirely in this bridge process (never the
// renderer) so the UI thread is never blocked. Gated behind an env flag set by
// the Electron main process and Windows-only, so tests and other platforms are
// completely inert.
const memStatsEnabled = process.env.MEMSTATS === "1" && process.platform === "win32";
let memStatsInterval = null;
let memSettleTimer = null;
let memStatsInFlight = false;
let lastMemStats = null;

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

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const pathname = getPathname(request.url);

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

  const key = request.headers["sec-websocket-key"];
  if (!key) {
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
      if (!socket.destroyed) {
        socket.write(encodeFrame(JSON.stringify(message)));
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
      client.send({ type: "memstats", app: lastMemStats.appBytes, systemUsed: lastMemStats.systemUsed, systemTotal: lastMemStats.systemTotal });
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
process.on("uncaughtException", (error) => {
  console.error("[bridge] Uncaught exception (continuing):", error && error.stack ? error.stack : error);
});
process.on("unhandledRejection", (reason) => {
  console.error("[bridge] Unhandled rejection (continuing):", reason && reason.stack ? reason.stack : reason);
});

function handleProcessExit() {
  closeSessions(false);
}

/* v8 ignore next 3 -- only executes when server.js is the process entry point */
if (require.main === module) {
  start();
}

function __setPty(mock) {
  pty = mock;
}

function __setAllowRemote(value) {
  allowRemote = value;
}

module.exports = {
  server,
  start,
  host,
  port,
  sessions,
  clients,
  mimeTypes,
  maxMessageSize,
  __setPty,
  __setAllowRemote,
  getPathname,
  serveStaticFile,
  sendJsonResponse,
  readFrames,
  encodeFrame,
  handleClientMessage,
  createSession,
  writeSession,
  rememberSize,
  killSession,
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
  getWorkingDirectory,
  isLocalAddress,
  startLog,
  stopLog,
  closeLog,
  sanitizeLogName,
  stripAnsiForLog,
  revealPath,
  computeMemStats,
  pushMemStats,
  scheduleMemStats,
  startMemStats,
  stopMemStats
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
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
      "Cache-Control": "no-store"
    });

    if (headOnly) {
      response.end();
    } else {
      response.end(content);
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

function readFrames(client, chunk) {
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
      handleClientMessage(client, payload.toString("utf8"));
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

function handleClientMessage(client, rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    client.send({ type: "error", message: "Invalid bridge message." });
    return;
  }

  switch (message.type) {
    case "create":
      createSession(client, message);
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
    case "list":
      client.send({ type: "sessions", sessions: [...sessions.values()].map(toSessionSummary) });
      break;
    default:
      client.send({ type: "error", message: `Unsupported message type: ${message.type}` });
      break;
  }
}

function createSession(client, options) {
  const id = sanitizeId(options.id);
  if (sessions.has(id)) {
    client.send({ type: "error", id, message: "A session with this id already exists." });
    return;
  }

  const shell = getShell(options.shell);
  const cwd = getWorkingDirectory(options.cwd);
  const cols = Number(options.cols) || 120;
  const rows = Number(options.rows) || 30;
  let terminal;

  try {
    terminal = pty.spawn(shell.file, shell.args, {
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
    cols,
    cwd,
    exited: false,
    id,
    logStream: null,
    logPath: null,
    rows,
    shell: shell.label,
    startedAt: new Date().toISOString(),
    terminal,
    title
  };

  sessions.set(id, session);

  terminal.onData((data) => {
    if (session.logStream) {
      try {
        session.logStream.write(stripAnsiForLog(data));
      } catch {
        // A failed log write should never break the live session.
      }
    }
    broadcast({ type: "output", id, stream: "pty", data });
  });

  terminal.onExit(({ exitCode, signal }) => {
    session.exited = true;
    closeLog(session);
    sessions.delete(id);
    broadcast({ type: "exited", id, code: exitCode, signal });
    scheduleMemStats(1500);
  });

  client.send({ type: "created", ...toSessionSummary(session) });
  scheduleMemStats(2000);
}

function writeSession(id, data) {
  const session = sessions.get(id);
  if (!session || typeof data !== "string") return;

  if (isSessionRunning(session)) {
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

function killSession(id) {
  const session = sessions.get(id);
  if (!isSessionRunning(session)) return;

  endSessionInput(session);

  setTimeout(() => {
    if (isSessionRunning(session)) {
      session.terminal.kill();
    }
  }, 1500).unref();
}

function killAllSessions() {
  for (const session of [...sessions.values()]) {
    killSession(session.id);
  }
}

function closeSessions(graceful) {
  for (const session of sessions.values()) {
    if (graceful) {
      endSessionInput(session);
    } else if (isSessionRunning(session)) {
      session.terminal.kill();
    }
  }
}

function endSessionInput(session) {
  if (!isSessionRunning(session)) return;

  try {
    session.terminal.write("exit\r");
  } catch {
    session.terminal.kill();
  }
}

function isSessionRunning(session) {
  return Boolean(session && session.terminal && !session.exited);
}

function startLog(client, id) {
  const session = sessions.get(id);
  if (!session) return;

  if (session.logStream) {
    client.send({ type: "logStarted", id, path: session.logPath, already: true });
    return;
  }

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
  if (!target) return;

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

function shutdown() {
  stopMemStats();
  closeSessions(true);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

function computeMemStats(callback) {
  const script = "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress";
  childProcess.execFile(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, maxBuffer: 32 * 1024 * 1024, timeout: 8000 },
    (error, stdout) => {
      if (error) { callback(null); return; }
      let procs;
      try { procs = JSON.parse(stdout); } catch { callback(null); return; }
      if (!Array.isArray(procs)) procs = procs ? [procs] : [];

      const wsById = new Map();
      const childrenByParent = new Map();
      for (const proc of procs) {
        const pid = Number(proc.ProcessId);
        const ppid = Number(proc.ParentProcessId);
        wsById.set(pid, Number(proc.WorkingSetSize) || 0);
        if (!childrenByParent.has(ppid)) childrenByParent.set(ppid, []);
        childrenByParent.get(ppid).push(pid);
      }

      // Sum the process tree rooted at the Electron main process (our parent),
      // which covers the Electron windows, this bridge and its pty children;
      // add each live terminal PID explicitly in case ConPTY reparents it.
      const roots = new Set();
      if (process.ppid) roots.add(process.ppid);
      roots.add(process.pid);
      for (const session of sessions.values()) {
        const pid = session.terminal && session.terminal.pid;
        if (pid) roots.add(Number(pid));
      }

      const seen = new Set();
      const stack = [...roots];
      let appBytes = 0;
      while (stack.length) {
        const pid = stack.pop();
        if (seen.has(pid)) continue;
        seen.add(pid);
        if (wsById.has(pid)) appBytes += wsById.get(pid);
        const kids = childrenByParent.get(pid);
        if (kids) {
          for (const kid of kids) if (!seen.has(kid)) stack.push(kid);
        }
      }

      const systemTotal = os.totalmem();
      const systemUsed = Math.max(0, systemTotal - os.freemem());
      callback({ appBytes, systemUsed, systemTotal });
    }
  );
}

function pushMemStats() {
  if (!memStatsEnabled || memStatsInFlight || clients.size === 0) return;
  memStatsInFlight = true;
  computeMemStats((stats) => {
    memStatsInFlight = false;
    if (!stats) return;
    lastMemStats = stats;
    broadcast({ type: "memstats", app: stats.appBytes, systemUsed: stats.systemUsed, systemTotal: stats.systemTotal });
  });
}

// Debounced update: terminal open/close events coalesce into a single refresh
// once the new PIDs have had time to settle.
function scheduleMemStats(delay) {
  if (!memStatsEnabled) return;
  clearTimeout(memSettleTimer);
  memSettleTimer = setTimeout(pushMemStats, Math.max(0, Number(delay) || 0));
  if (memSettleTimer.unref) memSettleTimer.unref();
}

function startMemStats() {
  if (!memStatsEnabled || memStatsInterval) return;
  scheduleMemStats(1500);
  memStatsInterval = setInterval(pushMemStats, 10000);
  if (memStatsInterval.unref) memStatsInterval.unref();
}

function stopMemStats() {
  if (memStatsInterval) { clearInterval(memStatsInterval); memStatsInterval = null; }
  if (memSettleTimer) { clearTimeout(memSettleTimer); memSettleTimer = null; }
}

function broadcast(message) {
  for (const client of clients) {
    client.send(message);
  }
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
    title: session.title
  };
}

function sanitizeId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : crypto.randomUUID();
}

function getShell(value) {
  if (value === "powershell") {
    return {
      args: ["-NoLogo", "-NoExit"],
      file: "powershell.exe",
      label: "Windows PowerShell"
    };
  }

  if (value === "cmd") {
    return {
      args: [],
      file: "cmd.exe",
      label: "Command Prompt"
    };
  }

  if (value === "wsl") {
    return {
      args: [],
      file: "wsl.exe",
      label: "WSL"
    };
  }

  return {
    args: ["-NoLogo", "-NoExit"],
    file: "pwsh.exe",
    label: "PowerShell 7"
  };
}

function getWorkingDirectory(value) {
  if (typeof value !== "string" || !value.trim()) {
    return process.cwd();
  }

  const resolved = path.resolve(value.trim());

  try {
    if (fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch {
    return process.cwd();
  }

  return process.cwd();
}

function isLocalAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}