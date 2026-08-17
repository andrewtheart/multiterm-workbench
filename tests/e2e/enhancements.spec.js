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
  let originalExternalTerminalFocus;

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
    await page.waitForFunction(() => Boolean(state.bridgeId));
    originalExternalTerminalFocus = await page.evaluate(() => {
      const value = state.settings.externalTerminalFocus;
      state.settings.externalTerminalFocus = "never";
      saveSettings();
      return value;
    });
    await page.evaluate(() => closeAllTerminals());
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(0);
    await page.evaluate(() => addTerminal({ title: "Enhancement test" }));
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(1);
  });

  test.afterAll(async () => {
    await page.evaluate((externalTerminalFocus) => {
      closeAllTerminals();
      state.settings.externalTerminalFocus = externalTerminalFocus;
      saveSettings();
    }, originalExternalTerminalFocus);
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

  test("changes the captured terminal directory only after validation and prompt readiness", async () => {
    const setup = await page.evaluate(() => {
      const first = [...state.terminals.values()][0];
      first.cwd = "D:\\before";
      const second = addTerminal({ title: "CWD focus decoy" });
      return { firstId: first.id, secondId: second.id };
    });
    await expect.poll(() => page.evaluate((id) => state.terminals.get(id)?.status, setup.secondId)).toBe("live");
    await page.evaluate(({ firstId, secondId }) => {
      const first = state.terminals.get(firstId);
      window.__cwdOriginalReadiness = terminalExecutionReadiness;
      window.__cwdOriginalSend = state.socket.send;
      window.__cwdReady = false;
      window.__cwdFrames = [];
      terminalExecutionReadiness = () => ({ mode: "shell", ready: window.__cwdReady });
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        window.__cwdFrames.push(frame);
        if (frame.type === "validateDirectory") {
          window.setTimeout(() => handleBridgeMessage({
            type: "directoryValidation",
            requestId: frame.requestId,
            kind: "host",
            valid: true,
            path: "D:\\validated path",
            error: ""
          }), 0);
        }
      };
      showContextMenu(20, 20, first, "");
      setActiveTerminal(secondId);
    }, setup);

    await page.locator("#contextMenu .ctx-item", { hasText: "Change working directory" }).click();
    await expect(page.locator("#cwdChangeOverlay")).toBeVisible();
    await expect(page.locator("#cwdChangeTarget")).toHaveText(/Enhancement test|Renamed source terminal/);
    await page.locator("#cwdChangeInput").fill("D:\\validated path");
    await expect(page.locator("#cwdChangeStatus")).toContainText("Waiting for an idle");
    await expect(page.locator("#cwdChangeSend")).toBeDisabled();

    await page.evaluate(() => { window.__cwdReady = true; });
    await expect(page.locator("#cwdChangeSend")).toBeEnabled();
    await page.locator("#cwdChangeSend").click();
    await expect(page.locator("#cwdChangeOverlay")).toBeHidden();

    const result = await page.evaluate(({ firstId, secondId }) => {
      state.socket.send = window.__cwdOriginalSend;
      terminalExecutionReadiness = window.__cwdOriginalReadiness;
      const frames = window.__cwdFrames;
      delete window.__cwdFrames;
      delete window.__cwdOriginalSend;
      delete window.__cwdOriginalReadiness;
      delete window.__cwdReady;
      const cwd = state.terminals.get(firstId)?.cwd;
      removeTerminal(secondId);
      return { cwd, frames };
    }, setup);
    expect(result.cwd).toBe("D:\\validated path");
    expect(result.frames.filter((frame) => frame.type === "input"
      && frame.id === setup.firstId
      && (frame.data === "Set-Location -LiteralPath 'D:\\validated path'" || frame.data === "\r"))).toEqual([
      { type: "input", id: setup.firstId, data: "Set-Location -LiteralPath 'D:\\validated path'" },
      { type: "input", id: setup.firstId, data: "\r" }
    ]);
  });

  test("builds shell and assistant directory commands without treating paths as syntax", async () => {
    const commands = await page.evaluate(() => ({
      cmd: buildCwdChangeCommand({ shell: "cmd", aiAssistantTuiProvider: "" }, "C:\\100% & safe"),
      copilot: buildCwdChangeCommand({ shell: "pwsh", aiAssistantTuiProvider: "copilot" }, "D:\\repo name"),
      claude: buildCwdChangeCommand({ shell: "pwsh", aiAssistantTuiProvider: "claude" }, "D:\\repo name"),
      powershell: buildCwdChangeCommand({ shell: "pwsh", aiAssistantTuiProvider: "" }, "D:\\O'Brien"),
      wsl: buildCwdChangeCommand({ shell: "wsl", aiAssistantTuiProvider: "" }, "/mnt/c/O'Brien"),
      parsedCwd: parseCwdQueryOutput("\u001b[2K│ Current working directory: D:\\live repo │\r\n"),
      trackedWsl: (() => {
        const terminal = { shell: "wsl", cwd: "", id: "wsl-cwd", titleInput: { value: "WSL" }, statusElement: { textContent: "" }, searchText: "" };
        updateTerminalCwd(terminal, "/mnt/c/work");
        return terminal.cwd;
      })()
    }));
    expect(commands).toEqual({
      cmd: 'cd /d "C:\\100^% & safe"',
      copilot: "/cwd D:\\repo name",
      claude: "/cd D:\\repo name",
      powershell: "Set-Location -LiteralPath 'D:\\O''Brien'",
      wsl: "cd -- '/mnt/c/O'\"'\"'Brien'",
      parsedCwd: "D:\\live repo",
      trackedWsl: "/mnt/c/work"
    });
  });

  test("queries a ready Copilot TUI for its live working directory", async () => {
    const terminalId = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      terminal.aiAssistantTuiProvider = "copilot";
      terminal.cwd = "D:\\last known";
      window.__liveCwdOriginalReadiness = terminalExecutionReadiness;
      window.__liveCwdOriginalSend = state.socket.send;
      window.__liveCwdFrames = [];
      terminalExecutionReadiness = () => ({ mode: "copilot", ready: true });
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        window.__liveCwdFrames.push(frame);
        if (frame.type === "validateDirectory") {
          window.setTimeout(() => handleBridgeMessage({
            type: "directoryValidation",
            requestId: frame.requestId,
            kind: "host",
            valid: true,
            path: frame.path,
            error: ""
          }), 0);
        }
      };
      openCwdChange(terminal.id);
      window.setTimeout(() => {
        if (!terminal.cwdQuery) return;
        terminal.cwdQuery.output += "Current working directory: D:\\live Copilot repo\r\n";
        terminal.outputRevision += 1;
      }, 20);
      return terminal.id;
    });

    await expect(page.locator("#cwdChangeSource")).toHaveText("Live Copilot session path");
    await expect(page.locator("#cwdChangeInput")).toHaveValue("D:\\live Copilot repo");
    await expect(page.locator("#cwdChangeSend")).toBeEnabled();

    const frames = await page.evaluate(() => {
      closeCwdChange();
      state.socket.send = window.__liveCwdOriginalSend;
      terminalExecutionReadiness = window.__liveCwdOriginalReadiness;
      const sent = window.__liveCwdFrames;
      delete window.__liveCwdFrames;
      delete window.__liveCwdOriginalSend;
      delete window.__liveCwdOriginalReadiness;
      return sent;
    });
    expect(frames).toContainEqual({ type: "input", id: terminalId, data: "/cwd" });
    expect(frames).toContainEqual({ type: "input", id: terminalId, data: "\u001b[13u" });
  });

  test("remembers Copilot CWD per terminal and shows persistent cross-terminal history", async () => {
    const setup = await page.evaluate(() => {
      localStorage.removeItem("multiterm.copilotCwdHistory");
      state.copilotCwdHistory = [];
      const originalProviders = state.aiProviders;
      const originalProvider = state.settings.aiSessionProvider;
      state.aiProviders = [{ id: "copilot", available: true, interactiveAvailable: true }];
      state.settings.aiSessionProvider = "copilot";
      const first = [...state.terminals.values()][0];
      first.copilotCwd = "";
      const second = addTerminal({ title: "Second CWD target" });
      return { firstId: first.id, secondId: second.id, originalProviders, originalProvider };
    });
    await expect(page.locator(".pane-status.is-live")).toHaveCount(2);
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(2);

    const submitCwd = async (terminalId, value) => {
      await page.evaluate((id) => showContextMenu(20, 20, state.terminals.get(id), ""), terminalId);
      const input = page.locator('[data-customization-id="terminal.copilot-cwd"] .ctx-command-input');
      await input.fill(value);
      await page.waitForTimeout(250);
      await expect(input).toHaveValue(value);
      await input.press("Enter");
      await expect(page.locator("#contextMenu")).toBeHidden();
      await expect.poll(() => page.evaluate((id) => state.terminals.get(id)?.copilotCwd, terminalId)).toBe(value);
    };
    await submitCwd(setup.firstId, "D:\\first workspace");
    await submitCwd(setup.secondId, "C:\\second workspace");
    const beforeReload = await page.evaluate(({ firstId, secondId }) => {
      const snapshot = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]");
      return {
        firstLive: state.terminals.get(firstId)?.copilotCwd,
        firstSaved: snapshot.find((entry) => entry.id === firstId)?.copilotCwd,
        secondLive: state.terminals.get(secondId)?.copilotCwd,
        secondSaved: snapshot.find((entry) => entry.id === secondId)?.copilotCwd
      };
    }, setup);
    expect(beforeReload).toEqual({
      firstLive: "D:\\first workspace",
      firstSaved: "D:\\first workspace",
      secondLive: "C:\\second workspace",
      secondSaved: "C:\\second workspace"
    });

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await page.evaluate((id) => {
      state.aiProviders = [{ id: "copilot", available: true, interactiveAvailable: true }];
      state.settings.aiSessionProvider = "copilot";
      showContextMenu(20, 20, state.terminals.get(id), "");
    }, setup.firstId);
    const cwdRow = page.locator('[data-customization-id="terminal.copilot-cwd"]');
    const cwdInput = cwdRow.locator(".ctx-command-input");
    await expect(cwdInput).toHaveValue("D:\\first workspace");
    await cwdInput.click();
    const historyList = page.locator(".combobox-list:not([hidden])");
    await expect(historyList.locator(".combobox-option-label")).toHaveText([
      "C:\\second workspace",
      "D:\\first workspace"
    ]);
    const timestamps = historyList.locator(".combobox-option-detail");
    await expect(timestamps).toHaveCount(2);
    for (const timestamp of await timestamps.allTextContents()) {
      expect(timestamp).toMatch(/[A-Z][a-z]{2} \d{1,2}, \d{4}.*\d{1,2}:\d{2}/);
    }
    await page.waitForTimeout(300);
    await expect(historyList).toBeVisible();
    await historyList.locator(".combobox-option").first().click();
    await expect(page.locator("#contextMenu")).toBeHidden();
    expect(await page.evaluate((id) => state.terminals.get(id).copilotCwd, setup.firstId)).toBe("C:\\second workspace");

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
      first: "C:\\second workspace",
      second: "C:\\second workspace",
      history: [
        { path: "C:\\second workspace", usedAt: expect.any(String) },
        { path: "D:\\first workspace", usedAt: expect.any(String) }
      ]
    });
    persistence.history.forEach((entry) => expect(Number.isNaN(Date.parse(entry.usedAt))).toBe(false));

    const capped = await page.evaluate((id) => {
      for (let index = 0; index < 12; index += 1) rememberCopilotCwd(`D:\\history-${index}`);
      showContextMenu(20, 20, state.terminals.get(id), "");
      return state.copilotCwdHistory;
    }, setup.firstId);
    expect(capped).toHaveLength(10);
    expect(capped[0]).toMatchObject({ path: "D:\\history-11", usedAt: expect.any(String) });
    expect(capped.at(-1)).toMatchObject({ path: "D:\\history-2", usedAt: expect.any(String) });
    await page.locator('[data-customization-id="terminal.copilot-cwd"] .ctx-command-input').click();
    await expect(page.locator(".combobox-list:not([hidden]) .combobox-option")).toHaveCount(10);

    const migrated = await page.evaluate(() => {
      localStorage.setItem("multiterm.copilotCwdHistory", JSON.stringify([
        "D:\\legacy path",
        { path: "C:\\timestamped", usedAt: "2026-08-15T12:34:00.000Z" }
      ]));
      state.copilotCwdHistory = loadCopilotCwdHistory();
      return {
        history: state.copilotCwdHistory,
        stored: JSON.parse(localStorage.getItem("multiterm.copilotCwdHistory"))
      };
    });
    expect(migrated.history).toEqual(migrated.stored);
    expect(migrated.history).toEqual([
      { path: "D:\\legacy path", usedAt: expect.any(String) },
      { path: "C:\\timestamped", usedAt: "2026-08-15T12:34:00.000Z" }
    ]);
    expect(Number.isNaN(Date.parse(migrated.history[0].usedAt))).toBe(false);
    await page.evaluate((profile) => {
      hideContextMenu();
      localStorage.removeItem("multiterm.copilotCwdHistory");
      state.copilotCwdHistory = [];
      state.aiProviders = profile.originalProviders;
      state.settings.aiSessionProvider = profile.originalProvider;
    }, setup);
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
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const sent = [];
      const originalSend = state.socket.send;
      const originalProviders = state.aiProviders;
      const originalProvider = state.settings.aiSessionProvider;
      state.socket.send = (payload) => sent.push(JSON.parse(payload));
      state.aiProviders = [{
        id: "copilot",
        name: "GitHub Copilot",
        available: true,
        interactiveAvailable: true,
        models: [
          { id: "gpt-test", name: "GPT Test", maxContextTokens: 128000 },
          { id: "claude-test", name: "Claude Test", maxContextTokens: 200000 }
        ]
      }];
      state.settings.aiSessionProvider = "copilot";

      showContextMenu(20, 20, terminal, "");
      const model = document.querySelector('[data-customization-id="terminal.copilot-model"] .combobox-input');
      model.focus();
      const modelLabels = [...document.querySelectorAll(".combobox-list:not([hidden]) .combobox-option-label")]
        .map((element) => element.textContent);
      const modelGroups = [...document.querySelectorAll(".combobox-list:not([hidden]) .combobox-group")]
        .map((element) => element.textContent);
      model.value = "gpt";
      model.dispatchEvent(new Event("input", { bubbles: true }));
      model.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));
      await new Promise((resolve) => setTimeout(resolve, 20));

      showContextMenu(20, 20, terminal, "");
      const cwdField = document.querySelector('[data-customization-id="terminal.copilot-cwd"] input');
      cwdField.value = "D:\\work tree";
      cwdField.dispatchEvent(new Event("input", { bubbles: true }));
      cwdField.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }));

      await new Promise((resolve) => setTimeout(resolve, 20));
      state.socket.send = originalSend;
      state.aiProviders = originalProviders;
      state.settings.aiSessionProvider = originalProvider;
      return {
        frames: sent.filter((frame) => frame.type === "input" && frame.id === terminal.id),
        modelGroups,
        modelLabels
      };
    });

    expect(result.modelLabels).toEqual(["Claude Test - 200K tokens", "GPT Test - 128K tokens"]);
    expect(result.modelGroups).toEqual(["Anthropic Claude", "OpenAI GPT"]);
    expect(result.frames.map((frame) => frame.data)
      .filter((data) => data === "\x15" || data.startsWith("/")))
      .toEqual(["\x15", "/model gpt-test\r", "\x15", "/cwd D:\\work tree\r"]);
  });

  test("offers Copilot title suggestions inline for approval or rejection", async () => {
    const originalTitle = await page.locator(".terminal-pane").first().locator(".pane-title").inputValue();
    const setup = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      await new Promise((resolve) => terminal.term.write("npm test\r\n699 tests passed\r\n", resolve));
      const originalProviders = state.aiProviders;
      const originalProvider = state.settings.aiTitleProvider;
      state.aiProviders = [{ id: "copilot", available: true, titleAvailable: true }];
      state.settings.aiTitleProvider = "copilot";
      state.settings.copilotTitleModel = "claude-opus-4.6";
      state.settings.copilotTitleEffort = "medium";
      state.settings.copilotTitleContext = "default";
      state.settings.copilotTitleContextKb = 16;
      state.settings.copilotTitleMinWords = 2;
      state.settings.copilotTitleMaxWords = 8;
      window.__titleFrames = [];
      window.__titleOriginalSend = state.socket.send;
      state.socket.send = (payload) => {
        const frame = JSON.parse(payload);
        window.__titleFrames.push(frame);
        if (frame.type === "generateTerminalTitle") return;
        window.__titleOriginalSend.call(state.socket, payload);
      };
      return { id: terminal.id, originalProviders, originalProvider };
    });

    const pane = page.locator(`.terminal-pane[data-id="${setup.id}"]`);
    await pane.locator(".pane-title-generate").click();
    await expect.poll(() => page.evaluate(() => window.__titleFrames.filter((frame) => frame.type === "generateTerminalTitle").length)).toBe(1);
    await page.evaluate(() => {
      const request = window.__titleFrames.find((frame) => frame.type === "generateTerminalTitle");
      handleBridgeMessage({
        type: "terminalTitleSuggestion",
        requestId: request.requestId,
        title: "Verify MultiTerm Test Suite"
      });
    });
    await expect(pane.locator(".pane-title")).toHaveValue("Verify MultiTerm Test Suite");
    await expect(pane.locator(".pane-title-accept")).toBeVisible();
    await expect(pane.locator(".pane-title-reject")).toBeVisible();
    await pane.locator(".pane-title-reject").click();
    await expect(pane.locator(".pane-title")).toHaveValue(originalTitle);

    await pane.locator(".pane-title-generate").click();
    await expect.poll(() => page.evaluate(() => window.__titleFrames.filter((frame) => frame.type === "generateTerminalTitle").length)).toBe(2);
    await page.evaluate(() => {
      const requests = window.__titleFrames.filter((frame) => frame.type === "generateTerminalTitle");
      handleBridgeMessage({
        type: "terminalTitleSuggestion",
        requestId: requests[1].requestId,
        title: "Verify MultiTerm Test Suite"
      });
    });
    await expect(pane.locator(".pane-title-accept")).toBeVisible();
    await pane.locator(".pane-title-accept").click();
    await expect(pane.locator(".pane-title")).toHaveValue("Verify MultiTerm Test Suite");

    const result = await page.evaluate((profile) => {
      state.socket.send = window.__titleOriginalSend;
      delete window.__titleOriginalSend;
      const frames = window.__titleFrames;
      delete window.__titleFrames;
      state.aiProviders = profile.originalProviders;
      state.settings.aiTitleProvider = profile.originalProvider;
      return {
        requests: frames.filter((frame) => frame.type === "generateTerminalTitle"),
        renames: frames.filter((frame) => frame.type === "title")
      };
    }, setup);
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0]).toMatchObject({
      context: "default",
      effort: "medium",
      maxWords: 8,
      minWords: 2,
      model: "claude-opus-4.6",
      provider: "copilot"
    });
    expect(result.requests[0].text).toContain("699 tests passed");
    expect(result.renames).toContainEqual({
      type: "title",
      id: setup.id,
      title: "Verify MultiTerm Test Suite"
    });
  });

  test("interactive assistant context action applies Copilot session defaults", async () => {
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const sent = [];
      let focused = false;
      const originalSend = state.socket.send;
      const originalFocus = terminal.term.focus;
      const originalProviders = state.aiProviders;
      const originalSettings = {
        context: state.settings.aiSessionContext,
        effort: state.settings.aiSessionEffort,
        model: state.settings.aiSessionModel,
        provider: state.settings.aiSessionProvider
      };
      state.aiProviders = [{ id: "copilot", available: true }];
      state.settings.aiSessionProvider = "copilot";
      state.settings.aiSessionModel = "gpt-5.4";
      state.settings.aiSessionEffort = "high";
      state.settings.aiSessionContext = "long_context";
      state.socket.send = (payload) => sent.push(JSON.parse(payload));
      terminal.term.focus = () => { focused = true; };

      showContextMenu(20, 20, terminal, "");
      const item = [...document.querySelectorAll("#contextMenu .ctx-item")]
        .find((row) => row.textContent.includes("Run GitHub Copilot"));
      const title = item?.title || "";
      item?.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      terminal.term.focus = originalFocus;
      state.socket.send = originalSend;
      state.aiProviders = originalProviders;
      state.settings.aiSessionProvider = originalSettings.provider;
      state.settings.aiSessionModel = originalSettings.model;
      state.settings.aiSessionEffort = originalSettings.effort;
      state.settings.aiSessionContext = originalSettings.context;
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
      title: "Runs GitHub Copilot in the focused terminal, or opens one on this page",
      frames: undefined
    });
    // MultiTerm mints the session UUID so a terminal's notes can be hung off the
    // resume card later, so the id varies while the rest of the command does not.
    const commandIndex = result.frames.findIndex((frame) => typeof frame.data === "string"
      && frame.data.startsWith("copilot --yolo --session-id="));
    expect(commandIndex).toBeGreaterThanOrEqual(0);
    const command = result.frames[commandIndex].data;
    expect(command).toMatch(
      /^copilot --yolo --session-id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} --model "gpt-5\.4" --effort high --context long_context$/
    );
    expect(result.frames.slice(commandIndex, commandIndex + 2)).toEqual([
      { type: "input", id: result.frames[commandIndex].id, data: command },
      { type: "input", id: result.frames[commandIndex].id, data: "\r" }
    ]);
  });

  test("interactive assistant context action applies Claude session defaults", async () => {
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const sent = [];
      const originalSend = state.socket.send;
      const originalProviders = state.aiProviders;
      const originalSettings = {
        context: state.settings.aiSessionContext,
        effort: state.settings.aiSessionEffort,
        model: state.settings.aiSessionModel,
        provider: state.settings.aiSessionProvider
      };
      state.aiProviders = [{ id: "claude", available: true }];
      state.settings.aiSessionProvider = "claude";
      state.settings.aiSessionModel = "claude-sonnet-4-6[1m]";
      state.settings.aiSessionEffort = "high";
      state.settings.aiSessionContext = "default";
      state.socket.send = (payload) => sent.push(JSON.parse(payload));

      showContextMenu(20, 20, terminal, "");
      const item = [...document.querySelectorAll("#contextMenu .ctx-item")]
        .find((row) => row.textContent.includes("Run Claude"));
      item?.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      state.socket.send = originalSend;
      state.aiProviders = originalProviders;
      state.settings.aiSessionProvider = originalSettings.provider;
      state.settings.aiSessionModel = originalSettings.model;
      state.settings.aiSessionEffort = originalSettings.effort;
      state.settings.aiSessionContext = originalSettings.context;
      return sent.filter((frame) => frame.type === "input" && frame.id === terminal.id);
    });

    expect(result.slice(-2)).toEqual([
      {
        type: "input",
        id: result.at(-2).id,
        data: "claude --dangerously-skip-permissions --model \"claude-sonnet-4-6[1m]\" --effort high"
      },
      { type: "input", id: result.at(-2).id, data: "\r" }
    ]);
  });

  test("interactive assistant surface action opens a terminal on the current page when none is focused", async () => {
    const setup = await page.evaluate(() => {
      closeAllTerminals();
      const pageId = addPage({ name: "Copilot page" });
      const existing = addTerminal({ title: "Existing terminal", pageId });
      return { existingId: existing.id, pageId };
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect(page.locator(".pane-status")).toHaveClass(/is-live/);
    await page.evaluate(() => {
      window.__copilotLaunchProfile = {
        providers: state.aiProviders,
        context: state.settings.aiSessionContext,
        effort: state.settings.aiSessionEffort,
        model: state.settings.aiSessionModel,
        provider: state.settings.aiSessionProvider
      };
      state.aiProviders = [{ id: "copilot", available: true }];
      state.settings.aiSessionProvider = "copilot";
      state.settings.aiSessionModel = "gpt-5.4";
      state.settings.aiSessionEffort = "high";
      state.settings.aiSessionContext = "long_context";
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

    const commandPattern = /^copilot --yolo --session-id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} --model "gpt-5\.4" --effort high --context long_context$/;
    await page.getByTitle("Runs GitHub Copilot in the focused terminal, or opens one on this page", { exact: true }).click();
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    // The session UUID MultiTerm mints varies, so the launch is matched by shape.
    await expect.poll(() => page.evaluate((source) => window.__copilotLaunchFrames
      .filter((frame) => frame.type === "input" && (new RegExp(source).test(frame.data) || frame.data === "\r"))
      .map((frame) => (frame.data === "\r" ? "\r" : "command")), commandPattern.source)).toEqual(["command", "\r"]);

    const result = await page.evaluate(({ source, expectedPageId }) => {
      state.socket.send = window.__copilotLaunchOriginalSend;
      delete window.__copilotLaunchOriginalSend;
      const profile = window.__copilotLaunchProfile;
      delete window.__copilotLaunchProfile;
      state.aiProviders = profile.providers;
      state.settings.aiSessionProvider = profile.provider;
      state.settings.aiSessionModel = profile.model;
      state.settings.aiSessionEffort = profile.effort;
      state.settings.aiSessionContext = profile.context;
      const pattern = new RegExp(source);
      const create = window.__copilotLaunchFrames.find((frame) => frame.type === "create");
      const input = window.__copilotLaunchFrames
        .filter((frame) => frame.type === "input"
          && frame.id === create.id
          && (pattern.test(frame.data) || frame.data === "\r"))
        .map((frame) => (frame.data === "\r" ? "\r" : "command"));
      delete window.__copilotLaunchFrames;
      const terminal = state.terminals.get(create.id);
      return {
        expectedPageId,
        input,
        terminalId: terminal.id,
        terminalPageId: terminal.pageId
      };
    }, { source: commandPattern.source, expectedPageId: setup.pageId });
    expect(result.terminalPageId).toBe(setup.pageId);
    expect(result.input).toEqual(["command", "\r"]);

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
      window.__copilotResumeProfile = {
        providers: state.aiProviders,
        context: state.settings.aiSessionContext,
        effort: state.settings.aiSessionEffort,
        model: state.settings.aiSessionModel,
        provider: state.settings.aiSessionProvider
      };
      state.aiProviders = [{ id: "copilot", available: true }];
      state.settings.aiSessionProvider = "copilot";
      state.settings.aiSessionModel = "gpt-5.4";
      state.settings.aiSessionEffort = "high";
      state.settings.aiSessionContext = "long_context";
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

    await page.locator("#contextMenu .ctx-item", { hasText: "Resume GitHub Copilot session" }).click();
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator("#copilotResumeSearch")).toBeFocused();
    await page.locator("#copilotResumeOriginAll").click();
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
      const profile = window.__copilotResumeProfile;
      delete window.__copilotResumeProfile;
      state.aiProviders = profile.providers;
      state.settings.aiSessionProvider = profile.provider;
      state.settings.aiSessionModel = profile.model;
      state.settings.aiSessionEffort = profile.effort;
      state.settings.aiSessionContext = profile.context;
      return sent;
    });
    expect(frames.filter((frame) => frame.type === "input" && frame.data.startsWith("copilot --yolo --resume"))).toEqual([{
      type: "input",
      id: firstId,
      data: "copilot --yolo --resume \"62d43a25-c209-4933-af9a-24d9bff3789c\" --model \"gpt-5.4\" --effort high --context long_context\r"
    }]);
    await page.evaluate((id) => removeTerminal(id), secondId);
  });

  test("lists and resumes a local Claude session in the invoking terminal", async () => {
    const terminalId = await page.evaluate(() => {
      closeAllTerminals();
      const terminal = addTerminal({ title: "Claude resume target" });
      window.__claudeResumeProfile = {
        providers: state.aiProviders,
        context: state.settings.aiSessionContext,
        effort: state.settings.aiSessionEffort,
        model: state.settings.aiSessionModel,
        provider: state.settings.aiSessionProvider
      };
      state.aiProviders = [{ id: "claude", available: true }];
      state.settings.aiSessionProvider = "claude";
      state.settings.aiSessionModel = "claude-sonnet-4-6[1m]";
      state.settings.aiSessionEffort = "high";
      state.settings.aiSessionContext = "default";
      window.__claudeResumeFrames = [];
      window.__claudeResumeOriginalSend = state.socket.send;
      state.socket.send = (payload) => {
        const frame = JSON.parse(payload);
        window.__claudeResumeFrames.push(frame);
        if (frame.type === "listClaudeSessions") {
          window.setTimeout(() => handleBridgeMessage({
            type: "claudeSessions",
            requestId: frame.requestId,
            sessions: [{
              id: "bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
              key: "claude:bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
              source: "claude",
              name: "Continue Claude provider parity",
              cwd: "D:\\multiTerm",
              branch: "main",
              updatedAt: "2026-08-04T00:18:07.329Z"
            }],
            message: ""
          }), 0);
        }
      };
      showContextMenu(20, 20, terminal, "");
      return terminal.id;
    });

    await page.locator("#contextMenu .ctx-item", { hasText: "Resume Claude session" }).click();
    await expect(page.locator("#copilotResumeTitle")).toHaveText("Resume Claude session");
    await expect(page.locator(".copilot-session-card")).toHaveCount(1);
    await expect(page.locator(".copilot-session-card")).toContainText("Continue Claude provider parity");
    await expect(page.locator(".copilot-session-source")).toHaveText("Claude");
    await page.locator(".copilot-session-card").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();

    const frames = await page.evaluate(() => {
      state.socket.send = window.__claudeResumeOriginalSend;
      delete window.__claudeResumeOriginalSend;
      const sent = window.__claudeResumeFrames;
      delete window.__claudeResumeFrames;
      const profile = window.__claudeResumeProfile;
      delete window.__claudeResumeProfile;
      state.aiProviders = profile.providers;
      state.settings.aiSessionProvider = profile.provider;
      state.settings.aiSessionModel = profile.model;
      state.settings.aiSessionEffort = profile.effort;
      state.settings.aiSessionContext = profile.context;
      return sent;
    });
    expect(frames).toContainEqual(expect.objectContaining({ type: "listClaudeSessions" }));
    expect(frames).toContainEqual({
      type: "input",
      id: terminalId,
      data: "claude --dangerously-skip-permissions --resume \"bdfb990d-4ee9-4b72-a41c-fcbf0c79a373\" --model \"claude-sonnet-4-6[1m]\" --effort high\r"
    });
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
        } else if (frame.type === "validateDirectory") {
          window.setTimeout(() => handleBridgeMessage({
            type: "directoryValidation",
            requestId: frame.requestId,
            kind: "host",
            valid: true,
            path: frame.path,
            error: ""
          }), 0);
        } else {
          window.__allCopilotOriginalSend.call(this, payload);
        }
      };
    });

    await page.locator("#copilotSessionsToggle").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await page.locator("#copilotResumeOriginAll").click();
    await page.locator("#copilotResumeSourceFilter").selectOption("all");
    await expect(page.locator(".copilot-session-card")).toHaveCount(3);
    await expect(page.locator(".copilot-session-source")).toHaveText(["Copilot CLI", "VS Code", "Visual Studio"]);
    await page.locator(".copilot-session-card", { hasText: "VS Code history" }).click();
    await expect(page.locator("#cwdChangeOverlay")).toBeVisible();
    await expect(page.locator("#cwdChangeInput")).toHaveValue("C:\\src\\Yagu");
    await expect(page.locator("#cwdChangeSend")).toBeEnabled();
    await expect(page.locator(".terminal-pane")).toHaveCount(before);
    await page.locator("#cwdChangeSend").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
    await expect(page.locator("#cwdChangeOverlay")).toBeHidden();
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
    expect(frames.some((frame) => frame.type === "input"
      && frame.data.includes("copilot --yolo")
      && frame.data.includes("--session-id=")
      && frame.data.includes(" -i "))).toBe(true);
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()].at(-1);
      removeTerminal(terminal.id);
    });
  });

  test("filters the resume catalog with a validated Copilot AI search", async () => {
    const profile = await page.evaluate(() => {
      const saved = {
        providers: state.aiProviders,
        provider: state.settings.aiSessionProvider,
        contextKb: state.settings.copilotSessionSearchContextKb
      };
      state.aiProviders = [{ id: "copilot", available: true, interactiveAvailable: true }];
      state.settings.aiSessionProvider = "copilot";
      state.settings.copilotSessionSearchContextKb = 1536;
      const sessions = [
        {
          id: "bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
          key: "cli:bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
          source: "cli",
          name: "Database migration",
          cwd: "D:\\db",
          updatedAt: "2026-08-04T00:18:07.329Z"
        },
        {
          id: "62d43a25-c209-4933-af9a-24d9bff3789c",
          key: "vscode:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:62d43a25-c209-4933-af9a-24d9bff3789c",
          source: "vscode",
          name: "OAuth refresh flow",
          cwd: "D:\\auth",
          updatedAt: "2026-08-03T20:47:02.240Z"
        },
        {
          id: "70ea177d-5558-40c4-b068-2477e84b9325",
          key: "visualstudio:70ea177d-5558-40c4-b068-2477e84b9325:123456789abc",
          source: "visualstudio",
          name: "Terminal rendering",
          cwd: "D:\\terminal",
          updatedAt: "2026-08-02T20:47:02.240Z"
        }
      ];
      window.__aiSearchFrames = [];
      window.__aiSearchOriginalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        window.__aiSearchFrames.push(frame);
        if (frame.type === "listCopilotSessions") {
          window.setTimeout(() => handleBridgeMessage({
            type: "copilotSessions",
            requestId: frame.requestId,
            sessions,
            message: ""
          }), 0);
        } else if (frame.type === "searchCopilotSessions") {
          window.setTimeout(() => handleBridgeMessage({
            type: "copilotSessionSearch",
            requestId: frame.requestId,
            keys: [sessions[0].key, sessions[1].key, "unsafe:invented-key"]
          }), 0);
        } else {
          window.__aiSearchOriginalSend.call(this, payload);
        }
      };
      return saved;
    });

    await page.locator("#copilotSessionsToggle").click();
    await page.locator("#copilotResumeOriginAll").click();
    await page.locator("#copilotResumeSourceFilter").selectOption("all");
    await expect(page.locator(".copilot-session-card")).toHaveCount(3);
    await page.locator("#copilotResumeSearch").fill("Find sessions where I worked on data storage or login tokens");
    await page.locator("#copilotResumeAiSearch").click();
    await expect(page.locator("#copilotResumeAiSearch")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".copilot-session-card")).toHaveCount(2);
    await expect(page.locator(".copilot-session-card")).toContainText(["Database migration", "OAuth refresh flow"]);
    await expect(page.locator("#copilotResumeStatus")).toHaveText("2 of 2 AI matches");

    await page.locator("#copilotResumeSearch").fill("terminal rendering");
    await expect(page.locator("#copilotResumeAiSearch")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".copilot-session-card")).toHaveCount(1);
    await expect(page.locator(".copilot-session-card")).toContainText("Terminal rendering");

    await page.locator("#copilotResumeSearch").fill("nothing matches this literal query");
    await expect(page.locator(".copilot-session-card")).toHaveCount(0);
    await expect(page.locator(".copilot-resume-empty")).toContainText("No sessions match this search. Search sessions with AI");
    await page.getByRole("button", { name: "Search sessions with AI", exact: true }).click();
    await expect(page.locator(".copilot-session-card")).toHaveCount(2);

    const request = await page.evaluate((profile) => {
      closeCopilotResume();
      state.socket.send = window.__aiSearchOriginalSend;
      const frame = window.__aiSearchFrames.find((entry) => entry.type === "searchCopilotSessions");
      state.aiProviders = profile.providers;
      state.settings.aiSessionProvider = profile.provider;
      state.settings.copilotSessionSearchContextKb = profile.contextKb;
      delete window.__aiSearchFrames;
      delete window.__aiSearchOriginalSend;
      return frame;
    }, profile);
    expect(request).toMatchObject({
      type: "searchCopilotSessions",
      contextKb: 1536,
      query: "Find sessions where I worked on data storage or login tokens"
    });
  });

  test("returns to the preserved session picker when CWD confirmation is cancelled", async () => {
    const before = await page.locator(".terminal-pane").count();
    await page.evaluate(() => {
      const sessions = [{
        id: "bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
        key: "cli:bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
        source: "cli",
        name: "Preserve picker state",
        cwd: "D:\\multiTerm",
        updatedAt: "2026-08-04T00:18:07.329Z"
      }];
      window.__cancelResumeOriginalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        if (frame.type === "listCopilotSessions") {
          window.setTimeout(() => handleBridgeMessage({
            type: "copilotSessions",
            requestId: frame.requestId,
            sessions,
            message: ""
          }), 0);
        } else if (frame.type === "validateDirectory") {
          window.setTimeout(() => handleBridgeMessage({
            type: "directoryValidation",
            requestId: frame.requestId,
            kind: "host",
            valid: true,
            path: frame.path,
            error: ""
          }), 0);
        } else {
          window.__cancelResumeOriginalSend.call(this, payload);
        }
      };
    });

    await page.locator("#copilotSessionsToggle").click();
    await page.locator("#copilotResumeOriginAll").click();
    await page.locator("#copilotResumeSearch").fill("preserve picker");
    await page.locator(".copilot-session-card").click();
    await expect(page.locator("#cwdChangeOverlay")).toBeVisible();
    await page.locator("#cwdChangeCancel").click();
    await expect(page.locator("#cwdChangeOverlay")).toBeHidden();
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator("#copilotResumeSearch")).toHaveValue("preserve picker");
    await expect(page.locator(".copilot-session-card")).toHaveCount(1);
    await expect(page.locator(".terminal-pane")).toHaveCount(before);
    await page.evaluate(() => {
      closeCopilotResume();
      state.socket.send = window.__cancelResumeOriginalSend;
      delete window.__cancelResumeOriginalSend;
    });
  });

  test("blocks changed Claude resume folders when the installed version lacks /cd", async () => {
    const profile = await page.evaluate(() => {
      const saved = {
        providers: state.aiProviders,
        provider: state.settings.aiSessionProvider
      };
      state.aiProviders = [{
        id: "claude",
        available: true,
        interactiveAvailable: true,
        cwdChangeAvailable: false,
        cwdChangeStatus: "Changing a Claude session directory requires Claude Code 2.1.169 or newer."
      }];
      state.settings.aiSessionProvider = "claude";
      copilotResume.newTerminal = true;
      copilotResume.provider = "claude";
      window.__oldClaudeOriginalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        if (frame.type === "validateDirectory") {
          window.setTimeout(() => handleBridgeMessage({
            type: "directoryValidation",
            requestId: frame.requestId,
            kind: "host",
            valid: true,
            path: frame.path,
            error: ""
          }), 0);
        }
      };
      openResumeCwdChange({
        id: "bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
        key: "claude:bdfb990d-4ee9-4b72-a41c-fcbf0c79a373",
        source: "claude",
        name: "Old Claude relocation",
        cwd: "D:\\saved Claude project"
      });
      return saved;
    });

    await page.locator("#cwdChangeInput").fill("D:\\different Claude project");
    await expect(page.locator("#cwdChangeSend")).toBeDisabled();
    await expect(page.locator("#cwdChangeStatus")).toContainText("2.1.169 or newer");
    await page.evaluate((profile) => {
      closeCwdChange({ restoreResume: false });
      state.socket.send = window.__oldClaudeOriginalSend;
      state.aiProviders = profile.providers;
      state.settings.aiSessionProvider = profile.provider;
      copilotResume.newTerminal = false;
      copilotResume.provider = "copilot";
      copilotResume.suspended = false;
      delete window.__oldClaudeOriginalSend;
    }, profile);
  });

  test("resumes a native session in its saved folder then relocates once Copilot is ready", async () => {
    const before = await page.locator(".terminal-pane").count();
    const setup = await page.evaluate(() => {
      const profile = {
        providers: state.aiProviders,
        provider: state.settings.aiSessionProvider
      };
      state.aiProviders = [{ id: "copilot", available: true, interactiveAvailable: true, cwdChangeAvailable: true }];
      state.settings.aiSessionProvider = "copilot";
      const session = {
        id: "62d43a25-c209-4933-af9a-24d9bff3789c",
        key: "cli:62d43a25-c209-4933-af9a-24d9bff3789c",
        source: "cli",
        name: "Native relocation",
        cwd: "D:\\saved project",
        updatedAt: "2026-08-04T00:18:07.329Z"
      };
      window.__nativeResumeProfile = profile;
      window.__nativeResumeFrames = [];
      window.__nativeResumeOriginalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        window.__nativeResumeFrames.push(frame);
        if (frame.type === "listCopilotSessions") {
          window.setTimeout(() => handleBridgeMessage({
            type: "copilotSessions",
            requestId: frame.requestId,
            sessions: [session],
            message: ""
          }), 0);
        } else if (frame.type === "validateDirectory") {
          window.setTimeout(() => handleBridgeMessage({
            type: "directoryValidation",
            requestId: frame.requestId,
            kind: "host",
            valid: true,
            path: frame.path,
            error: ""
          }), 0);
        } else {
          window.__nativeResumeOriginalSend.call(this, payload);
        }
      };
      return session;
    });

    await page.locator("#copilotSessionsToggle").click();
    await page.locator("#copilotResumeOriginAll").click();
    await page.locator(".copilot-session-card", { hasText: "Native relocation" }).click();
    await page.locator("#cwdChangeInput").fill("D:\\chosen project");
    await expect(page.locator("#cwdChangeSend")).toBeEnabled();
    await page.locator("#cwdChangeSend").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 1);
    await expect(page.locator(".terminal-pane").last().locator(".pane-status")).toHaveClass(/is-live/);

    const relocation = await page.evaluate(() => {
      const terminal = [...state.terminals.values()].at(-1);
      const beforeRelocation = { ...terminal.pendingCwdChange };
      const originalReadiness = terminalExecutionReadiness;
      terminal.aiAssistantTuiProvider = "copilot";
      terminalExecutionReadiness = () => ({ mode: "copilot", ready: true });
      schedulePendingCwdChange(terminal);
      terminalExecutionReadiness = originalReadiness;
      return {
        beforeRelocation,
        cwd: terminal.cwd,
        id: terminal.id,
        pending: terminal.pendingCwdChange
      };
    });
    expect(relocation.beforeRelocation).toEqual({ path: "D:\\chosen project", provider: "copilot" });
    expect(relocation.cwd).toBe("D:\\chosen project");
    expect(relocation.pending).toBeNull();

    const frames = await page.evaluate(() => {
      state.socket.send = window.__nativeResumeOriginalSend;
      const frames = window.__nativeResumeFrames;
      const profile = window.__nativeResumeProfile;
      state.aiProviders = profile.providers;
      state.settings.aiSessionProvider = profile.provider;
      delete window.__nativeResumeOriginalSend;
      delete window.__nativeResumeFrames;
      delete window.__nativeResumeProfile;
      const terminal = [...state.terminals.values()].at(-1);
      removeTerminal(terminal.id);
      return frames;
    });
    expect(frames).toContainEqual(expect.objectContaining({
      type: "create",
      cwd: setup.cwd
    }));
    expect(frames).toContainEqual({ type: "input", id: relocation.id, data: "/cwd D:\\chosen project" });
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
      state.settings.notifyQuestions = false;
      state.settings.notifySilence = false;
      state.settings.bellNotify = false;
      saveSettings();
      state.settings.layout = "vertical";
      elements.layoutMode.value = "vertical";
      applySettings();
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
    const geometry = await page.evaluate(() => {
      const anchor = terminalNotificationFlyoutAnchor.getBoundingClientRect();
      const flyout = elements.terminalNotificationFlyout.getBoundingClientRect();
      const centeredLeft = anchor.left + (anchor.width - flyout.width) / 2;
      return {
        expectedLeft: Math.max(8, Math.min(centeredLeft, innerWidth - flyout.width - 8)),
        expectedTop: anchor.bottom + 7,
        left: flyout.left,
        top: flyout.top
      };
    });
    expect(geometry.left).toBeCloseTo(geometry.expectedLeft, 0);
    expect(geometry.top).toBeCloseTo(geometry.expectedTop, 0);

    await flyout.locator('[data-notification-channel="activity"] [data-notification-value="on"]').click();
    await flyout.locator('[data-notification-channel="question"] [data-notification-value="on"]').click();
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
      setAwaitingInput(targetTerminal, false, "question");
      handleBell(targetTerminal);
      window.Notification = NativeNotification;
      return {
        bodies,
        overrides: targetTerminal.notificationOverrides,
        saved: JSON.parse(localStorage.getItem("multiterm.lastSession"))
          .find((entry) => entry.id === targetTerminal.id)?.notificationOverrides
      };
    });
    expect(result.bodies).toEqual(["Activity in Build watcher", "Question in Build watcher", "Bell in Build watcher"]);
    expect(result.overrides).toEqual({ activity: true, question: true, idle: false, bell: true });
    expect(result.saved).toEqual(result.overrides);

    const inheritedIdle = await page.evaluate(() => {
      const terminal = [...state.terminals.values()].find((entry) => entry.titleInput.value === "Build watcher");
      state.settings.notifySilence = true;
      terminal.notificationOverrides = { activity: true };
      terminal.hadOutput = true;
      terminal.silenceTimer = window.setTimeout(() => {}, 60000);
      const timer = terminal.silenceTimer;
      renderTerminalNotificationFlyout();
      elements.terminalNotificationReset.click();
      return { hadOutput: terminal.hadOutput, timerPreserved: terminal.silenceTimer === timer };
    });
    expect(inheritedIdle).toEqual({ hadOutput: true, timerPreserved: true });
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()].find((entry) => entry.titleInput.value === "Build watcher");
      window.clearTimeout(terminal.silenceTimer);
      terminal.hadOutput = false;
      state.settings.notifySilence = false;
      terminal.notificationOverrides = { activity: true, question: true, idle: false, bell: true };
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
      .toEqual({ activity: true, question: true, idle: false, bell: true });

    const lifecycle = await page.evaluate(() => {
      const expected = { activity: true, question: true, idle: false, bell: true };
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

  test("alerts once for a Claude question form even when prompt highlighting is off", async () => {
    const result = await page.evaluate(() => {
      const lines = [
        "Claude Code v2.0.27",
        "What angle do you want to take with this post?",
        "❯ 1. Feature announcement/demo",
        "Show off the new capability with examples of how it works",
        "2. User benefit story",
        "Focus on the problem this solves and how it improves the experience",
        "3. Technical insight",
        "4. Broader AI interaction trend",
        "5. Type something.",
        "Enter to select · Tab/Arrow keys to navigate · Esc to cancel"
      ];
      const buffer = {
        baseY: 0,
        cursorX: lines.at(-1).length,
        cursorY: lines.length - 1,
        length: lines.length,
        type: "alternate",
        getLine(index) {
          return index >= 0 && index < lines.length
            ? { isWrapped: false, translateToString: () => lines[index] }
            : null;
        }
      };
      const pane = document.createElement("div");
      const terminal = {
        aiAssistantTuiProvider: "claude",
        awaitingInput: false,
        awaitingQuestion: false,
        id: "claude-question-fixture",
        notificationOverrides: {},
        pane,
        status: "live",
        term: { buffer: { active: buffer }, rows: lines.length },
        titleInput: { value: "Claude planning" }
      };
      const NativeNotification = window.Notification;
      const previousHighlight = state.settings.highlightInputPrompts;
      const previousQuestions = state.settings.notifyQuestions;
      const bodies = [];
      class NotificationRecorder {
        static permission = "granted";
        constructor(_title, options) { bodies.push(options.body); }
      }
      window.Notification = NotificationRecorder;
      state.settings.highlightInputPrompts = false;
      state.settings.notifyQuestions = true;
      evaluateInputPrompt(terminal);
      evaluateInputPrompt(terminal);
      const firstPass = {
        awaitingQuestion: terminal.awaitingQuestion,
        bodies: [...bodies],
        highlighted: pane.classList.contains("is-awaiting-input")
      };
      setAwaitingInput(terminal, false, "");
      evaluateInputPrompt(terminal);
      window.Notification = NativeNotification;
      state.settings.highlightInputPrompts = previousHighlight;
      state.settings.notifyQuestions = previousQuestions;
      return { firstPass, rearmedBodies: bodies };
    });

    expect(result.firstPass).toEqual({
      awaitingQuestion: true,
      bodies: ["Question in Claude planning"],
      highlighted: false
    });
    expect(result.rearmedBodies).toEqual([
      "Question in Claude planning",
      "Question in Claude planning"
    ]);
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
