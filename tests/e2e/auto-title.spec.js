const { test, expect } = require("../support/renderer-coverage");

// Each automatic suggestion is a real AI request, so the gaps between them, the
// fact that one never renames a terminal on its own, and the fact that one never
// steals focus all matter.
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

  test("reveals an automatic suggestion for approval without taking focus", async ({ page }) => {
    await ready(page);
    const pane = page.locator(".terminal-pane").first();
    await pane.locator(".xterm-helper-textarea").focus();

    const result = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      const before = terminal.titleInput.value;
      showTerminalTitleSuggestion(terminal, "deploy pipeline", { auto: true });
      return { before, focused: document.activeElement.className };
    });
    expect(result.before).not.toBe("deploy pipeline");
    // Suggestions arrive on a timer, so pulling focus would interrupt whatever
    // the user is typing in the terminal underneath.
    expect(result.focused).toContain("xterm-helper-textarea");

    // One sparkle button per header, not two.
    await expect(pane.locator(".pane-title-generate")).toHaveCount(1);
    await expect(pane.locator(".pane-title-generate")).toBeHidden();
    await expect(pane.locator(".pane-title-review")).toBeVisible();
    await expect(pane.locator(".pane-title")).toHaveValue("deploy pipeline");

    await pane.locator(".pane-title-accept").click();
    await expect(pane.locator(".pane-title")).toHaveValue("deploy pipeline");
    await expect(pane.locator(".pane-title-review")).toBeHidden();
    await expect(pane.locator(".pane-title-generate")).not.toHaveClass(/has-suggestion/);
  });

  test("restores the original title when an automatic suggestion is rejected", async ({ page }) => {
    await ready(page);
    const original = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      showTerminalTitleSuggestion(terminal, "throwaway name", { auto: true });
      return terminal.titleOriginal;
    });
    const pane = page.locator(".terminal-pane").first();
    await expect(pane.locator(".pane-title")).toHaveValue("throwaway name");
    await pane.locator(".pane-title-reject").click();
    await expect(pane.locator(".pane-title")).toHaveValue(original);
    await expect(pane.locator(".pane-title-generate")).toBeVisible();
    await expect(pane.locator(".pane-title-generate")).not.toHaveClass(/has-suggestion/);
  });

  test("waits as a badge rather than overwriting a rename in progress", async ({ page }) => {
    await ready(page);
    const pane = page.locator(".terminal-pane").first();
    await pane.locator(".pane-title").focus();

    const before = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      showTerminalTitleSuggestion(terminal, "renamed under you", { auto: true });
      return terminal.titleInput.value;
    });
    expect(before).not.toBe("renamed under you");
    await expect(pane.locator(".pane-title-review")).toBeHidden();
    await expect(pane.locator(".pane-title-generate")).toHaveClass(/has-suggestion/);
    const unreadAnimation = await pane.locator(".pane-title-generate .ai-title-glyph").evaluate((icon) => {
      const style = getComputedStyle(icon);
      return {
        fillMode: style.animationFillMode,
        iterationCount: style.animationIterationCount
      };
    });
    expect(unreadAnimation).toEqual({ fillMode: "forwards", iterationCount: "3" });

    await pane.locator(".pane-title-generate").click();
    await expect(pane.locator(".pane-title-review")).toBeVisible();
    await expect(pane.locator(".pane-title")).toHaveValue("renamed under you");
    await pane.locator(".pane-title-reject").click();
    await expect(pane.locator(".pane-title")).toHaveValue(before);
  });

  test("a manually requested suggestion still applies straight away", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      showTerminalTitleSuggestion(terminal, "manual choice");
    });
    const pane = page.locator(".terminal-pane").first();
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

  test("a title repaint does not restart the suggestion ladder", async ({ page }) => {
    await ready(page);
    const timers = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      state.settings.autoTitleSuppressions = [];
      applyAutoTitleSuppressions();
      const before = terminal.autoTitleTimer;
      // A shell that repaints its own title arrives here over and over.
      commitTerminalTitle(terminal, "same name", false);
      commitTerminalTitle(terminal, "same name", false);
      const after = terminal.autoTitleTimer;
      // Becoming paused must still stop the pending run.
      addAutoTitleSuppression({ kind: "title", value: "same name", label: "same name" });
      const paused = terminal.autoTitleTimer;
      state.settings.autoTitleSuppressions = [];
      applyAutoTitleSuppressions();
      return { before, after, paused, resumed: terminal.autoTitleTimer !== 0 };
    });
    expect(timers.before).not.toBe(0);
    expect(timers.after).toBe(timers.before);
    expect(timers.paused).toBe(0);
    expect(timers.resumed).toBe(true);
  });

  test("right-clicking the suggest button offers every pause scope", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      state.settings.autoTitleSuppressions = [];
      const [terminal] = [...state.terminals.values()];
      commitTerminalTitle(terminal, "release notes");
      terminal.pid = 4242;
    });

    const pane = page.locator(".terminal-pane").first();
    await pane.locator(".pane-title-generate").click({ button: "right" });
    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("Automatic titles are on");
    await expect(menu).toContainText("Pause for this terminal");
    await expect(menu).toContainText("Pause for PID 4242");
    await expect(menu).toContainText('Pause for titles matching "release notes"');
    await expect(menu.locator(".ctx-command-input")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("pausing for this terminal cancels its schedule and marks the button", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      state.settings.autoTitleSuppressions = [];
      applyAutoTitleSuppressions();
    });

    const pane = page.locator(".terminal-pane").first();
    await pane.locator(".pane-title-generate").click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Pause for this terminal" }).click();

    await expect(pane.locator(".pane-title-generate")).toHaveClass(/is-suppressed/);
    const paused = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      return {
        timer: terminal.autoTitleTimer,
        suppressed: autoTitleSuppressed(terminal),
        stored: JSON.parse(localStorage.getItem("multiterm.settings")).autoTitleSuppressions.map((rule) => rule.kind)
      };
    });
    expect(paused.timer).toBe(0);
    expect(paused.suppressed).toBe(true);
    expect(paused.stored).toEqual(["terminal"]);

    // The same menu is the way back out.
    await pane.locator(".pane-title-generate").click({ button: "right" });
    await expect(page.locator("#contextMenu")).toContainText("Automatic titles are paused");
    await page.locator("#contextMenu .ctx-item", { hasText: "Resume for this terminal" }).click();
    await expect(pane.locator(".pane-title-generate")).not.toHaveClass(/is-suppressed/);
    await expect.poll(() => page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      return terminal.autoTitleTimer !== 0;
    })).toBe(true);
  });

  test("pauses by PID and by title, and title rules follow the title", async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      state.settings.autoTitleSuppressions = [];
      terminal.pid = 5150;
      commitTerminalTitle(terminal, "build watcher");

      addAutoTitleSuppression({ kind: "pid", value: "5150", label: "build watcher" });
      const byPid = autoTitleSuppressed(terminal);
      const survivesRename = (commitTerminalTitle(terminal, "renamed"), autoTitleSuppressed(terminal));

      state.settings.autoTitleSuppressions = [];
      addAutoTitleSuppression({ kind: "title", value: "renamed", label: "renamed" });
      const byTitle = autoTitleSuppressed(terminal);
      commitTerminalTitle(terminal, "something else");
      const afterRename = autoTitleSuppressed(terminal);

      state.settings.autoTitleSuppressions = [];
      applyAutoTitleSuppressions();
      return { byPid, survivesRename, byTitle, afterRename };
    });
    expect(result.byPid).toBe(true);
    // A PID names the process, so renaming the pane changes nothing.
    expect(result.survivesRename).toBe(true);
    expect(result.byTitle).toBe(true);
    // A title rule stops applying once the terminal is no longer called that.
    expect(result.afterRename).toBe(false);
  });

  test("normalizes stored rules and drops duplicates and junk", async ({ page }) => {
    await ready(page);
    const rules = await page.evaluate(() => normalizeAutoTitleSuppressions([
      { kind: "pid", value: "1234" },
      { kind: "pid", value: "1234" },
      { kind: "pid", value: "not-a-pid" },
      { kind: "title", value: "  Deploy  " },
      { kind: "title", value: "deploy" },
      { kind: "title", value: "   " },
      { kind: "elsewhere", value: "x" },
      null
    ]).map((rule) => `${rule.kind}:${rule.value}`));
    expect(rules).toEqual(["pid:1234", "title:Deploy"]);
  });

  test("keeps title pauses but forgets terminal and PID pauses that are gone", async ({ page }) => {
    await ready(page);
    const kinds = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      state.settings.autoTitleSuppressions = normalizeAutoTitleSuppressions([
        { kind: "terminal", value: terminal.id, label: "live one" },
        { kind: "terminal", value: "terminal-that-closed" },
        { kind: "pid", value: "999999" },
        { kind: "title", value: "long lived" }
      ]);
      pruneAutoTitleSuppressions();
      const kept = state.settings.autoTitleSuppressions.map((rule) => `${rule.kind}:${rule.value}`);
      state.settings.autoTitleSuppressions = [];
      applyAutoTitleSuppressions();
      return { kept, id: terminal.id };
    });
    expect(kinds.kept).toEqual([`terminal:${kinds.id}`, "title:long lived"]);
  });

  test("lists paused rules in settings and resumes them from there", async ({ page }) => {
    await ready(page);
    // The section starts collapsed, so open every settings group first.
    await page.evaluate(() => {
      state.settings.autoTitleSuppressions = [];
      applyAutoTitleSuppressions();
      for (const group of settingsPanelGroups) setSettingsGroupExpanded(group, true);
    });
    await expect(page.locator("#autoTitleSuppressionRow")).toBeHidden();
    await page.evaluate(() => {
      addAutoTitleSuppression({ kind: "title", value: "noisy build", label: "noisy build" });
    });
    const row = page.locator("#autoTitleSuppressionRow");
    await expect(row).toBeVisible();
    await expect(row).toContainText('Titles matching "noisy build"');
    await row.locator(".auto-title-suppression-resume").first().click();
    await expect(row).toBeHidden();
    const remaining = await page.evaluate(() => state.settings.autoTitleSuppressions.length);
    expect(remaining).toBe(0);
  });
});
