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
 * Starts and stops a bridge for the throughput benchmark, and proves the run
 * left nothing behind. A benchmark that leaks a listener or a bridge process
 * silently poisons every later measurement, so teardown is asserted, not hoped.
 */

"use strict";

const net = require("node:net");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
// Start-MultiTerm.ps1 must run under Windows PowerShell 5.1; pwsh fails Add-Type
// with a reference-assembly mismatch that looks like broken C#.
const WINDOWS_POWERSHELL = path.join(
  process.env.WINDIR || "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe"
);

// Windows PowerShell 5.1 inherits PSModulePath from whatever launched it. When
// that is a PowerShell 7 shell (directly, or via a Node process started from
// one), 5.1 finds PowerShell 7's Microsoft.PowerShell.Security first and fails
// to load it with "The member AuditToString is already present", after which
// cmdlets from that module simply do not exist. Every 5.1 child therefore gets
// the machine module path instead of the inherited one.
const WINDOWS_POWERSHELL_MODULE_PATH = [
  path.join(process.env.ProgramFiles || "C:\\Program Files", "WindowsPowerShell", "Modules"),
  path.join(process.env.WINDIR || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "Modules")
].join(";");

function windowsPowerShellEnvironment(extra = {}) {
  return { ...process.env, PSModulePath: WINDOWS_POWERSHELL_MODULE_PATH, ...extra };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function isPortListening(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const settle = (listening) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.once("timeout", () => settle(false));
  });
}

async function fetchHealth(port, timeoutMs = 2000) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { host: `127.0.0.1:${port}` },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await fetchHealth(port);
    if (health) return health;
    await delay(200);
  }
  return null;
}

