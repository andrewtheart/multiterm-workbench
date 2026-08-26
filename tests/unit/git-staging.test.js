/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const {
  handleClientMessage,
  parseGitStatusPorcelain,
  readGitStatus,
  applyGitStageOperation,
  commitGitChanges,
  parseJsonStringArray,
  clampGitDiffBytes,
  clampGitFileLimit
} = require("../../src/server.js");

const root = path.join(os.tmpdir(), `mt-staging-tests-${process.pid}`);
const realGitTestTimeout = 20000;

function makeRepo(name, { commitBase = true } = {}) {
  const repo = path.join(root, name);
  fs.mkdirSync(repo, { recursive: true });
  const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "p@e.com"]);
  git(["config", "user.name", "P"]);
  git(["config", "commit.gpgsign", "false"]);
  if (commitBase) {
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\ntwo\nthree\n");
    git(["add", "."]);
    git(["commit", "-m", "base"]);
  }
  return { git, repo };
}

function collect() {
  const sent = [];
  const client = { send: (message) => sent.push(message) };
  const send = (message) => handleClientMessage(client, JSON.stringify(message));
  // Dispatch is fire and forget, so every assertion waits for the matching reply.
  const reply = (type, requestId) => vi.waitFor(() => {
    const found = sent.find((message) => message.type === type && message.requestId === requestId);
    expect(found).toBeTruthy();
    return found;
  }, { timeout: realGitTestTimeout });
  return { client, sent, send, reply };
}

beforeAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
});

