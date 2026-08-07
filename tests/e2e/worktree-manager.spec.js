const { test, expect } = require("../support/renderer-coverage");

// This repository has seven pre-existing worktrees that MultiTerm did not
// create, so the "open only" rule has a real subject to be tested against.
test.describe("Worktree manager", () => {
  const open = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => openWorktreeManager({ cwd: "D:\\multiTerm" }));
    await expect(page.locator("#worktreeManagerOverlay")).toBeVisible();
    await expect(page.locator("#worktreeManagerStatus")).toContainText("created by MultiTerm", { timeout: 60000 });
  };

  test("lists the repository's worktrees", async ({ page }) => {
    await open(page);
    const rows = page.locator(".worktree-row");
    expect(await rows.count()).toBeGreaterThan(1);
    await expect(page.locator(".worktree-row-name").first()).toContainText("multiTerm");
  });

  test("offers only Open for worktrees MultiTerm did not create", async ({ page }) => {
    await open(page);
    const unmanaged = page.locator('.worktree-row[data-managed="false"]');
    expect(await unmanaged.count()).toBeGreaterThan(0);
    for (let index = 0; index < await unmanaged.count(); index += 1) {
      const actions = unmanaged.nth(index).locator(".worktree-row-actions button");
      await expect(actions).toHaveCount(1);
      await expect(actions.first()).toHaveText("Open");
    }
    await expect(unmanaged.first().locator(".worktree-row-meta")).toContainText("not created by MultiTerm");
  });

  test("explains a folder that is not a repository", async ({ page }) => {
    await open(page);
    await page.locator("#worktreeManagerRepo").fill("C:\\Windows");
    await expect(page.locator("#worktreeManagerStatus")).toContainText("not inside a git repository");
    await expect(page.locator("#worktreeManagerStatus")).toHaveAttribute("data-tone", "error");
    await expect(page.locator(".worktree-row")).toHaveCount(0);
  });

  test("opens a terminal in the chosen worktree", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => closeAllTerminals());
    await page.evaluate(() => openWorktreeManager({ cwd: "D:\\multiTerm" }));
    await expect(page.locator("#worktreeManagerStatus")).toContainText("created by MultiTerm", { timeout: 60000 });

    const target = page.locator('.worktree-row[data-managed="false"]').first();
    const wantedPath = await target.locator(".worktree-row-name").textContent();
    await target.locator("button", { hasText: "Open" }).click();

    await expect(page.locator("#worktreeManagerOverlay")).toBeHidden();
    await expect.poll(() => page.evaluate(() => state.terminals.size)).toBe(1);
    const cwd = await page.evaluate(() => [...state.terminals.values()][0].cwd);
    expect(cwd.replace(/\//g, "\\")).toBe(wantedPath.trim().replace(/\//g, "\\"));
  });
});
