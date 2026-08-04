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

  const bridgeSessionCount = () => page.evaluate(() => new Promise((resolve, reject) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const probe = new WebSocket(`${protocol}//${window.location.host}/ws`);
    probe.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type !== "welcome") return;
      probe.close();
      resolve(message.sessions.length);
    });
    probe.addEventListener("error", () => reject(new Error("probe socket failed")));
  }));

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

  test("New terminal here uses the selected shell naming convention", async () => {
    await page.evaluate(() => {
      const terminals = [...state.terminals.values()];
      terminals.slice(1).forEach((terminal) => removeTerminal(terminal.id));
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(1);
    const setup = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      commitTerminalTitle(terminal, "Renamed source terminal");
      terminal.cwd = "D:\\multiTerm";
      elements.shellSelect.value = "cmd";
      const expectedTitle = nextTerminalTitle("cmd");
      showContextMenu(20, 20, terminal, "");
      return { before: state.terminals.size, expectedTitle };
    });

    await page.locator("#contextMenu .ctx-item", { hasText: "New terminal here" }).click();
    await expect(page.locator(".terminal-pane")).toHaveCount(setup.before + 1);
    await expect(page.locator(".terminal-pane").last().locator(".pane-title")).toHaveValue(setup.expectedTitle);
    expect(await page.evaluate(() => [...state.terminals.values()].at(-1).cwd)).toBe("D:\\multiTerm");

    await page.evaluate(() => {
      const created = [...state.terminals.values()].at(-1);
      removeTerminal(created.id);
      elements.shellSelect.value = "pwsh";
    });
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(1);
  });

  test("remembers Copilot CWD per terminal and shows persistent cross-terminal history", async () => {
    const setup = await page.evaluate(() => {
      localStorage.removeItem("multiterm.copilotCwdHistory");
      state.copilotCwdHistory = [];
      const first = [...state.terminals.values()][0];
      first.copilotCwd = "";
      const second = addTerminal({ title: "Second CWD target" });
      return { firstId: first.id, secondId: second.id };
    });
    await expect(page.locator(".pane-status.is-live")).toHaveCount(2);

    const submitCwd = async (terminalId, value) => {
      await page.evaluate((id) => showContextMenu(20, 20, state.terminals.get(id), ""), terminalId);
      const input = page.locator('[data-customization-id="terminal.copilot-cwd"] .ctx-command-input');
      await input.fill(value);
      await input.press("Enter");
    };
    await submitCwd(setup.firstId, "D:\\first workspace");
    await submitCwd(setup.secondId, "C:\\second workspace");

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await page.evaluate((id) => showContextMenu(20, 20, state.terminals.get(id), ""), setup.firstId);
    const cwdRow = page.locator('[data-customization-id="terminal.copilot-cwd"]');
    await expect(cwdRow.locator(".ctx-command-input")).toHaveValue("D:\\first workspace");
    await expect(cwdRow.locator(".ctx-command-suggestion")).toHaveText([
      "C:\\second workspace",
      "D:\\first workspace"
    ]);
    await cwdRow.locator(".ctx-command-suggestion").first().click();
    await expect(cwdRow.locator(".ctx-command-input")).toHaveValue("C:\\second workspace");
    expect(await page.evaluate((id) => state.terminals.get(id).copilotCwd, setup.firstId)).toBe("D:\\first workspace");

    const persistence = await page.evaluate(({ firstId, secondId }) => {
      hideContextMenu();
      const snapshot = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]");
      const history = JSON.parse(localStorage.getItem("multiterm.copilotCwdHistory") || "[]");
      const first = state.terminals.get(firstId);
      first.copilotCwd = "";
      removeTerminal(secondId);
      saveSessionSnapshot();
      localStorage.removeItem("multiterm.copilotCwdHistory");
      state.copilotCwdHistory = [];
      return {
        first: snapshot.find((entry) => entry.id === firstId)?.copilotCwd,
        second: snapshot.find((entry) => entry.id === secondId)?.copilotCwd,
        history
      };
    }, setup);
    expect(persistence).toEqual({
      first: "D:\\first workspace",
      second: "C:\\second workspace",
      history: ["C:\\second workspace", "D:\\first workspace"]
    });

    const capped = await page.evaluate((id) => {
      for (let index = 0; index < 12; index += 1) rememberCopilotCwd(`D:\\history-${index}`);
      showContextMenu(20, 20, state.terminals.get(id), "");
      return state.copilotCwdHistory;
    }, setup.firstId);
    expect(capped).toHaveLength(10);
    expect(capped[0]).toBe("D:\\history-11");
    expect(capped.at(-1)).toBe("D:\\history-2");
    await expect(page.locator('[data-customization-id="terminal.copilot-cwd"] .ctx-command-suggestion')).toHaveCount(10);
    await page.evaluate(() => {
      hideContextMenu();
      localStorage.removeItem("multiterm.copilotCwdHistory");
      state.copilotCwdHistory = [];
    });
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(1);
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
      .toHaveAttribute("data-customization-id", "terminal.prepare-paste");
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

  test("queries all Copilot clients from the main UI and continues an editor session in a new terminal", async () => {
    const before = await page.locator(".terminal-pane").count();
    await page.evaluate(() => {
      const sessions = [
        {
          id: "bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
          key: "cli:bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
          source: "cli",
          name: "CLI history",
          cwd: "D:\\multiTerm",
          updatedAt: "2026-08-04T00:18:07.329Z"
        },
        {
          id: "62d43a25-c209-4933-af9a-24d9bff3789c",
          key: "vscode:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:62d43a25-c209-4933-af9a-24d9bff3789c",
          source: "vscode",
          name: "VS Code history",
          cwd: "C:\\src\\Yagu",
          updatedAt: "2026-08-03T20:47:02.240Z"
        },
        {
          id: "70ea177d-5558-40c4-b068-2477e84b9325",
          key: "visualstudio:70ea177d-5558-40c4-b068-2477e84b9325:123456789abc",
          source: "visualstudio",
          name: "Visual Studio history",
          cwd: "D:\\MyFirstMCP",
          updatedAt: "2026-08-02T20:47:02.240Z"
        }
      ];
      window.__allCopilotFrames = [];
      window.__allCopilotOriginalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        window.__allCopilotFrames.push(frame);
        if (frame.type === "listCopilotSessions") {
          window.setTimeout(() => handleBridgeMessage({
            type: "copilotSessions",
            requestId: frame.requestId,
            sessions,
            message: ""
          }), 0);
        } else if (frame.type === "prepareCopilotSessionContext") {
          window.setTimeout(() => handleBridgeMessage({
            type: "copilotSessionContext",
            requestId: frame.requestId,
            contextPath: "C:\\Temp\\MultiTerm\\CopilotContexts\\vscode-context.md",
            cwd: "C:\\src\\Yagu",
            id: sessions[1].id,
            name: sessions[1].name,
            source: "vscode"
          }), 0);
        } else {
          window.__allCopilotOriginalSend.call(this, payload);
        }
      };
    });

    await page.locator("#copilotSessionsToggle").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator(".copilot-session-card")).toHaveCount(3);
    await expect(page.locator(".copilot-session-source")).toHaveText(["Copilot CLI", "VS Code", "Visual Studio"]);
    await page.locator(".copilot-session-card", { hasText: "VS Code history" }).click();
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 1);
    await expect(page.locator(".terminal-pane").last().locator(".pane-title")).toHaveValue(/VS Code history/);
    await expect.poll(() => page.evaluate(() => window.__allCopilotFrames
      .filter((frame) => frame.type === "input")
      .map((frame) => frame.data)
      .join(""))).toContain("vscode-context.md");

    const frames = await page.evaluate(() => {
      state.socket.send = window.__allCopilotOriginalSend;
      delete window.__allCopilotOriginalSend;
      const sent = window.__allCopilotFrames;
      delete window.__allCopilotFrames;
      return sent;
    });
    expect(frames).toContainEqual(expect.objectContaining({
      type: "prepareCopilotSessionContext",
      key: "vscode:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:62d43a25-c209-4933-af9a-24d9bff3789c",
      maxContextKb: 64
    }));
    expect(frames.some((frame) => frame.type === "input" && frame.data.includes("copilot --yolo -i"))).toBe(true);
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()].at(-1);
      removeTerminal(terminal.id);
    });
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

  test("overrides notification channels for one terminal and persists them", async () => {
    await page.evaluate(() => {
      closeAllTerminals();
      state.settings.notifyActivity = false;
      state.settings.notifySilence = false;
      state.settings.bellNotify = false;
      saveSettings();
      addTerminal({ title: "Inherited notifications" });
      addTerminal({ title: "Build watcher" });
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(2);

    const target = page.locator(".terminal-pane").filter({ has: page.locator(".pane-title-display", { hasText: "Build watcher" }) });
    const bellButton = target.locator('[data-action="notifications"]');
    if (await bellButton.isVisible()) {
      await bellButton.click();
    } else {
      await target.locator('[data-action="more"]').click();
      await page.locator("#contextMenu .ctx-item", { hasText: "Notifications" }).click();
    }
    const flyout = page.locator("#terminalNotificationFlyout");
    await expect(flyout).toBeVisible();
    await expect(page.locator("#terminalNotificationSubtitle")).toHaveText("Build watcher");
    await expect(flyout.locator('[data-notification-channel="activity"] [data-notification-value="global"]')).toHaveAttribute("aria-checked", "true");

    await flyout.locator('[data-notification-channel="activity"] [data-notification-value="on"]').click();
    await flyout.locator('[data-notification-channel="idle"] [data-notification-value="off"]').click();
    await flyout.locator('[data-notification-channel="bell"] [data-notification-value="on"]').click();
    await expect(bellButton).toHaveAttribute("data-notification-state", "enabled");

    const result = await page.evaluate(() => {
      const inherited = [...state.terminals.values()].find((terminal) => terminal.titleInput.value === "Inherited notifications");
      const targetTerminal = [...state.terminals.values()].find((terminal) => terminal.titleInput.value === "Build watcher");
      const NativeNotification = window.Notification;
      const bodies = [];
      class NotificationRecorder {
        static permission = "granted";
        constructor(_title, options) { bodies.push(options.body); }
      }
      window.Notification = NotificationRecorder;
      setActiveTerminal(targetTerminal.id);
      handleBell(inherited);
      setActiveTerminal(inherited.id);
      targetTerminal.createdAt = performance.now() - 3000;
      handleOutputNotifications(targetTerminal);
      handleBell(targetTerminal);
      window.Notification = NativeNotification;
      return {
        bodies,
        overrides: targetTerminal.notificationOverrides,
        saved: JSON.parse(localStorage.getItem("multiterm.lastSession"))
          .find((entry) => entry.id === targetTerminal.id)?.notificationOverrides
      };
    });
    expect(result.bodies).toEqual(["Activity in Build watcher", "Bell in Build watcher"]);
    expect(result.overrides).toEqual({ activity: true, idle: false, bell: true });
    expect(result.saved).toEqual(result.overrides);

    const inheritedIdle = await page.evaluate(() => {
      const terminal = [...state.terminals.values()].find((entry) => entry.titleInput.value === "Build watcher");
      state.settings.notifySilence = true;
      terminal.notificationOverrides = { activity: true };
      terminal.hadOutput = true;
      terminal.silenceTimer = window.setTimeout(() => {}, 60000);
      const timer = terminal.silenceTimer;
      renderTerminalNotificationFlyout();
      return { timer, terminalId: terminal.id };
    });
    await page.locator("#terminalNotificationReset").click();
    expect(await page.evaluate(({ timer, terminalId }) => {
      const terminal = state.terminals.get(terminalId);
      return { hadOutput: terminal.hadOutput, timerPreserved: terminal.silenceTimer === timer };
    }, inheritedIdle)).toEqual({ hadOutput: true, timerPreserved: true });
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()].find((entry) => entry.titleInput.value === "Build watcher");
      window.clearTimeout(terminal.silenceTimer);
      terminal.hadOutput = false;
      state.settings.notifySilence = false;
      terminal.notificationOverrides = { activity: true, idle: false, bell: true };
      updateTerminalNotificationButton(terminal);
      renderTerminalNotificationFlyout();
      saveSessionSnapshot();
    });

    await page.keyboard.press("Escape");
    await expect(flyout).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    const compactBell = target.locator('[data-action="notifications-compact"]');
    await expect(compactBell).toBeVisible();
    await compactBell.click();
    await expect(flyout).toBeVisible();
    const mobileBounds = await flyout.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        left: rect.left,
        right: rect.right,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
        top: rect.top,
        viewportHeight: innerHeight,
        viewportWidth: innerWidth
      };
    });
    expect(mobileBounds.left).toBeGreaterThanOrEqual(0);
    expect(mobileBounds.top).toBeGreaterThanOrEqual(0);
    expect(mobileBounds.right).toBeLessThanOrEqual(mobileBounds.viewportWidth);
    expect(mobileBounds.bottom).toBeLessThanOrEqual(mobileBounds.viewportHeight);
    expect(mobileBounds.scrollWidth).toBeLessThanOrEqual(mobileBounds.clientWidth);
    expect(mobileBounds.scrollHeight).toBeLessThanOrEqual(mobileBounds.clientHeight);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()]
      .find((terminal) => terminal.titleInput.value === "Build watcher")?.notificationOverrides))
      .toEqual({ activity: true, idle: false, bell: true });

    const lifecycle = await page.evaluate(() => {
      const expected = { activity: true, idle: false, bell: true };
      const original = [...state.terminals.values()].find((terminal) => terminal.titleInput.value === "Build watcher");
      runHeaderAction(original, "duplicate");
      const duplicate = [...state.terminals.values()].find((terminal) => terminal.titleInput.value === "Build watcher copy");
      const duplicated = { ...duplicate.notificationOverrides };
      removeTerminal(duplicate.id);

      restartSession(original.id);
      const restartedTerminal = [...state.terminals.values()].find((terminal) => terminal.titleInput.value === "Build watcher");
      const restarted = { ...restartedTerminal.notificationOverrides };

      saveWorkspace("Notification lifecycle");
      restartedTerminal.notificationOverrides = {};
      restoreWorkspace("Notification lifecycle");
      const restoredTerminal = [...state.terminals.values()].find((terminal) => terminal.titleInput.value === "Build watcher");
      const restored = { ...restoredTerminal.notificationOverrides };
      deleteWorkspace("Notification lifecycle");
      return { duplicated, expected, restarted, restored };
    });
    expect(lifecycle.duplicated).toEqual(lifecycle.expected);
    expect(lifecycle.restarted).toEqual(lifecycle.expected);
    expect(lifecycle.restored).toEqual(lifecycle.expected);
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
