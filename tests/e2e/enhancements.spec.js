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

test.describe("Enhancement milestone", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      permissions: ["clipboard-read", "clipboard-write", "notifications"]
    });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => closeAllTerminals());
    await page.evaluate(() => addTerminal({ title: "Enhancement test" }));
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test.afterAll(async () => {
    await page.evaluate(() => closeAllTerminals());
    await stopRendererCoverage(page, "enhancements");
    await context.close();
  });

  test("exposes paste and close-retention settings", async () => {
    for (const selector of ["#ctrlVPaste", "#cleanCopilotClipboard", "#keepSessionsOnClose"]) {
      await expect(page.locator(selector)).toBeChecked();
    }
  });

  test("Ctrl+V pastes and cleans copied Copilot border pipes", async () => {
    const sent = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const frames = [];
      const originalSend = state.socket.send;
      state.socket.send = (payload) => frames.push(JSON.parse(payload));
      await navigator.clipboard.writeText("first value |\r\nsecond value |");
      terminal.term.element.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "KeyV",
        ctrlKey: true,
        key: "v"
      }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      state.socket.send = originalSend;
      return frames.filter((frame) => frame.type === "input" && frame.id === terminal.id);
    });

    // xterm's paste path normalizes line endings for terminal input, matching
    // the working Ctrl+Shift+V behavior instead of sending browser CRLF bytes.
    expect(sent).toEqual([{ type: "input", id: sent[0].id, data: "first value\rsecond value" }]);
  });

  test("clipboard cleanup remains conservative", async () => {
    expect(await page.evaluate(() => normalizeClipboardText("Write-Output one |"))).toBe("Write-Output one |");
    expect(await page.evaluate(() => normalizeClipboardText("one |\ntwo\nthree"))).toBe("one |\ntwo\nthree");
  });

  test("Copilot context fields target the selected terminal", async () => {
    const frames = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const sent = [];
      const originalSend = state.socket.send;
      state.socket.send = (payload) => sent.push(JSON.parse(payload));

      showContextMenu(20, 20, terminal, "");
      const fields = [...document.querySelectorAll(".ctx-command-field")];
      const model = fields.find((field) => field.querySelector("span")?.textContent === "Copilot model")?.querySelector("input");
      model.value = "gpt-test";
      model.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));

      showContextMenu(20, 20, terminal, "");
      const cwdField = [...document.querySelectorAll(".ctx-command-field")]
        .find((field) => field.querySelector("span")?.textContent === "Copilot CWD")?.querySelector("input");
      cwdField.value = "D:\\work tree";
      cwdField.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));

      await new Promise((resolve) => setTimeout(resolve, 20));
      state.socket.send = originalSend;
      return sent.filter((frame) => frame.type === "input" && frame.id === terminal.id);
    });

    expect(frames.map((frame) => frame.data)).toEqual(["/model gpt-test\r", "/cwd D:\\work tree\r"]);
  });

  test("Copilot YOLO context action launches the interactive CLI", async () => {
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const sent = [];
      let focused = false;
      const originalSend = state.socket.send;
      const originalFocus = terminal.term.focus;
      state.socket.send = (payload) => sent.push(JSON.parse(payload));
      terminal.term.focus = () => { focused = true; };

      showContextMenu(20, 20, terminal, "");
      const item = [...document.querySelectorAll("#contextMenu .ctx-item")]
        .find((row) => row.textContent.includes("Launch Copilot CLI (YOLO)"));
      const title = item?.title || "";
      item?.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      terminal.term.focus = originalFocus;
      state.socket.send = originalSend;
      return {
        focused,
        hidden: elements.contextMenu.hidden,
        title,
        frames: sent.filter((frame) => frame.type === "input" && frame.id === terminal.id)
      };
    });

    expect({ ...result, frames: undefined }).toEqual({
      focused: true,
      hidden: true,
      title: "Starts the interactive Copilot CLI with all tool, path, and URL permissions",
      frames: undefined
    });
    expect(result.frames).toEqual([
      { type: "input", id: expect.any(String), data: "copilot --yolo\r" }
    ]);
  });

  test("disabling retention closes terminal sessions with the window", async () => {
    const result = await page.evaluate(() => {
      const frames = [];
      const originalSend = state.socket.send;
      state.socket.send = (payload) => frames.push(JSON.parse(payload));
      state.settings.keepSessionsOnClose = false;
      finishAppClose("tray");
      state.settings.keepSessionsOnClose = true;
      state.socket.send = originalSend;
      saveSettings();
      return { frames, terminals: state.terminals.size };
    });

    expect(result.frames.some((frame) => frame.type === "killAll")).toBe(true);
    expect(result.terminals).toBe(0);
    await page.evaluate(() => addTerminal({ title: "Enhancement test" }));
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test("notification focus selects the terminal and its page", async () => {
    const result = await page.evaluate(() => {
      const first = [...state.terminals.values()][0];
      const secondPage = addPage({ name: "Notifications", activate: false });
      const second = addTerminal({ title: "Notify target", pageId: secondPage });
      let desktopFocusCalls = 0;
      window.multiterm = { focusWindow: () => { desktopFocusCalls += 1; } };
      setActivePage(first.pageId, { focus: false });
      setActiveTerminal(first.id);
      focusNotifiedTerminal(second);
      return {
        activeId: state.activeId,
        activePageId: state.activePageId,
        desktopFocusCalls,
        secondId: second.id,
        secondPage
      };
    });

    expect(result.activeId).toBe(result.secondId);
    expect(result.activePageId).toBe(result.secondPage);
    expect(result.desktopFocusCalls).toBe(1);
  });
});
