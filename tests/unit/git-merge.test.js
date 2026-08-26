const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");
const childProcess = require("node:child_process");
const { execFileSync } = require("node:child_process");
const {
  handleClientMessage,
  inspectGitRepository,
  listGitWorktrees,
  recordWorktreeParent,
  forgetWorktreeParent,
  snapshotGitWorktree,
  createGitWorktree,
  startWorktreeMerge,
  finishWorktreeMerge,
  readConflictSides,
  writeConflictResolution
} = require("../../src/server.js");

const root = path.join(os.tmpdir(), `mt-merge-tests-${process.pid}`);
const realGitTestTimeout = 15000;

function makeRepo(name, { conflict = false } = {}) {
  const repo = path.join(root, name);
  fs.mkdirSync(repo, { recursive: true });
  const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "p@e.com"]);
  git(["config", "user.name", "P"]);
  fs.writeFileSync(path.join(repo, "shared.txt"), "one\ntwo\nthree\n");
  git(["add", "."]);
  git(["commit", "-m", "base"]);
  const worktree = path.join(root, `${name}-wt`);
  git(["worktree", "add", worktree, "-b", "agent"]);
  fs.writeFileSync(path.join(worktree, "shared.txt"), "one\nAGENT\nthree\n");
  git(["add", "."], worktree);
  git(["commit", "-m", "agent edit"], worktree);
  if (conflict) {
    fs.writeFileSync(path.join(repo, "shared.txt"), "one\nMAIN\nthree\n");
    git(["add", "."]);
    git(["commit", "-m", "main edit"]);
  }
  return { repo, worktree };
}

function makeCreationRepo(name) {
  const repo = path.join(root, name);
  fs.mkdirSync(repo, { recursive: true });
  const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "p@e.com"]);
  git(["config", "user.name", "P"]);
  fs.writeFileSync(path.join(repo, "base.txt"), "base\n");
  git(["add", "."]);
  git(["commit", "-m", "base"]);
  return { git, repo };
}

beforeAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("git repository and worktree bridge", () => {
  test("reports Git spawn, stream error, and timeout outcomes", async () => {
    const spawn = vi.spyOn(childProcess, "spawn");
    spawn.mockImplementationOnce(() => { throw new Error("spawn denied"); });
    await expect(require("../../src/server.js").runGit(["status"], root)).resolves.toMatchObject({
      ok: false, code: -1, timedOut: false, stdout: "", stderr: "spawn denied"
    });

    const failed = new EventEmitter();
    failed.stdout = new EventEmitter();
    failed.stderr = new EventEmitter();
    failed.kill = vi.fn();
    spawn.mockReturnValueOnce(failed);
    const failedResult = require("../../src/server.js").runGit(["status"], root);
    failed.stdout.emit("data", Buffer.from("partial out"));
    failed.stderr.emit("data", Buffer.from("partial err"));
    failed.emit("error", new Error("process failed"));
    failed.emit("close", 1);
    await expect(failedResult).resolves.toMatchObject({
      ok: false, code: -1, timedOut: false, stdout: "partial out", stderr: "partial errprocess failed"
    });

    vi.useFakeTimers();
    const timed = new EventEmitter();
    timed.stdout = new EventEmitter();
    timed.stderr = new EventEmitter();
    timed.kill = vi.fn(() => { throw new Error("already exited"); });
    spawn.mockReturnValueOnce(timed);
    const timedResult = require("../../src/server.js").runGit(["status"], root, 1);
    await vi.advanceTimersByTimeAsync(2);
    expect(timed.kill).toHaveBeenCalledOnce();
    await expect(timedResult).resolves.toMatchObject({
      ok: false, code: -1, timedOut: true
    });
    expect((await timedResult).durationMs).toBeGreaterThanOrEqual(1);
    vi.useRealTimers();
  });

  test("inspects missing, invalid, non-repository, clean, and dirty folders", async () => {
    const plain = path.join(root, "plain-folder");
    const plainFile = path.join(root, "plain-file.txt");
    fs.mkdirSync(plain, { recursive: true });
    fs.writeFileSync(plainFile, "not a folder");

    await expect(inspectGitRepository("")).resolves.toEqual({
      isRepository: false,
      reason: "No folder was provided."
    });
    await expect(inspectGitRepository(plainFile)).resolves.toEqual({
      isRepository: false,
      reason: "That path is not a folder."
    });
    await expect(inspectGitRepository(path.join(root, "missing"))).resolves.toEqual({
      isRepository: false,
      reason: "That folder does not exist."
    });
    await expect(inspectGitRepository(plain)).resolves.toEqual({
      isRepository: false,
      reason: "That folder is not inside a git repository."
    });

    const { repo } = makeRepo("inspection");
    const clean = await inspectGitRepository(repo);
    expect(clean).toMatchObject({
      isRepository: true,
      repositoryRoot: path.resolve(repo),
      currentBranch: "main",
      defaultBranch: "main",
      isDirty: false,
      parentDirectory: path.dirname(repo)
    });
    fs.writeFileSync(path.join(repo, "dirty.txt"), "pending");
    await expect(inspectGitRepository(repo)).resolves.toMatchObject({ isRepository: true, isDirty: true });
  });

  test("records, lists, and forgets managed worktree metadata", async () => {
    const { repo, worktree } = makeRepo("registry");
    await recordWorktreeParent(repo, "agent", "main");

    let listed = await listGitWorktrees(repo);
    expect(listed).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: worktree.replace(/\\/g, "/"), branch: "agent", parentBranch: "main", createdByMultiTerm: true })
    ]));
    expect(listed.find((entry) => entry.branch === "agent").createdAt).not.toBe("");

    await forgetWorktreeParent(repo, "agent");
    listed = await listGitWorktrees(repo);
    expect(listed.find((entry) => entry.branch === "agent")).toMatchObject({
      parentBranch: "",
      createdAt: "",
      createdByMultiTerm: false
    });

    const detachedPath = path.join(root, "registry-detached");
    execFileSync("git", ["worktree", "add", "--detach", detachedPath, "HEAD"], { cwd: repo, stdio: "ignore" });
    expect(await listGitWorktrees(repo)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: detachedPath.replace(/\\/g, "/"), branch: "", isDetached: true })
    ]));

    const bare = path.join(root, "bare.git");
    execFileSync("git", ["init", "--bare", bare], { stdio: "ignore" });
    expect(await listGitWorktrees(bare)).toEqual([
      expect.objectContaining({ path: bare.replace(/\\/g, "/"), branch: "", isBare: true })
    ]);
  });

  test("reports every Git snapshot stage failure and supports a tree-only snapshot", async () => {
    const success = (stdout = "") => ({ ok: true, stdout, stderr: "" });
    const runner = (failedStage = "") => vi.fn(async (args, _directory, _timeout, options) => {
      const stage = args[0] === "write-tree"
        ? (options?.env ? "snapshot-tree" : "index-tree")
        : args[0];
      if (stage === failedStage) return { ok: false, stdout: "", stderr: `${stage} failed` };
      if (stage === "rev-parse") return success("head\n");
      if (stage === "status") return success(" M pending.txt\n");
      if (stage === "index-tree") return success("index\n");
      if (stage === "snapshot-tree") return success("tree\n");
      if (stage === "commit-tree") return success("commit\n");
      return success();
    });

    for (const stage of ["rev-parse", "status", "index-tree", "read-tree", "add", "snapshot-tree", "commit-tree"]) {
      await expect(snapshotGitWorktree(root, "Snapshot", { run: runner(stage) }))
        .resolves.toMatchObject({ ok: false, reason: `${stage} failed` });
    }

    const run = runner();
    await expect(snapshotGitWorktree(root, "Tree only", {
      captureIndex: false,
      captureStatus: false,
      createCommit: false,
      run
    })).resolves.toEqual({
      ok: true,
      reason: "",
      head: "head",
      indexTree: "",
      tree: "tree",
      commit: "",
      status: ""
    });
    expect(run.mock.calls.map(([args]) => args[0])).toEqual(["rev-parse", "read-tree", "add", "write-tree"]);
  });

  test("creates a worktree with the parent's pending snapshot without changing the parent", async () => {
    const repo = path.join(root, "create-with-pending");
    const worktree = path.join(root, "create-with-pending-wt");
    fs.mkdirSync(repo, { recursive: true });
    const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git(["init", "-b", "main"]);
    git(["config", "user.email", "p@e.com"]);
    git(["config", "user.name", "P"]);
    fs.writeFileSync(path.join(repo, "modified.txt"), "base modified\n");
    fs.writeFileSync(path.join(repo, "staged.txt"), "base staged\n");
    fs.writeFileSync(path.join(repo, "deleted.txt"), "base deleted\n");
    git(["add", "."]);
    git(["commit", "-m", "base"]);

    fs.writeFileSync(path.join(repo, "modified.txt"), "pending modified\n");
    fs.writeFileSync(path.join(repo, "staged.txt"), "pending staged\n");
    git(["add", "staged.txt"]);
    fs.rmSync(path.join(repo, "deleted.txt"));
    fs.writeFileSync(path.join(repo, "untracked.txt"), "pending untracked\n");
    const parentStatus = git(["status", "--porcelain=v1", "--untracked-files=all"]);
    const parentHead = git(["rev-parse", "HEAD"]).trim();

    const created = await createGitWorktree({
      repositoryRoot: repo,
      parentBranch: "main",
      branch: "agent-import",
      worktreePath: worktree,
      importPending: true
    });

    expect(created).toMatchObject({ ok: true, importedPending: true, snapshotCommit: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(git(["status", "--porcelain=v1", "--untracked-files=all"])).toBe(parentStatus);
    expect(git(["rev-parse", "HEAD"], worktree).trim()).toBe(parentHead);
    expect(fs.readFileSync(path.join(worktree, "modified.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("pending modified\n");
    expect(fs.readFileSync(path.join(worktree, "staged.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("pending staged\n");
    expect(fs.existsSync(path.join(worktree, "deleted.txt"))).toBe(false);
    expect(fs.readFileSync(path.join(worktree, "untracked.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("pending untracked\n");
    expect(git(["status", "--porcelain=v1", "--untracked-files=all"], worktree)).toContain("?? untracked.txt");
    expect(git(["config", "--local", "--get", "multiterm.worktree.agent-import.parent"]).trim()).toBe("main");
    expect(git(["config", "--local", "--get", "multiterm.worktree.agent-import.importedSnapshot"]).trim()).toBe(created.snapshotCommit);
  });

  test("validates worktree creation and records a clean worktree without an imported snapshot", async () => {
    await expect(createGitWorktree({})).resolves.toEqual({
      ok: false,
      reason: "Repository, parent branch, worktree branch and path are all required."
    });

    const { git, repo } = makeCreationRepo("create-validation");
    const nested = path.join(repo, "nested");
    const target = path.join(root, "create-validation-wt");
    fs.mkdirSync(nested);
    await expect(createGitWorktree({
      repositoryRoot: nested,
      parentBranch: "main",
      branch: "agent",
      worktreePath: target,
      importPending: false
    })).resolves.toMatchObject({ ok: false, reason: "That repository path is not a checkout root." });
    await expect(createGitWorktree({
      repositoryRoot: repo,
      parentBranch: "bad parent",
      branch: "bad branch",
      worktreePath: target,
      importPending: false
    })).resolves.toEqual({ ok: false, reason: "The parent or worktree branch name is not valid." });

    const progress = vi.fn();
    const created = await createGitWorktree({
      repositoryRoot: repo,
      parentBranch: "main",
      branch: "clean-agent",
      worktreePath: target,
      importPending: true
    }, progress);
    expect(created).toEqual({ ok: true, reason: "", importedPending: false, snapshotCommit: "" });
    expect(progress.mock.calls.map(([phase]) => phase)).toEqual(["validating", "creating", "recording"]);
    expect(git(["config", "--local", "--get", "multiterm.worktree.clean-agent.parent"]).trim()).toBe("main");

    const duplicate = await createGitWorktree({
      repositoryRoot: repo,
      parentBranch: "main",
      branch: "clean-agent",
      worktreePath: path.join(root, "create-validation-duplicate"),
      importPending: false
    });
    expect(duplicate).toMatchObject({ ok: false, reason: expect.any(String) });
    git(["worktree", "remove", "--force", target]);
    git(["branch", "-D", "clean-agent"]);
  }, realGitTestTimeout);

  test("removes a new worktree when importing or verifying pending changes fails", async () => {
    const materialize = makeCreationRepo("create-materialize-failure");
    fs.writeFileSync(path.join(materialize.repo, "pending.txt"), "pending\n");
    const materializeTarget = path.join(root, "create-materialize-failure-wt");
    const materializeResult = await createGitWorktree({
      repositoryRoot: materialize.repo,
      parentBranch: "main",
      branch: "materialize-agent",
      worktreePath: materializeTarget,
      importPending: true
    }, (phase) => {
      if (phase === "importing") fs.rmSync(path.join(materializeTarget, ".git"), { force: true });
    });
    expect(materializeResult).toMatchObject({ ok: false, reason: expect.any(String) });
    expect(materialize.git(["branch", "--list", "materialize-agent"]).trim()).toBe("");

    const verify = makeCreationRepo("create-verify-failure");
    fs.writeFileSync(path.join(verify.repo, "pending.txt"), "pending\n");
    const verifyTarget = path.join(root, "create-verify-failure-wt");
    const verifyResult = await createGitWorktree({
      repositoryRoot: verify.repo,
      parentBranch: "main",
      branch: "verify-agent",
      worktreePath: verifyTarget,
      importPending: true
    }, (phase) => {
      if (phase === "verifying") fs.writeFileSync(path.join(verifyTarget, "mismatch.txt"), "different\n");
    });
    expect(verifyResult).toEqual({ ok: false, reason: "The imported worktree did not match the parent snapshot." });
    expect(verify.git(["branch", "--list", "verify-agent"]).trim()).toBe("");
  }, realGitTestTimeout);

  test("directs commit modes to Pending when committed imports still overlap the parent", async () => {
    const repo = path.join(root, "import-overlap");
    const worktree = path.join(root, "import-overlap-wt");
    fs.mkdirSync(repo, { recursive: true });
    const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git(["init", "-b", "main"]);
    git(["config", "user.email", "p@e.com"]);
    git(["config", "user.name", "P"]);
    fs.writeFileSync(path.join(repo, "shared.txt"), "base\n");
    git(["add", "."]);
    git(["commit", "-m", "base"]);
    fs.writeFileSync(path.join(repo, "shared.txt"), "imported pending\n");
    const created = await createGitWorktree({
      repositoryRoot: repo,
      parentBranch: "main",
      branch: "agent-overlap",
      worktreePath: worktree,
      importPending: true
    });
    expect(created.ok).toBe(true);
    git(["add", "."], worktree);
    git(["commit", "-m", "commit imported edit"], worktree);

    const blocked = await startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "main",
      worktreeBranch: "agent-overlap",
      strategy: "squash"
    });
    expect(blocked).toMatchObject({
      ok: false,
      status: "importedOverlap",
      changes: ["shared.txt"]
    });
    expect(blocked.reason).toContain("Use Pending");

    execFileSync("git", ["restore", "shared.txt"], { cwd: repo });
    const allowed = await startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "main",
      worktreeBranch: "agent-overlap",
      strategy: "squash"
    });
    expect(allowed).toMatchObject({ ok: true, status: "staged" });
    await finishWorktreeMerge(allowed.sessionId, { abort: true });
  }, realGitTestTimeout);

  test("routes inspection, listing, record, diff, and removal messages", async () => {
    const { repo, worktree } = makeRepo("protocol");
    const client = { send: vi.fn() };
    const send = (message) => handleClientMessage(client, JSON.stringify(message));

    send({ type: "gitInspect", requestId: "inspect", path: repo });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitInspection", requestId: "inspect", isRepository: true
    })));

    send({ type: "gitWorktrees", requestId: "list-invalid", path: "" });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith({
      type: "gitWorktreeList",
      requestId: "list-invalid",
      ok: false,
      reason: "No folder was provided.",
      worktrees: []
    }));
    send({ type: "gitWorktrees", requestId: "list", path: repo });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitWorktreeList", requestId: "list", ok: true, reason: "", worktrees: expect.any(Array)
    })));

    send({ type: "gitWorktreeRecord", requestId: "record-invalid", repositoryRoot: repo });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitWorktreeRecorded", requestId: "record-invalid", ok: false
    })));
    send({ type: "gitWorktreeRecord", requestId: "record", repositoryRoot: repo, branch: "agent", parentBranch: "main" });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith({
      type: "gitWorktreeRecorded", requestId: "record", ok: true, reason: ""
    }));

    for (const [requestId, base, head] of [["diff-missing", "", "agent"], ["diff-option", "-main", "agent"]]) {
      send({ type: "gitDiff", requestId, repositoryRoot: repo, base, head });
      await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith({
        type: "gitDiffResult", requestId, ok: false, diff: "", scope: "",
        reason: "A repository and two revisions are required.", truncated: false
      }));
    }
    send({ type: "gitDiff", requestId: "diff", repositoryRoot: repo, base: "main", head: "agent" });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitDiffResult", requestId: "diff", ok: true, reason: "", truncated: false,
      diff: expect.stringContaining("AGENT")
    })));
    send({ type: "gitDiff", requestId: "diff-failure", repositoryRoot: repo, base: "missing", head: "agent" });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitDiffResult", requestId: "diff-failure", ok: false, diff: "", truncated: false
    })));

    send({
      type: "gitMergeStart",
      requestId: "merge-start",
      repositoryRoot: repo,
      parentBranch: "main",
      worktreeBranch: "agent",
      strategy: "pending"
    });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitMergeStarted", requestId: "merge-start", ok: true, status: "staged"
    })), { timeout: 10000 });
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "operationProgress", requestId: "merge-start", operation: "gitMergeStart", phase: "snapshotting"
    }));
    const mergeSessionId = client.send.mock.calls.find(([frame]) => frame.type === "gitMergeStarted" && frame.requestId === "merge-start")[0].sessionId;
    send({ type: "gitMergeFinish", requestId: "merge-abort", sessionId: mergeSessionId, abort: true });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith({
      type: "gitMergeFinished", requestId: "merge-abort", ok: true, reason: ""
    }));
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "operationProgress", requestId: "merge-abort", operation: "gitMergeFinish", phase: "rolling-back"
    }));
    send({ type: "gitConflictRead", requestId: "conflict-read", sessionId: "missing", path: "shared.txt" });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitConflictSides", requestId: "conflict-read", path: "shared.txt", ok: false
    })));
    send({ type: "gitConflictWrite", requestId: "conflict-write", sessionId: "missing", path: "shared.txt", contents: "resolved" });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitConflictWritten", requestId: "conflict-write", path: "shared.txt", ok: false
    })));
    send({ type: "gitConflictWrite", requestId: "conflict-write-empty", path: "shared.txt", contents: 42 });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitConflictWritten", requestId: "conflict-write-empty", path: "shared.txt", ok: false
    })));

    send({ type: "gitWorktreeRemove", requestId: "remove-invalid" });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitWorktreeRemoved", requestId: "remove-invalid", ok: false
    })));
    fs.writeFileSync(path.join(worktree, "dirty.txt"), "pending");
    send({ type: "gitWorktreeRemove", requestId: "remove-dirty", repositoryRoot: repo, path: worktree, branch: "agent" });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitWorktreeRemoved", requestId: "remove-dirty", ok: false
    })));
    fs.rmSync(path.join(worktree, "dirty.txt"));
    send({ type: "gitWorktreeRemove", requestId: "remove", repositoryRoot: repo, path: worktree, branch: "agent" });
    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith({
      type: "gitWorktreeRemoved", requestId: "remove", ok: true, reason: ""
    }));
  });

  test("caps a large worktree diff and marks it as truncated", async () => {
    const { repo, worktree } = makeRepo("large-diff");
    fs.writeFileSync(path.join(worktree, "large.txt"), "x".repeat((2 * 1024 * 1024) + 2048));
    execFileSync("git", ["add", "large.txt"], { cwd: worktree });
    execFileSync("git", ["commit", "-m", "large diff"], { cwd: worktree });
    const client = { send: vi.fn() };

    handleClientMessage(client, JSON.stringify({
      type: "gitDiff",
      requestId: "large",
      repositoryRoot: repo,
      base: "main",
      head: "agent"
    }));

    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitDiffResult", requestId: "large", ok: true, reason: "", truncated: true
    })), { timeout: 10000 });
    expect(client.send.mock.calls.at(-1)[0].diff).toHaveLength(2 * 1024 * 1024);
  });

  test("reviews committed and pending worktree changes without altering its index", async () => {
    const { repo, worktree } = makeRepo("review-pending");
    fs.writeFileSync(path.join(worktree, "shared.txt"), "one\nAGENT WITH UNSTAGED WORK\nthree\n");
    fs.writeFileSync(path.join(worktree, "staged.txt"), "staged work\n");
    execFileSync("git", ["add", "staged.txt"], { cwd: worktree });
    fs.writeFileSync(path.join(worktree, "untracked.txt"), "untracked work\n");
    const statusBefore = execFileSync("git", ["status", "--porcelain=v1"], { cwd: worktree, encoding: "utf8" });
    const client = { send: vi.fn() };

    handleClientMessage(client, JSON.stringify({
      type: "gitDiff",
      requestId: "pending",
      repositoryRoot: repo,
      base: "main",
      head: "agent",
      worktreePath: worktree
    }));

    await vi.waitFor(() => expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "gitDiffResult",
      requestId: "pending",
      ok: true,
      diff: expect.stringContaining("AGENT WITH UNSTAGED WORK")
    })));
    const diff = client.send.mock.calls.at(-1)[0].diff;
    expect(diff).toContain("staged.txt");
    expect(diff).toContain("staged work");
    expect(diff).toContain("untracked.txt");
    expect(diff).toContain("untracked work");
    expect(execFileSync("git", ["status", "--porcelain=v1"], { cwd: worktree, encoding: "utf8" })).toBe(statusBefore);
  });
});

