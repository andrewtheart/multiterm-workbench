/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const server = require("../../server.js");

function fakeClient() {
  return {
    buffer: Buffer.alloc(0),
    id: "client-a",
    lastPongAt: Date.now(),
    socket: { write: vi.fn(() => true), end: vi.fn(), destroy: vi.fn(), destroyed: false },
    send: vi.fn()
  };
}

function fakeSession(id = "s1") {
  return {
    id,
    pendingOutput: [],
    outputTimer: null,
    outputSeq: 0,
    replay: [],
    replayBytes: 0
  };
}

afterEach(() => {
  server.setBridgeReplayBufferKb(server.BRIDGE_REPLAY_BUFFER_DEFAULT_KB);
  server.setOutputCoalesceMs(server.OUTPUT_COALESCE_DEFAULT_MS);
  server.sessions.clear();
  server.clients.clear();
  vi.restoreAllMocks();
});

describe("replay buffer setting", () => {
  it("treats 0 as retain-nothing and clamps everything else", () => {
    expect(server.normalizeBridgeReplayBufferKb(0)).toBe(0);
    expect(server.normalizeBridgeReplayBufferKb(0.4)).toBe(0);
    expect(server.normalizeBridgeReplayBufferKb(64)).toBe(64);
    expect(server.normalizeBridgeReplayBufferKb(1)).toBe(server.BRIDGE_REPLAY_BUFFER_MIN_KB);
    expect(server.normalizeBridgeReplayBufferKb(999999)).toBe(server.BRIDGE_REPLAY_BUFFER_MAX_KB);
    expect(server.normalizeBridgeReplayBufferKb("nope")).toBe(server.BRIDGE_REPLAY_BUFFER_DEFAULT_KB);
  });

  it("reports the applied budget in bytes", () => {
    expect(server.setBridgeReplayBufferKb(32)).toBe(32);
    expect(server.getBridgeReplayBufferKb()).toBe(32);
    expect(server.replayBufferLimitBytes()).toBe(32 * 1024);
  });

  it("negotiates the budget through the existing config message", () => {
    const client = fakeClient();
    server.applyClientConfig(client, { type: "config", bridgeReplayBufferKb: 64 });
    expect(server.getBridgeReplayBufferKb()).toBe(64);
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "config",
      bridgeReplayBufferKb: 64
    }));
  });

  it("trims rings that a shrunk budget no longer fits", () => {
    const session = fakeSession();
    server.sessions.set(session.id, session);
    server.setBridgeReplayBufferKb(server.BRIDGE_REPLAY_BUFFER_MAX_KB);
    server.retainSessionOutput(session, 1, "a".repeat(20 * 1024));
    server.retainSessionOutput(session, 2, "b".repeat(20 * 1024));
    expect(session.replay).toHaveLength(2);

    server.setBridgeReplayBufferKb(server.BRIDGE_REPLAY_BUFFER_MIN_KB);

    expect(session.replay).toHaveLength(0);
    expect(session.replayBytes).toBe(0);
  });
});

describe("output sequencing", () => {
  it("numbers every output frame monotonically per session", () => {
    const client = fakeClient();
    server.clients.add(client);
    server.setOutputCoalesceMs(0);
    const session = fakeSession();

    server.queueSessionOutput(session, "one");
    server.queueSessionOutput(session, "two");

    expect(client.send.mock.calls.map(([message]) => message.seq)).toEqual([1, 2]);
    expect(session.outputSeq).toBe(2);
  });

  it("keeps a separate sequence per session", () => {
    const client = fakeClient();
    server.clients.add(client);
    server.setOutputCoalesceMs(0);
    const first = fakeSession("s1");
    const second = fakeSession("s2");

    server.queueSessionOutput(first, "a");
    server.queueSessionOutput(second, "b");
    server.queueSessionOutput(first, "c");

    expect(first.outputSeq).toBe(2);
    expect(second.outputSeq).toBe(1);
  });
});

