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

// A PID alone repeats across runs, so an aborted run's leftover repository could
// be re-initialised and its stray files counted as pending changes.
const sandbox = path.join(os.tmpdir(), `mt-review-staging-${process.pid}-${Date.now().toString(36)}`);
const repo = path.join(sandbox, "workspace");

// The bridge keeps reading this repository while the dialog is open, so its git
// and the fixture's git collide on .git/index.lock. Every call retries, and a
// lock that outlives several attempts is treated as abandoned.
const git = (args, cwd = repo) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      const collided = /index\.lock/.test(String(error.stderr || error.message));
      if (!collided || attempt >= 9) throw error;
      const lock = path.join(cwd, ".git", "index.lock");
      if (attempt >= 5 && fs.existsSync(lock)) fs.rmSync(lock, { force: true });
      // timeout.exe needs a console handle, which a redirected child does not have.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
    }
  }
};

const BUTTON = '.terminal-pane .pane-actions button[data-action="git-changes"]';
const STAGED = "#gitReviewStagedList .git-review-file";
const UNSTAGED = "#gitReviewUnstagedList .git-review-file";

test.describe.configure({ mode: "serial" });

// Every spec file shares one bridge, so a session created earlier can still be
// adopted from this page's welcome after the first close. The pane created here
// is therefore addressed by id: taking the first terminal can pick up an adopted
// one whose working directory is a different repository entirely.
async function openReview(page) {
  await page.goto("http://127.0.0.1:3199/");
  await expect(page.locator("#statusConn")).toHaveText("Connected");
  await expect.poll(async () => {
    await page.evaluate(() => closeAllTerminals());
    return page.locator(".terminal-pane").count();
  }, { timeout: 30000 }).toBe(0);
  await page.evaluate(() => { state.settings.shellIntegration = false; });
  // The pane's git button re-reads the terminal's live working directory before
  // inspecting, so the session has to start in the fixture repository. Assigning
  // terminal.cwd afterwards is overwritten and the dialog opens on MultiTerm's
  // own repository instead.
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

// A just-exited git child, or the shell this fixture starts inside the repository,
// can still hold the sandbox under Windows. The name is unique per run, so leaving
// one behind is harmless and must not fail an otherwise green file.
const removeSandbox = ({ required = false } = {}) => {
  try {
    fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  } catch (error) {
    if (required) throw error;
    console.warn(`Left ${sandbox} behind: ${error.code || error.message}`);
  }
};

test.beforeAll(() => {
  // A stale fixture would be counted as pending changes, so this one must succeed.
  removeSandbox({ required: true });
  fs.mkdirSync(repo, { recursive: true });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "probe@example.com"]);
  git(["config", "user.name", "Probe"]);
  git(["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(path.join(repo, "alpha.txt"), "one\ntwo\nthree\n");
  fs.writeFileSync(path.join(repo, "beta.txt"), "beta\n");
  git(["add", "."]);
  git(["commit", "-m", "first"]);
});

// Playwright reads a hook's destructured parameters as fixture names, so the
// options object cannot be passed to afterAll directly.
test.afterAll(() => removeSandbox());

function resetRepository() {
  git(["reset", "--hard", "HEAD"]);
  git(["clean", "-fd"]);
}

function wideFile(marker) {
  const lines = Array.from({ length: 40 }, (unused, index) => `line ${index}`);
  lines[2] = `line 2 ${marker}`;
  lines[37] = `line 37 ${marker}`;
  return `${lines.join("\n")}\n`;
}

test.describe("Review Changes staging", () => {
  test("moves a file between the staged and unstaged panes", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nCHANGED\nthree\n");
    await openReview(page);

    await expect(page.locator(UNSTAGED)).toHaveCount(1, { timeout: 60000 });
    await expect(page.locator("#gitReviewUnstagedCount")).toHaveText("1");
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("0");

    await page.locator(UNSTAGED).first().hover();
    await page.locator(`${UNSTAGED} .git-review-file-action`).first().click();

    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");
    await expect(page.locator("#gitReviewUnstagedCount")).toHaveText("0");
    expect(git(["diff", "--cached", "--name-only"]).trim()).toBe("alpha.txt");

    await page.locator(STAGED).first().hover();
    await page.locator(`${STAGED} .git-review-file-action`).first().click();

    await expect(page.locator("#gitReviewStagedCount")).toHaveText("0");
    expect(git(["diff", "--cached", "--name-only"]).trim()).toBe("");

    await page.locator("#worktreeReviewDone").click();
  });

  test("stages everything and unstages everything", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nBULK\nthree\n");
    fs.writeFileSync(path.join(repo, "fresh.txt"), "brand new\n");
    await openReview(page);

    await expect(page.locator(UNSTAGED)).toHaveCount(2, { timeout: 60000 });
    await page.locator("#gitReviewStageAll").click();
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("2");
    expect(git(["diff", "--cached", "--name-only"]).trim().split("\n").sort()).toEqual(["alpha.txt", "fresh.txt"]);

    await page.locator("#gitReviewUnstageAll").click();
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("0");
    expect(git(["diff", "--cached", "--name-only"]).trim()).toBe("");

    await page.locator("#worktreeReviewDone").click();
  });

  test("stages one hunk and leaves the rest of the file pending", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "wide.txt"), wideFile(""));
    git(["add", "wide.txt"]);
    git(["commit", "-m", "wide"]);
    fs.writeFileSync(path.join(repo, "wide.txt"), wideFile("EDITED"));
    await openReview(page);

    await page.locator(UNSTAGED).filter({ hasText: "wide.txt" }).click();
    const hunks = page.locator(".git-review-hunk-action");
    await expect(hunks).toHaveCount(2, { timeout: 60000 });
    await expect(hunks.first()).toHaveText("Stage hunk");

    await hunks.first().click();
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");

    const staged = git(["diff", "--cached", "--no-color"]);
    expect(staged).toContain("line 2 EDITED");
    expect(staged).not.toContain("line 37 EDITED");
    // The working tree keeps both edits; only the index moved.
    expect(fs.readFileSync(path.join(repo, "wide.txt"), "utf8")).toContain("line 37 EDITED");
    // The file is still pending because one hunk remains unstaged.
    await expect(page.locator("#gitReviewUnstagedCount")).toHaveText("1");

    await page.locator("#worktreeReviewDone").click();
    resetRepository();
    git(["reset", "--hard", "HEAD~1"]);
  });

  test("keeps reviewing the pane being emptied instead of following the file across", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "wide.txt"), wideFile(""));
    git(["add", "wide.txt"]);
    git(["commit", "-m", "wide"]);
    fs.writeFileSync(path.join(repo, "wide.txt"), wideFile("EDITED"));
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nNEXT\nthree\n");
    await openReview(page);

    const selection = () => page.evaluate(() => worktreeReview.selection);
    await expect(page.locator(UNSTAGED)).toHaveCount(2, { timeout: 60000 });
    await page.locator(UNSTAGED).filter({ hasText: "wide.txt" }).click();
    await expect(page.locator(".git-review-hunk-action")).toHaveCount(2, { timeout: 60000 });

    // One hunk of two: the rest of this file is still worth reading, so the
    // viewer stays on the unstaged copy rather than jumping to the staged one.
    await page.locator(".git-review-hunk-action").first().click();
    await expect.poll(selection).toEqual({ pane: "unstaged", path: "wide.txt" });
    await expect(page.locator(".git-review-hunk-action")).toHaveCount(1);
    await expect(page.locator(`${UNSTAGED}[data-path="wide.txt"]`)).toHaveAttribute("aria-selected", "true");

    // The file has nothing left to stage, so the sweep moves on to the next one.
    await page.locator(".git-review-hunk-action").first().click();
    await expect.poll(selection).toEqual({ pane: "unstaged", path: "alpha.txt" });

    // Staging the whole file empties the pane, and there is no unstaged file left.
    await page.locator(UNSTAGED).first().hover();
    await page.locator(`${UNSTAGED} .git-review-file-action`).first().click();
    await expect(page.locator("#gitReviewUnstagedCount")).toHaveText("0");
    expect(await selection()).toBeNull();

    // Unstaging obeys the same rule in reverse: stay in the staged pane.
    await page.locator(STAGED).filter({ hasText: "alpha.txt" }).click();
    await expect.poll(selection).toEqual({ pane: "staged", path: "alpha.txt" });
    await page.locator(STAGED).filter({ hasText: "alpha.txt" }).hover();
    await page.locator(`${STAGED}[data-path="alpha.txt"] .git-review-file-action`).click();
    await expect.poll(selection).toEqual({ pane: "staged", path: "wide.txt" });

    await page.locator("#worktreeReviewDone").click();
    resetRepository();
    git(["reset", "--hard", "HEAD~1"]);
  });

  test("keeps every row control hidden while a staging round trip is in flight", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nBUSY\nthree\n");
    fs.writeFileSync(path.join(repo, "gamma.txt"), "gamma\n");
    await openReview(page);

    await expect(page.locator(UNSTAGED)).toHaveCount(2, { timeout: 60000 });
    // Staging disables every button in the panes; the resting controls must not
    // surface at the disabled opacity while that is true.
    const restingOpacity = await page.evaluate(() => {
      setGitReviewBusy(true);
      const values = [...document.querySelectorAll(".git-review-file:not([aria-selected='true'])")]
        .flatMap((row) => [...row.querySelectorAll(".git-review-file-action, .git-review-file-open")])
        .map((control) => getComputedStyle(control).opacity);
      setGitReviewBusy(false);
      return values;
    });
    expect(restingOpacity.length).toBeGreaterThan(0);
    expect([...new Set(restingOpacity)]).toEqual(["0"]);

    // A hovered row still shows its control, busy or not.
    await page.locator(UNSTAGED).first().hover();
    await expect(page.locator(`${UNSTAGED} .git-review-file-action`).first()).toHaveCSS("opacity", "1");

    await page.locator("#worktreeReviewDone").click();
  });

  test("offers no hunk controls for an untracked file", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "newborn.txt"), "created\n");
    await openReview(page);

    await page.locator(UNSTAGED).filter({ hasText: "newborn.txt" }).click();
    await expect(page.locator("#worktreeReviewDiff")).toContainText("created", { timeout: 60000 });
    // An untracked file has no index entry, so a hunk patch could not apply.
    await expect(page.locator(".git-review-hunk-action")).toHaveCount(0);

    await page.locator("#worktreeReviewDone").click();
  });

  test("stages the focused file with S and unstages it with U", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nKEYBOARD\nthree\n");
    await openReview(page);

    await expect(page.locator(UNSTAGED)).toHaveCount(1, { timeout: 60000 });
    await page.locator(UNSTAGED).first().click();
    await page.locator(UNSTAGED).first().focus();
    await page.keyboard.press("s");
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");

    await page.locator(STAGED).first().focus();
    await page.keyboard.press("u");
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("0");

    await page.locator("#worktreeReviewDone").click();
  });

  test("stages a file dragged into the staged pane", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nDRAGGED\nthree\n");
    await openReview(page);

    await expect(page.locator(UNSTAGED)).toHaveCount(1, { timeout: 60000 });
    await page.locator(UNSTAGED).first().dragTo(page.locator("#gitReviewStagedList"));

    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");
    expect(git(["diff", "--cached", "--name-only"]).trim()).toBe("alpha.txt");

    await page.locator("#worktreeReviewDone").click();
  });
});

