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
    Deploys the working tree to a Hyper-V guest and runs the bridge throughput
    benchmark there.

.DESCRIPTION
    The benchmark's stability gate wants the p95 of its headline metric to vary
    by no more than 10% across five warm repeats. A development host competing
    with editors, browsers and indexers is a poor place to establish that, so an
    isolated guest is materially better.

    Everything moves over PowerShell Direct (VMBus), so the guest needs NO network
    at all: Node is xcopy-deployed from the host, node_modules and the Playwright
    browser ship as archives, and nothing is downloaded. That is deliberate -
    guest internet here depends on ICS/NAT, and repairing that is riskier than
    removing the need for it.

    This script never changes VM or host network configuration. Processor count
    is reported rather than silently "corrected". Memory is left alone unless
    -FixedMemoryBytes is given, because dynamic memory reassigns guest RAM
    between runs and that shows up directly as run-to-run spread.

    When the run finishes the guest is restored to its checkpoint, so every run
    starts from identical state and nothing the benchmark deployed is left
    behind. The guest is ALSO reset before the run, because a previous attempt
    that was interrupted never reached its own reset and would otherwise leak its
    deployment and processes into the next measurement. Results are always copied
    back BEFORE any restore, including when the run failed part way. Hyper-V's own
    "Automatic Checkpoint" is never treated as a restore target, and if more than
    one deliberate checkpoint exists the restore is skipped rather than guessed -
    use -CheckpointName, or -KeepGuestState to opt out entirely.

.PARAMETER Credential
    Guest credentials. Omit it and PowerShell prompts locally; the value is only
    ever passed to New-PSSession and is never written to disk or to the log.

.PARAMETER CredentialPath
    Where the guest credential is stored between runs. Defaults to
    %USERPROFILE%\.multiterm-vm-cred.xml and is used automatically when it
    exists, so the password is typed once rather than on every run. Export-Clixml
    protects it with DPAPI scoped to this user on this machine, so the file is
    useless anywhere else. Pass -SaveCredential to create it, or
    -RemoveCredentialAfterUse to delete it when the run finishes.

.EXAMPLE
    # From an ELEVATED PowerShell on the host:
    .\benchmarks\bridge-throughput\run-in-vm.ps1 -StartVM -Renderer

.EXAMPLE
    # Re-run reusing what is already deployed in the guest:
    .\benchmarks\bridge-throughput\run-in-vm.ps1 -SkipSync -SkipDependencies -Mode node
#>

#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$VMName = '',

    [System.Management.Automation.PSCredential]$Credential,

    [string]$CredentialPath = (Join-Path $env:USERPROFILE '.multiterm-vm-cred.xml'),

    [switch]$SaveCredential,

    [string]$GuestUserName = '',

    [switch]$RemoveCredentialAfterUse,

    [string]$GuestRepositoryPath = 'C:\multiterm-benchmark',

    [string]$GuestNodePath = 'C:\multiterm-node',

    [string]$GuestBrowsersPath = 'C:\multiterm-browsers',

    [ValidateSet('node', 'installed', 'both')]
    [string]$Mode = 'both',

    [ValidateRange(1, 25)]
    [int]$Repeats = 5,

    [string]$Label = 'vm-baseline',

    [switch]$Renderer,

    [switch]$StartVM,

    [switch]$SkipSync,

    [switch]$SkipDependencies,

    [switch]$CleanGuest,

    [string]$CheckpointName = '',

    [string]$GuestSwitchName = 'Default Switch',

    [long]$FixedMemoryBytes = 0,

    [int]$SettleSeconds = 180,

    [switch]$KeepGuestState,

    [string]$LogPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Windows PowerShell 5.1 launched from a PowerShell 7 terminal inherits pwsh's
