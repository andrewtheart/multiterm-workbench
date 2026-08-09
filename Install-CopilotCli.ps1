<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

<#
.SYNOPSIS
    Installs the GitHub Copilot CLI through the first available official channel.

.DESCRIPTION
    MultiTerm runs this in a visible terminal during guided Copilot setup. It
    tries the channels GitHub documents for Windows in order: WinGet, then npm
    when Node.js is new enough, then the signed MSI published with the release.
    Sign-in is never handled here; the caller launches the CLI afterwards.

.PARAMETER PlanOnly
    Reports the channel that would be used and installs nothing.
#>

[CmdletBinding()]
param(
    [switch]$PlanOnly
)

$ErrorActionPreference = 'Stop'

$ReleaseApiUrl = 'https://api.github.com/repos/github/copilot-cli/releases/latest'
$ReleaseDownloadPrefix = 'https://github.com/github/copilot-cli/releases/download/'
$DocsUrl = 'https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli'
$MinimumNodeMajor = 22

function Write-Step {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Detail {
    param([string]$Message)
    Write-Host $Message -ForegroundColor DarkGray
}

function Test-CopilotInstalled {
    return [bool](Get-Command copilot -ErrorAction SilentlyContinue)
}

# WinGet publishes to a stable per-user Links directory, so a PATH refresh is
# enough to discover the new executable without restarting the bridge.
function Update-ProcessPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (@($machine, $user) | Where-Object { $_ }) -join ';'
}

function Get-HostArchitecture {
    $architecture = $env:PROCESSOR_ARCHITEW6432
    if (-not $architecture) { $architecture = $env:PROCESSOR_ARCHITECTURE }
    switch ("$architecture".ToUpperInvariant()) {
        'AMD64' { return 'x64' }
        'ARM64' { return 'arm64' }
        default { return '' }
    }
}

function Get-NodeMajorVersion {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return 0 }
    $reported = & $node.Source --version 2>$null
    if ($LASTEXITCODE -ne 0) { return 0 }
    $match = [regex]::Match("$reported", '^v(\d+)\.')
    if (-not $match.Success) { return 0 }
    return [int]$match.Groups[1].Value
}

function Test-NpmAvailable {
    return [bool](Get-Command npm -ErrorAction SilentlyContinue)
}

function Resolve-InstallChannel {
    if (Test-CopilotInstalled) { return 'present' }
    if (Get-Command winget.exe -ErrorAction SilentlyContinue) { return 'winget' }
    if ((Test-NpmAvailable) -and (Get-NodeMajorVersion) -ge $MinimumNodeMajor) { return 'npm' }
    if (Get-HostArchitecture) { return 'msi' }
    return 'unsupported'
}

function Install-WithWinGet {
    Write-Step 'Installing GitHub Copilot CLI with WinGet.'
    & winget.exe install --id GitHub.Copilot --exact --source winget --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "WinGet exited with code $LASTEXITCODE." }
}

function Install-WithNpm {
    Write-Step 'Installing GitHub Copilot CLI with npm.'
    & npm install -g '@github/copilot'
    if ($LASTEXITCODE -ne 0) { throw "npm exited with code $LASTEXITCODE." }
}

function Get-CopilotReleaseAsset {
    param([Parameter(Mandatory = $true)][string]$AssetName)

    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    try {
        $release = Invoke-RestMethod -Uri $ReleaseApiUrl -TimeoutSec 60 -Headers @{
            'User-Agent' = 'MultiTerm-Workbench'
            'Accept'     = 'application/vnd.github+json'
        }
    }
    catch {
        throw "Could not read the GitHub Copilot CLI release list: $($_.Exception.Message). GitHub rate limits unauthenticated requests, so wait and retry or install manually from $DocsUrl."
    }

    $asset = @($release.assets) | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1
    if (-not $asset) {
        throw "Release $($release.tag_name) does not publish $AssetName. Install manually from $DocsUrl."
    }
    if ("$($asset.browser_download_url)" -notlike "$ReleaseDownloadPrefix*") {
        throw "$AssetName is not served from the official GitHub release location. Install manually from $DocsUrl."
    }
    if ("$($asset.digest)" -notmatch '^sha256:[0-9a-fA-F]{64}$') {
        throw "GitHub did not publish a usable SHA-256 digest for $AssetName. Install manually from $DocsUrl."
    }
    if ([int64]$asset.size -le 0) {
        throw "GitHub did not publish a usable size for $AssetName. Install manually from $DocsUrl."
    }
    return $asset
}

