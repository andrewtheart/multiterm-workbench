/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
    Exploratory probes for the unreleased header-shortcut and header-gradient
    work. These deliberately go outside what the feature specs already assert,
    driving the real UI to look for behaviour the committed tests never reach.
*/

const { test, expect } = require("../support/renderer-coverage");

const FLYOUT = "#headerActionShortcutFlyout";

async function reset(page, count = 1) {
  await page.goto("/");
  await expect(page.locator("#statusConn")).toHaveText("Connected");
  await page.evaluate(() => {
    closeAllTerminals();
    state.settings.headerActionShortcuts = {};
    saveSettings();
  });
  await expect(page.locator(".terminal-pane")).toHaveCount(0);
  await page.evaluate((terminalCount) => {
    for (let index = 0; index < terminalCount; index += 1) {
      addTerminal({ title: `Probe terminal ${index + 1}` });
    }
  }, count);
  await expect(page.locator(".terminal-pane")).toHaveCount(count);
  await expect.poll(() => page.evaluate(() => (
    [...state.terminals.values()].filter((terminal) => terminal.status === "live").length
  ))).toBe(count);
}

async function openShortcutFlyout(page, action, paneIndex = 0) {
  await page.locator(".terminal-pane").nth(paneIndex)
    .locator(`.pane-actions button[data-action="${action}"]`)
    .click({ button: "right", force: true });
  await expect(page.locator(FLYOUT)).toBeVisible();
}

async function chooseScope(page, scope) {
  await page.locator(`${FLYOUT} input[name="headerActionShortcutScope"][value="${scope}"]`).check({ force: true });
}

async function captureCombination(page, keys) {
  await page.locator("#headerActionShortcutCapture").click();
  await expect(page.locator("#headerActionShortcutCapture")).toHaveClass(/is-capturing/);
  await page.locator(FLYOUT).press(keys);
  await expect(page.locator("#headerActionShortcutCapture")).not.toHaveClass(/is-capturing/);
}

async function applyFlyout(page) {
  await page.locator("#headerActionShortcutSave").click();
}

// Every header action a given terminal would answer to, grouped by combination.
// Any group holding more than one action means dispatch is ambiguous.
function ambiguousBindings(page, terminalIndex = 0) {
  return page.evaluate((index) => {
    const terminal = [...state.terminals.values()][index];
    const bySignature = new Map();
    for (const action of HEADER_ACTION_IDS) {
      const signature = globalShortcutSignature(headerActionShortcut(action, terminal));
      if (!signature) continue;
      if (!bySignature.has(signature)) bySignature.set(signature, []);
      bySignature.get(signature).push(action);
    }
    return [...bySignature.entries()]
      .filter(([, actions]) => actions.length > 1)
      .map(([signature, actions]) => ({ signature, actions }));
  }, terminalIndex);
}

