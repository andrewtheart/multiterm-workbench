/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const server = require("../../server.js");

function client(id = "test-client") {
  return { id, send: vi.fn() };
}

function session(id, title) {
  return {
    id,
    title,
    terminal: { pid: id === "source001" ? 101 : 202, write: vi.fn() },
    exited: false,
    killed: false
  };
}

beforeEach(() => {
  server.sessions.clear();
  server.clients.clear();
  server.terminalMessages.clear();
  server.sessions.set("source001", session("source001", "Builder"));
  server.sessions.set("target001", session("target001", "Tests"));
  server.applyCommunicationConfig(client(), {
    terminalInboxCapacity: 500,
    terminalMessageMaxKb: 64
  });
});

afterEach(() => {
  server.sessions.clear();
  server.clients.clear();
  server.terminalMessages.clear();
});

describe("Node bridge terminal messaging", () => {
  it("keeps the last communication limits when replacements are invalid", () => {
    const receiver = client();
    server.applyCommunicationConfig(receiver, {
      terminalInboxCapacity: -1,
      terminalMessageMaxKb: 0
    });

    expect(receiver.send).toHaveBeenCalledWith({
      type: "communicationConfig",
      terminalInboxCapacity: 500,
      terminalMessageMaxKb: 64
    });
  });

  it("stores and broadcasts a validated same-instance message", () => {
    const sender = client();
    const observer = client();
    server.clients.add(observer);

    server.sendTerminalMessage(sender, {
      type: "messageSend",
      requestId: "request-1",
      kind: "command",
      sourceId: "source001",
      targetId: "target001",
      text: "npm test"
    });

    expect(server.terminalMessages.size).toBe(1);
    const message = [...server.terminalMessages.values()][0];
    expect(message).toMatchObject({
      kind: "command",
      sourceId: "source001",
      sourceTitle: "Builder",
      state: "pending",
      targetId: "target001",
      targetTitle: "Tests",
      text: "npm test"
    });
    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageSent",
      requestId: "request-1"
    }));
    expect(observer.send).toHaveBeenCalledWith({ type: "terminalMessage", message });
  });

  it("lists pending messages and inserts without pressing Enter", () => {
    const sender = client();
    server.sendTerminalMessage(sender, {
      kind: "command",
      sourceId: "source001",
      targetId: "target001",
      text: "npm test"
    });
    const message = [...server.terminalMessages.values()][0];

    const listing = client();
    server.listTerminalMessages(listing, { requestId: "list-1" });
    expect(listing.send).toHaveBeenCalledWith({
      type: "terminalMessages",
      requestId: "list-1",
      messages: [message]
    });

    const actor = client();
    server.actOnTerminalMessage(actor, { requestId: "action-1", id: message.id, action: "insert" });
    expect(server.sessions.get("target001").terminal.write).toHaveBeenCalledWith("npm test");
    expect(server.sessions.get("target001").terminal.write.mock.calls[0][0]).not.toMatch(/[\r\n]$/);
    expect(server.terminalMessages.size).toBe(0);
    expect(actor.send).toHaveBeenCalledWith({
      type: "messageActionResult",
      requestId: "action-1",
      id: message.id,
      state: "inserted"
    });
  });

  it("claims readiness handoffs atomically and releases them without bridge-side input", () => {
    server.sendTerminalMessage(client("sender"), {
      delivery: "whenReady",
      kind: "task",
      sourceId: "source001",
      targetId: "target001",
      text: "Run focused tests.\nReturn changed files."
    });
    const message = [...server.terminalMessages.values()][0];
    expect(message.delivery).toBe("whenReady");

    const owner = client("renderer-a");
    server.actOnTerminalMessage(owner, { requestId: "claim-1", id: message.id, action: "claim" });
    expect(message.state).toBe("claimed");
    expect(owner.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageActionResult",
      requestId: "claim-1",
      state: "claimed",
      message: expect.objectContaining({ text: "Run focused tests.\nReturn changed files." })
    }));
    expect(server.sessions.get("target001").terminal.write).not.toHaveBeenCalled();

    const other = client("renderer-b");
    server.actOnTerminalMessage(other, { requestId: "claim-2", id: message.id, action: "claim" });
    expect(other.send).toHaveBeenCalledWith(expect.objectContaining({ type: "messageError" }));

    server.actOnTerminalMessage(owner, { requestId: "release-1", id: message.id, action: "release" });
    expect(message.state).toBe("pending");
    server.actOnTerminalMessage(owner, { requestId: "claim-3", id: message.id, action: "claim" });
    server.actOnTerminalMessage(owner, { requestId: "release-2", id: message.id, action: "release" });
    expect(message.state).toBe("pending");
  });

  it("atomically stages a claimed handoff and consumes it only after the PTY write", () => {
    server.sendTerminalMessage(client("sender"), {
      delivery: "whenReady",
      kind: "task",
      sourceId: "source001",
      targetId: "target001",
      text: "Run focused tests"
    });
    const message = [...server.terminalMessages.values()][0];
    const owner = client("renderer-deliver");
    server.actOnTerminalMessage(owner, { id: message.id, action: "claim" });
    server.actOnTerminalMessage(owner, {
      requestId: "deliver-1",
      id: message.id,
      action: "deliver",
      data: "Run focused tests"
    });

    expect(server.sessions.get("target001").terminal.write).toHaveBeenCalledWith("Run focused tests");
    expect(server.terminalMessages.has(message.id)).toBe(false);
    expect(owner.send).toHaveBeenLastCalledWith({
      type: "messageActionResult",
      requestId: "deliver-1",
      id: message.id,
      state: "completed"
    });
  });

  it("keeps a claim when atomic delivery contains an Enter key", () => {
    server.sendTerminalMessage(client("sender"), {
      delivery: "whenReady",
      kind: "task",
      sourceId: "source001",
      targetId: "target001",
      text: "Run focused tests"
    });
    const message = [...server.terminalMessages.values()][0];
    const owner = client("renderer-no-enter");
    server.actOnTerminalMessage(owner, { id: message.id, action: "claim" });
    server.actOnTerminalMessage(owner, { id: message.id, action: "deliver", data: "Run focused tests\r" });

    expect(server.sessions.get("target001").terminal.write).not.toHaveBeenCalled();
    expect(server.terminalMessages.has(message.id)).toBe(true);
    expect(message.state).toBe("claimed");
  });

  it("rejects invalid readiness claims, foreign ownership, and unavailable delivery targets", () => {
    server.sendTerminalMessage(client("sender"), {
      kind: "text",
      sourceId: "source001",
      targetId: "target001",
      text: "ordinary message"
    });
    const ordinary = [...server.terminalMessages.values()][0];
    const actor = client("renderer-a");
    server.actOnTerminalMessage(actor, { requestId: "ordinary-claim", id: ordinary.id, action: "claim" });
    expect(actor.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining("not available") }));

    server.terminalMessages.clear();
    server.sendTerminalMessage(client("sender"), {
      delivery: "whenReady",
      kind: "task",
      sourceId: "source001",
      targetId: "target001",
      text: "claimed task"
    });
    const claimed = [...server.terminalMessages.values()][0];
    const anonymous = client();
    delete anonymous.id;
    server.actOnTerminalMessage(anonymous, { id: claimed.id, action: "claim" });

    const foreign = client("renderer-b");
    server.actOnTerminalMessage(foreign, { requestId: "foreign-release", id: claimed.id, action: "release" });
    server.actOnTerminalMessage(foreign, { requestId: "foreign-deliver", id: claimed.id, action: "deliver", data: "safe" });
    expect(foreign.send).toHaveBeenCalledTimes(2);
    expect(foreign.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining("no longer owned") }));

    server.sessions.delete("target001");
    server.actOnTerminalMessage(anonymous, { requestId: "missing-target", id: claimed.id, action: "deliver", data: "safe" });
    expect(anonymous.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("could not be staged") }));
    expect(server.terminalMessages.has(claimed.id)).toBe(true);

    server.sessions.set("target001", session("target001", "Tests"));
    server.actOnTerminalMessage(anonymous, { id: claimed.id, action: "release" });
    claimed.state = "claimed";
    server.actOnTerminalMessage(anonymous, { requestId: "claimed-insert", id: claimed.id, action: "insert" });
    expect(anonymous.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining("no longer pending") }));
  });

  it("validates plain and bracketed readiness payload boundaries", () => {
    expect(server.validateReadinessPasteData(null)).toBeNull();
    expect(server.validateReadinessPasteData("")).toBeNull();
    expect(server.validateReadinessPasteData("   ")).toBeNull();
    expect(server.validateReadinessPasteData("plain text")).toBe("plain text");
    expect(server.validateReadinessPasteData("plain\ntext")).toBeNull();
    expect(server.validateReadinessPasteData("\u001b[200~line one\nline two\u001b[201~"))
      .toBe("\u001b[200~line one\nline two\u001b[201~");
    expect(server.validateReadinessPasteData("\u001b[200~\u0007bell\u001b[201~")).toBeNull();
    expect(server.validateReadinessPasteData("x".repeat((64 * 1024) + 13))).toBeNull();
  });

  it("does not resurrect a delivered handoff when its acknowledgement is lost", () => {
    server.sendTerminalMessage(client("sender"), {
      delivery: "whenReady",
      kind: "task",
      sourceId: "source001",
      targetId: "target001",
      text: "Run focused tests"
    });
    const message = [...server.terminalMessages.values()][0];
    const owner = client("renderer-lost-ack");
    server.actOnTerminalMessage(owner, { id: message.id, action: "claim" });
    owner.send.mockImplementationOnce(() => {
      throw new Error("socket closed before acknowledgement");
    });

    expect(() => server.actOnTerminalMessage(owner, {
      id: message.id,
      action: "deliver",
      data: "\u001b[200~Run focused\ntests\u001b[201~"
    })).toThrow(/socket closed/i);
    expect(server.sessions.get("target001").terminal.write).toHaveBeenCalledTimes(1);
    expect(server.terminalMessages.has(message.id)).toBe(false);
  });

  it("returns expired readiness claims to the pending inbox", () => {
    server.sendTerminalMessage(client("sender"), {
      delivery: "whenReady",
      kind: "task",
      sourceId: "source001",
      targetId: "target001",
      text: "Continue the investigation"
    });
    const message = [...server.terminalMessages.values()][0];
    server.actOnTerminalMessage(client("renderer-a"), { id: message.id, action: "claim" });
    message.claimUntil = Date.now() - 1;
    expect(server.releaseExpiredTerminalMessageClaims()).toEqual([message]);
    expect(message.state).toBe("pending");
  });

  it("extracts path and status insertion content without adding controls", () => {
    expect(server.terminalMessageInsertText({ kind: "path", path: "D:\\artifact.zip" }))
      .toBe("D:\\artifact.zip");
    expect(server.terminalMessageInsertText({ kind: "status", status: "ready", text: "" }))
      .toBe("ready");
    expect(server.terminalMessageInsertText({ kind: "status", status: "ready", text: "Listening" }))
      .toBe("Listening");
  });

  it("dismisses messages without writing to the target", () => {
    server.sendTerminalMessage(client(), {
      kind: "text",
      sourceId: "source001",
      targetId: "target001",
      text: "Review complete"
    });
    const message = [...server.terminalMessages.values()][0];

    server.actOnTerminalMessage(client(), { id: message.id, action: "dismiss" });
    expect(server.sessions.get("target001").terminal.write).not.toHaveBeenCalled();
    expect(server.terminalMessages.size).toBe(0);
  });

  it("keeps a message pending when the target cannot accept the write", () => {
    server.sendTerminalMessage(client(), {
      kind: "command",
      sourceId: "source001",
      targetId: "target001",
      text: "npm test"
    });
    const message = [...server.terminalMessages.values()][0];
    server.sessions.get("target001").closing = true;

    const actor = client();
    server.actOnTerminalMessage(actor, { id: message.id, action: "insert" });

    expect(server.sessions.get("target001").terminal.write).not.toHaveBeenCalled();
    expect(server.terminalMessages.has(message.id)).toBe(true);
    expect(actor.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageError",
      message: expect.stringMatching(/unavailable/i)
    }));
  });

  it("keeps a message pending when the final PTY write throws", () => {
    server.sendTerminalMessage(client(), {
      kind: "command",
      sourceId: "source001",
      targetId: "target001",
      text: "npm test"
    });
    const message = [...server.terminalMessages.values()][0];
    server.sessions.get("target001").terminal.write.mockImplementation(() => {
      throw new Error("PTY closed");
    });

    const actor = client();
    server.actOnTerminalMessage(actor, { id: message.id, action: "insert" });

    expect(server.terminalMessages.has(message.id)).toBe(true);
    expect(actor.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageError",
      message: expect.stringMatching(/unavailable/i)
    }));
  });

  it.each(["\r", "\n", "\t", "\u001b[A", "\u007f", "\u0085"])(
    "refuses to insert stored terminal control %j",
    (control) => {
      const message = {
        createdAt: new Date().toISOString(),
        id: `unsafe-${control.codePointAt(0)}`,
        kind: "command",
        path: "",
        persist: false,
        sourceId: "source001",
        sourceTitle: "Builder",
        state: "pending",
        status: "",
        targetId: "target001",
        targetTitle: "Tests",
        text: `Write-Output safe${control}Write-Output unsafe`
      };
      server.terminalMessages.set(message.id, message);

      const actor = client();
      server.actOnTerminalMessage(actor, { requestId: "unsafe-action", id: message.id, action: "insert" });

      expect(server.sessions.get("target001").terminal.write).not.toHaveBeenCalled();
      expect(server.terminalMessages.has(message.id)).toBe(true);
      expect(actor.send).toHaveBeenCalledWith(expect.objectContaining({
        type: "messageError",
        message: expect.stringMatching(/control characters/i)
      }));
    }
  );

  it("enforces user-configured payload and inbox limits", () => {
    server.applyCommunicationConfig(client(), {
      terminalInboxCapacity: 1,
      terminalMessageMaxKb: 1
    });
    server.sendTerminalMessage(client(), {
      kind: "text",
      sourceId: "source001",
      targetId: "target001",
      text: "first"
    });

    const full = client();
    server.sendTerminalMessage(full, {
      kind: "text",
      sourceId: "source001",
      targetId: "target001",
      text: "second"
    });
    expect(full.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageError",
      message: expect.stringMatching(/inbox is full/i)
    }));

    server.terminalMessages.clear();
    const oversized = client();
    server.sendTerminalMessage(oversized, {
      kind: "text",
      sourceId: "source001",
      targetId: "target001",
      text: "x".repeat(1025)
    });
    expect(oversized.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageError",
      message: expect.stringMatching(/configured/i)
    }));
  });

  it("counts claimed handoffs against the configured target capacity", () => {
    server.applyCommunicationConfig(client(), {
      terminalInboxCapacity: 1,
      terminalMessageMaxKb: 64
    });
    server.sendTerminalMessage(client(), {
      delivery: "whenReady",
      kind: "task",
      sourceId: "source001",
      targetId: "target001",
      text: "First"
    });
    const message = [...server.terminalMessages.values()][0];
    server.actOnTerminalMessage(client("renderer-a"), { id: message.id, action: "claim" });

    const full = client();
    server.sendTerminalMessage(full, {
      delivery: "whenReady",
      kind: "task",
      sourceId: "source001",
      targetId: "target001",
      text: "Second"
    });
    expect(full.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageError",
      message: expect.stringMatching(/inbox is full/i)
    }));
  });

  it("enforces the aggregate store ceiling even when per-target capacity is unlimited", () => {
    server.applyCommunicationConfig(client(), {
      terminalInboxCapacity: 0,
      terminalMessageMaxKb: 64
    });
    for (let index = 0; index < server.maxTerminalMessages; index += 1) {
      server.terminalMessages.set(`stored-${index}`, {
        id: `stored-${index}`,
        state: "pending",
        targetId: "target001",
        text: "x"
      });
    }

    const rejected = client();
    server.sendTerminalMessage(rejected, {
      kind: "text",
      sourceId: "source001",
      targetId: "target001",
      text: "one too many"
    });

    expect(server.terminalMessages.size).toBe(server.maxTerminalMessages);
    expect(rejected.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageError",
      message: expect.stringMatching(/global safety limit/i)
    }));
  });

  it("enforces the aggregate byte ceiling independently of message count", () => {
    server.terminalMessages.set("large-pending-message", {
      id: "large-pending-message",
      state: "pending",
      targetId: "target001",
      text: "x".repeat(server.maxTerminalMessageStoreBytes - 512)
    });

    const rejected = client();
    server.sendTerminalMessage(rejected, {
      kind: "text",
      sourceId: "source001",
      targetId: "target001",
      text: "y".repeat(1024)
    });

    expect(server.terminalMessages.size).toBe(1);
    expect(rejected.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageError",
      message: expect.stringMatching(/global safety limit/i)
    }));
  });

  it("expires pending messages when their target session exits", () => {
    const observer = client();
    server.clients.add(observer);
    server.sendTerminalMessage(client(), {
      kind: "text",
      sourceId: "source001",
      targetId: "target001",
      text: "stale handoff"
    });
    const message = [...server.terminalMessages.values()][0];

    expect(server.expireTerminalMessagesForSession("target001")).toEqual([message.id]);
    expect(server.terminalMessages.size).toBe(0);
    expect(observer.send).toHaveBeenLastCalledWith({
      type: "terminalMessagesExpired",
      ids: [message.id],
      state: "expired"
    });
  });

  it("does not broadcast expiry when no target messages exist", () => {
    const observer = client();
    server.clients.add(observer);
    server.terminalMessages.set("other-target", {
      id: "other-target",
      state: "pending",
      targetId: "source001",
      text: "keep"
    });

    expect(server.expireTerminalMessagesForSession("target001")).toEqual([]);
    expect(server.terminalMessages.has("other-target")).toBe(true);
    expect(observer.send).not.toHaveBeenCalled();
  });

  it("rejects durable, missing-session, stale, and unsupported actions", () => {
    const durable = client();
    server.sendTerminalMessage(durable, {
      kind: "task",
      persist: true,
      sourceId: "source001",
      targetId: "target001",
      text: "Review updater"
    });
    expect(durable.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/not enabled/i) }));

    const missing = client();
    server.sendTerminalMessage(missing, {
      kind: "text",
      sourceId: "source001",
      targetId: "missing01",
      text: "hello"
    });
    expect(missing.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/must be live/i) }));

    const stale = client();
    server.actOnTerminalMessage(stale, { id: "missing", action: "insert" });
    expect(stale.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/no longer pending/i) }));

    server.sendTerminalMessage(client(), {
      kind: "text",
      sourceId: "source001",
      targetId: "target001",
      text: "hello"
    });
    const message = [...server.terminalMessages.values()][0];
    const unsupported = client();
    server.actOnTerminalMessage(unsupported, { id: message.id, action: "run" });
    expect(unsupported.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/unsupported/i) }));
    expect(server.terminalMessages.has(message.id)).toBe(true);
  });

  it("rejects elevated relay targets that cannot acknowledge PTY delivery", () => {
    server.sessions.get("target001").elevated = true;
    const sender = client();

    server.sendTerminalMessage(sender, {
      kind: "command",
      sourceId: "source001",
      targetId: "target001",
      text: "whoami"
    });

    expect(server.terminalMessages.size).toBe(0);
    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageError",
      message: expect.stringMatching(/elevated relay/i)
    }));
  });

  it("fails closed on malformed requests and normalizes non-string request IDs", () => {
    const malformed = client();
    server.sendTerminalMessage(malformed, {
      requestId: 42,
      kind: "unknown",
      sourceId: "source001",
      targetId: "target001",
      text: "hello"
    });
    expect(malformed.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageError",
      requestId: ""
    }));

    const listing = client();
    server.listTerminalMessages(listing, { requestId: 42 });
    expect(listing.send).toHaveBeenCalledWith({
      type: "terminalMessages",
      requestId: "",
      messages: []
    });

    const malformedAction = client();
    server.actOnTerminalMessage(malformedAction, { requestId: 42, id: 42, action: 42 });
    expect(malformedAction.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "messageError",
      requestId: ""
    }));
  });

  it("dispatches all messaging protocol operations through the bridge handler", () => {
    const dispatcher = client();
    server.handleClientMessage(dispatcher, JSON.stringify({
      type: "communicationConfig",
      terminalInboxCapacity: 500,
      terminalMessageMaxKb: 64
    }));
    server.handleClientMessage(dispatcher, JSON.stringify({
      type: "messageSend",
      kind: "text",
      sourceId: "source001",
      targetId: "target001",
      text: "dispatch"
    }));
    const message = [...server.terminalMessages.values()][0];
    server.handleClientMessage(dispatcher, JSON.stringify({ type: "messageList" }));
    server.handleClientMessage(dispatcher, JSON.stringify({
      type: "messageAction",
      id: message.id,
      action: "dismiss"
    }));

    const types = dispatcher.send.mock.calls.map(([entry]) => entry.type);
    expect(types).toEqual(expect.arrayContaining([
      "communicationConfig",
      "messageSent",
      "terminalMessages",
      "messageActionResult"
    ]));
  });

  it("reports normalized Windows workstation lock state", async () => {
    const unlockedExec = vi.fn((file, args, options, callback) => callback(null, "unlocked\r\n", ""));
    const invalidExec = vi.fn((file, args, options, callback) => callback(null, "surprising", ""));
    const failedExec = vi.fn((file, args, options, callback) => callback(new Error("WTS unavailable"), "", ""));

    if (process.platform === "win32") {
      await expect(server.queryMachineLockState(unlockedExec)).resolves.toBe("unlocked");
      await expect(server.queryMachineLockState(invalidExec)).resolves.toBe("unknown");
      await expect(server.queryMachineLockState(failedExec)).resolves.toBe("unknown");
      expect(unlockedExec.mock.calls[0][1]).toContain("-NonInteractive");
    } else {
      await expect(server.queryMachineLockState(unlockedExec)).resolves.toBe("unknown");
      expect(unlockedExec).not.toHaveBeenCalled();
    }

    const bridgeClient = client("lock-state-client");
    await server.sendMachineLockState(bridgeClient, { requestId: "lock-state-1" }, unlockedExec);
    expect(bridgeClient.send).toHaveBeenCalledWith({
      type: "machineLockState",
      requestId: "lock-state-1",
      state: process.platform === "win32" ? "unlocked" : "unknown"
    });
  });

  it("grants the scheduler lease to only one renderer at a time", () => {
    const first = client("renderer-first");
    const second = client("renderer-second");

    server.handleAutomationLease(first, { requestId: "lease-1", action: "acquire", ttlMs: 4000 });
    server.handleAutomationLease(second, { requestId: "lease-2", action: "acquire", ttlMs: 4000 });
    expect(first.send).toHaveBeenLastCalledWith(expect.objectContaining({ type: "automationLease", acquired: true }));
    expect(second.send).toHaveBeenLastCalledWith(expect.objectContaining({ type: "automationLease", acquired: false }));

    server.handleAutomationLease(first, { action: "release" });
    server.handleAutomationLease(second, { requestId: "lease-3", action: "acquire", ttlMs: 4000 });
    expect(second.send).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "automationLease",
      requestId: "lease-3",
      acquired: true
    }));
    server.handleAutomationLease(second, { action: "release" });
  });

  it("dispatches scheduler lease acquisition and ignores a foreign release", () => {
    const owner = client("lease-owner");
    const foreign = client("lease-foreign");
    server.handleClientMessage(owner, JSON.stringify({
      type: "automationLease",
      requestId: "lease-dispatch",
      action: "acquire",
      ttlMs: 1
    }));
    expect(owner.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "automationLease",
      requestId: "lease-dispatch",
      acquired: true
    }));
    server.handleAutomationLease(foreign, { requestId: "foreign-release", action: "release" });
    expect(foreign.send).toHaveBeenCalledWith(expect.objectContaining({ released: false }));
    server.releaseAutomationLease(foreign);
    server.releaseAutomationLease(owner);
    server.handleAutomationLease(foreign, { requestId: "after-release", action: "acquire", ttlMs: 4000 });
    expect(foreign.send).toHaveBeenLastCalledWith(expect.objectContaining({ acquired: true }));
    server.handleAutomationLease(owner, { action: "release" });
    server.handleAutomationLease(foreign, { action: "release" });
  });

  it("rejects malformed or stale automation occurrence claims", () => {
    const owner = client("occurrence-owner");
    server.handleAutomationLease(owner, { action: "acquire", ttlMs: 4000 });
    for (const message of [
      { ruleId: "short", dueAt: "2026-08-07T00:00:00Z" },
      { ruleId: "valid-rule-id", dueAt: "not-a-date" },
      { ruleId: 42, dueAt: "2026-08-07T00:00:00Z" }
    ]) {
      server.handleAutomationLease(owner, { requestId: "invalid-occurrence", action: "claimOccurrence", ...message });
      expect(owner.send).toHaveBeenLastCalledWith(expect.objectContaining({ occurrenceClaimed: false }));
    }
    server.handleAutomationLease(owner, { action: "release" });
  });

  it("fences a due occurrence after lease ownership changes", () => {
    const first = client("renderer-occurrence-first");
    const second = client("renderer-occurrence-second");
    const dueAt = "2026-08-04T13:00:00.000Z";

    server.handleAutomationLease(first, { action: "acquire", ttlMs: 4000 });
    server.handleAutomationLease(first, {
      requestId: "occurrence-1",
      action: "claimOccurrence",
      ruleId: "automation-fence1",
      dueAt
    });
    expect(first.send).toHaveBeenLastCalledWith(expect.objectContaining({ occurrenceClaimed: true }));

    server.handleAutomationLease(first, { action: "release" });
    server.handleAutomationLease(second, { action: "acquire", ttlMs: 4000 });
    server.handleAutomationLease(second, {
      requestId: "occurrence-2",
      action: "claimOccurrence",
      ruleId: "automation-fence1",
      dueAt
    });
    expect(second.send).toHaveBeenLastCalledWith(expect.objectContaining({ occurrenceClaimed: false }));
    server.handleAutomationLease(second, { action: "release" });
  });
});
