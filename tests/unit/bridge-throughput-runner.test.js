/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

"use strict";

const { EventEmitter } = require("node:events");
const path = require("node:path");
const codec = require("../../benchmarks/bridge-throughput/record-codec");
const runner = require("../../benchmarks/bridge-throughput/run");

function renderStream(seed, count, recordBytes) {
  let text = codec.renderStartMarker(seed, count, recordBytes, 1_000_000);
  for (let sequence = 1; sequence <= count; sequence += 1) {
    text += codec.renderRecord(codec.buildRecord(seed, sequence, recordBytes), 1_000_000 + sequence * 100);
  }
  return text + codec.renderEndMarker(codec.expectedDigest(seed, count, recordBytes), count, count * 100);
}

function createScenarioClientClass(options, behavior = {}) {
  return class ScenarioClient extends EventEmitter {
    static instances = [];

    constructor(config) {
      super();
      this.label = config.label;
      this.port = config.port;
      this.bytesReceived = 0;
      this.closed = false;
      this.lastError = "";
      this.paused = false;
      this.sent = [];
      this.outputRuns = 0;
      this.constructor.instances.push(this);
    }

    async connect() {
      return this;
    }

    send(message) {
      this.sent.push(message);
      if (message.type === "create") {
        this.sessionId = message.id;
        queueMicrotask(() => this.emit("text", JSON.stringify({ type: "created", id: message.id }), 1_000_000));
      } else if (message.type === "input" && String(message.data).includes("producer.js")) {
        this.outputRuns += 1;
        const seed = Number(/--seed (\d+)/.exec(message.data)?.[1]);
        const records = Number(/--records (\d+)/.exec(message.data)?.[1]);
        const measured = seed === options.seed;
        const complete = !(measured && behavior.incompleteMeasured) && !(!measured && behavior.failWarmup);
        const data = complete
          ? renderStream(seed, records, options.recordBytes)
          : codec.renderStartMarker(seed, records, options.recordBytes, 1_000_000);
        const clients = this.constructor.instances;
        for (const client of clients) {
          if (measured
            && client === clients.at(-1)
            && clients.length > 1
            && (behavior.deferSlowMeasured || behavior.closeSlowOnResume)) {
            client.deferredOutput = { data, id: this.sessionId };
            continue;
          }
          queueMicrotask(() => client.emit("text", JSON.stringify({
            type: "output",
            id: this.sessionId,
            data
          }), 2_000_000));
        }
      }
    }

    pauseReads() {
      this.paused = true;
    }

    resumeReads() {
      this.paused = false;
      if (behavior.closeSlowOnResume) {
        this.closed = true;
        return;
      }
      if (this.deferredOutput) {
        const output = this.deferredOutput;
        this.deferredOutput = null;
        queueMicrotask(() => this.emit("text", JSON.stringify({
          type: "output",
          id: output.id,
          data: output.data
        }), 2_100_000));
      }
    }

    async close() {
      this.closedByHarness = true;
    }
  };
}

class FakeSampler {
  constructor(options) {
    this.options = options;
    this.started = false;
    this.stopped = false;
  }

  start() {
    this.started = true;
    return this;
  }

  mark() {
    this.marked = true;
    return this;
  }

  stop() {
    this.stopped = true;
    return this;
  }

  summarize() {
    return {
      processes: {
        7000: { cpuPercent: 1, peakWorkingSetBytes: 700 },
        8000: { cpuPercent: 2, peakWorkingSetBytes: 800 }
      },
      sampleCount: 3,
      windowMs: 100
    };
  }
}

function scenarioOptions(overrides = {}) {
  return {
    ...runner.DEFAULT_OPTIONS,
    clients: 1,
    idleMs: 5,
    records: 3,
    renderer: false,
    warmupRecords: 2,
    ...overrides
  };
}