test.describe("Review Changes commit", () => {
  test("commits only the staged half of the working tree", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nCOMMITTED\nthree\n");
    fs.writeFileSync(path.join(repo, "later.txt"), "not yet\n");
    await openReview(page);

    await expect(page.locator(UNSTAGED)).toHaveCount(2, { timeout: 60000 });
    await page.locator(UNSTAGED).filter({ hasText: "alpha.txt" }).hover();
    await page.locator(UNSTAGED).filter({ hasText: "alpha.txt" }).locator(".git-review-file-action").click();
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");

    await page.locator("#gitReviewCommitMessage").fill("Record the alpha change");
    await expect(page.locator("#gitReviewCommitButton")).toBeEnabled();
    await page.locator("#gitReviewCommitButton").click();

    await expect(page.locator("#worktreeReviewStatus")).toContainText("Record the alpha change", { timeout: 60000 });
    expect(git(["log", "-1", "--format=%s"]).trim()).toBe("Record the alpha change");
    // later.txt was never staged, so it survives as a pending change.
    await expect(page.locator("#gitReviewUnstagedCount")).toHaveText("1");
    expect(git(["status", "--porcelain"]).trim()).toBe("?? later.txt");

    await page.locator("#worktreeReviewDone").click();
    resetRepository();
    git(["reset", "--hard", "HEAD~1"]);
  });

  test("refuses to commit until a message is present", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nNEEDS MESSAGE\nthree\n");
    await openReview(page);

    await expect(page.locator(UNSTAGED)).toHaveCount(1, { timeout: 60000 });
    await page.locator("#gitReviewStageAll").click();
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");

    await expect(page.locator("#gitReviewCommitButton")).toBeDisabled();
    await expect(page.locator("#gitReviewCommitHint")).toHaveText("A commit message is required.");

    await page.locator("#gitReviewCommitMessage").fill("Now it has one");
    await expect(page.locator("#gitReviewCommitButton")).toBeEnabled();

    await page.locator("#worktreeReviewDone").click();
  });

  test("requires every configured footer before committing", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nFOOTERS\nthree\n");
    await openReview(page);
    // In memory only: persisting would follow the shared origin into later specs.
    await page.evaluate(() => { state.settings.gitCommitRequiredFooters = "Signed-off-by"; });

    await page.locator("#gitReviewStageAll").click();
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");

    await page.locator("#gitReviewCommitMessage").fill("Missing its trailer");
    await expect(page.locator("#gitReviewCommitHint")).toHaveText("Missing required footer: Signed-off-by.");
    await expect(page.locator("#gitReviewCommitButton")).toBeDisabled();

    await page.locator("#gitReviewCommitMessage").fill("Has its trailer\n\nSigned-off-by: Probe <probe@example.com>");
    await expect(page.locator("#gitReviewCommitButton")).toBeEnabled();

    await page.evaluate(() => { state.settings.gitCommitRequiredFooters = ""; });
    await page.locator("#worktreeReviewDone").click();
  });

  test("fills the message from a saved template", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nTEMPLATE\nthree\n");
    await openReview(page);
    await page.evaluate(() => {
      state.settings.gitCommitTemplates = [{ name: "Conventional", message: "feat: " }];
      renderGitReviewCommitTemplateOptions();
    });

    await page.locator("#gitReviewCommitTemplate").selectOption({ label: "Conventional" });
    await expect(page.locator("#gitReviewCommitMessage")).toHaveValue("feat: ");
    // The selector snaps back so the same template can be picked again.
    await expect(page.locator("#gitReviewCommitTemplate")).toHaveValue("");

    await page.evaluate(() => { state.settings.gitCommitTemplates = []; });
    await page.locator("#worktreeReviewDone").click();
  });

  test("previews exactly what a commit would contain", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nPREVIEWED\nthree\n");
    fs.writeFileSync(path.join(repo, "excluded.txt"), "left out\n");
    await openReview(page);

    await expect(page.locator(UNSTAGED)).toHaveCount(2, { timeout: 60000 });
    await page.locator(UNSTAGED).filter({ hasText: "alpha.txt" }).hover();
    await page.locator(UNSTAGED).filter({ hasText: "alpha.txt" }).locator(".git-review-file-action").click();
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");

    await page.locator("#gitReviewCommitPreview").click();
    const diff = page.locator("#worktreeReviewDiff");
    await expect(diff).toContainText("PREVIEWED", { timeout: 60000 });
    await expect(diff).not.toContainText("left out");
    await expect(page.locator("#worktreeReviewStatus")).toContainText("Exactly this will be committed");

    await page.locator("#worktreeReviewDone").click();
  });

  test("offers an AI commit message for approval without overwriting the box", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nSUGGESTED\nthree\n");
    await openReview(page);

    await page.locator("#gitReviewStageAll").click();
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");
    await page.locator("#gitReviewCommitMessage").fill("typed by hand");

    // The Copilot answer is replaced so the flow is driven without a real model.
    await page.evaluate(() => {
      const original = requestBridge;
      requestBridge = async (message, options) => (message.type === "generateCommitMessage"
        ? { message: "Describe the alpha change\n\nBecause the tests needed it." }
        : original(message, options));
    });

    await page.locator("#gitReviewCommitSuggest").click();
    const suggestion = page.locator("#gitReviewSuggestion");
    await expect(suggestion).toBeVisible({ timeout: 60000 });
    await expect(page.locator("#gitReviewSuggestionText")).toContainText("Describe the alpha change");
    // A message already being typed must survive until the suggestion is accepted.
    await expect(page.locator("#gitReviewCommitMessage")).toHaveValue("typed by hand");

    await page.locator("#gitReviewSuggestionDiscard").click();
    await expect(suggestion).toBeHidden();
    await expect(page.locator("#gitReviewCommitMessage")).toHaveValue("typed by hand");

    await page.locator("#gitReviewCommitSuggest").click();
    await expect(suggestion).toBeVisible({ timeout: 60000 });
    await page.locator("#gitReviewSuggestionAccept").click();
    await expect(suggestion).toBeHidden();
    await expect(page.locator("#gitReviewCommitMessage"))
      .toHaveValue("Describe the alpha change\n\nBecause the tests needed it.");

    await page.locator("#worktreeReviewDone").click();
  });

  test("reports a failed suggestion instead of leaving the box unchanged in silence", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nNO SUGGESTION\nthree\n");
    await openReview(page);

    await page.locator("#gitReviewStageAll").click();
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");

    await page.evaluate(() => {
      const original = requestBridge;
      requestBridge = async (message, options) => (message.type === "generateCommitMessage"
        ? { error: "GitHub Copilot is not signed in for this Windows account." }
        : original(message, options));
    });

    await page.locator("#gitReviewCommitSuggest").click();
    await expect(page.locator("#worktreeReviewStatus"))
      .toHaveText("GitHub Copilot is not signed in for this Windows account.", { timeout: 60000 });
    await expect(page.locator("#gitReviewSuggestion")).toBeHidden();
    await expect(page.locator("#gitReviewCommitSuggest")).toBeEnabled();

    await page.locator("#worktreeReviewDone").click();
  });

  test("shows what Copilot is doing and how long it has been waiting", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nPROGRESS\nthree\n");
    await openReview(page);
    await page.locator("#gitReviewStageAll").click();
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");

    // A request that never answers on its own, so the wait itself is observable.
    await page.evaluate(() => {
      const original = requestBridge;
      requestBridge = async (message, options) => {
        if (message.type !== "generateCommitMessage") return original(message, options);
        options.onRequestId?.("stalled-request");
        options.onProgress?.({ message: "Opening a claude-opus-4.6 session" });
        return new Promise(() => {});
      };
    });

    await page.locator("#gitReviewCommitSuggest").click();
    const status = page.locator("#worktreeReviewStatus");
    // The stage the bridge reported replaces the generic wait text.
    await expect(status).toContainText("Opening a claude-opus-4.6 session", { timeout: 15000 });
    // The elapsed counter has to actually move, or it is decoration.
    await expect(status).toContainText(/\b[1-9]\d*s$/, { timeout: 15000 });
    await expect(page.locator("#gitReviewCommitCancel")).toBeVisible();

    await page.locator("#worktreeReviewDone").click();
  });

  test("stops waiting for Copilot on demand without reporting a failure", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nCANCEL\nthree\n");
    await openReview(page);
    await page.locator("#gitReviewStageAll").click();
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("1");

    await page.evaluate(() => {
      window.__cancelSent = [];
      const original = requestBridge;
      requestBridge = async (message, options) => {
        if (message.type === "cancelCommitMessage") {
          window.__cancelSent.push(message.target);
          // The bridge answers the abandoned request the same way it always does.
          window.__resolveSuggestion({ cancelled: true });
          return { ok: true };
        }
        if (message.type !== "generateCommitMessage") return original(message, options);
        options.onRequestId?.("stalled-request");
        return new Promise((resolve) => { window.__resolveSuggestion = resolve; });
      };
    });

    await page.locator("#gitReviewCommitSuggest").click();
    const cancel = page.locator("#gitReviewCommitCancel");
    await expect(cancel).toBeVisible({ timeout: 15000 });
    await cancel.click();

    const status = page.locator("#worktreeReviewStatus");
    await expect(status).toHaveText("Stopped waiting for Copilot.", { timeout: 15000 });
    // A cancel is not a failure, so it must not be painted as one.
    await expect(status).not.toHaveAttribute("data-tone", "error");
    await expect(cancel).toBeHidden();
    await expect(page.locator("#gitReviewCommitSuggest")).toBeEnabled();
    await expect(page.locator("#gitReviewSuggestion")).toBeHidden();
    // The bridge must be told which request to drop, or it keeps burning a model call.
    expect(await page.evaluate(() => window.__cancelSent)).toEqual(["stalled-request"]);

    await page.locator("#worktreeReviewDone").click();
  });
});

