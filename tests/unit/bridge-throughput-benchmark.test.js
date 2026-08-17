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
 * The bridge throughput benchmark is in neither coverage gate, so it carries its
 * own correctness tests. An unverified harness produces unverified baselines,
 * and every later phase of the bridge performance work is decided by its
 * numbers.
 */

const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { EventEmitter } = require("node:events");
const { StringDecoder } = require("node:string_decoder");
const { execFile } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const codec = require("../../benchmarks/bridge-throughput/record-codec");
const producer = require("../../benchmarks/bridge-throughput/producer");
const metrics = require("../../benchmarks/bridge-throughput/metrics");
const bridgeControl = require("../../benchmarks/bridge-throughput/bridge-control");
const runner = require("../../benchmarks/bridge-throughput/run");
const acceptance = require("../../benchmarks/bridge-throughput/acceptance");
const { ClientLane } = runner;

const PRODUCER_PATH = path.join(__dirname, "..", "..", "benchmarks", "bridge-throughput", "producer.js");

function renderStream(seed, count, recordBytes = codec.DEFAULT_RECORD_BYTES, startMicros = 1_000_000) {
  let text = codec.renderStartMarker(seed, count, recordBytes, startMicros);
  for (let sequence = 1; sequence <= count; sequence += 1) {
    text += codec.renderRecord(codec.buildRecord(seed, sequence, recordBytes), startMicros + sequence * 100);
  }
  text += codec.renderEndMarker(codec.expectedDigest(seed, count, recordBytes), count, count * 100);
  return text;
}

function readAll(text, chunkSize = 0) {
  const reader = new codec.RecordStreamReader();
  if (chunkSize <= 0) {
    reader.push(text, 2_000_000);
    return reader;
  }
  for (let index = 0; index < text.length; index += chunkSize) {
    reader.push(text.slice(index, index + chunkSize), 2_000_000);
  }
  return reader;
}

function runProducerProcess(args) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [PRODUCER_PATH, ...args],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`${error.message} :: ${stderr}`));
        else resolve(stdout);
      }
    );
  });
}

describe("deterministic benchmark record generation", () => {
  it("produces identical payloads and hashes for the same seed and sequence", () => {
    const first = codec.buildRecord(7, 42);
    const second = codec.buildRecord(7, 42);
    expect(second).toEqual(first);
    expect(codec.buildRecord(8, 42).payload).not.toBe(first.payload);
  });

  it("renders byte-identical wire bytes for a fixed timestamp", () => {
    const record = codec.buildRecord(7, 42);
    expect(codec.renderRecord(record, 123456)).toBe(codec.renderRecord(codec.buildRecord(7, 42), 123456));
  });

  it("always carries at least one four-byte code point so a split boundary has something to corrupt", () => {
    for (let sequence = 1; sequence <= 50; sequence += 1) {
      const { payload } = codec.buildRecord(3, sequence);
      const hasAstral = [...payload].some((character) => character.codePointAt(0) > 0xffff);
      expect(hasAstral).toBe(true);
    }
  });

  it("keeps the framing separators out of the payload", () => {
    for (let sequence = 1; sequence <= 50; sequence += 1) {
      const { payload } = codec.buildRecord(11, sequence);
      expect(payload).not.toMatch(/[|\r\n\u001b]/);
    }
  });

  it("computes the same digest whether it is derived or observed", () => {
    const reader = readAll(renderStream(5, 25));
    expect(codec.streamDigest(reader.records)).toBe(codec.expectedDigest(5, 25));
  });
});

describe("benchmark stream reader", () => {
  it("recovers every record from one push", () => {
    const reader = readAll(renderStream(5, 40));
    expect(reader.records).toHaveLength(40);
    expect(reader.start).toMatchObject({ recordBytes: 100, records: 40, seed: 5 });
    expect(reader.isComplete()).toBe(true);
  });

  it("recovers every record when the stream is split at one-character boundaries", () => {
    const reader = readAll(renderStream(5, 12), 1);
    expect(reader.records).toHaveLength(12);
    expect(codec.checkStream(reader.records, { seed: 5 }).ok).toBe(true);
  });

  it("ignores interleaved shell noise between records", () => {
    const noisy = renderStream(5, 6).replace(/\r\n/g, "\r\nPS D:\\multiTerm> \u001b[93mecho hi\u001b[0m\r\n");
    const reader = readAll(noisy);
    expect(codec.checkStream(reader.records, { seed: 5 }).ok).toBe(true);
  });

  it("bounds retained text so unmatched noise cannot grow without limit", () => {
    const reader = new codec.RecordStreamReader();
    reader.push("x".repeat(200000), 1);
    expect(reader.buffer.length).toBeLessThanOrEqual(8192);
  });

  it("recovers records after ConPTY collapses the SGR reset into the next colour", () => {
    // Measured shape from a real ConPTY: the trailing ESC[0m is dropped and the
    // next record's colour code appears immediately after "|END", before the
    // CRLF. Anchoring the parser on the surrounding ANSI recovered zero records
    // from a live bridge even though every byte of payload had arrived.
    let conptyShaped = "\u001b[mMTB-START|5|8|100|1000000\r\n";
    for (let sequence = 1; sequence <= 8; sequence += 1) {
      const record = codec.buildRecord(5, sequence);
      const nextColour = sequence === 8 ? "\u001b[m" : `\u001b[38;5;${16 + ((sequence + 1) % 216)}m`;
      const prefix = sequence === 1 ? `\u001b[38;5;${record.colour}m` : "";
      conptyShaped += `${prefix}MTB|${sequence}|${1000000 + sequence * 100}|${record.hash}|${record.payload}|END${nextColour}\r\n`;
    }
    conptyShaped += `MTB-END|${codec.expectedDigest(5, 8)}|8|800\r\n`;

    expect(conptyShaped).not.toContain("|END\u001b[0m");
    const check = codec.checkStream(readAll(conptyShaped).records, { seed: 5 });
    expect(check.ok).toBe(true);
    expect(check.unique).toBe(8);
    expect(readAll(conptyShaped).isComplete()).toBe(true);
  });
});