function Get-FileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        $stream = [IO.File]::OpenRead($Path)
        try {
            return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '')
        }
        finally {
            $stream.Dispose()
        }
    }
    finally {
        $algorithm.Dispose()
    }
}

function Install-WithMsi {
    param([Parameter(Mandatory = $true)][string]$Architecture)

    $assetName = "copilot-$Architecture.msi"
    Write-Step "Neither WinGet nor Node.js $MinimumNodeMajor or later is available, so MultiTerm will use the signed installer from the official GitHub release."
    $asset = Get-CopilotReleaseAsset -AssetName $assetName

    $staging = Join-Path $env:TEMP ('multiterm-copilot-' + [guid]::NewGuid().ToString('n'))
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    try {
        $installerPath = Join-Path $staging $assetName
        Write-Step "Downloading $assetName ($([math]::Round([int64]$asset.size / 1MB)) MB)."
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installerPath -UseBasicParsing -TimeoutSec 900

        $downloadedSize = (Get-Item -LiteralPath $installerPath).Length
        if ($downloadedSize -ne [int64]$asset.size) {
            throw "The download is $downloadedSize bytes but GitHub published $($asset.size). Nothing was installed."
        }

        $expected = ("$($asset.digest)" -split ':')[1].ToUpperInvariant()
        $actual = Get-FileSha256 -Path $installerPath
        if ($actual -ne $expected) {
            throw "The download failed SHA-256 verification. Nothing was installed."
        }
        Write-Detail 'Verified the publisher size and SHA-256 digest.'

        Write-Step 'Running the installer. Approve the Windows elevation prompt if one appears.'
        $process = Start-Process -FilePath 'msiexec.exe' -Wait -PassThru -ArgumentList @(
            '/i', ('"' + $installerPath + '"'), '/passive', '/norestart'
        )
        if ($process.ExitCode -eq 1602 -or $process.ExitCode -eq 1223) {
            throw 'The installation was cancelled at the Windows prompt.'
        }
        if ($process.ExitCode -ne 0 -and $process.ExitCode -ne 3010) {
            throw "The installer exited with code $($process.ExitCode)."
        }
    }
    finally {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$channel = Resolve-InstallChannel

if ($PlanOnly) {
    Write-Output $channel
    exit 0
}

try {
    switch ($channel) {
        'present' {
            Write-Step 'GitHub Copilot CLI is already installed.'
        }
        'winget' {
            Install-WithWinGet
        }
        'npm' {
            Install-WithNpm
        }
        'msi' {
            Install-WithMsi -Architecture (Get-HostArchitecture)
        }
        default {
            throw "GitHub Copilot CLI cannot be installed automatically on this system. It needs WinGet, Node.js $MinimumNodeMajor or later, or a 64-bit (x64 or ARM64) edition of Windows. Install it manually from $DocsUrl."
        }
    }
}
catch {
    Write-Host ''
    Write-Host "GitHub Copilot CLI was not installed. $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Update-ProcessPath

if (-not (Test-CopilotInstalled)) {
    Write-Host ''
    Write-Host "GitHub Copilot CLI was installed but this terminal cannot find it yet. Open a new terminal and run copilot." -ForegroundColor Yellow
    exit 1
}

exit 0
