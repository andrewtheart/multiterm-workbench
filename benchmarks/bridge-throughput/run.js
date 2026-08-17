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

/**
 * Bridge throughput benchmark driver.
 *
 *   node benchmarks/bridge-throughput/run.js --mode node --clients 4 --renderer
 *   node benchmarks/bridge-throughput/run.js --mode installed --suite
 *
 * Starts a real bridge on a free port, creates a terminal through the real
 * protocol, runs the deterministic producer inside it, and measures what every
 * attached client actually received. Correctness is checked on every run: a
 * throughput number from a stream that lost or corrupted bytes is worthless.
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const codec = require("./record-codec");
const { ProcessSampler } = require("./sampler");
const { RawBridgeClient } = require("./raw-client");
const { distribution, relativeSpread, round } = require("./metrics");
const {
  REPO_ROOT,
  assertBridgeStopped,
  delay,
  findFreePort,
  startBridge,
  stopBridge
} = require("./bridge-control");

const PRODUCER_PATH = path.join(__dirname, "producer.js");
const RESULTS_DIRECTORY = path.join(__dirname, "results");

async function startDefaultRendererLane(options) {
  const { chromium } = require("@playwright/test");
  const { startRendererLane } = require("./renderer-lane");
  return startRendererLane({ ...options, chromium });
}

const DEFAULT_RUNNER_DEPENDENCIES = Object.freeze({
  ProcessSampler,
  RawBridgeClient,
  assertBridgeStopped,
  delay,
  execFileSync,
  findFreePort,
  fs,
  now: () => Date.now(),
  os,
  process,
  randomBytes: (size) => crypto.randomBytes(size),
  randomUUID: () => crypto.randomUUID(),
  runCalibration,
  runScenario,
  startBridge,
  startRendererLane: startDefaultRendererLane,
  stderr: process.stderr,
  stdout: process.stdout,
  stopBridge,
  writeSummary
});

function runnerDependencies(overrides = {}) {
  return { ...DEFAULT_RUNNER_DEPENDENCIES, ...overrides };
}

// Workload defaults are CALIBRATED, not assumed. results/calibration-dotnet-build-node.json
// records a real colorized verbose .NET build measured through this harness with
// output coalescing switched off: 9,720 chunks/s, mean 145 B per chunk,
// 1.41 MB/s. The often-quoted "~11k chunks of ~100 B" came from a source comment,
// and docs/performance/performance.md forbids treating that as a measurement.
// NOTE: MSBuild's terminal logger suppresses verbose output when attached to a
// real TTY, so the calibration command needs -tl:off or it measures silence.
const DEFAULT_OPTIONS = Object.freeze({
  calibrate: "",
  clients: 1,
  idle: false,
  idleMs: 15000,
  label: "adhoc",
  mode: "node",
  out: "",
  rate: 9700,
  recordBytes: 145,
  // Long enough that the 15.625 ms Windows processor-time quantum is noise
  // rather than the measurement.
  records: 120000,
  renderer: false,
  repeats: 1,
  seed: 20260812,
  // Windows PowerShell is present on every Windows install; the bridges default
  // to pwsh.exe, which a clean guest does not have.
  shell: "powershell",
  slowClient: false,
  suite: false,
  warmupRecords: 10000
});

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };
  const numbers = new Set(["clients", "idleMs", "rate", "recordBytes", "records", "repeats", "seed", "warmupRecords"]);
  const flags = new Map([
    ["--calibrate", "calibrate"],
    ["--clients", "clients"],
    ["--idle", "idle"],
    ["--idle-ms", "idleMs"],
    ["--label", "label"],
    ["--mode", "mode"],
    ["--out", "out"],
    ["--rate", "rate"],
    ["--record-bytes", "recordBytes"],
    ["--records", "records"],
    ["--renderer", "renderer"],
    ["--repeats", "repeats"],
    ["--seed", "seed"],
    ["--shell", "shell"],
    ["--slow-client", "slowClient"],
    ["--suite", "suite"],
    ["--warmup-records", "warmupRecords"]
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const key = flags.get(argv[index]);
    if (!key) throw new Error(`Unknown benchmark argument: ${argv[index]}`);
    if (typeof DEFAULT_OPTIONS[key] === "boolean") {
      options[key] = true;
      continue;
    }
    const raw = argv[index + 1];
    index += 1;
    if (raw === undefined) throw new Error(`${argv[index - 1]} needs a value`);
    options[key] = numbers.has(key) ? Number(raw) : String(raw);
  }

  if (!["node", "installed"].includes(options.mode)) {
    throw new Error(`--mode must be "node" or "installed", received: ${options.mode}`);
  }
  if (!Number.isInteger(options.clients) || options.clients < 1) {
    throw new Error("--clients must be a positive integer");
  }
  return options;
}

function currentCommit(dependencies) {
  const runtime = runnerDependencies(dependencies);
  if (runtime.process.env.MULTITERM_BENCHMARK_COMMIT) return runtime.process.env.MULTITERM_BENCHMARK_COMMIT;
  try {
    return runtime.execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function appVersion(dependencies) {
  const runtime = runnerDependencies(dependencies);
  try {
    return JSON.parse(runtime.fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")).version;
  } catch {
    return "unknown";
  }
}

// A baseline is only comparable against another baseline from the same machine.
// Recording the box makes a host-vs-VM mix-up visible instead of silent.
function machineIdentity(dependencies) {
  const runtime = runnerDependencies(dependencies);
  const cpus = runtime.os.cpus();
  return {
    cpuCount: cpus.length,
    cpuModel: cpus.length > 0 ? cpus[0].model.trim() : "unknown",
    hostname: runtime.os.hostname(),
    totalMemoryBytes: runtime.os.totalmem()
  };
}

function producerCommand(options, records) {
  return [
    "node",
    `"${PRODUCER_PATH}"`,
    "--seed", String(options.seed),
    "--records", String(records),
    "--rate", String(options.rate),
    "--record-bytes", String(options.recordBytes),
    "--chunk-records", "1"
  ].join(" ");
}

/**
 * One client's view of the session: raw protocol accounting plus the recovered
 * record stream. Both matter — throughput without an exactness check proves
 * nothing.
 */