afterAll(() => {
  // A still-exiting git child can briefly hold a handle on Windows.
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("git status reporting", () => {
  test("separates staged, unstaged, untracked and conflicted entries", () => {
    const status = parseGitStatusPorcelain([
      "# branch.oid abc123",
      "# branch.head feature/login",
      "# branch.upstream origin/feature/login",
      "# branch.ab +3 -1",
      "1 M. N... 100644 100644 100644 aaa bbb staged-only.txt",
      "1 .M N... 100644 100644 100644 aaa bbb unstaged-only.txt",
      "1 MM N... 100644 100644 100644 aaa bbb both.txt",
      "1 D. N... 100644 000000 000000 aaa bbb removed.txt",
      "1 A. N... 000000 100644 100644 aaa bbb created.txt",
      "u UU N... 100644 100644 100644 100644 aaa bbb ccc conflicted.txt",
      "? untracked.txt"
    ].join("\0") + "\0", 100);

    expect(status.branch).toBe("feature/login");
    expect(status.upstream).toBe("origin/feature/login");
    expect(status.ahead).toBe(3);
    expect(status.behind).toBe(1);
    expect(status.detached).toBe(false);
    expect(status.staged).toEqual([
      { path: "staged-only.txt", origPath: "", kind: "modified" },
      { path: "both.txt", origPath: "", kind: "modified" },
      { path: "removed.txt", origPath: "", kind: "deleted" },
      { path: "created.txt", origPath: "", kind: "added" }
    ]);
    expect(status.unstaged).toEqual([
      { path: "unstaged-only.txt", origPath: "", kind: "modified" },
      { path: "both.txt", origPath: "", kind: "modified" },
      { path: "untracked.txt", origPath: "", kind: "untracked" }
    ]);
    expect(status.conflicted).toEqual([{ path: "conflicted.txt", origPath: "", kind: "conflicted" }]);
  });

  test("reads a rename source from the following record and reports a detached head", () => {
    const status = parseGitStatusPorcelain([
      "# branch.head (detached)",
      "2 R. N... 100644 100644 100644 aaa bbb R100 new-name.txt",
      "old-name.txt",
      "1 .M N... 100644 100644 100644 aaa bbb after-rename.txt"
    ].join("\0") + "\0", 100);

    expect(status.detached).toBe(true);
    expect(status.branch).toBe("");
    expect(status.staged).toEqual([{ path: "new-name.txt", origPath: "old-name.txt", kind: "renamed" }]);
    // The source path must be consumed, not parsed as another entry.
    expect(status.unstaged).toEqual([{ path: "after-rename.txt", origPath: "", kind: "modified" }]);
  });

  test("stops filling each list at the requested limit but still counts every change", () => {
    const records = [];
    for (let index = 0; index < 12; index += 1) records.push(`? untracked-${index}.txt`);
    const status = parseGitStatusPorcelain(records.join("\0") + "\0", 5);

    expect(status.unstaged).toHaveLength(5);
    expect(status.totalCount).toBe(12);
    expect(status.truncated).toBe(true);
  });

  test("reads live status from a real repository", async () => {
    const { git, repo } = makeRepo("status-live");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nCHANGED\nthree\n");
    fs.writeFileSync(path.join(repo, "fresh.txt"), "new file\n");
    git(["add", "tracked.txt"]);
    fs.appendFileSync(path.join(repo, "tracked.txt"), "extra\n");

    const status = await readGitStatus(repo, 500);
    expect(status.ok).toBe(true);
    expect(status.branch).toBe("main");
    expect(status.staged).toEqual([{ path: "tracked.txt", origPath: "", kind: "modified" }]);
    expect(status.unstaged).toEqual(expect.arrayContaining([
      { path: "tracked.txt", origPath: "", kind: "modified" },
      { path: "fresh.txt", origPath: "", kind: "untracked" }
    ]));
  }, realGitTestTimeout);

  test("explains why a folder outside a repository has no status", async () => {
    const outside = path.join(root, "not-a-repo");
    fs.mkdirSync(outside, { recursive: true });
    await expect(readGitStatus(outside, 500)).resolves.toMatchObject({ ok: false });
  }, realGitTestTimeout);

  test("requires a worktree path before answering a status request", async () => {
    const { send, reply } = collect();
    send({ type: "gitStatus", requestId: "s1" });
    await expect(reply("gitStatusResult", "s1")).resolves.toMatchObject({
      ok: false, reason: "A worktree path is required."
    });
  });
});

describe("staging files and hunks", () => {
  test("stages and unstages a whole file", async () => {
    const { repo } = makeRepo("stage-file");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nCHANGED\nthree\n");

    await expect(applyGitStageOperation({
      worktreePath: repo, direction: "stage", mode: "file", paths: JSON.stringify(["tracked.txt"])
    })).resolves.toEqual({ ok: true, reason: "" });
    expect((await readGitStatus(repo, 500)).staged).toEqual([
      { path: "tracked.txt", origPath: "", kind: "modified" }
    ]);

    await expect(applyGitStageOperation({
      worktreePath: repo, direction: "unstage", mode: "file", paths: JSON.stringify(["tracked.txt"])
    })).resolves.toEqual({ ok: true, reason: "" });
    const after = await readGitStatus(repo, 500);
    expect(after.staged).toEqual([]);
    expect(after.unstaged).toEqual([{ path: "tracked.txt", origPath: "", kind: "modified" }]);
  }, realGitTestTimeout);

  test("stages an untracked file and unstages it again before any commit exists", async () => {
    const { repo } = makeRepo("stage-initial", { commitBase: false });
    fs.writeFileSync(path.join(repo, "first.txt"), "hello\n");

    await expect(applyGitStageOperation({
      worktreePath: repo, direction: "stage", mode: "file", paths: JSON.stringify(["first.txt"])
    })).resolves.toEqual({ ok: true, reason: "" });
    expect((await readGitStatus(repo, 500)).staged).toEqual([
      { path: "first.txt", origPath: "", kind: "added" }
    ]);

    // There is no HEAD to restore from yet, so the index entry has to be removed.
    await expect(applyGitStageOperation({
      worktreePath: repo, direction: "unstage", mode: "file", paths: JSON.stringify(["first.txt"])
    })).resolves.toEqual({ ok: true, reason: "" });
    expect((await readGitStatus(repo, 500)).unstaged).toEqual([
      { path: "first.txt", origPath: "", kind: "untracked" }
    ]);
  }, realGitTestTimeout);

  test("stages everything and unstages everything", async () => {
    const { repo } = makeRepo("stage-all");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nCHANGED\nthree\n");
    fs.writeFileSync(path.join(repo, "extra.txt"), "extra\n");

    await expect(applyGitStageOperation({ worktreePath: repo, direction: "stage", mode: "all" }))
      .resolves.toEqual({ ok: true, reason: "" });
    expect((await readGitStatus(repo, 500)).staged).toHaveLength(2);

    await expect(applyGitStageOperation({ worktreePath: repo, direction: "unstage", mode: "all" }))
      .resolves.toEqual({ ok: true, reason: "" });
    expect((await readGitStatus(repo, 500)).staged).toEqual([]);
  }, realGitTestTimeout);

  test("stages a single hunk and leaves the rest of the file unstaged", async () => {
    const { git, repo } = makeRepo("stage-hunk");
    const wide = Array.from({ length: 30 }, (unused, index) => `line ${index}`).join("\n") + "\n";
    fs.writeFileSync(path.join(repo, "wide.txt"), wide);
    git(["add", "."]);
    git(["commit", "-m", "wide"]);

    const edited = wide.replace("line 2", "line 2 EDITED").replace("line 27", "line 27 EDITED");
    fs.writeFileSync(path.join(repo, "wide.txt"), edited);

    const diff = execFileSync("git", ["diff", "--no-color", "--", "wide.txt"], { cwd: repo, encoding: "utf8" });
    const hunkStarts = [...diff.matchAll(/^@@ /gm)].map((match) => match.index);
    expect(hunkStarts).toHaveLength(2);
    const header = diff.slice(0, hunkStarts[0]);
    const firstHunkOnly = header + diff.slice(hunkStarts[0], hunkStarts[1]);

    await expect(applyGitStageOperation({
      worktreePath: repo, direction: "stage", mode: "hunk", patch: firstHunkOnly
    })).resolves.toEqual({ ok: true, reason: "" });

    const stagedDiff = execFileSync("git", ["diff", "--cached", "--no-color"], { cwd: repo, encoding: "utf8" });
    expect(stagedDiff).toContain("line 2 EDITED");
    expect(stagedDiff).not.toContain("line 27 EDITED");
    // The working tree keeps both edits; only the index moved.
    expect(fs.readFileSync(path.join(repo, "wide.txt"), "utf8")).toContain("line 27 EDITED");
  }, realGitTestTimeout);

  test("unstages a single hunk by reversing the same patch", async () => {
    const { git, repo } = makeRepo("unstage-hunk");
    const wide = Array.from({ length: 30 }, (unused, index) => `line ${index}`).join("\n") + "\n";
    fs.writeFileSync(path.join(repo, "wide.txt"), wide);
    git(["add", "."]);
    git(["commit", "-m", "wide"]);
    fs.writeFileSync(path.join(repo, "wide.txt"), wide.replace("line 2", "line 2 EDITED").replace("line 27", "line 27 EDITED"));
    git(["add", "wide.txt"]);

    const staged = execFileSync("git", ["diff", "--cached", "--no-color"], { cwd: repo, encoding: "utf8" });
    const hunkStarts = [...staged.matchAll(/^@@ /gm)].map((match) => match.index);
    const patch = staged.slice(0, hunkStarts[0]) + staged.slice(hunkStarts[0], hunkStarts[1]);

    await expect(applyGitStageOperation({
      worktreePath: repo, direction: "unstage", mode: "hunk", patch
    })).resolves.toEqual({ ok: true, reason: "" });

    const remaining = execFileSync("git", ["diff", "--cached", "--no-color"], { cwd: repo, encoding: "utf8" });
    expect(remaining).not.toContain("line 2 EDITED");
    expect(remaining).toContain("line 27 EDITED");
  }, realGitTestTimeout);

  test("reports a hunk that no longer applies instead of silently succeeding", async () => {
    const { repo } = makeRepo("stage-hunk-stale");
    const patch = [
      "diff --git a/tracked.txt b/tracked.txt",
      "--- a/tracked.txt",
      "+++ b/tracked.txt",
      "@@ -1,3 +1,3 @@",
      "-nothing",
      "+like this",
      " two",
      " three",
      ""
    ].join("\n");

    await expect(applyGitStageOperation({
      worktreePath: repo, direction: "stage", mode: "hunk", patch
    })).resolves.toMatchObject({ ok: false });
  }, realGitTestTimeout);

  test("refuses malformed staging requests", async () => {
    const { repo } = makeRepo("stage-refusals");
    await expect(applyGitStageOperation({ worktreePath: "", direction: "stage", mode: "all" }))
      .resolves.toEqual({ ok: false, reason: "A worktree path is required." });
    await expect(applyGitStageOperation({ worktreePath: repo, direction: "sideways", mode: "all" }))
      .resolves.toEqual({ ok: false, reason: "Choose whether to stage or unstage." });
    await expect(applyGitStageOperation({ worktreePath: repo, direction: "stage", mode: "everything" }))
      .resolves.toEqual({ ok: false, reason: "Unsupported staging mode: everything." });
    await expect(applyGitStageOperation({ worktreePath: repo, direction: "stage", mode: "file", paths: "[]" }))
      .resolves.toEqual({ ok: false, reason: "No files were selected." });
    await expect(applyGitStageOperation({
      worktreePath: repo, direction: "stage", mode: "file", paths: JSON.stringify(["--exec=whoami"])
    })).resolves.toEqual({ ok: false, reason: "That file name cannot be staged safely." });
    await expect(applyGitStageOperation({ worktreePath: repo, direction: "stage", mode: "hunk", patch: "  " }))
      .resolves.toEqual({ ok: false, reason: "No patch was supplied for that hunk." });
  }, realGitTestTimeout);

  test("answers a staging request with the refreshed status", async () => {
    const { repo } = makeRepo("stage-dispatch");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nCHANGED\nthree\n");
    const { send, reply } = collect();

    send({
      type: "gitStage",
      requestId: "g1",
      worktreePath: repo,
      direction: "stage",
      mode: "file",
      paths: JSON.stringify(["tracked.txt"])
    });

    const answer = await reply("gitStageResult", "g1");
    expect(answer).toMatchObject({ ok: true });
    expect(answer.status.staged).toEqual([{ path: "tracked.txt", origPath: "", kind: "modified" }]);
  }, realGitTestTimeout);

  test("omits a status refresh when the staging request failed", async () => {
    const { send, reply } = collect();
    send({ type: "gitStage", requestId: "g2", worktreePath: "", direction: "stage", mode: "all" });
    await expect(reply("gitStageResult", "g2")).resolves.toMatchObject({ ok: false, status: null });
  });
});

describe("committing staged changes", () => {
  test("commits only what is staged and reports the new commit", async () => {
    const { repo } = makeRepo("commit-staged");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nCHANGED\nthree\n");
    fs.writeFileSync(path.join(repo, "later.txt"), "not staged\n");
    await applyGitStageOperation({
      worktreePath: repo, direction: "stage", mode: "file", paths: JSON.stringify(["tracked.txt"])
    });

    const committed = await commitGitChanges({ worktreePath: repo, message: "Update tracked file" });
    expect(committed).toMatchObject({ ok: true, subject: "Update tracked file" });
    expect(committed.sha).toMatch(/^[0-9a-f]{7,}$/);

    const status = await readGitStatus(repo, 500);
    expect(status.staged).toEqual([]);
    expect(status.unstaged).toEqual([{ path: "later.txt", origPath: "", kind: "untracked" }]);
  }, realGitTestTimeout);

  test("keeps a multi-line message intact including a trailing footer", async () => {
    const { repo } = makeRepo("commit-footer");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nCHANGED\nthree\n");
    await applyGitStageOperation({ worktreePath: repo, direction: "stage", mode: "all" });

    const message = "feat: add login\n\nExplains the change.\n\nSigned-off-by: P <p@e.com>";
    await expect(commitGitChanges({ worktreePath: repo, message })).resolves.toMatchObject({ ok: true });

    const body = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: repo, encoding: "utf8" });
    expect(body).toContain("Signed-off-by: P <p@e.com>");
    expect(body).toContain("Explains the change.");
  }, realGitTestTimeout);

  test("treats a message that looks like an option as ordinary text", async () => {
    const { repo } = makeRepo("commit-option-lookalike");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nCHANGED\nthree\n");
    await applyGitStageOperation({ worktreePath: repo, direction: "stage", mode: "all" });

    await expect(commitGitChanges({ worktreePath: repo, message: "--amend --no-verify" }))
      .resolves.toMatchObject({ ok: true, subject: "--amend --no-verify" });
    // A single new commit, not an amended one.
    const count = execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    expect(count).toBe("2");
  }, realGitTestTimeout);

  test("refuses an empty message and an empty staging area", async () => {
    const { repo } = makeRepo("commit-refusals");
    await expect(commitGitChanges({ worktreePath: "", message: "x" }))
      .resolves.toEqual({ ok: false, reason: "A worktree path is required." });
    await expect(commitGitChanges({ worktreePath: repo, message: "   " }))
      .resolves.toEqual({ ok: false, reason: "A commit message is required." });
    await expect(commitGitChanges({ worktreePath: repo, message: "nothing to do" }))
      .resolves.toEqual({ ok: false, reason: "Nothing is staged, so there is nothing to commit." });
  }, realGitTestTimeout);

  test("answers a commit request with the refreshed status", async () => {
    const { repo } = makeRepo("commit-dispatch");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nCHANGED\nthree\n");
    await applyGitStageOperation({ worktreePath: repo, direction: "stage", mode: "all" });
    const { send, reply } = collect();

    send({ type: "gitCommit", requestId: "c1", worktreePath: repo, message: "Dispatch commit" });

    const answer = await reply("gitCommitResult", "c1");
    expect(answer).toMatchObject({ ok: true, subject: "Dispatch commit" });
    expect(answer.status.staged).toEqual([]);
  }, realGitTestTimeout);
});