describe("replay ring", () => {
  it("retains output up to the configured budget and drops the oldest first", () => {
    server.setBridgeReplayBufferKb(server.BRIDGE_REPLAY_BUFFER_MIN_KB);
    const session = fakeSession();

    server.retainSessionOutput(session, 1, "a".repeat(10 * 1024));
    server.retainSessionOutput(session, 2, "b".repeat(10 * 1024));

    expect(session.replay.map((entry) => entry.seq)).toEqual([2]);
    expect(session.replayBytes).toBe(10 * 1024);
    expect(server.oldestRetainedSequence(session)).toBe(2);
  });

  it("retains nothing at all when the budget is 0", () => {
    server.setBridgeReplayBufferKb(0);
    const session = fakeSession();
    server.retainSessionOutput(session, 1, "hello");
    expect(session.replay).toHaveLength(0);
    expect(server.isReplayOverBudget(session)).toBe(false);
  });

  it("reports the next sequence as the oldest when nothing is retained", () => {
    const session = fakeSession();
    session.outputSeq = 7;
    expect(server.oldestRetainedSequence(session)).toBe(8);
  });

  it("joins the retained suffix after a given sequence", () => {
    const session = fakeSession();
    server.retainSessionOutput(session, 1, "one ");
    server.retainSessionOutput(session, 2, "two ");
    server.retainSessionOutput(session, 3, "three");
    expect(server.retainedSuffix(session, 1)).toBe("two three");
    expect(server.retainedSuffix(session, 3)).toBe("");
  });
});

describe("resuming a reconnected renderer", () => {
  it("replays the complete suffix and reports the new sequence", () => {
    const client = fakeClient();
    const session = fakeSession();
    server.sessions.set(session.id, session);
    server.setOutputCoalesceMs(0);
    server.clients.add(client);
    server.queueSessionOutput(session, "first ");
    server.queueSessionOutput(session, "second");
    client.send.mockClear();

    server.resumeSessionOutput(client, { type: "resumeOutput", id: "s1", lastSeq: 1 });

    expect(client.send).toHaveBeenNthCalledWith(1, {
      type: "output", id: "s1", stream: "pty", data: "second", seq: 2, replay: true
    });
    expect(client.send).toHaveBeenNthCalledWith(2, {
      type: "outputResumed", id: "s1", seq: 2, replayedBytes: 6
    });
  });

  it("flushes buffered output so the replay cannot omit it", () => {
    const client = fakeClient();
    const session = fakeSession();
    server.sessions.set(session.id, session);
    server.setOutputCoalesceMs(50);
    server.clients.add(client);
    server.queueSessionOutput(session, "buffered");
    client.send.mockClear();

    server.resumeSessionOutput(client, { type: "resumeOutput", id: "s1", lastSeq: 0 });

    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "output", data: "buffered", replay: true
    }));
  });

  it("reports an explicit gap when the suffix has fallen out of the ring", () => {
    const client = fakeClient();
    const session = fakeSession();
    server.sessions.set(session.id, session);
    server.setBridgeReplayBufferKb(server.BRIDGE_REPLAY_BUFFER_MIN_KB);
    server.setOutputCoalesceMs(0);
    server.clients.add(client);
    server.queueSessionOutput(session, "a".repeat(10 * 1024));
    server.queueSessionOutput(session, "b".repeat(10 * 1024));
    client.send.mockClear();

    server.resumeSessionOutput(client, { type: "resumeOutput", id: "s1", lastSeq: 0 });

    expect(client.send).toHaveBeenCalledWith({
      type: "outputGap", id: "s1", reason: "retention", expected: 1, available: 2, seq: 2
    });
    expect(client.send).not.toHaveBeenCalledWith(expect.objectContaining({ replay: true }));
  });

  it("acknowledges an already-current renderer without replaying anything", () => {
    const client = fakeClient();
    const session = fakeSession();
    server.sessions.set(session.id, session);
    server.setOutputCoalesceMs(0);
    server.clients.add(client);
    server.queueSessionOutput(session, "only");
    client.send.mockClear();

    server.resumeSessionOutput(client, { type: "resumeOutput", id: "s1", lastSeq: 1 });

    expect(client.send).toHaveBeenCalledWith({ type: "outputResumed", id: "s1", seq: 1, replayedBytes: 0 });
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it("treats a nonsense or missing sequence as none received", () => {
    const client = fakeClient();
    const session = fakeSession();
    server.sessions.set(session.id, session);
    server.setOutputCoalesceMs(0);
    server.clients.add(client);
    server.queueSessionOutput(session, "hello");
    client.send.mockClear();

    server.resumeSessionOutput(client, { type: "resumeOutput", id: "s1", lastSeq: -4 });

    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "output", data: "hello", replay: true
    }));
  });

  it("reports a gap for a session this client cannot see", () => {
    const owner = fakeClient();
    const stranger = fakeClient();
    const session = fakeSession("private");
    session.ephemeral = true;
    session.ownerClient = owner;
    server.sessions.set(session.id, session);

    server.resumeSessionOutput(stranger, { type: "resumeOutput", id: "private", lastSeq: 0 });

    expect(stranger.send).toHaveBeenCalledWith({
      type: "outputGap", id: "private", reason: "unknown-session", expected: 0, available: 0, seq: 0
    });
  });

  it("is reachable over the wire as a resumeOutput message", () => {
    const client = fakeClient();
    const session = fakeSession();
    server.sessions.set(session.id, session);
    server.setOutputCoalesceMs(0);
    server.clients.add(client);
    server.queueSessionOutput(session, "wire");
    client.send.mockClear();

    server.handleClientMessage(client, JSON.stringify({ type: "resumeOutput", id: "s1", lastSeq: 0 }));

    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "output", data: "wire", replay: true
    }));
  });
});

