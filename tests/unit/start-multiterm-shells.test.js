/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const bridgeScript = fs.readFileSync(path.resolve(__dirname, "../../Start-MultiTerm.ps1"), "utf8");

describe("PowerShell bridge shell selection", () => {
  it("maps every shell offered by the UI to its native executable", () => {
    expect(bridgeScript).toContain('new ShellInfo("pwsh.exe", " -NoLogo -NoExit", "PowerShell 7")');
    expect(bridgeScript).toContain('new ShellInfo("powershell.exe", " -NoLogo -NoExit", "Windows PowerShell")');
    expect(bridgeScript).toContain('new ShellInfo("cmd.exe", String.Empty, "Command Prompt")');
    expect(bridgeScript).toContain('new ShellInfo("wsl.exe", String.Empty, "WSL")');
  });

  it("uses shell-specific arguments for normal and elevated sessions", () => {
    expect(bridgeScript).toContain('Json.Quote(shell.Arguments)');
    expect(bridgeScript).toContain('Json.Get(config, "shellArguments")');
    expect(bridgeScript).toContain('Json.QuoteCommandLine(this.Shell.File) + this.Shell.Arguments');
    expect(bridgeScript).not.toContain('Json.QuoteCommandLine(this.Shell.File) + " -NoLogo -NoExit"');
  });
});