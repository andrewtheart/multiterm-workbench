#Requires -Version 5.1
<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
#>

<#
.SYNOPSIS
    Builds the MultiTerm Workbench Windows installer and, optionally, publishes it
    as a GitHub release.

.DESCRIPTION
    Compiles installer\MultiTerm.iss with Inno Setup (ISCC.exe) to produce
    installer\Output\MultiTerm-Setup-<version>.exe.

    Build only (no -Push):
        The version in package.json is treated as the source of truth and the
        script verifies that package-lock.json, installer\MultiTerm.iss (which
        derives the output filename from it), and public\app.js (whose APP_VERSION
        the running app reports and checks updates against) declare the same
        version. No files are modified.

    Publish (-Push):
        All pending working-tree changes are committed first. The version is then
        bumped automatically (patch by default) in package.json, package-lock.json,
        installer\MultiTerm.iss, and public\app.js; the installer is built; the
        version files are committed as "chore(release): v<version>"; the current
        branch is pushed; and a GitHub release tagged v<version> is created via the
        gh CLI targeting that commit, with the installer attached as an asset.

.PARAMETER Push
    Bump the version, build, commit, push the branch, and publish the release.

.PARAMETER BumpPart
    Which semver segment to increment when -Push auto-bumps: major, minor, or
    patch. Default: patch. Ignored when -SetVersion or -NoVersionBump is used.

.PARAMETER SetVersion
    Explicit x.y.z version to release instead of auto-incrementing. Implies a
    version change; only meaningful with -Push.

.PARAMETER NoVersionBump
    With -Push, do NOT change the version; release the current package.json
    version as-is (useful with -Force to re-upload an asset).

.PARAMETER NoGitCommit
    With -Push, do not create either the pending-changes snapshot commit or the
    release-version commit. The installer is built, then the script stops without
    pushing or publishing because the artifact would not match a Git commit.

.PARAMETER NoGitPush
    With -Push, create the local snapshot/release commits but do not push the
    branch or publish the GitHub release.

.PARAMETER Draft
    With -Push, create the release as a draft.

.PARAMETER Prerelease
    With -Push, mark the release as a prerelease.

.PARAMETER Force
    Build only: allow a version mismatch among the release metadata files.
    Push + -NoVersionBump: overwrite an existing release asset only when its
    tag targets the current commit (--clobber).

.PARAMETER Tag
    Release tag to use. Defaults to "v<version>".

.PARAMETER IsccPath
    Full path to ISCC.exe. Auto-detected when omitted.

.EXAMPLE
    .\scripts\build-installer.ps1
    Build the current version's installer only (no version change, no publish).

.EXAMPLE
    .\scripts\build-installer.ps1 -Push
    Auto-bump the patch version, build, commit, push, and publish the release.

.EXAMPLE
    .\scripts\build-installer.ps1 -Push -BumpPart minor
    Bump the minor version (x.Y.0) and publish.

.EXAMPLE
    .\scripts\build-installer.ps1 -Push -SetVersion 1.0.0
    Release exactly 1.0.0.

.EXAMPLE
    .\scripts\build-installer.ps1 -Push -NoGitPush
    Build and create both commits locally, but do not push or publish.

.EXAMPLE
    .\scripts\build-installer.ps1 -Push -NoGitCommit
    Build the bumped installer but leave every change uncommitted and unpublished.

.EXAMPLE
    .\scripts\build-installer.ps1 -Push -WhatIf
    Show the pending-change commit, version bump, build, release commit, push, and
    publish steps without changing anything.
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium', PositionalBinding = $false)]
param(
    [switch]$Push,
    [ValidateSet('major', 'minor', 'patch')]
    [string]$BumpPart = 'patch',
    [string]$SetVersion,
    [switch]$NoVersionBump,
    [switch]$NoGitCommit,
    [switch]$NoGitPush,
    [switch]$Draft,
    [switch]$Prerelease,
    [switch]$Force,
    [string]$Tag,
    [string]$IsccPath,
    [Parameter(ValueFromRemainingArguments = $true, DontShow = $true)]
    [string[]]$CompatibilityOptions
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }

