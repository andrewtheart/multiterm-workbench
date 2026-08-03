/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const { _electron: electron, expect, test } = require("@playwright/test");

test("toggles native fullscreen focus mode and restores the previous chrome", async () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-electron-fullscreen-"));
  let electronApp;

  try {
    electronApp = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, repoRoot],
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: "3296",
        MULTITERM_UPDATE_REPO: "invalid/disabled"
      }
    });
    const page = await electronApp.firstWindow();
    await expect(page).toHaveTitle("MultiTerm Workbench");
    await page.waitForFunction(() => document.querySelector("#statusConn")?.textContent === "Connected");

    await page.keyboard.press("F11");
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen()
    )).toBe(true);
    await expect(page.locator("body")).toHaveClass(/fullscreen-focus/);
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".control-panel")).toBeHidden();
    await expect(page.locator("#pager")).toBeHidden();
    await expect(page.locator("#fullscreenAddTerminal")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen()
    )).toBe(false);
    await expect(page.locator("body")).not.toHaveClass(/fullscreen-focus/);
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator(".control-panel")).toBeVisible();
    await expect(page.locator("#pager")).toBeVisible();
    await expect(page.locator("#fullscreenAddTerminal")).toBeHidden();
  } finally {
    try {
      if (electronApp) await electronApp.close();
    } finally {
      fs.rmSync(userDataDir, { force: true, recursive: true });
    }
  }
});

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
        imagePng: clipboard.readImage().toPNG().toString("base64"),
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

    let geometry = null;
    await expect.poll(async () => {
      geometry = await page.evaluate(async (text) => {
        const terminal = state.terminals.get(state.activeId);
        const term = terminal.term;
        await new Promise((resolve) => term.write(`\x1b[?1003h\x1b[?1006h\r\n${text}\r\n`, resolve));
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        const buffer = term.buffer.active;
        for (let i = buffer.length - 1; i >= 0; i -= 1) {
          const row = i - buffer.viewportY;
          if (row < 0 || row >= term.rows) continue;
          if (!(buffer.getLine(i)?.translateToString(true) || "").includes(text)) continue;
          const rect = term.element.querySelector(".xterm-screen").getBoundingClientRect();
          const cellWidth = rect.width / term.cols;
          const cellHeight = rect.height / term.rows;
          return {
            startX: rect.left + cellWidth * 0.5,
            endX: rect.left + cellWidth * (text.length + 0.5),
            y: rect.top + cellHeight * (row + 0.5)
          };
        }
        return null;
      }, marker);
      return geometry;
    }).not.toBeNull();

    await page.mouse.move(geometry.startX, geometry.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(geometry.endX, geometry.y, { steps: 8 });
    await page.mouse.up({ button: "left" });

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
        await electronApp.evaluate(({ clipboard, nativeImage }, testMarker) => {
          const original = globalThis.__multitermClipboardBeforeTest;
          if (original && clipboard.readText() === testMarker) {
            clipboard.write({
              bookmark: original.bookmark,
              html: original.html,
              image: nativeImage.createFromBuffer(Buffer.from(original.imagePng, "base64")),
              rtf: original.rtf,
              text: original.text
            });
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

test("pastes a copied Explorer file into a bracketed-paste TUI prompt", async () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-electron-file-paste-"));
  const copiedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm copied file "));
  const copiedFile = path.join(copiedDirectory, "copilot context.txt");
  let electronApp;
  let ownsClipboard = false;

  try {
    fs.writeFileSync(copiedFile, "copilot file paste regression");
    electronApp = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, repoRoot],
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: "3298",
        MULTITERM_UPDATE_REPO: "invalid/disabled"
      }
    });

    await electronApp.evaluate(({ clipboard }) => {
      globalThis.__multitermClipboardBeforeFileTest = {
        bookmark: clipboard.readBookmark(),
        html: clipboard.readHTML(),
        imagePng: clipboard.readImage().toPNG().toString("base64"),
        rtf: clipboard.readRTF(),
        text: clipboard.readText()
      };
    });
    const page = await electronApp.firstWindow();
    await expect(page).toHaveTitle("MultiTerm Workbench");
    await page.waitForFunction(() => document.querySelector("#statusConn")?.textContent === "Connected");
    childProcess.execFileSync("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-STA",
      "-NonInteractive",
      "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; $files = New-Object System.Collections.Specialized.StringCollection; [void]$files.Add($env:MULTITERM_TEST_CLIPBOARD_FILE); [Windows.Forms.Clipboard]::SetFileDropList($files)"
    ], {
      env: { ...process.env, MULTITERM_TEST_CLIPBOARD_FILE: copiedFile },
      windowsHide: true
    });
    ownsClipboard = true;
    await expect(page.evaluate(() => window.multiterm.readClipboardText()))
      .resolves.toBe(`"${copiedFile}"`);

    const messages = await page.evaluate(async () => {
      const terminal = state.terminals.get(state.activeId);
      await new Promise((resolve) => terminal.term.write("\x1b[?2004h", resolve));
      const originalSocket = state.socket;
      const originalReady = state.socketReady;
      const sent = [];
      state.socket = {
        readyState: WebSocket.OPEN,
        send(payload) { sent.push(JSON.parse(payload)); }
      };
      state.socketReady = true;
      state.settings.rightClickAction = "menu";

      terminal.screen.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        clientX: 500,
        clientY: 300
      }));
      const paste = [...elements.contextMenu.querySelectorAll(".ctx-item")]
        .find((item) => item.textContent.startsWith("Paste"));
      paste.click();
      for (let i = 0; i < 100 && sent.length === 0; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 10));
      }

      state.socket = originalSocket;
      state.socketReady = originalReady;
      return sent;
    });

    expect(messages).toContainEqual({
      type: "input",
      id: expect.any(String),
      data: `\x1b[200~"${copiedFile}"\x1b[201~`
    });
  } finally {
    try {
      if (electronApp && ownsClipboard) {
        await electronApp.evaluate(({ clipboard, nativeImage }) => {
          const original = globalThis.__multitermClipboardBeforeFileTest;
          if (original) {
            clipboard.write({
              bookmark: original.bookmark,
              html: original.html,
              image: nativeImage.createFromBuffer(Buffer.from(original.imagePng, "base64")),
              rtf: original.rtf,
              text: original.text
            });
          }
          delete globalThis.__multitermClipboardBeforeFileTest;
        });
      }
    } finally {
      try {
        if (electronApp) await electronApp.close();
      } finally {
        fs.rmSync(userDataDir, { force: true, recursive: true });
        fs.rmSync(copiedDirectory, { force: true, recursive: true });
      }
    }
  }
});

