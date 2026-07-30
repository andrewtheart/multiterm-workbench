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

const { test, expect } = require("../support/renderer-coverage");

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
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));

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

  const stubStatisticsReplies = (page) => page.evaluate(() => {
    const socket = state.socket;
    const originalSend = state.socket.send.bind(state.socket);
    window.__statisticsRequests = [];
    window.__restoreStatisticsSocket = () => {
      if (state.socket === socket) state.socket.send = originalSend;
    };
    state.socket.send = (payload) => {
      const request = JSON.parse(payload);
      if (request.type !== "statistics") {
        originalSend(payload);
        return;
      }

      window.__statisticsRequests.push(request);
      const terminals = request.id
        ? [state.terminals.get(request.id)].filter(Boolean)
        : [...state.terminals.values()];
      const sessions = terminals.map((terminal, index) => ({
        id: terminal.id,
        title: "Bridge creation title",
        pid: terminal.pid || 4000 + index,
        keystrokesIn: 10 + index,
        keystrokesOut: 20 + index,
        bytesIn: 30 + index,
        bytesOut: 40 + index,
        cpuPercent: 1.5 + index,
        memoryBytes: 64 * 1024 * 1024
      }));
      const totals = sessions.reduce((total, session) => ({
        keystrokesIn: total.keystrokesIn + session.keystrokesIn,
        keystrokesOut: total.keystrokesOut + session.keystrokesOut,
        bytesIn: total.bytesIn + session.bytesIn,
        bytesOut: total.bytesOut + session.bytesOut,
        cpuPercent: total.cpuPercent + session.cpuPercent,
        memoryBytes: total.memoryBytes + session.memoryBytes
      }), { keystrokesIn: 0, keystrokesOut: 0, bytesIn: 0, bytesOut: 0, cpuPercent: 0, memoryBytes: 0 });

      window.setTimeout(() => handleBridgeMessage({
        type: "statistics",
        requestId: request.requestId,
        scope: request.id ? "terminal" : "all",
        requestedId: request.id || null,
        generatedAt: new Date().toISOString(),
        supported: true,
        processError: null,
        sessions,
        totals
      }), 100);
    };
  });

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
      "All terminal statistics\u2026",
      "Open folder",
      "Reset layout",
      "New page",
      "Close all terminals"
    ]) {
      await expect(menu.locator(".ctx-item", { hasText: label }).first()).toBeVisible();
    }

    // Anything that only means something for one terminal must not appear: there
    // is no terminal under the pointer to copy from, clear, restart or close.
    for (const label of ["Copy all output", "Paste", "Select all", "Clear", "Restart", "Split (duplicate)", "Cycle color", "Move to", "Launch Copilot CLI (YOLO)"]) {
      await expect(menu.locator(".ctx-item", { hasText: label })).toHaveCount(0);
    }

    // It is the same menu widget the panes use, so it inherits their styling.
    await expect(menu.locator(".ctx-sep").first()).toBeVisible();
    await expect(menu.locator(".ctx-item svg").first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("opens all-terminal statistics from the blank surface", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await trimPanes(page, 1);
    await stubStatisticsReplies(page);

    const menu = await openSurfaceMenu(page);
    await menu.locator(".ctx-item", { hasText: "All terminal statistics\u2026" }).click();

    const overlay = page.locator("#statisticsOverlay");
    await expect(overlay).toBeVisible();
    await expect(page.locator("#statisticsTitle")).toHaveText("All terminal statistics");
    await expect(page.locator(".statistics-metric-label")).toHaveText([
      "Keystrokes in",
      "Keystrokes out",
      "Bridge bytes in",
      "Bridge bytes out",
      "CPU now",
      "Memory now"
    ]);
    await expect.poll(() => page.locator(".statistics-table tbody tr").count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__statisticsRequests.at(-1).id)).toBeUndefined();

    await page.locator("#statisticsRefresh").click();
    await expect(page.locator("#statisticsRefresh")).toBeDisabled();
    await expect(page.locator("#statisticsRefresh")).toBeEnabled({ timeout: 15000 });
    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    await page.evaluate(() => window.__restoreStatisticsSocket());
  });

  test("degrades statistics cleanly when an installed bridge is too old", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const before = await page.locator("#bridgeStatus").textContent();
    await page.evaluate(() => {
      const originalSend = state.socket.send.bind(state.socket);
      window.__restoreOldStatisticsBridge = () => { state.socket.send = originalSend; };
      state.socket.send = (payload) => {
        const request = JSON.parse(payload);
        if (request.type === "statistics") {
          window.setTimeout(() => handleBridgeMessage({
            type: "error",
            message: "Unsupported message type: statistics"
          }), 20);
          return;
        }
        originalSend(payload);
      };
      openStatistics();
    });

    await expect(page.locator("#statisticsOverlay")).toBeVisible();
    await expect(page.locator(".statistics-error")).toContainText("Update or reinstall MultiTerm");
    await expect(page.locator("#statisticsRefresh")).toBeEnabled();
    await expect(page.locator("#bridgeStatus")).toHaveText(before);
    expect(await page.evaluate(() => [...pendingBridgeRequests.values()].some((pending) => pending.type === "statistics"))).toBe(false);

    await page.locator("#statisticsClose").click();
    await page.evaluate(() => window.__restoreOldStatisticsBridge());
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

  test("preserves and copies a TUI selection when right-click opens the menu", async ({ page }) => {
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
      // selection. Model a mouse-aware TUI trying to clear it on right mousedown;
      // MultiTerm's capture handler must own that gesture before the TUI sees it.
      terminal.term.element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
      terminal.screen.addEventListener("mousedown", () => terminal.term.clearSelection(), { once: true });
      terminal.screen.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2 }));

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
      await Promise.resolve();
      return {
        selection,
        liveSelection: terminal.term.getSelection()
      };
    });

    expect(selected).toEqual({
      selection: "tui-selection-marker",
      liveSelection: "tui-selection-marker"
    });
    const copy = page.locator("#contextMenu .ctx-item").filter({ hasText: /^CopyCtrl\+Shift\+C/ });
    await expect(copy).toBeVisible();
    await expect(copy).not.toHaveAttribute("aria-disabled", "true");
    expect(await page.evaluate(() => state.terminals.get(state.activeId).selectionSnapshot)).toBe("");
    await copy.click();
    await expect.poll(() => page.evaluate(() => window.__contextCopiedText)).toBe(selected.selection);

    // The snapshot belongs only to that menu opening; without a fresh visible
    // selection, a second right-click must not offer the old text again.
    await page.evaluate(() => {
      const terminal = state.terminals.get(state.activeId);
      terminal.term.element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      terminal.term.clearSelection();
    });
    await page.locator(".terminal-pane.is-active .terminal-screen").click({ button: "right" });
    await expect(copy).toHaveAttribute("aria-disabled", "true");
  });

  test("context-menu Paste uses xterm bracketed paste for TUI prompts", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const sent = await page.evaluate(async () => {
      const terminal = state.terminals.get(state.activeId);
      await new Promise((resolve) => terminal.term.write("\x1b[?2004h", resolve));

      const originalSocket = state.socket;
      const originalReady = state.socketReady;
      const originalClipboard = navigator.clipboard;
      const messages = [];
      state.socket = {
        readyState: WebSocket.OPEN,
        send(payload) { messages.push(JSON.parse(payload)); }
      };
      state.socketReady = true;
      state.settings.rightClickAction = "menu";
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { readText: async () => "copilot-paste-marker" }
      });

      terminal.screen.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        clientX: 500,
        clientY: 300
      }));
      const paste = [...elements.contextMenu.querySelectorAll(".ctx-item")]
        .find((item) => item.textContent.startsWith("Paste"));
      paste.click();

      for (let i = 0; i < 20 && messages.length === 0; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      }

      await new Promise((resolve) => terminal.term.write("\x1b[?2004l", resolve));
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
      state.socket = originalSocket;
      state.socketReady = originalReady;
      return messages;
    });

    expect(sent).toContainEqual({
      type: "input",
      id: expect.any(String),
      data: "\x1b[200~copilot-paste-marker\x1b[201~"
    });
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
    await expect(menu.locator(".ctx-item", { hasText: "Terminal statistics\u2026" })).toBeVisible();

    // Shell output scrolls xterm's nested viewport. It must not dismiss a menu
    // the user is interacting with; only scrolling the workspace host should.
    await page.evaluate(() => {
      document.querySelector(".xterm-viewport").dispatchEvent(new Event("scroll"));
    });
    await expect(menu).toBeVisible();

    // Dismissed by clicking away rather than Escape: xterm swallows Escape while
    // the terminal has focus, which is unrelated to what this asserts.
    await page.mouse.click(4, 4);
    await expect(menu).toBeHidden();
  });

  test("opens statistics for the right-clicked terminal", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await stubStatisticsReplies(page);
    await page.evaluate(() => {
      const terminal = state.terminals.get(state.activeId);
      terminal.titleInput.value = "Renamed terminal";
    });

    await page.locator(".terminal-screen").first().click({ button: "right" });
    await page.evaluate(() => { window.__statisticsReturnFocus = document.activeElement; });
    await page.locator("#contextMenu .ctx-item", { hasText: "Terminal statistics\u2026" }).click();

    const overlay = page.locator("#statisticsOverlay");
    await expect(overlay).toBeVisible();
    await expect(page.locator("#statisticsTitle")).toHaveText("Terminal statistics");
    await expect(page.locator("#statisticsSubtitle")).toContainText("Renamed terminal");
    await expect(page.locator("#statisticsSubtitle")).toContainText("PID");
    await expect(page.locator(".statistics-metric")).toHaveCount(6);
    await expect(page.locator(".statistics-table")).toHaveCount(0);
    expect(await page.evaluate(() => window.__statisticsRequests.at(-1).id)).toBeTruthy();

    await expect(page.locator("#statisticsRefresh")).toBeEnabled();
    await expect(page.locator("#statisticsClose")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#statisticsRefresh")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#statisticsClose")).toBeFocused();

    await page.locator("#statisticsClose").click();
    await expect(overlay).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.activeElement === window.__statisticsReturnFocus)).toBe(true);
    await page.evaluate(() => window.__restoreStatisticsSocket());
  });
});
