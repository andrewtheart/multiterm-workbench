const { test, expect } = require("../support/renderer-coverage");

// Each automatic suggestion is a real AI request, so the gaps between them and
// the fact that one never renames a terminal on its own both matter.
test.describe("Automatic terminal title suggestions", () => {
  const ready = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      closeAllTerminals();
      addTerminal({ reveal: true });
    });
    await expect.poll(() => page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      return terminal ? terminal.status : "none";
    }), { timeout: 30000 }).toBe("live");
  };

  test("backs off along the configured ladder and repeats the last gap", async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(() => {
      const schedule = parseAutoTitleSchedule(state.settings.autoTitleSchedule);
      const minutes = [];
      for (let step = 0; step < 10; step += 1) minutes.push(autoTitleDelayMs(step, schedule) / 60000);
      return { schedule, minutes };
    });
    expect(result.schedule).toEqual([5, 60, 120, 240, 360, 720, 1440, 2160]);
    // The gaps widen, then the final gap repeats rather than resetting.
    expect(result.minutes).toEqual([5, 60, 120, 240, 360, 720, 1440, 2160, 2160, 2160]);
  });

  test("ignores junk in the schedule and falls back to the default", async ({ page }) => {
    await ready(page);
    const parsed = await page.evaluate(() => ({
      spaced: parseAutoTitleSchedule("10 30 90"),
      messy: parseAutoTitleSchedule("15,,  45 , abc, -5, 0"),
      empty: parseAutoTitleSchedule("   "),
      capped: parseAutoTitleSchedule("999999"),
      normalized: normalizeAutoTitleSchedule("15,,  45 , abc")
    }));
    expect(parsed.spaced).toEqual([10, 30, 90]);
    expect(parsed.messy).toEqual([15, 45]);
    expect(parsed.empty).toEqual([5, 60, 120, 240, 360, 720, 1440, 2160]);
    expect(parsed.capped).toEqual([43200]);
    expect(parsed.normalized).toBe("15, 45");
  });

  test("offers an automatic suggestion as an icon without renaming the terminal", async ({ page }) => {
    await ready(page);
    const before = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      showTerminalTitleSuggestion(terminal, "deploy pipeline", { auto: true });
      return terminal.titleInput.value;
    });

    const pane = page.locator(".terminal-pane").first();
    await expect(pane.locator(".pane-title-hint")).toBeVisible();
    await expect(pane.locator(".pane-title-review")).toBeHidden();
    await expect(pane.locator(".pane-title")).toHaveValue(before);
    expect(before).not.toBe("deploy pipeline");

    await pane.locator(".pane-title-hint").click();
    await expect(pane.locator(".pane-title-hint")).toBeHidden();
    await expect(pane.locator(".pane-title-review")).toBeVisible();
    await expect(pane.locator(".pane-title")).toHaveValue("deploy pipeline");

    await pane.locator(".pane-title-accept").click();
    await expect(pane.locator(".pane-title")).toHaveValue("deploy pipeline");
    await expect(pane.locator(".pane-title-review")).toBeHidden();
  });

  test("restores the original title when an automatic suggestion is rejected", async ({ page }) => {
    await ready(page);
    const original = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      showTerminalTitleSuggestion(terminal, "throwaway name", { auto: true });
      return terminal.titleInput.value;
    });
    const pane = page.locator(".terminal-pane").first();
    await pane.locator(".pane-title-hint").click();
    await expect(pane.locator(".pane-title")).toHaveValue("throwaway name");
    await pane.locator(".pane-title-reject").click();
    await expect(pane.locator(".pane-title")).toHaveValue(original);
    await expect(pane.locator(".pane-title-hint")).toBeHidden();
    await expect(pane.locator(".pane-title-generate")).toBeVisible();
  });

  test("a manually requested suggestion still applies straight away", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      showTerminalTitleSuggestion(terminal, "manual choice");
    });
    const pane = page.locator(".terminal-pane").first();
    await expect(pane.locator(".pane-title-hint")).toBeHidden();
    await expect(pane.locator(".pane-title-review")).toBeVisible();
    await expect(pane.locator(".pane-title")).toHaveValue("manual choice");
  });

  test("stops scheduling when automatic suggestions are switched off", async ({ page }) => {
    await ready(page);
    const timers = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      const scheduled = terminal.autoTitleTimer !== 0;
      state.settings.autoTitleSuggestions = false;
      rescheduleAllAutoTitles();
      const afterOff = terminal.autoTitleTimer;
      state.settings.autoTitleSuggestions = true;
      rescheduleAllAutoTitles();
      const afterOn = terminal.autoTitleTimer !== 0;
      return { scheduled, afterOff, afterOn };
    });
    expect(timers.scheduled).toBe(true);
    expect(timers.afterOff).toBe(0);
    expect(timers.afterOn).toBe(true);
  });
});
