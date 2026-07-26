const fs = require("node:fs");
const os = require("node:os");
const childProcess = require("node:child_process");
const server = require("../../server.js");

function fakeClient() {
  return { send: vi.fn() };
}

function setPlatform(value) {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

let platformDescriptor;

beforeEach(() => {
  platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  Object.defineProperty(process, "platform", platformDescriptor);
  server.__setMemStatsEnabled(false);
  server.stopMemStats();
  server.sessions.clear();
  server.clients.clear();
});

describe("sanitizeLogName", () => {
  it("keeps safe characters and truncates to 60 chars", () => {
    expect(server.sanitizeLogName("My Session!/\\:*")).toBe("My_Session_");
    const long = "a".repeat(100);
    expect(server.sanitizeLogName(long)).toHaveLength(60);
  });

  it("collapses disallowed characters and falls back to 'session' only when empty", () => {
    // A non-empty run of disallowed characters collapses to a single underscore...
    expect(server.sanitizeLogName("!@#$%^&*")).toBe("_");
    // ...but an empty result triggers the 'session' fallback.
    expect(server.sanitizeLogName("")).toBe("session");
  });
});

describe("stripAnsiForLog", () => {
  it("removes OSC, CSI, single-char escapes, and control bytes", () => {
    const osc = "\x1b]0;window title\x07after";
    expect(server.stripAnsiForLog(osc)).toBe("after");

    const csi = "\x1b[31mred\x1b[0m";
    expect(server.stripAnsiForLog(csi)).toBe("red");

    const charset = "\x1b(Bplain";
    expect(server.stripAnsiForLog(charset)).toBe("plain");

    const control = "a\x00b\x07c";
    expect(server.stripAnsiForLog(control)).toBe("abc");
  });

  it("keeps tabs and newlines intact", () => {
    expect(server.stripAnsiForLog("line1\r\n\tline2")).toBe("line1\r\n\tline2");
  });
});

describe("startLog", () => {
  it("ignores an unknown session id", () => {
    const client = fakeClient();
    server.startLog(client, "ghost");
    expect(client.send).not.toHaveBeenCalled();
  });

  it("reports 'already' when a log stream is already open", () => {
    const client = fakeClient();
    server.sessions.set("s", { logStream: { write: vi.fn() }, logPath: "C:\\log.log" });
    server.startLog(client, "s");
    expect(client.send).toHaveBeenCalledWith({ type: "logStarted", id: "s", path: "C:\\log.log", already: true });
  });

  it("creates the log directory and stream, then confirms", () => {
    const client = fakeClient();
    const stream = { write: vi.fn(), end: vi.fn() };
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => {});
    vi.spyOn(fs, "createWriteStream").mockReturnValue(stream);
    const session = { title: "Build", shell: "pwsh", logStream: null, logPath: null };
    server.sessions.set("s", session);

    server.startLog(client, "s");

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("logs"), { recursive: true });
    expect(session.logStream).toBe(stream);
    expect(session.logPath).toContain("Build-");
    expect(stream.write).toHaveBeenCalledWith(expect.stringContaining("MultiTerm log"));
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "logStarted", id: "s" }));
  });

  it("derives a default base name when title and shell are missing", () => {
    const client = fakeClient();
    const stream = { write: vi.fn(), end: vi.fn() };
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => {});
    vi.spyOn(fs, "createWriteStream").mockReturnValue(stream);
    server.sessions.set("s", { logStream: null, logPath: null });
    server.startLog(client, "s");
    expect(server.sessions.get("s").logPath).toContain("session-");
  });

  it("reports a log error when the directory or stream cannot be created", () => {
    const client = fakeClient();
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => { throw new Error("EACCES"); });
    server.sessions.set("s", { title: "x", shell: "y", logStream: null, logPath: null });
    server.startLog(client, "s");
    expect(client.send).toHaveBeenCalledWith({ type: "logError", id: "s", message: "EACCES" });
  });
});

