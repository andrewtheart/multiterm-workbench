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

/**
 * A client whose socket accepts writes until `acceptBytes` is exhausted, after
 * which write() reports the buffer is full exactly like a real net.Socket.
 */
function queuedClient(id = "client-a", { acceptBytes = Infinity } = {}) {
  const written = [];
  let remaining = acceptBytes;
  const client = {
    backlogged: false,
    id,
    lastPongAt: Date.now(),
    queue: [],
    queuedBytes: 0,
    queueHighWaterMark: 0,
    written,
    socket: {
      destroyed: false,
      destroy: vi.fn(),
      end: vi.fn(),
      write: vi.fn((frame) => {
        written.push(frame);
        remaining -= frame.length;
        return remaining > 0;
      })
    },
    send: vi.fn()
  };
  client.sendFrame = (frame) => server.sendClientFrame(client, frame);
  return client;
}

afterEach(() => {
  server.setBridgeClientBacklogKb(server.BRIDGE_CLIENT_BACKLOG_DEFAULT_KB);
  server.clients.clear();
  vi.restoreAllMocks();
});

describe("client backlog ceiling", () => {
  it("treats 0 as the legacy synchronous send and clamps everything else", () => {
    expect(server.normalizeBridgeClientBacklogKb(0)).toBe(0);
    expect(server.normalizeBridgeClientBacklogKb(0.4)).toBe(0);
    expect(server.normalizeBridgeClientBacklogKb(512)).toBe(512);
    expect(server.normalizeBridgeClientBacklogKb(1)).toBe(server.BRIDGE_CLIENT_BACKLOG_MIN_KB);
    expect(server.normalizeBridgeClientBacklogKb(999999)).toBe(server.BRIDGE_CLIENT_BACKLOG_MAX_KB);
    expect(server.normalizeBridgeClientBacklogKb("nope")).toBe(server.BRIDGE_CLIENT_BACKLOG_DEFAULT_KB);
  });

  it("reports the applied ceiling in bytes", () => {
    expect(server.setBridgeClientBacklogKb(128)).toBe(128);
    expect(server.getBridgeClientBacklogKb()).toBe(128);
    expect(server.isClientBacklogBounded()).toBe(true);
    expect(server.clientBacklogLimitBytes()).toBe(128 * 1024);

    server.setBridgeClientBacklogKb(0);
    expect(server.isClientBacklogBounded()).toBe(false);
  });

  it("negotiates the ceiling through the existing config message", () => {
    const client = queuedClient();
    server.applyClientConfig(client, { type: "config", bridgeClientBacklogKb: 256 });
    expect(server.getBridgeClientBacklogKb()).toBe(256);
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "config",
      bridgeClientBacklogKb: 256
    }));
  });
});