function scenarioDependencies(options, behavior = {}) {
  let now = 0;
  const RawBridgeClient = createScenarioClientClass(options, behavior);
  const bridge = { health: { ok: true }, mode: options.mode, pid: 7000, port: 4100 };
  const rendererLane = {
    close: vi.fn(async () => {}),
    mark: vi.fn(async () => {}),
    summarize: vi.fn(async () => ({ messages: 4 }))
  };
  const dependencies = {
    ProcessSampler: FakeSampler,
    RawBridgeClient,
    assertBridgeStopped: vi.fn(async () => ({ port: bridge.port, stray: [] })),
    delay: vi.fn(async () => { now += behavior.timeStep || 100_000; }),
    findFreePort: vi.fn(async () => bridge.port),
    now: () => now,
    process: { env: {}, pid: 8000, version: "v-test" },
    randomUUID: () => "11111111-1111-4111-8111-111111111111",
    startBridge: vi.fn(async () => bridge),
    startRendererLane: vi.fn(async () => rendererLane),
    stdout: { write: vi.fn() },
    stopBridge: vi.fn(async () => {})
  };
  return { bridge, dependencies, RawBridgeClient, rendererLane };
}

describe("bridge throughput runner helpers", () => {
  it("resolves commit, version, machine identity, logs, and sentinel dependencies", () => {
    const stdout = { write: vi.fn() };
    const base = {
      execFileSync: vi.fn(() => "abc123\n"),
      fs: { readFileSync: vi.fn(() => JSON.stringify({ version: "9.9.9" })) },
      now: () => 3_723_004,
      os: {
        cpus: () => [{ model: "  Test CPU  " }],
        hostname: () => "host",
        totalmem: () => 123
      },
      process: { env: {}, version: "v-test" },
      randomBytes: () => Buffer.from("aabbccdd", "hex"),
      stdout
    };
    expect(runner.currentCommit(base)).toBe("abc123");
    expect(runner.appVersion(base)).toBe("9.9.9");
    expect(runner.machineIdentity(base)).toEqual({
      cpuCount: 1,
      cpuModel: "Test CPU",
      hostname: "host",
      totalMemoryBytes: 123
    });
    expect(runner.calibrationSentinel(base)).toEqual({
      expression: "Write-Host ('MTB-CALIB' + 'RATION-aabbccdd')",
      text: "MTB-CALIBRATION-aabbccdd"
    });
    runner.step("hello", base);
    expect(stdout.write).toHaveBeenCalledWith("[benchmark] 01:02:03.004 hello\n");

    expect(runner.currentCommit({ ...base, process: { env: { MULTITERM_BENCHMARK_COMMIT: "override" } } }))
      .toBe("override");
    expect(runner.currentCommit({ ...base, execFileSync: () => { throw new Error("git"); } })).toBe("unknown");
    expect(runner.appVersion({ ...base, fs: { readFileSync: () => { throw new Error("file"); } } })).toBe("unknown");
    expect(runner.machineIdentity({ ...base, os: { cpus: () => [], hostname: () => "h", totalmem: () => 0 } }))
      .toMatchObject({ cpuCount: 0, cpuModel: "unknown" });
    expect(runner.runnerDependencies({ stdout }).stdout).toBe(stdout);
    const defaults = runner.runnerDependencies();
    expect(defaults.now()).toBeGreaterThan(0);
    expect(defaults.randomBytes(2)).toHaveLength(2);
    expect(defaults.randomUUID()).toMatch(/^[0-9a-f-]{36}$/i);
    expect(() => runner.parseArgs(["--mode"])).toThrow("--mode needs a value");
    expect(runner.scenariosForOptions({ suite: true })).toBe(runner.SUITE_SCENARIOS);
  });

  it("loads the default renderer lane lazily", async () => {
    const playwrightPath = require.resolve("@playwright/test");
    const rendererPath = require.resolve("../../benchmarks/bridge-throughput/renderer-lane");
    const previousPlaywright = require.cache[playwrightPath];
    const previousRenderer = require.cache[rendererPath];
    const chromium = { name: "fake chromium" };
    const startRendererLane = vi.fn(async (options) => options);
    require.cache[playwrightPath] = { id: playwrightPath, filename: playwrightPath, loaded: true, exports: { chromium } };
    require.cache[rendererPath] = { id: rendererPath, filename: rendererPath, loaded: true, exports: { startRendererLane } };
    try {
      await expect(runner.startDefaultRendererLane({ port: 3199, sessionId: "session" }))
        .resolves.toEqual({ chromium, port: 3199, sessionId: "session" });
    } finally {
      if (previousPlaywright) require.cache[playwrightPath] = previousPlaywright;
      else delete require.cache[playwrightPath];
      if (previousRenderer) require.cache[rendererPath] = previousRenderer;
      else delete require.cache[rendererPath];
    }
  });

  it("attaches clients and separates output from malformed and unrelated messages", async () => {
    class Client extends EventEmitter {
      static instances = [];
      constructor(options) {
        super();
        Object.assign(this, options, { bytesReceived: 20, closed: false, lastError: "" });
        Client.instances.push(this);
      }
      async connect() { return this; }
      pauseReads() {}
    }
    const session = { value: "session-1" };
    const lanes = await runner.attachClients(3199, 2, session, { recordBytes: 100, seed: 5 }, 1, {
      RawBridgeClient: Client
    });
    expect(lanes).toHaveLength(2);
    const client = Client.instances[0];
    client.emit("text", "not-json", 1_000_000);
    client.emit("text", JSON.stringify({ type: "output", id: "other", data: "ignored" }), 1_000_000);
    client.emit("text", JSON.stringify({ type: "status" }), 1_000_000);
    const data = renderStream(5, 1, 100);
    const frame = JSON.stringify({ type: "output", id: session.value, data });
    client.emit("text", frame, 2_000_000);
    expect(lanes[0].summarize()).toMatchObject({
      check: { ok: true },
      outputMessages: 1,
      outputPayloadChars: Buffer.byteLength(data),
      outputWireBytes: Buffer.byteLength(frame)
    });
    expect(lanes[0].otherMessages).toBe(2);
  });

  it("waits for matching messages and reports refusal and timeout", async () => {
    const client = new EventEmitter();
    const matched = runner.waitForMessage(client, (message) => message.type === "ready", 1000, "ready");
    client.emit("text", "bad-json");
    client.emit("text", JSON.stringify({ type: "other" }));
    client.emit("text", JSON.stringify({ type: "ready", value: 1 }));
    await expect(matched).resolves.toMatchObject({ value: 1 });

    const refused = runner.waitForMessage(client, () => false, 1000, "create");
    client.emit("text", JSON.stringify({ type: "createFailed", message: "denied" }));
    await expect(refused).rejects.toThrow("Bridge refused: denied");
    const generic = runner.waitForMessage(client, () => false, 1000, "request");
    client.emit("text", JSON.stringify({ type: "error" }));
    await expect(generic).rejects.toThrow("Bridge refused: error");

    vi.useFakeTimers();
    const timedOut = runner.waitForMessage(client, () => false, 25, "timeout probe");
    const rejection = expect(timedOut).rejects.toThrow("Timed out waiting for timeout probe");
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    vi.useRealTimers();
  });

  it("recognizes complete, dropped, delayed, and expired client sets", async () => {
    const lane = (overrides = {}) => ({
      client: { closed: false, paused: false },
      reader: { completed: 2, isComplete: () => true },
      ...overrides
    });
    await expect(runner.waitForComplete([lane()], 100, 2, { now: () => 0 })).resolves.toBe(true);
    await expect(runner.waitForComplete([lane({ client: { closed: true, paused: false } })], 100, 2, { now: () => 0 }))
      .resolves.toBe(false);

    let completed = 0;
    let now = 0;
    const delayed = lane({ reader: { get completed() { return completed; }, isComplete: () => completed > 0 } });
    await expect(runner.waitForComplete([delayed], 100, 1, {
      delay: async () => { completed = 1; now += 50; },
      now: () => now
    })).resolves.toBe(true);

    now = 0;
    await expect(runner.waitForComplete([lane({ reader: { completed: 0, isComplete: () => false } })], 60, 1, {
      delay: async () => { now += 50; },
      now: () => now
    })).resolves.toBe(false);
  });
});

