const host = require("../../elevated-pty-host.js");

function makeHostSocket() {
  const handlers = {};
  const socket = {
    writes: [],
    ended: false,
    on: vi.fn((event, cb) => { handlers[event] = cb; return socket; }),
    write: vi.fn((chunk) => { socket.writes.push(chunk); return true; }),
    end: vi.fn(() => { socket.ended = true; }),
    destroy: vi.fn(),
    emit(event, arg) { if (handlers[event]) handlers[event](arg); },
    feed(obj) { socket.emit("data", Buffer.from(JSON.stringify(obj) + "\n")); },
    feedRaw(str) { socket.emit("data", Buffer.from(str)); },
    frames() { return socket.writes.join("").split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
  };
  return socket;
}

function makeTerminal(overrides = {}) {
  const term = {
    pid: 4321,
    _data: null,
    _exit: null,
    onData: vi.fn((cb) => { term._data = cb; }),
    onExit: vi.fn((cb) => { term._exit = cb; }),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    ...overrides
  };
  return term;
}

const okVerify = () => JSON.stringify({ Pid: 100, Cmd: "node D:/app/server.js" });

function makeDeps(socket, terminal, overrides = {}) {
  return {
    execFileSync: vi.fn(okVerify),
    net: { connect: vi.fn(() => socket) },
    spawnPty: vi.fn(() => terminal),
    log: vi.fn(),
    exit: vi.fn(),
    ...overrides
  };
}

const liveConfig = () => ({
  port: 55501,
  bridgePid: 100,
  token: "sekret-token",
  shellFile: "pwsh.exe",
  shellArgs: [],
  cwd: "C:/",
  cols: 100,
  rows: 40
});

// Bring a run() up through connect + auth-ready so the pty is live.
function startedRun(terminalOverrides = {}) {
  const socket = makeHostSocket();
  const terminal = makeTerminal(terminalOverrides);
  const deps = makeDeps(socket, terminal);
  host.run(liveConfig(), deps);
  socket.emit("connect");
  socket.feed({ type: "ready" });
  return { socket, terminal, deps };
}

describe("elevated-pty-host encode/decode", () => {
  it("decodeConfig parses base64-encoded JSON", () => {
    const config = { port: 7, token: "t", shellFile: "pwsh.exe" };
    const encoded = Buffer.from(JSON.stringify(config)).toString("base64");
    expect(host.decodeConfig(encoded)).toEqual(config);
  });

  it("encodeData/decodeData round-trip arbitrary text", () => {
    const encoded = host.encodeData("héllo \x1b[31mred\x1b[0m");
    expect(encoded).not.toContain("héllo");
    expect(host.decodeData(encoded)).toBe("héllo \x1b[31mred\x1b[0m");
  });
});

describe("elevated-pty-host verifyBridge", () => {
  it("returns true when the listener owner pid and cmdline match", () => {
    const execFileSync = vi.fn(okVerify);
    expect(host.verifyBridge({ port: 5, bridgePid: 100 }, execFileSync)).toBe(true);
    expect(execFileSync).toHaveBeenCalledWith(
      "powershell.exe",
      expect.arrayContaining(["-NoProfile"]),
      expect.objectContaining({ windowsHide: true })
    );
  });

  it("returns false when the owning pid differs", () => {
    const execFileSync = vi.fn(() => JSON.stringify({ Pid: 999, Cmd: "node server.js" }));
    expect(host.verifyBridge({ port: 5, bridgePid: 100 }, execFileSync)).toBe(false);
  });

  it("returns false when the owner is not the bridge (no server.js)", () => {
    const execFileSync = vi.fn(() => JSON.stringify({ Pid: 100, Cmd: "node evil.js" }));
    expect(host.verifyBridge({ port: 5, bridgePid: 100 }, execFileSync)).toBe(false);
  });

  it("returns false when the command line is missing", () => {
    const execFileSync = vi.fn(() => JSON.stringify({ Pid: 100 }));
    expect(host.verifyBridge({ port: 5, bridgePid: 100 }, execFileSync)).toBe(false);
  });

  it("returns false when the query throws", () => {
    const execFileSync = vi.fn(() => { throw new Error("access denied"); });
    expect(host.verifyBridge({ port: 5, bridgePid: 100 }, execFileSync)).toBe(false);
  });
});

describe("elevated-pty-host run", () => {
  it("refuses to launch when the bridge cannot be verified", () => {
    const deps = makeDeps(makeHostSocket(), makeTerminal(), {
      execFileSync: vi.fn(() => { throw new Error("no bridge"); })
    });
    const result = host.run(liveConfig(), deps);
    expect(result).toBe(null);
    expect(deps.net.connect).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it("authenticates, spawns the pty, and relays I/O both directions", () => {
    const socket = makeHostSocket();
    const terminal = makeTerminal();
    const deps = makeDeps(socket, terminal);
    const config = liveConfig();

    const returned = host.run(config, deps);
    expect(returned).toBe(socket);
    expect(deps.net.connect).toHaveBeenCalledWith(55501, "127.0.0.1");

    // On connect -> send auth with the one-time token.
    socket.emit("connect");
    expect(socket.frames()).toContainEqual({ type: "auth", token: "sekret-token" });

    // Blank + unparseable lines are ignored; input before ready is ignored.
    socket.feedRaw("\n");
    socket.feedRaw("not-json\n");
    socket.feed({ type: "input", data: host.encodeData("early") });
    expect(terminal.write).not.toHaveBeenCalled();

    // ready -> spawn the pty and announce it.
    socket.feed({ type: "ready" });
    expect(deps.spawnPty).toHaveBeenCalledWith(config);
    expect(socket.frames()).toContainEqual({ type: "started", pid: 4321 });

    // A duplicate ready is ignored (pty already exists).
    deps.spawnPty.mockClear();
    socket.feed({ type: "ready" });
    expect(deps.spawnPty).not.toHaveBeenCalled();

    // pty output -> encoded output frame.
    terminal._data("shell says hi");
    const outFrame = socket.frames().find((frame) => frame.type === "output");
    expect(host.decodeData(outFrame.data)).toBe("shell says hi");

    // Bridge input/resize/kill drive the pty.
    socket.feed({ type: "input", data: host.encodeData("dir\r") });
    expect(terminal.write).toHaveBeenCalledWith("dir\r");
    socket.feed({ type: "resize", cols: 80, rows: 24 });
    expect(terminal.resize).toHaveBeenCalledWith(80, 24);
    socket.feed({ type: "kill" });
    expect(terminal.kill).toHaveBeenCalledTimes(1);

    // pty exit -> exit frame, socket end, process exit.
    terminal._exit({ exitCode: 0 });
    expect(socket.frames()).toContainEqual({ type: "exit", code: 0 });
    expect(socket.ended).toBe(true);
    expect(deps.exit).toHaveBeenCalledWith(0);

    // Late socket close/error is harmless.
    expect(() => { socket.emit("close"); socket.emit("error", new Error("reset")); }).not.toThrow();
  });

  it("reports a null exit code when the pty exit event has no numeric code", () => {
    const { socket, terminal } = startedRun();
    terminal._exit({});
    expect(socket.frames()).toContainEqual({ type: "exit", code: null });
  });

  it("reports a null exit code when the pty exit event is missing", () => {
    const { socket, terminal } = startedRun();
    terminal._exit(undefined);
    expect(socket.frames()).toContainEqual({ type: "exit", code: null });
  });

  it("exits cleanly when the socket closes before the pty is ever spawned", () => {
    const socket = makeHostSocket();
    const terminal = makeTerminal();
    const deps = makeDeps(socket, terminal);
    host.run(liveConfig(), deps);
    socket.emit("connect");
    // No "ready" arrived, so no pty was spawned; a close must still exit without a kill.
    socket.emit("close");
    expect(deps.spawnPty).not.toHaveBeenCalled();
    expect(terminal.kill).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it("swallows errors from a pty resize/kill after the shell has closed", () => {
    const { socket, terminal } = startedRun({
      resize: vi.fn(() => { throw new Error("pty closed"); }),
      kill: vi.fn(() => { throw new Error("already dead"); })
    });
    expect(() => {
      socket.feed({ type: "resize", cols: 10, rows: 10 });
      socket.feed({ type: "kill" });
      socket.emit("close");
    }).not.toThrow();
  });
});

describe("elevated-pty-host createRealDeps", () => {
  it("wires injected pty/process/childProcess/net and builds a truecolor pty", () => {
    const ptySpawn = vi.fn(() => ({ pid: 7 }));
    const proc = { env: { COLORTERM: "truecolor", TERM: "xterm-256color" }, stderr: { write: vi.fn() }, exit: vi.fn() };
    const cp = { execFileSync: vi.fn() };
    const fakeNet = { connect: vi.fn() };
    const deps = host.createRealDeps({ pty: { spawn: ptySpawn }, process: proc, childProcess: cp, net: fakeNet });

    expect(deps.net).toBe(fakeNet);
    expect(deps.execFileSync).toBe(cp.execFileSync);

    const term = deps.spawnPty({ shellFile: "pwsh.exe", shellArgs: ["-l"], cols: 90, rows: 30, cwd: "C:/" });
    expect(term).toEqual({ pid: 7 });
    expect(ptySpawn).toHaveBeenCalledWith("pwsh.exe", ["-l"], expect.objectContaining({
      cols: 90,
      rows: 30,
      cwd: "C:/",
      useConpty: true,
      env: expect.objectContaining({ COLORTERM: "truecolor", TERM: "xterm-256color" })
    }));

    deps.log("hello there");
    expect(proc.stderr.write).toHaveBeenCalledWith("[elevated-pty-host] hello there\n");
    deps.exit(3);
    expect(proc.exit).toHaveBeenCalledWith(3);
  });

  it("defaults COLORTERM/TERM and pty size when the environment is bare", () => {
    const ptySpawn = vi.fn(() => ({ pid: 1 }));
    const proc = { env: {}, stderr: { write: vi.fn() }, exit: vi.fn() };
    const deps = host.createRealDeps({ pty: { spawn: ptySpawn }, process: proc, childProcess: { execFileSync: vi.fn() }, net: {} });

    deps.spawnPty({ shellFile: "cmd.exe", shellArgs: [], cwd: "C:/" });
    expect(ptySpawn).toHaveBeenCalledWith("cmd.exe", [], expect.objectContaining({
      cols: 120,
      rows: 30,
      env: expect.objectContaining({ COLORTERM: "truecolor", TERM: "xterm-256color" })
    }));
  });

  it("falls back to the real modules when no overrides are given", () => {
    const deps = host.createRealDeps();
    expect(typeof deps.spawnPty).toBe("function");
    expect(typeof deps.execFileSync).toBe("function");
    expect(deps.net).toBe(require("node:net"));
  });
});

describe("elevated-pty-host main", () => {
  it("decodes the argv config and runs the relay", () => {
    const config = liveConfig();
    const encoded = Buffer.from(JSON.stringify(config)).toString("base64");
    const deps = makeDeps(makeHostSocket(), makeTerminal(), {
      execFileSync: vi.fn(() => { throw new Error("unverifiable"); })
    });
    host.main(["node", "elevated-pty-host.js", encoded], deps);
    expect(deps.log).toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(1);
  });
});