test.describe("Review Changes legend", () => {
  test("names every colour the diff actually paints", async ({ page }) => {
    resetRepository();
    // A modified line, a pure addition, a pure deletion and untouched context.
    fs.writeFileSync(path.join(repo, "alpha.txt"), "keep one\nchange me here\nremove me\nkeep two\n");
    git(["commit", "-am", "legend base"]);
    fs.writeFileSync(path.join(repo, "alpha.txt"), "keep one\nchange me there\nkeep two\nbrand new line\n");
    await openReview(page);
    await expect(page.locator("#worktreeReviewDiff")).toContainText("brand new line", { timeout: 60000 });

    const measured = await page.evaluate(() => {
      const bg = (element) => (element ? getComputedStyle(element).backgroundColor : "");
      const swatch = (key) => bg(document.querySelector(`.git-review-legend li[data-key="${key}"] > span`));
      const diff = document.querySelector("#worktreeReviewDiff");
      const cell = (selector) => bg(diff.querySelector(`${selector}:not(.d2h-code-linenumber)`));
      return {
        legend: {
          added: swatch("added"),
          removed: swatch("removed"),
          word: swatch("word"),
          hunk: swatch("hunk"),
          context: swatch("context")
        },
        rendered: {
          added: cell("td.d2h-ins"),
          removed: cell("td.d2h-del"),
          word: bg(diff.querySelector(".d2h-code-line ins")),
          hunk: cell("td.d2h-info"),
          context: bg(diff.querySelector("td.d2h-cntx:not(.d2h-code-linenumber) .d2h-code-line"))
        },
        // diff2html paints a modified line differently from a pure add or
        // delete; MultiTerm collapses both so the key stays true.
        changed: {
          added: cell("td.d2h-ins.d2h-change"),
          removed: cell("td.d2h-del.d2h-change")
        }
      };
    });

    for (const key of ["added", "removed", "word", "hunk", "context"]) {
      expect(measured.legend[key], `the ${key} swatch must match the rendered diff`).toBe(measured.rendered[key]);
      expect(measured.legend[key]).not.toBe("");
    }
    expect(measured.changed.added, "a modified line reuses the added colour").toBe(measured.rendered.added);
    expect(measured.changed.removed, "a modified line reuses the removed colour").toBe(measured.rendered.removed);

    // The key must not depend on colour perception alone.
    await expect(page.locator('.git-review-legend li[data-key="added"]')).toContainText("+");
    await expect(page.locator('.git-review-legend li[data-key="removed"]')).toContainText("-");
    await expect(page.locator('.git-review-legend li[data-key="hunk"]')).toContainText("@@");

    await page.locator("#worktreeReviewDone").click();
    resetRepository();
    git(["reset", "--hard", "--quiet", "HEAD~1"]);
  });

  test("keeps code legible against every highlight it paints", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "keep one\nchange me here\nremove me\nkeep two\n");
    git(["commit", "-am", "contrast base"]);
    fs.writeFileSync(path.join(repo, "alpha.txt"), "keep one\nchange me there\nkeep two\nbrand new line\n");
    await openReview(page);
    await expect(page.locator("#worktreeReviewDiff")).toContainText("brand new line", { timeout: 60000 });

    const contrast = await page.evaluate(() => {
      // color-mix resolves to color(srgb ...), which needs parsing before luminance.
      const channels = (value) => {
        const probe = document.createElement("span");
        probe.style.color = value;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        const parts = resolved.match(/[\d.]+/g).map(Number).slice(0, 3);
        return resolved.startsWith("color(") ? parts : parts.map((part) => part / 255);
      };
      const luminance = (rgb) => {
        const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a, b) => {
        const [hi, lo] = [luminance(channels(a)), luminance(channels(b))].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      const measure = () => {
        const diff = document.querySelector("#worktreeReviewDiff");
        const bg = (selector) => getComputedStyle(diff.querySelector(selector)).backgroundColor;
        const text = getComputedStyle(diff.querySelector(".d2h-code-line-ctn")).color;
        return {
          added: ratio(text, bg("td.d2h-ins:not(.d2h-code-linenumber)")),
          removed: ratio(text, bg("td.d2h-del:not(.d2h-code-linenumber)")),
          wordAdded: ratio(text, bg(".d2h-code-line ins")),
          wordRemoved: ratio(text, bg(".d2h-code-line del"))
        };
      };
      const original = state.settings.appTheme;
      const readings = {};
      // The highlights are mixed with --surface, so each theme lands somewhere different.
      for (const theme of ["dark", "light"]) {
        state.settings.appTheme = theme;
        applyAppTheme();
        readings[theme] = measure();
      }
      state.settings.appTheme = original;
      applyAppTheme();
      return readings;
    });

    // Brightening a highlight moves its luminance toward the code text on top of
    // it; WCAG AA for body text is the floor that keeps a diff readable.
    for (const [theme, surfaces] of Object.entries(contrast)) {
      for (const [surface, measured] of Object.entries(surfaces)) {
        expect(measured, `${theme}: code text over the ${surface} highlight`).toBeGreaterThanOrEqual(4.5);
      }
    }

    await page.locator("#worktreeReviewDone").click();
    resetRepository();
    git(["reset", "--hard", "--quiet", "HEAD~1"]);
  });
});

