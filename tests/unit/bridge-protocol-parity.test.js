/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const nodeBridge = fs.readFileSync(path.join(repoRoot, "server.js"), "utf8");
const installedBridge = fs.readFileSync(path.join(repoRoot, "Start-MultiTerm.ps1"), "utf8");

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1) throw new Error(`Handler markers not found: ${startMarker}`);
  return source.slice(start, end);
}

function nodeMessageTypes() {
  const handler = between(nodeBridge, "function handleClientMessage(", "function createSession(");
  return [...handler.matchAll(/case "([^"]+)":/g)].map((match) => match[1]).sort();
}

function installedMessageTypes() {
  const handler = between(installedBridge, "private void HandleClientMessage(", "private void CreateSession(");
  return [...handler.matchAll(/type == "([^"]+)"/g)].map((match) => match[1]).sort();
}

describe("bridge protocol parity", () => {
  it("keeps client message dispatch aligned except for the documented tmux discovery gap", () => {
    const nodeTypes = nodeMessageTypes();
    const installedTypes = installedMessageTypes();
    const nodeOnly = nodeTypes.filter((type) => !installedTypes.includes(type));
    const installedOnly = installedTypes.filter((type) => !nodeTypes.includes(type));

    expect(nodeOnly).toEqual(["listTmux"]);
    expect(installedOnly).toEqual([]);
  });
});
