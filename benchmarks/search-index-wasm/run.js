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

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");

const SEARCH_TRIM_RATIO = 0.2;
const CHUNK_SIZE = 4096;
const INPUT_CAPACITY = CHUNK_SIZE * 4;
const QUERY_CAPACITY = 4096;
const encoder = new TextEncoder();
const OSC_PATTERN = /\x1b\][^\x07]*(?:\x07|\x1b\\)/g;
const CSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const CTRL_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

function stripTerminalControlCodes(value) {
  return String(value || "")
    .replace(OSC_PATTERN, "")
    .replace(CSI_PATTERN, "")
    .replace(CTRL_PATTERN, "");
}

class CurrentJavaScriptIndex {
  constructor(searchCap, trimMargin) {
    this.name = "Current JS string";
    this.searchCap = searchCap;
    this.trimMargin = trimMargin;
    this.searchText = "";
    this.query = "";
  }

  append(text) {
    let nextText = `${this.searchText}\n${stripTerminalControlCodes(text).toLowerCase()}`;
    if (nextText.length > this.searchCap + this.trimMargin) {
      nextText = nextText.slice(-this.searchCap);
    }
    this.searchText = nextText;
  }

  setQuery(query) {
    this.query = String(query || "").toLowerCase();
  }

  contains() {
    return this.searchText.includes(this.query);
  }

  get length() {
    return this.searchText.length;
  }

  get retainedBytes() {
    return this.searchText.length * 2;
  }
}

class JavaScriptByteRingIndex {
  constructor(searchCap, trimMargin) {
    this.name = "JS UTF-8 ring";
    this.searchCap = searchCap;
    this.storageCap = searchCap + trimMargin;
    this.storage = new Uint8Array(this.storageCap);
    this.staging = new Uint8Array(INPUT_CAPACITY);
    this.query = new Uint8Array(0);
    this.shifts = new Uint32Array(256);
    this.head = 0;
    this.indexLength = 0;
    this.parserState = 0;
    this.overflowed = false;
  }

  append(text) {
    const normalized = String(text || "").toLowerCase();
    const encoded = encoder.encodeInto(normalized, this.staging);
    if (encoded.read !== normalized.length) {
      throw new Error(`Benchmark chunk exceeded the ${INPUT_CAPACITY}-byte staging buffer.`);
    }

    this.overflowed = false;
    this.pushByte(0x0a);
    for (let index = 0; index < encoded.written; index += 1) {
      this.processByte(this.staging[index]);
    }
    if (this.overflowed && this.indexLength > this.searchCap) {
      this.head = (this.head + this.indexLength - this.searchCap) % this.storageCap;
      this.indexLength = this.searchCap;
    }
  }

  setQuery(query) {
    this.query = encoder.encode(String(query || "").toLowerCase());
    this.shifts.fill(this.query.length);
    for (let index = 0; index < this.query.length - 1; index += 1) {
      this.shifts[this.query[index]] = this.query.length - index - 1;
    }
  }

  contains() {
    const queryLength = this.query.length;
    if (!queryLength) return true;
    if (queryLength > this.indexLength) return false;

    let start = 0;
    while (start + queryLength <= this.indexLength) {
      let queryOffset = queryLength;
      while (queryOffset > 0) {
        queryOffset -= 1;
        if (this.byteAt(start + queryOffset) !== this.query[queryOffset]) break;
      }
      if (queryOffset === 0 && this.byteAt(start) === this.query[0]) return true;
      start += this.shifts[this.byteAt(start + queryLength - 1)];
    }
    return false;
  }

  processByte(byte) {
    switch (this.parserState) {
      case 0:
        if (byte === 0x1b) this.parserState = 1;
        else if (byte !== 0x7f && (byte >= 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d)) {
          this.pushByte(byte);
        }
        break;
      case 1:
        if (byte === 0x5b) this.parserState = 2;
        else if (byte === 0x5d) this.parserState = 3;
        else {
          this.parserState = 0;
          this.processByte(byte);
        }
        break;
      case 2:
        if (byte >= 0x40 && byte <= 0x7e) this.parserState = 0;
        break;
      case 3:
        if (byte === 0x07) this.parserState = 0;
        else if (byte === 0x1b) this.parserState = 4;
        break;
      case 4:
        if (byte === 0x5c) this.parserState = 0;
        else if (byte !== 0x1b) this.parserState = 3;
        break;
      default:
        this.parserState = 0;
    }
  }