# PSModulePath, finds PowerShell 7's Microsoft.PowerShell.Security first, and
# fails to load it ("The member AuditToString is already present") - which makes
# Get-Credential silently cease to exist. Restore the machine path so 5.1 only
# ever sees its own modules.
if ($PSVersionTable.PSVersion.Major -le 5) {
    $machineModulePath = [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')
    if ($machineModulePath) { $env:PSModulePath = $machineModulePath }
}

$transcriptStarted = $false
if ($LogPath) {
    $logDirectory = Split-Path -Parent $LogPath
    if ($logDirectory -and -not (Test-Path -LiteralPath $logDirectory)) {
        New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    }
    try {
        # Credential prompts are separate dialogs, so nothing secret reaches the transcript.
        Start-Transcript -LiteralPath $LogPath -Force | Out-Null
        $transcriptStarted = $true
    }
    catch {
        # A transcript is a convenience for watching the run from elsewhere. It is
        # never worth aborting a benchmark over - most often another window still
        # holds the same file open.
        Write-Warning ("Could not start the transcript at " + $LogPath + ": " + $_.Exception.Message)
    }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$resultsRoot = Join-Path $repositoryRoot 'benchmarks\bridge-throughput\results'

# Rebuilt in the guest, machine-specific, or far too large to ship over VMBus.
$excludedDirectories = @(
    'node_modules'
    '.git'
    'coverage'
    'test-results'
    'Output'
    'target'
    'bin'
    'obj'
    'publish'
    '.vs'
    'generated'
    'playwright-report'
)

# electron is only ever loaded by src/main.js, and @anthropic-ai/claude-agent-sdk is a
# lazy dynamic import the benchmark never reaches. Together they are 624 MB of the
# 1,119 MB tree, so shipping them would more than double the transfer for nothing.
$excludedDependencies = @(
    'electron'
    '@anthropic-ai'
)

# Hyper-V names the checkpoint it takes on VM start with this prefix. It is not
# a deliberate restore point, so it is never a candidate when one is not named.
$automaticCheckpointPrefix = 'Automatic Checkpoint'

function Write-Step {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host ("[vm-benchmark] " + (Get-Date -Format 'HH:mm:ss') + " " + $Message)
}

function Assert-Elevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Hyper-V management requires an elevated session. Re-run this script from an elevated PowerShell.'
    }
}

function Resolve-BenchmarkVM {
    param([string]$RequestedName)

    if ($RequestedName) {
        return Get-VM -Name $RequestedName
    }

    $machines = @(Get-VM)
    if ($machines.Count -eq 0) {
        throw 'No Hyper-V virtual machines were found on this host.'
    }
    if ($machines.Count -gt 1) {
        throw ("This host has " + $machines.Count + " virtual machines (" + ($machines.Name -join ', ') + "). Pass -VMName to choose one.")
    }
    return $machines[0]
}

function Get-VMBenchmarkContext {
    param([Parameter(Mandatory = $true)]$VirtualMachine)

    $processors = Get-VMProcessor -VM $VirtualMachine
    $memory = Get-VMMemory -VM $VirtualMachine
    $adapters = @(Get-VMNetworkAdapter -VM $VirtualMachine)
    return [pscustomobject]@{
        Name = $VirtualMachine.Name
        State = $VirtualMachine.State.ToString()
        Generation = $VirtualMachine.Generation
        ProcessorCount = $processors.Count
        DynamicMemoryEnabled = $memory.DynamicMemoryEnabled
        StartupMemoryBytes = $memory.Startup
        AssignedMemoryBytes = $VirtualMachine.MemoryAssigned
        SwitchNames = ((@($adapters | ForEach-Object { $_.SwitchName })) -join ',')
    }
}

function Wait-VMPowerShellDirect {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][System.Management.Automation.PSCredential]$GuestCredential,
        [int]$TimeoutSeconds = 600
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastError = ''
    $reported = $false
    while ((Get-Date) -lt $deadline) {
        try {
            return New-PSSession -VMName $Name -Credential $GuestCredential -ErrorAction Stop
        }
        catch {
            $lastError = $_.Exception.Message
            # Retrying a rejected logon just burns the timeout and hides the cause.
            if ($lastError -match 'credential|logon|password|user name|username|Access is denied') {
                $hint = "Try the local-account form '.\<user>' (or '<GUESTCOMPUTERNAME>\<user>'). A Microsoft-account login usually needs its local user name here."
                throw ("The guest rejected the credentials: " + $lastError + " " + $hint)
            }
            if (-not $reported) {
                Write-Step ("  still waiting; last error: " + $lastError)
                $reported = $true
            }
            Start-Sleep -Seconds 5
        }
    }
    throw ("Could not open a PowerShell Direct session to '" + $Name + "' within " + $TimeoutSeconds + "s. Last error: " + $lastError)
}

function New-PayloadArchive {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [string[]]$ExcludedNames = @(),
        [string[]]$ExcludedPaths = @()
    )

    $staging = Join-Path ([IO.Path]::GetTempPath()) ('mtb-' + [Guid]::NewGuid().ToString('N'))
    $archive = $staging + '.zip'
    New-Item -ItemType Directory -Path $staging -Force | Out-Null

    $arguments = @($SourceRoot, $staging, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1')
    if ($ExcludedNames.Count -gt 0 -or $ExcludedPaths.Count -gt 0) {
        $arguments += '/XD'
        $arguments += $ExcludedNames
        $arguments += $ExcludedPaths
    }
    & robocopy.exe @arguments | Out-Null
    # Robocopy uses exit codes 0-7 for success variants; 8 and above are failures.
    if ($LASTEXITCODE -ge 8) {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
        throw ("Staging " + $SourceRoot + " failed (robocopy exit code " + $LASTEXITCODE + ").")
    }

    # ZipFile rather than Compress-Archive: the dependency tree is ~12,000 files
    # and Compress-Archive is orders of magnitude slower on trees that size.
    [IO.Compression.ZipFile]::CreateFromDirectory($staging, $archive, [IO.Compression.CompressionLevel]::Fastest, $false)
    Remove-Item -LiteralPath $staging -Recurse -Force
    return $archive
}

