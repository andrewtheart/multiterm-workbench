/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const bridgeScript = fs.readFileSync(path.resolve(__dirname, "../../Start-MultiTerm.ps1"), "utf8");

describe("PowerShell bridge terminal messaging", () => {
  it("reports renderer presence for watchdog orphan detection", () => {
    expect(bridgeScript).toContain('if (type == "rendererPresence")');
    expect(bridgeScript).toContain("client.IsRenderer = true");
    expect(bridgeScript).toContain('"rendererClients\\":" + rendererClients');
  });

  it("supports the same configurable routing operations as the Node bridge", () => {
    for (const type of ["communicationConfig", "messageSend", "messageList", "messageAction"]) {
      expect(bridgeScript).toContain(`else if (type == "${type}")`);
    }
    expect(bridgeScript).toContain('Json.GetInt(message, "terminalMessageMaxKb"');
    expect(bridgeScript).toContain('Json.GetInt(message, "terminalInboxCapacity"');
  });

  it("stores pending messages under a lock and rejects unsupported persistence", () => {
    expect(bridgeScript).toContain("lock (this.terminalMessageLock)");
    expect(bridgeScript).toContain("this.terminalMessages[terminalMessage.Id] = terminalMessage");
    expect(bridgeScript).toContain("Durable terminal messages are not enabled yet.");
    expect(bridgeScript).toContain("The target terminal inbox is full under the configured capacity.");
  });

  it("validates and confirms insertion before removing the message", () => {
    const action = bridgeScript.match(/private void ActOnTerminalMessage[\s\S]*?private void SendMessageError/);
    expect(action).toBeTruthy();
    expect(action[0]).toContain("ContainsTerminalControl(data)");
    expect(action[0]).toContain("target.TryWrite(data)");
    expect(action[0]).toContain("this.terminalMessages.Remove(id)");
    expect(action[0]).not.toContain('data + "\\r"');
    expect(action[0].indexOf("target.TryWrite(data)"))
      .toBeLessThan(action[0].indexOf("this.terminalMessages.Remove(id)"));
  });

  it("bounds aggregate storage and expires target messages", () => {
    expect(bridgeScript).toContain("private const int MaxTerminalMessages = 500;");
    expect(bridgeScript).toContain("private const int MaxTerminalMessageStoreBytes = 4 * 1024 * 1024;");
    expect(bridgeScript).toContain("this.ExpireTerminalMessagesForSession(id)");
    expect(bridgeScript).toContain('\\"terminalMessagesExpired\\"');
  });

  it("rechecks lifecycle under the message lock and rejects unacknowledged elevated relays", () => {
    const sender = bridgeScript.match(/private void SendTerminalMessage[\s\S]*?private void ListTerminalMessages/);
    expect(sender).toBeTruthy();
    expect(sender[0].match(/this\.sessions\.TryGetValue\(sourceId/g)).toHaveLength(2);
    expect(sender[0]).toContain("target.IsRemote");
    expect(sender[0]).toContain("until confirmed delivery is supported");

    const tryWrite = bridgeScript.match(/public bool TryWrite[\s\S]*?private bool WriteCore/);
    expect(tryWrite).toBeTruthy();
    expect(tryWrite[0]).toContain("lock (this.inputLock)");
  });
});
