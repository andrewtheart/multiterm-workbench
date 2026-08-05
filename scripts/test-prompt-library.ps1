#Requires -Version 5.1
<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$hostBuild = Join-Path $scriptRoot 'build-prompt-library-host.ps1'
$hostOutput = Join-Path $repoRoot 'lib\prompt-library-host\publish\x64\MultiTerm.PromptLibraryHost.exe'
$nativeOutput = Join-Path $repoRoot 'lib\prompt-library-host\publish\x64\sqlite3mc.dll'
$vitest = Join-Path $repoRoot 'node_modules\vitest\vitest.mjs'

if (-not (Test-Path -LiteralPath $vitest -PathType Leaf)) {
    throw 'Vitest is not installed. Run npm install before testing the Prompt Library.'
}

& $hostBuild -Architecture x64
if ($LASTEXITCODE -ne 0) {
    throw 'The x64 Prompt Library host build failed.'
}
if (-not (Test-Path -LiteralPath $hostOutput -PathType Leaf) -or
    -not (Test-Path -LiteralPath $nativeOutput -PathType Leaf)) {
    throw 'The Prompt Library host build did not produce the expected x64 artifacts.'
}

Push-Location $repoRoot
try {
    & node $vitest run 'tests/integration/prompt-library-host.test.js' 'tests/integration/prompt-library-installed.test.js'
    if ($LASTEXITCODE -ne 0) {
        throw 'The Prompt Library black-box integration test failed.'
    }
}
finally {
    Pop-Location
}