/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  findLauncher,
  folderForResource,
  launcherCandidates
} = require("../../integrations/vscode/launcher");

const root = path.resolve(__dirname, "../..");
const manifest = require("../../integrations/vscode/package.json");
const extensionSource = fs.readFileSync(path.join(root, "integrations", "vscode", "extension.js"), "utf8");
const installer = fs.readFileSync(path.join(root, "installer", "MultiTerm.iss"), "utf8");
const installScript = fs.readFileSync(
  path.join(root, "installer", "vscode-integration", "Install-VSCodeIntegration.ps1"),
  "utf8"
);

describe("VS Code integration", () => {
  it("contributes file, folder, and workspace Explorer commands", () => {
    expect(manifest.contributes.menus["explorer/context"]).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "multiterm.openContainingFolder" }),
      expect.objectContaining({ command: "multiterm.openFolder" }),
      expect.objectContaining({ command: "multiterm.openWorkspace" })
    ]));
    expect(manifest.contributes.menus["view/title"]).toContainEqual(
      expect.objectContaining({ command: "multiterm.openWorkspace" })
    );
    expect(extensionSource).toContain("resource?.scheme === \"file\"");
    expect(extensionSource).toContain("chooseWorkspaceFolder()");
  });

  it("resolves a selected file to its containing folder and preserves folders", () => {
    expect(folderForResource("C:\\work\\repo\\src\\app.js", false)).toBe(
      path.resolve("C:\\work\\repo\\src")
    );
    expect(folderForResource("C:\\work\\repo", true)).toBe(path.resolve("C:\\work\\repo"));
    expect(folderForResource("", false)).toBeNull();
  });

  it("finds configured and standard installed launchers", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-vscode-"));
    const launcher = path.join(directory, "Start-MultiTerm.ps1");
    fs.writeFileSync(launcher, "Write-Host MultiTerm");
    try {
      expect(findLauncher(launcher, {})).toBe(path.resolve(launcher));
      expect(launcherCandidates("", {
        LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
        ProgramFiles: "C:\\Program Files"
      })).toEqual(expect.arrayContaining([
        path.resolve("C:\\Users\\tester\\AppData\\Local\\Programs\\MultiTerm Workbench\\Start-MultiTerm.ps1"),
        path.resolve("C:\\Program Files\\MultiTerm Workbench\\Start-MultiTerm.ps1")
      ]));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("packages and installs the VSIX as an optional installer task", () => {
    expect(installer).toContain('Name: "vscodeextension"');
    expect(installer).toContain("Install-VSCodeIntegration.ps1");
    expect(installer).toContain("vscode-integration\\generated\\*.vsix");
    expect(installScript).toContain("--install-extension");
    expect(installScript).toContain("--uninstall-extension");
    expect(installScript).toContain("andrewtheart.multiterm-workbench");
  });
});
