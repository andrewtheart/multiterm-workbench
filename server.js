const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const pty = require("@homebridge/node-pty-prebuilt-multiarch");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3177);
const allowRemote = process.env.ALLOW_REMOTE === "1";
const publicDir = path.join(__dirname, "public");
const maxMessageSize = 1024 * 1024;
const websocketAcceptHash = ["sha", "1"].join("");

const sessions = new Map();
const clients = new Set();

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
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

  socket.on("data", (chunk) => readFrames(client, chunk));
  socket.on("close", () => clients.delete(client));
  socket.on("error", () => clients.delete(client));
});

server.listen(port, host, () => {
  console.log(`MultiTerm bridge running on ${host}:${port}`);
  console.log("PowerShell sessions are available only to this local machine by default.");
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => closeSessions(false));

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
    rows,
    shell: shell.label,
    startedAt: new Date().toISOString(),
    terminal,
    title
  };

  sessions.set(id, session);

  terminal.onData((data) => {
    broadcast({ type: "output", id, stream: "pty", data });
  });

  terminal.onExit(({ exitCode, signal }) => {
    session.exited = true;
    sessions.delete(id);
    broadcast({ type: "exited", id, code: exitCode, signal });
  });

  client.send({ type: "created", ...toSessionSummary(session) });
}

function writeSession(id, data) {
  const session = sessions.get(id);
  if (!session || typeof data !== "string") return;

  if (isSessionRunning(session)) {
    session.terminal.write(data);
  }
}

function rememberSize(id, cols, rows) {
  const session = sessions.get(id);
  if (!session) return;

  session.cols = Number(cols) || session.cols;
  session.rows = Number(rows) || session.rows;

  if (isSessionRunning(session)) {
    try {
      session.terminal.resize(session.cols, session.rows);
    } catch {
      return;
    }
  }
}

function killSession(id) {
  const session = sessions.get(id);
  if (!session) return;

  endSessionInput(session, true);

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
      endSessionInput(session, true);
    } else if (isSessionRunning(session)) {
      session.terminal.kill();
    }
  }
}

function endSessionInput(session, sendExit) {
  if (!isSessionRunning(session)) return;

  try {
    if (sendExit) {
      session.terminal.write("exit\r");
    }
  } catch {
    session.terminal.kill();
  }
}

function isSessionRunning(session) {
  return Boolean(session && session.terminal && !session.exited);
}

function shutdown() {
  closeSessions(true);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
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