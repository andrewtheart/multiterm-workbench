const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const {
  startWorktreeMerge,
  finishWorktreeMerge,
  readConflictSides,
  writeConflictResolution
} = require("../../server.js");

const root = path.join(os.tmpdir(), `mt-merge-tests-${process.pid}`);

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

beforeAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("worktree merge-back", () => {
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
    expect(sides.merged).toContain("|||||||");

    const resolved = await writeConflictResolution(started.sessionId, "shared.txt", "one\nRESOLVED\nthree\n");
    expect(resolved).toMatchObject({ ok: true, remaining: [] });
    expect(await finishWorktreeMerge(started.sessionId, { commitMessage: "merged" })).toEqual({ ok: true, reason: "" });
    expect(fs.readFileSync(path.join(repo, "shared.txt"), "utf8")).toContain("RESOLVED");
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
});
