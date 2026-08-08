<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$testPath = Join-Path $repoRoot "tests\powershell\Install-VSCodeIntegration.Tests.ps1"
$sourcePath = Join-Path $repoRoot "installer\vscode-integration\Install-VSCodeIntegration.ps1"

Import-Module Pester -MinimumVersion 3.4
$result = Invoke-Pester -Script $testPath -CodeCoverage $sourcePath -PassThru

if ($result.FailedCount -gt 0) {
    throw "$($result.FailedCount) PowerShell test(s) failed."
}

$coverage = $result.CodeCoverage
if ($coverage.NumberOfCommandsMissed -gt 0) {
    throw "PowerShell command coverage is incomplete: $($coverage.NumberOfCommandsExecuted)/$($coverage.NumberOfCommandsAnalyzed) commands covered."
}

Write-Host "PowerShell command coverage: $($coverage.NumberOfCommandsExecuted)/$($coverage.NumberOfCommandsAnalyzed) (100%)."

# The remaining PowerShell suites are run without a coverage gate: they exercise
# release tooling whose branches depend on git and GitHub state that cannot be
# reached from a unit test.
$additionalSuites = @(
    (Join-Path $repoRoot "tests\powershell\ReleaseNotesBase.Tests.ps1")
)

foreach ($suite in $additionalSuites) {
    if (-not (Test-Path -LiteralPath $suite -PathType Leaf)) {
        throw "PowerShell test suite not found: $suite"
    }

    $suiteResult = Invoke-Pester -Script $suite -PassThru
    if ($suiteResult.FailedCount -gt 0) {
        throw "$($suiteResult.FailedCount) PowerShell test(s) failed in $(Split-Path -Leaf $suite)."
    }

    Write-Host "$(Split-Path -Leaf $suite): $($suiteResult.PassedCount) test(s) passed."
}