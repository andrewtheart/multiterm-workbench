/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const watchdogPath = path.join(root, "scripts", "MultiTerm-Watchdog.ps1");
const watchdogBytes = fs.readFileSync(watchdogPath);
const watchdog = watchdogBytes.toString("utf8");
const installer = fs.readFileSync(path.join(root, "installer", "MultiTerm.iss"), "utf8");
const nodeBridge = fs.readFileSync(path.join(root, "server.js"), "utf8");
const installedBridge = fs.readFileSync(path.join(root, "Start-MultiTerm.ps1"), "utf8");

 describe("optional MultiTerm watchdog", () => {
  it("is safe for Windows PowerShell 5.1 and runs once per interactive session", () => {
    expect([...watchdogBytes].every((byte) => byte < 0x80)).toBe(true);
    expect(watchdog).toContain('[switch]$Stop');
    expect(watchdog).toContain('"Local\\MultiTermWatchdog"');
    expect(watchdog).toContain('"Local\\MultiTermWatchdogStop"');
    expect(watchdog).not.toMatch(/Stop-Process|taskkill/i);
  });

  it("validates bridge identity and distinguishes renderers from live sessions", () => {
    expect(watchdog).toContain('$health.app -ne "MultiTerm Workbench"');
    expect(watchdog).toContain('[int]$health.pid -ne $recordPid');
    expect(watchdog).toContain('[int]$health.port -ne $recordPort');
    expect(watchdog).toContain('$rendererClients = [int]$health.rendererClients');
    expect(watchdog).toContain('$sessionCount = [int]$health.sessions');
    expect(watchdog).toContain('[bool]$health.watchdogSuppressed');
    expect(watchdog).toContain('$pollMilliseconds = 10000');
    expect(watchdog).toContain('$rendererGraceSeconds = 12');
  });

  it("warns about command termination and requests protected graceful shutdown", () => {
    expect(watchdog).toContain("asks each terminal to exit cleanly first");
    expect(watchdog).toContain("will be interrupted and then terminated");
    expect(watchdog).toContain('"X-MultiTerm-Request" = "Launcher"');
    expect(watchdog).toContain('[System.Windows.MessageBoxButton]::YesNo');
    expect(watchdog).toContain('Stop-WatchedBridge -BaseUri $promptUri');
  });

  it("launches notifications outside the polling process", () => {
    expect(watchdog).toContain('function Start-WatchdogPrompt');
    expect(watchdog).toContain('Start-Process -FilePath $powershell');
    expect(watchdog).toContain('-PromptBridgeUrl');
    expect(watchdog.indexOf('if ($PromptBridgeUrl)')).toBeLessThan(watchdog.indexOf('$watchdogMutex = New-Object'));
    expect(watchdog).not.toContain('Show-BridgeClosePrompt -Url $recordUri.AbsoluteUri');
    expect(watchdog).not.toContain('Show-UnhealthyBridgeWarning -Url $recordUri.AbsoluteUri');
  });

  it("is offered by Setup as a per-user startup agent and stopped on uninstall", () => {
    const watchdogTask = installer.match(/^Name: "watchdog"[^\r\n]+$/m);
    expect(watchdogTask).toBeTruthy();
    expect(watchdogTask[0]).not.toMatch(/Flags:\s*(?:checkedonce|unchecked)/);
    expect(installer).toContain('Source: "{#RepoRoot}\\scripts\\MultiTerm-Watchdog.ps1"; DestDir: "{app}\\Watchdog"');
    expect(installer).toContain('Name: "{userstartup}\\MultiTerm Watchdog"');
    expect(installer).toMatch(/MultiTerm-Watchdog\.ps1"" -Stop[^\r\n]+RunOnceId: "StopMultiTermWatchdog"/);
  });

  it("uses one discovery and control contract in both bridges", () => {
    for (const source of [nodeBridge, installedBridge]) {
      expect(source).toContain("rendererPresence");
      expect(source).toContain("watchdogKeepBridge");
      expect(source).toContain("rendererClients");
      expect(source).toContain("watchdogSuppressed");
      expect(source).toContain("/watchdog/keep");
    }
    expect(nodeBridge).toContain('bridgeType: "electron"');
    expect(installedBridge).toContain('\\"bridgeType\\":\\"installed\\"');
  });

  it("keeps the installed bridge alive until staged session shutdown completes", () => {
    expect(installedBridge).toContain("this.WaitForSessionsToExit(6000);");
    expect(installedBridge).toMatch(/WaitForSessionsToExit\(6000\);[\s\S]*session\.Kill\(\);[\s\S]*WaitForSessionsToExit\(1000\);/);
    expect(installedBridge).toMatch(/private void WaitForSessionsToExit\(int timeoutMilliseconds\)[\s\S]*!this\.sessions\.IsEmpty/);
  });
});