test.describe("Exploratory: header action shortcuts", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      closeHeaderActionShortcutFlyout({ restoreFocus: false });
      state.settings.headerActionShortcuts = {};
      saveSettings();
      closeAllTerminals();
    });
  });

  test("a global remap does not collide with an existing per-terminal binding", async ({ page }) => {
    await reset(page, 2);

    // Bind minimize on just this terminal.
    await openShortcutFlyout(page, "minimize", 0);
    await chooseScope(page, "terminal");
    await captureCombination(page, "Control+Alt+Shift+F9");
    await applyFlyout(page);
    await expect(page.locator(FLYOUT)).toBeHidden();

    // Now hand the very same combination to a different action for all
    // terminals. The per-terminal binding above still stands, so this terminal
    // would answer to one combination with two actions.
    await openShortcutFlyout(page, "close", 0);
    await chooseScope(page, "all");
    await captureCombination(page, "Control+Alt+Shift+F9");
    await applyFlyout(page);
    await expect(page.locator(FLYOUT)).toBeHidden();

    expect(await ambiguousBindings(page, 0)).toEqual([]);
  });

  test("a global remap warns before it takes a per-terminal binding away", async ({ page }) => {
    await reset(page, 2);

    await openShortcutFlyout(page, "minimize", 0);
    await chooseScope(page, "terminal");
    await captureCombination(page, "Control+Alt+Shift+F9");
    await applyFlyout(page);
    await expect(page.locator(FLYOUT)).toBeHidden();

    // Claiming that combination for every terminal quietly unassigns the
    // per-terminal binding above, so the editor has to say so first.
    await openShortcutFlyout(page, "close", 0);
    await chooseScope(page, "all");
    await captureCombination(page, "Control+Alt+Shift+F9");

    await expect(page.locator("#headerActionShortcutStatus"))
      .toHaveText(/will be taken away from "Minimize" on 1 terminal\./);
    await expect(page.locator("#headerActionShortcutStatus")).not.toHaveClass(/is-error/);
    await expect(page.locator("#headerActionShortcutSave")).toBeEnabled();
  });

  test("pressing a doubly-claimed combination is not silently order-dependent", async ({ page }) => {
    await reset(page, 1);

    await openShortcutFlyout(page, "minimize", 0);
    await chooseScope(page, "terminal");
    await captureCombination(page, "Control+Alt+Shift+F9");
    await applyFlyout(page);
    await expect(page.locator(FLYOUT)).toBeHidden();

    await page.evaluate(() => {
      // Plant the collision directly, bypassing the editor, the way a restored
      // session or a hand-edited settings blob would.
      state.settings.headerActionShortcuts = {
        ...state.settings.headerActionShortcuts,
        close: { key: "F9", ctrl: true, alt: true, shift: true, meta: false }
      };
      saveSettings();
    });

    const pane = page.locator(".terminal-pane").first();
    await page.keyboard.press("Control+Alt+Shift+F9");

    // Whatever wins, the terminal must still exist: resolving to "close" here
    // would destroy a terminal the user meant to minimize.
    await expect(pane).toHaveCount(1);
    await expect(pane).toHaveClass(/is-minimized/);
  });

  test("an explicitly cleared binding stays cleared across a reload", async ({ page }) => {
    await reset(page, 1);

    await openShortcutFlyout(page, "minimize", 0);
    await chooseScope(page, "terminal");
    await page.locator("#headerActionShortcutClear").click();
    await applyFlyout(page);
    await expect(page.locator(FLYOUT)).toBeHidden();

    expect(await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      return formatGlobalShortcut(headerActionShortcut("minimize", terminal));
    })).toBeFalsy();

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate(() => state.terminals.size)).toBeGreaterThan(0);

    // A cleared binding must not quietly come back as the shipped default.
    expect(await page.evaluate(() => {
      const terminal = [...state.terminals.values()]
        .find((candidate) => candidate.titleInput.value === "Probe terminal 1");
      if (!terminal) return "missing";
      return formatGlobalShortcut(headerActionShortcut("minimize", terminal));
    })).toBeFalsy();
  });

  test("a per-terminal binding does not leak into a terminal created later", async ({ page }) => {
    await reset(page, 1);

    await openShortcutFlyout(page, "minimize", 0);
    await chooseScope(page, "terminal");
    await captureCombination(page, "Control+Alt+Shift+F10");
    await applyFlyout(page);
    await expect(page.locator(FLYOUT)).toBeHidden();

    await page.evaluate(() => addTerminal({ title: "Probe terminal 2" }));
    await expect(page.locator(".terminal-pane")).toHaveCount(2);

    expect(await page.evaluate(() => {
      const fresh = [...state.terminals.values()]
        .find((candidate) => candidate.titleInput.value === "Probe terminal 2");
      return formatGlobalShortcut(headerActionShortcut("minimize", fresh));
    })).toBe(await page.evaluate(() => formatGlobalShortcut(HEADER_ACTION_SHORTCUT_DEFAULTS.minimize)));
  });

  test("a shortcut fires on the focused terminal, not the one that was edited", async ({ page }) => {
    await reset(page, 2);

    await openShortcutFlyout(page, "minimize", 0);
    await chooseScope(page, "terminal");
    await captureCombination(page, "Control+Alt+Shift+F11");
    await applyFlyout(page);
    await expect(page.locator(FLYOUT)).toBeHidden();

    // Focus the *other* terminal, which never got the remap.
    await page.evaluate(() => {
      const second = [...state.terminals.values()][1];
      setActiveTerminal(second.id);
    });

    await page.keyboard.press("Control+Alt+Shift+F11");

    // The second terminal has no such binding, so nothing should minimize.
    expect(await page.evaluate(() => (
      [...state.terminals.values()].map((terminal) => terminal.pane.classList.contains("is-minimized"))
    ))).toEqual([false, false]);
  });
});