describe("stopLog / closeLog", () => {
  it("ignores a missing session or a session without a stream", () => {
    const client = fakeClient();
    server.stopLog(client, "ghost");
    server.sessions.set("s", { logStream: null });
    server.stopLog(client, "s");
    expect(client.send).not.toHaveBeenCalled();
  });

  it("closes the stream and confirms the stopped path", () => {
    const client = fakeClient();
    const stream = { end: vi.fn() };
    const session = { logStream: stream, logPath: "C:\\a.log" };
    server.sessions.set("s", session);
    server.stopLog(client, "s");
    expect(stream.end).toHaveBeenCalled();
    expect(session.logStream).toBeNull();
    expect(client.send).toHaveBeenCalledWith({ type: "logStopped", id: "s", path: "C:\\a.log" });
  });

  it("swallows errors while ending the stream", () => {
    const session = { logStream: { end: () => { throw new Error("boom"); } } };
    expect(() => server.closeLog(session)).not.toThrow();
    expect(session.logStream).toBeNull();
  });

  it("is a no-op for a session with no stream", () => {
    expect(() => server.closeLog({})).not.toThrow();
    expect(() => server.closeLog(null)).not.toThrow();
  });
});

describe("revealPath", () => {
  it("ignores an empty or non-string path", () => {
    const client = fakeClient();
    server.revealPath(client, { path: "   " });
    server.revealPath(client, {});
    expect(client.send).not.toHaveBeenCalled();
  });

  it("reports 'Path not found.' when the path cannot be stat'd", () => {
    const client = fakeClient();
    vi.spyOn(fs, "statSync").mockImplementation(() => { throw new Error("ENOENT"); });
    server.revealPath(client, { path: "C:\\missing" });
    expect(client.send).toHaveBeenCalledWith({ type: "revealError", message: "Path not found." });
  });

  it("opens a directory directly on Windows", () => {
    setPlatform("win32");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true });
    const spawn = vi.spyOn(childProcess, "spawn").mockReturnValue({ unref: vi.fn() });
    const client = fakeClient();
    server.revealPath(client, { path: "C:\\Users\\me" });
    expect(spawn).toHaveBeenCalledWith("explorer.exe", [expect.stringContaining("me")], expect.objectContaining({ detached: true }));
  });

  it("opens the parent directory of a file on macOS", () => {
    setPlatform("darwin");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => false });
    const spawn = vi.spyOn(childProcess, "spawn").mockReturnValue({ unref: vi.fn() });
    const client = fakeClient();
    server.revealPath(client, { path: "/Users/me/file.txt" });
    const [command, args] = spawn.mock.calls[0];
    expect(command).toBe("open");
    expect(args[0]).not.toContain("file.txt");
  });

  it("uses xdg-open on Linux", () => {
    setPlatform("linux");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true });
    const spawn = vi.spyOn(childProcess, "spawn").mockReturnValue({ unref: vi.fn() });
    server.revealPath(fakeClient(), { path: "/home/me" });
    expect(spawn.mock.calls[0][0]).toBe("xdg-open");
  });

  it("reports an error when the file explorer cannot be launched", () => {
    setPlatform("win32");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true });
    vi.spyOn(childProcess, "spawn").mockImplementation(() => { throw new Error("spawn EACCES"); });
    const client = fakeClient();
    server.revealPath(client, { path: "C:\\Users\\me" });
    expect(client.send).toHaveBeenCalledWith({ type: "revealError", message: "spawn EACCES" });
  });
});

