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
 * Deterministic record codec for the bridge throughput benchmark.
 *
 * The producer emits records whose payload depends only on (seed, sequence,
 * recordBytes), so two runs with the same seed carry byte-identical payloads
 * and the same stream digest. Only the embedded timestamp varies, and the
 * digest deliberately excludes it.
 *
 * A record looks like this on the wire (one line, CRLF terminated):
 *
 *   ESC[38;5;<colour>m MTB|<seq>|<tsMicros>|<hash>|<payload>|END ESC[0m
 *
 * The payload never contains "|", CR, LF or ESC, so the framing survives being
 * concatenated with arbitrary shell noise and can be recovered from a stream
 * that was split at arbitrary byte boundaries.
 */

"use strict";

const crypto = require("node:crypto");

const RECORD_TAG = "MTB";
const START_TAG = "MTB-START";
const END_TAG = "MTB-END";
const FIELD_SEPARATOR = "|";
const HASH_LENGTH = 16;

// Deliberately mixed UTF-8 widths. The 4-byte code points are what make a
// naive per-read decoder (one Encoding.UTF8.GetString per native ConPTY read)
// visibly corrupt the stream.
const ASCII_TOKENS = ["build", "link", "warn", "OK", "cc1plus", "obj", "lib", "src", "pass", "emit"];
const WIDE_TOKENS = ["caf\u00e9", "na\u00efve", "gr\u00f6\u00dfe", "\u4e2d\u6587", "\u65e5\u672c\u8a9e", "\u2192", "\u2605"];
const ASTRAL_TOKENS = ["\u{1F600}", "\u{1F680}", "\u{1F9EA}", "\u{1F3AF}", "\u{1F4E6}"];
const TOKEN_SEPARATOR = "\u00b7";

const DEFAULT_RECORD_BYTES = 100;
// Framing overhead measured for a five-digit sequence; payload sizing only needs
// to be approximately right, and it is deterministic either way.
const FRAMING_OVERHEAD_BYTES = 52;

/**
 * @param {number} value
 * @returns {() => number} deterministic float generator in [0, 1)
 */
function mulberry32(value) {
  let state = value | 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(seed, sequence) {
  let hash = (seed | 0) ^ 0x9e3779b9;
  hash = Math.imul(hash ^ sequence, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) | 0;
}

function hashPayload(payload) {
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, HASH_LENGTH);
}

/**
 * Builds the deterministic content of one record.
 *
 * @param {number} seed
 * @param {number} sequence
 * @param {number} [recordBytes] total target size of the rendered record
 * @returns {{ sequence: number, payload: string, hash: string, colour: number }}
 */
function buildRecord(seed, sequence, recordBytes = DEFAULT_RECORD_BYTES) {
  const next = mulberry32(mixSeed(seed, sequence));
  const targetPayloadBytes = Math.max(8, recordBytes - FRAMING_OVERHEAD_BYTES);
  // Every record carries at least one 4-byte code point so a split-code-point
  // defect always has something to corrupt.
  const parts = [ASTRAL_TOKENS[Math.floor(next() * ASTRAL_TOKENS.length)]];
  let bytes = Buffer.byteLength(parts[0], "utf8");

  while (bytes < targetPayloadBytes) {
    const roll = next();
    const table = roll < 0.55 ? ASCII_TOKENS : roll < 0.85 ? WIDE_TOKENS : ASTRAL_TOKENS;
    const token = table[Math.floor(next() * table.length)];
    parts.push(token);
    bytes += Buffer.byteLength(token, "utf8") + Buffer.byteLength(TOKEN_SEPARATOR, "utf8");
  }

  const payload = parts.join(TOKEN_SEPARATOR);
  return {
    colour: 16 + (sequence % 216),
    hash: hashPayload(payload),
    payload,
    sequence
  };
}

/**
 * Renders a record to its exact wire bytes.
 *
 * @param {{ sequence: number, payload: string, hash: string, colour: number }} record
 * @param {number} timestampMicros
 * @returns {string}
 */
function renderRecord(record, timestampMicros) {
  return `\u001b[38;5;${record.colour}m${RECORD_TAG}${FIELD_SEPARATOR}${record.sequence}`
    + `${FIELD_SEPARATOR}${timestampMicros}${FIELD_SEPARATOR}${record.hash}`
    + `${FIELD_SEPARATOR}${record.payload}${FIELD_SEPARATOR}END\u001b[0m\r\n`;
}

function renderStartMarker(seed, records, recordBytes, timestampMicros) {
  return `${START_TAG}${FIELD_SEPARATOR}${seed}${FIELD_SEPARATOR}${records}`
    + `${FIELD_SEPARATOR}${recordBytes}${FIELD_SEPARATOR}${timestampMicros}\r\n`;
}

function renderEndMarker(digest, emitted, elapsedMicros) {
  return `${END_TAG}${FIELD_SEPARATOR}${digest}${FIELD_SEPARATOR}${emitted}`
    + `${FIELD_SEPARATOR}${elapsedMicros}\r\n`;
}

// ConPTY does not pass SGR through verbatim: it collapses a reset followed by
// the next colour into a single code emitted AFTER the record it terminated, so
// the trailing ESC[0m never survives the terminal. The framing itself is what is
// anchored on; the colour codes remain in the stream purely to keep the workload
// representative of real colorized build output.
const RECORD_PATTERN = /MTB\|(\d+)\|(\d+)\|([0-9a-f]{16})\|([^|\r\n\u001b]*)\|END/g;
const START_PATTERN = /MTB-START\|(\d+)\|(\d+)\|(\d+)\|(\d+)/;
const END_PATTERN = /MTB-END\|([0-9a-f]{64})\|(\d+)\|(\d+)/;

// Trailing bytes that cannot yet form a record are retained between pushes. A
// record never exceeds a few hundred bytes, so anything beyond this window is
// unmatchable shell noise and is discarded to keep the reader O(1) in memory.
const MAX_RETAINED_CHARS = 8192;

/**
 * Incrementally recovers records from a stream that arrives in arbitrary pieces.
 * Each recovered record is tagged with the receive timestamp of the push that
 * completed it, which is what the latency percentiles are computed from.
 */
class RecordStreamReader {
  /**
   * @param {{ onRecord?: (record: object) => void }} [options] when supplied,
   *   records are handed off and not retained, which keeps a long run bounded.
   */
  constructor(options = {}) {
    this.buffer = "";
    this.records = [];
    this.onRecord = typeof options.onRecord === "function" ? options.onRecord : null;
    this.completed = 0;
    this.start = null;
    this.end = null;
  }

  /**
   * @param {string} text
   * @param {number} receivedAtMicros
   * @returns {number} how many records this push completed
   */
  push(text, receivedAtMicros) {
    this.buffer += text;

    if (this.start === null) {
      const startMatch = START_PATTERN.exec(this.buffer);
      if (startMatch) {
        this.start = {
          recordBytes: Number(startMatch[3]),
          records: Number(startMatch[2]),
          seed: Number(startMatch[1]),
          timestampMicros: Number(startMatch[4])
        };
      }
    }

    RECORD_PATTERN.lastIndex = 0;
    let consumed = 0;
    let completed = 0;
    let match = RECORD_PATTERN.exec(this.buffer);
    while (match) {
      const record = {
        hash: match[3],
        payload: match[4],
        receivedAtMicros,
        sequence: Number(match[1]),
        timestampMicros: Number(match[2])
      };
      if (this.onRecord) this.onRecord(record);
      else this.records.push(record);
      this.completed += 1;
      completed += 1;
      consumed = match.index + match[0].length;
      match = RECORD_PATTERN.exec(this.buffer);
    }

    if (this.end === null) {
      const endMatch = END_PATTERN.exec(this.buffer);
      if (endMatch) {
        this.end = {
          digest: endMatch[1],
          elapsedMicros: Number(endMatch[3]),
          emitted: Number(endMatch[2]),
          receivedAtMicros
        };
        consumed = Math.max(consumed, endMatch.index + endMatch[0].length);
      }
    }

    this.buffer = this.buffer.slice(consumed);
    if (this.buffer.length > MAX_RETAINED_CHARS) {
      this.buffer = this.buffer.slice(-MAX_RETAINED_CHARS);
    }
    return completed;
  }

  isComplete() {
    return this.end !== null;
  }
}

/**
 * Verifies a record stream as it arrives, retaining counters rather than the
 * records themselves.
 *
 * Retaining every parsed record cost well over a gigabyte at 8 clients x 120,000
 * records and took a guest run down with a fatal allocation failure. Sequences
 * are dense, so a byte per expected sequence replaces the set of seen ids.
 */
class StreamVerifier {
  constructor({ seed, recordBytes = DEFAULT_RECORD_BYTES, expected = 0 } = {}) {
    this.seed = seed;
    this.recordBytes = recordBytes;
    this.expected = expected;
    this.seen = expected > 0 ? new Uint8Array(expected + 2) : null;
    this.outOfRange = new Set();
    this.received = 0;
    this.unique = 0;
    this.duplicates = 0;
    this.reordered = 0;
    this.hashMismatches = 0;
    this.payloadMismatches = 0;
    this.replacementCharacters = 0;
    this.firstSequence = null;
    this.lastSequence = null;
    this.previousSequence = null;
    this.examples = [];
  }

  #note(kind, sequence) {
    if (this.examples.length < 10) this.examples.push(`${kind}:${sequence}`);
  }

  #markSeen(sequence) {
    if (this.seen && sequence >= 0 && sequence < this.seen.length) {
      if (this.seen[sequence] === 1) return false;
      this.seen[sequence] = 1;
      return true;
    }
    if (this.outOfRange.has(sequence)) return false;
    this.outOfRange.add(sequence);
    return true;
  }

  accept(record) {
    this.received += 1;
    const sequence = record.sequence;
    if (this.firstSequence === null || sequence < this.firstSequence) this.firstSequence = sequence;
    if (this.lastSequence === null || sequence > this.lastSequence) this.lastSequence = sequence;

    if (this.#markSeen(sequence)) {
      this.unique += 1;
    } else {
      this.duplicates += 1;
      this.#note("duplicate", sequence);
    }

    if (this.previousSequence !== null && sequence <= this.previousSequence) {
      this.reordered += 1;
      this.#note("reordered", sequence);
    }
    this.previousSequence = sequence;

    if (record.payload.includes("\ufffd")) {
      this.replacementCharacters += 1;
      this.#note("replacement", sequence);
    }
    if (hashPayload(record.payload) !== record.hash) {
      this.hashMismatches += 1;
      this.#note("hash", sequence);
    } else if (this.seed !== undefined) {
      // The payload is derived from seed and sequence, so a matching hash and a
      // matching derivation together prove the bytes are the ones sent.
      if (buildRecord(this.seed, sequence, this.recordBytes).payload !== record.payload) {
        this.payloadMismatches += 1;
        this.#note("payload", sequence);
      }
    }
  }

  summary() {
    let missing = 0;
    if (this.seen && this.expected > 0) {
      for (let sequence = 1; sequence <= this.expected; sequence += 1) {
        if (this.seen[sequence] !== 1) missing += 1;
      }
    } else if (this.firstSequence !== null) {
      missing = (this.lastSequence - this.firstSequence + 1) - this.unique;
    }

    return {
      duplicates: this.duplicates,
      examples: this.examples,
      firstSequence: this.firstSequence,
      hashMismatches: this.hashMismatches,
      lastSequence: this.lastSequence,
      missing,
      ok: this.received > 0
        && missing === 0
        && this.duplicates === 0
        && this.reordered === 0
        && this.hashMismatches === 0
        && this.payloadMismatches === 0
        && this.replacementCharacters === 0,
      payloadMismatches: this.payloadMismatches,
      received: this.received,
      reordered: this.reordered,
      replacementCharacters: this.replacementCharacters,
      unique: this.unique
    };
  }
}

