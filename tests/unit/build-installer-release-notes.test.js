/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "build-installer.ps1");
const script = fs.readFileSync(scriptPath, "utf8");
const nativeGuard = fs.readFileSync(path.join(repoRoot, "scripts", "confirm-native-module-unlocked.ps1"), "utf8");
const nativeRebuild = fs.readFileSync(path.join(repoRoot, "scripts", "rebuild-native.ps1"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const nativeInstruction = fs.readFileSync(
  path.join(repoRoot, ".github", "instructions", "native-rebuild.instructions.md"),
  "utf8"
);

function runPowerShellFunctions(names, commands, extraEnv = {}) {
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
      env: { ...process.env, ...extraEnv, RELEASE_SCRIPT: scriptPath }
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
  it("guards native rebuilds before installer side effects and avoids broad process kills", () => {
    const guardCall = '& $NativeModuleGuardPath -RepositoryRoot $RepoRoot';
    expect(script).toContain(guardCall);
    expect(script.indexOf(guardCall)).toBeLessThan(script.indexOf('Write-Step "Generating in-app help..."'));
    expect(script.indexOf(guardCall)).toBeLessThan(script.indexOf('Set-VersionInFile -Path $PackageJsonPath'));

    expect(packageJson.scripts["rebuild:native"]).toContain("scripts\\rebuild-native.ps1");
    expect(packageJson.scripts.preinstall).toContain("confirm-native-module-unlocked.ps1 -NonInteractive");
    expect(nativeRebuild).toContain("& $guardPath -RepositoryRoot $repositoryRoot");
    expect(nativeRebuild).toContain("rebuild '@homebridge/node-pty-prebuilt-multiarch' --foreground-scripts");

    expect(nativeGuard).toContain("conpty.node lock holder");
    expect(nativeGuard).toContain("Stop-Process -Id $blockingProcess.Id -Force");
    expect(nativeGuard).not.toMatch(/Stop-Process\s+-Name/);
    expect(nativeGuard).not.toMatch(/taskkill[^\r\n]*\/IM/i);
    expect(nativeInstruction).toContain("npm run rebuild:native");
    expect(nativeInstruction).toContain("Stop only the PIDs returned by the repo-specific guard");
  });

  it("can isolate pending work for a release and always restores its exact stash", () => {
    expect(script).toContain("[switch]$IgnorePendingChanges,");
    expect(script).toContain("$null = Invoke-Native {");
    expect(script).toContain("git --no-pager -C $RepositoryRoot stash push --include-untracked --message $marker");
    expect(script).toContain("git --no-pager -C $RepositoryRoot stash apply --index $commit");
    expect(script).toContain("git --no-pager -C $RepositoryRoot stash drop --quiet $matchingRef");
    expect(script).toContain("local file(s) revealed by stashed ignore rules");
    expect(script).toContain("Remove-TemporaryReleaseExcludes -StashRecord $StashRecord");
    expect(script).toContain("-IgnorePendingChanges could not isolate every pending path");
    expect(script).toContain("its -IgnorePendingChanges setting does not match this run");
    expect(script).toContain("ignorePendingChanges = [bool]$IgnorePendingChanges");
    expect(script).toContain("-IgnorePendingChanges cannot be combined with -NoGitCommit");

    const guardCall = "& $NativeModuleGuardPath -RepositoryRoot $RepoRoot";
    const saveCall = "Save-PendingChangesForRelease -RepositoryRoot $RepoRoot";
    const restoreCall = "Restore-PendingChangesForRelease -RepositoryRoot $RepoRoot -StashRecord $PendingChangeStash";
    expect(script.indexOf(guardCall)).toBeLessThan(script.indexOf(saveCall));
    expect(script.indexOf(saveCall)).toBeLessThan(script.indexOf("# --- Current version"));
    expect(script.lastIndexOf("finally {")).toBeLessThan(script.lastIndexOf(restoreCall));
    expect(script.lastIndexOf(restoreCall)).toBeGreaterThan(script.indexOf('Write-Step "Release $Tag published."'));
    expect(script).toContain("$ReleasePipelineError = $_");
    expect(script).toContain("The release failed and pending-change restoration also failed");
  });

  it("normalizes empty native output without dereferencing null", () => {
    expect(script).toContain("Where-Object { $_ -ne $null } | ForEach-Object { $_.ToString() }");
  });

  it("prefers a Windows PowerShell-compatible Copilot application over a PowerShell shim", () => {
    expect(script).toContain("function Resolve-CopilotExecutable");
    expect(script).toContain("Get-Command 'copilot.exe', 'copilot.bat', 'copilot' -All");
    expect(script).toContain("CommandTypes]::Application");
    expect(script).toContain("if ($extension -ieq '.exe') { 0 }");
    expect(script).not.toContain("Get-Command 'copilot' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source");
    expect(script).toContain('"--prompt=$launcherPrompt"');
    expect(script).toContain("Read and follow the instructions in this file: $promptPath");
    expect(script).toContain("WriteAllText($promptPath, $prompt");
    expect(script).toContain("--deny-tool=shell --deny-tool=write");
    expect(script).not.toContain('"--prompt=$prompt"');
    expect(script).not.toContain(" -p $prompt ");
    expect(runPowerShellFunctions(["Resolve-CopilotExecutable"], [
      "Resolve-CopilotExecutable"
    ])).toMatch(/copilot\.exe$/i);
  });

  it("re-asks about a surviving lock holder instead of aborting", () => {
    // A process that still holds conpty.node after the first round is usually a
    // sibling instance, so the guard offers to stop it rather than giving up.
    expect(nativeGuard).toContain("while ($blockingProcesses.Count -gt 0) {");
    expect(nativeGuard).toContain("$blockingProcesses = @(Wait-MultiTermNativeModuleRelease");
    expect(nativeGuard).toContain("after $MaxAttempts attempt(s)");

    // Every stop still needs its own explicit yes, and a bounded number of rounds
    // keeps a stubborn holder from prompting forever.
    const loop = nativeGuard.slice(nativeGuard.indexOf("while ($blockingProcesses.Count -gt 0) {"));
    expect(loop).toContain("Read-Host");
    expect(loop.indexOf("Read-Host")).toBeLessThan(loop.indexOf("Stop-MultiTermNativeProcess -Processes"));
    expect(loop).toContain("if ($answer -ine 'yes') {");

    // Noninteractive callers must still fail closed before any prompt or kill.
    const blockedThrow = nativeGuard.indexOf('throw "Native rebuild blocked by MultiTerm process PID(s)');
    expect(blockedThrow).toBeGreaterThan(-1);
    expect(blockedThrow).toBeLessThan(nativeGuard.indexOf("Read-Host"));
  });

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
      "return Add-ReleaseCompareLink -Notes $notes -RepositorySlug $RepositorySlug -PreviousReleaseTag ([string]$Base.tag) -ReleaseTag $ReleaseTag"
    );
    expect(script).toContain(
      "New-CopilotReleaseNotes -RepositoryRoot $RepoRoot -RepositorySlug $RepoSlug"
    );
  });

  it("commits every synchronized release-version file", () => {
    expect(script).toContain(
      "git --no-pager -C $RepoRoot add -- package.json package-lock.json installer/MultiTerm.iss public/app.js integrations/visualstudio/source.extension.vsixmanifest"
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
        "$wrappedRaw = '{' + [Environment]::NewLine + '\"groups\":[{\"message\":\"fix(secur' + [Environment]::NewLine + 'ity): restrict handoff\",\"paths\":[\"main.js\",\"tests/unit/main.te' + [Environment]::NewLine + 'st.js\"]}]' + [Environment]::NewLine + '}'",
        "$wrapped = ConvertFrom-CopilotCommitPlan -RawPlan $wrappedRaw",
        "$checked = Assert-AtomicCommitPlan -Plan $valid -PendingPaths $paths",
        "$wrappedChecked = Assert-AtomicCommitPlan -Plan $wrapped -PendingPaths $paths",
        "$duplicateRejected = $false",
        "try { Assert-AtomicCommitPlan -Plan (ConvertFrom-Json '{\"groups\":[{\"message\":\"fix: one\",\"paths\":[\"main.js\"]},{\"message\":\"test: two\",\"paths\":[\"main.js\",\"tests/unit/main.test.js\"]}]}') -PendingPaths $paths | Out-Null } catch { $duplicateRejected = $true }",
        "$unknownRejected = $false",
        "try { Assert-AtomicCommitPlan -Plan (ConvertFrom-Json '{\"groups\":[{\"message\":\"fix: one\",\"paths\":[\"main.js\",\"unknown.js\"]}]}') -PendingPaths $paths | Out-Null } catch { $unknownRejected = $true }",
        "$omittedRejected = $false",
        "try { Assert-AtomicCommitPlan -Plan (ConvertFrom-Json '{\"groups\":[{\"message\":\"fix: one\",\"paths\":[\"main.js\"]}]}') -PendingPaths $paths | Out-Null } catch { $omittedRejected = $true }",
        "[pscustomobject]@{ Groups=@($checked.groups).Count; WrappedGroups=@($wrappedChecked.groups).Count; DuplicateRejected=$duplicateRejected; UnknownRejected=$unknownRejected; OmittedRejected=$omittedRejected } | ConvertTo-Json -Compress"
      ]
    );
    expect(JSON.parse(output)).toEqual({
      Groups: 1,
      WrappedGroups: 1,
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
    expect(script).toContain("--deny-tool=shell --deny-tool=write");
    expect(script).toContain("Assert-PushGitPreflight -RepositoryRoot $RepoRoot");
    expect(script).toContain("Test-AtomicCommitStaging -RepositoryRoot $RepositoryRoot -Plan $plan");
    expect(script).toContain("$env:GIT_INDEX_FILE = $tempIndex");
    expect(script).not.toContain("git -C $RepositoryRoot reset --mixed HEAD");
    expect(script).toContain("Invoke-InteractiveDirtyPublishCommitFlow -RepositoryRoot $RepoRoot -ReleaseTag $Tag -CopilotExecutable $plannerPath");
    expect(script).toContain('$choice = (Read-Host "Apply this whole-file commit plan? (yes/abort)").Trim()');
    expect(script).toContain("if ($choice -ine 'yes')");
    expect(script).toContain("Copilot whole-file commit plan is unavailable, invalid, or unsafe.");
    expect(script).not.toContain("Choose commit mode: (1) apply whole-file plan, (2) interactive hunk review, (3) abort");
    expect(script).not.toContain("Proceed with interactive hunk review now, or abort? (review/abort)");
    expect(script).not.toContain("Invoke-InteractiveHunkCommitGroup -RepositoryRoot");
    expect(nonDeferredScript).not.toContain("git --no-pager -C $RepositoryRoot add --patch -- @Paths");
    expect(deferredBlocks.some((block) => block.includes("git --no-pager -C $RepositoryRoot add --patch -- @Paths"))).toBe(true);
    expect(script).toContain("Assert-PublishedRelease -GhPath $GhPath");
    // The last published release is resolved through Resolve-ReleaseNotesBase,
    // which owns the fallbacks a bare tag lookup cannot express.
    expect(script).toContain('Get-PreviousPublishedReleaseTag -GhPath $GhPath -RepositorySlug $RepositorySlug -CurrentTag $CurrentTag');
    expect(script).toContain("$ReleaseNotesBase = Resolve-ReleaseNotesBase -RepositoryRoot $RepoRoot -GhPath $GhPath -RepositorySlug $RepoSlug");
    expect(script).toContain("[WhatIf] Planned output: $OutputExe");
  });

  it("enforces explicit git --no-pager in active code and keeps representative commands hardened", () => {
    const deferredBlocks = script.match(/<#\s*DEFERRED:[\s\S]*?#>/g) || [];
    const nonDeferredScript = script.replace(/<#\s*DEFERRED:[\s\S]*?#>/g, "");

    expect(nonDeferredScript).not.toMatch(/(?<![#\w-])&?\s*git\s+-C\s+/m);
    expect(nonDeferredScript).not.toMatch(/&\s*git\s+@(?![^\r\n]*--no-pager)/m);

    const representative = [
      "git --no-pager -C $RepositoryRoot diff --stat",
      "git --no-pager -C $RepositoryRoot log --no-merges",
      "git --no-pager -C $RepositoryRoot commit -m",
      "git --no-pager -C $RepoRoot push origin HEAD"
    ];
    for (const marker of representative) {
      expect(script).toContain(marker);
    }

    expect(deferredBlocks.some((block) => block.includes("git --no-pager -C"))).toBe(true);
  });
});

describe("atomic commit path verification", () => {
  // Rename detection pairs a delete with an add and reports only the destination,
  // so a move would otherwise appear to stage and commit half its paths.
  const root = path.join(os.tmpdir(), `mt-release-move-${process.pid}`);

  function git(cwd, args) {
    childProcess.execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });
  }

  beforeAll(() => {
    fs.rmSync(root, { force: true, recursive: true });
    fs.mkdirSync(root, { recursive: true });
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "release@test.invalid"]);
    git(root, ["config", "user.name", "Release Test"]);
    fs.writeFileSync(path.join(root, "server.js"), "module.exports = { serve: true };\n".repeat(20));
    fs.writeFileSync(path.join(root, "keep.md"), "unrelated\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-m", "chore: seed"]);

    // The exact shape of the pending src/ restructure: a delete plus an untracked add.
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.renameSync(path.join(root, "server.js"), path.join(root, "src", "server.js"));
  });

  afterAll(() => {
    fs.rmSync(root, { force: true, recursive: true });
  });

  it("accepts a group holding both halves of a move", () => {
    const output = runPowerShellFunctions(
      ["Invoke-Native", "Get-NativeOutput", "ConvertTo-AbsolutePath", "Test-AtomicCommitStaging"],
      [
        "$plan = [pscustomobject]@{ groups = @([pscustomobject]@{ message = 'refactor: move'; paths = @('server.js', 'src/server.js') }) }",
        "$result = Test-AtomicCommitStaging -RepositoryRoot $env:MOVE_REPO -Plan $plan",
        "[pscustomobject]@{ Ok = $result } | ConvertTo-Json -Compress"
      ],
      { MOVE_REPO: root }
    );
    expect(JSON.parse(output)).toEqual({ Ok: true });
  });

  it("still rejects a pathspec that stages more than it names", () => {
    // A directory entry expands to its files, so the group would commit paths the
    // reviewed plan never listed.
    let failure;
    try {
      runPowerShellFunctions(
        ["Invoke-Native", "Get-NativeOutput", "ConvertTo-AbsolutePath", "Test-AtomicCommitStaging"],
        [
          "$plan = [pscustomobject]@{ groups = @([pscustomobject]@{ message = 'refactor: directory'; paths = @('src') }) }",
          "Test-AtomicCommitStaging -RepositoryRoot $env:MOVE_REPO -Plan $plan | Out-Null"
        ],
        { MOVE_REPO: root }
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message.replace(/\s+/g, " ")).toContain("Staging did not select exactly the planned paths");
  });

  it("verifies a committed move by both of its paths", () => {
    const output = runPowerShellFunctions(
      ["Get-NativeOutput", "Assert-CommitishMatchesPaths"],
      [
        "git -C $env:MOVE_REPO add -A -- 'server.js' 'src/server.js' | Out-Null",
        "git -C $env:MOVE_REPO commit -q -m 'refactor: move' | Out-Null",
        "Assert-CommitishMatchesPaths -RepositoryRoot $env:MOVE_REPO -ExpectedPaths @('server.js', 'src/server.js') -Label 'refactor: move'",
        "$rejected = $false",
        "try { Assert-CommitishMatchesPaths -RepositoryRoot $env:MOVE_REPO -ExpectedPaths @('src/server.js') -Label 'refactor: move' } catch { $rejected = $true }",
        "[pscustomobject]@{ Rejected = $rejected } | ConvertTo-Json -Compress"
      ],
      { MOVE_REPO: root }
    );
    expect(JSON.parse(output)).toEqual({ Rejected: true });
  });
});

