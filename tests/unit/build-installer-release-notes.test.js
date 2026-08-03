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

function runPowerShellFunctions(names, commands) {
  const loadFunctions = names.map((name) => [
    `$functionAst = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq '${name}' }, $true)`,
    `if (-not $functionAst) { throw '${name} not found' }`,
    "Invoke-Expression $functionAst.Extent.Text"
  ]).flat();
  const command = [
    "$tokens = $null",
    "$parseErrors = $null",
    "$ast = [System.Management.Automation.Language.Parser]::ParseFile($env:RELEASE_SCRIPT, [ref]$tokens, [ref]$parseErrors)",
    "if ($parseErrors.Count) { throw ($parseErrors | Out-String) }",
    ...loadFunctions,
    ...commands
  ].join("; ");

  return childProcess.execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, RELEASE_SCRIPT: scriptPath }
    }
  ).trim();
}

function runCompareLinkFormatter() {
  const output = runPowerShellFunctions(["Add-ReleaseCompareLink"], [
    "$notes = \"## What's changed`n- Fixed PTY.`n`n## Installation`nRun installer.\"",
    "$withLink = Add-ReleaseCompareLink -Notes $notes -RepositorySlug 'andrewtheart/multiterm-workbench' -PreviousReleaseTag 'v0.1.49' -ReleaseTag 'v0.1.50'",
    "$withoutBase = Add-ReleaseCompareLink -Notes $notes -RepositorySlug 'andrewtheart/multiterm-workbench' -PreviousReleaseTag '' -ReleaseTag 'v0.1.14'",
    "$idempotent = Add-ReleaseCompareLink -Notes $withLink -RepositorySlug 'andrewtheart/multiterm-workbench' -PreviousReleaseTag 'v0.1.49' -ReleaseTag 'v0.1.50'",
    "[pscustomobject]@{ WithLink=$withLink; WithoutBase=$withoutBase; Idempotent=($idempotent -eq $withLink); CompareCount=([regex]::Matches($idempotent, '/compare/').Count) } | ConvertTo-Json -Compress"
  ]);
  return JSON.parse(output);
}