class ClientLane {
  constructor(client, { seed, recordBytes, expected } = {}) {
    this.client = client;
    this.seed = seed;
    this.recordBytes = recordBytes;
    this.expected = expected || 0;
    // Sticky for the whole measured window: the socket is resumed before the
    // summary is taken, so the live flag would report the deliberately wedged
    // client as healthy and its latency would become the scenario headline.
    this.pausedDuringRun = false;
    this.outputMessages = 0;
    this.outputWireBytes = 0;
    this.outputPayloadChars = 0;
    this.otherMessages = 0;
    this.latenciesMs = [];
    this.#resetStream();
  }

  #resetStream() {
    this.verifier = new codec.StreamVerifier({
      expected: this.expected,
      recordBytes: this.recordBytes,
      seed: this.seed
    });
    this.reader = new codec.RecordStreamReader({
      onRecord: (record) => {
        this.verifier.accept(record);
        this.latenciesMs.push((record.receivedAtMicros - record.timestampMicros) / 1000);
      }
    });
  }

  pauseReads() {
    this.pausedDuringRun = true;
    this.client.pauseReads();
  }

  reset() {
    this.pausedDuringRun = false;
    this.outputMessages = 0;
    this.outputWireBytes = 0;
    this.outputPayloadChars = 0;
    this.otherMessages = 0;
    this.latenciesMs = [];
    this.#resetStream();
  }

  summarize() {
    const check = this.verifier.summary();
    return {
      bytesReceived: this.client.bytesReceived,
      check,
      label: this.client.label,
      latencyMs: distribution(this.latenciesMs),
      socketClosed: Boolean(this.client.closed),
      socketError: this.client.lastError || "",
      outputMessages: this.outputMessages,
      outputPayloadChars: this.outputPayloadChars,
      outputWireBytes: this.outputWireBytes,
      paused: this.pausedDuringRun,
      producerEnd: this.reader.end,
      wireOverheadRatio: this.outputPayloadChars > 0
        ? round(this.outputWireBytes / this.outputPayloadChars, 4)
        : null
    };
  }
}

