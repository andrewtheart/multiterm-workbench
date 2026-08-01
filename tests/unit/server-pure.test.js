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

const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const server = require("../../server.js");

function mockResponse() {
  return {
    statusCode: null,
    headers: null,
    body: undefined,
    ended: false,
    headersSent: false,
    setHeader(name, value) {
      if (!this.headers) this.headers = {};
      this.headers[name] = value;
    },
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = { ...(this.headers || {}), ...(headers || {}) };
      this.headersSent = true;
      return this;
    },
    end(body) {
      this.body = body;
      this.ended = true;
      return this;
    }
  };
}

function mockRequest({
  method = "GET",
  url = "/api/update-preferences",
  headers = { "x-multiterm-request": "Renderer" },
  remoteAddress = "127.0.0.1"
} = {}) {
  const request = new EventEmitter();
  request.method = method;
  request.url = url;
  request.headers = headers;
  request.socket = { remoteAddress };
  request.setEncoding = vi.fn();
  request.resume = vi.fn();
  return request;
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

describe("isAllowedWebSocketOrigin", () => {
  it("allows requests with no Origin (non-browser clients)", () => {
    expect(server.isAllowedWebSocketOrigin(undefined)).toBe(true);
    expect(server.isAllowedWebSocketOrigin(null)).toBe(true);
    expect(server.isAllowedWebSocketOrigin("")).toBe(true);
  });

  it("allows only exact loopback-literal hosts and ports", () => {
    expect(server.isAllowedWebSocketOrigin("http://127.0.0.1:3177", "127.0.0.1:3177")).toBe(true);
    expect(server.isAllowedWebSocketOrigin("http://localhost:3199", "localhost:3199")).toBe(true);
    expect(server.isAllowedWebSocketOrigin("https://127.0.0.1:4443", "127.0.0.1:4443")).toBe(true);
    expect(server.isAllowedWebSocketOrigin("http://[::1]:3177", "[::1]:3177")).toBe(true);
  });

  it("rejects cross-site, rebinding, and non-http origins", () => {
    // A hostile website.
    expect(server.isAllowedWebSocketOrigin("https://evil.example", "127.0.0.1:3177")).toBe(false);
    // DNS-rebinding: a name that resolves to 127.0.0.1 still carries its own host.
    expect(server.isAllowedWebSocketOrigin("http://attacker.local:3177", "127.0.0.1:3177")).toBe(false);
    // A different loopback app is still cross-origin and must not control shells.
    expect(server.isAllowedWebSocketOrigin("http://localhost:3000", "localhost:3177")).toBe(false);
    expect(server.isAllowedWebSocketOrigin("http://localhost:3177", "127.0.0.1:3177")).toBe(false);
    expect(server.isAllowedWebSocketOrigin("http://localhost:3177", undefined)).toBe(false);
    // Non-http(s) schemes.
    expect(server.isAllowedWebSocketOrigin("file://127.0.0.1", "127.0.0.1")).toBe(false);
    expect(server.isAllowedWebSocketOrigin("ftp://localhost", "localhost")).toBe(false);
    // Unparseable Origin header.
    expect(server.isAllowedWebSocketOrigin("not a url", "localhost:3177")).toBe(false);
  });
});

describe("isSessionRunning", () => {
  it("checks the terminal and exited flags", () => {
    expect(server.isSessionRunning(null)).toBe(false);
    expect(server.isSessionRunning({ terminal: null })).toBe(false);
    expect(server.isSessionRunning({ terminal: {}, exited: true })).toBe(false);
    expect(server.isSessionRunning({ terminal: {}, exited: false })).toBe(true);
  });

  it("treats a killed session as dead before onExit arrives", () => {
    expect(server.isSessionRunning({ terminal: {}, exited: false, killed: true })).toBe(false);
    expect(server.isSessionRunning({ terminal: {}, exited: false, killed: false })).toBe(true);
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
      title: "Shell",
      tmux: null
    });
    expect(summary).toEqual({
      cols: 80,
      cwd: "/tmp",
      id: "id1",
      pid: 4242,
      rows: 24,
      shell: "PowerShell 7",
      startedAt: "2020-01-01",
      title: "Shell",
      tmux: null
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

describe("setSecurityHeaders", () => {
  it("applies a restrictive browser policy without allowing inline scripts", () => {
    const res = mockResponse();
    server.setSecurityHeaders(res);
    expect(res.headers["Content-Security-Policy"]).toContain("script-src 'self'");
    expect(res.headers["Content-Security-Policy"]).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(res.headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(res.headers["Permissions-Policy"]).toContain("camera=()");
  });

  it("does not mutate a response after its headers were sent", () => {
    const res = mockResponse();
    res.headersSent = true;
    server.setSecurityHeaders(res);
    expect(res.headers).toBeNull();
  });

  it("allows only the Help document policy to opt into same-origin framing", () => {
    const res = mockResponse();
    server.setSecurityHeaders(res, { allowSameOriginFrame: true });
    expect(res.headers["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
    expect(res.headers["Content-Security-Policy"]).not.toContain("frame-ancestors 'none'");
    expect(res.headers["X-Frame-Options"]).toBe("SAMEORIGIN");
  });
});

describe("persistent update preferences", () => {
  it("normalizes, atomically replaces, and reloads a per-user choice", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-preferences-"));
    const file = path.join(directory, "update-preferences.json");
    try {
      await expect(server.readUpdatePreferences(file)).resolves.toBeNull();
      await expect(server.writeUpdatePreferences({
        configured: true,
        enabled: true,
        intervalHours: 11.6
      }, file)).resolves.toEqual({
        configured: true,
        enabled: true,
        intervalHours: 12
      });
      await expect(server.writeUpdatePreferences({
        configured: false,
        enabled: true,
        intervalHours: 999
      }, file)).resolves.toEqual({
        configured: false,
        enabled: false,
        intervalHours: 168
      });
      await expect(server.readUpdatePreferences(file)).resolves.toEqual({
        configured: false,
        enabled: false,
        intervalHours: 168
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed preference data", () => {
    expect(server.isLocalAddress("127.0.0.1")).toBe(true);
    expect(server.isLocalAddress("203.0.113.5")).toBe(false);
    expect(() => server.normalizeUpdatePreferences(null)).toThrow("must be an object");
    expect(() => server.normalizeUpdatePreferences([])).toThrow("must be an object");
    expect(() => server.normalizeUpdatePreferences({
      configured: "yes",
      enabled: true,
      intervalHours: 6
    })).toThrow("must be boolean");
    expect(() => server.normalizeUpdatePreferences({
      configured: true,
      enabled: false,
      intervalHours: "never"
    })).toThrow("must be a number");
  });

  it("resolves override, Windows, and portable default paths", () => {
    const originalOverride = process.env.MULTITERM_PREFERENCES_PATH;
    const originalLocalData = process.env.LOCALAPPDATA;
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    try {
      process.env.MULTITERM_PREFERENCES_PATH = path.join("relative", "preferences.json");
      expect(server.getUpdatePreferencesPath()).toBe(path.resolve("relative", "preferences.json"));

      delete process.env.MULTITERM_PREFERENCES_PATH;
      process.env.LOCALAPPDATA = "C:\\LocalData";
      expect(server.getUpdatePreferencesPath()).toBe(path.join("C:\\LocalData", "MultiTerm", "update-preferences.json"));

      delete process.env.LOCALAPPDATA;
      Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
      expect(server.getUpdatePreferencesPath()).toContain(path.join("AppData", "Local", "MultiTerm"));

      Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
      expect(server.getUpdatePreferencesPath()).toContain(path.join(".local", "share", "MultiTerm"));
    } finally {
      if (originalOverride === undefined) delete process.env.MULTITERM_PREFERENCES_PATH;
      else process.env.MULTITERM_PREFERENCES_PATH = originalOverride;
      if (originalLocalData === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = originalLocalData;
      Object.defineProperty(process, "platform", platform);
    }
  });

  it("surfaces read and atomic-write failures and cleans temporary files", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-preferences-errors-"));
    const file = path.join(directory, "update-preferences.json");
    try {
      vi.spyOn(fs.promises, "readFile").mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
      await expect(server.readUpdatePreferences(file)).rejects.toThrow("denied");

      vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(new Error("rename failed"));
      await expect(server.writeUpdatePreferences({
        configured: true,
        enabled: true,
        intervalHours: 6
      }, file)).rejects.toThrow("rename failed");

      vi.spyOn(fs.promises, "rename").mockRejectedValueOnce(new Error("rename failed again"));
      vi.spyOn(fs.promises, "rm").mockRejectedValueOnce(new Error("cleanup failed"));
      await expect(server.writeUpdatePreferences({
        configured: true,
        enabled: false,
        intervalHours: 6
      }, file)).rejects.toThrow("rename failed again");
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("serves authenticated reads and writes through the HTTP route", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-preferences-api-"));
    const file = path.join(directory, "update-preferences.json");
    const originalOverride = process.env.MULTITERM_PREFERENCES_PATH;
    process.env.MULTITERM_PREFERENCES_PATH = file;
    try {
      const getResponse = mockResponse();
      server.server.emit("request", mockRequest(), getResponse);
      await vi.waitFor(() => expect(getResponse.ended).toBe(true));
      expect(JSON.parse(getResponse.body)).toEqual({ ok: true, preferences: null });

      const postRequest = mockRequest({ method: "POST", headers: {
        "x-multiterm-request": "Renderer",
        "content-length": "57"
      } });
      const postResponse = mockResponse();
      server.handleUpdatePreferencesRequest(postRequest, postResponse);
      postRequest.emit("data", '{"configured":true,"enabled":true,"intervalHours":12}');
      postRequest.emit("end");
      await vi.waitFor(() => expect(postResponse.ended).toBe(true));
      expect(JSON.parse(postResponse.body).preferences).toEqual({
        configured: true,
        enabled: true,
        intervalHours: 12
      });
    } finally {
      if (originalOverride === undefined) delete process.env.MULTITERM_PREFERENCES_PATH;
      else process.env.MULTITERM_PREFERENCES_PATH = originalOverride;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects unauthorized, unsupported, oversized, and malformed requests", async () => {
    for (const request of [
      mockRequest({ remoteAddress: "203.0.113.5" }),
      mockRequest({ headers: {} })
    ]) {
      const response = mockResponse();
      server.handleUpdatePreferencesRequest(request, response);
      expect(response.statusCode).toBe(403);
    }

    const unsupported = mockRequest({ method: "DELETE" });
    const unsupportedResponse = mockResponse();
    server.handleUpdatePreferencesRequest(unsupported, unsupportedResponse);
    expect(unsupportedResponse.statusCode).toBe(405);
    expect(unsupportedResponse.headers.Allow).toBe("GET, POST");

    const declaredLarge = mockRequest({ method: "POST", headers: {
      "x-multiterm-request": "Renderer",
      "content-length": String(server.updatePreferencesMaxSize + 1)
    } });
    const declaredLargeResponse = mockResponse();
    server.handleUpdatePreferencesRequest(declaredLarge, declaredLargeResponse);
    expect(declaredLarge.resume).toHaveBeenCalled();
    expect(declaredLargeResponse.statusCode).toBe(413);

    const streamedLarge = mockRequest({ method: "POST" });
    const streamedLargeResponse = mockResponse();
    server.handleUpdatePreferencesRequest(streamedLarge, streamedLargeResponse);
    streamedLarge.emit("data", "x".repeat(server.updatePreferencesMaxSize + 1));
    streamedLarge.emit("data", "ignored");
    streamedLarge.emit("end");
    expect(streamedLargeResponse.statusCode).toBe(413);

    const malformed = mockRequest({ method: "POST" });
    const malformedResponse = mockResponse();
    server.handleUpdatePreferencesRequest(malformed, malformedResponse);
    malformed.emit("data", "{");
    malformed.emit("end");
    expect(malformedResponse.statusCode).toBe(400);
  });

  it("reports request, validation, read, and write errors", async () => {
    const requestError = mockRequest({ method: "POST" });
    const requestErrorResponse = mockResponse();
    server.handleUpdatePreferencesRequest(requestError, requestErrorResponse);
    requestError.emit("error", new Error("request failed"));
    expect(requestErrorResponse.statusCode).toBe(400);

    const stringRequestError = mockRequest({ method: "POST" });
    const stringRequestErrorResponse = mockResponse();
    server.handleUpdatePreferencesRequest(stringRequestError, stringRequestErrorResponse);
    stringRequestError.emit("error", "request failed");
    expect(JSON.parse(stringRequestErrorResponse.body).error).toBe("request failed");

    const alreadySent = mockRequest({ method: "POST" });
    const alreadySentResponse = mockResponse();
    alreadySentResponse.headersSent = true;
    server.handleUpdatePreferencesRequest(alreadySent, alreadySentResponse);
    alreadySent.emit("error", new Error("ignored"));
    expect(alreadySentResponse.ended).toBe(false);

    const invalid = mockRequest({ method: "POST" });
    const invalidResponse = mockResponse();
    server.handleUpdatePreferencesRequest(invalid, invalidResponse);
    invalid.emit("data", '{"configured":"yes","enabled":true,"intervalHours":6}');
    invalid.emit("end");
    await vi.waitFor(() => expect(invalidResponse.ended).toBe(true));
    expect(invalidResponse.statusCode).toBe(400);

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-preferences-api-errors-"));
    const originalOverride = process.env.MULTITERM_PREFERENCES_PATH;
    try {
      vi.spyOn(fs.promises, "readFile").mockRejectedValueOnce("read failed");
      const stringReadResponse = mockResponse();
      server.handleUpdatePreferencesRequest(mockRequest(), stringReadResponse);
      await vi.waitFor(() => expect(stringReadResponse.ended).toBe(true));
      expect(JSON.parse(stringReadResponse.body).error).toBe("read failed");
      vi.restoreAllMocks();

      process.env.MULTITERM_PREFERENCES_PATH = directory;
      const readResponse = mockResponse();
      server.handleUpdatePreferencesRequest(mockRequest(), readResponse);
      await vi.waitFor(() => expect(readResponse.ended).toBe(true));
      expect(readResponse.statusCode).toBe(500);

      const writeRequest = mockRequest({ method: "POST" });
      const writeResponse = mockResponse();
      vi.spyOn(fs.promises, "mkdir").mockRejectedValueOnce("write failed");
      server.handleUpdatePreferencesRequest(writeRequest, writeResponse);
      writeRequest.emit("data", '{"configured":true,"enabled":true,"intervalHours":6}');
      writeRequest.emit("end");
      await vi.waitFor(() => expect(writeResponse.ended).toBe(true));
      expect(writeResponse.statusCode).toBe(500);
      expect(JSON.parse(writeResponse.body).error).toBe("write failed");
    } finally {
      if (originalOverride === undefined) delete process.env.MULTITERM_PREFERENCES_PATH;
      else process.env.MULTITERM_PREFERENCES_PATH = originalOverride;
      vi.restoreAllMocks();
      fs.rmSync(directory, { recursive: true, force: true });
    }
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
