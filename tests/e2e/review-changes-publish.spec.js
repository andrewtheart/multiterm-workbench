/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { test, expect } = require("@playwright/test");

const sandbox = path.join(os.tmpdir(), `mt-review-publish-${process.pid}-${Date.now().toString(36)}`);
let repo = "";
let bare = "";
let sequence = 0;
const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const BUTTON = '.terminal-pane .pane-actions button[data-action="git-changes"]';

test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  // A fresh directory per test: a bridge git child can still hold the previous
  // tree as its working directory, which makes deleting it fail on Windows.
  sequence += 1;
  const root = path.join(sandbox, `run-${sequence}`);
  repo = path.join(root, "workspace");
  bare = path.join(root, "origin.git");
  fs.mkdirSync(repo, { recursive: true });
  git(["init", "--bare", "-b", "main", bare], root);
  git(["init", "-b", "main"]);
  git(["config", "user.email", "probe@example.com"]);
  git(["config", "user.name", "Probe"]);
  git(["config", "commit.gpgsign", "false"]);
  git(["remote", "add", "origin", bare]);
  fs.writeFileSync(path.join(repo, "alpha.txt"), "one\ntwo\nthree\n");
  git(["add", "."]);
  git(["commit", "-m", "first"]);
  git(["push", "--quiet", "--set-upstream", "origin", "main"]);
});

test.afterAll(() => {
  // The terminal these tests open runs inside the fixture, so its shell can still
  // hold the directory after the last test. The sandbox name is unique per run,
  // so leaving one behind is harmless and must not fail an otherwise green file.
  try {
    fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  } catch (error) {
    console.warn(`Left ${sandbox} behind: ${error.code || error.message}`);
  }
});

