/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const bridgeScript = fs.readFileSync(path.resolve(__dirname, "../../Start-MultiTerm.ps1"), "utf8");

describe("installed bridge config ownership", () => {
  it("accepts only complete renderer proposals", () => {
    expect(bridgeScript).toContain("private static readonly string[] BridgeGlobalConfigFields");
    expect(bridgeScript).toContain("private static bool IsCompleteBridgeConfig(Dictionary<string, string> message)");
    expect(bridgeScript).toContain("if (!client.IsRenderer || !IsCompleteBridgeConfig(message))");
    expect(bridgeScript).toContain("client.StoreDesiredConfig(message);");
  });

  it("keeps one owner under a dedicated lock", () => {
    expect(bridgeScript).toContain("private readonly object configOwnerLock = new object();");
    expect(bridgeScript).toContain("private string configOwnerClientId = String.Empty;");
    expect(bridgeScript).toContain("lock (this.configOwnerLock)");
    expect(bridgeScript).toContain("if (String.IsNullOrEmpty(this.configOwnerClientId)) this.configOwnerClientId = client.Id;");
  });

  it("echoes active values to non-owners from one response builder", () => {
    expect(bridgeScript).toContain("private string ActiveConfigJson(BridgeClient client)");
    expect(bridgeScript).toContain('client.Send(this.ActiveConfigJson(client));');
    expect(bridgeScript).toContain('+ ",\\"configOwner\\":" + (String.Equals(client.Id, this.configOwnerClientId, StringComparison.Ordinal) ? "true" : "false")');
  });

  it("promotes visible, then most recently active, then lexically first", () => {
    expect(bridgeScript).toContain("private static bool IsBetterConfigCandidate(BridgeClient candidate, BridgeClient current)");
    expect(bridgeScript).toContain("if (candidate.RendererVisible != current.RendererVisible) return candidate.RendererVisible;");
    expect(bridgeScript).toContain("if (candidate.RendererActiveAt != current.RendererActiveAt) return candidate.RendererActiveAt > current.RendererActiveAt;");
    expect(bridgeScript).toContain("return String.CompareOrdinal(candidate.Id, current.Id) < 0;");
  });

  it("promotes only when the owner disconnects and reapplies its stored config", () => {
    expect(bridgeScript).toContain("this.PromoteConfigOwner(client.Id);");
    expect(bridgeScript).toContain("if (!String.Equals(this.configOwnerClientId, disconnectedClientId, StringComparison.Ordinal)) return;");
    expect(bridgeScript).toContain("Dictionary<string, string> desired = candidate.GetDesiredConfig();");
    expect(bridgeScript).toContain("this.ApplyBridgeConfig(next, nextConfig);");
  });

  it("copies desired config under the client lock", () => {
    expect(bridgeScript).toContain("public void StoreDesiredConfig(Dictionary<string, string> value)");
    expect(bridgeScript).toContain("public Dictionary<string, string> GetDesiredConfig()");
    expect(bridgeScript).toContain("new Dictionary<string, string>(this.desiredConfig, StringComparer.Ordinal)");
  });
});
