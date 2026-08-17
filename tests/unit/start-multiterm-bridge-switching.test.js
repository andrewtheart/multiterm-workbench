/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const bridgeScript = fs.readFileSync(path.join(__dirname, "..", "..", "Start-MultiTerm.ps1"), "utf8");

describe("installed bridge switching discovery", () => {
  it("dispatches correlated bridge discovery and reports live frontend occupancy", () => {
    expect(bridgeScript).toContain('else if (type == "listBridgeInstances")');
    expect(bridgeScript).toContain("this.ListBridgeInstances(client, message);");
    expect(bridgeScript).toContain('string requestId = Json.Get(message, "requestId");');
    expect(bridgeScript).toContain('{ "type", "bridgeInstances" }');
    expect(bridgeScript).toContain('{ "requestId", requestId }');
    expect(bridgeScript).toContain('{ "rendererClients", Math.Max(0, rendererClients) }');
    expect(bridgeScript).toContain('{ "sessions", Math.Max(0, sessions) }');
  });

  it("accepts only loopback records whose live health matches PID and port", () => {
    expect(bridgeScript).toContain('Directory.GetFiles(directory, "*.json")');
    expect(bridgeScript).toContain("recordUrl.Scheme != Uri.UriSchemeHttp");
    expect(bridgeScript).toContain("!recordUrl.IsLoopback");
    expect(bridgeScript).toContain("recordUrl.Port != recordPort");
    expect(bridgeScript).toContain("healthPort != recordPort || healthPid != recordPid");
    expect(bridgeScript).toContain('request.Timeout = 1200;');
    expect(bridgeScript).toContain('builder.Length + read > 64 * 1024');
  });
});
