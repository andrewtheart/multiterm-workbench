#Requires -Version 5.1
<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

[CmdletBinding()]
param(
    [ValidateSet('x86', 'x64', 'arm64')]
    [string[]]$Architecture = @('x86', 'x64', 'arm64')
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$nativeBuild = Join-Path $scriptRoot 'build-sqlite3mc.ps1'
$hostProject = Join-Path $repoRoot 'lib\prompt-library-host\MultiTerm.PromptLibraryHost.csproj'
$hostRoot = Join-Path $repoRoot 'lib\prompt-library-host\publish'

& $nativeBuild -Architecture $Architecture
if ($LASTEXITCODE -ne 0) {
    throw 'The SQLite3MC build failed.'
}

foreach ($target in $Architecture) {
    & dotnet build $hostProject --configuration Release --nologo "-p:PromptLibraryNativeArch=$target"
    if ($LASTEXITCODE -ne 0) {
        throw "The Prompt Library host build failed for $target."
    }
    $output = Join-Path $hostRoot "$target\MultiTerm.PromptLibraryHost.exe"
    $native = Join-Path $hostRoot "$target\sqlite3mc.dll"
    if (-not (Test-Path -LiteralPath $output -PathType Leaf) -or
        -not (Test-Path -LiteralPath $native -PathType Leaf)) {
        throw "The Prompt Library host build did not produce the expected $target artifacts."
    }
    Write-Host "Prompt Library host ${target}: $output"
}