describe("renderer replay handshake", () => {
  it("recognizes only an explicit renderer query", () => {
    expect(server.isRendererHandshake("/ws?renderer=1")).toBe(true);
    expect(server.isRendererHandshake("/ws")).toBe(false);
    expect(server.isRendererHandshake(null)).toBe(false);
    expect(server.isRendererHandshake({ toString() { throw new Error("bad url"); } })).toBe(false);
  });

  it("gates only public sessions for an identified renderer", () => {
    const publicSession = fakeSession("public");
    const privateSession = fakeSession("private");
    privateSession.ephemeral = true;
    expect([...server.initialOutputResumes("/ws?renderer=1", [publicSession, privateSession])]).toEqual(["public"]);
    expect(server.initialOutputResumes("/ws", [publicSession])).toBeNull();
  });

  it("holds live output for a pending renderer while other clients keep receiving it", () => {
    const session = fakeSession();
    const pending = fakeClient();
    const eligible = fakeClient();
    pending.pendingOutputResumes = new Set([session.id]);
    eligible.pendingOutputResumes = null;
    server.clients.add(pending);
    server.clients.add(eligible);
    const message = { type: "output", id: session.id, data: "live", seq: 3 };

    server.broadcastSessionOutput(session, message);

    expect(pending.send).not.toHaveBeenCalled();
    expect(eligible.send).toHaveBeenCalledWith(message);
    expect(server.shouldGateSessionOutput(pending, session.id)).toBe(true);
    expect(server.shouldGateSessionOutput(eligible, session.id)).toBe(false);
    server.completeOutputResume(pending, session.id);
    expect(pending.pendingOutputResumes.has(session.id)).toBe(false);
  });

  it("encodes one live frame and shares it across eligible fast clients", () => {
    const session = fakeSession();
    const first = fakeClient();
    const second = fakeClient();
    first.sendFrame = vi.fn();
    second.sendFrame = vi.fn();
    server.clients.add(first);
    server.clients.add(second);

    server.broadcastSessionOutput(session, { type: "output", id: session.id, data: "live", seq: 2 });

    expect(first.sendFrame).toHaveBeenCalledTimes(1);
    expect(second.sendFrame).toHaveBeenCalledTimes(1);
    expect(second.sendFrame.mock.calls[0][0]).toBe(first.sendFrame.mock.calls[0][0]);
  });
});
