# MultiTerm Workbench
# Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

<#
.SYNOPSIS
    Launches the installed MultiTerm bridge into its own console for benchmarking.

.DESCRIPTION
    MEASURED: starting Start-MultiTerm.ps1 as a console-less child (redirected
    stdio, no window) lets the bridge serve HTTP, but every ConPTY session it
    creates exits with code 0 within about 300 ms, so the session catalog is
    always empty. Giving the host its own console keeps sessions alive.

    Launching lives in a script rather than an inline -Command string because
    Start-Process does not quote its ArgumentList elements, and layering Node
    argv quoting on top of PowerShell quoting on top of that is how paths with
    spaces silently become several arguments.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [int]$Port,

    [Parameter(Mandatory = $true)]
    [string]$ScriptPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ScriptPath)) {
    throw "Bridge launcher not found: $ScriptPath"
}

$powerShell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = @(
    '-NoLogo'
    '-NoProfile'
    '-ExecutionPolicy'
    'Bypass'
    '-File'
    ('"' + $ScriptPath + '"')
    '-Port'
    $Port.ToString()
    '-NoBrowser'
    '-NewInstance'
)

$process = Start-Process -FilePath $powerShell -ArgumentList $arguments -WindowStyle Minimized -PassThru
Write-Output $process.Id
