const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  RuntimeDiagnostics,
  defaultDiagnosticsDirectory,
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