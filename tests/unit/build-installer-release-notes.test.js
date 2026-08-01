/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "build-installer.ps1");
const script = fs.readFileSync(scriptPath, "utf8");

function runCompareLinkFormatter() {
  const command = [
    "$tokens = $null",
    "$parseErrors = $null",
    "$ast = [System.Management.Automation.Language.Parser]::ParseFile($env:RELEASE_SCRIPT, [ref]$tokens, [ref]$parseErrors)",
    "if ($parseErrors.Count) { throw ($parseErrors | Out-String) }",
    "$functionAst = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Add-ReleaseCompareLink' }, $true)",
    "if (-not $functionAst) { throw 'Add-ReleaseCompareLink not found' }",
    "Invoke-Expression $functionAst.Extent.Text",
    "$notes = \"## What's changed`n- Fixed PTY.`n`n## Installation`nRun installer.\"",
    "$withLink = Add-ReleaseCompareLink -Notes $notes -RepositorySlug 'andrewtheart/multiterm-workbench' -PreviousReleaseTag 'v0.1.49' -ReleaseTag 'v0.1.50'",
    "$withoutBase = Add-ReleaseCompareLink -Notes $notes -RepositorySlug 'andrewtheart/multiterm-workbench' -PreviousReleaseTag '' -ReleaseTag 'v0.1.14'",
    "$idempotent = Add-ReleaseCompareLink -Notes $withLink -RepositorySlug 'andrewtheart/multiterm-workbench' -PreviousReleaseTag 'v0.1.49' -ReleaseTag 'v0.1.50'",
    "[pscustomobject]@{ WithLink=$withLink; WithoutBase=$withoutBase; Idempotent=($idempotent -eq $withLink); CompareCount=([regex]::Matches($idempotent, '/compare/').Count) } | ConvertTo-Json -Compress"
  ].join("; ");

  const output = childProcess.execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, RELEASE_SCRIPT: scriptPath }
    }
  );
  return JSON.parse(output.trim());
}

describe("installer release notes", () => {
  it("appends one compare link and skips releases without a comparison base", () => {
    const result = runCompareLinkFormatter();

    expect(result.WithLink).toContain("## Full changelog");
    expect(result.WithLink).toContain(
      "[Compare v0.1.49...v0.1.50](https://github.com/andrewtheart/multiterm-workbench/compare/v0.1.49...v0.1.50)"
    );
    expect(result.WithoutBase).not.toContain("## Full changelog");
    expect(result.Idempotent).toBe(true);
    expect(result.CompareCount).toBe(1);
  });

  it("routes generated release notes through the compare-link formatter", () => {
    expect(script).toContain(
      "return Add-ReleaseCompareLink -Notes $notes -RepositorySlug $RepositorySlug -PreviousReleaseTag $PreviousReleaseTag -ReleaseTag $ReleaseTag"
    );
    expect(script).toContain(
      "New-CopilotReleaseNotes -RepositoryRoot $RepoRoot -RepositorySlug $RepoSlug"
    );
  });
});
