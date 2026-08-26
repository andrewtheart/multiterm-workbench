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
  listGitBranches,
  parseGitRemoteUrl,
  gitRemoteHostKind,
  gitCompareUrl,
  readGitRemoteInfo,
  previewGitMerge,
  pushGitBranch,
  gitPushNeedsInteractiveTerminal,
  createGitPullRequest
} = require("../../src/server.js");

const root = path.join(os.tmpdir(), `mt-publish-tests-${process.pid}`);
const realGitTestTimeout = 25000;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function makeRepo(name, { remote = false } = {}) {
  const repo = path.join(root, name);
  fs.mkdirSync(repo, { recursive: true });
  git(["init", "-b", "main"], repo);
  git(["config", "user.email", "p@e.com"], repo);
  git(["config", "user.name", "P"], repo);
  git(["config", "commit.gpgsign", "false"], repo);
  fs.writeFileSync(path.join(repo, "shared.txt"), "one\ntwo\nthree\n");
  git(["add", "."], repo);
  git(["commit", "-m", "base"], repo);

  let bare = "";
  if (remote) {
    bare = path.join(root, `${name}.git`);
    git(["init", "--bare", "-b", "main", bare], root);
    git(["remote", "add", "origin", bare], repo);
  }
  return { repo, bare };
}

function branchWithEdit(repo, branch, contents) {
  git(["checkout", "-b", branch], repo);
  fs.writeFileSync(path.join(repo, "shared.txt"), contents);
  git(["add", "."], repo);
  git(["commit", "-m", `${branch} edit`], repo);
  git(["checkout", "main"], repo);
}

function collect() {
  const sent = [];
  const client = { send: (message) => sent.push(message) };
  const send = (message) => handleClientMessage(client, JSON.stringify(message));
  const reply = (type, requestId) => vi.waitFor(() => {
    const found = sent.find((message) => message.type === type && message.requestId === requestId);
    expect(found).toBeTruthy();
    return found;
  }, { timeout: realGitTestTimeout });
  return { sent, send, reply };
}

beforeAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
});