test.describe("Review Changes open in editor", () => {
  // The bridge really would launch an editor, so the request is intercepted and
  // answered in the page; what matters here is the path, line and reply handling.
  async function captureEditorRequests(page, { ok = true, reason = "" } = {}) {
    await page.evaluate(({ ok: replyOk, reason: replyReason }) => {
      window.__editorRequests = [];
      const original = window.sendBridge;
      window.sendBridge = (message) => {
        if (message?.type !== "openInEditor") return original(message);
        window.__editorRequests.push(message);
        window.setTimeout(() => handleBridgeMessage({
          type: "openEditorResult",
          requestId: message.requestId,
          ok: replyOk,
          path: message.path,
          editor: message.editor,
          reason: replyReason
        }), 0);
        return true;
      };
    }, { ok, reason });
  }

  const editorRequests = (page) => page.evaluate(() => window.__editorRequests);

  test("opens the selected file at the first line of the hunk being read", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "wide.txt"), wideFile(""));
    git(["add", "wide.txt"]);
    git(["commit", "-m", "wide base"]);
    fs.writeFileSync(path.join(repo, "wide.txt"), wideFile("EDITOR"));
    await openReview(page);

    await page.locator(UNSTAGED).filter({ hasText: "wide.txt" }).click();
    await expect(page.locator("#worktreeReviewDiff")).toContainText("EDITOR", { timeout: 60000 });
    await captureEditorRequests(page);

    const openControls = page.locator(".git-review-hunk-open");
    await expect(openControls).toHaveCount(2);
    // The label names the line so the control is honest about where it lands.
    await expect(openControls.first()).toHaveText("Open line 1");
    await expect(openControls.last()).toHaveText("Open line 35");

    await openControls.last().click();
    await expect(page.locator("#worktreeReviewStatus")).toContainText("Opened wide.txt", { timeout: 15000 });

    const [request] = await editorRequests(page);
    expect(request.line).toBe(35);
    expect(request.editor).toBe("code");
    // Git reports repository-relative paths; the editor needs an absolute one.
    expect(request.path).toBe(path.join(repo, "wide.txt"));

    await page.locator("#worktreeReviewDone").click();
    resetRepository();
    git(["reset", "--hard", "--quiet", "HEAD~1"]);
  });

  test("opens a file from its row and from the O key without staging it", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nROW\nthree\n");
    await openReview(page);
    await expect(page.locator(UNSTAGED)).toHaveCount(1, { timeout: 60000 });
    await captureEditorRequests(page);

    const row = page.locator(UNSTAGED).first();
    await row.hover();
    await row.locator(".git-review-file-open").click();
    await expect(page.locator("#worktreeReviewStatus")).toContainText("Opened alpha.txt", { timeout: 15000 });

    await row.click();
    await row.focus();
    await page.keyboard.press("o");
    await expect.poll(async () => (await editorRequests(page)).length, { timeout: 15000 }).toBe(2);

    for (const request of await editorRequests(page)) {
      expect(request.path).toBe(path.join(repo, "alpha.txt"));
      expect(request.line).toBe(1);
    }
    // Opening a file must never move it between the panes.
    expect(git(["diff", "--cached", "--name-only"]).trim()).toBe("");
    await expect(page.locator("#gitReviewStagedCount")).toHaveText("0");

    await page.locator("#worktreeReviewDone").click();
  });

  test("offers nothing to open for a file that was deleted", async ({ page }) => {
    resetRepository();
    fs.rmSync(path.join(repo, "beta.txt"));
    await openReview(page);
    await expect(page.locator(UNSTAGED)).toHaveCount(1, { timeout: 60000 });

    const row = page.locator(UNSTAGED).filter({ hasText: "beta.txt" });
    await expect(row.locator(".git-review-file-open")).toBeDisabled();
    await row.click();
    await expect(page.locator("#worktreeReviewDiff")).toContainText("beta", { timeout: 60000 });
    // There is no working copy left, so no hunk may claim to open one.
    await expect(page.locator(".git-review-hunk-open")).toHaveCount(0);

    await page.locator("#worktreeReviewDone").click();
    resetRepository();
  });

  test("reports the bridge's reason when the editor cannot be launched", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nFAIL\nthree\n");
    await openReview(page);
    await expect(page.locator(UNSTAGED)).toHaveCount(1, { timeout: 60000 });
    await captureEditorRequests(page, { ok: false, reason: "Could not run code. Check that it is installed and on PATH." });

    const row = page.locator(UNSTAGED).first();
    await row.hover();
    await row.locator(".git-review-file-open").click();

    const status = page.locator("#worktreeReviewStatus");
    await expect(status).toContainText("Check that it is installed and on PATH.", { timeout: 15000 });
    await expect(status).toHaveAttribute("data-tone", "error");

    await page.locator("#worktreeReviewDone").click();
  });

  test("uses the editor command configured in settings", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nSETTING\nthree\n");
    await openReview(page);
    await expect(page.locator(UNSTAGED)).toHaveCount(1, { timeout: 60000 });
    await captureEditorRequests(page);
    await page.evaluate(() => { state.settings.editorCommand = "code-insiders"; });

    const row = page.locator(UNSTAGED).first();
    await row.click();
    await row.focus();
    await page.keyboard.press("o");
    await expect.poll(async () => (await editorRequests(page))[0]?.editor, { timeout: 15000 }).toBe("code-insiders");

    await page.evaluate(() => { state.settings.editorCommand = "code"; });
    await page.locator("#worktreeReviewDone").click();
  });
});

