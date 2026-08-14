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

const repoRoot = path.join(__dirname, "..", "..");
const installedBridge = fs.readFileSync(path.join(repoRoot, "Start-MultiTerm.ps1"), "utf8");
const nodeBridge = fs.readFileSync(path.join(repoRoot, "server.js"), "utf8");

describe("installed bridge remote Copilot sessions", () => {
  it("asks GitHub for the agent session list on a worker thread", () => {
    expect(installedBridge).toContain('else if (type == "listRemoteCopilotSessions")');
    expect(installedBridge).toContain("private void ListRemoteCopilotSessions(BridgeClient client");
    expect(installedBridge).toContain('"https://api.githubcopilot.com"');
    expect(installedBridge).toContain('"https://api.enterprise.githubcopilot.com"');
    expect(installedBridge).toContain('private const string RemoteCopilotApiVersion = "2025-05-01"');
    expect(installedBridge).toContain('host + "/agents/sessions?page_size="');
    expect(installedBridge).toContain('request.Headers["Copilot-Api-Version"]');
    expect(installedBridge).toContain("request.AllowAutoRedirect = false;");
    expect(installedBridge).toContain("ThreadPool.QueueUserWorkItem");
  });

  it("reads the token from the GitHub CLI rather than any credential store", () => {
    expect(installedBridge).toContain('new ProcessStartInfo("gh.exe", "auth token")');
    expect(installedBridge).toContain('Regex.IsMatch(token, "^[A-Za-z0-9_.-]{20,255}$")');
    expect(installedBridge).not.toContain("CredRead");
  });

  it("bounds the response and rejects a payload that lost its session array", () => {
    expect(installedBridge).toContain("private const int RemoteCopilotMaxBytes = 2 * 1024 * 1024;");
    expect(installedBridge).toContain('throw new InvalidOperationException("response was too large")');
    expect(installedBridge).toContain("private static List<string> SplitJsonArrayObjects(string body, string key)");
  });

  it("echoes the request id and reports which source answered", () => {
    expect(installedBridge).toContain('"{\\"type\\":\\"remoteCopilotSessions\\",\\"requestId\\":" + Json.Quote(requestId)');
    expect(installedBridge).toContain('",\\"source\\":\\"api\\",\\"sessions\\":"');
    expect(installedBridge).toContain('",\\"source\\":\\"fallback\\",\\"sessions\\":"');
    expect(installedBridge).toContain('Remote Copilot session listing unavailable: ');
  });

  it("keeps the fallback restricted to remote Copilot sessions MultiTerm recorded", () => {
    expect(installedBridge).toContain("private string RemoteCopilotFallbackJson()");
    expect(installedBridge).toContain('ExtractJsonBool(record, "remote")');
    expect(installedBridge).toContain('ExtractJsonString(record, "provider"), "copilot"');
    expect(installedBridge).toContain('Json.Quote("remote:" + id)');
    expect(installedBridge).toContain('ExtractJsonString(record, "aiSessionId").ToLowerInvariant()');
    expect(nodeBridge).toContain('.filter((entry) => entry.provider === "copilot" && entry.remote)');
    expect(nodeBridge).toContain('`remote:${entry.remoteSessionId.toLowerCase()}`');
  });

  it("agrees with the Node bridge on the endpoint contract", () => {
    for (const literal of ["/agents/sessions", "2025-05-01", "https://github.com/copilot/agents"]) {
      expect(nodeBridge).toContain(literal);
      expect(installedBridge).toContain(literal);
    }
  });
});
