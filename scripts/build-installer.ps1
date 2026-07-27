#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the MultiTerm Workbench Windows installer and, optionally, publishes it
    as a GitHub release.

.DESCRIPTION
    Compiles installer\MultiTerm.iss with Inno Setup (ISCC.exe) to produce
    installer\Output\MultiTerm-Setup-<version>.exe.

    Build only (no -Push):
        The version in package.json is treated as the source of truth and the
        script verifies that installer\MultiTerm.iss (which derives the output
        filename from it) and public\app.js (whose APP_VERSION the running app
        reports and checks updates against) declare the same version. No files
        are modified.

    Publish (-Push):
        The version is bumped automatically (patch by default) in package.json,
        installer\MultiTerm.iss, and public\app.js, the installer is built for the
        new version, the edited files are committed as
        "chore(release): v<version>", the current branch is pushed, and a GitHub
        release tagged v<version> is created via the gh CLI targeting that commit,
        with the installer attached as an asset.

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

.PARAMETER Draft
    With -Push, create the release as a draft.

.PARAMETER Prerelease
    With -Push, mark the release as a prerelease.

.PARAMETER Force
    Build only: allow a package.json / MultiTerm.iss version mismatch.
    Push + -NoVersionBump: overwrite an existing release asset (--clobber).

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
    .\scripts\build-installer.ps1 -Push -WhatIf
    Show the version bump and every publish step without changing anything.
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [switch]$Push,
    [ValidateSet('major', 'minor', 'patch')]
    [string]$BumpPart = 'patch',
    [string]$SetVersion,
    [switch]$NoVersionBump,
    [switch]$Draft,
    [switch]$Prerelease,
    [switch]$Force,
    [string]$Tag,
    [string]$IsccPath
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
    $text = Get-Content -LiteralPath $Path -Raw
    $updated = [regex]::new($Pattern).Replace($text, "`${1}$NewVersion`${3}", 1)
    if ($updated -eq $text) {
        throw "Failed to update version in $Path (pattern did not match or value unchanged)."
    }
    [System.IO.File]::WriteAllText($Path, $updated)
}

# Repository root is the parent of the scripts\ folder that holds this file.
$RepoRoot = Split-Path -Parent $PSScriptRoot
$PackageJsonPath = Join-Path $RepoRoot 'package.json'
$IssPath = Join-Path $RepoRoot 'installer\MultiTerm.iss'
$AppJsPath = Join-Path $RepoRoot 'public\app.js'

if (-not (Test-Path -LiteralPath $PackageJsonPath)) { throw "Cannot find package.json at $PackageJsonPath" }
if (-not (Test-Path -LiteralPath $IssPath)) { throw "Cannot find installer script at $IssPath" }
if (-not (Test-Path -LiteralPath $AppJsPath)) { throw "Cannot find renderer at $AppJsPath" }

if ($SetVersion -and $SetVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw "-SetVersion must be x.y.z (got '$SetVersion')."
}

# --- Current version (package.json is the source of truth) ----------------------
$CurrentVersion = (Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json).version
if ([string]::IsNullOrWhiteSpace($CurrentVersion)) { throw "package.json does not define a 'version'." }

$IssText = Get-Content -LiteralPath $IssPath -Raw
$IssMatch = [regex]::Match($IssText, '(?m)^\s*#define\s+MyAppVersion\s+"([^"]+)"')
if (-not $IssMatch.Success) { throw "Could not find '#define MyAppVersion' in $IssPath" }
$IssVersion = $IssMatch.Groups[1].Value

$AppJsText = Get-Content -LiteralPath $AppJsPath -Raw
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
if ($Push) {
    $GhPath = Get-Command 'gh' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
    if (-not $GhPath) {
        throw "gh CLI not found but -Push was requested. Install GitHub CLI (https://cli.github.com/) or drop -Push."
    }
    if ((Get-NativeExit { & $GhPath auth status }) -ne 0) {
        throw "gh is not authenticated. Run 'gh auth login' and retry."
    }
    $repo = Get-NativeOutput { & $GhPath repo view --json nameWithOwner -q .nameWithOwner }
    if ($repo.ExitCode -ne 0 -or -not $repo.Output) { throw "Could not determine repository (gh repo view failed)." }
    $RepoSlug = ($repo.Output | Select-Object -First 1).ToString().Trim()

    # Guard against colliding with an existing release.
    $releaseExists = (Get-NativeExit { & $GhPath release view $Tag --repo $RepoSlug }) -eq 0
    if ($releaseExists -and -not ($NoVersionBump -and $Force)) {
        throw "Release $Tag already exists. Pick a different version (bump/-SetVersion), or use -Push -NoVersionBump -Force to re-upload the asset."
    }

    $branchInfo = Get-NativeOutput { git -C $RepoRoot rev-parse --abbrev-ref HEAD }
    if ($branchInfo.ExitCode -ne 0) { throw "Not a git repository or git unavailable." }
    $branch = ($branchInfo.Output | Select-Object -First 1)
    Write-Step "Publish target: $RepoSlug (branch '$branch')"
}

# --- Apply the version bump (gated) ---------------------------------------------
if ($BumpVersion) {
    if ($PSCmdlet.ShouldProcess("package.json, installer\MultiTerm.iss & public\app.js", "Set version to $Version")) {
        Set-VersionInFile -Path $PackageJsonPath -Pattern '("version"\s*:\s*")([^"]+)(")' -NewVersion $Version
        Set-VersionInFile -Path $IssPath -Pattern '(#define\s+MyAppVersion\s+")([^"]+)(")' -NewVersion $Version
        Set-VersionInFile -Path $AppJsPath -Pattern '(const\s+APP_VERSION\s*=\s*")([^"]+)(")' -NewVersion $Version
        Write-Step "Version set to $Version in package.json, installer\MultiTerm.iss, and public\app.js."
    }
    else {
        Write-Step "[WhatIf] Would set version to $Version in package.json, installer\MultiTerm.iss, and public\app.js."
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
    Write-Step "[WhatIf] Would build: $OutputExe"
}

# --- Publish --------------------------------------------------------------------
if (-not $Push) {
    Write-Step "Done (build only). Re-run with -Push to bump the version and publish a release."
    return
}

# Commit the version bump and push the branch so the tag can target that commit.
$Target = $null
if ($BumpVersion) {
    if ($PSCmdlet.ShouldProcess($RepoSlug, "Commit '$Tag' bump and push branch")) {
        Write-Step "Committing version bump..."
        Invoke-Native { git -C $RepoRoot add -- package.json installer/MultiTerm.iss public/app.js } "git add failed"
        Invoke-Native { git -C $RepoRoot commit -m "chore(release): $Tag" } "git commit failed"
        Write-Step "Pushing branch..."
        Invoke-Native { git -C $RepoRoot push origin HEAD } "git push failed"
        $head = Get-NativeOutput { git -C $RepoRoot rev-parse HEAD }
        if ($head.ExitCode -ne 0) { throw "git rev-parse HEAD failed." }
        $Target = ($head.Output | Select-Object -First 1).ToString().Trim()
    }
    else {
        Write-Step "[WhatIf] Would commit '$Tag' bump, push the branch, and target that commit."
    }
}

if ($PSCmdlet.ShouldProcess($Tag, "Create GitHub release and upload installer")) {
    if ($NoVersionBump -and $Force -and $releaseExists) {
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
    Write-Step "[WhatIf] Would publish release $Tag with asset $([System.IO.Path]::GetFileName($OutputExe))."
}
