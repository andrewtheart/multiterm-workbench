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

$ErrorActionPreference = "Stop"
$extensionId = "andrewtheart.multiterm-workbench"
$integrationDirectory = Join-Path $AppPath "VSCode"
$stateFile = Join-Path $integrationDirectory "VSCodeIntegrationInstalled.json"

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
    throw "Visual Studio Code was not found. Install VS Code or add code.cmd to PATH, then retry."
}

if ($Uninstall.IsPresent) {
    if (-not (Test-Path -LiteralPath $stateFile -PathType Leaf)) {
        return
    }
    & $code --uninstall-extension $extensionId
    if ($LASTEXITCODE -ne 0) {
        throw "VS Code could not uninstall $extensionId (exit code $LASTEXITCODE)."
    }
    Remove-Item -LiteralPath $stateFile -Force
    return
}

$packages = @(Get-ChildItem -LiteralPath $integrationDirectory -Filter "*.vsix" -File)
if ($packages.Count -ne 1) {
    throw "Expected exactly one MultiTerm VS Code package in $integrationDirectory; found $($packages.Count)."
}

& $code --install-extension $packages[0].FullName --force
if ($LASTEXITCODE -ne 0) {
    throw "VS Code could not install $($packages[0].Name) (exit code $LASTEXITCODE)."
}

@{
    extensionId = $extensionId
    installedAt = [DateTimeOffset]::UtcNow.ToString("o")
    package = $packages[0].Name
} | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