function Resolve-RestoreCheckpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$RequestedCheckpoint
    )

    $checkpoints = @(Get-VMSnapshot -VMName $Name -ErrorAction SilentlyContinue)
    if ($checkpoints.Count -eq 0) {
        Write-Warning ("VM '" + $Name + "' has no checkpoints, so the guest cannot be reset. Leaving it as it is.")
        return $null
    }

    if ($RequestedCheckpoint) {
        $match = @($checkpoints | Where-Object { $_.Name -eq $RequestedCheckpoint })
        if ($match.Count -ne 1) {
            throw ("Checkpoint '" + $RequestedCheckpoint + "' was not found. Available: " + (($checkpoints.Name) -join '; '))
        }
        return $match[0]
    }

    $deliberate = @($checkpoints | Where-Object { -not $_.Name.StartsWith($automaticCheckpointPrefix) })
    if ($deliberate.Count -eq 1) {
        return $deliberate[0]
    }

    # Restoring discards everything since the checkpoint, so ambiguity is never
    # resolved by guessing.
    $available = ($checkpoints.Name) -join '; '
    Write-Warning ("Cannot choose a checkpoint for '" + $Name + "' automatically: " + $deliberate.Count + " candidates (" + $available + "). Pass -CheckpointName. Leaving the guest as it is.")
    return $null
}

function Wait-GuestIdle {
    param(
        [Parameter(Mandatory = $true)]$Session,
        [int]$TimeoutSeconds
    )

    if ($TimeoutSeconds -le 0) { return }

    # Pinning memory means discarding saved state, which turns a warm resume into
    # a cold boot. Measuring while Windows is still running Defender, Search
    # indexing and first-logon work produced 44-96% run-to-run spread, against a
    # 10% gate. Wait for the guest to actually go quiet first.
    Write-Step ("Waiting up to " + $TimeoutSeconds + "s for the guest to go idle.")
    $settled = Invoke-Command -Session $Session -ArgumentList $TimeoutSeconds -ScriptBlock {
        param([int]$Budget)
        $deadline = (Get-Date).AddSeconds($Budget)
        $quietSamples = 0
        $lastTotal = $null
        while ((Get-Date) -lt $deadline) {
            # Measure-Object cannot sum a TimeSpan property, so read the milliseconds itself.
            $total = 0.0
            foreach ($process in @(Get-Process -ErrorAction SilentlyContinue)) {
                try { $total += $process.TotalProcessorTime.TotalMilliseconds } catch { }
            }
            if ($null -ne $lastTotal) {
                # Machine-wide CPU consumed over the sample, as a share of one second.
                $busy = ($total - $lastTotal) / 1000.0 / 2.0
                if ($busy -lt 0.15) { $quietSamples++ } else { $quietSamples = 0 }
                if ($quietSamples -ge 5) { return $true }
            }
            $lastTotal = $total
            Start-Sleep -Seconds 2
        }
        return $false
    }
    if ($settled) { Write-Step '  guest is idle.' }
    else { Write-Step '  guest did not settle within the budget; measuring anyway.' }
}

function Repair-GuestNetworkAdapter {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$SwitchName
    )

    # A checkpoint captures the VM's network configuration, so restoring one can
    # reinstate a binding to a switch that has since been deleted. The VM then
    # refuses to start at all with 0x800705AA "failed to allocate resources while
    # connecting to a virtual network".
    $switches = @(Get-VMSwitch)
    $existingNames = @($switches | ForEach-Object { $_.Name })

    foreach ($adapter in @(Get-VMNetworkAdapter -VMName $Name)) {
        if ($adapter.SwitchName -and ($existingNames -contains $adapter.SwitchName)) { continue }

        $stale = if ($adapter.SwitchName) { $adapter.SwitchName } else { '<disconnected>' }
        # Only ever an INTERNAL switch: attaching to an external switch rebinds a
        # physical adapter and can drop host connectivity.
        $target = @($switches | Where-Object { $_.Name -eq $SwitchName -and $_.SwitchType -eq 'Internal' })
        if ($target.Count -eq 1) {
            Write-Step ("Reconnecting '" + $adapter.Name + "' from '" + $stale + "' to '" + $SwitchName + "'.")
            Connect-VMNetworkAdapter -VMName $Name -Name $adapter.Name -SwitchName $SwitchName
        }
        else {
            Write-Step ("Disconnecting '" + $adapter.Name + "': '" + $stale + "' is gone and no internal switch named '" + $SwitchName + "' exists. The benchmark needs no guest network.")
            Disconnect-VMNetworkAdapter -VMName $Name -Name $adapter.Name
        }
    }
}