# Native commands (git, gh) can write to stderr on success (progress) or on a
# handled non-zero exit. Under $ErrorActionPreference='Stop' a 2>&1 merge turns
# that stderr into a terminating error, so run native calls with a local override
# and rely on explicit $LASTEXITCODE checks instead.
function Invoke-Native {
    param([Parameter(Mandatory)][scriptblock]$Command, [Parameter(Mandatory)][string]$FailureMessage)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Command } finally { $ErrorActionPreference = $prev }
    if ($LASTEXITCODE -ne 0) { throw ("{0} (exit {1})." -f $FailureMessage, $LASTEXITCODE) }
}

function Get-NativeExit {
    param([Parameter(Mandatory)][scriptblock]$Command)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Command 2>&1 | Out-Null } finally { $ErrorActionPreference = $prev }
    return $LASTEXITCODE
}

function Get-NativeOutput {
    param([Parameter(Mandatory)][scriptblock]$Command)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $out = & $Command 2>$null } finally { $ErrorActionPreference = $prev }
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $out }
}

function Get-NextVersion {
    param([string]$Current, [string]$Part)
    if ($Current -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
        throw "Cannot auto-bump non-semver version '$Current'. Use -SetVersion x.y.z."
    }
    $maj = [int]$Matches[1]; $min = [int]$Matches[2]; $pat = [int]$Matches[3]
    switch ($Part) {
        'major' { $maj++; $min = 0; $pat = 0 }
        'minor' { $min++; $pat = 0 }
        'patch' { $pat++ }
    }
    "$maj.$min.$pat"
}

function Set-VersionInFile {
    param([string]$Path, [string]$Pattern, [string]$NewVersion)
    $text = [System.IO.File]::ReadAllText($Path)
    $updated = [regex]::new($Pattern).Replace($text, "`${1}$NewVersion`${3}", 1)
    if ($updated -eq $text) {
        throw "Failed to update version in $Path (pattern did not match or value unchanged)."
    }
    [System.IO.File]::WriteAllText($Path, $updated)
}

function Set-PackageLockVersion {
    param([string]$Path, [string]$NewVersion)
    $text = [System.IO.File]::ReadAllText($Path)
    $patterns = @(
        '(?s)(^\s*\{\s*"name"\s*:\s*"[^"]+",\s*"version"\s*:\s*")[^"]+("\s*,)',
        '(?s)("packages"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"[^"]+",\s*"version"\s*:\s*")[^"]+("\s*,)'
    )
    foreach ($pattern in $patterns) {
        $updated = [regex]::new($pattern).Replace($text, "`${1}$NewVersion`${2}", 1)
        if ($updated -eq $text) {
            throw "Failed to update version in $Path (pattern did not match or value unchanged)."
        }
        $text = $updated
    }
    [System.IO.File]::WriteAllText($Path, $text)
}

# Repository root is the parent of the scripts\ folder that holds this file.
$RepoRoot = Split-Path -Parent $PSScriptRoot
$PackageJsonPath = Join-Path $RepoRoot 'package.json'
$PackageLockPath = Join-Path $RepoRoot 'package-lock.json'
$IssPath = Join-Path $RepoRoot 'installer\MultiTerm.iss'
$AppJsPath = Join-Path $RepoRoot 'public\app.js'

if (-not (Test-Path -LiteralPath $PackageJsonPath)) { throw "Cannot find package.json at $PackageJsonPath" }
if (-not (Test-Path -LiteralPath $PackageLockPath)) { throw "Cannot find package-lock.json at $PackageLockPath" }
if (-not (Test-Path -LiteralPath $IssPath)) { throw "Cannot find installer script at $IssPath" }
if (-not (Test-Path -LiteralPath $AppJsPath)) { throw "Cannot find renderer at $AppJsPath" }

foreach ($option in $CompatibilityOptions) {
    switch ($option) {
        '--NoGitCommit' { $NoGitCommit = $true }
        '--NoGitPush' { $NoGitPush = $true }
        default { throw "Unknown argument '$option'." }
    }
}

if ($SetVersion -and $SetVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw "-SetVersion must be x.y.z (got '$SetVersion')."
}
if (($NoGitCommit -or $NoGitPush) -and -not $Push) {
    throw "-NoGitCommit and -NoGitPush are only meaningful with -Push."
}

# --- Current version (package.json is the source of truth) ----------------------
$CurrentVersion = (Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json).version
if ([string]::IsNullOrWhiteSpace($CurrentVersion)) { throw "package.json does not define a 'version'." }