test.describe("Review Changes dialog size", () => {
  test("fills the window on demand and gives the extra height to the diff", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), wideFile("EXPAND"));
    await openReview(page);
    await expect(page.locator("#worktreeReviewDiff")).toContainText("EXPAND", { timeout: 60000 });

    const geometry = () => page.evaluate(() => {
      const card = document.querySelector(".palette.worktree-review");
      const diff = document.querySelector("#worktreeReviewDiff");
      return {
        // offset* ignores the open animation's scale, which the rect does not.
        cardTop: card.offsetTop,
        cardHeight: card.offsetHeight,
        cardWidth: card.offsetWidth,
        diffHeight: diff.offsetHeight,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth
      };
    });

    const collapsed = await geometry();
    expect(collapsed.cardHeight).toBeLessThan(collapsed.viewportHeight);
    await expect(page.locator("#gitReviewExpand")).toHaveAttribute("aria-pressed", "false");

    await page.locator("#gitReviewExpand").click();
    const expanded = await geometry();
    expect(expanded.cardTop).toBe(0);
    expect(expanded.cardHeight).toBe(expanded.viewportHeight);
    expect(expanded.cardWidth).toBe(expanded.viewportWidth);
    // Expanding is pointless if the extra room does not reach the diff.
    expect(expanded.diffHeight).toBeGreaterThan(collapsed.diffHeight);
    await expect(page.locator("#gitReviewExpand")).toHaveAttribute("aria-pressed", "true");

    // Filling the window must not push the commit and close controls off-screen.
    for (const id of ["#gitReviewCommitButton", "#worktreeReviewDone"]) {
      await expect.poll(async () => {
        const box = await page.locator(id).boundingBox();
        return box.y + box.height <= expanded.viewportHeight;
      }, { message: `${id} stays on screen` }).toBe(true);
    }

    await page.locator("#worktreeReviewDone").click();
    await openReview(page);
    await expect(page.locator("#gitReviewExpand")).toHaveAttribute("aria-pressed", "true");
    expect((await geometry()).cardHeight).toBe(expanded.viewportHeight);

    await page.locator("#gitReviewExpand").click();
    await expect(page.locator("#gitReviewExpand")).toHaveAttribute("aria-pressed", "false");
    expect((await geometry()).cardHeight).toBe(collapsed.cardHeight);
    await page.locator("#worktreeReviewDone").click();
  });

  test("draws the header controls as flat chrome rather than filled buttons", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nFLAT\nthree\n");
    await openReview(page);

    for (const id of ["#gitReviewExpand", "#worktreeReviewClose"]) {
      const paint = await page.evaluate((selector) => {
        const style = getComputedStyle(document.querySelector(selector));
        return { background: style.backgroundColor, width: style.borderTopWidth, shadow: style.boxShadow };
      }, id);
      expect(paint.background).toBe("rgba(0, 0, 0, 0)");
      expect(paint.width).toBe("0px");
      expect(paint.shadow).toBe("none");
    }

    await page.locator("#worktreeReviewDone").click();
  });
});

