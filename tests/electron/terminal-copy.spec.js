/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron, expect, test } = require("@playwright/test");

test("copies a physical TUI selection through Electron's native clipboard", async () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-electron-copy-"));
  let electronApp;
  let ownsClipboard = false;
  const marker = `electron-tui-copy-${process.pid}-${Date.now()}`;

  try {
    electronApp = await electron.launch({
      // Chromium switches must precede Electron's application path.
      args: [`--user-data-dir=${userDataDir}`, repoRoot],
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: "3297",
        MULTITERM_UPDATE_REPO: "invalid/disabled"
      }
    });
    await electronApp.evaluate(({ clipboard }) => {
      globalThis.__multitermClipboardBeforeTest = {
        bookmark: clipboard.readBookmark(),
        html: clipboard.readHTML(),
        image: clipboard.readImage(),
        rtf: clipboard.readRTF(),
        text: clipboard.readText()
      };
    });
    const page = await electronApp.firstWindow();
    await expect(page).toHaveTitle("MultiTerm Workbench");
    await page.waitForFunction(() => document.querySelector("#statusConn")?.textContent === "Connected");
    await page.evaluate(() => {
      state.settings.rightClickAction = "menu";
      state.settings.copyOnSelect = false;
    });

    const geometry = await page.evaluate(async (text) => {
      const terminal = state.terminals.get(state.activeId);
      await new Promise((resolve) => terminal.term.write(`\r\n${text}\x1b[?1000h\x1b[?1006h`, resolve));
      const buffer = terminal.term.buffer.active;
      const rect = terminal.term.element.getBoundingClientRect();
      const dimensions = terminal.term._core._renderService.dimensions.css;
      const cellWidth = dimensions.canvas.width / terminal.term.cols;
      const cellHeight = dimensions.canvas.height / terminal.term.rows;
      return {
        startX: rect.left + cellWidth * 0.5,
        endX: rect.left + cellWidth * (text.length + 0.5),
        y: rect.top + cellHeight * (buffer.cursorY + 0.5)
      };
    }, marker);

    await page.keyboard.down("Shift");
    await page.mouse.move(geometry.startX, geometry.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(geometry.endX, geometry.y, { steps: 8 });
    await page.mouse.up({ button: "left" });
    await page.keyboard.up("Shift");

    await expect.poll(() =>
      page.evaluate(() => state.terminals.get(state.activeId).term.getSelection())
    ).toBe(marker);

    await page.mouse.click(geometry.endX, geometry.y, { button: "right" });
    const copy = page.locator("#contextMenu .ctx-item").filter({ hasText: /^CopyCtrl\+Shift\+C/ });
    await expect(copy).toBeVisible();
    await expect(copy).not.toHaveAttribute("aria-disabled", "true");
    await copy.click();

    ownsClipboard = true;
    await expect.poll(() =>
      electronApp.evaluate(({ clipboard }) => clipboard.readText())
    ).toBe(marker);

    await electronApp.evaluate(({ clipboard }) => clipboard.writeText("reset"));
    await page.keyboard.press("Control+Shift+C");
    await expect.poll(() =>
      electronApp.evaluate(({ clipboard }) => clipboard.readText())
    ).toBe(marker);
  } finally {
    try {
      if (electronApp && ownsClipboard) {
        await electronApp.evaluate(({ clipboard }, testMarker) => {
          const original = globalThis.__multitermClipboardBeforeTest;
          if (original && clipboard.readText() === testMarker) {
            clipboard.write(original);
          }
          delete globalThis.__multitermClipboardBeforeTest;
        }, marker);
      }
    } finally {
      try {
        if (electronApp) await electronApp.close();
      } finally {
        fs.rmSync(userDataDir, { force: true, recursive: true });
      }
    }
  }
});
