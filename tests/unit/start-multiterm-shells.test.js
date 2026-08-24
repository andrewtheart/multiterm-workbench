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
    expect(bridgeScript).toContain('new ShellInfo("pwsh.exe", " -NoLogo -NoExit", "PowerShell 7", "powershell")');
    expect(bridgeScript).toContain('new ShellInfo("powershell.exe", " -NoLogo -NoExit", "Windows PowerShell", "powershell")');
    expect(bridgeScript).toContain('new ShellInfo("cmd.exe", String.Empty, "Command Prompt", "cmd")');
    expect(bridgeScript).toContain('new ShellInfo("wsl.exe", String.Empty, "WSL", "posix")');
  });

  it("uses shell-specific arguments for normal and elevated sessions", () => {
    expect(bridgeScript).toContain('Json.Quote(shell.Arguments)');
    expect(bridgeScript).toContain('Json.Get(config, "shellArguments")');
    expect(bridgeScript).toContain('Json.QuoteCommandLine(this.Shell.File) + this.Shell.Arguments + extraArguments');
    expect(bridgeScript).not.toContain('Json.QuoteCommandLine(this.Shell.File) + " -NoLogo -NoExit"');
  });
});

describe("PowerShell bridge working-directory tracking", () => {
  it("reports the directory with the same sequence the renderer already parses", () => {
    expect(bridgeScript).toContain('public const string Marker = "]9;9;"');
    expect(bridgeScript).toContain("[Console]::Write([char]27 + ']9;9;' + $location.ProviderPath + [char]27 + '\\\\')");
  });

  it("wraps the prompt the user already has instead of replacing it", () => {
    expect(bridgeScript).toContain("$global:__MultiTermInnerPrompt = $function:prompt");
    expect(bridgeScript).toContain("& $global:__MultiTermInnerPrompt");
  });

  it("keeps the generated script path out of the command line", () => {
    expect(bridgeScript).toContain('" -Command \\"if ($env:" + EnvironmentVariable + ") { . $env:" + EnvironmentVariable + " }\\""');
  });

  it("restates the documented cmd prompt only when the user has none", () => {
    expect(bridgeScript).toContain('current = "$P$G"');
    expect(bridgeScript).toContain('return "$e" + Marker + "$p$e\\\\" + current;');
  });

  it("appends to PROMPT_COMMAND and forwards it through WSLENV", () => {
    expect(bridgeScript).toContain('environment["PROMPT_COMMAND"] = BashPromptCommand(');
    expect(bridgeScript).toContain('environment["WSLENV"] = WslEnv(');
    expect(bridgeScript).toContain('return current + "; " + emit;');
  });

  it("honours the renderer opt-out", () => {
    expect(bridgeScript).toContain('Json.Get(options, "shellIntegration"), "false"');
  });

  // Overriding the environment needs an explicit block; without the Unicode flag
  // CreateProcessW would read it as ANSI and every non-ASCII path would corrupt.
  it("passes a Unicode environment block only when it has overrides", () => {
    expect(bridgeScript).toContain("public const int CREATE_UNICODE_ENVIRONMENT = 0x00000400;");
    expect(bridgeScript).toContain("creationFlags |= Native.CREATE_UNICODE_ENVIRONMENT;");
    expect(bridgeScript).toContain("return IntPtr.Zero;");
    expect(bridgeScript).toContain("Marshal.FreeHGlobal(environmentBlock);");
  });
});