describe("benchmark stream checker", () => {
  it("accepts an intact stream", () => {
    const reader = readAll(renderStream(9, 30));
    const check = codec.checkStream(reader.records, { seed: 9 });
    expect(check).toMatchObject({ duplicates: [], hashMismatches: [], missing: [], ok: true, unique: 30 });
  });

  it("detects an injected drop", () => {
    const reader = readAll(renderStream(9, 30));
    reader.records.splice(10, 1);
    const check = codec.checkStream(reader.records, { seed: 9 });
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual([11]);
  });

  it("detects a trailing drop against the expected record count", () => {
    const reader = readAll(renderStream(9, 30));
    reader.records.splice(28, 2);
    const check = codec.checkStream(reader.records, { expected: 30, seed: 9 });
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual([29, 30]);
  });

  it("detects an injected reorder", () => {
    const reader = readAll(renderStream(9, 30));
    const [moved] = reader.records.splice(20, 1);
    reader.records.splice(5, 0, moved);
    const check = codec.checkStream(reader.records, { seed: 9 });
    expect(check.ok).toBe(false);
    expect(check.reordered.length).toBeGreaterThan(0);
    expect(check.missing).toEqual([]);
  });

  it("detects a duplicated record", () => {
    const reader = readAll(renderStream(9, 30));
    reader.records.splice(10, 0, { ...reader.records[10] });
    const check = codec.checkStream(reader.records, { seed: 9 });
    expect(check.ok).toBe(false);
    expect(check.duplicates).toEqual([11]);
  });

  it("refuses to pass an empty stream", () => {
    // A client that recovered nothing must never be reported as byte-exact.
    expect(codec.checkStream([], { seed: 9 })).toMatchObject({ ok: false, received: 0 });
  });

  it("detects a multi-byte code point truncated at a decode boundary", () => {
    // Exactly the installed-bridge defect Phase 2.1 fixes: each native read is
    // decoded independently, so a 4-byte code point split across two reads
    // becomes replacement characters before it ever reaches the transport.
    const bytes = Buffer.from(renderStream(9, 30), "utf8");
    let splitAt = -1;
    for (let index = 1; index < bytes.length - 1; index += 1) {
      if (bytes[index] >= 0xf0 && bytes[index] <= 0xf4) {
        splitAt = index + 2;
        break;
      }
    }
    expect(splitAt).toBeGreaterThan(0);

    const corrupted = bytes.subarray(0, splitAt).toString("utf8") + bytes.subarray(splitAt).toString("utf8");
    const check = codec.checkStream(readAll(corrupted).records, { seed: 9 });
    expect(check.ok).toBe(false);
    expect(check.replacementCharacters + check.hashMismatches.length + check.missing.length).toBeGreaterThan(0);
  });

  it("accepts the same split when a streaming decoder preserves the code point", () => {
    const bytes = Buffer.from(renderStream(9, 30), "utf8");
    let splitAt = -1;
    for (let index = 1; index < bytes.length - 1; index += 1) {
      if (bytes[index] >= 0xf0 && bytes[index] <= 0xf4) {
        splitAt = index + 2;
        break;
      }
    }
    const decoder = new StringDecoder("utf8");
    const intact = decoder.write(bytes.subarray(0, splitAt))
      + decoder.write(bytes.subarray(splitAt))
      + decoder.end();
    expect(codec.checkStream(readAll(intact).records, { seed: 9 }).ok).toBe(true);
  });

  it("checks a stream without requiring seed-derived payloads", () => {
    const record = { sequence: 1, payload: "external payload", hash: codec.hashPayload("external payload") };
    expect(codec.checkStream([record])).toMatchObject({ ok: true, payloadMismatches: [] });
  });

  it("verifies bounded streams incrementally without retaining their records", () => {
    const verifier = new codec.StreamVerifier({ seed: 9, expected: 4 });
    verifier.accept(codec.buildRecord(9, 1));
    verifier.accept(codec.buildRecord(9, 1));
    verifier.accept(codec.buildRecord(9, 3));
    verifier.accept(codec.buildRecord(9, 8));
    verifier.accept(codec.buildRecord(9, 8));

    expect(verifier.summary()).toMatchObject({
      duplicates: 2,
      firstSequence: 1,
      lastSequence: 8,
      missing: 2,
      ok: false,
      received: 5,
      reordered: 2,
      unique: 3
    });
  });

  it("classifies incremental payload, hash, and decoder corruption", () => {
    const verifier = new codec.StreamVerifier({ seed: 11, expected: 3 });
    const hashMismatch = codec.buildRecord(11, 1);
    hashMismatch.payload = `${hashMismatch.payload.slice(0, -1)}x`;
    const payload = "payload that hashes correctly but is not seed-derived";
    const payloadMismatch = { sequence: 2, payload, hash: codec.hashPayload(payload) };
    const replacementPayload = "replacement \ufffd payload";
    const replacement = { sequence: 3, payload: replacementPayload, hash: codec.hashPayload(replacementPayload) };

    verifier.accept(hashMismatch);
    verifier.accept(payloadMismatch);
    verifier.accept(replacement);

    expect(verifier.summary()).toMatchObject({
      hashMismatches: 1,
      missing: 0,
      ok: false,
      payloadMismatches: 2,
      replacementCharacters: 1
    });
  });

  it("infers gaps without an expected count and caps diagnostic examples", () => {
    const verifier = new codec.StreamVerifier();
    expect(verifier.summary()).toMatchObject({ missing: 0, ok: false, received: 0 });
    verifier.accept({ sequence: 2, payload: "two", hash: codec.hashPayload("two") });
    verifier.accept({ sequence: 4, payload: "four", hash: codec.hashPayload("four") });
    for (let index = 0; index < 12; index += 1) {
      verifier.accept({ sequence: 4, payload: "four", hash: codec.hashPayload("four") });
    }
    const summary = verifier.summary();
    expect(summary).toMatchObject({ duplicates: 12, firstSequence: 2, lastSequence: 4, missing: 1 });
    expect(summary.examples).toHaveLength(10);
  });
});

