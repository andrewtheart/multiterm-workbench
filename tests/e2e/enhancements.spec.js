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

  test("opens an Explorer folder in a new terminal", async () => {
    const result = await page.evaluate(() => {
      const before = new Set(state.terminals.keys());
      handleBridgeMessage({ type: "openFolder", path: "D:\\Explorer target" });
      const created = [...state.terminals.values()].find((terminal) => !before.has(terminal.id));
      const invalid = openFolderInNewTerminal("   ");
      return {
        count: state.terminals.size,
        cwd: created?.cwd,
        invalid,
        visible: created ? !created.pane.classList.contains("is-page-hidden") : false
      };
    });

    expect(result).toEqual({ count: 2, cwd: "D:\\Explorer target", invalid: null, visible: true });
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

  test("Paste and execute targets the focused terminal after xterm paste", async () => {
    const terminalId = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      await new Promise((resolve) => terminal.term.write("\x1b[?2004h", resolve));
      window.__pasteExecuteFrames = [];
      window.__pasteExecuteOriginalSend = state.socket.send;
      window.__pasteExecuteOriginalBridge = window.multiterm;
      state.socket.send = (payload) => window.__pasteExecuteFrames.push(JSON.parse(payload));
      window.multiterm = { readClipboardText: async () => "Write-Host focused" };
      showContextMenu(20, 20, terminal, "");
      return terminal.id;
    });

    const action = page.locator('[data-customization-id="terminal.paste-execute"]');
    await expect(action).toBeVisible();
    await expect(action.locator("xpath=preceding-sibling::*[contains(@class, 'ctx-item')][1]"))
      .toHaveAttribute("data-customization-id", "terminal.paste");
    await action.click();
    await expect.poll(() => page.evaluate(() => window.__pasteExecuteFrames
      .filter((frame) => frame.type === "input"
        && (frame.data.includes("Write-Host focused") || frame.data === "\r"))
      .map((frame) => frame.data))).toEqual([
      "\x1b[200~Write-Host focused\x1b[201~",
      "\r"
    ]);

    const result = await page.evaluate(async (id) => {
      state.socket.send = window.__pasteExecuteOriginalSend;
      window.multiterm = window.__pasteExecuteOriginalBridge;
      delete window.__pasteExecuteOriginalSend;
      delete window.__pasteExecuteOriginalBridge;
      const frames = window.__pasteExecuteFrames
        .filter((frame) => frame.type === "input"
          && frame.id === id
          && (frame.data.includes("Write-Host focused") || frame.data === "\r"));
      delete window.__pasteExecuteFrames;
      await new Promise((resolve) => state.terminals.get(id).term.write("\x1b[?2004l", resolve));
      return frames;
    }, terminalId);
    expect(result).toEqual([
      { type: "input", id: terminalId, data: "\x1b[200~Write-Host focused\x1b[201~" },
      { type: "input", id: terminalId, data: "\r" }
    ]);
  });

  test("Paste and execute opens a terminal on the current page when none is focused", async () => {
    const setup = await page.evaluate(() => {
      closeAllTerminals();
      const pageId = addPage({ name: "Paste page" });
      const existing = addTerminal({ title: "Existing terminal", pageId });
      return { existingId: existing.id, pageId };
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect(page.locator(".pane-status")).toHaveClass(/is-live/);
    await page.evaluate(() => {
      window.__pasteExecuteFrames = [];
      window.__pasteExecuteOriginalSend = state.socket.send;
      window.__pasteExecuteOriginalBridge = window.multiterm;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        window.__pasteExecuteFrames.push(frame);
        if (frame.type !== "input") window.__pasteExecuteOriginalSend.call(this, payload);
      };
      window.multiterm = { readClipboardText: async () => "Write-Host new-terminal" };
      elements.addTerminal.focus();
      showSurfaceContextMenu(20, 20);
    });

    await page.locator("#contextMenu .ctx-item", { hasText: "Paste and execute" }).click();
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => window.__pasteExecuteFrames
      .filter((frame) => frame.type === "input"
        && (frame.data === "Write-Host new-terminal" || frame.data === "\r"))
      .map((frame) => frame.data))).toEqual(["Write-Host new-terminal", "\r"]);

    const result = await page.evaluate((expectedPageId) => {
      state.socket.send = window.__pasteExecuteOriginalSend;
      window.multiterm = window.__pasteExecuteOriginalBridge;
      delete window.__pasteExecuteOriginalSend;
      delete window.__pasteExecuteOriginalBridge;
      const create = window.__pasteExecuteFrames.find((frame) => frame.type === "create");
      const input = window.__pasteExecuteFrames
        .filter((frame) => frame.type === "input"
          && frame.id === create.id
          && (frame.data === "Write-Host new-terminal" || frame.data === "\r"))
        .map((frame) => frame.data);
      delete window.__pasteExecuteFrames;
      const terminal = state.terminals.get(create.id);
      return { input, terminalId: terminal.id, terminalPageId: terminal.pageId, expectedPageId };
    }, setup.pageId);
    expect(result.terminalPageId).toBe(setup.pageId);
    expect(result.input).toEqual(["Write-Host new-terminal", "\r"]);

    await page.evaluate(({ existingId, terminalId, pageId }) => {
      removeTerminal(terminalId);
      removeTerminal(existingId);
      removePage(pageId);
      addTerminal({ title: "Enhancement test" });
    }, { existingId: setup.existingId, terminalId: result.terminalId, pageId: setup.pageId });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
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

    expect(frames.map((frame) => frame.data).filter((data) => data.startsWith("/")))
      .toEqual(["/model gpt-test\r", "/cwd D:\\work tree\r"]);
  });

  test("Copilot YOLO context action sends the command followed by Enter", async () => {
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
        .find((row) => row.textContent.includes("Run Copilot CLI (YOLO)"));
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
      title: "Runs Copilot with YOLO permissions in the focused terminal, or opens one on this page",
      frames: undefined
    });
    const commandIndex = result.frames.findIndex((frame) => frame.data === "copilot --yolo");
    expect(commandIndex).toBeGreaterThanOrEqual(0);
    expect(result.frames.slice(commandIndex, commandIndex + 2)).toEqual([
      { type: "input", id: result.frames[commandIndex].id, data: "copilot --yolo" },
      { type: "input", id: result.frames[commandIndex].id, data: "\r" }
    ]);
  });

  test("Copilot YOLO surface action opens a terminal on the current page when none is focused", async () => {
    const setup = await page.evaluate(() => {
      closeAllTerminals();
      const pageId = addPage({ name: "Copilot page" });
      const existing = addTerminal({ title: "Existing terminal", pageId });
      return { existingId: existing.id, pageId };
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect(page.locator(".pane-status")).toHaveClass(/is-live/);
    await page.evaluate(() => {
      window.__copilotLaunchFrames = [];
      window.__copilotLaunchOriginalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        window.__copilotLaunchFrames.push(frame);
        if (frame.type !== "input") window.__copilotLaunchOriginalSend.call(this, payload);
      };
      elements.addTerminal.focus();
      showSurfaceContextMenu(20, 20);
    });

    await page.locator("#contextMenu .ctx-item", { hasText: "Run Copilot CLI (YOLO)" }).click();
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => window.__copilotLaunchFrames
      .filter((frame) => frame.type === "input" && (frame.data === "copilot --yolo" || frame.data === "\r"))
      .map((frame) => frame.data))).toEqual(["copilot --yolo", "\r"]);

    const result = await page.evaluate((expectedPageId) => {
      state.socket.send = window.__copilotLaunchOriginalSend;
      delete window.__copilotLaunchOriginalSend;
      const create = window.__copilotLaunchFrames.find((frame) => frame.type === "create");
      const input = window.__copilotLaunchFrames
        .filter((frame) => frame.type === "input"
          && frame.id === create.id
          && (frame.data === "copilot --yolo" || frame.data === "\r"))
        .map((frame) => frame.data);
      delete window.__copilotLaunchFrames;
      const terminal = state.terminals.get(create.id);
      return {
        expectedPageId,
        input,
        terminalId: terminal.id,
        terminalPageId: terminal.pageId
      };
    }, setup.pageId);
    expect(result.terminalPageId).toBe(setup.pageId);
    expect(result.input).toEqual(["copilot --yolo", "\r"]);

    await page.evaluate(({ existingId, terminalId, pageId }) => {
      removeTerminal(terminalId);
      removeTerminal(existingId);
      removePage(pageId);
    }, { existingId: setup.existingId, terminalId: result.terminalId, pageId: setup.pageId });
  });

  test("selects and resumes a local Copilot CLI session in the invoking terminal", async () => {
    const firstId = await page.evaluate(() => {
      closeAllTerminals();
      return addTerminal({ title: "Copilot resume target" }).id;
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    const secondId = await page.evaluate(() => addTerminal({ title: "Other terminal" }).id);
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await page.evaluate(({ firstId }) => {
      const sessions = [
        {
          id: "bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
          name: "Build the Copilot resume session picker",
          cwd: "D:\\multiTerm",
          repository: "andrewtheart/multiterm-workbench",
          branch: "main",
          updatedAt: "2026-08-04T00:18:07.329Z"
        },
        {
          id: "62d43a25-c209-4933-af9a-24d9bff3789c",
          name: "Diagnose continuous indexing",
          cwd: "C:\\src\\Yagu",
          repository: "andrewtheart/yagu-search",
          branch: "main",
          updatedAt: "2026-08-03T20:47:02.240Z"
        },
        { id: "unsafe", name: "Ignored invalid record" }
      ];
      window.__copilotResumeFrames = [];
      window.__copilotOriginalSend = state.socket.send;
      state.socket.send = (payload) => {
        const frame = JSON.parse(payload);
        window.__copilotResumeFrames.push(frame);
        if (frame.type === "listCopilotSessions") {
          window.setTimeout(() => handleBridgeMessage({
            type: "copilotSessions",
            requestId: frame.requestId,
            sessions,
            message: ""
          }), 0);
        }
      };
      const terminal = state.terminals.get(firstId);
      showContextMenu(20, 20, terminal, "");
    }, { firstId });

    await page.locator("#contextMenu .ctx-item", { hasText: "Resume Copilot CLI session" }).click();
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator("#copilotResumeSearch")).toBeFocused();
    await expect(page.locator(".copilot-session-card")).toHaveCount(2);
    await page.locator("#copilotResumeSearch").fill("yagu indexing");
    await expect(page.locator(".copilot-session-card")).toHaveCount(1);
    await expect(page.locator(".copilot-session-card")).toContainText("Diagnose continuous indexing");
    await expect(page.locator(".copilot-session-card")).toContainText("andrewtheart/yagu-search");

    await page.evaluate((id) => setActiveTerminal(id), secondId);
    await page.locator(".copilot-session-card").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();

    const frames = await page.evaluate(() => {
      state.socket.send = window.__copilotOriginalSend;
      delete window.__copilotOriginalSend;
      const sent = window.__copilotResumeFrames;
      delete window.__copilotResumeFrames;
      return sent;
    });
    expect(frames.filter((frame) => frame.type === "input" && frame.data.startsWith("copilot --resume="))).toEqual([{
      type: "input",
      id: firstId,
      data: "copilot --resume=62d43a25-c209-4933-af9a-24d9bff3789c --yolo\r"
    }]);
    await page.evaluate((id) => removeTerminal(id), secondId);
  });

  test("quit and close bridge closes terminal sessions with the window", async () => {
    const result = await page.evaluate(() => {
      const frames = [];
      const originalSend = state.socket.send;
      state.socket.send = (payload) => frames.push(JSON.parse(payload));
      finishAppClose("quitClose");
      state.socket.send = originalSend;
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
