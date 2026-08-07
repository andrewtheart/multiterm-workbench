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
    [string]$EditorProcessName = "Code"
)

$ErrorActionPreference = "Stop"
$extensionId = "andrewtheart.multiterm-workbench"
$integrationDirectory = Join-Path $AppPath "VSCode"
$stateDirectory = Join-Path $env:LOCALAPPDATA "MultiTerm\Integrations"
$stateFile = Join-Path $stateDirectory "VSCodeIntegrationInstalled.json"
$legacyStateFile = Join-Path $integrationDirectory "VSCodeIntegrationInstalled.json"

function Find-VSCodeCommand {
    $fromPath = Get-Command code.cmd -ErrorAction SilentlyContinue
    $candidates = @(
        $fromPath.Source,
        (Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code\bin\code.cmd"),
        (Join-Path $env:ProgramFiles "Microsoft VS Code\bin\code.cmd"),
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft VS Code\bin\code.cmd")
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
    return $candidates | Select-Object -First 1
}

$code = Find-VSCodeCommand
if (-not $code) {
    # These tasks ship enabled, so most machines run this helper without ever
    # having asked for it. "No VS Code here" is an ordinary outcome, not a
    # failure, and must never abort the MultiTerm installation.
    if ($Uninstall.IsPresent) {
        Remove-Item -LiteralPath $stateFile, $legacyStateFile -Force -ErrorAction SilentlyContinue
    }
    Write-Output 'Visual Studio Code was not found; skipping the MultiTerm extension.'
    exit 0
}
$editorWasRunning = $null -ne (Get-Process -Name $EditorProcessName -ErrorAction SilentlyContinue | Select-Object -First 1)

if ($Uninstall.IsPresent) {
    if (-not (Test-Path -LiteralPath $stateFile -PathType Leaf) -and
        -not (Test-Path -LiteralPath $legacyStateFile -PathType Leaf)) {
        return
    }
    & $code --uninstall-extension $extensionId
    if ($LASTEXITCODE -ne 0) {
        throw "VS Code could not uninstall $extensionId (exit code $LASTEXITCODE)."
    }
    Remove-Item -LiteralPath $stateFile, $legacyStateFile -Force -ErrorAction SilentlyContinue
    return
}

# Upgrades from before the installer pruned old packages can leave several
# version-stamped .vsix files here; the newest is the one being installed.
$packages = @(Get-ChildItem -LiteralPath $integrationDirectory -Filter "*.vsix" -File | Sort-Object LastWriteTime -Descending)
if ($packages.Count -eq 0) {
    throw "Expected a MultiTerm VS Code package in $integrationDirectory; found none."
}

& $code --install-extension $packages[0].FullName --force
if ($LASTEXITCODE -ne 0) {
    throw "VS Code could not install $($packages[0].Name) (exit code $LASTEXITCODE)."
}

New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
@{
    extensionId = $extensionId
    editorWasRunning = $editorWasRunning
    installedAt = [DateTimeOffset]::UtcNow.ToString("o")
    package = $packages[0].Name
} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
Remove-Item -LiteralPath $legacyStateFile -Force -ErrorAction SilentlyContinue
