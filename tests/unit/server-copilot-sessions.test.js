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

function packString(value) {
  const content = Buffer.from(value, "utf8");
  if (content.length < 32) return Buffer.concat([Buffer.from([0xa0 | content.length]), content]);
  return Buffer.concat([Buffer.from([0xd9, content.length]), content]);
}

function packMap(value) {
  const entries = Object.entries(value);
  return Buffer.concat([
    Buffer.from([0x80 | entries.length]),
    ...entries.flatMap(([key, item]) => [packString(key), packString(item)])
  ]);
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
    const previousEverythingPath = process.env.MULTITERM_ES_PATH;
    process.env.MULTITERM_ES_PATH = path.join(temporaryRoot, "missing-es.exe");

    server.handleClientMessage(client, JSON.stringify({ type: "listCopilotSessions", requestId: "dispatch" }));
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith({
      type: "copilotSessions",
      requestId: "dispatch",
      sessions: [],
      message: "No Copilot CLI, VS Code, or Visual Studio sessions were found in this Windows account."
    }));
    if (previousEverythingPath === undefined) delete process.env.MULTITERM_ES_PATH;
    else process.env.MULTITERM_ES_PATH = previousEverythingPath;
  });

  it("discovers CLI, VS Code, and Visual Studio sessions as one sorted catalog", async () => {
    const cliId = "0298ec3b-6599-4e8d-a620-c1338f9bb47b";
    addSession(cliId, "name: CLI task\nupdated_at: 2026-08-01T00:00:00.000Z");

    const vscodeRoot = path.join(temporaryRoot, "vscode");
    const workspaceHash = "a".repeat(32);
    const vscodeId = "bdfb990d-4ee9-4b72-a41c-fcbf0c79a373";
    const workspace = path.join(vscodeRoot, workspaceHash);
    fs.mkdirSync(path.join(workspace, "chatSessions"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "workspace.json"), JSON.stringify({ folder: "file:///D%3A/Source/App" }));
    const vscodeFile = path.join(workspace, "chatSessions", `${vscodeId}.jsonl`);
    fs.writeFileSync(vscodeFile, JSON.stringify({ kind: 0, v: {
      creationDate: Date.parse("2026-08-02T00:00:00.000Z"),
      customTitle: "VS Code task",
      sessionId: vscodeId
    } }));
    fs.utimesSync(vscodeFile, new Date("2026-08-03"), new Date("2026-08-03"));

    const visualStudioId = "70ea177d-5558-40c4-b068-2477e84b9325";
    const visualStudioFile = path.join(temporaryRoot, "VisualProject", ".vs", "VisualProject", "copilot-chat", "f26b551e", "sessions", visualStudioId);
    fs.mkdirSync(path.dirname(visualStudioFile), { recursive: true });
    fs.writeFileSync(visualStudioFile, Buffer.concat([Buffer.from([0x01]), packMap({ Name: "Visual Studio task" })]));
    fs.utimesSync(visualStudioFile, new Date("2026-08-04"), new Date("2026-08-04"));

    const sessions = await server.listAllCopilotSessions({
      cliRoot: temporaryRoot,
      vscodeRoot,
      visualStudioFiles: [visualStudioFile, visualStudioFile]
    });

    expect(sessions.map((session) => session.source)).toEqual(["visualstudio", "vscode", "cli"]);
    expect(sessions[0]).toMatchObject({ id: visualStudioId, name: "Visual Studio task", cwd: path.join(temporaryRoot, "VisualProject") });
    expect(sessions[1]).toMatchObject({ id: vscodeId, name: "VS Code task", cwd: path.normalize("D:\\Source\\App") });
    expect(sessions[2]).toMatchObject({ id: cliId, name: "CLI task" });
    expect(new Set(sessions.map((session) => session.key)).size).toBe(3);
    expect(server.copilotSessionCatalog.size).toBe(3);
  });

  it("exports selected editor history into a bounded private continuation file", async () => {
    const vscodeRoot = path.join(temporaryRoot, "vscode-context");
    const workspaceHash = "b".repeat(32);
    const vscodeId = "6f9d4799-beb6-4163-a392-1a22b54f3a2e";
    const workspace = path.join(vscodeRoot, workspaceHash);
    fs.mkdirSync(path.join(workspace, "chatSessions"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "workspace.json"), JSON.stringify({ folder: "file:///D%3A/ContextProject" }));
    const vscodeFile = path.join(workspace, "chatSessions", `${vscodeId}.jsonl`);
    fs.writeFileSync(vscodeFile, [
      { kind: 0, v: { customTitle: "Continue VS Code work", requests: [{ message: { text: "First question" }, response: [{ value: "First answer" }] }] } },
      { kind: 2, k: ["requests"], v: [{ message: { text: "Latest question" }, response: [{ value: "Initial answer" }] }] },
      { kind: 2, k: ["requests", 1, "response"], v: [{ value: "Final answer" }] }
    ].map(JSON.stringify).join("\n"));

    const sessions = await server.listAllCopilotSessions({
      cliRoot: path.join(temporaryRoot, "missing-cli"),
      vscodeRoot,
      visualStudioFiles: []
    });
    const result = await server.prepareCopilotSessionContext(sessions[0].key, 8);
    const context = fs.readFileSync(result.contextPath, "utf8");

    expect(result).toMatchObject({ cwd: path.normalize("D:\\ContextProject"), id: vscodeId, source: "vscode" });
    expect(context).toContain("# Imported VS Code Copilot session");
    expect(context).toContain("First question");
    expect(context).toContain("Latest question");
    expect(context).toContain("Initial answer\nFinal answer");
    expect(fs.statSync(result.contextPath).size).toBeLessThanOrEqual(8 * 1024);
    fs.rmSync(result.contextPath, { force: true });
  });

  it("extracts Visual Studio user and assistant content and clamps the configured import size", () => {
    const values = [
      1,
      { Name: "Header" },
      [0, { Content: [[0, { Content: "Visual Studio question" }], [0, { Content: "Built-in guidance" }]] }],
      [1, { Content: [[3, { Content: "Visual Studio answer" }], [7, { State: "tool" }]] }]
    ];
    expect(server.visualStudioExchanges(values)).toEqual([{
      user: "Visual Studio question\nBuilt-in guidance",
      assistant: "Visual Studio answer"
    }]);
    expect(server.clampCopilotImportContextKb("bad")).toBe(64);
    expect(server.clampCopilotImportContextKb(1)).toBe(8);
    expect(server.clampCopilotImportContextKb(5000)).toBe(1024);
  });
});