async function attachClients(port, count, sessionIdRef, options, expected, dependencies) {
  const runtime = runnerDependencies(dependencies);
  const lanes = [];
  for (let index = 0; index < count; index += 1) {
    const client = new runtime.RawBridgeClient({ label: `raw-${index + 1}`, port });
    await client.connect();
    const lane = new ClientLane(client, { expected, recordBytes: options.recordBytes, seed: options.seed });
    client.on("text", (text, receivedAtMicros) => {
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      if (message.type === "output" && message.id === sessionIdRef.value) {
        lane.outputMessages += 1;
        lane.outputWireBytes += Buffer.byteLength(text, "utf8");
        lane.outputPayloadChars += Buffer.byteLength(String(message.data || ""), "utf8");
        lane.reader.push(String(message.data || ""), receivedAtMicros);
      } else {
        lane.otherMessages += 1;
      }
    });
    lanes.push(lane);
  }
  return lanes;
}

function waitForMessage(client, predicate, timeoutMs, description) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off("text", onText);
      reject(new Error(`Timed out waiting for ${description}`));
    }, timeoutMs);
    const onText = (text) => {
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      // A refusal answers the request just as definitively as success, and
      // waiting out the timeout hides the reason the bridge gave.
      if (message.type === "createFailed" || message.type === "error") {
        clearTimeout(timer);
        client.off("text", onText);
        reject(new Error(`Bridge refused: ${message.message || message.type}`));
        return;
      }
      if (!predicate(message)) return;
      clearTimeout(timer);
      client.off("text", onText);
      resolve(message);
    };
    client.on("text", onText);
  });
}

async function waitForComplete(lanes, timeoutMs, expectedRecords, dependencies) {
  const runtime = runnerDependencies(dependencies);
  const deadline = runtime.now() + timeoutMs;
  while (runtime.now() < deadline) {
    // A client the bridge dropped will never finish, so waiting out the whole
    // budget for it only hides why the run ended.
    const active = lanes.filter((lane) => !lane.client.paused && !lane.client.closed);
    if (active.length === 0) return false;
    // The end marker alone is not enough: a straggling marker from the warm-up
    // run would otherwise declare the measured run finished immediately.
    const done = active.every((lane) => lane.reader.isComplete()
      && lane.reader.completed >= expectedRecords);
    if (done) return true;
    await runtime.delay(50);
  }
  return false;
}

function step(message, dependencies) {
  const runtime = runnerDependencies(dependencies);
  runtime.stdout.write(`[benchmark] ${new Date(runtime.now()).toISOString().slice(11, 23)} ${message}\n`);
}

