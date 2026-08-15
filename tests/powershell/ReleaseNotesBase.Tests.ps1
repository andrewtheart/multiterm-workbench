<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

<#
    build-installer.ps1 is a script, not a module, so dot-sourcing it would run
    a release. These tests lift the pure functions out of its syntax tree and
    evaluate just those, which keeps the real script as the single source of
    truth without executing any of its side effects.
#>

$script:BuildInstallerPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..\scripts\build-installer.ps1")).Path

function Import-BuildInstallerFunction {
    param([string[]]$Name)

    $ast = [System.Management.Automation.Language.Parser]::ParseFile($script:BuildInstallerPath, [ref]$null, [ref]$null)
    $definitions = $ast.FindAll(
        { $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)

    foreach ($wanted in $Name) {
        $definition = $definitions | Where-Object { $_.Name -eq $wanted } | Select-Object -First 1
        if (-not $definition) { throw "build-installer.ps1 no longer defines $wanted." }
        Set-Item -Path "function:script:$wanted" -Value ([scriptblock]::Create($definition.Body.Extent.Text.Trim('{', '}')))
    }
}

Import-BuildInstallerFunction -Name @(
    "Write-Step", "Invoke-Native", "Get-NativeOutput", "Get-NativeExit", "ConvertTo-NativeText",
    "ConvertTo-AbsolutePath", "Add-TemporaryReleaseExcludes", "Remove-TemporaryReleaseExcludes",
    "Get-PreviousPublishedReleaseTag", "Save-PendingChangesForRelease", "Restore-PendingChangesForRelease"
)

Describe "pending release change stash" {
    BeforeEach {
        $root = Join-Path $TestDrive ([Guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $root -Force | Out-Null
        & git -C $root init --quiet
        & git -C $root config user.email "release-test@example.com"
        & git -C $root config user.name "Release Test"
        Set-Content -LiteralPath (Join-Path $root "staged.txt") -Value "base staged" -Encoding Ascii
        Set-Content -LiteralPath (Join-Path $root "unstaged.txt") -Value "base unstaged" -Encoding Ascii
        & git -C $root add -- staged.txt unstaged.txt
        & git -C $root commit --quiet -m "base"
    }

    It "restores staged, unstaged, and untracked work exactly" {
        Set-Content -LiteralPath (Join-Path $root "staged.txt") -Value "pending staged" -Encoding Ascii
        & git -C $root add -- staged.txt
        Set-Content -LiteralPath (Join-Path $root "unstaged.txt") -Value "pending unstaged" -Encoding Ascii
        Set-Content -LiteralPath (Join-Path $root "untracked.txt") -Value "pending untracked" -Encoding Ascii
        $before = (@(& git -C $root status --porcelain=v1 --untracked-files=all) -join "`n")

        $result = @(Save-PendingChangesForRelease -RepositoryRoot $root)
        $result.Count | Should Be 1
        $record = $result[0]
        $record.Commit | Should Not BeNullOrEmpty
        @(& git -C $root status --porcelain=v1 --untracked-files=all).Count | Should Be 0

        Restore-PendingChangesForRelease -RepositoryRoot $root -StashRecord $record
        $after = (@(& git -C $root status --porcelain=v1 --untracked-files=all) -join "`n")
        $after | Should Be $before
        @(& git -C $root stash list).Count | Should Be 0
    }

    It "drops only the stash created for the release" {
        Set-Content -LiteralPath (Join-Path $root "unstaged.txt") -Value "older pending work" -Encoding Ascii
        & git -C $root stash push --quiet --message "pre-existing stash"
        Set-Content -LiteralPath (Join-Path $root "staged.txt") -Value "current pending work" -Encoding Ascii

        $result = @(Save-PendingChangesForRelease -RepositoryRoot $root)
        $result.Count | Should Be 1
        $record = $result[0]
        Restore-PendingChangesForRelease -RepositoryRoot $root -StashRecord $record

        $stashes = @(& git -C $root stash list)
        $stashes.Count | Should Be 1
        $stashes[0] | Should Match "pre-existing stash"
        (Get-Content -LiteralPath (Join-Path $root "staged.txt") -Raw).Trim() | Should Be "current pending work"
    }

    It "keeps generated files hidden when their pending ignore rule is stashed" {
        Set-Content -LiteralPath (Join-Path $root ".gitignore") -Value "generated/" -Encoding Ascii
        New-Item -ItemType Directory -Path (Join-Path $root "generated") -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $root "generated\baseline.json") -Value '{}' -Encoding Ascii
        Set-Content -LiteralPath (Join-Path $root "staged.txt") -Value "pending work" -Encoding Ascii
        $before = (@(& git -C $root status --porcelain=v1 --untracked-files=all) -join "`n")
        $before | Should Not Match "baseline.json"

        $result = @(Save-PendingChangesForRelease -RepositoryRoot $root)
        $result.Count | Should Be 1
        $record = $result[0]
        @(& git -C $root status --porcelain=v1 --untracked-files=all).Count | Should Be 0
        (Get-Content -LiteralPath $record.ExcludePath -Raw) | Should Match "generated/baseline.json"

        Restore-PendingChangesForRelease -RepositoryRoot $root -StashRecord $record
        $after = (@(& git -C $root status --porcelain=v1 --untracked-files=all) -join "`n")
        $after | Should Be $before
        (Get-Content -LiteralPath (Join-Path $root "generated\baseline.json") -Raw).Trim() | Should Be '{}'
        (Get-Content -LiteralPath $record.ExcludePath -Raw) | Should Not Match $record.Marker
    }

    It "does nothing when the repository has no pending changes" {
        $record = Save-PendingChangesForRelease -RepositoryRoot $root
        $record | Should BeNullOrEmpty
        @(& git -C $root stash list).Count | Should Be 0
    }
}

Describe "native output normalization" {
    It "treats a native command with no output as empty text" {
        ConvertTo-NativeText -Output $null | Should Be ""
        ConvertTo-NativeText -Output @("first", $null, "second") | Should Be ("first" + [Environment]::NewLine + "second")
    }
}

Describe "release notes comparison base" {
    BeforeEach {
        $root = Join-Path $TestDrive ([Guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $root -Force | Out-Null
    }

    function New-FakeGh {
        <#
            A stand-in for the gh executable that prints a canned payload and
            exits with a chosen code, so the release lookup can be exercised
            without GitHub.
        #>
        param([string]$Directory, [string]$Payload, [int]$ExitCode = 0)

        $payloadPath = Join-Path $Directory "gh-payload.json"
        [System.IO.File]::WriteAllText($payloadPath, $Payload)
        $ghPath = Join-Path $Directory "gh.cmd"
        $lines = @("@echo off")
        if ($Payload.Length -gt 0) { $lines += "type `"$payloadPath`"" }
        $lines += "exit /b $ExitCode"
        Set-Content -LiteralPath $ghPath -Value ($lines -join "`r`n") -Encoding Ascii
        return $ghPath
    }

    It "returns the most recently published release" {
        $payload = '[{"isDraft":false,"publishedAt":"2026-08-08T19:08:41Z","tagName":"v0.1.84"},' +
                   '{"isDraft":false,"publishedAt":"2026-08-08T04:11:41Z","tagName":"v0.1.83"},' +
                   '{"isDraft":false,"publishedAt":"2026-08-08T00:13:18Z","tagName":"v0.1.82"}]'
        $gh = New-FakeGh -Directory $root -Payload $payload

        # Regression guard: Windows PowerShell 5.1 writes a deserialised JSON
        # array as one pipeline object, so an inline @(... | ConvertFrom-Json)
        # collapsed every release into a single element, no release matched the
        # filter, and the notes silently covered the repository's whole history.
        Get-PreviousPublishedReleaseTag -GhPath $gh -RepositorySlug "owner/repo" | Should Be "v0.1.84"
    }

    It "picks by publication date rather than list order" {
        $payload = '[{"isDraft":false,"publishedAt":"2026-01-01T00:00:00Z","tagName":"v1.0.0"},' +
                   '{"isDraft":false,"publishedAt":"2026-06-01T00:00:00Z","tagName":"v2.0.0"}]'
        $gh = New-FakeGh -Directory $root -Payload $payload

        Get-PreviousPublishedReleaseTag -GhPath $gh -RepositorySlug "owner/repo" | Should Be "v2.0.0"
    }

    It "ignores drafts and releases that were never published" {
        $payload = '[{"isDraft":true,"publishedAt":"2026-08-09T00:00:00Z","tagName":"v0.1.85"},' +
                   '{"isDraft":false,"publishedAt":"","tagName":"v0.1.845"},' +
                   '{"isDraft":false,"publishedAt":"2026-08-08T19:08:41Z","tagName":"v0.1.84"}]'
        $gh = New-FakeGh -Directory $root -Payload $payload

        Get-PreviousPublishedReleaseTag -GhPath $gh -RepositorySlug "owner/repo" | Should Be "v0.1.84"
    }

    It "ignores the release currently being published" {
        $payload = '[{"isDraft":false,"publishedAt":"2026-08-09T00:00:00Z","tagName":"v0.1.85"},' +
                   '{"isDraft":false,"publishedAt":"2026-08-08T19:08:41Z","tagName":"v0.1.84"}]'
        $gh = New-FakeGh -Directory $root -Payload $payload

        Get-PreviousPublishedReleaseTag -GhPath $gh -RepositorySlug "owner/repo" -CurrentTag "v0.1.85" |
            Should Be "v0.1.84"
    }

    It "handles a single release, which JSON reports as a one-element array" {
        $payload = '[{"isDraft":false,"publishedAt":"2026-08-08T19:08:41Z","tagName":"v0.1.84"}]'
        $gh = New-FakeGh -Directory $root -Payload $payload

        Get-PreviousPublishedReleaseTag -GhPath $gh -RepositorySlug "owner/repo" | Should Be "v0.1.84"
    }

    It "reports no previous release when the repository has none" {
        $gh = New-FakeGh -Directory $root -Payload "[]"

        Get-PreviousPublishedReleaseTag -GhPath $gh -RepositorySlug "owner/repo" | Should BeNullOrEmpty
    }

    It "fails loudly when gh cannot answer, instead of assuming there is no release" {
        # A transient gh failure must never be mistaken for "no previous
        # release": that would publish notes covering the entire history.
        $gh = New-FakeGh -Directory $root -Payload "" -ExitCode 1

        $threw = $false
        try { Get-PreviousPublishedReleaseTag -GhPath $gh -RepositorySlug "owner/repo" | Out-Null }
        catch { $threw = $true }

        $threw | Should Be $true
    }
}
