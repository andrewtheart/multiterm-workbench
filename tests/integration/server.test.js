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

const http = require("node:http");
const app = require("../../server.js");

// `fetch` derives Host from the URL, so spoofing it (as a rebinding attack does)
// needs the lower-level client.
function requestWithHost(baseUrl, requestPath, hostHeader) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port: new URL(baseUrl).port,
      path: requestPath,
      headers: { Host: hostHeader }
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    request.on("error", reject);
    request.end();
  });
}

function fakeSocket(remoteAddress = "127.0.0.1") {
  const listeners = {};
  return {
    remoteAddress,
    destroyed: false,
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(function destroy() { this.destroyed = true; }),
    on: vi.fn((event, cb) => { listeners[event] = cb; }),
    emit(event, arg) { if (listeners[event]) listeners[event](arg); }
  };
}

function handshakeHeaders(extra = {}) {
  return { "sec-websocket-key": "dGhlIHNhbXBsZQ==", "sec-websocket-version": "13", ...extra };
}

function maskFrame(payload) {
  const data = Buffer.from(payload);
  const mask = Buffer.from([9, 8, 7, 6]);
  const header = Buffer.from([0x81, 0x80 | data.length]);
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) masked[i] = data[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

describe("start defaults", () => {
  it("binds the configured host and port and reports them", async () => {
    // Real-binding the default port (3177) is environment-dependent: it fails with
    // EACCES where the OS reserves the port, or EADDRINUSE if something already
    // holds it, and start()'s success callback would then never fire (hanging the
    // test). The intent here is only to verify that start() with no overrides
    // resolves the configured host/port and reports them, so simulate a successful
    // bind and let start()'s own reporting logic run.
    const listenSpy = vi.spyOn(app.server, "listen").mockImplementation((_port, _host, cb) => {
      if (typeof cb === "function") cb();
      return app.server;
    });
    try {
      const info = await new Promise((resolve) => app.start(resolve));
      expect(info).toEqual({ host: app.host, port: app.port });
    } finally {
      listenSpy.mockRestore();
    }
  });
});

describe("HTTP server", () => {
  let baseUrl;

  beforeAll(async () => {
    const info = await new Promise((resolve) => app.start(resolve, 0, "127.0.0.1"));
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => app.server.close(resolve));
  });

  it("serves /health as JSON", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("sessions");
  });

  it("serves the index page", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("handles HEAD requests", async () => {
    const res = await fetch(`${baseUrl}/`, { method: "HEAD" });
    expect(res.status).toBe(200);
  });

  it("returns 404 for a missing asset", async () => {
    const res = await fetch(`${baseUrl}/missing.js`);
    expect(res.status).toBe(404);
  });

  it("rejects non-GET/HEAD methods", async () => {
    const res = await fetch(`${baseUrl}/`, { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });

  // DNS rebinding turns an attacker's page into a SAME-ORIGIN client of this
  // server, so CORS and the custom-header guard stop applying. The rebound
  // request still carries the attacker's own name in Host, which is the tell.
  it("rejects requests whose Host header is not a loopback literal", async () => {
    const res = await requestWithHost(baseUrl, "/health", "multiterm.attacker.example");
    expect(res.status).toBe(403);
    expect(res.body).toBe("Forbidden");
  });

  it("allows any Host once remote access is explicitly enabled", async () => {
    app.__setAllowRemote(true);
    try {
      const res = await requestWithHost(baseUrl, "/health", "multiterm.example.net");
      expect(res.status).toBe(200);
    } finally {
      app.__setAllowRemote(false);
    }
  });

  it("accepts a real WebSocket client and answers list", async () => {
    app.__setPty({ spawn: () => ({ pid: 1, onData() {}, onExit() {}, write() {}, resize() {}, kill() {} }) });
    const ws = new WebSocket(`ws://127.0.0.1:${new URL(baseUrl).port}/ws`);
    const messages = [];
    const done = new Promise((resolve, reject) => {
      ws.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data);
        messages.push(msg);
        if (msg.type === "welcome") ws.send(JSON.stringify({ type: "list" }));
        if (msg.type === "sessions") resolve();
      });
      ws.addEventListener("error", reject);
    });
    await done;
    ws.close();
    expect(messages[0].type).toBe("welcome");
    expect(messages.some((m) => m.type === "sessions")).toBe(true);
    app.__setPty(require("@homebridge/node-pty-prebuilt-multiarch"));
  });
});

