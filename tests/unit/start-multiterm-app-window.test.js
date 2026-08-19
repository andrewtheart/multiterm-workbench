/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const bridgeScript = fs.readFileSync(path.join(repoRoot, "Start-MultiTerm.ps1"), "utf8");
const nodeBridge = fs.readFileSync(path.join(repoRoot, "src", "server.js"), "utf8");
const renderer = fs.readFileSync(path.join(repoRoot, "public/app.js"), "utf8");
const installer = fs.readFileSync(path.join(repoRoot, "installer/MultiTerm.iss"), "utf8");

describe("app window profile", () => {
  it("keeps the browser profile outside the installed program directory", () => {
    // Settings, pages and notes live in this profile. If it ever moved under
    // {app}, reinstalling would discard everything the user customised.
    expect(bridgeScript).toContain("string profileRoot = Path.Combine(");
    expect(bridgeScript).toContain("Environment.SpecialFolder.LocalApplicationData");
    expect(bridgeScript).toContain('"MultiTerm", "AppShell"');
  });

  it("pins the default port to the historic profile so upgrades keep settings", () => {
    expect(bridgeScript).toContain("this.port == 3177");
    expect(bridgeScript).toContain("? profileRoot");
    expect(bridgeScript).toContain('Path.Combine(profileRoot, "Instances"');
  });

  it("never deletes user data on install or uninstall", () => {
    // The installer may only clear stale editor packages inside {app}.
    expect(installer).not.toContain("[UninstallDelete]");
    const installDelete = installer.slice(installer.indexOf("[InstallDelete]"), installer.indexOf("[Files]"));
    const removals = installDelete.split(/\r?\n/).filter((line) => line.trim().startsWith("Type:"));
    expect(removals).toEqual([
      'Type: files; Name: "{app}\\VSCode\\*.vsix"',
      'Type: files; Name: "{app}\\VisualStudio\\*.vsix"'
    ]);
  });
});

describe("shared browser profile warning", () => {
  it("marks both default-browser fallbacks", () => {
    // Neither fallback can pass --user-data-dir, so both leave MultiTerm's
    // storage in the user's ordinary browsing data.
    const marks = bridgeScript.match(/this\.MarkSharedBrowserProfile\(\);/g) || [];
    expect(marks).toHaveLength(2);
    expect(bridgeScript).toContain("private void MarkSharedBrowserProfile()");
    expect(bridgeScript).toContain("this.sharedBrowserProfile = true;");
    expect(bridgeScript).toContain('this.Log("warn", "No Chromium-based browser was found');
  });

  it("does not mark the profile when an app-mode browser is found", () => {
    const appMode = bridgeScript.slice(
      bridgeScript.indexOf("string browser = this.FindAppModeBrowser();"),
      bridgeScript.indexOf("// No Chromium-based browser found")
    );
    expect(appMode).toContain('--user-data-dir=\\"');
    expect(appMode).not.toContain("MarkSharedBrowserProfile");
  });

  it("reports the state to the renderer from both bridges", () => {
    expect(bridgeScript).toContain('",\\"sharedBrowserProfile\\":" + (this.sharedBrowserProfile ? "true" : "false")');
    // Electron owns its window, so the Node bridge is always isolated.
    expect(nodeBridge).toContain("sharedBrowserProfile: false,");
  });

  it("warns once per window in the renderer", () => {
    expect(renderer).toContain("warnAboutSharedBrowserProfile(message.sharedBrowserProfile === true);");
    expect(renderer).toContain("function warnAboutSharedBrowserProfile(shared) {");
    expect(renderer).toContain("if (!shared || state.sharedBrowserProfileWarned) return;");
    expect(renderer).toContain("state.sharedBrowserProfileWarned = true;");
  });
});