async function runScenario(options, scenario, dependencies) {
  const runtime = runnerDependencies(dependencies);
  const port = await runtime.findFreePort();
  step(`starting ${options.mode} bridge on port ${port}`, runtime);
  const bridge = await runtime.startBridge({ mode: options.mode, port });
  const sessionIdRef = { value: "" };
  let lane = null;
  let lanes = [];
  const sampler = new runtime.ProcessSampler({ intervalMs: 200, processIds: [bridge.pid, runtime.process.pid] });

  try {
    step(`attaching ${options.clients} raw client(s)`, runtime);
    lanes = await attachClients(port, options.clients, sessionIdRef, options, scenario.idle ? 0 : options.records, runtime);
    const controller = lanes[0].client;
    const sessionId = runtime.randomUUID();
    const created = waitForMessage(controller, (message) => message.type === "created" && message.id === sessionId,
      30000, "the benchmark terminal to be created");
    controller.send({ cols: 200, cwd: REPO_ROOT, id: sessionId, rows: 50, shell: options.shell, title: "bridge-benchmark", type: "create" });
    await created;
    sessionIdRef.value = sessionId;

    // The renderer only adopts a session it already knows about or one carried
    // by its welcome frame, so it has to connect AFTER the terminal exists.
    if (options.renderer) {
      step("starting renderer lane", runtime);
      lane = await runtime.startRendererLane({ port, sessionId });
      // Adopting the session makes the renderer fit the PTY to its pane. A
      // narrow terminal makes ConPTY wrap each record across lines, which
      // destroys the framing and recovers zero records; reassert the width.
      await runtime.delay(500);
      controller.send({ cols: 200, id: sessionId, rows: 50, type: "resize" });
    }

    // Let the shell finish printing its banner and prompt before measuring.
    await runtime.delay(2500);
    sampler.start();

    if (!scenario.idle) {
      step(`warm-up ${options.warmupRecords} records`, runtime);
      // A different seed for warm-up so its records can never be mistaken for
      // the measured run's, which restart at sequence 1.
      const warmupOptions = { ...options, seed: options.seed + 1 };
      controller.send({ data: `${producerCommand(warmupOptions, options.warmupRecords)}\r`, id: sessionId, type: "input" });
      const warmed = await waitForComplete(lanes, 180000, options.warmupRecords, runtime);
      if (!warmed) throw new Error("Warm-up producer run did not complete.");
      await runtime.delay(750);
    }

    for (const clientLane of lanes) clientLane.reset();
    switch (lane) {
      case null:
        break;
      default:
        await lane.mark();
    }
    sampler.mark();

    const startedAt = runtime.now();
    let completed = true;
    if (scenario.idle) {
      step(`idle control for ${options.idleMs} ms`, runtime);
      await runtime.delay(options.idleMs);
    } else {
      step(`measured run: ${options.records} records at ${options.rate} chunks/s`, runtime);
      controller.send({ data: `${producerCommand(options, options.records)}\r`, id: sessionId, type: "input" });
      if (scenario.slowClient && lanes.length > 1) {
        await runtime.delay(400);
        lanes[lanes.length - 1].pauseReads();
      }
      const finished = await waitForComplete(lanes, 300000, options.records, runtime);
      if (!finished) {
        // On a bridge that blocks its fan-out behind one wedged client this is
        // the result, not an error: healthy clients genuinely never received the
        // rest of the stream. Record what arrived rather than losing the run.
        completed = false;
        step("measured run did not complete within its budget; recording partial delivery", runtime);
      }
    }
    const durationMs = runtime.now() - startedAt;

    sampler.stop();
    const sampled = sampler.summarize();
    const rendererSummary = lane ? await lane.summarize() : null;

    let slowClientRecovery = null;
    if (scenario.slowClient && lanes.length > 1) {
      const slow = lanes[lanes.length - 1];
      const before = slow.reader.completed;
      slow.client.resumeReads();
      const drainDeadline = runtime.now() + 20000;
      while (runtime.now() < drainDeadline && !slow.reader.isComplete() && !slow.client.closed) {
        await runtime.delay(100);
      }
      slowClientRecovery = {
        disconnected: slow.client.closed,
        drainedRecords: slow.reader.completed - before,
        latencyMs: distribution(slow.latenciesMs),
        peakBridgeWorkingSetBytes: (sampled.processes[String(bridge.pid)] || {}).peakWorkingSetBytes || 0,
        recordsWhilePaused: before
      };
    }

    controller.send({ id: sessionId, type: "kill" });
    await runtime.delay(750);

    return {
      bridge: {
        cpu: sampled.processes[String(bridge.pid)] || null,
        health: bridge.health,
        mode: options.mode,
        pid: bridge.pid,
        port
      },
      clients: lanes.map((clientLane) => clientLane.summarize()),
      completed,
      durationMs,
      harness: {
        cpu: sampled.processes[String(runtime.process.pid)] || null,
        sampleCount: sampled.sampleCount,
        windowMs: sampled.windowMs
      },
      recordsPerSecond: scenario.idle ? 0 : round((options.records / durationMs) * 1000, 1),
      renderer: rendererSummary,
      scenario: scenario.name,
      slowClientRecovery
    };
  } finally {
    sampler.stop();
    switch (lane) {
      case null:
        break;
      default:
        step("closing renderer lane", runtime);
        await lane.close();
    }
    for (const clientLane of lanes) await clientLane.client.close();
    step("stopping bridge", runtime);
    await runtime.stopBridge(bridge);
    await runtime.assertBridgeStopped(bridge);
    step("teardown verified clean", runtime);
  }
}

