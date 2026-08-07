<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppPath,
    [switch]$Uninstall,
    [Parameter(DontShow = $true)]
    [switch]$BackgroundWorker
)

$ErrorActionPreference = 'Stop'
$extensionId = 'andrewtheart.multiterm-workbench.visualstudio'
$integrationDirectory = Join-Path $AppPath 'VisualStudio'
$stateDirectory = Join-Path $env:LOCALAPPDATA 'MultiTerm\Integrations'
$stateFile = Join-Path $stateDirectory 'VisualStudioIntegrationInstalled.json'
$legacyStateFile = Join-Path $integrationDirectory 'VisualStudioIntegrationInstalled.json'
$logFile = Join-Path $stateDirectory 'VisualStudioIntegration.log'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'

function Write-IntegrationState {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Status,
        [Parameter(Mandatory = $true)]
        [string]$Package,
        [int]$WorkerProcessId = 0
    )

    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
    $temporaryStateFile = "$stateFile.tmp"
    @{
        extensionId = $extensionId
        status = $Status
        workerProcessId = $WorkerProcessId
        updatedAt = [DateTimeOffset]::UtcNow.ToString('o')
        package = $Package
    } | ConvertTo-Json | Set-Content -LiteralPath $temporaryStateFile -Encoding UTF8
    Move-Item -LiteralPath $temporaryStateFile -Destination $stateFile -Force
}

function Find-VSIXInstaller {
    if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) {
        return $null
    }
    return & $vswhere -latest -products * -find 'Common7\IDE\VSIXInstaller.exe' | Select-Object -First 1
}

$vsixInstaller = Find-VSIXInstaller
if (-not $vsixInstaller -or -not (Test-Path -LiteralPath $vsixInstaller -PathType Leaf)) {
    # Enabled by default, so absence of Visual Studio is an ordinary outcome and
    # must never abort the MultiTerm installation.
    if ($Uninstall.IsPresent) {
        Remove-Item -LiteralPath $stateFile, $legacyStateFile -Force -ErrorAction SilentlyContinue
    }
    Write-Output 'Visual Studio 2022 or later was not found; skipping the MultiTerm extension.'
    exit 0
}

if ($Uninstall.IsPresent) {
    if (-not (Test-Path -LiteralPath $stateFile -PathType Leaf) -and
        -not (Test-Path -LiteralPath $legacyStateFile -PathType Leaf)) {
        return
    }
    $process = Start-Process -FilePath $vsixInstaller -ArgumentList @('/quiet', "/uninstall:$extensionId") -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Visual Studio could not uninstall $extensionId (exit code $($process.ExitCode))."
    }
    Remove-Item -LiteralPath $stateFile, $legacyStateFile -Force -ErrorAction SilentlyContinue
    return
}

# Upgrades from before the installer pruned old packages can leave several
# version-stamped .vsix files here; the newest is the one being installed.
$packages = @(Get-ChildItem -LiteralPath $integrationDirectory -Filter '*.vsix' -File | Sort-Object LastWriteTime -Descending)
if ($packages.Count -eq 0) {
    throw "Expected a MultiTerm Visual Studio package in $integrationDirectory; found none."
}

$packageArgument = '"{0}"' -f $packages[0].FullName

if ($BackgroundWorker.IsPresent) {
    try {
        $process = Start-Process -FilePath $vsixInstaller -ArgumentList @('/quiet', $packageArgument) -Wait -PassThru
        if ($process.ExitCode -ne 0) {
            throw "Visual Studio could not install $($packages[0].Name) (exit code $($process.ExitCode))."
        }
        Write-IntegrationState -Status 'installed' -Package $packages[0].Name
        Add-Content -LiteralPath $logFile -Value "$([DateTimeOffset]::UtcNow.ToString('o')) Installed $($packages[0].Name)."
        Remove-Item -LiteralPath $legacyStateFile -Force -ErrorAction SilentlyContinue
        return
    } catch {
        Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
        New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
        Add-Content -LiteralPath $logFile -Value "$([DateTimeOffset]::UtcNow.ToString('o')) $($_.Exception.Message)"
        throw
    }
}

$savedState = if (Test-Path -LiteralPath $stateFile -PathType Leaf) {
    try { Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } catch { $null }
} else { $null }
$savedStatus = if ($savedState) { [string]$savedState.status } else { '' }
if (
    $savedState -and
    $savedState.extensionId -eq $extensionId -and
    $savedState.package -eq $packages[0].Name -and
    $savedStatus -eq 'pending' -and
    [int]$savedState.workerProcessId -gt 0 -and
    $null -ne (Get-Process -Id ([int]$savedState.workerProcessId) -ErrorAction SilentlyContinue)
) {
    Write-Output "Visual Studio integration is already updating $($packages[0].Name); skipping VSIXInstaller."
    return
}

Write-IntegrationState -Status 'pending' -Package $packages[0].Name
$powershell = Join-Path $PSHOME 'powershell.exe'
$scriptArgument = '"{0}"' -f $PSCommandPath
$appPathArgument = '"{0}"' -f $AppPath
try {
    $worker = Start-Process -FilePath $powershell -ArgumentList @(
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        $scriptArgument,
        '-AppPath',
        $appPathArgument,
        '-BackgroundWorker'
    ) -WindowStyle Hidden -PassThru
    $currentState = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if ($currentState.status -eq 'pending') {
        Write-IntegrationState -Status 'pending' -Package $packages[0].Name -WorkerProcessId $worker.Id
    }
    Write-Output "Visual Studio integration is continuing in the background (PID $($worker.Id))."
} catch {
    Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
    throw
}