describe("bridge throughput scenario orchestration", () => {
  it("runs an idle control and tears every resource down", async () => {
    const options = scenarioOptions({ idle: true });
    const { dependencies, RawBridgeClient } = scenarioDependencies(options);
    const result = await runner.runScenario(options, { idle: true, name: "idle-control" }, dependencies);
    expect(result).toMatchObject({ completed: true, recordsPerSecond: 0, renderer: null, scenario: "idle-control" });
    expect(dependencies.stopBridge).toHaveBeenCalledOnce();
    expect(dependencies.assertBridgeStopped).toHaveBeenCalledOnce();
    expect(RawBridgeClient.instances.every((client) => client.closedByHarness)).toBe(true);
  });

  it("runs renderer, warm-up, measured, and slow-client recovery paths", async () => {
    const options = scenarioOptions({ clients: 2, renderer: true });
    const { dependencies, RawBridgeClient, rendererLane } = scenarioDependencies(options, { deferSlowMeasured: true });
    const result = await runner.runScenario(options, { name: "slow-client", slowClient: true }, dependencies);
    expect(result).toMatchObject({
      completed: true,
      renderer: { messages: 4 },
      scenario: "slow-client",
      slowClientRecovery: {
        disconnected: false,
        peakBridgeWorkingSetBytes: 700,
        recordsWhilePaused: 0
      }
    });
    expect(result.clients[1].paused).toBe(true);
    expect(rendererLane.mark).toHaveBeenCalledOnce();
    expect(rendererLane.close).toHaveBeenCalledOnce();
    expect(RawBridgeClient.instances[1].paused).toBe(false);
  });

  it("records a slow client that disconnects before it can drain", async () => {
    const options = scenarioOptions({ clients: 2 });
    const { dependencies } = scenarioDependencies(options, { closeSlowOnResume: true });
    const result = await runner.runScenario(options, { name: "slow-client", slowClient: true }, dependencies);
    expect(result.slowClientRecovery).toMatchObject({ disconnected: true, drainedRecords: 0 });
  });

  it("records incomplete measured delivery instead of throwing it away", async () => {
    const options = scenarioOptions();
    const { dependencies } = scenarioDependencies(options, { incompleteMeasured: true });
    const result = await runner.runScenario(options, { name: "clients-1" }, dependencies);
    expect(result.completed).toBe(false);
    expect(result.clients[0].check.ok).toBe(false);
    expect(dependencies.stdout.write.mock.calls.some(([text]) => text.includes("recording partial delivery"))).toBe(true);
  });

  it("fails an incomplete warm-up but still tears down", async () => {
    const options = scenarioOptions();
    const { dependencies } = scenarioDependencies(options, { failWarmup: true });
    await expect(runner.runScenario(options, { name: "clients-1" }, dependencies))
      .rejects.toThrow("Warm-up producer run did not complete");
    expect(dependencies.stopBridge).toHaveBeenCalledOnce();
    expect(dependencies.assertBridgeStopped).toHaveBeenCalledOnce();
  });
});