function summarizeRepeats(runs, scenario) {
  const headline = runs.map((run) => {
    const healthy = run.clients.filter((client) => !client.paused);
    const values = healthy.map((client) => client.latencyMs.p95).filter((value) => Number.isFinite(value));
    return values.length > 0 ? Math.max(...values) : null;
  }).filter((value) => value !== null);

  return {
    completedRuns: runs.filter((run) => run.completed !== false).length,
    exactOutput: scenario.idle === true
      ? null
      : runs.every((run) => run.clients.filter((client) => !client.paused).every((client) => client.check.ok)),
    headlineMetric: "worst healthy-client p95 delivery latency (ms)",
    headlineSpread: relativeSpread(headline),
    headlineValues: headline,
    recordsPerSecond: distribution(runs.map((run) => run.recordsPerSecond).filter(Number.isFinite)),
    // The Phase 0 gate: a harness whose own p95 wanders more than 10% between
    // warm repeats cannot decide whether a later change helped.
    stable: relativeSpread(headline) <= 0.1 || scenario.idle === true
  };
}

function invalidatesMeasurement(aggregate, scenario) {
  // The slow-client scenario exists to expose isolation failures in the pre-fix
  // bridge. Its inexact/blocked outcome is valid evidence for Phase 1. An
  // ordinary scenario has no induced fault, so inexact output there means the
  // baseline cannot be trusted.
  return aggregate.exactOutput === false && scenario.slowClient !== true;
}

function scenariosForOptions(options) {
  if (options.suite) return SUITE_SCENARIOS;
  return [{
    clients: options.clients,
    idle: options.idle,
    name: options.idle ? "idle-control" : options.slowClient ? "slow-client" : `clients-${options.clients}`,
    slowClient: options.slowClient
  }];
}

const SUITE_SCENARIOS = [
  { clients: 1, name: "clients-1" },
  { clients: 2, name: "clients-2" },
  { clients: 4, name: "clients-4" },
  { clients: 8, name: "clients-8" },
  { clients: 4, name: "slow-client", slowClient: true },
  { clients: 4, idle: true, name: "idle-control" }
];

// PSReadLine echoes the typed command AND offers an inline prediction from its
// saved history, so a literal sentinel that any earlier run used shows up in the
// terminal before the workload has produced a single byte. The sentinel is
// therefore split across a runtime concatenation and made unique per run.
function calibrationSentinel(dependencies) {
  const runtime = runnerDependencies(dependencies);
  const token = runtime.randomBytes(4).toString("hex");
  return {
    expression: `Write-Host ('MTB-CALIB' + 'RATION-${token}')`,
    text: `MTB-CALIBRATION-${token}`
  };
}

/**
 * Measures what a real workload actually pushes through a terminal, so the
 * synthetic producer's defaults come from a measurement rather than from a
 * source comment. Output coalescing is switched off for the duration so each
 * "output" message is exactly one node-pty chunk.
 *
 * @param {ReturnType<typeof parseArgs>} options
 */