// The gradient is painted through a custom property on the pane bar rather than
// an inline background, so read it back the same way the stylesheet does.
function paneBarGradient(page, terminalIndex = 0) {
  return page.evaluate((index) => {
    const terminal = [...state.terminals.values()][index];
    const bar = terminal?.pane?.querySelector(".pane-bar");
    if (!bar) return "missing";
    return bar.style.getPropertyValue("--pane-bar-custom-bg");
  }, terminalIndex);
}

test.describe("Exploratory: header gradients", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => closeAllTerminals());
  });

  test("a gradient belongs to its terminal and survives a reload", async ({ page }) => {
    await reset(page, 2);

    await page.evaluate(() => {
      const [first] = [...state.terminals.values()];
      first.headerBackground = {
        type: "linear",
        angle: 217,
        stops: [
          { color: "#123456", position: 0, opacity: 100 },
          { color: "#ABCDEF", position: 100, opacity: 100 }
        ]
      };
      applyTerminalHeaderBackground(first);
      saveSessionSnapshot();
    });

    expect(await paneBarGradient(page, 0)).toContain("linear-gradient(217deg");
    // The untouched neighbour is not bare: it keeps the theme's own header.
    expect(await paneBarGradient(page, 1)).toBe(await page.evaluate(() => headerBackgroundCss(themeHeaderBackground())));

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate(() => state.terminals.size)).toBeGreaterThan(1);

    const restored = await page.evaluate(() => {
      const terminal = [...state.terminals.values()]
        .find((candidate) => candidate.titleInput.value === "Probe terminal 1");
      if (!terminal) return "missing";
      const bar = terminal.pane.querySelector(".pane-bar");
      return {
        css: bar.style.getPropertyValue("--pane-bar-custom-bg"),
        angle: terminal.headerBackground?.angle ?? null,
        stops: terminal.headerBackground?.stops?.length ?? 0
      };
    });
    expect(restored).not.toBe("missing");
    expect(restored.css).toContain("linear-gradient(217deg");
    expect(restored.angle).toBe(217);
    expect(restored.stops).toBe(2);
  });

  test("a stored colour that is not a plain hex triple cannot reach the stylesheet", async ({ page }) => {
    await reset(page, 1);

    const css = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      terminal.headerBackground = normalizeHeaderBackground({
        type: "linear",
        angle: 90,
        stops: [
          { color: "red; background-image: url(https://example.invalid/x.png)", position: 0 },
          { color: "#00FF00", position: 50 },
          { color: "#0000FF", position: 100 }
        ]
      });
      applyTerminalHeaderBackground(terminal);
      const bar = terminal.pane.querySelector(".pane-bar");
      return bar.style.getPropertyValue("--pane-bar-custom-bg");
    });

    expect(css).not.toContain("example.invalid");
    expect(css).not.toContain("url(");
    // The two well-formed stops survive; the hostile one is dropped entirely.
    expect(css).toContain("linear-gradient(90deg");
    expect(css).toContain("#00FF00");
  });

  test("out-of-range angles, positions, and opacities are clamped into valid CSS", async ({ page }) => {
    await reset(page, 1);

    const result = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      terminal.headerBackground = normalizeHeaderBackground({
        type: "linear",
        angle: 100000,
        stops: [
          { color: "#FF0000", position: -500, opacity: -20 },
          { color: "#0000FF", position: 9999, opacity: 5000 }
        ]
      });
      applyTerminalHeaderBackground(terminal);
      const bar = terminal.pane.querySelector(".pane-bar");
      const css = bar.style.getPropertyValue("--pane-bar-custom-bg");
      // Ask the browser whether the value it produced is actually usable.
      const probe = document.createElement("div");
      probe.style.backgroundImage = css;
      return { css, accepted: probe.style.backgroundImage !== "" };
    });

    expect(result.accepted).toBe(true);
    expect(result.css).toMatch(/^linear-gradient\((?:[0-9]|[12][0-9]{1,2}|3[0-5][0-9])deg/);
    expect(result.css).not.toContain("-500");
    expect(result.css).not.toContain("9999");
    expect(result.css).not.toContain("5000");
  });

  test("a gradient with more stops than the cap is trimmed, not rejected", async ({ page }) => {
    await reset(page, 1);

    const result = await page.evaluate(() => {
      const stops = [];
      for (let index = 0; index < 64; index += 1) {
        stops.push({ color: "#FF00FF", position: index, opacity: 100 });
      }
      const normalized = normalizeHeaderBackground({ type: "linear", angle: 45, stops });
      return { count: normalized ? normalized.stops.length : 0, cap: HEADER_GRADIENT_MAX_STOPS };
    });

    expect(result.count).toBeGreaterThan(1);
    expect(result.count).toBeLessThanOrEqual(result.cap);
  });

  test("a gradient survives minimize, restore, and a move to another page", async ({ page }) => {
    await reset(page, 1);

    await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      terminal.headerBackground = normalizeHeaderBackground({
        type: "linear",
        angle: 10,
        stops: [
          { color: "#FF0000", position: 0, opacity: 100 },
          { color: "#00FF00", position: 100, opacity: 100 }
        ]
      });
      applyTerminalHeaderBackground(terminal);
    });
    expect(await paneBarGradient(page, 0)).toContain("linear-gradient(10deg");

    await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      runHeaderAction(terminal, "minimize", null);
    });
    await expect(page.locator(".terminal-pane").first()).toHaveClass(/is-minimized/);

    await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      restoreTerminal(terminal.id);
    });
    await expect(page.locator(".terminal-pane").first()).not.toHaveClass(/is-minimized/);

    // The custom property lives in the pane bar's inline style, so anything
    // that rebuilds or re-parents the pane could quietly drop the gradient.
    expect(await paneBarGradient(page, 0)).toContain("linear-gradient(10deg");

    const movedGradient = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      const created = addPage();
      const target = created?.id ?? [...state.pages.keys()].find((id) => id !== terminal.pageId);
      if (target == null) return "no-second-page";
      moveTerminalToPage(terminal.id, target);
      setActivePage(target);
      const bar = terminal.pane.querySelector(".pane-bar");
      return bar ? bar.style.getPropertyValue("--pane-bar-custom-bg") : "missing";
    });
    if (movedGradient !== "no-second-page") {
      expect(movedGradient).toContain("linear-gradient(10deg");
    }
  });
});

