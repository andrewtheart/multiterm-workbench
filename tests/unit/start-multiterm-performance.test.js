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
    expect(bridgeScript).toContain("Math.Min(100, Math.Max(0, requested))");
    expect(bridgeScript).toContain('client.Send("{\\"type\\":\\"config\\",\\"outputCoalesceMs\\":"');
  });

  it("queues output once and flushes it before every exit broadcast", () => {
    expect(bridgeScript.match(/this\.QueueSessionOutput\(id, data\);/g)).toHaveLength(2);
    expect(bridgeScript.match(/this\.FlushSessionOutput\(id\);[\s\S]{0,400}this\.Broadcast\("\{\\"type\\":\\"exited/g)).toHaveLength(2);
    expect(bridgeScript.match(/this\.RemoveSessionOutputBatch\(id\);/g)).toHaveLength(2);
    expect(bridgeScript).toContain("this.outputBatches.TryRemove(id, out batch)");
    expect(bridgeScript).toContain("new Timer(delegate { this.FlushSessionOutput(id); }, null, delay, Timeout.Infinite)");
    expect(bridgeScript).toContain("if (delay <= 0)");
  });
});