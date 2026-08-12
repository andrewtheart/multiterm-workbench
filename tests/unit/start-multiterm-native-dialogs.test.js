/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "..", "Start-MultiTerm.ps1"), "utf8");

describe("installed native dialog ownership", () => {
  it("parents Open and Save As common dialogs to the foreground app window", () => {
    expect(source).toContain('[DllImport("user32.dll")]');
    expect(source).toContain("private static extern IntPtr GetForegroundWindow();");
    expect(source.match(/options\.hwndOwner = GetForegroundWindow\(\);/g)).toHaveLength(2);
  });

  it("parents the working-directory picker to the foreground app window", () => {
    expect(source).toContain("MultiTermDialogOwner : IWin32Window");
    expect(source).toContain("$d.ShowDialog($owner)");
  });
});