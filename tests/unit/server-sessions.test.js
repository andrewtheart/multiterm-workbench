const server = require("../../server.js");

function makeTerminal(pid = 4321) {
  const handlers = {};
  return {
    pid,
    onData: vi.fn((cb) => { handlers.data = cb; }),
    onExit: vi.fn((cb) => { handlers.exit = cb; }),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    fire(name, arg) { if (handlers[name]) handlers[name](arg); }
  };
}

function fakeClient() {
  return { send: vi.fn() };
}

let terminal;

beforeEach(() => {
  terminal = makeTerminal();
  server.__setPty({ spawn: vi.fn(() => terminal) });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  server.__setPty(require("@homebridge/node-pty-prebuilt-multiarch"));
  server.__resetTeardownSchedule();
  server.sessions.clear();
  server.clients.clear();
});

describe("createSession", () => {
  it("creates a session and streams pty output and exit", () => {
    const client = fakeClient();
    const observer = fakeClient();
    server.clients.add(observer);

    server.createSession(client, { id: "session01", shell: "cmd", cwd: process.cwd(), cols: 100, rows: 40, title: "Build" });

    expect(server.sessions.has("session01")).toBe(true);
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "created", id: "session01", title: "Build" }));
    expect(observer.send).toHaveBeenCalledWith(expect.objectContaining({ type: "created", id: "session01", title: "Build" }));

    terminal.fire("data", "hello");
    expect(observer.send).toHaveBeenCalledWith(expect.objectContaining({ type: "output", id: "session01", data: "hello" }));

    terminal.fire("exit", { exitCode: 0, signal: 0 });
    expect(server.sessions.has("session01")).toBe(false);
    expect(observer.send).toHaveBeenCalledWith(expect.objectContaining({ type: "exited", id: "session01", code: 0 }));
  });

  it("rejects a duplicate id", () => {
    const client = fakeClient();
    server.sessions.set("dupe1234", { id: "dupe1234", terminal, exited: false });
    server.createSession(client, { id: "dupe1234" });
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ message: "A session with this id already exists." }));
  });

  it("defaults the title to the shell label and uses default dimensions", () => {
    const client = fakeClient();
    server.createSession(client, { id: "session02", title: "   " });
    const session = server.sessions.get("session02");
    expect(session.title).toBe("PowerShell 7");
    expect(session.cols).toBe(120);
    expect(session.rows).toBe(30);
  });

  it("reports a spawn failure", () => {
    server.__setPty({ spawn: vi.fn(() => { throw new Error("no shell"); }) });
    const client = fakeClient();
    server.createSession(client, { id: "session03" });
    expect(client.send).toHaveBeenCalledWith({ type: "createFailed", id: "session03", message: "no shell" });
    expect(server.sessions.has("session03")).toBe(false);
  });

  it("writes sanitized pty output to the log stream when one is attached", () => {
    const client = fakeClient();
    server.createSession(client, { id: "session04" });
    const session = server.sessions.get("session04");
    const write = vi.fn();
    session.logStream = { write };

    terminal.fire("data", "\x1b[31mred\x1b[0m");
    expect(write).toHaveBeenCalledWith("red");
  });

  it("never lets a failing log write break the live session", () => {
    const client = fakeClient();
    server.createSession(client, { id: "session05" });
    const session = server.sessions.get("session05");
    session.logStream = { write: () => { throw new Error("disk full"); } };

    expect(() => terminal.fire("data", "output")).not.toThrow();
  });
});

describe("writeSession", () => {
  it("ignores missing sessions and non-string data", () => {
    expect(() => server.writeSession("ghost", "ls")).not.toThrow();
    server.sessions.set("s", { id: "s", terminal, exited: false });
    server.writeSession("s", 123);
    expect(terminal.write).not.toHaveBeenCalled();
  });

  it("writes to a running session", () => {
    server.sessions.set("s", { id: "s", terminal, exited: false });
    server.writeSession("s", "dir\r");
    expect(terminal.write).toHaveBeenCalledWith("dir\r");
  });
});

describe("rememberSize", () => {
  it("ignores missing sessions", () => {
    expect(() => server.rememberSize("ghost", 10, 5)).not.toThrow();
  });

  it("updates dimensions and resizes a running session", () => {
    const session = { id: "s", terminal, exited: false, cols: 80, rows: 24 };
    server.sessions.set("s", session);
    server.rememberSize("s", 132, 43);
    expect(session.cols).toBe(132);
    expect(session.rows).toBe(43);
    expect(terminal.resize).toHaveBeenCalledWith(132, 43);
  });

  it("keeps previous dimensions when new values are falsy", () => {
    const session = { id: "s", terminal, exited: false, cols: 80, rows: 24 };
    server.sessions.set("s", session);
    server.rememberSize("s", 0, undefined);
    expect(session.cols).toBe(80);
    expect(session.rows).toBe(24);
  });

  it("swallows resize errors", () => {
    terminal.resize.mockImplementation(() => { throw new Error("closed"); });
    const session = { id: "s", terminal, exited: false, cols: 80, rows: 24 };
    server.sessions.set("s", session);
    expect(() => server.rememberSize("s", 100, 30)).not.toThrow();
  });
});

