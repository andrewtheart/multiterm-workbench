const { test, expect } = require("../support/renderer-coverage");

test.describe("Inline folder picker", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      window.__folderPickerOriginalRequestBridge = requestBridge;
      window.__folderPickerMessages = [];
      window.__folderPickerEverythingAvailable = false;
      state.settings.folderEverythingReminderDismissed = false;
      saveSettings();
      requestBridge = async (message) => {
        window.__folderPickerMessages.push({ ...message });
        if (message.type === "folderList") {
          const current = message.path || "D:\\Root";
          const entries = current === "D:\\Root"
            ? [
                { name: "Alpha", path: "D:\\Root\\Alpha" },
                { name: "Beta folder", path: "D:\\Root\\Beta folder" }
              ]
            : current === "D:\\Root\\Alpha"
              ? [{ name: "Child result", path: "D:\\Root\\Alpha\\Child result" }]
              : [];
          return {
            ok: true,
            path: current,
            parent: folderPathParent(current),
            roots: ["C:\\", "D:\\"],
            entries,
            everythingAvailable: window.__folderPickerEverythingAvailable,
            platform: "win32"
          };
        }
        if (message.type === "folderSearch") {
          if (message.autocomplete) {
            return {
              ok: true,
              results: [{ name: "Alpha", path: "D:\\Root\\Alpha" }],
              hasMore: false,
              engine: "direct",
              everythingAvailable: window.__folderPickerEverythingAvailable
            };
          }
          if (message.query === "match") {
            const results = message.offset
              ? [{ name: "Match three", path: "D:\\Root\\Match three" }]
              : [
                  { name: "Match one", path: "D:\\Root\\Match one" },
                  { name: "Match two", path: "D:\\Root\\Match two" }
                ];
            return {
              ok: true,
              results,
              hasMore: !message.offset,
              engine: message.everywhere ? "everything" : "fallback",
              everythingAvailable: window.__folderPickerEverythingAvailable
            };
          }
          return {
            ok: true,
            results: [{ name: "Child result", path: "D:\\Root\\Alpha\\Child result" }],
            hasMore: false,
            engine: "fallback",
            everythingAvailable: window.__folderPickerEverythingAvailable
          };
        }
        if (message.type === "folderCreate") {
          return { ok: true, path: `${message.path}\\${message.name}` };
        }
        return window.__folderPickerOriginalRequestBridge(message);
      };
    });
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      if (folderPicker.resolve) settleFolderPicker(null);
      requestBridge = window.__folderPickerOriginalRequestBridge;
      delete window.__folderPickerOriginalRequestBridge;
      delete window.__folderPickerMessages;
      delete window.__folderPickerEverythingAvailable;
    });
  });

  test("navigates hierarchy, autocompletes paths, highlights partial matches, and selects", async ({ page }) => {
    await page.evaluate(() => {
      window.__folderPickerChoice = "pending";
      chooseInlineFolder("D:\\Root", "Select test folder")
        .then((value) => { window.__folderPickerChoice = value; });
    });

    const overlay = page.locator("#folderPickerOverlay");
    await expect(overlay).toBeVisible();
    await expect(page.locator("#folderPickerTitle")).toHaveText("Select test folder");
    await expect(page.locator(".folder-picker-row")).toHaveCount(2);
    await expect(page.locator("#folderPickerBreadcrumbs")).toContainText("Root");

    await page.locator(".folder-picker-row").filter({ hasText: "Alpha" }).locator(".folder-picker-row-open").click();
    await expect(page.locator("#folderPickerLocation")).toHaveValue("D:\\Root\\Alpha");
    await expect(page.locator(".folder-picker-row")).toHaveCount(1);
    await page.locator("#folderPickerBack").click();
    await expect(page.locator("#folderPickerLocation")).toHaveValue("D:\\Root");

    await page.locator("#folderPickerLocation").fill("D:\\Root\\Al");
    await expect(page.locator("#folderPickerSuggestions")).toBeVisible();
    await expect(page.locator("#folderPickerSuggestions mark")).toHaveText("Al");
    await expect(page.locator("#folderPickerSuggestions button")).toHaveText("D:\\Root\\Alpha");
    await page.locator("#folderPickerSuggestions button").click();
    await expect(page.locator("#folderPickerLocation")).toHaveValue("D:\\Root\\Alpha");

    await page.locator("#folderPickerSearch").fill("child");
    await expect(page.locator(".folder-picker-row-text strong mark")).toHaveText("Child");
    await expect(page.locator(".folder-picker-row-text small")).toContainText("Child result");
    await page.locator("#folderPickerSearch").press("ArrowDown");
    await expect(page.locator(".folder-picker-row-main")).toBeFocused();
    await page.locator(".folder-picker-row-main").click();
    await page.locator("#folderPickerSelect").click();
    await expect(overlay).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__folderPickerChoice)).toBe("D:\\Root\\Alpha\\Child result");
  });

  test("paginates search, creates a folder, and persists the Everything reminder dismissal", async ({ page }) => {
    await page.evaluate(() => {
      window.__folderPickerChoice = "pending";
      chooseInlineFolder("D:\\Root").then((value) => { window.__folderPickerChoice = value; });
    });
    await expect(page.locator("#folderPickerEverythingNotice")).toBeVisible();
    await expect(page.locator("#folderPickerEverywhere")).toBeDisabled();
    await page.locator("#folderPickerEverythingDismiss").click();
    await expect(page.locator("#folderPickerEverythingNotice")).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings")).folderEverythingReminderDismissed)).toBe(true);

    await page.locator("#folderPickerSearch").fill("match");
    await expect(page.locator(".folder-picker-row")).toHaveCount(2);
    await page.locator(".folder-picker-load-more").click();
    await expect(page.locator(".folder-picker-row")).toHaveCount(3);
    const offsets = await page.evaluate(() => window.__folderPickerMessages
      .filter((message) => message.type === "folderSearch" && message.query === "match")
      .map((message) => message.offset));
    expect(offsets).toEqual([0, 2]);

    await page.locator("#folderPickerSearch").fill("");
    await page.locator("#folderPickerNew").click();
    await page.locator("#folderPickerNewName").fill("Made here");
    await page.locator("#folderPickerNewForm button[type='submit']").click();
    await expect(page.locator("#folderPickerLocation")).toHaveValue("D:\\Root\\Made here");
    await page.locator("#folderPickerSelect").click();
    await expect.poll(() => page.evaluate(() => window.__folderPickerChoice)).toBe("D:\\Root\\Made here");

    await page.evaluate(() => { chooseInlineFolder("D:\\Root"); });
    await expect(page.locator("#folderPickerEverythingNotice")).toBeHidden();
  });

  test("enables indexed whole-computer search when Everything is available", async ({ page }) => {
    await page.evaluate(() => {
      window.__folderPickerEverythingAvailable = true;
      chooseInlineFolder("D:\\Root");
    });
    await expect(page.locator("#folderPickerEverywhere")).toBeEnabled();
    await expect(page.locator("#folderPickerEverythingNotice")).toBeHidden();
    await page.locator("#folderPickerEverywhere").click();
    await page.locator("#folderPickerSearch").fill("match");
    await expect(page.locator("#folderPickerStatus")).toContainText("with Everything");
    const request = await page.evaluate(() => window.__folderPickerMessages
      .findLast((message) => message.type === "folderSearch" && message.query === "match"));
    expect(request).toMatchObject({ everywhere: true, useEverything: true });
  });

  test("routes every folder browse control through the shared picker", async ({ page }) => {
    const controls = [
      ["#worktreeManagerOverlay", "#worktreeManagerBrowse", "Select repository folder"],
      ["#worktreeOverlay", "#worktreeBrowse", "Select repository folder"],
      ["#worktreeOverlay", "#worktreeSharedRootBrowse", "Select shared worktree location"],
      ["#cwdChangeOverlay", "#cwdChangeBrowse", "Select working directory"]
    ];
    for (const [owner, control, title] of controls) {
      await page.evaluate((selector) => { document.querySelector(selector).hidden = false; }, owner);
      await page.evaluate((selector) => { document.querySelector(selector).click(); }, control);
      await expect(page.locator("#folderPickerOverlay")).toBeVisible();
      await expect(page.locator("#folderPickerTitle")).toHaveText(title);
      await page.locator("#folderPickerCancel").click();
      await expect(page.locator("#folderPickerOverlay")).toBeHidden();
      await page.evaluate((selector) => { document.querySelector(selector).hidden = true; }, owner);
    }
  });

  test("keeps hierarchy and selection controls usable on a mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { chooseInlineFolder("D:\\Root"); });
    const dialog = page.locator(".folder-picker");
    await expect(dialog).toBeVisible();
    await expect(page.locator("#folderPickerList")).toBeVisible();
    await expect(page.locator("#folderPickerSelect")).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  });
});