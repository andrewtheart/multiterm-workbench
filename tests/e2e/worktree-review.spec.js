const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { test, expect } = require("../support/renderer-coverage");

// The review view renders git's own diff output, so it needs a worktree with
// real commits rather than a stubbed patch.
let fixture;

test.beforeAll(() => {
  const output = execFileSync("node", [path.join(__dirname, "..", "support", "worktree-fixture.js")], { encoding: "utf8" });
  fixture = JSON.parse(output.trim().split("\n").pop());
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
    await expect(managed.locator(".worktree-row-actions button")).toHaveCount(3);
  });

  test("renders the real diff for the worktree", async ({ page }) => {
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
    await expect(diff).toContainText("agent world");
  });

  test("closes the review and returns to the manager", async ({ page }) => {
    await openManager(page);
    await page.locator('.worktree-row[data-managed="true"] button', { hasText: "Review" }).click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeVisible();
    await page.locator("#worktreeReviewDone").click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeHidden();
    await expect(page.locator("#worktreeManagerOverlay")).toBeVisible();
  });
});
