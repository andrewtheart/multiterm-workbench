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
const installer = fs.readFileSync(path.join(root, "installer", "MultiTerm.iss"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

describe("PowerShell bridge control dashboard", () => {
  it("renders the requested warning, streaming logs, and selectable terminal grid", () => {
    expect(bridgeScript).toContain("internal sealed class BridgeConsoleDashboard");
    expect(bridgeScript).toContain('this.Row("NOTICE", "Logs (streaming)", "Terminals (select to terminate)"');
    expect(bridgeScript).toContain('"Closing this console"');
    expect(bridgeScript).toContain('"will terminate ALL"');
    expect(bridgeScript).toContain('"active MultiTerm"');
    expect(bridgeScript).toContain('"pid " + session.Pid');
  });

  it("uses arrow selection and Enter to request only the selected session exit", () => {
    expect(bridgeScript).toContain("key.Key == ConsoleKey.UpArrow");
    expect(bridgeScript).toContain("key.Key == ConsoleKey.DownArrow");
    expect(bridgeScript).toContain("key.Key == ConsoleKey.Enter");
    expect(bridgeScript).toContain("this.terminateSession(id)");
    expect(bridgeScript).toMatch(/Control console requested termination[\s\S]*this\.KillSession\(id\)/);
    expect(bridgeScript).toMatch(/private void KillSession\(string id\)[\s\S]*session\.RequestExit\(\)/);
  });

  it("launches installed app shortcuts with the visible dashboard while Stop stays hidden", () => {
    const dashboardLaunches = installer.match(/-ConsoleDashboard/g) || [];
    expect(dashboardLaunches).toHaveLength(3);
    expect(installer).toMatch(/Name: "\{group\}\\Stop[\s\S]*-WindowStyle Hidden[\s\S]*-Stop/);
    expect(installer).not.toMatch(/-WindowStyle Hidden[^\r\n]*-ConsoleDashboard/);
  });

  it("documents the close warning and keyboard controls and remains Windows PowerShell 5.1 safe", () => {
    expect(readme).toContain("Closing the control console also ends");
    expect(readme).toContain("Up/Down arrows to select a terminal and Enter");
    expect(readme).toContain("Ctrl+Q stops the bridge and all sessions");
    expect([...bridgeScript].every((character) => character.charCodeAt(0) <= 127)).toBe(true);
  });
});
