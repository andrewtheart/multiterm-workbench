#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$RepositoryRoot = '',
    [string]$ModulePath = '',
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Test-InteractiveProcessPrompt {
    param([switch]$Disabled)

    if ($Disabled -or $env:CI -or -not [Environment]::UserInteractive) { return $false }
    if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { return $false }
    return $true
}

function Get-MultiTermNativeProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$NativeModulePath
    )

    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { return @() }

    $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    $targetPath = [IO.Path]::GetFullPath($NativeModulePath)
    $bridgePaths = @(
        (Join-Path $rootPath 'server.js'),
        (Join-Path $rootPath 'elevated-pty-host.js')
    )
    $processes = @{}
    $processInfoById = @{}

    foreach ($processInfo in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)) {
        $processInfoById[[int]$processInfo.ProcessId] = $processInfo
        $commandLine = [string]$processInfo.CommandLine
        $isRepositoryBridge = $false
        foreach ($bridgePath in $bridgePaths) {
            if ($commandLine.IndexOf($bridgePath, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                $isRepositoryBridge = $true
                break
            }
        }
        if ($isRepositoryBridge) {
            $processes[[int]$processInfo.ProcessId] = [pscustomobject]@{
                Id = [int]$processInfo.ProcessId
                Name = [string]$processInfo.Name
                CommandLine = $commandLine
                ParentProcessId = [int]$processInfo.ParentProcessId
                Role = 'MultiTerm bridge'
            }
        }
    }

    foreach ($nativeProcess in @(Get-Process -ErrorAction SilentlyContinue)) {
        try {
            $loadsTarget = @($nativeProcess.Modules | Where-Object {
                [string]::Equals(
                    [IO.Path]::GetFullPath($_.FileName),
                    $targetPath,
                    [StringComparison]::OrdinalIgnoreCase)
            }).Count -gt 0
            if (-not $loadsTarget) { continue }

            $processInfo = $processInfoById[[int]$nativeProcess.Id]
            $processes[[int]$nativeProcess.Id] = [pscustomobject]@{
                Id = [int]$nativeProcess.Id
                Name = if ($processInfo) { [string]$processInfo.Name } else { [string]$nativeProcess.ProcessName }
                CommandLine = if ($processInfo) { [string]$processInfo.CommandLine } else { '' }
                ParentProcessId = if ($processInfo) { [int]$processInfo.ParentProcessId } else { 0 }
                Role = 'conpty.node lock holder'
            }
        }
        catch {
            # Access to system and elevated process module lists can be denied.
        }
    }

    foreach ($lockingProcess in @($processes.Values)) {
        if (-not $lockingProcess.ParentProcessId) { continue }
        $parent = $processInfoById[[int]$lockingProcess.ParentProcessId]
        if (-not $parent -or [string]$parent.Name -ine 'electron.exe') { continue }
        if (-not $processes.ContainsKey([int]$parent.ProcessId)) {
            $processes[[int]$parent.ProcessId] = [pscustomobject]@{
                Id = [int]$parent.ProcessId
                Name = [string]$parent.Name
                CommandLine = [string]$parent.CommandLine
                ParentProcessId = [int]$parent.ParentProcessId
                Role = 'MultiTerm Electron owner'
            }
        }
    }

    return @($processes.Values | Sort-Object Id)
}

function Stop-MultiTermNativeProcess {
    param([Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Processes)

    # The Electron owner goes first; killing a child it supervises invites a respawn.
    $orderedProcesses = @($Processes | Sort-Object @{
        Expression = { if ($_.Role -eq 'MultiTerm Electron owner') { 0 } else { 1 } }
    }, Id)
    foreach ($blockingProcess in $orderedProcesses) {
        if (-not (Get-Process -Id $blockingProcess.Id -ErrorAction SilentlyContinue)) { continue }
        Write-Host "Stopping $($blockingProcess.Name) PID $($blockingProcess.Id) ($($blockingProcess.Role))..."
        try {
            Stop-Process -Id $blockingProcess.Id -Force -ErrorAction Stop
        }
        catch {
            Write-Warning "Could not stop PID $($blockingProcess.Id): $($_.Exception.Message)"
            continue
        }
        Wait-Process -Id $blockingProcess.Id -Timeout 5 -ErrorAction SilentlyContinue
    }
}

function Wait-MultiTermNativeModuleRelease {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$NativeModulePath,
        [int]$TimeoutSeconds = 10
    )

    # Windows can hold the file mapping open briefly after the owning process
    # exits, so a survivor is only real once it outlives this wait.
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ($true) {
        $processes = @(Get-MultiTermNativeProcess -Root $Root -NativeModulePath $NativeModulePath)
        if ($processes.Count -eq 0 -or (Get-Date) -ge $deadline) { return $processes }
        Start-Sleep -Milliseconds 400
    }
}

function Confirm-MultiTermNativeModuleUnlocked {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$NativeModulePath,
        [switch]$DisablePrompt,
        [int]$MaxAttempts = 3
    )

    $blockingProcesses = @(Get-MultiTermNativeProcess -Root $Root -NativeModulePath $NativeModulePath)
    if ($blockingProcesses.Count -eq 0) { return }

    $attempt = 0
    while ($blockingProcesses.Count -gt 0) {
        $processIds = @($blockingProcesses | ForEach-Object { $_.Id } | Sort-Object -Unique)
        $processLabel = $processIds -join ', '

        if (-not (Test-InteractiveProcessPrompt -Disabled:$DisablePrompt)) {
            throw "Native rebuild blocked by MultiTerm process PID(s): $processLabel. Close them and retry."
        }

        $attempt++
        if ($attempt -gt $MaxAttempts) {
            throw "conpty.node is still in use by MultiTerm process PID(s): $processLabel after $MaxAttempts attempt(s). Close them and retry."
        }

        if ($attempt -eq 1) {
            Write-Warning 'A running MultiTerm Electron instance can block rebuilding conpty.node.'
        }
        else {
            # Usually a sibling instance that was not running when the first list was built.
            Write-Warning "conpty.node is still held after attempt $($attempt - 1); these process(es) remain."
        }
        $blockingProcesses |
            Select-Object Id, Name, Role, CommandLine |
            Format-Table -AutoSize |
            Out-Host

        Write-Warning 'Stopping these processes will close the MultiTerm Electron app and its terminal sessions.'
        $answer = (Read-Host "Stop MultiTerm process(es) PID $processLabel and continue? (yes/no)").Trim()
        if ($answer -ine 'yes') {
            throw 'Native rebuild cancelled; the running MultiTerm process was left untouched.'
        }

        Stop-MultiTermNativeProcess -Processes $blockingProcesses
        $blockingProcesses = @(Wait-MultiTermNativeModuleRelease -Root $Root -NativeModulePath $NativeModulePath)
    }

    Write-Host 'The MultiTerm native module is unlocked.' -ForegroundColor Green
}

if (-not $RepositoryRoot) {
    $RepositoryRoot = Split-Path -Parent $PSScriptRoot
}
$RepositoryRoot = [IO.Path]::GetFullPath($RepositoryRoot)
if (-not $ModulePath) {
    $ModulePath = Join-Path $RepositoryRoot 'node_modules\@homebridge\node-pty-prebuilt-multiarch\build\Release\conpty.node'
}

if (Test-Path -LiteralPath $ModulePath -PathType Leaf) {
    Confirm-MultiTermNativeModuleUnlocked `
        -Root $RepositoryRoot `
        -NativeModulePath $ModulePath `
        -DisablePrompt:$NonInteractive
}