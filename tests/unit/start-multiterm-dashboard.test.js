/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const bridgeScript = fs.readFileSync(path.join(root, "Start-MultiTerm.ps1"), "utf8");
const rendererScript = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const installer = fs.readFileSync(path.join(root, "installer", "MultiTerm.iss"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const terminalGuiReadme = fs.readFileSync(path.join(root, "lib", "terminal-gui", "README.md"), "utf8");

describe("PowerShell bridge control dashboard", () => {
  it("renders the requested warning, streaming logs, and selectable terminal grid", () => {
    expect(bridgeScript).toContain("internal sealed class BridgeConsoleDashboard");
    expect(bridgeScript).toContain("using Terminal.Gui;");
    expect(bridgeScript).toContain("Application.Init();");
    // The bridge id leads both titles so a Windows Terminal tab still shows it
    // after truncation, and so UI automation can match the tab by name.
    expect(bridgeScript).toContain('Console.Title = this.bridgeId + " - MultiTerm Bridge Control Console - "');
    expect(bridgeScript).toContain('Title = this.bridgeId + " - MultiTerm Bridge Control Console"');
    expect(bridgeScript).not.toContain('Title = "MultiTerm Control Console"');
    expect(bridgeScript).toContain('Title = "NOTICE"');
    expect(bridgeScript).toContain('Title = "Logs (streaming)"');
    expect(bridgeScript).toContain('Title = "Terminals"');
    expect(bridgeScript).toContain("internal sealed class DashboardLogView : View");
    expect(bridgeScript).toContain("this.logView = new DashboardLogView()");
    expect(bridgeScript).toContain("Closing this console will terminate every terminal session in THIS INSTANCE.");
    expect(bridgeScript).toContain('"pid " + session.Pid');
    expect(bridgeScript).not.toContain("Console.SetCursorPosition");
    expect(bridgeScript).not.toContain("private string BuildFrame");
  });

  it("emphasizes the shutdown warning and color-codes structured log segments", () => {
    expect(bridgeScript).toContain("internal sealed class DashboardNoticeView : View");
    expect(bridgeScript).toContain('Terminal.Gui.Attribute.Make(Color.BrightRed, Color.Gray)');
    expect(bridgeScript).toContain('driver.AddStr(NStack.ustring.Make("!"));');
    expect(bridgeScript).toContain('Terminal.Gui.Attribute.Make(Color.BrightYellow, Color.Gray)');
    expect(bridgeScript).toContain('TimestampAttribute = Terminal.Gui.Attribute.Make(Color.Black, Color.Gray)');
    expect(bridgeScript).toContain('InfoAttribute = Terminal.Gui.Attribute.Make(Color.DarkGray, Color.Gray)');
    expect(bridgeScript).toContain('WarningAttribute = Terminal.Gui.Attribute.Make(Color.BrightYellow, Color.Gray)');
    expect(bridgeScript).toContain('ErrorAttribute = Terminal.Gui.Attribute.Make(Color.BrightRed, Color.Gray)');
    expect(bridgeScript).toContain('HelpAttribute = Terminal.Gui.Attribute.Make(Color.Black, Color.Gray)');
    expect(bridgeScript).toContain('Math.Max(warningLines.Count + bannerRows + 1, height - HelpLines.Length)');
    // The id is the first thing drawn, in its own colour, so it reads as a label
    // for the whole console rather than another line of notice text.
    expect(bridgeScript).toContain("BridgeIdAttribute = Terminal.Gui.Attribute.Make(Color.White, Color.Blue)");
    expect(bridgeScript).toContain('string identifier = String.IsNullOrEmpty(this.BridgeId) ? "BRIDGE-???" : this.BridgeId;');
    expect(bridgeScript).toContain('return "ERR";');
    expect(bridgeScript).toContain('return "WARN";');
  });

  it("uses the native list selection and Enter to request only the selected session exit", () => {
    expect(bridgeScript).toContain("this.sessionList = new ListView()");
    expect(bridgeScript).toContain("this.sessionList.OpenSelectedItem +=");
    expect(bridgeScript).toContain("this.terminateSession(this.displayedSessions[index].Id)");
    expect(bridgeScript).toContain('new StatusItem(Key.CtrlMask | Key.Q, "~^Q~ Stop", this.ConfirmStop');
    expect(bridgeScript).toMatch(/Bridge control console requested termination[\s\S]*this\.KillSession\(id\)/);
    expect(bridgeScript).toMatch(/private void KillSession\(string id\)[\s\S]*session\.RequestExit\(\)/);
  });

  it("surfaces frontend health, uptime, recovery, and log controls", () => {
    expect(bridgeScript).toContain('"UP " + FormatUptime');
    expect(bridgeScript).toContain('"UI ONLINE" : "UI OFFLINE"');
    expect(bridgeScript).toContain('this.statusBar.SetNeedsDisplay();');
    expect(bridgeScript).toContain('new StatusItem(Key.F2, "~F2~ Open UI", this.OpenFrontend');
    expect(bridgeScript).toContain('new StatusItem(Key.F3, "~F3~ Clear", this.ClearLogs');
    expect(bridgeScript).toContain('new StatusItem(Key.F4, "~F4~ Logs: all", this.CycleLogFilter');
    expect(bridgeScript).toContain('new StatusItem(Key.F5, "~F5~ Pause", this.ToggleLogPause');
    expect(bridgeScript).toContain('this.openFrontend();');
    expect(bridgeScript).toContain('this.logs.Clear();');
    expect(bridgeScript).toContain('this.logFilter = "warnings";');
    expect(bridgeScript).toContain('this.logFilter = "errors";');
    expect(bridgeScript).toContain('this.logPaused = !this.logPaused;');
    expect(bridgeScript).toContain('if (!this.logPaused && !String.Equals(nextLogText');
    expect(bridgeScript).toContain('int choice = MessageBox.Query(');
    expect(bridgeScript).toContain('"Keep running"');
    expect(bridgeScript).toContain('"Stop instance"');
  });

  it("shows live details for the selected terminal", () => {
    expect(bridgeScript).toContain('Text = "Selected terminal"');
    expect(bridgeScript).toContain('private static string SessionDetails(DashboardSessionInfo session)');
    expect(bridgeScript).toContain('"\\nPID " + session.Pid + " | " + session.Shell');
    expect(bridgeScript).toContain('FormatBytes(session.BytesIn)');
    expect(bridgeScript).toContain('"\\nLogging " + (session.IsLogging ? "ON" : "off")');
    for (const field of ["Shell", "Cwd", "Cols", "Rows", "BytesIn", "BytesOut", "KeystrokesIn", "KeystrokesOut", "IsLogging"]) {
      expect(bridgeScript).toContain(`${field} = session.${field}`);
    }
  });

  it("synchronizes GUI title changes into bridge-owned TUI state", () => {
    expect(rendererScript).toContain('sendBridge({ type: "title", id: terminal.id, title });');
    expect(rendererScript).toContain('if (message.type === "title")');
    expect(rendererScript).toContain('commitTerminalTitle(terminal, message.title, false)');
    expect(rendererScript).toMatch(/function startMinChipRename[\s\S]*commitTerminalTitle\(terminal, name, true, "manual"\)/);
    expect(bridgeScript).toContain('else if (type == "title")');
    expect(bridgeScript).toContain('session.Rename(title);');
    expect(bridgeScript).toContain('this.SendSessionFrame(session, "{\\"type\\":\\"title\\"');
    expect(bridgeScript).toContain('public void Rename(string title)');
  });

  it("packages the pinned Terminal.Gui runtime without requiring a developer pack", () => {
    for (const file of ["Terminal.Gui.dll", "NStack.dll", "System.Management.dll", "netstandard.dll"]) {
      expect(fs.existsSync(path.join(root, "lib", "terminal-gui", file))).toBe(true);
      expect(terminalGuiReadme).toContain(file);
    }
    expect(terminalGuiReadme).toContain("Terminal.Gui` | 1.19.0");
    expect(terminalGuiReadme).toContain("Microsoft.NETFramework.ReferenceAssemblies.net472` | 1.0.3");
    expect(installer).toContain('Source: "{#RepoRoot}\\lib\\terminal-gui\\*.dll"; DestDir: "{app}\\lib\\terminal-gui"');
  });

  it("keeps the isolated app profile local and suppresses browser sync promotions", () => {
    expect(bridgeScript).toContain('+ " --disable-sync"');
    expect(bridgeScript).toContain('+ " --no-first-run --no-default-browser-check"');
    expect(bridgeScript).not.toMatch(/--guest|--incognito/);
  });

  it("launches installed app shortcuts with the visible dashboard while Stop stays hidden", () => {
    const dashboardLaunches = installer.match(/-ConsoleDashboard/g) || [];
    const newInstanceLaunches = installer.match(/-ConsoleDashboard -NewInstance/g) || [];
    expect(dashboardLaunches).toHaveLength(3);
    expect(newInstanceLaunches).toHaveLength(3);
    expect(installer).toMatch(/Name: "\{group\}\\Stop[\s\S]*-WindowStyle Hidden[\s\S]*-Stop/);
    expect(installer).toContain("Stop all {#MyAppName} instances");
    expect(installer).not.toMatch(/-WindowStyle Hidden[^\r\n]*-ConsoleDashboard/);
  });

  it("waits for graceful shutdown before replacing installed files", () => {
    expect(bridgeScript).toContain("[switch]$RequireStopped");
    expect(bridgeScript).toContain('$portWasSpecified = $PSBoundParameters.ContainsKey("Port")');
    expect(bridgeScript).not.toContain('$PSBoundParameters.ContainsKey("Port") -or');
    expect(bridgeScript).toContain("function Wait-MultiTermProcessExit");
    expect(bridgeScript).toContain("function Wait-MultiTermEndpointExit");
    expect(bridgeScript).toContain("Could not gracefully stop all MultiTerm instances");
    expect(installer).toMatch(/Source: "\{#RepoRoot\}\\\{#MyScriptFile\}"; Flags: dontcopy/);
    expect(installer).toContain("function PrepareToInstall(var NeedsRestart: Boolean): String;");
    expect(installer).toContain("ExtractTemporaryFile('{#MyScriptFile}')");
    expect(installer).toContain(`StopScript + '" -Stop -RequireStopped';`);
    expect(installer).toContain("ewWaitUntilTerminated");
    expect(installer).toContain("ResultCode <> 0");
  });

  it("shows third-party notices before installation alongside the license", () => {
    expect(installer).toContain("LicenseFile={#RepoRoot}\\LICENSE");
    expect(installer).toContain("InfoBeforeFile={#RepoRoot}\\THIRD-PARTY-NOTICES.txt");
    expect(installer).not.toContain("InfoAfterFile=");
  });

  it("isolates concurrent installed bridge instances", () => {
    expect(bridgeScript).toContain("[switch]$NewInstance");
    expect(bridgeScript).toContain("$useAutomaticPort = $NewInstance.IsPresent");
    expect(bridgeScript).toMatch(/\$resolvedOpenFolder[\s\S]*\$useAutomaticPort = \$true/);
    expect(bridgeScript).toMatch(/BridgeServer\]::new\([\s\S]*\$useAutomaticPort/);
    expect(bridgeScript).toContain("this.listener.Start();");
    expect(bridgeScript).toMatch(/this\.autoPort[\s\S]*this\.port\+\+[\s\S]*continue;/);
    expect(bridgeScript).toContain('"MultiTerm", "Instances"');
    expect(bridgeScript).toContain('\\"app\\":\\"MultiTerm Workbench\\"');
    expect(bridgeScript).toContain('? profileRoot');
    expect(bridgeScript).toContain('Path.Combine(profileRoot, "Instances", this.port.ToString(CultureInfo.InvariantCulture))');
    expect(bridgeScript).toContain('"~^Q~ Stop"');
  });

  it("persists update consent outside port-specific browser profiles", () => {
    expect(bridgeScript).toContain('path == "/api/update-preferences"');
    expect(bridgeScript).toContain('"MultiTerm", "update-preferences.json"');
    expect(bridgeScript).toContain('new Mutex(false, "Local\\\\MultiTerm.UpdatePreferences")');
    expect(bridgeScript).toContain("string loadedPreferences = this.LoadUpdatePreferences()");
    expect(bridgeScript).not.toContain("string preferences = this.LoadUpdatePreferences()");
    expect(bridgeScript).toContain("SaveUpdatePreferences(preferences)");
  });

  it("documents the close warning and keyboard controls and remains Windows PowerShell 5.1 safe", () => {
    expect(readme).toMatch(/Closing the bridge\s+control console also ends/);
    expect(readme).toMatch(/MultiTerm Bridge Control\s+Console/);
    expect(readme).toContain("Up/Down arrows to select a terminal and Enter");
    expect(readme).toMatch(/Ctrl\+Q opens a\s+confirmation/);
    expect(readme).toContain("F2 reopens the frontend");
    expect(readme).toContain("F4 cycles the log filter");
    expect(readme).toContain("F5 pauses or resumes log updates");
    expect(readme).toMatch(/selected\s+terminal's shell, PID, dimensions/);
    expect(readme).toMatch(/Terminal\.Gui\s+framework/);
    expect([...bridgeScript].every((character) => character.charCodeAt(0) <= 127)).toBe(true);
  });
});
