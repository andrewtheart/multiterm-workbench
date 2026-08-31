/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

// Finds a bridge for the embedded workbench to attach to, or starts one.
//
// Mirrors the identity rules in src/main.js: a registered instance is only viable
// when its live /health answer agrees with the record on BOTH pid and port. The
// record's pid is the trusted value -- adopting health.pid instead would let any
// process claiming the port impersonate a bridge.

const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const childProcess = require("node:child_process");

const LOOPBACK = "127.0.0.1";
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1", "[::1]"];
const EMBED_FRAME_SCHEMES = ["vscode-webview:", "vscode-file:"];
const RUNTIME_DIRECTORY = "runtime";

function instanceDirectory(env = process.env) {
  return env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "MultiTerm", "Instances") : "";
}

function normalizeHost(hostname) {
  if (hostname === "localhost") return LOOPBACK;
  if (hostname === "[::1]") return "::1";
  return hostname;
}

function probeHealth(host, port, timeoutMs = 1500, get = http.get) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const request = get({ host, port, path: "/health", timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding?.("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          const health = JSON.parse(body);
          finish(response.statusCode === 200
            && health.app === "MultiTerm Workbench"
            && Number(health.port) === port
            ? health
            : null);
        } catch {
          finish(null);
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Bridge health check timed out.")));
    request.on("error", () => finish(null));
  });
}

function readRecord(raw) {
  const record = JSON.parse(raw);
  const url = new URL(String(record.url || ""));
  const port = Number(record.port);
  const pid = Number(record.pid);
  if (record.app !== "MultiTerm Workbench"
      || url.protocol !== "http:"
      || !LOOPBACK_HOSTS.includes(url.hostname)
      || !Number.isSafeInteger(port) || port <= 0 || port > 65535
      || Number(url.port) !== port
      || !Number.isSafeInteger(pid) || pid <= 0) return null;
  return {
    bridgeId: String(record.bridgeId || "Bridge"),
    bridgeType: record.bridgeType === "installed" ? "installed" : "electron",
    host: normalizeHost(url.hostname),
    pid,
    port,
    startedAt: String(record.startedAt || "")
  };
}

// A bridge released before embedded mode existed still answers /health perfectly
// while refusing to be framed, which shows up as an empty black panel and no
// error. Read the policy it actually serves so that case can be named.
function readFramePolicy(headers) {
  const csp = String(headers?.["content-security-policy"] || "");
  const directive = csp.split(";").map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("frame-ancestors"));
  if (!directive) {
    return { framable: false, reason: "it sends no frame-ancestors policy" };
  }
  // Every ancestor is matched, and a webview nests inside the workbench window,
  // so naming only one scheme still produces the blank view this probe exists to
  // prevent.
  const policy = directive.toLowerCase();
  if (!EMBED_FRAME_SCHEMES.every((scheme) => policy.includes(scheme))) {
    return { framable: false, reason: `its framing policy is "${directive}"` };
  }
  return { framable: true, reason: "" };
}

function probeFramePolicy(host, port, timeoutMs = 1500, get = http.get) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const request = get({ host, port, path: "/", timeout: timeoutMs }, (response) => {
      response.resume();
      finish(readFramePolicy(response.headers));
    });
    request.on("timeout", () => request.destroy(new Error("Frame policy probe timed out.")));
    request.on("error", () => finish({ framable: false, reason: "it could not be reached" }));
  });
}

