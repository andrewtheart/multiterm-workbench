/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const server = require("../../server.js");

afterEach(() => {
  server.clients.clear();
  vi.restoreAllMocks();
});

describe("Prompt Library bridge protocol", () => {
  it("normalizes renderer saves and broadcasts successful library revisions", async () => {
    const client = { send: vi.fn() };
    const observer = { send: vi.fn() };
    server.clients.add(observer);
    const promptLibraryRequest = vi.fn(async (request) => ({
      type: "promptLibraryResponse",
      ok: true,
      requestId: request.requestId,
      libraryRevision: 7,
      prompt: { id: "prompt-1", revision: 1 }
    }));

    server.handleClientMessage(client, JSON.stringify({
      type: "promptLibrarySave",
      requestId: "save-1",
      id: 42,
      name: "Review release",
      body: "Check the diff",
      expectedRevision: "bad"
    }), { promptLibraryRequest });

    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "promptLibraryResponse",
      ok: true,
      requestId: "save-1"
    })));
    expect(promptLibraryRequest).toHaveBeenCalledWith({
      operation: "upsert",
      requestId: "save-1",
      id: "",
      name: "Review release",
      body: "Check the diff",
      expectedRevision: 0
    });
    expect(observer.send).toHaveBeenCalledWith({
      type: "promptLibraryChanged",
      libraryRevision: 7
    });
  });

  it.each([
    ["promptLibraryList", "list"],
    ["promptLibraryGet", "get"],
    ["promptLibraryDelete", "delete"]
  ])("routes %s to the host %s operation", async (type, operation) => {
    const client = { send: vi.fn() };
    const promptLibraryRequest = vi.fn(async (request) => ({
      type: "promptLibraryResponse",
      ok: true,
      requestId: request.requestId
    }));

    server.handleClientMessage(client, JSON.stringify({
      type,
      requestId: `${operation}-1`,
      id: "bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
      expectedRevision: 5
    }), { promptLibraryRequest });

    await vi.waitFor(() => expect(promptLibraryRequest).toHaveBeenCalledWith(expect.objectContaining({
      operation,
      requestId: `${operation}-1`,
      expectedRevision: 5
    })));
  });

  it("rejects missing correlation without starting the host", async () => {
    const client = { send: vi.fn() };
    const requestHost = vi.fn();

    await server.sendPromptLibraryResponse(client, { type: "promptLibraryList" }, requestHost);

    expect(requestHost).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith({
      type: "promptLibraryResponse",
      ok: false,
      requestId: "",
      errorCode: "invalid_request",
      error: "The Prompt Library request is invalid."
    });
  });

  it("does not expose host failure details to the renderer", async () => {
    const client = { send: vi.fn() };
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await server.sendPromptLibraryResponse(
      client,
      { type: "promptLibraryList", requestId: "failure-1" },
      async () => { throw new Error("C:\\secret\\host.exe failed"); }
    );

    expect(client.send).toHaveBeenCalledWith({
      type: "promptLibraryResponse",
      ok: false,
      requestId: "failure-1",
      errorCode: "host_unavailable",
      error: "Prompt Library storage is unavailable."
    });
  });
});