function Wait-VMStableState {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [int]$TimeoutSeconds = 120
    )

    $transitional = @('Starting', 'Stopping', 'Saving', 'Pausing', 'Resuming', 'Reset', 'RunningCritical')
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastState = ''
    $stableSamples = 0
    while ((Get-Date) -lt $deadline) {
        $state = (Get-VM -Name $Name).State.ToString()
        if ($transitional -contains $state) {
            $lastState = ''
            $stableSamples = 0
        }
        elseif ($state -eq $lastState) {
            $stableSamples += 1
            if ($stableSamples -ge 3) { return $state }
        }
        else {
            $lastState = $state
            $stableSamples = 1
        }
        Start-Sleep -Milliseconds 500
    }
    throw ("VM '" + $Name + "' did not settle in one state within " + $TimeoutSeconds + 's.')
}

function Wait-VMState {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$ExpectedState,
        [int]$TimeoutSeconds = 180
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $state = (Get-VM -Name $Name).State.ToString()
        if ($state -eq $ExpectedState) { return $state }
        Start-Sleep -Milliseconds 500
    }
    throw ("VM '" + $Name + "' did not reach " + $ExpectedState + " within " + $TimeoutSeconds + 's.')
}

function Restore-VMCheckpointAndWait {
    param(
        [Parameter(Mandatory = $true)]$Checkpoint,
        [int]$TimeoutSeconds = 180
    )

    $job = Restore-VMSnapshot -VMSnapshot $Checkpoint -Confirm:$false -AsJob
    try {
        $completed = Wait-Job -Job $job -Timeout $TimeoutSeconds
        if (-not $completed) {
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            throw ("Checkpoint restore did not complete within " + $TimeoutSeconds + 's.')
        }
        Receive-Job -Job $job -ErrorAction Stop | Out-Null
        if ($job.State -ne 'Completed') {
            throw ("Checkpoint restore ended in state " + $job.State + '.')
        }
    }
    finally {
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    }
    [void](Wait-VMState -Name $Checkpoint.VMName -ExpectedState $Checkpoint.State.ToString())
}

function Set-GuestFixedMemory {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [long]$Bytes
    )

    if ($Bytes -le 0) { return }

    # Dynamic memory reassigns the guest's RAM between runs - measured at 10 GB on
    # one run and 16 GB on the next - which moves cache and paging behaviour and
    # shows up as run-to-run spread in the headline metric. A checkpoint restore
    # reverts this setting, so it has to be reapplied every time.
    $state = Wait-VMStableState -Name $Name
    if ($state -eq 'Saved') {
        Write-Step 'Discarding saved state so the memory assignment can be changed.'
        Remove-VMSavedState -VMName $Name -Confirm:$false
        $state = Wait-VMState -Name $Name -ExpectedState 'Off'
    }
    elseif ($state -ne 'Off') {
        Write-Step 'Discarding saved state so the memory assignment can be changed.'
        Stop-VM -Name $Name -TurnOff -Force -Confirm:$false
        $state = Wait-VMState -Name $Name -ExpectedState 'Off'
    }
    if ($state -ne 'Off') {
        throw ("VM '" + $Name + "' must be Off before changing memory; current state is " + $state + '.')
    }

    $memory = Get-VMMemory -VMName $Name
    if ($memory.DynamicMemoryEnabled -or $memory.Startup -ne $Bytes) {
        Write-Step ("Pinning guest memory to " + [math]::Round($Bytes / 1GB, 1) + " GB (was " + [math]::Round($memory.Startup / 1GB, 1) + " GB, dynamic=" + $memory.DynamicMemoryEnabled + ").")
        Set-VMMemory -VMName $Name -DynamicMemoryEnabled $false -StartupBytes $Bytes
    }
}

