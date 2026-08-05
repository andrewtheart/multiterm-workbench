/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const project = fs.readFileSync(path.join(root, "integrations", "visualstudio", "MultiTerm.VisualStudio.csproj"), "utf8");
const manifest = fs.readFileSync(path.join(root, "integrations", "visualstudio", "source.extension.vsixmanifest"), "utf8");
const commands = fs.readFileSync(path.join(root, "integrations", "visualstudio", "Commands.vsct"), "utf8");
const packageSource = fs.readFileSync(path.join(root, "integrations", "visualstudio", "MultiTermPackage.cs"), "utf8");
const buildScript = fs.readFileSync(path.join(root, "integrations", "visualstudio", "build.ps1"), "utf8");
const installScript = fs.readFileSync(path.join(root, "installer", "visualstudio-integration", "Install-VisualStudioIntegration.ps1"), "utf8");
const installer = fs.readFileSync(path.join(root, "installer", "MultiTerm.iss"), "utf8");
const releaseBuild = fs.readFileSync(path.join(root, "scripts", "build-installer.ps1"), "utf8");

describe("Visual Studio integration", () => {
  it("targets supported 64-bit Visual Studio editions and packages a registered async package", () => {
    expect(manifest).toContain('Id="andrewtheart.multiterm-workbench.visualstudio"');
    expect(manifest).toContain('Version="[17.0,19.0)"');
    expect(manifest).toContain("<ProductArchitecture>amd64</ProductArchitecture>");
    expect(manifest).toContain("Microsoft.VisualStudio.Component.CoreEditor");
    expect(project).toContain("<VSSDKBuildToolsAutoSetup>true</VSSDKBuildToolsAutoSetup>");
    expect(project).toContain("<CreateVsixContainer>true</CreateVsixContainer>");
    expect(packageSource).toContain("AsyncPackage");
    expect(packageSource).toContain("ProvideMenuResource");
  });

  it("contributes Solution Explorer and Tools commands that use the installed folder launcher", () => {
    for (const menu of [
      "IDM_VS_MENU_TOOLS",
      "IDM_VS_CTXT_SOLNNODE",
      "IDM_VS_CTXT_PROJNODE",
      "IDM_VS_CTXT_ITEMNODE",
      "IDM_VS_CTXT_FOLDERNODE"
    ]) expect(commands).toContain(menu);
    expect(packageSource).toContain('" -OpenFolder "');
    expect(packageSource).toContain("SpecialFolder.LocalApplicationData");
    expect(packageSource).toContain("SpecialFolder.ProgramFiles");
    expect(packageSource).toContain("CreateNoWindow = true");
  });

  it("builds, installs, removes, and release-versions the VSIX through the installer", () => {
    expect(buildScript).not.toContain("CMAKE");
    expect(buildScript).toContain("Microsoft.Component.MSBuild");
    expect(buildScript).toContain("multiterm-workbench-visualstudio-$Version.vsix");
    expect(installScript).toContain("VSIXInstaller.exe");
    expect(installScript).toContain("/quiet");
    expect(installScript).toContain('"/uninstall:$extensionId"');
    expect(installScript).toContain("-Wait -PassThru");
    expect(installScript).toContain("$process.ExitCode");
    expect(installScript).toContain("MultiTerm\\Integrations");
    expect(installScript).toContain("$legacyStateFile");
    expect(installer).toContain('Name: "visualstudioextension"');
    expect(installer).toMatch(/Name: "visualstudioextension";[^\r\n]*Flags: unchecked/);
    expect(installer).toContain("Install-VisualStudioIntegration.ps1");
    expect(installer).toContain("ShouldRemoveVisualStudioIntegration");
    expect(installer).toContain("RemoveMultiTermVisualStudioIntegration");
    expect(installer).toContain("{localappdata}\\MultiTerm\\Integrations\\VisualStudioIntegrationInstalled.json");
    expect(releaseBuild).toContain("integrations\\visualstudio\\build.ps1");
    expect(releaseBuild).toContain("VisualStudioManifestPath");
  });
});