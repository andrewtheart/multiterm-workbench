/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const installer = fs.readFileSync(path.join(root, "installer", "MultiTerm.iss"), "utf8");
const artScript = fs.readFileSync(path.join(root, "scripts", "gen-installer-art.ps1"), "utf8");
const releaseBuild = fs.readFileSync(path.join(root, "scripts", "build-installer.ps1"), "utf8");

describe("modern installer UI", () => {
  it("uses a forced dark high-DPI wizard and branded raster artwork", () => {
    expect(installer).toContain("WizardStyle=modern dark includetitlebar hidebevels");
    expect(installer).toContain("WizardSizePercent=125");
    expect(installer).toContain("WizardKeepAspectRatio=yes");
    expect(installer).toContain("WizardImageFile=assets\\wizard-dark.png");
    expect(installer).toContain("WizardSmallImageFile=assets\\wizard-small-dark.png");
    expect(artScript).toContain("Format32bppArgb");
    expect(releaseBuild).toContain("gen-installer-art.ps1");
  });

  it("keeps both editor extensions explicitly optional", () => {
    expect(installer).toMatch(/Name: "vscodeextension";[^\r\n]*Flags: unchecked/);
    expect(installer).toMatch(/Name: "visualstudioextension";[^\r\n]*Flags: unchecked/);
    expect(installer).toContain("choose either, both, or neither");
  });

  it("preserves Windows Installed Apps registration and a styled uninstaller", () => {
    expect(installer).toContain("AppId={{2A8AE21C-CA11-4B78-8E6E-348A0EBB0E83}");
    expect(installer).toContain("UninstallDisplayIcon={app}\\MultiTerm.ico");
    expect(installer).toContain("UninstallDisplayName={#MyAppName}");
    expect(installer).toContain("Name: \"{group}\\{cm:UninstallProgram,{#MyAppName}}\"; Filename: \"{uninstallexe}\"");
    expect(installer).toContain("procedure InitializeUninstallProgressForm;");
    expect(installer).toContain("RemoveMultiTermVSCodeIntegration");
    expect(installer).toContain("RemoveMultiTermVisualStudioIntegration");
    expect(installer).toContain("{localappdata}\\MultiTerm\\Integrations\\VSCodeIntegrationInstalled.json");
    expect(installer).toContain("{localappdata}\\MultiTerm\\Integrations\\VisualStudioIntegrationInstalled.json");
  });
});