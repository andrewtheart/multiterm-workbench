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
 * Deterministic terminal output producer for the bridge throughput benchmark.
 *
 * Launched INSIDE a real terminal in either bridge, so the measurement covers
 * the same shell -> ConPTY -> bridge -> fan-out path the product uses, rather
 * than a Node-only injected fake.
 *
 *   node producer.js --seed 1 --records 20000 --rate 11000 --record-bytes 100
 *
 * --rate is chunks per second (0 = as fast as the pipe accepts). --chunk-records
 * controls how many records share one write, which is what varies the chunk size
 * arriving at the PTY.
 */

"use strict";

const { performance } = require("node:perf_hooks");
const codec = require("./record-codec");

const DEFAULT_OPTIONS = Object.freeze({
  chunkRecords: 1,
  digestOnly: false,
  rate: 11000,
  recordBytes: codec.DEFAULT_RECORD_BYTES,
  records: 20000,
  seed: 1
});

const NUMBER_FLAGS = new Map([
  ["--chunk-records", "chunkRecords"],
  ["--rate", "rate"],
  ["--record-bytes", "recordBytes"],
  ["--records", "records"],
  ["--seed", "seed"]
]);

/**
 * @param {string[]} argv
 * @returns {typeof DEFAULT_OPTIONS}
 */
function parseProducerArgs(argv) {
  const options = { ...DEFAULT_OPTIONS };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--digest-only") {
      options.digestOnly = true;
      continue;
    }
    const key = NUMBER_FLAGS.get(flag);
    if (!key) throw new Error(`Unknown producer argument: ${flag}`);
    const raw = argv[index + 1];
    index += 1;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${flag} needs a non-negative number, received: ${String(raw)}`);
    }
    options[key] = Math.round(value);
  }
  if (options.records < 1) throw new Error("--records must be at least 1");
  if (options.chunkRecords < 1) throw new Error("--chunk-records must be at least 1");
  if (options.recordBytes < 16) throw new Error("--record-bytes must be at least 16");
  return options;
}

function nowMicros() {
  return Math.round((performance.timeOrigin + performance.now()) * 1000);
}

// One tick may not emit unboundedly, or an unthrottled run would block the event
// loop for the whole stream and stop honouring stdout backpressure.
const MAX_CHUNKS_PER_TICK = 256;

/**
 * Streams the deterministic record sequence.
 *
 * @param {typeof DEFAULT_OPTIONS} options
 * @param {{ write: (text: string) => boolean, onDrain: (fn: () => void) => void }} sink
 * @param {() => number} clock microsecond clock
 * @returns {Promise<{ emitted: number, digest: string, elapsedMicros: number }>}
 */
function streamRecords(options, sink, clock = nowMicros) {
  return new Promise((resolve) => {
    const startedAtMicros = clock();
    const startedAtMs = performance.now();
    sink.write(codec.renderStartMarker(options.seed, options.records, options.recordBytes, startedAtMicros));

    let emitted = 0;
    let emittedChunks = 0;

    const finish = () => {
      const elapsedMicros = clock() - startedAtMicros;
      const digest = codec.expectedDigest(options.seed, emitted, options.recordBytes);
      sink.write(codec.renderEndMarker(digest, emitted, elapsedMicros));
      resolve({ digest, elapsedMicros, emitted });
    };

    const pump = () => {
      const elapsedMs = performance.now() - startedAtMs;
      const allowedChunks = options.rate > 0
        ? Math.ceil((elapsedMs / 1000) * options.rate)
        : Number.POSITIVE_INFINITY;
      let chunksThisTick = 0;

      while (emitted < options.records
        && emittedChunks < allowedChunks
        && chunksThisTick < MAX_CHUNKS_PER_TICK) {
        let chunk = "";
        const limit = Math.min(options.chunkRecords, options.records - emitted);
        for (let index = 0; index < limit; index += 1) {
          emitted += 1;
          chunk += codec.renderRecord(codec.buildRecord(options.seed, emitted, options.recordBytes), clock());
        }
        emittedChunks += 1;
        chunksThisTick += 1;
        if (!sink.write(chunk)) {
          sink.onDrain(pump);
          return;
        }
      }

      if (emitted >= options.records) {
        finish();
        return;
      }
      setTimeout(pump, 1);
    };

    pump();
  });
}

function main(argv, stdout) {
  const options = parseProducerArgs(argv);
  if (options.digestOnly) {
    stdout.write(`${codec.expectedDigest(options.seed, options.records, options.recordBytes)}\n`);
    return Promise.resolve({ digest: null, elapsedMicros: 0, emitted: 0 });
  }
  const sink = {
    onDrain: (fn) => stdout.once("drain", fn),
    write: (text) => stdout.write(text)
  };
  return streamRecords(options, sink);
}

function reportCliFailure(error, stderr, runtime) {
  stderr.write(`producer failed: ${error && error.stack ? error.stack : error}\n`);
  runtime.exitCode = 1;
}

function runCliIfMain(
  isMain,
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  runtime = process
) {
  if (!isMain) return null;
  return Promise.resolve()
    .then(() => main(argv, stdout))
    .catch((error) => {
      reportCliFailure(error, stderr, runtime);
      return null;
    });
}

runCliIfMain(require.main === module);

module.exports = {
  DEFAULT_OPTIONS,
  main,
  nowMicros,
  parseProducerArgs,
  reportCliFailure,
  runCliIfMain,
  streamRecords
};