/**
 * Computes the reproducible digest of a record stream. The timestamp is
 * excluded on purpose so two runs of the same seed agree.
 *
 * @param {Array<{ sequence: number, hash: string }>} records
 * @returns {string}
 */
function streamDigest(records) {
  const bySequence = new Map();
  for (const record of records) {
    if (!bySequence.has(record.sequence)) bySequence.set(record.sequence, record.hash);
  }
  const sequences = [...bySequence.keys()].sort((left, right) => left - right);
  const digest = crypto.createHash("sha256");
  for (const sequence of sequences) {
    digest.update(`${sequence}:${bySequence.get(sequence)}\n`, "utf8");
  }
  return digest.digest("hex");
}

/**
 * Verifies a recovered stream against what the producer must have emitted.
 * Detects drops (sequence gaps), reordering, duplicates, and payload corruption
 * including a multi-byte code point truncated at a decode boundary.
 *
 * @param {Array<object>} records
 * @param {{ seed?: number, recordBytes?: number, expected?: number }} [options]
 */
function checkStream(records, options = {}) {
  const seed = options.seed;
  const recordBytes = options.recordBytes ?? DEFAULT_RECORD_BYTES;
  const seen = new Set();
  const duplicates = [];
  const reordered = [];
  const hashMismatches = [];
  const payloadMismatches = [];
  let replacementCharacters = 0;
  let previousSequence = null;
  let firstSequence = null;
  let lastSequence = null;

  for (const record of records) {
    if (firstSequence === null || record.sequence < firstSequence) firstSequence = record.sequence;
    if (lastSequence === null || record.sequence > lastSequence) lastSequence = record.sequence;

    if (seen.has(record.sequence)) {
      duplicates.push(record.sequence);
    } else {
      seen.add(record.sequence);
    }

    if (previousSequence !== null && record.sequence <= previousSequence) {
      reordered.push(record.sequence);
    }
    previousSequence = record.sequence;

    if (record.payload.includes("\ufffd")) replacementCharacters += 1;
    if (hashPayload(record.payload) !== record.hash) hashMismatches.push(record.sequence);
    if (seed !== undefined) {
      const expected = buildRecord(seed, record.sequence, recordBytes);
      if (expected.payload !== record.payload) payloadMismatches.push(record.sequence);
    }
  }

  const missing = [];
  if (firstSequence !== null) {
    for (let sequence = firstSequence; sequence <= lastSequence; sequence += 1) {
      if (!seen.has(sequence)) missing.push(sequence);
    }
  }
  if (typeof options.expected === "number" && lastSequence !== null) {
    for (let sequence = lastSequence + 1; sequence <= options.expected; sequence += 1) {
      missing.push(sequence);
    }
  }

  return {
    digest: streamDigest(records),
    duplicates,
    firstSequence,
    hashMismatches,
    lastSequence,
    missing,
    // An empty stream is a failure, not a vacuous pass. A checker that cannot
    // fail cannot validate anything later in this work.
    ok: records.length > 0
      && missing.length === 0
      && duplicates.length === 0
      && reordered.length === 0
      && hashMismatches.length === 0
      && payloadMismatches.length === 0
      && replacementCharacters === 0,
    payloadMismatches,
    received: records.length,
    reordered,
    replacementCharacters,
    unique: seen.size
  };
}

/**
 * Builds the digest the producer will emit, without running it. Used by the
 * harness to prove reproducibility without capturing a live stream.
 */
function expectedDigest(seed, records, recordBytes = DEFAULT_RECORD_BYTES) {
  const digest = crypto.createHash("sha256");
  for (let sequence = 1; sequence <= records; sequence += 1) {
    digest.update(`${sequence}:${buildRecord(seed, sequence, recordBytes).hash}\n`, "utf8");
  }
  return digest.digest("hex");
}

module.exports = {
  DEFAULT_RECORD_BYTES,
  END_TAG,
  RECORD_TAG,
  RecordStreamReader,
  START_TAG,
  StreamVerifier,
  buildRecord,
  checkStream,
  expectedDigest,
  hashPayload,
  renderEndMarker,
  renderRecord,
  renderStartMarker,
  streamDigest
};