describe("openPath", () => {
  it("ignores an empty or non-string path", () => {
    const client = fakeClient();
    server.openPath(client, { path: "   " });
    server.openPath(client, {});
    server.openPath(client, { path: 42 });
    expect(client.send).not.toHaveBeenCalled();
  });

  it("reports 'Path not found.' when the target does not exist", () => {
    const client = fakeClient();
    vi.spyOn(fs, "statSync").mockImplementation(() => { throw new Error("ENOENT"); });
    server.openPath(client, { path: "C:\\missing\\file.log" });
    expect(client.send).toHaveBeenCalledWith({ type: "openError", message: "Path not found." });
  });

  it("goes through the shell on Windows so the file association is honoured", () => {
    setPlatform("win32");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => false });
    const spawn = vi.spyOn(childProcess, "spawn").mockReturnValue({ unref: vi.fn() });
    server.openPath(fakeClient(), { path: "C:\\Users\\me\\session.log" });

    const [command, args] = spawn.mock.calls[0];
    expect(command).toBe("cmd.exe");
    // The empty title argument matters: without it 'start' consumes the quoted
    // path as the window title and never opens the file.
    expect(args.slice(0, 3)).toEqual(["/c", "start", ""]);
    expect(args[3]).toContain("session.log");
  });

  it("opens the file itself, not its parent folder", () => {
    setPlatform("darwin");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => false });
    const spawn = vi.spyOn(childProcess, "spawn").mockReturnValue({ unref: vi.fn() });
    server.openPath(fakeClient(), { path: "/Users/me/session.log" });

    const [command, args] = spawn.mock.calls[0];
    expect(command).toBe("open");
    expect(args[0]).toContain("session.log");
  });

  it("uses xdg-open on Linux", () => {
    setPlatform("linux");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => false });
    const spawn = vi.spyOn(childProcess, "spawn").mockReturnValue({ unref: vi.fn() });
    server.openPath(fakeClient(), { path: "/home/me/session.log" });
    expect(spawn.mock.calls[0][0]).toBe("xdg-open");
  });

  it("reports an error when the viewer cannot be launched", () => {
    setPlatform("win32");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => false });
    vi.spyOn(childProcess, "spawn").mockImplementation(() => { throw new Error("spawn EACCES"); });
    const client = fakeClient();
    server.openPath(client, { path: "C:\\Users\\me\\session.log" });
    expect(client.send).toHaveBeenCalledWith({ type: "openError", message: "spawn EACCES" });
  });
});

describe("pickScript", () => {
  // A fake picker process: stdout is a plain event source so the test can decide
  // what the dialog "returned" and when it closed.
  function fakePicker() {
    const handlers = {};
    return {
      stdout: { on: (event, fn) => { handlers[`stdout:${event}`] = fn; } },
      on: (event, fn) => { handlers[event] = fn; },
      emitStdout: (text) => handlers["stdout:data"](Buffer.from(text)),
      emitClose: () => handlers.close(),
      emitError: (error) => handlers.error(error)
    };
  }

  it("answers null off Windows rather than leaving the client waiting", () => {
    setPlatform("linux");
    const client = fakeClient();
    server.pickScript(client, { requestId: "r1", cwd: "/home/me" });
    expect(client.send).toHaveBeenCalledWith({ type: "scriptPicked", requestId: "r1", path: null });
  });

  it("runs the dialog on an STA thread with no visible console", () => {
    setPlatform("win32");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true });
    const picker = fakePicker();
    const spawn = vi.spyOn(childProcess, "spawn").mockReturnValue(picker);
    server.pickScript(fakeClient(), { requestId: "r2", cwd: "C:\\work" });

    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe("powershell.exe");
    // -STA is not cosmetic: the shell file dialog cannot be shown from an MTA thread.
    expect(args).toContain("-STA");
    expect(options.windowsHide).toBe(true);
    expect(args[args.length - 1]).toContain("C:\\work");
  });

  it("returns the chosen path once the picker closes", () => {
    setPlatform("win32");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true });
    const picker = fakePicker();
    vi.spyOn(childProcess, "spawn").mockReturnValue(picker);
    const client = fakeClient();
    server.pickScript(client, { requestId: "r3", cwd: "C:\\work" });

    picker.emitStdout("C:\\work\\deploy.ps1\r\n");
    picker.emitClose();
    expect(client.send).toHaveBeenCalledWith({
      type: "scriptPicked",
      requestId: "r3",
      path: "C:\\work\\deploy.ps1"
    });
  });

  it("treats an empty result as a cancellation", () => {
    setPlatform("win32");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true });
    const picker = fakePicker();
    vi.spyOn(childProcess, "spawn").mockReturnValue(picker);
    const client = fakeClient();
    server.pickScript(client, { requestId: "r4", cwd: "C:\\work" });

    picker.emitClose();
    expect(client.send).toHaveBeenCalledWith({ type: "scriptPicked", requestId: "r4", path: null });
  });

  it("answers exactly once even when the picker both errors and closes", () => {
    setPlatform("win32");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true });
    const picker = fakePicker();
    vi.spyOn(childProcess, "spawn").mockReturnValue(picker);
    const client = fakeClient();
    server.pickScript(client, { requestId: "r5", cwd: "C:\\work" });

    picker.emitError(new Error("boom"));
    picker.emitClose();
    // A second reply would resolve an unrelated later request with a stale answer.
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledWith({ type: "scriptPicked", requestId: "r5", path: null });
  });

  it("answers null when the picker cannot be launched at all", () => {
    setPlatform("win32");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true });
    vi.spyOn(childProcess, "spawn").mockImplementation(() => { throw new Error("spawn EACCES"); });
    const client = fakeClient();
    server.pickScript(client, { requestId: "r6", cwd: "C:\\work" });
    expect(client.send).toHaveBeenCalledWith({ type: "scriptPicked", requestId: "r6", path: null });
  });
});

