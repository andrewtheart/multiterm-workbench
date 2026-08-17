/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const server = require("../../server.js");

function config(outputCoalesceMs, overrides = {}) {
  return {
    type: "config",
    outputCoalesceMs,
    bridgeClientBacklogKb: 4096,
    bridgeReplayBufferKb: 512,
    bridgeHeartbeatSeconds: 30,
    bridgeHeartbeatTimeoutSeconds: 30,
    diagnosticRetentionDays: 14,
    diagnosticRotationMb: 10,
    diagnosticViewerEntries: 5000,
    copilotLogViewerEnabled: false,
    copilotLogInitialTailKb: 256,
    copilotLogEnabledAt: 0,
    ...overrides
  };
}

function renderer(id, { activeAt = 0, visible = true } = {}) {
  return {
    id,
    renderer: true,
    rendererActiveAt: activeAt,
    rendererVisible: visible,
    send: vi.fn()
  };
}

afterEach(() => {
  server.__resetConfigOwnership();
  server.clients.clear();
  server.setOutputCoalesceMs(server.OUTPUT_COALESCE_DEFAULT_MS);
  server.setBridgeClientBacklogKb(server.BRIDGE_CLIENT_BACKLOG_DEFAULT_KB);
  server.setBridgeReplayBufferKb(server.BRIDGE_REPLAY_BUFFER_DEFAULT_KB);
  server.setBridgeHeartbeatSeconds(server.BRIDGE_HEARTBEAT_DEFAULT_SECONDS);
  vi.restoreAllMocks();
});

describe("bridge config ownership", () => {
  it("accepts proposals only from renderer clients", () => {
    const client = { id: "automation", renderer: false, send: vi.fn() };

    expect(server.handleClientConfig(client, config(12))).toBe(false);

    expect(server.getOutputCoalesceMs()).toBe(server.OUTPUT_COALESCE_DEFAULT_MS);
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "config",
      outputCoalesceMs: server.OUTPUT_COALESCE_DEFAULT_MS,
      configOwner: false
    }));
  });

  it("requires a complete config before a renderer can become owner", () => {
    const incomplete = renderer("incomplete");
    const complete = renderer("complete");
    const partial = config(12);
    delete partial.bridgeReplayBufferKb;

    expect(server.isCompleteBridgeConfig(partial)).toBe(false);
    expect(server.handleClientConfig(incomplete, partial)).toBe(false);
    expect(server.handleClientConfig(complete, config(14))).toBe(true);

    expect(server.getOutputCoalesceMs()).toBe(14);
    expect(complete.send).toHaveBeenCalledWith(expect.objectContaining({ configOwner: true }));
  });

  it("lets the first complete renderer own and update the active values", () => {
    const owner = renderer("owner");

    expect(server.handleClientConfig(owner, config(11))).toBe(true);
    expect(server.handleClientConfig(owner, config(13))).toBe(true);

    expect(server.getOutputCoalesceMs()).toBe(13);
    expect(owner.send).toHaveBeenLastCalledWith(expect.objectContaining({
      outputCoalesceMs: 13,
      configOwner: true
    }));
  });

  it("stores a non-owner preference but echoes the active global values", () => {
    const owner = renderer("owner");
    const other = renderer("other", { activeAt: 20 });
    server.handleClientConfig(owner, config(11));

    expect(server.handleClientConfig(other, config(29))).toBe(false);

    expect(other.desiredConfig.outputCoalesceMs).toBe(29);
    expect(server.getOutputCoalesceMs()).toBe(11);
    expect(other.send).toHaveBeenCalledWith(expect.objectContaining({
      outputCoalesceMs: 11,
      configOwner: false
    }));
  });

  it("does nothing when a non-owner disconnects", () => {
    const owner = renderer("owner");
    const other = renderer("other");
    server.clients.add(owner);
    server.clients.add(other);
    server.handleClientConfig(owner, config(11));
    server.handleClientConfig(other, config(22));

    expect(server.promoteConfigOwner("other")).toBeNull();
    expect(server.getOutputCoalesceMs()).toBe(11);
  });

  it("promotes the most recently active visible renderer", () => {
    const owner = renderer("owner", { activeAt: 1 });
    const hiddenNewest = renderer("hidden", { activeAt: 500, visible: false });
    const visibleOlder = renderer("visible-old", { activeAt: 100 });
    const visibleNewest = renderer("visible-new", { activeAt: 200 });
    for (const client of [owner, hiddenNewest, visibleOlder, visibleNewest]) server.clients.add(client);
    server.handleClientConfig(owner, config(10));
    server.handleClientConfig(hiddenNewest, config(20));
    server.handleClientConfig(visibleOlder, config(30));
    server.handleClientConfig(visibleNewest, config(40));
    server.clients.delete(owner);

    const promoted = server.promoteConfigOwner("owner");

    expect(promoted).toBe(visibleNewest);
    expect(server.getOutputCoalesceMs()).toBe(40);
    expect(visibleNewest.send).toHaveBeenLastCalledWith(expect.objectContaining({ configOwner: true }));
  });

  it("uses client id as a deterministic tie-breaker", () => {
    const owner = renderer("owner");
    const beta = renderer("beta", { activeAt: 100 });
    const alpha = renderer("alpha", { activeAt: 100 });
    for (const client of [owner, beta, alpha]) server.clients.add(client);
    server.handleClientConfig(owner, config(10));
    server.handleClientConfig(beta, config(20));
    server.handleClientConfig(alpha, config(30));
    server.clients.delete(owner);

    expect(server.promoteConfigOwner("owner")).toBe(alpha);
    expect(server.getOutputCoalesceMs()).toBe(30);
  });

  it("clears ownership when no complete renderer remains", () => {
    const owner = renderer("owner");
    server.clients.add(owner);
    server.handleClientConfig(owner, config(10));
    server.clients.delete(owner);

    expect(server.promoteConfigOwner("owner")).toBeNull();

    const next = renderer("next");
    expect(server.handleClientConfig(next, config(17))).toBe(true);
    expect(server.getOutputCoalesceMs()).toBe(17);
  });
});
