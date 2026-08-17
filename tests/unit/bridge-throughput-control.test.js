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
const net = require("node:net");
const childProcess = require("node:child_process");
const execFileMock = vi.fn();
const spawnMock = vi.fn();
const originalExecFile = childProcess.execFile;
const originalSpawn = childProcess.spawn;
childProcess.execFile = execFileMock;
childProcess.spawn = spawnMock;
const bridgeControl = require("../../benchmarks/bridge-throughput/bridge-control");
childProcess.execFile = originalExecFile;
childProcess.spawn = originalSpawn;

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: vi.fn(async () => body) };
}

function createChild({ exitCode = null, killed = false, pid = 4242, killUpdates = true } = {}) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = vi.fn();
  stderr.setEncoding = vi.fn();
  const child = {
    exitCode,
    killed,
    kill: vi.fn(() => {
      if (killUpdates) {
        child.killed = true;
        child.exitCode = 0;
      }
    }),
    pid,
    stderr,
    stdout
  };
  return child;
}

async function listen() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

describe("bridge throughput health and watchdog control", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads healthy responses and treats HTTP or transport failures as unavailable", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, pid: 1 }))
      .mockResolvedValueOnce(response({}, { ok: false, status: 503 }))
      .mockRejectedValueOnce(new Error("offline"));

    await expect(bridgeControl.fetchHealth(3199)).resolves.toEqual({ ok: true, pid: 1 });
    await expect(bridgeControl.fetchHealth(3199)).resolves.toBeNull();
    expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    await expect(bridgeControl.fetchHealth(3199)).resolves.toBeNull();
  });

  it("treats a socket timeout as a port that is not listening", async () => {
    const socket = new EventEmitter();
    socket.setTimeout = vi.fn();
    socket.destroy = vi.fn();
    vi.spyOn(net, "connect").mockReturnValue(socket);
    const listening = bridgeControl.isPortListening(3199);
    socket.emit("timeout");
    await expect(listening).resolves.toBe(false);
    expect(socket.setTimeout).toHaveBeenCalledWith(1000);
    expect(socket.destroy).toHaveBeenCalledOnce();
  });

  it("retries health checks and returns null at the deadline", async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(response({}, { ok: false }))
      .mockResolvedValueOnce(response({ ok: true }));
    const recovered = bridgeControl.waitForHealth(3199, 1000);
    await vi.advanceTimersByTimeAsync(200);
    await expect(recovered).resolves.toEqual({ ok: true });

    global.fetch = vi.fn(async () => response({}, { ok: false }));
    const expired = bridgeControl.waitForHealth(3199, 250);
    await vi.runAllTimersAsync();
    await expect(expired).resolves.toBeNull();
  });

  it("requires watchdog suppression from both the POST and health endpoint", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(response({ watchdogSuppressed: true }))
      .mockResolvedValueOnce(response({ ok: true, watchdogSuppressed: true }));
    await expect(bridgeControl.suppressWatchdog(3199)).resolves.toMatchObject({ watchdogSuppressed: true });

    global.fetch = vi.fn().mockResolvedValueOnce(response({}, { ok: false, status: 500 }));
    await expect(bridgeControl.suppressWatchdog(3199)).rejects.toThrow("HTTP 500");

    global.fetch = vi.fn()
      .mockResolvedValueOnce(response({ watchdogSuppressed: false }))
      .mockResolvedValueOnce(response({ watchdogSuppressed: true }));
    await expect(bridgeControl.suppressWatchdog(3199)).rejects.toThrow("did not confirm");

    global.fetch = vi.fn()
      .mockResolvedValueOnce(response({ watchdogSuppressed: true }))
      .mockResolvedValueOnce(response({ watchdogSuppressed: false }));
    await expect(bridgeControl.suppressWatchdog(3199)).rejects.toThrow("did not confirm");
  });
});

