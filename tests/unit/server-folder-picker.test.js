const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const server = require("../../src/server");

describe("inline folder picker bridge", () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-folders-"));
    fs.mkdirSync(path.join(root, "Alpha", "Child result"), { recursive: true });
    fs.mkdirSync(path.join(root, "Beta folder"));
    fs.mkdirSync(path.join(root, "Gamma"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("lists a hierarchy and completes partial paths", () => {
    const sent = [];
    server.listFolders({ send: (message) => sent.push(message) }, { requestId: "list", path: root });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "folderListing", requestId: "list", ok: true, path: root });
    expect(sent[0].entries.map((entry) => entry.name)).toEqual(["Alpha", "Beta folder", "Gamma"]);
    expect(sent[0].parent).toBe(path.dirname(root));

    const completed = server.completeFolderPath(path.join(root, "bet"));
    expect(completed).toEqual({
      results: [{ name: "Beta folder", path: path.join(root, "Beta folder") }],
      hasMore: false
    });
  });

  it("rejects an explicit invalid path instead of silently navigating elsewhere", () => {
    const sent = [];
    const missing = path.join(root, "missing");
    server.listFolders({ send: (message) => sent.push(message) }, {
      requestId: "strict-list",
      path: missing,
      strict: true
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "folderListing",
      requestId: "strict-list",
      ok: false,
      path: missing,
      error: "That folder does not exist or cannot be opened."
    });
  });

  it("finds partial recursive matches with repeatable pagination", async () => {
    for (let index = 0; index < 105; index += 1) {
      fs.mkdirSync(path.join(root, `Match ${String(index).padStart(3, "0")}`));
    }

    const first = await server.fallbackFolderSearch(root, "match", 0);
    const second = await server.fallbackFolderSearch(root, "match", 100);
    expect(first.results).toHaveLength(100);
    expect(first.hasMore).toBe(true);
    expect(second.results).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    expect(new Set([...first.results, ...second.results].map((entry) => entry.path)).size).toBe(105);

    const nested = await server.fallbackFolderSearch(root, "child res", 0);
    expect(nested.results).toEqual([
      { name: "Child result", path: path.join(root, "Alpha", "Child result") }
    ]);
  });

  it("creates valid folders and rejects traversal or duplicates", () => {
    const sent = [];
    const client = { send: (message) => sent.push(message) };
    server.createFolder(client, { requestId: "create", path: root, name: "New folder" });
    server.createFolder(client, { requestId: "duplicate", path: root, name: "New folder" });
    server.createFolder(client, { requestId: "traversal", path: root, name: ".." });

    expect(fs.statSync(path.join(root, "New folder")).isDirectory()).toBe(true);
    expect(sent[0]).toMatchObject({ type: "folderCreated", requestId: "create", ok: true });
    expect(sent[1]).toMatchObject({ type: "folderCreated", requestId: "duplicate", ok: false });
    expect(sent[2]).toMatchObject({ type: "folderCreated", requestId: "traversal", ok: false });
  });

  it("routes folder API messages through the bridge dispatcher", async () => {
    const sent = [];
    const client = { send: (message) => sent.push(message) };
    server.handleClientMessage(client, JSON.stringify({ type: "folderList", requestId: "list", path: root }));
    server.handleClientMessage(client, JSON.stringify({
      type: "folderSearch",
      requestId: "search",
      path: root,
      query: "child",
      useEverything: false
    }));
    server.handleClientMessage(client, JSON.stringify({ type: "folderCreate", requestId: "create", path: root, name: "Made" }));

    await expect.poll(() => sent.some((message) => message.requestId === "search")).toBe(true);
    expect(sent.find((message) => message.requestId === "list")).toMatchObject({ type: "folderListing", ok: true });
    expect(sent.find((message) => message.requestId === "search")).toMatchObject({
      type: "folderSearchResults",
      ok: true,
      engine: "fallback"
    });
    expect(sent.find((message) => message.requestId === "create")).toMatchObject({ type: "folderCreated", ok: true });
  });
});