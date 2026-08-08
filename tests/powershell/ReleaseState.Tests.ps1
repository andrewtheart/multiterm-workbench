<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

. (Join-Path $PSScriptRoot "..\..\scripts\release-state.ps1")

Describe "release checkpoint state" {
    BeforeEach {
        $root = Join-Path $TestDrive ([Guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $root -Force | Out-Null
        $statePath = Get-ReleaseStatePath -RepositoryRoot $root
    }

    Context "persistence" {
        It "round-trips a state through disk" {
            $state = New-ReleaseState -Version "1.2.3" -Tag "v1.2.3" -Options @{ push = $true }
            Set-ReleaseStageComplete -State $state -Name "installer" -Fingerprint "abc" -Data @{ sha256 = "deadbeef" } -Path $statePath

            $loaded = Read-ReleaseState -Path $statePath
            $loaded.version | Should Be "1.2.3"
            $loaded.tag | Should Be "v1.2.3"
            $loaded.options.push | Should Be $true
            (Test-ReleaseStageComplete -State $loaded -Name "installer" -Fingerprint "abc") | Should Be $true
            (Get-ReleaseStageData -State $loaded -Name "installer").sha256 | Should Be "deadbeef"
        }

        It "returns nothing when no state has been written" {
            Read-ReleaseState -Path $statePath | Should BeNullOrEmpty
        }

        It "discards a truncated state instead of throwing" {
            # A crash mid-write is exactly the failure this module exists to survive.
            Set-Content -LiteralPath $statePath -Value '{"schemaVersion":1,"version":"1.0.0","ta'
            $result = Read-ReleaseState -Path $statePath -WarningAction SilentlyContinue
            $result | Should BeNullOrEmpty
        }

        It "discards a state written by a different schema version" {
            Set-Content -LiteralPath $statePath -Value '{"schemaVersion":99,"version":"1.0.0","tag":"v1.0.0","stages":{}}'
            $result = Read-ReleaseState -Path $statePath -WarningAction SilentlyContinue
            $result | Should BeNullOrEmpty
        }

        It "leaves no temporary file behind after a save" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            Save-ReleaseState -State $state -Path $statePath
            Save-ReleaseState -State $state -Path $statePath
            (Test-Path -LiteralPath "$statePath.tmp") | Should Be $false
        }

        It "removes both the state and any stray temporary file" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            Save-ReleaseState -State $state -Path $statePath
            Set-Content -LiteralPath "$statePath.tmp" -Value "stale"
            Remove-ReleaseState -Path $statePath
            (Test-Path -LiteralPath $statePath) | Should Be $false
            (Test-Path -LiteralPath "$statePath.tmp") | Should Be $false
        }
    }

    Context "stage completion" {
        It "reports an unrecorded stage as incomplete" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            (Test-ReleaseStageComplete -State $state -Name "installer" -Fingerprint "abc") | Should Be $false
        }

        It "reports a stage as incomplete when its inputs changed" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            Set-ReleaseStageComplete -State $state -Name "installer" -Fingerprint "abc"
            (Test-ReleaseStageComplete -State $state -Name "installer" -Fingerprint "xyz") | Should Be $false
        }

        It "matches fingerprint-free stages only against other fingerprint-free checks" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            Set-ReleaseStageComplete -State $state -Name "push"
            (Test-ReleaseStageComplete -State $state -Name "push") | Should Be $true
            (Test-ReleaseStageComplete -State $state -Name "push" -Fingerprint "abc") | Should Be $false
        }

        It "forgets a stage that was reset" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            Set-ReleaseStageComplete -State $state -Name "versionBump" -Path $statePath
            Reset-ReleaseStage -State $state -Name "versionBump" -Path $statePath
            (Test-ReleaseStageComplete -State $state -Name "versionBump") | Should Be $false
            (Test-ReleaseStageComplete -State (Read-ReleaseState -Path $statePath) -Name "versionBump") | Should Be $false
        }
    }

    Context "file hashing" {
        It "matches the known SHA-256 of a file without depending on Get-FileHash" {
            $file = Join-Path $root "hash.txt"
            [System.IO.File]::WriteAllText($file, "abc")
            # SHA-256 of the ASCII bytes "abc".
            Get-ReleaseFileHash -Path $file |
                Should Be "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        }

        It "reads a file that another process still holds open" {
            $file = Join-Path $root "locked.txt"
            [System.IO.File]::WriteAllText($file, "abc")
            $handle = [System.IO.File]::Open($file, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            try {
                Get-ReleaseFileHash -Path $file |
                    Should Be "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
            }
            finally {
                $handle.Dispose()
            }
        }
    }

    Context "input fingerprints" {
        BeforeEach {
            $sourceDirectory = Join-Path $root "src"
            New-Item -ItemType Directory -Path $sourceDirectory -Force | Out-Null
            Set-Content -LiteralPath (Join-Path $sourceDirectory "a.txt") -Value "one"
        }

        It "is stable across calls when nothing changed" {
            $first = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("src")
            $second = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("src")
            $first | Should Be $second
        }

        It "changes when a tracked file changes" {
            $before = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("src")
            Set-Content -LiteralPath (Join-Path $sourceDirectory "a.txt") -Value "two"
            $after = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("src")
            $after | Should Not Be $before
        }

        It "changes when a tracked file is added" {
            $before = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("src")
            Set-Content -LiteralPath (Join-Path $sourceDirectory "b.txt") -Value "three"
            $after = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("src")
            $after | Should Not Be $before
        }

        It "changes when an extra value such as the release version changes" {
            $before = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("src") -Extra @("1.0.0")
            $after = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("src") -Extra @("1.0.1")
            $after | Should Not Be $before
        }

        It "ignores build output so a stage does not invalidate itself by running" {
            $before = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("src")
            New-Item -ItemType Directory -Path (Join-Path $sourceDirectory "obj") -Force | Out-Null
            Set-Content -LiteralPath (Join-Path $sourceDirectory "obj\generated.dll") -Value "binary"
            New-Item -ItemType Directory -Path (Join-Path $sourceDirectory "publish") -Force | Out-Null
            Set-Content -LiteralPath (Join-Path $sourceDirectory "publish\app.exe") -Value "binary"
            $after = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("src")
            $after | Should Be $before
        }

        It "distinguishes a missing input from an empty one" {
            $missing = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("does-not-exist")
            New-Item -ItemType Directory -Path (Join-Path $root "does-not-exist") -Force | Out-Null
            $empty = Get-ReleaseInputFingerprint -RepositoryRoot $root -Paths @("does-not-exist")
            $empty | Should Not Be $missing
        }
    }

    Context "stage execution" {
        It "runs a stage that has never completed" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            $script:ran = 0
            Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                -Fingerprint "abc" -Action { $script:ran++ } | Out-Null
            $script:ran | Should Be 1
            (Test-ReleaseStageComplete -State $state -Name "build" -Fingerprint "abc") | Should Be $true
        }

        It "skips a completed stage and returns what it recorded" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            $script:ran = 0
            Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                -Fingerprint "abc" -Action { $script:ran++; return @{ artifact = "one.exe" } } | Out-Null
            $data = Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                -Fingerprint "abc" -Action { $script:ran++; return @{ artifact = "two.exe" } }
            $script:ran | Should Be 1
            $data.artifact | Should Be "one.exe"
        }

        It "re-runs a completed stage when its inputs changed" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            $script:ran = 0
            Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                -Fingerprint "abc" -Action { $script:ran++ } | Out-Null
            Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                -Fingerprint "xyz" -Action { $script:ran++ } | Out-Null
            $script:ran | Should Be 2
        }

        It "re-runs a completed stage when its output no longer validates" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            $script:ran = 0
            $script:outputExists = $true
            Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                -Fingerprint "abc" -Validate { $script:outputExists } -Action { $script:ran++ } | Out-Null
            $script:outputExists = $false
            Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                -Fingerprint "abc" -Validate { $script:outputExists } -Action { $script:ran++ } | Out-Null
            $script:ran | Should Be 2
        }

        It "re-runs a completed stage when its validator throws" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            $script:ran = 0
            $script:shouldThrow = $false
            Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                -Fingerprint "abc" -Validate { if ($script:shouldThrow) { throw "gone" } ; $true } -Action { $script:ran++ } | Out-Null
            $script:shouldThrow = $true
            Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                -Fingerprint "abc" -Validate { if ($script:shouldThrow) { throw "gone" } ; $true } `
                -Action { $script:ran++ } -WarningAction SilentlyContinue | Out-Null
            $script:ran | Should Be 2
        }

        It "does not record a stage whose action failed, so the next run retries it" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            # Asserted with try/catch rather than `Should Throw`, which is broken
            # in Pester 3.4 when it runs under PowerShell 7.
            $threw = $false
            try {
                Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                    -Fingerprint "abc" -Action { throw "ISCC failed" } | Out-Null
            }
            catch { $threw = $true }

            $threw | Should Be $true
            (Test-ReleaseStageComplete -State $state -Name "build" -Fingerprint "abc") | Should Be $false
            Read-ReleaseState -Path $statePath | Should BeNullOrEmpty
        }

        It "survives a process restart between stages" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            $script:ran = 0
            Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                -Fingerprint "abc" -Action { $script:ran++ } | Out-Null

            # A later run loads the checkpoint from disk rather than from memory.
            $resumed = Read-ReleaseState -Path $statePath
            Invoke-ReleaseStage -State $resumed -StatePath $statePath -Name "build" -Description "the build" `
                -Fingerprint "abc" -Action { $script:ran++ } | Out-Null
            $script:ran | Should Be 1
        }

        It "rejects a stage action that returns something other than a hashtable" {
            $state = New-ReleaseState -Version "1.0.0" -Tag "v1.0.0"
            $threw = $false
            try {
                Invoke-ReleaseStage -State $state -StatePath $statePath -Name "build" -Description "the build" `
                    -Action { return "not a hashtable" } | Out-Null
            }
            catch { $threw = $true }

            $threw | Should Be $true
        }
    }

    Context "summary" {
        It "lists completed stages" {
            $state = New-ReleaseState -Version "1.2.3" -Tag "v1.2.3"
            Set-ReleaseStageComplete -State $state -Name "installer"
            $summary = Format-ReleaseStateSummary -State $state
            $summary | Should Match "v1\.2\.3"
            $summary | Should Match "installer"
        }

        It "says so when nothing has completed yet" {
            $state = New-ReleaseState -Version "1.2.3" -Tag "v1.2.3"
            Format-ReleaseStateSummary -State $state | Should Match "none completed"
        }
    }
}
