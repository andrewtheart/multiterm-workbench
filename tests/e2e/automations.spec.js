/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { test, expect } = require("../support/renderer-coverage");

async function reset(page) {
  await page.goto("/");
  await expect(page.locator("#bridgeStatus")).toContainText(/connected|Bridge starting/i);
  await page.evaluate(() => {
    closeAllTerminals();
    localStorage.removeItem("multiterm.automations");
    state.automations = automationApi.normalizeStore(null, state.settings.automationHistoryLimit);
    state.automationStudio.editingId = null;
    if (!elements.automationOverlay.hidden) closeAutomationStudio({ restoreFocus: false });
    addTerminal({ title: "Tests" });
  });
  await expect(page.locator(".terminal-pane")).toHaveCount(1);
}

test.describe("Automation Studio", () => {
  test.beforeEach(async ({ page }) => reset(page));

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      if (!elements.automationOverlay.hidden) closeAutomationStudio({ restoreFocus: false });
      closeAllTerminals();
      localStorage.removeItem("multiterm.automations");
    });
  });

  test("creates, edits, toggles, and reloads a scheduled automation", async ({ page }) => {
    await page.locator("#automationsToggle").click();
    await expect(page.locator("#automationsOverlay")).toBeVisible();
    await expect(page.locator("[data-automation-view='schedules']")).toHaveAttribute("aria-selected", "true");

    await page.locator("#automationNew").click();
    await page.locator("#automationName").fill("Morning checks");
    await page.locator("#automationRunAs").fill("andre");
    await page.locator("[data-schedule-mode='weekly']").click();
    await page.locator("#automationTime").fill("08:30");
    await page.locator("[data-day='5']").click();
    await page.locator(".automation-action-command").fill("npm test");
    await page.locator(".automation-action-delivery").selectOption("stage");
    await page.locator("#automationActionAdd").click();
    const secondStep = page.locator(".automation-action-row").nth(1);
    await secondStep.locator(".automation-action-command").fill("git status");
    await secondStep.locator(".automation-action-target-mode").selectOption("new");
    await expect(secondStep.locator(".automation-action-fallback")).toBeHidden();
    await expect(secondStep.locator("[data-automation-dependency]")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#automationSave").click();

    await expect(page.locator(".automation-rule-row")).toHaveCount(1);
    await expect(page.locator(".automation-rule-copy strong")).toHaveText("Morning checks");
    await expect(page.locator(".automation-rule-state")).toHaveText("On");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.automations")));
    expect(stored.rules[0]).toMatchObject({ enabled: true, name: "Morning checks", runAs: "andre", type: "command" });
    expect(stored.rules[0].actions).toHaveLength(2);
    expect(stored.rules[0].actions[0]).toMatchObject({ command: "npm test", submit: false, targetName: "Tests" });
    expect(stored.rules[0].actions[1]).toMatchObject({
      command: "git status",
      condition: "success",
      dependsOn: [stored.rules[0].actions[0].id],
      targetMode: "new",
      targetName: ""
    });

    await page.locator(".automation-rule-state").click();
    await expect(page.locator(".automation-rule-state")).toHaveText("Off");
    await page.reload();
    await page.locator("#automationsToggle").click();
    await expect(page.locator(".automation-rule-copy strong")).toHaveText("Morning checks");
    await expect(page.locator(".automation-rule-state")).toHaveText("Off");
  });

  test("keeps the Studio inside desktop and mobile viewports", async ({ page }) => {
    try {
      for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 720 }]) {
        await page.setViewportSize(viewport);
        await page.locator("#automationsToggle").click();
        const bounds = await page.locator(".automation-studio").evaluate((dialog) => {
          const rect = dialog.getBoundingClientRect();
          return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
        });
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.top).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(viewport.width);
        expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
        await page.locator("#automationsClose").click();
        await expect(page.locator("#automationsOverlay")).toBeHidden();
      }
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test("keeps schedule controls contained and shows only the selected routes panel", async ({ page }) => {
    try {
      await page.setViewportSize({ width: 1037, height: 768 });
      await page.evaluate(() => addTerminal({ title: "Consumer" }));
      await expect.poll(() => page.evaluate(() => (
        [...state.terminals.values()].length === 2
        && [...state.terminals.values()].every((terminal) => terminal.status === "live")
      ))).toBe(true);
      await page.evaluate(() => {
        const [source, target] = [...state.terminals.values()];
        addTerminalLink(source.id, target.id, { handoffEnabled: true });
      });

      await page.locator("#automationsToggle").click();
      await page.locator("#automationNew").click();
      const scheduleGeometry = await page.locator("#automationEditor").evaluate((editor) => {
        const editorRect = editor.getBoundingClientRect();
        const controls = [...editor.querySelectorAll(".automation-action-row input, .automation-action-row select, .automation-action-row button")];
        const blocks = [...editor.querySelectorAll(":scope > .automation-block")];
        const thenBlock = blocks[1];
        const account = editor.querySelector(".automation-account-field");
        const accountRect = account.getBoundingClientRect();
        const thenRect = thenBlock.getBoundingClientRect();
        return {
          accountAfterThen: Boolean(thenBlock.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING),
          accountBelowThen: accountRect.top >= thenRect.bottom,
          accountInputWidth: account.querySelector("input").getBoundingClientRect().width,
          accountLeft: accountRect.left,
          clientWidth: editor.clientWidth,
          controlsInside: controls.every((control) => control.getBoundingClientRect().right <= editorRect.right + 1),
          scrollWidth: editor.scrollWidth,
          thenLeft: thenRect.left
        };
      });
      expect(scheduleGeometry.accountAfterThen).toBe(true);
      expect(scheduleGeometry.accountBelowThen).toBe(true);
      expect(scheduleGeometry.accountInputWidth).toBeLessThanOrEqual(280);
      expect(Math.abs(scheduleGeometry.accountLeft - scheduleGeometry.thenLeft)).toBeLessThanOrEqual(1);
      expect(scheduleGeometry.scrollWidth).toBeLessThanOrEqual(scheduleGeometry.clientWidth);
      expect(scheduleGeometry.controlsInside).toBe(true);

      await page.locator("[data-automation-view='routes']").click();
      await expect(page.locator("#automationSchedulesView")).toBeHidden();
      await expect(page.locator("#automationRoutesView")).toBeVisible();
      await expect(page.locator(".automation-route-row")).toHaveCount(1);
      await expect(page.locator(".automation-route-copy strong")).toHaveText("Tests → Consumer");
      const panelGeometry = await page.locator("#automationRoutesView").evaluate((panel) => {
        const panelRect = panel.getBoundingClientRect();
        const dialogRect = panel.closest(".automation-studio").getBoundingClientRect();
        return {
          bottom: panelRect.bottom,
          dialogBottom: dialogRect.bottom,
          dialogRight: dialogRect.right,
          right: panelRect.right
        };
      });
      expect(panelGeometry.right).toBeLessThanOrEqual(panelGeometry.dialogRight);
      expect(panelGeometry.bottom).toBeLessThanOrEqual(panelGeometry.dialogBottom);
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test("pauses globally and applies the visible activity retention setting", async ({ page }) => {
    await page.locator("#automationsToggle").click();
    await page.locator("#automationsPause").click();
    await expect(page.locator("#automationsPause")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#automationsPause span:not(.ripple)")).toHaveText("Resume");

    await page.locator("[data-automation-view='activity']").click();
    await page.locator("#automationHistoryLimit").fill("2");
    await page.locator("#automationHistoryLimit").dispatchEvent("change");
    await page.evaluate(() => {
      addAutomationHistory("completed", "One", "first");
      addAutomationHistory("blocked", "Two", "second");
      addAutomationHistory("failed", "Three", "third");
    });
    await expect(page.locator(".automation-activity-row")).toHaveCount(2);
    await expect(page.locator(".automation-activity-copy strong")).toHaveText(["Three", "Two"]);
    expect(await page.evaluate(() => state.settings.automationHistoryLimit)).toBe(2);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.automations")).history)).toHaveLength(2);
  });

  test("keeps Activity chrome fixed while schedule and handoff rows scroll", async ({ page }) => {
    await page.locator("#automationsToggle").click();
    await page.locator("[data-automation-view='activity']").click();
    const before = await page.locator("#automationActivityView").evaluate((panel) => ({
      panelHeight: panel.clientHeight,
      sectionHeight: panel.querySelector(".automation-section-head").getBoundingClientRect().height
    }));

    await page.evaluate(() => {
      state.automations.history = Array.from({ length: 80 }, (_, index) => ({
        automationId: index % 2 ? `schedule-${index}` : null,
        detail: `Event ${index}`,
        id: `history-${index}`,
        occurredAt: new Date(Date.now() - index * 1000).toISOString(),
        status: index % 3 ? "completed" : "staged",
        title: index % 2 ? `Schedule ${index}` : `Producer → Consumer ${index}`
      }));
      renderAutomationActivity();
    });

    await expect(page.locator(".automation-activity-row")).toHaveCount(80);
    const after = await page.locator("#automationActivityView").evaluate((panel) => {
      const section = panel.querySelector(".automation-section-head");
      const list = panel.querySelector("#automationActivityList");
      return {
        listClientHeight: list.clientHeight,
        listScrollHeight: list.scrollHeight,
        panelHeight: panel.clientHeight,
        panelScrollHeight: panel.scrollHeight,
        sectionHeight: section.getBoundingClientRect().height
      };
    });
    expect(after.panelHeight).toBe(before.panelHeight);
    expect(Math.abs(after.sectionHeight - before.sectionHeight)).toBeLessThanOrEqual(1);
    expect(after.panelScrollHeight).toBe(after.panelHeight);
    expect(after.listClientHeight).toBeLessThan(after.listScrollHeight);
    expect(after.listClientHeight).toBeLessThan(after.panelHeight);
  });

  test("honors zero activity retention when the renderer reloads", async ({ page }) => {
    await page.evaluate(() => {
      state.settings.automationHistoryLimit = 0;
      saveSettings();
      localStorage.setItem("multiterm.automations", JSON.stringify({
        history: [{
          detail: "Should be discarded",
          id: "history-reload1",
          occurredAt: "2026-08-04T10:00:00.000Z",
          status: "queued",
          title: "Old event"
        }],
        paused: true,
        rules: [],
        version: 1
      }));
    });

    await page.reload();
    expect(await page.evaluate(() => state.settings.automationHistoryLimit)).toBe(0);
    expect(await page.evaluate(() => state.automations.history)).toEqual([]);
  });

  test("filters activity, shows the latest schedule outcome, and toggles route handoffs", async ({ page }) => {
    await page.evaluate(() => addTerminal({ title: "Consumer" }));
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].every((terminal) => terminal.status === "live"))).toBe(true);
    await page.evaluate(() => {
      const [source, target] = [...state.terminals.values()];
      const rule = automationApi.normalizeRule({
        actions: [{ command: "git status", id: "action-filter1", submit: false, targetName: "Tests" }],
        createdAt: new Date(Date.now() - 60000).toISOString(),
        enabled: true,
        id: "automation-filter1",
        name: "Filtered schedule",
        trigger: { intervalMinutes: 60, mode: "interval", type: "schedule" }
      });
      state.automations.rules = [rule];
      addAutomationHistory("queued", rule.name, "First schedule event", rule.id);
      addAutomationHistory("staged", "Tests → Consumer", "Handoff event");
      addAutomationHistory("failed", rule.name, "Latest schedule event", rule.id);
      addTerminalLink(source.id, target.id, { handoffEnabled: true });
    });

    await page.locator("#automationsToggle").click();
    await expect(page.locator(".automation-rule-outcome")).toContainText("Last failed");

    await page.locator("[data-automation-view='routes']").click();
    const routeToggle = page.locator("[data-automation-route-toggle]");
    await expect(routeToggle).toBeChecked();
    await routeToggle.uncheck();
    await expect(page.locator(".automation-route-copy span")).toHaveText("Handoffs disabled");
    expect(await page.evaluate(() => [...state.terminalLinks.values()][0].handoffEnabled)).toBe(false);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem("multiterm.terminalLinks")))[0].handoffEnabled).toBe(false);

    await page.locator("[data-automation-view='activity']").click();
    await page.locator("#automationActivityFilter").selectOption("schedules");
    await expect(page.locator(".automation-activity-row")).toHaveCount(2);
    await expect(page.locator(".automation-activity-copy strong")).toHaveText(["Filtered schedule", "Filtered schedule"]);
    await page.locator("#automationActivityFilter").selectOption("handoffs");
    await expect(page.locator(".automation-activity-row")).toHaveCount(1);
    await expect(page.locator(".automation-activity-copy strong")).toHaveText("Tests → Consumer");
    await page.locator("#automationActivityFilter").selectOption("attention");
    await expect(page.locator(".automation-activity-row")).toHaveCount(1);
    await expect(page.locator(".automation-activity-row")).toHaveAttribute("data-status", "failed");
  });

  test("creates a directional handoff route by dragging producer to consumer grips", async ({ page }) => {
    await page.evaluate(() => addTerminal({ title: "Consumer" }));
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].every((terminal) => terminal.status === "live"))).toBe(true);

    const producer = page.locator(".terminal-pane").nth(0);
    const consumer = page.locator(".terminal-pane").nth(1);
    await page.evaluate(() => {
      const [source, target] = [...state.terminals.values()];
      addTerminalLink(source.id, target.id, { handoffEnabled: false });
    });
    await producer.hover();
    await producer.locator(".pane-handoff-grip.is-output").dragTo(
      consumer.locator(".pane-handoff-grip.is-input"),
      { force: true }
    );

    await expect(page.locator(".terminal-connector-path.is-link")).toHaveCount(1);
    const route = await page.evaluate(() => [...state.terminalLinks.values()][0]);
    expect(route).toMatchObject({ handoffEnabled: true, sourceTitle: "Tests", targetTitle: "Consumer" });
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem("multiterm.terminalLinks")))[0].handoffEnabled).toBe(true);
    await expect(producer.locator(".pane-handoff-grip.is-output")).toHaveClass(/has-route/);

    await page.locator("#automationsToggle").click();
    await page.locator("[data-automation-view='routes']").click();
    await expect(page.locator(".automation-route-copy strong")).toHaveText("Tests → Consumer");
    await expect(page.locator(".automation-route-copy span")).toHaveText("Handoffs enabled");
    await page.locator("[data-automation-unlink]").click();
    await expect(page.locator(".automation-route-row")).toHaveCount(0);
    await expect(page.locator(".terminal-connector-path.is-link")).toHaveCount(0);
  });

  test("runs an overdue schedule once and stages its action without Enter", async ({ page }) => {
    const token = "scheduled-stage-must-not-run";
    await expect.poll(() => page.evaluate(() => (
      state.socketReady && [...state.terminals.values()].every((terminal) => terminal.status === "live")
    ))).toBe(true);
    const tickState = await page.evaluate(async (commandToken) => {
      const now = Date.now();
      window.__automationOriginalReadiness = terminalExecutionReadiness;
      terminalExecutionReadiness = () => ({ mode: "shell", ready: true });
      window.__automationInputFrames = [];
      window.__automationOriginalSend = state.socket.send;
      state.socket.send = (payload) => {
        const frame = JSON.parse(payload);
        if (frame.type === "input") window.__automationInputFrames.push(frame);
        return window.__automationOriginalSend.call(state.socket, payload);
      };
      state.automations.rules = [automationApi.normalizeRule({
        actions: [{ command: `Write-Output '${commandToken}'`, id: "action-schedule1", submit: false, targetName: "Tests" }],
        createdAt: new Date(now - 120000).toISOString(),
        enabled: true,
        id: "automation-schedule1",
        name: "Scheduled stage",
        trigger: { catchUp: "once", intervalMinutes: 1, mode: "interval", type: "schedule" }
      })];
      state.automationRuntime.lastTickAt = now - 120000;
      const changed = await tickAutomationSchedules(new Date(now));
      return {
        changed,
        history: state.automations.history,
        paused: state.automations.paused,
        pending: state.automations.pendingStages,
        rule: state.automations.rules[0],
        terminals: [...state.terminals.values()].map((terminal) => ({ status: terminal.status, title: terminal.titleInput.value }))
      };
    }, token);

    expect(tickState.changed, JSON.stringify(tickState)).toBe(true);
    expect(tickState.pending, JSON.stringify(tickState)).toHaveLength(1);
    await expect.poll(() => page.evaluate(() => state.automations.history.some((entry) => entry.status === "staged"))).toBe(true);
    const frames = (await page.evaluate(() => window.__automationInputFrames))
      .filter((frame) => frame.data.includes(token));
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe(`Write-Output '${token}'`);
    expect(frames[0].data).not.toMatch(/[\r\n]$/);
    expect(await page.evaluate(() => Boolean(state.automations.rules[0].lastRunAt))).toBe(true);
    await page.evaluate(() => {
      state.socket.send = window.__automationOriginalSend;
      terminalExecutionReadiness = window.__automationOriginalReadiness;
      delete window.__automationInputFrames;
      delete window.__automationOriginalReadiness;
      delete window.__automationOriginalSend;
    });
  });

  test("launches a new terminal destination and runs its action when ready", async ({ page }) => {
    const token = "automation-new-terminal-target";
    await expect.poll(() => page.evaluate(() => (
      state.socketReady && [...state.terminals.values()].every((terminal) => terminal.status === "live")
    ))).toBe(true);
    const result = await page.evaluate((commandToken) => {
      const existingIds = new Set(state.terminals.keys());
      window.__automationNewTerminalOriginalReadiness = terminalExecutionReadiness;
      window.__automationNewTerminalOriginalSend = state.socket.send;
      window.__automationNewTerminalFrames = [];
      terminalExecutionReadiness = () => ({ mode: "shell", ready: true });
      state.socket.send = (payload) => {
        const frame = JSON.parse(payload);
        if (frame.type === "input") window.__automationNewTerminalFrames.push(frame);
        return window.__automationNewTerminalOriginalSend.call(state.socket, payload);
      };
      const rule = automationApi.normalizeRule({
        actions: [{
          command: `Write-Output '${commandToken}'`,
          id: "action-newterm1",
          submit: true,
          targetMode: "new"
        }],
        enabled: true,
        id: "automation-newterm1",
        name: "New terminal action",
        trigger: { intervalMinutes: 60, mode: "interval", type: "schedule" }
      });
      const queued = runAutomationRule(rule, { manual: true });
      const target = [...state.terminals.values()].find((terminal) => !existingIds.has(terminal.id));
      return {
        history: state.automations.history.at(-1),
        queued,
        targetId: target?.id,
        targetTitle: target?.titleInput.value
      };
    }, token);

    expect(result.queued).toBe(1);
    expect(result.targetId).toBeTruthy();
    expect(result.history).toMatchObject({ detail: `Run in new terminal ${result.targetTitle}`, status: "queued" });
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await expect.poll(() => page.evaluate(({ targetId }) => {
      const frames = window.__automationNewTerminalFrames.filter((frame) => frame.id === targetId);
      return {
        command: frames.some((frame) => frame.data.startsWith("powershell.exe -NoLogo -NoProfile -EncodedCommand ")),
        enter: frames.some((frame) => frame.data === "\r")
      };
    }, { targetId: result.targetId })).toEqual({ command: true, enter: true });
    await expect.poll(() => page.evaluate(({ targetId, commandToken }) => {
      const terminal = state.terminals.get(targetId);
      return terminal ? terminalVisibleText(terminal).includes(commandToken) : false;
    }, { targetId: result.targetId, commandToken: token })).toBe(true);
    await expect.poll(() => page.evaluate(() => state.automationRuntime.runs.size)).toBe(0);
    expect(await page.evaluate(() => state.automations.history.some((entry) => (
      entry.title === "New terminal action" && entry.status === "completed"
    )))).toBe(true);

    await page.evaluate(() => {
      state.socket.send = window.__automationNewTerminalOriginalSend;
      terminalExecutionReadiness = window.__automationNewTerminalOriginalReadiness;
      delete window.__automationNewTerminalFrames;
      delete window.__automationNewTerminalOriginalReadiness;
      delete window.__automationNewTerminalOriginalSend;
    });
  });

  test("targets a terminal by PID and defaults missing targets to a new terminal", async ({ page }) => {
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0]?.pid || 0)).toBeGreaterThan(0);
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const exact = resolveAutomationActionTarget({ targetMode: "pid", targetPid: terminal.pid, fallbackToNew: true });
      const blocked = resolveAutomationActionTarget({ targetMode: "pid", targetPid: 2147483647, fallbackToNew: false });
      const fallback = resolveAutomationActionTarget({ targetMode: "pid", targetPid: 2147483647, fallbackToNew: true, cwd: "D:\\multiTerm" });
      return {
        blocked: blocked.error,
        exactId: exact.terminal?.id,
        fallbackCwd: fallback.terminal?.cwd,
        fallbackLaunched: fallback.launched,
        originalId: terminal.id
      };
    });
    expect(result).toMatchObject({
      exactId: result.originalId,
      fallbackCwd: "D:\\multiTerm",
      fallbackLaunched: true
    });
    expect(result.blocked).toContain("No live terminal has PID");

    await page.locator("#automationsToggle").click();
    await page.locator("#automationNew").click();
    const step = page.locator(".automation-action-row").first();
    await step.locator(".automation-action-target-mode").selectOption("pid");
    await expect(step.locator(".automation-action-fallback input")).toBeChecked();
    await expect(step.locator(".automation-action-target-pid-field")).toBeVisible();
  });

  test("advances arbitrary success and failure branches from terminal exit markers", async ({ page }) => {
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      window.clearTimeout(terminal.automationWorkflowTimer);
      const successRule = automationApi.normalizeRule({
        actions: [
          { command: "one", id: "action-chain001", targetName: "Tests" },
          { command: "two", dependsOn: ["action-chain001"], id: "action-chain002", targetName: "Tests" },
          { command: "three", conditionOperator: "all", dependsOn: ["action-chain001", "action-chain002"], id: "action-chain003", targetName: "Tests" }
        ],
        enabled: true,
        id: "automation-chain1",
        name: "Success chain",
        trigger: { intervalMinutes: 60, mode: "interval" }
      });
      runAutomationRule(successRule);
      const first = terminal.automationWorkflowTasks[0].token;
      finishAutomationWorkflowTask(first, 0);
      const second = terminal.automationWorkflowTasks[0].token;
      finishAutomationWorkflowTask(second, 0);
      const third = terminal.automationWorkflowTasks[0].token;
      finishAutomationWorkflowTask(third, 0);

      const failureRule = automationApi.normalizeRule({
        actions: [
          { command: "fail", id: "action-branch01", targetName: "Tests" },
          { command: "wrong branch", condition: "success", dependsOn: ["action-branch01"], id: "action-branch02", targetName: "Tests" },
          { command: "recover", condition: "failure", dependsOn: ["action-branch01"], id: "action-branch03", targetName: "Tests" }
        ],
        enabled: true,
        id: "automation-branch1",
        name: "Failure branch",
        trigger: { intervalMinutes: 60, mode: "interval" }
      });
      const failureRunId = [...state.automationRuntime.runs.keys()];
      runAutomationRule(failureRule);
      const failureRun = [...state.automationRuntime.runs.values()].find((run) => run.rule.id === failureRule.id);
      finishAutomationWorkflowTask(terminal.automationWorkflowTasks[0].token, 7);
      const statesAfterFailure = Object.fromEntries(failureRun.states);
      finishAutomationWorkflowTask(terminal.automationWorkflowTasks[0].token, 0);
      window.clearTimeout(terminal.automationWorkflowTimer);
      terminal.automationWorkflowTimer = 0;
      return {
        failureRunId,
        remainingRuns: state.automationRuntime.runs.size,
        statesAfterFailure,
        successCompleted: state.automations.history.some((entry) => entry.title === "Success chain" && entry.status === "completed")
      };
    });

    expect(result.successCompleted).toBe(true);
    expect(result.statesAfterFailure).toMatchObject({
      "action-branch01": "failed",
      "action-branch02": "skipped",
      "action-branch03": "running"
    });
    expect(result.remainingRuns).toBe(0);
  });

  test("queues a Copilot prompt and requested CWD in a selected terminal", async ({ page }) => {
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0]?.status)).toBe("live");
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const savedQueue = queueAutomaticTerminalCommand;
      const savedReadiness = terminalExecutionReadiness;
      const queued = [];
      queueAutomaticTerminalCommand = (_terminal, command) => { queued.push(command); return true; };
      terminalExecutionReadiness = () => ({ mode: "copilot", ready: true });
      try {
        const rule = automationApi.normalizeRule({
          actions: [{
            command: "Review the pending changes",
            cwd: "D:\\multiTerm",
            id: "action-copilot1",
            targetMode: "title",
            targetName: "Tests"
          }],
          enabled: true,
          id: "automation-copilot1",
          name: "Scheduled review",
          type: "copilot",
          trigger: { intervalMinutes: 60, mode: "interval" }
        });
        const started = runAutomationRule(rule, { manual: true });
        return { queued, started };
      } finally {
        queueAutomaticTerminalCommand = savedQueue;
        terminalExecutionReadiness = savedReadiness;
      }
    });
    expect(result.started).toBe(1);
    expect(result.queued).toEqual(["/cwd D:\\multiTerm", "Review the pending changes"]);
  });

  test("launches Copilot from the requested CWD in each shell", async ({ page }) => {
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const saved = {
        cwd: terminal.cwd,
        pendingExternalAssistant: terminal.pendingExternalAssistant,
        shell: terminal.shell,
        status: terminal.status
      };
      const action = {
        command: "Review this worktree",
        cwd: "D:\\repo name",
        id: "action-copilot-cwd",
        targetMode: "title",
        targetName: terminal.titleInput.value
      };
      const rule = automationApi.normalizeRule({
        actions: [action],
        enabled: true,
        id: "automation-copilot-cwd",
        name: "CWD launch",
        type: "copilot",
        trigger: { intervalMinutes: 60, mode: "interval" }
      });
      try {
        const commands = {
          cmd: automationCopilotLaunchCommand({ shell: "cmd" }, "C:\\100% & safe"),
          powershell: automationCopilotLaunchCommand({ shell: "pwsh" }, "D:\\repo name"),
          wsl: automationCopilotLaunchCommand({ shell: "wsl" }, "/mnt/c/repo name")
        };
        terminal.shell = "cmd";
        terminal.status = "starting";
        const started = runAutomationRule(rule, { manual: true });
        return { commands, pending: terminal.pendingExternalAssistant, started };
      } finally {
        terminal.cwd = saved.cwd;
        terminal.pendingExternalAssistant = saved.pendingExternalAssistant;
        terminal.shell = saved.shell;
        terminal.status = saved.status;
      }
    });

    expect(result.started).toBe(1);
    expect(result.commands).toEqual({
      cmd: 'cd /d "C:\\100^% & safe" & copilot --yolo --context default',
      powershell: "Set-Location -LiteralPath 'D:\\repo name'; copilot --yolo --context default",
      wsl: "cd -- '/mnt/c/repo name'; copilot --yolo --context default"
    });
    expect(result.pending).toMatchObject({
      command: 'cd /d "D:\\repo name" & copilot --yolo --context default',
      followup: "Review this worktree",
      provider: "copilot"
    });
  });

  test("pauses, snoozes, and deletes an automation from its right-click menu", async ({ page }) => {
    await page.evaluate(() => {
      const now = new Date().toISOString();
      state.automations.rules = [automationApi.normalizeRule({
        actions: [{ command: "git status", id: "action-context1", targetName: "Tests" }],
        createdAt: now,
        enabled: true,
        id: "automation-context1",
        name: "Managed automation",
        trigger: { intervalMinutes: 60, mode: "interval" }
      })];
      saveAutomationStore();
    });
    await page.locator("#automationsToggle").click();
    const row = page.locator(".automation-rule-row");
    await row.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Pause automation", exact: true }).click();
    await expect(page.locator(".automation-rule-state")).toHaveText("Off");

    const snoozeStartedAt = Date.now();
    await page.evaluate(() => { window.__automationPrompt = window.prompt; window.prompt = () => "0.1"; });
    await row.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Snooze automation...", exact: true }).click();
    const snoozedUntil = await page.evaluate(() => new Date(state.automations.rules[0].snoozedUntil).getTime());
    expect(snoozedUntil).toBeGreaterThanOrEqual(snoozeStartedAt + 59000);
    expect(snoozedUntil).toBeLessThanOrEqual(Date.now() + 61000);
    await expect(page.locator(".automation-rule-copy")).toContainText("Snoozed until");
    await page.evaluate(() => { window.prompt = window.__automationPrompt; delete window.__automationPrompt; });

    await row.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete automation", exact: true }).click();
    await expect(page.locator(".automation-rule-row")).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.automations")).rules)).toEqual([]);
  });

  test("keeps a staged action queued when its paste cannot reach the bridge", async ({ page }) => {
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].every((terminal) => terminal.status === "live"))).toBe(true);
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const rule = automationApi.normalizeRule({
        actions: [{ command: "git status", id: "action-retry1", submit: false, targetName: "Tests" }],
        enabled: true,
        id: "automation-retry1",
        name: "Retry staging",
        trigger: { intervalMinutes: 60, mode: "interval", type: "schedule" }
      });
      const originalReadiness = terminalExecutionReadiness;
      const originalSendBridge = sendBridge;
      terminalExecutionReadiness = () => ({ mode: "shell", ready: true });
      sendBridge = () => false;
      queueAutomationStage(terminal, "git status", rule);
      const dispatched = await dispatchTerminalHandoff(terminal);
      window.clearTimeout(terminal.handoffDeliveryTimer);
      terminal.handoffDeliveryTimer = 0;
      sendBridge = originalSendBridge;
      terminalExecutionReadiness = originalReadiness;
      return {
        dispatched,
        history: state.automations.history.map((entry) => entry.status),
        pending: state.automations.pendingStages.map((entry) => entry.title)
      };
    });

    expect(result.dispatched).toBe(false);
    expect(result.pending).toEqual(["Retry staging"]);
    expect(result.history).toContain("failed");
  });

  test("restores a pending staged action after renderer reload", async ({ page }) => {
    await expect.poll(() => page.evaluate(() => (
      state.socketReady && [...state.terminals.values()].every((terminal) => terminal.status === "live")
    ))).toBe(true);
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const rule = automationApi.normalizeRule({
        actions: [{ command: "git status", id: "action-reload1", submit: false, targetName: "Tests" }],
        enabled: true,
        id: "automation-reload1",
        name: "Reload staging",
        trigger: { intervalMinutes: 60, mode: "interval", type: "schedule" }
      });
      state.automations.paused = true;
      queueAutomationStage(terminal, "git status", rule, {
        occurrenceKey: "automation-reload1:2026-08-04T10:00:00.000Z:0"
      });
    });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.automations")).pendingStages)).toHaveLength(1);

    await page.reload();
    await expect.poll(() => page.evaluate(() => (
      state.socketReady && [...state.terminals.values()].every((terminal) => terminal.status === "live")
    ))).toBe(true);
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const originalReadiness = terminalExecutionReadiness;
      const originalSend = state.socket.send;
      const frames = [];
      state.automations.paused = false;
      saveAutomationStore();
      terminalExecutionReadiness = () => ({ mode: "shell", ready: true });
      state.socket.send = (payload) => {
        const frame = JSON.parse(payload);
        if (frame.type === "input") frames.push(frame);
        return originalSend.call(state.socket, payload);
      };
      const dispatched = await dispatchTerminalHandoff(terminal);
      state.socket.send = originalSend;
      terminalExecutionReadiness = originalReadiness;
      return {
        dispatched,
        frames,
        pending: state.automations.pendingStages.length
      };
    });

    expect(result.dispatched).toBe(true);
    expect(result.pending).toBe(0);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].data).toBe("git status");
    expect(result.frames[0].data).not.toMatch(/[\r\n]$/);
  });

  test("processes every rule due in the same scheduler tick", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const now = Date.now();
      const createRule = (suffix) => automationApi.normalizeRule({
        actions: [{ command: `Write-Output '${suffix}'`, id: `action-${suffix}`, submit: false, targetName: "Tests" }],
        createdAt: new Date(now - 120000).toISOString(),
        enabled: true,
        id: `automation-${suffix}`,
        name: `Due ${suffix}`,
        trigger: { catchUp: "once", intervalMinutes: 1, mode: "interval", type: "schedule" }
      });
      state.automations.rules = [createRule("first-rule"), createRule("second-rule")];
      state.automationRuntime.lastTickAt = now - 120000;
      const changed = await tickAutomationSchedules(new Date(now));
      return {
        changed,
        historyTitles: state.automations.history.map((entry) => entry.title),
        pendingTitles: state.automations.pendingStages.map((entry) => entry.title),
        rules: state.automations.rules.map((rule) => ({ id: rule.id, lastRunAt: rule.lastRunAt }))
      };
    });

    expect(result.changed).toBe(true);
    expect(result.pendingTitles).toEqual(["Due first-rule", "Due second-rule"]);
    expect(result.historyTitles.filter((title) => title === "Due first-rule")).toHaveLength(2);
    expect(result.historyTitles.filter((title) => title === "Due second-rule")).toHaveLength(2);
    expect(result.historyTitles.filter((title) => title.endsWith("· Step 1"))).toHaveLength(2);
    expect(result.rules).toHaveLength(2);
    expect(result.rules.every((rule) => Boolean(rule.lastRunAt)), JSON.stringify(result.rules)).toBe(true);
  });

  test("queues a handoff in the bridge and stages it when the consumer is ready", async ({ page }) => {
    const token = "handoff-stage-must-not-run";
    await page.evaluate(() => addTerminal({ title: "Consumer" }));
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].every((terminal) => terminal.status === "live"))).toBe(true);
    const sent = await page.evaluate(async (commandToken) => {
      const [source, target] = [...state.terminals.values()];
      window.__automationOriginalReadiness = terminalExecutionReadiness;
      terminalExecutionReadiness = () => ({ mode: "shell", ready: true });
      window.__automationInputFrames = [];
      window.__automationOriginalSend = state.socket.send;
      state.socket.send = (payload) => {
        const frame = JSON.parse(payload);
        if (frame.type === "messageAction" && frame.action === "deliver") window.__automationInputFrames.push(frame);
        return window.__automationOriginalSend.call(state.socket, payload);
      };
      addTerminalLink(source.id, target.id, { handoffEnabled: true });
      return sendTerminalHandoff(source, target, `Write-Output '${commandToken}'`);
    }, token);
    expect(sent).toBe(true);

    await expect.poll(() => page.evaluate(() => state.automations.history.some((entry) => entry.status === "staged"))).toBe(true);
    await expect.poll(() => page.evaluate(() => state.terminalMessages.size)).toBe(0);
    const frames = await page.evaluate(() => window.__automationInputFrames);
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe(`Write-Output '${token}'`);
    expect(frames[0].data).not.toMatch(/[\r\n]$/);
    await page.evaluate(() => {
      state.socket.send = window.__automationOriginalSend;
      terminalExecutionReadiness = window.__automationOriginalReadiness;
      delete window.__automationInputFrames;
      delete window.__automationOriginalReadiness;
      delete window.__automationOriginalSend;
    });
  });

  test("detects the Copilot HAND OFF convention and routes by connected terminal name", async ({ page }) => {
    const token = "marker-handoff-must-not-run";
    await page.evaluate(() => addTerminal({ title: "Consumer" }));
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].every((terminal) => terminal.status === "live"))).toBe(true);
    await page.evaluate(async (commandToken) => {
      const [source, target] = [...state.terminals.values()];
      addTerminalLink(source.id, target.id, { handoffEnabled: true });
      window.__automationOriginalReadiness = terminalExecutionReadiness;
      terminalExecutionReadiness = (terminal) => terminal.id === source.id
        ? { mode: "copilot", ready: true }
        : { mode: "shell", ready: true };
      window.__automationInputFrames = [];
      window.__automationOriginalSend = state.socket.send;
      state.socket.send = (payload) => {
        const frame = JSON.parse(payload);
        if (frame.type === "messageAction" && frame.action === "deliver") window.__automationInputFrames.push(frame);
        return window.__automationOriginalSend.call(state.socket, payload);
      };
      await new Promise((resolve) => source.term.write(
        `\r\n**HAND OFF** Consumer\r\nWrite-Output '${commandToken}'\r\n/ commands · ? help\r\n`,
        resolve
      ));
      scanTerminalHandoff(source);
    }, token);

    await expect.poll(() => page.evaluate(() => state.automations.history.some((entry) => entry.status === "staged"))).toBe(true);
    const frames = (await page.evaluate(() => window.__automationInputFrames))
      .filter((frame) => frame.data.includes(token));
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe(`Write-Output '${token}'`);
    await page.evaluate(() => {
      state.socket.send = window.__automationOriginalSend;
      terminalExecutionReadiness = window.__automationOriginalReadiness;
      delete window.__automationInputFrames;
      delete window.__automationOriginalReadiness;
      delete window.__automationOriginalSend;
    });
  });

  test("opens a configured Claude consumer for an unnamed HAND OFF and stages context", async ({ page }) => {
    const token = "unnamed-handoff-context";
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].every((terminal) => terminal.status === "live"))).toBe(true);
    const sourceMetadata = await page.evaluate(() => {
      const source = [...state.terminals.values()][0];
      return { cwd: source.cwd, pageId: source.pageId };
    });
    await page.evaluate(async (payloadToken) => {
      const source = [...state.terminals.values()][0];
      window.__automationAssistantProfile = {
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
      window.__automationOriginalReadiness = terminalExecutionReadiness;
      terminalExecutionReadiness = (terminal) => terminal.id === source.id
        ? { mode: "claude", ready: true }
        : { mode: "shell", ready: true };
      window.__automationOriginalInvokeAssistant = invokeAiAssistant;
      window.__automationAssistantLaunches = [];
      invokeAiAssistant = (terminal) => window.__automationAssistantLaunches.push(terminal.id);
      window.__automationInputFrames = [];
      window.__automationOriginalSend = state.socket.send;
      state.socket.send = (payload) => {
        const frame = JSON.parse(payload);
        if (frame.type === "messageAction" && frame.action === "deliver") window.__automationInputFrames.push(frame);
        return window.__automationOriginalSend.call(state.socket, payload);
      };
      await new Promise((resolve) => source.term.write(
        `\r\n**HAND OFF**\r\nContinue with ${payloadToken}\r\n/ commands · ? help\r\n`,
        resolve
      ));
      scanTerminalHandoff(source);
    }, token);

    await expect(page.locator(".terminal-pane")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.__automationAssistantLaunches.length)).toBe(1);
    expect(await page.evaluate(() => state.automations.history.some((entry) => entry.status === "staged"))).toBe(false);
    await page.evaluate(() => {
      const source = [...state.terminals.values()].find((terminal) => terminal.titleInput.value === "Tests");
      terminalExecutionReadiness = (terminal) => terminal.id === source.id
        ? { mode: "claude", ready: true }
        : { mode: "claude", ready: true };
    });
    await expect.poll(() => page.evaluate(() => state.automations.history.some((entry) => entry.status === "staged"))).toBe(true);
    const fallback = await page.evaluate(() => {
      const terminal = [...state.terminals.values()].find((item) => item.titleInput.value.startsWith("Handoff from"));
      return {
        cwd: terminal.cwd,
        pageId: terminal.pageId,
        route: [...state.terminalLinks.values()].find((link) => link.targetId === terminal.id),
        shell: terminal.shell,
        title: terminal.titleInput.value
      };
    });
    expect(fallback).toMatchObject({
      cwd: sourceMetadata.cwd,
      pageId: sourceMetadata.pageId,
      route: { handoffEnabled: true },
      shell: "pwsh"
    });
    expect(fallback.title).toMatch(/^Handoff from Tests/);
    const frames = (await page.evaluate(() => window.__automationInputFrames))
      .filter((frame) => frame.data.includes(token));
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe(`Continue with ${token}`);
    await page.evaluate(() => {
      state.socket.send = window.__automationOriginalSend;
      terminalExecutionReadiness = window.__automationOriginalReadiness;
      invokeAiAssistant = window.__automationOriginalInvokeAssistant;
      const profile = window.__automationAssistantProfile;
      state.aiProviders = profile.providers;
      state.settings.aiSessionProvider = profile.provider;
      state.settings.aiSessionModel = profile.model;
      state.settings.aiSessionEffort = profile.effort;
      state.settings.aiSessionContext = profile.context;
      delete window.__automationAssistantLaunches;
      delete window.__automationAssistantProfile;
      delete window.__automationInputFrames;
      delete window.__automationOriginalInvokeAssistant;
      delete window.__automationOriginalReadiness;
      delete window.__automationOriginalSend;
    });
  });
});
