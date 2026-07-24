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
    const info = await new Promise((resolve) => app.start(resolve));
    expect(info).toEqual({ host: app.host, port: app.port });
    await new Promise((resolve) => app.server.close(resolve));
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