function Reset-GuestToCheckpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$RequestedCheckpoint,
        [Parameter(Mandatory = $true)][string]$Reason
    )

    $checkpoint = Resolve-RestoreCheckpoint -Name $Name -RequestedCheckpoint $RequestedCheckpoint
    if (-not $checkpoint) { return $false }

    if ((Get-VM -Name $Name).State -ne 'Off') {
        # A hard power-off is correct here: the state is about to be discarded
        # anyway, and a graceful shutdown would only add a minute.
        Write-Step ("Powering off the guest before restoring (" + $Reason + ").")
        Stop-VM -Name $Name -TurnOff -Force -Confirm:$false
    }
    Write-Step ("Restoring the guest to checkpoint '" + $checkpoint.Name + "' (" + $Reason + ").")
    Restore-VMCheckpointAndWait -Checkpoint $checkpoint
    Repair-GuestNetworkAdapter -Name $Name -SwitchName $GuestSwitchName
    Set-GuestFixedMemory -Name $Name -Bytes $FixedMemoryBytes
    return $true
}

function Save-BenchmarkResults {
    param(
        [Parameter(Mandatory = $true)]$Session,
        [Parameter(Mandatory = $true)][string]$Repo,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)]$Context,
        [string]$ExpectedHostName = ''
    )

    if (-not (Test-Path -LiteralPath $Destination)) { New-Item -ItemType Directory -Path $Destination -Force | Out-Null }
    $guestResults = Invoke-Command -Session $Session -ArgumentList $Repo -ScriptBlock {
        param([string]$RepoPath)
        $folder = Join-Path $RepoPath 'benchmarks\bridge-throughput\results'
        if (-not (Test-Path -LiteralPath $folder)) { return @() }
        @(Get-ChildItem -LiteralPath $folder -Filter '*.json' | Select-Object -ExpandProperty FullName)
    }

    $saved = 0
    foreach ($guestFile in @($guestResults)) {
        $leaf = Split-Path -Leaf $guestFile
        $staged = Join-Path ([IO.Path]::GetTempPath()) ('mtb-result-' + [Guid]::NewGuid().ToString('N') + '.json')
        Copy-Item -LiteralPath $guestFile -Destination $staged -FromSession $Session -Force
        try {
            # A summary that was not produced by the guest is a host file that
            # travelled in with the payload. Recording it as a VM baseline would
            # be worse than recording nothing.
            if ($ExpectedHostName) {
                $summary = Get-Content -LiteralPath $staged -Raw | ConvertFrom-Json
                $recorded = ''
                if ($summary.PSObject.Properties['machine']) { $recorded = [string]$summary.machine.hostname }
                if ($recorded -ne $ExpectedHostName) {
                    Write-Warning ("Discarding '" + $leaf + "': it records machine '" + $recorded + "' but the guest is '" + $ExpectedHostName + "'.")
                    continue
                }
            }
            Copy-Item -LiteralPath $staged -Destination (Join-Path $Destination $leaf) -Force
            $saved += 1
        }
        finally {
            Remove-Item -LiteralPath $staged -Force -ErrorAction SilentlyContinue
        }
    }
    $Context | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $Destination 'vm-configuration.json') -Encoding ASCII
    return $saved
}

