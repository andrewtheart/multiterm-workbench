const fs = require("node:fs");
const path = require("node:path");
const server = require("../../server.js");

function mockResponse() {
  return {
    statusCode: null,
    headers: null,
    body: undefined,
    ended: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || null;
      return this;
    },
    end(body) {
      this.body = body;
      this.ended = true;
      return this;
    }
  };
}

function maskFrame(payload, opcode = 0x1, { forceLength } = {}) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = forceLength === undefined ? data.length : forceLength;
  const mask = Buffer.from([1, 2, 3, 4]);
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, 0x80 | len]);
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) {
    masked[i] = data[i] ^ mask[i % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

function fakeClient() {
  return {
    buffer: Buffer.alloc(0),
    socket: { write: vi.fn(), end: vi.fn(), destroyed: false },
    send: vi.fn()
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  server.sessions.clear();
  server.clients.clear();
});

describe("getPathname", () => {
  it("returns / for nullish input", () => {
    expect(server.getPathname(undefined)).toBe("/");
    expect(server.getPathname(null)).toBe("/");
  });

  it("strips the query string", () => {
    expect(server.getPathname("/app.js?v=2")).toBe("/app.js");
  });

  it("falls back to / when only a query is present", () => {
    expect(server.getPathname("?x=1")).toBe("/");
  });
});

describe("encodeFrame", () => {
  it("encodes a short payload with a 2-byte header", () => {
    const frame = server.encodeFrame("hi");
    expect(frame[0]).toBe(0x81);
    expect(frame[1]).toBe(2);
    expect(frame.subarray(2).toString()).toBe("hi");
  });

  it("encodes a 16-bit length payload", () => {
    const frame = server.encodeFrame("a".repeat(200));
    expect(frame[1]).toBe(126);
    expect(frame.readUInt16BE(2)).toBe(200);
  });

  it("encodes a 64-bit length payload", () => {
    const frame = server.encodeFrame(Buffer.alloc(70000));
    expect(frame[1]).toBe(127);
    expect(Number(frame.readBigUInt64BE(2))).toBe(70000);
  });

  it("accepts a custom opcode and buffer payload", () => {
    const frame = server.encodeFrame(Buffer.from(""), 0x8);
    expect(frame[0]).toBe(0x88);
  });
});

describe("sanitizeId", () => {
  it("keeps a valid id", () => {
    expect(server.sanitizeId("abc12345")).toBe("abc12345");
  });

  it("generates a uuid for invalid ids", () => {
    const generated = server.sanitizeId("bad id!");
    expect(generated).toMatch(/[0-9a-f-]{36}/);
    expect(server.sanitizeId(42)).toMatch(/[0-9a-f-]{36}/);
  });
});

describe("getShell", () => {
  it("maps known shells", () => {
    expect(server.getShell("powershell").file).toBe("powershell.exe");
    expect(server.getShell("cmd").file).toBe("cmd.exe");
    expect(server.getShell("wsl").file).toBe("wsl.exe");
  });

  it("defaults to pwsh", () => {
    expect(server.getShell("anything").file).toBe("pwsh.exe");
    expect(server.getShell(undefined).label).toBe("PowerShell 7");
  });
});

describe("getWorkingDirectory", () => {
  it("returns cwd for non-strings and blanks", () => {
    expect(server.getWorkingDirectory(undefined)).toBe(process.cwd());
    expect(server.getWorkingDirectory("   ")).toBe(process.cwd());
  });

  it("returns a resolved existing directory", () => {
    const dir = server.getWorkingDirectory(__dirname);
    expect(dir).toBe(path.resolve(__dirname));
  });

  it("returns cwd when the path is a file", () => {
    expect(server.getWorkingDirectory(__filename)).toBe(process.cwd());
  });

  it("returns cwd when statSync throws", () => {
    expect(server.getWorkingDirectory(path.join(__dirname, "does-not-exist-xyz"))).toBe(process.cwd());
  });
});

describe("isLocalAddress", () => {
  it("recognizes loopback addresses", () => {
    expect(server.isLocalAddress("127.0.0.1")).toBe(true);
    expect(server.isLocalAddress("::1")).toBe(true);
    expect(server.isLocalAddress("::ffff:127.0.0.1")).toBe(true);
    expect(server.isLocalAddress("10.0.0.5")).toBe(false);
  });
});

describe("isSessionRunning", () => {
  it("checks the terminal and exited flags", () => {
    expect(server.isSessionRunning(null)).toBe(false);
    expect(server.isSessionRunning({ terminal: null })).toBe(false);
    expect(server.isSessionRunning({ terminal: {}, exited: true })).toBe(false);
    expect(server.isSessionRunning({ terminal: {}, exited: false })).toBe(true);
  });
});

describe("toSessionSummary", () => {
  it("projects the public session fields", () => {
    const summary = server.toSessionSummary({
      cols: 80,
      cwd: "/tmp",
      id: "id1",
      terminal: { pid: 4242 },
      rows: 24,
      shell: "PowerShell 7",
      startedAt: "2020-01-01",
      title: "Shell"
    });
    expect(summary).toEqual({
      cols: 80,
      cwd: "/tmp",
      id: "id1",
      pid: 4242,
      rows: 24,
      shell: "PowerShell 7",
      startedAt: "2020-01-01",
      title: "Shell"
    });
  });
});

describe("sendJsonResponse", () => {
  it("writes a JSON body with no-store", () => {
    const res = mockResponse();
    server.sendJsonResponse(res, 200, { ok: true });
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toContain("application/json");
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });
});

describe("serveStaticFile", () => {
  it("serves an existing asset", async () => {
    const res = mockResponse();
    server.serveStaticFile("/index.html", res, false);
    await vi.waitFor(() => expect(res.ended).toBe(true));
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toContain("text/html");
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("omits the body for HEAD requests", async () => {
    const res = mockResponse();
    server.serveStaticFile("/", res, true);
    await vi.waitFor(() => expect(res.ended).toBe(true));
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeUndefined();
  });

  it("returns 400 for malformed encoding", () => {
    const res = mockResponse();
    server.serveStaticFile("/%E0%A4%A", res, false);
    expect(res.statusCode).toBe(400);
  });

  it("returns 403 for path traversal", () => {
    const res = mockResponse();
    server.serveStaticFile("/../server.js", res, false);
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for a missing file", async () => {
    const res = mockResponse();
    server.serveStaticFile("/nope.js", res, false);
    await vi.waitFor(() => expect(res.ended).toBe(true));
    expect(res.statusCode).toBe(404);
  });

  it("returns 500 for non-ENOENT read errors", async () => {
    vi.spyOn(fs, "readFile").mockImplementation((file, cb) => cb(Object.assign(new Error("boom"), { code: "EACCES" })));
    const res = mockResponse();
    server.serveStaticFile("/index.html", res, false);
    await vi.waitFor(() => expect(res.ended).toBe(true));
    expect(res.statusCode).toBe(500);
  });

  it("uses an octet-stream fallback for unknown extensions", async () => {
    vi.spyOn(fs, "readFile").mockImplementation((file, cb) => cb(null, Buffer.from("data")));
    const res = mockResponse();
    server.serveStaticFile("/file.bin", res, false);
    await vi.waitFor(() => expect(res.ended).toBe(true));
    expect(res.headers["Content-Type"]).toBe("application/octet-stream");
  });
});

describe("readFrames", () => {
  it("routes a text frame to the message handler", () => {
    const client = fakeClient();
    server.readFrames(client, maskFrame(JSON.stringify({ type: "list" })));
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "sessions" }));
  });

  it("decodes a 16-bit length frame", () => {
    const client = fakeClient();
    const big = JSON.stringify({ type: "unknown", pad: "x".repeat(200) });
    server.readFrames(client, maskFrame(big));
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
  });

  it("decodes a 64-bit length frame", () => {
    const client = fakeClient();
    const huge = JSON.stringify({ type: "list", pad: "y".repeat(70000) });
    server.readFrames(client, maskFrame(huge));
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "sessions" }));
  });

  it("waits for the rest of a 16-bit header", () => {
    const client = fakeClient();
    server.readFrames(client, Buffer.from([0x81, 0x80 | 126]));
    expect(client.socket.end).not.toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
  });

  it("waits for the rest of a 64-bit header", () => {
    const client = fakeClient();
    server.readFrames(client, Buffer.from([0x81, 0x80 | 127, 0, 0]));
    expect(client.socket.end).not.toHaveBeenCalled();
  });

  it("closes when a frame exceeds the maximum size", () => {
    const client = fakeClient();
    const header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(server.maxMessageSize + 1), 2);
    server.readFrames(client, header);
    expect(client.socket.end).toHaveBeenCalled();
  });

  it("closes when a frame is not masked", () => {
    const client = fakeClient();
    server.readFrames(client, Buffer.from([0x81, 5]));
    expect(client.socket.end).toHaveBeenCalled();
  });

  it("waits for an incomplete payload", () => {
    const client = fakeClient();
    server.readFrames(client, Buffer.from([0x81, 0x85, 1, 2, 3, 4, 9]));
    expect(client.send).not.toHaveBeenCalled();
  });

  it("closes on a close opcode", () => {
    const client = fakeClient();
    server.readFrames(client, maskFrame("", 0x8));
    expect(client.socket.end).toHaveBeenCalled();
  });

  it("replies with pong on a ping opcode", () => {
    const client = fakeClient();
    server.readFrames(client, maskFrame("ping", 0x9));
    expect(client.socket.write).toHaveBeenCalled();
  });

  it("ignores non-text data frames", () => {
    const client = fakeClient();
    server.readFrames(client, maskFrame("binary-data", 0x2));
    expect(client.send).not.toHaveBeenCalled();
    expect(client.socket.end).not.toHaveBeenCalled();
    expect(client.socket.write).not.toHaveBeenCalled();
  });
});

