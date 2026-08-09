#Requires -Version 5.1
<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

<#
.SYNOPSIS
    Crash-safe checkpoint state for the release/rebuild pipeline.

.DESCRIPTION
    build-installer.ps1 runs a long pipeline whose stages range from expensive
    (three dotnet builds, four extension builds, an Inno Setup compile) to
    irreversible (version bump, commits, push, GitHub release creation). Any
    stage can fail: a compiler error, a locked file, an expired gh token, a
    dropped network connection, or the operator pressing Ctrl+C.

    Without a checkpoint the next run repeats everything, and repeating is not
    merely slow -- it is wrong. Re-running an auto-bump after a failed publish
    burns a second version number and orphans the first, so v0.1.85 is built,
    committed and never released while v0.1.86 takes its place.

    This module records what has already succeeded so the next run picks up
    where the failed one stopped. It is dot-sourced rather than imported so it
    stays usable from PowerShell 5.1 without a module manifest.

    Two independent mechanisms decide whether a stage may be skipped:

    - a fingerprint of the stage's declared inputs, so a stage is re-run
      whenever anything it consumes has changed since it last succeeded, and
    - a caller-supplied validator, so a stage is re-run when its output has
      since been deleted, replaced or invalidated.

    Both must agree before a stage is skipped. Anything unprovable re-runs.
#>

Set-StrictMode -Version Latest

$script:ReleaseStateSchemaVersion = 1
$script:ReleaseStateFileName = '.release-state.json'

# Directories that hold build output rather than build input. Fingerprinting a
# stage's own output would change the fingerprint every time the stage ran,
# which would make the stage permanently un-skippable.
$script:ReleaseFingerprintExcludedDirectories = @('bin', 'obj', 'publish', 'node_modules', 'generated', '.git')

function Get-ReleaseStatePath {
    param([Parameter(Mandatory)][string]$RepositoryRoot)
    return (Join-Path $RepositoryRoot $script:ReleaseStateFileName)
}

function ConvertTo-ReleaseStateHashtable {
    <#
        ConvertFrom-Json returns PSCustomObject on Windows PowerShell 5.1, which
        has no -AsHashtable. Convert recursively so callers can mutate state and
        so Set-StrictMode's missing-property errors become simple key lookups.
    #>
    param($InputObject)

    if ($null -eq $InputObject) { return $null }
    if ($InputObject -is [System.Collections.IDictionary]) {
        $copy = @{}
        foreach ($key in @($InputObject.Keys)) {
            $copy[[string]$key] = ConvertTo-ReleaseStateHashtable -InputObject $InputObject[$key]
        }
        return $copy
    }
    if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
        $copy = @{}
        foreach ($property in $InputObject.PSObject.Properties) {
            $copy[$property.Name] = ConvertTo-ReleaseStateHashtable -InputObject $property.Value
        }
        return $copy
    }
    if ($InputObject -is [string]) { return $InputObject }
    if ($InputObject -is [System.Collections.IEnumerable]) {
        return @(foreach ($item in $InputObject) { ConvertTo-ReleaseStateHashtable -InputObject $item })
    }
    return $InputObject
}

function New-ReleaseState {
    param(
        [Parameter(Mandatory)][string]$Version,
        [Parameter(Mandatory)][string]$Tag,
        [hashtable]$Options = @{}
    )

    return @{
        schemaVersion = $script:ReleaseStateSchemaVersion
        runId         = [guid]::NewGuid().ToString('N')
        startedAt     = (Get-Date).ToUniversalTime().ToString('o')
        updatedAt     = (Get-Date).ToUniversalTime().ToString('o')
        version       = $Version
        tag           = $Tag
        options       = $Options
        stages        = @{}
    }
}

function Read-ReleaseState {
    <#
        Returns $null when there is no usable state. A corrupt or truncated file
        is a recoverable condition -- a crash during the previous write is
        exactly the kind of failure this module exists to survive -- so it is
        reported and discarded rather than thrown, and the caller starts fresh.
    #>
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }

    try {
        $raw = [System.IO.File]::ReadAllText($Path)
        if ([string]::IsNullOrWhiteSpace($raw)) { throw 'the file is empty' }
        $state = ConvertTo-ReleaseStateHashtable -InputObject ($raw | ConvertFrom-Json)
    }
    catch {
        Write-Warning "Ignoring unreadable release state at $Path ($($_.Exception.Message)). Starting a fresh run."
        return $null
    }

    if (-not ($state -is [hashtable])) {
        Write-Warning "Ignoring release state at $Path because it is not an object. Starting a fresh run."
        return $null
    }
    if (-not $state.ContainsKey('schemaVersion') -or [int]$state.schemaVersion -ne $script:ReleaseStateSchemaVersion) {
        Write-Warning "Ignoring release state at $Path written by a different script version. Starting a fresh run."
        return $null
    }
    foreach ($required in @('version', 'tag', 'stages')) {
        if (-not $state.ContainsKey($required) -or $null -eq $state[$required]) {
            Write-Warning "Ignoring release state at $Path because it is missing '$required'. Starting a fresh run."
            return $null
        }
    }
    if (-not ($state.stages -is [hashtable])) { $state.stages = @{} }
    return $state
}

