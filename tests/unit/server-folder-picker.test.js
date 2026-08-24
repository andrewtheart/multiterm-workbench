const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const server = require("../../src/server");

describe("inline folder picker bridge", () => {
  let root;
  let platformDescriptor;

  function searchDependencies(overrides = {}) {
    return {
      everythingFolderSearch: vi.fn(async () => ({ results: [], hasMore: false })),
      fallbackFolderSearch: vi.fn(async () => ({ results: [], hasMore: false })),
      findEverythingExecutable: vi.fn(() => ""),
      ...overrides
    };
  }

  beforeEach(() => {
    platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-folders-"));
    fs.mkdirSync(path.join(root, "Alpha", "Child result"), { recursive: true });
    fs.mkdirSync(path.join(root, "Beta folder"));
    fs.mkdirSync(path.join(root, "Gamma"));
  });

  afterEach(() => {
    if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("expands empty, home-relative, environment, and ordinary folder paths", () => {
    expect(server.expandFolderPath("  ")).toBe("");
    expect(server.expandFolderPath("~")).toBe(path.resolve(os.homedir()));
    expect(server.expandFolderPath("~/projects")).toBe(path.resolve(os.homedir(), "projects"));
    expect(server.expandFolderPath("~\\projects")).toBe(path.resolve(os.homedir(), "projects"));

    const savedFolderRoot = process.env.MULTITERM_FOLDER_ROOT;
    try {
      Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
      process.env.MULTITERM_FOLDER_ROOT = root;
      expect(server.expandFolderPath("%MULTITERM_FOLDER_ROOT%\\Alpha")).toBe(path.resolve(root, "Alpha"));
      expect(server.expandFolderPath("%multiterm_folder_root%\\Beta folder")).toBe(path.resolve(root, "Beta folder"));
      expect(server.expandFolderPath("%MISSING_MULTITERM_ROOT%\\Gamma"))
        .toBe(path.resolve("%MISSING_MULTITERM_ROOT%\\Gamma"));

      Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
      expect(server.expandFolderPath("%MULTITERM_FOLDER_ROOT%/Alpha"))
        .toBe(path.resolve("%MULTITERM_FOLDER_ROOT%/Alpha"));
    } finally {
      if (savedFolderRoot === undefined) delete process.env.MULTITERM_FOLDER_ROOT;
      else process.env.MULTITERM_FOLDER_ROOT = savedFolderRoot;
    }
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

  it("reports an unreadable hierarchy and returns no completions from it", () => {
    const sent = [];
    const readError = new Error("access denied");
    vi.spyOn(fs, "readdirSync").mockImplementation(() => { throw readError; });

    server.listFolders({ send: (message) => sent.push(message) }, { requestId: 7, path: root });
    expect(sent[0]).toMatchObject({
      type: "folderListing",
      requestId: "",
      ok: false,
      error: "access denied",
      path: root,
      entries: []
    });
    expect(server.completeFolderPath("")).toEqual({ results: [], hasMore: false });
    expect(server.completeFolderPath(path.join(root, "missing"))).toEqual({ results: [], hasMore: false });
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

  it("builds a bounded Everything query and shapes its results", async () => {
    const paths = Array.from({ length: 101 }, (_, index) => path.join(root, `Found ${index}`));
    const runSearch = vi.fn(async () => `${paths.join("\r\n")}\r\n`);

    const result = await server.everythingFolderSearch("C:\\tools\\es.exe", root, "a+b", 4, false, runSearch);

    expect(runSearch).toHaveBeenCalledOnce();
    expect(runSearch.mock.calls[0][0]).toBe("C:\\tools\\es.exe");
    expect(runSearch.mock.calls[0][1]).toEqual(expect.arrayContaining([
      "-n", "101", "-o", "4", "-path", root, "-r", "a\\+b"
    ]));
    expect(result.results).toHaveLength(100);
    expect(result.results[0]).toEqual({ name: "Found 0", path: paths[0] });
    expect(result.hasMore).toBe(true);

    await server.everythingFolderSearch("es", root, "needle", 0, true, vi.fn(async () => "C:\\\r\n"));
    expect(runSearch.mock.calls[0][1]).toContain("-path");
  });

  it("routes empty, autocomplete, indexed, disabled, and failed searches", async () => {
    const sent = [];
    const client = { send: (message) => sent.push(message) };
    const emptyDependencies = searchDependencies({ findEverythingExecutable: vi.fn(() => "es.exe") });
    await server.searchFolders(client, { requestId: "empty", path: root, query: " ", offset: -5 }, emptyDependencies);
    expect(sent.pop()).toMatchObject({
      type: "folderSearchResults",
      requestId: "empty",
      query: "",
      offset: 0,
      engine: "fallback",
      everythingAvailable: true,
      results: []
    });

    await server.searchFolders(client, {
      requestId: "complete",
      path: root,
      query: path.join(root, "bet"),
      autocomplete: true
    }, emptyDependencies);
    expect(sent.pop()).toMatchObject({
      requestId: "complete",
      engine: "direct",
      results: [{ name: "Beta folder", path: path.join(root, "Beta folder") }]
    });

    const indexedDependencies = searchDependencies({
      findEverythingExecutable: vi.fn(() => "es.exe"),
      everythingFolderSearch: vi.fn(async () => ({
        results: [{ name: "Indexed", path: path.join(root, "Indexed") }],
        hasMore: true
      }))
    });
    await server.searchFolders(client, {
      requestId: "indexed",
      path: root,
      query: "index",
      offset: "2",
      everywhere: true
    }, indexedDependencies);
    expect(indexedDependencies.everythingFolderSearch).toHaveBeenCalledWith("es.exe", root, "index", 2, true);
    expect(sent.pop()).toMatchObject({ requestId: "indexed", engine: "everything", everythingAvailable: true, hasMore: true });

    const disabledDependencies = searchDependencies({
      findEverythingExecutable: vi.fn(() => "es.exe"),
      fallbackFolderSearch: vi.fn(async () => ({ results: [], hasMore: false }))
    });
    await server.searchFolders(client, {
      requestId: "disabled",
      path: root,
      query: "missing",
      useEverything: false
    }, disabledDependencies);
    expect(disabledDependencies.findEverythingExecutable).not.toHaveBeenCalled();
    expect(disabledDependencies.fallbackFolderSearch).toHaveBeenCalledWith(root, "missing", 0);
    expect(sent.pop()).toMatchObject({ requestId: "disabled", engine: "fallback", warning: "" });

    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failedDependencies = searchDependencies({
      findEverythingExecutable: vi.fn(() => "es.exe"),
      everythingFolderSearch: vi.fn(async () => { throw new Error("index offline"); }),
      fallbackFolderSearch: vi.fn(async () => ({ results: [{ name: "Fallback", path: root }], hasMore: false }))
    });
    await server.searchFolders(client, {
      requestId: "failed",
      path: root,
      query: "fallback",
      everywhere: true
    }, failedDependencies);
    expect(warning).toHaveBeenCalledWith("[bridge] Everything folder search unavailable: index offline");
    expect(sent.pop()).toMatchObject({
      requestId: "failed",
      engine: "fallback",
      everythingAvailable: false,
      warning: "Everything is unavailable, so MultiTerm searched the current folder instead."
    });
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