describe("killSession / killAllSessions", () => {
  it("ignores a missing session", () => {
    expect(() => server.killSession("ghost")).not.toThrow();
  });

  it("sends exit, then interrupts, then force-kills as a last resort", () => {
    vi.useFakeTimers();
    const session = { id: "s", terminal, exited: false, killed: false };
    server.sessions.set("s", session);
    server.killSession("s");
    expect(terminal.write).toHaveBeenCalledWith("exit\r");

    // The first window must not force-kill: a responsive shell exits on its own.
    vi.advanceTimersByTime(2500);
    expect(terminal.kill).not.toHaveBeenCalled();
    expect(terminal.write).toHaveBeenCalledWith("\u0003");

    vi.advanceTimersByTime(2500);
    expect(terminal.kill).toHaveBeenCalledTimes(1);
  });

  it("never force-kills a shell that exits during the grace period", () => {
    vi.useFakeTimers();
    const session = { id: "s", terminal, exited: false, killed: false };
    server.sessions.set("s", session);
    server.killSession("s");

    // Stand in for the pty's onExit arriving while the grace timers are pending.
    session.exited = true;
    vi.advanceTimersByTime(60000);

    expect(terminal.kill).not.toHaveBeenCalled();
  });

  it("kills every session", () => {
    vi.useFakeTimers();
    const t2 = makeTerminal();
    server.sessions.set("a", { id: "a", terminal, exited: false, killed: false, closing: false });
    server.sessions.set("b", { id: "b", terminal: t2, exited: false, killed: false, closing: false });
    server.killAllSessions();

    // Closes are staggered, so the first goes out now and the second shortly after.
    expect(terminal.write).toHaveBeenCalledWith("exit\r");
    expect(t2.write).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    expect(t2.write).toHaveBeenCalledWith("exit\r");
  });

  // Concurrent ConPTY teardown crashes node-pty natively, so a bulk close must never
  // put every session into teardown at the same moment.
  it("staggers a bulk close instead of tearing every pty down at once", () => {
    vi.useFakeTimers();
    const terms = [terminal, makeTerminal(1), makeTerminal(2), makeTerminal(3)];
    terms.forEach((t, i) => {
      server.sessions.set(`s${i}`, { id: `s${i}`, terminal: t, exited: false, killed: false, closing: false });
    });

    server.killAllSessions();

    const closedCount = () => terms.filter((t) => t.write.mock.calls.length > 0).length;
    expect(closedCount()).toBe(1);

    for (let i = 2; i <= terms.length; i += 1) {
      vi.advanceTimersByTime(150);
      expect(closedCount()).toBe(i);
    }
  });

  it("ignores a repeat close for a session already tearing down", () => {
    vi.useFakeTimers();
    server.sessions.set("s", { id: "s", terminal, exited: false, killed: false, closing: false });

    server.killSession("s");
    server.killSession("s");
    server.killSession("s");

    vi.advanceTimersByTime(10000);
    expect(terminal.kill).toHaveBeenCalledTimes(1);
  });
});

describe("closeSessions", () => {
  it("gracefully sends exit to running sessions", () => {
    server.sessions.set("s", { id: "s", terminal, exited: false });
    server.closeSessions(true);
    expect(terminal.write).toHaveBeenCalledWith("exit\r");
  });

  it("force-kills running sessions when not graceful", () => {
    server.sessions.set("s", { id: "s", terminal, exited: false });
    server.closeSessions(false);
    expect(terminal.kill).toHaveBeenCalled();
  });

  it("skips already-exited sessions when not graceful", () => {
    server.sessions.set("s", { id: "s", terminal, exited: true });
    server.closeSessions(false);
    expect(terminal.kill).not.toHaveBeenCalled();
  });
});