describe("slow client isolation", () => {
  it("writes straight through while the socket keeps accepting", () => {
    const client = queuedClient();
    server.setBridgeClientBacklogKb(64);

    expect(server.sendClientFrame(client, Buffer.from("one"))).toBe(true);
    expect(server.sendClientFrame(client, Buffer.from("two"))).toBe(true);

    expect(client.written.map(String)).toEqual(["one", "two"]);
    expect(client.queue).toHaveLength(0);
    expect(client.backlogged).toBe(false);
  });

  it("queues in arrival order once the socket reports it is full", () => {
    const client = queuedClient("slow", { acceptBytes: 3 });
    server.setBridgeClientBacklogKb(64);

    server.sendClientFrame(client, Buffer.from("abc"));
    expect(client.backlogged).toBe(true);

    server.sendClientFrame(client, Buffer.from("de"));
    server.sendClientFrame(client, Buffer.from("f"));

    expect(client.written.map(String)).toEqual(["abc"]);
    expect(client.queue.map(String)).toEqual(["de", "f"]);
    expect(client.queuedBytes).toBe(3);
    expect(client.queueHighWaterMark).toBe(3);
  });

  // Ordering is the whole point of the FIFO: a control reply must never
  // overtake the output it belongs with.
  it("replays the queue in order on drain", () => {
    const client = queuedClient("slow", { acceptBytes: 3 });
    server.setBridgeClientBacklogKb(64);

    server.sendClientFrame(client, Buffer.from("abc"));
    server.sendClientFrame(client, Buffer.from("de"));
    server.sendClientFrame(client, Buffer.from("f"));

    client.socket.write.mockImplementation((frame) => {
      client.written.push(frame);
      return true;
    });

    expect(server.drainClientQueue(client)).toBe(0);
    expect(client.written.map(String)).toEqual(["abc", "de", "f"]);
    expect(client.backlogged).toBe(false);
  });

  it("stops draining and keeps the remainder when the socket fills again", () => {
    const client = queuedClient("slow", { acceptBytes: 3 });
    server.setBridgeClientBacklogKb(64);

    server.sendClientFrame(client, Buffer.from("abc"));
    server.sendClientFrame(client, Buffer.from("de"));
    server.sendClientFrame(client, Buffer.from("f"));

    expect(server.drainClientQueue(client)).toBe(1);
    expect(client.written.map(String)).toEqual(["abc", "de"]);
    expect(client.queue.map(String)).toEqual(["f"]);
    expect(client.backlogged).toBe(true);
  });

  it("disconnects a client whose queue reaches the ceiling instead of dropping bytes", () => {
    const client = queuedClient("slow", { acceptBytes: 1 });
    server.clients.add(client);
    server.setBridgeClientBacklogKb(server.BRIDGE_CLIENT_BACKLOG_MIN_KB);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    server.sendClientFrame(client, Buffer.from("x"));
    expect(client.backlogged).toBe(true);

    const chunk = Buffer.alloc(16 * 1024, 0x61);
    let accepted = 0;
    for (let index = 0; index < 8; index += 1) {
      accepted += server.sendClientFrame(client, chunk) ? 1 : 0;
    }

    expect(accepted).toBe(4);
    expect(client.socket.destroy).toHaveBeenCalled();
    expect(server.clients.has(client)).toBe(false);
    // The frame that would have breached the ceiling was never silently kept.
    expect(client.queuedBytes).toBe(server.clientBacklogLimitBytes());
  });

  it("refuses to write to a destroyed socket", () => {
    const client = queuedClient();
    client.socket.destroyed = true;
    server.setBridgeClientBacklogKb(64);

    expect(server.sendClientFrame(client, Buffer.from("x"))).toBe(false);
    expect(client.socket.write).not.toHaveBeenCalled();
  });

  it("clears the queue when the client goes away", () => {
    const client = queuedClient("slow", { acceptBytes: 1 });
    server.setBridgeClientBacklogKb(64);
    server.sendClientFrame(client, Buffer.from("x"));
    server.sendClientFrame(client, Buffer.from("y"));

    server.discardClientQueue(client);

    expect(client.queue).toHaveLength(0);
    expect(client.queuedBytes).toBe(0);
    expect(client.backlogged).toBe(false);
  });
});

describe("legacy synchronous send escape hatch", () => {
  it("ignores backpressure entirely when the ceiling is 0", () => {
    const client = queuedClient("legacy", { acceptBytes: 1 });
    server.setBridgeClientBacklogKb(0);

    server.sendClientFrame(client, Buffer.from("a"));
    server.sendClientFrame(client, Buffer.from("b"));

    expect(client.written.map(String)).toEqual(["a", "b"]);
    expect(client.queue).toHaveLength(0);
    expect(client.backlogged).toBe(false);
  });

  it("flushes anything already queued when the hatch is pulled", () => {
    const client = queuedClient("slow", { acceptBytes: 1 });
    server.clients.add(client);
    server.setBridgeClientBacklogKb(64);
    server.sendClientFrame(client, Buffer.from("a"));
    server.sendClientFrame(client, Buffer.from("b"));
    expect(client.queue.map(String)).toEqual(["b"]);

    server.setBridgeClientBacklogKb(0);

    expect(client.written.map(String)).toEqual(["a", "b"]);
    expect(client.queue).toHaveLength(0);
  });
});

describe("broadcast fan-out", () => {
  // The FIFO must not reintroduce per-client encoding: broadcast() builds one
  // frame and every socket has to receive that same buffer.
  it("encodes once and writes the same buffer to every client", () => {
    const a = queuedClient("a");
    const b = queuedClient("b");
    server.clients.add(a);
    server.clients.add(b);
    server.setBridgeClientBacklogKb(64);

    server.broadcast({ type: "output", id: "s1", stream: "pty", data: "hello" });

    expect(a.written).toHaveLength(1);
    expect(b.written).toHaveLength(1);
    expect(b.written[0]).toBe(a.written[0]);
  });

  it("keeps healthy clients writing straight through while one is backlogged", () => {
    const healthy = queuedClient("healthy");
    const slow = queuedClient("slow", { acceptBytes: 1 });
    server.clients.add(healthy);
    server.clients.add(slow);
    server.setBridgeClientBacklogKb(64);

    server.broadcast({ type: "output", id: "s1", stream: "pty", data: "one" });
    server.broadcast({ type: "output", id: "s1", stream: "pty", data: "two" });

    expect(healthy.written).toHaveLength(2);
    expect(healthy.backlogged).toBe(false);
    expect(slow.written).toHaveLength(1);
    expect(slow.queue).toHaveLength(1);
  });
});