describe("computeMemStats", () => {
  it("returns null when the PowerShell probe errors", () => {
    vi.spyOn(childProcess, "execFile").mockImplementation((_f, _a, _o, cb) => cb(new Error("nope"), ""));
    const result = vi.fn();
    server.computeMemStats(result);
    expect(result).toHaveBeenCalledWith(null);
  });

  it("returns null when the probe output is not valid JSON", () => {
    vi.spyOn(childProcess, "execFile").mockImplementation((_f, _a, _o, cb) => cb(null, "{not json"));
    const result = vi.fn();
    server.computeMemStats(result);
    expect(result).toHaveBeenCalledWith(null);
  });

  it("wraps a single (non-array) process object and treats a null payload as empty", () => {
    vi.spyOn(childProcess, "execFile").mockImplementation((_f, _a, _o, cb) =>
      cb(null, JSON.stringify({ ProcessId: process.pid, ParentProcessId: 0, WorkingSetSize: 1000 })));
    let stats;
    server.computeMemStats((s) => { stats = s; });
    expect(stats.appBytes).toBeGreaterThanOrEqual(1000);

    vi.restoreAllMocks();
    vi.spyOn(childProcess, "execFile").mockImplementation((_f, _a, _o, cb) => cb(null, "null"));
    let empty;
    server.computeMemStats((s) => { empty = s; });
    expect(empty.appBytes).toBe(0);
    expect(empty.systemTotal).toBe(os.totalmem());
  });

  it("sums the working set across the process tree and live terminal pids", () => {
    server.sessions.set("live", { terminal: { pid: 424242 } });
    server.sessions.set("dead", { terminal: null });
    const procs = [
      { ProcessId: process.pid, ParentProcessId: process.ppid || 0, WorkingSetSize: 1000 },
      { ProcessId: 424242, ParentProcessId: process.pid, WorkingSetSize: 500 },
      { ProcessId: 424243, ParentProcessId: process.pid } // missing WorkingSetSize -> counts as 0
    ];
    vi.spyOn(childProcess, "execFile").mockImplementation((_f, _a, _o, cb) => cb(null, JSON.stringify(procs)));
    let stats;
    server.computeMemStats((s) => { stats = s; });
    expect(stats.appBytes).toBeGreaterThanOrEqual(1500);
    expect(stats.systemUsed).toBeGreaterThanOrEqual(0);
    expect(stats.systemTotal).toBe(os.totalmem());
  });
});

describe("pushMemStats", () => {
  it("does nothing when memory stats are disabled", () => {
    const execFile = vi.spyOn(childProcess, "execFile");
    server.__setMemStatsEnabled(false);
    server.pushMemStats();
    expect(execFile).not.toHaveBeenCalled();
  });

  it("does nothing when there are no connected clients", () => {
    const execFile = vi.spyOn(childProcess, "execFile");
    server.__setMemStatsEnabled(true);
    server.clients.clear();
    server.pushMemStats();
    expect(execFile).not.toHaveBeenCalled();
  });

  it("skips a second run while one is already in flight", () => {
    const execFile = vi.spyOn(childProcess, "execFile").mockImplementation(() => {});
    server.__setMemStatsEnabled(true);
    server.clients.add(fakeClient());
    server.pushMemStats(); // starts a run; leaves it in flight (no callback fired)
    server.pushMemStats(); // must be a no-op while in flight
    expect(execFile).toHaveBeenCalledTimes(1);
    // Complete the cycle so the in-flight flag is cleared for later tests.
    execFile.mock.calls[0][3](new Error("done"));
  });

  it("broadcasts memstats on success and skips broadcasting on failure", () => {
    server.__setMemStatsEnabled(true);
    const client = fakeClient();
    server.clients.add(client);

    vi.spyOn(childProcess, "execFile").mockImplementation((_f, _a, _o, cb) =>
      cb(null, JSON.stringify([{ ProcessId: process.pid, ParentProcessId: 0, WorkingSetSize: 2048 }])));
    server.pushMemStats();
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "memstats", app: expect.any(Number) }));

    client.send.mockClear();
    vi.restoreAllMocks();
    vi.spyOn(childProcess, "execFile").mockImplementation((_f, _a, _o, cb) => cb(new Error("fail"), ""));
    server.pushMemStats();
    expect(client.send).not.toHaveBeenCalled();
  });
});

