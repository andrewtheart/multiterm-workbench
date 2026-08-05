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
$sourceRoot = Join-Path $repoRoot 'lib\sqlite3mc'
$upstreamRoot = Join-Path $sourceRoot 'upstream'
$manifestPath = Join-Path $sourceRoot 'source.json'

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

function Get-Arm64CompilerPath {
    param([Parameter(Mandatory = $true)][string]$InstallationPath)

    $toolsVersionPath = Join-Path $InstallationPath 'VC\Auxiliary\Build\Microsoft.VCToolsVersion.default.txt'
    if (-not (Test-Path -LiteralPath $toolsVersionPath -PathType Leaf)) {
        return $null
    }
    $toolsVersion = (Get-Content -LiteralPath $toolsVersionPath -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($toolsVersion)) {
        return $null
    }
    return Join-Path $InstallationPath "VC\Tools\MSVC\$toolsVersion\bin\Hostx64\arm64\cl.exe"
}

function Get-CMakeGenerator {
    param([Parameter(Mandatory = $true)][string]$InstallationVersion)

    $majorVersion = ([version]$InstallationVersion).Major
    switch ($majorVersion) {
        16 { return 'Visual Studio 16 2019' }
        17 { return 'Visual Studio 17 2022' }
        18 { return 'Visual Studio 18 2026' }
        default { throw "Visual Studio version $InstallationVersion is not supported by the SQLite3MC build." }
    }
}

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "SQLite3MC source manifest was not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
foreach ($property in $manifest.files.PSObject.Properties) {
    $sourcePath = Join-Path $upstreamRoot $property.Name
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Pinned SQLite3MC source file was not found: $sourcePath"
    }
    $actual = Get-Sha256Hex -Path $sourcePath
    if ($actual -ne [string]$property.Value) {
        throw "SQLite3MC source hash mismatch for $($property.Name): $actual"
    }
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) {
    throw 'Visual Studio Installer vswhere.exe was not found.'
}
$installationJson = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -format json
if ($LASTEXITCODE -ne 0) {
    throw 'A Visual Studio C++ toolchain was not found.'
}
$installations = @((($installationJson -join [Environment]::NewLine) | ConvertFrom-Json))
if ($installations.Count -eq 0) {
    throw 'A Visual Studio C++ toolchain was not found.'
}
$orderedInstallations = @($installations | Sort-Object { [version]$_.installationVersion } -Descending)
$platforms = @{
    x86 = 'Win32'
    x64 = 'x64'
    arm64 = 'ARM64'
}
$toolchains = @{}

# Resolve every requested target before compiling any of them. A newer Visual
# Studio instance may omit optional ARM64 tools while an older installation has
# them, so toolchain selection must be architecture-aware rather than -latest.
foreach ($target in $Architecture) {
    $selectedInstallation = $null
    foreach ($candidate in $orderedInstallations) {
        if ($target -eq 'arm64') {
            $arm64Compiler = Get-Arm64CompilerPath -InstallationPath $candidate.installationPath
            if (-not $arm64Compiler -or -not (Test-Path -LiteralPath $arm64Compiler -PathType Leaf)) {
                continue
            }
        }
        $selectedInstallation = $candidate
        break
    }
    if (-not $selectedInstallation) {
        throw "The Visual Studio ARM64 C++ build tools are required to build SQLite3MC for $target."
    }
    $installationMajorVersion = ([version]$selectedInstallation.installationVersion).Major
    $toolchains[$target] = [pscustomobject]@{
        BuildDirectoryName = "vs$installationMajorVersion"
        DisplayName = [string]$selectedInstallation.displayName
        Generator = Get-CMakeGenerator -InstallationVersion ([string]$selectedInstallation.installationVersion)
        InstallationPath = [string]$selectedInstallation.installationPath
    }
}

foreach ($target in $Architecture) {
    $toolchain = $toolchains[$target]
    $buildRoot = Join-Path $sourceRoot "build\$target\$($toolchain.BuildDirectoryName)"
    Write-Host "Using $($toolchain.DisplayName) for SQLite3MC $target."
    & cmake -S $sourceRoot -B $buildRoot -G $toolchain.Generator -A $platforms[$target] "-DCMAKE_GENERATOR_INSTANCE=$($toolchain.InstallationPath)" "-DMULTITERM_ARCH=$target"
    if ($LASTEXITCODE -ne 0) {
        throw "SQLite3MC CMake configuration failed for $target."
    }
    & cmake --build $buildRoot --config Release --target sqlite3mc
    if ($LASTEXITCODE -ne 0) {
        throw "SQLite3MC build failed for $target."
    }
    $output = Join-Path $sourceRoot "bin\$target\sqlite3mc.dll"
    if (-not (Test-Path -LiteralPath $output -PathType Leaf)) {
        throw "SQLite3MC build did not produce the expected DLL: $output"
    }
    $hash = Get-Sha256Hex -Path $output
    Write-Host "SQLite3MC ${target}: $output ($hash)"
}