/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

test.describe.configure({ mode: "serial" });

test.describe("Ctrl+Tab page cycling", () => {
  let context;
  let page;

  const activePageName = () => page.evaluate(() => activePage().name);

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199" });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => closeAllTerminals());
    await page.evaluate(() => {
      // Reset to a known three-page workspace without persisting shortcut overrides.
      state.pages = [{ id: "page-1", name: "Page 1" }];
      state.activePageId = "page-1";
      savePages();
      renderPager();
      addPage({ name: "Page 2", activate: false });
      addPage({ name: "Page 3", activate: false });
      setActivePage("page-1");
      addTerminal({ runStartup: false });
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect(page.locator(".pane-status").first()).toContainText(/pid \d+/i);
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      closeAllTerminals();
      state.pages = [{ id: "page-1", name: "Page 1" }];
      state.activePageId = "page-1";
      savePages();
      renderPager();
    });
    await stopRendererCoverage(page);
    await context.close();
  });

  test("is bound to the next-page action by default", async () => {
    const bindings = await page.evaluate(() => ({
      next: globalShortcutBindings("page.next").map(formatGlobalShortcut),
      aria: globalShortcutBindings("page.next").map(globalShortcutAria)
    }));
    expect(bindings.next).toContain("Ctrl+Tab");
    expect(bindings.aria).toContain("Control+Tab");
  });

  test("cycles forward through every page and wraps to the first", async () => {
    await page.locator(".xterm-helper-textarea").first().focus();
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      window.__tabFrames = [];
      window.__tabOriginalSend = state.socket.send;
      state.socket.send = (payload) => window.__tabFrames.push(JSON.parse(payload));
    });

    expect(await activePageName()).toBe("Page 1");
    // Checked straight after the first press: focus is asserted while this pane is
    // certainly still alive, since the shared bridge can reap leftover sessions.
    await page.keyboard.press("Control+Tab");
    const firstPress = await page.evaluate(() => ({
      page: activePage().name,
      focusedWorkspace: document.activeElement === elements.stage
    }));
    expect(firstPress).toEqual({ page: "Page 2", focusedWorkspace: true });

    await page.keyboard.press("Control+Tab");
    expect(await activePageName()).toBe("Page 3");
    // Wraps rather than stopping at the end of the list.
    await page.keyboard.press("Control+Tab");
    expect(await activePageName()).toBe("Page 1");
    await expect(page.locator(".xterm-helper-textarea").first()).toBeFocused();

    // The chord must never reach the terminal as a literal tab.
    const typed = await page.evaluate(() => {
      const tabs = window.__tabFrames
        .filter((frame) => frame.type === "input")
        .map((frame) => String(frame.data))
        .filter((data) => data.includes("\t"));
      state.socket.send = window.__tabOriginalSend;
      delete window.__tabFrames;
      delete window.__tabOriginalSend;
      return tabs;
    });
    expect(typed).toEqual([]);
  });

  test("can be reassigned and cleared from the keyboard shortcuts page", async () => {
    await page.evaluate(() => openShortcuts());
    await expect(page.locator("#shortcutsOverlay")).toBeVisible();
    const row = page.locator('[data-shortcut-action="page.next"]');
    await expect(row.locator(".shortcut-binding", { hasText: "Ctrl+Tab" })).toBeVisible();

    await page.evaluate(() => {
      const index = globalShortcutBindings("page.next")
        .findIndex((binding) => formatGlobalShortcut(binding) === "Ctrl+Tab");
      assignGlobalShortcutBinding("page.next", index, { ctrl: true, alt: true, key: "tab" });
      renderShortcutCatalog();
    });
    await expect(row.locator(".shortcut-binding", { hasText: "Ctrl+Alt+Tab" })).toBeVisible();

    await page.evaluate(() => closeShortcuts());
    await expect(page.locator("#shortcutsOverlay")).toBeHidden();
    await page.locator(".xterm-helper-textarea").first().focus();
    await page.keyboard.press("Control+Tab");
    expect(await activePageName()).toBe("Page 1");
    await page.keyboard.press("Control+Alt+Tab");
    expect(await activePageName()).toBe("Page 2");

    await page.evaluate(() => {
      resetGlobalShortcutAction("page.next");
      setActivePage("page-1");
    });
    expect(await page.evaluate(() => globalShortcutBindings("page.next").map(formatGlobalShortcut)))
      .toContain("Ctrl+Tab");
  });
});