describe("memory-stats timers", () => {
  it("scheduleMemStats is inert while disabled and arms a timer while enabled", () => {
    vi.useFakeTimers();
    server.__setMemStatsEnabled(false);
    server.scheduleMemStats(500);
    expect(vi.getTimerCount()).toBe(0);

    server.__setMemStatsEnabled(true);
    server.scheduleMemStats();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    server.stopMemStats();
  });

  it("startMemStats arms the interval once and is idempotent; stopMemStats clears everything", () => {
    vi.useFakeTimers();
    server.__setMemStatsEnabled(false);
    server.startMemStats();
    expect(vi.getTimerCount()).toBe(0);

    server.__setMemStatsEnabled(true);
    server.startMemStats();
    const armed = vi.getTimerCount();
    expect(armed).toBeGreaterThan(0);
    server.startMemStats(); // already running -> no additional timers
    expect(vi.getTimerCount()).toBe(armed);

    server.stopMemStats();
    expect(vi.getTimerCount()).toBe(0);
    // Second stop is a harmless no-op.
    expect(() => server.stopMemStats()).not.toThrow();
  });
});

describe("handleClientMessage dispatch (log + reveal + open + killAll)", () => {
  it("routes logStart, logStop, reveal, openPath, and killAll to their handlers", () => {
    const client = fakeClient();
    const stream = { write: vi.fn(), end: vi.fn() };
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => {});
    vi.spyOn(fs, "createWriteStream").mockReturnValue(stream);
    setPlatform("win32");
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true });
    vi.spyOn(childProcess, "spawn").mockReturnValue({ unref: vi.fn() });

    server.sessions.set("s", { title: "T", shell: "pwsh", logStream: null, logPath: null });

    server.handleClientMessage(client, JSON.stringify({ type: "logStart", id: "s" }));
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "logStarted", id: "s" }));

    server.handleClientMessage(client, JSON.stringify({ type: "logStop", id: "s" }));
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "logStopped", id: "s" }));

    server.handleClientMessage(client, JSON.stringify({ type: "reveal", path: "C:\\Users\\me" }));
    expect(childProcess.spawn).toHaveBeenCalled();

    childProcess.spawn.mockClear();
    server.handleClientMessage(client, JSON.stringify({ type: "openPath", path: "C:\\Users\\me\\s.log" }));
    expect(childProcess.spawn.mock.calls[0][0]).toBe("cmd.exe");

    // pickScript must be routed, not fall through to "Unsupported message type":
    // an unanswered request leaves the browser waiting on a promise for minutes.
    childProcess.spawn.mockClear();
    childProcess.spawn.mockReturnValue({ stdout: { on: vi.fn() }, on: vi.fn() });
    server.handleClientMessage(client, JSON.stringify({ type: "pickScript", requestId: "r", cwd: "C:\\Users\\me" }));
    expect(childProcess.spawn.mock.calls[0][0]).toBe("powershell.exe");

    expect(() => server.handleClientMessage(client, JSON.stringify({ type: "killAll" }))).not.toThrow();
  });
});

describe("process safety-net handlers", () => {
  it("logs uncaught exceptions and unhandled rejections without rethrowing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    server.handleUncaughtException(new Error("kaboom"));
    server.handleUncaughtException("no-stack");
    server.handleUnhandledRejection(new Error("rejected"));
    server.handleUnhandledRejection(null);
    expect(spy).toHaveBeenCalledTimes(4);
  });
});