function createCalibrationClientClass({ coalesce = 0, chunks = 10, emitSentinel = true, noise = false } = {}) {
  return class CalibrationClient extends EventEmitter {
    static instances = [];
    constructor() {
      super();
      this.constructor.instances.push(this);
      this.sent = [];
    }
    async connect() { return this; }
    send(message) {
      this.sent.push(message);
      if (message.type === "config") {
        queueMicrotask(() => this.emit("text", JSON.stringify({ type: "config", outputCoalesceMs: coalesce })));
      } else if (message.type === "create") {
        this.sessionId = message.id;
        queueMicrotask(() => this.emit("text", JSON.stringify({ type: "created", id: message.id })));
      } else if (message.type === "input") {
        if (noise) {
          queueMicrotask(() => this.emit("text", "not-json", 900_000));
          queueMicrotask(() => this.emit("text", JSON.stringify({ type: "status" }), 900_001));
          queueMicrotask(() => this.emit("text", JSON.stringify({ type: "output", id: "other", data: "wrong" }), 900_002));
          queueMicrotask(() => this.emit("text", JSON.stringify({ type: "output", id: this.sessionId }), 900_003));
        }
        if (emitSentinel) {
          for (let index = 0; index < chunks; index += 1) {
            const suffix = index === chunks - 1 ? "MTB-CALIBRATION-aabbccdd" : `chunk-${index}`;
            queueMicrotask(() => this.emit("text", JSON.stringify({
              type: "output",
              id: this.sessionId,
              data: suffix
            }), 1_000_000 + index * 1_000));
          }
        }
      }
    }
    async close() { this.closed = true; }
  };
}

function calibrationDependencies(clientOptions = {}) {
  let now = 0;
  const RawBridgeClient = createCalibrationClientClass(clientOptions);
  const dependencies = {
    RawBridgeClient,
    assertBridgeStopped: vi.fn(async () => {}),
    delay: vi.fn(async () => { now += 1_000_000; }),
    execFileSync: () => "commit\n",
    findFreePort: vi.fn(async () => 4200),
    fs: { readFileSync: () => JSON.stringify({ version: "1.0.0" }) },
    now: () => now,
    os: {
      cpus: () => [{ model: "CPU" }],
      hostname: () => "host",
      platform: () => "win32",
      release: () => "test",
      totalmem: () => 1024
    },
    process: { env: {}, pid: 9, version: "v-test" },
    randomBytes: () => Buffer.from("aabbccdd", "hex"),
    randomUUID: () => "22222222-2222-4222-8222-222222222222",
    startBridge: vi.fn(async () => ({ pid: 7000, port: 4200 })),
    stopBridge: vi.fn(async () => {})
  };
  return { dependencies, RawBridgeClient };
}