describe("WebSocket upgrade guards", () => {
  afterEach(() => {
    app.clients.clear();
  });

  it("destroys upgrades to the wrong path", () => {
    const socket = fakeSocket();
    app.server.emit("upgrade", { url: "/nope", headers: {} }, socket);
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("destroys non-local upgrades when remote access is disabled", () => {
    const socket = fakeSocket("10.1.2.3");
    app.server.emit("upgrade", { url: "/ws", headers: {} }, socket);
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("destroys upgrades missing the websocket key", () => {
    const socket = fakeSocket("127.0.0.1");
    app.server.emit("upgrade", { url: "/ws", headers: {} }, socket);
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("completes a valid handshake and wires socket events", () => {
    const socket = fakeSocket("127.0.0.1");
    app.server.emit("upgrade", { url: "/ws", headers: handshakeHeaders() }, socket);

    const handshake = socket.write.mock.calls[0][0];
    expect(String(handshake)).toContain("101 Switching Protocols");
    expect(app.clients.size).toBe(1);

    // Drive the client's data handler with a real masked frame.
    socket.emit("data", maskFrame(JSON.stringify({ type: "list" })));
    expect(socket.write.mock.calls.length).toBeGreaterThan(1);

    socket.emit("close");
    expect(app.clients.size).toBe(0);
  });

  it("destroys upgrades from a cross-site Origin", () => {
    const socket = fakeSocket("127.0.0.1");
    app.server.emit("upgrade", {
      url: "/ws",
      headers: handshakeHeaders({ origin: "https://evil.example" })
    }, socket);
    expect(socket.destroy).toHaveBeenCalled();
    expect(app.clients.size).toBe(0);
  });

  it("completes a handshake carrying a loopback Origin", () => {
    const socket = fakeSocket("127.0.0.1");
    app.server.emit("upgrade", {
      url: "/ws",
      headers: handshakeHeaders({ host: "127.0.0.1:3177", origin: "http://127.0.0.1:3177" })
    }, socket);
    expect(socket.destroy).not.toHaveBeenCalled();
    expect(String(socket.write.mock.calls[0][0])).toContain("101 Switching Protocols");
    expect(app.clients.size).toBe(1);
    socket.emit("close");
  });

  it("destroys an upgrade from a different loopback web app", () => {
    const socket = fakeSocket("127.0.0.1");
    app.server.emit("upgrade", {
      url: "/ws",
      headers: handshakeHeaders({ host: "127.0.0.1:3177", origin: "http://127.0.0.1:3000" })
    }, socket);
    expect(socket.destroy).toHaveBeenCalled();
    expect(app.clients.size).toBe(0);
  });

  it("destroys upgrades that do not speak WebSocket version 13", () => {
    const socket = fakeSocket("127.0.0.1");
    app.server.emit("upgrade", { url: "/ws", headers: handshakeHeaders({ "sec-websocket-version": "8" }) }, socket);
    expect(socket.destroy).toHaveBeenCalled();
    expect(app.clients.size).toBe(0);
  });

  it("refuses new clients once the connection ceiling is reached", () => {
    const sockets = [];
    for (let index = 0; index < app.maxClients; index += 1) {
      const socket = fakeSocket("127.0.0.1");
      app.server.emit("upgrade", { url: "/ws", headers: handshakeHeaders() }, socket);
      sockets.push(socket);
    }
    expect(app.clients.size).toBe(app.maxClients);

    const refused = fakeSocket("127.0.0.1");
    app.server.emit("upgrade", { url: "/ws", headers: handshakeHeaders() }, refused);
    expect(refused.destroy).toHaveBeenCalled();
    expect(refused.write).not.toHaveBeenCalled();
    expect(app.clients.size).toBe(app.maxClients);

    sockets.forEach((socket) => socket.emit("close"));
  });

  it("removes the client on socket error", () => {
    const socket = fakeSocket("127.0.0.1");
    app.server.emit("upgrade", { url: "/ws", headers: handshakeHeaders() }, socket);
    expect(app.clients.size).toBe(1);
    socket.emit("error", new Error("reset"));
    expect(app.clients.size).toBe(0);
  });
});

describe("shutdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("closes the server and exits the process", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {});
    vi.spyOn(app.server, "close").mockImplementation((cb) => { if (cb) cb(); return app.server; });
    app.shutdown();
    expect(app.server.close).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
    vi.advanceTimersByTime(1500);
    expect(exit).toHaveBeenCalledTimes(2);
  });

  // Sessions close on a stagger, so quitting must wait for them to drain rather
  // than exiting on a fixed timer and force-killing the stragglers.
  it("waits for sessions to drain before exiting", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {});
    vi.spyOn(app.server, "close").mockImplementation((cb) => { if (cb) cb(); return app.server; });
    const terminal = { pid: 1, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    app.sessions.set("s", { id: "s", terminal, exited: false, killed: false, closing: false });

    app.shutdown();
    expect(exit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(exit).not.toHaveBeenCalled();

    app.sessions.delete("s");
    vi.advanceTimersByTime(100);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("gives up waiting if a session never exits", () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {});
    vi.spyOn(app.server, "close").mockImplementation((cb) => { if (cb) cb(); return app.server; });
    const terminal = { pid: 1, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    app.sessions.set("stuck", { id: "stuck", terminal, exited: false, killed: false, closing: false });

    app.shutdown();
    vi.advanceTimersByTime(9000);
    expect(exit).toHaveBeenCalledWith(0);

    app.sessions.clear();
  });
});

describe("connection: memory stats welcome + client data isolation", () => {
  const childProcess = require("node:child_process");

  afterEach(() => {
    app.__setMemStatsEnabled(false);
    app.stopMemStats();
    app.clients.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function connect(socket) {
    app.server.emit("upgrade", { url: "/ws", headers: handshakeHeaders() }, socket);
  }

  function writesText(socket) {
    return socket.write.mock.calls
      .map(([buf]) => (Buffer.isBuffer(buf) ? buf.toString("latin1") : String(buf)))
      .join("");
  }

  it("arms a refresh but sends no snapshot when none is cached yet", () => {
    vi.useFakeTimers();
    app.__setMemStatsEnabled(true);
    const socket = fakeSocket("127.0.0.1");
    connect(socket);
    const text = writesText(socket);
    expect(text).toContain("welcome");
    expect(text).not.toContain("memstats");
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    app.stopMemStats();
  });

  it("pushes the cached snapshot to a newly connected client", () => {
    vi.useFakeTimers();
    app.__setMemStatsEnabled(true);
    const primer = { send: vi.fn() };
    app.clients.add(primer);
    vi.spyOn(childProcess, "execFile").mockImplementation((_f, _a, _o, cb) =>
      cb(null, JSON.stringify([{ ProcessId: process.pid, ParentProcessId: 0, WorkingSetSize: 4096 }])));
    app.pushMemStats();
    app.clients.delete(primer);

    const socket = fakeSocket("127.0.0.1");
    connect(socket);
    expect(writesText(socket)).toContain("memstats");
    app.stopMemStats();
  });

  it("isolates a client whose data throws while parsing and keeps the bridge alive", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const socket = fakeSocket("127.0.0.1");
    connect(socket);
    socket.write.mockClear();
    // A non-Buffer chunk makes Buffer.concat throw inside readFrames.
    socket.emit("data", "not-a-buffer");
    expect(errorSpy).toHaveBeenCalled();
    expect(writesText(socket)).toContain("Internal bridge error");
  });
});

describe("elevated (administrator) terminal", () => {
  const childProcess = require("node:child_process");
  const net = require("node:net");
  const { EventEmitter } = require("node:events");
  let platformDescriptor;
  let currentServer;

  const makeClient = () => ({ send: vi.fn() });
  const setPlatform = (value) =>
    Object.defineProperty(process, "platform", { value, configurable: true });

  // A controllable stand-in for the spawned UAC launcher.
  const makeChild = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.unref = vi.fn();
    return child;
  };

  // Fake one-shot elevation listener. listen() fires its callback synchronously so the
  // launcher spawn happens inline; the captured onConnection lets tests drive a helper.
  const makeElevationServer = (onConnection) => {
    const handlers = {};
    const server = {
      onConnection,
      on: vi.fn((event, cb) => { handlers[event] = cb; return server; }),
      listen: vi.fn((_port, _host, cb) => { cb(); return server; }),
      address: vi.fn(() => ({ port: 55501 })),
      close: vi.fn(),
      emitServer(event, arg) { if (handlers[event]) handlers[event](arg); }
    };
    return server;
  };

  // Fake helper socket for the bridge side of the channel.
  const makeConnSocket = () => {
    const handlers = {};
    const socket = {
      writes: [],
      destroyed: false,
      setEncoding: vi.fn(),
      write: vi.fn((chunk) => { socket.writes.push(chunk); return true; }),
      end: vi.fn(),
      destroy: vi.fn(() => { socket.destroyed = true; }),
      on: vi.fn((event, cb) => { handlers[event] = cb; return socket; }),
      emit(event, arg) { if (handlers[event]) handlers[event](arg); },
      feed(obj) { socket.emit("data", JSON.stringify(obj) + "\n"); },
      feedRaw(str) { socket.emit("data", str); },
      frames() { return socket.writes.join("").split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
    };
    return socket;
  };

  const launch = (client, overrides = {}) => {
    const spawn = vi.spyOn(childProcess, "spawn").mockReturnValue(makeChild());
    app.launchElevatedTerminal(client, {
      type: "elevate",
      id: "admin-term-1",
      shell: "pwsh",
      cwd: process.cwd(),
      cols: 100,
      rows: 40,
      title: "Admin",
      ...overrides
    });
    return spawn;
  };

  const configFromSpawn = (spawn) => {
    const env = spawn.mock.calls[spawn.mock.calls.length - 1][2].env;
    // MT_ELEVATE_ARGS is now a single, pre-quoted argument line: "<script>" <base64>
    const match = env.MT_ELEVATE_ARGS.match(/^"([^"]+)"\s+(\S+)$/);
    const hostArgs = [match[1], match[2]];
    return { hostArgs, env, config: JSON.parse(Buffer.from(hostArgs[1], "base64").toString("utf8")) };
  };

  beforeEach(() => {
    platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    setPlatform("win32");
    app.__setElevationServerFactory((onConnection) => {
      currentServer = makeElevationServer(onConnection);
      return currentServer;
    });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", platformDescriptor);
    vi.restoreAllMocks();
    vi.useRealTimers();
    app.__setElevationServerFactory((onConnection) => net.createServer(onConnection));
    for (const id of [...app.sessions.keys()]) app.sessions.delete(id);
    app.clients.clear();
  });

  // --- pure helpers -------------------------------------------------------

  it("timingSafeStringEqual is true only for identical strings", () => {
    expect(app.timingSafeStringEqual("abc123", "abc123")).toBe(true);
    expect(app.timingSafeStringEqual("abc123", "abc124")).toBe(false);
    expect(app.timingSafeStringEqual("abc", "abcd")).toBe(false);
  });

  it("encode/decode elevation data round-trips through base64", () => {
    const encoded = app.encodeElevationData("héllo \x1b[0m");
    expect(encoded).not.toContain("héllo");
    expect(app.decodeElevationData(encoded)).toBe("héllo \x1b[0m");
  });

  it("describeElevationError phrases known and unknown failures", () => {
    expect(app.describeElevationError("The operation was cancelled by the user")).toBe(
      "Administrator terminal canceled — the UAC prompt was declined."
    );
    expect(app.describeElevationError("Some other failure")).toBe("Some other failure");
    expect(app.describeElevationError("")).toBe("Failed to launch the administrator terminal.");
    expect(app.describeElevationError(undefined)).toBe("Failed to launch the administrator terminal.");
  });

  it("elevationErrorMessage returns '' for success output and a message for a failure", () => {
    expect(app.elevationErrorMessage("MT_ELEVATE_OK")).toBe("");
    expect(app.elevationErrorMessage("noise MT_ELEVATE_ERR:boom")).toBe("boom");
  });

  it("defaultElevationServerFactory builds a real net.Server bound to the connection handler", () => {
    const onConnection = vi.fn();
    const server = app.defaultElevationServerFactory(onConnection);
    try {
      expect(typeof server.listen).toBe("function");
      expect(typeof server.close).toBe("function");
      // net.createServer wires the connection listener it is given.
      expect(server.listeners("connection")).toContain(onConnection);
    } finally {
      server.close();
    }
  });

  // --- launch guards ------------------------------------------------------

  it("reports an error and does not spawn on non-Windows platforms", () => {
    setPlatform("linux");
    const spawn = vi.spyOn(childProcess, "spawn");
    const client = makeClient();
    app.launchElevatedTerminal(client, { id: "admin-term-1", shell: "pwsh" });
    expect(spawn).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "elevateError" }));
  });

  it("rejects an id that already has a live session", () => {
    app.sessions.set("admin-term-1", { id: "admin-term-1" });
    const spawn = vi.spyOn(childProcess, "spawn");
    const client = makeClient();
    app.launchElevatedTerminal(client, { id: "admin-term-1", shell: "pwsh", cwd: process.cwd() });
    expect(spawn).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", id: "admin-term-1" })
    );
  });

  it("refuses to launch past the session ceiling", () => {
    const fillers = Array.from({ length: app.maxSessions }, (_unused, index) => `filler${index}`);
    fillers.forEach((id) => app.sessions.set(id, { id }));
    const spawn = vi.spyOn(childProcess, "spawn");
    const client = makeClient();
    try {
      app.launchElevatedTerminal(client, { id: "admin-term-1", shell: "pwsh", cwd: process.cwd() });
      expect(spawn).not.toHaveBeenCalled();
      expect(client.send).toHaveBeenCalledWith({
        type: "elevateError",
        id: "admin-term-1",
        message: `The bridge is limited to ${app.maxSessions} terminals.`
      });
    } finally {
      // This describe has no session reset, and leaving the fillers behind would
      // make every later create hit the ceiling.
      fillers.forEach((id) => app.sessions.delete(id));
    }
  });

  // --- launcher spawn -----------------------------------------------------

  it("elevates the bridge's own node runtime via an attached, hidden runas launcher", () => {
    const client = makeClient();
    const spawn = launch(client);

    expect(spawn).toHaveBeenCalledTimes(1);
    const [file, spawnArgs, opts] = spawn.mock.calls[0];
    expect(file).toBe("powershell.exe");
    const command = spawnArgs[spawnArgs.length - 1];
    expect(command).toContain("Start-Process");
    expect(command).toContain("-Verb RunAs");
    // Regression guard: the ELEVATED helper is node.exe, a console-subsystem binary, so
    // without -WindowStyle Hidden it gets a visible console window. spawn's windowsHide
    // below only hides the launcher — it cannot reach a process created by the UAC broker.
    expect(command).toContain("-WindowStyle Hidden");
    // Regression guard: the launcher MUST pass a single argument-line string straight to
    // -ArgumentList. The old array form ($list = ... ConvertFrom-Json; -ArgumentList $list)
    // throws "Specified method is not supported" under Windows PowerShell 5.1's ShellExecute.
    expect(command).toContain("-ArgumentList $env:MT_ELEVATE_ARGS");
    expect(command).not.toContain("ConvertFrom-Json");
    expect(opts.detached).toBe(false);
    expect(opts.windowsHide).toBe(true);
    expect(opts.stdio).toEqual(["ignore", "pipe", "pipe"]);
    expect(opts.env.MT_ELEVATE_FILE).toBe(process.execPath);
    expect(opts.env.MT_ELEVATE_CWD).toBe(process.cwd());
    // A single quoted script path followed by exactly one whitespace-free base64 arg.
    expect(opts.env.MT_ELEVATE_ARGS).toMatch(/^"[^"]+elevated-pty-host\.js"\s+\S+$/);

    const { hostArgs, config } = configFromSpawn(spawn);
    expect(hostArgs[0].endsWith("elevated-pty-host.js")).toBe(true);
    expect(config.port).toBe(55501);
    expect(config.bridgePid).toBe(process.pid);
    expect(config.shellFile).toBe("pwsh.exe");
    expect(config.shellArgs).toEqual(["-NoLogo", "-NoExit"]);
    expect(config.cols).toBe(100);
    expect(config.rows).toBe(40);
    expect(config.label).toBe("PowerShell 7");
    expect(config.token).toMatch(/^[0-9a-f]{64}$/);
    expect(client.send).toHaveBeenCalledWith({ type: "elevateStarted", id: "admin-term-1", shell: "PowerShell 7" });
  });

  it("relays a launcher spawn 'error' event as a failed attempt", () => {
    const child = makeChild();
    vi.spyOn(childProcess, "spawn").mockReturnValue(child);
    const client = makeClient();
    app.launchElevatedTerminal(client, { id: "admin-term-1", shell: "pwsh", cwd: process.cwd() });
    child.emit("error", new Error("launch blocked"));
    expect(client.send).toHaveBeenCalledWith({ type: "elevateError", id: "admin-term-1", message: "launch blocked" });
  });

  it("surfaces an in-launcher failure reported on stdout after the process closes", () => {
    const child = makeChild();
    vi.spyOn(childProcess, "spawn").mockReturnValue(child);
    const client = makeClient();
    app.launchElevatedTerminal(client, { id: "admin-term-1", shell: "pwsh", cwd: process.cwd() });
    child.stdout.emit("data", Buffer.from("MT_ELEVATE_ERR:The operation was canceled by the user."));
    child.emit("close", 0);
    expect(client.send).toHaveBeenCalledWith({
      type: "elevateError",
      id: "admin-term-1",
      message: "Administrator terminal canceled — the UAC prompt was declined."
    });
  });

  it("does not fail the attempt when the launcher reports success", () => {
    const child = makeChild();
    vi.spyOn(childProcess, "spawn").mockReturnValue(child);
    const client = makeClient();
    app.launchElevatedTerminal(client, { id: "admin-term-1", shell: "pwsh", cwd: process.cwd() });
    child.stdout.emit("data", Buffer.from("MT_ELEVATE_OK"));
    child.emit("close", 0);
    expect(client.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "elevateError" }));
    expect(child.unref).toHaveBeenCalled();
  });

  it("reports an error when spawning the launcher throws synchronously", () => {
    vi.spyOn(childProcess, "spawn").mockImplementation(() => { throw new Error("spawn ENOENT"); });
    const client = makeClient();
    app.launchElevatedTerminal(client, { id: "admin-term-1", shell: "pwsh", cwd: process.cwd() });
    expect(client.send).toHaveBeenCalledWith({ type: "elevateError", id: "admin-term-1", message: "spawn ENOENT" });
  });

  it("fails the attempt when the loopback listener errors", () => {
    const client = makeClient();
    launch(client);
    currentServer.emitServer("error", new Error("EADDRINUSE"));
    expect(client.send).toHaveBeenCalledWith({ type: "elevateError", id: "admin-term-1", message: "EADDRINUSE" });
  });

  it("tears down the attempt if the helper never connects in time", () => {
    vi.useFakeTimers();
    const client = makeClient();
    launch(client);
    vi.advanceTimersByTime(120000);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "elevateError", id: "admin-term-1" })
    );
  });

  it("routes an 'elevate' client message to the launcher", () => {
    const spawn = vi.spyOn(childProcess, "spawn").mockReturnValue(makeChild());
    const client = makeClient();
    app.handleClientMessage(client, JSON.stringify({ type: "elevate", id: "admin-term-1", shell: "cmd", cwd: process.cwd() }));
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "elevateStarted", id: "admin-term-1" }));
  });

  // --- authenticated channel + session relay ------------------------------

  it("authenticates, registers an in-app session, and relays the full lifecycle", () => {
    const client = makeClient();
    const observer = { send: vi.fn() };
    app.clients.add(observer);
    const spawn = launch(client);
    const { config } = configFromSpawn(spawn);

    const socket = makeConnSocket();
    currentServer.onConnection(socket);
    expect(socket.setEncoding).toHaveBeenCalledWith("utf8");

    // Ignored noise before auth: a blank line and an unparseable line.
    socket.feedRaw("\n");
    socket.feedRaw("not-json\n");

    // Authenticate -> the bridge replies "ready".
    socket.feed({ type: "auth", token: config.token });
    expect(socket.frames()).toContainEqual({ type: "ready" });

    // Output/exit before "started" are ignored (no session yet).
    socket.feed({ type: "output", data: app.encodeElevationData("early") });
    socket.feed({ type: "exit", code: 0 });
    expect(client.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "created" }));

    // Helper reports the elevated shell is live.
    socket.feed({ type: "started", pid: 999 });
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "created", id: "admin-term-1", pid: 999 }));
    expect(app.sessions.has("admin-term-1")).toBe(true);

    // Output is decoded and broadcast to connected clients.
    socket.feed({ type: "output", data: app.encodeElevationData("hello world") });
    expect(observer.send).toHaveBeenCalledWith({ type: "output", id: "admin-term-1", stream: "pty", data: "hello world" });

    // Output while logging is enabled also writes to the log stream.
    const logStream = { write: vi.fn() };
    app.sessions.get("admin-term-1").logStream = logStream;
    socket.feed({ type: "output", data: app.encodeElevationData("logged line") });
    expect(logStream.write).toHaveBeenCalled();

    // The session shim forwards input and resize as frames.
    app.writeSession("admin-term-1", "whoami\r");
    app.rememberSize("admin-term-1", 80, 24);
    const inputFrame = socket.frames().find((frame) => frame.type === "input");
    expect(app.decodeElevationData(inputFrame.data)).toBe("whoami\r");
    expect(socket.frames()).toContainEqual({ type: "resize", cols: 80, rows: 24 });

    // Killing the session sends a kill frame and destroys the socket.
    app.closeSessions(false);
    expect(socket.frames()).toContainEqual({ type: "kill" });
    expect(socket.destroyed).toBe(true);

    // The helper reports the shell exited -> the session is removed and broadcast.
    socket.feed({ type: "exit", code: 0 });
    expect(observer.send).toHaveBeenCalledWith({ type: "exited", id: "admin-term-1", code: 0, signal: null });
    expect(app.sessions.has("admin-term-1")).toBe(false);

    // A late socket 'error' + 'close' after exit is harmless (idempotent teardown).
    expect(() => { socket.emit("error", new Error("reset")); socket.emit("close"); }).not.toThrow();
  });

  it("defaults a missing pid to 0 and a non-numeric exit code to null", () => {
    const client = makeClient();
    const observer = { send: vi.fn() };
    app.clients.add(observer);
    const spawn = launch(client);
    const { config } = configFromSpawn(spawn);

    const socket = makeConnSocket();
    currentServer.onConnection(socket);
    socket.feed({ type: "auth", token: config.token });
    socket.feed({ type: "started" });
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "created", pid: 0 }));

    socket.feed({ type: "exit", code: "not-a-number" });
    expect(observer.send).toHaveBeenCalledWith({ type: "exited", id: "admin-term-1", code: null, signal: null });
  });

  it("rejects a bad token, destroys the socket, and fails the attempt once", () => {
    const client = makeClient();
    launch(client);
    const socket = makeConnSocket();
    currentServer.onConnection(socket);

    socket.feed({ type: "auth", token: "deadbeef" });
    expect(socket.destroyed).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "elevateError", id: "admin-term-1", message: "Administrator terminal failed authentication." })
    );

    // A follow-up close must not emit a second elevateError (attempt already settled).
    client.send.mockClear();
    socket.emit("close");
    expect(client.send).not.toHaveBeenCalled();
  });

  it("fails the attempt if the connection closes before the shell starts", () => {
    const client = makeClient();
    launch(client);
    const socket = makeConnSocket();
    currentServer.onConnection(socket);
    socket.emit("close");
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "elevateError", id: "admin-term-1", message: "Administrator terminal closed before it started." })
    );
  });

  it("times out a connection that never authenticates", () => {
    vi.useFakeTimers();
    const client = makeClient();
    launch(client);
    const socket = makeConnSocket();
    currentServer.onConnection(socket);
    vi.advanceTimersByTime(15000);
    expect(socket.destroyed).toBe(true);
    expect(client.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "elevateError", id: "admin-term-1", message: "Administrator terminal authentication timed out." })
    );
  });

  it("cleans up the elevated session when the helper socket closes unexpectedly", () => {
    const client = makeClient();
    const observer = { send: vi.fn() };
    app.clients.add(observer);
    const spawn = launch(client);
    const { config } = configFromSpawn(spawn);

    const socket = makeConnSocket();
    currentServer.onConnection(socket);
    socket.feed({ type: "auth", token: config.token });
    socket.feed({ type: "started", pid: 42 });
    expect(app.sessions.has("admin-term-1")).toBe(true);

    socket.emit("close");
    expect(observer.send).toHaveBeenCalledWith({ type: "exited", id: "admin-term-1", code: null, signal: null });
    expect(app.sessions.has("admin-term-1")).toBe(false);
  });
});