describe("bridge throughput process discovery", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    execFileMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
    vi.restoreAllMocks();
  });

  it("returns no process rows outside Windows", async () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
    await expect(bridgeControl.findProcessesForPort(3199)).resolves.toEqual([]);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("uses stable Windows path fallbacks when environment roots are absent", () => {
    const previousWindir = process.env.WINDIR;
    const previousProgramFiles = process.env.ProgramFiles;
    try {
      delete process.env.WINDIR;
      delete process.env.ProgramFiles;
      const modulePath = require.resolve("../../benchmarks/bridge-throughput/bridge-control");
      delete require.cache[modulePath];
      const fallback = require(modulePath);
      expect(fallback.WINDOWS_POWERSHELL).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
      expect(fallback.WINDOWS_POWERSHELL_MODULE_PATH).toBe([
        "C:\\Program Files\\WindowsPowerShell\\Modules",
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules"
      ].join(";"));
      delete require.cache[modulePath];
    } finally {
      if (previousWindir === undefined) delete process.env.WINDIR;
      else process.env.WINDIR = previousWindir;
      if (previousProgramFiles === undefined) delete process.env.ProgramFiles;
      else process.env.ProgramFiles = previousProgramFiles;
    }
  });

  it("parses empty, malformed, single, and multiple PowerShell results", async () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    const outputs = [
      "",
      "not-json",
      JSON.stringify({ ProcessId: "7", Name: null, CommandLine: null }),
      JSON.stringify([
        { ProcessId: 8, Name: "node", CommandLine: "server.js --port 3199" },
        { ProcessId: 9, Name: "pwsh", CommandLine: "Start-MultiTerm.ps1 3199" }
      ])
    ];
    execFileMock.mockImplementation((executable, args, options, callback) => {
      callback(null, outputs.shift(), "");
    });

    await expect(bridgeControl.findProcessesForPort(3199)).resolves.toEqual([]);
    await expect(bridgeControl.findProcessesForPort(3199)).resolves.toEqual([]);
    await expect(bridgeControl.findProcessesForPort(3199)).resolves.toEqual([
      { commandLine: "", name: "", processId: 7 }
    ]);
    await expect(bridgeControl.findProcessesForPort(3199)).resolves.toEqual([
      { commandLine: "server.js --port 3199", name: "node", processId: 8 },
      { commandLine: "Start-MultiTerm.ps1 3199", name: "pwsh", processId: 9 }
    ]);
    expect(execFileMock).toHaveBeenCalledTimes(4);
    expect(execFileMock.mock.calls[0][0]).toBe(bridgeControl.WINDOWS_POWERSHELL);
    expect(execFileMock.mock.calls[0][2]).toMatchObject({ timeout: 30000, windowsHide: true });
  });
});