describe("release test gate", () => {
  const gateIndex = script.indexOf("# --- Release test gate");

  it("runs the three suites before anything is committed or the version is bumped", () => {
    // A suite that fails after the bump would leave the working tree carrying a
    // version that was never released.
    expect(gateIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(script.indexOf("# --- Conservatively commit pending changes"));
    expect(gateIndex).toBeLessThan(script.indexOf("# --- Apply the version bump"));
    expect(gateIndex).toBeLessThan(script.indexOf("# --- Build ---"));

    const gate = script.slice(gateIndex, script.indexOf("# --- Conservatively commit pending changes"));
    expect(gate).toContain('Invoke-Native { npm run test:unit } "Unit tests failed; release aborted"');
    expect(gate).toContain('Invoke-Native { npm run test:powershell:coverage } "PowerShell tests failed; release aborted"');
    expect(gate).toContain('Invoke-Native { npm run test:e2e } "End-to-end tests failed; release aborted"');
  });

  it("uses the unattended end-to-end config", () => {
    // test:e2e:full adds @full cases that need interactive UAC and file-picker
    // approval, so it can never pass inside a release run.
    const gate = script.slice(gateIndex, script.indexOf("# --- Conservatively commit pending changes"));
    expect(gate).not.toContain("npm run test:e2e:full");
    expect(packageJson.scripts["test:e2e"]).toBe("playwright test");
  });

  it("invalidates the release checkpoint when runtime source changes", () => {
    const gate = script.slice(gateIndex, script.indexOf("# --- Conservatively commit pending changes"));
    const list = /-Paths @\(([\s\S]*?)\)\)/.exec(gate);
    expect(list).not.toBeNull();
    const fingerprintPaths = [...list[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);

    // Every fingerprinted path must exist, or a rename silently stops invalidating
    // the checkpoint and an interrupted release resumes past a stale test result.
    for (const fingerprintPath of fingerprintPaths) {
      expect({ fingerprintPath, exists: fs.existsSync(path.join(repoRoot, fingerprintPath)) })
        .toEqual({ fingerprintPath, exists: true });
    }

    // Both bridges, the Electron shell, and the renderer must each be covered.
    for (const required of ["src", "public", "lib", "tests", "Start-MultiTerm.ps1", "package.json"]) {
      expect(fingerprintPaths).toContain(required);
    }
    expect(fingerprintPaths.filter((entry) => entry.endsWith(".js") && !entry.includes("config"))).toEqual([]);
  });

  it("gates only publishing runs and stays skippable", () => {
    expect(script).toContain("[switch]$SkipTests,");
    expect(script).toContain("if ($Push -and -not $SkipTests) {");
    expect(script).toContain(".PARAMETER SkipTests");
  });
});