test("pastes a copied Snipping Tool image into a bracketed-paste TUI prompt", async () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-electron-image-paste-"));
  let electronApp;
  let ownsClipboard = false;

  try {
    electronApp = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, repoRoot],
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: "3299",
        MULTITERM_UPDATE_REPO: "invalid/disabled"
      }
    });
    await electronApp.evaluate(({ clipboard, nativeImage }) => {
      globalThis.__multitermClipboardBeforeImageTest = {
        bookmark: clipboard.readBookmark(),
        html: clipboard.readHTML(),
        imagePng: clipboard.readImage().toPNG().toString("base64"),
        rtf: clipboard.readRTF(),
        text: clipboard.readText()
      };
      const bitmap = Buffer.from([0, 0, 255, 255]);
      clipboard.writeImage(nativeImage.createFromBitmap(bitmap, {
        width: 1,
        height: 1,
        scaleFactor: 1
      }));
    });
    ownsClipboard = true;

    const page = await electronApp.firstWindow();
    await expect(page).toHaveTitle("MultiTerm Workbench");
    await page.waitForFunction(() => document.querySelector("#statusConn")?.textContent === "Connected");

    const pastedPath = await page.evaluate(() => window.multiterm.readClipboardText());
    const imagePath = pastedPath.startsWith('"') ? pastedPath.slice(1, -1) : pastedPath;
    expect(path.extname(imagePath)).toBe(".png");
    expect(fs.readFileSync(imagePath).subarray(0, 8))
      .toEqual(Buffer.from("89504e470d0a1a0a", "hex"));

    const messages = await page.evaluate(async () => {
      const terminal = state.terminals.get(state.activeId);
      await new Promise((resolve) => terminal.term.write("\x1b[?2004h", resolve));
      const originalSocket = state.socket;
      const originalReady = state.socketReady;
      const sent = [];
      state.socket = {
        readyState: WebSocket.OPEN,
        send(payload) { sent.push(JSON.parse(payload)); }
      };
      state.socketReady = true;

      await pasteIntoTerminal(terminal.id);

      state.socket = originalSocket;
      state.socketReady = originalReady;
      return sent;
    });

    expect(messages).toContainEqual({
      type: "input",
      id: expect.any(String),
      data: `\x1b[200~${pastedPath}\x1b[201~`
    });
  } finally {
    try {
      if (electronApp && ownsClipboard) {
        await electronApp.evaluate(({ clipboard, nativeImage }) => {
          const original = globalThis.__multitermClipboardBeforeImageTest;
          if (original) {
            clipboard.write({
              bookmark: original.bookmark,
              html: original.html,
              image: nativeImage.createFromBuffer(Buffer.from(original.imagePng, "base64")),
              rtf: original.rtf,
              text: original.text
            });
          }
          delete globalThis.__multitermClipboardBeforeImageTest;
        });
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