async function suppressWatchdog(port) {
  const response = await fetch(`http://127.0.0.1:${port}/watchdog/keep`, {
    method: "POST",
    headers: {
      host: `127.0.0.1:${port}`,
      "x-multiterm-request": "Launcher"
    },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Bridge watchdog suppression failed with HTTP ${response.status}.`);
  const result = await response.json();
  const health = await fetchHealth(port);
  if (result?.watchdogSuppressed !== true || health?.watchdogSuppressed !== true) {
    throw new Error("Bridge did not confirm watchdog suppression.");
  }
  return health;
}

async function cleanupFailedBridgeStart(handle) {
  try {
    if (handle.mode === "installed" && await isPortListening(handle.port)) {
      await stopExactInstalledBridgeGracefully(handle, 30000);
    }
    if (handle.child && handle.child.exitCode === null) {
      handle.child.kill();
    }
  } catch { }

  // A timed-out PID may already have been reused. Force only when the listener
  // still proves both the exact port and exact captured process identity.
  if (handle.mode === "installed") await forceStopExactInstalledBridge(handle);
}

function matchesInstalledBridgeHealth(handle, health) {
  return health?.app === "MultiTerm Workbench"
    && Number.isInteger(handle.launcherReportedPid)
    && handle.launcherReportedPid > 0
    && Number(health.pid) === handle.launcherReportedPid
    && Number(health.port) === handle.port;
}

async function stopExactInstalledBridgeGracefully(handle, timeoutMs = 60000) {
  if (!matchesInstalledBridgeHealth(handle, await fetchHealth(handle.port))) return false;
  await runPowerShell([
    "-File", path.join(REPO_ROOT, "Start-MultiTerm.ps1"),
    "-Port", String(handle.port),
    "-Stop"
  ], timeoutMs);
  return true;
}

async function forceStopExactInstalledBridge(handle) {
  if (process.platform !== "win32" || !Number.isInteger(handle.launcherReportedPid)
      || handle.launcherReportedPid <= 0) return false;
  const health = await fetchHealth(handle.port);
  if (!matchesInstalledBridgeHealth(handle, health)) return false;
  await runPowerShell(["-Command", `Stop-Process -Id ${handle.launcherReportedPid} -Force -ErrorAction SilentlyContinue`], 30000);
  return true;
}

function runPowerShell(args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    execFile(
      WINDOWS_POWERSHELL,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args],
      { cwd: REPO_ROOT, env: windowsPowerShellEnvironment(), timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => resolve({ error, stderr: String(stderr || ""), stdout: String(stdout || "") })
    );
  });
}

/**
 * Lists processes whose command line mentions this run's port. Used to prove a
 * run left no stray bridge, supervisor, or PowerShell host behind.
 *
 * @param {number} port
 * @returns {Promise<Array<{ processId: number, name: string, commandLine: string }>>}
 */
async function findProcessesForPort(port) {
  if (process.platform !== "win32") return [];
  const script = "Get-CimInstance Win32_Process"
    + " | Where-Object { $_.CommandLine -and $_.CommandLine -like '*" + port + "*' }"
    + " | Where-Object { $_.CommandLine -match 'server\\.js|Start-MultiTerm\\.ps1|bridge-supervisor\\.js' }"
    + " | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json -Compress";
  const { stdout } = await runPowerShell(["-Command", script], 30000);
  const text = stdout.trim();
  if (!text) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map((row) => ({
    commandLine: String(row.CommandLine || ""),
    name: String(row.Name || ""),
    processId: Number(row.ProcessId)
  }));
}

class BridgeHandle {
  constructor({ mode, port, child, pid }) {
    this.mode = mode;
    this.port = port;
    this.child = child;
    this.pid = pid;
    this.launcherReportedPid = pid;
    this.stopped = false;
    this.stderr = [];
  }

  get url() {
    return `http://127.0.0.1:${this.port}`;
  }
}

async function startNodeBridge(port) {
  const child = spawn(process.execPath, [path.join(REPO_ROOT, "server.js")], {
    cwd: REPO_ROOT,
    env: { ...process.env, HOST: "127.0.0.1", MEMSTATS: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const handle = new BridgeHandle({ child, mode: "node", pid: child.pid, port });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (text) => handle.stderr.push(text));
  try {
    const health = await waitForHealth(port, 30000);
    if (!health) {
      throw new Error(`Node bridge did not become healthy on port ${port}. stderr: ${handle.stderr.join("")}`);
    }
    handle.health = await suppressWatchdog(port);
    return handle;
  } catch (error) {
    await cleanupFailedBridgeStart(handle);
    throw error;
  }
}

async function startInstalledBridge(port) {
  const launcher = spawn(
    WINDOWS_POWERSHELL,
    [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", path.join(__dirname, "start-installed-bridge.ps1"),
      "-Port", String(port),
      "-ScriptPath", path.join(REPO_ROOT, "Start-MultiTerm.ps1")
    ],
    { cwd: REPO_ROOT, env: windowsPowerShellEnvironment(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
  );
  const handle = new BridgeHandle({ child: launcher, mode: "installed", pid: 0, port });
  launcher.stdout.setEncoding("utf8");
  launcher.stdout.on("data", (text) => {
    const match = /^\s*(\d+)\s*$/m.exec(String(text));
    if (match) {
      handle.launcherReportedPid = Number(match[1]);
      handle.pid = handle.launcherReportedPid;
    }
  });
  launcher.stderr.setEncoding("utf8");
  launcher.stderr.on("data", (text) => handle.stderr.push(text));
  // The embedded C# is compiled at startup, so a healthy /health also proves the
  // bridge source still compiles.
  try {
    const health = await waitForHealth(port, 180000);
    if (!health) {
      throw new Error(`Installed bridge did not become healthy on port ${port}. output: ${handle.stderr.join("")}`);
    }
    const pidDeadline = Date.now() + 30000;
    while (handle.launcherReportedPid <= 0 && Date.now() < pidDeadline) await delay(50);
    if (!matchesInstalledBridgeHealth(handle, health)) {
      throw new Error(`Installed bridge identity mismatch on port ${port}: launcher PID ${handle.launcherReportedPid || "missing"}, health PID ${health.pid || "missing"}.`);
    }
    handle.health = await suppressWatchdog(port);
    if (!matchesInstalledBridgeHealth(handle, handle.health)) {
      throw new Error(`Installed bridge identity changed during startup on port ${port}.`);
    }
    return handle;
  } catch (error) {
    await cleanupFailedBridgeStart(handle);
    throw error;
  }
}

/**
 * @param {{ mode: "node" | "installed", port: number }} options
 */
async function startBridge({ mode, port }) {
  if (await isPortListening(port)) {
    throw new Error(`Port ${port} is already in use; refusing to benchmark against an unknown bridge.`);
  }
  return mode === "installed" ? startInstalledBridge(port) : startNodeBridge(port);
}

async function stopBridge(handle) {
  if (handle.stopped) return;
  handle.stopped = true;

  if (handle.mode === "installed") {
    await stopExactInstalledBridgeGracefully(handle, 60000);
  } else {
    handle.child.kill();
  }

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (!(await isPortListening(handle.port))) break;
    await delay(250);
  }

  if (handle.mode === "installed" && await isPortListening(handle.port)) {
    if (await forceStopExactInstalledBridge(handle)) {
      const forceDeadline = Date.now() + 10000;
      while (Date.now() < forceDeadline && await isPortListening(handle.port)) await delay(100);
    }
  } else if (handle.mode === "node" && handle.child.exitCode === null) {
    if (process.platform === "win32") {
      await runPowerShell(["-Command", `Stop-Process -Id ${handle.child.pid} -Force -ErrorAction SilentlyContinue`], 30000);
    } else {
      handle.child.kill("SIGKILL");
    }
  }
}

/**
 * Asserts the run left nothing behind. Throws with the offending detail rather
 * than returning a flag, because a dirty teardown invalidates the measurement.
 */
async function assertBridgeStopped(handle) {
  const problems = [];
  if (await isPortListening(handle.port)) {
    problems.push(`port ${handle.port} is still listening`);
  }
  const stray = await findProcessesForPort(handle.port);
  if (stray.length > 0) {
    problems.push(`stray processes remain: ${stray.map((row) => `${row.name}#${row.processId}`).join(", ")}`);
  }
  if (problems.length > 0) {
    throw new Error(`Benchmark teardown was not clean: ${problems.join("; ")}`);
  }
  return { port: handle.port, stray: [] };
}

module.exports = {
  BridgeHandle,
  REPO_ROOT,
  WINDOWS_POWERSHELL,
  WINDOWS_POWERSHELL_MODULE_PATH,
  assertBridgeStopped,
  delay,
  fetchHealth,
  cleanupFailedBridgeStart,
  matchesInstalledBridgeHealth,
  stopExactInstalledBridgeGracefully,
  forceStopExactInstalledBridge,
  findFreePort,
  findProcessesForPort,
  isPortListening,
  startBridge,
  stopBridge,
  suppressWatchdog,
  waitForHealth,
  windowsPowerShellEnvironment
};