describe("bridge throughput calibration", () => {
  it("measures and trims a completed calibration workload", async () => {
    const { dependencies, RawBridgeClient } = calibrationDependencies({ chunks: 10 });
    const result = await runner.runCalibration(scenarioOptions({ calibrate: "dotnet build" }), dependencies);
    expect(result).toMatchObject({
      bridgeMode: "node",
      chunks: 6,
      chunksPerSecond: 1200,
      command: "dotnet build",
      commit: "commit",
      durationMs: 5,
      schema: 1
    });
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(RawBridgeClient.instances[0].sent).toContainEqual({ type: "rendererPresence", visible: true });
    expect(RawBridgeClient.instances[0].sent).toContainEqual(expect.objectContaining({
      type: "config",
      outputCoalesceMs: 0,
      bridgeClientBacklogKb: 4096,
      bridgeReplayBufferKb: 512,
      bridgeHeartbeatSeconds: 30,
      diagnosticRetentionDays: 14
    }));
    expect(RawBridgeClient.instances[0].closed).toBe(true);
    expect(dependencies.stopBridge).toHaveBeenCalledOnce();
  });

  it("keeps short calibration streams and reports zero span for one chunk", async () => {
    const { dependencies } = calibrationDependencies({ chunks: 1 });
    const result = await runner.runCalibration(scenarioOptions({ calibrate: "echo short" }), dependencies);
    expect(result).toMatchObject({ chunks: 1, chunksPerSecond: 0, bytesPerSecond: 0, durationMs: 0 });
  });

  it("rejects coalescing and timeout while still closing the client and bridge", async () => {
    const refused = calibrationDependencies({ coalesce: 5 });
    await expect(runner.runCalibration(scenarioOptions({ calibrate: "refused" }), refused.dependencies))
      .rejects.toThrow("refused straight-through output");
    expect(refused.RawBridgeClient.instances[0].closed).toBe(true);
    expect(refused.dependencies.stopBridge).toHaveBeenCalledOnce();

    const timedOut = calibrationDependencies({ emitSentinel: false, noise: true });
    await expect(runner.runCalibration(scenarioOptions({ calibrate: "timeout" }), timedOut.dependencies))
      .rejects.toThrow("did not finish");
    expect(timedOut.RawBridgeClient.instances[0].closed).toBe(true);

    const constructorFailure = calibrationDependencies();
    constructorFailure.dependencies.RawBridgeClient = class { constructor() { throw new Error("client construction failed"); } };
    await expect(runner.runCalibration(scenarioOptions({ calibrate: "constructor" }), constructorFailure.dependencies))
      .rejects.toThrow("client construction failed");
    expect(constructorFailure.dependencies.stopBridge).toHaveBeenCalledOnce();
    expect(constructorFailure.dependencies.assertBridgeStopped).toHaveBeenCalledOnce();
  });
});