  pushByte(byte) {
    if (this.indexLength < this.storageCap) {
      this.storage[(this.head + this.indexLength) % this.storageCap] = byte;
      this.indexLength += 1;
    } else {
      this.storage[this.head] = byte;
      this.head = (this.head + 1) % this.storageCap;
      this.overflowed = true;
    }
  }

  byteAt(offset) {
    const position = this.head + offset;
    return this.storage[position >= this.storageCap ? position - this.storageCap : position];
  }

  get length() {
    return this.indexLength;
  }

  get retainedBytes() {
    return this.storage.byteLength + this.staging.byteLength + this.query.byteLength + this.shifts.byteLength;
  }
}

class WasmByteRingIndex {
  constructor(instance, searchCap, trimMargin) {
    this.name = "WASM UTF-8 ring";
    this.instance = instance;
    this.exports = instance.exports;
    this.inputPointer = this.exports.configure(searchCap, trimMargin, INPUT_CAPACITY);
    if (!this.inputPointer) throw new Error("WASM index memory allocation failed.");
    this.refreshInputView();
  }

  refreshInputView() {
    this.input = new Uint8Array(this.exports.memory.buffer, this.inputPointer, INPUT_CAPACITY);
  }

  write(value) {
    const normalized = String(value || "").toLowerCase();
    if (this.input.buffer !== this.exports.memory.buffer) this.refreshInputView();
    const encoded = encoder.encodeInto(normalized, this.input);
    if (encoded.read !== normalized.length) {
      throw new Error(`Benchmark value exceeded the ${INPUT_CAPACITY}-byte WASM staging buffer.`);
    }
    return encoded.written;
  }

  append(text) {
    if (!this.exports.append(this.write(text))) throw new Error("WASM append failed.");
  }

  setQuery(query) {
    const bytes = this.write(query);
    if (bytes > QUERY_CAPACITY || !this.exports.set_query(bytes)) {
      throw new Error(`Benchmark query exceeded the ${QUERY_CAPACITY}-byte WASM query buffer.`);
    }
  }

  contains() {
    return Boolean(this.exports.contains());
  }

  get length() {
    return this.exports.index_len();
  }

  get retainedBytes() {
    return this.exports.memory.buffer.byteLength;
  }
}

function buildWasm() {
  const benchmarkDir = __dirname;
  const cargo = spawnSync(
    "cargo",
    ["build", "--release", "--target", "wasm32-unknown-unknown"],
    {
      cwd: benchmarkDir,
      encoding: "utf8",
      env: {
        ...process.env,
        RUSTFLAGS: [
          process.env.RUSTFLAGS || "",
          "-C link-arg=--export-memory",
          "-C link-arg=-zstack-size=65536"
        ].filter(Boolean).join(" ")
      }
    }
  );
  if (cargo.status !== 0) {
    throw new Error(`Unable to build WASM spike.\n${cargo.stdout}\n${cargo.stderr}`);
  }

  const wasmPath = path.join(
    benchmarkDir,
    "target",
    "wasm32-unknown-unknown",
    "release",
    "multiterm_search_index_wasm_spike.wasm"
  );
  return fs.readFileSync(wasmPath);
}

async function instantiateWasm(bytes) {
  const started = performance.now();
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module);
  return {
    instance,
    initializationMs: performance.now() - started
  };
}