async function runCalibration(options, dependencies) {
  const runtime = runnerDependencies(dependencies);
  const port = await runtime.findFreePort();
  const bridge = await runtime.startBridge({ mode: options.mode, port });
  const chunks = [];
  let transcript = "";
  let client = null;

  try {
    client = new runtime.RawBridgeClient({ label: "calibration", port });
    await client.connect();
    const sessionId = runtime.randomUUID();
    client.on("text", (text) => {
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      if (message.type === "heartbeat") client.send({ type: "heartbeat", nonce: message.nonce, reply: true });
    });
    client.send({ type: "rendererPresence", visible: true });

    const configured = waitForMessage(client, (message) => message.type === "config", 20000,
      "the bridge to acknowledge straight-through output");
    client.send({
      type: "config",
      outputCoalesceMs: 0,
      bridgeClientBacklogKb: 4096,
      bridgeReplayBufferKb: 512,
      bridgeHeartbeatSeconds: 30,
      bridgeHeartbeatTimeoutSeconds: 30,
      diagnosticRetentionDays: 14,
      diagnosticRotationMb: 10,
      diagnosticViewerEntries: 5000,
      copilotLogViewerEnabled: false,
      copilotLogInitialTailKb: 256,
      copilotLogEnabledAt: 0
    });
    const configReply = await configured;
    if (Number(configReply.outputCoalesceMs) !== 0) {
      throw new Error("Bridge refused straight-through output; calibration would measure coalesced chunks.");
    }

    const created = waitForMessage(client, (message) => message.type === "created" && message.id === sessionId,
      30000, "the calibration terminal to be created");
    client.send({ cols: 200, cwd: REPO_ROOT, id: sessionId, rows: 50, shell: options.shell, title: "bridge-calibration", type: "create" });
    await created;
    await runtime.delay(2500);

    client.on("text", (text, receivedAtMicros) => {
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      if (message.type !== "output" || message.id !== sessionId) return;
      const data = String(message.data || "");
      chunks.push({ atMicros: receivedAtMicros, bytes: Buffer.byteLength(data, "utf8") });
      transcript += data;
    });

    const sentinel = calibrationSentinel(runtime);
    client.send({ data: `${options.calibrate}; ${sentinel.expression}\r`, id: sessionId, type: "input" });

    const deadline = runtime.now() + 900000;
    while (runtime.now() < deadline && !transcript.includes(sentinel.text)) {
      await runtime.delay(250);
    }
    if (!transcript.includes(sentinel.text)) {
      throw new Error("Calibration workload did not finish within its budget.");
    }

    client.send({ id: sessionId, type: "kill" });
    await runtime.delay(500);
  } finally {
    switch (client) {
      case null:
        break;
      default:
        await client.close();
    }
    await runtime.stopBridge(bridge);
    await runtime.assertBridgeStopped(bridge);
  }

  // Drop the first and last couple of chunks: they carry the echoed command and
  // the returning prompt rather than workload output.
  const measured = chunks.length > 8 ? chunks.slice(2, -2) : chunks;
  const spanMs = measured.length > 1
    ? (measured[measured.length - 1].atMicros - measured[0].atMicros) / 1000
    : 0;
  const totalBytes = measured.reduce((total, chunk) => total + chunk.bytes, 0);

  return {
    bridgeMode: options.mode,
    chunkBytes: distribution(measured.map((chunk) => chunk.bytes)),
    chunks: measured.length,
    chunksPerSecond: spanMs > 0 ? round((measured.length / spanMs) * 1000, 1) : 0,
    command: options.calibrate,
    commit: currentCommit(runtime),
    durationMs: round(spanMs, 1),
    machine: machineIdentity(runtime),
    node: runtime.process.version,
    os: `${runtime.os.platform()} ${runtime.os.release()}`,
    recordedAt: new Date().toISOString(),
    schema: 1,
    totalBytes,
    bytesPerSecond: spanMs > 0 ? round((totalBytes / spanMs) * 1000, 1) : 0
  };
}

function resultsPath(options, scenario) {
  return options.out
    ? path.resolve(REPO_ROOT, options.out)
    : path.join(RESULTS_DIRECTORY, `${options.label}-${options.mode}-${scenario.name}.json`);
}

