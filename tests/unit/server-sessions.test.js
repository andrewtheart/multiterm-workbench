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

  it("sends exit then force-kills after the grace period", () => {
    vi.useFakeTimers();
    const session = { id: "s", terminal, exited: false };
    server.sessions.set("s", session);
    server.killSession("s");
    expect(terminal.write).toHaveBeenCalledWith("exit\r");
    vi.advanceTimersByTime(1500);
    expect(terminal.kill).toHaveBeenCalled();
  });

  it("kills every session", () => {
    vi.useFakeTimers();
    const t2 = makeTerminal();
    server.sessions.set("a", { id: "a", terminal, exited: false });
    server.sessions.set("b", { id: "b", terminal: t2, exited: false });
    server.killAllSessions();
    expect(terminal.write).toHaveBeenCalledWith("exit\r");
    expect(t2.write).toHaveBeenCalledWith("exit\r");
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
