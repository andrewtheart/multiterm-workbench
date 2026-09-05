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

// Closing a terminal ends a live process, and there are several one-click routes
// to it, so each of them asks first unless the user has turned that off.
test.describe("Terminal close confirmation", () => {
  test.describe.configure({ mode: "serial" });

  let context;
  let page;

  const overlay = () => page.locator("#terminalCloseOverlay");
  const panes = () => page.locator(".terminal-pane");

  const addPane = async () => {
    const id = await page.evaluate(() => addTerminal({ reveal: true, runStartup: false }).id);
    await expect.poll(() => page.evaluate((terminalId) => state.terminals.get(terminalId)?.status, id),
      { timeout: 30000 }).toBe("live");
    return id;
  };

  const resetToOnePane = async () => {
    await page.evaluate(() => {
      state.settings.confirmTerminalClose = true;
      saveSettings();
      closeAllTerminals();
    });
    await expect(panes()).toHaveCount(0);
    return addPane();
  };

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      viewport: { width: 1400, height: 900 }
    });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      state.settings.layout = "vertical";
      state.settings.headerActionsRevealOnHover = false;
      applySettings();
    });
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      state.settings.confirmTerminalClose = defaultSettings.confirmTerminalClose;
      saveSettings();
      closeAllTerminals();
    });
    await stopRendererCoverage(page, "terminal-close-confirmation");
    await context.close();
  });

  test("asks before closing and keeps the terminal when cancelled", async () => {
    const id = await resetToOnePane();
    await page.locator(`.terminal-pane[data-id="${id}"] [data-action="close"]`).click();

    await expect(overlay()).toBeVisible();
    await expect(page.locator("#terminalCloseText")).toContainText("is still running");
    await expect(page.locator("#terminalCloseRemember")).not.toBeChecked();

    await page.locator("#terminalCloseCancel").click();
    await expect(overlay()).toBeHidden();
    await expect(panes()).toHaveCount(1);
    expect(await page.evaluate((terminalId) => state.terminals.has(terminalId), id)).toBe(true);
  });

  test("closes the terminal once confirmed", async () => {
    const id = await resetToOnePane();
    await page.locator(`.terminal-pane[data-id="${id}"] [data-action="close"]`).click();
    await expect(overlay()).toBeVisible();

    await page.locator("#terminalCloseAccept").click();
    await expect(overlay()).toBeHidden();
    await expect(panes()).toHaveCount(0);
  });

  // The header button is only one of the ways in; a shortcut or a menu row that
  // skipped the prompt would make the setting meaningless.
  test("asks from the keyboard shortcut too", async () => {
    const id = await resetToOnePane();
    await page.locator(`.terminal-pane[data-id="${id}"] .xterm-helper-textarea`).focus();
    await page.keyboard.press("Control+Shift+KeyW");

    await expect(overlay()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(overlay()).toBeHidden();
    await expect(panes()).toHaveCount(1);
  });

  // Dismissing the dialog left focus on BODY, so the terminal it had just spared
  // silently swallowed everything typed next.
  test("gives keyboard focus back to the terminal when cancelled", async () => {
    const id = await resetToOnePane();
    const pane = page.locator(`.terminal-pane[data-id="${id}"]`);
    await pane.locator(".xterm-helper-textarea").focus();
    await page.evaluate(() => {
      window.__typed = [];
      const send = state.socket.send.bind(state.socket);
      state.socket.send = (raw) => {
        const frame = JSON.parse(raw);
        if (frame.type === "input" && !/^\u001b\[[IO]$/.test(frame.data)) window.__typed.push(frame.data);
        return send(raw);
      };
    });

    await page.keyboard.press("Control+Shift+KeyW");
    await expect(overlay()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(overlay()).toBeHidden();

    expect(await page.evaluate(() => document.activeElement?.className), "focus is back in the pane")
      .toContain("xterm-helper-textarea");
    await page.keyboard.type("q");
    await expect.poll(() => page.evaluate(() => window.__typed)).toContain("q");
    await expect(panes()).toHaveCount(1);
  });

  test("asks from the terminal right-click menu too", async () => {
    const id = await resetToOnePane();
    await page.locator(`.terminal-pane[data-id="${id}"] .terminal-screen`).click({ button: "right" });
    await expect(page.locator("#contextMenu")).toBeVisible();
    await page.locator('#contextMenu .ctx-item[data-shortcut-id="terminal.close"]').first().click();

    await expect(overlay()).toBeVisible();
    await page.locator("#terminalCloseCancel").click();
    await expect(panes()).toHaveCount(1);
  });

  test("asks from the command palette and the minimized chip menu too", async () => {
    await resetToOnePane();
    await page.evaluate(() => getCommands().find((entry) => entry.label === "Close active terminal").run());
    await expect(overlay()).toBeVisible();
    await page.locator("#terminalCloseCancel").click();
    await expect(panes()).toHaveCount(1);

    const id = await page.evaluate(() => [...state.terminals.keys()][0]);
    await page.evaluate((terminalId) => {
      minimizeTerminal(terminalId);
      const terminal = state.terminals.get(terminalId);
      showMinChipMenu(10, 10, terminal, terminal.minChip);
    }, id);
    await expect(page.locator("#contextMenu")).toBeVisible();
    await page.locator("#contextMenu .ctx-item", { hasText: "Close" }).first().click();
    await expect(overlay()).toBeVisible();
    await page.locator("#terminalCloseCancel").click();
    expect(await page.evaluate((terminalId) => state.terminals.has(terminalId), id)).toBe(true);
  });

  test("stops asking when told not to, and says so in Settings", async () => {
    const id = await resetToOnePane();
    await page.locator(`.terminal-pane[data-id="${id}"] [data-action="close"]`).click();
    await expect(overlay()).toBeVisible();
    await page.locator("#terminalCloseRemember").check();
    await page.locator("#terminalCloseAccept").click();
    await expect(panes()).toHaveCount(0);

    expect(await page.evaluate(() => state.settings.confirmTerminalClose)).toBe(false);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings")).confirmTerminalClose)).toBe(false);
    await expect(page.locator("#confirmTerminalClose")).not.toBeChecked();

    const next = await addPane();
    await page.locator(`.terminal-pane[data-id="${next}"] [data-action="close"]`).click();
    await expect(panes()).toHaveCount(0);
    await expect(overlay()).toBeHidden();
  });

  test("asks again once the setting is switched back on", async () => {
    await page.evaluate(() => {
      const control = document.querySelector("#confirmTerminalClose");
      control.checked = true;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(await page.evaluate(() => state.settings.confirmTerminalClose)).toBe(true);

    const id = await addPane();
    await page.locator(`.terminal-pane[data-id="${id}"] [data-action="close"]`).click();
    await expect(overlay()).toBeVisible();
    await page.locator("#terminalCloseCancel").click();
    await expect(panes()).toHaveCount(1);
  });

  test("never asks when the app closes a terminal on the user's behalf", async () => {
    const id = await resetToOnePane();

    await page.evaluate((terminalId) => restartSession(terminalId), id);
    await expect(overlay()).toBeHidden();
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].some((terminal) => terminal.status === "live")),
      { timeout: 30000 }).toBe(true);

    await page.evaluate(() => closeAllTerminals());
    await expect(overlay()).toBeHidden();
    await expect(panes()).toHaveCount(0);
  });

  // There is no session left to protect, so the prompt would be pure friction.
  test("closes an already-exited terminal without asking", async () => {
    const id = await resetToOnePane();
    await page.evaluate((terminalId) => { state.terminals.get(terminalId).status = "exited"; }, id);

    await page.locator(`.terminal-pane[data-id="${id}"] [data-action="close"]`).click();
    await expect(overlay()).toBeHidden();
    await expect(panes()).toHaveCount(0);
  });

  test("names an untitled terminal generically and dismisses on a backdrop press", async () => {
    const id = await resetToOnePane();
    await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      terminal.titleInput.value = "";
      terminal.titleOriginal = "";
      terminal.pid = 0;
    }, id);

    await page.locator(`.terminal-pane[data-id="${id}"] [data-action="close"]`).click();
    await expect(overlay()).toBeVisible();
    await expect(page.locator("#terminalCloseText")).toHaveText(/“This terminal” is still running\./);
    // No PID means the process-number wording has nothing to report.
    await expect(page.locator("#terminalCloseText")).not.toContainText("process");

    // Pressing the backdrop rather than a button is a cancel, not a close.
    const box = await overlay().boundingBox();
    await page.mouse.click(box.x + 8, box.y + 8);
    await expect(overlay()).toBeHidden();
    await expect(panes()).toHaveCount(1);
    expect(await page.evaluate(() => state.pendingTerminalClose)).toBeNull();
  });

  // Accept can be reached by keyboard after the dialog has already settled, and
  // closing whatever happens to be active then would be a destructive surprise.
  test("does nothing when accept runs with no terminal awaiting confirmation", async () => {
    await resetToOnePane();
    expect(await page.evaluate(() => state.pendingTerminalClose)).toBeNull();

    await page.evaluate(() => acceptTerminalClose());
    await expect(panes()).toHaveCount(1);
    await expect(overlay()).toBeHidden();
  });
});