// On Windows, node-pty frees the native ConPTY inside kill() but only reports the exit
// asynchronously. Touching the pty in that gap crashes the whole bridge with an access
// violation (0xC0000005) or heap corruption (0xC0000374), so the session must be marked
// dead synchronously rather than waiting for the onExit callback.
describe("post-kill safety window", () => {
  it("marks the session dead synchronously when the pty is killed", () => {
    const session = { id: "s", terminal, exited: false, killed: false };
    server.sessions.set("s", session);

    server.closeSessions(false);

    expect(session.killed).toBe(true);
    expect(server.isSessionRunning(session)).toBe(false);
  });

  it("issues no pty calls after a kill, even before onExit fires", () => {
    const session = { id: "s", terminal, exited: false, killed: false, cols: 80, rows: 24 };
    server.sessions.set("s", session);

    server.closeSessions(false);
    expect(terminal.kill).toHaveBeenCalledTimes(1);

    terminal.resize.mockClear();
    terminal.write.mockClear();

    // A reflowing grid keeps sending sizes and stray input while the pty tears down.
    server.rememberSize("s", 120, 40);
    server.writeSession("s", "echo hi\r");
    server.closeSessions(false);
    server.closeSessions(true);

    expect(terminal.resize).not.toHaveBeenCalled();
    expect(terminal.write).not.toHaveBeenCalled();
    expect(terminal.kill).toHaveBeenCalledTimes(1);
  });

  it("does not double-kill when a graceful close races the force kill", () => {
    vi.useFakeTimers();
    const session = { id: "s", terminal, exited: false, killed: false };
    server.sessions.set("s", session);

    server.killSession("s");
    server.closeSessions(false);
    expect(terminal.kill).toHaveBeenCalledTimes(1);

    // The deferred interrupt and force-kill from killSession must not touch the
    // freed pty or fire a second native kill.
    terminal.write.mockClear();
    vi.advanceTimersByTime(60000);
    expect(terminal.write).not.toHaveBeenCalled();
    expect(terminal.kill).toHaveBeenCalledTimes(1);
  });

  it("still records the requested size after a kill so a relaunch reuses it", () => {
    const session = { id: "s", terminal, exited: false, killed: false, cols: 80, rows: 24 };
    server.sessions.set("s", session);

    server.closeSessions(false);
    server.rememberSize("s", 120, 40);

    expect(session.cols).toBe(120);
    expect(session.rows).toBe(40);
    expect(terminal.resize).not.toHaveBeenCalled();
  });

  it("marks the session dead when the graceful exit write throws", () => {
    const session = { id: "s", terminal, exited: false, killed: false };
    server.sessions.set("s", session);
    terminal.write.mockImplementationOnce(() => { throw new Error("pty gone"); });

    server.endSessionInput(session);

    expect(terminal.kill).toHaveBeenCalledTimes(1);
    expect(session.killed).toBe(true);
    expect(server.isSessionRunning(session)).toBe(false);
  });

  it("survives a kill that throws without leaving the session usable", () => {
    const session = { id: "s", terminal, exited: false, killed: false };
    server.sessions.set("s", session);
    terminal.kill.mockImplementationOnce(() => { throw new Error("already dead"); });

    expect(() => server.killSessionPty(session)).not.toThrow();
    expect(session.killed).toBe(true);
    expect(server.isSessionRunning(session)).toBe(false);
  });

  // A shell busy in a foreground command never sees "exit", so without the interrupt
  // every such close would fall through to the crash-prone native kill.
  it("interrupts a busy shell so it can exit without a force kill", () => {
    const session = { id: "s", terminal, exited: false, killed: false };
    server.sessions.set("s", session);

    server.interruptAndExit(session);

    expect(terminal.write).toHaveBeenNthCalledWith(1, "\u0003");
    expect(terminal.write).toHaveBeenNthCalledWith(2, "exit\r");
    expect(terminal.kill).not.toHaveBeenCalled();
  });

  it("skips the interrupt once the session is gone", () => {
    const session = { id: "s", terminal, exited: false, killed: true };
    server.interruptAndExit(session);
    expect(terminal.write).not.toHaveBeenCalled();
  });

  it("force-kills if the interrupt write throws", () => {
    const session = { id: "s", terminal, exited: false, killed: false };
    server.sessions.set("s", session);
    terminal.write.mockImplementationOnce(() => { throw new Error("pty gone"); });

    server.interruptAndExit(session);

    expect(terminal.kill).toHaveBeenCalledTimes(1);
    expect(session.killed).toBe(true);
  });
});

describe("endSessionInput", () => {
  it("returns early when the session is not running", () => {
    expect(() => server.endSessionInput({ terminal: null })).not.toThrow();
    expect(terminal.write).not.toHaveBeenCalled();
  });

  it("kills the terminal when writing exit fails", () => {
    terminal.write.mockImplementation(() => { throw new Error("EPIPE"); });
    server.endSessionInput({ terminal, exited: false });
    expect(terminal.kill).toHaveBeenCalled();
  });
});
