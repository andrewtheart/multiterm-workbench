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
const server = require("../../src/server.js");

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
  // Every real request carries a Host, and the server rejects those that do not
  // name a loopback address.
  request.headers = { host: "127.0.0.1:3177", ...headers };
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
  server.__resetConfigOwnership();
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
    // A Host header that is itself not loopback.
    expect(server.isAllowedWebSocketOrigin("http://127.0.0.1:3177", "evil.example:3177")).toBe(false);
  });

  it("matches a default-port Origin against a portless Host", () => {
    expect(server.isAllowedWebSocketOrigin("http://localhost", "localhost")).toBe(true);
    expect(server.isAllowedWebSocketOrigin("https://localhost", "localhost")).toBe(false);
  });
});

describe("isAllowedHttpHost", () => {
  it("accepts loopback literals with or without a port", () => {
    expect(server.isAllowedHttpHost("127.0.0.1:3177")).toBe(true);
    expect(server.isAllowedHttpHost("localhost:3199")).toBe(true);
    expect(server.isAllowedHttpHost("[::1]:3177")).toBe(true);
    expect(server.isAllowedHttpHost("localhost")).toBe(true);
    // A trailing slash is still a bare authority.
    expect(server.isAllowedHttpHost("127.0.0.1:3177/")).toBe(true);
  });

  it("rejects rebinding hosts and headers carrying extra URL structure", () => {
    // The whole point: a rebound request arrives under the attacker's own name.
    expect(server.isAllowedHttpHost("multiterm.attacker.example:3177")).toBe(false);
    expect(server.isAllowedHttpHost("127.0.0.1.attacker.example")).toBe(false);
    expect(server.isAllowedHttpHost(undefined)).toBe(false);
    expect(server.isAllowedHttpHost("")).toBe(false);
    expect(server.isAllowedHttpHost(42)).toBe(false);
    expect(server.isAllowedHttpHost("not a host")).toBe(false);
    expect(server.isAllowedHttpHost("user:secret@127.0.0.1:3177")).toBe(false);
    expect(server.isAllowedHttpHost("127.0.0.1:3177/evil")).toBe(false);
    expect(server.isAllowedHttpHost("127.0.0.1:3177?q=1")).toBe(false);
    expect(server.isAllowedHttpHost("127.0.0.1:3177#frag")).toBe(false);
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
      outputSeq: 0,
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

describe("watchdog bridge control", () => {
  it("accepts only local launcher shutdown requests", () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    const accepted = mockResponse();
    expect(server.handleShutdownRequest(mockRequest({
      method: "POST",
      url: "/shutdown",
      headers: { "x-multiterm-request": "Launcher" }
    }), accepted, stop)).toBe(true);
    expect(JSON.parse(accepted.body)).toMatchObject({ ok: true, stopping: true });
    vi.advanceTimersByTime(150);
    expect(stop).toHaveBeenCalledOnce();

    const remote = mockResponse();
    expect(server.handleShutdownRequest(mockRequest({
      method: "POST",
      remoteAddress: "203.0.113.5",
      headers: { "x-multiterm-request": "Launcher" }
    }), remote, stop)).toBe(false);
    expect(remote.statusCode).toBe(403);

    const navigated = mockResponse();
    expect(server.handleShutdownRequest(mockRequest({ method: "GET", url: "/shutdown" }), navigated, stop)).toBe(false);
    expect(navigated.statusCode).toBe(405);
  });

  it("accepts only local launcher watchdog suppression requests", () => {
    const accepted = mockResponse();
    expect(server.handleWatchdogKeepRequest(mockRequest({
      method: "POST",
      url: "/watchdog/keep",
      headers: { "x-multiterm-request": "Launcher" }
    }), accepted)).toBe(true);
    expect(JSON.parse(accepted.body)).toEqual({ ok: true, watchdogSuppressed: true });

    const remote = mockResponse();
    expect(server.handleWatchdogKeepRequest(mockRequest({
      method: "POST",
      remoteAddress: "203.0.113.5",
      headers: { "x-multiterm-request": "Launcher" }
    }), remote)).toBe(false);
    expect(remote.statusCode).toBe(403);

    const navigated = mockResponse();
    expect(server.handleWatchdogKeepRequest(mockRequest({ method: "GET", url: "/watchdog/keep" }), navigated)).toBe(false);
    expect(navigated.statusCode).toBe(405);
  });

  it("writes and removes a per-user instance record", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-instance-"));
    const original = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    try {
      const filePath = server.registerInstance("127.0.0.1", 45678);
      const record = JSON.parse(fs.readFileSync(filePath, "utf8"));
      expect(record).toMatchObject({
        app: "MultiTerm Workbench",
        bridgeType: "electron",
        pid: process.pid,
        port: 45678,
        url: "http://127.0.0.1:45678/"
      });
      server.unregisterInstance();
      expect(fs.existsSync(filePath)).toBe(false);
    } finally {
      if (original === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = original;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips instance registration without app data and tolerates redundant cleanup", () => {
    const original = process.env.LOCALAPPDATA;
    delete process.env.LOCALAPPDATA;
    try {
      expect(server.getInstanceDirectory()).toBeNull();
      expect(server.registerInstance("127.0.0.1", 45678)).toBeNull();
      expect(() => server.unregisterInstance()).not.toThrow();
    } finally {
      if (original === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = original;
    }
  });

  it("warns on instance registration and cleanup failures but ignores a missing record", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-instance-errors-"));
    const original = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const mkdir = vi.spyOn(fs, "mkdirSync").mockImplementationOnce(() => {
        throw new Error("registration denied");
      });
      expect(server.registerInstance("127.0.0.1", 45678)).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("registration denied"));
      mkdir.mockRestore();

      expect(server.registerInstance("127.0.0.1", 45678)).toEqual(expect.any(String));
      const unlink = vi.spyOn(fs, "unlinkSync").mockImplementationOnce(() => {
        const error = new Error("cleanup denied");
        error.code = "EACCES";
        throw error;
      });
      server.unregisterInstance();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("cleanup denied"));

      expect(server.registerInstance("127.0.0.1", 45678)).toEqual(expect.any(String));
      unlink.mockImplementationOnce(() => {
        const error = new Error("already gone");
        error.code = "ENOENT";
        throw error;
      });
      const warningCount = warn.mock.calls.length;
      server.unregisterInstance();
      expect(warn).toHaveBeenCalledTimes(warningCount);
    } finally {
      if (original === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = original;
      vi.restoreAllMocks();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("claims the lowest free bridge id, reclaims stale records, and handles cleanup failures", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-bridge-id-"));
    const original = process.env.LOCALAPPDATA;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      delete process.env.LOCALAPPDATA;
      expect(server.claimBridgeIdentifier()).toBeNull();
      expect(() => server.releaseBridgeIdentifier()).not.toThrow();

      process.env.LOCALAPPDATA = root;
      const directory = path.join(root, "MultiTerm", "BridgeIds");
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "BRIDGE-001.json"), "not json");
      expect(server.claimBridgeIdentifier()).toBe("BRIDGE-001");

      const unlink = vi.spyOn(fs, "unlinkSync").mockImplementationOnce(() => {
        throw Object.assign(new Error("release denied"), { code: "EACCES" });
      });
      server.releaseBridgeIdentifier();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("release denied"));
      unlink.mockRestore();

      fs.writeFileSync(path.join(directory, "BRIDGE-001.json"), JSON.stringify({ pid: process.pid }));
      expect(server.claimBridgeIdentifier()).toBe("BRIDGE-002");
      const claimedPath = path.join(directory, "BRIDGE-002.json");
      fs.rmSync(claimedPath);
      expect(() => server.releaseBridgeIdentifier()).not.toThrow();
    } finally {
      server.releaseBridgeIdentifier();
      if (original === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = original;
      vi.restoreAllMocks();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails bridge id setup and assistant-session writes without leaking exceptions", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-bridge-id-errors-"));
    const original = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const mkdir = vi.spyOn(fs, "mkdirSync").mockImplementationOnce(() => { throw new Error("id directory denied"); });
      expect(server.claimBridgeIdentifier()).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("id directory denied"));
      mkdir.mockRestore();

      expect(server.claimBridgeIdentifier()).toBe("BRIDGE-001");
      const write = vi.spyOn(fs, "writeFileSync").mockImplementationOnce(() => { throw new Error("session write denied"); });
      server.handleClientMessage(fakeClient(), JSON.stringify({ type: "saveAssistantSessions", sessions: [] }));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("session write denied"));
      write.mockRestore();
    } finally {
      server.releaseBridgeIdentifier();
      if (original === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = original;
      vi.restoreAllMocks();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("handles bridge id claim write failures, EPERM owners, unlink failures, and exhaustion", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-bridge-id-edges-"));
    const original = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    const directory = path.join(root, "MultiTerm", "BridgeIds");
    fs.mkdirSync(directory, { recursive: true });
    try {
      const write = vi.spyOn(fs, "writeSync").mockImplementationOnce(() => { throw new Error("claim write failed"); });
      expect(server.claimBridgeIdentifier()).toBe("BRIDGE-001");
      server.releaseBridgeIdentifier();
      write.mockRestore();

      fs.writeFileSync(path.join(directory, "BRIDGE-001.json"), JSON.stringify({ pid: 12345 }));
      const kill = vi.spyOn(process, "kill").mockImplementation(() => {
        throw Object.assign(new Error("not permitted"), { code: "EPERM" });
      });
      expect(server.claimBridgeIdentifier()).toBe("BRIDGE-002");
      server.releaseBridgeIdentifier();
      kill.mockRestore();

      fs.writeFileSync(path.join(directory, "BRIDGE-001.json"), JSON.stringify({ pid: -1 }));
      const unlink = vi.spyOn(fs, "unlinkSync").mockImplementationOnce(() => { throw new Error("stale unlink failed"); });
      expect(server.claimBridgeIdentifier()).toBe("BRIDGE-002");
      server.releaseBridgeIdentifier();
      unlink.mockRestore();

      vi.spyOn(fs, "openSync").mockImplementation(() => { throw new Error("occupied"); });
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ pid: process.pid }));
      vi.spyOn(process, "kill").mockImplementation(() => {});
      expect(server.claimBridgeIdentifier()).toBeNull();
    } finally {
      server.releaseBridgeIdentifier();
      if (original === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = original;
      vi.restoreAllMocks();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("dispatches shutdown and watchdog paths through the HTTP request listener", () => {
    const shutdownResponse = mockResponse();
    server.server.emit("request", mockRequest({ method: "GET", url: "/shutdown" }), shutdownResponse);
    expect(shutdownResponse.statusCode).toBe(405);
    expect(shutdownResponse.headers.Allow).toBe("POST");

    const watchdogResponse = mockResponse();
    server.server.emit("request", mockRequest({ method: "GET", url: "/watchdog/keep" }), watchdogResponse);
    expect(watchdogResponse.statusCode).toBe(405);
    expect(watchdogResponse.headers.Allow).toBe("POST");
  });

  it("routes watchdog state changes through bridge messages", () => {
    const client = fakeClient();
    server.handleClientMessage(client, JSON.stringify({ type: "watchdogKeepBridge" }));
    const kept = mockResponse();
    server.server.emit("request", mockRequest({ url: "/health" }), kept);
    expect(JSON.parse(kept.body).watchdogSuppressed).toBe(true);

    server.handleClientMessage(client, JSON.stringify({ type: "rendererPresence" }));
    const resumed = mockResponse();
    server.server.emit("request", mockRequest({ url: "/health" }), resumed);
    expect(JSON.parse(resumed.body).watchdogSuppressed).toBe(false);
  });

  it("acknowledges renderer heartbeats", () => {
    const client = fakeClient();
    server.handleClientMessage(client, JSON.stringify({ type: "heartbeat", nonce: "renderer-42" }));
    expect(client.send).toHaveBeenCalledWith({ type: "heartbeat", nonce: "renderer-42" });
  });

  it("returns the bridge-terminal focus limitation through the protocol", () => {
    const client = fakeClient();
    server.handleClientMessage(client, JSON.stringify({ type: "focusBridgeTerminal", requestId: "focus" }));
    expect(client.send).toHaveBeenCalledWith({
      type: "bridgeTerminalFocus",
      requestId: "focus",
      ok: false,
      reason: "This bridge does not run in its own terminal window."
    });
  });
});

describe("open-folder request callbacks", () => {
  it("rejects streamed overflow without relying on Content-Length", () => {
    const request = mockRequest({
      method: "POST",
      url: "/open-folder",
      headers: { "x-multiterm-request": "Explorer" }
    });
    const response = mockResponse();
    server.handleOpenFolderRequest(request, response);

    request.emit("data", "x".repeat(server.openFolderMaxSize + 1));
    request.emit("data", "ignored after overflow");
    request.emit("end");

    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body)).toEqual({ ok: false, error: "Request too large" });
  });

  it("reports request stream errors only before a response has started", () => {
    const request = mockRequest({
      method: "POST",
      url: "/open-folder",
      headers: { "x-multiterm-request": "Explorer" }
    });
    const response = mockResponse();
    server.handleOpenFolderRequest(request, response);
    request.emit("error", new Error("stream failed"));
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe("stream failed");

    const lateRequest = mockRequest({
      method: "POST",
      url: "/open-folder",
      headers: { "x-multiterm-request": "Explorer" }
    });
    const lateResponse = mockResponse();
    lateResponse.headersSent = true;
    server.handleOpenFolderRequest(lateRequest, lateResponse);
    lateRequest.emit("error", "late failure");
    expect(lateResponse.ended).toBe(false);
  });

  it("prefers a visible renderer and otherwise queues a normalized folder", () => {
    const hidden = { renderer: true, rendererVisible: false, rendererActiveAt: 20, send: vi.fn() };
    const visible = { renderer: true, rendererVisible: true, rendererActiveAt: 10, send: vi.fn() };
    const recentVisible = { renderer: true, rendererVisible: true, rendererActiveAt: 40, send: vi.fn() };
    const relay = { renderer: false, rendererVisible: true, rendererActiveAt: 30, send: vi.fn() };
    server.clients.add(hidden);
    server.clients.add(relay);
    server.clients.add(visible);
    server.clients.add(recentVisible);

    expect(server.dispatchOpenFolder(process.cwd())).toBe(true);
    expect(recentVisible.send).toHaveBeenCalledWith({ type: "openFolder", path: process.cwd() });
    expect(hidden.send).not.toHaveBeenCalled();
    expect(relay.send).not.toHaveBeenCalled();
    expect(visible.send).not.toHaveBeenCalled();

    server.clients.clear();
    expect(server.dispatchOpenFolder(process.cwd())).toBe(false);
    expect(server.pendingOpenFolders.pop()).toBe(process.cwd());
    expect(server.normalizeOpenFolder(__filename)).toBeNull();
  });

  it("normalizes and routes structured terminal launches independently of folder-only requests", () => {
    const launch = server.normalizeOpenTerminal({
      path: process.cwd(),
      title: "Review",
      command: "Explain the diff",
      assistantType: "claude",
      assistantModel: "sonnet",
      assistantEffort: "high",
      assistantContext: "long_context"
    });
    expect(launch).toEqual({
      path: process.cwd(),
      title: "Review",
      command: "Explain the diff",
      assistantType: "claude",
      assistantModel: "sonnet",
      assistantEffort: "high",
      assistantContext: "long_context"
    });
    expect(server.externalLaunchHasOptions(launch)).toBe(true);

    const renderer = { renderer: true, rendererVisible: true, rendererActiveAt: 1, send: vi.fn() };
    server.clients.add(renderer);
    expect(server.dispatchOpenTerminal(launch)).toBe(true);
    expect(renderer.send).toHaveBeenCalledWith({ type: "openTerminal", ...launch });
    server.clients.clear();
    expect(server.dispatchOpenTerminal(launch)).toBe(false);
    expect(server.pendingOpenTerminals.pop()).toEqual(launch);

    expect(server.normalizeOpenTerminal({ path: __filename })).toBeNull();
    expect(server.normalizeOpenTerminal({ path: process.cwd(), command: "x".repeat(8193) })).toBeNull();
    expect(server.normalizeOpenTerminal({ path: process.cwd(), assistantType: "other" })).toMatchObject({
      assistantType: "",
      assistantEffort: "none",
      assistantContext: "default"
    });
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

  it("marks renderer clients for watchdog presence checks", () => {
    server.clients.add(client);
    expect(server.countRendererClients()).toBe(0);

    server.handleClientMessage(client, JSON.stringify({ type: "rendererPresence" }));

    expect(client.renderer).toBe(true);
    expect(server.countRendererClients()).toBe(1);
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

  // Output broadcasts dominate bridge traffic, so the frame is encoded once and
  // the same bytes are written to every socket that can take them.
  it("encodes one frame and reuses it across frame-capable clients", () => {
    const a = fakeClient();
    const b = fakeClient();
    a.sendFrame = vi.fn();
    b.sendFrame = vi.fn();
    server.clients.add(a);
    server.clients.add(b);

    server.broadcast({ type: "ping" });

    const expected = server.encodeFrame(JSON.stringify({ type: "ping" }));
    expect(a.sendFrame).toHaveBeenCalledWith(expected);
    // Same buffer object, not merely an equal one.
    expect(b.sendFrame.mock.calls[0][0]).toBe(a.sendFrame.mock.calls[0][0]);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("skips the excluded client and never encodes when nobody is left", () => {
    const only = fakeClient();
    only.sendFrame = vi.fn();
    server.clients.add(only);
    server.broadcast({ type: "ping" }, only);
    expect(only.sendFrame).not.toHaveBeenCalled();
    expect(only.send).not.toHaveBeenCalled();
  });
});

describe("output coalescing", () => {
  beforeEach(() => {
    server.setOutputCoalesceMs(server.OUTPUT_COALESCE_DEFAULT_MS);
  });

  afterEach(() => {
    server.setOutputCoalesceMs(server.OUTPUT_COALESCE_DEFAULT_MS);
    vi.useRealTimers();
  });

  it("clamps the requested window and falls back on nonsense", () => {
    expect(server.setOutputCoalesceMs(20)).toBe(20);
    expect(server.setOutputCoalesceMs(2.4)).toBe(2);
    expect(server.setOutputCoalesceMs(-5)).toBe(0);
    expect(server.setOutputCoalesceMs(9999)).toBe(server.OUTPUT_COALESCE_MAX_MS);
    expect(server.setOutputCoalesceMs("nope")).toBe(server.OUTPUT_COALESCE_DEFAULT_MS);
    expect(server.getOutputCoalesceMs()).toBe(server.OUTPUT_COALESCE_DEFAULT_MS);
  });

  it("clamps bridge heartbeat timeouts to the visible settings range", () => {
    expect(server.normalizeBridgeHeartbeatTimeoutSeconds(45)).toBe(45);
    expect(server.normalizeBridgeHeartbeatTimeoutSeconds(10.4)).toBe(10);
    expect(server.normalizeBridgeHeartbeatTimeoutSeconds(1)).toBe(server.BRIDGE_HEARTBEAT_TIMEOUT_MIN_SECONDS);
    expect(server.normalizeBridgeHeartbeatTimeoutSeconds(9999)).toBe(server.BRIDGE_HEARTBEAT_TIMEOUT_MAX_SECONDS);
    expect(server.normalizeBridgeHeartbeatTimeoutSeconds("nope")).toBe(server.BRIDGE_HEARTBEAT_TIMEOUT_DEFAULT_SECONDS);
  });

  it("sends straight through when batching is switched off", () => {
    const client = fakeClient();
    server.clients.add(client);
    server.setOutputCoalesceMs(0);
    expect(server.isOutputCoalesced()).toBe(false);

    const session = { id: "s1", pendingOutput: [], outputTimer: null, outputSeq: 0, replay: [], replayBytes: 0 };
    server.queueSessionOutput(session, "hi");

    expect(client.send).toHaveBeenCalledWith({ type: "output", id: "s1", stream: "pty", data: "hi", seq: 1 });
    expect(session.pendingOutput).toEqual([]);
  });

  it("sends ephemeral output only to the renderer that owns the session", () => {
    const owner = fakeClient();
    const other = fakeClient();
    server.clients.add(owner);
    server.clients.add(other);
    server.setOutputCoalesceMs(0);
    const session = {
      ephemeral: true,
      id: "private-probe",
      ownerClient: owner,
      pendingOutput: [],
      outputTimer: null,
      outputSeq: 0,
      replay: [],
      replayBytes: 0
    };

    server.queueSessionOutput(session, "private cwd response");

    expect(owner.send).toHaveBeenCalledWith({
      type: "output", id: "private-probe", stream: "pty", data: "private cwd response", seq: 1
    });
    expect(other.send).not.toHaveBeenCalled();
  });

  it("joins buffered chunks into a single frame on the flush timer", () => {
    vi.useFakeTimers();
    const client = fakeClient();
    server.clients.add(client);
    server.setOutputCoalesceMs(10);

    const session = { id: "s1", pendingOutput: [], outputTimer: null, outputSeq: 0, replay: [], replayBytes: 0 };
    server.queueSessionOutput(session, "a");
    server.queueSessionOutput(session, "b");
    // A second chunk must reuse the armed timer rather than starting another.
    expect(client.send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10);
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledWith({ type: "output", id: "s1", stream: "pty", data: "ab", seq: 1 });
    expect(session.outputTimer).toBeNull();
  });

  it("flushing an empty buffer sends nothing", () => {
    const client = fakeClient();
    server.clients.add(client);
    const session = { id: "s1", pendingOutput: [], outputTimer: null, outputSeq: 0, replay: [], replayBytes: 0 };
    server.flushSessionOutput(session);
    expect(client.send).not.toHaveBeenCalled();
  });

  it("applies a client's requested window and acknowledges it", () => {
    const client = fakeClient();
    server.applyClientConfig(client, {
      type: "config",
      outputCoalesceMs: 250,
      bridgeHeartbeatTimeoutSeconds: 9999
    });
    expect(server.getOutputCoalesceMs()).toBe(server.OUTPUT_COALESCE_MAX_MS);
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "config",
      outputCoalesceMs: server.OUTPUT_COALESCE_MAX_MS,
      bridgeHeartbeatTimeoutSeconds: server.BRIDGE_HEARTBEAT_TIMEOUT_MAX_SECONDS
    }));
  });

  it("is reachable over the wire as a config message", () => {
    const client = fakeClient();
    client.renderer = true;
    server.handleClientMessage(client, JSON.stringify({
      type: "config",
      outputCoalesceMs: 12,
      bridgeClientBacklogKb: 4096,
      bridgeReplayBufferKb: 512,
      bridgeHeartbeatSeconds: 30,
      bridgeHeartbeatTimeoutSeconds: 45,
      diagnosticRetentionDays: 14,
      diagnosticRotationMb: 10,
      diagnosticViewerEntries: 5000,
      copilotLogViewerEnabled: false,
      copilotLogInitialTailKb: 256,
      copilotLogEnabledAt: 0
    }));
    expect(server.getOutputCoalesceMs()).toBe(12);
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "config",
      outputCoalesceMs: 12,
      bridgeHeartbeatTimeoutSeconds: 45
    }));
  });
});