describe("benchmark producer", () => {
  it("rejects unknown and malformed arguments", () => {
    expect(() => producer.parseProducerArgs(["--nope", "1"])).toThrow(/Unknown producer argument/);
    expect(() => producer.parseProducerArgs(["--records", "abc"])).toThrow(/non-negative number/);
    expect(() => producer.parseProducerArgs(["--records", "0"])).toThrow(/at least 1/);
    expect(() => producer.parseProducerArgs(["--chunk-records", "0"])).toThrow(/at least 1/);
    expect(() => producer.parseProducerArgs(["--record-bytes", "4"])).toThrow(/at least 16/);
  });

  it("parses the supported arguments", () => {
    expect(producer.parseProducerArgs(["--seed", "3", "--records", "10", "--rate", "0", "--digest-only"]))
      .toMatchObject({ digestOnly: true, rate: 0, records: 10, seed: 3 });
  });

  it("honours the write sink's backpressure signal", async () => {
    const written = [];
    let drainCallback = null;
    let allowed = 3;
    const sink = {
      onDrain: (fn) => { drainCallback = fn; setTimeout(() => { allowed = 1000; drainCallback(); }, 0); },
      write: (text) => {
        written.push(text);
        allowed -= 1;
        return allowed > 0;
      }
    };
    const result = await producer.streamRecords(
      { chunkRecords: 1, rate: 0, recordBytes: 100, records: 20, seed: 4 },
      sink
    );
    expect(result.emitted).toBe(20);
    expect(drainCallback).toBeTypeOf("function");
    expect(codec.checkStream(readAll(written.join("")).records, { seed: 4 }).ok).toBe(true);
  });

  it("emits identical digests across two real runs with the same seed", async () => {
    const args = ["--seed", "1234", "--records", "400", "--rate", "0", "--record-bytes", "100"];
    const [first, second] = await Promise.all([runProducerProcess(args), runProducerProcess(args)]);
    const firstReader = readAll(first);
    const secondReader = readAll(second);

    expect(firstReader.records).toHaveLength(400);
    expect(secondReader.records).toHaveLength(400);
    expect(firstReader.end.digest).toBe(secondReader.end.digest);
    expect(codec.streamDigest(firstReader.records)).toBe(firstReader.end.digest);
    expect(codec.streamDigest(secondReader.records)).toBe(firstReader.end.digest);
    expect(codec.checkStream(firstReader.records, { seed: 1234 }).ok).toBe(true);
  }, 30000);

  it("reports the digest without streaming when asked", async () => {
    const stdout = await runProducerProcess(["--seed", "1234", "--records", "400", "--digest-only"]);
    expect(stdout.trim()).toBe(codec.expectedDigest(1234, 400));
  }, 30000);

  it("runs digest and streaming modes through the in-process main contract", async () => {
    const digestWrites = [];
    const digestResult = await producer.main(
      ["--seed", "12", "--records", "3", "--digest-only"],
      { write: (text) => { digestWrites.push(text); return true; } }
    );
    expect(digestResult).toEqual({ digest: null, elapsedMicros: 0, emitted: 0 });
    expect(digestWrites.join("").trim()).toBe(codec.expectedDigest(12, 3));

    const stdout = new EventEmitter();
    const streamWrites = [];
    stdout.write = (text) => { streamWrites.push(text); return true; };
    const streamResult = await producer.main(
      ["--seed", "13", "--records", "3", "--rate", "0", "--chunk-records", "2"],
      stdout
    );
    expect(streamResult.emitted).toBe(3);
    expect(codec.checkStream(readAll(streamWrites.join("")).records, { expected: 3, seed: 13 }).ok).toBe(true);

    let writes = 0;
    const drainingStdout = {
      once: vi.fn((event, callback) => {
        expect(event).toBe("drain");
        callback();
      }),
      write: vi.fn(() => {
        writes += 1;
        return writes !== 2;
      })
    };
    expect((await producer.main(["--records", "1", "--rate", "0"], drainingStdout)).emitted).toBe(1);
    expect(drainingStdout.once).toHaveBeenCalledOnce();
  });

  it("paces rated output and yields after the per-tick chunk ceiling", async () => {
    vi.useFakeTimers();
    let elapsedMs = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => elapsedMs);
    let micros = 1_000_000;
    const clock = () => ++micros;
    const pacedWrites = [];
    const paced = producer.streamRecords(
      { chunkRecords: 1, rate: 1, recordBytes: 100, records: 2, seed: 5 },
      { write: (text) => { pacedWrites.push(text); return true; }, onDrain() {} },
      clock
    );
    elapsedMs = 1000;
    await vi.advanceTimersByTimeAsync(1);
    elapsedMs = 2000;
    await vi.advanceTimersByTimeAsync(1);
    expect((await paced).emitted).toBe(2);

    elapsedMs = 0;
    const unboundedWrites = [];
    const unbounded = producer.streamRecords(
      { chunkRecords: 1, rate: 0, recordBytes: 100, records: 257, seed: 6 },
      { write: (text) => { unboundedWrites.push(text); return true; }, onDrain() {} },
      clock
    );
    await vi.runAllTimersAsync();
    expect((await unbounded).emitted).toBe(257);
    expect(unboundedWrites.length).toBeGreaterThan(257);
    nowSpy.mockRestore();
    vi.useRealTimers();
  });

  it("runs and reports producer CLI outcomes without process-global writes", async () => {
    const stdout = { write: vi.fn(() => true) };
    const stderr = { write: vi.fn() };
    const runtime = { exitCode: 0 };
    expect(producer.runCliIfMain(false, [], stdout, stderr, runtime)).toBeNull();
    await expect(producer.runCliIfMain(
      true,
      ["--seed", "9", "--records", "2", "--digest-only"],
      stdout,
      stderr,
      runtime
    )).resolves.toMatchObject({ emitted: 0 });
    expect(runtime.exitCode).toBe(0);

    await expect(producer.runCliIfMain(true, ["--unknown"], stdout, stderr, runtime)).resolves.toBeNull();
    expect(runtime.exitCode).toBe(1);
    expect(stderr.write).toHaveBeenCalledWith(expect.stringContaining("Unknown producer argument"));

    const rawStderr = { write: vi.fn() };
    const rawRuntime = { exitCode: 0 };
    producer.reportCliFailure("raw failure", rawStderr, rawRuntime);
    expect(rawStderr.write).toHaveBeenCalledWith("producer failed: raw failure\n");
    expect(rawRuntime.exitCode).toBe(1);
  });
});

describe("benchmark statistics", () => {
  it("uses nearest-rank percentiles", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(metrics.percentile(values, 0.5)).toBe(5);
    expect(metrics.percentile(values, 0.95)).toBe(10);
    expect(metrics.percentile([], 0.5)).toBeNull();
  });

  it("summarizes a distribution", () => {
    expect(metrics.distribution([2, 4, 6])).toMatchObject({ count: 3, max: 6, mean: 4, min: 2, p50: 4 });
    expect(metrics.distribution([])).toMatchObject({ count: 0, max: null, mean: null });
  });

  it("reports relative spread for the stability gate", () => {
    expect(metrics.relativeSpread([10, 10, 10, 10, 10])).toBe(0);
    expect(metrics.relativeSpread([10, 11, 10, 10, 10])).toBe(0.1);
    expect(metrics.relativeSpread([10])).toBe(0);
    expect(metrics.relativeSpread([0, 0, 10])).toBe(0);
  });
});