describe("scoped change diffs", () => {
  test("returns the staged and unstaged halves separately", async () => {
    const { repo } = makeRepo("diff-scopes");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nSTAGED\nthree\n");
    await applyGitStageOperation({ worktreePath: repo, direction: "stage", mode: "all" });
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nSTAGED\nWORKING\n");

    const { send, reply } = collect();
    send({ type: "gitDiff", requestId: "d1", worktreePath: repo, scope: "staged" });
    send({ type: "gitDiff", requestId: "d2", worktreePath: repo, scope: "unstaged" });

    const staged = await reply("gitDiffResult", "d1");
    const unstaged = await reply("gitDiffResult", "d2");
    expect(staged).toMatchObject({ ok: true, scope: "staged" });
    expect(staged.diff).toContain("+STAGED");
    expect(staged.diff).not.toContain("WORKING");
    expect(unstaged).toMatchObject({ ok: true, scope: "unstaged" });
    expect(unstaged.diff).toContain("+WORKING");
  }, realGitTestTimeout);

  test("shows untracked files in the unstaged scope", async () => {
    const { repo } = makeRepo("diff-untracked");
    fs.writeFileSync(path.join(repo, "brand-new.txt"), "fresh content\n");

    const { send, reply } = collect();
    send({ type: "gitDiff", requestId: "d3", worktreePath: repo, scope: "unstaged" });

    const answer = await reply("gitDiffResult", "d3");
    expect(answer.ok).toBe(true);
    expect(answer.diff).toContain("brand-new.txt");
    expect(answer.diff).toContain("+fresh content");
  }, realGitTestTimeout);

  test("limits a scoped diff to the requested paths", async () => {
    const { repo } = makeRepo("diff-paths");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nEDIT A\nthree\n");
    fs.writeFileSync(path.join(repo, "second.txt"), "EDIT B\n");

    const { send, reply } = collect();
    send({
      type: "gitDiff", requestId: "d4", worktreePath: repo, scope: "unstaged", paths: JSON.stringify(["tracked.txt"])
    });

    const answer = await reply("gitDiffResult", "d4");
    expect(answer.diff).toContain("EDIT A");
    expect(answer.diff).not.toContain("second.txt");
  }, realGitTestTimeout);

  test("requires a worktree path for a staging scope", async () => {
    const { send, reply } = collect();
    send({ type: "gitDiff", requestId: "d5", scope: "staged" });
    await expect(reply("gitDiffResult", "d5")).resolves.toMatchObject({
      ok: false, reason: "A worktree path is required."
    });
  });

  test("truncates at the requested ceiling", async () => {
    const { repo } = makeRepo("diff-truncation");
    fs.writeFileSync(path.join(repo, "big.txt"), "padding line\n".repeat(60000));

    const { send, reply } = collect();
    send({
      type: "gitDiff", requestId: "d6", worktreePath: repo, scope: "unstaged", maxBytes: 256 * 1024
    });

    const answer = await reply("gitDiffResult", "d6");
    expect(answer).toMatchObject({ ok: true, truncated: true });
    expect(answer.diff.length).toBe(256 * 1024);
  }, realGitTestTimeout);
});

