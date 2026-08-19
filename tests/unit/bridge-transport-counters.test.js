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

const server = require("../../src/server.js");

function maskFrame(payload, opcode = 0x1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const mask = Buffer.from([1, 2, 3, 4]);
  const header = Buffer.from([0x80 | opcode, 0x80 | data.length]);
  const masked = Buffer.alloc(data.length);
  for (let index = 0; index < data.length; index += 1) {
    masked[index] = data[index] ^ mask[index % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

function meteredClient(id = "client-a") {
  return {
    backlogged: false,
    buffer: Buffer.alloc(0),
    id,
    lastPongAt: Date.now(),
    lastPingAt: 0,
    heartbeatRttMs: 0,
    queue: [],
    queuedBytes: 0,
    queueHighWaterMark: 0,
    socket: { write: vi.fn(() => true), end: vi.fn(), destroy: vi.fn(), destroyed: false },
    send: vi.fn()
  };
}

function meteredSession(id = "s1") {
  return { id, pendingOutput: [], outputTimer: null, outputSeq: 0, replay: [], replayBytes: 0 };
}

afterEach(() => {
  server.__resetBridgeTransportCounters();
  server.setBridgeReplayBufferKb(server.BRIDGE_REPLAY_BUFFER_DEFAULT_KB);
  server.setOutputCoalesceMs(server.OUTPUT_COALESCE_DEFAULT_MS);
  server.setBridgeHeartbeatSeconds(server.BRIDGE_HEARTBEAT_DEFAULT_SECONDS);
  server.sessions.clear();
  server.clients.clear();
  vi.restoreAllMocks();
});

describe("transport counters", () => {
  it("starts at zero for a bridge that has done nothing", () => {
    expect(server.bridgeTransportSnapshot()).toEqual({
      clients: 0,
      queuedBytes: 0,
      queueHighWaterMarkBytes: 0,
      heartbeatRttMs: 0,
      replayedBytes: 0,
      outputGaps: 0,
      forcedDisconnects: 0
    });
  });

  it("sums queued bytes and reports the highest water mark across clients", () => {
    const light = meteredClient("light");
    const heavy = meteredClient("heavy");
    light.queuedBytes = 100;
    light.queueHighWaterMark = 400;
    heavy.queuedBytes = 250;
    heavy.queueHighWaterMark = 900;
    server.clients.add(light);
    server.clients.add(heavy);

    const snapshot = server.bridgeTransportSnapshot();

    expect(snapshot.clients).toBe(2);
    expect(snapshot.queuedBytes).toBe(350);
    expect(snapshot.queueHighWaterMarkBytes).toBe(900);
  });

  // A client fake from an older test double has no counters; a missing number
  // must not poison the totals with NaN.
  it("treats a client without counters as contributing nothing", () => {
    server.clients.add({ id: "bare", socket: {}, send: vi.fn() });
    const snapshot = server.bridgeTransportSnapshot();
    expect(snapshot.queuedBytes).toBe(0);
    expect(snapshot.queueHighWaterMarkBytes).toBe(0);
    expect(server.clientCounterValue(undefined)).toBe(0);
    expect(server.clientCounterValue(12)).toBe(12);
  });

  it("counts a forced disconnect", () => {
    const client = meteredClient();
    server.clients.add(client);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    server.dropClient(client, "test");

    expect(server.bridgeTransportSnapshot().forcedDisconnects).toBe(1);
  });

  it("counts replayed bytes when a client resumes", () => {
    const client = meteredClient();
    const session = meteredSession();
    server.sessions.set(session.id, session);
    server.setOutputCoalesceMs(0);
    server.clients.add(client);
    server.queueSessionOutput(session, "replayed");

    server.resumeSessionOutput(client, { type: "resumeOutput", id: "s1", lastSeq: 0 });

    expect(server.bridgeTransportSnapshot().replayedBytes).toBe(8);
  });

  it("counts a gap the ring could not bridge", () => {
    const client = meteredClient();
    const session = meteredSession();
    server.sessions.set(session.id, session);
    server.setBridgeReplayBufferKb(server.BRIDGE_REPLAY_BUFFER_MIN_KB);
    server.setOutputCoalesceMs(0);
    server.clients.add(client);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.queueSessionOutput(session, "a".repeat(10 * 1024));
    server.queueSessionOutput(session, "b".repeat(10 * 1024));

    server.resumeSessionOutput(client, { type: "resumeOutput", id: "s1", lastSeq: 0 });

    const snapshot = server.bridgeTransportSnapshot();
    expect(snapshot.outputGaps).toBe(1);
    expect(snapshot.replayedBytes).toBe(0);
  });
});

describe("heartbeat round-trip time", () => {
  it("is measured from the ping the client answered", () => {
    const client = meteredClient();
    server.setBridgeHeartbeatSeconds(30);
    server.pingClient(client);
    expect(client.lastPingAt).toBeGreaterThan(0);

    server.readFrames(client, maskFrame("", 0xA));

    expect(client.heartbeatRttMs).toBeGreaterThanOrEqual(0);
    server.clients.add(client);
    expect(server.bridgeTransportSnapshot().heartbeatRttMs).toBe(client.heartbeatRttMs);
  });

  // An unsolicited pong answers nothing, so it must not overwrite a real sample.
  it("keeps the last real sample when a pong answers no ping", () => {
    const client = meteredClient();
    client.heartbeatRttMs = 42;
    expect(server.heartbeatRoundTrip(client, Date.now())).toBe(42);
  });

  it("consumes a ping timestamp exactly once", () => {
    const client = meteredClient();
    client.lastPingAt = 100;
    expect(server.heartbeatRoundTrip(client, 100)).toBe(1);
    client.heartbeatRttMs = 1;
    expect(server.heartbeatRoundTrip(client, 500)).toBe(1);
  });
});