async function discoverBridges(options = {}) {
  const fileSystem = options.fileSystem || fs;
  const directory = options.directory === undefined ? instanceDirectory() : options.directory;
  const probe = options.probe || probeHealth;
  const framePolicy = options.framePolicy || probeFramePolicy;
  if (!directory) return [];
  let files;
  try {
    files = fileSystem.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".json")) continue;
    let record;
    try {
      record = readRecord(fileSystem.readFileSync(path.join(directory, file.name), "utf8"));
    } catch {
      record = null;
    }
    if (!record) continue;
    const health = await probe(record.host, record.port, 1500);
    if (!health || Number(health.pid) !== record.pid) continue;
    const policy = await framePolicy(record.host, record.port, 1500);
    found.push({
      ...record,
      url: `http://${record.host === "::1" ? "[::1]" : record.host}:${record.port}/`,
      sessions: Number(health.sessions) || 0,
      rendererClients: Number(health.rendererClients) || 0,
      framable: policy.framable,
      frameReason: policy.reason
    });
  }
  return found.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

function findFreePort(startPort = 3200, host = LOOPBACK, createServer = net.createServer) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > 65535) {
        reject(new Error("No free local port is available for a MultiTerm bridge."));
        return;
      }
      const probe = createServer();
      probe.once("error", () => tryPort(port + 1));
      probe.once("listening", () => probe.close(() => resolve(port)));
      probe.listen(port, host);
    };
    tryPort(startPort);
  });
}

/* ---------------- Bundled runtime ---------------- */

function runtimeManifestPath(extensionRoot) {
  return path.join(extensionRoot, RUNTIME_DIRECTORY, "runtime.json");
}

// The staged runtime records the exact target its native modules were built for.
function readRuntimeManifest(extensionRoot, fileSystem = fs) {
  try {
    const manifest = JSON.parse(fileSystem.readFileSync(runtimeManifestPath(extensionRoot), "utf8"));
    return manifest && typeof manifest === "object" ? manifest : null;
  } catch {
    return null;
  }
}

function isBundledRuntimeScript(scriptPath, extensionRoot) {
  if (!scriptPath || !extensionRoot) return false;
  return path.resolve(scriptPath).startsWith(path.resolve(extensionRoot, RUNTIME_DIRECTORY) + path.sep);
}

// node-pty loads build/Release/*.node directly, so the CPU architecture AND the
// Node ABI must both match or the bridge dies on its first require. Reporting
// that here is what lets the caller fall back to the installed bridge instead of
// spawning a child that can only fail.
function runtimeCompatibility(manifest, target) {
  if (!manifest) return { compatible: false, reason: "this extension has no bundled bridge runtime" };
  if (!target) return { compatible: false, reason: "the Node.js that was found did not report its version" };
  if (manifest.platform !== target.platform) {
    return { compatible: false, reason: `the bundled bridge is built for ${manifest.platform}, not ${target.platform}` };
  }
  if (manifest.arch !== target.arch) {
    return { compatible: false, reason: `the bundled bridge is built for ${manifest.arch} but the Node.js found is ${target.arch}` };
  }
  if (String(manifest.nodeAbi) !== String(target.abi)) {
    return {
      compatible: false,
      reason: `the bundled bridge needs Node.js ABI ${manifest.nodeAbi} (Node ${manifest.nodeRange || "unknown"}) but the Node.js found reports ABI ${target.abi}`
    };
  }
  return { compatible: true, reason: "" };
}

/* ---------------- Node.js discovery ---------------- */

function nodeLocatorCommand(platform) {
  return platform === "win32" ? "where.exe" : "which";
}

function nodeInstallCandidates(env, platform) {
  if (platform !== "win32") return ["/usr/local/bin/node", "/usr/bin/node"];
  return [
    env.ProgramFiles && path.join(env.ProgramFiles, "nodejs", "node.exe"),
    env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "nodejs", "node.exe"),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "nodejs", "node.exe")
  ].filter(Boolean);
}

