#Requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$guardPath = Join-Path $PSScriptRoot 'confirm-native-module-unlocked.ps1'

& $guardPath -RepositoryRoot $repositoryRoot

$npmPath = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Source -First 1
if (-not $npmPath) {
    throw 'npm.cmd was not found on PATH.'
}

Write-Host 'Rebuilding MultiTerm native terminal dependency...' -ForegroundColor Cyan
& $npmPath rebuild '@homebridge/node-pty-prebuilt-multiarch' --foreground-scripts
if ($LASTEXITCODE -ne 0) {
    throw "Native dependency rebuild failed with exit code $LASTEXITCODE."
}