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

async function reset(page) {
  await page.goto("/");
  await expect(page.locator("#statusConn")).toHaveText("Connected");
  await page.evaluate(() => {
    window.__terminalAppearanceOriginal = {
      fontFamily: state.settings.fontFamily,
      terminalBackground: state.settings.terminalBackground,
      terminalForeground: state.settings.terminalForeground,
      terminalHeaderBackground: cloneHeaderBackground(state.settings.terminalHeaderBackground)
    };
    closeAllTerminals();
  });
  await expect.poll(async () => {
    await page.evaluate(() => closeAllTerminals());
    return page.locator(".terminal-pane").count();
  }, { timeout: 30000 }).toBe(0);
  await page.evaluate(() => {
    addTerminal({ title: "Appearance one" });
    addTerminal({ title: "Appearance two" });
  });
  await expect(page.locator(".terminal-pane")).toHaveCount(2);
}

async function openAppearance(page, paneIndex = 0) {
  const screen = page.locator(".terminal-screen").nth(paneIndex);
  const box = await screen.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
  const menu = page.locator("#contextMenu");
  await expect(menu).toBeVisible();
  await menu.locator('[data-customization-id="terminal.change-appearance"]').click();
  await expect(page.locator("#headerBackgroundOverlay")).toBeVisible();
}

