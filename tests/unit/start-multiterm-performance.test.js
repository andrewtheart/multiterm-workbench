/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const bridgeScript = fs.readFileSync(path.resolve(__dirname, "../../Start-MultiTerm.ps1"), "utf8");

describe("PowerShell bridge output performance", () => {
  it("honors the renderer's configurable output batching setting", () => {
    expect(bridgeScript).toContain('else if (type == "config")');
    expect(bridgeScript).toContain('Json.GetInt(message, "outputCoalesceMs", 8)');
    expect(bridgeScript).toContain('this.SetOutputCoalesceMs(Json.GetInt(message, "outputCoalesceMs", 8));');
    expect(bridgeScript).toContain("private readonly ReaderWriterLockSlim outputCoalesceLock = new ReaderWriterLockSlim();");
    expect(bridgeScript).toContain("if (next == 0 && this.outputCoalesceMs > 0)");
    expect(bridgeScript).toContain("foreach (string sessionId in this.outputBatches.Keys) this.FlushSessionOutput(sessionId);");
    expect(bridgeScript).toContain("client.Send(this.ActiveConfigJson(client));");
  });

  it("bounds client sends with the visible bridge response timeout", () => {
    expect(bridgeScript).toContain('Json.GetInt(message, "bridgeHeartbeatTimeoutSeconds", 30)');
    expect(bridgeScript).toContain("client.SendTimeoutMilliseconds = Math.Min(300, Math.Max(10, requestedHeartbeatTimeout)) * 1000;");
    expect(bridgeScript).toContain("this.SendTimeoutMilliseconds = 30000;");
    expect(bridgeScript).toContain("public int SendTimeoutMilliseconds { get; set; }");
    expect(bridgeScript).toContain("new CancellationTokenSource(this.SendTimeoutMilliseconds)");
    expect(bridgeScript).toContain("timeout.Token).GetAwaiter().GetResult()");
  });

  it("queues output once and flushes it before every exit broadcast", () => {
    expect(bridgeScript.match(/this\.QueueSessionOutput\(id, data\);/g)).toHaveLength(1);
    expect(bridgeScript.match(/this\.FlushSessionOutput\(id\);[\s\S]{0,500}this\.(?:Broadcast|SendSession(?:Exit)?Frame)\(/g)).toHaveLength(1);
    expect(bridgeScript.match(/this\.RemoveSessionOutputBatch\(id\);/g)).toHaveLength(1);
    expect(bridgeScript).toContain("this.outputBatches.TryRemove(id, out batch)");
    expect(bridgeScript).toContain("new Timer(delegate { this.FlushSessionOutput(id); }, null, delay, Timeout.Infinite)");
    expect(bridgeScript).toContain("private void SendSessionFrame(TerminalSession session, string message)");
    expect(bridgeScript).toContain("if (session.Ephemeral) continue;");
    expect(bridgeScript).toContain("this.CloseEphemeralSessions(client.Id);");
    expect(bridgeScript).toContain("this.clients.TryGetValue(session.OwnerClientId, out owner)");
    expect(bridgeScript).toContain("if (delay <= 0)");
  });

  it("holds the catalog lock while claiming and publishing a batch", () => {
    const flush = bridgeScript.match(/private void FlushSessionOutput[\s\S]*?private void BroadcastOutput/);
    expect(flush).toBeTruthy();
    expect(flush[0]).toMatch(/lock \(this\.sessionCatalogLock\)[\s\S]*?lock \(batch\.Sync\)[\s\S]*?if \(data != null\) this\.BroadcastOutput\(id, data\);/);
    expect(flush[0].indexOf("lock (this.sessionCatalogLock)"))
      .toBeLessThan(flush[0].indexOf("lock (batch.Sync)"));
    expect(flush[0].indexOf("lock (batch.Sync)"))
      .toBeLessThan(flush[0].indexOf("this.BroadcastOutput(id, data)"));
  });

  it("drains the ConPTY output task before raising the exit event", () => {
    const output = bridgeScript.match(/private void StartOutputLoop[\s\S]*?private void DisposeHandles/);
    expect(output).toBeTruthy();
    expect(output[0]).toContain("this.outputTask = Task.Run");
    expect(output[0]).toContain("while (true)");
    expect(output[0]).toContain("this.ClosePseudoConsoleForOutputDrain();");
    expect(output[0]).toContain("output.GetAwaiter().GetResult()");
    expect(output[0]).not.toContain("output.Wait(");
    expect(output[0].indexOf("output.GetAwaiter().GetResult()"))
      .toBeLessThan(output[0].indexOf("Action<int> handler = this.Exited"));
    expect(output[0].indexOf("this.DisposeHandles()"))
      .toBeLessThan(output[0].indexOf("Action<int> handler = this.Exited"));
  });
});