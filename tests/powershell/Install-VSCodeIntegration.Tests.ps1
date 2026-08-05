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

    It "rejects zero and multiple VSIX packages" {
        Remove-Item -LiteralPath (Join-Path $integrationPath "multiterm-test.vsix")
        { & $scriptPath -AppPath $appPath -EditorProcessName "MultiTermNoSuchEditor" } |
            Should Throw "Expected exactly one MultiTerm VS Code package"

        Set-Content -LiteralPath (Join-Path $integrationPath "first.vsix") -Value "one"
        Set-Content -LiteralPath (Join-Path $integrationPath "second.vsix") -Value "two"
        { & $scriptPath -AppPath $appPath -EditorProcessName "MultiTermNoSuchEditor" } |
            Should Throw "found 2"
    }

    It "propagates an install command failure" {
        $env:MT_CODE_EXIT = "9"

        { & $scriptPath -AppPath $appPath -EditorProcessName "MultiTermNoSuchEditor" } |
            Should Throw "VS Code could not install multiterm-test.vsix (exit code 9)."
    }

    It "reports when no VS Code command can be found" {
        Remove-Item -LiteralPath (Join-Path $binPath "code.cmd")

        { & $scriptPath -AppPath $appPath -EditorProcessName "MultiTermNoSuchEditor" } |
            Should Throw "Visual Studio Code was not found"
    }
}