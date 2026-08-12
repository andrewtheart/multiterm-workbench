/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

// Verifies every settings-panel control updates state AND produces its effect.
test.describe.configure({ mode: "serial" });

test.describe("Settings panel verification", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199" });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    // Reset to exactly one fresh terminal so this file is independent of any
    // state left behind by other e2e specs sharing the same bridge.
    await page.evaluate(() => closeAllTerminals());
    await page.evaluate(() => addTerminal());
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test.afterAll(async () => {
    await stopRendererCoverage(page, "settings-verify");
    await context.close();
  });

  // Set a native control's value + dispatch its bound event.
  const set = (selector, value, eventName) => page.evaluate(({ selector, value, eventName }) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`missing ${selector}`);
    if (el.type === "checkbox") el.checked = value;
    else el.value = value;
    el.dispatchEvent(new Event(eventName, { bubbles: true }));
  }, { selector, value, eventName });

  const setting = (key) => page.evaluate((key) => state.settings[key], key);
  const openSettingsGroup = async (name) => {
    const button = page.locator(`#settings-group-${name}`);
    if (await button.getAttribute("aria-expanded") !== "true") await button.click();
  };
  const firstTermOption = (opt) => page.evaluate((opt) => {
    const t = [...state.terminals.values()][0];
    return t ? t.term.options[opt] : null;
  }, opt);
  const hostVar = (name) => page.evaluate((name) => document.querySelector("#terminalHost").style.getPropertyValue(name).trim(), name);

  test("appearance settings", async () => {
    await set("#appTheme", "light", "change");
    expect(await setting("appTheme")).toBe("light");
    expect(await page.evaluate(() => document.documentElement.dataset.appTheme)).toBe("light");
    await set("#appTheme", "dark", "change");
    expect(await page.evaluate(() => document.documentElement.dataset.appTheme)).toBe("dark");

    await set("#fontFamily", "Consolas", "change");
    expect(await setting("fontFamily")).toBe("Consolas");
    expect(await firstTermOption("fontFamily")).toContain("Consolas");

    await set("#cursorStyle", "block", "change");
    expect(await setting("cursorStyle")).toBe("block");
    expect(await firstTermOption("cursorStyle")).toBe("block");

    await set("#cursorBlink", false, "change");
    expect(await setting("cursorBlink")).toBe(false);
    expect(await firstTermOption("cursorBlink")).toBe(false);
  });

  test("layout range settings", async () => {
    await set("#workspaceZoom", "80", "input");
    expect(await setting("workspaceZoom")).toBe(80);
    expect(await page.evaluate(() => ({
      height: elements.host.style.height,
      transform: elements.host.style.transform,
      transformOrigin: elements.host.style.transformOrigin,
      width: elements.host.style.width,
      zoom: elements.host.style.zoom
    }))).toEqual({
      height: "125%",
      transform: "scale(0.8)",
      transformOrigin: "left top",
      width: "125%",
      zoom: ""
    });
    await expect(page.locator("#workspaceZoomValue")).toHaveText("80%");
    await set("#workspaceZoom", "100", "input");
    expect(await page.evaluate(() => ({
      height: elements.host.style.height,
      transform: elements.host.style.transform,
      transformOrigin: elements.host.style.transformOrigin,
      width: elements.host.style.width,
      zoom: elements.host.style.zoom
    }))).toEqual({ height: "", transform: "", transformOrigin: "", width: "", zoom: "" });

    await set("#fontSize", "18", "input");
    expect(await setting("fontSize")).toBe(18);
    expect(await firstTermOption("fontSize")).toBe(18);
    await expect(page.locator("#fontSizeValue")).toHaveText("18px");

    await set("#layoutMode", "columns", "change");
    expect(await setting("layout")).toBe("columns");
    expect(await page.evaluate(() => document.querySelector("#terminalHost").dataset.layout)).toBe("columns");

    await set("#minWidth", "500", "input");
    expect(await setting("minWidth")).toBe(500);
    expect(await hostVar("--min-pane-width")).toBe("500px");

    await set("#columnCount", "4", "input");
    expect(await setting("columns")).toBe(4);
    expect(await hostVar("--fixed-columns")).toBe("4");

    await set("#rowCount", "3", "input");
    expect(await setting("rows")).toBe(3);
    expect(await hostVar("--fixed-rows")).toBe("3");

    await set("#paneHeight", "400", "input");
    expect(await setting("paneHeight")).toBe(400);
    expect(await hostVar("--pane-height")).toBe("400px");

    await set("#focusWidth", "70", "input");
    expect(await setting("focusWidth")).toBe(70);
    expect(await hostVar("--focus-width")).toBe("70%");

    await set("#paneGap", "16", "input");
    expect(await setting("gap")).toBe(16);
    expect(await hostVar("--pane-gap")).toBe("16px");
  });

  test("terminal settings", async () => {
    await set("#titleFontScale", "125", "input");
    expect(await setting("titleFontScale")).toBe(125);
    expect(await hostVar("--title-font-scale")).toBe("125%");
    await expect(page.locator("#titleFontScaleValue")).toHaveText("125%");

    await set("#terminalTheme", "paper", "change");
    expect(await setting("theme")).toBe("paper");
    const applied = await page.evaluate(() => { const t = [...state.terminals.values()][0]; return t.term.options.theme === themes.paper; });
    expect(applied).toBe(true);

    await set("#compactChrome", true, "change");
    expect(await setting("compactChrome")).toBe(true);
    expect(await page.evaluate(() => document.querySelector("#terminalHost").classList.contains("compact"))).toBe(true);
    await set("#compactChrome", false, "change");

    await set("#syncInput", true, "change");
    expect(await setting("syncInput")).toBe(true);
    await set("#syncInput", false, "change");

    await set("#rightClickAction", "paste", "change");
    expect(await setting("rightClickAction")).toBe("paste");
    await set("#rightClickAction", "menu", "change");

    await set("#scrollbackLines", "5000", "change");
    expect(await setting("scrollback")).toBe(5000);
    expect(await firstTermOption("scrollback")).toBe(5000);

    await set("#scrollbackInfinite", true, "change");
    expect(await setting("scrollbackInfinite")).toBe(true);
    expect(await firstTermOption("scrollback")).toBe(1000000);
    await set("#scrollbackInfinite", false, "change");

    await set("#scrollOnOutput", true, "change");
    expect(await setting("scrollOnOutput")).toBe(true);
    await set("#scrollOnOutput", false, "change");
  });

  test("performance settings", async () => {
    // Batching window: reaches state, is pushed to the bridge as a `config`
    // frame, and out-of-range typing is folded back into the field on screen.
    const sent = [];
    await page.exposeFunction("recordBridgeConfig", (message) => sent.push(message));
    await page.evaluate(() => {
      const original = window.sendBridge;
      window.__restoreSendBridge = () => { window.sendBridge = original; };
      window.sendBridge = (message) => {
        if (message.type === "config") window.recordBridgeConfig(message);
        return original(message);
      };
    });

    await set("#outputCoalesceMs", "24", "change");
    expect(await setting("outputCoalesceMs")).toBe(24);
    expect(sent).toContainEqual(expect.objectContaining({ type: "config", outputCoalesceMs: 24 }));

    await set("#outputCoalesceMs", "9999", "change");
    expect(await setting("outputCoalesceMs")).toBe(100);
    expect(await page.locator("#outputCoalesceMs").inputValue()).toBe("100");

    await set("#outputCoalesceMs", "8", "change");

    // Backlog ceiling: reaches state and changes the byte limit the flush path
    // actually compares against.
    await set("#outputBacklogKb", "2048", "change");
    expect(await setting("outputBacklogKb")).toBe(2048);
    expect(await page.evaluate(() => outputBacklogLimitBytes())).toBe(2048 * 1024);

    await set("#outputBacklogKb", "1", "change");
    expect(await setting("outputBacklogKb")).toBe(64);
    expect(await page.locator("#outputBacklogKb").inputValue()).toBe("64");

    await set("#outputBacklogKb", "1024", "change");
    expect(await page.evaluate(() => outputBacklogLimitBytes())).toBe(1024 * 1024);

    await set("#diagnosticRetentionDays", "30", "change");
    await set("#diagnosticRotationMb", "20", "change");
    await set("#diagnosticViewerEntries", "7500", "change");
    await set("#copilotLogViewerEnabled", true, "change");
    await set("#copilotLogInitialTailKb", "512", "change");
    expect(await setting("diagnosticRetentionDays")).toBe(30);
    expect(await setting("diagnosticRotationMb")).toBe(20);
    expect(await setting("diagnosticViewerEntries")).toBe(7500);
    expect(await setting("copilotLogViewerEnabled")).toBe(true);
    expect(await setting("copilotLogInitialTailKb")).toBe(512);
    expect(sent).toContainEqual(expect.objectContaining({
      type: "config",
      diagnosticRetentionDays: 30,
      diagnosticRotationMb: 20,
      diagnosticViewerEntries: 7500,
      copilotLogViewerEnabled: true,
      copilotLogInitialTailKb: 512
    }));

    await set("#diagnosticRetentionDays", "-1", "change");
    await set("#diagnosticRotationMb", "not-a-number", "change");
    await set("#diagnosticViewerEntries", "0", "change");
    await set("#copilotLogInitialTailKb", "0", "change");
    expect(await setting("diagnosticRetentionDays")).toBe(14);
    expect(await setting("diagnosticRotationMb")).toBe(10);
    expect(await setting("diagnosticViewerEntries")).toBe(0);
    expect(await setting("copilotLogInitialTailKb")).toBe(0);
    expect(await page.locator("#diagnosticRetentionDays").inputValue()).toBe("14");
    expect(await page.locator("#diagnosticRotationMb").inputValue()).toBe("10");
    expect(await page.locator("#diagnosticViewerEntries").inputValue()).toBe("0");
    expect(await page.locator("#copilotLogInitialTailKb").inputValue()).toBe("0");
    await page.evaluate(() => window.__restoreSendBridge());

    await set("#maxInstallerSizeMb", "512", "change");
    expect(await setting("maxInstallerSizeMb")).toBe(512);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings")).maxInstallerSizeMb)).toBe(512);

    await set("#maxInstallerSizeMb", "not-a-number", "change");
    expect(await setting("maxInstallerSizeMb")).toBe(256);
    expect(await page.locator("#maxInstallerSizeMb").inputValue()).toBe("256");
  });

  test("AI title settings", async () => {
    await openSettingsGroup("ai-assistants");
    const originalHistory = await page.evaluate(() => localStorage.getItem("multiterm.titleSuggestionHistory"));
    const originalHistoryLimit = await setting("titleSuggestionHistoryLimit");
    const originalTiming = await page.evaluate(() => ({
      mode: state.settings.autoTitleScheduleMode,
      repeat: state.settings.autoTitleRepeatMinutes,
      schedule: state.settings.autoTitleSchedule
    }));
    await page.evaluate(() => {
      state.aiProviders = [
        {
          id: "copilot",
          name: "GitHub Copilot",
          available: true,
          models: [
            { id: "claude-opus-4.6", name: "Claude Opus 4.6", efforts: ["medium", "high"], defaultEffort: "medium", maxPromptTokens: 64000, maxContextTokens: 128000 },
            { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", efforts: ["low", "high"], defaultEffort: "low", maxPromptTokens: 64000, maxContextTokens: 128000 }
          ]
        },
        { id: "claude", name: "Claude", available: false, status: "Claude is not installed.", models: [] }
      ];
      state.settings.aiTitleProvider = "copilot";
      syncAiTitleControls();
    });
    await set("#aiTitleProvider", "copilot", "change");
    await set("#copilotTitleModel", "claude-sonnet-4.6", "change");
    await set("#copilotTitleEffort", "high", "change");
    await set("#copilotTitleContext", "long_context", "change");
    await set("#copilotTitleContextKb", "20", "change");
    await set("#copilotTitleMinWords", "5", "change");
    await set("#copilotTitleMaxWords", "10", "change");
    await set("#autoTitleScheduleMode", "repeat", "change");
    await expect(page.locator("#autoTitleScheduleRow")).toBeHidden();
    await expect(page.locator("#autoTitleRepeatRow")).toBeVisible();
    await set("#autoTitleRepeatMinutes", "11", "change");
    expect(await setting("autoTitleRepeatMinutes")).toBe(11);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings")))).toMatchObject({
      autoTitleRepeatMinutes: 11,
      autoTitleScheduleMode: "repeat"
    });
    await set("#autoTitleScheduleMode", "progressive", "change");
    await expect(page.locator("#autoTitleScheduleRow")).toBeVisible();
    await expect(page.locator("#autoTitleRepeatRow")).toBeHidden();

    await page.evaluate(() => {
      state.titleSuggestionHistory = Array.from({ length: 60 }, (_, index) => ({
        id: `settings-history-${index}`,
        terminalId: "settings-terminal",
        terminalTitle: "settings terminal",
        pid: 6000,
        suggestion: `suggestion ${index}`,
        suggestedAt: new Date(Date.UTC(2026, 7, 11, 10, index)).toISOString(),
        decidedAt: null,
        accepted: null,
        automatic: true
      }));
      saveTitleSuggestionHistory();
    });
    await set("#titleSuggestionHistoryLimit", "50", "change");
    expect(await setting("titleSuggestionHistoryLimit")).toBe(50);
    expect(await page.evaluate(() => ({
      history: state.titleSuggestionHistory.length,
      persistedHistory: JSON.parse(localStorage.getItem("multiterm.titleSuggestionHistory")).length,
      persistedSetting: JSON.parse(localStorage.getItem("multiterm.settings")).titleSuggestionHistoryLimit
    }))).toEqual({ history: 50, persistedHistory: 50, persistedSetting: 50 });
    await set("#titleSuggestionHistoryLimit", "999999", "change");
    expect(await setting("titleSuggestionHistoryLimit")).toBe(10000);
    expect(await page.locator("#titleSuggestionHistoryLimit").inputValue()).toBe("10000");

    expect(await page.evaluate(() => ({
      context: state.settings.copilotTitleContext,
      contextKb: state.settings.copilotTitleContextKb,
      effort: state.settings.copilotTitleEffort,
      maxWords: state.settings.copilotTitleMaxWords,
      minWords: state.settings.copilotTitleMinWords,
      model: state.settings.copilotTitleModel,
      provider: state.settings.aiTitleProvider
    }))).toEqual({
      context: "long_context",
      contextKb: 20,
      effort: "high",
      maxWords: 10,
      minWords: 5,
      model: "claude-sonnet-4.6",
      provider: "copilot"
    });

    await set("#copilotTitleContextKb", "999", "change");
    expect(await setting("copilotTitleContextKb")).toBe(24);
    expect(await page.locator("#copilotTitleContextKb").inputValue()).toBe("24");

    await set("#copilotTitleMinWords", "12", "change");
    expect(await setting("copilotTitleMaxWords")).toBe(12);
    expect(await page.locator("#copilotTitleMaxWords").inputValue()).toBe("12");

    await set("#copilotTitleMaxWords", "3", "change");
    expect(await setting("copilotTitleMinWords")).toBe(3);
    expect(await page.locator("#copilotTitleMinWords").inputValue()).toBe("3");

    expect(await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("multiterm.settings"));
      return {
        context: saved.copilotTitleContext,
        contextKb: saved.copilotTitleContextKb,
        effort: saved.copilotTitleEffort,
        maxWords: saved.copilotTitleMaxWords,
        minWords: saved.copilotTitleMinWords,
        model: saved.copilotTitleModel,
        provider: saved.aiTitleProvider
      };
    })).toEqual({
      context: "long_context",
      contextKb: 24,
      effort: "high",
      maxWords: 3,
      minWords: 3,
      model: "claude-sonnet-4.6",
      provider: "copilot"
    });
    expect(await page.locator("#copilotTitleModel option").allTextContents()).toEqual([
      "Auto (provider default)",
      "Claude Opus 4.6 - 128K tokens",
      "Claude Sonnet 4.6 - 128K tokens"
    ]);
    expect(await page.locator("#copilotTitleEffort option").allTextContents()).toEqual(["Low", "High"]);
    expect(await page.locator("#copilotTitleContext option").allTextContents()).toEqual([
      "Provider default - 64K tokens",
      "Extended - 128K tokens"
    ]);
    await expect(page.locator("#aiTitleProviderStatus")).toContainText("2 models");
    await page.evaluate(({ history, limit, timing }) => {
      state.settings.titleSuggestionHistoryLimit = limit;
      state.settings.autoTitleScheduleMode = timing.mode;
      state.settings.autoTitleRepeatMinutes = timing.repeat;
      state.settings.autoTitleSchedule = timing.schedule;
      elements.titleSuggestionHistoryLimit.value = limit;
      if (history == null) localStorage.removeItem("multiterm.titleSuggestionHistory");
      else localStorage.setItem("multiterm.titleSuggestionHistory", history);
      state.titleSuggestionHistory = loadTitleSuggestionHistory();
      syncCopilotTitleSettings();
      saveSettings();
    }, { history: originalHistory, limit: originalHistoryLimit, timing: originalTiming });
  });

  // Providers return one flat list mixing vendors, so the picker groups it by
  // family and opens on Auto rather than whichever model happened to sort first.
  test("groups AI models by family and defaults to Auto", async () => {
    await page.evaluate(() => {
      state.aiProviders = [
        {
          id: "copilot",
          name: "GitHub Copilot",
          available: true,
          models: [
            { id: "grok-code-fast-1", name: "Grok Code Fast 1", efforts: [], maxContextTokens: 128000 },
            { id: "gpt-5.4", name: "GPT-5.4", efforts: [], maxContextTokens: 128000 },
            { id: "claude-opus-4-8[1m]", name: "Claude Opus 4.8 (1M)", efforts: [], maxContextTokens: 1000000 },
            { id: "claude-haiku-4.6", name: "Claude Haiku 4.6", efforts: [], maxContextTokens: 128000 },
            { id: "mai-ds-r1", name: "MAI DS R1", efforts: [], maxContextTokens: 128000 },
            { id: "custom-house-model", name: "Custom House Model", efforts: [], maxContextTokens: 32000 }
          ]
        },
        { id: "claude", name: "Claude", available: false, status: "Claude is not installed.", models: [] }
      ];
      state.settings.aiTitleProvider = "copilot";
      state.settings.copilotTitleModel = "no-longer-offered";
      syncAiTitleControls();
    });

    // Groups alphabetical with the catch-all last; models alphabetical inside.
    expect(await page.evaluate(() => [...document.querySelectorAll("#copilotTitleModel optgroup")]
      .map((group) => `${group.label}: ${[...group.children].map((option) => option.value).join(",")}`)))
      .toEqual([
        "Anthropic Claude: claude-haiku-4.6,claude-opus-4-8[1m]",
        "Microsoft MAI: mai-ds-r1",
        "OpenAI GPT: gpt-5.4",
        "xAI Grok: grok-code-fast-1",
        "Other models: custom-house-model"
      ]);
    // Auto is the ungrouped first entry and the fallback for a retired model.
    expect(await page.evaluate(() => document.querySelector("#copilotTitleModel").firstElementChild.outerHTML))
      .toBe('<option value="">Auto (provider default)</option>');
    expect(await setting("copilotTitleModel")).toBe("");
    expect(await page.locator("#copilotTitleEffort option").allTextContents()).toEqual(["Provider default"]);
    expect(await setting("copilotTitleEffort")).toBe("none");
    expect(await setting("copilotTitleContext")).toBe("default");
    expect(await page.evaluate(() => ({
      effort: defaultSettings.copilotTitleEffort,
      model: defaultSettings.copilotTitleModel,
      sessionEffort: defaultSettings.aiSessionEffort,
      sessionModel: defaultSettings.aiSessionModel
    }))).toEqual({ effort: "none", model: "", sessionEffort: "none", sessionModel: "" });
  });

  test("first-run AI setup persists separate operation defaults", async () => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "webdriver", { configurable: true, value: false });
      state.settings.aiSetupCompleted = false;
      state.aiProviders = [
        {
          id: "copilot",
          name: "GitHub Copilot",
          available: true,
          models: [
            { id: "gpt-5.4", name: "GPT-5.4", efforts: ["medium", "high"], defaultEffort: "medium", maxPromptTokens: 64000, maxContextTokens: 128000 }
          ]
        },
        {
          id: "claude",
          name: "Claude",
          available: true,
          models: [
            { id: "claude-sonnet-4-6[1m]", name: "Claude Sonnet 4.6 (1M)", efforts: ["low", "high"], defaultEffort: "low", maxPromptTokens: 1000000, maxContextTokens: 1000000 }
          ]
        }
      ];
      acceptAiProviderBootstrap({ version: 1, provider: "claude" });
      openAiSetup();
    });

    await expect(page.locator("#aiSetupOverlay")).toBeVisible();
    await expect(page.locator("#aiSetupStatus")).toContainText("GitHub Copilot and Claude detected");
    await expect(page.locator("#aiSetupTitleProvider")).toHaveValue("claude");
    await expect(page.locator("#aiSetupSessionProvider")).toHaveValue("claude");
    expect(await page.evaluate(() => state.aiProviderBootstrap)).toBeNull();
    await set("#aiSetupTitleProvider", "claude", "change");
    await set("#aiSetupTitleModel", "claude-sonnet-4-6[1m]", "change");
    await set("#aiSetupTitleEffort", "high", "change");
    await set("#aiSetupSessionProvider", "copilot", "change");
    await set("#aiSetupSessionModel", "gpt-5.4", "change");
    await set("#aiSetupSessionEffort", "medium", "change");
    await set("#aiSetupSessionContext", "long_context", "change");
    await page.locator("#aiSetupSave").click();
    await expect(page.locator("#aiSetupOverlay")).toBeHidden();

    expect(await page.evaluate(() => ({
      inert: elements.appShell.inert,
      saved: JSON.parse(localStorage.getItem("multiterm.settings")),
      settings: state.settings
    }))).toMatchObject({
      inert: false,
      saved: {
        aiSessionContext: "long_context",
        aiSessionEffort: "medium",
        aiSessionModel: "gpt-5.4",
        aiSessionProvider: "copilot",
        aiSetupCompleted: true,
        aiTitleProvider: "claude",
        copilotTitleEffort: "high",
        copilotTitleModel: "claude-sonnet-4-6[1m]"
      },
      settings: {
        aiSessionContext: "long_context",
        aiSessionProvider: "copilot",
        aiSetupCompleted: true,
        aiTitleProvider: "claude"
      }
    });
    await page.evaluate(() => { delete navigator.webdriver; });
  });

  test("guides a missing Copilot CLI through a visible PowerShell setup terminal", async () => {
    const result = await page.evaluate(() => {
      Object.defineProperty(navigator, "webdriver", { configurable: true, value: false });
      state.settings.aiSetupCompleted = false;
      state.aiProviders = [{
        id: "copilot",
        name: "GitHub Copilot",
        authenticated: false,
        cliInstalled: false,
        available: false,
        titleAvailable: false,
        interactiveAvailable: false,
        models: []
      }];
      openAiSetup();
      const action = elements.aiSetupCopilotAction.textContent.trim();
      const detail = elements.aiSetupCopilotText.textContent;
      const settingsAction = elements.aiCopilotSetup.textContent.trim();
      const settingsActionHidden = elements.aiCopilotSetup.hidden;
      const originalAddTerminal = addTerminal;
      let options = null;
      addTerminal = (value) => {
        options = value;
        return { id: "guided-copilot-test" };
      };
      try {
        startCopilotGuidedSetup();
        window.clearTimeout(state.aiSetup.guided.timer);
        return {
          action,
          detail,
          options,
          overlayHidden: elements.aiSetupOverlay.hidden,
          settingsAction,
          settingsActionHidden,
          shellInert: elements.appShell.inert
        };
      } finally {
        state.aiSetup.guided = null;
        addTerminal = originalAddTerminal;
        delete navigator.webdriver;
      }
    });

    expect(result.action).toBe("Install and sign in");
    expect(result.settingsAction).toBe("Install and sign in");
    expect(result.settingsActionHidden).toBe(false);
    expect(result.detail).toContain("WinGet, npm, or the signed installer from GitHub");
    expect(result.options).toMatchObject({
      pendingCopilotLogin: true,
      reveal: true,
      runStartup: false,
      shell: "pwsh",
      title: "GitHub Copilot setup"
    });
    expect(result.options.pendingCommand).toContain("Install-CopilotCli.ps1");
    expect(result.options.pendingCommand).toMatch(/^& '/);
    expect(result.options.pendingCommand).toMatch(/\{ copilot \}$/);
    expect(result.overlayHidden).toBe(true);
    expect(result.shellInert).toBe(false);
  });

  test("installs a missing Copilot CLI without repeating an existing account login", async () => {
    const result = await page.evaluate(() => {
      state.settings.aiSetupCompleted = true;
      state.aiProviders = [{
        id: "copilot",
        name: "GitHub Copilot",
        authenticated: true,
        cliInstalled: false,
        available: true,
        titleAvailable: true,
        interactiveAvailable: false,
        models: [{ id: "gpt-test", name: "GPT Test", efforts: [], maxPromptTokens: 64000, maxContextTokens: 64000 }]
      }];
      updateCopilotSetupActions();
      const action = elements.aiCopilotSetup.textContent.trim();
      const originalAddTerminal = addTerminal;
      let options = null;
      addTerminal = (value) => {
        options = value;
        return { id: "guided-copilot-install-only-test" };
      };
      try {
        startCopilotGuidedSetup();
        window.clearTimeout(state.aiSetup.guided.timer);
        return { action, options };
      } finally {
        state.aiSetup.guided = null;
        addTerminal = originalAddTerminal;
      }
    });

    expect(result.action).toBe("Install Copilot CLI");
    expect(result.options.pendingCopilotLogin).toBe(false);
    expect(result.options.pendingCommand).toContain("Install-CopilotCli.ps1");
  });

  test("submits Copilot login only after the Copilot composer is ready", async () => {
    const result = await page.evaluate(async () => {
      const originalPaste = pasteIntoSpecificTerminal;
      const originalReadiness = terminalExecutionReadiness;
      const originalSendBridge = sendBridge;
      const pasted = [];
      const sent = [];
      let mode = "shell";
      const terminal = {
        copilotSetupLoginPending: true,
        copilotSetupLoginRequiredRevision: 1,
        copilotSetupLoginTimer: 0,
        id: "copilot-login-mode-test",
        outputRevision: 2,
        status: "live"
      };
      state.terminals.set(terminal.id, terminal);
      pasteIntoSpecificTerminal = (_terminal, text) => {
        pasted.push(text);
        return true;
      };
      terminalExecutionReadiness = () => ({ mode, ready: true });
      sendBridge = (message) => {
        sent.push(message);
        return true;
      };
      try {
        scheduleCopilotSetupLogin(terminal, 0);
        await new Promise((resolve) => setTimeout(resolve, 25));
        const shellPasteCount = pasted.length;
        mode = "copilot";
        scheduleCopilotSetupLogin(terminal, 0);
        await new Promise((resolve) => setTimeout(resolve, 120));
        return {
          loginPending: terminal.copilotSetupLoginPending,
          pasted,
          sent,
          shellPasteCount
        };
      } finally {
        window.clearTimeout(terminal.copilotSetupLoginTimer);
        state.terminals.delete(terminal.id);
        pasteIntoSpecificTerminal = originalPaste;
        terminalExecutionReadiness = originalReadiness;
        sendBridge = originalSendBridge;
      }
    });

    expect(result.shellPasteCount).toBe(0);
    expect(result.pasted).toEqual(["/login"]);
    expect(result.loginPending).toBe(false);
    expect(result.sent).toContainEqual(expect.objectContaining({ data: "\u001b[13u" }));
  });

  test("returns to Copilot defaults when guided setup becomes ready", async () => {
    const result = await page.evaluate(async () => {
      Object.defineProperty(navigator, "webdriver", { configurable: true, value: false });
      const originalRefresh = refreshAiProviders;
      state.settings.aiSetupCompleted = false;
      state.aiProviders = [{
        id: "copilot",
        name: "GitHub Copilot",
        authenticated: false,
        cliInstalled: true,
        available: false,
        titleAvailable: false,
        interactiveAvailable: false,
        models: []
      }];
      state.aiSetup.guided = { checking: false, terminalId: "guided-ready-test", timer: 0 };
      state.terminals.set("guided-ready-test", { id: "guided-ready-test", status: "live" });
      refreshAiProviders = async () => {
        state.aiProviders = [{
          id: "copilot",
          name: "GitHub Copilot",
          authenticated: true,
          cliInstalled: true,
          available: true,
          titleAvailable: true,
          interactiveAvailable: true,
          models: [{ id: "gpt-test", name: "GPT Test", efforts: [], maxPromptTokens: 64000, maxContextTokens: 64000 }]
        }];
        return state.aiProviders;
      };
      try {
        await checkCopilotGuidedSetup();
        return {
          guided: state.aiSetup.guided,
          overlayHidden: elements.aiSetupOverlay.hidden,
          sessionProvider: elements.aiSetupSessionProvider.value,
          titleProvider: elements.aiSetupTitleProvider.value
        };
      } finally {
        refreshAiProviders = originalRefresh;
        state.terminals.delete("guided-ready-test");
        delete navigator.webdriver;
      }
    });

    expect(result).toEqual({
      guided: null,
      overlayHidden: false,
      sessionProvider: "copilot",
      titleProvider: "copilot"
    });
    await page.locator("#aiSetupSave").click();
    await expect(page.locator("#aiSetupOverlay")).toBeHidden();
  });

  test("refreshes providers through Settings and ignores an older response", async () => {
    const result = await page.evaluate(async () => {
      const originalRequestBridge = requestBridge;
      const originalCompleted = state.settings.aiSetupCompleted;
      let resolveOlder;
      let requests = 0;
      state.settings.aiSetupCompleted = true;
      requestBridge = () => {
        requests += 1;
        if (requests === 1) return new Promise((resolve) => { resolveOlder = resolve; });
        if (requests === 2) {
          return Promise.resolve({
            providers: [
              {
                id: "copilot",
                name: "GitHub Copilot",
                authenticated: true,
                cliInstalled: true,
                available: true,
                titleAvailable: true,
                interactiveAvailable: true,
                models: [{ id: "gpt-test", name: "GPT Test", efforts: [], maxPromptTokens: 64000, maxContextTokens: 64000 }]
              },
              { id: "unknown-provider", available: true }
            ]
          });
        }
        return Promise.resolve({ providers: null });
      };
      try {
        const older = refreshAiProviders({ openSetup: false });
        elements.aiProvidersRefresh.click();
        while (requests < 2 || state.aiProviderDiscovery.loading) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const afterCurrent = {
          ids: state.aiProviders.map((provider) => provider.id),
          status: elements.aiTitleProviderStatus.textContent,
          setupHidden: elements.aiCopilotSetup.hidden
        };
        resolveOlder({ providers: [] });
        await older;
        const staleIds = state.aiProviders.map((provider) => provider.id);
        await refreshAiProviders({ openSetup: false });
        return {
          afterCurrent,
          emptyStatus: elements.aiTitleProviderStatus.textContent,
          finalCount: state.aiProviders.length,
          requests,
          staleIds
        };
      } finally {
        requestBridge = originalRequestBridge;
        state.settings.aiSetupCompleted = originalCompleted;
      }
    });

    expect(result).toEqual({
      afterCurrent: {
        ids: ["copilot"],
        status: "GitHub Copilot is ready with 1 model.",
        setupHidden: true
      },
      emptyStatus: "This provider has not been detected as available.",
      finalCount: 0,
      requests: 3,
      staleIds: ["copilot"]
    });
  });

  test("keeps guided setup single-instance and hides actions for non-remediable states", async () => {
    const result = await page.evaluate(() => {
      state.aiProviders = [{
        id: "copilot",
        name: "GitHub Copilot",
        authenticated: true,
        cliInstalled: true,
        available: true,
        titleAvailable: true,
        interactiveAvailable: false,
        models: []
      }];
      state.aiProviders[0].authenticated = false;
      updateCopilotSetupActions();
      const signedOut = {
        action: elements.aiCopilotSetup.textContent.trim(),
        detail: elements.aiSetupCopilotText.textContent,
        prompt: copilotSetupPrompt()
      };
      state.aiProviders[0].authenticated = true;
      updateCopilotSetupActions();
      const installedButUnavailable = {
        actionHidden: elements.aiCopilotSetup.hidden,
        guideHidden: elements.aiSetupCopilotGuide.hidden,
        prompt: copilotSetupPrompt()
      };
      state.aiSetup.guided = { checking: false, terminalId: "already-running", timer: 0 };
      const duplicate = startCopilotGuidedSetup();
      state.aiSetup.guided = null;
      state.aiProviders[0].interactiveAvailable = true;
      const alreadyReady = startCopilotGuidedSetup();
      scheduleCopilotGuidedProviderCheck(0);
      return { alreadyReady, duplicate, installedButUnavailable, signedOut };
    });

    expect(result).toEqual({
      alreadyReady: false,
      duplicate: false,
      installedButUnavailable: {
        actionHidden: true,
        guideHidden: true,
        prompt: null
      },
      signedOut: {
        action: "Sign in to Copilot CLI",
        detail: "The CLI is installed but this Windows account still needs its one-time GitHub sign-in.",
        prompt: {
          action: "Sign in to Copilot CLI",
          detail: "The CLI is installed but this Windows account still needs its one-time GitHub sign-in."
        }
      }
    });
  });

  test("keeps Copilot login pending until output, readiness, and paste all succeed", async () => {
    const result = await page.evaluate(async () => {
      const originalPaste = pasteIntoSpecificTerminal;
      const originalReadiness = terminalExecutionReadiness;
      const originalSendBridge = sendBridge;
      const pasted = [];
      let readiness = { mode: "copilot", ready: true };
      let pasteSucceeds = false;
      const terminal = {
        copilotSetupLoginPending: true,
        copilotSetupLoginRequiredRevision: 2,
        copilotSetupLoginTimer: 0,
        id: "copilot-login-guards-test",
        outputRevision: 1,
        status: "live"
      };
      pasteIntoSpecificTerminal = (_terminal, text) => {
        pasted.push(text);
        return pasteSucceeds;
      };
      terminalExecutionReadiness = () => readiness;
      try {
        scheduleCopilotSetupLogin(null, 0);
        scheduleCopilotSetupLogin({ copilotSetupLoginPending: false, copilotSetupLoginTimer: 0, status: "live" }, 0);
        scheduleCopilotSetupLogin({ copilotSetupLoginPending: true, copilotSetupLoginTimer: 0, status: "exited" }, 0);
        scheduleCopilotSetupLogin(terminal, 0);
        await new Promise((resolve) => setTimeout(resolve, 20));
        const beforeFreshOutput = pasted.length;
        terminal.outputRevision = 2;
        readiness = { mode: "copilot", ready: false };
        scheduleCopilotSetupLogin(terminal, 0);
        await new Promise((resolve) => setTimeout(resolve, 20));
        const beforeReady = pasted.length;
        readiness = { mode: "copilot", ready: true };
        scheduleCopilotSetupLogin(terminal, 0);
        await new Promise((resolve) => setTimeout(resolve, 20));
        const afterPasteFailure = {
          pasteCount: pasted.length,
          pending: terminal.copilotSetupLoginPending
        };
        pasteSucceeds = true;
        sendBridge = () => false;
        state.terminals.set(terminal.id, terminal);
        scheduleCopilotSetupLogin(terminal, 0);
        await new Promise((resolve) => setTimeout(resolve, 120));
        state.terminals.delete(terminal.id);
        return {
          afterPasteFailure,
          beforeFreshOutput,
          beforeReady,
          finalPasteCount: pasted.length,
          pendingAfterEnterFailure: terminal.copilotSetupLoginPending
        };
      } finally {
        window.clearTimeout(terminal.copilotSetupLoginTimer);
        state.terminals.delete(terminal.id);
        pasteIntoSpecificTerminal = originalPaste;
        terminalExecutionReadiness = originalReadiness;
        sendBridge = originalSendBridge;
      }
    });

    expect(result).toEqual({
      afterPasteFailure: { pasteCount: 1, pending: true },
      beforeFreshOutput: 0,
      beforeReady: 0,
      finalPasteCount: 2,
      pendingAfterEnterFailure: false
    });
  });

  test("handles every guided provider-check lifecycle outcome", async () => {
    const result = await page.evaluate(async () => {
      const originalRefresh = refreshAiProviders;
      const originalSchedule = scheduleCopilotGuidedProviderCheck;
      const originalCompleted = state.settings.aiSetupCompleted;
      const originalProviders = state.aiProviders;
      const originalWebdriver = navigator.webdriver;
      let refreshMode = "unavailable";
      let scheduled = 0;
      Object.defineProperty(navigator, "webdriver", { configurable: true, value: true });
      refreshAiProviders = async () => {
        if (refreshMode === "replace") {
          state.aiSetup.guided = { checking: false, terminalId: "replacement", timer: 0 };
          return state.aiProviders;
        }
        state.aiProviders = [{
          id: "copilot",
          name: "GitHub Copilot",
          authenticated: refreshMode === "ready",
          cliInstalled: true,
          available: refreshMode === "ready",
          titleAvailable: refreshMode === "ready",
          interactiveAvailable: refreshMode === "ready",
          models: refreshMode === "ready"
            ? [{ id: "gpt-test", name: "GPT Test", efforts: [], maxPromptTokens: 64000, maxContextTokens: 64000 }]
            : []
        }];
        return state.aiProviders;
      };
      scheduleCopilotGuidedProviderCheck = () => { scheduled += 1; };
      try {
        state.aiSetup.guided = null;
        await checkCopilotGuidedSetup();
        state.aiSetup.guided = { checking: true, terminalId: "busy", timer: 0 };
        await checkCopilotGuidedSetup();

        refreshMode = "replace";
        state.aiSetup.guided = { checking: false, terminalId: "race", timer: 0 };
        await checkCopilotGuidedSetup();
        const replacementKept = state.aiSetup.guided?.terminalId;

        refreshMode = "ready";
        state.settings.aiSetupCompleted = true;
        state.aiSetup.guided = { checking: false, terminalId: "ready", timer: 0 };
        await checkCopilotGuidedSetup();
        const completedReady = state.aiSetup.guided;

        refreshMode = "unavailable";
        state.settings.aiSetupCompleted = false;
        state.aiSetup.guided = { checking: false, terminalId: "missing", timer: 0 };
        await checkCopilotGuidedSetup();
        const missingResult = state.aiSetup.guided;

        state.settings.aiSetupCompleted = true;
        state.terminals.set("exited", { id: "exited", status: "exited" });
        state.aiSetup.guided = { checking: false, terminalId: "exited", timer: 0 };
        await checkCopilotGuidedSetup();
        const exitedResult = state.aiSetup.guided;

        state.terminals.set("live", { id: "live", status: "live" });
        state.aiSetup.guided = { checking: false, terminalId: "live", timer: 0 };
        await checkCopilotGuidedSetup();
        return {
          completedReady,
          exitedResult,
          liveChecking: state.aiSetup.guided?.checking,
          missingResult,
          replacementKept,
          scheduled
        };
      } finally {
        state.terminals.delete("exited");
        state.terminals.delete("live");
        state.aiSetup.guided = null;
        state.settings.aiSetupCompleted = originalCompleted;
        state.aiProviders = originalProviders;
        refreshAiProviders = originalRefresh;
        scheduleCopilotGuidedProviderCheck = originalSchedule;
        Object.defineProperty(navigator, "webdriver", { configurable: true, value: originalWebdriver });
      }
    });

    expect(result).toEqual({
      completedReady: null,
      exitedResult: null,
      liveChecking: false,
      missingResult: null,
      replacementKept: "replacement",
      scheduled: 1
    });
  });

  test("does not arm Copilot login when the setup launch command cannot be sent", async () => {
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const originalSendBridge = sendBridge;
      const originalSchedule = scheduleCopilotSetupLogin;
      terminal.pendingCommand = "copilot";
      terminal.pendingCommandEnter = true;
      terminal.copilotSetupLoginPending = true;
      terminal.copilotSetupLoginRequiredRevision = 0;
      sendBridge = () => false;
      scheduleCopilotSetupLogin = () => {};
      try {
        handleBridgeMessage({
          type: "created",
          id: terminal.id,
          cwd: terminal.cwd,
          pid: terminal.pid || 1234,
          title: terminal.titleInput.value
        });
        await new Promise((resolve) => setTimeout(resolve, 550));
        return {
          loginRevision: terminal.copilotSetupLoginRequiredRevision,
          pendingCommand: terminal.pendingCommand
        };
      } finally {
        terminal.copilotSetupLoginPending = false;
        sendBridge = originalSendBridge;
        scheduleCopilotSetupLogin = originalSchedule;
      }
    });

    expect(result).toEqual({ loginRevision: 0, pendingCommand: null });
  });

  test("arms Copilot login after the setup launch command is sent", async () => {
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const originalSendBridge = sendBridge;
      const originalSchedule = scheduleCopilotSetupLogin;
      const sent = [];
      terminal.pendingCommand = "copilot";
      terminal.pendingCommandEnter = false;
      terminal.copilotSetupLoginPending = true;
      terminal.copilotSetupLoginRequiredRevision = 0;
      sendBridge = (message) => {
        sent.push(message);
        return true;
      };
      scheduleCopilotSetupLogin = () => {};
      try {
        const revisionBeforeSend = terminal.outputRevision;
        handleBridgeMessage({
          type: "created",
          id: terminal.id,
          cwd: terminal.cwd,
          pid: terminal.pid || 1234,
          title: terminal.titleInput.value
        });
        await new Promise((resolve) => setTimeout(resolve, 550));
        return {
          commandFrame: sent.find((message) => message.type === "input" && message.data === "copilot") || null,
          loginRevision: terminal.copilotSetupLoginRequiredRevision,
          pendingCommand: terminal.pendingCommand,
          revisionBeforeSend
        };
      } finally {
        terminal.copilotSetupLoginPending = false;
        sendBridge = originalSendBridge;
        scheduleCopilotSetupLogin = originalSchedule;
      }
    });

    expect(result.commandFrame).toEqual(expect.objectContaining({ type: "input", data: "copilot" }));
    expect(result.loginRevision).toBe(result.revisionBeforeSend + 1);
    expect(result.pendingCommand).toBeNull();
  });

  test("rechecks guided setup when its terminal is closed", async () => {
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const originalSchedule = scheduleCopilotGuidedProviderCheck;
      let rechecks = 0;
      state.aiSetup.guided = { checking: false, terminalId: terminal.id, timer: 0 };
      scheduleCopilotGuidedProviderCheck = (delay) => {
        if (delay === 0) rechecks += 1;
      };
      try {
        const removed = removeTerminal(terminal.id);
        return { removed, rechecks, stillPresent: state.terminals.has(terminal.id) };
      } finally {
        state.aiSetup.guided = null;
        scheduleCopilotGuidedProviderCheck = originalSchedule;
        addTerminal();
      }
    });

    expect(result).toEqual({ removed: true, rechecks: 1, stillPresent: false });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test("keeps SDK-backed Copilot titles available without offering a missing interactive CLI", async () => {
    const result = await page.evaluate(() => {
      state.aiProviders = [{
        id: "copilot",
        name: "GitHub Copilot",
        available: true,
        titleAvailable: true,
        interactiveAvailable: false,
        interactiveStatus: "GitHub Copilot CLI is not installed or is not on PATH.",
        models: [{ id: "gpt-test", name: "GPT Test", efforts: [], maxPromptTokens: 64000, maxContextTokens: 64000 }]
      }];
      state.settings.aiTitleProvider = "copilot";
      state.settings.aiSessionProvider = "copilot";
      syncAiTitleControls();
      syncAiSessionControls();
      return {
        assistantAvailable: aiAssistantAvailable(),
        sessionDisabled: elements.aiSessionModel.disabled,
        titleDisabled: elements.copilotTitleModel.disabled
      };
    });

    expect(result).toEqual({ assistantAvailable: false, sessionDisabled: true, titleDisabled: false });
    await expect(page.locator("#aiSessionProviderStatus")).toContainText("CLI is not installed");
  });

  test("consumes an installer hint without changing a completed AI profile", async () => {
    const result = await page.evaluate(() => {
      state.settings.aiSetupCompleted = true;
      state.settings.aiTitleProvider = "claude";
      state.settings.aiSessionProvider = "none";
      acceptAiProviderBootstrap({ version: 1, provider: "copilot" });
      return {
        bootstrap: state.aiProviderBootstrap,
        session: state.settings.aiSessionProvider,
        title: state.settings.aiTitleProvider
      };
    });

    expect(result).toEqual({ bootstrap: null, session: "none", title: "claude" });
  });

  test("keeps completed disabled AI profiles dormant until a manual refresh", async () => {
    const result = await page.evaluate(() => {
      state.settings.aiSetupCompleted = true;
      state.settings.aiTitleProvider = "none";
      state.settings.aiSessionProvider = "none";
      const disabled = shouldAutomaticallyRefreshAiProviders();
      state.settings.aiTitleProvider = "copilot";
      const enabled = shouldAutomaticallyRefreshAiProviders();
      state.settings.aiTitleProvider = "none";
      state.settings.aiSetupCompleted = false;
      const firstRun = shouldAutomaticallyRefreshAiProviders();
      return { disabled, enabled, firstRun };
    });

    expect(result).toEqual({ disabled: false, enabled: true, firstRun: true });
  });

  test("session settings", async () => {    for (const [sel, key] of [
      ["#restoreSession", "restoreSession"],
      ["#copyOnSelect", "copyOnSelect"],
      ["#highlightInputPrompts", "highlightInputPrompts"],
      ["#notifyActivity", "notifyActivity"],
      ["#notifyQuestions", "notifyQuestions"],
      ["#notifySilence", "notifySilence"],
      ["#bellNotify", "bellNotify"]
    ]) {
      const before = await setting(key);
      await set(sel, !before, "change");
      expect(await setting(key), `${key}`).toBe(!before);
    }

    await set("#silenceSeconds", "20", "change");
    expect(await setting("silenceSeconds")).toBe(20);

    await set("#startupCommand", "echo hi", "change");
    expect(await setting("startupCommand")).toBe("echo hi");
    await set("#startupCommand", "", "change");

    await set("#copilotImportContextKb", "128", "change");
    expect(await setting("copilotImportContextKb")).toBe(128);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings")).copilotImportContextKb)).toBe(128);
    await set("#copilotImportContextKb", "9999", "change");
    expect(await setting("copilotImportContextKb")).toBe(1024);
    expect(await page.locator("#copilotImportContextKb").inputValue()).toBe("1024");
    await set("#copilotImportContextKb", "64", "change");
    await set("#copilotSessionSearchContextKb", "1536", "change");
    expect(await setting("copilotSessionSearchContextKb")).toBe(1536);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings")).copilotSessionSearchContextKb)).toBe(1536);
    await set("#copilotSessionSearchContextKb", "99999", "change");
    expect(await setting("copilotSessionSearchContextKb")).toBe(16384);
    expect(await page.locator("#copilotSessionSearchContextKb").inputValue()).toBe("16384");
    await set("#copilotSessionSearchContextKb", "1024", "change");

    await page.evaluate(() => {
      window.__settingsOriginalUpdateRequest = requestLatestRelease;
      // eslint-disable-next-line no-global-assign
      requestLatestRelease = async () => ({ ok: true, current: APP_VERSION, available: false, release: {} });
    });
    await set("#autoUpdateChecks", true, "change");
    await expect.poll(() => page.evaluate(() => loadAutomaticUpdatePreferences().enabled)).toBe(true);
    await expect(page.locator("#updateCheckIntervalHours")).toBeEnabled();

    await set("#updateCheckIntervalHours", "18", "change");
    expect(await page.evaluate(() => loadAutomaticUpdatePreferences().intervalHours)).toBe(18);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.updateCheck")).intervalHours)).toBe(18);

    await set("#autoUpdateChecks", false, "change");
    expect(await page.evaluate(() => loadAutomaticUpdatePreferences().enabled)).toBe(false);
    await expect(page.locator("#updateCheckIntervalHours")).toBeDisabled();
    await page.evaluate(() => {
      // eslint-disable-next-line no-global-assign
      requestLatestRelease = window.__settingsOriginalUpdateRequest;
      delete window.__settingsOriginalUpdateRequest;
    });
  });

  test("broadcast Enter toggle", async () => {
    const before = await setting("broadcastSendEnter");
    // The toggle lives in the broadcast bar (hidden until broadcasting), so
    // fire its handler directly.
    await page.evaluate(() => document.querySelector("#broadcastEnter").click());
    expect(await setting("broadcastSendEnter")).toBe(!before);
    expect(await page.evaluate(() => document.querySelector("#broadcastEnter").dataset.on)).toBe(String(!before));
  });

  test("snippet add + remove", async () => {
    const before = await page.evaluate(() => (state.settings.snippets || []).length);
    await openSettingsGroup("snippets");
    await page.fill("#snippetName", "E2E snip");
    await page.fill("#snippetCommand", "Write-Host e2e");
    await page.locator("#snippetAdd").click();
    expect(await page.evaluate(() => state.settings.snippets.length)).toBe(before + 1);
    await expect(page.locator("#snippetList .snippet-row")).toHaveCount(before + 1);
    // Remove the one we added.
    await page.evaluate((idx) => removeSnippet(idx), before);
    expect(await page.evaluate(() => state.settings.snippets.length)).toBe(before);
  });

  test("settings persist to localStorage", async () => {
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings")));
    expect(persisted).toMatchObject({ scrollback: 5000, fontSize: 18, titleFontScale: 125, layout: "columns" });
  });
});
