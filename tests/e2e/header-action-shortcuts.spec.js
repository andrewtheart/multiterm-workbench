/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const { test, expect } = require("../support/renderer-coverage");

const FLYOUT = "#headerActionShortcutFlyout";

async function reset(page, count = 1) {
  await page.goto("/");
  await expect(page.locator("#statusConn")).toHaveText("Connected");
  await page.evaluate(() => {
    closeAllTerminals();
    state.settings.headerActionShortcuts = {};
    saveSettings();
  });
  await expect(page.locator(".terminal-pane")).toHaveCount(0);
  await page.evaluate((terminalCount) => {
    for (let index = 0; index < terminalCount; index += 1) {
      addTerminal({ title: `Shortcut terminal ${index + 1}` });
    }
  }, count);
  await expect(page.locator(".terminal-pane")).toHaveCount(count);
  await expect.poll(() => page.evaluate(() => (
    [...state.terminals.values()].filter((terminal) => terminal.status === "live").length
  ))).toBe(count);
}

// Header buttons only surface on hover, so force the right-click through rather
// than waiting on a reveal that never happens without a real pointer.
async function openShortcutFlyout(page, action, paneIndex = 0) {
  await page.locator(".terminal-pane").nth(paneIndex)
    .locator(`.pane-actions button[data-action="${action}"]`)
    .click({ button: "right", force: true });
  await expect(page.locator(FLYOUT)).toBeVisible();
}

// Actions that live in the hamburger menu have no visible header button, so the
// flyout has to be reachable from the menu row instead.
async function openShortcutFlyoutFromMenu(page, action, paneIndex = 0) {
  await page.locator(".terminal-pane").nth(paneIndex)
    .locator('.pane-actions button[data-action="more"]')
    .click({ force: true });
  const menu = page.locator("#contextMenu");
  await expect(menu).toBeVisible();
  await menu.locator(`[data-header-action="${action}"]`).click({ button: "right" });
  await expect(page.locator(FLYOUT)).toBeVisible();
}

async function captureCombination(page, keys) {
  await page.locator("#headerActionShortcutCapture").click();
  await expect(page.locator("#headerActionShortcutCapture")).toHaveClass(/is-capturing/);
  await page.locator(FLYOUT).press(keys);
  await expect(page.locator("#headerActionShortcutCapture")).not.toHaveClass(/is-capturing/);
}

function resolvedShortcut(page, action, terminalIndex = null) {
  return page.evaluate(([actionId, index]) => {
    const terminal = index == null ? null : [...state.terminals.values()][index];
    return formatGlobalShortcut(headerActionShortcut(actionId, terminal));
  }, [action, terminalIndex]);
}

// After a reload the restored pane order is not something this spec controls,
// so identify the terminal by the title it was created with.
function resolvedShortcutByTitle(page, action, title) {
  return page.evaluate(([actionId, wanted]) => {
    const terminal = [...state.terminals.values()].find((candidate) => candidate.titleInput.value === wanted);
    if (!terminal) return "missing";
    return formatGlobalShortcut(headerActionShortcut(actionId, terminal));
  }, [action, title]);
}

