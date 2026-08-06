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

  // A killed bridge leaves its record behind, and Windows hands that PID to some
  // unrelated process. "The PID exists" then keeps the record alive forever and
  // every poll warns the user about a bridge that died long ago.
  it("prunes a stale record whose PID no longer owns the registered port", () => {
    expect(watchdog).toContain("function Test-BridgeOwnsPort");
    expect(watchdog).toContain("[int]$_.OwningProcess -eq $ProcessId");
    expect(watchdog).toMatch(
      /if \(\$null -eq \$bridgeProcess -or -not \(Test-BridgeOwnsPort -ProcessId \$recordPid -Port \$recordPort\)\) \{[\s\S]{0,200}?Remove-Item -LiteralPath \$file\.FullName/
    );
    // Get-NetTCPConnection throws rather than returning nothing when no row
    // matches, so filtering by port in the cmdlet would make "nothing is
    // listening" indistinguishable from "the TCP table is unreadable" -- and the
    // dead bridge this test exists for would never be pruned.
    expect(watchdog).toContain("Get-NetTCPConnection -State Listen -ErrorAction Stop");
    expect(watchdog).not.toContain("Get-NetTCPConnection -LocalPort $Port");
    expect(watchdog).toContain("$onPort = @($listeners | Where-Object { [int]$_.LocalPort -eq $Port })");
    expect(watchdog).toMatch(/if \(\$onPort\.Count -eq 0\) \{\s*return \$false/);
  });

  it("warns about command termination and requests protected graceful shutdown", () => {
    expect(watchdog).toContain("asks each terminal to exit cleanly first");
    expect(watchdog).toContain("will be interrupted and then terminated");
    expect(watchdog).toContain('"X-MultiTerm-Request" = "Launcher"');
    expect(watchdog).toContain('function Show-WatchdogDialog');
    expect(watchdog).toContain('"Keep terminals running"');
    expect(watchdog).toContain('"Close bridge and terminals"');
    expect(watchdog).toContain('$dialogState = [PSCustomObject]@{ Choice = "Keep" }');
    expect(watchdog).toMatch(/New-WatchdogButton -Text "Keep terminals running"[^\r\n]+-Default -Cancel/);
    expect(watchdog).not.toContain('System.Windows.MessageBox');
    expect(watchdog).toContain('Stop-WatchedBridge -BaseUri $promptUri');
  });

  it("uses a branded custom dialog for disconnected and unhealthy bridges", () => {
    expect(watchdog).toContain('[ValidateSet("FrontendClosed", "Unhealthy", "StopError")]');
    expect(watchdog).toContain('FRONTEND DISCONNECTED');
    expect(watchdog).toContain('WATCHDOG WARNING');
    expect(watchdog).toContain('SHUTDOWN FAILED');
    expect(watchdog).toContain('$window.Background = Get-WatchdogBrush "#111722"');
    expect(watchdog).toContain('Show-WatchdogDialog -Kind Unhealthy');
    expect(watchdog).toContain('Show-WatchdogDialog -Kind StopError');
    expect(watchdog).toContain('-NoLogo -NoProfile -Sta -WindowStyle Hidden');
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
