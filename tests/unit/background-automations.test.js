/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const bridgeScript = fs.readFileSync(path.join(root, "Start-MultiTerm.ps1"), "utf8");
const installer = fs.readFileSync(path.join(root, "installer", "MultiTerm.iss"), "utf8");

describe("background automation relaunch", () => {
  it("opens a minimized window instead of a console when the task launches the installed build", () => {
    expect(bridgeScript).toContain("[switch]$Background,");
    expect(bridgeScript).toContain("$Background.IsPresent)");
    expect(bridgeScript).toContain("this.OpenBrowser(this.backgroundLaunch)");
    expect(bridgeScript).toContain("public static void OpenBackgroundWindow(string url, string publicDir)");
    expect(bridgeScript).toMatch(/OpenBackgroundWindow\(string url, string publicDir\)[\s\S]{0,400}?shell\.OpenBrowser\(true\)/);
  });

  // A coarse repeat must never pile up windows: an instance that already has one
  // needs nothing, and one that lost its window only needs a minimized one.
  it("reuses a live instance rather than starting a second bridge every repeat", () => {
    expect(bridgeScript).toContain("if ($Background.IsPresent -and -not $Stop.IsPresent) {");
    expect(bridgeScript).toMatch(/if \(\$Background\.IsPresent[\s\S]{0,600}?if \(\$liveInstance\.HasRenderer\) \{[\s\S]{0,120}?exit 0/);
    expect(bridgeScript).toMatch(/OpenBackgroundWindow\(\[string\]\$liveInstance\.url, \$publicDir\)[\s\S]{0,40}?exit 0/);
    expect(bridgeScript.indexOf("if ($Background.IsPresent -and -not $Stop.IsPresent) {"))
      .toBeLessThan(bridgeScript.indexOf("$bridge = [MultiTerm.PowerShellBridge.BridgeServer]::new("));
  });

  it("offers a per-user task that never runs as SYSTEM and never needs elevation", () => {
    const task = installer.match(/^Name: "backgroundautomations";[^\r\n]+$/m);
    expect(task).toBeTruthy();
    expect(task[0]).not.toMatch(/Flags:\s*(?:checkedonce|unchecked)/);
    expect(installer).toContain("procedure RegisterBackgroundAutomationTask;");
    expect(installer).toContain("<LogonType>InteractiveToken</LogonType>");
    expect(installer).toContain("<RunLevel>LeastPrivilege</RunLevel>");
    expect(installer).toContain("<StartWhenAvailable>true</StartWhenAvailable>");
    expect(installer).toContain("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
    expect(installer).toContain('" -Background</Arguments>');
    const procedure = installer.slice(
      installer.indexOf("procedure RegisterBackgroundAutomationTask;"),
      installer.indexOf("procedure CurStepChanged(CurStep: TSetupStep);")
    );
    expect(procedure).toContain("ExecAsOriginalUser(");
    expect(procedure).not.toContain("/RU ");
    expect(procedure).not.toContain('Verb: "runas"');
    expect(procedure).not.toContain("runas");
  });

  // v0.1.74 aborted Setup through an integration helper exactly this way.
  it("reports a refused registration on the finish page instead of aborting Setup", () => {
    const procedure = installer.slice(
      installer.indexOf("procedure RegisterBackgroundAutomationTask;"),
      installer.indexOf("procedure CurStepChanged(CurStep: TSetupStep);")
    );
    expect(procedure).not.toContain("RaiseException");
    expect(procedure).toContain("BackgroundTaskProblem :=");
    expect(procedure).toContain("IntToStr(ResultCode)");
    expect(installer).toContain("BackgroundTaskProblem: String;");
    expect(installer).toMatch(/if BackgroundTaskProblem <> '' then[\s\S]{0,200}?FinishedLabel\.Caption/);
    expect(installer).toMatch(/ssPostInstall[\s\S]{0,200}?RegisterBackgroundAutomationTask;/);
  });

  it("removes the task when the option is cleared and when MultiTerm is uninstalled", () => {
    expect(installer).toMatch(/if not WizardIsTaskSelected\('backgroundautomations'\) then[\s\S]{0,300}?\/Delete \/TN "MultiTerm Background Automations" \/F/);
    expect(installer).toMatch(/^\[UninstallRun\][\s\S]*?schtasks\.exe"; Parameters: "\/Delete \/TN ""MultiTerm Background Automations"" \/F"[^\r\n]*RunOnceId: "RemoveMultiTermBackgroundTask"/m);
  });
});