function splitChunks(text, chunkSize = CHUNK_SIZE) {
  const chunks = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function makeCorpus(targetSize, profile) {
  const common = [
    "2026-08-14T10:15:30.123Z INFO  worker-07 completed in 18.4ms\r\n",
    "PS C:\\src\\multiterm> npm test -- --runInBand\r\n",
    "\x1b[32mPASS\x1b[0m tests\\unit\\terminal-search.test.js (42 tests)\r\n",
    "WARN retrying websocket connection to 127.0.0.1:3199\r\n",
    "ERROR E042 src\\renderer\\terminal.js:184 invalid terminal state\r\n",
    "\x1b]0;MultiTerm build output\x07build step 17/30 finished\r\n",
    "Copied artifact to C:\\build\\MultiTerm-Setup.exe\r\n"
  ];
  const lines = profile === "ansi-heavy"
    ? [
        "\x1b[2K\r\x1b[36mCompiling\x1b[0m package 187/500 [==========>         ]\r",
        "\x1b[1A\x1b[2K\x1b[33mwarning:\x1b[0m transient build message\r\n",
        "\x1b]8;;https://example.invalid\x1b\\linked output\x1b]8;;\x1b\\\r\n",
        ...common
      ]
    : profile === "unicode-heavy"
      ? [
          "PowerShell CAFÉ résumé — 東京 — Привет — 😀 terminal output\r\n",
          "\x1b[35m┌──────────────┐\x1b[0m  naïve façade ÅNGSTRÖM\r\n",
          "│ Copilot CLI │  Δοκιμή δεδομένων 中文測試\r\n",
          "\x1b[35m└──────────────┘\x1b[0m\r\n",
          ...common
        ]
      : common;

  const parts = [];
  let length = 0;
  let row = 0;
  while (length < targetSize) {
    const line = `${row.toString().padStart(7, "0")} ${lines[row % lines.length]}`;
    parts.push(line);
    length += line.length;
    row += 1;
  }
  parts.push("\r\nNEEDLE-AT-TAIL completed in 99.9ms CAFÉ\r\n");
  return parts.join("");
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB"];
  let value = bytes;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function time(operation) {
  const started = performance.now();
  const result = operation();
  return { elapsed: performance.now() - started, result };
}

function runCorrectnessChecks(factories) {
  const completeChunks = [
    "\x1b[31mERROR E042\x1b[0m at C:\\Repo\\Terminal.js\r\n",
    "\x1b]0;ignored title\x07PowerShell CAFÉ 東京\r\n",
    "completed in 18.4ms"
  ];
  const expected = new Map([
    ["error e042", true],
    ["c:\\repo\\terminal.js", true],
    ["café 東京", true],
    ["ignored title", false],
    ["definitely absent", false]
  ]);

  for (const factory of factories) {
    const index = factory(4096, 512);
    for (const chunk of completeChunks) index.append(chunk);
    for (const [query, match] of expected) {
      index.setQuery(query);
      assert.equal(index.contains(), match, `${index.name} produced a wrong result for "${query}".`);
    }
  }

  for (const factory of factories.slice(1)) {
    const index = factory(4096, 512);
    index.append("\x1b[3");
    index.append("1mERROR E042\x1b[0");
    index.append("m finished");
    index.setQuery("error e042");
    assert.equal(index.contains(), true, `${index.name} failed a split CSI sequence.`);
    index.setQuery("1merror");
    assert.equal(index.contains(), false, `${index.name} indexed split CSI bytes.`);
  }

  for (const factory of factories) {
    const index = factory(128, 32);
    index.append(`old-token ${"x".repeat(180)}`);
    index.append(`${"y".repeat(180)} new-token`);
    index.setQuery("old-token");
    assert.equal(index.contains(), false, `${index.name} retained text outside the rolling cap.`);
    index.setQuery("new-token");
    assert.equal(index.contains(), true, `${index.name} lost text inside the rolling cap.`);
  }

  return {
    current: "ANSI, Unicode, and rolling trim passed; split CSI is unsupported by the current stateless regex",
    candidates: "ANSI, Unicode, split CSI, and rolling trim passed"
  };
}

function benchmarkScenario(scenario, factories) {
  const corpusSize = scenario.corpusSize || scenario.size;
  const searchCap = scenario.searchCap || scenario.size;
  const corpus = makeCorpus(corpusSize, scenario.profile);
  const chunkSize = scenario.chunkSize || CHUNK_SIZE;
  const chunks = splitChunks(corpus, chunkSize);
  const trimMargin = scenario.trimMargin || Math.round(searchCap * SEARCH_TRIM_RATIO);
  const indexSamples = corpusSize <= 256 * 1024 ? 9 : corpusSize <= 1024 * 1024 ? 6 : 3;
  const searchBatches = searchCap <= 256 * 1024 ? 15 : searchCap <= 1024 * 1024 ? 10 : 6;
  const searchIterations = searchCap <= 256 * 1024 ? 250 : searchCap <= 1024 * 1024 ? 70 : 8;
  const queries = [
    "error e042",
    "src\\renderer\\terminal.js",
    "needle-at-tail",
    "café",
    "definitely-absent-token"
  ];
  const rows = [];

  for (const factory of factories) {
    const indexTimes = [];
    let retainedBytes = 0;
    for (let sample = 0; sample < indexSamples; sample += 1) {
      if (global.gc) global.gc();
      const index = factory(searchCap, trimMargin);
      const measured = time(() => {
        for (const chunk of chunks) index.append(chunk);
        return index.length;
      });
      assert(measured.result > 0);
      indexTimes.push(measured.elapsed);
      retainedBytes = index.retainedBytes;
    }

    const index = factory(searchCap, trimMargin);
    for (const chunk of chunks) index.append(chunk);
    const searchTimes = [];
    const firstSearchTimes = [];
    let hitAccumulator = 0;
    for (const query of queries) {
      index.setQuery(query);
      const first = time(() => index.contains());
      firstSearchTimes.push(first.elapsed);
      hitAccumulator += Number(first.result);

      for (let batch = 0; batch < searchBatches; batch += 1) {
        const measured = time(() => {
          let hits = 0;
          for (let iteration = 0; iteration < searchIterations; iteration += 1) {
            hits += Number(index.contains());
          }
          return hits;
        });
        hitAccumulator += measured.result;
        searchTimes.push((measured.elapsed * 1000) / searchIterations);
      }
    }
    assert(hitAccumulator > 0);

    let streamMs = null;
    if (searchCap <= 256 * 1024) {
      const streamTimes = [];
      for (let sample = 0; sample < 5; sample += 1) {
        const streamIndex = factory(searchCap, trimMargin);
        streamIndex.setQuery("definitely-absent-token");
        streamTimes.push(time(() => {
          let hits = 0;
          for (const chunk of chunks) {
            streamIndex.append(chunk);
            hits += Number(streamIndex.contains());
          }
          return hits;
        }).elapsed);
      }
      streamMs = median(streamTimes);
    }

    rows.push({
      scenario: scenario.label,
      implementation: index.name,
      "index median ms": median(indexTimes).toFixed(2),
      "first search ms": median(firstSearchTimes).toFixed(3),
      "warm search median us": median(searchTimes).toFixed(2),
      "warm search p95 us": percentile(searchTimes, 0.95).toFixed(2),
      "active stream ms": streamMs == null ? "-" : streamMs.toFixed(2),
      "active us/frame": streamMs == null ? "-" : ((streamMs * 1000) / chunks.length).toFixed(2),
      storage: formatBytes(retainedBytes)
    });
  }
  return rows;
}

async function main() {
  console.log(`Node ${process.version}; V8 ${process.versions.v8}`);
  console.log("Building dependency-free Rust WASM candidate...");
  const wasmBytes = buildWasm();
  const wasm = await instantiateWasm(wasmBytes);
  console.log(
    `WASM module ${formatBytes(wasmBytes.byteLength)}; compile + instantiate ${wasm.initializationMs.toFixed(2)} ms`
  );

  const factories = [
    (cap, margin) => new CurrentJavaScriptIndex(cap, margin),
    (cap, margin) => new JavaScriptByteRingIndex(cap, margin),
    (cap, margin) => new WasmByteRingIndex(wasm.instance, cap, margin)
  ];

  const correctness = runCorrectnessChecks(factories);
  console.log(`Current JS string: ${correctness.current}.`);
  console.log(`JS/WASM byte rings: ${correctness.candidates}.\n`);

  const scenarios = [
    { label: "200k mixed (production cap)", size: 200000, trimMargin: 40000, profile: "mixed" },
    {
      label: "200k interactive (64-byte frames)",
      size: 200000,
      trimMargin: 40000,
      profile: "mixed",
      chunkSize: 64
    },
    { label: "200k ANSI-heavy", size: 200000, trimMargin: 40000, profile: "ansi-heavy" },
    { label: "200k Unicode-heavy", size: 200000, trimMargin: 40000, profile: "unicode-heavy" },
    {
      label: "8 MB stream -> 200k retained",
      corpusSize: 8 * 1024 * 1024,
      searchCap: 200000,
      trimMargin: 40000,
      profile: "mixed"
    },
    { label: "1 MB mixed (scale probe)", size: 1024 * 1024, profile: "mixed" },
    { label: "10 MB mixed (scale probe)", size: 10 * 1024 * 1024, profile: "mixed" }
  ];
  const rows = scenarios.flatMap((scenario) => benchmarkScenario(scenario, factories));
  console.table(rows);

  console.log("\nMetric notes:");
  console.log("- Index time includes ANSI stripping, case normalization, UTF-8 encoding/copying, and rolling trims.");
  console.log("- Warm search includes the full substring scan but caches each query outside the timed loop.");
  console.log("- Active stream appends each 4 KB frame and applies an absent filter after every append.");
  console.log("- The interactive scenario uses 64-byte frames; all other scenarios use 4 KB frames.");
  console.log("- JS string storage is a UTF-16 size estimate; V8 may use a smaller one-byte representation.");
  console.log("- Byte rings cap UTF-8 bytes, while production caps UTF-16 code units; Unicode retention is not equivalent.");
  console.log("- WASM storage is allocated linear memory for one single-index instance, including its 64 KB stack.");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
