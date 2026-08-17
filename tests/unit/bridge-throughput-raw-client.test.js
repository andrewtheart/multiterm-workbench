/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

"use strict";

const crypto = require("node:crypto");
const net = require("node:net");
const { EventEmitter } = require("node:events");
const { RawBridgeClient, encodeClientFrame, nowMicros } = require("../../benchmarks/bridge-throughput/raw-client");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.ended = false;
    this.noDelay = false;
    this.paused = false;
    this.writes = [];
  }

  setNoDelay(value) {
    this.noDelay = value;
  }

  write(value) {
    this.writes.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
    return true;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  end() {
    this.ended = true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    queueMicrotask(() => this.emit("close"));
  }
}

function serverFrame(payload, opcode = 0x1, masked = false) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x80 | opcode, (masked ? 0x80 : 0) | data.length]);
  } else if (data.length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = (masked ? 0x80 : 0) | 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = (masked ? 0x80 : 0) | 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  if (!masked) return Buffer.concat([header, data]);
  const mask = Buffer.from([0x11, 0x22, 0x33, 0x44]);
  const encoded = Buffer.from(data);
  for (let index = 0; index < encoded.length; index += 1) encoded[index] ^= mask[index % 4];
  return Buffer.concat([header, mask, encoded]);
}

function handshakeResponse(socket, status = "101 Switching Protocols", acceptOverride = "") {
  const request = Buffer.concat(socket.writes).toString("latin1");
  const key = /Sec-WebSocket-Key: ([^\r\n]+)/.exec(request)?.[1] || "";
  const accept = acceptOverride || crypto.createHash("sha1").update(`${key}${GUID}`).digest("base64");
  return Buffer.from([
    `HTTP/1.1 ${status}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"), "latin1");
}

async function connectClient(client, socket, trailing = Buffer.alloc(0)) {
  const connected = client.connect();
  socket.emit("connect");
  socket.emit("data", Buffer.concat([handshakeResponse(socket), trailing]));
  await connected;
  return client;
}

describe("bridge throughput raw WebSocket client", () => {
  let socket;

  beforeEach(() => {
    socket = new FakeSocket();
    vi.spyOn(net, "connect").mockReturnValue(socket);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("encodes masked client frames across all WebSocket length classes", () => {
    const short = encodeClientFrame("hello", 0x9);
    const medium = encodeClientFrame(Buffer.alloc(126, 0x61));
    const large = encodeClientFrame(Buffer.alloc(65536, 0x62));

    expect(short[0]).toBe(0x89);
    expect(short[1] & 0x80).toBe(0x80);
    expect(short[1] & 0x7f).toBe(5);
    expect(medium[1] & 0x7f).toBe(126);
    expect(medium.readUInt16BE(2)).toBe(126);
    expect(large[1] & 0x7f).toBe(127);
    expect(Number(large.readBigUInt64BE(2))).toBe(65536);
    expect(nowMicros()).toBeGreaterThan(0);
  });

  it("completes a valid handshake and records text and binary frames", async () => {
    const client = new RawBridgeClient({ port: 3199, path: "/ws?renderer=1" });
    const text = [];
    const binary = [];
    client.on("text", (value) => text.push(value));
    client.on("binary", (value) => binary.push(value.toString("hex")));

    const connected = client.connect();
    socket.emit("connect");
    expect(socket.noDelay).toBe(true);
    expect(Buffer.concat(socket.writes).toString()).toContain("GET /ws?renderer=1 HTTP/1.1");
    expect(Buffer.concat(socket.writes).toString()).toContain("Origin: http://127.0.0.1:3199");
    socket.emit("data", Buffer.concat([
      handshakeResponse(socket),
      serverFrame("hello"),
      serverFrame(Buffer.from([1, 2, 3]), 0x2, true)
    ]));
    await connected;

    expect(client).toMatchObject({
      binaryMessagesReceived: 1,
      handshakeComplete: true,
      host: "127.0.0.1",
      label: "client-3199",
      messagesReceived: 1
    });
    expect(text).toEqual(["hello"]);
    expect(binary).toEqual(["010203"]);
  });

  it("waits for complete handshake headers and rejects invalid responses", async () => {
    const pendingClient = new RawBridgeClient({ host: "localhost", port: 3200, label: "pending" });
    const pending = pendingClient.connect();
    socket.emit("connect");
    socket.emit("data", Buffer.from("HTTP/1.1 101 Switching Protocols\r\n"));
    expect(pendingClient.handshakeComplete).toBe(false);
    socket.emit("data", handshakeResponse(socket));
    await pending;

    socket = new FakeSocket();
    net.connect.mockReturnValue(socket);
    const refusedClient = new RawBridgeClient({ port: 3201 });
    const refused = refusedClient.connect();
    socket.emit("connect");
    socket.emit("data", handshakeResponse(socket, "403 Forbidden"));
    await expect(refused).rejects.toThrow(/refused.*403 Forbidden/i);
    expect(socket.destroyed).toBe(true);

    socket = new FakeSocket();
    net.connect.mockReturnValue(socket);
    const invalidClient = new RawBridgeClient({ port: 3202 });
    const invalid = invalidClient.connect();
    socket.emit("connect");
    socket.emit("data", handshakeResponse(socket, "101 Switching Protocols", "wrong"));
    await expect(invalid).rejects.toThrow(/invalid Sec-WebSocket-Accept/);
  });

  it("rejects transport errors before handshake and records them afterward", async () => {
    const failedClient = new RawBridgeClient({ port: 3203 });
    const failed = failedClient.connect();
    socket.emit("error", new Error("connect failed"));
    await expect(failed).rejects.toThrow("connect failed");

    socket = new FakeSocket();
    net.connect.mockReturnValue(socket);
    const connectedClient = new RawBridgeClient({ port: 3204 });
    await connectClient(connectedClient, socket);
    socket.emit("error", new Error("reset after handshake"));
    expect(connectedClient.lastError).toBe("reset after handshake");
    connectedClient.emit("error", "raw failure");
    expect(connectedClient.lastError).toBe("raw failure");
    socket.emit("close");
    expect(connectedClient.closed).toBe(true);
  });

  it("handles partial extended frames, pings, pongs, and close frames", async () => {
    const client = new RawBridgeClient({ port: 3205 });
    const events = [];
    for (const name of ["text", "ping", "pong", "closeFrame"]) {
      client.on(name, (value) => events.push([name, Buffer.isBuffer(value) ? value.toString() : value]));
    }
    await connectClient(client, socket);

    socket.emit("data", Buffer.from([0x81]));
    client.buffer = Buffer.alloc(0);
    socket.emit("data", Buffer.from([0x81, 126, 0]));
    client.buffer = Buffer.alloc(0);
    socket.emit("data", Buffer.from([0x81, 127, 0, 0, 0, 0, 0, 0, 0]));
    client.buffer = Buffer.alloc(0);
    const medium = serverFrame("m".repeat(126));
    socket.emit("data", medium.subarray(0, medium.length - 1));
    expect(events).toEqual([]);
    socket.emit("data", medium.subarray(medium.length - 1));

    socket.emit("data", serverFrame("ping", 0x9));
    socket.emit("data", serverFrame("pong", 0xa));
    socket.emit("data", serverFrame("ignored", 0x0));
    socket.emit("data", serverFrame("bye", 0x8));

    expect(events.map(([name]) => name)).toEqual(["text", "ping", "pong", "closeFrame"]);
    expect(client).toMatchObject({ messagesReceived: 1, pingsReceived: 1, pongsReceived: 1 });
    expect(client.lastPongAtMicros).toBeGreaterThan(0);
    expect(socket.ended).toBe(true);
    expect(socket.writes.some((value) => (value[0] & 0x0f) === 0xa)).toBe(true);
  });

  it("reads 64-bit frames and can deliberately ignore bridge pings", async () => {
    const client = new RawBridgeClient({ answersPings: false, port: 3206 });
    const binary = [];
    client.on("binary", (value) => binary.push(value.length));
    await connectClient(client, socket);
    const writesBeforePing = socket.writes.length;
    socket.emit("data", serverFrame("ignored", 0x9));
    socket.emit("data", serverFrame(Buffer.alloc(65536, 0x7f), 0x2));

    expect(socket.writes).toHaveLength(writesBeforePing);
    expect(binary).toEqual([65536]);
  });

  it("sends application frames and makes pause, resume, and close idempotent", async () => {
    const client = new RawBridgeClient({ port: 3207 });
    await connectClient(client, socket);
    const baselineWrites = socket.writes.length;
    client.send("hello");
    client.send({ type: "probe" });
    client.ping("alive");
    expect(socket.writes).toHaveLength(baselineWrites + 3);

    client.pauseReads();
    client.pauseReads();
    expect(client.paused).toBe(true);
    expect(socket.paused).toBe(true);
    client.resumeReads();
    client.resumeReads();
    expect(client.paused).toBe(false);
    expect(socket.paused).toBe(false);

    const closing = client.close();
    await closing;
    expect(socket.destroyed).toBe(true);
    await client.close();

    const neverConnected = new RawBridgeClient({ port: 3208 });
    await neverConnected.close();
    neverConnected.socket = { destroyed: true };
    await neverConnected.close();
  });
});