describe("bridge throughput summary and CLI orchestration", () => {
  function persistenceDependencies(overrides = {}) {
    const writes = [];
    const fs = {
      mkdirSync: vi.fn(),
      readFileSync: vi.fn(() => JSON.stringify({ version: "2.0.0" })),
      writeFileSync: vi.fn((target, content) => writes.push({ target, content }))
    };
    return {
      dependencies: {
        execFileSync: () => "commit-2\n",
        fs,
        os: {
          cpus: () => [{ model: "CPU" }],
          hostname: () => "host",
          platform: () => "win32",
          release: () => "test",
          totalmem: () => 2048
        },
        process: {
          env: { MULTITERM_BENCHMARK_SOURCE: "source-2" },
          pid: 8,
          version: "v-test"
        },
        stdout: { write: vi.fn() },
        ...overrides
      },
      fs,
      writes
    };
  }

  it("writes complete idle and measured summary schemas", () => {
    const persisted = persistenceDependencies();
    const options = scenarioOptions({ clients: 2, label: "unit", renderer: true, repeats: 1 });
    const run = {
      clients: [{ check: { ok: true }, latencyMs: { p95: 1 }, paused: false }],
      completed: true,
      recordsPerSecond: 10
    };
    const measured = runner.writeSummary(options, { name: "clients-2" }, [run], persisted.dependencies);
    expect(measured.summary).toMatchObject({
      appVersion: "2.0.0",
      commit: "commit-2",
      sourceRevision: "source-2",
      workload: { idleMs: 0, records: 3 }
    });
    const idle = runner.writeSummary(
      { ...options, out: "custom.json" },
      { idle: true, name: "idle-control" },
      [run],
      { ...persisted.dependencies, process: { env: {}, pid: 8, version: "v-test" } }
    );
    expect(idle.summary).toMatchObject({ sourceRevision: "unknown", workload: { idleMs: 5, records: 0 } });
    expect(idle.target).toBe(path.resolve(runner.runnerDependencies().process.cwd?.() || process.cwd(), "custom.json"));
    expect(persisted.fs.mkdirSync).toHaveBeenCalled();
    expect(persisted.writes).toHaveLength(2);
  });

  it("runs calibration mode with explicit and default result targets", async () => {
    const persisted = persistenceDependencies({
      runCalibration: vi.fn(async () => ({ chunkBytes: { p50: 10, p95: 20 }, chunksPerSecond: 30 }))
    });
    await runner.main(["--calibrate", "build", "--out", "calibration.json"], persisted.dependencies);
    await runner.main(["--calibrate", "build", "--label", "nightly"], persisted.dependencies);
    expect(persisted.dependencies.runCalibration).toHaveBeenCalledTimes(2);
    expect(persisted.writes).toHaveLength(2);
    expect(persisted.dependencies.stdout.write).toHaveBeenCalledWith(expect.stringContaining("calibration: 30 chunks/s"));
  });

  it("runs repeats and rejects only unusable ordinary scenarios", async () => {
    const runScenario = vi.fn(async () => ({ clients: [], completed: true, recordsPerSecond: 1 }));
    const writeSummary = vi.fn((options, scenario, runs) => ({
      summary: {
        aggregate: {
          completedRuns: runs.length,
          exactOutput: scenario.slowClient ? false : true,
          headlineSpread: 0,
          stable: true
        }
      },
      target: path.join(process.cwd(), `${scenario.name}.json`)
    }));
    const persisted = persistenceDependencies({ runScenario, writeSummary });
    await runner.main(["--mode", "node", "--clients", "2", "--repeats", "2"], persisted.dependencies);
    expect(runScenario).toHaveBeenCalledTimes(2);
    expect(writeSummary).toHaveBeenCalledOnce();

    writeSummary.mockImplementation((options, scenario, runs) => ({
      summary: {
        aggregate: { completedRuns: runs.length, exactOutput: false, headlineSpread: 0, stable: true }
      },
      target: path.join(process.cwd(), `${scenario.name}.json`)
    }));
    await expect(runner.main(["--mode", "node"], persisted.dependencies))
      .rejects.toThrow("1 ordinary scenario");
  });

  it("reports CLI success, Error stacks, and raw failures without global process writes", async () => {
    const persisted = persistenceDependencies({
      runScenario: vi.fn(async () => ({ clients: [], completed: true, recordsPerSecond: 1 })),
      writeSummary: vi.fn(() => ({
        summary: { aggregate: { completedRuns: 1, exactOutput: true, headlineSpread: 0, stable: true } },
        target: path.join(process.cwd(), "result.json")
      }))
    });
    persisted.dependencies.stderr = { write: vi.fn() };
    expect(runner.runCliIfMain(false, [], persisted.dependencies)).toBeNull();
    await expect(runner.runCliIfMain(true, [], persisted.dependencies)).resolves.toBeUndefined();
    await expect(runner.runCliIfMain(true, ["--bad"], persisted.dependencies)).resolves.toBeNull();
    expect(persisted.dependencies.process.exitCode).toBe(1);
    expect(persisted.dependencies.stderr.write).toHaveBeenCalledWith(expect.stringContaining("Unknown benchmark argument"));

    const stderr = { write: vi.fn() };
    const runtime = { exitCode: 0 };
    runner.reportCliFailure("raw runner failure", stderr, runtime);
    expect(stderr.write).toHaveBeenCalledWith("raw runner failure\n");
    expect(runtime.exitCode).toBe(1);
  });
});