// The extension host is Electron, so its own executable cannot run the bridge.
function findNodeExecutable(options = {}) {
  const fileSystem = options.fileSystem || fs;
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const execFileSync = options.execFileSync || childProcess.execFileSync;
  const isFile = (candidate) => {
    try {
      return fileSystem.statSync(candidate).isFile();
    } catch {
      return false;
    }
  };
  for (const configured of [options.configuredPath, env.MULTITERM_NODE].filter(Boolean)) {
    const resolved = path.resolve(configured);
    if (isFile(resolved)) return resolved;
  }
  try {
    const located = String(execFileSync(nodeLocatorCommand(platform), ["node"], { encoding: "utf8", windowsHide: true }))
      .split(/\r?\n/).map((line) => line.trim()).filter(Boolean).find(isFile);
    if (located) return located;
  } catch {
    // Nothing on PATH, so try the standard install locations instead.
  }
  return nodeInstallCandidates(env, platform).find(isFile) || "";
}

// Ask the executable itself: one machine can hold several Node installations of
// different architectures and ABIs, and only the one being spawned matters.
function readNodeTarget(executable, execFileSync = childProcess.execFileSync) {
  try {
    const output = String(execFileSync(
      executable,
      ["-e", "process.stdout.write(process.platform+' '+process.arch+' '+process.versions.modules)"],
      { encoding: "utf8", windowsHide: true }
    )).trim().split(/\s+/);
    const [platform, arch, abi] = output;
    return platform && arch && abi ? { platform, arch, abi } : null;
  } catch {
    return null;
  }
}

/* ---------------- Starting a bridge ---------------- */

// Order matters: an explicit setting wins, then a runtime bundled with the
// extension, then an installed app beside the launcher.
function resolveBridgeScript(options = {}) {
  const fileSystem = options.fileSystem || fs;
  const candidates = [
    options.configuredPath,
    options.extensionRoot && path.join(options.extensionRoot, "runtime", "src", "server.js"),
    options.launcherPath && path.join(path.dirname(options.launcherPath), "src", "server.js")
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
  for (const candidate of candidates) {
    try {
      if (fileSystem.statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next location.
    }
  }
  return null;
}

function assertBridgePort(port) {
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) throw new Error(`Invalid bridge port: ${port}`);
}

// The bridge uses node-pty, built for the system Node ABI rather than the
// extension host's Electron ABI, so it must run under a separate node process.
function spawnBridge(options = {}) {
  const spawn = options.spawn || childProcess.spawn;
  const scriptPath = options.scriptPath;
  const port = options.port;
  const host = options.host || LOOPBACK;
  if (!scriptPath) throw new Error("No MultiTerm bridge script was found.");
  assertBridgePort(port);
  const nodeExecutable = options.nodeExecutable || (process.platform === "win32" ? "node.exe" : "node");
  return spawn(nodeExecutable, [scriptPath], {
    cwd: path.resolve(path.dirname(scriptPath), ".."),
    env: { ...(options.env || process.env), HOST: host, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
}

// The installed bridge is PowerShell hosting C#, so it needs no Node.js and runs
// on every architecture MultiTerm supports. Windows PowerShell 5.1 only: pwsh
// resolves the wrong reference assemblies and its embedded C# fails to compile.
function spawnInstalledBridge(options = {}) {
  const spawn = options.spawn || childProcess.spawn;
  const launcherPath = options.launcherPath;
  const port = options.port;
  if (!launcherPath) throw new Error("No installed MultiTerm launcher was found.");
  assertBridgePort(port);
  return spawn("powershell.exe", [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", launcherPath,
    "-Port", String(port),
    "-NoBrowser",
    "-NewInstance"
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
}

module.exports = {
  EMBED_FRAME_SCHEMES,
  LOOPBACK,
  LOOPBACK_HOSTS,
  discoverBridges,
  findFreePort,
  findNodeExecutable,
  instanceDirectory,
  isBundledRuntimeScript,
  nodeInstallCandidates,
  nodeLocatorCommand,
  normalizeHost,
  probeFramePolicy,
  probeHealth,
  readFramePolicy,
  readNodeTarget,
  readRecord,
  readRuntimeManifest,
  resolveBridgeScript,
  runtimeCompatibility,
  runtimeManifestPath,
  spawnBridge,
  spawnInstalledBridge
};
