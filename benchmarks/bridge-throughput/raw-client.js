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

/**
 * Minimal raw WebSocket client for the bridge throughput benchmark.
 *
 * Node's global WebSocket cannot stop reading from the socket, and the whole
 * point of the slow-client scenario is to let the OS receive buffer fill until
 * the bridge's writes back up. This client owns the net.Socket, so it can.
 */

"use strict";

const crypto = require("node:crypto");
const net = require("node:net");
const { EventEmitter } = require("node:events");
const { performance } = require("node:perf_hooks");

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function nowMicros() {
  return Math.round((performance.timeOrigin + performance.now()) * 1000);
}

function encodeClientFrame(payload, opcode = 0x1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, "utf8");
  const mask = crypto.randomBytes(4);
  let header;
  if (data.length < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | data.length;
  } else if (data.length <= 65535) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  header[0] = 0x80 | opcode;
  const masked = Buffer.allocUnsafe(data.length);
  for (let index = 0; index < data.length; index += 1) {
    masked[index] = data[index] ^ mask[index % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

class RawBridgeClient extends EventEmitter {
  /**
   * @param {{ host?: string, port: number, label?: string }} options
   */
  constructor(options) {
    super();
    this.host = options.host || "127.0.0.1";
    this.port = options.port;
    this.path = options.path || "/ws";
    this.label = options.label || `client-${options.port}`;
    // A client that never answers a ping is how the liveness sweep is proven.
    this.answersPings = options.answersPings !== false;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.handshakeComplete = false;
    this.paused = false;
    this.closed = false;
    this.bytesReceived = 0;
    this.messagesReceived = 0;
    this.binaryMessagesReceived = 0;
    this.pongsReceived = 0;
    this.pingsReceived = 0;
    this.lastPongAtMicros = 0;
    this.lastError = "";
    // An EventEmitter with no "error" listener throws, and a bridge that resets a
    // client is exactly what some scenarios exist to observe. Record it instead.
    this.on("error", (error) => {
      this.lastError = String((error && error.message) || error);
    });
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString("base64");
      const expected = crypto.createHash("sha1").update(`${key}${GUID}`).digest("base64");
      const socket = net.connect({ host: this.host, port: this.port });
      this.socket = socket;
      socket.setNoDelay(true);

      const failure = (error) => {
        if (!this.handshakeComplete) reject(error);
        else this.emit("error", error);
      };

      socket.on("error", failure);
      socket.on("close", () => {
        this.closed = true;
        this.emit("close");
      });

      socket.on("data", (chunk) => {
        this.bytesReceived += chunk.length;
        this.buffer = Buffer.concat([this.buffer, chunk]);
        if (!this.handshakeComplete) {
          const headerEnd = this.buffer.indexOf("\r\n\r\n");
          if (headerEnd === -1) return;
          const headers = this.buffer.subarray(0, headerEnd).toString("latin1");
          this.buffer = this.buffer.subarray(headerEnd + 4);
          if (!headers.startsWith("HTTP/1.1 101")) {
            failure(new Error(`Bridge refused the WebSocket handshake: ${headers.split("\r\n")[0]}`));
            socket.destroy();
            return;
          }
          if (!headers.toLowerCase().includes(`sec-websocket-accept: ${expected.toLowerCase()}`)) {
            failure(new Error("Bridge returned an invalid Sec-WebSocket-Accept value."));
            socket.destroy();
            return;
          }
          this.handshakeComplete = true;
          resolve(this);
        }
        this.#drainFrames();
      });

      socket.on("connect", () => {
        socket.write([
          `GET ${this.path} HTTP/1.1`,
          `Host: ${this.host}:${this.port}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          `Origin: http://${this.host}:${this.port}`,
          "",
          ""
        ].join("\r\n"));
      });
    });
  }

  #drainFrames() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;
      let length = secondByte & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskOffset = offset;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;

      let payload = this.buffer.subarray(offset, offset + length);
      if (masked) {
        const mask = this.buffer.subarray(maskOffset, maskOffset + 4);
        const unmasked = Buffer.allocUnsafe(length);
        for (let index = 0; index < length; index += 1) {
          unmasked[index] = payload[index] ^ mask[index % 4];
        }
        payload = unmasked;
      }
      this.buffer = this.buffer.subarray(offset + length);

      const receivedAtMicros = nowMicros();
      if (opcode === 0x1) {
        this.messagesReceived += 1;
        this.emit("text", payload.toString("utf8"), receivedAtMicros);
      } else if (opcode === 0x2) {
        this.binaryMessagesReceived += 1;
        this.emit("binary", payload, receivedAtMicros);
      } else if (opcode === 0x8) {
        this.emit("closeFrame", payload);
        this.socket.end();
        return;
      } else if (opcode === 0x9) {
        this.pingsReceived += 1;
        if (this.answersPings) this.socket.write(encodeClientFrame(payload, 0xa));
        this.emit("ping", payload);
      } else if (opcode === 0xa) {
        this.pongsReceived += 1;
        this.lastPongAtMicros = receivedAtMicros;
        this.emit("pong", payload);
      }
    }
  }

  send(message) {
    const text = typeof message === "string" ? message : JSON.stringify(message);
    this.socket.write(encodeClientFrame(text, 0x1));
  }

  ping(payload = "") {
    this.socket.write(encodeClientFrame(payload, 0x9));
  }

  /** Stops reading so the OS receive buffer fills and the bridge's writes back up. */
  pauseReads() {
    if (this.paused) return;
    this.paused = true;
    this.socket.pause();
  }

  resumeReads() {
    if (!this.paused) return;
    this.paused = false;
    this.socket.resume();
  }

  close() {
    return new Promise((resolve) => {
      if (!this.socket || this.socket.destroyed) {
        resolve();
        return;
      }
      this.socket.once("close", resolve);
      this.resumeReads();
      this.socket.destroy();
    });
  }
}

module.exports = { RawBridgeClient, encodeClientFrame, nowMicros };