function Save-ReleaseState {
    <#
        Written through a temporary file so an interrupted write can never leave
        a half-serialized state behind. File.Replace is atomic on NTFS; the
        Move-Item fallback covers the first write, when no target exists yet.
    #>
    param(
        [Parameter(Mandatory)][hashtable]$State,
        [Parameter(Mandatory)][string]$Path
    )

    $State.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    $json = $State | ConvertTo-Json -Depth 12
    $temporaryPath = "$Path.tmp"
    [System.IO.File]::WriteAllText($temporaryPath, $json, [System.Text.UTF8Encoding]::new($false))

    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        # [NullString]::Value is required here: PowerShell marshals a bare $null
        # into an empty string for .NET string parameters, and File.Replace
        # rejects an empty backup path.
        [System.IO.File]::Replace($temporaryPath, $Path, [NullString]::Value)
    }
    else {
        Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
    }
}

function Remove-ReleaseState {
    param([Parameter(Mandatory)][string]$Path)
    Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath "$Path.tmp" -Force -ErrorAction SilentlyContinue
}

function Get-ReleaseStageRecord {
    param(
        [Parameter(Mandatory)][hashtable]$State,
        [Parameter(Mandatory)][string]$Name
    )

    if (-not $State.ContainsKey('stages') -or -not ($State.stages -is [hashtable])) { return $null }
    if (-not $State.stages.ContainsKey($Name)) { return $null }
    $record = $State.stages[$Name]
    if (-not ($record -is [hashtable])) { return $null }
    return $record
}

function Get-ReleaseStageData {
    <#
        Stage payload (commit shas, cached release notes, asset digests) recorded
        when the stage completed, so a resumed run reuses the exact values the
        failed run produced instead of recomputing them.
    #>
    param(
        [Parameter(Mandatory)][hashtable]$State,
        [Parameter(Mandatory)][string]$Name
    )

    $record = Get-ReleaseStageRecord -State $State -Name $Name
    if ($null -eq $record) { return $null }
    if (-not $record.ContainsKey('data')) { return $null }
    return $record.data
}

function Test-ReleaseStageComplete {
    param(
        [Parameter(Mandatory)][hashtable]$State,
        [Parameter(Mandatory)][string]$Name,
        [string]$Fingerprint
    )

    $record = Get-ReleaseStageRecord -State $State -Name $Name
    if ($null -eq $record) { return $false }
    if (-not $record.ContainsKey('status') -or [string]$record.status -ne 'done') { return $false }

    $recorded = if ($record.ContainsKey('fingerprint')) { [string]$record.fingerprint } else { '' }
    if ([string]::IsNullOrEmpty($Fingerprint)) { return [string]::IsNullOrEmpty($recorded) }
    return $recorded -eq $Fingerprint
}

