; Inno Setup script for MultiTerm Workbench
; Packages the self-contained PowerShell bridge (no Node.js runtime required).
; Build:  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\MultiTerm.iss
; Output: installer\Output\MultiTerm-Setup-<version>.exe

#define MyAppName "MultiTerm Workbench"
#define MyAppVersion "0.1.1"
#define MyAppPublisher "MultiTerm Workbench"
#define MyAppURL "https://github.com/andrewtheart/multiterm-workbench"
#define MyScriptFile "Start-MultiTerm.ps1"
; Repository root, relative to this .iss file (which lives in installer\).
#define RepoRoot ".."

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
UninstallDisplayIcon={app}\MultiTerm.ico
; Per-user install by default (no UAC); user may elect a machine-wide install.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=Output
OutputBaseFilename=MultiTerm-Setup-{#MyAppVersion}
SetupIconFile=MultiTerm.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
LicenseFile=
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#RepoRoot}\{#MyScriptFile}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#RepoRoot}\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#RepoRoot}\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "MultiTerm.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\{#MyScriptFile}"""; WorkingDir: "{app}"; IconFilename: "{app}\MultiTerm.ico"; Comment: "Start the MultiTerm Workbench bridge and open it in your browser"
Name: "{group}\{#MyAppName} README"; Filename: "{app}\README.md"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\{#MyScriptFile}"""; WorkingDir: "{app}"; IconFilename: "{app}\MultiTerm.ico"; Tasks: desktopicon

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\{#MyScriptFile}"""; WorkingDir: "{app}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
