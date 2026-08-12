const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_INITIAL_TAIL_KB = 256;
const COPILOT_LOG_LINE = /^(\d{4}-\d{2}-\d{2}T\S+) \[(ERROR|WARNING|INFO|DEBUG)\]\s?(.*)$/;
const COPILOT_LEVELS = { ERROR: "error", WARNING: "warn", INFO: "info", DEBUG: "debug" };

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function filesUnder(directory) {
  const files = [];
  const visit = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  };
  visit(directory);
  return files;
}

function parseCopilotLogLine(line, now = Date.now()) {
  const match = COPILOT_LOG_LINE.exec(String(line || ""));
  if (!match) {
    return { time: now, level: "info", source: "copilot", event: "copilot-log", message: String(line || "") };
  }
  const parsedTime = Date.parse(match[1]);
  return {
    time: Number.isFinite(parsedTime) ? parsedTime : now,
    level: COPILOT_LEVELS[match[2]] || "info",
    source: "copilot",
    event: "copilot-log",
    message: match[3]
  };
}

class CopilotLogAggregator {
  constructor(options = {}) {
    this.root = options.root;
    this.emit = typeof options.emit === "function" ? options.emit : () => {};
    this.intervalMs = nonNegativeInteger(options.intervalMs, 1000);
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.enabled = false;
    this.enabledAt = 0;
    this.initialTailKb = DEFAULT_INITIAL_TAIL_KB;
    this.initialScanComplete = false;
    this.files = new Map();
    this.registrations = new Map();
    this.timer = null;
  }

  register(value = {}) {
    const key = String(value.key || "");
    if (!/^[a-z0-9-]{1,128}$/i.test(key)) return false;
    this.registrations.set(key, {
      terminalId: String(value.terminalId || "").slice(0, 128),
      terminalTitle: String(value.terminalTitle || "").replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200)
    });
    return true;
  }

  tagForFile(filePath) {
    const relative = path.relative(this.root, filePath);
    const key = relative && !relative.startsWith("..") ? relative.split(/[\\/]/, 1)[0] : "";
    const registration = this.registrations.get(key) || {};
    const terminalTag = registration.terminalTitle || registration.terminalId || key || "session";
    return {
      copilotLogKey: key,
      terminalId: registration.terminalId || "",
      terminalTitle: registration.terminalTitle || "",
      source: `copilot:${terminalTag}`
    };
  }

  configure(value = {}) {
    const enabled = value.enabled === undefined ? this.enabled : value.enabled === true;
    const initialTailKb = value.initialTailKb === undefined
      ? this.initialTailKb
      : nonNegativeInteger(value.initialTailKb, this.initialTailKb);
    const enabledAt = value.enabledAt === undefined
      ? this.enabledAt
      : nonNegativeInteger(value.enabledAt, this.enabledAt);
    const changed = enabled !== this.enabled || initialTailKb !== this.initialTailKb || enabledAt !== this.enabledAt;
    this.enabled = enabled;
    this.enabledAt = enabledAt;
    this.initialTailKb = initialTailKb;
    if (changed) {
      this.files.clear();
      this.initialScanComplete = false;
    }
    if (this.enabled) {
      this.poll();
      this.startTimer();
    } else {
      this.stopTimer();
    }
    return { enabled: this.enabled, initialTailKb: this.initialTailKb, root: this.root };
  }

  startTimer() {
    if (this.timer || this.intervalMs === 0) return;
    this.timer = setInterval(() => {
      try { this.poll(); } catch { /* the next poll can recover */ }
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stopTimer() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  poll() {
    if (!this.enabled) return [];
    const emitted = [];
    const initialScan = !this.initialScanComplete;
    const present = new Set(filesUnder(this.root));
    for (const filePath of present) {
      const records = this.readFile(filePath, initialScan);
      for (const record of records) {
        emitted.push(record);
        this.emit(record);
      }
    }
    for (const filePath of this.files.keys()) {
      if (!present.has(filePath)) this.files.delete(filePath);
    }
    this.initialScanComplete = true;
    return emitted;
  }

  readFile(filePath, initialScan = false) {
    const stats = fs.statSync(filePath);
    let state = this.files.get(filePath);
    let discardPartial = false;
    if (!state) {
      const tailBytes = this.initialTailKb * 1024;
      const writtenSinceEnable = this.enabledAt > 0 && stats.mtimeMs >= this.enabledAt;
      const offset = initialScan
        ? tailBytes === 0 ? (writtenSinceEnable ? 0 : stats.size) : Math.max(0, stats.size - tailBytes)
        : 0;
      state = { offset, remainder: "" };
      this.files.set(filePath, state);
      if (offset > 0) {
        const descriptor = fs.openSync(filePath, "r");
        try {
          const previous = Buffer.alloc(1);
          fs.readSync(descriptor, previous, 0, 1, offset - 1);
          discardPartial = previous[0] !== 0x0a;
        } finally {
          fs.closeSync(descriptor);
        }
      }
    } else if (stats.size < state.offset) {
      state.offset = 0;
      state.remainder = "";
    }
    if (stats.size === state.offset) return [];

    const length = stats.size - state.offset;
    const descriptor = fs.openSync(filePath, "r");
    let buffer;
    try {
      buffer = Buffer.alloc(length);
      fs.readSync(descriptor, buffer, 0, length, state.offset);
    } finally {
      fs.closeSync(descriptor);
    }
    state.offset = stats.size;
    let text = state.remainder + buffer.toString("utf8");
    if (discardPartial) {
      const firstBreak = text.indexOf("\n");
      text = firstBreak >= 0 ? text.slice(firstBreak + 1) : "";
    }
    const lines = text.split(/\r?\n/);
    state.remainder = lines.pop() || "";
    const tag = this.tagForFile(filePath);
    return lines.filter(Boolean).map((line) => ({ ...parseCopilotLogLine(line, this.now()), ...tag }));
  }

  close() {
    this.stopTimer();
    this.files.clear();
    this.registrations.clear();
    this.initialScanComplete = false;
  }
}

module.exports = {
  CopilotLogAggregator,
  DEFAULT_INITIAL_TAIL_KB,
  filesUnder,
  parseCopilotLogLine
};
