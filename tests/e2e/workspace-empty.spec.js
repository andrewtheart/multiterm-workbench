const { test, expect } = require("../support/renderer-coverage");

// The blank stage is the one place a user can get stuck with no visible way
// forward, so both branches of the empty state matter.
test.describe("Empty workspace guidance", () => {
  const ready = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      closeAllTerminals();
      addTerminal({ reveal: true });
    });
    await expect.poll(() => page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      return terminal ? terminal.status : "none";
    }), { timeout: 30000 }).toBe("live");
  };

  test("stays hidden while a terminal is visible", async ({ page }) => {
    await ready(page);
    await expect(page.locator("#workspaceEmpty")).toBeHidden();
  });

  test("explains how to start a terminal when the page is genuinely empty", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => closeAllTerminals());
    await expect(page.locator("#workspaceEmpty")).toBeVisible();
    await expect(page.locator("#workspaceEmptyHint")).toBeVisible();
    await expect(page.locator("#workspaceEmptyRestore")).toBeHidden();
    await expect(page.locator("#workspaceEmptyHint")).toContainText("Nothing to show here.");
    await expect(page.locator("#workspaceEmptyShortcut")).toHaveText("Ctrl+T");
    await expect(page.locator("#workspaceEmptyHint")).toContainText("right clicking in this page");
    await expect(page.locator("#workspaceEmptyHint")).toContainText("on the top right of the app");
    await expect(page.locator(".workspace-empty-mark")).toBeVisible();
  });

  test("offers to restore minimized terminals instead of the hint", async ({ page }) => {
    await ready(page);
    const title = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      minimizeTerminal(terminal.id);
      return terminal.titleInput.value;
    });

    await expect(page.locator("#workspaceEmpty")).toBeVisible();
    await expect(page.locator("#workspaceEmptyRestore")).toBeVisible();
    await expect(page.locator("#workspaceEmptyHint")).toBeHidden();
    const rows = page.locator("#workspaceEmptyList button");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveText(title);
    // One entry does not need a bulk action.
    await expect(page.locator("#workspaceEmptyRestoreAll")).toBeHidden();

    await rows.first().click();
    await expect(page.locator("#workspaceEmpty")).toBeHidden();
    expect(await page.evaluate(() => [...state.terminals.values()][0].minimized)).toBe(false);
  });

  test("restores every minimized terminal on the page at once", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => addTerminal({ reveal: true }));
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await page.evaluate(() => {
      for (const terminal of [...state.terminals.values()]) minimizeTerminal(terminal.id);
    });

    await expect(page.locator("#workspaceEmptyList button")).toHaveCount(2);
    await expect(page.locator("#workspaceEmptyRestoreAll")).toBeVisible();
    await page.locator("#workspaceEmptyRestoreAll").click();
    await expect(page.locator("#workspaceEmpty")).toBeHidden();
    expect(await page.evaluate(() => [...state.terminals.values()].filter((t) => t.minimized).length)).toBe(0);
  });

  test("only counts minimized terminals belonging to the active page", async ({ page }) => {
    await ready(page);
    const counts = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      minimizeTerminal(terminal.id);
      const onOwnPage = document.querySelectorAll("#workspaceEmptyList button").length;
      addPage();
      const onOtherPage = document.querySelectorAll("#workspaceEmptyList button").length;
      return { onOwnPage, onOtherPage, hintShown: !document.querySelector("#workspaceEmptyHint").hidden };
    });
    expect(counts.onOwnPage).toBe(1);
    // A different page must not offer to restore someone else's terminals.
    expect(counts.onOtherPage).toBe(0);
    expect(counts.hintShown).toBe(true);
  });

  test("does not block the workspace context menu", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => closeAllTerminals());
    await expect(page.locator("#workspaceEmpty")).toBeVisible();
    const box = await page.locator("#workspaceEmpty").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + 24, { button: "right" });
    await expect(page.locator("#contextMenu")).toBeVisible();
  });
});
