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

// A shortcut is dispatched from the capture-phase window handler, ahead of
// xterm, so any binding a keyboard also produces as a character would swallow
// that character everywhere the user types. Shift is what makes the capital and
// the symbol, so a Shift-only chord over a character key is that character.
test.describe("Shortcut bindings that would collide with typing", () => {
  test.describe.configure({ mode: "serial" });

  let context;
  let page;
  let id;

  const accepts = (binding) => page.evaluate((value) => ({
    global: Boolean(normalizeGlobalShortcutBinding(value)),
    menu: Boolean(normalizeContextShortcutBinding(value))
  }), binding);

  // What the pane actually received, ignoring xterm's focus reports.
  const typedInTerminal = async (press) => {
    await page.evaluate(() => { window.__frames = []; });
    await page.locator(`.terminal-pane[data-id="${id}"] .xterm-helper-textarea`).focus();
    await press();
    await expect.poll(() => page.evaluate(
      () => window.__frames.filter((data) => data !== "\u001b[I" && data !== "\u001b[O")
    ), { timeout: 5000 }).not.toEqual([]);
    return page.evaluate(() => window.__frames.filter((data) => data !== "\u001b[I" && data !== "\u001b[O"));
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
    await expect.poll(async () => {
      await page.evaluate(() => closeAllTerminals());
      return page.locator(".terminal-pane").count();
    }, { timeout: 30000 }).toBe(0);
    id = await page.evaluate(() => addTerminal({ reveal: true, runStartup: false }).id);
    await expect.poll(() => page.evaluate((terminalId) => state.terminals.get(terminalId)?.status, id),
      { timeout: 30000 }).toBe("live");
    // Wrapped once: re-wrapping per call stacks the recorders and every frame is
    // then counted once per layer.
    await page.evaluate(() => {
      window.__frames = [];
      const original = state.socket.send.bind(state.socket);
      state.socket.send = (data) => {
        const frame = JSON.parse(data);
        if (frame.type === "input") window.__frames.push(frame.data);
        return original(data);
      };
    });
  });

  test.afterAll(async () => {
    await page.evaluate(() => closeAllTerminals());
    await stopRendererCoverage(page, "shortcut-binding-rules");
    await context.close();
  });

  test("refuses a chord a keyboard would type as a character", async () => {
    expect(await accepts({ shift: true, key: "a" })).toEqual({ global: false, menu: false });
    expect(await accepts({ shift: true, key: "1" })).toEqual({ global: false, menu: false });
    expect(await accepts({ shift: true, key: "space" })).toEqual({ global: false, menu: false });
    expect(await accepts({ key: "a" })).toEqual({ global: false, menu: false });
  });

  test("keeps Shift over keys that type nothing", async () => {
    for (const key of ["tab", "enter", "arrowup", "delete", "home", "f5"]) {
      expect(await accepts({ shift: true, key })).toEqual({ global: true, menu: true });
    }
    expect(await accepts({ ctrl: true, shift: true, key: "a" })).toEqual({ global: true, menu: true });
    expect(await accepts({ alt: true, key: "1" })).toEqual({ global: true, menu: true });
  });

  test("leaves Shift+letter to the terminal instead of binding it", async () => {
    const bindings = await page.evaluate(() => {
      assignGlobalShortcutBinding("terminal.clear", 0, { shift: true, key: "a" });
      return globalShortcutBindings("terminal.clear").map(formatGlobalShortcut);
    });
    expect(bindings).toEqual(["Ctrl+Shift+L"]);
    expect(await typedInTerminal(() => page.keyboard.press("Shift+KeyA"))).toEqual(["A"]);
  });

  test("leaves Shift+digit to the terminal instead of binding it in the menu", async () => {
    const stored = await page.evaluate(() => ({
      result: assignContextMenuShortcut("terminal.change-cwd", { shift: true, key: "1" }),
      held: Boolean(contextMenuShortcuts.get("terminal.change-cwd"))
    }));
    expect(stored).toEqual({ result: null, held: false });
    expect(await typedInTerminal(() => page.keyboard.press("Shift+Digit1"))).toEqual(["!"]);
  });

  // A digit on its own stays available as a menu accelerator, so it has to keep
  // typing normally while the menu is closed.
  test("keeps a bare digit as a menu accelerator that still types in the terminal", async () => {
    expect(await accepts({ key: "1" })).toEqual({ global: false, menu: true });
    await page.evaluate(() => assignContextMenuShortcut("terminal.change-cwd", { key: "1" }));

    expect(await typedInTerminal(() => page.keyboard.press("Digit1"))).toEqual(["1"]);
    expect(await page.evaluate(() => !document.querySelector("#cwdChangeOverlay").hidden)).toBe(false);

    // The menu says which of the two kinds of binding a row has.
    await page.locator(`.terminal-pane[data-id="${id}"] .terminal-screen`).click({ button: "right" });
    await expect(page.locator("#contextMenu")).toBeVisible();
    const keycap = page.locator('#contextMenu .ctx-item[data-shortcut-id="terminal.change-cwd"] .ctx-shortcut-key');
    await expect(keycap).toHaveText("1");
    await expect(keycap).toHaveAttribute("title", "Press 1 while this menu is open");
    await page.keyboard.press("Escape");
    await page.evaluate(() => clearContextMenuShortcut("terminal.change-cwd"));
  });

  test("tells the user why a typing key was rejected", async () => {
    await page.locator("#helpToggle").click();
    await expect(page.locator("#shortcutsOverlay")).toBeVisible();
    await page.locator('[data-shortcut-action="terminal.new"]').first().locator(".shortcut-binding").first().click();
    await expect(page.locator("#shortcutsStatus")).toContainText("Press the new shortcut");

    await page.keyboard.press("Shift+KeyA");
    await expect(page.locator("#shortcutsStatus"))
      .toHaveText("Use Ctrl, Alt, or Meta with another key, or a function key. Shift alone still types a character.");

    await page.keyboard.press("Escape");
    await page.locator("#shortcutsClose").click();
    await expect(page.locator("#shortcutsOverlay")).toBeHidden();
    expect(await page.evaluate(() => globalShortcutBindings("terminal.new").map(formatGlobalShortcut)))
      .toEqual(["Ctrl+N", "Ctrl+Shift+T"]);
  });
});
