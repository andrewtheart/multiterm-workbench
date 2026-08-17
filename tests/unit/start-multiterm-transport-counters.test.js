/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

// The embedded C# has no coverage instrumentation, so each behaviour is pinned
// here AND exercised against a live bridge.
const bridgeScript = fs.readFileSync(path.resolve(__dirname, "../../Start-MultiTerm.ps1"), "utf8");

describe("installed bridge transport counters", () => {
  it("publishes the same transport block as the Node bridge", () => {
    expect(bridgeScript).toContain("private string TransportSnapshotJson()");
    for (const field of [
      '"{\\"clients\\":"',
      ',\\"queuedBytes\\":"',
      ',\\"queueHighWaterMarkBytes\\":"',
      ',\\"heartbeatRttMs\\":"',
      ',\\"replayedBytes\\":"',
      ',\\"outputGaps\\":"',
      ',\\"forcedDisconnects\\":"'
    ]) {
      expect(bridgeScript).toContain(field);
    }
    expect(bridgeScript).toContain('+ ",\\"transport\\":" + this.TransportSnapshotJson()');
  });

  it("keeps the fields the watchdog reads at the top level", () => {
    expect(bridgeScript).toMatch(/\{\\"ok\\":true,\\"app\\":\\"MultiTerm Workbench\\",\\"pid\\":/);
    expect(bridgeScript).toContain('+ ",\\"rendererClients\\":" + rendererClients');
    expect(bridgeScript).toContain('+ ",\\"watchdogSuppressed\\":" + (this.watchdogSuppressed ? "true" : "false")');
  });

  it("counts each event where it happens rather than estimating", () => {
    expect(bridgeScript).toContain("Interlocked.Increment(ref this.outputGaps);");
    expect(bridgeScript).toContain("Interlocked.Add(ref this.replayedBytes, replayed);");
    expect(bridgeScript.match(/Interlocked\.Increment\(ref this\.forcedDisconnects\);/g)).toHaveLength(2);
  });

  it("counts only involuntary drops, not an ordinary close", () => {
    expect(bridgeScript).toContain("public bool ForcedDrop { get; private set; }");
    expect(bridgeScript).toContain("this.ForcedDrop = !this.closing;");
    expect(bridgeScript).toMatch(/public void Close\(\)\s+\{\s+this\.closing = true;/);
    expect(bridgeScript).toContain("if (client.ForcedDrop && client.TryCountForcedDisconnect()) Interlocked.Increment(ref this.forcedDisconnects);");
    expect(bridgeScript).toContain("public bool TryCountForcedDisconnect()");
  });

  it("measures heartbeat round-trip from the probe the client answered", () => {
    expect(bridgeScript).toContain("public long HeartbeatRttMs { get; set; }");
    expect(bridgeScript).toContain("public void RecordReceiveComplete(long receivedAt, bool heartbeatReply)");
    expect(bridgeScript).toContain('bool heartbeatReply = type == "heartbeat" && Json.Get(message, "reply") == "true";');
    expect(bridgeScript).toContain("long elapsedTicks = receivedAt - this.LivenessProbeSentAt;");
    expect(bridgeScript).toContain("this.HeartbeatRttMs = Math.Max(1, (elapsedTicks + TimeSpan.TicksPerMillisecond - 1) / TimeSpan.TicksPerMillisecond);");
  });

  it("reads counters atomically so a concurrent writer cannot tear them", () => {
    expect(bridgeScript).toContain("Interlocked.Read(ref this.replayedBytes)");
    expect(bridgeScript).toContain("Interlocked.Read(ref this.outputGaps)");
    expect(bridgeScript).toContain("Interlocked.Read(ref this.forcedDisconnects)");
  });
});