async function openReview(page) {
  await page.goto("http://127.0.0.1:3199/");
  await expect(page.locator("#statusConn")).toHaveText("Connected");
  await expect.poll(async () => {
    await page.evaluate(() => closeAllTerminals());
    return page.locator(".terminal-pane").count();
  }, { timeout: 30000 }).toBe(0);
  await page.evaluate(() => { state.settings.shellIntegration = false; });
  // The pane's git button re-reads the terminal's live working directory, so the
  // session must start in the fixture repository; assigning terminal.cwd after
  // the fact is overwritten and the dialog opens on MultiTerm's own repository.
  const terminalId = await page.evaluate((folder) =>
    addTerminal({ runStartup: false, cwd: folder }).id, repo);
  await expect(page.locator(`.terminal-pane[data-id="${terminalId}"]`)).toHaveCount(1);
  const sameRepository = (value) => String(value || "").replace(/\//g, "\\").toLowerCase();
  await expect.poll(async () => sameRepository(await page.evaluate(async (id) => {
    const terminal = state.terminals.get(id);
    await refreshTerminalGitInspection(terminal);
    return terminal.gitInspection?.repositoryRoot || "";
  }, terminalId)), { timeout: 30000 }).toBe(sameRepository(repo));
  await page.locator(`.terminal-pane[data-id="${terminalId}"] .pane-actions button[data-action="git-changes"]`).click();
  await expect(page.locator("#worktreeReviewOverlay")).toBeVisible();
}

test.describe("Review Changes push", () => {
  test("reports the tracking position and pushes a commit to the remote", async ({ page }) => {
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nPUSHED\nthree\n");
    git(["commit", "-am", "local work"]);
    await openReview(page);

    await expect(page.locator("#gitReviewBranchLabel")).toHaveText("main", { timeout: 60000 });
    await expect(page.locator("#gitReviewTracking")).toHaveText("1 ahead of origin/main");

    await page.locator("#gitReviewPush").click();
    await expect(page.locator("#gitReviewPublishStatus")).toHaveText("Pushed main to origin.", { timeout: 60000 });
    expect(git(["log", "-1", "--format=%s", "main"], bare).trim()).toBe("local work");
    await expect(page.locator("#gitReviewTracking")).toHaveText("up to date with origin/main");

    await page.locator("#worktreeReviewDone").click();
  });

  test("offers a terminal when the push needs credentials it cannot supply", async ({ page }) => {
    await openReview(page);
    await expect(page.locator("#gitReviewBranchLabel")).toHaveText("main", { timeout: 60000 });

    // A real credential prompt cannot be produced here, so the bridge answer is
    // replaced to drive exactly the branch the renderer takes for one.
    await page.evaluate(() => {
      const original = requestBridge;
      requestBridge = async (message, options) => (message.type === "gitPush"
        ? {
          ok: false,
          needsInteractive: true,
          reason: "Git needs credentials that cannot be entered from the bridge.",
          command: "git push --porcelain origin main"
        }
        : original(message, options));
    });

    await page.locator("#gitReviewPush").click();
    await expect(page.locator("#gitReviewPublishStatus"))
      .toHaveText("Git needs credentials that cannot be entered from the bridge.");
    await expect(page.locator("#gitReviewPushTerminal")).toBeVisible();

    const frames = await page.evaluate(async () => {
      const sent = [];
      const socket = state.socket;
      const original = socket.send.bind(socket);
      socket.send = (payload) => { sent.push(JSON.parse(payload)); return original(payload); };
      runGitReviewPushInTerminal();
      socket.send = original;
      return sent;
    });

    const input = frames.find((frame) => frame.type === "input");
    expect(input.data).toBe("git push --porcelain origin main\r");
    await expect(page.locator("#worktreeReviewOverlay")).toBeHidden();
  });

  test("keeps an ordinary push failure out of the credentials path", async ({ page }) => {
    await openReview(page);
    await expect(page.locator("#gitReviewBranchLabel")).toHaveText("main", { timeout: 60000 });

    await page.evaluate(() => {
      const original = requestBridge;
      requestBridge = async (message, options) => (message.type === "gitPush"
        ? { ok: false, needsInteractive: false, reason: "! [rejected] main -> main (non-fast-forward)" }
        : original(message, options));
    });

    await page.locator("#gitReviewPush").click();
    await expect(page.locator("#gitReviewPublishStatus")).toContainText("non-fast-forward");
    await expect(page.locator("#gitReviewPushTerminal")).toBeHidden();

    await page.locator("#worktreeReviewDone").click();
  });
});

test.describe("Review Changes merge", () => {
  test("previews a fast-forward and merges the branch locally", async ({ page }) => {
    git(["checkout", "-q", "-b", "feature"]);
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nFEATURE\nthree\n");
    git(["commit", "-am", "feature work"]);
    await openReview(page);
    await expect(page.locator("#gitReviewBranchLabel")).toHaveText("feature", { timeout: 60000 });

    await page.locator("#gitReviewMergeToggle").click();
    await expect(page.locator("#gitReviewMergeRow")).toBeVisible();
    await expect(page.locator("#gitReviewMergeTarget")).toHaveValue("main", { timeout: 60000 });
    await expect(page.locator("#gitReviewMergePreview")).toContainText("fast-forwards", { timeout: 60000 });

    await page.locator("#gitReviewMergeLocal").click();
    await expect(page.locator("#gitReviewPublishStatus"))
      .toHaveText("Merged feature into main.", { timeout: 120000 });
    expect(git(["log", "-1", "--format=%s", "main"]).trim()).toBe("Merge feature into main");

    await page.locator("#worktreeReviewDone").click();
  });

  test("names the files that would conflict before the merge starts", async ({ page }) => {
    git(["checkout", "-q", "-b", "feature"]);
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nFEATURE\nthree\n");
    git(["commit", "-am", "feature work"]);
    git(["checkout", "-q", "main"]);
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nMAIN\nthree\n");
    git(["commit", "-am", "main work"]);
    git(["checkout", "-q", "feature"]);
    await openReview(page);
    await expect(page.locator("#gitReviewBranchLabel")).toHaveText("feature", { timeout: 60000 });

    await page.locator("#gitReviewMergeToggle").click();
    await expect(page.locator("#gitReviewMergeTarget")).toHaveValue("main", { timeout: 60000 });
    const preview = page.locator("#gitReviewMergePreview");
    await expect(preview).toContainText("This merge has conflicts to resolve.", { timeout: 60000 });
    await expect(preview).toContainText("alpha.txt");
    await expect(preview).toHaveAttribute("data-tone", "error");

    await page.locator("#worktreeReviewDone").click();
  });

  test("excludes the current branch from its own merge targets", async ({ page }) => {
    git(["branch", "release"]);
    await openReview(page);
    await expect(page.locator("#gitReviewBranchLabel")).toHaveText("main", { timeout: 60000 });

    await page.locator("#gitReviewMergeToggle").click();
    await expect(page.locator("#gitReviewMergeTarget")).toHaveValue("release", { timeout: 60000 });
    const options = await page.locator("#gitReviewMergeTarget option").allTextContents();
    expect(options).toEqual(["release"]);

    await page.locator("#worktreeReviewDone").click();
  });

  test("resolves conflicts in the merge editor and returns to Review Changes", async ({ page }) => {
    git(["checkout", "-q", "-b", "feature"]);
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nFEATURE\nthree\n");
    git(["commit", "-am", "feature work"]);
    git(["checkout", "-q", "main"]);
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nMAIN\nthree\n");
    git(["commit", "-am", "main work"]);
    git(["checkout", "-q", "feature"]);
    await openReview(page);
    await expect(page.locator("#gitReviewBranchLabel")).toHaveText("feature", { timeout: 60000 });

    await page.locator("#gitReviewMergeToggle").click();
    await expect(page.locator("#gitReviewMergeTarget")).toHaveValue("main", { timeout: 60000 });
    await page.locator("#gitReviewMergeLocal").click();

    // The shared resolver takes over, showing all three sides of the conflict.
    await expect(page.locator("#worktreeConflictOverlay")).toBeVisible({ timeout: 120000 });
    await expect(page.locator("#worktreeReviewOverlay")).toBeHidden();
    await expect(page.locator("#worktreeConflictSubtitle")).toHaveText("alpha.txt");
    await expect(page.locator("#worktreeConflictOurs")).toContainText("MAIN");
    await expect(page.locator("#worktreeConflictTheirs")).toContainText("FEATURE");
    await expect(page.locator("#worktreeConflictHunkCount")).toHaveText("1 unresolved hunk");

    // Resolving the single hunk clears the marker block from the live result.
    await page.locator("#worktreeConflictHunks button", { hasText: "Use incoming" }).click();
    await expect(page.locator("#worktreeConflictHunkCount")).toHaveText("0 unresolved hunks");
    await expect(page.locator("#worktreeConflictResult")).toHaveValue("one\nFEATURE\nthree\n");

    await page.locator("#worktreeConflictSave").click();

    // With nothing left to resolve the merge finishes and Review Changes returns.
    await expect(page.locator("#worktreeReviewOverlay")).toBeVisible({ timeout: 120000 });
    await expect(page.locator("#gitReviewPublishStatus"))
      .toHaveText("Merged feature into main.", { timeout: 120000 });
    expect(git(["log", "-1", "--format=%s", "main"]).trim()).toBe("Merge feature into main");
    expect(git(["show", "main:alpha.txt"]).trim()).toBe("one\nFEATURE\nthree");

    await page.locator("#worktreeReviewDone").click();
  });
});

test.describe("Review Changes pull request", () => {
  test("opens the forge comparison page when no supported CLI is available", async ({ page }) => {
    git(["remote", "set-url", "origin", "https://dev.azure.com/org/project/_git/repo"]);
    git(["checkout", "-q", "-b", "feature"]);
    await openReview(page);
    await expect(page.locator("#gitReviewBranchLabel")).toHaveText("feature", { timeout: 60000 });

    const opened = await page.evaluate(() => {
      window.__openedUrls = [];
      openReleasePage = (url) => window.__openedUrls.push(url);
      return true;
    });
    expect(opened).toBe(true);

    await page.locator("#gitReviewMergeToggle").click();
    await expect(page.locator("#gitReviewMergeTarget")).toHaveValue("main", { timeout: 60000 });
    await page.locator("#gitReviewPullRequest").click();

    await expect(page.locator("#gitReviewPublishStatus"))
      .toHaveText("Opened the pull request page in your browser.", { timeout: 120000 });
    const urls = await page.evaluate(() => window.__openedUrls);
    expect(urls).toEqual([
      "https://dev.azure.com/org/project/_git/repo/pullrequestcreate?sourceRef=feature&targetRef=main"
    ]);

    await page.locator("#worktreeReviewDone").click();
  });

  test("reports a repository that has no remote at all", async ({ page }) => {
    git(["remote", "remove", "origin"]);
    git(["checkout", "-q", "-b", "feature"]);
    await openReview(page);
    await expect(page.locator("#gitReviewBranchLabel")).toHaveText("feature", { timeout: 60000 });

    await page.locator("#gitReviewMergeToggle").click();
    await expect(page.locator("#gitReviewMergeTarget")).toHaveValue("main", { timeout: 60000 });
    await page.locator("#gitReviewPullRequest").click();

    await expect(page.locator("#gitReviewPublishStatus"))
      .toHaveText("This repository has no remote to open a pull request against.", { timeout: 120000 });

    await page.locator("#worktreeReviewDone").click();
  });
});
