/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const server = require("../../src/server.js");

const liveSession = {
  id: "80f9b2ee-4618-4e71-b8a0-ae5fb172b62b",
  agent_task_id: "F8A92FBA-F4EB-4558-B3E6-1FDE977D0A5C",
  name: "New remote session",
  state: "idle",
  remote_steerable: true,
  resource_global_id: "andrewtheart/multiterm-workbench",
  created_at: "2026-08-09T02:02:31.884317018Z",
  last_updated_at: "2026-08-09T02:03:34.282736914Z"
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("remote Copilot session normalization", () => {
  it("keeps the fields the picker needs and lowercases both ids", () => {
    expect(server.normalizeRemoteCopilotSession(liveSession)).toEqual({
      id: "80f9b2ee-4618-4e71-b8a0-ae5fb172b62b",
      key: "remote:80f9b2ee-4618-4e71-b8a0-ae5fb172b62b",
      source: "remote",
      localId: "f8a92fba-f4eb-4558-b3e6-1fde977d0a5c",
      name: "New remote session",
      state: "idle",
      steerable: true,
      repository: "andrewtheart/multiterm-workbench",
      cwd: "",
      branch: "",
      createdAt: "2026-08-09T02:02:31.884317018Z",
      updatedAt: "2026-08-09T02:03:34.282736914Z"
    });
  });

  it("drops records without a usable session id", () => {
    expect(server.normalizeRemoteCopilotSession(null)).toBeNull();
    expect(server.normalizeRemoteCopilotSession("string")).toBeNull();
    expect(server.normalizeRemoteCopilotSession({ id: "not-a-uuid" })).toBeNull();
  });

  it("falls back to the created time and drops an unusable local id", () => {
    const normalized = server.normalizeRemoteCopilotSession({
      ...liveSession,
      agent_task_id: "nope",
      last_updated_at: ""
    });
    expect(normalized.localId).toBe("");
    expect(normalized.updatedAt).toBe(liveSession.created_at);
    expect(normalized.steerable).toBe(true);
  });

  it("treats a missing steerable flag as not steerable", () => {
    expect(server.normalizeRemoteCopilotSession({ ...liveSession, remote_steerable: "true" }).steerable).toBe(false);
  });
});

describe("remote Copilot session requests", () => {
  it("asks the agents endpoint with the version header the API requires", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ sessions: [liveSession], has_next_page: false })
    }));
    const sessions = await server.requestRemoteCopilotSessions("https://api.githubcopilot.com", "token", fetchImpl);

    expect(sessions).toHaveLength(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.githubcopilot.com/agents/sessions?page_size=100");
    expect(options.headers.authorization).toBe("Bearer token");
    expect(options.headers["copilot-api-version"]).toBe("2025-05-01");
    expect(options.redirect).toBe("error");
  });

  it("rejects a non-2xx answer", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, text: async () => "" }));
    await expect(server.requestRemoteCopilotSessions("https://api.githubcopilot.com", "token", fetchImpl))
      .rejects.toThrow("HTTP 403");
  });

  it("rejects an oversized answer", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => "x".repeat(2 * 1024 * 1024 + 1) }));
    await expect(server.requestRemoteCopilotSessions("https://api.githubcopilot.com", "token", fetchImpl))
      .rejects.toThrow("response was too large");
  });

  it("rejects a payload that no longer carries a session array", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ items: [] }) }));
    await expect(server.requestRemoteCopilotSessions("https://api.githubcopilot.com", "token", fetchImpl))
      .rejects.toThrow("unexpected payload shape");
  });
});

