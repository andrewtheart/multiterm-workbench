const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_ROTATION_MB = 10;
const DEFAULT_VIEWER_ENTRIES = 5000;
const SENSITIVE_DETAIL_KEY = /(?:authorization|cookie|credential|environment|password|secret|terminalinput|terminaloutput|token)/i;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;

function localDataDirectory(environment = process.env, platform = process.platform) {
  if (environment.LOCALAPPDATA) return environment.LOCALAPPDATA;
  if (platform === "win32") return path.join(os.homedir(), "AppData", "Local");
  return path.join(os.homedir(), ".local", "share");
}

function defaultDiagnosticsDirectory(environment = process.env, platform = process.platform) {
  if (environment.MULTITERM_DIAGNOSTICS_DIR) return path.resolve(environment.MULTITERM_DIAGNOSTICS_DIR);
  return path.join(localDataDirectory(environment, platform), "MultiTerm", "Diagnostics");
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function normalizeDiagnosticsConfig(value = {}) {
  return {
    retentionDays: nonNegativeNumber(value.retentionDays, DEFAULT_RETENTION_DAYS),
    rotationMb: nonNegativeNumber(value.rotationMb, DEFAULT_ROTATION_MB),
    viewerEntries: Math.floor(nonNegativeNumber(value.viewerEntries, DEFAULT_VIEWER_ENTRIES))
  };
}

function redactUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "[redacted-url]";
  }
}

function redactDiagnosticValue(value, key = "") {
  if (SENSITIVE_DETAIL_KEY.test(key.replace(/[^a-z]/gi, ""))) return "[redacted]";
  if (typeof value === "string") {
    return value.replace(URL_PATTERN, (candidate) => redactUrl(candidate));
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDiagnosticValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .map(([childKey, childValue]) => [childKey, redactDiagnosticValue(childValue, childKey)]));
  }
  return value;
}

function normalizeDiagnosticRecord(record, now = Date.now()) {
  const input = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  const normalized = redactDiagnosticValue(input);
  normalized.time = Number.isFinite(Number(input.time)) ? Number(input.time) : now;
  normalized.level = ["debug", "info", "warn", "error"].includes(input.level) ? input.level : "info";
  normalized.source = typeof input.source === "string" && input.source ? input.source : "bridge";
  normalized.event = typeof input.event === "string" && input.event ? input.event : "log";
  normalized.message = typeof input.message === "string" ? input.message : "";
  return normalized;
}

function diagnosticFiles(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => path.join(directory, entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

class RuntimeDiagnostics {
  constructor(options = {}) {
    this.directory = options.directory || defaultDiagnosticsDirectory();
    this.config = normalizeDiagnosticsConfig(options);
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.sequence = 0;
    this.startedAt = this.now();
    this.currentPath = this.nextPath();
    this.lastPrunedAt = 0;
  }

  nextPath() {
    const stamp = new Date(this.startedAt).toISOString().replace(/[-:.TZ]/g, "");
    const sequence = String(this.sequence++).padStart(3, "0");
    return path.join(this.directory, `runtime-${stamp}-${process.pid}-${sequence}.jsonl`);
  }

  configure(value) {
    const updates = Object.fromEntries(Object.entries(value || {}).filter(([, setting]) => setting !== undefined));
    this.config = normalizeDiagnosticsConfig({ ...this.config, ...updates });
    return { ...this.config };
  }

  append(record) {
    const now = this.now();
    const line = `${JSON.stringify(normalizeDiagnosticRecord(record, now))}\n`;
    const lineBytes = Buffer.byteLength(line);
    fs.mkdirSync(this.directory, { recursive: true });
    this.pruneIfDue(now);

    const maximumBytes = this.config.rotationMb * 1024 * 1024;
    let currentBytes = 0;
    try {
      currentBytes = fs.statSync(this.currentPath).size;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (maximumBytes > 0 && currentBytes > 0 && currentBytes + lineBytes > maximumBytes) {
      this.currentPath = this.nextPath();
    }

    fs.appendFileSync(this.currentPath, line, { encoding: "utf8", mode: 0o600 });
    return this.currentPath;
  }

  pruneIfDue(now = this.now()) {
    if (this.lastPrunedAt && now - this.lastPrunedAt < 60 * 60 * 1000) return;
    this.lastPrunedAt = now;
    this.prune(now);
  }

  prune(now = this.now()) {
    if (this.config.retentionDays === 0) return [];
    const oldestAllowed = now - this.config.retentionDays * 24 * 60 * 60 * 1000;
    const removed = [];
    for (const filePath of diagnosticFiles(this.directory)) {
      if (filePath === this.currentPath) continue;
      const stats = fs.statSync(filePath);
      if (stats.mtimeMs >= oldestAllowed) continue;
      fs.rmSync(filePath, { force: true });
      removed.push(filePath);
    }
    return removed;
  }

  readRecent(limit = this.config.viewerEntries) {
    const maximum = Math.floor(nonNegativeNumber(limit, this.config.viewerEntries));
    const records = [];
    const files = diagnosticFiles(this.directory)
      .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
      .sort((left, right) => left.mtimeMs - right.mtimeMs || left.filePath.localeCompare(right.filePath));

    for (const { filePath } of files) {
      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          if (record && typeof record === "object" && !Array.isArray(record)) records.push(record);
        } catch {
          // A partial final write must not hide otherwise usable diagnostics.
        }
      }
    }
    return maximum === 0 ? records : records.slice(-maximum);
  }
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  DEFAULT_ROTATION_MB,
  DEFAULT_VIEWER_ENTRIES,
  RuntimeDiagnostics,
  defaultDiagnosticsDirectory,
  normalizeDiagnosticRecord,
  normalizeDiagnosticsConfig,
  redactDiagnosticValue
};