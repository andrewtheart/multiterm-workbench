<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Stages a self-contained bridge runtime inside the VS Code extension.
 *
 * Two things keep this small. The AI SDKs ship the Copilot and Claude CLI
 * executables as OPTIONAL platform packages (~600 MB combined); MultiTerm drives
 * CLIs the user installs separately, so --omit=optional drops them with no loss
 * of function. And the native module install leaves debug symbols and build
 * intermediates behind, which are pruned here.
 *
 * The bridge runs under system `node`, not the extension host's Electron, because
 * node-pty is built for the Node ABI. node-pty loads build/Release/*.node
 * directly, so the staged tree is valid for exactly ONE architecture and ONE Node
 * ABI. Both are recorded in runtime.json and verified against the real binaries
 * here, so the extension can detect a machine it cannot serve and use the
 * installed PowerShell bridge instead of spawning a child that can only fail.
 *
 * Dependencies install from the committed runtime-package-lock.json so identical
 * commits produce identical trees. Use -UpdateLock after changing a dependency.
#>

[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$Clean,
    [switch]$UpdateLock
)

$ErrorActionPreference = "Stop"
$extensionRoot = $PSScriptRoot
$repositoryRoot = Split-Path (Split-Path $extensionRoot -Parent) -Parent
$runtime = Join-Path $extensionRoot "runtime"
$lockSource = Join-Path $extensionRoot "runtime-package-lock.json"

# The staged tree is valid for one architecture and one Node ABI, so record the
# exact target rather than assuming the machine that happens to run this script.
$nodeTarget = & node -p "JSON.stringify({platform:process.platform,arch:process.arch,abi:process.versions.modules,version:process.versions.node})" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $nodeTarget) { throw "Node.js is required to stage the bridge runtime." }

$promptLibraryArchitectures = @{ "x64" = "x64"; "arm64" = "arm64"; "ia32" = "x86" }
$expectedPeMachines = @{ "x64" = 0x8664; "arm64" = 0xAA64; "ia32" = 0x014C }

# A .node built for another architecture loads as a plain "invalid win32
# application" at run time, so the mismatch has to be caught while packaging.
function Get-PeMachine([string]$path) {
    $stream = [IO.File]::OpenRead($path)
    try {
        $reader = [IO.BinaryReader]::new($stream)
        if ($reader.ReadUInt16() -ne 0x5A4D) { return $null }
        $stream.Position = 0x3C
        $peOffset = $reader.ReadInt32()
        $stream.Position = $peOffset + 4
        return [int]$reader.ReadUInt16()
    }
    finally { $stream.Dispose() }
}

# Only the bridge's own modules; the rest of lib/ is built C# hosts the Node
# bridge never loads.
$libModules = @(
    "copilot-log-aggregator.js",
    "prompt-library-client.js",
    "runtime-diagnostics.js"
)

# Files server.js resolves relative to its repository root. Missing one fails at
# run time, not at package time, so they are verified below.
$rootFiles = @(
    "Install-CopilotCli.ps1"
)

function Get-TreeSizeMb([string]$path) {
    if (-not (Test-Path $path)) { return 0 }
    $bytes = (Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    return [math]::Round(($bytes / 1MB), 1)
}

if ($Clean -and (Test-Path $runtime)) {
    Remove-Item $runtime -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $runtime | Out-Null

Write-Host "==> Staging bridge sources"
foreach ($folder in @("src", "public")) {
    $destination = Join-Path $runtime $folder
    if (Test-Path $destination) { Remove-Item $destination -Recurse -Force }
    Copy-Item (Join-Path $repositoryRoot $folder) $destination -Recurse
}

$libDestination = Join-Path $runtime "lib"
if (Test-Path $libDestination) { Remove-Item $libDestination -Recurse -Force }
New-Item -ItemType Directory -Force -Path $libDestination | Out-Null
foreach ($module in $libModules) {
    $source = Join-Path $repositoryRoot "lib\$module"
    if (-not (Test-Path $source)) { throw "Bridge module not found: $source" }
    Copy-Item $source (Join-Path $libDestination $module)
}

Copy-Item (Join-Path $repositoryRoot "THIRD-PARTY-NOTICES.txt") (Join-Path $runtime "THIRD-PARTY-NOTICES.txt") -Force
Copy-Item (Join-Path $repositoryRoot "LICENSE") (Join-Path $runtime "LICENSE") -Force

# The Prompt Library is encrypted local storage served by a small .NET host; the
# bridge reports "storage is unavailable" for every request without it.
$promptLibraryArchitecture = $promptLibraryArchitectures[[string]$nodeTarget.arch]
if (-not $promptLibraryArchitecture) { throw "Unsupported architecture for the bridge runtime: $($nodeTarget.arch)" }
$promptLibrarySource = Join-Path $repositoryRoot "lib\prompt-library-host\publish\$promptLibraryArchitecture"
if (-not (Test-Path $promptLibrarySource)) {
    throw "The Prompt Library host for $promptLibraryArchitecture is not built. Run scripts\build-prompt-library-host.ps1 first."
}
$promptLibraryDestination = Join-Path $libDestination "prompt-library-host"
New-Item -ItemType Directory -Force -Path $promptLibraryDestination | Out-Null
foreach ($hostFile in @("MultiTerm.PromptLibraryHost.exe", "MultiTerm.PromptLibraryHost.exe.config", "sqlite3mc.dll")) {
    $source = Join-Path $promptLibrarySource $hostFile
    if (-not (Test-Path $source)) { throw "Prompt Library host file not found: $source" }
    Copy-Item $source (Join-Path $promptLibraryDestination $hostFile) -Force
}

foreach ($rootFile in $rootFiles) {
    $source = Join-Path $repositoryRoot $rootFile
    if (-not (Test-Path $source)) { throw "Bridge root file not found: $source" }
    Copy-Item $source (Join-Path $runtime $rootFile) -Force
}

# Fail closed on anything server.js resolves from its root that is not staged;
# otherwise the gap only shows up as a broken feature on a user's machine.
$serverSource = Get-Content (Join-Path $repositoryRoot "src\server.js") -Raw
$referenced = [regex]::Matches($serverSource, 'path\.join\(repoRoot,\s*"([^"]+)"\)') |
    ForEach-Object { $_.Groups[1].Value } |
    Select-Object -Unique
foreach ($reference in $referenced) {
    if (-not (Test-Path (Join-Path $runtime $reference))) {
        throw "server.js resolves '$reference' from its root, but staging did not produce it."
    }
}
Write-Host ("==> Verified {0} root reference(s) from server.js" -f $referenced.Count)

# The runtime manifest pins exactly what the bridge requires at run time. Its own
# version is fixed so the committed lock stays valid across releases.
$appManifest = Get-Content (Join-Path $repositoryRoot "package.json") -Raw | ConvertFrom-Json
$runtimeDependencies = [ordered]@{}
foreach ($name in @("@anthropic-ai/claude-agent-sdk", "@github/copilot-sdk", "@homebridge/node-pty-prebuilt-multiarch", "@msgpack/msgpack")) {
    $version = $appManifest.dependencies.$name
    if (-not $version) { throw "Runtime dependency missing from the app manifest: $name" }
    $runtimeDependencies[$name] = $version
}

[ordered]@{
    name         = "multiterm-bridge-runtime"
    version      = "0.0.0"
    private      = $true
    license      = "GPL-3.0-or-later"
    main         = "src/server.js"
    dependencies = $runtimeDependencies
} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $runtime "package.json") -Encoding UTF8

if (-not $SkipInstall) {
    Push-Location $runtime
    try {
        if ($UpdateLock) {
            Write-Host "==> Resolving runtime dependencies and refreshing the lock"
            & npm install --omit=dev --omit=optional --no-audit --no-fund --loglevel=error
            if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE." }
            Copy-Item (Join-Path $runtime "package-lock.json") $lockSource -Force
            Write-Host "==> Updated $lockSource"
        }
        else {
            if (-not (Test-Path $lockSource)) {
                throw "No committed runtime lock at $lockSource. Run build-runtime.ps1 -UpdateLock and commit the result."
            }
            Write-Host "==> Installing runtime dependencies from the committed lock"
            Copy-Item $lockSource (Join-Path $runtime "package-lock.json") -Force
            & npm ci --omit=dev --omit=optional --no-audit --no-fund --loglevel=error
            if ($LASTEXITCODE -ne 0) {
                throw "npm ci failed with exit code $LASTEXITCODE. If a dependency changed, run build-runtime.ps1 -UpdateLock and commit the lock."
            }
        }
    }
    finally {
        Pop-Location
    }
}

$modules = Join-Path $runtime "node_modules"
if (Test-Path $modules) {
    $beforeMb = Get-TreeSizeMb $modules
    Write-Host "==> Pruning build leftovers (installed tree is $beforeMb MB)"

    # Debug symbols and object files are build leftovers; the .node bindings that
    # sit beside them are what the bridge actually loads.
    Get-ChildItem $modules -Recurse -File -Include *.pdb, *.obj, *.exp, *.iobj, *.ipdb, *.ilk, *.map, *.ts, *.tsbuildinfo -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -ne ".node" } |
        Remove-Item -Force -ErrorAction SilentlyContinue

    foreach ($junk in @("test", "tests", "docs", "doc", "example", "examples", ".github")) {
        Get-ChildItem $modules -Recurse -Directory -Filter $junk -ErrorAction SilentlyContinue |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }

    # Intermediate compiler output directories, kept distinct from build/Release
    # itself so the native bindings survive.
    Get-ChildItem $modules -Recurse -Directory -Filter "*.dir" -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    Write-Host "==> Pruned to $(Get-TreeSizeMb $modules) MB"
}

$bindings = @(Get-ChildItem $modules -Recurse -File -Filter *.node -ErrorAction SilentlyContinue)
if ($bindings.Count -eq 0) { throw "No native bindings survived staging; the bridge would not be able to open a terminal." }

$expectedMachine = $expectedPeMachines[[string]$nodeTarget.arch]
foreach ($binary in @($bindings) + @(Get-ChildItem $promptLibraryDestination -File -Include *.exe, *.dll -Recurse)) {
    $machine = Get-PeMachine $binary.FullName
    # Linux prebuilds ship alongside the Windows bindings and are not PE files.
    if ($null -eq $machine) { continue }
    if ($machine -ne $expectedMachine) {
        throw ("{0} is built for machine 0x{1:X4}, but this runtime targets {2} (0x{3:X4})." -f $binary.FullName, $machine, $nodeTarget.arch, $expectedMachine)
    }
}

[ordered]@{
    platform    = [string]$nodeTarget.platform
    arch        = [string]$nodeTarget.arch
    nodeAbi     = [string]$nodeTarget.abi
    nodeVersion = [string]$nodeTarget.version
    nodeRange   = ("{0}.x" -f ([string]$nodeTarget.version).Split(".")[0])
    appVersion  = [string]$appManifest.version
} | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $runtime "runtime.json") -Encoding UTF8

Write-Host ""
Write-Host "Runtime staged at $runtime"
Write-Host ("  target        {0}-{1}, Node {2} (ABI {3})" -f $nodeTarget.platform, $nodeTarget.arch, $nodeTarget.version, $nodeTarget.abi)
Write-Host ("  sources       {0} MB" -f (Get-TreeSizeMb (Join-Path $runtime "src")))
Write-Host ("  public        {0} MB" -f (Get-TreeSizeMb (Join-Path $runtime "public")))
Write-Host ("  lib           {0} MB" -f (Get-TreeSizeMb $libDestination))
Write-Host ("  node_modules  {0} MB" -f (Get-TreeSizeMb $modules))
Write-Host ("  native        {0} binding(s)" -f $bindings.Count)
Write-Host ("  TOTAL         {0} MB" -f (Get-TreeSizeMb $runtime))