$PackageLockText = [System.IO.File]::ReadAllText($PackageLockPath)
$PackageLockMatch = [regex]::Match($PackageLockText, '(?s)^\s*\{\s*"name"\s*:\s*"[^"]+",\s*"version"\s*:\s*"([^"]+)"')
$PackageLockRootMatch = [regex]::Match($PackageLockText, '(?s)"packages"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"[^"]+",\s*"version"\s*:\s*"([^"]+)"')
if (-not $PackageLockMatch.Success -or -not $PackageLockRootMatch.Success) {
    throw "package-lock.json does not define both the top-level and root-package versions."
}
$PackageLockVersion = $PackageLockMatch.Groups[1].Value
$PackageLockRootVersion = $PackageLockRootMatch.Groups[1].Value

$IssText = [System.IO.File]::ReadAllText($IssPath)
$IssMatch = [regex]::Match($IssText, '(?m)^\s*#define\s+MyAppVersion\s+"([^"]+)"')
if (-not $IssMatch.Success) { throw "Could not find '#define MyAppVersion' in $IssPath" }
$IssVersion = $IssMatch.Groups[1].Value

$AppJsText = [System.IO.File]::ReadAllText($AppJsPath)
$AppJsMatch = [regex]::Match($AppJsText, '(?m)^\s*const\s+APP_VERSION\s*=\s*"([^"]+)"')
if (-not $AppJsMatch.Success) { throw "Could not find 'const APP_VERSION' in $AppJsPath" }
$AppJsVersion = $AppJsMatch.Groups[1].Value

# --- Decide the version to build ------------------------------------------------
$BumpVersion = $Push -and -not $NoVersionBump
if ($BumpVersion) {
    if ($SetVersion) {
        $Version = $SetVersion
        Write-Step "Releasing explicit version: $CurrentVersion -> $Version"
    }
    else {
        $Version = Get-NextVersion -Current $CurrentVersion -Part $BumpPart
        Write-Step "Auto-bumping $BumpPart version: $CurrentVersion -> $Version"
    }
}
else {
    # Build-only, or -Push -NoVersionBump: use current version and require the
    # .iss (output filename) and app.js (reported/checked version) to agree.
    $Version = $CurrentVersion
    $mismatches = @()
    if ($PackageLockVersion -ne $Version) { $mismatches += "package-lock.json=$PackageLockVersion" }
    if ($PackageLockRootVersion -ne $Version) { $mismatches += "package-lock.json root package=$PackageLockRootVersion" }
    if ($IssVersion -ne $Version) { $mismatches += "installer\MultiTerm.iss=$IssVersion" }
    if ($AppJsVersion -ne $Version) { $mismatches += "public\app.js=$AppJsVersion" }
    if ($mismatches.Count -gt 0) {
        $msg = "Version mismatch: package.json=$Version but " + ($mismatches -join ', ') + "."
        if ($Force) {
            Write-Warning "$msg Continuing because -Force was supplied; the installer will be named MultiTerm-Setup-$IssVersion.exe."
            $Version = $IssVersion
        }
        else {
            throw "$msg Update the mismatched file(s), or run -Push to auto-bump all, or pass -Force."
        }
    }
    Write-Step "Version: $Version"
}

if (-not $Tag) { $Tag = "v$Version" }
$OutputExe = Join-Path $RepoRoot ("installer\Output\MultiTerm-Setup-{0}.exe" -f $Version)