function Send-Payload {
    param(
        [Parameter(Mandatory = $true)]$Session,
        [Parameter(Mandatory = $true)][string]$Archive,
        [Parameter(Mandatory = $true)][string]$GuestTarget,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $megabytes = (Get-Item -LiteralPath $Archive).Length / 1MB
    Write-Step ("Sending " + $Description + " (" + [math]::Round($megabytes, 1) + " MB) over VMBus.")
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()

    $guestArchive = Invoke-Command -Session $Session -ScriptBlock {
        Join-Path $env:TEMP ('mtb-' + [Guid]::NewGuid().ToString('N') + '.zip')
    }
    Copy-Item -LiteralPath $Archive -Destination $guestArchive -ToSession $Session -Force
    $stopwatch.Stop()
    $seconds = [math]::Max($stopwatch.Elapsed.TotalSeconds, 0.001)
    Write-Step ("  transferred in " + [math]::Round($seconds, 1) + "s (" + [math]::Round($megabytes / $seconds, 1) + " MB/s); expanding.")

    Invoke-Command -Session $Session -ArgumentList $guestArchive, $GuestTarget -ScriptBlock {
        param([string]$GuestArchive, [string]$Target)
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        if (-not (Test-Path -LiteralPath $Target)) { New-Item -ItemType Directory -Path $Target -Force | Out-Null }
        # ExtractToDirectory refuses to overwrite, so stale content is cleared first.
        Get-ChildItem -LiteralPath $Target -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        [IO.Compression.ZipFile]::ExtractToDirectory($GuestArchive, $Target)
        Remove-Item -LiteralPath $GuestArchive -Force
    }
}

Assert-Elevated

if (-not $Credential) {
    if ($CredentialPath -and (Test-Path -LiteralPath $CredentialPath)) {
        # Import-Clixml only succeeds for the user and machine that exported it.
        $Credential = Import-Clixml -LiteralPath $CredentialPath
        if (-not ($Credential -is [System.Management.Automation.PSCredential])) {
            throw ("The file at " + $CredentialPath + " is not an exported PSCredential.")
        }
        Write-Step ("Using the stored credential for " + $Credential.UserName + ".")
    }
    else {
        # Pre-filling the user name means only the password has to be typed, and
        # removes the most common cause of rejection: the wrong account form.
        if ($GuestUserName) {
            $Credential = Get-Credential -Credential $GuestUserName
        }
        else {
            $Credential = Get-Credential -Message 'Guest Windows credentials for the benchmark VM'
        }
        if (-not $Credential) { throw 'No credential was supplied.' }
        if ($SaveCredential -and $CredentialPath) {
            # DPAPI, scoped to this user on this machine, so the file is useless
            # anywhere else.
            $Credential | Export-Clixml -LiteralPath $CredentialPath
            Write-Step ("Stored the credential at " + $CredentialPath + " so later runs do not prompt.")
        }
    }
}

$virtualMachine = Resolve-BenchmarkVM -RequestedName $VMName
Write-Step ("Selected VM '" + $virtualMachine.Name + "' (state " + $virtualMachine.State + ").")

# An interrupted run never reaches its post-run reset, so a guest that is already
# running may still hold that run's deployment, its bridge processes, and its
# warmed caches. Measuring on top of that is not a baseline.
$resetForCleanStart = $false
if (-not $KeepGuestState) {
    $resetForCleanStart = Reset-GuestToCheckpoint -Name $virtualMachine.Name -RequestedCheckpoint $CheckpointName -Reason 'clean start'
    $virtualMachine = Get-VM -Name $virtualMachine.Name
}
else {
    Write-Step 'Using the guest as it is (-KeepGuestState); results may not be comparable with a clean run.'
}

if ($virtualMachine.State -ne 'Running') {
    if (-not ($StartVM -or $resetForCleanStart)) {
        throw ("VM '" + $virtualMachine.Name + "' is " + $virtualMachine.State + ". Re-run with -StartVM to start it.")
    }
    Repair-GuestNetworkAdapter -Name $virtualMachine.Name -SwitchName $GuestSwitchName
    Set-GuestFixedMemory -Name $virtualMachine.Name -Bytes $FixedMemoryBytes
    Write-Step 'Starting the VM.'
    Start-VM -Name $virtualMachine.Name | Out-Null
    $virtualMachine = Get-VM -Name $virtualMachine.Name
}

$vmContext = Get-VMBenchmarkContext -VirtualMachine $virtualMachine
$vmContext | Add-Member -NotePropertyName SourceRevision -NotePropertyValue ''
$vmContext | Format-List | Out-String | Write-Host
if ($vmContext.DynamicMemoryEnabled) {
    Write-Warning 'Dynamic memory is enabled on this VM. Working-set numbers will move with the balloon driver; consider a fixed assignment before treating them as a baseline.'
}
if ($vmContext.ProcessorCount -lt 4) {
    Write-Warning ("This VM has " + $vmContext.ProcessorCount + " virtual processors. The benchmark runs a bridge, a shell, up to 8 clients and optionally a browser; fewer than 4 makes the harness itself the bottleneck.")
}

Write-Step 'Opening a PowerShell Direct session (waiting for the guest to finish booting).'
$session = $null
$guestModified = $false
$guestComputerName = ''
try {
    $session = Wait-VMPowerShellDirect -Name $virtualMachine.Name -GuestCredential $Credential
    $guestModified = $true

    $guestFacts = Invoke-Command -Session $session -ScriptBlock {
        [pscustomobject]@{
            ComputerName = $env:COMPUTERNAME
            Architecture = $env:PROCESSOR_ARCHITECTURE
            ProcessorCount = [int]$env:NUMBER_OF_PROCESSORS
            WindowsPowerShell = Test-Path (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe')
        }
    }
    Write-Step ("Guest " + $guestFacts.ComputerName + " (" + $guestFacts.Architecture + ", " + $guestFacts.ProcessorCount + " CPUs)")
    $guestComputerName = [string]$guestFacts.ComputerName

    if (-not $guestFacts.WindowsPowerShell) {
        throw 'The guest has no Windows PowerShell 5.1; the installed bridge cannot run there.'
    }
    if ($guestFacts.Architecture -ne $env:PROCESSOR_ARCHITECTURE) {
        throw ("Guest architecture " + $guestFacts.Architecture + " does not match the host's " + $env:PROCESSOR_ARCHITECTURE + "; the shipped Node and native modules would not load.")
    }

    if ($CleanGuest) {
        Write-Step 'Removing previously deployed guest folders.'
        Invoke-Command -Session $session -ArgumentList $GuestRepositoryPath, $GuestNodePath, $GuestBrowsersPath -ScriptBlock {
            param([string]$Repo, [string]$NodeDir, [string]$Browsers)
            foreach ($target in @($Repo, $NodeDir, $Browsers)) {
                if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
            }
        }
    }

    if (-not $SkipDependencies) {
        $nodeRoot = Split-Path -Parent (Get-Command node).Source
        Write-Step ("Packaging Node " + (& node --version) + " from " + $nodeRoot)
        $nodeArchive = New-PayloadArchive -SourceRoot $nodeRoot
        try {
            Send-Payload -Session $session -Archive $nodeArchive -GuestTarget $GuestNodePath -Description 'Node runtime'
        }
        finally {
            Remove-Item -LiteralPath $nodeArchive -Force -ErrorAction SilentlyContinue
        }
    }

    if (-not $SkipSync) {
        Write-Step 'Packaging the working tree.'
        # The host's own summaries must never travel into the guest: they would
        # be copied straight back out again and recorded as VM baselines.
        $repoArchive = New-PayloadArchive -SourceRoot $repositoryRoot -ExcludedNames $excludedDirectories -ExcludedPaths @($resultsRoot)
        try {
            $vmContext.SourceRevision = (Get-FileHash -LiteralPath $repoArchive -Algorithm SHA256).Hash.ToLowerInvariant()
            Send-Payload -Session $session -Archive $repoArchive -GuestTarget $GuestRepositoryPath -Description 'working tree'
        }
        finally {
            Remove-Item -LiteralPath $repoArchive -Force -ErrorAction SilentlyContinue
        }
    }

    if (-not $SkipDependencies) {
        $dependencyRoot = Join-Path $repositoryRoot 'node_modules'
        $excludedPaths = @($excludedDependencies | ForEach-Object { Join-Path $dependencyRoot $_ })
        Write-Step 'Packaging node_modules (without electron and the Claude SDK).'
        $dependencyArchive = New-PayloadArchive -SourceRoot $dependencyRoot -ExcludedPaths $excludedPaths
        try {
            Send-Payload -Session $session -Archive $dependencyArchive -GuestTarget (Join-Path $GuestRepositoryPath 'node_modules') -Description 'node_modules'
        }
        finally {
            Remove-Item -LiteralPath $dependencyArchive -Force -ErrorAction SilentlyContinue
        }
    }

    if ($Renderer -and -not $SkipDependencies) {
        $browserRoot = Join-Path $env:LOCALAPPDATA 'ms-playwright'
        $shells = @(Get-ChildItem -LiteralPath $browserRoot -Directory | Where-Object { $_.Name -like 'chromium_headless_shell-*' } | Sort-Object Name -Descending)
        if ($shells.Count -eq 0) {
            throw ("No chromium headless shell found under " + $browserRoot + "; run 'npx playwright install chromium' on the host first.")
        }
        # Only the headless shell plus winldd are needed: chromium.launch({headless:true})
        # resolves to chrome-headless-shell, and shipping every browser would be 1.8 GB.
        $browserStaging = Join-Path ([IO.Path]::GetTempPath()) ('mtb-browsers-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $browserStaging -Force | Out-Null
        try {
            Copy-Item -LiteralPath $shells[0].FullName -Destination $browserStaging -Recurse -Force
            foreach ($extra in @('winldd-1007')) {
                $extraPath = Join-Path $browserRoot $extra
                if (Test-Path -LiteralPath $extraPath) { Copy-Item -LiteralPath $extraPath -Destination $browserStaging -Recurse -Force }
            }
            Write-Step ("Packaging Playwright browser " + $shells[0].Name)
            $browserArchive = New-PayloadArchive -SourceRoot $browserStaging
            try {
                Send-Payload -Session $session -Archive $browserArchive -GuestTarget $GuestBrowsersPath -Description 'Playwright browser'
            }
            finally {
                Remove-Item -LiteralPath $browserArchive -Force -ErrorAction SilentlyContinue
            }
        }
        finally {
            Remove-Item -LiteralPath $browserStaging -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Step 'Verifying the guest deployment.'
    $verification = Invoke-Command -Session $session -ArgumentList $GuestRepositoryPath, $GuestNodePath, $GuestBrowsersPath -ScriptBlock {
        param([string]$Repo, [string]$NodeDir, [string]$Browsers)
        $env:PATH = $NodeDir + ';' + $env:PATH
        $env:PLAYWRIGHT_BROWSERS_PATH = $Browsers
        [pscustomobject]@{
            NodeVersion = (& node --version)
            HasServer = Test-Path (Join-Path $Repo 'src\server.js')
            HasBridgeScript = Test-Path (Join-Path $Repo 'Start-MultiTerm.ps1')
            HasPty = Test-Path (Join-Path $Repo 'node_modules\@homebridge\node-pty-prebuilt-multiarch')
            HasPlaywright = Test-Path (Join-Path $Repo 'node_modules\@playwright\test')
            BrowserFolders = ((@(Get-ChildItem -LiteralPath $Browsers -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)) -join ',')
        }
    }
    $verification | Format-List | Out-String | Write-Host
    if (-not $verification.NodeVersion) { throw 'Node did not run in the guest.' }
    if (-not $verification.HasPty) { throw 'node-pty is missing in the guest; the bridge cannot spawn a terminal.' }

    $modes = if ($Mode -eq 'both') { @('node', 'installed') } else { @($Mode) }
    $rendererEnabled = [bool]$Renderer
    $repeatText = $Repeats.ToString()
    $sourceRevision = [string]$vmContext.SourceRevision
    $sourceCommit = (& git -C $repositoryRoot rev-parse HEAD).Trim()
    Wait-GuestIdle -Session $session -TimeoutSeconds $SettleSeconds
    foreach ($bridgeMode in $modes) {
        Write-Step ("Running the " + $bridgeMode + " bridge scenarios in isolated processes.")
        # Using-scope rather than positional ArgumentList: a [bool] parameter did
        # not survive the remoting boundary, and positional binding fails in a way
        # that names the wrong parameter.
        Invoke-Command -Session $session -ScriptBlock {
            $env:PATH = $using:GuestNodePath + ';' + $env:PATH
            $env:PLAYWRIGHT_BROWSERS_PATH = $using:GuestBrowsersPath
            $env:MULTITERM_BENCHMARK_COMMIT = $using:sourceCommit
            $env:MULTITERM_BENCHMARK_SOURCE = $using:sourceRevision
            Set-Location -LiteralPath $using:GuestRepositoryPath
            $scenarios = @(
                @{ Name = 'clients-1'; Arguments = @('--clients', '1') },
                @{ Name = 'clients-2'; Arguments = @('--clients', '2') },
                @{ Name = 'clients-4'; Arguments = @('--clients', '4') },
                @{ Name = 'clients-8'; Arguments = @('--clients', '8') },
                @{ Name = 'slow-client'; Arguments = @('--clients', '4', '--slow-client') },
                @{ Name = 'idle-control'; Arguments = @('--clients', '4', '--idle') }
            )
            foreach ($scenario in $scenarios) {
                $arguments = @('benchmarks/bridge-throughput/run.js', '--mode', $using:bridgeMode, '--repeats', $using:repeatText, '--label', $using:Label)
                $arguments += $scenario.Arguments
                if ($using:rendererEnabled) { $arguments += '--renderer' }
                & node @arguments
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning ('The ' + $using:bridgeMode + '/' + $scenario.Name + ' process exited with code ' + $LASTEXITCODE + '; continuing with the next isolated scenario.')
                }
            }
        }
    }
}
finally {
    # Results are rescued in the finally block so a run that fails part way still
    # yields whatever summaries it produced, and always BEFORE any restore.
    $destination = Join-Path $resultsRoot 'vm'
    if ($session) {
        try {
            Write-Step 'Copying results back to the host.'
            $copied = Save-BenchmarkResults -Session $session -Repo $GuestRepositoryPath -Destination $destination -Context $vmContext -ExpectedHostName $guestComputerName
            Write-Step ("Copied " + $copied + " summaries into " + $destination)
        }
        catch {
            Write-Warning ("Could not copy results back: " + $_.Exception.Message)
        }
        Remove-PSSession -Session $session
        $session = $null
    }

    if ($guestModified -and -not $KeepGuestState) {
        if (Reset-GuestToCheckpoint -Name $virtualMachine.Name -RequestedCheckpoint $CheckpointName -Reason 'run finished') {
            Write-Step ("Guest reset. VM state is now " + (Get-VM -Name $virtualMachine.Name).State + ".")
        }
    }
    elseif ($KeepGuestState) {
        Write-Step 'Leaving the guest as it is (-KeepGuestState).'
    }

    if ($RemoveCredentialAfterUse -and $CredentialPath -and (Test-Path -LiteralPath $CredentialPath)) {
        Remove-Item -LiteralPath $CredentialPath -Force
        Write-Step 'Removed the stored credential file.'
    }
    Write-Step 'Done.'
    if ($transcriptStarted) { Stop-Transcript | Out-Null }
}
