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

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const copilotSessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const automationOutputCaptureKbBounds = { min: 16, max: 512, fallback: 128 };

function clampAutomationOutputCaptureKb(value) {
  const requested = Math.round(Number(value));
  return Number.isFinite(requested)
    ? Math.min(automationOutputCaptureKbBounds.max, Math.max(automationOutputCaptureKbBounds.min, requested))
    : automationOutputCaptureKbBounds.fallback;
}

function readCopilotAutomationOutput(message, rootOrOptions = {}) {
  const options = typeof rootOrOptions === "string"
    ? { sessionRoot: rootOrOptions }
    : rootOrOptions;
  const fileSystem = options.fileSystem || fs;
  const sessionRoot = options.sessionRoot || path.join(os.homedir(), ".copilot", "session-state");
  const sessionId = String(message?.sessionId || "").toLowerCase();
  if (!copilotSessionIdPattern.test(sessionId)) throw new Error("A valid Copilot session ID is required.");
  const eventsPath = path.join(sessionRoot, sessionId, "events.jsonl");
  let size = 0;
  try {
    size = fileSystem.statSync(eventsPath).size;
  } catch (error) {
    if (error?.code === "ENOENT") return { complete: false, cursor: 0, output: "", truncated: false, turnStarted: false };
    throw error;
  }
  if (message.snapshot === true) return { complete: false, cursor: size, output: "", truncated: false, turnStarted: false };

  const requestedCursor = Math.max(0, Math.floor(Number(message.cursor) || 0));
  const cursor = Math.min(requestedCursor, size);
  const maximumBytes = clampAutomationOutputCaptureKb(message.maxKb) * 1024;
  const start = Math.max(cursor, size - maximumBytes);
  const truncated = start > cursor;
  if (start === size) return { complete: false, cursor: size, output: "", truncated, turnStarted: message.turnStarted === true };

  const descriptor = fileSystem.openSync(eventsPath, "r");
  let buffer;
  let bytesRead = 0;
  let discardPartial = false;
  try {
    if (start > 0) {
      const previous = Buffer.alloc(1);
      fileSystem.readSync(descriptor, previous, 0, 1, start - 1);
      discardPartial = previous[0] !== 0x0a;
    }
    buffer = Buffer.alloc(size - start);
    while (bytesRead < buffer.length) {
      const read = fileSystem.readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, start + bytesRead);
      if (read <= 0) break;
      bytesRead += read;
    }
  } finally {
    fileSystem.closeSync(descriptor);
  }

  buffer = buffer.subarray(0, bytesRead);
  const lastBreak = buffer.lastIndexOf(0x0a);
  if (lastBreak < 0) {
    return { complete: false, cursor: truncated ? size : cursor, output: "", truncated, turnStarted: message.turnStarted === true };
  }
  const consumedCursor = start + lastBreak + 1;
  let text = buffer.subarray(0, lastBreak + 1).toString("utf8");
  if (discardPartial) {
    const firstBreak = text.indexOf("\n");
    text = text.slice(firstBreak + 1);
  }
  const output = [];
  let complete = false;
  let turnStarted = message.turnStarted === true;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event?.type === "user.message" || event?.type === "assistant.turn_start") turnStarted = true;
      if (event?.type === "assistant.message" && typeof event.data?.content === "string") output.push(event.data.content);
      if (event?.type === "assistant.turn_end" && turnStarted) complete = true;
    } catch {
      // Malformed complete records are ignored without hiding valid neighboring events.
    }
  }
  return { complete, cursor: consumedCursor, output: output.join("\n"), truncated, turnStarted };
}

module.exports = {
  clampAutomationOutputCaptureKb,
  readCopilotAutomationOutput
};
