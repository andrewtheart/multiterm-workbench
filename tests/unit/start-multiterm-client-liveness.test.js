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

describe("installed bridge client liveness", () => {
  it("judges liveness on what the peer sent, not on a successful send", () => {
    expect(bridgeScript).toContain("public long LastReceiveAt { get; set; }");
    expect(bridgeScript).toContain("public long LastSendCompletedAt { get; set; }");
    expect(bridgeScript).toContain("public long LivenessProbeSentAt { get; set; }");
    expect(bridgeScript).toContain("this.LastReceiveAt = DateTime.UtcNow.Ticks;");
    // Any inbound message both refreshes the receive stamp and clears an
    // outstanding probe, so answering is what keeps a client alive.
    expect(bridgeScript).toContain("this.HandleClientMessage(client, rawMessage, DateTime.UtcNow.Ticks);");
    expect(bridgeScript).toContain("public bool TryClaimExpiredLivenessProbe(long nowTicks, long windowTicks)");
    expect(bridgeScript).toContain("public bool HasRecentReceive(long nowTicks, long windowTicks)");
  });

  it("records bounded send completion only after the send really finished", () => {
    expect(bridgeScript).toMatch(/timeout\.Token\)\.GetAwaiter\(\)\.GetResult\(\);\s+\}\s+this\.LastSendCompletedAt = DateTime\.UtcNow\.Ticks;/);
  });

  it("probes only renderers, because an automation client never agreed to answer", () => {
    expect(bridgeScript).toContain("internal int SweepClientLiveness(DateTime? nowUtc = null)");
    expect(bridgeScript).toContain("if (!client.IsRenderer) continue;");
    expect(bridgeScript).toContain('client.SendLivenessProbe("{\\"type\\":\\"heartbeat\\",\\"nonce\\":" + Json.Quote("probe-"');
    expect(bridgeScript).toContain("if (frame.LivenessProbe) this.PublishLivenessProbeDelivery(delivered);");
    expect(bridgeScript).toContain("if (this.livenessProbeQueued || this.LivenessProbeSentAt > 0) return true;");
    expect(bridgeScript).toContain("if (delivered && !this.livenessProbeAnswered)");
    expect(bridgeScript).toContain("public void RecordReceiveComplete(long receivedAt, bool heartbeatReply)");
    expect(bridgeScript).toContain("client.RecordReceiveComplete(receivedAt > 0 ? receivedAt : DateTime.UtcNow.Ticks, heartbeatReply);");
  });

  it("removes only the renderer that failed to answer within the window", () => {
    expect(bridgeScript).toContain("if (client.TryClaimExpiredLivenessProbe(now.Ticks, windowTicks))");
    expect(bridgeScript).toContain("this.clients.TryRemove(client.Id, out dropped);");
    expect(bridgeScript).toContain('this.Log("warn", "Dropping renderer " + client.Id + ": no heartbeat answer within "');
  });

  it("never echoes a probe reply back to the renderer", () => {
    expect(bridgeScript).toContain('if (Json.Get(message, "reply") != "true")');
  });

  it("shares the Node bridge's interval bounds with 0 meaning off", () => {
    expect(bridgeScript).toContain("private const int DefaultHeartbeatSeconds = 30;");
    expect(bridgeScript).toContain("private const int MinHeartbeatSeconds = 5;");
    expect(bridgeScript).toContain("private const int MaxHeartbeatSeconds = 600;");
    expect(bridgeScript).toContain("private static int NormalizeHeartbeatSeconds(int requested)");
    expect(bridgeScript).toContain('Json.GetInt(message, "bridgeHeartbeatSeconds", DefaultHeartbeatSeconds)');
    expect(bridgeScript).toContain('+ ",\\"bridgeHeartbeatSeconds\\":" + Volatile.Read(ref this.heartbeatSeconds).ToString(CultureInfo.InvariantCulture)');
    expect(bridgeScript).toContain("int interval = Volatile.Read(ref this.heartbeatSeconds);");
    expect(bridgeScript).toContain("if (interval <= 0)");
  });

  it("runs the sweep for the listener's lifetime only", () => {
    expect(bridgeScript).toContain("private void StartClientLivenessSweep()");
    expect(bridgeScript).toContain("private void StopClientLivenessSweep()");
    expect(bridgeScript).toContain("this.StartClientLivenessSweep();");
    expect(bridgeScript).toMatch(/this\.stopping = true;\s+this\.StopClientLivenessSweep\(\);/);
  });
});