test.describe("Terminal header action shortcuts", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      closeHeaderActionShortcutFlyout({ restoreFocus: false });
      state.settings.headerActionShortcuts = {};
      saveSettings();
      closeAllTerminals();
    });
  });

  test("every header action ships a unique binding that collides with nothing", async ({ page }) => {
    await reset(page, 1);
    expect(await page.evaluate(() => headerActionShortcutDefaultConflicts())).toEqual([]);

    const assigned = await page.evaluate(() => HEADER_ACTION_IDS.map((action) => (
      formatGlobalShortcut(headerActionShortcut(action))
    )));
    expect(assigned.length).toBeGreaterThan(0);
    expect(assigned.filter(Boolean)).toHaveLength(assigned.length);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  test("the default combination runs the action on the active terminal", async ({ page }) => {
    await reset(page, 1);
    const pane = page.locator(".terminal-pane").first();
    await expect(pane).not.toHaveClass(/is-minimized/);

    await page.keyboard.press("Control+Alt+Shift+M");

    await expect(pane).toHaveClass(/is-minimized/);
  });

  test("a remap for all terminals reaches every pane and survives a reload", async ({ page }) => {
    await reset(page, 1);
    await openShortcutFlyout(page, "minimize");
    await captureCombination(page, "Control+Alt+Shift+F9");
    await expect(page.locator("#headerActionShortcutBinding")).toHaveText("Ctrl+Alt+Shift+F9");
    await page.locator("#headerActionShortcutSave").click();
    await expect(page.locator(FLYOUT)).toBeHidden();

    expect(await resolvedShortcut(page, "minimize")).toBe("Ctrl+Alt+Shift+F9");

    await page.evaluate(() => addTerminal({ title: "Second" }));
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    expect(await resolvedShortcut(page, "minimize", 1)).toBe("Ctrl+Alt+Shift+F9");

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    expect(await resolvedShortcut(page, "minimize")).toBe("Ctrl+Alt+Shift+F9");
  });

  test("a remap for one terminal leaves the other terminals alone", async ({ page }) => {
    await reset(page, 2);

    await openShortcutFlyout(page, "minimize", 0);
    await page.locator('input[name="headerActionShortcutScope"][value="terminal"]').check();
    await captureCombination(page, "Control+Alt+Shift+F8");
    await page.locator("#headerActionShortcutSave").click();
    await expect(page.locator(FLYOUT)).toBeHidden();

    expect(await resolvedShortcut(page, "minimize", 0)).toBe("Ctrl+Alt+Shift+F8");
    expect(await resolvedShortcut(page, "minimize", 1)).toBe("Ctrl+Alt+Shift+M");
    // A per-terminal override must not leak into the shared binding.
    expect(await resolvedShortcut(page, "minimize")).toBe("Ctrl+Alt+Shift+M");

    // The override only answers while its own terminal holds focus.
    await page.evaluate(() => setActiveTerminal([...state.terminals.keys()][1]));
    await page.keyboard.press("Control+Alt+Shift+F8");
    await expect(page.locator(".terminal-pane").nth(1)).not.toHaveClass(/is-minimized/);

    await page.evaluate(() => setActiveTerminal([...state.terminals.keys()][0]));
    await page.keyboard.press("Control+Alt+Shift+F8");
    await expect(page.locator(".terminal-pane").nth(0)).toHaveClass(/is-minimized/);

    // The override is per-terminal state, so it has to ride the session snapshot.
    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => resolvedShortcutByTitle(page, "minimize", "Shortcut terminal 1"))
      .toBe("Ctrl+Alt+Shift+F8");
    expect(await resolvedShortcutByTitle(page, "minimize", "Shortcut terminal 2"))
      .toBe("Ctrl+Alt+Shift+M");
  });

  test("a combination owned by a global shortcut is refused", async ({ page }) => {
    await reset(page, 1);
    await openShortcutFlyoutFromMenu(page, "clear");
    await captureCombination(page, "Control+f");

    await expect(page.locator("#headerActionShortcutStatus")).toHaveClass(/is-error/);
    await expect(page.locator("#headerActionShortcutSave")).toBeDisabled();
    // Nothing may be written while the conflict stands.
    expect(await resolvedShortcut(page, "clear")).toBe("Ctrl+Alt+Shift+L");
    // The combination being recorded must not also run its real action.
    await expect(page.locator(".terminal-pane .pane-find")).toBeHidden();
  });

  test("recording a combination never triggers the action it is bound to", async ({ page }) => {
    await reset(page, 1);
    const pane = page.locator(".terminal-pane").first();
    await openShortcutFlyout(page, "maximize");

    // Ctrl+Alt+Shift+M is the live Minimize binding; capturing it must be inert.
    await captureCombination(page, "Control+Alt+Shift+M");
    await expect(page.locator("#headerActionShortcutBinding")).toHaveText("Ctrl+Alt+Shift+M");
    await expect(pane).not.toHaveClass(/is-minimized/);
  });

  test("taking a combination from another header action unassigns that one", async ({ page }) => {
    await reset(page, 1);
    await openShortcutFlyoutFromMenu(page, "clear");
    await captureCombination(page, "Control+Alt+Shift+M");
    await expect(page.locator("#headerActionShortcutStatus")).toContainText("Minimize");
    await page.locator("#headerActionShortcutSave").click();
    await expect(page.locator(FLYOUT)).toBeHidden();

    expect(await resolvedShortcut(page, "clear")).toBe("Ctrl+Alt+Shift+M");
    expect(await resolvedShortcut(page, "minimize")).toBe("");
  });

  test("clear drops the binding and reset restores the default", async ({ page }) => {
    await reset(page, 1);
    await openShortcutFlyout(page, "minimize");
    await page.locator("#headerActionShortcutClear").click();
    await expect(page.locator("#headerActionShortcutBinding")).toHaveText("Not set");
    await page.locator("#headerActionShortcutSave").click();
    await expect(page.locator(FLYOUT)).toBeHidden();
    expect(await resolvedShortcut(page, "minimize")).toBe("");

    await openShortcutFlyout(page, "minimize");
    await page.locator("#headerActionShortcutReset").click();
    await expect(page.locator(FLYOUT)).toBeHidden();
    expect(await resolvedShortcut(page, "minimize")).toBe("Ctrl+Alt+Shift+M");
  });

  test("the flyout closes when the terminal it belongs to goes away", async ({ page }) => {
    await reset(page, 1);
    await openShortcutFlyout(page, "minimize");
    await page.evaluate(() => closeAllTerminals());
    await expect(page.locator(".terminal-pane")).toHaveCount(0);
    await expect(page.locator(FLYOUT)).toBeHidden();
  });

  test("the resolved binding shows up on the button and in the catalog", async ({ page }) => {
    await reset(page, 1);
    await openShortcutFlyout(page, "minimize");
    await captureCombination(page, "Control+Alt+Shift+F7");
    await page.locator("#headerActionShortcutSave").click();
    await expect(page.locator(FLYOUT)).toBeHidden();

    await expect(page.locator('.terminal-pane .pane-actions button[data-action="minimize"]').first())
      .toHaveAttribute("title", /Ctrl\+Alt\+Shift\+F7/);

    const catalog = await page.evaluate(() => shortcutCatalogText());
    expect(catalog).toContain("Terminal header actions");
    expect(catalog).toContain("Minimize: Ctrl+Alt+Shift+F7");
  });
});
