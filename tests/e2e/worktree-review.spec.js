const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("../support/renderer-coverage");

// The review view renders git's own diff output, so it needs a worktree with
// real commits rather than a stubbed patch.
let fixture;
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const readText = (filePath) => fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

test.beforeAll(() => {
  const output = execFileSync("node", [path.join(__dirname, "..", "support", "worktree-fixture.js")], { encoding: "utf8" });
  fixture = JSON.parse(output.trim().split("\n").pop());
  fs.writeFileSync(path.join(fixture.worktreePath, "greeting.txt"), "hello\nagent world with pending edits\n");
  fs.writeFileSync(path.join(fixture.worktreePath, "staged-review.txt"), "staged review work\n");
  git(["add", "staged-review.txt"], fixture.worktreePath);
  fs.writeFileSync(path.join(fixture.worktreePath, "untracked-review.txt"), "untracked review work\n");
});

test.describe("Worktree review", () => {
  const openManager = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate((repo) => openWorktreeManager({ cwd: repo }), fixture.repo);
    await expect(page.locator("#worktreeManagerStatus")).toContainText("created by MultiTerm", { timeout: 60000 });
  };

  test("shows the worktree as MultiTerm-created with its parent", async ({ page }) => {
    await openManager(page);
    const managed = page.locator('.worktree-row[data-managed="true"]');
    await expect(managed).toHaveCount(1);
    await expect(managed.locator(".worktree-row-meta")).toHaveText("main-agent from main");
    await expect(managed.locator(".worktree-row-actions button")).toHaveCount(4);
  });

  test("renders committed and pending changes for the worktree", async ({ page }) => {
    await openManager(page);
    await page.locator('.worktree-row[data-managed="true"] button', { hasText: "Review" }).click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeVisible();
    await expect(page.locator("#worktreeReviewSubtitle")).toHaveText("main-agent compared with main");

    const diff = page.locator("#worktreeReviewDiff");
    await expect(diff.locator(".d2h-file-wrapper").first()).toBeVisible({ timeout: 60000 });
    await expect(diff).toContainText("greeting.txt");
    await expect(diff).toContainText("added.txt");
    // keep.txt was never touched, so it must not appear.
    await expect(diff).not.toContainText("keep.txt");
    await expect(diff).toContainText("agent world with pending edits");
    await expect(diff).toContainText("staged-review.txt");
    await expect(diff).toContainText("staged review work");
    await expect(diff).toContainText("untracked-review.txt");
    await expect(diff).toContainText("untracked review work");
    const backgrounds = await diff.evaluate((viewer) => {
      const selectors = [".d2h-wrapper", ".d2h-cntx .d2h-code-line", ".d2h-del", ".d2h-ins"];
      return Object.fromEntries(selectors.map((selector) => {
        const element = viewer.querySelector(selector);
        return [selector, element ? getComputedStyle(element).backgroundColor : "missing"];
      }));
    });
    for (const background of Object.values(backgrounds)) {
      expect(background).not.toBe("missing");
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
    }

    // An added or removed row carries its tint on the cell, so the code line
    // inside it must stay transparent. Painting the surface colour there masked
    // the tint under the code and left it showing only as a block to the right.
    const tinted = await diff.evaluate((viewer) => {
      const cell = viewer.querySelector("td.d2h-ins:not(.d2h-code-linenumber), td.d2h-del:not(.d2h-code-linenumber)");
      const line = cell?.querySelector(".d2h-code-line");
      return {
        cell: cell ? getComputedStyle(cell).backgroundColor : "missing",
        line: line ? getComputedStyle(line).backgroundColor : "missing"
      };
    });
    expect(tinted.cell).not.toBe("rgba(0, 0, 0, 0)");
    expect(tinted.line, "the code line must not mask its row's tint").toBe("rgba(0, 0, 0, 0)");
  });

  test("closes the review and returns to the manager", async ({ page }) => {
    await openManager(page);
    await page.locator('.worktree-row[data-managed="true"] button', { hasText: "Review" }).click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeVisible();
    await page.locator("#worktreeReviewDone").click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeHidden();
    await expect(page.locator("#worktreeManagerOverlay")).toBeVisible();
  });

  test("brings committed and pending work back without creating a parent commit", async ({ page }) => {
    fs.writeFileSync(path.join(fixture.repo, "parent-pending.txt"), "keep parent pending\n");
    git(["add", "parent-pending.txt"], fixture.repo);
    fs.writeFileSync(path.join(fixture.worktreePath, "agent-pending.txt"), "uncommitted agent work\n");
    const parentHeadBefore = git(["rev-parse", "HEAD"], fixture.repo).trim();
    const sourceHeadBefore = git(["rev-parse", "HEAD"], fixture.worktreePath).trim();
    const sourceStatusBefore = git(["status", "--porcelain"], fixture.worktreePath);

    await openManager(page);
    await page.getByRole("button", { name: "Bring changes back", exact: true }).click();
    await expect(page.locator("#worktreeMergeOverlay")).toBeVisible();
    await expect(page.locator('input[name="worktreeMergeMode"][value="pending"]')).toBeChecked();
    await expect(page.locator("#worktreeMergeCommitRow")).toBeHidden();
    await page.locator("#worktreeMergeConfirm").click();

    await expect(page.locator("#worktreeMergeStatus")).toContainText("All changes are now pending", { timeout: 120000 });
    await expect(page.locator("#worktreeMergeStatus")).toContainText("No commit was created");
    expect(git(["rev-parse", "HEAD"], fixture.repo).trim()).toBe(parentHeadBefore);
    expect(git(["rev-parse", "HEAD"], fixture.worktreePath).trim()).toBe(sourceHeadBefore);
    expect(git(["status", "--porcelain"], fixture.worktreePath)).toBe(sourceStatusBefore);
    expect(readText(path.join(fixture.repo, "parent-pending.txt"))).toBe("keep parent pending\n");
    expect(readText(path.join(fixture.repo, "agent-pending.txt"))).toBe("uncommitted agent work\n");
    expect(readText(path.join(fixture.repo, "greeting.txt"))).toMatch(/agent world/);
    expect(readText(path.join(fixture.repo, "added.txt"))).toBe("brand new\n");
  });
});
