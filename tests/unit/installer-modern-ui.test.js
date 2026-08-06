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

function installerSection(startMarker, endMarker) {
  const start = installer.indexOf(startMarker);
  const end = installer.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing installer marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing installer marker: ${endMarker}`).toBeGreaterThan(start);
  return installer.slice(start, end);
}

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

  // Every integration ships enabled; the editor extensions carry an explicit
  // experimental label because they change another IDE's installed state.
  it("enables every integration by default and marks the editor extensions experimental", () => {
    const tasks = installerSection("[Tasks]", "[Files]");
    expect(tasks).not.toMatch(/Flags:[^\r\n]*unchecked/);
    expect(installer).toMatch(/Name: "vscodeextension";[^\r\n]*Visual Studio Code extension \(experimental\)/);
    expect(installer).toMatch(/Name: "visualstudioextension";[^\r\n]*Visual Studio extension \(experimental\)/);
    expect(installer).toContain("Editor extensions (experimental; clear a box to skip or remove one):");
    expect(installer).toContain("the editor extensions are experimental");
  });

  it("checks both editor helper start and exit failures as the original user", () => {
    const runner = installerSection("procedure RunEditorIntegration(", "procedure UpdateEditorIntegrations;");
    expect(runner).toContain("ExecAsOriginalUser(");
    expect(runner).toContain("if not ExecAsOriginalUser(");
    expect(runner).toContain("Setup could not start the ' + EditorName + ' integration helper.");
    expect(runner).toContain("if ResultCode <> 0 then");
    expect(runner).toContain("integration helper failed with exit code");
  });

  it("installs selected editor integrations and removes recorded deselected integrations", () => {
    const update = installerSection("procedure UpdateEditorIntegrations;", "procedure CurStepChanged(");
    expect(update).toContain("if WizardIsTaskSelected('vscodeextension') then");
    expect(update).toContain("VSCodeReloadNotice := VSCodeWasRunningDuringInstall;");
    expect(update).toContain("else if VSCodeIntegrationStateExists then");
    expect(update).toMatch(/VSCode\\Install-VSCodeIntegration\.ps1'[\s\S]*?' -Uninstall'/);
    expect(update).toContain("if WizardIsTaskSelected('visualstudioextension') then");
    expect(update).toContain("VisualStudioRestartNotice := True;");
    expect(update).toContain("else if VisualStudioIntegrationStateExists then");
    expect(update).toMatch(/VisualStudio\\Install-VisualStudioIntegration\.ps1'[\s\S]*?' -Uninstall'/);
  });

  it("runs editor updates for post-install and keeps AI bootstrap interactive-only", () => {
    const postInstall = installerSection("procedure CurStepChanged(", "function VisualStudioIsRunning:");
    expect(postInstall).toContain("if CurStep = ssPostInstall then");
    expect(postInstall).toContain("UpdateEditorIntegrations;");
    expect(postInstall).toContain("if not WizardSilent then");
    expect(postInstall).toContain("WriteAiProviderBootstrap;");
    expect(postInstall.indexOf("UpdateEditorIntegrations;")).toBeLessThan(
      postInstall.indexOf("WriteAiProviderBootstrap;")
    );
  });

  it("blocks selected Visual Studio changes on a running IDE or failed safety probe", () => {
    const processCheck = installerSection("function VisualStudioIsRunning:", "function PrepareToInstall(");
    const preflight = installerSection("function PrepareToInstall(", "function SystemPathIntegrationStateExists:");
    expect(processCheck).toContain("GetProcessesByName(''devenv'')");
    expect(processCheck).toContain("if not Exec(");
    expect(processCheck).toContain("Result := True;");
    expect(processCheck).toContain("Result := ResultCode <> 0;");
    expect(preflight).toContain("WizardIsTaskSelected('visualstudioextension') and VisualStudioIsRunning");
    expect(preflight).toContain("Setup will not force-close the IDE");
    expect(preflight.indexOf("VisualStudioIsRunning")).toBeLessThan(preflight.indexOf("ExtractTemporaryFile"));
    expect(installer).not.toContain("/shutdownprocesses");
  });

  it("shows only the completion guidance required by recorded editor state", () => {
    const completion = installerSection("procedure CurPageChanged(", "procedure InitializeUninstallProgressForm;");
    expect(completion).toContain("else if CurPageID = wpFinished then");
    expect(completion).toContain("if VSCodeReloadNotice then");
    expect(completion).toContain("Restart Extensions");
    expect(completion).toContain("Developer: Reload Window");
    expect(completion).toContain("if VisualStudioRestartNotice then");
    expect(completion).toContain("will load the next time Visual Studio starts");
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