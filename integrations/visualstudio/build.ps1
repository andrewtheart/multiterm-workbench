<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$extensionRoot = $PSScriptRoot
$repositoryRoot = Split-Path (Split-Path $extensionRoot -Parent) -Parent
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $repositoryRoot 'installer\visualstudio-integration\generated'
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$manifestPath = Join-Path $extensionRoot 'source.extension.vsixmanifest'
$manifest = Get-Content -LiteralPath $manifestPath -Raw
$manifestVersion = [regex]::Match($manifest, '<Identity\s+[^>]*Version="([^"]+)"').Groups[1].Value
if ($manifestVersion -ne $Version) {
    throw "Visual Studio VSIX manifest version $manifestVersion does not match installer version $Version."
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) {
    throw 'Visual Studio Installer vswhere.exe was not found.'
}
$msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
if (-not $msbuild -or -not (Test-Path -LiteralPath $msbuild -PathType Leaf)) {
    throw 'Visual Studio MSBuild was not found.'
}

& $msbuild (Join-Path $extensionRoot 'MultiTerm.VisualStudio.csproj') /restore /t:Rebuild /p:Configuration=Release /nologo /verbosity:minimal
if ($LASTEXITCODE -ne 0) {
    throw "Visual Studio extension build failed with exit code $LASTEXITCODE."
}

$packages = @(Get-ChildItem -LiteralPath (Join-Path $extensionRoot 'bin\Release') -Filter '*.vsix' -File -Recurse)
if ($packages.Count -ne 1) {
    throw "Expected one built Visual Studio VSIX; found $($packages.Count)."
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
Get-ChildItem -LiteralPath $OutputDirectory -Filter '*.vsix' -File -ErrorAction SilentlyContinue | Remove-Item -Force
$output = Join-Path $OutputDirectory "multiterm-workbench-visualstudio-$Version.vsix"
Copy-Item -LiteralPath $packages[0].FullName -Destination $output -Force
Write-Host "Created $output"