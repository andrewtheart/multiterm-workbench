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
    Emits one compact JSON sample per interval for the bridge throughput benchmark.

.DESCRIPTION
    Deliberately one long-lived process rather than a shell-out per sample: the
    sampler runs on the same box as the bridge under measurement, so its own cost
    has to be small and constant. Its remaining cost is captured by the harness
    idle control run.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProcessIds,

    [int]$IntervalMs = 250
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ids = @()
foreach ($piece in $ProcessIds.Split(',')) {
    $trimmed = $piece.Trim()
    if ($trimmed) { $ids += [int]$trimmed }
}

$stopwatch = [Diagnostics.Stopwatch]::StartNew()

while ($true) {
    $rows = New-Object System.Collections.ArrayList
    foreach ($id in $ids) {
        $process = Get-Process -Id $id -ErrorAction SilentlyContinue
        if ($null -ne $process) {
            [void]$rows.Add([pscustomobject]@{
                pid = $process.Id
                cpuMs = [math]::Round($process.TotalProcessorTime.TotalMilliseconds, 3)
                workingSet = $process.WorkingSet64
                privateBytes = $process.PrivateMemorySize64
                threads = $process.Threads.Count
                handles = $process.HandleCount
            })
        }
    }

    $sample = [pscustomobject]@{
        at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        elapsedMs = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 3)
        rows = @($rows)
    }
    $sample | ConvertTo-Json -Compress -Depth 4
    [Console]::Out.Flush()

    Start-Sleep -Milliseconds $IntervalMs
}
