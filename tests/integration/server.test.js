const app = require("../../server.js");

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
    app.server.emit("upgrade", { url: "/ws", headers: { "sec-websocket-key": "dGhlIHNhbXBsZQ==" } }, socket);

    const handshake = socket.write.mock.calls[0][0];
    expect(String(handshake)).toContain("101 Switching Protocols");
    expect(app.clients.size).toBe(1);

    // Drive the client's data handler with a real masked frame.
    socket.emit("data", maskFrame(JSON.stringify({ type: "list" })));
    expect(socket.write.mock.calls.length).toBeGreaterThan(1);

    socket.emit("close");
    expect(app.clients.size).toBe(0);
  });

  it("removes the client on socket error", () => {
    const socket = fakeSocket("127.0.0.1");
    app.server.emit("upgrade", { url: "/ws", headers: { "sec-websocket-key": "dGhlIHNhbXBsZQ==" } }, socket);
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
    app.server.emit("upgrade", { url: "/ws", headers: { "sec-websocket-key": "dGhlIHNhbXBsZQ==" } }, socket);
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
  const { EventEmitter } = require("node:events");
  let platformDescriptor;

  const makeClient = () => ({ send: vi.fn() });
  const setPlatform = (value) =>
    Object.defineProperty(process, "platform", { value, configurable: true });

  // A controllable stand-in for a spawned launcher: EventEmitter for the process plus
  // stdout/stderr streams, so tests can drive 'data'/'close'/'error' deterministically.
  const makeChild = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.unref = vi.fn();
    return child;
  };

  beforeEach(() => {
    platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    setPlatform("win32");
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", platformDescriptor);
    vi.restoreAllMocks();
  });

  it("builds pwsh args that cd into the cwd and keep the window open", () => {
    expect(app.buildElevatedShellArgs({ file: "pwsh.exe" }, "C:\\Users\\me")).toEqual([
      "-NoLogo",
      "-NoExit",
      "-Command",
      "Set-Location -LiteralPath 'C:\\Users\\me'"
    ]);
  });

  it("escapes single quotes in the cwd for powershell", () => {
    const args = app.buildElevatedShellArgs({ file: "powershell.exe" }, "C:\\O'Brien");
    expect(args[3]).toBe("Set-Location -LiteralPath 'C:\\O''Brien'");
  });

  it("builds cmd args with /k cd /d", () => {
    expect(app.buildElevatedShellArgs({ file: "cmd.exe" }, "C:\\work")).toEqual(["/k", 'cd /d "C:\\work"']);
  });

  it("builds wsl args with --cd", () => {
    expect(app.buildElevatedShellArgs({ file: "wsl.exe" }, "C:\\work")).toEqual(["--cd", "C:\\work"]);
  });

  it("spawns an ATTACHED, hidden launcher via Start-Process -Verb RunAs and confirms", () => {
    const child = makeChild();
    const spawn = vi.spyOn(childProcess, "spawn").mockReturnValue(child);
    const client = makeClient();

    app.launchElevatedTerminal(client, { type: "elevate", shell: "pwsh", cwd: "C:\\Windows" });

    expect(spawn).toHaveBeenCalledTimes(1);
    const [file, spawnArgs, opts] = spawn.mock.calls[0];
    expect(file).toBe("powershell.exe");
    const command = spawnArgs[spawnArgs.length - 1];
    expect(command).toContain("Start-Process");
    expect(command).toContain("-Verb RunAs");
    // `detached: true` suppresses the UAC prompt — the launcher must run attached.
    expect(opts.detached).toBe(false);
    expect(opts.windowsHide).toBe(true);
    expect(opts.stdio).toEqual(["ignore", "pipe", "pipe"]);
    expect(opts.env.MT_ELEVATE_FILE).toBe("pwsh.exe");
    expect(opts.env.MT_ELEVATE_CWD).toBe("C:\\Windows");
    expect(JSON.parse(opts.env.MT_ELEVATE_ARGS)).toContain("-NoExit");
    expect(child.unref).toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "elevateStarted" }));
  });

  it("reports an error and does not spawn on non-Windows platforms", () => {
    setPlatform("linux");
    const spawn = vi.spyOn(childProcess, "spawn");
    const client = makeClient();
    app.launchElevatedTerminal(client, { shell: "pwsh" });
    expect(spawn).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "elevateError" }));
  });

  it("relays a launcher spawn 'error' event back to the client", () => {
    const child = makeChild();
    vi.spyOn(childProcess, "spawn").mockReturnValue(child);
    const client = makeClient();

    app.launchElevatedTerminal(client, { shell: "pwsh", cwd: "C:\\Windows" });
    child.emit("error", new Error("launch blocked"));

    expect(client.send).toHaveBeenCalledWith({ type: "elevateError", message: "launch blocked" });
  });

  it("surfaces an in-launcher failure reported on stdout after the process closes", () => {
    const child = makeChild();
    vi.spyOn(childProcess, "spawn").mockReturnValue(child);
    const client = makeClient();

    app.launchElevatedTerminal(client, { shell: "pwsh", cwd: "C:\\Windows" });
    child.stdout.emit("data", Buffer.from("MT_ELEVATE_ERR:pwsh.exe is not recognized"));
    child.emit("close", 0);

    expect(client.send).toHaveBeenCalledWith({
      type: "elevateError",
      message: "pwsh.exe is not recognized"
    });
  });

  it("maps a declined UAC prompt (on stderr) to a friendly canceled message", () => {
    const child = makeChild();
    vi.spyOn(childProcess, "spawn").mockReturnValue(child);
    const client = makeClient();

    app.launchElevatedTerminal(client, { shell: "pwsh", cwd: "C:\\Windows" });
    child.stderr.emit("data", Buffer.from("MT_ELEVATE_ERR:The operation was canceled by the user."));
    child.emit("close", 0);

    expect(client.send).toHaveBeenCalledWith({
      type: "elevateError",
      message: "Administrator terminal canceled — the UAC prompt was declined."
    });
  });

  it("does not emit an error when the launcher reports success", () => {
    const child = makeChild();
    vi.spyOn(childProcess, "spawn").mockReturnValue(child);
    const client = makeClient();

    app.launchElevatedTerminal(client, { shell: "pwsh", cwd: "C:\\Windows" });
    child.stdout.emit("data", Buffer.from("MT_ELEVATE_OK"));
    child.emit("close", 0);

    expect(client.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: "elevateError" }));
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "elevateStarted" }));
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

  it("reports an error when spawning the launcher throws synchronously", () => {
    vi.spyOn(childProcess, "spawn").mockImplementation(() => {
      throw new Error("spawn ENOENT");
    });
    const client = makeClient();

    app.launchElevatedTerminal(client, { shell: "pwsh", cwd: "C:\\Windows" });

    expect(client.send).toHaveBeenCalledWith({ type: "elevateError", message: "spawn ENOENT" });
  });

  it("routes an 'elevate' client message to the launcher", () => {
    const child = makeChild();
    vi.spyOn(childProcess, "spawn").mockReturnValue(child);
    const client = makeClient();
    app.handleClientMessage(client, JSON.stringify({ type: "elevate", shell: "cmd" }));
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "elevateStarted" }));
  });
});
