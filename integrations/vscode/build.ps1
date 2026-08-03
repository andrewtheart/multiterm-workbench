<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

[CmdletBinding()]
param(
    [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"
$extensionRoot = $PSScriptRoot
$repositoryRoot = Split-Path (Split-Path $extensionRoot -Parent) -Parent
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $repositoryRoot "installer\vscode-integration\generated"
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$manifest = Get-Content -LiteralPath (Join-Path $extensionRoot "package.json") -Raw | ConvertFrom-Json
$output = Join-Path $OutputDirectory ("multiterm-workbench-{0}.vsix" -f $manifest.version)
$extensionLicense = Join-Path $extensionRoot "LICENSE"
$copiedLicense = -not (Test-Path -LiteralPath $extensionLicense -PathType Leaf)

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
if ($copiedLicense) {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot "LICENSE") -Destination $extensionLicense
}
Push-Location $extensionRoot
try {
    & npx.cmd --yes "@vscode/vsce" package --out $output
    if ($LASTEXITCODE -ne 0) {
        throw "VS Code extension packaging failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
    if ($copiedLicense) {
        Remove-Item -LiteralPath $extensionLicense -Force
    }
}

if (-not (Test-Path -LiteralPath $output -PathType Leaf)) {
    throw "VS Code extension package was not created: $output"
}
Write-Host "Created $output"