function runDeterministicNotesFormatter() {
  const output = runPowerShellFunctions([
    "Add-DeterministicReleaseDetails",
    "Add-ReleaseCompareLink"
  ], [
    "$notes = \"## What's changed`n- Improved release flow.`n`n## Installation`nDownload and run the installer.\"",
    "$withDetails = Add-DeterministicReleaseDetails -Notes $notes -AssetName 'MultiTerm-Setup-0.1.50.exe' -AssetSize 12345 -AssetSha256 'abcdef123456'",
    "$withLink = Add-ReleaseCompareLink -Notes $withDetails -RepositorySlug 'andrewtheart/multiterm-workbench' -PreviousReleaseTag 'v0.1.49' -ReleaseTag 'v0.1.50'",
    "[pscustomobject]@{ Notes=$withLink; FullChangelogCount=([regex]::Matches($withLink, '(?im)^##\\s+Full\\s+changelog\\s*$')).Count } | ConvertTo-Json -Compress"
  ]);
  return JSON.parse(output);
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
  }, 20000);

  it("routes generated release notes through the compare-link formatter", () => {
    expect(script).toContain(
      "$notes = Add-DeterministicReleaseDetails -Notes $notes -AssetName $AssetName -AssetSize $AssetSize -AssetSha256 $AssetSha256"
    );
    expect(script).toContain(
      "return Add-ReleaseCompareLink -Notes $notes -RepositorySlug $RepositorySlug -PreviousReleaseTag $PreviousReleaseTag -ReleaseTag $ReleaseTag"
    );
    expect(script).toContain(
      "New-CopilotReleaseNotes -RepositoryRoot $RepoRoot -RepositorySlug $RepoSlug"
    );
  });

  it("adds deterministic asset and validation sections before appending one full changelog link", () => {
    const result = runDeterministicNotesFormatter();

    expect(result.Notes).toContain("## Assets");
    expect(result.Notes).toContain("- MultiTerm-Setup-0.1.50.exe");
    expect(result.Notes).toContain("- Size: 12345 bytes");
    expect(result.Notes).toContain("- SHA-256: abcdef123456");
    expect(result.Notes).toContain("## Validation");
    expect(result.Notes).toContain("Installer build completed.");
    expect(result.Notes).toContain("Version metadata consistency checks completed.");
    expect(result.Notes).toContain("## Installation");
    expect(result.FullChangelogCount).toBe(1);
  }, 20000);

  it("accepts exact atomic groups and rejects duplicate, unknown, and omitted paths", () => {
    const output = runPowerShellFunctions(
      ["ConvertFrom-CopilotCommitPlan", "Assert-AtomicCommitPlan"],
      [
        "$paths = @('main.js', 'tests/unit/main.test.js')",
        "$valid = ConvertFrom-CopilotCommitPlan -RawPlan 'prefix {\"groups\":[{\"message\":\"fix(security): restrict handoff\",\"paths\":[\"main.js\",\"tests/unit/main.test.js\"]}]} suffix'",
        "$checked = Assert-AtomicCommitPlan -Plan $valid -PendingPaths $paths",
        "$duplicateRejected = $false",
        "try { Assert-AtomicCommitPlan -Plan (ConvertFrom-Json '{\"groups\":[{\"message\":\"fix: one\",\"paths\":[\"main.js\"]},{\"message\":\"test: two\",\"paths\":[\"main.js\",\"tests/unit/main.test.js\"]}]}') -PendingPaths $paths | Out-Null } catch { $duplicateRejected = $true }",
        "$unknownRejected = $false",
        "try { Assert-AtomicCommitPlan -Plan (ConvertFrom-Json '{\"groups\":[{\"message\":\"fix: one\",\"paths\":[\"main.js\",\"unknown.js\"]}]}') -PendingPaths $paths | Out-Null } catch { $unknownRejected = $true }",
        "$omittedRejected = $false",
        "try { Assert-AtomicCommitPlan -Plan (ConvertFrom-Json '{\"groups\":[{\"message\":\"fix: one\",\"paths\":[\"main.js\"]}]}') -PendingPaths $paths | Out-Null } catch { $omittedRejected = $true }",
        "[pscustomobject]@{ Groups=@($checked.groups).Count; DuplicateRejected=$duplicateRejected; UnknownRejected=$unknownRejected; OmittedRejected=$omittedRejected } | ConvertTo-Json -Compress"
      ]
    );
    expect(JSON.parse(output)).toEqual({
      Groups: 1,
      DuplicateRejected: true,
      UnknownRejected: true,
      OmittedRejected: true
    });
  });

  it("parses ordinary status paths but refuses automated rename splitting", () => {
    const output = runPowerShellFunctions(["Get-ConservativePendingPaths"], [
      "$paths = @(Get-ConservativePendingPaths -StatusLines @(' M main.js', '?? docs/security/security.md'))",
      "$renameRejected = $false",
      "try { Get-ConservativePendingPaths -StatusLines @('R  old.js -> new.js') | Out-Null } catch { $renameRejected = $true }",
      "[pscustomobject]@{ Paths=$paths; RenameRejected=$renameRejected } | ConvertTo-Json -Compress"
    ]);
    expect(JSON.parse(output)).toEqual({
      Paths: ["main.js", "docs/security/security.md"],
      RenameRejected: true
    });
  });

  it("uses read-only planning, non-mutating staging preflight, interactive dirty flow, and release verification", () => {
    const deferredBlocks = script.match(/<#\s*DEFERRED:[\s\S]*?#>/g) || [];
    const nonDeferredScript = script.replace(/<#\s*DEFERRED:[\s\S]*?#>/g, "");

    expect(script).toContain("Never split or repeat a file across commits");
    expect(script).toContain("--deny-tool shell --deny-tool write");
    expect(script).toContain("Assert-PushGitPreflight -RepositoryRoot $RepoRoot");
    expect(script).toContain("Test-AtomicCommitStaging -RepositoryRoot $RepositoryRoot -Plan $plan");
    expect(script).toContain("$env:GIT_INDEX_FILE = $tempIndex");
    expect(script).not.toContain("git -C $RepositoryRoot reset --mixed HEAD");
    expect(script).toContain("Invoke-InteractiveDirtyPublishCommitFlow -RepositoryRoot $RepoRoot -ReleaseTag $Tag -CopilotExecutable $plannerPath");
    expect(script).toContain("Apply this whole-file commit plan? (yes/abort)");
    expect(script).toContain("Copilot whole-file commit plan is unavailable, invalid, or unsafe.");
    expect(script).not.toContain("Choose commit mode: (1) apply whole-file plan, (2) interactive hunk review, (3) abort");
    expect(script).not.toContain("Proceed with interactive hunk review now, or abort? (review/abort)");
    expect(script).not.toContain("Invoke-InteractiveHunkCommitGroup -RepositoryRoot");
    expect(nonDeferredScript).not.toContain("git -C $RepositoryRoot add --patch -- @Paths");
    expect(deferredBlocks.some((block) => block.includes("git -C $RepositoryRoot add --patch -- @Paths"))).toBe(true);
    expect(script).toContain("Assert-PublishedRelease -GhPath $GhPath");
    expect(script).toContain('Get-PreviousPublishedReleaseTag -GhPath $GhPath -RepositorySlug $RepoSlug -CurrentTag $Tag');
    expect(script).toContain("[WhatIf] Planned output: $OutputExe");
  });
});
