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
    expect(sent).toContainEqual({ type: "config", outputCoalesceMs: 24 });

    await set("#outputCoalesceMs", "9999", "change");
    expect(await setting("outputCoalesceMs")).toBe(100);
    expect(await page.locator("#outputCoalesceMs").inputValue()).toBe("100");

    await set("#outputCoalesceMs", "8", "change");
    await page.evaluate(() => window.__restoreSendBridge());

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

    await set("#maxInstallerSizeMb", "512", "change");
    expect(await setting("maxInstallerSizeMb")).toBe(512);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings")).maxInstallerSizeMb)).toBe(512);

    await set("#maxInstallerSizeMb", "not-a-number", "change");
    expect(await setting("maxInstallerSizeMb")).toBe(256);
    expect(await page.locator("#maxInstallerSizeMb").inputValue()).toBe("256");
  });

  test("session settings", async () => {    for (const [sel, key] of [
      ["#restoreSession", "restoreSession"],
      ["#copyOnSelect", "copyOnSelect"],
      ["#highlightInputPrompts", "highlightInputPrompts"],
      ["#notifyActivity", "notifyActivity"],
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
    expect(persisted).toMatchObject({ scrollback: 5000, fontSize: 18, layout: "columns" });
  });
});