describe("bridge value guards", () => {
  test("accepts array fields as JSON text or as real arrays", () => {
    expect(parseJsonStringArray(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
    expect(parseJsonStringArray(["a", "b"])).toEqual(["a", "b"]);
    expect(parseJsonStringArray("not json")).toEqual([]);
    expect(parseJsonStringArray("[oops")).toEqual([]);
    expect(parseJsonStringArray('{"a":1}')).toEqual([]);
    expect(parseJsonStringArray(undefined)).toEqual([]);
  });

  test("clamps caller supplied ceilings into their supported range", () => {
    expect(clampGitDiffBytes(undefined)).toBe(2 * 1024 * 1024);
    expect(clampGitDiffBytes(1024)).toBe(256 * 1024);
    expect(clampGitDiffBytes(64 * 1024 * 1024)).toBe(16 * 1024 * 1024);
    expect(clampGitDiffBytes(4 * 1024 * 1024)).toBe(4 * 1024 * 1024);

    expect(clampGitFileLimit(undefined)).toBe(500);
    expect(clampGitFileLimit(1)).toBe(50);
    expect(clampGitFileLimit(99999)).toBe(5000);
    expect(clampGitFileLimit(1200)).toBe(1200);
  });
});

describe("Review Changes bridge requests", () => {
  test("refuses a status request that names no worktree", async () => {
    const { sent, send, reply } = collect();
    send({ type: "gitStatus", requestId: "no-path" });
    const answer = await reply("gitStatusResult", "no-path");
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe("A worktree path is required.");
    expect(sent.filter((message) => message.type === "gitStatusResult")).toHaveLength(1);
  });

  test("reports a status request for a folder that is not a repository", async () => {
    const outside = path.join(root, "not-a-repo");
    fs.mkdirSync(outside, { recursive: true });
    const { send, reply } = collect();
    send({ type: "gitStatus", requestId: "outside", worktreePath: outside });
    const answer = await reply("gitStatusResult", "outside");
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBeTruthy();
  }, realGitTestTimeout);

  test("commits the staged half and answers with the new commit", async () => {
    const { git, repo } = makeRepo("dispatch-commit");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nCOMMITTED\nthree\n");
    git(["add", "tracked.txt"]);
    const { send, reply } = collect();
    send({ type: "gitCommit", requestId: "commit-1", worktreePath: repo, message: "Record the staged edit" });

    const answer = await reply("gitCommitResult", "commit-1");
    expect(answer.ok).toBe(true);
    expect(answer.sha).toMatch(/^[0-9a-f]{7,}$/);
    expect(answer.subject).toBe("Record the staged edit");
    // The reply carries the refreshed status so the dialog does not re-ask.
    expect(answer.status.ok).toBe(true);
    expect(answer.status.staged).toEqual([]);
    expect(git(["log", "-1", "--format=%s"]).trim()).toBe("Record the staged edit");
  }, realGitTestTimeout);

  test("reports a commit git itself refuses", async () => {
    const { repo } = makeRepo("dispatch-commit-empty");
    const { send, reply } = collect();
    send({ type: "gitCommit", requestId: "commit-2", worktreePath: repo, message: "Nothing is staged" });
    const answer = await reply("gitCommitResult", "commit-2");
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBeTruthy();
    expect(answer.status).toBeNull();
  }, realGitTestTimeout);

  test("unstages a file in a repository that has no commit to restore from", async () => {
    const { git, repo } = makeRepo("no-head-unstage", { commitBase: false });
    fs.writeFileSync(path.join(repo, "first.txt"), "brand new\n");
    git(["add", "first.txt"]);
    expect(git(["diff", "--cached", "--name-only"]).trim()).toBe("first.txt");

    const { send, reply } = collect();
    send({
      type: "gitStage",
      requestId: "unstage-no-head",
      worktreePath: repo,
      direction: "unstage",
      mode: "file",
      paths: JSON.stringify(["first.txt"])
    });

    const answer = await reply("gitStageResult", "unstage-no-head");
    expect(answer.ok).toBe(true);
    // git restore --staged needs a HEAD, so the handler falls back to rm --cached.
    expect(git(["diff", "--cached", "--name-only"]).trim()).toBe("");
    expect(fs.readFileSync(path.join(repo, "first.txt"), "utf8")).toBe("brand new\n");
  }, realGitTestTimeout);

  test("answers a staged and an unstaged diff request for the same worktree", async () => {
    const { git, repo } = makeRepo("dispatch-diff");
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nSTAGED\nthree\n");
    git(["add", "tracked.txt"]);
    fs.writeFileSync(path.join(repo, "tracked.txt"), "one\nSTAGED\nWORKING\n");
    const { send, reply } = collect();

    send({ type: "gitDiff", requestId: "diff-staged", scope: "staged", worktreePath: repo });
    const staged = await reply("gitDiffResult", "diff-staged");
    expect(staged.ok).toBe(true);
    expect(staged.scope).toBe("staged");
    expect(staged.diff).toContain("STAGED");
    expect(staged.diff).not.toContain("WORKING");

    send({ type: "gitDiff", requestId: "diff-unstaged", scope: "unstaged", worktreePath: repo });
    const unstaged = await reply("gitDiffResult", "diff-unstaged");
    expect(unstaged.ok).toBe(true);
    expect(unstaged.diff).toContain("WORKING");
  }, realGitTestTimeout);

  test("truncates a diff that runs past the caller's ceiling", async () => {
    const { repo } = makeRepo("dispatch-diff-truncate");
    // The smallest ceiling the bridge honours is 256 KB, so the diff must exceed it.
    fs.writeFileSync(path.join(repo, "tracked.txt"), `${"padding line\n".repeat(30000)}`);
    const { send, reply } = collect();
    send({
      type: "gitDiff",
      requestId: "diff-big",
      scope: "unstaged",
      worktreePath: repo,
      maxBytes: 1024
    });
    const answer = await reply("gitDiffResult", "diff-big");
    expect(answer.ok).toBe(true);
    expect(answer.truncated).toBe(true);
    // A 1 KB request is clamped up to that floor rather than honoured literally.
    expect(answer.diff.length).toBe(256 * 1024);
  }, realGitTestTimeout);

  test("refuses a staged diff request that names no worktree", async () => {
    const { send, reply } = collect();
    send({ type: "gitDiff", requestId: "diff-no-path", scope: "staged" });
    const answer = await reply("gitDiffResult", "diff-no-path");
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe("A worktree path is required.");
  });

  test("refuses a comparison whose revision could be read as an option", async () => {
    const { repo } = makeRepo("dispatch-diff-dash");
    const { send, reply } = collect();
    send({ type: "gitDiff", requestId: "diff-dash", repositoryRoot: repo, base: "--upload-pack=evil", head: "main" });
    const answer = await reply("gitDiffResult", "diff-dash");
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe("A repository and two revisions are required.");
  }, realGitTestTimeout);

  test("refuses a worktree comparison when the path is not a worktree root", async () => {
    const { repo } = makeRepo("dispatch-diff-worktree");
    const inner = path.join(repo, "nested");
    fs.mkdirSync(inner, { recursive: true });
    const { send, reply } = collect();
    send({
      type: "gitDiff",
      requestId: "diff-worktree",
      repositoryRoot: repo,
      base: "main",
      head: "main",
      worktreePath: inner
    });
    const answer = await reply("gitDiffResult", "diff-worktree");
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe("The worktree path is not a Git worktree root.");
  }, realGitTestTimeout);

  test("reports a diff git itself rejects", async () => {
    const { repo } = makeRepo("dispatch-diff-badref");
    const { send, reply } = collect();
    send({ type: "gitDiff", requestId: "diff-badref", repositoryRoot: repo, base: "main", head: "no-such-branch" });
    const answer = await reply("gitDiffResult", "diff-badref");
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBeTruthy();
  }, realGitTestTimeout);
});
