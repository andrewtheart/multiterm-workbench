/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, expect } = require("../support/renderer-coverage");

function conditionRuleDraft(conditionOverrides = {}, overrides = {}) {
  return {
    condition: {
      action: "Delete the file",
      closeWhenDone: true,
      cwd: "D:\\Incoming",
      keepState: true,
      prompt: "A new file has arrived since the last check",
      sessionMode: "existing",
      targetMode: "title",
      targetName: "Tests",
      tools: { allow: ["shell(git:*)"], deny: ["write(.env)"], mode: "selected" },
      ...conditionOverrides
    },
    enabled: true,
    id: "condition-runtime-rule",
    name: "Incoming sweep",
    trigger: { intervalMinutes: 60, mode: "interval", type: "schedule" },
    type: "condition",
    ...overrides
  };
}

// Drives a whole conditional run against a stubbed Copilot session: the bridge
// answers the directory check and the events cursor, and the terminal readiness
// follows the real launch/exit/relaunch lifecycle.
async function runConditionScenario(page, config) {
  return page.evaluate(async (options) => {
    const saved = {
      activeBufferLines,
      copilotCliRecoveryNeeded,
      pasteIntoSpecificTerminal,
      requestBridge,
      requestConditionConsent,
      scheduleTerminalEnter,
      sendBridge,
      sendTerminalSlashDirective,
      terminalExecutionReadiness
    };
    const launches = [];
    const prompts = [];
    const slash = [];
    const delivery = [];
    let loadingPolls = Number(options.loadingPolls || 0);
    let noiseEndedAt = 0;
    let readsWhileBusy = 0;
    let trustPending = Boolean(options.trustPrompt);
    let trustAnswers = 0;
    let readiness = options.initialReadiness || { mode: "shell", ready: true };
    let turn = 0;
    const target = () => [...state.terminals.values()].find((item) => item.titleInput?.value === "Tests");
    try {
      copilotCliRecoveryNeeded = () => false;
      requestConditionConsent = () => Promise.resolve(options.consent || { granted: true, reason: "" });
      // Tied to the product's own polling rather than a timer, so a loaded
      // machine cannot starve the simulated loading window.
      terminalExecutionReadiness = () => {
        if (loadingPolls > 0 && readiness.mode === "copilot") {
          loadingPolls -= 1;
          const terminal = target();
          if (terminal) terminal.outputRevision += 1;
          if (loadingPolls === 0) noiseEndedAt = Date.now();
        }
        return readiness;
      };
      activeBufferLines = () => {
        if (trustPending) return ["D:\\Incoming", "Do you trust the files in this folder?", "1. Yes"];
        if (options.approvalPrompt) return ["Do you want to run this command?", "1. Yes"];
        if (options.launchFails) return ["PS D:\\Incoming> copilot --max-ai-credits 5", options.launchFails];
        return [];
      };
      sendBridge = (message) => {
        if (message.type === "input" && message.data === "\r" && trustPending) {
          trustPending = false;
          trustAnswers += 1;
          const terminal = target();
          if (terminal) terminal.outputRevision += 1;
          return true;
        }
        if (message.type === "input" && /(^|\s)copilot\s/.test(message.data)) {
          launches.push(message.data.trim());
          if (options.launchFails) return true;
          readiness = { mode: "copilot", ready: true };
        }
        return true;
      };
      sendTerminalSlashDirective = (_terminal, command) => {
        slash.push(command);
        if (command === "exit") readiness = { mode: "shell", ready: true };
        return true;
      };
      pasteIntoSpecificTerminal = (_terminal, text) => {
        prompts.push(text);
        delivery.push(Date.now());
        if (options.busyMs) {
          readiness = { mode: "copilot", ready: false };
          window.setTimeout(() => { readiness = { mode: "copilot", ready: true }; }, options.busyMs);
        }
        return true;
      };
      scheduleTerminalEnter = () => {};
      requestBridge = async (message) => {
        if (message.type === "validateDirectory") return { path: message.path, valid: true };
        if (message.type !== "copilotAutomationOutput") return null;
        if (message.snapshot) return { complete: false, cursor: 10, output: "", truncated: false };
        if (!readiness.ready) readsWhileBusy += 1;
        if (options.approvalPrompt) return { complete: false, cursor: 10, output: "", truncated: false };
        const task = [...state.automationRuntime.steps.values()].find((item) => item.kind === "condition");
        const template = options.turns[Math.min(turn, options.turns.length - 1)];
        turn += 1;
        return {
          complete: true,
          cursor: 20,
          output: template.replaceAll("{token}", task ? task.resultToken : ""),
          truncated: false
        };
      };

      localStorage.removeItem("multiterm.conditionCheckLedger");
      state.automationRuntime.conditionChecks.clear();
      const rule = automationApi.normalizeRule(options.rule);
      state.automations.rules = [rule];
      state.automations.history = [];
      const started = runConditionAutomationRule(rule, {});
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline
        && [...state.automationRuntime.steps.values()].some((item) => item.kind === "condition")) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const stored = state.automations.rules[0];
      return {
        checkedAt: stored.conditionCheckedAt,
        deliveredAfterLoading: delivery.length > 0 && noiseEndedAt > 0 && delivery[0] >= noiseEndedAt,
        history: state.automations.history.map((entry) => ({ detail: entry.detail, status: entry.status })),
        launches,
        prompts,
        readsWhileBusy,
        rememberedState: stored.conditionState,
        slash,
        started,
        trustAnswers,
        turns: turn
      };
    } finally {
      activeBufferLines = saved.activeBufferLines;
      copilotCliRecoveryNeeded = saved.copilotCliRecoveryNeeded;
      pasteIntoSpecificTerminal = saved.pasteIntoSpecificTerminal;
      requestBridge = saved.requestBridge;
      requestConditionConsent = saved.requestConditionConsent;
      scheduleTerminalEnter = saved.scheduleTerminalEnter;
      sendBridge = saved.sendBridge;
      sendTerminalSlashDirective = saved.sendTerminalSlashDirective;
      terminalExecutionReadiness = saved.terminalExecutionReadiness;
      for (const item of [...state.automationRuntime.steps.values()]) {
        if (item.kind === "condition") state.automationRuntime.steps.delete(item.token);
      }
      localStorage.removeItem("multiterm.conditionCheckLedger");
      state.automationRuntime.conditionChecks.clear();
    }
  }, config);
}

