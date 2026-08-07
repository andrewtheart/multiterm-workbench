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
    await page.locator("[data-schedule-mode='weekly']").click();
    await page.locator("#automationTime").fill("08:30");
    await page.locator("[data-day='5']").click();
    await page.locator(".automation-action-command").fill("npm test");
    await page.locator(".automation-action-delivery").selectOption("stage");
    await page.locator("#automationActionAdd").click();
    await page.locator(".automation-action-row").nth(1).locator(".automation-action-command").fill("git status");
    await page.locator("#automationSave").click();

    await expect(page.locator(".automation-rule-row")).toHaveCount(1);
    await expect(page.locator(".automation-rule-copy strong")).toHaveText("Morning checks");
    await expect(page.locator(".automation-rule-state")).toHaveText("On");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.automations")));
    expect(stored.rules[0]).toMatchObject({ enabled: true, name: "Morning checks" });
    expect(stored.rules[0].actions).toHaveLength(2);
    expect(stored.rules[0].actions[0]).toMatchObject({ command: "npm test", submit: false, targetName: "Tests" });

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
        return {
          clientWidth: editor.clientWidth,
          controlsInside: controls.every((control) => control.getBoundingClientRect().right <= editorRect.right + 1),
          scrollWidth: editor.scrollWidth
        };
      });
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
    expect(after.sectionHeight).toBe(before.sectionHeight);
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
    expect(result.historyTitles).toEqual(["Due first-rule", "Due second-rule"]);
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