describe("benchmark bridge control", () => {
  it("gives Windows PowerShell children the machine module path", () => {
    // 5.1 launched from a PowerShell 7 shell inherits pwsh's PSModulePath, then
    // loads PowerShell 7's Microsoft.PowerShell.Security and fails with "The
    // member AuditToString is already present", after which cmdlets from that
    // module do not exist at all.
    const environment = bridgeControl.windowsPowerShellEnvironment();
    expect(environment.PSModulePath).toBe(bridgeControl.WINDOWS_POWERSHELL_MODULE_PATH);
    // A leading separator matters: "WindowsPowerShell\Modules" legitimately
    // contains "PowerShell\Modules".
    expect(environment.PSModulePath).not.toMatch(/\\PowerShell\\7\\|\\PowerShell\\Modules/i);
    expect(environment.PSModulePath).toMatch(/WindowsPowerShell\\v1\.0\\Modules$/i);
  });

  it("finds a port that is not listening", async () => {
    const port = await bridgeControl.findFreePort();
    expect(port).toBeGreaterThan(0);
    expect(await bridgeControl.isPortListening(port)).toBe(false);
  });

  it("detects a listener on an occupied port", async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      expect(await bridgeControl.isPortListening(port)).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    expect(await bridgeControl.isPortListening(port)).toBe(false);
  });

  it("refuses to benchmark against a port that is already in use", async () => {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
      await expect(bridgeControl.startBridge({ mode: "node", port })).rejects.toThrow(/already in use/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("suppresses watchdog prompts before a benchmark uses its bridge", async () => {
    let suppressed = false;
    const server = require("node:http").createServer((request, response) => {
      if (request.url === "/watchdog/keep") {
        expect(request.method).toBe("POST");
        expect(request.headers["x-multiterm-request"]).toBe("Launcher");
        suppressed = true;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true, watchdogSuppressed: true }));
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, watchdogSuppressed: suppressed }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const health = await bridgeControl.suppressWatchdog(server.address().port);
      expect(health.watchdogSuppressed).toBe(true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("benchmark run configuration", () => {
  it("parses benchmark arguments and rejects unknown ones", () => {
    expect(runner.parseArgs(["--mode", "installed", "--clients", "8", "--renderer", "--slow-client"]))
      .toMatchObject({ clients: 8, mode: "installed", renderer: true, slowClient: true });
    expect(() => runner.parseArgs(["--bogus"])).toThrow(/Unknown benchmark argument/);
    expect(() => runner.parseArgs(["--mode", "remote"])).toThrow(/--mode must be/);
    expect(() => runner.parseArgs(["--clients", "0"])).toThrow(/positive integer/);
  });

  it("builds a producer command that quotes its script path", () => {
    const command = runner.producerCommand({ rate: 100, recordBytes: 100, seed: 5 }, 42);
    expect(command).toContain("--records 42");
    expect(command).toContain("--seed 5");
    expect(command).toMatch(/node "[^"]+producer\.js"/);
  });

  it("defaults to a shell that exists on every Windows machine", () => {
    // Both bridges default to pwsh.exe, which a clean Windows guest does not
    // have; the request then failed as an unexplained 30 s timeout.
    expect(runner.DEFAULT_OPTIONS.shell).toBe("powershell");
    expect(runner.parseArgs(["--shell", "cmd"]).shell).toBe("cmd");
  });

  it("covers every Phase 0 baseline scenario", () => {
    expect(runner.SUITE_SCENARIOS.map((scenario) => scenario.name))
      .toEqual(["clients-1", "clients-2", "clients-4", "clients-8", "slow-client", "idle-control"]);
  });

  it("summarizes repeats and flags an unstable harness", () => {
    const run = (p95) => ({
      clients: [{ check: { ok: true }, latencyMs: { p95 }, paused: false }],
      recordsPerSecond: 1000
    });
    const stable = runner.summarizeRepeats([run(10), run(10.5), run(10.2), run(10.4), run(10.1)], {});
    expect(stable.stable).toBe(true);
    expect(stable.exactOutput).toBe(true);

    const unstable = runner.summarizeRepeats([run(10), run(30), run(12), run(11), run(10)], {});
    expect(unstable.stable).toBe(false);
  });

  it("ignores a paused client when judging exactness and stability", () => {
    const runs = [{
      clients: [
        { check: { ok: true }, latencyMs: { p95: 5 }, paused: false },
        { check: { ok: false }, latencyMs: { p95: 900 }, paused: true }
      ],
      recordsPerSecond: 1000
    }];
    const summary = runner.summarizeRepeats(runs, {});
    expect(summary.exactOutput).toBe(true);
    expect(summary.headlineValues).toEqual([5]);
  });

  it("does not claim exactness for the idle control run", () => {
    const runs = [{ clients: [{ check: { ok: false }, latencyMs: { p95: null }, paused: false }], recordsPerSecond: 0 }];
    const summary = runner.summarizeRepeats(runs, { idle: true });
    expect(summary.exactOutput).toBeNull();
    expect(summary.stable).toBe(true);
  });

  it("records an incomplete run rather than discarding the scenario", () => {
    // On the installed bridge one wedged client blocked the fan-out and the
    // healthy clients never finished. That is the measurement, not an error.
    const runs = [
      { clients: [{ check: { ok: true }, latencyMs: { p95: 5 }, paused: false }], completed: false, recordsPerSecond: 10 },
      { clients: [{ check: { ok: true }, latencyMs: { p95: 6 }, paused: false }], completed: true, recordsPerSecond: 20 }
    ];
    expect(runner.summarizeRepeats(runs, {}).completedRuns).toBe(1);
  });

  it("accepts a slow-client failure as evidence but rejects ordinary inexact output", () => {
    const failed = { exactOutput: false };
    expect(runner.invalidatesMeasurement(failed, { name: "slow-client", slowClient: true })).toBe(false);
    expect(runner.invalidatesMeasurement(failed, { name: "clients-4" })).toBe(true);
    expect(runner.invalidatesMeasurement({ exactOutput: true }, { name: "clients-4" })).toBe(false);
  });

  it("names a result file per label, bridge mode, and scenario", () => {
    const target = runner.resultsPath({ label: "baseline", mode: "node", out: "" }, { name: "clients-4" });
    expect(target.endsWith(path.join("results", "baseline-node-clients-4.json"))).toBe(true);
  });

  it("keeps a standalone idle control from overwriting the clients-4 result", () => {
    const options = runner.parseArgs(["--mode", "node", "--clients", "4", "--idle"]);
    expect(options).toMatchObject({ clients: 4, idle: true });
    expect(runner.scenariosForOptions(options)).toEqual([{
      clients: 4,
      idle: true,
      name: "idle-control",
      slowClient: false
    }]);
  });
});

describe("benchmark baseline acceptance", () => {
  function summary(mode, scenario, overrides = {}) {
    const clients = scenario.startsWith("clients-") ? Number(scenario.slice(8)) : 4;
    const runs = Array.from({ length: 5 }, () => ({
      bridge: { health: { ok: true } },
      clients: Array.from({ length: clients }, () => ({ check: { ok: true } })),
      durationMs: 1000,
      harness: { sampleCount: 5 },
      renderer: { messages: 1 }
    }));
    return {
      aggregate: { completedRuns: 5, exactOutput: scenario === "idle-control" ? null : true, stable: true },
      bridgeMode: mode,
      clients,
      machine: { hostname: "VM" },
      renderer: true,
      repeats: 5,
      runs,
      scenario,
      workload: { rate: 9700, recordBytes: 145 },
      ...overrides
    };
  }

  it("classifies pre-fix bridge failures without invalidating their measurement", () => {
    expect(acceptance.classifyOutcome(null)).toBe("inexact");
    expect(acceptance.classifyOutcome(summary("installed", "slow-client", {
      aggregate: { completedRuns: 0, exactOutput: false, stable: true }
    }))).toBe("blocked");
    expect(acceptance.classifyOutcome(summary("installed", "clients-1", {
      aggregate: { completedRuns: 5, exactOutput: false, stable: true }
    }))).toBe("inexact");
    expect(acceptance.classifyOutcome(summary("installed", "clients-1", {
      aggregate: { completedRuns: 5, exactOutput: true, stable: false }
    }))).toBe("unstable");
    expect(acceptance.classifyOutcome(summary("node", "clients-1"))).toBe("pass");
    expect(acceptance.classifyOutcome(summary("node", "idle-control"))).toBe("control");
  });

  it("reports every malformed summary contract", () => {
    expect(acceptance.validateSummary(null, "node", "clients-1", "VM"))
      .toEqual(["summary is not an object"]);
    const malformed = {
      bridgeMode: "installed",
      clients: 2,
      machine: {},
      renderer: false,
      repeats: 4,
      runs: [null],
      scenario: "clients-8",
      workload: { rate: Number.NaN }
    };
    expect(acceptance.validateSummary(malformed, "node", "clients-1", "VM"))
      .toEqual(expect.arrayContaining([
        "bridgeMode is installed",
        "scenario is clients-8",
        "renderer lane was not enabled",
        "expected 5 runs",
        "machine identity is missing",
        "workload metadata is incomplete",
        "run 1 has no healthy bridge record",
        "run 1 has no duration",
        "run 1 has insufficient samples",
        "run 1 has no renderer summary",
        "run 1 client count is wrong"
      ]));
    expect(acceptance.validateSummary({
      ...summary("node", "clients-1"),
      machine: { hostname: "OTHER" },
      repeats: 5,
      runs: {}
    }, "node", "clients-1", "VM")).toEqual(expect.arrayContaining([
      "expected 5 runs",
      "machine is OTHER, expected VM"
    ]));
  });

  it("reports missing baseline files and exposes an injectable CLI contract", () => {
    const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "mtb-acceptance-empty-"));
    try {
      const report = acceptance.evaluateBaselineDirectory(directory);
      expect(report).toMatchObject({ configuration: null, phase1Ready: false, valid: false });
      expect(report.errors).toEqual(expect.arrayContaining([
        expect.stringContaining("cannot read vm-configuration.json"),
        expect.stringContaining("cannot read summary")
      ]));
      expect(report.outcomes.every((row) => row.outcome === "missing" && row.valid === false)).toBe(true);

      const stdout = { write: vi.fn() };
      const runtime = { exitCode: 0 };
      expect(acceptance.runCliIfMain(false, [directory], stdout, runtime)).toBeNull();
      const cliReport = acceptance.runCliIfMain(true, [directory], stdout, runtime);
      expect(cliReport.valid).toBe(false);
      expect(runtime.exitCode).toBe(1);
      expect(JSON.parse(stdout.write.mock.calls[0][0])).toMatchObject({ valid: false });
      const defaultReport = acceptance.main([], { write: vi.fn() }, { exitCode: 0 });
      expect(defaultReport).toHaveProperty("valid");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reports unreadable app versions and both missing revision labels", () => {
    const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "mtb-acceptance-errors-"));
    const configurationPath = path.join(directory, "vm-configuration.json");
    const summaryPath = path.join(directory, "vm-baseline-node-clients-1.json");
    try {
      fs.writeFileSync(configurationPath, JSON.stringify({
        AssignedMemoryBytes: 1024,
        DynamicMemoryEnabled: false,
        SourceRevision: "expected-source"
      }));
      const value = summary("node", "clients-1", { appVersion: "1.0.0" });
      delete value.sourceRevision;
      fs.writeFileSync(summaryPath, JSON.stringify(value));
      const originalRead = fs.readFileSync;
      const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation((target, ...args) => {
        if (String(target).endsWith("package.json")) throw new Error("package unavailable");
        return originalRead(target, ...args);
      });
      const unreadableVersion = acceptance.evaluateBaselineDirectory(directory);
      readSpy.mockRestore();
      expect(unreadableVersion.errors).toEqual(expect.arrayContaining([
        "cannot read current app version: package unavailable",
        expect.stringContaining("sourceRevision is missing, expected expected-source")
      ]));

      fs.writeFileSync(configurationPath, JSON.stringify({
        AssignedMemoryBytes: 1024,
        DynamicMemoryEnabled: false
      }));
      value.sourceRevision = "actual-source";
      fs.writeFileSync(summaryPath, JSON.stringify(value));
      expect(acceptance.evaluateBaselineDirectory(directory).errors).toEqual(expect.arrayContaining([
        expect.stringContaining("sourceRevision is actual-source, expected missing")
      ]));
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects dynamic-memory, incomplete, and machine-mixed baseline sets", () => {
    const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "mtb-acceptance-"));
    try {
      fs.writeFileSync(path.join(directory, "vm-configuration.json"), JSON.stringify({
        AssignedMemoryBytes: 1024,
        DynamicMemoryEnabled: true,
        SourceRevision: "source-a"
      }));
      for (const mode of acceptance.MODES) {
        for (const scenario of acceptance.SCENARIOS) {
          const value = summary(mode, scenario);
          value.appVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")).version;
          value.sourceRevision = "source-a";
          if (mode === "installed" && scenario === "clients-2") value.machine.hostname = "OTHER";
          fs.writeFileSync(path.join(directory, `vm-baseline-${mode}-${scenario}.json`), JSON.stringify(value));
        }
      }
      const report = acceptance.evaluateBaselineDirectory(directory);
      expect(report.valid).toBe(false);
      expect(report.errors).toEqual(expect.arrayContaining([
        "authoritative VM baseline must use fixed memory",
        expect.stringContaining("machine is OTHER")
      ]));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("accepts a fixed-memory set that faithfully records a blocked bridge", () => {
    const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "mtb-acceptance-"));
    try {
      fs.writeFileSync(path.join(directory, "vm-configuration.json"), JSON.stringify({
        AssignedMemoryBytes: 10737418240,
        DynamicMemoryEnabled: false,
        SourceRevision: "source-a"
      }));
      for (const mode of acceptance.MODES) {
        for (const scenario of acceptance.SCENARIOS) {
          const overrides = mode === "installed" && scenario === "slow-client"
            ? { aggregate: { completedRuns: 0, exactOutput: false, stable: true } }
            : {};
          const value = summary(mode, scenario, overrides);
          value.appVersion = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")).version;
          value.sourceRevision = "source-a";
          fs.writeFileSync(path.join(directory, `vm-baseline-${mode}-${scenario}.json`), JSON.stringify(value));
        }
      }
      const report = acceptance.evaluateBaselineDirectory(directory);
      expect(report.valid).toBe(true);
      expect(report.phase1Ready).toBe(true);
      expect(report.outcomes.find((row) => row.mode === "installed" && row.scenario === "slow-client"))
        .toMatchObject({ outcome: "blocked", valid: true });

      const stdout = { write: vi.fn() };
      const runtime = { exitCode: 0 };
      expect(acceptance.main([directory], stdout, runtime).valid).toBe(true);
      expect(runtime.exitCode).toBe(0);

      const stalePath = path.join(directory, "vm-baseline-node-clients-1.json");
      const stale = JSON.parse(fs.readFileSync(stalePath, "utf8"));
      stale.appVersion = "0.0.1";
      stale.sourceRevision = "source-old";
      fs.writeFileSync(stalePath, JSON.stringify(stale));
      const rejected = acceptance.evaluateBaselineDirectory(directory);
      expect(rejected.valid).toBe(false);
      expect(rejected.errors).toEqual(expect.arrayContaining([
        expect.stringContaining("appVersion is 0.0.1"),
        expect.stringContaining("sourceRevision is source-old")
      ]));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("benchmark VM deployment", () => {
  // The VM script drives the user's only virtual machine with their Windows
  // credentials, so its guard rails are pinned rather than trusted to review.
  const vmScript = fs.readFileSync(
    path.join(__dirname, "..", "..", "benchmarks", "bridge-throughput", "run-in-vm.ps1"),
    "utf8"
  );

  it("refuses to run without elevation", () => {
    expect(vmScript).toContain("function Assert-Elevated");
    expect(vmScript).toMatch(/Assert-Elevated\s*\r?\n/);
    expect(vmScript).toContain("Hyper-V management requires an elevated session");
  });

  it("refuses to guess which virtual machine to use", () => {
    expect(vmScript).toContain("Pass -VMName to choose one.");
    expect(vmScript).toContain("No Hyper-V virtual machines were found on this host.");
  });

  it("never starts or reconfigures the machine without being asked", () => {
    expect(vmScript).toContain("Re-run with -StartVM to start it.");
    expect(vmScript).not.toMatch(/Set-VMProcessor|Remove-VM\b|Checkpoint-VM/);
    // Memory is the one exception, and only when a size is explicitly supplied.
    expect(vmScript).toContain("if ($Bytes -le 0) { return }");
  });

  it("reapplies the pinned memory after a restore, because a restore reverts it", () => {
    const restoreIndex = vmScript.indexOf("Restore-VMCheckpointAndWait -Checkpoint $checkpoint");
    const memoryIndex = vmScript.indexOf("Set-GuestFixedMemory -Name $Name -Bytes $FixedMemoryBytes");
    expect(restoreIndex).toBeGreaterThan(-1);
    expect(memoryIndex).toBeGreaterThan(restoreIndex);
    expect(vmScript).toContain("Set-VMMemory -VMName $Name -DynamicMemoryEnabled $false -StartupBytes $Bytes");
    expect(vmScript).toContain("function Wait-VMStableState");
    expect(vmScript).toContain("function Wait-VMState");
    expect(vmScript).toContain("function Restore-VMCheckpointAndWait");
    expect(vmScript).toContain("if ($stableSamples -ge 3) { return $state }");
    expect(vmScript).toContain("Restore-VMSnapshot -VMSnapshot $Checkpoint -Confirm:$false -AsJob");
    expect(vmScript).toContain("Wait-Job -Job $job -Timeout $TimeoutSeconds");
    expect(vmScript).toContain("ExpectedState $Checkpoint.State.ToString()");
    expect(vmScript).toContain("Remove-VMSavedState -VMName $Name -Confirm:$false");
    expect(vmScript).toContain("Wait-VMState -Name $Name -ExpectedState 'Off'");
    expect(vmScript).toMatch(/Restore-VMCheckpointAndWait -Checkpoint \$checkpoint\s*Repair-GuestNetworkAdapter/);
    expect(vmScript).toMatch(/Stop-VM -Name \$Name -TurnOff -Force -Confirm:\$false\s*\$state = Wait-VMState -Name \$Name -ExpectedState 'Off'/);
  });

  it("reconciles a network adapter that the checkpoint bound to a deleted switch", () => {
    // A checkpoint restores the VM's network configuration, so it can reinstate
    // a binding to a switch that no longer exists and the VM then refuses to
    // start at all.
    expect(vmScript).toContain("function Repair-GuestNetworkAdapter");
    const repairIndex = vmScript.indexOf("Repair-GuestNetworkAdapter -Name $Name");
    const restoreIndex = vmScript.indexOf("Restore-VMCheckpointAndWait -Checkpoint $checkpoint");
    expect(restoreIndex).toBeGreaterThan(-1);
    expect(repairIndex).toBeGreaterThan(restoreIndex);
    // Attaching to an external switch rebinds a physical adapter and can drop
    // host connectivity, so only an internal switch is ever a target.
    expect(vmScript).toContain("$_.SwitchType -eq 'Internal'");
    expect(vmScript).not.toMatch(/New-VMSwitch|Remove-VMSwitch|Set-VMSwitch/);
  });

  it("never logs a credential or writes one in plaintext", () => {
    expect(vmScript).not.toMatch(/Write-(Host|Output|Step|Warning|Verbose)[^\r\n]*\$(Credential|GuestCredential)\b(?!\.UserName)/);
    // The only permitted way it reaches disk is Export-Clixml, which is DPAPI
    // protected and scoped to this user on this machine.
    expect(vmScript).not.toMatch(/(Set-Content|Out-File|Add-Content|ConvertTo-Json)[^\r\n]*\$(Credential|GuestCredential)/);
    expect(vmScript).not.toMatch(/GetNetworkCredential\(\)|\.Password\b/);
  });

  it("stores the credential only when explicitly asked, and only DPAPI protected", () => {
    // Typing the guest password on every run is friction that invites worse
    // workarounds, but persisting it is still an opt-in decision.
    expect(vmScript).toContain("if ($SaveCredential -and $CredentialPath)");
    expect(vmScript).toContain("$Credential | Export-Clixml -LiteralPath $CredentialPath");
    expect(vmScript).toContain("$Credential = Import-Clixml -LiteralPath $CredentialPath");
    expect(vmScript).toContain("is not an exported PSCredential");
    expect(vmScript).toContain("RemoveCredentialAfterUse");
    expect(vmScript).toContain("Remove-Item -LiteralPath $CredentialPath -Force");
    // Exactly one place writes it; the other mention is documentation.
    const exportCalls = vmScript.match(/\|\s*Export-Clixml/g) || [];
    expect(exportCalls).toHaveLength(1);
  });

  it("excludes machine-specific and rebuildable directories from the payload", () => {
    for (const excluded of ["node_modules", ".git", "coverage", "test-results", "Output", "target", "bin", "obj", "publish"]) {
      expect(vmScript).toContain(`'${excluded}'`);
    }
    expect(vmScript).toContain("/XD");
  });

  it("deploys offline so the guest never needs a network", () => {
    // Guest internet on this host depends on ICS/NAT, and repairing that is
    // riskier than removing the need for it. Advisory text may name the online
    // commands; what must not exist is an actual invocation of one.
    expect(vmScript).not.toMatch(/Invoke-WebRequest|Start-BitsTransfer|nodejs\.org|msiexec/);
    expect(vmScript).not.toMatch(/&\s*(npm|npx)\b/);
    expect(vmScript).toContain("$GuestNodePath");
    expect(vmScript).toContain("PLAYWRIGHT_BROWSERS_PATH");
    expect(vmScript).toContain("chromium_headless_shell-*");
  });

  it("does not ship dependencies the benchmark never loads", () => {
    expect(vmScript).toContain("'electron'");
    expect(vmScript).toContain("'@anthropic-ai'");
  });

  it("verifies the guest deployment before measuring anything", () => {
    expect(vmScript).toContain("node-pty is missing in the guest");
    expect(vmScript).toContain("Node did not run in the guest.");
    expect(vmScript).toContain("does not match the host's");
  });

  it("treats robocopy exit codes below 8 as success", () => {
    expect(vmScript).toContain("if ($LASTEXITCODE -ge 8)");
  });

  it("only deletes guest state inside folders it deployed itself", () => {
    expect(vmScript).toContain("if ($CleanGuest)");
    expect(vmScript).toContain("foreach ($target in @($Repo, $NodeDir, $Browsers))");
    // Every guest path this script may clear is one it created.
    for (const guestPath of ["'C:\\multiterm-benchmark'", "'C:\\multiterm-node'", "'C:\\multiterm-browsers'"]) {
      expect(vmScript).toContain(guestPath);
    }
    expect(vmScript).not.toMatch(/Remove-Item[^\r\n]*\$env:(USERPROFILE|WINDIR|SystemRoot|LOCALAPPDATA)/);
  });

  it("never ships the host's own summaries into the guest, and verifies what comes back", () => {
    // The host results directory travelled in with the payload once and was
    // copied straight back out, so six host baselines were recorded as VM
    // results - one of them still naming the host in its machine block.
    expect(vmScript).toContain("-ExcludedPaths @($resultsRoot)");
    expect(vmScript).toContain("$ExpectedHostName");
    expect(vmScript).toContain("but the guest is");
    const guardIndex = vmScript.indexOf("if ($recorded -ne $ExpectedHostName)");
    const acceptIndex = vmScript.indexOf("$saved += 1");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(acceptIndex).toBeGreaterThan(guardIndex);
  });

  it("passes remote arguments by using-scope rather than positional binding", () => {
    // A [bool] parameter did not survive the remoting boundary, and positional
    // binding reports the failure against the wrong parameter name.
    expect(vmScript).toContain("$using:rendererEnabled");
    expect(vmScript).toContain("$rendererEnabled = [bool]$Renderer");
    // No remote scriptblock may declare a [bool] parameter; that is the binding
    // that failed, and it reports against the wrong parameter name when it does.
    expect(vmScript).not.toMatch(/param\([^)]*\[bool\]/);
  });

  it("runs each scenario in an isolated Node process so one native crash cannot abort the suite", () => {
    expect(vmScript).toContain("Running the \" + $bridgeMode + \" bridge scenarios in isolated processes.");
    for (const scenario of ["clients-1", "clients-2", "clients-4", "clients-8", "slow-client", "idle-control"]) {
      expect(vmScript).toContain(`Name = '${scenario}'`);
    }
    expect(vmScript).toContain("foreach ($scenario in $scenarios)");
    expect(vmScript).not.toContain("'--suite'");
    expect(vmScript).toContain("continuing with the next isolated scenario");
  });

  it("copies results back even when a scenario was inexact", () => {
    expect(vmScript).toContain("process exited with code");
    expect(vmScript).toContain("continuing with the next isolated scenario");
    expect(vmScript).toContain("-FromSession $Session");
    expect(vmScript).toContain("vm-configuration.json");
  });

  it("rescues results before it resets the guest", () => {
    // Restoring a checkpoint discards the summaries, so the ordering is the
    // whole safety property here.
    const copyIndex = vmScript.indexOf("Save-BenchmarkResults -Session");
    const restoreIndex = vmScript.indexOf("Reason 'run finished'");
    expect(copyIndex).toBeGreaterThan(-1);
    expect(restoreIndex).toBeGreaterThan(copyIndex);
    // ...and the rescue lives in finally, so a run that fails part way still yields data.
    expect(vmScript.indexOf("finally {")).toBeLessThan(copyIndex);
  });

  it("resets a guest left running by an interrupted attempt before measuring", () => {
    expect(vmScript).toContain("Reason 'clean start'");
    const cleanStartIndex = vmScript.indexOf("Reason 'clean start'");
    const deployIndex = vmScript.indexOf("Packaging Node");
    expect(cleanStartIndex).toBeGreaterThan(-1);
    expect(deployIndex).toBeGreaterThan(cleanStartIndex);
    expect(vmScript).toContain("Stop-VM -Name $Name -TurnOff -Force -Confirm:$false");
  });

  it("never treats Hyper-V's automatic checkpoint as a restore target", () => {
    expect(vmScript).toContain("$automaticCheckpointPrefix = 'Automatic Checkpoint'");
    expect(vmScript).toContain("StartsWith($automaticCheckpointPrefix)");
  });

  it("refuses to guess when the checkpoint is ambiguous or absent", () => {
    expect(vmScript).toContain("has no checkpoints, so the guest cannot be reset");
    expect(vmScript).toContain("Cannot choose a checkpoint for");
    expect(vmScript).toContain("Pass -CheckpointName");
    expect(vmScript).toContain("was not found. Available:");
    // Restoring must never sit behind an unanswerable confirmation prompt.
    expect(vmScript).toContain("Restore-VMSnapshot -VMSnapshot $Checkpoint -Confirm:$false -AsJob");
  });

  it("only resets a guest it actually touched, and honours the opt-out", () => {
    expect(vmScript).toContain("if ($guestModified -and -not $KeepGuestState)");
    expect(vmScript).toContain("$guestModified = $false");
    expect(vmScript).toContain("Leaving the guest as it is (-KeepGuestState).");
  });

  it("repairs the inherited module path before it needs Get-Credential", () => {
    expect(vmScript).toContain("[Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')");
    const repairIndex = vmScript.indexOf("$env:PSModulePath = $machineModulePath");
    const credentialIndex = vmScript.indexOf("$Credential = Get-Credential");
    expect(repairIndex).toBeGreaterThan(-1);
    expect(credentialIndex).toBeGreaterThan(repairIndex);
  });

  it("records the guest configuration that moves the numbers", () => {
    expect(vmScript).toContain("DynamicMemoryEnabled");
    expect(vmScript).toContain("ProcessorCount");
    expect(vmScript).toContain("Remove-PSSession -Session $session");
  });
});

describe("benchmark client lane", () => {
  it("records a dropped client instead of crashing the benchmark", () => {
    // An EventEmitter with no error listener throws, and the installed bridge
    // reset a client mid-run, which took the whole process down.
    const { RawBridgeClient } = require("../../benchmarks/bridge-throughput/raw-client");
    const client = new RawBridgeClient({ port: 1 });
    expect(() => client.emit("error", new Error("read ECONNRESET"))).not.toThrow();
    expect(client.lastError).toBe("read ECONNRESET");
  });

  it("keeps a deliberately paused client marked as paused after its socket resumes", () => {
    // The socket is resumed before the summary is taken, so reading the live
    // flag reported the wedged client as healthy and made its multi-second
    // latency the scenario headline.
    const client = { bytesReceived: 0, label: "raw-4", paused: true, pauseReads() { this.paused = true; } };
    const lane = new ClientLane(client, { expected: 5, recordBytes: 100, seed: 31 });
    lane.pauseReads();
    client.paused = false;
    lane.reader.push(renderStream(31, 5), 2_000_000);
    expect(lane.summarize().paused).toBe(true);
  });

  it("reports delivery latency, wire overhead, and exactness", () => {
    const lane = new ClientLane(
      { bytesReceived: 4096, label: "raw-1", paused: false },
      { expected: 20, recordBytes: 100, seed: 31 }
    );
    const text = renderStream(31, 20);
    lane.outputMessages = 1;
    lane.outputWireBytes = Buffer.byteLength(JSON.stringify({ data: text, id: "x", type: "output" }), "utf8");
    lane.outputPayloadChars = Buffer.byteLength(text, "utf8");
    lane.reader.push(text, 1_000_000 + 20 * 100 + 5000);

    const summary = lane.summarize();
    expect(summary.check.ok).toBe(true);
    expect(summary.check.unique).toBe(20);
    expect(summary.latencyMs.count).toBe(20);
    expect(summary.wireOverheadRatio).toBeGreaterThan(1);
    expect(summary.producerEnd.emitted).toBe(20);
  });

  it("reports a truncated stream as not exact against the expected count", () => {
    const lane = new ClientLane(
      { bytesReceived: 10, label: "raw-3", paused: false },
      { expected: 10, recordBytes: 100, seed: 31 }
    );
    // Only the first six records ever arrive.
    let partial = codec.renderStartMarker(31, 10, 100, 1_000_000);
    for (let sequence = 1; sequence <= 6; sequence += 1) {
      partial += codec.renderRecord(codec.buildRecord(31, sequence, 100), 1_000_000 + sequence * 100);
    }
    lane.reader.push(partial, 2_000_000);
    const summary = lane.summarize();
    expect(summary.check.missing).toBe(4);
    expect(summary.check.ok).toBe(false);
  });

  it("reports a corrupted stream as not exact", () => {
    const lane = new ClientLane(
      { bytesReceived: 10, label: "raw-2", paused: false },
      { expected: 10, recordBytes: 100, seed: 31 }
    );
    // Record 5 never arrives, so the sequence has a hole.
    let dropped = codec.renderStartMarker(31, 10, 100, 1_000_000);
    for (let sequence = 1; sequence <= 10; sequence += 1) {
      if (sequence === 5) continue;
      dropped += codec.renderRecord(codec.buildRecord(31, sequence, 100), 1_000_000 + sequence * 100);
    }
    lane.reader.push(dropped, 2_000_000);
    const summary = lane.summarize();
    expect(summary.check.ok).toBe(false);
    expect(summary.check.missing).toBe(1);
    expect(summary.check.received).toBe(9);
  });

  it("keeps memory bounded by verifying on arrival instead of retaining records", () => {
    // Retaining every parsed record cost over a gigabyte at 8 clients x 120,000
    // records and killed a guest run.
    const lane = new ClientLane(
      { bytesReceived: 0, label: "raw-1", paused: false },
      { expected: 200, recordBytes: 100, seed: 31 }
    );
    lane.reader.push(renderStream(31, 200), 2_000_000);
    expect(lane.reader.records).toHaveLength(0);
    expect(lane.reader.completed).toBe(200);
    expect(lane.summarize().check).toMatchObject({ ok: true, received: 200, unique: 200 });
  });
});