test.describe("Terminal appearance editor", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      closeHeaderBackgroundEditor({ restoreFocus: false });
      const original = window.__terminalAppearanceOriginal;
      if (original) {
        state.settings.fontFamily = original.fontFamily;
        state.settings.terminalBackground = original.terminalBackground;
        state.settings.terminalForeground = original.terminalForeground;
        state.settings.terminalHeaderBackground = original.terminalHeaderBackground;
      }
      for (const terminal of state.terminals.values()) {
        terminal.terminalBackground = "";
        terminal.terminalForeground = "";
        terminal.terminalFontFamily = "";
        terminal.headerBackground = null;
      }
      applySettings();
      for (const terminal of state.terminals.values()) applyTerminalHeaderBackground(terminal);
      saveSettings();
      saveSessionSnapshot();
      closeAllTerminals();
      delete window.__terminalAppearanceOriginal;
    });
  });

  test("previews, cancels, applies, and restores one terminal's colors and font", async ({ page }) => {
    await reset(page);
    const initial = await page.evaluate(() => {
      const terminals = [...state.terminals.values()];
      return {
        firstId: terminals[0].id,
        secondId: terminals[1].id,
        firstTheme: terminals[0].term.options.theme,
        firstFont: terminals[0].term.options.fontFamily,
        secondTheme: terminals[1].term.options.theme,
        secondFont: terminals[1].term.options.fontFamily
      };
    });

    await openAppearance(page);
    await expect(page.locator("#terminalAppearanceTabTerminal")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#terminalHeaderAppearancePanel")).toBeHidden();
    await expect(page.locator("#terminalAppearanceBackgroundPlane")).toBeVisible();
    await expect(page.locator('.terminal-color-editor input[type="color"]')).toHaveCount(0);
    const initialInlineColor = await page.locator("#terminalAppearanceBackgroundHex").inputValue();
    const planeBox = await page.locator("#terminalAppearanceBackgroundPlane").boundingBox();
    await page.mouse.click(planeBox.x + planeBox.width * 0.72, planeBox.y + planeBox.height * 0.28);
    await expect(page.locator("#terminalAppearanceBackgroundHex")).not.toHaveValue(initialInlineColor);
    const compactHeight = await page.locator("#terminalAppearanceBackgroundPlane").evaluate((plane) => plane.getBoundingClientRect().height);
    await page.locator("#terminalAppearanceBackgroundExpand").click();
    await expect(page.locator("#terminalAppearanceBackgroundExpand")).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => page.locator("#terminalAppearanceBackgroundPlane").evaluate((plane) => plane.getBoundingClientRect().height)).toBeGreaterThan(compactHeight);
    await page.locator("#terminalAppearanceBackgroundExpand").click();
    await page.locator("#terminalAppearanceBackgroundR").fill("17");
    await page.locator("#terminalAppearanceBackgroundG").fill("34");
    await page.locator("#terminalAppearanceBackgroundB").fill("51");
    await expect(page.locator("#terminalAppearanceBackgroundHex")).toHaveValue("#112233");
    await page.locator("#terminalAppearanceForegroundHex").fill("#DDEEFF");
    await expect(page.locator("#terminalAppearanceForegroundR")).toHaveValue("221");
    await expect(page.locator("#terminalAppearanceForegroundG")).toHaveValue("238");
    await expect(page.locator("#terminalAppearanceForegroundB")).toHaveValue("255");
    await page.locator("#terminalAppearanceFontFamily").selectOption("Consolas");
    const fontOptions = await page.locator("#terminalAppearanceFontFamily option").evaluateAll((options) => (
      options.map((option) => ({ value: option.value, family: getComputedStyle(option).fontFamily }))
    ));
    expect(fontOptions).toHaveLength(20);
    expect(fontOptions.every((option) => option.family.toLowerCase().includes(option.value.toLowerCase()))).toBe(true);

    const preview = page.locator("#terminalAppearancePreview");
    await expect(preview).toHaveCSS("background-color", "rgb(17, 34, 51)");
    await expect(preview).toHaveCSS("color", "rgb(221, 238, 255)");
    await expect.poll(() => page.evaluate((id) => state.terminals.get(id).term.options.theme.background, initial.firstId)).toBe("#112233");
    await expect.poll(() => page.evaluate((id) => state.terminals.get(id).term.options.fontFamily, initial.firstId)).toContain("Consolas");
    expect(await page.evaluate((id) => state.terminals.get(id).term.options.theme.background, initial.secondId)).toBe(initial.secondTheme.background);

    await page.locator("#headerBackgroundCancel").click();
    await expect(page.locator("#headerBackgroundOverlay")).toBeHidden();
    expect(await page.evaluate((id) => state.terminals.get(id).term.options.theme.background, initial.firstId)).toBe(initial.firstTheme.background);
    expect(await page.evaluate((id) => state.terminals.get(id).term.options.fontFamily, initial.firstId)).toBe(initial.firstFont);

    await openAppearance(page);
    await page.locator("#terminalAppearanceBackgroundR").fill("17");
    await page.locator("#terminalAppearanceBackgroundG").fill("34");
    await page.locator("#terminalAppearanceBackgroundB").fill("51");
    await page.locator("#terminalAppearanceForegroundHex").fill("#DDEEFF");
    await page.locator("#terminalAppearanceFontFamily").selectOption("Consolas");
    await expect.poll(() => page.evaluate(() => terminalAppearanceDraft)).toMatchObject({
      background: "#112233",
      foreground: "#DDEEFF",
      fontFamily: "Consolas"
    });
    await page.locator("#headerBackgroundApply").click();
    await expect(page.locator("#terminalAppearanceApplyChoices")).toBeVisible();
    const applyPlacement = await page.evaluate(() => {
      const apply = document.querySelector("#headerBackgroundApply").getBoundingClientRect();
      const choices = document.querySelector("#terminalAppearanceApplyChoices").getBoundingClientRect();
      return { applyBottom: apply.bottom, choicesTop: choices.top };
    });
    expect(applyPlacement.choicesTop).toBeGreaterThanOrEqual(applyPlacement.applyBottom);
    expect(applyPlacement.choicesTop - applyPlacement.applyBottom).toBeLessThanOrEqual(8);
    expect(await page.evaluate((id) => state.terminals.get(id).terminalBackground, initial.firstId)).toBe("");
    await page.locator("#terminalAppearanceApplyTerminal").click();

    const applied = await page.evaluate((id) => {
      const terminal = state.terminals.get(id);
      const snapshot = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]").find((entry) => entry.id === id);
      return {
        background: terminal.terminalBackground,
        foreground: terminal.terminalForeground,
        fontFamily: terminal.terminalFontFamily,
        snapshot
      };
    }, initial.firstId);
    expect(applied).toMatchObject({ background: "#112233", foreground: "#DDEEFF", fontFamily: "Consolas" });
    expect(applied.snapshot).toMatchObject({ terminalBackground: "#112233", terminalForeground: "#DDEEFF", terminalFontFamily: "Consolas" });

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate((id) => state.terminals.get(id)?.terminalBackground, initial.firstId)).toBe("#112233");
    await expect.poll(() => page.evaluate((id) => state.terminals.get(id)?.term.options.theme.foreground, initial.firstId)).toBe("#DDEEFF");
  });

  test("applies global defaults and reuses the same advanced header controls", async ({ page }) => {
    await reset(page);
    await openAppearance(page);
    await page.locator("#terminalAppearanceBackgroundHex").fill("#203040");
    await page.locator("#terminalAppearanceForegroundHex").fill("#F0E0D0");
    await page.locator("#terminalAppearanceFontFamily").selectOption("Courier New");
    await page.locator("#headerBackgroundApply").click();
    await expect(page.locator("#terminalAppearanceApplyChoices")).toBeVisible();
    await page.locator("#terminalAppearanceApplyAll").click();

    const global = await page.evaluate(() => ({
      settings: {
        background: state.settings.terminalBackground,
        foreground: state.settings.terminalForeground,
        fontFamily: state.settings.fontFamily
      },
      terminals: [...state.terminals.values()].map((terminal) => ({
        background: terminal.term.options.theme.background,
        foreground: terminal.term.options.theme.foreground,
        fontFamily: terminal.term.options.fontFamily,
        overrides: [terminal.terminalBackground, terminal.terminalForeground, terminal.terminalFontFamily]
      }))
    }));
    expect(global.settings).toEqual({ background: "#203040", foreground: "#F0E0D0", fontFamily: "Courier New" });
    expect(global.terminals.every((terminal) => (
      terminal.background === "#203040"
      && terminal.foreground === "#F0E0D0"
      && terminal.fontFamily.includes("Courier New")
      && terminal.overrides.every((value) => value === "")
    ))).toBe(true);

    await page.evaluate(() => openHeaderBackgroundEditor([...state.terminals.values()][0]));
    await expect(page.locator("#terminalAppearanceTabHeader")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#terminalAppearancePanel")).toBeHidden();
    await expect(page.locator("#headerGradientStopList")).toBeVisible();
    await page.locator("#terminalAppearanceTabTerminal").click();
    await expect(page.locator("#terminalAppearancePreview")).toBeVisible();
    await page.locator("#terminalAppearanceTabHeader").click();
    await page.locator('[data-header-gradient-type="conic"]').click();
    await page.locator("#headerGradientAngleValue").fill("225");
    await page.locator("#headerBackgroundApply").click();
    await page.locator("#terminalAppearanceApplyAll").click();

    const header = await page.evaluate(() => ({
      global: state.settings.terminalHeaderBackground,
      terminals: [...state.terminals.values()].map((terminal) => ({
        override: terminal.headerBackground,
        css: terminal.pane.querySelector(".pane-bar").style.getPropertyValue("--pane-bar-custom-bg")
      }))
    }));
    expect(header.global).toMatchObject({ type: "conic", angle: 225 });
    expect(header.terminals.every((terminal) => terminal.override === null && terminal.css.includes("conic-gradient"))).toBe(true);
  });

  test("applies a solid header palette color and title typography to one terminal", async ({ page }) => {
    await reset(page);
    const ids = await page.evaluate(() => [...state.terminals.keys()]);
    await openAppearance(page);
    await expect(page.locator("#terminalAppearanceTabTerminal")).toContainText("Body");
    await page.locator("#terminalAppearanceTabHeader").click();

    const solidMode = page.locator('[data-header-background-mode="solid"]');
    const gradientMode = page.locator('[data-header-background-mode="gradient"]');
    await expect(gradientMode).toHaveAttribute("aria-pressed", "true");
    await solidMode.click();
    await expect(solidMode).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#headerSolidPanel")).toBeVisible();
    await expect(page.locator("#headerGradientPanel")).toBeHidden();
    await expect(page.locator("#headerSolidPalette .header-solid-swatch")).toHaveCount(8);
    await gradientMode.click();
    await expect(page.locator("#headerGradientPanel")).toBeVisible();
    await expect(page.locator("#headerSolidPanel")).toBeHidden();
    await solidMode.click();

    const swatch = page.locator('[data-header-solid-color="#7CA8F6"]');
    await swatch.click();
    await page.locator("#headerAppearanceFontFamily").selectOption("Consolas");
    await page.locator("#headerAppearanceFontSize").fill("99");
    await expect(page.locator("#headerAppearanceFontSize")).toHaveValue("20");
    await page.locator("#headerAppearanceFontSize").fill("");
    await expect.poll(() => page.evaluate(() => headerBackgroundDraft.fontSize)).toBe(0);
    await page.locator("#headerAppearanceFontSize").fill("18");
    await expect(page.locator("#headerBackgroundPreview")).toHaveCSS("background-color", "rgb(124, 168, 246)");
    await expect(page.locator("#headerBackgroundPreview .header-background-preview-title")).toHaveCSS("font-size", "18px");
    await expect(page.locator("#headerBackgroundPreview .header-background-preview-title")).toHaveCSS("font-family", /Consolas/i);
    await expect.poll(() => page.evaluate((id) => {
      const terminal = state.terminals.get(id);
      const bar = terminal.pane.querySelector(".pane-bar");
      const title = terminal.pane.querySelector(".pane-title-display");
      return {
        background: getComputedStyle(bar).backgroundColor,
        familyIncludesConsolas: getComputedStyle(title).fontFamily.includes("Consolas"),
        size: getComputedStyle(title).fontSize
      };
    }, ids[0])).toEqual({ background: "rgb(124, 168, 246)", familyIncludesConsolas: true, size: "18px" });

    await page.locator("#headerBackgroundCancel").click();
    await expect(page.locator("#headerBackgroundOverlay")).toBeHidden();
    const cancelled = await page.evaluate((id) => {
      const terminal = state.terminals.get(id);
      const bar = terminal.pane.querySelector(".pane-bar");
      return {
        background: bar.style.getPropertyValue("--pane-bar-custom-bg"),
        definition: terminal.headerBackground,
        family: bar.style.getPropertyValue("--pane-title-font-family"),
        size: bar.style.getPropertyValue("--pane-title-font-size")
      };
    }, ids[0]);
    expect(cancelled).toEqual({ background: "", definition: null, family: "", size: "" });

    await page.evaluate((id) => openHeaderBackgroundEditor(state.terminals.get(id)), ids[0]);
    await solidMode.click();
    await swatch.click();
    await page.locator("#headerAppearanceFontFamily").selectOption("Consolas");
    await page.locator("#headerAppearanceFontSize").fill("18");
    await page.locator("#headerBackgroundApply").click();
    await page.locator("#terminalAppearanceApplyTerminal").click();

    const applied = await page.evaluate(([firstId, secondId]) => {
      const first = state.terminals.get(firstId);
      const second = state.terminals.get(secondId);
      const firstBar = first.pane.querySelector(".pane-bar");
      const secondBar = second.pane.querySelector(".pane-bar");
      const snapshot = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]")
        .find((entry) => entry.id === firstId);
      return {
        definition: first.headerBackground,
        first: {
          background: firstBar.style.getPropertyValue("--pane-bar-custom-bg"),
          family: firstBar.style.getPropertyValue("--pane-title-font-family"),
          size: firstBar.style.getPropertyValue("--pane-title-font-size")
        },
        second: {
          background: secondBar.style.getPropertyValue("--pane-bar-custom-bg"),
          family: secondBar.style.getPropertyValue("--pane-title-font-family"),
          size: secondBar.style.getPropertyValue("--pane-title-font-size")
        },
        snapshot: snapshot?.headerBackground
      };
    }, ids);
    expect(applied.definition).toMatchObject({
      mode: "solid",
      color: "#7CA8F6",
      fontFamily: "Consolas",
      fontSize: 18
    });
    expect(applied.first.background).toBe("#7CA8F6");
    expect(applied.first.family).toContain("Consolas");
    expect(applied.first.size).toBe("18px");
    expect(applied.second).toEqual({ background: "", family: "", size: "" });
    expect(applied.snapshot).toEqual(applied.definition);

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate((id) => state.terminals.get(id)?.headerBackground, ids[0])).toMatchObject({
      mode: "solid",
      color: "#7CA8F6",
      fontFamily: "Consolas",
      fontSize: 18
    });
  });

  test("keeps Body and Header controls contained on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await reset(page);
    await page.evaluate(() => openTerminalAppearanceEditor([...state.terminals.values()][0]));
    await expect(page.locator("#headerBackgroundOverlay")).toBeVisible();
    const containment = await page.evaluate(() => {
      const dialog = document.querySelector(".terminal-appearance-dialog");
      const content = document.querySelector(".terminal-appearance-content");
      const dialogRect = dialog.getBoundingClientRect();
      const visibleControls = [...dialog.querySelectorAll("button, input, select")]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        });
      return {
        dialog: { left: dialogRect.left, right: dialogRect.right, top: dialogRect.top, bottom: dialogRect.bottom },
        contentClientWidth: content.clientWidth,
        contentScrollWidth: content.scrollWidth,
        visibleControls
      };
    });
    expect(containment.dialog.left).toBeGreaterThanOrEqual(0);
    expect(containment.dialog.right).toBeLessThanOrEqual(390);
    expect(containment.dialog.top).toBeGreaterThanOrEqual(0);
    expect(containment.dialog.bottom).toBeLessThanOrEqual(844);
    expect(containment.contentScrollWidth).toBeLessThanOrEqual(containment.contentClientWidth);
    expect(containment.visibleControls.every((control) => (
      control.left >= containment.dialog.left && control.right <= containment.dialog.right
    ))).toBe(true);

    await page.locator("#terminalAppearanceTabHeader").click();
    await page.locator('[data-header-background-mode="solid"]').click();
    await expect(page.locator("#headerSolidPanel")).toBeVisible();
    await expect(page.locator("#headerSolidPalette .header-solid-swatch")).toHaveCount(8);
    const headerContainment = await page.evaluate(() => {
      const dialog = document.querySelector(".terminal-appearance-dialog");
      const content = document.querySelector(".terminal-appearance-content");
      const dialogRect = dialog.getBoundingClientRect();
      const visibleControls = [...dialog.querySelectorAll("button, input, select")]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        });
      return {
        contentClientWidth: content.clientWidth,
        contentScrollWidth: content.scrollWidth,
        dialogLeft: dialogRect.left,
        dialogRight: dialogRect.right,
        visibleControls
      };
    });
    expect(headerContainment.contentScrollWidth).toBeLessThanOrEqual(headerContainment.contentClientWidth);
    expect(headerContainment.visibleControls.every((control) => (
      control.left >= headerContainment.dialogLeft && control.right <= headerContainment.dialogRight
    ))).toBe(true);
  });

  test("normalizes terminal colors, fonts, themes, and every HSV hue sector", async ({ page }) => {
    await reset(page);
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const original = {
        background: state.settings.terminalBackground,
        foreground: state.settings.terminalForeground,
        fontFamily: state.settings.fontFamily,
        theme: state.settings.theme
      };
      state.settings.theme = "ember";
      state.settings.terminalBackground = "";
      state.settings.terminalForeground = "";
      state.settings.fontFamily = "Cascadia Mono";
      terminal.terminalBackground = "";
      terminal.terminalForeground = "";
      terminal.terminalFontFamily = "";

      const base = terminalThemeWithColors("", "");
      const backgroundOnly = terminalThemeWithColors("#123456", "bad");
      const foregroundOnly = terminalThemeWithColors("bad", "#ABCDEF");
      const both = terminalThemeWithColors("#112233", "#DDEEFF");
      state.settings.theme = "missing-theme";
      const invalidThemeIsEmber = terminalThemeWithColors("", "") === themes.ember;
      const invalidThemeValues = terminalAppearanceValues(terminal, "all");
      state.settings.theme = "ember";
      const defaultValues = terminalAppearanceValues(terminal, "all");
      state.settings.terminalBackground = "#203040";
      state.settings.terminalForeground = "#F0E0D0";
      state.settings.fontFamily = "Courier New";
      const globalValues = terminalAppearanceValues(terminal, "all");
      terminal.terminalBackground = "#010203";
      terminal.terminalForeground = "#A0B0C0";
      terminal.terminalFontFamily = "Consolas";
      const terminalValues = terminalAppearanceValues(terminal, "terminal");
      const terminalTheme = terminalThemeFor(terminal);
      const terminalFont = terminalFontFamilyName(terminal);
      terminal.terminalFontFamily = "Unknown font";
      const fallbackFont = terminalFontFamilyName(terminal);

      const hsv = [
        "#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF", "#000000", "#808080"
      ].map(terminalColorToHsv);
      const colors = [0, 60, 120, 180, 240, 300, -60, 420].map((hue) => (
        terminalHsvToColor({ hue, saturation: 100, value: 100 })
      ));
      const clamped = terminalHsvToColor({ hue: 30, saturation: 150, value: 120 });
      const missingAppearanceTargets = [applyTerminalAppearance(null), applyTerminalAppearance({})];

      const appearanceFontSelect = elements.terminalAppearanceFontFamily;
      elements.terminalAppearanceFontFamily = null;
      populateFontSelectors();
      const settingsFontCountWithoutAppearanceSelect = elements.fontFamily.options.length;
      elements.terminalAppearanceFontFamily = appearanceFontSelect;
      populateFontSelectors();

      state.settings.theme = original.theme;
      state.settings.terminalBackground = original.background;
      state.settings.terminalForeground = original.foreground;
      state.settings.fontFamily = original.fontFamily;
      return {
        normalized: [
          normalizeTerminalColor(" #a1b2c3 "),
          normalizeTerminalColor("#abcd"),
          normalizeTerminalFontFamily("Consolas", "fallback"),
          normalizeTerminalFontFamily("Missing", "fallback")
        ],
        channels: [terminalColorChannels("#123456"), terminalColorChannels("invalid")],
        channelHex: headerGradientChannelsToHex([-10, 127.6, 999]),
        themes: {
          baseIsTheme: base === themes.ember,
          backgroundOnly: backgroundOnly.background,
          backgroundOnlyForeground: backgroundOnly.foreground,
          foregroundOnlyBackground: foregroundOnly.background,
          foregroundOnly: foregroundOnly.foreground,
          both: [both.background, both.foreground],
          terminal: [terminalTheme.background, terminalTheme.foreground],
          invalidThemeIsEmber
        },
        values: { defaultValues, globalValues, invalidThemeValues, terminalValues, terminalFont, fallbackFont },
        hsv,
        colors,
        clamped,
        missingAppearanceTargets,
        settingsFontCountWithoutAppearanceSelect
      };
    });

    expect(result.normalized).toEqual(["#A1B2C3", "", "Consolas", "fallback"]);
    expect(result.channels).toEqual([[18, 52, 86], [0, 0, 0]]);
    expect(result.channelHex).toBe("#0080FF");
    expect(result.themes).toMatchObject({
      baseIsTheme: true,
      backgroundOnly: "#123456",
      foregroundOnly: "#ABCDEF",
      both: ["#112233", "#DDEEFF"],
      terminal: ["#010203", "#A0B0C0"],
      invalidThemeIsEmber: true
    });
    expect(result.themes.backgroundOnlyForeground).toBe(result.values.defaultValues.foreground);
    expect(result.themes.foregroundOnlyBackground).toBe(result.values.defaultValues.background);
    expect(result.values.defaultValues).toMatchObject({ fontFamily: "Cascadia Mono" });
    expect(result.values.invalidThemeValues.background).toBe(result.values.defaultValues.background);
    expect(result.values.invalidThemeValues.foreground).toBe(result.values.defaultValues.foreground);
    expect(result.values.globalValues).toEqual({ background: "#203040", foreground: "#F0E0D0", fontFamily: "Courier New" });
    expect(result.values.terminalValues).toEqual({ background: "#010203", foreground: "#A0B0C0", fontFamily: "Consolas" });
    expect(result.values.terminalFont).toBe("Consolas");
    expect(result.values.fallbackFont).toBe("Courier New");
    expect(result.hsv.slice(0, 6).map((entry) => Math.round(entry.hue))).toEqual([0, 60, 120, 180, 240, 300]);
    expect(result.hsv[6]).toMatchObject({ hue: 0, saturation: 0, value: 0 });
    expect(result.hsv[7].hue).toBe(0);
    expect(result.hsv[7].saturation).toBe(0);
    expect(result.colors).toEqual(["#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF", "#FF00FF", "#FFFF00"]);
    expect(result.clamped).toBe("#FF8000");
    expect(result.missingAppearanceTargets).toEqual([undefined, undefined]);
    expect(result.settingsFontCountWithoutAppearanceSelect).toBe(20);
  });

  test("normalizes header modes and ignores control events after the draft closes", async ({ page }) => {
    await reset(page);
    const result = await page.evaluate(() => {
      const originalFontSelect = elements.headerAppearanceFontFamily;
      const originalDraft = headerBackgroundDraft;
      const validStop = { color: "#123456", opacity: 100, position: 25 };
      try {
        const invalid = [
          normalizeHeaderBackground(null),
          normalizeHeaderBackground([]),
          normalizeHeaderBackground({ mode: "gradient", stops: [validStop] }),
          normalizeHeaderBackground({ mode: "solid", color: "bad", stops: [] })
        ];
        const solid = normalizeHeaderBackground({
          mode: "solid",
          color: "#abcdef",
          fontFamily: "missing",
          fontSize: 999,
          stops: [null, { color: "bad", position: 50 }]
        });
        const fromStop = normalizeHeaderBackground({
          mode: "solid",
          color: "",
          fontSize: -4,
          stops: [validStop, { color: "#654321", opacity: "bad", position: "bad" }]
        });

        const terminal = [...state.terminals.values()][0];
        headerBackgroundTerminalId = terminal.id;
        state.settings.terminalHeaderBackground = normalizeHeaderBackground({
          mode: "solid",
          color: "#112233",
          fontFamily: "",
          stops: []
        });
        terminal.headerBackground = normalizeHeaderBackground({
          mode: "solid",
          color: "#334455",
          fontFamily: "Consolas",
          fontSize: 18,
          stops: []
        });
        terminalAppearanceScope = "all";
        loadTerminalAppearanceDraft();
        const globalDraftFont = headerBackgroundDraft.fontFamily;
        const globalFontStyle = elements.headerAppearanceFontFamily.style.fontFamily;
        terminalAppearanceScope = "terminal";
        loadTerminalAppearanceDraft();
        const terminalDraftFont = headerBackgroundDraft.fontFamily;
        const terminalFontStyle = elements.headerAppearanceFontFamily.style.fontFamily;
        const terminalFontSizeValue = elements.headerAppearanceFontSize.value;
        terminal.headerBackground = null;
        loadTerminalAppearanceDraft();
        const inheritedDraftColor = headerBackgroundDraft.color;
        elements.headerAppearanceFontFamily.value = "";
        elements.headerAppearanceFontFamily.dispatchEvent(new Event("change", { bubbles: true }));
        const clearedFontStyle = elements.headerAppearanceFontFamily.style.fontFamily;

        elements.headerAppearanceFontFamily = null;
        populateFontSelectors();
        elements.headerAppearanceFontFamily = originalFontSelect;

        headerBackgroundDraft = null;
        renderHeaderSolidPalette();
        syncHeaderBackgroundMode();
        document.querySelector("[data-header-background-mode]").click();
        elements.headerSolidPalette.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        const detachedSwatch = document.createElement("button");
        detachedSwatch.dataset.headerSolidColor = "#7CA8F6";
        elements.headerSolidPalette.append(detachedSwatch);
        detachedSwatch.click();
        elements.headerAppearanceFontFamily.dispatchEvent(new Event("change", { bubbles: true }));
        elements.headerAppearanceFontSize.value = "18";
        elements.headerAppearanceFontSize.dispatchEvent(new Event("input", { bubbles: true }));

        return {
          clearedFontStyle,
          fromStop,
          globalDraftFont,
          globalFontStyle,
          inheritedDraftColor,
          invalid,
          paletteCount: elements.headerSolidPalette.children.length,
          solid,
          terminalDraftFont,
          terminalFontSizeValue,
          terminalFontStyle
        };
      } finally {
        elements.headerAppearanceFontFamily = originalFontSelect;
        headerBackgroundDraft = originalDraft;
      }
    });

    expect(result.invalid).toEqual([null, null, null, null]);
    expect(result.solid).toMatchObject({
      color: "#ABCDEF",
      fontFamily: "",
      fontSize: 20,
      mode: "solid",
      stops: [
        { color: "#ABCDEF", opacity: 100, position: 0 },
        { color: "#ABCDEF", opacity: 100, position: 100 }
      ]
    });
    expect(result.fromStop).toMatchObject({
      color: "#654321",
      fontSize: 0,
      mode: "solid"
    });
    expect(result.globalFontStyle).toBe("");
    expect(result.globalDraftFont).toBe("");
    expect(result.terminalFontStyle).toContain("Consolas");
    expect(result.terminalDraftFont).toBe("Consolas");
    expect(result.terminalFontSizeValue).toBe("18");
    expect(result.inheritedDraftColor).toBe("#112233");
    expect(result.clearedFontStyle).toBe("");
    expect(result.paletteCount).toBe(1);
  });

  test("handles picker events, validation, reset scopes, missing terminals, and focus wrapping", async ({ page }) => {
    await reset(page);
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const other = [...state.terminals.values()][1];
      openTerminalAppearanceEditor(terminal);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const backgroundPlane = elements.terminalAppearanceBackgroundPlane;
      const foregroundPlane = elements.terminalAppearanceForegroundPlane;
      const nativeBackgroundRect = backgroundPlane.getBoundingClientRect.bind(backgroundPlane);
      const nativeSetCapture = backgroundPlane.setPointerCapture.bind(backgroundPlane);
      const nativeHasCapture = backgroundPlane.hasPointerCapture.bind(backgroundPlane);
      backgroundPlane.setPointerCapture = () => {};
      backgroundPlane.hasPointerCapture = () => false;
      backgroundPlane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
      backgroundPlane.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, pointerId: 41, clientX: 10, clientY: 10
      }));
      backgroundPlane.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, pointerId: 41, clientX: 10, clientY: 10
      }));
      backgroundPlane.hasPointerCapture = () => true;
      backgroundPlane.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
      backgroundPlane.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, pointerId: 41, clientX: 75, clientY: 25
      }));
      backgroundPlane.getBoundingClientRect = nativeBackgroundRect;
      backgroundPlane.setPointerCapture = nativeSetCapture;
      backgroundPlane.hasPointerCapture = nativeHasCapture;

      const keyResults = [];
      for (const [key, shiftKey] of [["x", false], ["ArrowLeft", false], ["ArrowRight", true], ["ArrowDown", false], ["ArrowUp", true]]) {
        const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
        backgroundPlane.dispatchEvent(event);
        keyResults.push([key, event.defaultPrevented]);
      }
      elements.terminalAppearanceBackgroundHue.value = "420";
      elements.terminalAppearanceBackgroundHue.dispatchEvent(new Event("input", { bubbles: true }));
      setTerminalColorPickerExpanded("background", true);
      setTerminalColorPickerExpanded("background", false);
      setTerminalColorPickerExpanded("foreground", true);
      const expandedForeground = foregroundPlane.closest(".terminal-color-editor").classList.contains("is-picker-expanded");

      const beforeInvalid = terminalAppearanceDraft.background;
      elements.terminalAppearanceBackgroundHex.value = "invalid";
      elements.terminalAppearanceBackgroundHex.dispatchEvent(new Event("input", { bubbles: true }));
      const invalidMarked = elements.terminalAppearanceBackgroundHex.getAttribute("aria-invalid");
      terminalAppearanceDraft = null;
      elements.terminalAppearanceBackgroundHex.dispatchEvent(new Event("blur", { bubbles: true }));
      commitTerminalInlineColor("background");
      updateTerminalAppearancePreview();
      elements.terminalAppearanceFontFamily.value = "Consolas";
      elements.terminalAppearanceFontFamily.dispatchEvent(new Event("change", { bubbles: true }));
      terminalAppearanceDraft = terminalAppearanceValues(terminal);
      elements.terminalAppearanceBackgroundR.value = "";
      elements.terminalAppearanceBackgroundR.dispatchEvent(new Event("input", { bubbles: true }));
      elements.terminalAppearanceBackgroundR.value = "300";
      elements.terminalAppearanceBackgroundG.value = "-10";
      elements.terminalAppearanceBackgroundB.value = "128";
      elements.terminalAppearanceBackgroundB.dispatchEvent(new Event("change", { bubbles: true }));
      const clampedChannels = terminalAppearanceDraft.background;
      elements.terminalAppearanceBackgroundHex.dispatchEvent(new Event("blur", { bubbles: true }));
      elements.terminalAppearanceFontFamily.value = "not-a-font";
      elements.terminalAppearanceFontFamily.dispatchEvent(new Event("change", { bubbles: true }));
      const normalizedFont = terminalAppearanceDraft.fontFamily;

      const previewTerminalId = headerBackgroundTerminalId;
      headerBackgroundTerminalId = "missing-preview-terminal";
      updateTerminalAppearancePreview();
      const missingPreviewBackground = elements.terminalAppearancePreview.style.background;
      headerBackgroundTerminalId = previewTerminalId;

      setTerminalAppearanceColorControls("foreground", "bad");
      setTerminalAppearanceColorControls("foreground", "#445566", { hue: 210, saturation: 50, value: 40 });
      terminalAppearanceScope = "all";
      loadTerminalAppearanceDraft();
      const allDraft = { ...terminalAppearanceDraft };
      terminalAppearanceScope = "terminal";
      loadTerminalAppearanceDraft();
      setTerminalAppearanceTab("header", { focus: true });
      setTerminalAppearanceTab("terminal", { focus: true });
      setTerminalAppearanceApplyChoices(true);
      const choicesOpen = !elements.terminalAppearanceApplyChoices.hidden;
      setTerminalAppearanceApplyChoices(false);

      const invalidTab = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      elements.terminalAppearanceTabTerminal.dispatchEvent(invalidTab);
      const arrowTab = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
      elements.terminalAppearanceTabTerminal.dispatchEvent(arrowTab);
      setTerminalAppearanceTab("header", { focus: true });
      const reverseArrowTab = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true });
      elements.terminalAppearanceTabHeader.dispatchEvent(reverseArrowTab);
      const reverseArrowSelectedTerminal = terminalAppearanceTab === "terminal";

      headerBackgroundDraft = null;
      elements.headerGradientAngle.value = "90";
      elements.headerGradientAngle.dispatchEvent(new Event("input", { bubbles: true }));
      elements.headerGradientAngle.value = "";
      elements.headerGradientAngle.dispatchEvent(new Event("input", { bubbles: true }));
      elements.headerGradientShape.value = "circle";
      elements.headerGradientShape.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("[data-header-gradient-type]").click();
      headerBackgroundDraft = defaultHeaderBackground(terminal);
      elements.headerGradientAngle.value = "999";
      elements.headerGradientAngle.dispatchEvent(new Event("input", { bubbles: true }));
      elements.headerGradientShape.value = "circle";
      elements.headerGradientShape.dispatchEvent(new Event("change", { bubbles: true }));

      terminal.headerBackground = defaultHeaderBackground(terminal);
      terminalAppearanceTab = "header";
      terminalAppearanceScope = "terminal";
      headerBackgroundTerminalId = terminal.id;
      resetHeaderBackgroundEditor();
      openHeaderBackgroundEditor(terminal);
      terminalAppearanceScope = "all";
      terminalAppearanceTab = "header";
      state.settings.terminalHeaderBackground = defaultHeaderBackground(terminal);
      terminal.headerBackground = defaultHeaderBackground(terminal);
      other.headerBackground = defaultHeaderBackground(other);
      resetHeaderBackgroundEditor();
      openTerminalAppearanceEditor(terminal);
      terminalAppearanceScope = "terminal";
      terminalAppearanceTab = "terminal";
      terminal.terminalBackground = "#111111";
      terminal.terminalForeground = "#EEEEEE";
      terminal.terminalFontFamily = "Consolas";
      resetHeaderBackgroundEditor();
      openTerminalAppearanceEditor(terminal);
      terminalAppearanceScope = "all";
      terminalAppearanceTab = "terminal";
      state.settings.terminalBackground = "#222222";
      state.settings.terminalForeground = "#DDDDDD";
      state.settings.fontFamily = "Courier New";
      other.terminalBackground = "#333333";
      other.terminalForeground = "#CCCCCC";
      other.terminalFontFamily = "Consolas";
      resetHeaderBackgroundEditor();

      headerBackgroundOpen = true;
      headerBackgroundTerminalId = "missing-terminal";
      terminalAppearanceTab = "header";
      headerBackgroundDraft = null;
      applyHeaderBackgroundEditor();
      headerBackgroundOpen = true;
      headerBackgroundTerminalId = "missing-terminal";
      resetHeaderBackgroundEditor();

      openTerminalAppearanceEditor(terminal);
      terminalAppearanceTab = "terminal";
      terminalAppearanceDraft = null;
      applyHeaderBackgroundEditor();
      const noDraftClosed = !headerBackgroundOpen;

      openHeaderBackgroundEditor(terminal);
      terminalAppearanceTab = "header";
      terminalAppearanceScope = "terminal";
      headerBackgroundDraft = { type: "linear", stops: [] };
      applyHeaderBackgroundEditor();
      const invalidHeaderStayedOpen = headerBackgroundOpen;
      closeHeaderBackgroundEditor({ restoreFocus: false });
      closeHeaderBackgroundEditor({ restoreFocus: false });

      openTerminalAppearanceEditor(terminal);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      elements.headerBackgroundApply.click();
      elements.headerBackgroundApply.click();
      elements.headerBackgroundOverlay.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        target: elements.headerBackgroundApply
      }));
      const harmlessKey = new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true });
      elements.headerBackgroundOverlay.dispatchEvent(harmlessKey);
      const focusable = [...elements.headerBackgroundOverlay.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'
      )].filter((element) => !element.closest("[hidden]") && element.getClientRects().length > 0);
      focusable[0]?.focus();
      elements.headerBackgroundOverlay.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Tab", shiftKey: true, bubbles: true, cancelable: true
      }));
      focusable.at(-1)?.focus();
      elements.headerBackgroundOverlay.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Tab", bubbles: true, cancelable: true
      }));
      elements.headerBackgroundOverlay.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape", bubbles: true, cancelable: true
      }));

      return {
        allDraft,
        arrowPrevented: arrowTab.defaultPrevented,
        beforeInvalid,
        clampedChannels,
        choicesOpen,
        expandedForeground,
        invalidHeaderStayedOpen,
        invalidMarked,
        invalidTabPrevented: invalidTab.defaultPrevented,
        keyResults,
        missingPreviewBackground,
        noDraftClosed,
        normalizedFont,
        reverseArrowSelectedTerminal
      };
    });

    expect(result.invalidMarked).toBe("true");
    expect(result.beforeInvalid).toMatch(/^#[0-9A-F]{6}$/);
    expect(result.clampedChannels).toBe("#FF0080");
    expect(result.normalizedFont).toBe("Cascadia Mono");
    expect(result.keyResults).toEqual([
      ["x", false], ["ArrowLeft", true], ["ArrowRight", true], ["ArrowDown", true], ["ArrowUp", true]
    ]);
    expect(result.choicesOpen).toBe(true);
    expect(result.invalidTabPrevented).toBe(false);
    expect(result.arrowPrevented).toBe(true);
    expect(result.expandedForeground).toBe(true);
    expect(result.invalidHeaderStayedOpen).toBe(true);
    expect(result.allDraft).toMatchObject({ fontFamily: expect.any(String) });
    expect(result.missingPreviewBackground).toMatch(/^rgb\(/);
    expect(result.noDraftClosed).toBe(true);
    expect(result.reverseArrowSelectedTerminal).toBe(true);
  });
});