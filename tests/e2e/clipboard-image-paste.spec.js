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

// Copilot and Claude read the clipboard themselves and attach the image, so the
// terminal only has to deliver the chord as the control byte.
const CTRL_V = "\x16";

test.describe("Clipboard paste with non-text content", () => {
  let context;
  let page;
  let terminalId;

  async function captureFrames(clipboard) {
    await page.evaluate((text) => {
      window.__pasteFrames = [];
      window.__originalSend = state.socket.send;
      window.__originalBridge = window.multiterm;
      const send = state.socket.send.bind(state.socket);
      state.socket.send = (payload) => {
        window.__pasteFrames.push(JSON.parse(payload));
        return send(payload);
      };
      // null stands for a clipboard whose contents cannot be read at all.
      window.multiterm = { readClipboardText: async () => {
        if (text === null) throw new Error("clipboard unavailable");
        return text;
      } };
    }, clipboard);
  }

  async function readFrames() {
    return page.evaluate((id) => {
      state.socket.send = window.__originalSend;
      window.multiterm = window.__originalBridge;
      delete window.__originalSend;
      delete window.__originalBridge;
      const frames = window.__pasteFrames
        .filter((frame) => frame.type === "input" && frame.id === id)
        .map((frame) => frame.data);
      delete window.__pasteFrames;
      return frames;
    }, terminalId);
  }

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199" });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => closeAllTerminals());
    terminalId = await page.evaluate(() => addTerminal({ runStartup: false }).id);
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect(page.locator(".pane-status").first()).toContainText(/pid \d+/i);
  });

  test.afterAll(async () => {
    await page.evaluate(() => closeAllTerminals());
    await stopRendererCoverage(page);
    await context.close();
  });

  test("forwards Ctrl+V when the clipboard holds an image instead of text", async () => {
    await captureFrames("");
    await page.evaluate((id) => pasteIntoTerminal(id), terminalId);
    expect((await readFrames()).filter((data) => data === CTRL_V)).toEqual([CTRL_V]);
  });

  test("still pastes text through xterm and sends no control byte", async () => {
    await captureFrames("Write-Host clipboard-text");
    await page.evaluate((id) => pasteIntoTerminal(id), terminalId);
    const frames = await readFrames();
    expect(frames.join("")).toContain("Write-Host clipboard-text");
    expect(frames).not.toContain(CTRL_V);
  });

  test("forwards Ctrl+V when the clipboard cannot be read", async () => {
    await captureFrames(null);
    await page.evaluate((id) => pasteIntoTerminal(id), terminalId);
    expect((await readFrames()).filter((data) => data === CTRL_V)).toEqual([CTRL_V]);
  });

  test("the Ctrl+V key binding reaches the same path", async () => {
    await captureFrames("");
    await page.locator(".xterm-helper-textarea").first().focus();
    await page.keyboard.press("Control+V");
    await expect.poll(async () => page.evaluate((id) => window.__pasteFrames
      .filter((frame) => frame.type === "input" && frame.id === id)
      .map((frame) => frame.data), terminalId)).toContain(CTRL_V);
    await readFrames();
  });
});