test.describe("Review Changes search", () => {
  test("highlights matches and moves between them", async ({ page }) => {
    resetRepository();
    fs.writeFileSync(path.join(repo, "alpha.txt"), "one\nNEEDLE here\nthree\nNEEDLE again\n");
    await openReview(page);
    await expect(page.locator("#worktreeReviewDiff")).toContainText("NEEDLE here", { timeout: 60000 });

    // Ctrl+F must reach the dialog rather than the browser or the palette.
    await page.keyboard.press("Control+f");
    await expect(page.locator("#gitReviewSearch")).toBeFocused();

    await page.locator("#gitReviewSearch").fill("NEEDLE");
    await expect(page.locator("#gitReviewSearchCount")).toHaveText("1 of 2");
    await page.locator("#gitReviewSearchNext").click();
    await expect(page.locator("#gitReviewSearchCount")).toHaveText("2 of 2");
    // Navigation wraps rather than stopping at the end.
    await page.locator("#gitReviewSearchNext").click();
    await expect(page.locator("#gitReviewSearchCount")).toHaveText("1 of 2");
    await page.locator("#gitReviewSearchPrev").click();
    await expect(page.locator("#gitReviewSearchCount")).toHaveText("2 of 2");

    await page.locator("#gitReviewSearch").fill("nothing-matches-this");
    await expect(page.locator("#gitReviewSearchCount")).toHaveText("No matches");

    await page.locator("#worktreeReviewDone").click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeHidden();
  });
});
