<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

$scriptPath = Join-Path $PSScriptRoot "..\..\installer\vscode-integration\Install-VSCodeIntegration.ps1"

Describe "Install-VSCodeIntegration" {
    BeforeEach {
        $root = Join-Path $TestDrive ([Guid]::NewGuid().ToString("N"))
        $appPath = Join-Path $root "app"
        $integrationPath = Join-Path $appPath "VSCode"
        $binPath = Join-Path $root "bin"
        $localAppData = Join-Path $root "local"
        $codeLog = Join-Path $root "code-arguments.txt"
        New-Item -ItemType Directory -Path $integrationPath, $binPath, $localAppData -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $integrationPath "multiterm-test.vsix") -Value "vsix"
        @"
@echo off
echo %*>>"$codeLog"
exit /b %MT_CODE_EXIT%
"@ | Set-Content -LiteralPath (Join-Path $binPath "code.cmd") -Encoding Ascii

        $savedEnvironment = @{
            LOCALAPPDATA = $env:LOCALAPPDATA
            PATH = $env:PATH
            ProgramFiles = $env:ProgramFiles
            ProgramFilesX86 = ${env:ProgramFiles(x86)}
            MT_CODE_EXIT = $env:MT_CODE_EXIT
        }
        $env:LOCALAPPDATA = $localAppData
        $env:PATH = $binPath
        $env:ProgramFiles = Join-Path $root "program-files"
        ${env:ProgramFiles(x86)} = Join-Path $root "program-files-x86"
        $env:MT_CODE_EXIT = "0"
    }

    AfterEach {
        $env:LOCALAPPDATA = $savedEnvironment.LOCALAPPDATA
        $env:PATH = $savedEnvironment.PATH
        $env:ProgramFiles = $savedEnvironment.ProgramFiles
        ${env:ProgramFiles(x86)} = $savedEnvironment.ProgramFilesX86
        $env:MT_CODE_EXIT = $savedEnvironment.MT_CODE_EXIT
    }

    It "installs one VSIX and records a stopped editor" {
        & $scriptPath -AppPath $appPath -EditorProcessName "MultiTermNoSuchEditor"

        $LASTEXITCODE | Should Be 0
        (Get-Content -LiteralPath $codeLog -Raw) | Should Match "--install-extension"
        $state = Get-Content -LiteralPath (Join-Path $localAppData "MultiTerm\Integrations\VSCodeIntegrationInstalled.json") -Raw | ConvertFrom-Json
        $state.extensionId | Should Be "andrewtheart.multiterm-workbench"
        $state.editorWasRunning | Should Be $false
        $state.package | Should Be "multiterm-test.vsix"
    }

    It "records a running editor without stopping it" {
        $processName = "MultiTermCodeProbe" + [Guid]::NewGuid().ToString("N").Substring(0, 8)
        $probePath = Join-Path $root ($processName + ".exe")
        Copy-Item -LiteralPath (Join-Path $env:WINDIR "System32\ping.exe") -Destination $probePath
        $probe = Start-Process -FilePath $probePath -ArgumentList @("-n", "30", "127.0.0.1") -WindowStyle Hidden -PassThru
        try {
            $deadline = [DateTime]::UtcNow.AddSeconds(5)
            do {
                $running = $null -ne (Get-Process -Name $processName -ErrorAction SilentlyContinue | Select-Object -First 1)
                if (-not $running) { [Threading.Thread]::Sleep(50) }
            } while (-not $running -and [DateTime]::UtcNow -lt $deadline)
            $running | Should Be $true

            & $scriptPath -AppPath $appPath -EditorProcessName $processName

            $state = Get-Content -LiteralPath (Join-Path $localAppData "MultiTerm\Integrations\VSCodeIntegrationInstalled.json") -Raw | ConvertFrom-Json
            $state.editorWasRunning | Should Be $true
            $probe.HasExited | Should Be $false
        } finally {
            if (-not $probe.HasExited) { Stop-Process -Id $probe.Id -Force }
        }
    }

    It "returns without invoking Code when uninstall state is absent" {
        & $scriptPath -AppPath $appPath -Uninstall -EditorProcessName "MultiTermNoSuchEditor"

        Test-Path -LiteralPath $codeLog | Should Be $false
    }

    It "uninstalls a recorded extension and removes current and legacy state" {
        $statePath = Join-Path $localAppData "MultiTerm\Integrations\VSCodeIntegrationInstalled.json"
        $legacyStatePath = Join-Path $integrationPath "VSCodeIntegrationInstalled.json"
        New-Item -ItemType Directory -Path (Split-Path $statePath -Parent) -Force | Out-Null
        Set-Content -LiteralPath $statePath -Value "{}"
        Set-Content -LiteralPath $legacyStatePath -Value "{}"

        & $scriptPath -AppPath $appPath -Uninstall -EditorProcessName "MultiTermNoSuchEditor"

        (Get-Content -LiteralPath $codeLog -Raw) | Should Match "--uninstall-extension andrewtheart.multiterm-workbench"
        Test-Path -LiteralPath $statePath | Should Be $false
        Test-Path -LiteralPath $legacyStatePath | Should Be $false
    }

    It "propagates an uninstall command failure" {
        $statePath = Join-Path $localAppData "MultiTerm\Integrations\VSCodeIntegrationInstalled.json"
        New-Item -ItemType Directory -Path (Split-Path $statePath -Parent) -Force | Out-Null
        Set-Content -LiteralPath $statePath -Value "{}"
        $env:MT_CODE_EXIT = "7"

        { & $scriptPath -AppPath $appPath -Uninstall -EditorProcessName "MultiTermNoSuchEditor" } |
            Should Throw "VS Code could not uninstall andrewtheart.multiterm-workbench (exit code 7)."
    }

    It "rejects a missing VSIX package" {
        Remove-Item -LiteralPath (Join-Path $integrationPath "multiterm-test.vsix")
        { & $scriptPath -AppPath $appPath -EditorProcessName "MultiTermNoSuchEditor" } |
            Should Throw "found none"
    }

    It "installs the newest package when an upgrade left older ones behind" {
        # Package names carry the version, so upgrades accumulate them in {app}\VSCode.
        Set-Content -LiteralPath (Join-Path $integrationPath "multiterm-old.vsix") -Value "old"
        $newest = Join-Path $integrationPath "multiterm-new.vsix"
        Set-Content -LiteralPath $newest -Value "new"
        (Get-Item -LiteralPath $newest).LastWriteTime = (Get-Date).AddMinutes(10)

        & $scriptPath -AppPath $appPath -EditorProcessName "MultiTermNoSuchEditor"

        $LASTEXITCODE | Should Be 0
        (Get-Content -LiteralPath $codeLog -Raw) | Should Match "multiterm-new.vsix"
        $state = Get-Content -LiteralPath (Join-Path $localAppData "MultiTerm\Integrations\VSCodeIntegrationInstalled.json") -Raw | ConvertFrom-Json
        $state.package | Should Be "multiterm-new.vsix"
    }

    It "propagates an install command failure" {
        $env:MT_CODE_EXIT = "9"

        { & $scriptPath -AppPath $appPath -EditorProcessName "MultiTermNoSuchEditor" } |
            Should Throw "VS Code could not install multiterm-test.vsix (exit code 9)."
    }

    It "skips without failing when no VS Code command can be found" {
        # The installer task ships enabled, so this helper runs on machines that
        # never asked for it. A non-zero exit here aborts the whole installation.
        Remove-Item -LiteralPath (Join-Path $binPath "code.cmd")

        & $scriptPath -AppPath $appPath -EditorProcessName "MultiTermNoSuchEditor"

        $LASTEXITCODE | Should Be 0
        Test-Path -LiteralPath $codeLog | Should Be $false
        Test-Path -LiteralPath (Join-Path $localAppData "MultiTerm\Integrations\VSCodeIntegrationInstalled.json") | Should Be $false
    }

    It "clears stale state when uninstalling after VS Code is gone" {
        $statePath = Join-Path $localAppData "MultiTerm\Integrations\VSCodeIntegrationInstalled.json"
        $legacyStatePath = Join-Path $integrationPath "VSCodeIntegrationInstalled.json"
        New-Item -ItemType Directory -Path (Split-Path $statePath -Parent) -Force | Out-Null
        Set-Content -LiteralPath $statePath -Value "{}"
        Set-Content -LiteralPath $legacyStatePath -Value "{}"
        Remove-Item -LiteralPath (Join-Path $binPath "code.cmd")

        & $scriptPath -AppPath $appPath -Uninstall -EditorProcessName "MultiTermNoSuchEditor"

        $LASTEXITCODE | Should Be 0
        Test-Path -LiteralPath $statePath | Should Be $false
        Test-Path -LiteralPath $legacyStatePath | Should Be $false
    }
}