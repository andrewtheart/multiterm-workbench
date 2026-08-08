const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("../support/renderer-coverage");

let fixture;
const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

test.beforeEach(() => {
  const output = execFileSync(
    "node",
    [path.join(__dirname, "..", "support", "worktree-fixture.js"), "--conflict"],
    { encoding: "utf8" }
  );
  fixture = JSON.parse(output.trim().split("\n").pop());
});

async function openConflict(page) {
  await page.goto("http://127.0.0.1:3199/");
  await expect(page.locator("#statusConn")).toHaveText("Connected");
  await page.evaluate((repo) => openWorktreeManager({ cwd: repo }), fixture.repo);
  await expect(page.locator("#worktreeManagerStatus")).toContainText("created by MultiTerm", { timeout: 60000 });
  await page.getByRole("button", { name: "Bring changes back", exact: true }).click();
  await page.locator("#worktreeMergeConfirm").click();
  await expect(page.locator("#worktreeConflictOverlay")).toBeVisible({ timeout: 120000 });
}

test("resolves a real pending conflict and finishes the same merge session", async ({ page }) => {
  const parentHeadBefore = git(["rev-parse", "HEAD"], fixture.repo).trim();
  const sourceHeadBefore = git(["rev-parse", "HEAD"], fixture.worktreePath).trim();
  const sourceStatusBefore = git(["status", "--porcelain"], fixture.worktreePath);

  await openConflict(page);
  await expect(page.locator("#worktreeConflictSubtitle")).toHaveText("greeting.txt");
  await expect(page.locator("#worktreeConflictBase")).toContainText("world");
  await expect(page.locator("#worktreeConflictOurs")).toContainText("parent world");
  await expect(page.locator("#worktreeConflictTheirs")).toContainText("agent world");
  await expect(page.locator("#worktreeConflictHunkCount")).toHaveText("1 unresolved hunk");

  await page.getByRole("button", { name: "Use incoming", exact: true }).click();
  await expect(page.locator("#worktreeConflictResult")).toHaveValue(/agent world/);
  await expect(page.locator("#worktreeConflictResult")).not.toHaveValue(/<<<<<<<|>>>>>>>/);
  await page.locator("#worktreeConflictSave").click();

  await expect(page.locator("#worktreeMergeOverlay")).toBeVisible();
  await expect(page.locator("#worktreeMergeConfirm")).toHaveText("Finish pending changes");
  await page.locator("#worktreeMergeConfirm").click();
  await expect(page.locator("#worktreeMergeStatus")).toContainText("All changes are now pending", { timeout: 120000 });

  expect(git(["rev-parse", "HEAD"], fixture.repo).trim()).toBe(parentHeadBefore);
  expect(git(["rev-parse", "HEAD"], fixture.worktreePath).trim()).toBe(sourceHeadBefore);
  expect(git(["status", "--porcelain"], fixture.worktreePath)).toBe(sourceStatusBefore);
  expect(fs.readFileSync(path.join(fixture.repo, "greeting.txt"), "utf8")).toContain("agent world");
});

test("returns to the mode dialog and aborts the provisional conflict cleanly", async ({ page }) => {
  const parentHeadBefore = git(["rev-parse", "HEAD"], fixture.repo).trim();
  const sourceHeadBefore = git(["rev-parse", "HEAD"], fixture.worktreePath).trim();

  await openConflict(page);
  await page.locator("#worktreeConflictBack").click();
  await expect(page.locator("#worktreeMergeOverlay")).toBeVisible();
  await expect(page.locator("#worktreeMergeCancel")).toHaveText("Abort merge");
  await page.locator("#worktreeMergeCancel").click();
  await expect(page.locator("#worktreeMergeOverlay")).toBeHidden({ timeout: 120000 });

  expect(git(["rev-parse", "HEAD"], fixture.repo).trim()).toBe(parentHeadBefore);
  expect(git(["rev-parse", "HEAD"], fixture.worktreePath).trim()).toBe(sourceHeadBefore);
  expect(git(["status", "--porcelain"], fixture.repo)).toBe("");
  expect(fs.readFileSync(path.join(fixture.repo, "greeting.txt"), "utf8")).toContain("parent world");
});

test("returns to the mode dialog and resumes the unresolved conflict", async ({ page }) => {
  const parentHeadBefore = git(["rev-parse", "HEAD"], fixture.repo).trim();

  await openConflict(page);
  await page.locator("#worktreeConflictBack").click();
  await expect(page.locator("#worktreeMergeOverlay")).toBeVisible();
  await expect(page.locator("#worktreeMergeConfirm")).toHaveText("Resume conflicts");
  await page.locator("#worktreeMergeConfirm").click();
  await expect(page.locator("#worktreeConflictOverlay")).toBeVisible();
  await expect(page.locator("#worktreeConflictSubtitle")).toHaveText("greeting.txt");
  await expect(page.locator("#worktreeConflictStatus")).toHaveText("Choose the final contents for this file.");
  await expect(page.locator("#worktreeConflictHunkCount")).toHaveText("1 unresolved hunk");

  await page.getByRole("button", { name: "Use incoming", exact: true }).click();
  await expect(page.locator("#worktreeConflictResult")).not.toHaveValue(/<<<<<<<|>>>>>>>/);
  await page.locator("#worktreeConflictSave").click();
  await expect(page.locator("#worktreeMergeConfirm")).toHaveText("Finish pending changes");
  await page.locator("#worktreeMergeConfirm").click();
  await expect(page.locator("#worktreeMergeStatus")).toContainText("All changes are now pending", { timeout: 120000 });

  expect(git(["rev-parse", "HEAD"], fixture.repo).trim()).toBe(parentHeadBefore);
  expect(fs.readFileSync(path.join(fixture.repo, "greeting.txt"), "utf8")).toContain("agent world");
});