function Set-ReleaseStageComplete {
    param(
        [Parameter(Mandatory)][hashtable]$State,
        [Parameter(Mandatory)][string]$Name,
        [string]$Fingerprint,
        [hashtable]$Data,
        [string]$Path
    )

    if (-not $State.ContainsKey('stages') -or -not ($State.stages -is [hashtable])) { $State.stages = @{} }
    $record = @{
        status      = 'done'
        completedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    if ($Fingerprint) { $record.fingerprint = $Fingerprint }
    if ($Data) { $record.data = $Data }
    $State.stages[$Name] = $record

    if ($Path) { Save-ReleaseState -State $State -Path $Path }
}

function Reset-ReleaseStage {
    <#
        Drops a completion record so the stage runs again. Used when a later
        stage discovers that an earlier one's assumptions no longer hold.
    #>
    param(
        [Parameter(Mandatory)][hashtable]$State,
        [Parameter(Mandatory)][string]$Name,
        [string]$Path
    )

    if ($State.ContainsKey('stages') -and ($State.stages -is [hashtable]) -and $State.stages.ContainsKey($Name)) {
        $State.stages.Remove($Name)
        if ($Path) { Save-ReleaseState -State $State -Path $Path }
    }
}

function Get-ReleaseFileHash {
    <#
        SHA-256 of a file, computed through .NET rather than Get-FileHash.

        Get-FileHash lives in Microsoft.PowerShell.Utility and is resolved by
        module auto-loading. When Windows PowerShell 5.1 is launched from a
        PowerShell 7 session (which npm scripts and terminal integrations do
        routinely) it inherits PSModulePath with PowerShell 7's module
        directories first, auto-loads the incompatible 7.x Utility module, and
        Get-FileHash disappears with a CommandNotFoundException. Hashing
        directly has no such dependency.
    #>
    param(
        [Parameter(Mandatory)][string]$Path
    )

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        try {
            return [System.BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
        }
        finally {
            $stream.Dispose()
        }
    }
    finally {
        $sha256.Dispose()
    }
}

function Get-ReleaseInputFingerprint {
    <#
        A stable digest of everything a stage consumes: the contents of the
        declared files and directories plus any extra scalars the caller folds
        in (typically the release version, which changes the extension and
        installer outputs without changing a single source file).

        A path that does not exist contributes a distinct "missing" marker, so
        deleting an input invalidates the stage instead of silently matching.
    #>
    param(
        [Parameter(Mandatory)][string]$RepositoryRoot,
        [string[]]$Paths = @(),
        [string[]]$Extra = @()
    )

    $builder = [System.Text.StringBuilder]::new()
    foreach ($value in @($Extra)) { [void]$builder.AppendLine("extra`t$value") }

    foreach ($relative in @($Paths | Sort-Object -Unique)) {
        $full = Join-Path $RepositoryRoot $relative
        if (Test-Path -LiteralPath $full -PathType Container) {
            $files = @(
                Get-ChildItem -LiteralPath $full -Recurse -File -Force -ErrorAction SilentlyContinue |
                    Where-Object {
                        $segments = $_.FullName.Substring($RepositoryRoot.Length).Split([char]'\', [char]'/')
                        -not ($segments | Where-Object { $script:ReleaseFingerprintExcludedDirectories -contains $_ })
                    } |
                    Sort-Object -Property FullName
            )
            if ($files.Count -eq 0) { [void]$builder.AppendLine("empty`t$relative") }
            foreach ($file in $files) {
                $key = $file.FullName.Substring($RepositoryRoot.Length).TrimStart([char]'\', [char]'/').Replace('\', '/')
                [void]$builder.AppendLine("$key`t$(Get-ReleaseFileHash -Path $file.FullName)")
            }
        }
        elseif (Test-Path -LiteralPath $full -PathType Leaf) {
            $key = $relative.Replace('\', '/')
            [void]$builder.AppendLine("$key`t$(Get-ReleaseFileHash -Path $full)")
        }
        else {
            [void]$builder.AppendLine("missing`t$($relative.Replace('\', '/'))")
        }
    }

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($builder.ToString())
        return [System.BitConverter]::ToString($sha256.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha256.Dispose()
    }
}

function Invoke-ReleaseStage {
    <#
        Runs $Action unless the stage already succeeded with the same inputs and
        its output still validates. Returns the stage's recorded data so callers
        can reuse values produced by an earlier attempt.

        $Validate must be side-effect free: it runs on the resume path to prove
        the previous run's output survived. When it returns false the stage is
        re-run, which is always the safe direction.

        Stages shell out to compilers and packagers, so most of what $Action
        emits is tool chatter rather than a result. That chatter is written
        through to the host as it arrives, keeping a long build observable, and
        only a hashtable is treated as the stage's recorded data.
    #>
    param(
        [Parameter(Mandatory)][hashtable]$State,
        [Parameter(Mandatory)][string]$StatePath,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Description,
        [string]$Fingerprint,
        [scriptblock]$Validate,
        [Parameter(Mandatory)][scriptblock]$Action,
        [scriptblock]$OnSkip
    )

    if (Test-ReleaseStageComplete -State $State -Name $Name -Fingerprint $Fingerprint) {
        $valid = $true
        if ($Validate) {
            try { $valid = [bool](& $Validate) }
            catch {
                Write-Warning "Re-running '$Description' because its checkpoint could not be validated: $($_.Exception.Message)"
                $valid = $false
            }
        }
        if ($valid) {
            Write-Host "==> Resuming: $Description already completed; skipping." -ForegroundColor DarkGray
            if ($OnSkip) { & $OnSkip }
            return (Get-ReleaseStageData -State $State -Name $Name)
        }
        Reset-ReleaseStage -State $State -Name $Name -Path $StatePath
    }

    $produced = [System.Collections.ArrayList]::new()
    & $Action | ForEach-Object {
        if ($_ -is [hashtable]) { [void]$produced.Add($_) }
        else { $_ | Out-Host }
    }
    if ($produced.Count -gt 1) {
        throw "Release stage '$Name' produced $($produced.Count) result hashtables; a stage must produce at most one."
    }
    $data = if ($produced.Count -eq 1) { $produced[0] } else { $null }
    Set-ReleaseStageComplete -State $State -Name $Name -Fingerprint $Fingerprint -Data $data -Path $StatePath
    return $data
}

function Format-ReleaseStateSummary {
    param([Parameter(Mandatory)][hashtable]$State)

    $lines = @(
        "Release run $($State.runId)",
        "  target      : $($State.tag) (version $($State.version))",
        "  started     : $($State.startedAt)",
        "  last update : $($State.updatedAt)"
    )
    $stageNames = @($State.stages.Keys | Sort-Object)
    if ($stageNames.Count -eq 0) {
        $lines += '  stages      : none completed'
    }
    else {
        $lines += '  completed   :'
        foreach ($name in $stageNames) {
            $record = $State.stages[$name]
            $completedAt = if (($record -is [hashtable]) -and $record.ContainsKey('completedAt')) { $record.completedAt } else { 'unknown' }
            $lines += "    - $name ($completedAt)"
        }
    }
    return ($lines -join [Environment]::NewLine)
}