test.describe("Exploratory: stored settings recovery", () => {
  test("unreadable stored settings fall back to defaults and say why", async ({ page }) => {
    const warnings = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });

    // Planted through an init script rather than after load: the app saves
    // settings on ordinary activity, so a value written to a running page is
    // overwritten long before the next load could read it.
    await page.addInitScript(() => {
      localStorage.setItem("multiterm.settings", "{ this is not json");
    });
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    expect(warnings.some((text) => /Settings could not be loaded/i.test(text))).toBe(true);

    // Defaults must actually be in force, not a half-populated object.
    expect(await page.evaluate(() => typeof state.settings.workspaceZoom)).toBe("number");
  });

  test("a settings blob of the wrong shape is repaired rather than trusted", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("multiterm.settings", JSON.stringify({
        headerActionShortcuts: [1, 2, 3],
        headerActionsInMenu: "not-an-array",
        workspaceZoom: "enormous",
        titleFontScale: null,
        pageCloseAction: "delete-everything"
      }));
    });
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const shape = await page.evaluate(() => ({
      shortcuts: Object.prototype.toString.call(state.settings.headerActionShortcuts),
      menu: Array.isArray(state.settings.headerActionsInMenu),
      zoom: typeof state.settings.workspaceZoom,
      zoomValue: state.settings.workspaceZoom,
      titleScale: typeof state.settings.titleFontScale,
      pageClose: state.settings.pageCloseAction
    }));

    expect(shape.shortcuts).toBe("[object Object]");
    expect(shape.menu).toBe(true);
    expect(shape.zoom).toBe("number");
    expect(Number.isFinite(shape.zoomValue)).toBe(true);
    expect(shape.titleScale).toBe("number");
    expect(shape.pageClose).not.toBe("delete-everything");
  });
});
