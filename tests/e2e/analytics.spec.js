/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

test.describe.configure({ mode: "serial" });

test.describe("Terminal interaction analytics", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199" });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      closeAllTerminals();
      state.analytics = emptyTerminalAnalytics();
      saveTerminalAnalytics();
    });
    await expect.poll(() => page.evaluate(async () => (await fetch("/health")).json().then((health) => health.sessions))).toBe(0);
    await page.evaluate(() => {
      addTerminal({ title: "Analytics primary" });
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect(page.locator(".pane-status")).toHaveClass(/is-live/);
    await expect.poll(() => page.evaluate(async () => (await fetch("/health")).json().then((health) => health.sessions))).toBe(1);
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      state.analytics = emptyTerminalAnalytics();
      saveTerminalAnalytics();
      closeAllTerminals();
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(0);
    await page.waitForTimeout(800);
    await stopRendererCoverage(page, "analytics");
    await context.close();
  });

  test("counts physical keys, excludes paste, and pauses focus time", async () => {
    await page.locator("#settings-group-analytics").click();
    const input = page.locator(".xterm-helper-textarea").first();
    await input.focus();
    await page.keyboard.type("abc");
    await page.waitForTimeout(1100);

    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      terminal.term.paste("pasted text");
    });
    await page.locator("#settingsSearch").focus();

    const paused = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const record = state.analytics.terminals[terminal.id];
      return {
        focusMs: record.focusMs,
        focusedTerminalId: state.analyticsRuntime.focusedTerminalId,
        keystrokes: record.keystrokes,
        todayKeys: state.analytics.todayKeystrokes,
        totalKeys: state.analytics.totalKeystrokes
      };
    });
    expect(paused.keystrokes).toBe(3);
    expect(paused.todayKeys).toBe(3);
    expect(paused.totalKeys).toBe(3);
    expect(paused.focusMs).toBeGreaterThanOrEqual(900);
    expect(paused.focusedTerminalId).toBeNull();
    await expect(page.locator("#analyticsTodayKeystrokes")).toHaveText("3");
    await expect(page.locator("#analyticsTodayFocus")).not.toHaveText("0s");

    await page.waitForTimeout(250);
    const afterPause = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      return state.analytics.terminals[terminal.id].focusMs;
    });
    expect(afterPause - paused.focusMs).toBeLessThan(25);
  });

  test("does not count clicking an assistant composer as terminal activity", async () => {
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      endTerminalAnalyticsFocus();
      window.__analyticsBeforeClickTest = JSON.parse(JSON.stringify(state.analytics));
      state.analytics = emptyTerminalAnalytics();
      ensureTerminalAnalyticsRecord(terminal);
      terminal.aiAssistantTuiProvider = "copilot";
      saveTerminalAnalytics();
    });
    const input = page.locator(".xterm-helper-textarea").first();
    await input.click();
    await page.waitForTimeout(1100);

    const clicked = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      return {
        focusMs: state.analytics.terminals[terminal.id].focusMs,
        focusedTerminalId: state.analyticsRuntime.focusedTerminalId
      };
    });
    expect(clicked).toEqual({ focusMs: 0, focusedTerminalId: null });

    await page.keyboard.type("x");
    await page.waitForTimeout(250);
    await page.locator("#settingsSearch").focus();
    expect(await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      return state.analytics.terminals[terminal.id].focusMs;
    })).toBeGreaterThan(0);
    await page.evaluate(() => {
      endTerminalAnalyticsFocus();
      state.analytics = window.__analyticsBeforeClickTest;
      delete window.__analyticsBeforeClickTest;
      saveTerminalAnalytics();
      renderTerminalAnalytics();
    });
  });

  test("tracks each terminal separately", async () => {
    await page.evaluate(() => addTerminal({ title: "Analytics secondary" }));
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await expect(page.locator(".pane-status").last()).toHaveClass(/is-live/);
    await page.locator(".xterm-helper-textarea").last().focus();
    await page.keyboard.type("z");
    await page.locator("#settingsSearch").focus();

    const records = await page.evaluate(() => [...state.terminals.values()].map((terminal) => ({
      id: terminal.id,
      keys: state.analytics.terminals[terminal.id].keystrokes,
      title: state.analytics.terminals[terminal.id].title
    })));
    expect(records.map((record) => record.keys)).toEqual([3, 1]);
    expect(records.map((record) => record.title)).toEqual(["Analytics primary", "Analytics secondary"]);
    await expect(page.locator("#analyticsTerminalList .analytics-terminal-row")).toHaveCount(2);
    await expect(page.locator("#analyticsTotalKeystrokes")).toHaveText("4");
  });

  test("focuses Current terminals and exposes quick actions on right click", async () => {
    const setup = await page.evaluate(() => {
      const baselineCount = state.terminals.size;
      const terminal = addTerminal({ title: "Analytics temporary" });
      window.__analyticsOriginalPasteIntoTerminal = pasteIntoTerminal;
      window.__analyticsQuickSendIds = [];
      window.__analyticsInitialPageIds = state.pages.map((entry) => entry.id);
      pasteIntoTerminal = async (id) => window.__analyticsQuickSendIds.push(id);
      renderTerminalAnalytics();
      return { baselineCount, temporaryId: terminal.id };
    });
    const { baselineCount, temporaryId } = setup;
    await expect(page.locator(".terminal-pane")).toHaveCount(baselineCount + 1);
    await page.evaluate(() => {
      const group = document.querySelector("#settings-group-analytics");
      if (group.getAttribute("aria-expanded") !== "true") group.click();
    });
    const temporaryRow = page.getByRole("button", { name: /Focus Analytics temporary/ });

    await temporaryRow.click();
    await expect.poll(() => page.evaluate(() => state.activeId)).toBe(temporaryId);

    await temporaryRow.click({ button: "right" });
    await expect(page.locator("#contextMenu").getByText("Quick send clipboard", { exact: true })).toBeVisible();
    await expect(page.locator("#contextMenu").getByText("Move to new page", { exact: true })).toBeVisible();
    await expect(page.locator("#contextMenu").getByText("Close terminal", { exact: true })).toBeVisible();
    await page.locator("#contextMenu").getByText("Quick send clipboard", { exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__analyticsQuickSendIds)).toEqual([temporaryId]);

    await temporaryRow.click({ button: "right" });
    await page.locator("#contextMenu").getByText("Move to new page", { exact: true }).click();
    const moved = await page.evaluate((id) => {
      const terminal = state.terminals.get(id);
      return {
        createdPageId: state.pages.find((entry) => !window.__analyticsInitialPageIds.includes(entry.id))?.id,
        pageId: terminal?.pageId,
        pageCount: state.pages.length
      };
    }, temporaryId);
    expect(moved.pageCount).toBe(2);
    expect(moved.pageId).toBe(moved.createdPageId);

    await page.getByRole("button", { name: /Focus Analytics primary/ }).click();
    await temporaryRow.click({ button: "right" });
    await page.locator("#contextMenu").getByText("Close terminal", { exact: true }).click();
    await page.locator("#terminalCloseAccept").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(baselineCount);
    await page.evaluate((pageId) => {
      pasteIntoTerminal = window.__analyticsOriginalPasteIntoTerminal;
      removePage(pageId);
      delete window.__analyticsOriginalPasteIntoTerminal;
      delete window.__analyticsQuickSendIds;
      delete window.__analyticsInitialPageIds;
    }, moved.createdPageId);
  });

  test("persists aggregate and per-terminal analytics across reload", async () => {
    const before = await page.evaluate(() => {
      endTerminalAnalyticsFocus();
      saveTerminalAnalytics();
      return JSON.parse(localStorage.getItem(TERMINAL_ANALYTICS_STORAGE_KEY));
    });
    await expect.poll(() => page.evaluate(async () => (await fetch("/health")).json().then((health) => health.sessions))).toBe(2);
    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect(page.locator(".terminal-pane")).toHaveCount(2);

    const after = await page.evaluate(() => ({
      stored: JSON.parse(localStorage.getItem(TERMINAL_ANALYTICS_STORAGE_KEY)),
      todayKeys: state.analytics.todayKeystrokes,
      totalKeys: state.analytics.totalKeystrokes,
      terminalKeys: [...state.terminals.values()].map((terminal) => state.analytics.terminals[terminal.id].keystrokes)
    }));
    expect(after.totalKeys).toBe(before.totalKeystrokes);
    expect(after.todayKeys).toBe(before.todayKeystrokes);
    expect(after.terminalKeys).toEqual([3, 1]);
    expect(after.stored.totalFocusMs).toBeGreaterThan(0);
  });

  test("resets persisted and current-terminal analytics after confirmation", async () => {
    await page.locator("#settings-group-analytics").click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#analyticsReset").click();
    await expect(page.locator("#analyticsTotalKeystrokes")).toHaveText("0");
    await expect(page.locator("#analyticsTotalFocus")).toHaveText("0s");

    const result = await page.evaluate(() => ({
      records: [...state.terminals.values()].map((terminal) => state.analytics.terminals[terminal.id]),
      stored: JSON.parse(localStorage.getItem(TERMINAL_ANALYTICS_STORAGE_KEY))
    }));
    expect(result.records.every((record) => record.keystrokes === 0 && record.focusMs === 0)).toBe(true);
    expect(result.stored.totalKeystrokes).toBe(0);
    expect(result.stored.totalFocusMs).toBe(0);
  });

  test("keeps Analytics fully visible in a narrow settings panel", async () => {
    await page.setViewportSize({ width: 390, height: 720 });
    await page.evaluate(() => {
      const group = document.querySelector("#settings-group-analytics");
      if (group.getAttribute("aria-expanded") !== "true") group.click();
      group.scrollIntoView({ block: "start" });
    });
    const geometry = await page.evaluate(() => {
      const body = document.querySelector("#settings-body-analytics").getBoundingClientRect();
      const label = document.querySelector(".analytics-metric span").getBoundingClientRect();
      const row = document.querySelector(".analytics-terminal-row").getBoundingClientRect();
      const toolbar = document.querySelector(".settings-panel-toolbar").getBoundingClientRect();
      return {
        bodyLeft: body.left,
        bodyRight: body.right,
        labelTop: label.top,
        rowLeft: row.left,
        rowRight: row.right,
        toolbarBottom: toolbar.bottom,
        viewport: innerWidth
      };
    });
    expect(geometry.bodyLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.bodyRight).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.rowLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.rowRight).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.labelTop).toBeGreaterThanOrEqual(geometry.toolbarBottom);
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});
