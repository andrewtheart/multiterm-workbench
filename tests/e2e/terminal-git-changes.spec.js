/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, expect } = require("../support/renderer-coverage");

// The dialog renders git's own diff, so the terminal has to point at a real
// repository rather than a stubbed response.
const sandbox = path.join(os.tmpdir(), "mt-terminal-git-changes");
const repo = path.join(sandbox, "demo");
const plain = path.join(sandbox, "plain");
const git = (args, cwd = repo) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const BUTTON = '.terminal-pane .pane-actions button[data-action="git-changes"]';

test.beforeAll(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(plain, { recursive: true });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "probe@example.com"]);
  git(["config", "user.name", "Probe"]);
  fs.writeFileSync(path.join(repo, "greeting.txt"), "hello\nworld\n");
  fs.writeFileSync(path.join(repo, "keep.txt"), "unchanged\n");
  git(["add", "."]);
  git(["commit", "-m", "first"]);
});

test.afterAll(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

function makeDirty() {
  fs.writeFileSync(path.join(repo, "greeting.txt"), "hello\npending world\n");
  fs.writeFileSync(path.join(repo, "staged.txt"), "staged work\n");
  git(["add", "staged.txt"]);
  fs.writeFileSync(path.join(repo, "untracked.txt"), "untracked work\n");
  // Long enough that the rendered diff has to scroll inside the dialog.
  const lines = Array.from({ length: 300 }, (_, index) => `line ${index + 1}`);
  lines.push(`wide ${"x".repeat(400)} end`);
  fs.writeFileSync(path.join(repo, "long.txt"), `${lines.join("\n")}\n`);
}

function makeClean() {
  git(["checkout", "--", "."]);
  git(["reset", "--hard", "HEAD"]);
  git(["clean", "-fd"]);
}

test.describe("Terminal pending changes", () => {
  // Returns whether the bridge reported a repository, never the terminal itself:
  // serializing a live xterm to the test process exhausts the worker heap.
  const pointTerminalAt = (page, directory) => page.evaluate(async (folder) => {
    const terminal = [...state.terminals.values()][0];
    terminal.cwd = folder;
    await refreshTerminalGitInspection(terminal);
    return terminal.gitInspection?.isRepository === true;
  }, directory);

  const reset = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => closeAllTerminals());
    // This spec points the terminal at folders of its own, so the live shell
    // must not report its real directory over them. In memory only: persisting
    // it would follow the shared origin into every later spec file.
    await page.evaluate(() => { state.settings.shellIntegration = false; });
    await page.evaluate(() => addTerminal({ runStartup: false }));
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  };

  test("offers the action only for a terminal inside a git repository", async ({ page }) => {
    await reset(page);
    makeClean();

    expect(await pointTerminalAt(page, plain)).toBe(false);
    await expect(page.locator(BUTTON)).toBeHidden();

    expect(await pointTerminalAt(page, repo)).toBe(true);
    await expect(page.locator(BUTTON)).toBeVisible();
    await expect(page.locator(BUTTON)).toHaveAttribute("aria-label", "No pending changes on main");
    await expect(page.locator(BUTTON)).not.toHaveClass(/has-changes/);
  });

  test("marks the action once the branch has uncommitted work", async ({ page }) => {
    await reset(page);
    makeClean();
    expect(await pointTerminalAt(page, repo)).toBe(true);
    await expect(page.locator(BUTTON)).not.toHaveClass(/has-changes/);

    makeDirty();
    expect(await pointTerminalAt(page, repo)).toBe(true);
    await expect(page.locator(BUTTON)).toHaveClass(/has-changes/);
    await expect(page.locator(BUTTON)).toHaveAttribute("aria-label", "Pending changes on main");
  });

  test("renders staged, unstaged and untracked work in the review dialog", async ({ page }) => {
    await reset(page);
    makeClean();
    makeDirty();
    expect(await pointTerminalAt(page, repo)).toBe(true);

    await page.locator(BUTTON).click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeVisible();
    await expect(page.locator("#worktreeReviewSubtitle")).toContainText("Uncommitted changes on main");

    // Every change is listed by pane; the viewer shows one file at a time.
    const staged = page.locator('#gitReviewStagedList .git-review-file');
    const unstaged = page.locator('#gitReviewUnstagedList .git-review-file');
    await expect(staged).toHaveCount(1, { timeout: 60000 });
    await expect(staged.first()).toContainText("staged.txt");
    await expect(unstaged.filter({ hasText: "greeting.txt" })).toHaveCount(1);
    await expect(unstaged.filter({ hasText: "untracked.txt" })).toHaveCount(1);
    // keep.txt was never touched, so it is not a pending change at all.
    await expect(page.locator("#gitReviewPanes")).not.toContainText("keep.txt");

    const diff = page.locator("#worktreeReviewDiff");
    await expect(diff.locator(".d2h-file-wrapper").first()).toBeVisible({ timeout: 60000 });
    await expect(diff).toContainText("pending world");

    await staged.first().click();
    await expect(diff).toContainText("staged work");

    await unstaged.filter({ hasText: "untracked.txt" }).click();
    await expect(diff).toContainText("untracked work");

    await page.locator("#worktreeReviewDone").click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeHidden();
  });

  test("says so when the branch has nothing uncommitted", async ({ page }) => {
    await reset(page);
    makeClean();
    expect(await pointTerminalAt(page, repo)).toBe(true);

    await page.locator(BUTTON).click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeVisible();
    await expect(page.locator("#worktreeReviewStatus")).toHaveText("This branch has no uncommitted changes.");
    await page.locator("#worktreeReviewDone").click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeHidden();
  });

  // diff2html positions line numbers absolutely so they survive the horizontal
  // code scroll, which pins them to whichever ancestor establishes their
  // containing block. That ancestor has to be the vertical scroller.
  test("keeps line numbers with their own rows while the diff scrolls", async ({ page }) => {
    await reset(page);
    makeClean();
    makeDirty();
    expect(await pointTerminalAt(page, repo)).toBe(true);

    await page.locator(BUTTON).click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeVisible();
    // long.txt is the only change tall enough to scroll inside the viewer.
    await page.locator('#gitReviewUnstagedList .git-review-file').filter({ hasText: "long.txt" }).click();
    const viewer = page.locator("#worktreeReviewDiff");
    // Wait for content unique to long.txt: the previous file's diff is still
    // on screen until this one replaces it.
    await expect(viewer).toContainText("line 300", { timeout: 60000 });
    await expect(viewer.locator(".d2h-code-linenumber").first()).toBeVisible({ timeout: 60000 });

    const measured = await viewer.evaluate((element) => {
      const drift = () => {
        const numbers = [...element.querySelectorAll(".d2h-code-linenumber")];
        const number = numbers[Math.min(20, numbers.length - 1)];
        const row = number.closest("tr");
        return number.getBoundingClientRect().top - row.getBoundingClientRect().top;
      };
      const scrollable = element.scrollHeight - element.clientHeight;
      const before = drift();
      element.scrollTop = Math.min(300, scrollable);
      return { scrollable, scrolled: element.scrollTop, before, after: drift() };
    });

    expect(measured.scrollable, "the diff must be tall enough to scroll").toBeGreaterThan(100);
    expect(measured.scrolled).toBeGreaterThan(100);
    expect(Math.abs(measured.before), "line number aligned with its row at rest").toBeLessThan(2);
    expect(Math.abs(measured.after), "line number still aligned after scrolling").toBeLessThan(2);

    await page.locator("#worktreeReviewDone").click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeHidden();
  });

  // A Copilot TUI changes directory on its own; the shell that launched it never
  // reports that, so the launch folder must not keep deciding what is diffed.
  test("follows an assistant that moved away from the folder it was launched in", async ({ page }) => {
    await reset(page);
    makeClean();
    makeDirty();

    const moved = await page.evaluate(async (folders) => {
      const terminal = [...state.terminals.values()][0];
      terminal.cwd = folders.launch;
      noteAssistantWorkingDirectory(terminal, folders.assistant);
      await refreshTerminalGitInspection(terminal);
      return terminal.gitInspection?.repositoryRoot || "";
    }, { launch: plain, assistant: repo });

    expect(moved.toLowerCase()).toBe(repo.toLowerCase());
    await expect(page.locator(BUTTON)).toBeVisible();
    await expect(page.locator(BUTTON)).toHaveClass(/has-changes/);

    await page.locator(BUTTON).click();
    await expect(page.locator("#worktreeReviewSubtitle")).toContainText(repo);
    await expect(page.locator("#gitReviewPanes")).toContainText("untracked.txt");
    await page.locator("#worktreeReviewDone").click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeHidden();
  });

  test("shows every column of a long line instead of clipping it", async ({ page }) => {
    await reset(page);
    makeClean();
    makeDirty();
    expect(await pointTerminalAt(page, repo)).toBe(true);

    await page.locator(BUTTON).click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeVisible();
    await page.locator('#gitReviewUnstagedList .git-review-file').filter({ hasText: "long.txt" }).click();
    const viewer = page.locator("#worktreeReviewDiff");
    await expect(viewer).toContainText("line 300", { timeout: 60000 });
    await expect(viewer.locator(".d2h-code-line-ctn").first()).toBeVisible({ timeout: 60000 });

    const overflow = await viewer.evaluate((element) => {
      let worst = 0;
      let sawLongLine = false;
      for (const line of element.querySelectorAll(".d2h-code-line-ctn")) {
        if (line.textContent.includes("xxxxxxxxxx")) sawLongLine = true;
        worst = Math.max(worst, line.scrollWidth - line.clientWidth);
      }
      return { worst, sawLongLine };
    });

    expect(overflow.sawLongLine, "the 400-character line must be rendered").toBe(true);
    expect(overflow.worst, "no code line may extend past its own box").toBeLessThanOrEqual(1);

    await page.locator("#worktreeReviewDone").click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeHidden();
  });

  test("notices a directory typed into the assistant TUI without being clicked", async ({ page }) => {
    await reset(page);
    makeClean();
    makeDirty();

    const observed = await page.evaluate(async (folders) => {
      const terminal = [...state.terminals.values()][0];
      terminal.cwd = folders.launch;
      // Forward slashes and lower case are what a user actually types.
      const typed = `${folders.assistant.replace(/\\/g, "/")}`.toLowerCase();
      // Copilot negotiates the enhanced keyboard protocol, so Enter arrives as
      // kitty CSI 13u rather than CR.
      for (const character of `/cwd ${typed}`) {
        trackAssistantDirectoryCommand(terminal, character);
      }
      trackAssistantDirectoryCommand(terminal, "\u001b[13u");
      const noted = terminal.assistantCwd;
      await refreshTerminalGitInspection(terminal);
      return { noted, root: terminal.gitInspection?.repositoryRoot || "" };
    }, { launch: plain, assistant: repo });

    expect(observed.noted.toLowerCase()).toBe(repo.replace(/\\/g, "/").toLowerCase());
    expect(observed.root.toLowerCase()).toBe(repo.toLowerCase());
    // The tooltip is what the user reads on hover, so it has to have moved too.
    await expect(page.locator(BUTTON)).toHaveAttribute("aria-label", "Pending changes on main");
  });

  test("ignores slash commands that cannot be a directory move", async ({ page }) => {
    await reset(page);
    makeClean();

    const ignored = await page.evaluate((assistant) => {
      const terminal = [...state.terminals.values()][0];
      const feed = (text) => { for (const character of text) trackAssistantDirectoryCommand(terminal, character); };
      feed("/cwd relative\\path\r");
      const afterRelative = terminal.assistantCwd;
      feed("/model gpt-5\r");
      const afterModel = terminal.assistantCwd;
      // A bare drive is absolute and must be rooted, not rejected.
      feed("/cwd C:\r");
      const afterBareDrive = terminal.assistantCwd;
      terminal.assistantCwd = "";
      // Abandoned before Enter, so it never happened.
      feed(`/cwd ${assistant}\u0003`);
      return { afterRelative, afterModel, afterBareDrive, afterCancel: terminal.assistantCwd };
    }, repo);

    expect(ignored.afterRelative).toBe("");
    expect(ignored.afterModel).toBe("");
    expect(ignored.afterBareDrive).toBe("C:\\");
    expect(ignored.afterCancel).toBe("");
  });

  // MultiTerm injects a prompt hook, so the shell reports at every prompt --
  // including the ones before the assistant started. Only the shell actually
  // moving proves it is back in charge.
  test("hands the directory back to the shell only once the shell actually moves", async ({ page }) => {
    await reset(page);
    makeClean();
    makeDirty();

    const targeted = await page.evaluate(async (folders) => {
      const terminal = [...state.terminals.values()][0];
      terminal.cwd = folders.launch;
      noteAssistantWorkingDirectory(terminal, folders.assistant);
      await refreshTerminalGitInspection(terminal);
      const whileAssistantRunning = terminal.gitInspection?.isRepository === true;
      // A prompt rendering in the folder the shell never left says nothing.
      updateTerminalCwd(terminal, folders.launch);
      await refreshTerminalGitInspection(terminal);
      const afterUnchangedReport = terminal.gitInspection?.isRepository === true;
      // The shell moving is what retires the assistant path.
      updateTerminalCwd(terminal, folders.moved);
      await refreshTerminalGitInspection(terminal);
      return {
        whileAssistantRunning,
        afterUnchangedReport,
        afterShellMoved: terminal.gitInspection?.isRepository === true
      };
    }, { launch: plain, assistant: repo, moved: `${plain}\\nested` });

    expect(targeted.whileAssistantRunning).toBe(true);
    expect(targeted.afterUnchangedReport, "an unchanged prompt report must not drop the assistant folder").toBe(true);
    expect(targeted.afterShellMoved).toBe(false);
    await expect(page.locator(BUTTON)).toBeHidden();
  });

  test("handles missing controls, detached branches, rejected chains, and watcher skips", async ({ page }) => {
    await reset(page);

    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      terminal.gitInspection = null;
      terminal.gitInspectChain = Promise.reject(new Error("prior lookup failed"));
      const rejected = refreshTerminalGitInspection(terminal).catch((error) => error.message);
      await terminal.gitInspectChain;

      const button = terminal.pane.querySelector('.pane-actions button[data-action="git-changes"]');
      button.remove();
      updateTerminalGitChangesButton(terminal);

      const noBranch = terminalGitBranchLabel({});
      const detached = terminalGitBranchLabel({ currentBranch: "HEAD" });

      const originalSetInterval = window.setInterval;
      const originalHidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
      let watcher = null;
      try {
        window.setInterval = (callback) => { watcher = callback; return 1; };
        startTerminalGitWatcher();
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        watcher();
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        terminal.transient = true;
        watcher();
        terminal.transient = false;
        terminal.minimized = true;
        watcher();
      } finally {
        terminal.transient = false;
        terminal.minimized = false;
        window.setInterval = originalSetInterval;
        delete document.hidden;
        if (originalHidden) Object.defineProperty(Document.prototype, "hidden", originalHidden);
      }

      return { rejected: await rejected, noBranch, detached };
    });

    expect(result.rejected).toBe("prior lookup failed");
    expect(result.noBranch).toBe("a detached HEAD");
    expect(result.detached).toBe("a detached HEAD");
  });

  test("reports every pending-change lookup failure without opening a diff", async ({ page }) => {
    await reset(page);

    const messages = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const originalRefresh = refreshTerminalGitInspection;
      const originalRefreshAssistant = refreshAssistantWorkingDirectory;
      const originalReview = openGitDiffReview;
      const originalToast = toast;
      const calls = [];
      try {
        await openTerminalGitChanges(null);
        refreshAssistantWorkingDirectory = async () => {};
        toast = (...args) => calls.push({ kind: "toast", args });
        openGitDiffReview = async (options) => calls.push({ kind: "review", options });

        refreshTerminalGitInspection = async () => null;
        terminal.cwd = "";
        await openTerminalGitChanges(terminal);
        terminal.cwd = "C:\\Known";
        await openTerminalGitChanges(terminal);

        refreshTerminalGitInspection = async () => ({ isRepository: false, reason: "" });
        await openTerminalGitChanges(terminal);
        refreshTerminalGitInspection = async () => ({ isRepository: false, reason: "Not a checkout" });
        await openTerminalGitChanges(terminal);

        refreshTerminalGitInspection = async () => ({
          isRepository: true,
          isDirty: false,
          currentBranch: "",
          repositoryRoot: "C:\\Known"
        });
        await openTerminalGitChanges(terminal);
      } finally {
        refreshTerminalGitInspection = originalRefresh;
        refreshAssistantWorkingDirectory = originalRefreshAssistant;
        openGitDiffReview = originalReview;
        toast = originalToast;
      }
      return calls;
    });

    expect(messages.filter((entry) => entry.kind === "toast").map((entry) => entry.args[0])).toEqual([
      "Working directory unknown",
      "MultiTerm could not check that folder for a git repository.",
      "That folder is not inside a git repository.",
      "Not a checkout"
    ]);
    const review = messages.find((entry) => entry.kind === "review");
    expect(review.options.subtitle).toContain("a detached HEAD");
    expect(review.options.staging.branch).toBe("HEAD");
    expect(review.options.staging.worktreePath).toBe("C:\\Known");
  });

  test("uses a plain tooltip when the pending-change shortcut is unassigned", async ({ page }) => {
    await reset(page);

    const title = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const previous = state.settings.headerActionShortcuts["git-changes"];
      state.settings.headerActionShortcuts["git-changes"] = null;
      applyTerminalGitInspection(terminal, {
        isRepository: true,
        isDirty: true,
        currentBranch: "main",
        repositoryRoot: "C:\\Repo"
      });
      const value = terminal.pane.querySelector('.pane-actions button[data-action="git-changes"]').title;
      if (previous === undefined) delete state.settings.headerActionShortcuts["git-changes"];
      else state.settings.headerActionShortcuts["git-changes"] = previous;
      return value;
    });

    expect(title).toBe("Pending changes on main");
  });
});
