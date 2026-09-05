/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

// Every pane action can be moved between the header and the More menu, so each
// one has to be a registered header action. The notifications bell was wired up
// by hand instead, which left it stuck on the bar with no drag handler.
test.describe("Pane header action placement", () => {
  test.describe.configure({ mode: "serial" });

  let context;
  let page;
  let id;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      viewport: { width: 1400, height: 900 }
    });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(async () => {
      await page.evaluate(() => closeAllTerminals());
      return page.locator(".terminal-pane").count();
    }, { timeout: 30000 }).toBe(0);
    await page.evaluate(() => {
      state.settings.layout = "vertical";
      state.settings.columnCount = 1;
      state.settings.workspaceZoom = 100;
      state.settings.headerActionsRevealOnHover = false;
      state.settings.headerActionDragScope = "terminal";
      state.settings.headerActionsInMenu = [];
      state.zoomedId = null;
      applySettings();
    });
    id = await page.evaluate(() => addTerminal({ reveal: true, runStartup: false }).id);
    await expect.poll(() => page.evaluate((terminalId) => state.terminals.get(terminalId)?.status, id),
      { timeout: 30000 }).toBe("live");
  });

  test.afterAll(async () => {
    await page.evaluate(() => closeAllTerminals());
    await stopRendererCoverage(page, "pane-header-actions");
    await context.close();
  });

  test("registers the notifications bell like every other header action", async () => {
    const registered = await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      return {
        known: HEADER_ACTION_ID_SET.has("notifications"),
        label: HEADER_ACTIONS.notifications.label,
        shortcut: formatHeaderActionShortcut("notifications", terminal)
      };
    }, id);
    expect(registered).toEqual({
      known: true,
      label: "Notifications\u2026",
      shortcut: "Ctrl+Alt+Shift+I"
    });
  });

  test("drags the notifications bell into the overflow menu and back", async () => {
    const pane = page.locator(`.terminal-pane[data-id="${id}"]`);
    const bell = pane.locator('[data-action="notifications"]');
    await expect(bell).toHaveAttribute("data-header-placement", "header");
    await expect(bell).toHaveAttribute("draggable", "true");

    await bell.dragTo(pane.locator('[data-action="more"]'));
    await expect(bell).toHaveAttribute("data-header-placement", "menu");

    const menu = page.locator("#contextMenu");
    await pane.locator('[data-action="more"]').click();
    await expect(menu).toBeVisible();
    const row = menu.locator('.ctx-item[data-header-action="notifications"]');
    await expect(row).toHaveText("Notifications\u2026Ctrl+Alt+Shift+I");
    await row.click();
    await expect(page.locator("#terminalNotificationFlyout")).toBeVisible();
    await page.keyboard.press("Escape");

    // Dragging the menu row back onto the bar is the return trip.
    await pane.locator('[data-action="more"]').click();
    await expect(menu).toBeVisible();
    await menu.locator('.ctx-item[data-header-action="notifications"]')
      .dragTo(pane.locator(".pane-actions"));
    await expect(bell).toHaveAttribute("data-header-placement", "header");
  });

  test("keeps a muted bell on the bar while hover reveal hides the rest", async () => {
    const pane = page.locator(`.terminal-pane[data-id="${id}"]`);
    const bell = pane.locator('[data-action="notifications"]');
    await expect(bell).not.toHaveClass(/has-badge/);

    await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      terminal.notificationOverrides = { notifyActivity: false };
      updateTerminalNotificationButton(terminal);
    }, id);
    // has-badge is the existing escape from the reveal-on-hover rule, so an
    // overridden bell stays readable when the row is otherwise hidden.
    await expect(bell).toHaveClass(/has-badge/);

    await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      terminal.notificationOverrides = {};
      updateTerminalNotificationButton(terminal);
    }, id);
    await expect(bell).not.toHaveClass(/has-badge/);
  });

  // A keyboard run has no button to hang the flyout off, so the action has to
  // find whichever control is showing it right now.
  test("anchors the bell flyout on its own button, then on More once it moves", async () => {
    const pane = page.locator(`.terminal-pane[data-id="${id}"]`);
    const flyout = page.locator("#terminalNotificationFlyout");

    const onBar = await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      return headerActionAnchor(terminal, "notifications")?.dataset.action;
    }, id);
    expect(onBar).toBe("notifications");

    await page.evaluate((terminalId) => {
      runHeaderAction(state.terminals.get(terminalId), "notifications");
    }, id);
    await expect(flyout).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(flyout).toBeHidden();

    await pane.locator('[data-action="notifications"]').dragTo(pane.locator('[data-action="more"]'));
    await expect(pane.locator('[data-action="notifications"]')).toHaveAttribute("data-header-placement", "menu");
    const inMenu = await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      return headerActionAnchor(terminal, "notifications")?.dataset.action;
    }, id);
    expect(inMenu).toBe("more");

    await page.evaluate((terminalId) => {
      runHeaderAction(state.terminals.get(terminalId), "notifications");
    }, id);
    await expect(flyout).toBeVisible();
    await page.keyboard.press("Escape");

    await pane.locator('[data-action="more"]').click();
    await page.locator("#contextMenu .ctx-item[data-header-action=\"notifications\"]")
      .dragTo(pane.locator(".pane-actions"));
    await expect(pane.locator('[data-action="notifications"]')).toHaveAttribute("data-header-placement", "header");
  });
});
