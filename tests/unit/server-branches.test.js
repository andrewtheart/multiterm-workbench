const server = require("../../server.js");
const pty = require("@homebridge/node-pty-prebuilt-multiarch");

function makeTerminal() {
  return {
    pid: 7,
    onData() {},
    onExit() {},
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn()
  };
}

function fakeSocket(remoteAddress = "127.0.0.1") {
  const listeners = {};
  return {
    remoteAddress,
    destroyed: false,
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn((event, cb) => { listeners[event] = cb; }),
    emit(event, arg) { if (listeners[event]) listeners[event](arg); }
  };
}

function maskFrame(payload) {
  const data = Buffer.from(payload);
  const mask = Buffer.from([2, 4, 6, 8]);
  const header = Buffer.from([0x81, 0x80 | data.length]);
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) masked[i] = data[i] ^ mask[i % 4];
  return Buffer.concat([header, mask, masked]);
}

let terminal;

beforeEach(() => {
  terminal = makeTerminal();
  server.__setPty({ spawn: vi.fn(() => terminal) });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  server.__setPty(pty);
  server.__resetTeardownSchedule();
  server.sessions.clear();
  server.clients.clear();
});

describe("handleClientMessage create dispatch", () => {
  it("creates a session from a create message", () => {
    const client = { send: vi.fn() };
    server.handleClientMessage(client, JSON.stringify({ type: "create", id: "viamessage1", cwd: process.cwd() }));
    expect(server.sessions.has("viamessage1")).toBe(true);
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "created" }));
  });
});

describe("createSession environment branches", () => {
  it("uses default TERM/COLORTERM when unset", () => {
    const spawn = vi.fn(() => terminal);
    server.__setPty({ spawn });
    const savedColor = process.env.COLORTERM;
    const savedTerm = process.env.TERM;
    delete process.env.COLORTERM;
    delete process.env.TERM;
    try {
      server.createSession({ send: vi.fn() }, { id: "envdefault1" });
      const opts = spawn.mock.calls[0][2];
      expect(opts.env.COLORTERM).toBe("truecolor");
      expect(opts.env.TERM).toBe("xterm-256color");
    } finally {
      if (savedColor !== undefined) process.env.COLORTERM = savedColor;
      if (savedTerm !== undefined) process.env.TERM = savedTerm;
    }
  });

  it("passes through an inherited TERM/COLORTERM", () => {
    const spawn = vi.fn(() => terminal);
    server.__setPty({ spawn });
    const savedColor = process.env.COLORTERM;
    const savedTerm = process.env.TERM;
    process.env.COLORTERM = "yes-color";
    process.env.TERM = "vt100";
    try {
      server.createSession({ send: vi.fn() }, { id: "envinherit1" });
      const opts = spawn.mock.calls[0][2];
      expect(opts.env.COLORTERM).toBe("yes-color");
      expect(opts.env.TERM).toBe("vt100");
    } finally {
      if (savedColor === undefined) delete process.env.COLORTERM; else process.env.COLORTERM = savedColor;
      if (savedTerm === undefined) delete process.env.TERM; else process.env.TERM = savedTerm;
    }
  });

  it("defaults the title when none is supplied", () => {
    server.createSession({ send: vi.fn() }, { id: "notitle1", shell: "cmd" });
    expect(server.sessions.get("notitle1").title).toBe("Command Prompt");
  });
});

describe("non-running session branches", () => {
  it("does not write to an exited session", () => {
    server.sessions.set("s", { id: "s", terminal, exited: true });
    server.writeSession("s", "ls");
    expect(terminal.write).not.toHaveBeenCalled();
  });

  it("updates size but skips resize on an exited session", () => {
    const session = { id: "s", terminal, exited: true, cols: 80, rows: 24 };
    server.sessions.set("s", session);
    server.rememberSize("s", 120, 40);
    expect(session.cols).toBe(120);
    expect(terminal.resize).not.toHaveBeenCalled();
  });

  it("does not force-kill if a session exits during the grace period", () => {
    vi.useFakeTimers();
    const session = { id: "s", terminal, exited: false };
    server.sessions.set("s", session);
    server.killSession("s");
    session.exited = true;
    vi.advanceTimersByTime(60000);
    expect(terminal.kill).not.toHaveBeenCalled();
  });
});

describe("handleProcessExit", () => {
  it("force-closes running sessions", () => {
    server.sessions.set("s", { id: "s", terminal, exited: false });
    server.handleProcessExit();
    expect(terminal.kill).toHaveBeenCalled();
  });
});

describe("start edge cases", () => {
  it("works without a callback and reports the bound port from address()", async () => {
    server.start(undefined, 0, "127.0.0.1");
    await new Promise((resolve) => server.server.once("listening", resolve));
    expect(server.server.address().port).toBeGreaterThan(0);
    await new Promise((resolve) => server.server.close(resolve));
  });

  it("falls back to the listen port when address() is unavailable", async () => {
    vi.spyOn(server.server, "address").mockReturnValue(null);
    const info = await new Promise((resolve) => server.start(resolve, 0, "127.0.0.1"));
    expect(info.port).toBe(0);
    await new Promise((resolve) => server.server.close(resolve));
  });
});

describe("client send when socket is destroyed", () => {
  it("skips writing to a destroyed socket", () => {
    const socket = fakeSocket("127.0.0.1");
    server.server.emit("upgrade", { url: "/ws", headers: { "sec-websocket-key": "dGhlIHNhbXBsZQ==" } }, socket);
    const writesAfterHandshake = socket.write.mock.calls.length;
    socket.destroyed = true;
    socket.emit("data", maskFrame(JSON.stringify({ type: "list" })));
    expect(socket.write.mock.calls.length).toBe(writesAfterHandshake);
    server.clients.clear();
  });
});

describe("allowRemote enabled", () => {
  it("permits non-local upgrades when allowRemote is enabled", () => {
    server.__setAllowRemote(true);
    try {
      const socket = fakeSocket("203.0.113.5");
      server.server.emit("upgrade", { url: "/ws", headers: { "sec-websocket-key": "dGhlIHNhbXBsZQ==" } }, socket);
      expect(socket.destroy).not.toHaveBeenCalled();
      expect(String(socket.write.mock.calls[0][0])).toContain("101 Switching Protocols");
      server.clients.clear();
    } finally {
      server.__setAllowRemote(false);
    }
  });
});
