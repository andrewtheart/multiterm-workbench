const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  RuntimeDiagnostics,
  defaultDiagnosticsDirectory,
  normalizeDiagnosticRecord,
  normalizeDiagnosticsConfig,
  redactDiagnosticValue
} = require("../../lib/runtime-diagnostics");
const server = require("../../src/server");

describe("runtime diagnostic storage", () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-diagnostics-"));
  });

  afterEach(() => {
    server.__resetConfigOwnership();
    server.clients.clear();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  it("stores JSONL records and rotates before crossing the configured size", () => {
    let now = Date.UTC(2026, 7, 12, 1, 2, 3);
    const diagnostics = new RuntimeDiagnostics({
      directory,
      now: () => now,
      retentionDays: 14,
      rotationMb: 0.00025,
      viewerEntries: 5000
    });

    diagnostics.append({ event: "first", message: "x".repeat(180), source: "test" });
    now += 1;
    diagnostics.append({ event: "second", message: "y".repeat(180), source: "test" });

    expect(fs.readdirSync(directory).filter((name) => name.endsWith(".jsonl"))).toHaveLength(2);
    expect(diagnostics.readRecent().map((entry) => entry.event)).toEqual(["first", "second"]);
  });

  it("prunes files older than retention while preserving current diagnostics", () => {
    const now = Date.UTC(2026, 7, 12, 12);
    const oldPath = path.join(directory, "runtime-old.jsonl");
    fs.writeFileSync(oldPath, '{"event":"old"}\n', "utf8");
    const oldTime = new Date(now - 3 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldPath, oldTime, oldTime);
    const diagnostics = new RuntimeDiagnostics({ directory, now: () => now, retentionDays: 2 });
    diagnostics.append({ event: "current" });

    expect(fs.existsSync(oldPath)).toBe(false);
    expect(diagnostics.readRecent().map((entry) => entry.event)).toEqual(["current"]);
  });

  it("treats zero as unlimited retention, disabled rotation, and an unlimited viewer", () => {
    const now = Date.UTC(2026, 7, 12, 12);
    const oldPath = path.join(directory, "runtime-old.jsonl");
    fs.writeFileSync(oldPath, '{"event":"old"}\nnot-json\n', "utf8");
    const oldTime = new Date(now - 365 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldPath, oldTime, oldTime);
    const diagnostics = new RuntimeDiagnostics({
      directory,
      now: () => now,
      retentionDays: 0,
      rotationMb: 0,
      viewerEntries: 0
    });

    for (let index = 0; index < 12; index += 1) diagnostics.append({ event: `event-${index}` });

    expect(fs.existsSync(oldPath)).toBe(true);
    expect(fs.readdirSync(directory).filter((name) => name.endsWith(".jsonl"))).toHaveLength(2);
    expect(diagnostics.readRecent()).toHaveLength(13);
    expect(diagnostics.readRecent(5).map((entry) => entry.event)).toEqual([
      "event-7", "event-8", "event-9", "event-10", "event-11"
    ]);
  });

  it("reads only as far back as the requested window", () => {
    const now = Date.UTC(2026, 7, 12, 12);
    // Three rotated files; only the newest is needed to answer a small window.
    const names = ["runtime-a.jsonl", "runtime-b.jsonl", "runtime-c.jsonl"];
    names.forEach((name, fileIndex) => {
      const filePath = path.join(directory, name);
      const lines = [];
      for (let index = 0; index < 5; index += 1) lines.push(JSON.stringify({ event: `${name}-${index}` }));
      fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
      const stamp = new Date(now - (names.length - fileIndex) * 60000);
      fs.utimesSync(filePath, stamp, stamp);
    });

    const diagnostics = new RuntimeDiagnostics({ directory, now: () => now, viewerEntries: 3 });
    const readFiles = [];
    const realReadFileSync = fs.readFileSync;
    const spy = vi.spyOn(fs, "readFileSync").mockImplementation((target, ...rest) => {
      if (typeof target === "string" && target.endsWith(".jsonl")) readFiles.push(path.basename(target));
      return realReadFileSync(target, ...rest);
    });

    try {
      expect(diagnostics.readRecent(3).map((entry) => entry.event)).toEqual([
        "runtime-c.jsonl-2", "runtime-c.jsonl-3", "runtime-c.jsonl-4"
      ]);
      // The older files are never opened, so the cost follows the window rather
      // than the size of the store.
      expect(readFiles).toEqual(["runtime-c.jsonl"]);
    } finally {
      spy.mockRestore();
    }
  });

  it("resolves the store location from the override, then the platform's local data directory", () => {
    expect(defaultDiagnosticsDirectory({ MULTITERM_DIAGNOSTICS_DIR: "custom-store" }))
      .toBe(path.resolve("custom-store"));
    expect(defaultDiagnosticsDirectory({ LOCALAPPDATA: "C:\\Local" }, "win32"))
      .toBe(path.join("C:\\Local", "MultiTerm", "Diagnostics"));
    expect(defaultDiagnosticsDirectory({}, "win32"))
      .toBe(path.join(os.homedir(), "AppData", "Local", "MultiTerm", "Diagnostics"));
    expect(defaultDiagnosticsDirectory({}, "linux"))
      .toBe(path.join(os.homedir(), ".local", "share", "MultiTerm", "Diagnostics"));
  });

  it("redacts inside arrays and leaves primitives untouched", () => {
    expect(redactDiagnosticValue(["https://user:secret@example.com/path?token=1#frag", 7]))
      .toEqual(["https://example.com/path", 7]);
    expect(redactDiagnosticValue(42)).toBe(42);
    expect(redactDiagnosticValue(null)).toBe(null);
  });

  it("redacts a URL-shaped value it cannot parse rather than passing it through", () => {
    expect(redactDiagnosticValue("connect http://[ now")).toBe("connect [redacted-url] now");
  });

  it("falls back to defaults when a record omits its event", () => {
    expect(normalizeDiagnosticRecord({ message: "no event" }, 555))
      .toMatchObject({ time: 555, level: "info", source: "bridge", event: "log", message: "no event" });
    expect(normalizeDiagnosticRecord({ event: "" }, 555)).toMatchObject({ event: "log" });
  });

  it("keeps a record's own valid time, level, and event", () => {
    expect(normalizeDiagnosticRecord({ time: 1234, level: "warn", event: "resume" }, 999))
      .toMatchObject({ time: 1234, level: "warn", event: "resume", source: "bridge", message: "" });
  });

  it("treats a missing store as empty rather than failing", () => {
    const missing = path.join(directory, "not-created-yet");
    const diagnostics = new RuntimeDiagnostics({ directory: missing, now: () => Date.UTC(2026, 7, 12) });
    expect(diagnostics.readRecent(10)).toEqual([]);
    expect(diagnostics.prune(Date.UTC(2026, 7, 12))).toEqual([]);
  });

  it("surfaces store failures that are not a missing directory", () => {
    const diagnostics = new RuntimeDiagnostics({ directory, now: () => Date.UTC(2026, 7, 12) });
    const denied = Object.assign(new Error("denied"), { code: "EACCES" });

    const readdir = vi.spyOn(fs, "readdirSync").mockImplementation(() => { throw denied; });
    try {
      expect(() => diagnostics.readRecent(5)).toThrow("denied");
    } finally {
      readdir.mockRestore();
    }

    const stat = vi.spyOn(fs, "statSync").mockImplementation(() => { throw denied; });
    try {
      expect(() => diagnostics.append({ event: "blocked" })).toThrow("denied");
    } finally {
      stat.mockRestore();
    }
  });

  it("never prunes the file it is currently writing to", () => {
    const now = Date.UTC(2026, 7, 12, 12);
    const diagnostics = new RuntimeDiagnostics({ directory, now: () => now, retentionDays: 1 });
    const current = diagnostics.append({ event: "current" });
    // Age the live file well past retention; it must still survive.
    const ancient = new Date(now - 30 * 24 * 60 * 60 * 1000);
    fs.utimesSync(current, ancient, ancient);

    const stale = path.join(directory, "runtime-stale.jsonl");
    fs.writeFileSync(stale, JSON.stringify({ event: "stale" }) + "\n", "utf8");
    fs.utimesSync(stale, ancient, ancient);

    expect(diagnostics.prune(now)).toEqual([stale]);
    expect(fs.existsSync(current)).toBe(true);
  });

  it("still returns the whole store when the viewer window is unlimited", () => {
    const now = Date.UTC(2026, 7, 12, 12);
    const older = path.join(directory, "runtime-older.jsonl");
    fs.writeFileSync(older, JSON.stringify({ event: "older" }) + "\n", "utf8");
    const stamp = new Date(now - 120000);
    fs.utimesSync(older, stamp, stamp);

    const diagnostics = new RuntimeDiagnostics({ directory, now: () => now, viewerEntries: 0 });
    diagnostics.append({ event: "newer" });

    expect(diagnostics.readRecent(0).map((entry) => entry.event)).toEqual(["older", "newer"]);
  });

  it("keeps reading older files until the requested window is filled", () => {
    const now = Date.UTC(2026, 7, 12, 12);
    const names = ["runtime-a.jsonl", "runtime-b.jsonl"];
    names.forEach((name, fileIndex) => {
      const filePath = path.join(directory, name);
      const lines = [];
      for (let index = 0; index < 3; index += 1) lines.push(JSON.stringify({ event: `${name}-${index}` }));
      fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
      const stamp = new Date(now - (names.length - fileIndex) * 60000);
      fs.utimesSync(filePath, stamp, stamp);
    });

    const diagnostics = new RuntimeDiagnostics({ directory, now: () => now, viewerEntries: 5 });
    expect(diagnostics.readRecent(5).map((entry) => entry.event)).toEqual([
      "runtime-a.jsonl-1", "runtime-a.jsonl-2",
      "runtime-b.jsonl-0", "runtime-b.jsonl-1", "runtime-b.jsonl-2"
    ]);
  });

  it("orders files written in the same millisecond by name", () => {
    const now = Date.UTC(2026, 7, 12, 12);
    const stamp = new Date(now - 60000);
    for (const name of ["runtime-second.jsonl", "runtime-first.jsonl"]) {
      const filePath = path.join(directory, name);
      fs.writeFileSync(filePath, JSON.stringify({ event: name }) + "\n", "utf8");
      fs.utimesSync(filePath, stamp, stamp);
    }

    const diagnostics = new RuntimeDiagnostics({ directory, now: () => now, viewerEntries: 0 });
    expect(diagnostics.readRecent(0).map((entry) => entry.event))
      .toEqual(["runtime-first.jsonl", "runtime-second.jsonl"]);
  });

  it("redacts sensitive fields and URL credentials, query strings, and fragments", () => {
    expect(redactDiagnosticValue({
      authorization: "Bearer abc",
      nested: { password: "secret", safe: "kept" },
      repository: "https://user:pass@example.test/org/repo.git?token=abc#main"
    })).toEqual({
      authorization: "[redacted]",
      nested: { password: "[redacted]", safe: "kept" },
      repository: "https://example.test/org/repo.git"
    });
  });

  it("uses visible defaults and resolves the platform diagnostics directory", () => {
    expect(normalizeDiagnosticsConfig({})).toEqual({
      retentionDays: 14,
      rotationMb: 10,
      viewerEntries: 5000
    });
    expect(defaultDiagnosticsDirectory({ LOCALAPPDATA: "C:\\Data" }, "win32"))
      .toBe(path.join("C:\\Data", "MultiTerm", "Diagnostics"));
  });

  it("preserves configured values when a partial update omits them", () => {
    const diagnostics = new RuntimeDiagnostics({
      directory,
      retentionDays: 30,
      rotationMb: 20,
      viewerEntries: 7500
    });

    expect(diagnostics.configure({ rotationMb: undefined, viewerEntries: 0 })).toEqual({
      retentionDays: 30,
      rotationMb: 20,
      viewerEntries: 0
    });
  });

  it("routes flat diagnostic records, configuration, and viewer requests", () => {
    const diagnostics = {
      append: vi.fn(),
      configure: vi.fn().mockReturnValue({ retentionDays: 30, rotationMb: 20, viewerEntries: 100 }),
      directory: directory,
      readRecent: vi.fn().mockReturnValue([{ event: "persisted" }])
    };
    const copilotLogs = {
      register: vi.fn(),
      configure: vi.fn().mockReturnValue({
        enabled: true,
        initialTailKb: 256,
        root: path.join(directory, "Copilot")
      })
    };
    const client = { id: "renderer", renderer: true, send: vi.fn() };

    server.handleClientMessage(client, JSON.stringify({
      type: "config",
      outputCoalesceMs: 12,
      bridgeClientBacklogKb: 4096,
      bridgeReplayBufferKb: 512,
      bridgeHeartbeatSeconds: 30,
      diagnosticRetentionDays: 30,
      diagnosticRotationMb: 20,
      diagnosticViewerEntries: 100,
      copilotLogViewerEnabled: true,
      copilotLogInitialTailKb: 256,
      copilotLogEnabledAt: 1234
    }), { diagnostics, copilotLogs });
    server.handleClientMessage(client, JSON.stringify({
      type: "copilotLogRegister",
      key: "session-one",
      terminalId: "terminal-1",
      terminalTitle: "Build pane"
    }), { diagnostics, copilotLogs });
    server.handleClientMessage(client, JSON.stringify({
      type: "diagnosticRecord",
      event: "request-failed",
      requestId: "request-1",
      terminalOutput: "must not persist",
      arbitrary: "must not persist"
    }), { diagnostics });
    server.handleClientMessage(client, JSON.stringify({
      type: "diagnosticList",
      requestId: "list-1",
      limit: 25
    }), { diagnostics });

    expect(diagnostics.configure).toHaveBeenCalledWith({
      retentionDays: 30,
      rotationMb: 20,
      viewerEntries: 100
    });
    expect(copilotLogs.configure).toHaveBeenCalledWith({ enabled: true, initialTailKb: 256, enabledAt: 1234 });
    expect(copilotLogs.register).toHaveBeenCalledWith(expect.objectContaining({
      key: "session-one",
      terminalId: "terminal-1",
      terminalTitle: "Build pane"
    }));
    expect(diagnostics.append).toHaveBeenCalledWith({ event: "request-failed", requestId: "request-1" });
    expect(diagnostics.readRecent).toHaveBeenCalledWith(25);
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "config",
      diagnosticRetentionDays: 30,
      diagnosticRotationMb: 20,
      diagnosticViewerEntries: 100,
      copilotLogViewerEnabled: true,
      copilotLogInitialTailKb: 256,
      copilotLogDirectory: path.join(directory, "Copilot")
    }));
    expect(client.send).toHaveBeenCalledWith({
      type: "diagnostics",
      requestId: "list-1",
      directory,
      entries: [{ event: "persisted" }]
    });
  });

  it("persists standalone bridge console output while preserving normal output", () => {
    const targetConsole = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    const originalWarn = targetConsole.warn;
    const diagnostics = { append: vi.fn() };
    const restore = server.installConsoleDiagnostics(targetConsole, diagnostics);

    targetConsole.warn("folder search unavailable:", { code: "ENOENT" });

    expect(originalWarn).toHaveBeenCalledWith("folder search unavailable:", { code: "ENOENT" });
    expect(diagnostics.append).toHaveBeenCalledWith({
      source: "server",
      level: "warn",
      event: "bridge-console-warn",
      message: "folder search unavailable: { code: 'ENOENT' }"
    });

    restore();
    targetConsole.warn("after restore");
    expect(diagnostics.append).toHaveBeenCalledOnce();
  });
});

describe("bridge runtime diagnostic recording", () => {
  it("contains persistence failures and reports useful Error and non-Error details", () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("disk full");

    expect(server.recordRuntimeDiagnostic({ event: "failed" }, {
      append() { throw error; }
    })).toBe(false);
    expect(report).toHaveBeenLastCalledWith(
      "[bridge] Could not persist runtime diagnostics:",
      error.stack
    );

    expect(server.recordRuntimeDiagnostic({ event: "failed" }, {
      append() { throw "storage offline"; }
    })).toBe(false);
    expect(report).toHaveBeenLastCalledWith(
      "[bridge] Could not persist runtime diagnostics:",
      "storage offline"
    );
  });
});