<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
#>

# Native launcher setup stays separate from the Electron application's runtime.

<#
.SYNOPSIS
  Launch MultiTerm Workbench in its Electron shell.

.DESCRIPTION
  Starts the bundled Electron binary against this worktree. Electron itself
  spawns the Node bridge (src/server.js) on $env:PORT and loads the renderer, so
  this script only needs to resolve electron.exe, pick a free port, export the
  environment the shell reads, and launch it.

  By default the app is launched detached (it keeps running after this script
  and the calling terminal exit) and the script waits for the bridge /health
  endpoint before reporting the URL. Use -Wait to run it in the foreground
  instead (Ctrl+C closes the app).

.PARAMETER Port
  Preferred TCP port for the bridge. Defaults to $env:PORT, else 3177 (the same
  default src/main.js and src/server.js use). If the port is busy the script auto-selects
  the next free port unless -StrictPort is set.

.PARAMETER HostName
  Interface the bridge binds to. Defaults to $env:HOST, else 127.0.0.1.

.PARAMETER Wait
  Run Electron in the foreground and block until it exits.

.PARAMETER StrictPort
  Fail instead of auto-bumping when the requested port is unavailable.

.PARAMETER TimeoutSeconds
  How long to wait for the bridge /health check when launching detached.

.EXAMPLE
  .\Start-MultiTerm-Electron.ps1

.EXAMPLE
  .\Start-MultiTerm-Electron.ps1 -Port 3188

.EXAMPLE
  .\Start-MultiTerm-Electron.ps1 -Wait
#>
[CmdletBinding()]
param(
  [int]$Port = 0,
  [string]$HostName = "",
  [switch]$Wait,
  [switch]$StrictPort,
  [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Test-PortFree {
  param([string]$Ip, [int]$PortToTest)
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($Ip), $PortToTest)
    $listener.Start()
    $listener.Stop()
    return $true
  } catch {
    return $false
  }
}

# --- Resolve electron.exe ---------------------------------------------------
$electron = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"
if (-not (Test-Path -LiteralPath $electron)) {
  # Fall back to whatever the electron package reports (handles hoisted installs).
  try {
    $resolved = & node -e "process.stdout.write(require('electron'))" 2>$null
    if ($resolved -and (Test-Path -LiteralPath $resolved)) { $electron = $resolved }
  } catch {
    # ignore; handled by the check below
  }
}
if (-not (Test-Path -LiteralPath $electron)) {
  throw "Could not find electron.exe. Run 'npm install' in $PSScriptRoot first."
}

# --- Resolve host + port ----------------------------------------------------
if (-not $HostName) {
  $HostName = if ($env:HOST) { $env:HOST } else { "127.0.0.1" }
}
if ($Port -le 0) {
  $Port = if ($env:PORT) { [int]$env:PORT } else { 3177 }
}

$bindIp = if ($HostName -eq "localhost") { "127.0.0.1" } else { $HostName }
if (-not (Test-PortFree -Ip $bindIp -PortToTest $Port)) {
  if ($StrictPort) {
    throw "Port $Port on $HostName is already in use (and -StrictPort was set)."
  }
  $requested = $Port
  $found = $false
  for ($p = $requested + 1; $p -le $requested + 50; $p++) {
    if (Test-PortFree -Ip $bindIp -PortToTest $p) { $Port = $p; $found = $true; break }
  }
  if (-not $found) {
    throw "Port $requested is busy and no free port was found in $($requested + 1)..$($requested + 50)."
  }
  Write-Warning "Port $requested is in use; using $Port instead."
}

# --- Export the environment the Electron shell reads ------------------------
$env:PORT = "$Port"
$env:HOST = $HostName

$url = "http://${HostName}:${Port}/"
Write-Host "Launching MultiTerm (Electron) -> $url" -ForegroundColor Cyan

if ($Wait) {
  # Foreground: block until the app exits (Ctrl+C closes it).
  & $electron "." 
  exit $LASTEXITCODE
}

# --- Detached launch + health wait -----------------------------------------
$proc = Start-Process -FilePath $electron -ArgumentList "." -WorkingDirectory $PSScriptRoot -PassThru
Write-Host "Electron started (PID $($proc.Id)). Waiting for the bridge..." -ForegroundColor DarkGray

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
  if ($proc.HasExited) {
    throw "Electron exited early (code $($proc.ExitCode)) before the bridge came up."
  }
  try {
    $res = Invoke-WebRequest -UseBasicParsing "http://${HostName}:${Port}/health" -TimeoutSec 2
    if ($res.StatusCode -eq 200) { $ready = $true; break }
  } catch {
    # bridge not listening yet; keep polling
  }
  Start-Sleep -Milliseconds 500
}

if ($ready) {
  Write-Host "MultiTerm is ready at $url (PID $($proc.Id))." -ForegroundColor Green
} else {
  Write-Warning "Timed out after ${TimeoutSeconds}s waiting for $url/health. The window may still be starting; PID $($proc.Id)."
}
