/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const { test, expect } = require("../support/renderer-coverage");

async function reset(page, count = 1) {
  await page.goto("/");
  await expect(page.locator("#statusConn")).toHaveText("Connected");
  await page.evaluate(() => closeAllTerminals());
  await expect(page.locator(".terminal-pane")).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.removeItem("multiterm.terminalArtifacts");
    state.terminalArtifacts = emptyTerminalArtifacts();
    updateTerminalArtifactIndicators();
  });
  for (let index = 0; index < count; index += 1) {
    await page.evaluate((number) => addTerminal({ title: `Artifact terminal ${number}` }), index + 1);
  }
  await expect(page.locator(".terminal-pane")).toHaveCount(count);
  await expect
    .poll(() => page.evaluate(() => [...state.terminals.values()].filter((terminal) => terminal.status === "live").length))
    .toBe(count);
}

test.describe("Terminal notes and command queue", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      closeTerminalNotesFlyout({ restoreFocus: false });
      closeTerminalArtifacts({ restoreFocus: false });
      closeAllTerminals();
      localStorage.removeItem("multiterm.terminalArtifacts");
      state.terminalArtifacts = emptyTerminalArtifacts();
    });
  });

  test("saves PID-bound notes and restores them after a reload", async ({ page }) => {
    await reset(page);
    await page.locator('.terminal-pane [data-action="artifacts"]').click();

    await expect(page.locator("#terminalNotesFlyout")).toBeVisible();
    await expect(page.locator("#terminalNotesFlyoutEmpty")).toBeVisible();
    await page.locator("#terminalNotesFlyoutAdd").click();
    await expect(page.locator("#terminalArtifactsOverlay")).toBeVisible();
    await expect(page.locator("#terminalArtifactsTarget option").first()).toContainText(/PID \d+/);
    await page.locator("#terminalNotesInput").fill("Investigate the parser edge case.\nKeep the reproduction command.");
    await expect(page.locator("#terminalNotesSaved")).toHaveText("Saved");

    const stored = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const record = state.terminalArtifacts.terminals[terminal.id];
      return { notes: record.notes, pid: record.pid, terminalPid: terminal.pid, terminalId: terminal.id };
    });
    expect(stored.notes).toContain("parser edge case");
    expect(stored.pid).toBe(stored.terminalPid);

    await page.locator("#terminalArtifactsClose").click();
    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate((id) => state.terminals.has(id), stored.terminalId)).toBe(true);
    await page.locator("#terminalArtifactsToggle").click();
    await page.locator("#terminalArtifactsTarget").selectOption(stored.terminalId);
    await expect(page.locator("#terminalNotesInput")).toHaveValue(stored.notes);
  });

  test("previews, edits, and deletes a note from the centered pane flyout", async ({ page }) => {
    await reset(page);
    const note = "Investigate the parser edge case before release.\nKeep the reproduction command and compare the next trace.";
    await page.locator("#terminalArtifactsToggle").click();
    await page.locator("#terminalNotesInput").fill(note);
    await expect(page.locator("#terminalNotesSaved")).toHaveText("Saved");
    await page.locator("#terminalArtifactsClose").click();
    await expect(page.locator("#terminalArtifactsOverlay")).toBeHidden();

    const notesButton = page.locator('.terminal-pane [data-action="artifacts"]');
    await notesButton.click();
    const flyout = page.locator("#terminalNotesFlyout");
    await expect(flyout).toBeVisible();
    await expect(notesButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#terminalNotesFlyoutSubtitle")).toContainText(/Artifact terminal 1 · PID \d+/);
    await expect(page.locator(".terminal-notes-flyout-preview")).toHaveText(note);
    await expect(page.locator(".terminal-notes-flyout-time")).toHaveText(/^Saved /);
    await expect(page.locator(".terminal-notes-flyout-time")).not.toHaveAttribute("datetime", "");
    await expect(page.locator(".terminal-notes-flyout-preview")).toHaveCSS("-webkit-line-clamp", "4");

    const geometry = await page.evaluate(() => {
      const anchor = document.querySelector('.terminal-pane [data-action="artifacts"]').getBoundingClientRect();
      const preview = elements.terminalNotesFlyout.getBoundingClientRect();
      const unclampedLeft = anchor.left + (anchor.width - preview.width) / 2;
      const expectedLeft = Math.max(8, Math.min(unclampedLeft, innerWidth - preview.width - 8));
      return {
        expectedLeft,
        flyoutLeft: preview.left,
        flyoutTop: preview.top,
        expectedTop: anchor.bottom + 7,
        overflow: preview.right > innerWidth || preview.bottom > innerHeight
      };
    });
    expect(Math.abs(geometry.flyoutLeft - geometry.expectedLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.flyoutTop - geometry.expectedTop)).toBeLessThanOrEqual(1);
    expect(geometry.overflow).toBe(false);

    await page.locator('[data-notes-flyout-edit]').click();
    await expect(flyout).toBeHidden();
    await expect(page.locator("#terminalArtifactsOverlay")).toBeVisible();
    await expect(page.locator("#terminalNotesInput")).toBeFocused();
    await expect(page.locator("#terminalNotesInput")).toHaveValue(note);
    await page.locator("#terminalArtifactsClose").click();

    await notesButton.click();
    await page.locator('[data-notes-flyout-delete]').click();
    await expect(page.locator("#terminalNotesFlyoutEmpty")).toBeVisible();
    await expect(notesButton).not.toHaveClass(/has-artifacts/);
    await expect.poll(() => page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const record = state.terminalArtifacts.terminals[terminal.id];
      return { notes: record.notes, notesUpdatedAt: record.notesUpdatedAt };
    })).toEqual({ notes: "", notesUpdatedAt: null });

    await page.locator("#terminalNotesFlyoutDetails").click();
    await expect(flyout).toBeHidden();
    await expect(page.locator("#terminalArtifactsOverlay")).toBeVisible();
    await expect(page.locator("#terminalNotesInput")).toHaveValue("");
  });

  test("uses the same notes flyout when the pane action is in overflow", async ({ page }) => {
    await reset(page);
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      terminal.pane.querySelector('[data-action="artifacts"]').dataset.autoOverflow = "true";
    });

    const more = page.locator('.terminal-pane [data-action="more"]');
    await more.click();
    // The row also advertises the action's remappable shortcut, so match the
    // label rather than the whole accessible name.
    await page.locator('#contextMenu [data-header-action="artifacts"]').click();

    await expect(page.locator("#contextMenu")).toBeHidden();
    await expect(page.locator("#terminalNotesFlyout")).toBeVisible();
    await expect(page.locator("#terminalNotesFlyoutEmpty")).toBeVisible();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    const gap = await page.evaluate(() => {
      const anchor = document.querySelector('.terminal-pane [data-action="more"]').getBoundingClientRect();
      const flyout = elements.terminalNotesFlyout.getBoundingClientRect();
      return flyout.top - anchor.bottom;
    });
    expect(Math.abs(gap - 7)).toBeLessThanOrEqual(1);
  });

  test("dequeues a command by inserting it without Enter", async ({ page }) => {
    await reset(page);
    await page.locator("#terminalArtifactsToggle").click();
    await page.locator("#commandQueueInput").fill("copilot --model gpt-test");
    await page.locator("#commandQueueAdd").click();
    await expect(page.locator(".command-queue-item")).toHaveCount(1);
    await expect(page.locator("#terminalArtifactsBadge")).toHaveText("1");

    await page.evaluate(() => {
      window.__artifactFrames = [];
      window.__artifactOriginalSend = state.socket.send.bind(state.socket);
      state.socket.send = (payload) => window.__artifactFrames.push(JSON.parse(payload));
    });
    await page.locator(".command-queue-send").click();

    const result = await page.evaluate(() => {
      const frames = window.__artifactFrames.filter((frame) => frame.type === "input");
      state.socket.send = window.__artifactOriginalSend;
      return {
        frames,
        queued: Object.values(state.terminalArtifacts.terminals).flatMap((record) => record.queue).length,
        overlayHidden: elements.terminalArtifactsOverlay.hidden
      };
    });
    expect(result.frames).toEqual([
      { type: "input", id: expect.any(String), data: "copilot --model gpt-test" }
    ]);
    expect(result.frames[0].data).not.toMatch(/[\r\n]$/);
    expect(result.queued).toBe(0);
    expect(result.overlayHidden).toBe(false);
    await expect(page.locator("#terminalArtifactsOverlay")).toBeHidden();
  });

  test("quickly dequeues FIFO commands from the pane and keyboard", async ({ page }) => {
    await reset(page);
    await page.locator("#terminalArtifactsToggle").click();
    for (const command of ["first staged prompt", "second staged prompt"]) {
      await page.locator("#commandQueueInput").fill(command);
      await page.locator("#commandQueueAdd").click();
    }
    await page.locator("#terminalArtifactsClose").click();
    await expect(page.locator("#terminalArtifactsOverlay")).toBeHidden();

    const dequeue = page.locator('.terminal-pane [data-action="dequeue"]');
    await expect(dequeue).toBeVisible();
    await expect(dequeue.locator("svg")).toHaveCount(1);
    await expect(dequeue.locator(".pane-dequeue-badge")).toHaveText("2");
    await expect(dequeue).toHaveAttribute("title", /first staged prompt/);

    await page.evaluate(() => {
      window.__artifactFrames = [];
      window.__artifactOriginalSend = state.socket.send.bind(state.socket);
      state.socket.send = (payload) => window.__artifactFrames.push(JSON.parse(payload));
    });
    await dequeue.click();
    await expect(dequeue.locator(".pane-dequeue-badge")).toHaveText("1");
    await expect(dequeue).toHaveAttribute("title", /second staged prompt/);

    await page.keyboard.press("Control+Shift+Q");
    await expect(dequeue).toBeHidden();
    const result = await page.evaluate(() => {
      const frames = window.__artifactFrames.filter(
        (frame) => frame.type === "input" && !/^\u001b\[[IO]$/.test(frame.data)
      );
      state.socket.send = window.__artifactOriginalSend;
      return {
        frames,
        queued: Object.values(state.terminalArtifacts.terminals).flatMap((record) => record.queue).length,
        overlayHidden: elements.terminalArtifactsOverlay.hidden
      };
    });
    expect(result.frames).toEqual([
      { type: "input", id: expect.any(String), data: "first staged prompt" },
      { type: "input", id: expect.any(String), data: "second staged prompt" }
    ]);
    expect(result.frames.every((frame) => !/[\r\n]$/.test(frame.data))).toBe(true);
    expect(result.queued).toBe(0);
    expect(result.overlayHidden).toBe(true);
  });

  test("queues from the translucent pane button and executes at a confirmed shell prompt", async ({ page }) => {
    await reset(page);
    const add = page.locator(".pane-queue-add");
    expect(Number(await add.evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(0.3);
    await add.hover();
    await expect.poll(() => add.evaluate((element) => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0.9);

    await page.evaluate(() => {
      window.__autoQueueOriginalReadiness = terminalExecutionReadiness;
      terminalExecutionReadiness = () => ({ mode: "shell", ready: false });
    });
    await add.click();
    await expect(page.locator(".pane-quick-queue")).toBeVisible();
    await expect(page.locator(".pane-quick-queue-input")).toBeFocused();
    await page.locator(".pane-quick-queue-input").fill("echo automatic-one");
    await page.locator(".pane-quick-queue-input").press("Enter");
    await expect(page.locator(".pane-quick-queue")).toBeHidden();
    await expect(page.locator(".pane-queue-add-badge")).toHaveText("1");

    const stored = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      return state.terminalArtifacts.terminals[terminal.id].queue[0];
    });
    expect(stored).toMatchObject({ command: "echo automatic-one", runWhenReady: true });

    await page.locator('#terminalArtifactsToggle').click();
    await expect(page.locator(".command-queue-item.is-auto")).toContainText("Runs automatically when ready");
    await page.locator("#terminalArtifactsClose").click();

    await page.evaluate(() => {
      window.__autoQueueFrames = [];
      window.__autoQueueOriginalSend = state.socket.send;
      state.socket.send = (payload) => window.__autoQueueFrames.push(JSON.parse(payload));
      terminalExecutionReadiness = window.__autoQueueOriginalReadiness;
      delete window.__autoQueueOriginalReadiness;
      scheduleAutomaticQueueCheck([...state.terminals.values()][0], 0);
    });
    await expect.poll(() => page.evaluate(() => window.__autoQueueFrames
      .filter((frame) => frame.type === "input" && (frame.data === "echo automatic-one" || frame.data === "\r"))
      .map((frame) => frame.data))).toEqual(["echo automatic-one", "\r"]);

    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      state.socket.send = window.__autoQueueOriginalSend;
      delete window.__autoQueueOriginalSend;
      delete window.__autoQueueFrames;
      return state.terminalArtifacts.terminals[terminal.id].queue.length;
    });
    expect(result).toBe(0);
    await expect(page.locator(".pane-queue-add-badge")).toBeHidden();

    await page.evaluate(() => {
      window.__quickQueueResponsiveSettings = {
        headerHidden: state.settings.headerHidden,
        layout: state.settings.layout,
        pagerPlacement: state.settings.pagerPlacement,
        sidecarHidden: state.settings.sidecarHidden
      };
      state.settings.headerHidden = true;
      state.settings.layout = "auto";
      state.settings.sidecarHidden = true;
      setPagerPlacement("bottom");
      applySettings();
      elements.host.scrollTo(0, 0);
    });
    await page.setViewportSize({ width: 390, height: 720 });
    await page.waitForTimeout(200);
    await page.evaluate(() => setPaneQuickQueueOpen([...state.terminals.values()][0], true));
    const geometry = await page.locator(".pane-quick-queue").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const pane = element.closest(".terminal-pane").getBoundingClientRect();
      return {
        left: rect.left,
        paneLeft: pane.left,
        paneRight: pane.right,
        right: rect.right,
        overflow: element.scrollWidth > element.clientWidth
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(geometry.paneLeft);
    expect(geometry.right).toBeLessThanOrEqual(geometry.paneRight);
    expect(geometry.overflow).toBe(false);
    await page.evaluate(() => setPaneQuickQueueOpen([...state.terminals.values()][0], false));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() => {
      Object.assign(state.settings, window.__quickQueueResponsiveSettings);
      setPagerPlacement(state.settings.pagerPlacement);
      delete window.__quickQueueResponsiveSettings;
      applySettings();
    });
  });

  test("runs automatic shell commands FIFO only after fresh completion output", async ({ page }) => {
    await reset(page);
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      window.__autoQueueOriginalReadiness = terminalExecutionReadiness;
      terminalExecutionReadiness = () => ({ mode: "shell", ready: true });
      window.__autoQueueFrames = [];
      window.__autoQueueOriginalSend = state.socket.send;
      state.socket.send = (payload) => window.__autoQueueFrames.push(JSON.parse(payload));
      queueAutomaticTerminalCommand(terminal, "echo first-auto");
      queueAutomaticTerminalCommand(terminal, "echo second-auto");
      scheduleAutomaticQueueCheck(terminal, 0);
    });

    await expect.poll(() => page.evaluate(() => window.__autoQueueFrames
      .filter((frame) => frame.type === "input" && (frame.data.startsWith("echo ") || frame.data === "\r"))
      .map((frame) => frame.data))).toEqual(["echo first-auto", "\r"]);
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.__autoQueueFrames
      .filter((frame) => frame.type === "input" && frame.data === "echo second-auto").length)).toBe(0);

    await page.evaluate(() => writeTerminal(
      [...state.terminals.values()][0],
      "echo first-auto\r\nPS D:\\multiTerm>"
    ));
    await expect.poll(() => page.evaluate(() => window.__autoQueueFrames
      .filter((frame) => frame.type === "input" && (frame.data.startsWith("echo ") || frame.data === "\r"))
      .map((frame) => frame.data))).toEqual([
      "echo first-auto",
      "\r",
      "echo second-auto",
      "\r"
    ]);

    await page.evaluate(() => {
      state.socket.send = window.__autoQueueOriginalSend;
      terminalExecutionReadiness = window.__autoQueueOriginalReadiness;
      delete window.__autoQueueOriginalSend;
      delete window.__autoQueueOriginalReadiness;
      delete window.__autoQueueFrames;
    });
  });

  test("waits for Copilot to finish and submits with kitty Enter", async ({ page }) => {
    await reset(page);
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      window.__autoQueueOriginalReadiness = terminalExecutionReadiness;
      terminalExecutionReadiness = () => ({ mode: "copilot", ready: false });
      window.__autoQueueFrames = [];
      window.__autoQueueOriginalSend = state.socket.send;
      state.socket.send = (payload) => window.__autoQueueFrames.push(JSON.parse(payload));
      queueAutomaticTerminalCommand(terminal, "Review the latest test failure");
      scheduleAutomaticQueueCheck(terminal, 0);
    });
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.__autoQueueFrames.filter((frame) => frame.type === "input").length)).toBe(0);

    await page.evaluate(() => {
      terminalExecutionReadiness = () => ({ mode: "copilot", ready: true });
      scheduleAutomaticQueueCheck([...state.terminals.values()][0], 0);
    });
    await expect.poll(() => page.evaluate(() => window.__autoQueueFrames
      .filter((frame) => frame.type === "input" && (frame.data === "Review the latest test failure" || frame.data === "\x1b[13u"))
      .map((frame) => frame.data))).toEqual(["Review the latest test failure", "\x1b[13u"]);

    await page.evaluate(() => {
      state.socket.send = window.__autoQueueOriginalSend;
      terminalExecutionReadiness = window.__autoQueueOriginalReadiness;
      delete window.__autoQueueOriginalSend;
      delete window.__autoQueueOriginalReadiness;
      delete window.__autoQueueFrames;
    });
  });

  test("runs a queued prompt in a reattached idle Copilot composer", async ({ page }) => {
    await reset(page);
    const readiness = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      terminal.aiAssistantTuiProvider = "";
      terminal.term.reset();
      await new Promise((resolve) => terminal.term.write([
        " C:\\work                                      Session: 360 AIC used",
        "────────────────────────────────────────────────────────────",
        "❯",
        "────────────────────────────────────────────────────────────",
        " / commands · ? help · tab next tab       Claude Opus 5 · 1M context"
      ].join("\r\n"), resolve));

      window.__reattachedQueueFrames = [];
      window.__reattachedQueueOriginalSend = state.socket.send;
      state.socket.send = (payload) => window.__reattachedQueueFrames.push(JSON.parse(payload));
      const result = terminalExecutionReadiness(terminal);
      queueAutomaticTerminalCommand(terminal, "Continue from the completed response");
      scheduleAutomaticQueueCheck(terminal, 0);
      return result;
    });

    expect(readiness).toEqual({ mode: "copilot", ready: true });
    await expect.poll(() => page.evaluate(() => window.__reattachedQueueFrames
      .filter((frame) => frame.type === "input" && (
        frame.data === "Continue from the completed response"
        || frame.data === "\x1b[13u"
      ))
      .map((frame) => frame.data))).toEqual([
      "Continue from the completed response",
      "\x1b[13u"
    ]);

    const queued = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      state.socket.send = window.__reattachedQueueOriginalSend;
      delete window.__reattachedQueueOriginalSend;
      delete window.__reattachedQueueFrames;
      return state.terminalArtifacts.terminals[terminal.id].queue.length;
    });
    expect(queued).toBe(0);
  });

  test("waits for Claude to finish and submits with standard Enter", async ({ page }) => {
    await reset(page);
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      window.__autoQueueOriginalReadiness = terminalExecutionReadiness;
      terminalExecutionReadiness = () => ({ mode: "claude", ready: false });
      window.__autoQueueFrames = [];
      window.__autoQueueOriginalSend = state.socket.send;
      state.socket.send = (payload) => window.__autoQueueFrames.push(JSON.parse(payload));
      queueAutomaticTerminalCommand(terminal, "Review the Claude test failure");
      scheduleAutomaticQueueCheck(terminal, 0);
    });
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.__autoQueueFrames.filter((frame) => frame.type === "input").length)).toBe(0);

    await page.evaluate(() => {
      terminalExecutionReadiness = () => ({ mode: "claude", ready: true });
      scheduleAutomaticQueueCheck([...state.terminals.values()][0], 0);
    });
    await expect.poll(() => page.evaluate(() => window.__autoQueueFrames
      .filter((frame) => frame.type === "input" && (frame.data === "Review the Claude test failure" || frame.data === "\r"))
      .map((frame) => frame.data))).toEqual(["Review the Claude test failure", "\r"]);

    await page.evaluate(() => {
      state.socket.send = window.__autoQueueOriginalSend;
      terminalExecutionReadiness = window.__autoQueueOriginalReadiness;
      delete window.__autoQueueOriginalSend;
      delete window.__autoQueueOriginalReadiness;
      delete window.__autoQueueFrames;
    });
  });

  test("sequences external assistant launches before their follow-up commands", async ({ page }) => {
    await reset(page);
    await page.evaluate(() => {
      window.__externalLaunchFrames = [];
      window.__externalLaunchOriginalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        window.__externalLaunchFrames.push(frame);
        if (frame.type !== "input") window.__externalLaunchOriginalSend.call(this, payload);
      };
      window.__externalCopilotId = openExternalTerminal({
        path: "D:\\multiTerm",
        title: "External Copilot review",
        command: "Review the current diff",
        assistantType: "copilot",
        assistantModel: "gpt-5.4",
        assistantEffort: "high",
        assistantContext: "long_context"
      }).id;
    });

    const copilotCommand = "copilot --yolo --model \"gpt-5.4\" --effort high --context long_context\r";
    await expect.poll(() => page.evaluate((command) => window.__externalLaunchFrames
      .filter((frame) => frame.type === "input" && frame.id === window.__externalCopilotId && frame.data === command)
      .map((frame) => frame.data), copilotCommand)).toEqual([copilotCommand]);
    await expect(page.locator(`[data-id="${await page.evaluate(() => window.__externalCopilotId)}"] .pane-title`))
      .toHaveValue("External Copilot review");

    const wrongProviderResult = await page.evaluate(async () => {
      const terminal = state.terminals.get(window.__externalCopilotId);
      terminal.term.reset();
      await new Promise((resolve) => terminal.term.write(
        "Claude Code v2.1.71\r\n❯\r\n? for shortcuts",
        resolve
      ));
      terminal.outputRevision = terminal.autoQueueRequiredRevision;
      return dispatchAutomaticQueueItem(terminal);
    });
    expect(wrongProviderResult).toBe(false);
    expect(await page.evaluate(() => window.__externalLaunchFrames
      .some((frame) => frame.data === "Review the current diff"))).toBe(false);

    await page.evaluate(async () => {
      const terminal = state.terminals.get(window.__externalCopilotId);
      terminal.term.reset();
      await new Promise((resolve) => terminal.term.write([
        "Copilot v1.0.78 uses AI.",
        "❯",
        " / commands · ? help · tab next tab"
      ].join("\r\n"), resolve));
      terminal.outputRevision = terminal.autoQueueRequiredRevision;
      dispatchAutomaticQueueItem(terminal);
    });
    await expect.poll(() => page.evaluate((expectedCommand) => window.__externalLaunchFrames
      .filter((frame) => frame.type === "input"
        && frame.id === window.__externalCopilotId
        && [expectedCommand, "Review the current diff", "\x1b[13u"].includes(frame.data))
      .map((frame) => frame.data), copilotCommand)).toEqual([
      copilotCommand,
      "Review the current diff",
      "\x1b[13u"
    ]);

    await page.evaluate(() => {
      window.__externalClaudeId = openExternalTerminal({
        path: "D:\\multiTerm",
        command: "Summarize the repository",
        assistantType: "claude",
        assistantModel: "claude-sonnet-4-6[1m]",
        assistantEffort: "high"
      }).id;
    });
    const claudeCommand = "claude --dangerously-skip-permissions --model \"claude-sonnet-4-6[1m]\" --effort high\r";
    await expect.poll(() => page.evaluate((command) => window.__externalLaunchFrames
      .filter((frame) => frame.type === "input" && frame.id === window.__externalClaudeId && frame.data === command)
      .map((frame) => frame.data), claudeCommand)).toEqual([claudeCommand]);
    await page.evaluate(async () => {
      const terminal = state.terminals.get(window.__externalClaudeId);
      terminal.term.reset();
      await new Promise((resolve) => terminal.term.write(
        "Claude Code v2.1.71\r\n❯\r\n? for shortcuts",
        resolve
      ));
      terminal.outputRevision = terminal.autoQueueRequiredRevision;
      dispatchAutomaticQueueItem(terminal);
    });
    await expect.poll(() => page.evaluate((expectedCommand) => window.__externalLaunchFrames
      .filter((frame) => frame.type === "input"
        && frame.id === window.__externalClaudeId
        && [expectedCommand, "Summarize the repository", "\r"].includes(frame.data))
      .map((frame) => frame.data), claudeCommand)).toEqual([
      claudeCommand,
      "Summarize the repository",
      "\r"
    ]);

    await page.evaluate(() => {
      state.socket.send = window.__externalLaunchOriginalSend;
      delete window.__externalLaunchOriginalSend;
      delete window.__externalLaunchFrames;
      delete window.__externalCopilotId;
      delete window.__externalClaudeId;
    });
  });

  test("recovers notes and makes queued commands unparented when a PID exits", async ({ page }) => {
    await reset(page, 2);
    const ids = await page.evaluate(() => [...state.terminals.keys()]);
    await page.locator("#terminalArtifactsToggle").click();
    await page.locator("#terminalArtifactsTarget").selectOption(ids[0]);
    await page.locator("#terminalNotesInput").fill("Do not lose this process context.");
    await page.locator("#commandQueueInput").fill("echo recovered-command");
    await page.locator("#commandQueueAdd").click();

    await page.evaluate((id) => handleBridgeMessage({ type: "exited", id, code: 1 }), ids[0]);
    await expect(page.locator("#terminalArtifactsTarget")).toHaveValue("__unparented__");
    await expect(page.locator(".recovered-note-input")).toHaveValue("Do not lose this process context.");
    await expect(page.locator(".command-queue-item.is-unparented")).toContainText("echo recovered-command");
    await expect(page.locator("#unparentedQueueTarget")).toHaveValue(ids[1]);

    await page.evaluate(() => {
      window.__artifactFrames = [];
      window.__artifactOriginalSend = state.socket.send.bind(state.socket);
      state.socket.send = (payload) => window.__artifactFrames.push(JSON.parse(payload));
    });
    await page.locator(".command-queue-send").click();
    const sent = await page.evaluate(() => {
      const frames = window.__artifactFrames.filter((frame) => frame.type === "input");
      state.socket.send = window.__artifactOriginalSend;
      return frames;
    });
    expect(sent).toEqual([{ type: "input", id: ids[1], data: "echo recovered-command" }]);
  });

  // The row is laid out with `display: grid`, which outranks the browser's own
  // rule for the `hidden` attribute. Without an explicit override it stayed on
  // screen for live terminals, offering an empty "insert into" picker that made
  // no sense next to a process that is still running.
  test("only offers an unparented destination when the queue has no process", async ({ page }) => {
    await reset(page, 2);
    const ids = await page.evaluate(() => [...state.terminals.keys()]);
    await page.locator("#terminalArtifactsToggle").click();
    await page.locator("#terminalArtifactsTarget").selectOption(ids[0]);

    await expect(page.locator("#terminalNotesSection")).toBeVisible();
    await expect(page.locator("#unparentedTargetRow")).toBeHidden();

    await page.evaluate((id) => handleBridgeMessage({ type: "exited", id, code: 0 }), ids[0]);
    await expect(page.locator("#terminalArtifactsTarget")).toHaveValue("__unparented__");
    await expect(page.locator("#unparentedTargetRow")).toBeVisible();
    await expect(page.locator("#terminalNotesSection")).toBeHidden();
  });

  // Guards the whole surface against the same CSS mistake: any class that sets
  // `display` without an accompanying `[hidden]` rule silently defeats the
  // attribute, and the element keeps rendering while the code believes it is gone.
  test("every element marked hidden is actually not displayed", async ({ page }) => {
    await reset(page, 1);
    await page.locator("#terminalArtifactsToggle").click();
    await expect(page.locator("#terminalArtifactsOverlay")).toBeVisible();

    const rendered = await page.evaluate(() =>
      [...document.querySelectorAll("[hidden]")]
        .filter((el) => getComputedStyle(el).display !== "none")
        .map((el) => el.id || el.className || el.tagName.toLowerCase())
    );
    expect(rendered).toEqual([]);
  });
});

