/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { test, expect } = require("../support/renderer-coverage");

async function clearBridgeMessages(page) {
  await page.evaluate(async () => {
    const listing = await requestBridge({ type: "messageList" }, { timeout: 5000 });
    for (const message of listing?.messages || []) {
      await requestBridge({ type: "messageAction", id: message.id, action: "dismiss" }, { timeout: 5000 });
    }
    state.terminalMessages.clear();
    state.terminalLinks.clear();
    saveTerminalLinks();
    updateTerminalMessageIndicators();
    renderTerminalMessages();
    updateTerminalConnectionViews();
  });
}

async function reset(page) {
  await page.goto("/");
  await expect(page.locator("#statusConn")).toHaveText("Connected");
  await page.evaluate(() => {
    closeTerminalMessages({ restoreFocus: false });
    closeAllTerminals();
    addTerminal({ title: "Message source" });
    addTerminal({ title: "Message target" });
  });
  await expect(page.locator(".terminal-pane")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() =>
    [...state.terminals.values()].filter((terminal) => terminal.status === "live").length
  )).toBe(2);
  await clearBridgeMessages(page);
}

test.describe("Terminal messaging", () => {
  test.beforeEach(async ({ page }) => reset(page));

  test.afterEach(async ({ page }) => {
    await clearBridgeMessages(page);
    await page.evaluate(() => {
      closeTerminalMessages({ restoreFocus: false });
      closeAllTerminals();
    });
  });

  test("sends a command to another terminal and inserts it without Enter", async ({ page }) => {
    await page.locator("#terminalMessagesToggle").click();
    await expect(page.locator("#terminalMessagesOverlay")).toBeVisible();
    await expect(page.locator("#messageSource option")).toHaveCount(2);
    await expect(page.locator("#messageTarget option")).toHaveCount(1);

    const route = await page.evaluate(() => ({
      sourceId: elements.messageSource.value,
      targetId: elements.messageTarget.value
    }));
    const command = "Write-Output 'terminal-message-must-not-run'";
    await page.locator("#messageKind").selectOption("command");
    await page.locator("#messageText").fill(command);
    await page.locator("#messageSend").click();

    await expect(page.locator(".terminal-message-item")).toHaveCount(1);
    await expect(page.locator("#terminalMessagesBadge")).toHaveText("1");
    await expect(page.locator(".terminal-message-content")).toHaveText(command);
    await expect(page.locator(".terminal-message-meta")).toContainText("Message source");
    await expect(page.locator(".terminal-message-meta")).toContainText("Message target");

    await page.locator('[data-message-action="insert"]').click();
    await expect(page.locator("#terminalMessagesOverlay")).toBeHidden();
    await expect(page.locator("#terminalMessagesBadge")).toBeHidden();
    await expect.poll(() => page.evaluate(() => state.activeId)).toBe(route.targetId);

    await expect.poll(() => page.evaluate((targetId) => {
      const terminal = state.terminals.get(targetId);
      const buffer = terminal.term.buffer.active;
      const lines = [];
      for (let index = 0; index < buffer.length; index += 1) {
        lines.push(buffer.getLine(index)?.translateToString(true) || "");
      }
      return lines.join("");
    }, route.targetId)).toContain("terminal-message-must-not-run");
    expect(route.sourceId).not.toBe(route.targetId);
  });

  test("renders received text literally and allows dismissal", async ({ page }) => {
    await page.locator("#terminalMessagesToggle").click();
    await page.locator("#messageKind").selectOption("text");
    await page.locator("#messageText").fill('<img src=x onerror="window.__messageXss=true"> review summary');
    await page.locator("#messageSend").click();

    const item = page.locator(".terminal-message-item");
    await expect(item).toHaveCount(1);
    await expect(item.locator(".terminal-message-content")).toContainText("<img src=x");
    await expect(item.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => window.__messageXss)).toBeUndefined();

    await item.locator('[data-message-action="dismiss"]').click();
    await expect(item).toHaveCount(0);
    await expect(page.locator("#terminalMessagesEmpty")).toBeVisible();
  });

  test("creates, persists, and removes an explicit directional terminal link", async ({ page }) => {
    await page.locator("#terminalMessagesToggle").click();
    const route = await page.evaluate(() => ({
      sourceId: elements.messageSource.value,
      targetId: elements.messageTarget.value
    }));
    await page.locator("#messageLinkAdd").click();

    await expect(page.locator('.terminal-connector-path.is-link')).toHaveCount(1);
    await expect(page.locator('.message-map-link')).toHaveCount(1);
    await expect(page.locator('.message-connection-row [data-terminal-unlink]')).toHaveCount(1);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.terminalLinks")));
    expect(stored).toMatchObject([{ sourceId: route.sourceId, targetId: route.targetId }]);

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate(() =>
      [...state.terminals.values()].filter((terminal) => terminal.status === "live").length
    )).toBe(2);
    await expect(page.locator('.terminal-connector-path.is-link')).toHaveCount(1);
    expect(await page.evaluate(() => state.terminalLinks.size)).toBe(1);

    await page.locator("#terminalMessagesToggle").click();
    await page.locator('[data-terminal-unlink]').click();
    await expect(page.locator('.terminal-connector-path.is-link')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.terminalLinks")))).toEqual([]);
  });

  test("explains handoffs and opens a route-preselected composer from a connector", async ({ page }) => {
    await page.locator("#terminalMessagesToggle").click();
    const guide = page.locator(".message-handoff-guide");
    await expect(guide).toContainText("Best for handoffs");
    await expect(guide).toContainText("direct input is faster");
    await expect(guide).toContainText("receiver approves Insert");
    await expect(guide).toContainText("Insert never presses Enter");

    const route = await page.evaluate(() => ({
      sourceId: elements.messageSource.value,
      targetId: elements.messageTarget.value
    }));
    await page.locator("#messageLinkAdd").click();
    await page.locator("#terminalMessagesClose").click();
    await expect(page.locator("#terminalMessagesOverlay")).toBeHidden();

    const connectorPoint = await page.locator(".terminal-connector-hit").evaluate((path) => {
      const point = path.getPointAtLength(path.getTotalLength() / 2);
      const stage = document.querySelector(".stage").getBoundingClientRect();
      return { x: stage.left + point.x, y: stage.top + point.y };
    });
    await page.mouse.move(connectorPoint.x, connectorPoint.y);

    const action = page.locator("#terminalConnectorAction");
    await expect(action).toBeVisible();
    await expect(action).toContainText("Message source");
    await expect(action).toContainText("Message target");
    await expect(page.locator("#terminalConnectorSend")).toHaveText("Send message");
    await page.locator("#terminalConnectorSend").click();

    await expect(page.locator("#terminalMessagesOverlay")).toBeVisible();
    expect(await page.locator("#messageSource").inputValue()).toBe(route.sourceId);
    expect(await page.locator("#messageTarget").inputValue()).toBe(route.targetId);
    await expect(page.locator("#messageText")).toBeFocused();
  });

  test("draws distinct linked and pending routes and keeps them aligned", async ({ page }) => {
    await page.locator("#terminalMessagesToggle").click();
    const route = await page.evaluate(() => ({
      sourceId: elements.messageSource.value,
      targetId: elements.messageTarget.value
    }));
    await page.locator("#messageLinkAdd").click();
    await page.locator("#messageKind").selectOption("text");
    await page.locator("#messageText").fill("Connector route check");
    await page.locator("#messageSend").click();

    await expect(page.locator('.terminal-connector-path.is-link')).toHaveCount(1);
    await expect(page.locator('.terminal-connector-path.is-pending')).toHaveCount(1);
    await expect(page.locator('.message-map-link')).toHaveCount(1);
    await expect(page.locator('.message-map-pending')).toHaveCount(1);
    const before = await page.evaluate(({ sourceId, targetId }) => {
      const inspect = (selector) => {
        const path = document.querySelector(selector);
        const style = getComputedStyle(path);
        return {
          d: path.getAttribute("d"),
          markerEnd: style.markerEnd,
          markerStart: style.markerStart,
          stroke: style.stroke,
          strokeDasharray: style.strokeDasharray
        };
      };
      const stage = elements.stage.getBoundingClientRect();
      const source = state.terminals.get(sourceId).pane.getBoundingClientRect();
      const target = state.terminals.get(targetId).pane.getBoundingClientRect();
      const path = document.querySelector('.terminal-connector-path.is-link');
      const start = path.getPointAtLength(0);
      const end = path.getPointAtLength(path.getTotalLength());
      const distanceToRect = (point, rect) => Math.min(
        Math.abs(point.x - (rect.left - stage.left)),
        Math.abs(point.x - (rect.right - stage.left)),
        Math.abs(point.y - (rect.top - stage.top)),
        Math.abs(point.y - (rect.bottom - stage.top))
      );
      return {
        link: inspect('.terminal-connector-path.is-link'),
        pending: inspect('.terminal-connector-path.is-pending'),
        startDistance: distanceToRect(start, source),
        endDistance: distanceToRect(end, target)
      };
    }, route);
    expect(before.link.stroke).not.toBe(before.pending.stroke);
    expect(before.link.strokeDasharray).toBe("none");
    expect(before.pending.strokeDasharray).not.toBe("none");
    expect(before.link.markerStart).not.toBe(before.pending.markerStart);
    expect(before.link.markerEnd).not.toBe(before.pending.markerEnd);
    expect(before.link.d).not.toBe(before.pending.d);
    expect(before.startDistance).toBeGreaterThanOrEqual(23);
    expect(before.startDistance).toBeLessThanOrEqual(25);
    expect(before.endDistance).toBeGreaterThanOrEqual(23);
    expect(before.endDistance).toBeLessThanOrEqual(25);

    await page.evaluate(() => {
      state.settings.layout = "rows";
      applySettings();
    });
    await expect.poll(() => page.locator('.terminal-connector-path.is-link').getAttribute("d"))
      .not.toBe(before.link.d);

    const flip = await page.evaluate(async (sourceId) => {
      const terminal = state.terminals.get(sourceId);
      const current = terminal.pane.getBoundingClientRect();
      const path = document.querySelector('.terminal-connector-path.is-link');
      const homePath = path.getAttribute("d");
      animatePaneShuffle(new Map([[
        terminal.pane,
        {
          bottom: current.bottom,
          height: current.height,
          left: current.left + 80,
          right: current.right + 80,
          top: current.top,
          width: current.width
        }
      ]]), null);
      await new Promise((resolve) => setTimeout(resolve, 70));
      const stage = elements.stage.getBoundingClientRect();
      const moving = terminal.pane.getBoundingClientRect();
      const currentPath = document.querySelector('.terminal-connector-path.is-link');
      const start = currentPath.getPointAtLength(0);
      const distance = Math.min(
        Math.abs(start.x - (moving.left - stage.left)),
        Math.abs(start.x - (moving.right - stage.left)),
        Math.abs(start.y - (moving.top - stage.top)),
        Math.abs(start.y - (moving.bottom - stage.top))
      );
      return {
        animationFrame: state.terminalConnections.animationFrame,
        distance,
        pathChanged: currentPath.getAttribute("d") !== homePath
      };
    }, route.sourceId);
    expect(flip.animationFrame).not.toBe(0);
    expect(flip.pathChanged).toBe(true);
    expect(flip.distance).toBeGreaterThanOrEqual(22);
    expect(flip.distance).toBeLessThanOrEqual(26);
    await expect.poll(() => page.evaluate(() => state.terminalConnections.animationFrame)).toBe(0);

    await page.locator('[data-message-action="insert"]').click();
    await expect(page.locator('.terminal-connector-path.is-pending')).toHaveCount(0);
    await expect(page.locator('.terminal-connector-path.is-link')).toHaveCount(1);
  });

  test("contains keyboard focus and uses the route list on narrow screens", async ({ page }) => {
    try {
      await page.locator("#terminalMessagesToggle").click();
      await page.locator("#messageLinkAdd").click();
      expect(await page.evaluate(() => document.querySelector(".app-shell").inert)).toBe(true);

      await page.locator("#terminalMessagesRefresh").focus();
      await page.keyboard.press("Tab");
      await expect(page.locator("#terminalMessagesClose")).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(page.locator("#terminalMessagesRefresh")).toBeFocused();

      await page.setViewportSize({ width: 600, height: 800 });
      await expect(page.locator("#messageConnectionsMap")).toBeHidden();
      await expect(page.locator(".message-connection-row")).toBeVisible();
      const bounds = await page.evaluate(() => {
        const dialog = document.querySelector(".terminal-messages").getBoundingClientRect();
        const unlink = document.querySelector("[data-terminal-unlink]").getBoundingClientRect();
        return { dialogLeft: dialog.left, dialogRight: dialog.right, unlinkRight: unlink.right, viewport: innerWidth };
      });
      expect(bounds.dialogLeft).toBeGreaterThanOrEqual(0);
      expect(bounds.dialogRight).toBeLessThanOrEqual(bounds.viewport);
      expect(bounds.unlinkRight).toBeLessThanOrEqual(bounds.viewport);

      await page.keyboard.press("Escape");
      await expect(page.locator("#terminalMessagesOverlay")).toBeHidden();
      expect(await page.evaluate(() => document.querySelector(".app-shell").inert)).toBe(false);
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test("rejects terminal controls again at the final insert boundary", async ({ page }) => {
    const route = await page.evaluate(async () => {
      const [sourceId, targetId] = [...state.terminals.keys()];
      const response = await requestBridge({
        type: "messageSend",
        kind: "command",
        sourceId,
        targetId,
        text: "mt-safe-marker\rWrite-Output mt-unsafe-marker\u001b[A"
      }, { timeout: 5000 });
      return { response, targetId };
    });
    expect(route.response.type).toBe("messageSent");

    await page.locator("#terminalMessagesToggle").click();
    await expect(page.locator(".terminal-message-item")).toHaveCount(1);
    await page.locator('[data-message-action="insert"]').click();
    await expect(page.locator(".terminal-message-item")).toHaveCount(1);
    await expect(page.locator("#toastHost")).toContainText(/control characters/i);

    const renderedBuffer = await page.evaluate((targetId) => {
      const buffer = state.terminals.get(targetId).term.buffer.active;
      const lines = [];
      for (let index = 0; index < buffer.length; index += 1) {
        lines.push(buffer.getLine(index)?.translateToString(true) || "");
      }
      return lines.join("");
    }, route.targetId);
    expect(renderedBuffer).not.toContain("mt-safe-marker");
    expect(renderedBuffer).not.toContain("mt-unsafe-marker");
  });

  test("expires pending handoffs when the target session exits", async ({ page }) => {
    const targetId = await page.evaluate(async () => {
      const [sourceId, targetId] = [...state.terminals.keys()];
      await requestBridge({
        type: "messageSend",
        kind: "text",
        sourceId,
        targetId,
        text: "must not survive target exit"
      }, { timeout: 5000 });
      return targetId;
    });
    await expect(page.locator("#terminalMessagesBadge")).toHaveText("1");

    await page.evaluate((id) => sendBridge({ type: "kill", id }), targetId);
    await expect.poll(() => page.evaluate((id) => state.terminals.get(id)?.status, targetId)).toBe("exited");
    await expect(page.locator("#terminalMessagesBadge")).toBeHidden();

    const listing = await page.evaluate(() => requestBridge({ type: "messageList" }, { timeout: 5000 }));
    expect(listing.messages).toEqual([]);
  });

  test("opens from a terminal context and exposes kind-specific fields", async ({ page }) => {
    const sourceId = await page.evaluate(() => [...state.terminals.keys()][0]);
    await page.locator(`.terminal-pane[data-id="${sourceId}"] .terminal-screen`).click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Send to terminal" }).click();
    await expect(page.locator("#terminalMessagesOverlay")).toBeVisible();
    await expect(page.locator("#messageSource")).toHaveValue(sourceId);

    await page.locator("#messageKind").selectOption("path");
    await expect(page.locator("#messagePathRow")).toBeVisible();
    await expect(page.locator("#messageTextRow")).toBeHidden();

    await page.locator("#messageKind").selectOption("status");
    await expect(page.locator("#messageStatusRow")).toBeVisible();
    await expect(page.locator("#messageTextRow")).toBeVisible();
  });

  test("persists and pushes user-configurable message limits", async ({ page }) => {
    const frames = await page.evaluate(() => {
      window.__communicationFrames = [];
      window.__communicationOriginalSend = state.socket.send.bind(state.socket);
      state.socket.send = (payload) => {
        const parsed = JSON.parse(payload);
        if (parsed.type === "communicationConfig") window.__communicationFrames.push(parsed);
        return window.__communicationOriginalSend(payload);
      };
      return window.__communicationFrames;
    });
    expect(frames).toEqual([]);

    const setNumber = (selector, value) => page.evaluate(({ selector, value }) => {
      const element = document.querySelector(selector);
      element.value = value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, { selector, value });

    await setNumber("#terminalMessageMaxKb", "128");
    await setNumber("#terminalInboxCapacity", "0");
    await expect.poll(() => page.evaluate(() => window.__communicationFrames.length)).toBe(2);

    const result = await page.evaluate(() => {
      state.socket.send = window.__communicationOriginalSend;
      return {
        frames: window.__communicationFrames,
        persisted: JSON.parse(localStorage.getItem("multiterm.settings"))
      };
    });
    expect(result.frames.at(-1)).toEqual({
      type: "communicationConfig",
      terminalInboxCapacity: 0,
      terminalMessageMaxKb: 128
    });
    expect(result.persisted).toMatchObject({ terminalInboxCapacity: 0, terminalMessageMaxKb: 128 });
  });
});