describe("handleClientMessage", () => {
  let client;
  beforeEach(() => {
    client = fakeClient();
  });

  it("reports invalid JSON", () => {
    server.handleClientMessage(client, "{not json");
    expect(client.send).toHaveBeenCalledWith({ type: "error", message: "Invalid bridge message." });
  });

  it("lists sessions", () => {
    server.handleClientMessage(client, JSON.stringify({ type: "list" }));
    expect(client.send).toHaveBeenCalledWith({ type: "sessions", sessions: [] });
  });

  it("rejects unknown message types", () => {
    server.handleClientMessage(client, JSON.stringify({ type: "frobnicate" }));
    expect(client.send).toHaveBeenCalledWith({
      type: "error",
      message: "Unsupported message type: frobnicate"
    });
  });

  it("dispatches input, resize, kill, and killAll without throwing", () => {
    expect(() => {
      server.handleClientMessage(client, JSON.stringify({ type: "input", id: "x", data: "ls" }));
      server.handleClientMessage(client, JSON.stringify({ type: "resize", id: "x", cols: 10, rows: 5 }));
      server.handleClientMessage(client, JSON.stringify({ type: "kill", id: "x" }));
      server.handleClientMessage(client, JSON.stringify({ type: "killAll" }));
    }).not.toThrow();
  });
});

describe("broadcast", () => {
  it("sends to every connected client", () => {
    const a = fakeClient();
    const b = fakeClient();
    server.clients.add(a);
    server.clients.add(b);
    server.broadcast({ type: "ping" });
    expect(a.send).toHaveBeenCalledWith({ type: "ping" });
    expect(b.send).toHaveBeenCalledWith({ type: "ping" });
  });
});
