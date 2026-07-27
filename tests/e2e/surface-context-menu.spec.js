const { test, expect } = require("@playwright/test");

// Right-clicking the empty area around the panes used to fall through to the
// browser's own menu, which is useless here. It has to offer the same menu the
// panes offer, minus everything that needs a specific terminal to act on.
test.describe("Surface context menu", () => {
  // Drives the app's hidden native controls; the visible ones are custom
  // comboboxes/sliders bound to these.
  const setNative = (page, selector, value, eventName) =>
    page.evaluate(
      ({ selector, value, eventName }) => {
        const el = document.querySelector(selector);
        el.value = value;
        el.dispatchEvent(new Event(eventName, { bubbles: true }));
      },
      { selector, value, eventName }
    );

  // Finds a point inside the terminal host that no pane covers, so the
  // right-click genuinely lands on blank surface. elementFromPoint is used
  // rather than arithmetic on bounding boxes because it reports the element
  // that would actually receive the event, and the neighbouring probes reject
  // points that only look blank because they sit in a sub-pixel gap.
  const findBlankPoint = (page) =>
    page.evaluate(() => {
      const host = document.querySelector("#terminalHost");
      const box = host.getBoundingClientRect();
      const blank = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return Boolean(el) && host.contains(el) && !el.closest(".terminal-pane");
      };
      for (let fy = 0.15; fy <= 0.85; fy += 0.1) {
        for (let fx = 0.9; fx >= 0.15; fx -= 0.1) {
          const x = Math.round(box.left + box.width * fx);
          const y = Math.round(box.top + box.height * fy);
          const clear = [[0, 0], [-6, 0], [6, 0], [0, -6], [0, 6]].every(([dx, dy]) => blank(x + dx, y + dy));
          if (clear) return { x, y };
        }
      }
      return null;
    });

  // The bridge is shared across the suite, so a spec that ran earlier can leave
  // enough panes behind to tile the whole host and leave no blank surface at all.
  const trimPanes = async (page, keep) => {
    const panes = page.locator(".terminal-pane");
    while ((await panes.count()) > keep) {
      const before = await panes.count();
      await page.locator('.terminal-pane [data-action="close"]').last().click();
      await expect(panes).toHaveCount(before - 1);
    }
  };

  const openSurfaceMenu = async (page) => {
    // Fixed columns with more columns than panes leaves real estate empty, which
    // is the state a user hits long before they fill the grid.
    await setNative(page, "#layoutMode", "columns", "change");
    await setNative(page, "#columnCount", "6", "input");

    const point = await findBlankPoint(page);
    expect(point, "the layout must leave blank surface to right-click").not.toBeNull();
    await page.mouse.click(point.x, point.y, { button: "right" });

    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();
    // Proves the click reached the surface rather than a pane: this entry only
    // exists in the surface menu, so its absence would mean the wrong menu.
    await expect(menu.locator(".ctx-item", { hasText: "New page" }).first()).toBeVisible();
    return menu;
  };

  test("offers workspace-wide actions and none that need a specific terminal", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await trimPanes(page, 1);
    const start = await page.locator(".terminal-pane").count();
    expect(start, "a pane must be present, so blank surface is not the only thing on screen").toBeGreaterThan(0);

    const menu = await openSurfaceMenu(page);

    for (const label of [
      "New terminal",
      "New terminal here",
      "New Administrator terminal",
      "Run script\u2026",
      "New Command Prompt terminal",
      "Find in all terminals\u2026",
      "Broadcast command\u2026",
      "Open folder",
      "Reset layout",
      "New page",
      "Close all terminals"
    ]) {
      await expect(menu.locator(".ctx-item", { hasText: label }).first()).toBeVisible();
    }

    // Anything that only means something for one terminal must not appear: there
    // is no terminal under the pointer to copy from, clear, restart or close.
    for (const label of ["Copy all output", "Paste", "Select all", "Clear", "Restart", "Split (duplicate)", "Cycle color", "Move to"]) {
      await expect(menu.locator(".ctx-item", { hasText: label })).toHaveCount(0);
    }

    // It is the same menu widget the panes use, so it inherits their styling.
    await expect(menu.locator(".ctx-sep").first()).toBeVisible();
    await expect(menu.locator(".ctx-item svg").first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("creates a terminal from the blank surface", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await trimPanes(page, 1);
    const start = await page.locator(".terminal-pane").count();

    const menu = await openSurfaceMenu(page);
    await menu.locator(".ctx-item", { hasText: "New Command Prompt terminal" }).first().click();

    await expect(menu).toBeHidden();
    await expect(page.locator(".terminal-pane")).toHaveCount(start + 1);
    await expect(page.locator(".pane-title").last()).toHaveValue("Command Prompt");

    await page.locator('.terminal-pane [data-action="close"]').last().click();
    await expect(page.locator(".terminal-pane")).toHaveCount(start);
  });

  test("positions a terminal menu before revealing it", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const screen = page.locator(".terminal-screen").first();
    const box = await screen.boundingBox();
    expect(box).not.toBeNull();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await page.evaluate(() => {
      const menu = document.querySelector("#contextMenu");
      const getBoundingClientRect = menu.getBoundingClientRect;
      window.__contextMenuMeasurement = null;
      menu.getBoundingClientRect = function measureContextMenu() {
        window.__contextMenuMeasurement = {
          hidden: this.hidden,
          visibility: getComputedStyle(this).visibility,
          left: this.style.left,
          top: this.style.top
        };
        this.getBoundingClientRect = getBoundingClientRect;
        return getBoundingClientRect.call(this);
      };
    });

    await page.mouse.click(point.x, point.y, { button: "right" });
    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();

    const placement = await page.evaluate(() => {
      const menu = document.querySelector("#contextMenu");
      return {
        measurement: window.__contextMenuMeasurement,
        finalVisibility: getComputedStyle(menu).visibility,
        finalLeft: Number.parseFloat(menu.style.left),
        positioning: menu.classList.contains("is-positioning")
      };
    });

    expect(placement.measurement).toEqual({
      hidden: false,
      visibility: "hidden",
      left: "0px",
      top: "0px"
    });
    expect(placement.finalVisibility).toBe("visible");
    expect(placement.finalLeft).toBeGreaterThan(8);
    expect(placement.positioning).toBe(false);

    await page.mouse.click(4, 4);
    await expect(menu).toBeHidden();
  });

  test("copies a TUI pointer selection after right-click clears the live selection", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const selected = await page.evaluate(async () => {
      const terminal = state.terminals.get(state.activeId);
      const marker = "tui-selection-marker";
      await new Promise((resolve) => terminal.term.write(`\r\n${marker}`, resolve));
      const buffer = terminal.term.buffer.active;
      terminal.term.select(0, buffer.baseY + buffer.cursorY, marker.length);
      const selection = terminal.term.getSelection();

      // A left-button pointerup is how a real drag snapshots the completed
      // selection. Mouse-aware TUIs then clear xterm's live selection before the
      // right-button pointer event reaches MultiTerm.
      terminal.term.element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
      terminal.term.clearSelection();
      terminal.term.element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2 }));

      window.__contextCopiedText = null;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (text) => { window.__contextCopiedText = text; } }
      });

      terminal.screen.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        clientX: 500,
        clientY: 300
      }));
      return selection;
    });

    expect(selected).toBe("tui-selection-marker");
    const copy = page.locator("#contextMenu .ctx-item").filter({ hasText: /^CopyCtrl\+Shift\+C/ });
    await expect(copy).toBeVisible();
    await expect(copy).not.toHaveAttribute("aria-disabled", "true");
    expect(await page.evaluate(() => state.terminals.get(state.activeId).selectionSnapshot)).toBe("");
    await copy.click();
    await expect.poll(() => page.evaluate(() => window.__contextCopiedText)).toBe(selected);

    // The snapshot belongs only to that menu opening; without a fresh visible
    // selection, a second right-click must not offer the old text again.
    await page.locator(".terminal-pane.is-active .terminal-screen").click({ button: "right" });
    await expect(copy).toHaveAttribute("aria-disabled", "true");
  });
  test("still opens the terminal menu when the click lands on a pane", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    await page.locator(".terminal-screen").first().click({ button: "right" });
    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();
    // The terminal-only entries are the proof this is the pane menu, not the
    // surface one that replaced the fall-through.
    await expect(menu.locator(".ctx-item", { hasText: "Select all" }).first()).toBeVisible();
    await expect(menu.locator(".ctx-item", { hasText: "Copy all output" }).first()).toBeVisible();

    // Dismissed by clicking away rather than Escape: xterm swallows Escape while
    // the terminal has focus, which is unrelated to what this asserts.
    await page.mouse.click(4, 4);
    await expect(menu).toBeHidden();
  });
});