async function reset(page) {
  await page.goto("/");
  await expect(page.locator("#bridgeStatus")).toContainText(/connected|Bridge starting/i);
  await page.evaluate(() => {
    closeAllTerminals();
    localStorage.removeItem("multiterm.automations");
    state.automations = automationApi.normalizeStore(null, state.settings.automationHistoryLimit);
    state.automationStudio.editingId = null;
    if (!elements.automationOverlay.hidden) closeAutomationStudio({ restoreFocus: false });
  });
  await expect.poll(async () => {
    await page.evaluate(() => closeAllTerminals());
    return page.locator(".terminal-pane").count();
  }, { timeout: 30000 }).toBe(0);
  await page.evaluate(() => {
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
    await page.locator("#automationMachineState").selectOption("locked");
    await page.locator("[data-schedule-mode='weekly']").click();
    await page.locator("#automationTime").fill("08:30");
    await page.locator("[data-day='5']").click();
    await page.locator(".automation-action-command").fill("npm test");
    await page.locator(".automation-action-delivery").selectOption("stage");
    await page.locator(".automation-action-page-mode").selectOption("existing");
    await expect(page.locator(".automation-action-page-name-field")).toBeVisible();
    await expect(page.locator(".automation-action-page-name-field datalist option")).toHaveValue("Page 1");
    await page.locator(".automation-action-page-name").fill("Page 1");
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
    expect(stored.rules[0]).toMatchObject({ enabled: true, machineState: "locked", name: "Morning checks", runAs: "andre", type: "command" });
    expect(stored.rules[0].actions).toHaveLength(2);
    expect(stored.rules[0].actions[0]).toMatchObject({
      command: "npm test",
      pageMode: "existing",
      pageName: "Page 1",
      submit: false,
      targetName: "Tests"
    });
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

  test("creates a title-matched appearance profile and restores manual styling when the title stops matching", async ({ page }) => {
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      terminal.terminalBackground = "#101820";
      terminal.terminalForeground = "#E8E8E8";
      terminal.terminalFontFamily = "Consolas";
      applyTerminalAppearance(terminal);
    });

    await page.locator("#automationsToggle").click();
    await page.locator("#automationNew").click();
    await page.locator("[data-automation-type='appearance']").click();
    await expect(page.locator("#automationAppearanceBlock")).toBeVisible();
    await expect(page.locator("#automationScheduleBlock")).toBeHidden();
    await expect(page.locator("#automationActionsBlock")).toBeHidden();
    await expect(page.locator("#automationRunAsField")).toBeHidden();
    await expect(page.locator("#automationRunNow span")).toHaveText("Apply now");
    await expect(page.locator("#automationTitleMatchType option")).toHaveText(["Contains", "Equals", "Regular expression"]);
    await page.locator("#automationName").fill("Test terminal palette");
    await page.locator("#automationTitleMatchType").selectOption("regex");
    await page.locator("#automationTitleMatchCase").selectOption("insensitive");
    await page.locator("#automationTitleMatchValue").fill("[");
    expect(await page.locator("#automationTitleMatchValue").evaluate((input) => ({
      message: input.validationMessage,
      valid: input.checkValidity()
    }))).toEqual({ message: "Enter a valid regular expression.", valid: false });
    await page.locator("#automationTitleMatchValue").fill("(a+)+$");
    expect(await page.locator("#automationTitleMatchValue").evaluate((input) => ({
      message: input.validationMessage,
      valid: input.checkValidity()
    }))).toEqual({
      message: "Use a regular expression without ambiguous repetition: no nested quantifiers such as (a+)+, no adjacent open-ended quantifiers such as .*.*, and no quantifier on an alternation group such as (a|b)*.",
      valid: false
    });
    await page.locator("#automationTitleMatchValue").fill("^tests$");

    await page.locator("#automationAppearanceEdit").click();
    await expect(page.locator("#headerBackgroundOverlay")).toBeVisible();
    await expect(page.locator("#headerBackgroundApply")).toHaveText("Save profile");
    await page.locator("#terminalAppearanceBackgroundHex").fill("#223344");
    await page.locator("#terminalAppearanceForegroundHex").fill("#F4EEDD");
    await page.locator("#terminalAppearanceFontFamily").selectOption("Courier New");
    await page.locator("#terminalAppearanceTabHeader").click();
    await page.locator("#headerAppearanceFontFamily").selectOption("Consolas");
    await page.locator("#headerAppearanceFontSize").fill("16");
    await page.locator("#headerBackgroundApply").click();
    await expect(page.locator("#headerBackgroundOverlay")).toBeHidden();
    await expect(page.locator("#automationAppearanceSummary")).toContainText("Courier New");
    await page.locator("#automationSave").click();

    const applied = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const stored = JSON.parse(localStorage.getItem("multiterm.automations")).rules[0];
      return {
        automatedRuleId: terminal.automationAppearanceRuleId,
        background: terminal.term.options.theme.background,
        fontFamily: terminal.term.options.fontFamily,
        headerFontSize: terminal.pane.querySelector(".pane-bar").style.getPropertyValue("--pane-title-font-size"),
        stored
      };
    });
    expect(applied.background).toBe("#223344");
    expect(applied.fontFamily).toContain("Courier New");
    expect(applied.headerFontSize).toBe("16px");
    expect(applied.automatedRuleId).toBe(applied.stored.id);
    expect(applied.stored).toMatchObject({
      enabled: true,
      name: "Test terminal palette",
      titleMatch: { caseSensitive: false, type: "regex", value: "^tests$" },
      type: "appearance"
    });
    expect(applied.stored.appearance).toMatchObject({
      background: "#223344",
      foreground: "#F4EEDD",
      fontFamily: "Courier New",
      headerBackground: { fontFamily: "Consolas", fontSize: 16 }
    });

    const restored = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      commitTerminalTitle(terminal, "Production", false, "manual");
      return {
        automatedRuleId: terminal.automationAppearanceRuleId,
        background: terminal.term.options.theme.background,
        fontFamily: terminal.term.options.fontFamily
      };
    });
    expect(restored).toMatchObject({ automatedRuleId: "", background: "#101820" });
    expect(restored.fontFamily).toContain("Consolas");

    await page.evaluate(() => commitTerminalTitle([...state.terminals.values()][0], "TESTS", false, "manual"));
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0].term.options.theme.background)).toBe("#223344");
  });

  test("uses first-match appearance priority across pause, deletion, enablement, and terminal creation", async ({ page }) => {
    const initial = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      terminal.terminalBackground = "#101820";
      applyTerminalAppearance(terminal);
      const profile = automationAppearanceProfileSeed(terminal);
      const rule = (id, name, background) => automationApi.normalizeRule({
        actions: [],
        appearance: { ...profile, background },
        enabled: true,
        id,
        name,
        titleMatch: { caseSensitive: false, type: "contains", value: "test" },
        type: "appearance"
      });
      state.automations.rules = [
        rule("appearance-first", "First palette", "#AA0000"),
        rule("appearance-second", "Second palette", "#00AA00")
      ];
      saveAutomationStore();
      refreshAppearanceAutomations();
      return terminal.term.options.theme.background;
    });
    expect(initial).toBe("#AA0000");

    await page.locator("#automationsToggle").click();
    await expect(page.locator(".automation-rule-row")).toHaveCount(2);
    await page.locator(".automation-rule-state").first().click();
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0].term.options.theme.background)).toBe("#00AA00");

    await page.locator("#automationsPause").click();
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0].term.options.theme.background)).toBe("#101820");
    await page.locator("#automationsPause").click();
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0].term.options.theme.background)).toBe("#00AA00");

    await page.evaluate(() => deleteAutomationRule("appearance-second"));
    await expect(page.locator(".automation-rule-row")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0].term.options.theme.background)).toBe("#101820");
    await page.locator(".automation-rule-state").click();
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0].term.options.theme.background)).toBe("#AA0000");

    await page.evaluate(() => addTerminal({ title: "Tests" }));
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].at(-1).term.options.theme.background)).toBe("#AA0000");
  });

  test("styles on the committed title, not a title suggestion awaiting approval", async ({ page }) => {
    const staged = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      commitTerminalTitle(terminal, "Staging", false, "manual");
      terminal.terminalBackground = "#101820";
      applyTerminalAppearance(terminal);
      const profile = automationAppearanceProfileSeed(terminal);
      state.automations.rules = [automationApi.normalizeRule({
        actions: [],
        appearance: { ...profile, background: "#AA0000" },
        enabled: true,
        id: "appearance-suggestion",
        name: "Production palette",
        titleMatch: { caseSensitive: false, type: "equals", value: "Production" },
        type: "appearance"
      })];
      saveAutomationStore();
      refreshAppearanceAutomations();
      return terminal.term.options.theme.background;
    });
    expect(staged).toBe("#101820");

    // The suggestion is previewed in the title input before the user approves it.
    const previewed = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      showTerminalTitleSuggestion(terminal, "Production");
      refreshAppearanceAutomations();
      return {
        background: terminal.term.options.theme.background,
        ruleId: terminal.automationAppearanceRuleId,
        shownTitle: terminal.titleInput.value
      };
    });
    expect(previewed).toEqual({ background: "#101820", ruleId: "", shownTitle: "Production" });

    const rejected = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      rejectTerminalTitleSuggestion(terminal);
      return { background: terminal.term.options.theme.background, shownTitle: terminal.titleInput.value };
    });
    expect(rejected).toEqual({ background: "#101820", shownTitle: "Staging" });

    const accepted = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      showTerminalTitleSuggestion(terminal, "Production");
      acceptTerminalTitleSuggestion(terminal);
      return { background: terminal.term.options.theme.background, ruleId: terminal.automationAppearanceRuleId };
    });
    expect(accepted).toEqual({ background: "#AA0000", ruleId: "appearance-suggestion" });
  });

  test("persists output match controls on dependent steps", async ({ page }) => {
    await page.locator("#automationsToggle").click();
    await page.locator("#automationNew").click();
    await page.locator("#automationName").fill("Publish after passing build");
    await page.locator(".automation-action-command").fill("npm test");
    await page.locator("#automationActionAdd").click();
    const step = page.locator(".automation-action-row").nth(1);
    await step.locator(".automation-action-command").fill("npm run publish");
    await step.locator(".automation-action-condition").selectOption("output-match");
    await expect(step.locator(".automation-output-match-fields")).toBeVisible();
    await expect(step.locator(".automation-action-output-value")).toHaveAttribute("required", "");
    await step.locator(".automation-action-output-type").selectOption("regex");
    await step.locator(".automation-action-output-case").selectOption("sensitive");
    await step.locator(".automation-action-output-across-lines").check();
    await step.locator(".automation-action-output-value").fill("[");
    expect(await step.locator(".automation-action-output-value").evaluate((input) => ({
      message: input.validationMessage,
      valid: input.checkValidity()
    }))).toEqual({ message: "Enter a valid regular expression.", valid: false });
    await step.locator(".automation-action-output-value").fill("Build\\s+passed");
    await page.locator("#automationSave").click();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.automations")).rules[0].actions[1]);
    expect(stored).toMatchObject({
      condition: "output-match",
      outputMatchAcrossLines: true,
      outputMatchCaseSensitive: true,
      outputMatchType: "regex",
      outputMatchValue: "Build\\s+passed"
    });
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
        const typeBlock = editor.querySelector(".automation-kind-block");
        const nameField = editor.querySelector(".automation-name-field");
        const controls = [...editor.querySelectorAll(".automation-action-row input, .automation-action-row select, .automation-action-row button")];
        const thenBlock = editor.querySelector("#automationActionsBlock");
        const account = editor.querySelector(".automation-account-field");
        const accountRect = account.getBoundingClientRect();
        const nameRect = nameField.getBoundingClientRect();
        const thenRect = thenBlock.getBoundingClientRect();
        const typeRect = typeBlock.getBoundingClientRect();
        return {
          accountAfterThen: Boolean(thenBlock.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING),
          accountBelowThen: accountRect.top >= thenRect.bottom,
          accountInputWidth: account.querySelector("input").getBoundingClientRect().width,
          accountLeft: accountRect.left,
          clientWidth: editor.clientWidth,
          controlsInside: controls.every((control) => control.getBoundingClientRect().right <= editorRect.right + 1),
          nameAfterType: Boolean(typeBlock.compareDocumentPosition(nameField) & Node.DOCUMENT_POSITION_FOLLOWING),
          nameBelowType: nameRect.top >= typeRect.bottom,
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
      expect(scheduleGeometry.nameAfterType).toBe(true);
      expect(scheduleGeometry.nameBelowType).toBe(true);

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

  test("opens automation terminals on the current, named, or a new page", async ({ page }) => {
    const result = await page.evaluate(() => {
      const originalPages = structuredClone(state.pages);
      const originalActivePageId = state.activePageId;
      const namedPageId = addPage({ activate: false, name: "Build output" });
      const activeBefore = state.activePageId;
      const named = resolveAutomationActionTarget({
        cwd: "D:\\multiTerm",
        pageMode: "existing",
        pageName: "Build output",
        targetMode: "new"
      });
      setActivePage(namedPageId, { focus: false });
      const current = resolveAutomationActionTarget({ pageMode: "current", targetMode: "new" });
      const pageCountBeforeNew = state.pages.length;
      const fresh = resolveAutomationActionTarget({ pageMode: "new", targetMode: "new" });
      const missing = resolveAutomationActionTarget({
        pageMode: "existing",
        pageName: "Missing page",
        targetMode: "new"
      });
      const value = {
        activeBefore,
        activeAfter: state.activePageId,
        currentPageId: current.terminal?.pageId,
        freshPageId: fresh.terminal?.pageId,
        freshPageName: pageName(fresh.terminal?.pageId),
        missingError: missing.error,
        namedPageId,
        namedTerminalPageId: named.terminal?.pageId,
        pageCountAfterNew: state.pages.length,
        pageCountBeforeNew
      };
      closeAllTerminals();
      state.pages = originalPages;
      state.activePageId = originalActivePageId;
      savePages();
      renderPager();
      return value;
    });

    expect(result.namedTerminalPageId).toBe(result.namedPageId);
    expect(result.activeBefore).not.toBe(result.namedPageId);
    expect(result.currentPageId).toBe(result.namedPageId);
    expect(result.pageCountAfterNew).toBe(result.pageCountBeforeNew + 1);
    expect(result.freshPageId).not.toBe(result.namedPageId);
    expect(result.freshPageName).toMatch(/^Page \d+$/);
    expect(result.activeAfter).toBe(result.namedPageId);
    expect(result.missingError).toBe("No page is named Missing page");
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

  test("captures command output and opens output-match branches", async ({ page }) => {
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const rule = automationApi.normalizeRule({
        actions: [
          { command: "build", id: "action-output01", targetName: "Tests" },
          {
            command: "publish",
            condition: "output-match",
            dependsOn: ["action-output01"],
            id: "action-output02",
            outputMatchAcrossLines: true,
            outputMatchCaseSensitive: false,
            outputMatchType: "regex",
            outputMatchValue: "build\\s+passed",
            targetName: "Tests"
          },
          {
            command: "notify",
            condition: "output-not-match",
            dependsOn: ["action-output01"],
            id: "action-output03",
            outputMatchCaseSensitive: false,
            outputMatchType: "exact",
            outputMatchValue: "failed",
            targetName: "Tests"
          }
        ],
        enabled: true,
        id: "automation-output1",
        name: "Output branch",
        trigger: { intervalMinutes: 60, mode: "interval" }
      });
      runAutomationRule(rule);
      const run = [...state.automationRuntime.runs.values()].find((candidate) => candidate.rule.id === rule.id);
      const firstTask = terminal.automationWorkflowTasks[0];
      terminal.automationWorkflowActive = firstTask.token;
      terminal.automationWorkflowBuffer = "";
      consumeAutomationWorkflowOutput(terminal, `noise before marker\x1b]777;multiterm-automation;${firstTask.token};sta`);
      consumeAutomationWorkflowOutput(terminal, `rt\x07Build\nPASSED\x1b]777;multiterm-automation;${firstTask.token};0\x07`);
      const states = Object.fromEntries(run.states);
      const captured = run.outputs.get("action-output01");
      for (const task of [...terminal.automationWorkflowTasks]) finishAutomationWorkflowTask(task.token, 0);
      window.clearTimeout(terminal.automationWorkflowTimer);
      terminal.automationWorkflowTimer = 0;
      return {
        captured,
        states,
        matcherCases: {
          containsInsensitive: automationOutputMatches({ outputMatchType: "contains", outputMatchValue: "passed" }, "PASSED"),
          containsSensitive: automationOutputMatches({ outputMatchCaseSensitive: true, outputMatchType: "contains", outputMatchValue: "passed" }, "PASSED"),
          exactLine: automationOutputMatches({ outputMatchType: "exact", outputMatchValue: "second" }, "first\nsecond"),
          exactAcross: automationOutputMatches({ outputMatchAcrossLines: true, outputMatchType: "exact", outputMatchValue: "first\nsecond" }, "first\nsecond"),
          exactAcrossTrailingNewline: automationOutputMatches({ outputMatchAcrossLines: true, outputMatchType: "exact", outputMatchValue: "first\nsecond" }, "first\r\nsecond\r\n"),
          regexLine: automationOutputMatches({ outputMatchType: "regex", outputMatchValue: "first.*second" }, "first\nsecond"),
          regexAcross: automationOutputMatches({ outputMatchAcrossLines: true, outputMatchType: "regex", outputMatchValue: "first.*second" }, "first\nsecond"),
          regexAcrossLineAnchor: automationOutputMatches({ outputMatchAcrossLines: true, outputMatchType: "regex", outputMatchValue: "^second$" }, "first\nsecond"),
          invalidRegex: automationOutputMatches({ outputMatchType: "regex", outputMatchValue: "[" }, "anything"),
          emptyNotMatchDecision: automationGateDecision({
            outputAvailable: new Set(["dependency"]),
            outputs: new Map([["dependency", "anything"]]),
            states: new Map([["dependency", "succeeded"]])
          }, {
            condition: "output-not-match",
            conditionOperator: "all",
            dependsOn: ["dependency"],
            outputMatchType: "contains",
            outputMatchValue: ""
          }),
          invalidNotMatchDecision: automationGateDecision({
            outputAvailable: new Set(["dependency"]),
            outputs: new Map([["dependency", "anything"]]),
            states: new Map([["dependency", "succeeded"]])
          }, {
            condition: "output-not-match",
            conditionOperator: "all",
            dependsOn: ["dependency"],
            outputMatchType: "regex",
            outputMatchValue: "["
          }),
          stagedOutputDecision: automationGateDecision({
            outputAvailable: new Set(),
            outputs: new Map([["dependency", ""]]),
            states: new Map([["dependency", "succeeded"]])
          }, {
            condition: "output-not-match",
            conditionOperator: "all",
            dependsOn: ["dependency"],
            outputMatchType: "contains",
            outputMatchValue: "failure"
          })
        }
      };
    });

    expect(result.captured).toBe("Build\nPASSED");
    expect(result.states).toMatchObject({
      "action-output01": "succeeded",
      "action-output02": "running",
      "action-output03": "running"
    });
    expect(result.matcherCases).toEqual({
      containsInsensitive: true,
      containsSensitive: false,
      exactLine: true,
      exactAcross: true,
      exactAcrossTrailingNewline: true,
      regexLine: false,
      regexAcross: true,
      regexAcrossLineAnchor: true,
      invalidRegex: false,
      emptyNotMatchDecision: "skip",
      invalidNotMatchDecision: "skip",
      stagedOutputDecision: "skip"
    });
  });

  test("decodes a bounded output payload split across transport chunks", async ({ page }) => {
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const action = automationApi.normalizeAction({
        command: "payload",
        id: "action-payload1",
        targetName: terminal.titleInput.value
      });
      const run = {
        id: "run-payload1",
        outputAvailable: new Set(),
        outputs: new Map(),
        rule: { actions: [action], id: "automation-payload1", name: "Payload split" },
        states: new Map([[action.id, "running"]])
      };
      const token = "payload-split-token";
      const task = {
        actionId: action.id,
        captureStarted: true,
        kind: "command",
        output: "raw fallback",
        runId: run.id,
        terminalId: terminal.id,
        timeoutTimer: 0,
        token
      };
      state.automationRuntime.runs.set(run.id, run);
      state.automationRuntime.steps.set(token, task);
      terminal.automationWorkflowActive = token;
      terminal.automationWorkflowBuffer = "";
      const expected = "First line\nSecond line\n";
      const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(expected)));
      const prefix = `\x1b]777;multiterm-automation;${token};0;1;`;
      consumeAutomationWorkflowOutput(terminal, `${prefix}${encoded.slice(0, 9)}`);
      const retainedPrefix = terminal.automationWorkflowBuffer.startsWith(prefix);
      const pending = state.automationRuntime.steps.has(token);
      consumeAutomationWorkflowOutput(terminal, `${encoded.slice(9)}\x07`);
      return {
        output: run.outputs.get(action.id),
        outputAvailable: run.outputAvailable.has(action.id),
        pending,
        retainedPrefix,
        state: run.states.get(action.id)
      };
    });
    expect(result).toEqual({
      output: "First line\nSecond line\n",
      outputAvailable: true,
      pending: true,
      retainedPrefix: true,
      state: "succeeded"
    });
  });

  test("fails an incomplete output marker that exceeds the configured ceiling", async ({ page }) => {
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const priorCaptureKb = state.settings.automationOutputCaptureKb;
      state.settings.automationOutputCaptureKb = 16;
      const action = automationApi.normalizeAction({ command: "oversized", id: "action-oversized1", targetName: terminal.titleInput.value });
      const run = {
        id: "run-oversized1",
        outputAvailable: new Set(),
        outputs: new Map(),
        rule: { actions: [action], id: "automation-oversized1", name: "Oversized marker" },
        states: new Map([[action.id, "running"]])
      };
      const token = "oversized-marker-token";
      const task = { actionId: action.id, captureStarted: true, kind: "command", output: "", runId: run.id, terminalId: terminal.id, timeoutTimer: 0, token };
      state.automationRuntime.runs.set(run.id, run);
      state.automationRuntime.steps.set(token, task);
      terminal.automationWorkflowActive = token;
      terminal.automationWorkflowBuffer = "";
      const prefix = `\x1b]777;multiterm-automation;${token};0;1;`;
      consumeAutomationWorkflowOutput(terminal, `${prefix}${"A".repeat(automationCompletionPayloadLimitCharacters() + 1)}`);
      const history = state.automations.history.filter((entry) => entry.automationId === run.rule.id);
      state.settings.automationOutputCaptureKb = priorCaptureKb;
      return {
        active: terminal.automationWorkflowActive,
        detail: history.find((entry) => entry.status === "failed" && entry.title.endsWith("Step 1"))?.detail || "",
        pending: state.automationRuntime.steps.has(token),
        state: run.states.get(action.id)
      };
    });
    expect(result).toEqual({
      active: "",
      detail: "Automation output marker exceeded the configured capture limit",
      pending: false,
      state: "failed"
    });
  });

  test("marks a completion payload without capturable child output as unavailable", async ({ page }) => {
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const action = automationApi.normalizeAction({ command: "credential child", id: "action-unavailable1", targetName: terminal.titleInput.value });
      const run = {
        id: "run-unavailable1",
        outputAvailable: new Set(),
        outputs: new Map(),
        rule: { actions: [action], id: "automation-unavailable1", name: "Unavailable output" },
        states: new Map([[action.id, "running"]])
      };
      const token = "unavailable-output-token";
      const task = { actionId: action.id, captureStarted: true, kind: "command", output: "raw", runId: run.id, terminalId: terminal.id, timeoutTimer: 0, token };
      state.automationRuntime.runs.set(run.id, run);
      state.automationRuntime.steps.set(token, task);
      terminal.automationWorkflowActive = token;
      terminal.automationWorkflowBuffer = "";
      consumeAutomationWorkflowOutput(terminal, `\x1b]777;multiterm-automation;${token};0;0;\x07`);
      return {
        available: run.outputAvailable.has(action.id),
        output: run.outputs.get(action.id),
        state: run.states.get(action.id)
      };
    });
    expect(result).toEqual({ available: false, output: "", state: "succeeded" });
  });

  test("bounds authoritative command output by UTF-8 bytes", async ({ page }) => {
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0]?.status)).toBe("live");
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const priorCaptureKb = state.settings.automationOutputCaptureKb;
      const originalComplete = completeAutomationStep;
      let captured = "";
      state.settings.automationOutputCaptureKb = 16;
      completeAutomationStep = function (run, action, succeeded, detail, output, available) {
        if (run.rule.id === "automation-unicode1") captured = output;
        return originalComplete(run, action, succeeded, detail, output, available);
      };
      try {
        const rule = automationApi.normalizeRule({
          actions: [{
            command: "Write-Output ([string]::new([char]0x6F22,7000) + 'UNICODE_TAIL')",
            id: "action-unicode1",
            inputType: "powershell",
            targetName: terminal.titleInput.value
          }],
          enabled: true,
          id: "automation-unicode1",
          name: "Unicode output bound",
          trigger: { intervalMinutes: 60, mode: "interval" }
        });
        runAutomationRule(rule);
        const deadline = Date.now() + 30000;
        while ([...state.automationRuntime.runs.values()].some((run) => run.rule.id === rule.id) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return {
          bytes: new TextEncoder().encode(captured).length,
          endsWithTail: captured.trimEnd().endsWith("UNICODE_TAIL"),
          finished: ![...state.automationRuntime.runs.values()].some((run) => run.rule.id === rule.id)
        };
      } finally {
        completeAutomationStep = originalComplete;
        state.settings.automationOutputCaptureKb = priorCaptureKb;
      }
    });
    expect(result.finished).toBe(true);
    expect(result.bytes).toBeLessThanOrEqual(16 * 1024);
    expect(result.endsWithTail).toBe(true);
  });

  test("flushes cold formatted multiline output before evaluating a regex gate", async ({ page }) => {
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0]?.status)).toBe("live");
    const ruleId = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const rule = automationApi.normalizeRule({
        actions: [
          {
            command: "Write-Output 'Cold Line One'; Write-Output 'Cold Line Two'",
            id: "action-coldfmt1",
            inputType: "powershell",
            targetName: terminal.titleInput.value
          },
          {
            command: "Write-Output 'COLD_REGEX_BRANCH_RAN'",
            condition: "output-match",
            dependsOn: ["action-coldfmt1"],
            id: "action-coldfmt2",
            inputType: "powershell",
            outputMatchAcrossLines: true,
            outputMatchCaseSensitive: true,
            outputMatchType: "regex",
            outputMatchValue: "Cold Line One.*Cold Line Two",
            targetName: terminal.titleInput.value
          }
        ],
        enabled: true,
        id: "automation-coldfmt1",
        name: "Cold multiline output",
        trigger: { intervalMinutes: 60, mode: "interval" }
      });
      runAutomationRule(rule, { manual: true });
      return rule.id;
    });

    await expect.poll(() => page.evaluate((id) => (
      [...state.automationRuntime.runs.values()].some((run) => run.rule.id === id)
    ), ruleId), { timeout: 30000 }).toBe(false);
    const result = await page.evaluate((id) => {
      const history = state.automations.history.filter((entry) => entry.automationId === id);
      const terminal = [...state.terminals.values()][0];
      const buffer = terminal.term.buffer.active;
      const lines = [];
      for (let index = 0; index < buffer.length; index += 1) {
        const line = buffer.getLine(index);
        if (line) lines.push(line.translateToString(true));
      }
      return {
        stepTwo: history.filter((entry) => entry.title.endsWith("Step 2")).at(-1),
        terminalText: lines.join("\n")
      };
    }, ruleId);
    expect(result.stepTwo).toMatchObject({ status: "completed" });
    expect(result.terminalText).toContain("COLD_REGEX_BRANCH_RAN");
  });

  test("fails a timed-out step and opens its failure branch", async ({ page }) => {
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const priorTimeout = state.settings.automationStepTimeoutMinutes;
      state.settings.automationStepTimeoutMinutes = 1;
      const rule = automationApi.normalizeRule({
        actions: [
          { command: "hang", id: "action-timeout1", targetName: "Tests" },
          { command: "recover", condition: "failure", dependsOn: ["action-timeout1"], id: "action-timeout2", targetName: "Tests" }
        ],
        enabled: true,
        id: "automation-timeout1",
        name: "Timeout branch",
        trigger: { intervalMinutes: 60, mode: "interval" }
      });
      runAutomationRule(rule);
      const run = [...state.automationRuntime.runs.values()].find((candidate) => candidate.rule.id === rule.id);
      const task = terminal.automationWorkflowTasks[0];
      const expired = expireAutomationTask(task);
      const states = Object.fromEntries(run.states);
      const outputAvailable = run.outputAvailable.has("action-timeout1");
      const detail = state.automations.history.find((entry) => entry.title.endsWith("Step 1") && entry.status === "failed")?.detail || "";
      for (const pending of [...terminal.automationWorkflowTasks]) finishAutomationWorkflowTask(pending.token, 0);
      state.settings.automationStepTimeoutMinutes = priorTimeout;
      return { detail, expired, outputAvailable, states };
    });
    expect(result).toMatchObject({
      detail: "Timed out after 1 minute",
      expired: true,
      outputAvailable: false,
      states: {
        "action-timeout1": "failed",
        "action-timeout2": "running"
      }
    });
  });

  test("records synchronous workflow completion only once", async ({ page }) => {
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const rule = automationApi.normalizeRule({
        actions: [
          { command: "first", id: "action-sync001", submit: false, targetName: terminal.titleInput.value },
          { command: "second", dependsOn: ["action-sync001"], id: "action-sync002", submit: false, targetName: terminal.titleInput.value }
        ],
        enabled: true,
        id: "automation-sync1",
        name: "Synchronous stages",
        trigger: { intervalMinutes: 60, mode: "interval" }
      });
      runAutomationRule(rule);
      return state.automations.history.filter((entry) => entry.automationId === rule.id && entry.title === rule.name && entry.status === "completed").length;
    });
    expect(result).toBe(1);
  });

  test("completes a Copilot step from its event log and opens an output-match branch", async ({ page }) => {
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0]?.status)).toBe("live");
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const savedQueue = queueAutomaticTerminalCommand;
      const savedReadiness = terminalExecutionReadiness;
      const savedRequest = requestBridge;
      const queued = [];
      const requests = [];
      queueAutomaticTerminalCommand = (_terminal, command, options = {}) => {
        queued.push({ command, occurrenceKey: options.occurrenceKey || "" });
        return true;
      };
      terminalExecutionReadiness = () => ({ mode: "copilot", ready: true });
      requestBridge = async (message) => {
        requests.push(message);
        return message.snapshot
          ? { complete: false, cursor: 120, output: "", truncated: false }
          : { complete: true, cursor: 240, output: "Review APPROVED\nReady to ship", truncated: false };
      };
      try {
        const rule = automationApi.normalizeRule({
          actions: [
            {
              command: "Review the pending changes",
              cwd: "D:\multiTerm",
              id: "action-copilot1",
              targetMode: "title",
              targetName: "Tests"
            },
            {
              command: "Prepare the release",
              condition: "output-match",
              dependsOn: ["action-copilot1"],
              id: "action-copilot2",
              outputMatchCaseSensitive: false,
              outputMatchType: "contains",
              outputMatchValue: "approved",
              targetMode: "title",
              targetName: "Tests"
            }
          ],
          enabled: true,
          id: "automation-copilot1",
          name: "Scheduled review",
          type: "copilot",
          trigger: { intervalMinutes: 60, mode: "interval" }
        });
        const started = runAutomationRule(rule, { manual: true });
        await new Promise((resolve) => setTimeout(resolve, 0));
        const run = [...state.automationRuntime.runs.values()].find((candidate) => candidate.rule.id === rule.id);
        const firstTask = [...state.automationRuntime.steps.values()].find((task) => task.actionId === "action-copilot1");
        prepareAutomationCopilotPromptCursor(terminal, { id: "test-prompt", occurrenceKey: firstTask.occurrenceKey });
        await new Promise((resolve) => setTimeout(resolve, 0));
        markAutomationCopilotPromptSent(terminal, firstTask.occurrenceKey);
        terminal.outputRevision = firstTask.responseStartRevision + 1;
        await pollAutomationCopilotSteps(terminal);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const states = Object.fromEntries(run.states);
        const output = run.outputs.get("action-copilot1");
        const secondTask = [...state.automationRuntime.steps.values()].find((task) => task.actionId === "action-copilot2");
        const secondSessionId = secondTask?.sessionId || "";
        for (const task of [...state.automationRuntime.steps.values()]) {
          if (task.kind === "copilot") finishCopilotAutomationTask(task.token, false, "test cleanup");
        }
        window.clearTimeout(terminal.automationCopilotTimer);
        terminal.automationCopilotTimer = 0;
        return { output, queued, requests, secondSessionId, started, states };
      } finally {
        queueAutomaticTerminalCommand = savedQueue;
        terminalExecutionReadiness = savedReadiness;
        requestBridge = savedRequest;
      }
    });
    expect(result.started).toBe(1);
    expect(result.queued.map((entry) => entry.command)).toEqual(["/cwd D:\multiTerm", "Review the pending changes", "Prepare the release"]);
    expect(result.requests[0]).toMatchObject({ sessionId: expect.any(String), snapshot: true, type: "copilotAutomationOutput" });
    expect(result.requests[1]).toMatchObject({ cursor: 120, sessionId: result.requests[0].sessionId, type: "copilotAutomationOutput" });
    expect(result.secondSessionId).toBe(result.requests[0].sessionId);
    expect(result.output).toBe("Review APPROVED\nReady to ship");
    expect(result.states).toMatchObject({
      "action-copilot1": "succeeded",
      "action-copilot2": "running"
    });
  });

  test("offers Copilot staging and inserts only when the TUI is ready without Enter", async ({ page }) => {
    await page.locator("#automationsToggle").click();
    await page.locator("#automationNew").click();
    await page.locator("[data-automation-type='copilot']").click();
    await expect(page.locator(".automation-action-delivery-field")).toBeVisible();
    await expect(page.locator(".automation-action-delivery option")).toHaveText(["Run when ready", "Stage without Enter"]);
    await page.locator("#automationCancel").click();

    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0]?.status)).toBe("live");
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const originalPaused = state.automations.paused;
      const originalReadiness = terminalExecutionReadiness;
      const originalSend = state.socket.send;
      const frames = [];
      state.automations.paused = true;
      terminalExecutionReadiness = () => ({ mode: "copilot", ready: true });
      state.socket.send = (payload) => {
        const frame = JSON.parse(payload);
        if (frame.type === "input") frames.push(frame);
        return originalSend.call(state.socket, payload);
      };
      const rule = automationApi.normalizeRule({
        actions: [{
          command: "Review but do not submit",
          id: "action-copilot-stage1",
          submit: false,
          targetMode: "title",
          targetName: terminal.titleInput.value
        }],
        enabled: true,
        id: "automation-copilot-stage1",
        name: "Staged Copilot review",
        type: "copilot",
        trigger: { intervalMinutes: 60, mode: "interval" }
      });
      const started = runAutomationRule(rule, { manual: true });
      window.clearTimeout(terminal.handoffDeliveryTimer);
      terminal.handoffDeliveryTimer = 0;
      state.automations.paused = false;
      terminalExecutionReadiness = () => ({ mode: "shell", ready: true });
      const whileShell = await dispatchTerminalHandoff(terminal);
      window.clearTimeout(terminal.handoffDeliveryTimer);
      terminal.handoffDeliveryTimer = 0;
      terminalExecutionReadiness = () => ({ mode: "copilot", ready: true });
      const whileCopilot = await dispatchTerminalHandoff(terminal);
      window.clearTimeout(terminal.handoffDeliveryTimer);
      terminal.handoffDeliveryTimer = 0;
      state.socket.send = originalSend;
      terminalExecutionReadiness = originalReadiness;
      state.automations.paused = originalPaused;
      return { frames, pending: state.automations.pendingStages.length, started, whileCopilot, whileShell };
    });

    expect(result).toMatchObject({ pending: 0, started: 1, whileCopilot: true, whileShell: false });
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].data).toContain("Review but do not submit");
    expect(result.frames[0].data).not.toContain("\r");
    expect(result.frames[0].data).not.toContain("\x1b[13u");
  });

  test("launches Copilot from the requested CWD in each shell", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const savedRequest = requestBridge;
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
        requestBridge = async () => ({ complete: false, cursor: 0, output: "", truncated: false });
        const commands = {
          cmd: automationCopilotLaunchCommand({ shell: "cmd" }, "C:\\100% & safe"),
          powershell: automationCopilotLaunchCommand({ shell: "pwsh" }, "D:\\repo name"),
          wsl: automationCopilotLaunchCommand({ shell: "wsl" }, "/mnt/c/repo name")
        };
        terminal.shell = "cmd";
        terminal.status = "starting";
        const started = runAutomationRule(rule, { manual: true });
        await new Promise((resolve) => setTimeout(resolve, 0));
        const pending = terminal.pendingExternalAssistant ? { ...terminal.pendingExternalAssistant } : null;
        for (const [token, task] of state.automationRuntime.steps) {
          if (task.runId && state.automationRuntime.runs.get(task.runId)?.rule.id === rule.id) state.automationRuntime.steps.delete(token);
        }
        for (const [runId, run] of state.automationRuntime.runs) {
          if (run.rule.id === rule.id) state.automationRuntime.runs.delete(runId);
        }
        return { commands, pending, sessionId: terminal.aiSessionId, sessionKey: terminal.assistantSessionKey, started };
      } finally {
        requestBridge = savedRequest;
        terminal.cwd = saved.cwd;
        terminal.pendingExternalAssistant = saved.pendingExternalAssistant;
        terminal.shell = saved.shell;
        terminal.status = saved.status;
      }
    });

    expect(result.started).toBe(1);
    expect(result.commands.cmd).toMatch(/^cd \/d "C:\\100\^% & safe" & copilot --yolo --session-id=[0-9a-f-]{36} --context default$/i);
    expect(result.commands.powershell).toMatch(/^Set-Location -LiteralPath 'D:\\repo name'; copilot --yolo --session-id=[0-9a-f-]{36} --context default$/i);
    expect(result.commands.wsl).toMatch(/^cd -- '\/mnt\/c\/repo name'; copilot --yolo --session-id=[0-9a-f-]{36} --context default$/i);
    expect(result.pending).toMatchObject({
      followup: "Review this worktree",
      provider: "copilot"
    });
    expect(result.pending.command).toContain(`--session-id=${result.sessionId}`);
    expect(result.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.sessionKey).toBe(`cli:${result.sessionId}`);
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
    expect(result.historyTitles.filter((title) => title === "Due first-rule")).toHaveLength(1);
    expect(result.historyTitles.filter((title) => title === "Due second-rule")).toHaveLength(1);
    expect(result.historyTitles.filter((title) => title.endsWith("· Step 1"))).toHaveLength(2);
    expect(result.rules).toHaveLength(2);
    expect(result.rules.every((rule) => Boolean(rule.lastRunAt)), JSON.stringify(result.rules)).toBe(true);
  });

  test("runs schedules only in their configured workstation lock state", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const originalLockState = currentMachineLockState;
      const originalRun = runAutomationRule;
      const runs = [];
      let detected = "unlocked";
      let lockQueries = 0;
      currentMachineLockState = async () => { lockQueries += 1; return detected; };
      runAutomationRule = (rule) => { runs.push(rule.id); return 1; };
      const runCase = async (suffix, machineState, detectedState) => {
        const now = Date.now();
        detected = detectedState;
        state.automations.history = [];
        state.automations.rules = [automationApi.normalizeRule({
          actions: [{ command: "echo lock policy", id: `action-${suffix}`, targetName: "Tests" }],
          createdAt: new Date(now - 120000).toISOString(),
          enabled: true,
          id: `automation-${suffix}`,
          machineState,
          name: `Lock policy ${suffix}`,
          trigger: { catchUp: "once", intervalMinutes: 1, mode: "interval" }
        })];
        state.automationRuntime.lastTickAt = now - 120000;
        await tickAutomationSchedules(new Date(now));
        return {
          history: state.automations.history.map((entry) => ({ detail: entry.detail, status: entry.status })),
          lastRunAt: state.automations.rules[0].lastRunAt
        };
      };
      try {
        return {
          both: await runCase("lock-both", "both", "unknown"),
          lockedMatch: await runCase("lock-match", "locked", "locked"),
          lockedMismatch: await runCase("lock-mismatch", "locked", "unlocked"),
          lockQueries: 0,
          runs,
          unknown: await runCase("lock-unknown", "unlocked", "unknown"),
          get queryCount() { return lockQueries; }
        };
      } finally {
        currentMachineLockState = originalLockState;
        runAutomationRule = originalRun;
      }
    });

    expect(result.runs).toEqual(["automation-lock-both", "automation-lock-match"]);
    expect(result.queryCount).toBe(3);
    expect(result.both.history).toEqual([]);
    expect(result.lockedMatch.history).toEqual([]);
    expect(result.lockedMismatch.history).toEqual([{
      detail: "Workstation is unlocked; automation requires locked",
      status: "skipped"
    }]);
    expect(result.unknown.history).toEqual([{
      detail: "Workstation lock state unavailable; occurrence skipped",
      status: "skipped"
    }]);
    expect([result.lockedMismatch.lastRunAt, result.unknown.lastRunAt].every(Boolean)).toBe(true);
  });

  test("restarts the bridge for a background rule instead of running against a dead socket", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const originalWait = waitForSocketReady;
      const originalReady = state.socketReady;
      const originalBridge = window.multiterm;
      let ensureCalls = 0;
      waitForSocketReady = async () => state.socketReady;
      const runCase = async (suffix, runWhenClosed, ensure) => {
        const now = Date.now();
        state.automations.history = [];
        state.automationRuntime.backgroundBridgeAttemptAt = 0;
        state.automations.rules = [automationApi.normalizeRule({
          actions: [{ command: "Review the build", id: `action-${suffix}`, targetName: "Tests" }],
          createdAt: new Date(now - 120000).toISOString(),
          enabled: true,
          id: `automation-${suffix}`,
          name: `Background ${suffix}`,
          runWhenClosed,
          trigger: { catchUp: "once", intervalMinutes: 1, mode: "interval" },
          type: "copilot"
        })];
        window.multiterm = ensure ? { ensureBridge: ensure } : undefined;
        state.socketReady = false;
        const restored = await restoreBridgeForDueBackgroundRules(now);
        return {
          history: state.automations.history.map((entry) => ({ detail: entry.detail, status: entry.status })),
          restored
        };
      };
      try {
        const foreground = await runCase("fg", "off", async () => { ensureCalls += 1; return { ok: true }; });
        const recovered = await runCase("recovered", "background", async () => {
          ensureCalls += 1;
          state.socketReady = true;
          return { ok: true, restarted: true };
        });
        const refused = await runCase("refused", "background", async () => {
          ensureCalls += 1;
          return { ok: false, error: "port 3199 is held by another process" };
        });
        // A second failing tick inside the notice window must not duplicate the entry.
        state.automationRuntime.backgroundBridgeAttemptAt = 0;
        state.automations.history = [];
        await restoreBridgeForDueBackgroundRules(Date.now());
        const coalesced = state.automations.history.length;
        const unsupported = await runCase("browser", "background", null);
        return { coalesced, ensureCalls, foreground, recovered, refused, unsupported };
      } finally {
        waitForSocketReady = originalWait;
        window.multiterm = originalBridge;
        state.socketReady = originalReady;
        state.automationRuntime.backgroundBridgeAttemptAt = 0;
        state.automationRuntime.backgroundBridgeNotice = null;
        state.automations.history = [];
        state.automations.rules = [];
      }
    });

    // A rule that never asked for background execution never reaches the main process.
    expect(result.foreground).toEqual({ history: [], restored: false });
    expect(result.recovered).toEqual({ history: [], restored: true });
    expect(result.ensureCalls).toBe(3);
    expect(result.refused.restored).toBe(false);
    expect(result.refused.history).toEqual([{
      detail: "The bridge could not be restarted: port 3199 is held by another process",
      status: "failed"
    }]);
    expect(result.coalesced).toBe(0);
    expect(result.unsupported.history).toEqual([{
      detail: "The bridge is offline and this build cannot restart it.",
      status: "failed"
    }]);
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

  test("records an unavailable Copilot run and hands Run now to guided setup", async ({ page }) => {
    const result = await page.evaluate(() => {
      const original = {
        closeAutomationStudio,
        copilotCliRecoveryNeeded,
        readAutomationEditorRule,
        recoverCopilotCliForAction,
        runAutomationRule
      };
      const rule = automationApi.normalizeRule({
        actions: [{ command: "Review the release", id: "action-recovery", targetName: "Tests" }],
        enabled: true,
        id: "automation-recovery",
        name: "Copilot recovery run",
        type: "copilot",
        trigger: { intervalMinutes: 60, mode: "interval" }
      });
      let closed = 0;
      let recovery = null;
      const retried = [];
      try {
        copilotCliRecoveryNeeded = () => true;
        const manual = runAutomationRule(rule, { manual: true });
        const scheduled = runAutomationRule(rule);
        const failures = state.automations.history
          .filter((entry) => entry.automationId === rule.id && entry.status === "failed")
          .map((entry) => entry.detail);

        readAutomationEditorRule = () => null;
        elements.automationRunNow.click();
        readAutomationEditorRule = () => rule;
        closeAutomationStudio = () => { closed += 1; };
        recoverCopilotCliForAction = (onReady, options) => {
          recovery = { onReady, options };
          return true;
        };
        runAutomationRule = (value, options) => {
          retried.push({ id: value.id, options });
          return 1;
        };
        elements.automationRunNow.click();
        recovery.onReady();
        copilotCliRecoveryNeeded = () => false;
        elements.automationRunNow.click();
        return {
          closed,
          failures,
          manual,
          origin: recovery.options.origin,
          retried,
          scheduled
        };
      } finally {
        closeAutomationStudio = original.closeAutomationStudio;
        copilotCliRecoveryNeeded = original.copilotCliRecoveryNeeded;
        readAutomationEditorRule = original.readAutomationEditorRule;
        recoverCopilotCliForAction = original.recoverCopilotCliForAction;
        runAutomationRule = original.runAutomationRule;
      }
    });

    expect(result.manual).toBe(0);
    expect(result.scheduled).toBe(0);
    expect(result.closed).toBe(1);
    expect(result.origin).toBe("the automation run");
    expect(result.failures).toHaveLength(2);
    expect(result.failures.every((detail) => detail.includes("GitHub Copilot CLI is not ready"))).toBe(true);
    expect(result.retried).toEqual([
      { id: "automation-recovery", options: { manual: true } },
      { id: "automation-recovery", options: { manual: true } }
    ]);
  });

  test("saves a conditional check with its session mode and tool permissions", async ({ page }) => {
    await page.locator("#automationsToggle").click();
    await page.locator("#automationNew").click();
    await page.locator("[data-automation-type='condition']").click();

    await expect(page.locator("#automationConditionBlock")).toBeVisible();
    await expect(page.locator("#automationToolsBlock")).toBeVisible();
    await expect(page.locator("#automationScheduleBlock")).toBeVisible();
    await expect(page.locator("#automationActionsBlock")).toBeHidden();
    await expect(page.locator("#automationAppearanceBlock")).toBeHidden();
    await expect(page.locator("#automationRunAsField")).toBeHidden();
    await expect(page.locator("#automationRunNow span")).toHaveText("Check now");
    await expect(page.locator("#automationToolsDenyList li code")).toContainText(["shell(rm)"]);
    await expect(page.locator("#automationToolsAllowGroup")).toBeHidden();

    await page.locator("#automationName").fill("Incoming sweep");
    await page.locator("#automationConditionPrompt").fill("A new file has been written since the last check");
    await page.locator("#automationConditionAction").fill("Delete the file");
    await page.locator("#automationConditionCwd").fill(process.cwd());
    await expect(page.locator("#automationConditionCwdHint")).toHaveAttribute("data-tone", "ok");
    const verifiedCwd = await page.locator("#automationConditionCwd").inputValue();

    await page.locator("[data-tools-mode='selected']").click();
    await expect(page.locator("#automationToolsAllowGroup")).toBeVisible();
    await page.locator("#automationToolsCurated [data-tool-spec='shell(git:*)']").click();
    await page.locator("#automationToolsAllowInput").fill("write(D:\\Incoming)");
    await page.locator("#automationToolsAllowAdd").click();
    await expect(page.locator("#automationToolsAllowList li code")).toHaveText(["shell(git:*)", "write(D:\\Incoming)"]);
    await expect(page.locator("#automationToolsSummary")).toContainText("shell(git:*), write(D:\\Incoming)");

    await page.locator("[data-condition-session='existing']").click();
    await expect(page.locator("#automationConditionTargetFields")).toBeVisible();
    await page.locator("#automationConditionTargetName").fill("Tests");
    await page.locator("#automationSave").click();

    await expect(page.locator(".automation-rule-type")).toHaveText("Conditional automation");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.automations")).rules[0]);
    expect(stored).toMatchObject({ enabled: true, name: "Incoming sweep", type: "condition" });
    expect(stored.actions).toEqual([]);
    expect(stored.condition).toMatchObject({
      action: "Delete the file",
      closeWhenDone: true,
      cwd: verifiedCwd,
      keepState: true,
      prompt: "A new file has been written since the last check",
      sessionMode: "existing",
      targetMode: "title",
      targetName: "Tests"
    });
    expect(stored.condition.tools).toMatchObject({ allowAllPaths: false, mode: "selected", temporaryDirectory: true });
    expect(stored.condition.tools.allow).toEqual(["shell(git:*)", "write(D:\\Incoming)"]);
    expect(stored.condition.tools.deny).toContain("write(.env)");

    await page.reload();
    await page.locator("#automationsToggle").click();
    await page.locator(".automation-rule-open").click();
    await expect(page.locator("[data-automation-type='condition']")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#automationConditionAction")).toHaveValue("Delete the file");
    await expect(page.locator("#automationConditionCwd")).toHaveValue(verifiedCwd);
    await expect(page.locator("[data-condition-session='existing']")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#automationConditionTargetName")).toHaveValue("Tests");
    await expect(page.locator("#automationToolsAllowList li code")).toHaveText(["shell(git:*)", "write(D:\\Incoming)"]);
    await expect(page.locator("#automationToolsCurated [data-tool-spec='shell(git:*)']")).toHaveAttribute("aria-pressed", "true");
  });

  test("offers background execution only to Copilot and conditional rules", async ({ page }) => {
    await page.locator("#automationsToggle").click();
    await page.locator("#automationNew").click();
    await expect(page.locator("#automationRunWhenClosedField")).toBeHidden();

    await page.locator("[data-automation-type='appearance']").click();
    await expect(page.locator("#automationRunWhenClosedField")).toBeHidden();

    await page.locator("[data-automation-type='condition']").click();
    await expect(page.locator("#automationRunWhenClosedField")).toBeVisible();
    await expect(page.locator("#automationRunWhenClosed")).toHaveValue("off");

    await page.locator("[data-automation-type='copilot']").click();
    await expect(page.locator("#automationRunWhenClosedField")).toBeVisible();
    await page.locator("#automationName").fill("Overnight review");
    await page.locator(".automation-action-command").fill("Review the build");
    await page.locator("#automationRunWhenClosed").selectOption("background");
    await expect(page.locator("#automationPreview")).toContainText("Runs while closed");
    await page.locator("#automationSave").click();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.automations")).rules[0]);
    expect(stored).toMatchObject({ name: "Overnight review", runWhenClosed: "background", type: "copilot" });

    await page.reload();
    await page.locator("#automationsToggle").click();
    await page.locator(".automation-rule-open").click();
    await expect(page.locator("#automationRunWhenClosed")).toHaveValue("background");

    await page.locator("[data-automation-type='command']").click();
    await expect(page.locator("#automationRunWhenClosedField")).toBeHidden();
    await page.locator("#automationSave").click();
    const downgraded = await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.automations")).rules[0]);
    expect(downgraded).toMatchObject({ runWhenClosed: "off", type: "command" });
  });

  test("keeps every automation type name legible whether or not it is selected", async ({ page }) => {
    await page.locator("#automationsToggle").click();
    await page.locator("#automationNew").click();
    await expect(page.locator("[data-automation-type='command']")).toHaveAttribute("aria-checked", "true");

    const palette = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--text)";
      document.body.append(probe);
      const text = getComputedStyle(probe).color;
      probe.remove();
      const tiles = [...document.querySelectorAll("[data-automation-type]")];
      return {
        text,
        types: tiles.map((tile) => tile.dataset.automationType),
        headers: tiles.map((tile) => getComputedStyle(tile.querySelector("strong")).color),
        descriptions: tiles.map((tile) => getComputedStyle(tile.querySelector("small")).color)
      };
    });

    expect(palette.types).toEqual(["command", "copilot", "condition", "appearance"]);
    expect(palette.headers).toEqual(palette.types.map(() => palette.text));
    // The descriptions stay muted, so the tile still reads as a heading plus detail.
    expect(new Set(palette.descriptions).size).toBe(1);
    expect(palette.descriptions[0]).not.toBe(palette.text);
  });

  test("rejects a tool permission that is not a valid Copilot CLI spec", async ({ page }) => {
    await page.locator("#automationsToggle").click();
    await page.locator("#automationNew").click();
    await page.locator("[data-automation-type='condition']").click();
    await page.locator("[data-tools-mode='selected']").click();

    await page.locator("#automationToolsAllowInput").fill("shell(rm); Remove-Item C:\\");
    await page.locator("#automationToolsAllowAdd").click();
    await expect(page.locator("#automationToolsAllowError")).toBeVisible();
    await expect(page.locator("#automationToolsAllowError")).toHaveText("Remove quotes, control characters, and shell operators.");
    await expect(page.locator("#automationToolsAllowList li")).toHaveCount(0);
    expect(await page.locator("#automationToolsAllowInput").evaluate((input) => input.checkValidity())).toBe(false);

    await page.locator("#automationToolsAllowInput").fill("shell(git push)");
    await page.locator("#automationToolsAllowAdd").click();
    await expect(page.locator("#automationToolsAllowError")).toBeHidden();
    await expect(page.locator("#automationToolsAllowList li code")).toHaveText(["shell(git push)"]);

    await page.locator("#automationToolsAllowInput").fill("shell(git push)");
    await page.locator("#automationToolsAllowAdd").click();
    await expect(page.locator("#automationToolsAllowError")).toHaveText("That permission is already listed.");
    await expect(page.locator("#automationToolsAllowList li")).toHaveCount(1);
  });

  test("fills the schedule interval from a preset chip", async ({ page }) => {
    await page.locator("#automationsToggle").click();
    await page.locator("#automationNew").click();
    await page.locator("#automationName").fill("Preset checks");
    await page.locator(".automation-action-command").fill("npm test");

    await expect(page.locator("#automationIntervalPresets button")).toHaveCount(9);
    await expect(page.locator("[data-interval-preset='60']")).toHaveAttribute("aria-pressed", "true");

    await page.locator("[data-interval-preset='45']").click();
    await expect(page.locator("#automationInterval")).toHaveValue("45");
    await expect(page.locator("#automationIntervalUnit")).toHaveValue("minutes");
    await expect(page.locator("[data-interval-preset='45']")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-interval-preset='60']")).toHaveAttribute("aria-pressed", "false");

    await page.locator("[data-interval-preset='240']").click();
    await expect(page.locator("#automationInterval")).toHaveValue("4");
    await expect(page.locator("#automationIntervalUnit")).toHaveValue("hours");
    await expect(page.locator("#automationPreview")).toContainText("Every 4 hours");
  });

  test("refuses a conditional check whose working directory does not exist", async ({ page }) => {
    await page.locator("#automationsToggle").click();
    await page.locator("#automationNew").click();
    await page.locator("[data-automation-type='condition']").click();
    await page.locator("#automationName").fill("Bad folder");
    await page.locator("#automationConditionPrompt").fill("Something changed");
    await page.locator("#automationConditionAction").fill("Report it");
    await page.locator("#automationConditionCwd").fill("Z:\\multiterm-does-not-exist");

    await expect(page.locator("#automationConditionCwdHint")).toHaveAttribute("data-tone", "error");
    expect(await page.locator("#automationConditionCwd").evaluate((input) => input.checkValidity())).toBe(false);
    await page.locator("#automationSave").click();
    await expect(page.locator(".automation-rule-row")).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.automations") || "null"))).toBeNull();
  });

  test("bounds condition checks by a persisted rolling hour and by concurrency", async ({ page }) => {
    const ledger = await page.evaluate(() => {
      localStorage.removeItem("multiterm.conditionCheckLedger");
      state.automationRuntime.conditionChecks.clear();
      state.settings.automationConditionChecksPerHour = 3;
      state.settings.automationConditionConcurrency = 2;
      const now = Date.now();
      const tokens = [];
      const reasons = [];
      for (let index = 0; index < 3; index += 1) {
        const reservation = reserveConditionCheck(now);
        reasons.push(reservation.reason);
        if (reservation.token) tokens.push(reservation.token);
      }
      const concurrencyBlocked = reasons[2];
      for (const token of tokens) releaseConditionCheck(token);
      const afterRelease = [];
      for (let index = 0; index < 2; index += 1) {
        const reservation = reserveConditionCheck(now);
        afterRelease.push(reservation.reason);
        if (reservation.token) releaseConditionCheck(reservation.token);
      }
      return {
        afterRelease,
        concurrencyBlocked,
        persisted: JSON.parse(localStorage.getItem("multiterm.conditionCheckLedger")).length,
        reasons
      };
    });

    expect(ledger.reasons[0]).toBe("");
    expect(ledger.reasons[1]).toBe("");
    expect(ledger.concurrencyBlocked).toBe("Already assessing 2 conditions");
    expect(ledger.afterRelease[0]).toBe("");
    expect(ledger.afterRelease[1]).toBe("Reached the limit of 3 condition checks per hour");
    expect(ledger.persisted).toBe(3);

    const reload = await page.evaluate(() => {
      const stale = [Date.now() - 3600000 - 1000, Date.now() - 3600000 - 2000];
      localStorage.setItem("multiterm.conditionCheckLedger", JSON.stringify(stale));
      state.automationRuntime.conditionChecks.clear();
      return { blocker: conditionCheckBlocker(Date.now()), window: conditionCheckLedger(Date.now()).length };
    });
    expect(reload).toEqual({ blocker: "", window: 0 });

    await page.evaluate(() => {
      localStorage.removeItem("multiterm.conditionCheckLedger");
      state.automationRuntime.conditionChecks.clear();
      state.settings.automationConditionChecksPerHour = defaultSettings.automationConditionChecksPerHour;
      state.settings.automationConditionConcurrency = defaultSettings.automationConditionConcurrency;
      saveSettings();
    });
  });

  test("refuses an unapproved unattended check before it reserves a slot and gives background runs their own budget", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const originalBackgroundWindow = state.backgroundWindow;
      const originalNotify = notifyDesktop;
      const notifications = [];
      const rule = automationApi.normalizeRule({
        actions: [],
        condition: {
          action: "Delete the file",
          cwd: "D:\\Incoming",
          prompt: "A new file arrived",
          sessionMode: "hidden",
          tools: { allow: ["shell(git:*)"], mode: "selected" }
        },
        createdAt: new Date(Date.now() - 120000).toISOString(),
        enabled: true,
        id: "automation-unattended1",
        name: "Incoming sweep",
        runWhenClosed: "background",
        trigger: { intervalMinutes: 1, mode: "interval" },
        type: "condition"
      }, 0, automationNormalizationOptions(state.settings));
      localStorage.removeItem("multiterm.conditionCheckLedger");
      localStorage.removeItem("multiterm.conditionBackgroundCheckLedger");
      localStorage.removeItem("multiterm.conditionAutomationConsent");
      state.automations.history = [];
      state.automations.rules = [rule];
      state.automationRuntime.blockedConsent.clear();
      state.automationRuntime.conditionChecks.clear();
      state.automationRuntime.unattendedRules.clear();
      notifyDesktop = (body) => { notifications.push(body); };
      // Electron keeps the page "visible" for a hidden window, so this is the
      // signal production actually uses.
      state.backgroundWindow = true;
      try {
        const started = runAutomationRule(rule, { occurrenceAt: new Date().toISOString() });
        const repeated = runAutomationRule(rule, { occurrenceAt: new Date().toISOString() });
        const blocked = state.automations.history.map((entry) => ({
          background: entry.background,
          detail: entry.detail,
          status: entry.status
        }));

        // Approving the envelope lets the same rule reserve, and it spends the
        // background budget rather than the interactive one.
        const consent = {};
        consent[conditionFingerprint(rule)] = new Date().toISOString();
        localStorage.setItem("multiterm.conditionAutomationConsent", JSON.stringify(consent));
        state.settings.automationConditionBackgroundChecksPerHour = 1;
        const first = reserveConditionCheck(Date.now(), true);
        releaseConditionCheck(first.token);
        const second = reserveConditionCheck(Date.now(), true);
        releaseConditionCheck(second.token);
        const interactive = reserveConditionCheck(Date.now(), false);
        releaseConditionCheck(interactive.token);
        return {
          blocked,
          consentOverlayHidden: elements.conditionNoticeOverlay.hidden,
          interactiveLedger: JSON.parse(localStorage.getItem("multiterm.conditionCheckLedger") || "[]").length,
          backgroundLedger: JSON.parse(localStorage.getItem("multiterm.conditionBackgroundCheckLedger") || "[]").length,
          firstReason: first.reason,
          interactiveReason: interactive.reason,
          notifications,
          repeated,
          secondReason: second.reason,
          started
        };
      } finally {
        state.backgroundWindow = originalBackgroundWindow;
        notifyDesktop = originalNotify;
        state.settings.automationConditionBackgroundChecksPerHour = defaultSettings.automationConditionBackgroundChecksPerHour;
        localStorage.removeItem("multiterm.conditionCheckLedger");
        localStorage.removeItem("multiterm.conditionBackgroundCheckLedger");
        localStorage.removeItem("multiterm.conditionAutomationConsent");
        state.automationRuntime.blockedConsent.clear();
        state.automationRuntime.conditionChecks.clear();
        state.automationRuntime.unattendedRules.clear();
        state.automations.history = [];
        state.automations.rules = [];
      }
    });

    expect(result.started).toBe(0);
    expect(result.repeated).toBe(0);
    expect(result.consentOverlayHidden).toBe(true);
    expect(result.blocked).toEqual([{
      background: true,
      detail: "This check needs approval for its permissions before it can run unattended. Open MultiTerm and run it once.",
      status: "blocked"
    }]);
    expect(result.notifications).toEqual([
      "Incoming sweep: This check needs approval for its permissions before it can run unattended. Open MultiTerm and run it once."
    ]);
    expect(result.firstReason).toBe("");
    expect(result.secondReason).toBe("Reached the limit of 1 background condition check per hour");
    expect(result.interactiveReason).toBe("");
    expect(result.backgroundLedger).toBe(1);
    expect(result.interactiveLedger).toBe(1);
  });

  test("tells the bridge about its background plan as flat scalars and only when it changes", async ({ page }) => {
    const result = await page.evaluate(() => {
      const originalSend = state.socket.send;
      const frames = [];
      state.socket.send = function send(payload) {
        const frame = JSON.parse(payload);
        if (frame.type === "backgroundAutomationPlan") frames.push(frame);
        return originalSend.call(state.socket, payload);
      };
      const rule = (id, overrides = {}) => automationApi.normalizeRule({
        actions: [{ command: "Review the build", id: `action-${id}`, targetName: "Tests" }],
        createdAt: "2026-09-02T00:00:00.000Z",
        enabled: true,
        id: `automation-${id}`,
        name: `Background ${id}`,
        runWhenClosed: "background",
        trigger: { intervalMinutes: 60, mode: "interval" },
        type: "copilot",
        ...overrides
      });
      try {
        state.automations.rules = [];
        state.automations.paused = false;
        lastBackgroundPlanSignature = "";
        publishBackgroundAutomationPlan();
        const emptyRepeat = publishBackgroundAutomationPlan();

        state.automations.rules = [rule("plan1"), rule("plan2")];
        const announced = publishBackgroundAutomationPlan();
        const deduped = publishBackgroundAutomationPlan();

        state.automations.paused = true;
        publishBackgroundAutomationPlan();
        return { announced, deduped, emptyRepeat, frames };
      } finally {
        state.socket.send = originalSend;
        state.automations.rules = [];
        state.automations.paused = false;
        publishBackgroundAutomationPlan();
      }
    });

    expect(result.announced).toBe(true);
    expect(result.deduped).toBe(false);
    expect(result.emptyRepeat).toBe(false);
    expect(result.frames).toHaveLength(3);
    expect(result.frames[0]).toEqual({ type: "backgroundAutomationPlan", count: 0, enabled: false, nextDueAt: "" });
    expect(result.frames[1]).toMatchObject({ type: "backgroundAutomationPlan", count: 2, enabled: true });
    expect(result.frames[1].nextDueAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.frames[2]).toMatchObject({ count: 2, enabled: false });
    for (const frame of result.frames) {
      for (const value of Object.values(frame)) {
        expect(["boolean", "number", "string"]).toContain(typeof value);
      }
    }
  });

  test("registers the relaunch task only while a rule wants it, and retires a task-started window", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const originalBridge = window.multiterm;
      const originalLaunch = state.backgroundLaunch;
      const originalHidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
      const originalInterval = state.settings.automationBackgroundTaskMinutes;
      const requests = [];
      let finished = 0;
      window.multiterm = {
        syncBackgroundTask: async (request) => { requests.push(request); return { ok: true }; },
        finishBackgroundRun: async () => { finished += 1; return true; }
      };
      const rule = (id, minutesAgo) => automationApi.normalizeRule({
        actions: [{ command: "Review the build", id: `action-${id}`, targetName: "Tests" }],
        createdAt: new Date(Date.now() - minutesAgo * 60000).toISOString(),
        enabled: true,
        id: `automation-${id}`,
        name: `Task ${id}`,
        runWhenClosed: "background",
        trigger: { intervalMinutes: 60, mode: "interval" },
        type: "copilot"
      });
      try {
        state.settings.automationBackgroundTaskMinutes = 20;
        lastBackgroundTaskSignature = "";
        state.automations.rules = [];
        publishBackgroundAutomationPlan();

        state.automations.rules = [rule("first", 0)];
        publishBackgroundAutomationPlan();
        // Editing a rule must not re-register: the task knows nothing about schedules.
        state.automations.rules.push(rule("second", 0));
        publishBackgroundAutomationPlan();

        state.automations.rules = [];
        publishBackgroundAutomationPlan();

        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        state.backgroundLaunch = true;
        // Nothing is due inside the repeat window, so a task-started window retires.
        state.automations.rules = [rule("idle", 5)];
        const retired = await maybeFinishBackgroundRun(Date.now());

        // A rule due inside the window keeps the instance alive.
        state.backgroundLaunch = true;
        state.automations.rules = [rule("due", 55)];
        const stayed = await maybeFinishBackgroundRun(Date.now());

        // A visible window is the user's, so it never self-quits.
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        state.backgroundLaunch = true;
        const visible = await maybeFinishBackgroundRun(Date.now());
        return { finished, requests, retired, stayed, visible };
      } finally {
        Object.defineProperty(document, "hidden", originalHidden);
        window.multiterm = originalBridge;
        state.backgroundLaunch = originalLaunch;
        state.settings.automationBackgroundTaskMinutes = originalInterval;
        lastBackgroundTaskSignature = "";
        state.automations.rules = [];
        publishBackgroundAutomationPlan();
      }
    });

    expect(result.requests).toEqual([
      { enabled: false, intervalMinutes: 20 },
      { enabled: true, intervalMinutes: 20 },
      { enabled: false, intervalMinutes: 20 }
    ]);
    expect(result.retired).toBe(true);
    expect(result.stayed).toBe(false);
    expect(result.visible).toBe(false);
    expect(result.finished).toBe(1);
  });

  test("marks background runs in Run History", async ({ page }) => {
    await page.evaluate(() => {
      state.automations = automationApi.normalizeStore({
        history: [
          {
            automationId: "automation-marker1",
            background: true,
            detail: "The condition was met and the action completed",
            id: "history-marker1",
            status: "completed",
            title: "Overnight review"
          },
          {
            automationId: "automation-marker2",
            detail: "Workflow completed",
            id: "history-marker2",
            status: "completed",
            title: "Morning checks"
          }
        ]
      }, state.settings.automationHistoryLimit);
    });
    await page.locator("#automationsToggle").click();
    await page.locator("[data-automation-view='activity']").click();

    const rows = page.locator(".automation-activity-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1).locator(".automation-activity-background")).toBeVisible();
    await expect(rows.nth(1).locator(".automation-activity-background")).toHaveText("Background");
    await expect(rows.nth(0).locator(".automation-activity-background")).toHaveCount(0);
    expect(await rows.nth(1).locator(".automation-activity-background").evaluate((node) => getComputedStyle(node).display))
      .toBe("inline-block");

    await page.evaluate(() => { state.automations.history = []; });
  });

  test("asks for approval per permission envelope and asks again when the envelope widens", async ({ page }) => {
    const draft = (overrides = {}) => ({
      condition: {
        action: "Delete the file",
        closeWhenDone: true,
        cwd: "D:\\Incoming",
        keepState: true,
        prompt: "A new file arrived",
        sessionMode: "hidden",
        tools: { allow: ["shell(git:*)"], deny: ["write(.env)"], mode: "selected" },
        ...overrides
      },
      enabled: true,
      id: "condition-consent-rule",
      name: "Incoming sweep",
      trigger: { intervalMinutes: 60, mode: "interval", type: "schedule" },
      type: "condition"
    });

    await page.evaluate(() => localStorage.removeItem("multiterm.conditionAutomationConsent"));
    await page.evaluate((rule) => {
      window.__consent = requestConditionConsent(automationApi.normalizeRule(rule));
    }, draft());
    await expect(page.locator("#conditionAutomationNoticeOverlay")).toBeVisible();
    await expect(page.locator("#conditionAutomationNoticeEnvelope dt")).toHaveText([
      "Working directory", "Tools", "Never allow", "Files", "Network", "Session"
    ]);
    await expect(page.locator("#conditionAutomationNoticeEnvelope dd").nth(3))
      .toHaveText("D:\\Incoming and its subfolders, plus the system temporary directory");

    await page.locator("#conditionAutomationNoticeCancel").click();
    expect(await page.evaluate(() => window.__consent)).toEqual({ granted: false, reason: "Approval was declined" });
    expect(await page.evaluate(() => localStorage.getItem("multiterm.conditionAutomationConsent"))).toBeNull();

    await page.evaluate((rule) => {
      window.__consent = requestConditionConsent(automationApi.normalizeRule(rule));
    }, draft());
    await expect(page.locator("#conditionAutomationNoticeOverlay")).toBeVisible();
    await page.locator("#conditionAutomationNoticeContinue").click();
    expect(await page.evaluate(() => window.__consent)).toEqual({ granted: true, reason: "" });

    // Renaming and rescheduling leave the envelope alone, so no second prompt.
    expect(await page.evaluate((rule) => requestConditionConsent(automationApi.normalizeRule(rule)), {
      ...draft(),
      name: "Renamed sweep",
      trigger: { intervalMinutes: 15, mode: "interval", type: "schedule" }
    })).toEqual({ granted: true, reason: "" });

    await page.evaluate((rule) => {
      window.__consent = requestConditionConsent(automationApi.normalizeRule(rule));
    }, draft({ tools: { allow: ["shell(git:*)", "shell"], deny: ["write(.env)"], mode: "selected" } }));
    await expect(page.locator("#conditionAutomationNoticeOverlay")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => window.__consent)).toEqual({ granted: false, reason: "Approval was declined" });
    await expect(page.locator("#conditionAutomationNoticeOverlay")).toBeHidden();

    await page.evaluate(() => localStorage.removeItem("multiterm.conditionAutomationConsent"));
  });

  test("assesses read-only, resumes with the rule's grants, and commits state only after ACTION_OK", async ({ page }) => {
    const result = await runConditionScenario(page, {
      rule: conditionRuleDraft(),
      turns: [
        "Checked the folder.\n{token}::YES::{token}\n{token}::STATE::saw report-9.csv::{token}",
        "Removed it.\n{token}::ACTION_OK::{token}\n{token}::STATE::report-9.csv deleted::{token}"
      ]
    });

    expect(result.started).toBe(1);
    expect(result.turns).toBe(2);
    // The assessment cannot change anything, so the boundary is a process
    // boundary rather than a prompt convention.
    expect(result.launches[0]).toContain("--deny-tool 'shell'");
    expect(result.launches[0]).toContain("--deny-tool 'write'");
    expect(result.launches[0]).toContain("--deny-tool 'write(.env)'");
    expect(result.launches[0]).not.toContain("--allow-tool");
    expect(result.launches[0]).toContain("--session-id=");
    expect(result.launches[0]).toContain("-C 'D:\\Incoming'");
    expect(result.launches[0]).toContain("--no-ask-user --no-custom-instructions --disable-builtin-mcps --no-remote");
    expect(result.launches[0]).not.toContain("--yolo");

    expect(result.slash).toEqual(["exit"]);
    expect(result.launches[1]).toContain("--resume");
    expect(result.launches[1]).toContain("--allow-tool 'shell(git:*)'");
    expect(result.launches[1]).toContain("--deny-tool 'write'");
    expect(result.launches[1]).not.toContain("--deny-tool 'shell'");
    expect(result.launches[1]).not.toContain("--allow-all-tools");

    expect(result.prompts[0]).toContain("A new file has arrived since the last check");
    expect(result.prompts[1]).toContain("Delete the file");
    expect(result.rememberedState).toBe("report-9.csv deleted");
    expect(result.checkedAt).toBeTruthy();
    expect(result.history.at(-1)).toEqual({
      detail: "The condition was met and the action completed",
      status: "completed"
    });
  });

  test("records a NO verdict as skipped without ever granting the action permissions", async ({ page }) => {
    const result = await runConditionScenario(page, {
      rule: conditionRuleDraft(),
      turns: ["Nothing new.\n{token}::NO::{token}\n{token}::STATE::folder unchanged::{token}"]
    });

    expect(result.turns).toBe(1);
    expect(result.launches).toHaveLength(1);
    expect(result.slash).toEqual([]);
    expect(result.rememberedState).toBe("folder unchanged");
    expect(result.checkedAt).toBeTruthy();
    expect(result.history.at(-1)).toEqual({ detail: "The condition was not met", status: "skipped" });
  });

  test("keeps the previous state when the action fails or the verdict cannot be read", async ({ page }) => {
    const failed = await runConditionScenario(page, {
      rule: conditionRuleDraft({}, { conditionState: "report-8.csv already handled" }),
      turns: [
        "{token}::YES::{token}\n{token}::STATE::saw report-9.csv::{token}",
        "The delete was blocked.\n{token}::ACTION_FAILED::{token}\n{token}::STATE::report-9.csv still there::{token}"
      ]
    });
    expect(failed.rememberedState).toBe("report-8.csv already handled");
    expect(failed.history.at(-1)).toEqual({
      detail: "Copilot reported that the action did not complete, so the remembered state was kept",
      status: "failed"
    });

    const unreadable = await runConditionScenario(page, {
      rule: conditionRuleDraft({}, { conditionState: "report-8.csv already handled" }),
      turns: ["I had a look but I am not sure."]
    });
    expect(unreadable.turns).toBe(1);
    expect(unreadable.rememberedState).toBe("report-8.csv already handled");
    expect(unreadable.history.at(-1)).toEqual({
      detail: "Copilot did not return a result record.",
      status: "failed"
    });
  });

  test("refuses an existing assistant session whose grants it cannot set", async ({ page }) => {
    const refused = await runConditionScenario(page, {
      initialReadiness: { mode: "copilot", ready: true },
      rule: conditionRuleDraft(),
      turns: ["{token}::YES::{token}"]
    });
    expect(refused.launches).toEqual([]);
    expect(refused.history.at(-1)).toEqual({
      detail: "Tests is already running Copilot with the permissions it launched with, so this check refused to use it",
      status: "failed"
    });

    const inherited = await runConditionScenario(page, {
      initialReadiness: { mode: "copilot", ready: true },
      rule: conditionRuleDraft({ inheritSessionPermissions: true }),
      turns: [
        "{token}::NO::{token}\n{token}::STATE::still quiet::{token}"
      ]
    });
    expect(inherited.launches).toEqual([]);
    expect(inherited.rememberedState).toBe("still quiet");
    expect(inherited.history.at(-1)).toEqual({ detail: "The condition was not met", status: "skipped" });

    const missing = await runConditionScenario(page, {
      rule: conditionRuleDraft({ targetName: "Not a terminal" }),
      turns: ["{token}::NO::{token}"]
    });
    expect(missing.history.at(-1)).toEqual({
      detail: "No live terminal is named Not a terminal",
      status: "failed"
    });
  });

  test("records an over-budget check as skipped without opening a session", async ({ page }) => {
    const blocked = await page.evaluate(() => {
      const savedRecovery = copilotCliRecoveryNeeded;
      const savedRate = state.settings.automationConditionChecksPerHour;
      try {
        copilotCliRecoveryNeeded = () => false;
        state.settings.automationConditionChecksPerHour = 1;
        state.automationRuntime.conditionChecks.clear();
        localStorage.setItem("multiterm.conditionCheckLedger", JSON.stringify([Date.now()]));
        const rule = automationApi.normalizeRule({
          condition: {
            action: "Delete the file",
            cwd: "D:\\Incoming",
            prompt: "A new file has arrived",
            sessionMode: "hidden",
            tools: { mode: "all" }
          },
          enabled: true,
          id: "condition-over-budget",
          name: "Incoming sweep",
          trigger: { intervalMinutes: 60, mode: "interval", type: "schedule" },
          type: "condition"
        });
        state.automations.rules = [rule];
        state.automations.history = [];
        const started = runConditionAutomationRule(rule, {});
        return {
          history: state.automations.history.map((entry) => ({ detail: entry.detail, status: entry.status })),
          started,
          tasks: [...state.automationRuntime.steps.values()].filter((task) => task.kind === "condition").length
        };
      } finally {
        copilotCliRecoveryNeeded = savedRecovery;
        state.settings.automationConditionChecksPerHour = savedRate;
        localStorage.removeItem("multiterm.conditionCheckLedger");
        state.automationRuntime.conditionChecks.clear();
      }
    });

    expect(blocked).toMatchObject({ started: 0, tasks: 0 });
    expect(blocked.history).toEqual([{
      detail: "Reached the limit of 1 condition check per hour",
      status: "skipped"
    }]);
  });

  test("waits for a still-loading Copilot composer before delivering the prompt", async ({ page }) => {
    const result = await runConditionScenario(page, {
      loadingPolls: 4,
      rule: conditionRuleDraft(),
      turns: ["Nothing new.\n{token}::NO::{token}"]
    });

    // Measured against a real resumed CLI: the ready signature appears about nine
    // seconds before the composer stops loading, and a prompt sent then is lost.
    expect(result.deliveredAfterLoading).toBe(true);
    expect(result.turns).toBe(1);
    expect(result.history.at(-1)).toEqual({ detail: "The condition was not met", status: "skipped" });
  });

  test("answers the Copilot directory-trust prompt so an unattended check can start", async ({ page }) => {
    // Measured on CLI 1.0.82: a working directory outside the CLI's own
    // trustedFolders raises this before the composer exists, and no launch flag
    // suppresses it -- --yolo, --allow-all-paths and --add-dir were all still
    // asked. Answering the highlighted "1. Yes" is session-scoped.
    const result = await runConditionScenario(page, {
      rule: conditionRuleDraft(),
      trustPrompt: true,
      turns: ["Nothing new.\n{token}::NO::{token}"]
    });

    expect(result.trustAnswers).toBe(1);
    expect(result.prompts).toHaveLength(1);
    expect(result.history.at(-1)).toEqual({ detail: "The condition was not met", status: "skipped" });
  });

  test("passes every tool permission through PowerShell tokenization intact", async ({ page }) => {
    const command = await page.evaluate(() => buildAiAssistantCommand({
      maxAiCredits: 5,
      provider: "copilot",
      remote: false,
      sessionId: "6a35e306-32ae-4b86-ac4e-411b2c3547cd",
      shell: "pwsh",
      toolPermissions: automationApi.normalizeToolPermissions({
        allow: ["shell(git:*)", "shell(npm run build)", "write(C:\\Program Files\\logs)"],
        deny: ["shell(Remove-Item)", "url(https://*.github.com)"],
        mode: "selected"
      }),
      unattended: true,
      workingDirectory: "C:\\Program Files\\Incoming Files",
      yolo: false
    }));

    // Inspecting the composed string proves nothing about tokenization, so the
    // command is run for real against a shim that records its argv.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mt-argv-"));
    try {
      fs.writeFileSync(
        path.join(directory, "copilot.ps1"),
        "ConvertTo-Json -InputObject ([string[]]$args) -Compress\n",
        "utf8"
      );
      const recorded = execFileSync("pwsh.exe", [
        "-NoLogo",
        "-NoProfile",
        "-Command",
        `$env:PATH = ${JSON.stringify(directory).replace(/"/g, "'")} + [IO.Path]::PathSeparator + $env:PATH; ${command}`
      ], { encoding: "utf8" });
      const argv = JSON.parse(recorded.trim());
      const valueAfter = (flag, occurrence = 0) => {
        const indexes = argv.reduce((all, entry, index) => (entry === flag ? [...all, index] : all), []);
        return argv[indexes[occurrence] + 1];
      };

      expect(argv).toContain("--session-id=6a35e306-32ae-4b86-ac4e-411b2c3547cd");
      expect(valueAfter("-C")).toBe("C:\\Program Files\\Incoming Files");
      expect(valueAfter("--max-ai-credits")).toBe("5");
      expect([
        valueAfter("--allow-tool", 0),
        valueAfter("--allow-tool", 1),
        valueAfter("--allow-tool", 2)
      ]).toEqual(["shell(git:*)", "shell(npm run build)", "write(C:\\Program Files\\logs)"]);
      expect([valueAfter("--deny-tool", 0), valueAfter("--deny-tool", 1)])
        .toEqual(["shell(Remove-Item)", "url(https://*.github.com)"]);
      expect(argv).toContain("--no-ask-user");
      expect(argv).not.toContain("--yolo");
      expect(argv).not.toContain("--allow-all-tools");
    } finally {
      fs.rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 });
    }
  });

  test("runs a check on its own model instead of inheriting the CLI's", async ({ page }) => {
    // Measured on one real yes/no directory check against CLI 1.0.82: the
    // inherited model spent 21.73 AI credits over 15 premium requests, the auto
    // model 0.50 over 1. Effort was not the lever -- low cost the same as xhigh
    // -- and the auto model rejects the launch outright if an effort is sent.
    const result = await page.evaluate(() => {
      const rule = automationApi.normalizeRule({
        condition: {
          action: "Delete the file",
          cwd: "D:\\Incoming",
          prompt: "A new file has arrived",
          sessionMode: "hidden",
          tools: { mode: "all" }
        },
        enabled: true,
        id: "condition-cost",
        name: "Incoming sweep",
        trigger: { intervalMinutes: 60, mode: "interval", type: "schedule" },
        type: "condition"
      });
      const task = { cwd: "D:\\Incoming", sessionId: "6a35e306-32ae-4b86-ac4e-411b2c3547cd" };
      const saved = {
        context: state.settings.automationConditionContext,
        effort: state.settings.automationConditionEffort,
        model: state.settings.automationConditionModel
      };
      try {
        state.settings.automationConditionContext = "default";
        state.settings.automationConditionEffort = "none";
        state.settings.automationConditionModel = "auto";
        const cheap = buildConditionLaunchCommand(task, rule, { readOnly: true }).command;

        // An effort set against the auto model must never reach the CLI.
        state.settings.automationConditionEffort = "xhigh";
        const autoWithEffort = buildConditionLaunchCommand(task, rule, { readOnly: true }).command;

        state.settings.automationConditionModel = "";
        const inherited = buildConditionLaunchCommand(task, rule, { readOnly: true }).command;

        state.settings.automationConditionEffort = "not-a-level";
        const invalid = buildConditionLaunchCommand(task, rule, { readOnly: true }).command;
        return { autoWithEffort, cheap, inherited, invalid };
      } finally {
        state.settings.automationConditionContext = saved.context;
        state.settings.automationConditionEffort = saved.effort;
        state.settings.automationConditionModel = saved.model;
      }
    });

    expect(result.cheap).toContain('--model "auto"');
    expect(result.cheap).toContain("--context default");
    expect(result.cheap).not.toContain("--effort");
    expect(result.autoWithEffort).not.toContain("--effort");
    // Inheriting the model is a real setting, not a hidden default.
    expect(result.inherited).not.toContain("--model");
    expect(result.inherited).toContain("--effort xhigh");
    // A stored value the CLI would reject must not reach the command line.
    expect(result.invalid).not.toContain("--effort");
  });

  test("fails a check that stalls on a Copilot tool-approval dialog", async ({ page }) => {
    const result = await runConditionScenario(page, {
      approvalPrompt: true,
      rule: conditionRuleDraft({}, { conditionState: "report-8.csv already handled" }),
      turns: ["never delivered"]
    });

    // Measured: the CLI raises this dialog for a tool the rule neither allowed
    // nor denied and waits indefinitely, with the composer still reporting ready.
    expect(result.history.at(-1)).toEqual({
      detail: "Copilot asked for permission to use a tool this rule does not allow",
      status: "failed"
    });
    expect(result.rememberedState).toBe("report-8.csv already handled");
  });

  test("fails a check whose Copilot launch aborts back to a shell prompt", async ({ page }) => {
    // Measured live: an argument the CLI rejects exits immediately, leaving an
    // idle shell where the runtime would otherwise wait out the step timeout.
    const result = await runConditionScenario(page, {
      launchFails: "error: option '--max-ai-credits <credits>' argument '5' is invalid.",
      rule: conditionRuleDraft(),
      turns: ["never delivered"]
    });

    expect(result.launches).toHaveLength(1);
    expect(result.prompts).toEqual([]);
    expect(result.history.at(-1)).toEqual({
      detail: "The Copilot CLI did not start: error: option '--max-ai-credits <credits>' argument '5' is invalid.",
      status: "failed"
    });
  });

  test("never reads the event log while Copilot is still working on the prompt", async ({ page }) => {
    // A tool call inside one prompt writes its own turn_end, so a read taken
    // before the composer is idle again reports the turn finished too early.
    const result = await runConditionScenario(page, {
      busyMs: 3000,
      rule: conditionRuleDraft(),
      turns: ["Checked it.\n{token}::NO::{token}\n{token}::STATE::nothing new::{token}"]
    });

    expect(result.readsWhileBusy).toBe(0);
    expect(result.rememberedState).toBe("nothing new");
    expect(result.history.at(-1)).toEqual({ detail: "The condition was not met", status: "skipped" });
  });

  test("reveals a hidden check by promoting the bridge session before the pane", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const savedRequest = requestBridge;
      const terminal = addTerminal({ runStartup: false, title: "Hidden check", transient: true });
      const task = {
        bridgePromoted: false,
        checkToken: "",
        closeWhenDone: true,
        cursor: 0,
        kind: "condition",
        resultToken: "MTCONDREVEAL",
        revealed: false,
        ruleId: "condition-reveal-rule",
        ruleName: "Reveal check",
        sessionId: "",
        sessionMode: "hidden",
        terminalId: terminal.id,
        timeoutTimer: 0,
        token: "condition-reveal-task",
        truncated: false,
        turnStarted: false
      };
      state.automationRuntime.steps.set(task.token, task);
      const order = [];
      try {
        requestBridge = async (message) => {
          if (message.type !== "promoteSession") return null;
          order.push(`bridge:${terminal.transient ? "hidden" : "visible"}`);
          return { id: message.id, ok: true, type: "sessionPromoted" };
        };
        const found = liveConditionTaskForRule("condition-reveal-rule") === task;
        const revealed = await revealConditionCheck("condition-reveal-rule");
        order.push(`pane:${terminal.transient ? "hidden" : "visible"}`);
        return {
          found,
          host: terminal.pane.parentElement?.id || "",
          order,
          revealed,
          taskRevealed: task.revealed,
          unknown: await revealConditionCheck("condition-no-such-rule")
        };
      } finally {
        requestBridge = savedRequest;
        state.automationRuntime.steps.delete(task.token);
      }
    });

    expect(result).toMatchObject({ found: true, host: "terminalHost", revealed: true, taskRevealed: true, unknown: false });
    expect(result.order).toEqual(["bridge:hidden", "pane:visible"]);
  });
});
