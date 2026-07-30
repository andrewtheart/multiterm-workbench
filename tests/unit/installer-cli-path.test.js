/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const installer = fs.readFileSync(path.join(root, "installer", "MultiTerm.iss"), "utf8");
const launcher = fs.readFileSync(path.join(root, "installer", "cli", "multiterm.cmd"), "utf8");
const pathManager = fs.readFileSync(path.join(root, "installer", "cli", "Manage-SystemPath.ps1"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

describe("installer command-line integration", () => {
  it("offers an optional system PATH task and installs the multiterm launcher", () => {
    expect(installer).toContain('Name: "systempath"');
    expect(installer).toContain("Add MultiTerm to the system PATH");
    expect(installer).toContain("Tasks: systempath");
    expect(installer).toMatch(/Name: "systempath"[^\r\n]+Check: IsProtectedSystemPathInstall/);
    expect(installer).toMatch(/-Action Install[^\r\n]+Tasks: systempath; Check: IsProtectedSystemPathInstall/);
    expect(installer).toContain('Source: "cli\\multiterm.cmd"; DestDir: "{app}"');
    expect(installer).toContain('Source: "cli\\Manage-SystemPath.ps1"; DestDir: "{app}\\CLI"');
  });

  it("launches the dashboard by default and forwards explicit CLI arguments", () => {
    expect(launcher).toContain('"%~dp0Start-MultiTerm.ps1"');
    expect(launcher).toContain("-ConsoleDashboard");
    expect(launcher).toContain("-ConsoleDashboard -NewInstance");
    expect(launcher).toContain("%*");
  });

  it("tracks ownership and removes only the installer-managed machine PATH entry", () => {
    expect(pathManager).toContain("[EnvironmentVariableTarget]::Machine");
    expect(pathManager).toContain('"SystemPathInstalled.json"');
    expect(pathManager).toContain("WM_SETTINGCHANGE");
    expect(pathManager).toContain("Test-ProtectedInstallPath");
    expect(pathManager).toContain("outside Program Files");
    expect(pathManager).toMatch(/if \(\$matchingEntries\.Count -eq 0\)[\s\S]*Set-Content/);
    expect(pathManager).toMatch(/if \(-not \(Test-Path -LiteralPath \$markerPath[\s\S]*return/);
    expect(pathManager).toMatch(/\$lastMatchingIndex[\s\S]*Normalize-PathEntry \$entries\[\$index\]/);
    expect(pathManager).toContain("if ($index -ne $lastMatchingIndex)");
    expect(installer).toContain("ShouldRemoveSystemPath");
    expect(installer).toContain("ShouldUninstallSystemPath");
    expect(installer).toContain("IsProtectedSystemPathInstall");
    expect(installer).toContain("SystemPathIntegrationStateExists");
    expect(installer).toMatch(/function ShouldRemoveSystemPath[\s\S]*?IsProtectedSystemPathInstall/);
    expect(installer).toMatch(/function ShouldUninstallSystemPath[\s\S]*?IsProtectedSystemPathInstall/);
    expect(installer).toContain('RunOnceId: "RemoveMultiTermSystemPath"');
  });

  it("documents the command and clean PATH lifecycle", () => {
    expect(readme).toMatch(/Add\s+MultiTerm to the system PATH/);
    expect(readme).toContain("machine-wide installation");
    expect(readme).toContain("multiterm -Stop");
    expect(readme).toContain("multiterm -Stop -Port 3178");
    expect(readme).toContain("removes only the PATH entry it added");
  });
});
