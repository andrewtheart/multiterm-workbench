<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppPath,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$extensionId = 'andrewtheart.multiterm-workbench.visualstudio'
$integrationDirectory = Join-Path $AppPath 'VisualStudio'
$stateDirectory = Join-Path $env:LOCALAPPDATA 'MultiTerm\Integrations'
$stateFile = Join-Path $stateDirectory 'VisualStudioIntegrationInstalled.json'
$legacyStateFile = Join-Path $integrationDirectory 'VisualStudioIntegrationInstalled.json'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'

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
$process = Start-Process -FilePath $vsixInstaller -ArgumentList @('/quiet', $packageArgument) -Wait -PassThru
if ($process.ExitCode -ne 0) {
    throw "Visual Studio could not install $($packages[0].Name) (exit code $($process.ExitCode))."
}

New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
@{
    extensionId = $extensionId
    installedAt = [DateTimeOffset]::UtcNow.ToString('o')
    package = $packages[0].Name
} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
Remove-Item -LiteralPath $legacyStateFile -Force -ErrorAction SilentlyContinue