describe("bridge throughput bridge lifecycle", () => {
  const originalFetch = global.fetch;
  const originalPlatform = process.platform;

  beforeEach(() => {
    spawnMock.mockReset();
    execFileMock.mockReset();
    execFileMock.mockImplementation((executable, args, options, callback) => callback(null, "", ""));
    Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts and stops a node bridge with watchdog suppression", async () => {
    const port = await bridgeControl.findFreePort();
    const child = createChild();
    spawnMock.mockReturnValue(child);
    global.fetch = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, pid: child.pid }))
      .mockResolvedValueOnce(response({ watchdogSuppressed: true }))
      .mockResolvedValueOnce(response({ ok: true, watchdogSuppressed: true }));

    const handle = await bridgeControl.startBridge({ mode: "node", port });
    child.stderr.emit("data", "diagnostic");
    expect(handle).toMatchObject({ mode: "node", pid: child.pid, port, stderr: ["diagnostic"] });
    expect(handle.url).toBe(`http://127.0.0.1:${port}`);
    expect(child.stdout.setEncoding).toHaveBeenCalledWith("utf8");
    expect(child.stderr.setEncoding).toHaveBeenCalledWith("utf8");
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/server\.js$/)],
      expect.objectContaining({ env: expect.objectContaining({ HOST: "127.0.0.1", PORT: String(port) }) })
    );

    await bridgeControl.stopBridge(handle);
    expect(handle.stopped).toBe(true);
    expect(child.kill).toHaveBeenCalledOnce();
    await bridgeControl.stopBridge(handle);
    expect(child.kill).toHaveBeenCalledOnce();
    await expect(bridgeControl.assertBridgeStopped(handle)).resolves.toEqual({ port, stray: [] });
  });

  it("starts and stops an installed bridge and records its real pid", async () => {
    const port = await bridgeControl.findFreePort();
    const launcher = createChild({ pid: 5000 });
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => launcher.stdout.emit("data", "6000\n"));
      return launcher;
    });
    global.fetch = vi.fn()
      .mockResolvedValueOnce(response({ ok: true, app: "MultiTerm Workbench", pid: "6000", port }))
      .mockResolvedValueOnce(response({ watchdogSuppressed: true }))
      .mockResolvedValueOnce(response({ ok: true, app: "MultiTerm Workbench", pid: 6000, port, watchdogSuppressed: true }))
      .mockResolvedValueOnce(response({ app: "MultiTerm Workbench", pid: 6000, port }));

    const handle = await bridgeControl.startBridge({ mode: "installed", port });
    launcher.stderr.emit("data", "installed diagnostic");
    expect(handle).toMatchObject({ mode: "installed", pid: 6000, launcherReportedPid: 6000, stderr: ["installed diagnostic"] });
    expect(launcher.stdout.setEncoding).toHaveBeenCalledWith("utf8");
    expect(spawnMock.mock.calls[0][0]).toBe(bridgeControl.WINDOWS_POWERSHELL);

    await bridgeControl.stopBridge(handle);
    expect(execFileMock).toHaveBeenCalledWith(
      bridgeControl.WINDOWS_POWERSHELL,
      expect.arrayContaining(["-File", expect.stringMatching(/Start-MultiTerm\.ps1$/), "-Port", String(port), "-Stop"]),
      expect.objectContaining({ timeout: 60000 }),
      expect.any(Function)
    );
  });

  it("refuses occupied ports and reports unhealthy node and installed startup", async () => {
    const server = await listen();
    const occupiedPort = server.address().port;
    await expect(bridgeControl.startBridge({ mode: "node", port: occupiedPort })).rejects.toThrow("already in use");
    await new Promise((resolve) => server.close(resolve));

    const realSetImmediate = setImmediate;
    vi.useFakeTimers();
    global.fetch = vi.fn(async () => response({}, { ok: false }));
    const nodeChild = createChild();
    spawnMock.mockReturnValueOnce(nodeChild);
    const nodeFailure = bridgeControl.startBridge({ mode: "node", port: occupiedPort });
    const nodeRejection = expect(nodeFailure).rejects.toThrow("Node bridge did not become healthy");
    while (spawnMock.mock.calls.length < 1) await new Promise(realSetImmediate);
    await vi.runAllTimersAsync();
    await nodeRejection;
    expect(nodeChild.kill).toHaveBeenCalledOnce();

    const installedChild = createChild();
    spawnMock.mockReturnValueOnce(installedChild);
    const installedFailure = bridgeControl.startBridge({ mode: "installed", port: occupiedPort });
    const installedRejection = expect(installedFailure).rejects.toThrow("Installed bridge did not become healthy");
    while (spawnMock.mock.calls.length < 2) await new Promise(realSetImmediate);
    await vi.runAllTimersAsync();
    await installedRejection;
    expect(installedChild.kill).toHaveBeenCalledOnce();
  });

  it("rejects a healthy endpoint whose pid differs from the launcher report", async () => {
    const port = await bridgeControl.findFreePort();
    const launcher = createChild({ pid: 5000 });
    spawnMock.mockImplementationOnce(() => {
      queueMicrotask(() => launcher.stdout.emit("data", "6000\n"));
      return launcher;
    });
    global.fetch = vi.fn().mockResolvedValue(response({
      app: "MultiTerm Workbench", pid: 9999, port
    }));

    await expect(bridgeControl.startBridge({ mode: "installed", port }))
      .rejects.toThrow("launcher PID 6000, health PID 9999");

    const commands = execFileMock.mock.calls.map((call) => call[1].join(" "));
    expect(commands.join("\n")).not.toContain("-Stop");
    expect(commands.join("\n")).not.toContain("Stop-Process -Id 6000");
  });

  it("forces a second node kill when the child ignores the first request", async () => {
    const port = await bridgeControl.findFreePort();
    const child = createChild({ killUpdates: false });
    const handle = new bridgeControl.BridgeHandle({ child, mode: "node", pid: child.pid, port });
    await bridgeControl.stopBridge(handle);
    expect(child.kill).toHaveBeenCalledTimes(2);
    expect(child.kill).toHaveBeenLastCalledWith("SIGKILL");
  });

  it("does not force-kill a failed installed pid without matching health ownership", async () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    const listener = await listen();
    const port = listener.address().port;
    const child = createChild({ exitCode: 0, pid: 5000 });
    const handle = new bridgeControl.BridgeHandle({ child, mode: "installed", pid: 6789, port });
    global.fetch = vi.fn().mockResolvedValue(response({ app: "MultiTerm Workbench", pid: 9999, port }));

    try {
      await bridgeControl.cleanupFailedBridgeStart(handle);
    } finally {
      await new Promise((resolve) => listener.close(resolve));
    }

    const commands = execFileMock.mock.calls.map((call) => call[1].join(" "));
    expect(commands.join("\n")).not.toContain("-Stop");
    expect(commands.join("\n")).not.toContain("Stop-Process -Id 6789");
  });

  it("force-stops only the installed pid verified by health on that port", async () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    const handle = new bridgeControl.BridgeHandle({ child: createChild(), mode: "installed", pid: 6789, port: 43199 });
    global.fetch = vi.fn()
      .mockResolvedValueOnce(response({ app: "MultiTerm Workbench", pid: 6789, port: 43199 }))
      .mockResolvedValueOnce(response({ app: "MultiTerm Workbench", pid: 9999, port: 43199 }));

    await expect(bridgeControl.forceStopExactInstalledBridge(handle)).resolves.toBe(true);
    await expect(bridgeControl.forceStopExactInstalledBridge(handle)).resolves.toBe(false);

    const commands = execFileMock.mock.calls.map((call) => call[1].join(" "));
    expect(commands.filter((command) => command.includes("Stop-Process -Id 6789 -Force"))).toHaveLength(1);
    expect(commands.join("\n")).not.toContain("Stop-Process -Id 9999");
  });

  it("waits for a listening port to close during teardown", async () => {
    const server = await listen();
    const port = server.address().port;
    const child = createChild();
    child.exitCode = 0;
    const handle = new bridgeControl.BridgeHandle({ child, mode: "node", pid: child.pid, port });
    setTimeout(() => server.close(), 20);
    await bridgeControl.stopBridge(handle);
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("reports listening ports and stray Windows processes as dirty teardown", async () => {
    const server = await listen();
    const port = server.address().port;
    const handle = new bridgeControl.BridgeHandle({ child: createChild(), mode: "node", pid: 1, port });
    await expect(bridgeControl.assertBridgeStopped(handle)).rejects.toThrow(`port ${port} is still listening`);
    await new Promise((resolve) => server.close(resolve));

    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    execFileMock.mockImplementation((executable, args, options, callback) => callback(null, JSON.stringify({
      ProcessId: 77,
      Name: "node",
      CommandLine: `server.js ${port}`
    }), ""));
    await expect(bridgeControl.assertBridgeStopped(handle)).rejects.toThrow("stray processes remain: node#77");
  });
});