function writeSummary(options, scenario, runs, dependencies) {
  const runtime = runnerDependencies(dependencies);
  runtime.fs.mkdirSync(RESULTS_DIRECTORY, { recursive: true });
  const summary = {
    aggregate: summarizeRepeats(runs, scenario),
    appVersion: appVersion(runtime),
    bridgeMode: options.mode,
    clients: options.clients,
    commit: currentCommit(runtime),
    label: options.label,
    machine: machineIdentity(runtime),
    node: runtime.process.version,
    os: `${runtime.os.platform()} ${runtime.os.release()}`,
    recordedAt: new Date().toISOString(),
    renderer: options.renderer,
    repeats: runs.length,
    runs,
    scenario: scenario.name,
    schema: 1,
    sourceRevision: runtime.process.env.MULTITERM_BENCHMARK_SOURCE || "unknown",
    workload: {
      chunkRecords: 1,
      idleMs: scenario.idle ? options.idleMs : 0,
      rate: options.rate,
      recordBytes: options.recordBytes,
      records: scenario.idle ? 0 : options.records,
      seed: options.seed,
      shell: options.shell,
      warmupRecords: options.warmupRecords
    }
  };
  const target = resultsPath(options, scenario);
  runtime.fs.writeFileSync(target, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return { summary, target };
}

async function main(argv, dependencies) {
  const runtime = runnerDependencies(dependencies);
  const options = parseArgs(argv);

  switch (Boolean(options.calibrate)) {
    case true: {
      const calibration = await runtime.runCalibration(options, runtime);
      runtime.fs.mkdirSync(RESULTS_DIRECTORY, { recursive: true });
      const target = options.out
        ? path.resolve(REPO_ROOT, options.out)
        : path.join(RESULTS_DIRECTORY, `calibration-${options.label}-${options.mode}.json`);
      runtime.fs.writeFileSync(target, `${JSON.stringify(calibration, null, 2)}\n`, "utf8");
      runtime.stdout.write(`[benchmark] calibration: ${calibration.chunksPerSecond} chunks/s,`
        + ` p50 ${calibration.chunkBytes.p50} B, p95 ${calibration.chunkBytes.p95} B`
        + ` -> ${path.relative(REPO_ROOT, target)}\n`);
      return;
    }
    default:
      break;
  }

  const scenarios = scenariosForOptions(options);

  let failures = 0;
  for (const scenario of scenarios) {
    const scenarioOptions = { ...options, clients: scenario.clients };
    const runs = [];
    for (let repeat = 0; repeat < options.repeats; repeat += 1) {
      runtime.stdout.write(`[benchmark] ${options.mode} ${scenario.name} run ${repeat + 1}/${options.repeats}\n`);
      runs.push(await runtime.runScenario(scenarioOptions, scenario, runtime));
    }
    const { summary, target } = runtime.writeSummary(scenarioOptions, scenario, runs, runtime);
    failures += invalidatesMeasurement(summary.aggregate, scenario) ? 1 : 0;
    runtime.stdout.write(`[benchmark] ${scenario.name}: exactOutput=${summary.aggregate.exactOutput}`
      + ` complete=${summary.aggregate.completedRuns}/${runs.length}`
      + ` stable=${summary.aggregate.stable} spread=${summary.aggregate.headlineSpread}`
      + ` -> ${path.relative(REPO_ROOT, target)}\n`);
  }

  switch (failures) {
    case 0:
      return;
    default:
      throw new Error(`${failures} ordinary scenario(s) delivered an inexact stream; the measurement is not usable.`);
  }
}

function reportCliFailure(error, stderr, runtime) {
  stderr.write(`${error && error.stack ? error.stack : error}\n`);
  runtime.exitCode = 1;
}

function runCliIfMain(isMain, argv = process.argv.slice(2), dependencies) {
  switch (isMain) {
    case false:
      return null;
    default:
      break;
  }
  const runtime = runnerDependencies(dependencies);
  return Promise.resolve()
    .then(() => main(argv, runtime))
    .catch((error) => {
      reportCliFailure(error, runtime.stderr, runtime.process);
      return null;
    });
}

runCliIfMain(require.main === module);

module.exports = {
  ClientLane,
  DEFAULT_OPTIONS,
  SUITE_SCENARIOS,
  appVersion,
  attachClients,
  calibrationSentinel,
  currentCommit,
  machineIdentity,
  main,
  parseArgs,
  producerCommand,
  reportCliFailure,
  resultsPath,
  runCliIfMain,
  runCalibration,
  runScenario,
  runnerDependencies,
  startDefaultRendererLane,
  step,
  invalidatesMeasurement,
  scenariosForOptions,
  summarizeRepeats,
  waitForComplete,
  waitForMessage,
  writeSummary
};