afterAll(() => {
  // A still-exiting git child can briefly hold a handle on Windows.
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("branch listing for a merge target", () => {
  test("lists local and remote branches with the current branch", async () => {
    const { repo } = makeRepo("branches", { remote: true });
    branchWithEdit(repo, "feature", "one\nFEATURE\nthree\n");
    git(["push", "--quiet", "origin", "main"], repo);
    git(["fetch", "--quiet", "origin"], repo);

    const listed = await listGitBranches(repo, repo);
    expect(listed.ok).toBe(true);
    expect(listed.branches).toEqual(expect.arrayContaining(["main", "feature"]));
    expect(listed.remoteBranches).toEqual(expect.arrayContaining(["origin/main"]));
    expect(listed.currentBranch).toBe("main");
  }, realGitTestTimeout);

  test("suggests the recorded worktree parent ahead of any other candidate", async () => {
    const { repo } = makeRepo("branches-parent");
    git(["checkout", "-b", "agent"], repo);
    git(["config", "--local", "multiterm.worktree.agent.parent", "main"], repo);

    await expect(listGitBranches(repo, repo)).resolves.toMatchObject({ suggestedTarget: "main" });
  }, realGitTestTimeout);

  test("falls back to the tracked upstream when no parent was recorded", async () => {
    const { repo } = makeRepo("branches-upstream", { remote: true });
    git(["push", "--quiet", "--set-upstream", "origin", "main"], repo);
    git(["checkout", "-b", "topic"], repo);
    git(["push", "--quiet", "--set-upstream", "origin", "topic"], repo);
    // Point topic at origin/main so the upstream and the branch differ.
    git(["branch", "--set-upstream-to=origin/main", "topic"], repo);

    await expect(listGitBranches(repo, repo)).resolves.toMatchObject({
      currentBranch: "topic", upstream: "origin/main", suggestedTarget: "main"
    });
  }, realGitTestTimeout);

  test("explains that a folder outside a repository has no branches", async () => {
    const outside = path.join(root, "no-repo");
    fs.mkdirSync(outside, { recursive: true });
    await expect(listGitBranches(outside, outside)).resolves.toMatchObject({ ok: false });
  }, realGitTestTimeout);

  test("answers a branch request over the bridge", async () => {
    const { repo } = makeRepo("branches-dispatch");
    const { send, reply } = collect();
    send({ type: "gitBranches", requestId: "b1", repositoryRoot: repo, worktreePath: repo });
    await expect(reply("gitBranchList", "b1")).resolves.toMatchObject({ ok: true, currentBranch: "main" });
  }, realGitTestTimeout);
});

describe("remote identification", () => {
  test("understands both remote URL spellings", () => {
    expect(parseGitRemoteUrl("git@github.com:andrewtheart/multiterm-workbench.git")).toMatchObject({
      host: "github.com",
      owner: "andrewtheart",
      repository: "multiterm-workbench",
      webUrl: "https://github.com/andrewtheart/multiterm-workbench"
    });
    expect(parseGitRemoteUrl("https://github.com/andrewtheart/multiterm-workbench.git")).toMatchObject({
      host: "github.com", owner: "andrewtheart", repository: "multiterm-workbench"
    });
    expect(parseGitRemoteUrl("https://dev.azure.com/org/project/_git/repo")).toMatchObject({
      host: "dev.azure.com", repository: "repo"
    });
    expect(parseGitRemoteUrl("")).toMatchObject({ host: "", webUrl: "" });
    expect(parseGitRemoteUrl("not a url")).toMatchObject({ host: "", webUrl: "" });
    expect(parseGitRemoteUrl("http://[::1")).toMatchObject({ host: "", webUrl: "" });
  });

  test("classifies the forge behind a host name", () => {
    expect(gitRemoteHostKind("github.com")).toBe("github");
    expect(gitRemoteHostKind("GitHub.com")).toBe("github");
    expect(gitRemoteHostKind("dev.azure.com")).toBe("azure");
    expect(gitRemoteHostKind("contoso.visualstudio.com")).toBe("azure");
    expect(gitRemoteHostKind("gitlab.example.com")).toBe("gitlab");
    expect(gitRemoteHostKind("bitbucket.org")).toBe("bitbucket");
    expect(gitRemoteHostKind("git.internal")).toBe("other");
    expect(gitRemoteHostKind("")).toBe("other");
  });

  test("builds a comparison URL for each supported forge", () => {
    const remote = { webUrl: "https://github.com/o/r" };
    expect(gitCompareUrl("github", remote, "feature/a b", "main"))
      .toBe("https://github.com/o/r/compare/main...feature%2Fa%20b?expand=1");
    expect(gitCompareUrl("gitlab", { webUrl: "https://gitlab.com/o/r" }, "topic", "main"))
      .toContain("merge_request%5Bsource_branch%5D=topic");
    expect(gitCompareUrl("azure", { webUrl: "https://dev.azure.com/o/p/_git/r" }, "topic", "main"))
      .toBe("https://dev.azure.com/o/p/_git/r/pullrequestcreate?sourceRef=topic&targetRef=main");
    expect(gitCompareUrl("other", remote, "topic", "main")).toBe("");
    expect(gitCompareUrl("github", { webUrl: "" }, "topic", "main")).toBe("");
    expect(gitCompareUrl("github", remote, "topic", "")).toBe("");
  });

  test("reports a repository that has no remote at all", async () => {
    const { repo } = makeRepo("remote-none");
    await expect(readGitRemoteInfo(repo, "")).resolves.toMatchObject({ ok: true, remotes: [], remote: "" });
  }, realGitTestTimeout);

  test("prefers origin and reads its URL", async () => {
    const { repo, bare } = makeRepo("remote-origin", { remote: true });
    git(["remote", "add", "backup", path.join(root, "backup.git")], repo);

    const info = await readGitRemoteInfo(repo, "");
    expect(info.remotes).toEqual(expect.arrayContaining(["origin", "backup"]));
    expect(info.remote).toBe("origin");
    expect(info.url).toBe(bare);
    expect(typeof info.ghAvailable).toBe("boolean");
  }, realGitTestTimeout);

  test("honours an explicitly requested remote", async () => {
    const { repo } = makeRepo("remote-requested", { remote: true });
    git(["remote", "add", "backup", path.join(root, "backup.git")], repo);
    await expect(readGitRemoteInfo(repo, "backup")).resolves.toMatchObject({ remote: "backup" });
  }, realGitTestTimeout);

  test("requires a repository", async () => {
    await expect(readGitRemoteInfo("", "")).resolves.toEqual({ ok: false, reason: "A repository is required." });
  });
});

describe("merge outcome preview", () => {
  test("recognises a fast-forward", async () => {
    const { repo } = makeRepo("preview-ff");
    branchWithEdit(repo, "feature", "one\nFEATURE\nthree\n");

    await expect(previewGitMerge(repo, "feature", "main")).resolves.toMatchObject({
      ok: true, outcome: "fastForward", conflicts: [], ahead: 1, behind: 0
    });
  }, realGitTestTimeout);

  test("recognises a target that already contains the source", async () => {
    const { repo } = makeRepo("preview-uptodate");
    branchWithEdit(repo, "feature", "one\nFEATURE\nthree\n");
    git(["merge", "--quiet", "feature"], repo);

    await expect(previewGitMerge(repo, "feature", "main")).resolves.toMatchObject({ outcome: "upToDate" });
  }, realGitTestTimeout);

  test("recognises a clean merge of divergent branches", async () => {
    const { repo } = makeRepo("preview-clean");
    branchWithEdit(repo, "feature", "one\ntwo\nthree\nFEATURE\n");
    fs.writeFileSync(path.join(repo, "other.txt"), "main only\n");
    git(["add", "."], repo);
    git(["commit", "-m", "main edit"], repo);

    await expect(previewGitMerge(repo, "feature", "main")).resolves.toMatchObject({
      ok: true, outcome: "clean", conflicts: []
    });
  }, realGitTestTimeout);

  test("names the files that would conflict", async () => {
    const { repo } = makeRepo("preview-conflict");
    branchWithEdit(repo, "feature", "one\nFEATURE\nthree\n");
    fs.writeFileSync(path.join(repo, "shared.txt"), "one\nMAIN\nthree\n");
    git(["add", "."], repo);
    git(["commit", "-m", "main edit"], repo);

    const preview = await previewGitMerge(repo, "feature", "main");
    expect(preview).toMatchObject({ ok: true, outcome: "conflicts" });
    expect(preview.conflicts).toEqual(["shared.txt"]);
    expect(preview.mergeBase).toMatch(/^[0-9a-f]{40}$/);
  }, realGitTestTimeout);

  test("refuses unusable branch pairs", async () => {
    const { repo } = makeRepo("preview-refusals");
    await expect(previewGitMerge("", "a", "b")).resolves.toMatchObject({ ok: false });
    await expect(previewGitMerge(repo, "main", "main")).resolves.toEqual({
      ok: false, reason: "The source and target branches are the same."
    });
    await expect(previewGitMerge(repo, "-main", "main")).resolves.toEqual({
      ok: false, reason: "That branch name cannot be compared safely."
    });
    await expect(previewGitMerge(repo, "missing", "main")).resolves.toMatchObject({ ok: false });
  }, realGitTestTimeout);

  test("answers a preview request over the bridge", async () => {
    const { repo } = makeRepo("preview-dispatch");
    branchWithEdit(repo, "feature", "one\nFEATURE\nthree\n");
    const { send, reply } = collect();

    send({
      type: "gitMergePreview", requestId: "p1", repositoryRoot: repo, sourceBranch: "feature", targetBranch: "main"
    });
    await expect(reply("gitMergePreviewResult", "p1")).resolves.toMatchObject({ ok: true, outcome: "fastForward" });
  }, realGitTestTimeout);
});

describe("pushing a branch", () => {
  test("pushes to a real remote and sets the upstream", async () => {
    const { repo, bare } = makeRepo("push-success", { remote: true });

    const pushed = await pushGitBranch({
      worktreePath: repo, remote: "origin", branch: "main", setUpstream: true, timeoutMs: 60000
    });
    expect(pushed).toMatchObject({ ok: true, needsInteractive: false });
    expect(pushed.command).toBe("git push --porcelain --set-upstream origin main");

    const remoteLog = git(["log", "-1", "--format=%s", "main"], bare).trim();
    expect(remoteLog).toBe("base");
    expect(git(["rev-parse", "--abbrev-ref", "main@{upstream}"], repo).trim()).toBe("origin/main");
  }, realGitTestTimeout);

  test("reports an ordinary push failure without claiming credentials are needed", async () => {
    const { repo } = makeRepo("push-rejected", { remote: true });
    const pushed = await pushGitBranch({
      worktreePath: repo, remote: "origin", branch: "does-not-exist", setUpstream: false, timeoutMs: 60000
    });
    expect(pushed).toMatchObject({ ok: false, needsInteractive: false });
    expect(pushed.reason).not.toBe("");
  }, realGitTestTimeout);

  test("recognises the failures that need a terminal the user can answer", () => {
    for (const output of [
      "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
      "remote: Invalid username or password.\nfatal: Authentication failed for 'https://x/'",
      "git@github.com: Permission denied (publickey).",
      "remote: 403 Forbidden"
    ]) {
      expect(gitPushNeedsInteractiveTerminal(output)).toBe(true);
    }
    expect(gitPushNeedsInteractiveTerminal("! [rejected] main -> main (non-fast-forward)")).toBe(false);
    expect(gitPushNeedsInteractiveTerminal("")).toBe(false);
  });

  test("refuses unusable push requests", async () => {
    const { repo } = makeRepo("push-refusals", { remote: true });
    await expect(pushGitBranch({ worktreePath: "", remote: "origin", branch: "main" }))
      .resolves.toEqual({ ok: false, reason: "A worktree path is required." });
    await expect(pushGitBranch({ worktreePath: repo, remote: "", branch: "main" }))
      .resolves.toEqual({ ok: false, reason: "A remote and branch are required." });
    await expect(pushGitBranch({ worktreePath: repo, remote: "origin", branch: "--exec=whoami" }))
      .resolves.toEqual({ ok: false, reason: "That remote or branch name cannot be pushed safely." });
  }, realGitTestTimeout);

  test("answers a push request over the bridge", async () => {
    const { repo } = makeRepo("push-dispatch", { remote: true });
    const { send, reply } = collect();

    send({
      type: "gitPush", requestId: "u1", worktreePath: repo, remote: "origin", branch: "main", setUpstream: true
    });
    await expect(reply("gitPushResult", "u1")).resolves.toMatchObject({ ok: true });
  }, realGitTestTimeout);
});

describe("opening a pull request", () => {
  test("returns a browser comparison URL when the forge has no supported CLI", async () => {
    const { repo } = makeRepo("pr-browser");
    git(["remote", "add", "origin", "https://dev.azure.com/org/project/_git/repo"], repo);

    const created = await createGitPullRequest({
      repositoryRoot: repo, sourceBranch: "topic", targetBranch: "main", title: "t", body: "b"
    });
    expect(created).toMatchObject({ ok: true, createdByCli: false });
    expect(created.openUrl).toBe("https://dev.azure.com/org/project/_git/repo/pullrequestcreate?sourceRef=topic&targetRef=main");
  }, realGitTestTimeout);

  test("refuses a forge MultiTerm cannot open a pull request for", async () => {
    const { repo } = makeRepo("pr-unsupported");
    git(["remote", "add", "origin", "https://git.internal/team/repo.git"], repo);

    await expect(createGitPullRequest({
      repositoryRoot: repo, sourceBranch: "topic", targetBranch: "main"
    })).resolves.toMatchObject({ ok: false });
  }, realGitTestTimeout);

  test("refuses when the repository has no remote", async () => {
    const { repo } = makeRepo("pr-no-remote");
    await expect(createGitPullRequest({
      repositoryRoot: repo, sourceBranch: "topic", targetBranch: "main"
    })).resolves.toEqual({
      ok: false, reason: "This repository has no remote to open a pull request against."
    });
  }, realGitTestTimeout);

  test("requires a repository and both branches", async () => {
    await expect(createGitPullRequest({ repositoryRoot: "", sourceBranch: "a", targetBranch: "b" }))
      .resolves.toEqual({ ok: false, reason: "A repository, source branch and target branch are required." });
  });

  test("answers a pull request over the bridge", async () => {
    const { repo } = makeRepo("pr-dispatch");
    git(["remote", "add", "origin", "https://dev.azure.com/org/project/_git/repo"], repo);
    const { send, reply } = collect();

    send({
      type: "gitPullRequest", requestId: "r1", repositoryRoot: repo, sourceBranch: "topic", targetBranch: "main"
    });
    await expect(reply("gitPullRequestResult", "r1")).resolves.toMatchObject({ ok: true, createdByCli: false });
  }, realGitTestTimeout);
});

describe("merging an arbitrary branch pair", () => {
  test("accepts source and target branch names from Review Changes", async () => {
    const { repo } = makeRepo("merge-generalized");
    branchWithEdit(repo, "feature", "one\nFEATURE\nthree\n");
    const { send, reply } = collect();

    send({
      type: "gitMergeStart",
      requestId: "m1",
      repositoryRoot: repo,
      sourceBranch: "feature",
      targetBranch: "main",
      strategy: "merge"
    });
    const started = await reply("gitMergeStarted", "m1");
    expect(started).toMatchObject({ ok: true, status: "staged" });

    send({ type: "gitMergeFinish", requestId: "m2", sessionId: started.sessionId, commitMessage: "Merge feature" });
    await expect(reply("gitMergeFinished", "m2")).resolves.toMatchObject({ ok: true });
    expect(git(["log", "-1", "--format=%s", "main"], repo).trim()).toBe("Merge feature");
  }, realGitTestTimeout);
});

describe("publishing bridge requests", () => {
  test("answers a branch list with a suggested merge target", async () => {
    const { repo } = makeRepo("dispatch-branches", { remote: true });
    branchWithEdit(repo, "feature", "one\nFEATURE\nthree\n");
    // branchWithEdit returns to main, and the suggestion is for the checked-out branch.
    git(["checkout", "feature"], repo);
    // MultiTerm records the branch a worktree came from; it is the best default.
    git(["config", "--local", "multiterm.worktree.feature.parent", "main"], repo);

    const { send, reply } = collect();
    send({ type: "gitBranches", requestId: "b1", repositoryRoot: repo, worktreePath: repo });
    const answer = await reply("gitBranchList", "b1");

    expect(answer.ok).toBe(true);
    expect(answer.branches).toEqual(expect.arrayContaining(["main", "feature"]));
    expect(answer.currentBranch).toBe("feature");
    expect(answer.suggestedTarget).toBe("main");
  }, realGitTestTimeout);

  test("falls back to the tracked branch when no parent was recorded", async () => {
    const { repo } = makeRepo("dispatch-branches-upstream", { remote: true });
    git(["push", "-u", "origin", "main"], repo);
    branchWithEdit(repo, "solo", "one\nSOLO\nthree\n");
    git(["checkout", "solo"], repo);
    git(["push", "-u", "origin", "solo"], repo);
    // Its own upstream is origin/solo, which is itself, so it cannot be the target.
    const { send, reply } = collect();
    send({ type: "gitBranches", requestId: "b2", repositoryRoot: repo, worktreePath: repo });
    const answer = await reply("gitBranchList", "b2");
    expect(answer.ok).toBe(true);
    expect(answer.upstream).toBe("origin/solo");
    expect(answer.suggestedTarget).not.toBe("solo");
  }, realGitTestTimeout);

  test("answers a remote lookup with the forge it recognises", async () => {
    const { repo } = makeRepo("dispatch-remote");
    git(["remote", "add", "origin", "https://github.com/example/widgets.git"], repo);
    const { send, reply } = collect();
    send({ type: "gitRemoteInfo", requestId: "r1", repositoryRoot: repo });
    const answer = await reply("gitRemoteInfoResult", "r1");

    expect(answer.ok).toBe(true);
    expect(answer.remote).toBe("origin");
    expect(answer.kind).toBe("github");
    expect(answer.owner).toBe("example");
    expect(answer.repository).toBe("widgets");
    expect(answer.webUrl).toBe("https://github.com/example/widgets");
  }, realGitTestTimeout);

  test("reports a repository that has no remote at all", async () => {
    const { repo } = makeRepo("dispatch-remote-none");
    const { send, reply } = collect();
    send({ type: "gitRemoteInfo", requestId: "r2", repositoryRoot: repo });
    const answer = await reply("gitRemoteInfoResult", "r2");
    expect(answer.ok).toBe(true);
    expect(answer.remotes).toEqual([]);
    expect(answer.remote).toBe("");
    expect(answer.kind).toBe("");
  }, realGitTestTimeout);

  test("reports a push the remote rejected without claiming credentials are missing", async () => {
    const { repo } = makeRepo("dispatch-push-fail");
    git(["remote", "add", "origin", path.join(root, "definitely-not-a-repository")], repo);
    const { send, reply } = collect();
    send({ type: "gitPush", requestId: "p1", worktreePath: repo, branch: "main", remote: "origin" });
    const answer = await reply("gitPushResult", "p1");

    expect(answer.ok).toBe(false);
    expect(answer.needsInteractive).toBe(false);
    expect(answer.output).toBeTruthy();
    // The exact command is handed back so the user can rerun it in a terminal.
    expect(answer.command).toContain("push");
  }, realGitTestTimeout);

  test("pushes a branch and sets its upstream on the first push", async () => {
    const { repo } = makeRepo("dispatch-push-ok", { remote: true });
    const { send, reply } = collect();
    send({ type: "gitPush", requestId: "p2", worktreePath: repo, branch: "main", remote: "origin", setUpstream: true });
    const answer = await reply("gitPushResult", "p2");

    expect(answer.ok).toBe(true);
    expect(git(["rev-parse", "--abbrev-ref", "main@{upstream}"], repo).trim()).toBe("origin/main");
  }, realGitTestTimeout);

  test("previews a merge that would conflict and names the files", async () => {
    const { repo } = makeRepo("preview-conflicts");
    branchWithEdit(repo, "left", "one\nLEFT\nthree\n");
    git(["checkout", "main"], repo);
    fs.writeFileSync(path.join(repo, "shared.txt"), "one\nRIGHT\nthree\n");
    git(["add", "."], repo);
    git(["commit", "-m", "right edit"], repo);

    const preview = await previewGitMerge(repo, "left", "main");
    expect(preview.ok).toBe(true);
    expect(preview.outcome).toBe("conflicts");
    expect(preview.conflicts).toContain("shared.txt");
    expect(preview.mergeBase).toMatch(/^[0-9a-f]{7,}$/);
  }, realGitTestTimeout);

  test("refuses to compare a branch name that could be read as an option", async () => {
    const { repo } = makeRepo("preview-dash");
    const preview = await previewGitMerge(repo, "--upload-pack=evil", "main");
    expect(preview.ok).toBe(false);
    expect(preview.reason).toBe("That branch name cannot be compared safely.");
  }, realGitTestTimeout);

  test("answers a merge preview request through the dispatcher", async () => {
    const { repo } = makeRepo("dispatch-preview");
    branchWithEdit(repo, "ahead", "one\nAHEAD\nthree\n");
    const { send, reply } = collect();
    send({
      type: "gitMergePreview",
      requestId: "mp1",
      repositoryRoot: repo,
      sourceBranch: "ahead",
      targetBranch: "main"
    });
    const answer = await reply("gitMergePreviewResult", "mp1");
    expect(answer.ok).toBe(true);
    expect(answer.outcome).toBe("fastForward");
  }, realGitTestTimeout);

  test("refuses a pull request for a repository with no remote", async () => {
    const { repo } = makeRepo("pr-request-no-remote");
    branchWithEdit(repo, "feature", "one\nPR\nthree\n");
    const { send, reply } = collect();
    send({
      type: "gitPullRequest",
      requestId: "pr1",
      repositoryRoot: repo,
      sourceBranch: "feature",
      targetBranch: "main"
    });
    const answer = await reply("gitPullRequestResult", "pr1");
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe("This repository has no remote to open a pull request against.");
  }, realGitTestTimeout);

  test("hands back a comparison page for a forge it cannot drive", async () => {
    const { repo } = makeRepo("pr-gitlab");
    git(["remote", "add", "origin", "https://gitlab.com/example/widgets.git"], repo);
    branchWithEdit(repo, "feature", "one\nPR\nthree\n");
    const created = await createGitPullRequest({
      repositoryRoot: repo,
      sourceBranch: "feature",
      targetBranch: "main"
    });
    expect(created.ok).toBe(true);
    expect(created.createdByCli).toBe(false);
    expect(created.openUrl).toContain("gitlab.com/example/widgets");
  }, realGitTestTimeout);

  test("refuses a pull request for a remote it cannot build a comparison for", async () => {
    const { repo } = makeRepo("pr-unknown-host");
    git(["remote", "add", "origin", "ssh://git@internal.example/team/widgets.git"], repo);
    branchWithEdit(repo, "feature", "one\nPR\nthree\n");
    const created = await createGitPullRequest({
      repositoryRoot: repo,
      sourceBranch: "feature",
      targetBranch: "main"
    });
    expect(created.ok).toBe(false);
    expect(created.reason).toContain("cannot open a pull request");
  }, realGitTestTimeout);
});