describe("remote Copilot session listing", () => {
  it("normalizes only usable persisted remote sessions for fallback", () => {
    const validRemoteId = "80F9B2EE-4618-4E71-B8A0-AE5FB172B62B";
    const validLocalId = "F8A92FBA-F4EB-4558-B3E6-1FDE977D0A5C";

    expect(server.remoteCopilotFallbackSessions([
      { id: "terminal-1", provider: "copilot", remote: false },
      { id: "terminal-2", provider: "claude", remote: true, remoteSessionId: validRemoteId },
      { id: "terminal-3", provider: "copilot", remote: true, remoteSessionId: "invalid" },
      {
        id: "terminal-4",
        provider: "copilot",
        remote: true,
        remoteSessionId: validRemoteId,
        aiSessionId: validLocalId,
        title: "Remote work",
        cwd: "D:\\repo",
        recordedAt: "2026-08-09T02:03:34Z"
      }
    ])).toEqual([{
      id: validRemoteId,
      key: `remote:${validRemoteId.toLowerCase()}`,
      source: "remote",
      localId: validLocalId.toLowerCase(),
      name: "Remote work",
      state: "",
      steerable: false,
      repository: "",
      cwd: "D:\\repo",
      branch: "",
      createdAt: "",
      updatedAt: "2026-08-09T02:03:34Z"
    }]);
  });

  it("returns the first host that answers", async () => {
    const request = vi.fn(async (host) => {
      if (host === "https://first.invalid") throw new Error("nope");
      return [server.normalizeRemoteCopilotSession(liveSession)];
    });
    const result = await server.listRemoteCopilotSessions({
      readToken: async () => "token",
      request,
      hosts: ["https://first.invalid", "https://second.invalid"]
    });

    expect(result.source).toBe("api");
    expect(result.sessions).toHaveLength(1);
    expect(result.message).toBe("");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("falls back and names every failed host when the API cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await server.listRemoteCopilotSessions({
      readToken: async () => "token",
      request: async (host) => {
        throw new Error(`${host} broke`);
      },
      hosts: ["https://first.invalid"]
    });

    expect(result.source).toBe("fallback");
    expect(result.message).toContain("https://first.invalid");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Remote Copilot session listing unavailable"));
  });

  it("falls back without calling the API when no GitHub CLI token is available", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = vi.fn();
    const result = await server.listRemoteCopilotSessions({ readToken: async () => "", request });

    expect(request).not.toHaveBeenCalled();
    expect(result.source).toBe("fallback");
    expect(result.message).toContain("GitHub CLI is not installed or not signed in");
  });

  it("answers the client with the request id, source and agents page", async () => {
    const client = { send: vi.fn() };
    await server.sendRemoteCopilotSessions(client, { requestId: "abc" }, {
      readToken: async () => "token",
      request: async () => [server.normalizeRemoteCopilotSession(liveSession)],
      hosts: ["https://only.invalid"]
    });

    expect(client.send).toHaveBeenCalledWith({
      type: "remoteCopilotSessions",
      requestId: "abc",
      source: "api",
      sessions: [server.normalizeRemoteCopilotSession(liveSession)],
      agentsPage: "https://github.com/copilot/agents",
      message: ""
    });
  });

  it("dispatches the message type through the client handler", async () => {
    const client = { send: vi.fn() };
    server.handleClientMessage(client, JSON.stringify({ type: "listRemoteCopilotSessions", requestId: "dispatch" }), {
      remoteCopilotSessions: {
        readToken: async () => "",
        request: async () => []
      }
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await vi.waitFor(() => expect(client.send).toHaveBeenCalled());
    expect(client.send.mock.calls[0][0].type).toBe("remoteCopilotSessions");
    expect(client.send.mock.calls[0][0].requestId).toBe("dispatch");
  });
});

describe("GitHub CLI token", () => {
  it("returns nothing when the GitHub CLI is not on PATH", async () => {
    const execFile = vi.fn((file, args, options, callback) => callback(new Error("not found"), "", ""));
    await expect(server.readGitHubCliToken(execFile)).resolves.toBe("");
  });

  it("rejects output that does not look like a token", async () => {
    const execFile = vi.fn((file, args, options, callback) => {
      if (file === "where.exe" || file === "which") return callback(null, "C:\\gh\\gh.exe\n", "");
      return callback(null, "not a token!!\n", "");
    });
    await expect(server.readGitHubCliToken(execFile)).resolves.toBe("");
  });

  it("returns a plausible token", async () => {
    const token = `gho_${"a".repeat(36)}`;
    const execFile = vi.fn((file, args, options, callback) => {
      if (file === "where.exe" || file === "which") return callback(null, "C:\\gh\\gh.exe\n", "");
      expect(args).toEqual(["auth", "token"]);
      return callback(null, `${token}\n`, "");
    });
    await expect(server.readGitHubCliToken(execFile)).resolves.toBe(token);
  });
});
