#Requires -Version 5.1
<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$sourcePath = Join-Path $repoRoot "HELP.md"
$headerPath = Join-Path $scriptRoot "help-style.html"
$imageFilterPath = Join-Path $scriptRoot "help-image-paths.lua"
$builderPath = $MyInvocation.MyCommand.Path
$outputPath = Join-Path $repoRoot "public\help.html"
$temporaryPath = "$outputPath.tmp"

foreach ($requiredPath in @($sourcePath, $headerPath, $imageFilterPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required help source was not found: $requiredPath"
    }
}

$pandoc = Get-Command pandoc -ErrorAction SilentlyContinue
if (-not $pandoc) {
    throw "Pandoc is required to build the in-app help. Install Pandoc and ensure 'pandoc' is available on PATH."
}

$newestInput = (Get-Item -LiteralPath $sourcePath), (Get-Item -LiteralPath $headerPath), (Get-Item -LiteralPath $imageFilterPath), (Get-Item -LiteralPath $builderPath) |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

if (-not $Force -and
    (Test-Path -LiteralPath $outputPath -PathType Leaf) -and
    (Get-Item -LiteralPath $outputPath).LastWriteTimeUtc -ge $newestInput.LastWriteTimeUtc) {
    Write-Host "In-app help is up to date: $outputPath"
    return
}

Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue

try {
    $arguments = @(
        $sourcePath,
        "--from=gfm+raw_html",
        "--to=html5",
        "--standalone",
        "--toc",
        "--toc-depth=3",
        "--metadata", "pagetitle=MultiTerm Workbench Help",
        "--include-in-header=$headerPath",
        "--lua-filter=$imageFilterPath",
        "--wrap=none",
        "--output=$temporaryPath"
    )

    & $pandoc.Source @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Pandoc exited with code $LASTEXITCODE."
    }
    if (-not (Test-Path -LiteralPath $temporaryPath -PathType Leaf)) {
        throw "Pandoc did not create the expected output: $temporaryPath"
    }

    Move-Item -LiteralPath $temporaryPath -Destination $outputPath -Force
    Write-Host "Generated in-app help: $outputPath"
}
finally {
    Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
}
