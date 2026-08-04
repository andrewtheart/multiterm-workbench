/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const server = require("../../server.js");

let temporaryRoot;

beforeEach(() => {
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-copilot-sessions-"));
});

afterEach(() => {
  fs.rmSync(temporaryRoot, { force: true, recursive: true });
  vi.restoreAllMocks();
});

function addSession(id, workspace) {
  const directory = path.join(temporaryRoot, id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "workspace.yaml"), workspace, "utf8");
  return directory;
}

describe("Copilot CLI session discovery", () => {
  it("parses the CLI's generated YAML scalar forms", () => {
    expect(server.parseCopilotYamlScalar('"Quoted \\"name\\"\\r\\nnext"')).toBe('Quoted "name"\r\nnext');
    expect(server.parseCopilotYamlScalar('"invalid \\q escape"')).toBe("invalid \\q escape");
    expect(server.parseCopilotYamlScalar("'Andrew''s session'")).toBe("Andrew's session");
    expect(server.parseCopilotYamlScalar("null")).toBe("");
    expect(server.parseCopilotYamlScalar("~")).toBe("");
    expect(server.parseCopilotYamlScalar("main")).toBe("main");
  });

  it("reads, validates, and sorts current and legacy session metadata", async () => {
    const olderId = "0298ec3b-6599-4e8d-a620-c1338f9bb47b";
    const newerId = "bdfb990d-4ee9-4b72-a41c-fcbf0c79a373";
    const olderDirectory = addSession(olderId, [
      `id: ${olderId}`,
      "cwd: D:\\legacy",
      "repository: sample/legacy",
      "branch: old",
      "created_at: not-a-date",
      "updated_at: not-a-date"
    ].join("\n"));
    fs.utimesSync(path.join(olderDirectory, "workspace.yaml"), new Date("2026-01-01"), new Date("2026-01-01"));
    addSession(newerId.toUpperCase(), [
      `id: ${newerId}`,
      "cwd: D:\\multiTerm",
      "repository: andrewtheart/multiterm-workbench",
      "branch: main",
      'name: "Resume \\"picker\\""',
      "created_at: 2026-08-03T20:00:00.000Z",
      "updated_at: 2026-08-04T00:00:00.000Z"
    ].join("\n"));
    addSession("not-a-session", "name: ignored");
    fs.mkdirSync(path.join(temporaryRoot, "11111111-1111-4111-8111-111111111111"));

    const sessions = await server.listCopilotSessions(temporaryRoot);

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toEqual({
      id: newerId,
      name: 'Resume "picker"',
      cwd: "D:\\multiTerm",
      repository: "andrewtheart/multiterm-workbench",
      branch: "main",
      createdAt: "2026-08-03T20:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z"
    });
    expect(sessions[1].id).toBe(olderId);
    expect(Date.parse(sessions[1].updatedAt)).toBe(new Date("2026-01-01").getTime());
    expect(await server.listCopilotSessions(path.join(temporaryRoot, "missing"))).toEqual([]);
  });

  it("skips a session whose metadata cannot be read", async () => {
    const id = "bdfb990d-4ee9-4b72-a41c-fcbf0c79a373";
    addSession(id, "name: Unreadable session");
    const denied = Object.assign(new Error("access denied"), { code: "EACCES" });
    vi.spyOn(fs.promises, "readFile").mockRejectedValueOnce(denied);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(server.listCopilotSessions(temporaryRoot)).resolves.toEqual([]);
    expect(warning).toHaveBeenCalledWith(`[bridge] Could not read Copilot session ${id}: access denied`);
  });

  it("returns correlated protocol responses for success and read failure", async () => {
    const id = "bdfb990d-4ee9-4b72-a41c-fcbf0c79a373";
    addSession(id, `name: Test session\nupdated_at: 2026-08-04T00:00:00.000Z`);
    const client = { send: vi.fn() };

    await server.sendCopilotSessions(client, "request-success", temporaryRoot);
    expect(client.send).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "copilotSessions",
      requestId: "request-success",
      message: "",
      sessions: [expect.objectContaining({ id, name: "Test session" })]
    }));

    const fileInsteadOfDirectory = path.join(temporaryRoot, "not-a-directory");
    fs.writeFileSync(fileInsteadOfDirectory, "x");
    await server.sendCopilotSessions(client, "request-failure", fileInsteadOfDirectory);
    expect(client.send).toHaveBeenLastCalledWith({
      type: "copilotSessions",
      requestId: "request-failure",
      sessions: [],
      message: "Could not read Copilot CLI sessions from this Windows account."
    });
  });

  it("dispatches the list request through the bridge protocol", async () => {
    const client = { send: vi.fn() };
    vi.spyOn(fs.promises, "readdir").mockResolvedValue([]);

    server.handleClientMessage(client, JSON.stringify({ type: "listCopilotSessions", requestId: "dispatch" }));
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith({
      type: "copilotSessions",
      requestId: "dispatch",
      sessions: [],
      message: "No resumable Copilot CLI sessions were found in this Windows account."
    }));
  });
});