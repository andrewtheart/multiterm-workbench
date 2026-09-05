const { test, expect } = require("../support/renderer-coverage");

// The header used to give two thirds of its width to buttons, leaving a long
// title about 30% of what it needed.
test.describe("Pane header space", () => {
  const ready = async (page, count = 4) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate((n) => {
      closeAllTerminals();
      for (let i = 0; i < n; i += 1) addTerminal({ reveal: true });
    }, count);
    await expect(page.locator(".terminal-pane")).toHaveCount(count);
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].every((t) => t.status === "live")),
      { timeout: 30000 }).toBe(true);
  };

  const setTitle = (page, title) => page.evaluate((value) => {
    const [terminal] = [...state.terminals.values()];
    commitTerminalTitle(terminal, value);
    updatePaneDensity(terminal);
  }, title);

  test("middle-truncates a long title and keeps the full text available", async ({ page }) => {
    await ready(page);
    const long = "copilot: refactor authentication middleware and update tests";
    await setTitle(page, long);
    const display = page.locator(".terminal-pane .pane-title-display").first();
    const shown = (await display.textContent()).trim();

    expect(shown).not.toBe(long);
    expect(shown).toContain("\u2026");
    // The distinguishing tail survives, which end-truncation would have eaten.
    expect(shown.endsWith("tests")).toBe(true);
    expect(shown.startsWith("copilot")).toBe(true);
    await expect(display).toHaveAttribute("title", long);
  });

  test("leaves a short title untouched", async ({ page }) => {
    await ready(page);
    await setTitle(page, "build");
    const display = page.locator(".terminal-pane .pane-title-display").first();
    await expect(display).toHaveText("build");
  });

  test("measures an empty title without reserving phantom text space", async ({ page }) => {
    await ready(page, 1);
    const result = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      terminal.titleInput.value = "";
      terminal.titleDisplay.dataset.fullTitle = "";
      updateHeaderActionOverflow(terminal);
      return {
        overflowed: [...terminal.pane.querySelectorAll('[data-auto-overflow="true"]')]
          .map((button) => button.dataset.action)
      };
    });
    expect(result.overflowed).not.toEqual(expect.arrayContaining(["artifacts", "notifications", "header-background"]));
  });

  test("keeps most actions in the menu by default", async ({ page }) => {
    await ready(page);
    const placement = await page.evaluate(() => ({
      inMenu: defaultSettings.headerActionsInMenu.slice().sort(),
      current: state.settings.headerActionsInMenu.slice().sort()
    }));
    expect(placement.inMenu).toContain("move-left");
    expect(placement.inMenu).toContain("clear");
    expect(placement.inMenu).toContain("copy");
    expect(placement.inMenu).toContain("restart");
    // Closing a pane must never require a trip through a menu.
    expect(placement.inMenu).not.toContain("close");
  });

  test("gives the title far more of the header than before", async ({ page }) => {
    await ready(page);
    const long = "copilot: refactor authentication middleware and update tests";
    await setTitle(page, long);
    const widths = await page.evaluate(() => {
      const pane = document.querySelector(".terminal-pane");
      const bar = pane.querySelector(".pane-bar").getBoundingClientRect().width;
      const actions = pane.querySelector(".pane-actions").getBoundingClientRect().width;
      const wrap = pane.querySelector(".pane-title-wrap").getBoundingClientRect().width;
      const titleRect = pane.querySelector(".pane-title-display").getBoundingClientRect();
      const actionsRect = pane.querySelector(".pane-actions").getBoundingClientRect();
      const shown = pane.querySelector(".pane-title-display").textContent.trim();
      return {
        actionShare: actions / bar,
        titleAreaShare: wrap / bar,
        shownLength: shown.length,
        overlaps: titleRect.right > actionsRect.left
      };
    });
    // Measured at 67% actions / 28% title area before this work, with the title
    // showing 18 of its 60 characters; protected compact actions still leave
    // more than 20 and never touch the action row.
    expect(widths.actionShare).toBeLessThan(0.5);
    expect(widths.titleAreaShare).toBeGreaterThan(0.4);
    expect(widths.shownLength).toBeGreaterThan(20);
    expect(widths.overlaps).toBe(false);
  });

  test("pushes actions into the overflow menu as a pane gets narrower", async ({ page }) => {
    await ready(page, 1);
    await setTitle(page, "copilot: refactor authentication middleware and update tests");
    const wide = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      updatePaneDensity(terminal);
      return document.querySelectorAll('.pane-actions button[data-auto-overflow="true"]').length;
    });

    // A pane has a minimum width and the stage scrolls, so shrinking the window
    // does not narrow it; force a dense fixed grid instead.
    await page.evaluate(() => {
      state.settings.minWidth = 200;
      state.settings.layout = "columns";
      state.settings.columns = 4;
      applySettings();
      for (let i = 0; i < 3; i += 1) addTerminal({ reveal: true });
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(4);
    await page.waitForTimeout(900);

    const narrow = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      updatePaneDensity(terminal);
      return {
        barWidth: terminal.pane.querySelector(".pane-bar").clientWidth,
        overflowed: [...terminal.pane.querySelectorAll('.pane-actions button[data-auto-overflow="true"]')]
          .map((b) => b.dataset.action),
        closeOverflowed: terminal.pane.querySelector('.pane-actions button[data-action="close"]').dataset.autoOverflow
      };
    });

    expect(narrow.barWidth).toBeLessThan(400);
    expect(narrow.overflowed.length).toBeGreaterThan(wide);
    // Close is never surrendered.
    expect(narrow.closeOverflowed).toBeUndefined();

    // Whatever left the header has to be reachable in the pane menu.
    const listed = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      buildPaneOverflowMenu(terminal);
      return [...document.querySelectorAll("#contextMenu .ctx-item")].map((el) => el.textContent.trim());
    });
    for (const action of narrow.overflowed) {
      const label = { "move-left": "Move left", "move-right": "Move right", color: "Colour" }[action];
      if (label) expect(listed.join(" | ")).toContain(label.replace("Colour", "color"));
    }
    expect(listed.length).toBeGreaterThanOrEqual(narrow.overflowed.length);
  });

  test("keeps notes activity and palette visible in compact columns until the title needs their room", async ({ page }) => {
    await ready(page, 2);
    await page.evaluate(() => {
      // Stage width decides how compact a column is, so pin the settings panel
      // rather than inheriting whichever way it was last left.
      state.settings.sidecarHidden = false;
      state.settings.compactChrome = true;
      state.settings.layout = "columns";
      state.settings.columns = 2;
      state.settings.minWidth = 200;
      state.settings.headerActionsRevealOnHover = false;
      for (const terminal of state.terminals.values()) {
        commitTerminalTitle(terminal, "build");
      }
      applySettings();
      for (const terminal of state.terminals.values()) updatePaneDensity(terminal);
    });

    const right = page.locator(".terminal-pane").nth(1);
    await expect(right.locator('[data-action="artifacts"]')).toBeVisible();
    await expect(right.locator('[data-action="notifications"]')).toBeVisible();
    await expect(right.locator('[data-action="header-background"]')).toBeVisible();

    const stateBefore = await right.evaluate((pane) => ({
      width: pane.clientWidth,
      title: pane.querySelector(".pane-title-display").textContent,
      overflowed: [...pane.querySelectorAll('[data-auto-overflow="true"]')]
        .map((button) => button.dataset.action)
    }));
    expect(stateBefore.width).toBeLessThan(600);
    expect(stateBefore.title).toBe("build");
    expect(stateBefore.overflowed).not.toEqual(expect.arrayContaining(["artifacts", "notifications", "header-background"]));

    await page.evaluate(() => {
      const terminals = [...state.terminals.values()];
      commitTerminalTitle(terminals[1], "copilot: investigate the authentication regression and preserve every relevant test result");
      state.settings.columns = 4;
      for (let index = terminals.length; index < 4; index += 1) addTerminal({ reveal: true });
      applySettings();
      for (const terminal of state.terminals.values()) updatePaneDensity(terminal);
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(4);

    const longTitle = await right.evaluate((pane) => ({
      shown: pane.querySelector(".pane-title-display").textContent,
      overflowed: [...pane.querySelectorAll('[data-auto-overflow="true"]')]
        .map((button) => button.dataset.action)
    }));
    expect(longTitle.shown).toContain("\u2026");
    const protectedOverflow = longTitle.overflowed
      .filter((action) => ["artifacts", "notifications", "header-background"].includes(action));
    expect(protectedOverflow.length).toBeGreaterThan(0);

    const menuText = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][1];
      buildPaneOverflowMenu(terminal);
      return elements.contextMenu.textContent;
    });
    for (const action of protectedOverflow) {
      const label = {
        artifacts: "Notes & command queue",
        notifications: "Notifications",
        "header-background": "Header background"
      }[action];
      expect(menuText).toContain(label);
    }
  });

  test("hides revealable buttons until the pane is hovered", async ({ page }) => {
    await ready(page, 4);
    await page.evaluate(() => {
      state.settings.headerActionsRevealOnHover = true;
      applySettings();
    });
    const pane = page.locator(".terminal-pane").nth(1);
    const maximize = pane.locator('.pane-actions button[data-action="maximize"]');
    const close = pane.locator('.pane-actions button[data-action="close"]');

    await expect(close).toBeVisible();
    await expect(maximize).toBeHidden();
    await pane.hover();
    await expect(maximize).toBeVisible();

    await page.evaluate(() => {
      state.settings.headerActionsRevealOnHover = false;
      applySettings();
    });
    await expect(page.locator(".terminal-pane").nth(2)
      .locator('.pane-actions button[data-action="maximize"]')).toBeVisible();
  });
});
