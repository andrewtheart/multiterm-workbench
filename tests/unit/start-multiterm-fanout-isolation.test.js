/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

// The embedded C# has no coverage instrumentation, so each behaviour is pinned
// here AND exercised against a live bridge (see the plan's verification notes).
const bridgeScript = fs.readFileSync(path.resolve(__dirname, "../../Start-MultiTerm.ps1"), "utf8");

describe("installed bridge fan-out isolation", () => {
  it("encodes each broadcast once instead of per client", () => {
    expect(bridgeScript).toMatch(/private void Broadcast\(string message\)\s+\{\s+byte\[\] bytes = Encoding\.UTF8\.GetBytes\(message\);/);
    expect(bridgeScript).toMatch(/private void Broadcast\(string message, string excludedClientId\)\s+\{\s+byte\[\] bytes = Encoding\.UTF8\.GetBytes\(message\);/);
    expect(bridgeScript.match(/client\.SendBytes\(bytes\);/g)).toHaveLength(3);
    expect(bridgeScript).toContain("public bool SendBytes(byte[] bytes)");
  });

  it("hands every frame to one writer task per client through a FIFO", () => {
    expect(bridgeScript).toContain("private readonly Queue<OutboundFrame> queue = new Queue<OutboundFrame>();");
    expect(bridgeScript).toContain("private readonly SemaphoreSlim signal = new SemaphoreSlim(0);");
    expect(bridgeScript).toContain("Task.Factory.StartNew(new Action(this.WriteLoop), TaskCreationOptions.LongRunning);");
    expect(bridgeScript).toContain("private void EnsureWriter()");
    expect(bridgeScript).toContain("if (this.writerStarted)");
    expect(bridgeScript).toContain("frame = this.queue.Dequeue();");
  });

  it("aborts a wedged send at its deadline instead of owning the writer forever", () => {
    expect(bridgeScript).toContain("private bool WriteFrame(OutboundFrame frame)");
    expect(bridgeScript).toContain("using (CancellationTokenSource timeout = new CancellationTokenSource(this.SendTimeoutMilliseconds))");
    expect(bridgeScript).toContain("try { this.Socket.Abort(); }");
    expect(bridgeScript).toContain("private void StopWriter(string reason)");
  });

  it("bounds each client queue and never discards individual PTY frames", () => {
    expect(bridgeScript).toContain("public long BacklogLimitBytes { get; private set; }");
    expect(bridgeScript).toContain("public bool ConfigureBacklogLimitBytes(long value)");
    expect(bridgeScript).toContain("if (this.queuedBytes + bytes.Length > this.BacklogLimitBytes)");
    expect(bridgeScript).toContain('this.StopWriter("queued output reached the "');
    expect(bridgeScript).toContain("if (this.queuedBytes > this.queueHighWaterMark) this.queueHighWaterMark = this.queuedBytes;");
    expect(bridgeScript).not.toContain("this.queue.Dequeue().Bytes = null");
  });

  it("keeps acknowledged delivery for welcome, openFolder and openTerminal", () => {
    expect(bridgeScript).toContain("public bool SendAcknowledged(string message)");
    expect(bridgeScript).toContain("welcome = this.WelcomeJson(out pendingFolderCount, out pendingTerminalCount);");
    expect(bridgeScript).toContain("welcomeDelivery = client.SendAcknowledgedAsync(welcome);");
    expect(bridgeScript).toContain("if (client.WaitForAcknowledged(welcomeDelivery))");
    expect(bridgeScript).toMatch(/lock \(this\.sessionCatalogLock\)[\s\S]{0,1400}welcomeDelivery = client\.SendAcknowledgedAsync\(welcome\);\s+this\.clients\[client\.Id\] = client;\s+\}\s+if \(client\.WaitForAcknowledged/);
    expect(bridgeScript).toContain("if (target != null && target.SendAcknowledged(message))");
    expect(bridgeScript).toContain("if (target != null && target.SendAcknowledged(message)) return;");
    expect(bridgeScript).toContain("if (frame.Completion != null) frame.Completion.TrySetResult(true);");
    expect(bridgeScript).toContain("if (frame.Completion != null) frame.Completion.TrySetResult(false);");
    expect(bridgeScript).toContain("if (pending.Completion != null) pending.Completion.TrySetResult(false);");
  });

  it("negotiates the same backlog ceiling as the Node bridge, with 0 as the escape hatch", () => {
    expect(bridgeScript).toContain('Json.GetInt(message, "bridgeClientBacklogKb", BridgeClient.DefaultBacklogKb)');
    expect(bridgeScript).toContain("private static int NormalizeClientBacklogKb(int requested)");
    expect(bridgeScript).toContain("private const int MinClientBacklogKb = 64;");
    expect(bridgeScript).toContain("private const int MaxClientBacklogKb = 16384;");
    expect(bridgeScript).toContain("public const int DefaultBacklogKb = 4096;");
    expect(bridgeScript).toContain('+ ",\\"bridgeClientBacklogKb\\":" + Volatile.Read(ref this.clientBacklogKb).ToString(CultureInfo.InvariantCulture)');
    expect(bridgeScript).toContain("private bool SendSynchronously(byte[] bytes)");
    expect(bridgeScript).toContain("if (this.BacklogLimitBytes <= 0)");
    expect(bridgeScript).toContain("private readonly ReaderWriterLockSlim modeLock = new ReaderWriterLockSlim();");
    expect(bridgeScript).toContain("this.modeLock.EnterWriteLock();");
    expect(bridgeScript).toContain("this.modeLock.EnterReadLock();");
    expect(bridgeScript).toContain('this.StopWriter("acknowledged send exceeded the delivery deadline");');
    expect(bridgeScript).toContain("delivery.Status == TaskStatus.RanToCompletion && delivery.Result");
    expect(bridgeScript).toContain("return delivery.GetAwaiter().GetResult();");
    expect(bridgeScript).toContain("this.writerRetireRequested = true;");
    expect(bridgeScript).toContain("if (activeWriter.Wait(this.SendTimeoutMilliseconds)) return true;");
    expect(bridgeScript).toMatch(/else if \(this\.writerRetireRequested\)\s+\{\s+this\.BacklogLimitBytes = 0;/);
    expect(bridgeScript).toContain("this.writerTask = null;");
    expect(bridgeScript.match(/\.ConfigureBacklogLimitBytes\(/g)).toHaveLength(2);
  });

  it("uses constructor assignment because CodeDom rejects auto-property initializers", () => {
    expect(bridgeScript).toContain("this.BacklogLimitBytes = DefaultBacklogKb * 1024L;");
    expect(bridgeScript).not.toMatch(/public long BacklogLimitBytes \{ get; set; \} =/);
  });
});
