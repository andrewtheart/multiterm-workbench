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
const buildSource = fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "build-installer.ps1"), "utf8");
const installerSource = fs.readFileSync(path.join(__dirname, "..", "..", "installer", "MultiTerm.iss"), "utf8");

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

  it("discovers native Claude transcripts through the standalone bridge", () => {
    expect(source).toContain('else if (type == "listClaudeSessions")');
    expect(source).toContain("private static List<CopilotSessionMetadata> ReadClaudeSessions()");
    expect(source).toContain('Path.Combine(profile, ".claude", "projects")');
    expect(source).toContain('Directory.GetFiles(root, "*.jsonl", SearchOption.AllDirectories)');
    expect(source).toContain('Key = "claude:" + id');
    expect(source).toContain('Source = "claude"');
    expect(source).toContain("private void ListClaudeSessions(BridgeClient client");
    expect(source).toContain('\\"type\\":\\"claudeSessions\\"');
    expect(source).toContain("ThreadPool.QueueUserWorkItem");
  });

  it("generates terminal titles through the packaged tool-free Copilot SDK host", () => {
    expect(source).toContain('else if (type == "generateTerminalTitle")');
    expect(source).toContain("private void GenerateTerminalTitle(BridgeClient client");
    expect(source).toContain('MULTITERM_COPILOT_SDK_HOST');
    expect(source).toContain("private static ProcessStartInfo CopilotSdkStartInfo()");
    expect(source).toContain("start.RedirectStandardInput = true");
    expect(source).toContain("byte[] payloadBytes = new UTF8Encoding(false).GetBytes(payload)");
    expect(source).toContain("process.StandardInput.BaseStream.Write(payloadBytes, 0, payloadBytes.Length)");
    expect(source).toContain('"{\\\"operation\\\":\\\"title\\\",\\\"model\\\":"');
    expect(source).toContain('"<terminal-context> " + terminalContext');
    expect(source).toContain("process.WaitForExit(180000)");
    expect(source).toContain('\\"terminalTitleSuggestion\\"');
    expect(source).not.toContain("FindCopilotLauncher");
    expect(source).not.toContain('"--available-tools="');
    expect(buildSource).toContain("dotnet build $CopilotSdkHostProject --configuration Release --nologo");
    expect(buildSource).toContain("runtimes\\win-x64\\native\\copilot.exe");
    expect(installerSource).toContain('lib\\copilot-sdk-host\\publish\\*');
  });

  it("generates Claude titles through the optional authenticated CLI without tools or persistence", () => {
    expect(source).toContain('string provider = Json.Get(message, "provider")');
    expect(source).toContain('provider == "none" ? "AI-generated terminal titles are disabled." : "Unsupported AI provider."');
    expect(source).toContain("private static string GenerateClaudeTerminalTitleText(");
    expect(source).toContain('"-p --output-format json --tools \\\"\\\" --setting-sources= --strict-mcp-config --no-session-persistence"');
    expect(source).toContain('@"^[A-Za-z0-9][A-Za-z0-9._:/+\\-\\[\\]]{0,159}$"');
    expect(source).toContain('throw new InvalidOperationException("Claude returned an unsupported model identifier.")');
    expect(source).toContain('+ " --model " + model');
    expect(source).toContain('arguments += " --effort " + effort');
    expect(source).toContain("byte[] promptBytes = new UTF8Encoding(false).GetBytes(prompt)");
    expect(source).toContain("process.StandardInput.BaseStream.Write(promptBytes, 0, promptBytes.Length)");
    expect(source).toContain('JsonText(response, "result")');
    expect(source).toContain('if (provider == "claude")');
  });

  it("discovers optional AI providers with account-scoped models in the standalone bridge", () => {
    expect(source).toContain('else if (type == "listAiProviders")');
    expect(source).toContain("private void ListAiProviders(BridgeClient client");
    expect(source).toContain('new UTF8Encoding(false).GetBytes("{\\"operation\\":\\"models\\"}")');
    expect(source).toContain('start.FileName = "where.exe"');
    expect(source).toContain('return FindExecutable("claude")');
    expect(source).toContain('ClaudeStartInfo(executable, "auth status")');
    expect(source).toContain('"{\\"type\\":\\"control_request\\",\\"request_id\\":"');
    expect(source).toContain('"supportedEffortLevels"');
    expect(source).toContain('{ "type", "aiProviders" }');
    expect(source).toContain("ThreadPool.QueueUserWorkItem");
  });
});