# --- Locate ISCC.exe ------------------------------------------------------------
if (-not $IsccPath) {
    $candidates = @(
        (Get-Command 'iscc.exe' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
        'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
        'C:\Program Files\Inno Setup 6\ISCC.exe'
    ) | Where-Object { $_ }
    $IsccPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $IsccPath -or -not (Test-Path -LiteralPath $IsccPath)) {
    throw "ISCC.exe (Inno Setup 6) not found. Install Inno Setup 6 or pass -IsccPath."
}
Write-Step "Using Inno Setup: $IsccPath"

# --- Push preflight (fail fast before touching files) ---------------------------
$GhPath = $null
$RepoSlug = $null
$releaseExists = $false
$branch = $null
$CanPublish = $Push -and -not $NoGitCommit -and -not $NoGitPush
if ($Push) {
    $branchInfo = Get-NativeOutput { git -C $RepoRoot rev-parse --abbrev-ref HEAD }
    if ($branchInfo.ExitCode -ne 0) { throw "Not a git repository or git unavailable." }
    $branch = ($branchInfo.Output | Select-Object -First 1).ToString().Trim()

    if ($CanPublish) {
        $GhPath = Get-Command 'gh' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
        if (-not $GhPath) {
            throw "gh CLI not found but -Push was requested. Install GitHub CLI (https://cli.github.com/) or use -NoGitPush."
        }
        if ((Get-NativeExit { & $GhPath auth status }) -ne 0) {
            throw "gh is not authenticated. Run 'gh auth login' and retry."
        }
        $repo = Get-NativeOutput { & $GhPath repo view --json nameWithOwner -q .nameWithOwner }
        if ($repo.ExitCode -ne 0 -or -not $repo.Output) { throw "Could not determine repository (gh repo view failed)." }
        $RepoSlug = ($repo.Output | Select-Object -First 1).ToString().Trim()

        $releaseExists = (Get-NativeExit { & $GhPath release view $Tag --repo $RepoSlug }) -eq 0
        if ($releaseExists -and -not ($NoVersionBump -and $Force)) {
            throw "Release $Tag already exists. Pick a different version (bump/-SetVersion), or use -Push -NoVersionBump -Force to re-upload the asset."
        }
        Write-Step "Publish target: $RepoSlug (branch '$branch')"
    }
    else {
        Write-Step "Local release workflow on branch '$branch' (remote publication disabled)."
    }
}

# --- Snapshot every pending change before changing release files ----------------
if ($Push) {
    $status = Get-NativeOutput { git -C $RepoRoot status --porcelain=v1 --untracked-files=all }
    if ($status.ExitCode -ne 0) { throw "git status failed." }
    $pendingChanges = @($status.Output | Where-Object { $_ -ne $null -and $_.ToString().Length -gt 0 })

    if ($pendingChanges.Count -gt 0) {
        if ($NoGitCommit) {
            Write-Step "-NoGitCommit: leaving $($pendingChanges.Count) pending path(s) uncommitted."
        }
        elseif ($PSCmdlet.ShouldProcess($RepoRoot, "Commit all pending changes before $Tag")) {
            Write-Step "Committing all pending changes before $Tag..."
            Invoke-Native { git -C $RepoRoot add -A } "git add -A failed"
            Invoke-Native { git -C $RepoRoot commit -m "chore: snapshot changes before $Tag" } "git commit failed"
        }
        else {
            if ($WhatIfPreference) {
                Write-Step "[WhatIf] Would stage and commit all $($pendingChanges.Count) pending path(s) before $Tag."
            }
            else {
                throw "Pending-change snapshot commit was declined; release cancelled."
            }
        }
    }
    else {
        Write-Step "No pending changes to snapshot before $Tag."
    }
}

# --- Apply the version bump (gated) ---------------------------------------------
if ($BumpVersion) {
    $versionFiles = "package.json, package-lock.json, installer\MultiTerm.iss & public\app.js"
    if ($PSCmdlet.ShouldProcess($versionFiles, "Set version to $Version")) {
        Set-VersionInFile -Path $PackageJsonPath -Pattern '("version"\s*:\s*")([^"]+)(")' -NewVersion $Version
        Set-PackageLockVersion -Path $PackageLockPath -NewVersion $Version
        Set-VersionInFile -Path $IssPath -Pattern '(#define\s+MyAppVersion\s+")([^"]+)(")' -NewVersion $Version
        Set-VersionInFile -Path $AppJsPath -Pattern '(const\s+APP_VERSION\s*=\s*")([^"]+)(")' -NewVersion $Version
        Write-Step "Version set to $Version in package.json, package-lock.json, installer\MultiTerm.iss, and public\app.js."
    }
    else {
        if ($WhatIfPreference) {
            Write-Step "[WhatIf] Would set version to $Version in package.json, package-lock.json, installer\MultiTerm.iss, and public\app.js."
        }
        else {
            throw "Version update was declined; release cancelled."
        }
    }
}

# --- Build ----------------------------------------------------------------------
if ($PSCmdlet.ShouldProcess($IssPath, "Compile installer with ISCC")) {
    Write-Step "Building installer..."
    & $IsccPath $IssPath
    if ($LASTEXITCODE -ne 0) { throw "ISCC failed with exit code $LASTEXITCODE." }
    if (-not (Test-Path -LiteralPath $OutputExe)) {
        throw "Build reported success but expected output not found: $OutputExe"
    }
    Write-Step "Built: $OutputExe"
}
else {
    if ($WhatIfPreference) {
        Write-Step "[WhatIf] Would build: $OutputExe"
    }
    else {
        throw "Installer build was declined; release cancelled."
    }
}

# --- Commit, push, and publish ---------------------------------------------------
if (-not $Push) {
    Write-Step "Done (build only). Re-run with -Push to bump the version and publish a release."
    return
}

if ($NoGitCommit) {
    Write-Step "-NoGitCommit: build complete; skipped all commits, git push, and GitHub release publication."
    return
}

if ($BumpVersion) {
    if ($PSCmdlet.ShouldProcess($RepoRoot, "Commit release version $Tag")) {
        Write-Step "Committing release version $Tag..."
        Invoke-Native { git -C $RepoRoot add -- package.json package-lock.json installer/MultiTerm.iss public/app.js } "git add release files failed"
        Invoke-Native { git -C $RepoRoot commit -m "chore(release): $Tag" } "git commit failed"
    }
    else {
        if ($WhatIfPreference) {
            Write-Step "[WhatIf] Would commit release version $Tag."
        }
        else {
            throw "Release-version commit was declined; release cancelled."
        }
    }
}

if (-not $WhatIfPreference) {
    $postBuildStatus = Get-NativeOutput { git -C $RepoRoot status --porcelain=v1 --untracked-files=all }
    if ($postBuildStatus.ExitCode -ne 0) { throw "git status failed after the release commit." }
    $postBuildChanges = @($postBuildStatus.Output | Where-Object { $_ -ne $null -and $_.ToString().Length -gt 0 })
    if ($postBuildChanges.Count -gt 0) {
        throw "New pending changes appeared after the release commit; refusing to push or publish an artifact that differs from Git HEAD."
    }
}

if ($NoGitPush) {
    Write-Step "-NoGitPush: local release commits are complete; skipped git push and GitHub release publication."
    return
}

$Target = $null
if ($PSCmdlet.ShouldProcess($RepoSlug, "Push branch '$branch'")) {
    Write-Step "Pushing branch..."
    Invoke-Native { git -C $RepoRoot push origin HEAD } "git push failed"
    $head = Get-NativeOutput { git -C $RepoRoot rev-parse HEAD }
    if ($head.ExitCode -ne 0) { throw "git rev-parse HEAD failed." }
    $Target = ($head.Output | Select-Object -First 1).ToString().Trim()
}
else {
    if ($WhatIfPreference) {
        Write-Step "[WhatIf] Would push branch '$branch'."
    }
    else {
        throw "Git push was declined; release publication cancelled."
    }
}

if ($PSCmdlet.ShouldProcess($Tag, "Create GitHub release and upload installer")) {
    if ($NoVersionBump -and $Force -and $releaseExists) {
        $tagInfo = Get-NativeOutput { git -C $RepoRoot ls-remote --tags origin "refs/tags/$Tag" "refs/tags/$Tag^{}" }
        if ($tagInfo.ExitCode -ne 0 -or -not $tagInfo.Output) {
            throw "Could not resolve remote tag $Tag before replacing its release asset."
        }
        $tagLines = @($tagInfo.Output)
        $tagLine = $tagLines | Where-Object { $_.ToString() -match '\^\{\}$' } | Select-Object -First 1
        if (-not $tagLine) { $tagLine = $tagLines | Select-Object -First 1 }
        $remoteTagTarget = ($tagLine.ToString() -split '\s+')[0]
        if ($remoteTagTarget -ne $Target) {
            throw "Remote tag $Tag targets $remoteTagTarget, not current commit $Target; refusing to replace the asset with a mismatched build."
        }
        Write-Step "Uploading asset to existing release $Tag (--clobber)..."
        Invoke-Native { & $GhPath release upload $Tag $OutputExe --clobber --repo $RepoSlug } "gh release upload failed"
    }
    else {
        Write-Step "Creating release $Tag..."
        $ghArgs = @('release', 'create', $Tag, $OutputExe, '--repo', $RepoSlug, '--title', $Tag, '--generate-notes')
        if ($Target) { $ghArgs += @('--target', $Target) }
        if ($Draft) { $ghArgs += '--draft' }
        if ($Prerelease) { $ghArgs += '--prerelease' }
        Invoke-Native { & $GhPath @ghArgs } "gh release create failed"
    }
    Write-Step "Release $Tag published."
}
else {
    if ($WhatIfPreference) {
        Write-Step "[WhatIf] Would publish release $Tag with asset $([System.IO.Path]::GetFileName($OutputExe))."
    }
    else {
        Write-Step "GitHub release publication was declined."
    }
}