// Stages `commands` (oldest first) onto the active terminal's queue through the
// hub, then closes the hub so the pane is ready for a right-click.
async function queueCommands(page, commands) {
  await page.locator("#terminalArtifactsToggle").click();
  await expect(page.locator("#terminalArtifactsOverlay")).toBeVisible();
  for (const command of commands) {
    await page.locator("#commandQueueInput").fill(command);
    await page.locator("#commandQueueAdd").click();
  }
  if (commands.length) {
    await expect(page.locator(".command-queue-item")).toHaveCount(commands.length);
  }
  await page.locator("#terminalArtifactsClose").click();
  await expect(page.locator("#terminalArtifactsOverlay")).toBeHidden();
}

// Captures bridge input frames, ignoring the focus in/out escape sequences xterm
// emits when the pane regains focus after a dequeue.
async function captureInputFrames(page, action) {
  await page.evaluate(() => {
    window.__queueFrames = [];
    window.__queueOriginalSend = state.socket.send.bind(state.socket);
    state.socket.send = (payload) => window.__queueFrames.push(JSON.parse(payload));
  });
  await action();
  return page.evaluate(() => {
    state.socket.send = window.__queueOriginalSend;
    return window.__queueFrames.filter(
      (frame) => frame.type === "input" && !/^\u001b\[[IO]$/.test(frame.data)
    );
  });
}

test.describe("Command queue context submenu", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      closeTerminalArtifacts({ restoreFocus: false });
      closeAllTerminals();
      localStorage.removeItem("multiterm.terminalArtifacts");
      state.terminalArtifacts = emptyTerminalArtifacts();
    });
  });

  test("splits the combined item into separate Notes and Command queue rows", async ({ page }) => {
    await reset(page);
    await page.locator(".terminal-screen").first().click({ button: "right" });
    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();

    await expect(menu.locator(".ctx-item", { hasText: "Notes\u2026" })).toHaveCount(1);
    const queueRow = menu.locator(".ctx-item", { hasText: "Command queue" });
    await expect(queueRow).toHaveCount(1);
    // The old combined label is gone entirely.
    await expect(menu.locator(".ctx-item", { hasText: "command queue\u2026" })).toHaveCount(0);
    // The queue row advertises its submenu to assistive tech.
    await expect(queueRow).toHaveAttribute("aria-haspopup", "menu");
    await expect(queueRow.locator(".ctx-submenu-caret")).toHaveCount(1);
  });

  test("lists queued commands newest-first on hover", async ({ page }) => {
    await reset(page);
    await queueCommands(page, ["alpha task", "beta task", "gamma task"]);

    await page.locator(".terminal-screen").first().click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Command queue" }).hover();

    const submenu = page.locator("#contextSubmenu");
    await expect(submenu).toBeVisible();
    await expect(submenu.locator(".ctx-item")).toHaveText(["gamma task", "beta task", "alpha task"]);
  });

  test("inserts a submenu command without Enter and dequeues just that command", async ({ page }) => {
    await reset(page);
    await queueCommands(page, ["staged one", "staged two"]);

    await page.locator(".terminal-screen").first().click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Command queue" }).hover();
    const submenu = page.locator("#contextSubmenu");
    await expect(submenu).toBeVisible();

    const frames = await captureInputFrames(page, async () => {
      // Newest-first ordering puts "staged two" at the top.
      await submenu.locator(".ctx-item").first().click();
    });

    expect(frames).toEqual([{ type: "input", id: expect.any(String), data: "staged two" }]);
    expect(frames[0].data).not.toMatch(/[\r\n]$/);

    const remaining = await page.evaluate(() =>
      Object.values(state.terminalArtifacts.terminals).flatMap((record) => record.queue).map((entry) => entry.command)
    );
    expect(remaining).toEqual(["staged one"]);

    await expect(page.locator("#contextMenu")).toBeHidden();
    await expect(submenu).toBeHidden();
  });

  test("shows an inert empty-state row when nothing is queued", async ({ page }) => {
    await reset(page);
    await page.locator(".terminal-screen").first().click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Command queue" }).hover();

    const submenu = page.locator("#contextSubmenu");
    await expect(submenu).toBeVisible();
    const rows = submenu.locator(".ctx-item");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveText("No queued commands");
    // The placeholder is presentational, never a menuitem.
    await expect(rows.first()).toHaveClass(/ctx-info/);
    await expect(rows.first()).toHaveAttribute("role", "presentation");
  });

  test("opens the submenu with ArrowRight and runs the focused row with Enter", async ({ page }) => {
    await reset(page);
    await queueCommands(page, ["keyboard staged"]);

    await page.locator(".terminal-screen").first().click({ button: "right" });
    await expect(page.locator("#contextMenu")).toBeVisible();

    const search = page.locator("#contextMenu .ctx-menu-search-input");
    await expect(search).toBeFocused();
    await search.fill("command queue");
    await search.press("ArrowDown");
    await expect(page.locator("#contextMenu .ctx-item.is-key-focus")).toContainText("Command queue");
    await page.keyboard.press("ArrowRight");

    const submenu = page.locator("#contextSubmenu");
    await expect(submenu).toBeVisible();
    await expect(submenu.locator(".ctx-item").first()).toHaveClass(/is-key-focus/);

    const frames = await captureInputFrames(page, async () => {
      await page.keyboard.press("Enter");
    });
    expect(frames).toEqual([{ type: "input", id: expect.any(String), data: "keyboard staged" }]);

    const remaining = await page.evaluate(() =>
      Object.values(state.terminalArtifacts.terminals).flatMap((record) => record.queue).length
    );
    expect(remaining).toBe(0);
  });

  test("opens the full queue hub when the parent row itself is clicked", async ({ page }) => {
    await reset(page);
    await queueCommands(page, ["stays queued"]);

    await page.locator(".terminal-screen").first().click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Command queue" }).click();

    await expect(page.locator("#terminalArtifactsOverlay")).toBeVisible();
    // Clicking the parent opens the manager rather than dequeuing anything.
    const remaining = await page.evaluate(() =>
      Object.values(state.terminalArtifacts.terminals).flatMap((record) => record.queue).length
    );
    expect(remaining).toBe(1);
  });
});
