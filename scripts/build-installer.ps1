#Requires -Version 5.1
<#
.SYNOPSIS
    Builds the MultiTerm Workbench Windows installer and, optionally, publishes it
    as a GitHub release.

.DESCRIPTION
    Compiles installer\MultiTerm.iss with Inno Setup (ISCC.exe) to produce
    installer\Output\MultiTerm-Setup-<version>.exe.

    The version in package.json is the source of truth. The script verifies that
    installer\MultiTerm.iss declares the same version (the .iss derives the output
    filename from it) and stops on a mismatch unless -Force is given.

    With -Push, the resulting installer is published to GitHub via the gh CLI as
    release tag v<version>. If the release already exists, the asset is only
    (re)uploaded when -Force is supplied (using --clobber).

.PARAMETER Push
    After a successful build, create/publish the GitHub release and upload the
    installer as an asset.

.PARAMETER Draft
    With -Push, create the release as a draft.

.PARAMETER Prerelease
    With -Push, mark the release as a prerelease.

.PARAMETER Force
    Allow a package.json / MultiTerm.iss version mismatch, and, with -Push,
    overwrite an existing release asset instead of failing.

.PARAMETER Tag
    Release tag to use. Defaults to "v<version>".

.PARAMETER IsccPath
    Full path to ISCC.exe. Auto-detected when omitted.

.EXAMPLE
    .\scripts\build-installer.ps1
    Build the installer only.

.EXAMPLE
    .\scripts\build-installer.ps1 -Push
    Build the installer and publish it as GitHub release v<version>.

.EXAMPLE
    .\scripts\build-installer.ps1 -Push -Force
    Build and (re)upload the asset even if release v<version> already exists.
#>
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [switch]$Push,
    [switch]$Draft,
    [switch]$Prerelease,
    [switch]$Force,
    [string]$Tag,
    [string]$IsccPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }

# Repository root is the parent of the scripts\ folder that holds this file.
$RepoRoot = Split-Path -Parent $PSScriptRoot
$PackageJsonPath = Join-Path $RepoRoot 'package.json'
$IssPath = Join-Path $RepoRoot 'installer\MultiTerm.iss'

if (-not (Test-Path -LiteralPath $PackageJsonPath)) {
    throw "Cannot find package.json at $PackageJsonPath"
}
if (-not (Test-Path -LiteralPath $IssPath)) {
    throw "Cannot find installer script at $IssPath"
}

# --- Version: package.json is the source of truth -------------------------------
$Version = (Get-Content -LiteralPath $PackageJsonPath -Raw | ConvertFrom-Json).version
if ([string]::IsNullOrWhiteSpace($Version)) {
    throw "package.json does not define a 'version'."
}
Write-Step "Package version: $Version"

# Verify the .iss declares the same version (it derives the output filename from it).
$IssText = Get-Content -LiteralPath $IssPath -Raw
$IssMatch = [regex]::Match($IssText, '(?m)^\s*#define\s+MyAppVersion\s+"([^"]+)"')
if (-not $IssMatch.Success) {
    throw "Could not find '#define MyAppVersion' in $IssPath"
}
$IssVersion = $IssMatch.Groups[1].Value
if ($IssVersion -ne $Version) {
    $msg = "Version mismatch: package.json=$Version but installer\MultiTerm.iss=$IssVersion."
    if ($Force) {
        Write-Warning "$msg Continuing because -Force was supplied; the installer will be named MultiTerm-Setup-$IssVersion.exe."
        $Version = $IssVersion
    }
    else {
        throw "$msg Update MyAppVersion in installer\MultiTerm.iss (or re-run with -Force)."
    }
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

# --- Pre-flight for -Push before spending time on a build -----------------------
$GhPath = $null
if ($Push) {
    $GhPath = Get-Command 'gh' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
    if (-not $GhPath) {
        throw "gh CLI not found but -Push was requested. Install GitHub CLI (https://cli.github.com/) or drop -Push."
    }
    & $GhPath auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "gh is not authenticated. Run 'gh auth login' and retry."
    }
}

# --- Build ----------------------------------------------------------------------
if ($PSCmdlet.ShouldProcess($IssPath, "Compile installer with ISCC")) {
    Write-Step "Building installer..."
    & $IsccPath $IssPath
    if ($LASTEXITCODE -ne 0) {
        throw "ISCC failed with exit code $LASTEXITCODE."
    }
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
    Write-Step "Done (build only). Re-run with -Push to publish release $Tag."
    return
}

# Does the release already exist?
$releaseExists = $false
if (Test-Path -LiteralPath $OutputExe) {
    & $GhPath release view $Tag --repo (& $GhPath repo view --json nameWithOwner -q .nameWithOwner) 2>&1 | Out-Null
    $releaseExists = ($LASTEXITCODE -eq 0)
}

if ($releaseExists) {
    if (-not $Force) {
        throw "Release $Tag already exists. Re-run with -Force to (re)upload the installer asset with --clobber."
    }
    if ($PSCmdlet.ShouldProcess($Tag, "Upload asset to existing release (--clobber)")) {
        Write-Step "Uploading asset to existing release $Tag..."
        & $GhPath release upload $Tag $OutputExe --clobber
        if ($LASTEXITCODE -ne 0) { throw "gh release upload failed with exit code $LASTEXITCODE." }
    }
}
else {
    if ($PSCmdlet.ShouldProcess($Tag, "Create GitHub release and upload installer")) {
        Write-Step "Creating release $Tag..."
        $ghArgs = @('release', 'create', $Tag, $OutputExe, '--title', $Tag, '--generate-notes')
        if ($Draft) { $ghArgs += '--draft' }
        if ($Prerelease) { $ghArgs += '--prerelease' }
        & $GhPath @ghArgs
        if ($LASTEXITCODE -ne 0) { throw "gh release create failed with exit code $LASTEXITCODE." }
    }
}

Write-Step "Release $Tag published."
