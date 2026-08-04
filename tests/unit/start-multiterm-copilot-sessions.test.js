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

describe("installed bridge Copilot session protocol", () => {
  it("discovers all local Copilot clients and exports selected editor context off the socket thread", () => {
    expect(source).toContain('else if (type == "listCopilotSessions")');
    expect(source).toContain('else if (type == "prepareCopilotSessionContext")');
    expect(source).toContain("private static CopilotSessionMetadata ReadCopilotSession(string directory)");
    expect(source).toContain('Path.Combine(profile, ".copilot", "session-state")');
    expect(source).toContain('Path.Combine(directory, "workspace.yaml")');
    expect(source).toContain("private static List<CopilotSessionMetadata> ReadVsCodeCopilotSessions()");
    expect(source).toContain('"Code", "User", "workspaceStorage"');
    expect(source).toContain("private static List<CopilotSessionMetadata> ReadVisualStudioCopilotSessions()");
    expect(source).toContain('MULTITERM_ES_PATH');
    expect(source).toContain("private void PrepareCopilotSessionContext(BridgeClient client");
    expect(source).toContain('Path.Combine(Path.GetTempPath(), "MultiTerm", "CopilotContexts")');
    expect(source).toContain("Guid.TryParse(id, out parsedId)");
    expect(source).toContain("ThreadPool.QueueUserWorkItem");
    expect(source).toContain("copilotSessions");
  });
});