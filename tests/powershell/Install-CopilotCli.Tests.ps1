<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

# Black-boxes the installer helper the same way the VS Code integration tests do:
# fake executables on a scrubbed PATH, driving the non-mutating -PlanOnly report.

$scriptPath = Join-Path $PSScriptRoot "..\..\Install-CopilotCli.ps1"

Describe "Install-CopilotCli channel selection" {
    # Resolved before PATH is scrubbed, because the scrubbed PATH must not contain it.
    $powerShellHost = (Get-Command powershell.exe).Source
    $originalPath = $env:Path
    $sandbox = Join-Path $env:TEMP ("multiterm-copilot-tests-" + [guid]::NewGuid().ToString('n'))

    function New-FakeDirectory {
        param([string]$Name)
        $path = Join-Path $sandbox $Name
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        return $path
    }

    function Get-PlannedChannel {
        param([string]$FakeDirectory)
        $env:Path = $FakeDirectory
        try {
            $output = & $powerShellHost -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $scriptPath -PlanOnly
            return ("$output").Trim()
        }
        finally {
            $env:Path = $originalPath
        }
    }

    It "reports the script exists and parses" {
        Test-Path -LiteralPath $scriptPath -PathType Leaf | Should Be $true
    }

    It "reports an already installed CLI without choosing an installer" {
        $directory = New-FakeDirectory -Name "present"
        Set-Content -LiteralPath (Join-Path $directory "copilot.cmd") -Value "@echo off" -Encoding Ascii
        Get-PlannedChannel -FakeDirectory $directory | Should Be "present"
    }

    It "prefers WinGet when it is available" {
        $directory = New-FakeDirectory -Name "winget"
        Set-Content -LiteralPath (Join-Path $directory "winget.exe") -Value "" -Encoding Ascii
        Get-PlannedChannel -FakeDirectory $directory | Should Be "winget"
    }

    It "falls back to npm when Node is new enough and WinGet is missing" {
        $directory = New-FakeDirectory -Name "npm-modern"
        Set-Content -LiteralPath (Join-Path $directory "npm.cmd") -Value "@echo off" -Encoding Ascii
        Set-Content -LiteralPath (Join-Path $directory "node.cmd") -Value "@echo off`r`n@echo v22.14.0" -Encoding Ascii
        Get-PlannedChannel -FakeDirectory $directory | Should Be "npm"
    }

    It "skips npm when Node is older than the documented minimum" {
        $directory = New-FakeDirectory -Name "npm-legacy"
        Set-Content -LiteralPath (Join-Path $directory "npm.cmd") -Value "@echo off" -Encoding Ascii
        Set-Content -LiteralPath (Join-Path $directory "node.cmd") -Value "@echo off`r`n@echo v18.20.4" -Encoding Ascii
        Get-PlannedChannel -FakeDirectory $directory | Should Be "msi"
    }

    It "falls back to the signed installer when no package manager is available" {
        $directory = New-FakeDirectory -Name "bare"
        Get-PlannedChannel -FakeDirectory $directory | Should Be "msi"
    }

    It "leaves the caller PATH untouched" {
        $env:Path | Should Be $originalPath
    }

    if (Test-Path -LiteralPath $sandbox) {
        Remove-Item -LiteralPath $sandbox -Recurse -Force -ErrorAction SilentlyContinue
    }
}
