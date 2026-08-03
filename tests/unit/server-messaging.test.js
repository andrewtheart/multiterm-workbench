/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const server = require("../../server.js");

function client() {
  return { send: vi.fn() };
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
});
