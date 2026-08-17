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

function liveClient(id = "client-a") {
  return {
    buffer: Buffer.alloc(0),
    id,
    lastPongAt: Date.now(),
    socket: { write: vi.fn(), end: vi.fn(), destroy: vi.fn(), destroyed: false },
    send: vi.fn()
  };
}

afterEach(() => {
  server.stopClientHeartbeat();
  server.setBridgeHeartbeatSeconds(server.BRIDGE_HEARTBEAT_DEFAULT_SECONDS);
  server.clients.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("bridge heartbeat interval", () => {
  it("treats 0 as an explicit off value and clamps everything else", () => {
    expect(server.normalizeBridgeHeartbeatSeconds(0)).toBe(0);
    expect(server.normalizeBridgeHeartbeatSeconds(0.4)).toBe(0);
    expect(server.normalizeBridgeHeartbeatSeconds(45)).toBe(45);
    expect(server.normalizeBridgeHeartbeatSeconds(1)).toBe(server.BRIDGE_HEARTBEAT_MIN_SECONDS);
    expect(server.normalizeBridgeHeartbeatSeconds(99999)).toBe(server.BRIDGE_HEARTBEAT_MAX_SECONDS);
    expect(server.normalizeBridgeHeartbeatSeconds("nope")).toBe(server.BRIDGE_HEARTBEAT_DEFAULT_SECONDS);
  });

  it("stores the clamped interval and reports it back", () => {
    expect(server.setBridgeHeartbeatSeconds(120)).toBe(120);
    expect(server.getBridgeHeartbeatSeconds()).toBe(120);
  });

  it("negotiates the interval through the existing config message", () => {
    const client = liveClient();
    server.applyClientConfig(client, { type: "config", bridgeHeartbeatSeconds: 90 });
    expect(server.getBridgeHeartbeatSeconds()).toBe(90);
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "config",
      bridgeHeartbeatSeconds: 90
    }));
  });
});

describe("bridge heartbeat timer", () => {
  it("arms only while the bridge is running and the interval is on", () => {
    server.setBridgeHeartbeatSeconds(30);
    expect(server.isClientHeartbeatArmable()).toBe(false);
    expect(server.armClientHeartbeat()).toBeNull();

    expect(server.startClientHeartbeat()).not.toBeNull();
    expect(server.isClientHeartbeatArmable()).toBe(true);

    server.setBridgeHeartbeatSeconds(0);
    expect(server.isClientHeartbeatArmable()).toBe(false);
    expect(server.armClientHeartbeat()).toBeNull();
  });

  it("stops the timer without leaving the bridge armed", () => {
    server.setBridgeHeartbeatSeconds(30);
    server.startClientHeartbeat();
    expect(server.stopClientHeartbeat()).toBeNull();
    expect(server.isClientHeartbeatArmable()).toBe(false);
  });

  it("sweeps clients on the configured interval", () => {
    vi.useFakeTimers();
    const client = liveClient();
    server.clients.add(client);
    server.setBridgeHeartbeatSeconds(5);
    server.startClientHeartbeat();

    vi.advanceTimersByTime(5000);
    expect(client.socket.write).toHaveBeenCalledTimes(1);
  });
});

describe("client liveness sweep", () => {
  it("pings a client that answered within the window", () => {
    const client = liveClient();
    server.clients.add(client);
    server.setBridgeHeartbeatSeconds(30);

    expect(server.sweepClientHeartbeats()).toBe(0);
    expect(server.clients.has(client)).toBe(true);
    const frame = client.socket.write.mock.calls[0][0];
    expect(frame[0]).toBe(0x89);
    expect(frame[1]).toBe(0);
  });

  it("destroys a client that has been silent for two intervals", () => {
    const client = liveClient();
    server.clients.add(client);
    server.setBridgeHeartbeatSeconds(30);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const now = Date.now();
    client.lastPongAt = now - 60 * 1000;
    client.lastPingAt = now - 30 * 1000 - 1;
    expect(server.sweepClientHeartbeats(now)).toBe(1);

    expect(client.socket.destroy).toHaveBeenCalled();
    expect(server.clients.has(client)).toBe(false);
  });

  it("keeps a client that is one interval behind", () => {
    const client = liveClient();
    server.clients.add(client);
    server.setBridgeHeartbeatSeconds(30);

    const now = Date.now();
    client.lastPongAt = now - 30 * 1000;
    client.lastPingAt = now - 15 * 1000;
    expect(server.sweepClientHeartbeats(now)).toBe(0);
    expect(server.clients.has(client)).toBe(true);
  });

  it("never pings once the interval is switched off", () => {
    const client = liveClient();
    server.clients.add(client);
    server.setBridgeHeartbeatSeconds(0);

    expect(server.sweepClientHeartbeats()).toBe(0);
    expect(client.socket.write).not.toHaveBeenCalled();
  });

  it("skips a socket that is already destroyed", () => {
    const client = liveClient();
    client.socket.destroyed = true;
    server.clients.add(client);
    server.setBridgeHeartbeatSeconds(30);

    expect(server.pingClient(client)).toBe(false);
    expect(server.sweepClientHeartbeats()).toBe(0);
    expect(client.socket.write).not.toHaveBeenCalled();
  });
});

describe("pong frames", () => {  // A successful socket.write proves nothing about a half-open peer, so
  // liveness may only advance from a control frame the client actually sent.
  it("advance lastPongAt when the client answers", () => {
    const client = liveClient();
    client.lastPongAt = 1;
    server.readFrames(client, maskFrame("", 0xA));
    expect(client.lastPongAt).toBeGreaterThan(1);
  });

  it("are not treated as application messages", () => {
    const client = liveClient();
    server.readFrames(client, maskFrame("pong-payload", 0xA));
    expect(client.send).not.toHaveBeenCalled();
    expect(client.socket.end).not.toHaveBeenCalled();
  });

  it("do not advance from an outgoing ping alone", () => {
    const client = liveClient();
    client.lastPongAt = 1;
    server.setBridgeHeartbeatSeconds(30);
    server.pingClient(client);
    expect(client.lastPongAt).toBe(1);
  });

  it("leave the rest of the buffer parseable", () => {
    const client = liveClient();
    server.readFrames(client, Buffer.concat([
      maskFrame("", 0xA),
      maskFrame(JSON.stringify({ type: "list" }))
    ]));
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "sessions" }));
  });
});

describe("application heartbeat", () => {
  it("echoes a renderer-initiated heartbeat", () => {
    const client = liveClient();
    server.handleClientMessage(client, JSON.stringify({ type: "heartbeat", nonce: "abc" }));
    expect(client.send).toHaveBeenCalledWith({ type: "heartbeat", nonce: "abc" });
  });

  // Echoing a reply would make the two sides answer each other forever.
  it("does not echo a reply to a bridge-initiated probe", () => {
    const client = liveClient();
    server.handleClientMessage(client, JSON.stringify({ type: "heartbeat", nonce: "probe-1", reply: true }));
    expect(client.send).not.toHaveBeenCalled();
  });

  it("truncates an oversized nonce", () => {
    const client = liveClient();
    server.handleClientMessage(client, JSON.stringify({ type: "heartbeat", nonce: "x".repeat(200) }));
    expect(client.send).toHaveBeenCalledWith({ type: "heartbeat", nonce: "x".repeat(64) });
  });
});
