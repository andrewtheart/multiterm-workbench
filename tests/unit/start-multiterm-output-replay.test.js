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

describe("installed bridge output replay", () => {
  it("numbers every output frame from a per-session ring under one lock", () => {
    expect(bridgeScript).toContain("private sealed class OutputReplayRing");
    expect(bridgeScript).toContain("private readonly ConcurrentDictionary<string, OutputReplayRing> outputReplays");
    expect(bridgeScript).toContain("lock (ring.Sync)");
    expect(bridgeScript).toContain("ring.Sequence += 1;");
    expect(bridgeScript).toContain('+ ",\\"seq\\":" + ring.Sequence.ToString(CultureInfo.InvariantCulture) + "}"');
    // The broadcast happens inside the ring lock so ring order equals wire order.
    expect(bridgeScript).toMatch(/ring\.Sequence \+= 1;[\s\S]{0,400}this\.SendOutputFrame\(session, message\);/);
  });

  it("bounds retention and drops the oldest chunk first", () => {
    expect(bridgeScript).toContain("private void RetainOutput(OutputReplayRing ring, long sequence, string data)");
    expect(bridgeScript).toContain("private void TrimReplayRing(OutputReplayRing ring, long limit)");
    expect(bridgeScript).toContain("while (ring.Bytes > limit && ring.Chunks.Count > 0)");
    expect(bridgeScript).toContain("OutputChunk dropped = ring.Chunks.Dequeue();");
    expect(bridgeScript).toContain("private void TrimAllReplayRings()");
  });

  it("uses the same replay budget bounds and 0 meaning as the Node bridge", () => {
    expect(bridgeScript).toContain("private const int DefaultReplayBufferKb = 512;");
    expect(bridgeScript).toContain("private const int MinReplayBufferKb = 16;");
    expect(bridgeScript).toContain("private const int MaxReplayBufferKb = 4096;");
    expect(bridgeScript).toContain("private static int NormalizeReplayBufferKb(int requested)");
    expect(bridgeScript).toContain('Json.GetInt(message, "bridgeReplayBufferKb", DefaultReplayBufferKb)');
    expect(bridgeScript).toContain('+ ",\\"bridgeReplayBufferKb\\":" + Volatile.Read(ref this.replayBufferKb).ToString(CultureInfo.InvariantCulture)');
  });

  it("answers resumeOutput with a complete suffix or an explicit gap", () => {
    expect(bridgeScript).toContain('else if (type == "resumeOutput")');
    expect(bridgeScript).toContain("private void ResumeSessionOutput(BridgeClient client, Dictionary<string, string> message)");
    expect(bridgeScript).toContain("this.FlushSessionOutput(id);");
    expect(bridgeScript).toContain('\\"reason\\":\\"unknown-session\\"');
    expect(bridgeScript).toContain('+ ",\\"reason\\":\\"retention\\",\\"expected\\":"');
    expect(bridgeScript).toContain('",\\"replay\\":true}"');
    expect(bridgeScript).toContain('"{\\"type\\":\\"outputResumed\\",\\"id\\":"');
    expect(bridgeScript).toContain("if (oldest > lastSeq + 1)");
  });

  it("drops the ring together with the session", () => {
    expect(bridgeScript).toMatch(/private void RemoveSessionOutputBatch\(string id\)\s+\{\s+OutputReplayRing ring;\s+this\.outputReplays\.TryRemove\(id, out ring\);/);
  });

  it("queues a gap before exit when a renderer is still replay-gated", () => {
    expect(bridgeScript).toContain("private void SendSessionExitFrame(TerminalSession session, string message)");
    expect(bridgeScript).toMatch(/if \(client\.ShouldGateOutput\(session\.Id\)\)[\s\S]{0,500}client\.SendBytes\(gapBytes\);[\s\S]{0,200}client\.CompleteOutputResume\(session\.Id\);[\s\S]{0,200}client\.SendBytes\(exitBytes\);/);
    expect(bridgeScript).toMatch(/this\.SendSessionExitFrame\(session,[\s\S]{0,300}this\.sessions\.TryRemove\(id, out removed\);[\s\S]{0,200}this\.RemoveSessionOutputBatch\(id\);/);
    expect(bridgeScript).toContain('"reason\\\":\\\"session-exited\\\"');
  });

  it("serializes resume with exit and treats exited as the terminal client frame", () => {
    const resume = bridgeScript.match(/private void ResumeSessionOutput[\s\S]*?private void SendSessionFrame/);
    expect(resume).toBeTruthy();
    expect(resume[0]).toMatch(/this\.FlushSessionOutput\(id\);[\s\S]{0,150}lock \(this\.sessionCatalogLock\)/);
    expect(resume[0]).toContain("if (client.HasSeenSessionExit(id)) return;");
    expect(bridgeScript).toContain("public void MarkSessionExited(string sessionId)");
    expect(bridgeScript).toContain("public bool HasSeenSessionExit(string sessionId)");
    expect(bridgeScript).toMatch(/client\.MarkSessionExited\(session\.Id\);\s+client\.SendBytes\(exitBytes\);/);
  });

  it("gates renderer live output before welcome until replay is queued", () => {
    expect(bridgeScript).toContain('context.Request.QueryString["renderer"]');
    expect(bridgeScript).toContain("private readonly object sessionCatalogLock = new object();");
    expect(bridgeScript).toMatch(/lock \(this\.sessionCatalogLock\)[\s\S]{0,700}client\.InitializeOutputResumes\(pendingResumes\);[\s\S]{0,400}welcome = this\.WelcomeJson/);
    expect(bridgeScript).toContain("client.InitializeOutputResumes(pendingResumes);");
    expect(bridgeScript).toContain("if (!session.Ephemeral && session.IsAvailable) pendingResumes.Add(session.Id);");
    expect(bridgeScript).toContain("if (!client.ShouldGateOutput(session.Id)) client.SendBytes(bytes);");
    expect(bridgeScript).toContain("client.CompleteOutputResume(id);");
    expect(bridgeScript).toMatch(/lock \(ring\.Sync\)[\s\S]{0,2200}client\.CompleteOutputResume\(id\);/);
  });

  it("publishes the sequence current at welcome", () => {
    expect(bridgeScript).toContain("private string SessionSummaryJson(TerminalSession session)");
    expect(bridgeScript).toContain('+ ",\\"outputSeq\\":" + sequence.ToString(CultureInfo.InvariantCulture) + "}"');
    expect(bridgeScript).toContain("builder.Append(this.SessionSummaryJson(session));");
  });

  it("publishes session creation atomically with the renderer catalog", () => {
    const create = bridgeScript.match(/private void CreateSession[\s\S]*?private void KillSession/);
    const publish = bridgeScript.match(/private void PublishSessionCreated[\s\S]*?private void CreateSession/);
    expect(create).toBeTruthy();
    expect(publish).toBeTruthy();
    expect(create[0]).toContain("lock (this.sessionCatalogLock)");
    expect(create[0].indexOf("this.sessions.TryAdd(id, session)"))
      .toBeLessThan(create[0].indexOf("session.Start()"));
    expect(create[0].indexOf("session.Start()"))
      .toBeLessThan(create[0].indexOf("this.PublishSessionCreated"));
    expect(publish[0]).toContain("peer.BeginOutputResume(session.Id);");
    expect(publish[0]).toContain("if (!session.Ephemeral) this.Broadcast(created, creator.Id);");
    expect(bridgeScript).toMatch(/private void BroadcastOutput[\s\S]{0,150}lock \(this\.sessionCatalogLock\)[\s\S]{0,300}this\.sessions\.TryGetValue/);
  });

  it("routes administrator sessions through the normal publication and exit lifecycle", () => {
    const elevated = bridgeScript.match(/private void AdoptElevatedSession[\s\S]*?private void SendElevateError/);
    expect(elevated).toBeTruthy();
    expect(elevated[0]).toContain('this.AttachSessionLifecycle(session, "Administrator session exited: ");');
    expect(elevated[0]).toMatch(/lock \(this\.sessionCatalogLock\)[\s\S]*?this\.sessions\.TryAdd\(id, session\);[\s\S]*?session\.AttachRemote[\s\S]*?this\.PublishSessionCreated/);
  });

  it("never lets a diagnostics read delay an output replay", () => {
    // The receive loop is a client's only reader, so a slow store read handled
    // inline stalls every message behind it, replay included.
    expect(bridgeScript).toMatch(/else if \(type == "diagnosticList"\)[\s\S]{0,400}Task\.Run\(delegate \{ this\.SendRuntimeDiagnostics\(client, listRequest\); \}\);/);
    expect(bridgeScript).toContain("private void SendRuntimeDiagnostics(BridgeClient client, Dictionary<string, string> message)");
  });

  it("reads only as far back as the requested diagnostics window", () => {
    const recent = bridgeScript.match(/public string RecentJson\(long requestedLimit\)[\s\S]*?\n        \}/);
    expect(recent).toBeTruthy();
    // Newest file first with an early stop, so the cost follows the window and
    // not the size of a store that grows every day.
    expect(recent[0]).toContain("for (int index = files.Length - 1; index >= 0; index--)");
    expect(recent[0]).toContain("if (limit > 0 && collected >= limit) break;");
    expect(recent[0]).toContain("chunks.Insert(0, fileRecords);");
  });
});