describe("worktree merge-back", () => {
  test("ignores a worktree whose directory has been deleted", async () => {
    const { git, repo } = makeCreationRepo("stale-listing");
    const gone = path.join(root, "stale-listing-gone");
    git(["worktree", "add", gone, "-b", "gone"]);
    fs.rmSync(gone, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

    // Git keeps the record until it is pruned, so the dead path would otherwise
    // be offered as a real worktree.
    const worktrees = await listGitWorktrees(repo);
    expect(worktrees.map((worktree) => worktree.branch)).not.toContain("gone");
  }, realGitTestTimeout);

  test("merges into a parent whose previous worktree directory has been deleted", async () => {
    const { git, repo } = makeCreationRepo("stale-parent");
    git(["branch", "parent"]);
    const parentWorktree = path.join(root, "stale-parent-checkout");
    git(["worktree", "add", parentWorktree, "parent"]);
    const agentWorktree = path.join(root, "stale-parent-agent");
    git(["worktree", "add", agentWorktree, "-b", "agent-stale", "parent"]);
    fs.writeFileSync(path.join(agentWorktree, "agent.txt"), "from the agent\n");
    git(["add", "."], agentWorktree);
    git(["commit", "-m", "agent work"], agentWorktree);

    // The parent's worktree vanishes the way an interrupted run or a cleaned
    // temp directory leaves it: the directory is gone, the record is not.
    fs.rmSync(parentWorktree, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

    const started = await startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "parent",
      worktreeBranch: "agent-stale",
      strategy: "merge"
    });
    // Unpruned, the dead path is reported as the parent checkout and the merge
    // runs in a directory that is not there.
    expect(started).toMatchObject({ ok: true, status: "staged" });
    expect(fs.existsSync(started.workPath)).toBe(true);
    await finishWorktreeMerge(started.sessionId, { abort: true });
  }, realGitTestTimeout);

  test("rejects missing merge inputs and missing branches", async () => {
    await expect(startWorktreeMerge({})).resolves.toMatchObject({ status: "refused", reason: expect.stringContaining("required") });
    const { repo } = makeRepo("missing-branches");
    await expect(startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "missing-parent",
      worktreeBranch: "agent",
      strategy: "squash"
    })).resolves.toMatchObject({ status: "refused" });
    await expect(startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "main",
      worktreeBranch: "missing-agent",
      strategy: "merge"
    })).resolves.toMatchObject({ status: "refused" });
  });

  test("squashes a clean worktree into its parent as one commit", async () => {
    const { repo } = makeRepo("clean");
    const started = await startWorktreeMerge({ repositoryRoot: repo, parentBranch: "main", worktreeBranch: "agent", strategy: "squash" });
    expect(started.status).toBe("staged");
    expect(started.conflicts).toEqual([]);

    expect(await finishWorktreeMerge(started.sessionId, { commitMessage: "squashed" })).toEqual({ ok: true, reason: "" });
    expect(fs.readFileSync(path.join(repo, "shared.txt"), "utf8")).toContain("AGENT");
    const log = execFileSync("git", ["log", "--oneline"], { cwd: repo, encoding: "utf8" }).trim().split("\n");
    expect(log).toHaveLength(2);
  });

  test("reports conflicts with all three sides and diff3 markers", async () => {
    const { repo } = makeRepo("conflict", { conflict: true });
    const started = await startWorktreeMerge({ repositoryRoot: repo, parentBranch: "main", worktreeBranch: "agent", strategy: "merge" });
    expect(started.status).toBe("conflicts");
    expect(started.conflicts).toEqual(["shared.txt"]);

    const sides = await readConflictSides(started.sessionId, "shared.txt");
    expect(sides.base).toContain("two");
    expect(sides.ours).toContain("MAIN");
    expect(sides.theirs).toContain("AGENT");
    expect(sides).toMatchObject({ baseExists: true, oursExists: true, theirsExists: true, binary: false });
    expect(sides.merged).toContain("|||||||");

    const resolved = await writeConflictResolution(started.sessionId, "shared.txt", "one\nRESOLVED\nthree\n");
    expect(resolved).toMatchObject({ ok: true, remaining: [] });
    expect(await finishWorktreeMerge(started.sessionId, { commitMessage: "merged" })).toEqual({ ok: true, reason: "" });
    expect(fs.readFileSync(path.join(repo, "shared.txt"), "utf8")).toContain("RESOLVED");
  });

  test("resolves a conflict by selecting Git's incoming side", async () => {
    const { repo } = makeRepo("conflict-incoming", { conflict: true });
    const started = await startWorktreeMerge({ repositoryRoot: repo, parentBranch: "main", worktreeBranch: "agent", strategy: "merge" });
    const resolved = await writeConflictResolution(started.sessionId, "shared.txt", "", { choice: "theirs" });
    expect(resolved).toMatchObject({ ok: true, remaining: [] });
    expect(await finishWorktreeMerge(started.sessionId, { commitMessage: "incoming" })).toEqual({ ok: true, reason: "" });
    expect(fs.readFileSync(path.join(repo, "shared.txt"), "utf8")).toContain("AGENT");
  });

  test("preserves a parent-side deletion in a modify-delete conflict", async () => {
    const { repo } = makeRepo("conflict-delete");
    execFileSync("git", ["rm", "shared.txt"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "parent deletes"], { cwd: repo, stdio: "ignore" });
    const started = await startWorktreeMerge({ repositoryRoot: repo, parentBranch: "main", worktreeBranch: "agent", strategy: "merge" });
    expect(started).toMatchObject({ ok: true, status: "conflicts", conflicts: ["shared.txt"] });
    await expect(readConflictSides(started.sessionId, "shared.txt")).resolves.toMatchObject({
      oursExists: false,
      theirsExists: true,
      binary: false
    });
    await expect(writeConflictResolution(started.sessionId, "shared.txt", "", { choice: "ours" })).resolves.toMatchObject({
      ok: true,
      remaining: []
    });
    await expect(finishWorktreeMerge(started.sessionId, { commitMessage: "keep deletion" })).resolves.toEqual({ ok: true, reason: "" });
    expect(fs.existsSync(path.join(repo, "shared.txt"))).toBe(false);
  });

  test("detects binary conflict sides and selects one without JSON round-tripping its bytes", async () => {
    const { repo, worktree } = makeRepo("conflict-binary");
    const current = Buffer.from([0, 1, 2, 77, 65, 73, 78]);
    const incoming = Buffer.from([0, 1, 2, 65, 71, 69, 78, 84]);
    fs.writeFileSync(path.join(repo, "shared.txt"), current);
    execFileSync("git", ["add", "shared.txt"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "parent binary"], { cwd: repo, stdio: "ignore" });
    fs.writeFileSync(path.join(worktree, "shared.txt"), incoming);
    execFileSync("git", ["add", "shared.txt"], { cwd: worktree, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "agent binary"], { cwd: worktree, stdio: "ignore" });
    const started = await startWorktreeMerge({ repositoryRoot: repo, parentBranch: "main", worktreeBranch: "agent", strategy: "merge" });
    expect(started.status).toBe("conflicts");
    await expect(readConflictSides(started.sessionId, "shared.txt")).resolves.toMatchObject({ binary: true });
    await expect(writeConflictResolution(started.sessionId, "shared.txt", "", { choice: "theirs" })).resolves.toMatchObject({
      ok: true,
      remaining: []
    });
    await expect(finishWorktreeMerge(started.sessionId, { commitMessage: "incoming binary" })).resolves.toEqual({ ok: true, reason: "" });
    expect(fs.readFileSync(path.join(repo, "shared.txt"))).toEqual(incoming);
  });

  test("refuses when the worktree has uncommitted changes", async () => {
    const { repo, worktree } = makeRepo("dirty");
    fs.writeFileSync(path.join(worktree, "shared.txt"), "scratch\n");
    const started = await startWorktreeMerge({ repositoryRoot: repo, parentBranch: "main", worktreeBranch: "agent", strategy: "squash" });
    expect(started.status).toBe("dirty");
    expect(started.changes).toEqual(["M shared.txt"]);
  });

  test("refuses when the parent checkout has uncommitted changes", async () => {
    const { repo } = makeRepo("parent-dirty");
    fs.writeFileSync(path.join(repo, "shared.txt"), "local scratch\n");
    const started = await startWorktreeMerge({ repositoryRoot: repo, parentBranch: "main", worktreeBranch: "agent", strategy: "squash" });
    expect(started.status).toBe("parentDirty");
    expect(started.reason).toContain("uncommitted changes");
  });

  test("brings committed and pending worktree changes back while parent changes stay pending", async () => {
    const { repo, worktree } = makeRepo("pending-roundtrip");
    const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const parentHead = git(["rev-parse", "HEAD"]).trim();
    const worktreeHead = git(["rev-parse", "HEAD"], worktree).trim();
    const stashesBefore = git(["stash", "list", "--format=%H"]);

    fs.writeFileSync(path.join(repo, "parent-staged.txt"), "parent staged\n");
    git(["add", "parent-staged.txt"]);
    fs.writeFileSync(path.join(repo, "parent-pending.txt"), "parent pending\n");
    fs.writeFileSync(path.join(worktree, "worktree-pending.txt"), "worktree pending\n");
    fs.writeFileSync(path.join(worktree, "shared.txt"), "one\nAGENT COMMITTED AND PENDING\nthree\n");
    const worktreeStatusBefore = git(["status", "--porcelain"], worktree);

    const started = await startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "main",
      worktreeBranch: "agent",
      strategy: "pending"
    });
    expect(started).toMatchObject({ ok: true, status: "staged", conflicts: [] });

    await expect(finishWorktreeMerge(started.sessionId)).resolves.toMatchObject({
      ok: true,
      reason: "",
      status: "pending"
    });
    expect(git(["rev-parse", "HEAD"]).trim()).toBe(parentHead);
    expect(git(["rev-parse", "HEAD"], worktree).trim()).toBe(worktreeHead);
    expect(git(["status", "--porcelain"], worktree)).toBe(worktreeStatusBefore);
    expect(git(["stash", "list", "--format=%H"])).toBe(stashesBefore);
    expect(fs.readFileSync(path.join(repo, "shared.txt"), "utf8")).toContain("AGENT COMMITTED AND PENDING");
    expect(fs.readFileSync(path.join(repo, "parent-staged.txt"), "utf8").trim()).toBe("parent staged");
    expect(fs.readFileSync(path.join(repo, "parent-pending.txt"), "utf8").trim()).toBe("parent pending");
    expect(fs.readFileSync(path.join(repo, "worktree-pending.txt"), "utf8").trim()).toBe("worktree pending");
    expect(git(["status", "--porcelain"])).toEqual(expect.stringContaining("shared.txt"));
    expect(git(["status", "--porcelain"])).toEqual(expect.stringContaining("parent-staged.txt"));
    expect(fs.existsSync(started.workPath)).toBe(false);
  }, realGitTestTimeout);

  test("keeps a Pending merge open until conflicts are resolved", async () => {
    const { repo, worktree } = makeRepo("pending-conflict", { conflict: true });
    fs.writeFileSync(path.join(worktree, "pending.txt"), "pending\n");
    const started = await startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "main",
      worktreeBranch: "agent",
      strategy: "pending"
    });
    expect(started).toMatchObject({ ok: true, status: "conflicts", conflicts: ["shared.txt"] });
    await expect(finishWorktreeMerge(started.sessionId)).resolves.toMatchObject({
      ok: false,
      reason: "Resolve every conflicted file before bringing the changes back.",
      conflicts: ["shared.txt"]
    });
    await expect(finishWorktreeMerge(started.sessionId, { abort: true })).resolves.toEqual({ ok: true, reason: "" });
  }, realGitTestTimeout);

  test("requires both source and parent branches to be checked out for Pending mode", async () => {
    const { repo } = makeRepo("pending-checkouts");
    await expect(startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "main",
      worktreeBranch: "missing-agent",
      strategy: "pending"
    })).resolves.toEqual({
      ok: false,
      status: "refused",
      reason: "missing-agent is not checked out in a worktree."
    });

    execFileSync("git", ["branch", "parked-parent", "main"], { cwd: repo, stdio: "ignore" });
    await expect(startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "parked-parent",
      worktreeBranch: "agent",
      strategy: "pending"
    })).resolves.toEqual({
      ok: false,
      status: "refused",
      reason: "parked-parent must be checked out so the result can remain pending there."
    });
  }, realGitTestTimeout);

  test("refuses a Pending result when the parent changes after preparation", async () => {
    const { repo, worktree } = makeRepo("pending-parent-change");
    fs.writeFileSync(path.join(worktree, "pending.txt"), "pending\n");
    const started = await startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "main",
      worktreeBranch: "agent",
      strategy: "pending"
    });
    expect(started.status).toBe("staged");
    fs.writeFileSync(path.join(repo, "late-parent.txt"), "late\n");
    await expect(finishWorktreeMerge(started.sessionId)).resolves.toEqual({
      ok: false,
      reason: "The parent checkout changed while Bring changes back was open. Review it and try again."
    });
    await finishWorktreeMerge(started.sessionId, { abort: true });
  }, realGitTestTimeout);

  test("restores the parent when a Pending patch cannot be applied", async () => {
    const { repo, worktree } = makeRepo("pending-apply-failure");
    const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    fs.writeFileSync(path.join(repo, "parent.txt"), "parent pending\n");
    fs.writeFileSync(path.join(worktree, "worktree.txt"), "worktree pending\n");
    const statusBefore = git(["status", "--porcelain=v1", "--untracked-files=all"]);
    const started = await startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "main",
      worktreeBranch: "agent",
      strategy: "pending"
    });
    expect(started.status).toBe("staged");
    const result = await finishWorktreeMerge(started.sessionId, {
      onProgress: (phase) => {
        if (phase === "applying") {
          fs.writeFileSync(path.join(os.tmpdir(), `multiterm-bring-back-${started.sessionId}.patch`), "not a patch\n");
        }
      }
    });
    expect(result).toMatchObject({ ok: false, reason: expect.any(String) });
    expect(git(["status", "--porcelain=v1", "--untracked-files=all"])).toBe(statusBefore);
    expect(fs.readFileSync(path.join(repo, "parent.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("parent pending\n");
    await finishWorktreeMerge(started.sessionId, { abort: true });
  }, realGitTestTimeout);

  test("rolls back a clean parent when it changes immediately before patch application", async () => {
    const { repo } = makeRepo("pending-apply-race");
    const started = await startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "main",
      worktreeBranch: "agent",
      strategy: "pending"
    });
    expect(started.status).toBe("staged");

    const result = await finishWorktreeMerge(started.sessionId, {
      onProgress: (phase) => {
        if (phase === "applying") fs.writeFileSync(path.join(repo, "shared.txt"), "interfering edit\n");
      }
    });
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("patch does not apply") });
    expect(fs.readFileSync(path.join(repo, "shared.txt"), "utf8")).toContain("two");
    await finishWorktreeMerge(started.sessionId, { abort: true });
  }, realGitTestTimeout);

  test("rolls back when the applied Pending result cannot be verified", async () => {
    const { repo } = makeRepo("pending-verification-race");
    const started = await startWorktreeMerge({
      repositoryRoot: repo,
      parentBranch: "main",
      worktreeBranch: "agent",
      strategy: "pending"
    });
    expect(started.status).toBe("staged");

    const result = await finishWorktreeMerge(started.sessionId, {
      onProgress: (phase) => {
        if (phase === "verifying-result") fs.writeFileSync(path.join(repo, "unexpected.txt"), "unexpected\n");
      }
    });
    expect(result).toEqual({
      ok: false,
      reason: "The merged result could not be verified; the parent checkout was restored."
    });
    expect(fs.existsSync(path.join(repo, "unexpected.txt"))).toBe(false);
    expect(fs.readFileSync(path.join(repo, "shared.txt"), "utf8")).toContain("two");
    await finishWorktreeMerge(started.sessionId, { abort: true });
  }, realGitTestTimeout);

  test("uses a temporary worktree when the parent is not checked out, and removes it", async () => {
    const { repo } = makeRepo("parked");
    execFileSync("git", ["checkout", "-b", "parked"], { cwd: repo, stdio: "ignore" });
    const started = await startWorktreeMerge({ repositoryRoot: repo, parentBranch: "main", worktreeBranch: "agent", strategy: "squash" });
    expect(started.status).toBe("staged");
    expect(started.workPath.startsWith(repo)).toBe(false);

    expect(await finishWorktreeMerge(started.sessionId, { commitMessage: "temp merged" })).toEqual({ ok: true, reason: "" });
    expect(fs.existsSync(started.workPath)).toBe(false);
    expect(execFileSync("git", ["show", "main:shared.txt"], { cwd: repo, encoding: "utf8" })).toContain("AGENT");
  });

  test("rejects a resolution path that escapes the merge worktree", async () => {
    const { repo } = makeRepo("escape", { conflict: true });
    const started = await startWorktreeMerge({ repositoryRoot: repo, parentBranch: "main", worktreeBranch: "agent", strategy: "merge" });
    const written = await writeConflictResolution(started.sessionId, "../escaped.txt", "nope\n");
    expect(written.ok).toBe(false);
    expect(written.reason).toContain("outside the merge worktree");
    await finishWorktreeMerge(started.sessionId, { abort: true });
  });

  test("rejects an unsupported strategy", async () => {
    const { repo } = makeRepo("strategy");
    const started = await startWorktreeMerge({ repositoryRoot: repo, parentBranch: "main", worktreeBranch: "agent", strategy: "rebase" });
    expect(started.status).toBe("refused");
    expect(started.reason).toContain("Unsupported merge strategy");
  });

  test("uses the default commit message and reports an empty staged commit", async () => {
    const completed = makeRepo("default-commit");
    const started = await startWorktreeMerge({
      repositoryRoot: completed.repo,
      parentBranch: "main",
      worktreeBranch: "agent",
      strategy: "squash"
    });
    await expect(finishWorktreeMerge(started.sessionId)).resolves.toEqual({ ok: true, reason: "" });
    expect(execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: completed.repo, encoding: "utf8" }).trim())
      .toBe("Merge agent into main");

    const empty = makeRepo("empty-commit");
    const emptyStarted = await startWorktreeMerge({
      repositoryRoot: empty.repo,
      parentBranch: "main",
      worktreeBranch: "agent",
      strategy: "squash"
    });
    execFileSync("git", ["reset", "--hard"], { cwd: empty.repo, stdio: "ignore" });
    await expect(finishWorktreeMerge(emptyStarted.sessionId)).resolves.toMatchObject({ ok: false, reason: expect.any(String) });
    await expect(finishWorktreeMerge("missing-session")).resolves.toEqual({
      ok: false,
      reason: "That merge is no longer in progress."
    });
  }, realGitTestTimeout);

  test("handles missing conflict sessions and unreadable or unwritable files", async () => {
    await expect(readConflictSides("missing-session", "shared.txt")).resolves.toEqual({
      ok: false,
      reason: "That merge is no longer in progress."
    });
    await expect(writeConflictResolution("missing-session", "shared.txt", "value")).resolves.toEqual({
      ok: false,
      reason: "That merge is no longer in progress."
    });

    const { repo } = makeRepo("conflict-errors", { conflict: true });
    const started = await startWorktreeMerge({ repositoryRoot: repo, parentBranch: "main", worktreeBranch: "agent", strategy: "merge" });
    fs.rmSync(path.join(repo, "shared.txt"));
    await expect(readConflictSides(started.sessionId, "shared.txt")).resolves.toMatchObject({ ok: true, merged: "" });
    await expect(writeConflictResolution(started.sessionId, "missing\\child.txt", "value"))
      .resolves.toMatchObject({ ok: false, reason: expect.any(String) });
    await finishWorktreeMerge(started.sessionId, { abort: true });
  });
});
