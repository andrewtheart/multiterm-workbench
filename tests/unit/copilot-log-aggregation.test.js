const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  CopilotLogAggregator,
  parseCopilotLogLine
} = require("../../lib/copilot-log-aggregator");

describe("Copilot log aggregation", () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-copilot-logs-"));
  });

  afterEach(() => {
    fs.rmSync(root, { force: true, recursive: true });
  });

  it("maps Copilot timestamps and levels into application log records", () => {
    expect(parseCopilotLogLine("2026-08-12T01:56:54.524Z [WARNING] Loading repo hooks", 1)).toEqual({
      time: Date.parse("2026-08-12T01:56:54.524Z"),
      level: "warn",
      source: "copilot",
      event: "copilot-log",
      message: "Loading repo hooks"
    });
    expect(parseCopilotLogLine("continuation", 7)).toEqual({
      time: 7,
      level: "info",
      source: "copilot",
      event: "copilot-log",
      message: "continuation"
    });
  });

  it("loads only complete lines from the configured initial tail and follows new writes", () => {
    const session = path.join(root, "session-one");
    fs.mkdirSync(session);
    const filePath = path.join(session, "process.log");
    fs.writeFileSync(filePath, [
      `2026-08-12T01:00:00.000Z [INFO] ${"a".repeat(700)}`,
      `2026-08-12T01:00:01.000Z [ERROR] ${"b".repeat(700)}`,
      ""
    ].join("\n"), "utf8");
    const emitted = [];
    const aggregator = new CopilotLogAggregator({ root, emit: (record) => emitted.push(record), intervalMs: 0 });
    expect(aggregator.register({ key: "session-one", terminalId: "terminal-1", terminalTitle: "Build pane" })).toBe(true);

    aggregator.configure({ enabled: true, initialTailKb: 1 });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      level: "error",
      message: "b".repeat(700),
      source: "copilot:Build pane",
      copilotLogKey: "session-one",
      terminalId: "terminal-1",
      terminalTitle: "Build pane"
    });

    fs.appendFileSync(filePath, "2026-08-12T01:00:02.000Z [DEBUG] followed\n", "utf8");
    expect(aggregator.poll()).toEqual([
      expect.objectContaining({ level: "debug", message: "followed" })
    ]);
    aggregator.close();
  });

  it("treats a zero initial tail as follow-new-content only", () => {
    const filePath = path.join(root, "process.log");
    fs.writeFileSync(filePath, "2026-08-12T01:00:00.000Z [INFO] existing\n", "utf8");
    const aggregator = new CopilotLogAggregator({ root, intervalMs: 0 });

    expect(aggregator.configure({ enabled: true, initialTailKb: 0 })).toMatchObject({
      enabled: true,
      initialTailKb: 0,
      root
    });
    fs.appendFileSync(filePath, "2026-08-12T01:00:01.000Z [INFO] new\n", "utf8");
    expect(aggregator.poll().map((record) => record.message)).toEqual(["new"]);

    const lateFile = path.join(root, "late-process.log");
    fs.writeFileSync(lateFile, "2026-08-12T01:00:01.500Z [INFO] late-file\n", "utf8");
    expect(aggregator.poll().map((record) => record.message)).toEqual(["late-file"]);

    aggregator.configure({ enabled: false });
    fs.appendFileSync(filePath, "2026-08-12T01:00:02.000Z [INFO] disabled\n", "utf8");
    expect(aggregator.poll()).toEqual([]);
    aggregator.close();
  });

  it("includes a zero-tail file written after the renderer enabled aggregation", () => {
    const enabledAt = Date.now() - 1000;
    const filePath = path.join(root, "racing-process.log");
    fs.writeFileSync(filePath, "2026-08-12T01:00:00.000Z [INFO] raced-config\n", "utf8");
    const emitted = [];
    const aggregator = new CopilotLogAggregator({ root, intervalMs: 0, emit: (record) => emitted.push(record) });

    expect(aggregator.configure({ enabled: true, initialTailKb: 0, enabledAt })
      .initialTailKb).toBe(0);
    expect(emitted.map((record) => record.message)).toEqual(["raced-config"]);
    expect(aggregator.poll()).toEqual([]);
    aggregator.close();
  });
});
