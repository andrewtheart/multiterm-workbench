/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const installer = fs.readFileSync(path.join(root, "installer", "MultiTerm.iss"), "utf8");
const bridge = fs.readFileSync(path.join(root, "Start-MultiTerm.ps1"), "utf8");
const installScript = fs.readFileSync(path.join(root, "installer", "explorer-integration", "Install-ExplorerIntegration.ps1"), "utf8");
const buildScript = fs.readFileSync(path.join(root, "installer", "explorer-integration", "build.ps1"), "utf8");
const commandSource = fs.readFileSync(path.join(root, "installer", "explorer-integration", "MultiTermExplorerCommand.cpp"), "utf8");
const renderer = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");

describe("File Explorer integration", () => {
  it("offers the context-menu feature enabled by default and honours clearing it", () => {
    expect(installer).toContain('Name: "explorercontext"');
    expect(installer).toContain("Add 'Open in MultiTerm' to File Explorer folder context menus");
    expect(installer).not.toMatch(/Name: "explorercontext"[^\r\n]+Flags: unchecked/);
    expect(installer).toContain("File Explorer integration:");
    expect(installer).not.toMatch(/Name: "explorercontext"[^\r\n]+Flags: checkedonce/);
    expect(installer).not.toMatch(/Name: "explorercontext"[^\r\n]+Check:/);
    expect(installer).not.toMatch(/Tasks: explorercontext[^\r\n]+Check: not IsAdminInstallMode/);
    expect(installer).toContain("if not WizardIsTaskSelected('explorercontext') then");
    expect(installer).toContain("not WizardIsTaskSelected('explorercontext')");
    expect(installer).toMatch(/runasoriginaluser|ExecAsOriginalUser/);
  });

  it("does not abort Setup when optional Explorer elevation is declined", () => {
    expect(installer).toContain("procedure UpdateExplorerIntegration;");
    expect(installer).toContain("CertificateTrusted := ShellExec(");
    expect(installer).toContain("if not CertificateTrusted then");
    expect(installer).toContain("ExtraArguments := ' -ClassicOnly'");
    expect(installer).toContain("Administrator approval for the Windows 11 File Explorer menu was declined or failed");
    expect(installer).toContain("MultiTerm installed normally and added the classic File Explorer menu instead.");
    expect(installScript).toContain("[switch]$ClassicOnly");
    expect(installScript).toContain("if (-not $ClassicOnly.IsPresent -and [Environment]::OSVersion.Version.Build -ge 22000)");
  });

  it("registers classic folder and folder-background verbs", () => {
    expect(installScript).toContain("Software\\Classes\\Directory\\shell\\MultiTerm.Workbench");
    expect(installScript).toContain("Software\\Classes\\Directory\\Background\\shell\\MultiTerm.Workbench");
    expect(installScript).toContain("Open in MultiTerm");
    expect(installScript).toContain('"%1\\."');
    expect(installScript).toContain('"%V\\."');
  });

  it("builds a real Windows 11 IExplorerCommand sparse package", () => {
    expect(buildScript).toContain('Category="windows.fileExplorerContextMenus"');
    expect(buildScript).toContain('Type="Directory"');
    expect(buildScript).toContain('Type="Directory\\Background"');
    expect(buildScript).toContain("New-SelfSignedCertificate");
    expect(buildScript).toContain("ExplorerCertificateInstallCommand");
    expect(buildScript).toContain("Get-AppxPackage -AllUsers");
    expect(commandSource).toContain("public IExplorerCommand");
    expect(commandSource).toContain("public IObjectWithSite");
    expect(commandSource).toContain("QueryService(SID_SFolderView");
    expect(commandSource).toContain('SHStrDupW(L"Open in MultiTerm"');
  });

  it("forwards validated folders through the installed bridge", () => {
    expect(bridge).toContain('[string]$OpenFolder = ""');
    expect(bridge).toContain('if (path == "/open-folder")');
    expect(bridge).toContain('"X-MultiTerm-Request"] != "Explorer"');
    expect(bridge).toContain('\\"type\\":\\"openFolder\\"');
    expect(bridge).toContain("PendingOpenFoldersJson");
    expect(bridge).toContain("public bool Send(string message)");
    expect(bridge).toContain("lock (this.openFolderLock)");
    expect(bridge).toContain("if (!client.IsRenderer)");
    expect(bridge).toContain("client.RendererVisible && !target.RendererVisible");
    expect(bridge).toContain("client.RendererActiveAt > target.RendererActiveAt");
    expect(bridge).toContain("private bool SendOpenFolderToExisting");
    expect(bridge).toContain("is already in use by another application");
    expect(renderer.indexOf("function openFolderInNewTerminal")).toBeGreaterThan(
      renderer.indexOf("function handleBridgeMessage")
    );
    expect(renderer).toContain('window.addEventListener("focus", announceRendererPresence)');
    expect(renderer).toContain('visible: document.visibilityState === "visible"');
  });

  it("forwards structured terminal and assistant options through the installed bridge", () => {
    for (const parameter of [
      "TerminalTitle", "TerminalCommand", "AssistantType", "AssistantModel", "AssistantEffort", "AssistantContext"
    ]) {
      expect(bridge).toContain(`[string]$${parameter} = ""`);
    }
    expect(bridge).toContain("private string NormalizeOpenTerminal(Dictionary<string, string> value, out bool hasOptions)");
    expect(bridge).toContain("private void DispatchOpenTerminal(string launch)");
    expect(bridge).toContain("private bool SendOpenTerminalToExisting(string launch)");
    expect(bridge).toContain('\\"type\\":\\"openTerminal\\"');
    expect(bridge).toContain('\\"openTerminals\\":');
    expect(renderer).toContain('if (message.type === "openTerminal")');
  });

  // A bridge whose window is closed still answers /open-folder, so forwarding
  // there queues the folder out of sight and looks like the click did nothing.
  it("only forwards a folder to a bridge that still has a renderer", () => {
    expect(bridge).toContain("Add-Member -NotePropertyName HasRenderer");
    expect(bridge).toContain("if (-not $instance.HasRenderer) { continue }");
    // Skipping every instance must still fall through to starting a visible one.
    expect(bridge).toMatch(/if \(-not \$instance\.HasRenderer\)[\s\S]{0,1500}\$useAutomaticPort = \$true/);
  });

  it("removes package, certificate, and classic verbs on uninstall", () => {
    expect(installer).toContain("[UninstallRun]");
    expect(installScript).toContain("Remove-ModernPackage");
    expect(installScript).toContain("Remove-ClassicVerbs");
    expect(installScript).toContain("FinalizeUninstall");
    expect(installer).toContain("ExplorerCertificateRemoveCommand");
    expect(installer).toContain('Verb: "runas"');
    expect(installScript).not.toContain("-Verb RunAs");
  });
});
