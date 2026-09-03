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

test.describe.configure({ mode: "serial" });

// Copy all output was reachable only while the context menu was open, so a
// binding assigned to it did nothing from the terminal and the chord fell
// through to the shell instead.
test.describe("Copy all output", () => {
  let context;
  let page;

  // A live PowerShell pane repaints over a synthetic write, so the pane is first
  // allowed to go quiet and the marker is then rewritten until it sticks.
  const seed = async (marker) => {
    let previous = -1;
    await expect.poll(async () => {
      const current = await page.evaluate(() => [...state.terminals.values()][0]?.outputRevision ?? 0);
      const settled = current === previous;
      previous = current;
      return settled;
    }, { timeout: 20000, intervals: [250] }).toBe(true);

    await expect.poll(async () => page.evaluate(async (text) => {
      const terminal = [...state.terminals.values()][0];
      await new Promise((resolve) => terminal.term.write(`\u001b[2J\u001b[H${text}\r\n`, resolve));
      const buffer = terminal.term.buffer.active;
      const lines = [];
      for (let row = 0; row < buffer.length; row += 1) lines.push(buffer.getLine(row)?.translateToString(true) ?? "");
      return lines.join("\n").includes(text);
    }, marker), { timeout: 15000 }).toBe(true);
  };

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      permissions: ["clipboard-read", "clipboard-write"]
    });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    // The welcome terminal can arrive after a single close, so poll to zero.
    await expect.poll(async () => {
      await page.evaluate(() => closeAllTerminals());
      return page.locator(".terminal-pane").count();
    }, { timeout: 30000 }).toBe(0);
    // Shortcut stores and the active pane are shared across spec files, so this
    // establishes them rather than inheriting whatever ran first.
    await page.evaluate(() => {
      contextMenuShortcuts.clear();
      saveContextMenuShortcuts();
      state.settings.keyboardShortcuts = {};
      saveSettings();
      refreshGlobalShortcutHints();
      setActiveTerminal(addTerminal({ runStartup: false }).id);
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect(page.locator(".pane-status").first()).toContainText(/pid \d+/i);
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      // The shortcut stores are shared across specs, so hand them back unchanged.
      contextMenuShortcuts.clear();
      saveContextMenuShortcuts();
      state.settings.keyboardShortcuts = {};
      saveSettings();
      refreshGlobalShortcutHints();
      closeAllTerminals();
    });
    await stopRendererCoverage(page, "copy-all-output");
    await context.close();
  });

  test("is a bindable terminal action rather than a menu-only accelerator", async () => {
    const action = await page.evaluate(() => {
      const candidate = GLOBAL_SHORTCUT_ACTIONS.find((entry) => entry.id === "terminal.copy-all");
      return candidate ? { section: candidate.section, defaults: candidate.defaults } : null;
    });
    expect(action).not.toBeNull();
    expect(action.section).toBe("Terminal");
    // Nothing is claimed out of the box; the user chooses the chord.
    expect(action.defaults).toEqual([]);
  });

  test("selects and copies the whole buffer from its keyboard binding", async () => {
    await seed("ALPHA-COPY-ALL-MARKER");
    await page.evaluate(() => assignGlobalShortcutBinding("terminal.copy-all", 0, { alt: true, key: "u" }));
    await page.locator(".xterm-helper-textarea").first().focus();
    await page.evaluate(() => {
      window.__copyAllFrames = [];
      window.__copyAllSend = state.socket.send;
      state.socket.send = (payload) => window.__copyAllFrames.push(JSON.parse(payload));
    });

    await page.keyboard.press("Alt+u");

    const result = await expect.poll(async () => page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      return terminal.term.getSelection().includes("ALPHA-COPY-ALL-MARKER");
    }), { timeout: 5000 }).toBe(true);
    expect(result).toBeUndefined();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("ALPHA-COPY-ALL-MARKER");

    // The chord used to reach the shell and type a bare "u".
    const leaked = await page.evaluate(() => {
      const frames = window.__copyAllFrames;
      state.socket.send = window.__copyAllSend;
      return frames.filter((frame) => frame.type === "input" && /u/i.test(String(frame.data ?? "")));
    });
    expect(leaked).toEqual([]);
  });

  test("leaves the highlight in place from the context menu row", async () => {
    await seed("BRAVO-COPY-ALL-MARKER");
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      showContextMenu(30, 30, terminal, "");
    });
    await page.locator("#contextMenu .ctx-item", { hasText: "Copy all output" }).first().click();

    await expect.poll(async () => page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      return terminal.term.getSelection().includes("BRAVO-COPY-ALL-MARKER");
    }), { timeout: 5000 }).toBe(true);
    expect(await page.evaluate(() => navigator.clipboard.readText()))
      .toContain("BRAVO-COPY-ALL-MARKER");
  });

  test("promotes a shortcut that was stored against the old menu-only action", async () => {
    const promoted = await page.evaluate(() => {
      removeGlobalShortcutBinding("terminal.copy-all", 0);
      assignContextMenuShortcut("terminal.copy-all", { alt: true, ctrl: false, key: "u", meta: false, shift: false });
      promoteContextShortcutsToGlobal();
      return {
        global: globalShortcutBindings("terminal.copy-all").map(formatGlobalShortcut),
        menu: contextMenuShortcuts.has("terminal.copy-all")
      };
    });
    expect(promoted.global).toEqual(["Alt+U"]);
    expect(promoted.menu).toBe(false);
  });
});
