; MultiTerm Workbench
; Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
;
; This program is free software: you can redistribute it and/or modify
; it under the terms of the GNU General Public License as published by
; the Free Software Foundation, either version 3 of the License, or
; (at your option) any later version.
;
; This program is distributed in the hope that it will be useful,
; but WITHOUT ANY WARRANTY; without even the implied warranty of
; MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
; GNU General Public License for more details.
;
; You should have received a copy of the GNU General Public License
; along with this program.  If not, see <https://www.gnu.org/licenses/>.

; Inno Setup script for MultiTerm Workbench
; Packages the self-contained PowerShell bridge (no Node.js runtime required).
; Build:  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\MultiTerm.iss
; Output: installer\Output\MultiTerm-Setup-<version>.exe

#define MyAppName "MultiTerm Workbench"
#define MyAppVersion "0.1.104"
#define MyAppPublisher "MultiTerm Workbench"
#define MyAppURL "https://github.com/andrewtheart/multiterm-workbench"
#define MyScriptFile "Start-MultiTerm.ps1"
; AppUserModelID: must match the value stamped on the browser "--app" window by
; Start-MultiTerm.ps1 so the taskbar shows the MultiTerm icon (not the browser's)
; and the window pins as a standalone app.
#define MyAppAUMID "MultiTerm.Workbench"
; Repository root, relative to this .iss file (which lives in installer\).
#define RepoRoot ".."
#include "explorer-integration\generated\ExplorerCertificateCommands.iss"

[Setup]
; Unique application identifier (do not reuse for other products).
AppId={{2A8AE21C-CA11-4B78-8E6E-348A0EBB0E83}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableWelcomePage=no
DisableReadyPage=no
UninstallDisplayIcon={app}\MultiTerm.ico
UninstallDisplayName={#MyAppName}
; Per-user install by default (no UAC); user may elect a machine-wide install.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; Single installer covers x86, x64, and ARM64. The terminal bridge and web assets
; are architecture-neutral; native Prompt Library and Explorer files are selected
; for the target architecture.
; The optional bundled Copilot SDK runtime is x64 and degrades to unavailable on
; unsupported hosts without affecting terminal operation. ArchitecturesAllowed is
; intentionally omitted; x64compatible installs x64/ARM64 into 64-bit Program Files.
ArchitecturesInstallIn64BitMode=x64compatible or arm64
OutputDir=Output
OutputBaseFilename=MultiTerm-Setup-{#MyAppVersion}
SetupIconFile=MultiTerm.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern dark includetitlebar hidebevels
WizardSizePercent=125
WizardKeepAspectRatio=yes
WizardImageFile=assets\wizard-dark.png
WizardSmallImageFile=assets\wizard-small-dark.png
LicenseFile={#RepoRoot}\LICENSE
InfoBeforeFile={#RepoRoot}\THIRD-PARTY-NOTICES.txt
; Windows 10 version 1809 (build 17763) is the minimum: MultiTerm's pseudo-terminals
; rely on the ConPTY APIs (CreatePseudoConsole) that were introduced in that build.
MinVersion=10.0.17763

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "watchdog"; Description: "Install the MultiTerm watchdog (recommended; monitors bridges and asks before closing orphaned terminal sessions)"; GroupDescription: "Background monitoring:"
Name: "explorercontext"; Description: "Add 'Open in MultiTerm' to File Explorer folder context menus (Windows 11 requires administrator approval)"; GroupDescription: "File Explorer integration:"
Name: "vscodeextension"; Description: "Visual Studio Code extension (experimental) - adds 'Open in MultiTerm' to Explorer menus"; GroupDescription: "Editor extensions (experimental; clear a box to skip or remove one):"
Name: "visualstudioextension"; Description: "Visual Studio extension (experimental) - adds 'Open in MultiTerm' to Solution Explorer and Tools"; GroupDescription: "Editor extensions (experimental; clear a box to skip or remove one):"
Name: "systempath"; Description: "Add MultiTerm to the system PATH (enables the 'multiterm' command)"; GroupDescription: "Command-line integration (machine-wide Program Files installs only):"; Check: IsProtectedSystemPathInstall

[InstallDelete]
; Package filenames carry the version, so an upgrade would otherwise leave the
; previous release's .vsix beside the new one and the helpers could not tell
; which package to install.
Type: files; Name: "{app}\VSCode\*.vsix"
Type: files; Name: "{app}\VisualStudio\*.vsix"

[Files]
Source: "{#RepoRoot}\{#MyScriptFile}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#RepoRoot}\Focus-BridgeTerminal.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#RepoRoot}\Install-CopilotCli.ps1"; DestDir: "{app}"; Flags: ignoreversion
; Setup extracts the current launcher before replacing files so upgrades can
; gracefully stop every running instance, including instances from older installs.
Source: "{#RepoRoot}\{#MyScriptFile}"; Flags: dontcopy
Source: "{#RepoRoot}\lib\terminal-gui\*.dll"; DestDir: "{app}\lib\terminal-gui"; Flags: ignoreversion
Source: "{#RepoRoot}\lib\terminal-gui\README.md"; DestDir: "{app}\lib\terminal-gui"; Flags: ignoreversion
Source: "{#RepoRoot}\lib\copilot-sdk-host\publish\*"; DestDir: "{app}\lib\copilot-sdk-host"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#RepoRoot}\lib\prompt-library-host\publish\arm64\MultiTerm.PromptLibraryHost.exe"; DestDir: "{app}\lib\prompt-library-host"; Flags: ignoreversion; Check: PreferArm64PromptLibraryFiles
Source: "{#RepoRoot}\lib\prompt-library-host\publish\arm64\MultiTerm.PromptLibraryHost.exe.config"; DestDir: "{app}\lib\prompt-library-host"; Flags: ignoreversion; Check: PreferArm64PromptLibraryFiles
Source: "{#RepoRoot}\lib\prompt-library-host\publish\arm64\sqlite3mc.dll"; DestDir: "{app}\lib\prompt-library-host"; Flags: ignoreversion; Check: PreferArm64PromptLibraryFiles
Source: "{#RepoRoot}\lib\prompt-library-host\publish\x64\MultiTerm.PromptLibraryHost.exe"; DestDir: "{app}\lib\prompt-library-host"; Flags: ignoreversion solidbreak; Check: PreferX64PromptLibraryFiles
Source: "{#RepoRoot}\lib\prompt-library-host\publish\x64\MultiTerm.PromptLibraryHost.exe.config"; DestDir: "{app}\lib\prompt-library-host"; Flags: ignoreversion; Check: PreferX64PromptLibraryFiles
Source: "{#RepoRoot}\lib\prompt-library-host\publish\x64\sqlite3mc.dll"; DestDir: "{app}\lib\prompt-library-host"; Flags: ignoreversion; Check: PreferX64PromptLibraryFiles
Source: "{#RepoRoot}\lib\prompt-library-host\publish\x86\MultiTerm.PromptLibraryHost.exe"; DestDir: "{app}\lib\prompt-library-host"; Flags: ignoreversion solidbreak; Check: PreferX86PromptLibraryFiles
Source: "{#RepoRoot}\lib\prompt-library-host\publish\x86\MultiTerm.PromptLibraryHost.exe.config"; DestDir: "{app}\lib\prompt-library-host"; Flags: ignoreversion; Check: PreferX86PromptLibraryFiles
Source: "{#RepoRoot}\lib\prompt-library-host\publish\x86\sqlite3mc.dll"; DestDir: "{app}\lib\prompt-library-host"; Flags: ignoreversion; Check: PreferX86PromptLibraryFiles
Source: "cli\multiterm.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "cli\Manage-SystemPath.ps1"; DestDir: "{app}\CLI"; Flags: ignoreversion
Source: "{#RepoRoot}\scripts\MultiTerm-Watchdog.ps1"; DestDir: "{app}\Watchdog"; Flags: ignoreversion
Source: "{#RepoRoot}\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#RepoRoot}\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#RepoRoot}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#RepoRoot}\THIRD-PARTY-NOTICES.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "MultiTerm.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "explorer-integration\Install-ExplorerIntegration.ps1"; DestDir: "{app}\Explorer"; Flags: ignoreversion
Source: "explorer-integration\generated\MultiTermExplorer.cer"; DestDir: "{app}\Explorer"; Flags: ignoreversion
Source: "explorer-integration\generated\packages\*.msix"; DestDir: "{app}\Explorer\Packages"; Flags: ignoreversion
Source: "explorer-integration\generated\bin\x86\*.dll"; DestDir: "{app}\Explorer\x86"; Flags: ignoreversion
Source: "explorer-integration\generated\bin\x86\*.exe"; DestDir: "{app}\Explorer\x86"; Flags: ignoreversion
Source: "explorer-integration\generated\bin\x64\*.dll"; DestDir: "{app}\Explorer\x64"; Flags: ignoreversion
Source: "explorer-integration\generated\bin\x64\*.exe"; DestDir: "{app}\Explorer\x64"; Flags: ignoreversion
Source: "explorer-integration\generated\bin\arm64\*.dll"; DestDir: "{app}\Explorer\arm64"; Flags: ignoreversion
Source: "explorer-integration\generated\bin\arm64\*.exe"; DestDir: "{app}\Explorer\arm64"; Flags: ignoreversion
Source: "vscode-integration\Install-VSCodeIntegration.ps1"; DestDir: "{app}\VSCode"; Flags: ignoreversion
Source: "vscode-integration\generated\*.vsix"; DestDir: "{app}\VSCode"; Flags: ignoreversion
Source: "visualstudio-integration\Install-VisualStudioIntegration.ps1"; DestDir: "{app}\VisualStudio"; Flags: ignoreversion
Source: "visualstudio-integration\generated\*.vsix"; DestDir: "{app}\VisualStudio"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\{#MyScriptFile}"" -ConsoleDashboard -NewInstance"; WorkingDir: "{app}"; IconFilename: "{app}\MultiTerm.ico"; AppUserModelID: "{#MyAppAUMID}"; Comment: "Start a new MultiTerm instance with its compact bridge control console"
Name: "{group}\Stop all {#MyAppName} instances"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\{#MyScriptFile}"" -Stop"; WorkingDir: "{app}"; IconFilename: "{app}\MultiTerm.ico"; Comment: "Shut down every MultiTerm Workbench instance and terminal session"
Name: "{group}\{#MyAppName} README"; Filename: "{app}\README.md"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\{#MyScriptFile}"" -ConsoleDashboard -NewInstance"; WorkingDir: "{app}"; IconFilename: "{app}\MultiTerm.ico"; AppUserModelID: "{#MyAppAUMID}"; Tasks: desktopicon
Name: "{userstartup}\MultiTerm Watchdog"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\Watchdog\MultiTerm-Watchdog.ps1"""; WorkingDir: "{app}\Watchdog"; IconFilename: "{app}\MultiTerm.ico"; Tasks: watchdog; Comment: "Monitor MultiTerm bridges and ask before closing orphaned terminal sessions"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\Watchdog\MultiTerm-Watchdog.ps1"" -Stop"; Flags: runhidden waituntilterminated; StatusMsg: "Refreshing the MultiTerm watchdog..."
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""{app}\Watchdog\MultiTerm-Watchdog.ps1"""; WorkingDir: "{app}\Watchdog"; Flags: runhidden nowait; Tasks: watchdog; StatusMsg: "Starting the MultiTerm watchdog..."
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\CLI\Manage-SystemPath.ps1"" -Action Install -AppPath ""{app}"""; Verb: "runas"; Flags: shellexec runhidden waituntilterminated; Tasks: systempath; Check: IsProtectedSystemPathInstall; StatusMsg: "Adding MultiTerm to the system PATH..."
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\CLI\Manage-SystemPath.ps1"" -Action Uninstall -AppPath ""{app}"""; Verb: "runas"; Flags: shellexec runhidden waituntilterminated; Check: ShouldRemoveSystemPath; StatusMsg: "Removing MultiTerm from the system PATH..."
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Explorer\Install-ExplorerIntegration.ps1"" -AppPath ""{app}"" -Uninstall"; Flags: runhidden waituntilterminated runasoriginaluser; Check: not WizardIsTaskSelected('explorercontext'); StatusMsg: "Removing MultiTerm from File Explorer..."
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {#ExplorerCertificateRemoveCommand}"; Verb: "runas"; Flags: shellexec runhidden waituntilterminated; Check: ShouldRemoveExplorerCertificate; MinVersion: 10.0.22000; StatusMsg: "Removing the MultiTerm Explorer package certificate..."
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Explorer\Install-ExplorerIntegration.ps1"" -AppPath ""{app}"" -FinalizeUninstall"; Flags: runhidden waituntilterminated runasoriginaluser; Check: not WizardIsTaskSelected('explorercontext')
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\{#MyScriptFile}"" -ConsoleDashboard -NewInstance"; WorkingDir: "{app}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\Watchdog\MultiTerm-Watchdog.ps1"" -Stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopMultiTermWatchdog"
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\CLI\Manage-SystemPath.ps1"" -Action Uninstall -AppPath ""{app}"""; Verb: "runas"; Flags: shellexec runhidden waituntilterminated; Check: ShouldUninstallSystemPath; RunOnceId: "RemoveMultiTermSystemPath"
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Explorer\Install-ExplorerIntegration.ps1"" -AppPath ""{app}"" -Uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveMultiTermExplorerIntegration"
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {#ExplorerCertificateRemoveCommand}"; Verb: "runas"; Flags: shellexec runhidden waituntilterminated; Check: ShouldRemoveExplorerCertificate; MinVersion: 10.0.22000; RunOnceId: "RemoveMultiTermExplorerCertificate"
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{app}\Explorer\Install-ExplorerIntegration.ps1"" -AppPath ""{app}"" -FinalizeUninstall"; Flags: runhidden waituntilterminated; RunOnceId: "FinalizeMultiTermExplorerIntegration"
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\VSCode\Install-VSCodeIntegration.ps1"" -AppPath ""{app}"" -Uninstall"; Flags: waituntilterminated; RunOnceId: "RemoveMultiTermVSCodeIntegration"
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\VisualStudio\Install-VisualStudioIntegration.ps1"" -AppPath ""{app}"" -Uninstall"; Flags: waituntilterminated; RunOnceId: "RemoveMultiTermVisualStudioIntegration"

[Code]
var
  AiProviderPage: TInputOptionWizardPage;
  CopilotCliDetected: Boolean;
  ClaudeCliDetected: Boolean;
  VSCodeReloadNotice: Boolean;
  VisualStudioRestartNotice: Boolean;
  EditorIntegrationProblem: String;
  ExplorerIntegrationProblem: String;

function PreferArm64PromptLibraryFiles: Boolean;
begin
  Result := IsArm64;
end;

function PreferX64PromptLibraryFiles: Boolean;
begin
  Result := not PreferArm64PromptLibraryFiles and IsX64Compatible;
end;

function PreferX86PromptLibraryFiles: Boolean;
begin
  Result := not PreferArm64PromptLibraryFiles and not PreferX64PromptLibraryFiles;
end;

function CommandIsAvailable(const CommandName: String): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(
    ExpandConstant('{sys}\where.exe'),
    CommandName,
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) and (ResultCode = 0);
end;

procedure InitializeWizard;
begin
  CopilotCliDetected := CommandIsAvailable('copilot');
  ClaudeCliDetected := CommandIsAvailable('claude');

  WizardForm.Caption := 'Install MultiTerm Workbench';
  WizardForm.WelcomeLabel1.Caption := 'MultiTerm Workbench';
  WizardForm.WelcomeLabel2.Caption :=
    'A focused terminal workspace for Windows.' + #13#10 + #13#10 +
    'Setup keeps every integration optional and clearly shows what will change before installation.';

  AiProviderPage := CreateInputOptionPage(
    wpSelectTasks,
    'AI assistant defaults',
    'Choose the provider MultiTerm should prefer on first launch.',
    'Setup checks only whether each interactive CLI is on PATH. After launch, MultiTerm verifies sign-in and asks separately about terminal titles and interactive sessions, with live model, context, and thinking-effort choices.',
    True,
    False
  );
  if CopilotCliDetected then
    AiProviderPage.Add('GitHub Copilot CLI (detected)')
  else
    AiProviderPage.Add('GitHub Copilot CLI (not detected)');
  if ClaudeCliDetected then
    AiProviderPage.Add('Claude Code CLI (detected)')
  else
    AiProviderPage.Add('Claude Code CLI (not detected)');
  AiProviderPage.Add('Disabled');
  AiProviderPage.CheckListBox.ItemEnabled[0] := CopilotCliDetected;
  AiProviderPage.CheckListBox.ItemEnabled[1] := ClaudeCliDetected;

  if CopilotCliDetected then
    AiProviderPage.SelectedValueIndex := 0
  else if ClaudeCliDetected then
    AiProviderPage.SelectedValueIndex := 1
  else
    AiProviderPage.SelectedValueIndex := 2;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpSelectTasks then
  begin
    WizardForm.PageNameLabel.Caption := 'Choose integrations';
    WizardForm.PageDescriptionLabel.Caption :=
      'Everything is enabled by default. Clear any you do not want - the editor extensions are experimental. Run Setup again to change these later.';
  end
  else if CurPageID = wpReady then
  begin
    WizardForm.PageNameLabel.Caption := 'Ready to install';
    WizardForm.PageDescriptionLabel.Caption :=
      'Review your choices. MultiTerm will be registered in Windows Installed Apps with its own uninstaller.';
  end
  else if CurPageID = wpFinished then
  begin
    if VSCodeReloadNotice then
      WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + #13#10 + #13#10 +
        'Visual Studio Code was running while its extension was updated. Use the Restart Extensions prompt, or run Developer: Reload Window in each window where you want the new version.';
    if VisualStudioRestartNotice then
      WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + #13#10 + #13#10 +
        'The Visual Studio extension is installed and will load the next time Visual Studio starts.';
    if EditorIntegrationProblem <> '' then
      WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + #13#10 +
        EditorIntegrationProblem;
    if ExplorerIntegrationProblem <> '' then
      WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + #13#10 +
        ExplorerIntegrationProblem;
  end;
end;

procedure InitializeUninstallProgressForm;
begin
  UninstallProgressForm.Caption := 'Remove MultiTerm Workbench';
  UninstallProgressForm.PageNameLabel.Caption := 'Removing MultiTerm Workbench';
  UninstallProgressForm.PageDescriptionLabel.Caption :=
    'Setup will remove shortcuts, editor extensions, and registered integrations.';
end;

function SelectedAiProvider: String;
begin
  case AiProviderPage.SelectedValueIndex of
    0: Result := 'copilot';
    1: Result := 'claude';
  else
    Result := 'none';
  end;
end;

procedure WriteAiProviderBootstrap;
var
  BootstrapDirectory: String;
  BootstrapPath: String;
  TemporaryPath: String;
  CopilotDetectedJson: String;
  ClaudeDetectedJson: String;
  Json: String;
begin
  BootstrapDirectory := ExpandConstant('{localappdata}\MultiTerm');
  BootstrapPath := AddBackslash(BootstrapDirectory) + 'ai-provider-bootstrap.json';
  TemporaryPath := BootstrapPath + '.tmp';
  ForceDirectories(BootstrapDirectory);
  if CopilotCliDetected then CopilotDetectedJson := 'true' else CopilotDetectedJson := 'false';
  if ClaudeCliDetected then ClaudeDetectedJson := 'true' else ClaudeDetectedJson := 'false';
  Json := '{"version":1,"provider":"' + SelectedAiProvider +
    '","detected":{"copilotCli":' + CopilotDetectedJson +
    ',"claudeCli":' + ClaudeDetectedJson + '}}';
  DeleteFile(TemporaryPath);
  if not SaveStringToFile(TemporaryPath, Json, False) then
  begin
    Log('Could not write the AI provider bootstrap file.');
    Exit;
  end;
  DeleteFile(BootstrapPath);
  if not RenameFile(TemporaryPath, BootstrapPath) then
  begin
    DeleteFile(TemporaryPath);
    Log('Could not finalize the AI provider bootstrap file.');
  end;
end;

function VSCodeIntegrationStateExists: Boolean;
begin
  Result :=
    FileExists(ExpandConstant('{localappdata}\MultiTerm\Integrations\VSCodeIntegrationInstalled.json')) or
    FileExists(ExpandConstant('{app}\VSCode\VSCodeIntegrationInstalled.json'));
end;

function VisualStudioIntegrationStateExists: Boolean;
begin
  Result :=
    FileExists(ExpandConstant('{localappdata}\MultiTerm\Integrations\VisualStudioIntegrationInstalled.json')) or
    FileExists(ExpandConstant('{app}\VisualStudio\VisualStudioIntegrationInstalled.json'));
end;

function VSCodeWasRunningDuringInstall: Boolean;
var
  Content: AnsiString;
  Marker: Integer;
begin
  Result := False;
  if not LoadStringFromFile(
    ExpandConstant('{localappdata}\MultiTerm\Integrations\VSCodeIntegrationInstalled.json'),
    Content
  ) then
    Exit;
  Marker := Pos('"editorWasRunning"', Content);
  Result := (Marker > 0) and
    (Pos('true', Lowercase(Copy(Content, Marker, 80))) > 0);
end;

procedure RunEditorIntegration(
  const EditorName: String;
  const ScriptRelativePath: String;
  const ExtraArguments: String
);
var
  ResultCode: Integer;
  ScriptPath: String;
  Arguments: String;
begin
  ScriptPath := ExpandConstant('{app}\' + ScriptRelativePath);
  Arguments :=
    '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
    ScriptPath + '" -AppPath "' + ExpandConstant('{app}') + '"' + ExtraArguments;
  WizardForm.StatusLabel.Caption := 'Updating the ' + EditorName + ' integration...';
  // These editor extensions are experimental and ship enabled, so they run on
  // machines that never asked for them. Never abort a MultiTerm installation
  // over one: record the problem and report it on the final page instead.
  if not ExecAsOriginalUser(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Arguments,
    ExpandConstant('{app}'),
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) then
  begin
    EditorIntegrationProblem := EditorIntegrationProblem + #13#10 +
      'Setup could not start the ' + EditorName + ' integration helper.';
    Exit;
  end;
  if ResultCode <> 0 then
    EditorIntegrationProblem := EditorIntegrationProblem + #13#10 +
      'The ' + EditorName + ' integration could not be updated (exit code ' +
      IntToStr(ResultCode) + '). MultiTerm itself installed normally.';
end;

procedure UpdateEditorIntegrations;
begin
  if WizardIsTaskSelected('vscodeextension') then
  begin
    RunEditorIntegration(
      'Visual Studio Code',
      'VSCode\Install-VSCodeIntegration.ps1',
      ''
    );
    VSCodeReloadNotice := VSCodeWasRunningDuringInstall;
  end
  else if VSCodeIntegrationStateExists then
    RunEditorIntegration(
      'Visual Studio Code',
      'VSCode\Install-VSCodeIntegration.ps1',
      ' -Uninstall'
    );

  if WizardIsTaskSelected('visualstudioextension') then
  begin
    RunEditorIntegration(
      'Visual Studio',
      'VisualStudio\Install-VisualStudioIntegration.ps1',
      ''
    );
    VisualStudioRestartNotice := VisualStudioIntegrationStateExists;
  end
  else if VisualStudioIntegrationStateExists then
    RunEditorIntegration(
      'Visual Studio',
      'VisualStudio\Install-VisualStudioIntegration.ps1',
      ' -Uninstall'
    );
end;

function IsWindows11OrLater: Boolean;
var
  Version: TWindowsVersion;
begin
  GetWindowsVersionEx(Version);
  Result := (Version.Major > 10) or
    ((Version.Major = 10) and (Version.Build >= 22000));
end;

procedure UpdateExplorerIntegration;
var
  ResultCode: Integer;
  CertificateTrusted: Boolean;
  ExtraArguments: String;
  ScriptPath: String;
  Arguments: String;
begin
  if not WizardIsTaskSelected('explorercontext') then
    Exit;

  CertificateTrusted := True;
  ExtraArguments := '';
  if IsWindows11OrLater then
  begin
    WizardForm.StatusLabel.Caption := 'Trusting the MultiTerm Explorer package...';
    CertificateTrusted := ShellExec(
      'runas',
      ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {#ExplorerCertificateInstallCommand}',
      '',
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    ) and (ResultCode = 0);
    if not CertificateTrusted then
    begin
      ExtraArguments := ' -ClassicOnly';
      ExplorerIntegrationProblem := #13#10 +
        'Administrator approval for the Windows 11 File Explorer menu was declined or failed. ' +
        'MultiTerm installed normally and added the classic File Explorer menu instead.';
      Log('Explorer certificate trust was declined or failed; installing classic verbs only.');
    end;
  end;

  ScriptPath := ExpandConstant('{app}\Explorer\Install-ExplorerIntegration.ps1');
  Arguments :=
    '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
    ScriptPath + '" -AppPath "' + ExpandConstant('{app}') + '"' + ExtraArguments;
  WizardForm.StatusLabel.Caption := 'Adding MultiTerm to File Explorer...';
  if not ExecAsOriginalUser(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    Arguments,
    ExpandConstant('{app}'),
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) then
    ExplorerIntegrationProblem := #13#10 +
      'Setup could not start the optional File Explorer integration helper. MultiTerm itself installed normally.'
  else if ResultCode <> 0 then
    ExplorerIntegrationProblem := #13#10 +
      'The optional File Explorer integration could not be installed (exit code ' +
      IntToStr(ResultCode) + '). MultiTerm itself installed normally.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    UpdateExplorerIntegration;
    UpdateEditorIntegrations;
    if not WizardSilent then
      WriteAiProviderBootstrap;
  end;
end;

function VisualStudioIsRunning: Boolean;
var
  ResultCode: Integer;
begin
  if not Exec(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoLogo -NoProfile -NonInteractive -Command "if ([Diagnostics.Process]::GetProcessesByName(''devenv'').Length -gt 0) { exit 10 }"',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) then
  begin
    Log('Could not check whether Visual Studio is running; blocking the integration change to protect open work.');
    Result := True;
  end
  else
    Result := ResultCode <> 0;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  StopScript: String;
  StopArguments: String;
begin
  Result := '';
  if WizardIsTaskSelected('visualstudioextension') and VisualStudioIsRunning then
  begin
    Result :=
      'Visual Studio is running. Save your work and close every Visual Studio window, then retry Setup. ' +
      'Setup will not force-close the IDE because doing so could lose unsaved work.';
    Log(Result);
    Exit;
  end;
  ExtractTemporaryFile('{#MyScriptFile}');
  StopScript := ExpandConstant('{tmp}\{#MyScriptFile}');
  StopArguments :=
    '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' +
    StopScript + '" -Stop -RequireStopped';

  WizardForm.StatusLabel.Caption := 'Stopping running MultiTerm instances...';
  Log('Gracefully stopping running MultiTerm instances before installation.');
  if not Exec(
    ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    StopArguments,
    ExpandConstant('{tmp}'),
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) then
  begin
    Result :=
      'Setup could not start the MultiTerm shutdown helper. ' +
      'Close MultiTerm and retry Setup.';
    Log(Result);
  end
  else if ResultCode <> 0 then
  begin
    Result :=
      'Setup could not gracefully stop all running MultiTerm instances. ' +
      'Close MultiTerm and retry Setup.';
    Log(Format('%s Shutdown helper exit code: %d.', [Result, ResultCode]));
  end;
end;

function SystemPathIntegrationStateExists: Boolean;
begin
  Result := FileExists(ExpandConstant('{app}\SystemPathInstalled.json'));
end;

function IsProtectedSystemPathInstall: Boolean;
var
  AppPath: String;
  ProgramFilesPath: String;
begin
  AppPath := AddBackslash(Lowercase(ExpandConstant('{app}')));
  ProgramFilesPath := AddBackslash(Lowercase(ExpandConstant('{autopf}')));
  Result :=
    IsAdminInstallMode and
    (Pos(ProgramFilesPath, AppPath) = 1);
end;

function ShouldRemoveSystemPath: Boolean;
begin
  Result :=
    IsProtectedSystemPathInstall and
    SystemPathIntegrationStateExists and
    (not WizardIsTaskSelected('systempath'));
end;

function ShouldUninstallSystemPath: Boolean;
begin
  Result :=
    IsProtectedSystemPathInstall and
    SystemPathIntegrationStateExists;
end;

function ExplorerIntegrationStateExists: Boolean;
begin
  Result := RegValueExists(
    HKCU,
    'Software\MultiTerm Workbench\ExplorerIntegration',
    'CertificateThumbprint');
end;

function ShouldRollbackExplorerCertificate: Boolean;
begin
  Result := not ExplorerIntegrationStateExists;
end;

function ShouldRemoveExplorerCertificate: Boolean;
begin
  Result := ExplorerIntegrationStateExists;
end;
