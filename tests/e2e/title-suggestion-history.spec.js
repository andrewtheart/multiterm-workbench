"use strict";

const { test, expect } = require("../support/renderer-coverage");

test.describe("Title suggestion history", () => {
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

  test("recovers safely from malformed and legacy stored records", async ({ page }) => {
    await ready(page);
    const original = await page.evaluate(() => localStorage.getItem("multiterm.titleSuggestionHistory"));
    try {
      const result = await page.evaluate(() => {
        const normalized = normalizeTitleSuggestionHistory([
          null,
          "not an object",
          { id: 12, suggestion: "numeric id", terminalTitle: "lane", suggestedAt: "2026-08-11T10:00:00.000Z" },
          { id: "missing-suggestion", terminalTitle: "lane", suggestedAt: "2026-08-11T10:00:00.000Z" },
          { id: "missing-title", suggestion: "proposal", suggestedAt: "2026-08-11T10:00:00.000Z" },
          { id: "missing-time", suggestion: "proposal", terminalTitle: "lane" },
          { id: "bad-time", suggestion: "proposal", terminalTitle: "lane", suggestedAt: "never" },
          {
            id: " sanitized ",
            terminalId: 99,
            terminalTitle: "build\u0007  lane\n",
            pid: "4096",
            suggestion: "ship\u001b  release",
            suggestedAt: "2026-08-11T10:00:00.000Z",
            decidedAt: "2026-08-11T10:01:00.000Z",
            accepted: true,
            automatic: true
          },
          {
            id: "optional-fallbacks",
            terminalId: "terminal-old",
            terminalTitle: "test lane",
            pid: -1,
            suggestion: "run tests",
            suggestedAt: "2026-08-11T10:02:00.000Z",
            decidedAt: "invalid",
            accepted: "yes",
            automatic: "yes"
          },
          {
            id: "sanitized",
            terminalTitle: "duplicate",
            suggestion: "duplicate",
            suggestedAt: "2026-08-11T10:03:00.000Z"
          }
        ]);
        localStorage.setItem("multiterm.titleSuggestionHistory", "{not-json");
        return {
          nonArray: normalizeTitleSuggestionHistory("not-an-array"),
          normalized,
          malformedStorage: loadTitleSuggestionHistory()
        };
      });

      expect(result.nonArray).toEqual([]);
      expect(result.malformedStorage).toEqual([]);
      expect(result.normalized).toEqual([
        {
          id: "sanitized",
          assistantSessionKey: "",
          aiSessionId: "",
          terminalId: "",
          terminalTitle: "build lane",
          terminalStartedAt: "",
          pid: 4096,
          suggestion: "ship release",
          suggestedAt: "2026-08-11T10:00:00.000Z",
          decidedAt: "2026-08-11T10:01:00.000Z",
          accepted: true,
          automatic: true
        },
        {
          id: "optional-fallbacks",
          assistantSessionKey: "",
          aiSessionId: "",
          terminalId: "terminal-old",
          terminalTitle: "test lane",
          terminalStartedAt: "",
          pid: null,
          suggestion: "run tests",
          suggestedAt: "2026-08-11T10:02:00.000Z",
          decidedAt: null,
          accepted: null,
          automatic: false
        }
      ]);
    } finally {
      await page.evaluate((stored) => {
        if (stored == null) localStorage.removeItem("multiterm.titleSuggestionHistory");
        else localStorage.setItem("multiterm.titleSuggestionHistory", stored);
        state.titleSuggestionHistory = loadTitleSuggestionHistory();
      }, original);
    }
  });

  test("bounds retained entries and settles each suggestion once", async ({ page }) => {
    await ready(page);
    const saved = await page.evaluate(() => ({
      history: localStorage.getItem("multiterm.titleSuggestionHistory"),
      limit: state.settings.titleSuggestionHistoryLimit
    }));
    try {
      const result = await page.evaluate(() => {
        const [terminal] = [...state.terminals.values()];
        const originalTitle = terminal.titleInput.value;
        const originalPid = terminal.pid;
        state.titleSuggestionHistory = [];

        const guards = {
          noTerminal: recordTerminalTitleSuggestion(null, "orphan"),
          noTitle: null,
          noSuggestion: null,
          nullSuggestion: null
        };
        terminal.titleInput.value = "   ";
        guards.noTitle = recordTerminalTitleSuggestion(terminal, "proposal");
        terminal.titleInput.value = "retention lane";
        guards.noSuggestion = recordTerminalTitleSuggestion(terminal, "   ");
        guards.nullSuggestion = recordTerminalTitleSuggestion(terminal, null);

        terminal.pid = 0;
        const pidless = recordTerminalTitleSuggestion(terminal, "proposal without process");
        terminal.pid = 6211;
        const current = recordTerminalTitleSuggestion(terminal, "proposal to settle", { auto: true });

        terminal.titleSuggestionHistoryId = "";
        settleTerminalTitleSuggestion(terminal, true);
        terminal.titleSuggestionHistoryId = "missing-record";
        settleTerminalTitleSuggestion(terminal, true);
        const missingCleared = terminal.titleSuggestionHistoryId;
        terminal.titleSuggestionHistoryId = current.id;
        settleTerminalTitleSuggestion(terminal, false);
        const firstDecision = state.titleSuggestionHistory.find((record) => record.id === current.id).decidedAt;
        terminal.titleSuggestionHistoryId = current.id;
        settleTerminalTitleSuggestion(terminal, true);
        const settledCurrent = state.titleSuggestionHistory.find((record) => record.id === current.id);

        state.titleSuggestionHistory = Array.from({ length: 30 }, (_, index) => ({
          id: `retained-${index}`,
          terminalId: terminal.id,
          terminalTitle: "retention lane",
          pid: 6211,
          suggestion: `proposal ${index}`,
          suggestedAt: new Date(Date.UTC(2026, 7, 11, 12, index)).toISOString(),
          decidedAt: null,
          accepted: null,
          automatic: false
        }));
        state.settings.titleSuggestionHistoryLimit = 25;
        saveTitleSuggestionHistory();
        const retained = JSON.parse(localStorage.getItem("multiterm.titleSuggestionHistory"));

        state.settings.titleSuggestionHistoryLimit = "invalid";
        const fallbackLimit = titleSuggestionHistoryLimit();
        state.settings.titleSuggestionHistoryLimit = 1;
        const minimumLimit = titleSuggestionHistoryLimit();
        state.settings.titleSuggestionHistoryLimit = 99999;
        const maximumLimit = titleSuggestionHistoryLimit();

        terminal.titleInput.value = originalTitle;
        terminal.pid = originalPid;
        terminal.titleSuggestionHistoryId = "";
        return {
          guards,
          pidless: pidless.pid,
          missingCleared,
          settled: { accepted: settledCurrent.accepted, firstDecision, decidedAt: settledCurrent.decidedAt },
          retained: retained.length,
          firstRetained: retained[0].suggestion,
          fallbackLimit,
          minimumLimit,
          maximumLimit
        };
      });

      expect(result).toMatchObject({
        guards: { noTerminal: null, noTitle: null, noSuggestion: null, nullSuggestion: null },
        pidless: null,
        missingCleared: "",
        settled: { accepted: false },
        retained: 25,
        firstRetained: "proposal 0",
        fallbackLimit: 500,
        minimumLimit: 25,
        maximumLimit: 10000
      });
      expect(result.settled.decidedAt).toBe(result.settled.firstDecision);
      expect(Number.isNaN(Date.parse(result.settled.decidedAt))).toBe(false);
    } finally {
      await page.evaluate(({ history, limit }) => {
        state.settings.titleSuggestionHistoryLimit = limit;
        elements.titleSuggestionHistoryLimit.value = limit;
        if (history == null) localStorage.removeItem("multiterm.titleSuggestionHistory");
        else localStorage.setItem("multiterm.titleSuggestionHistory", history);
        state.titleSuggestionHistory = loadTitleSuggestionHistory();
        saveSettings();
      }, saved);
    }
  });

  test("finds history by terminal identity, process, and accepted title", async ({ page }) => {
    await ready(page);
    const original = await page.evaluate(() => localStorage.getItem("multiterm.titleSuggestionHistory"));
    try {
      const result = await page.evaluate(() => {
        const [terminal] = [...state.terminals.values()];
        terminal.pid = 7332;
        terminal.titleInput.value = "current lane";
        state.titleSuggestionHistory = [
          { id: "terminal-id", terminalId: terminal.id, terminalTitle: "old A", pid: 1, suggestion: "id match", suggestedAt: "2026-08-11T13:00:00.000Z", decidedAt: null, accepted: null, automatic: false },
          { id: "process-id", terminalId: "gone-B", terminalTitle: "old B", pid: 7332, suggestion: "pid match", suggestedAt: "2026-08-11T13:01:00.000Z", decidedAt: null, accepted: false, automatic: false },
          { id: "source-title", terminalId: "gone-C", terminalTitle: "current lane", pid: 3, suggestion: "title match", suggestedAt: "2026-08-11T13:02:00.000Z", decidedAt: null, accepted: false, automatic: true },
          { id: "accepted-title", terminalId: "gone-D", terminalTitle: "old D", pid: 4, suggestion: "current lane", suggestedAt: "2026-08-11T13:03:00.000Z", decidedAt: "2026-08-11T13:04:00.000Z", accepted: true, automatic: true },
          { id: "rejected-title", terminalId: "gone-E", terminalTitle: "old E", pid: 5, suggestion: "current lane", suggestedAt: "2026-08-11T13:05:00.000Z", decidedAt: "2026-08-11T13:06:00.000Z", accepted: false, automatic: false },
          { id: "unrelated", terminalId: "gone-F", terminalTitle: "other lane", pid: null, suggestion: "elsewhere", suggestedAt: "2026-08-11T13:07:00.000Z", decidedAt: null, accepted: null, automatic: false }
        ];

        const terminalMatches = titleSuggestionHistoryForTerminal(terminal).map((record) => record.id);
        state.titleSuggestionHistoryHub.scope = {
          terminalId: terminal.id,
          pid: 7332,
          title: "current lane"
        };
        const scopedMatches = scopedTitleSuggestionHistory().map((record) => record.id);
        state.titleSuggestionHistoryHub.scope = null;
        const unscoped = scopedTitleSuggestionHistory().length;

        const searches = {
          blank: titleSuggestionHistoryMatches(state.titleSuggestionHistory[0], "  "),
          suggestion: titleSuggestionHistoryMatches(state.titleSuggestionHistory[0], "id match"),
          title: titleSuggestionHistoryMatches(state.titleSuggestionHistory[2], "current lane"),
          process: titleSuggestionHistoryMatches(state.titleSuggestionHistory[1], "pid 7332"),
          rejected: titleSuggestionHistoryMatches(state.titleSuggestionHistory[1], "not accepted"),
          automatic: titleSuggestionHistoryMatches(state.titleSuggestionHistory[2], "automatic"),
          manual: titleSuggestionHistoryMatches(state.titleSuggestionHistory[0], "manual"),
          year: titleSuggestionHistoryMatches(state.titleSuggestionHistory[0], "2026"),
          absent: titleSuggestionHistoryMatches(state.titleSuggestionHistory[5], "missing phrase"),
          pidless: titleSuggestionHistoryMatches(state.titleSuggestionHistory[5], "pid")
        };

        terminal.pid = 0;
        terminal.titleInput.value = "";
        const blankIdentity = titleSuggestionHistoryForTerminal({ ...terminal, id: "none" });
        return {
          terminalMatches,
          scopedMatches,
          unscoped,
          noTerminal: titleSuggestionHistoryForTerminal(null),
          blankIdentity,
          outcomes: state.titleSuggestionHistory.slice(0, 4).map((record) => titleSuggestionOutcome(record).tone),
          unavailableTime: titleSuggestionTime({ suggestedAt: "invalid" }),
          searches
        };
      });

      expect(result).toEqual({
        terminalMatches: ["terminal-id", "process-id", "source-title", "accepted-title"],
        scopedMatches: ["terminal-id", "process-id", "source-title", "accepted-title"],
        unscoped: 6,
        noTerminal: [],
        blankIdentity: [],
        outcomes: ["pending", "rejected", "rejected", "accepted"],
        unavailableTime: "Time unavailable",
        searches: {
          blank: true,
          suggestion: true,
          title: true,
          process: true,
          rejected: true,
          automatic: true,
          manual: true,
          year: true,
          absent: false,
          pidless: false
        }
      });
    } finally {
      await page.evaluate((stored) => {
        state.titleSuggestionHistoryHub.scope = null;
        if (stored == null) localStorage.removeItem("multiterm.titleSuggestionHistory");
        else localStorage.setItem("multiterm.titleSuggestionHistory", stored);
        state.titleSuggestionHistory = loadTitleSuggestionHistory();
      }, original);
    }
  });

  test("keeps an empty history unobtrusive until requested from the keyboard", async ({ page }) => {
    await ready(page);
    const original = await page.evaluate(() => localStorage.getItem("multiterm.titleSuggestionHistory"));
    try {
      await page.evaluate(() => {
        state.titleSuggestionHistory = [];
        localStorage.removeItem("multiterm.titleSuggestionHistory");
        const [terminal] = [...state.terminals.values()];
        terminal.pid = 0;
        commitTerminalTitle(terminal, "quiet lane", false);
      });

      const title = page.locator(".terminal-pane .pane-title").first();
      const flyout = page.locator("#titleSuggestionFlyout");
      await title.click();
      await expect(flyout).toBeHidden();

      await page.evaluate(() => {
        const [terminal] = [...state.terminals.values()];
        terminal.titleReview.hidden = false;
      });
      await title.click();
      await expect(flyout).toBeHidden();
      await page.evaluate(() => {
        const [terminal] = [...state.terminals.values()];
        terminal.titleReview.hidden = true;
      });

      await title.press("ArrowDown");
      await expect(flyout).toBeVisible();
      await expect(page.locator("#titleSuggestionFlyoutEmpty")).toBeVisible();
      await expect(page.locator("#titleSuggestionFlyoutSubtitle")).toContainText("process starting");
      await expect(page.locator("#titleSuggestionFlyoutAll")).toBeFocused();
      await expect(title).toHaveAttribute("aria-expanded", "true");

      await page.keyboard.press("Escape");
      await expect(flyout).toBeHidden();
      await expect(title).toBeFocused();
      await expect(title).toHaveValue("quiet lane");
      await expect(title).toHaveAttribute("aria-expanded", "false");

      const geometry = await page.evaluate(() => {
        const [terminal] = [...state.terminals.values()];
        openTitleSuggestionFlyout(null, terminal.titleInput);
        openTitleSuggestionFlyout(terminal, null);
        terminal.titleInput.value = "";
        openTitleSuggestionFlyout(terminal, terminal.titleInput);
        const fallbackSubtitle = elements.titleSuggestionFlyoutSubtitle.textContent;
        closeTitleSuggestionFlyout();
        terminal.titleInput.value = "quiet lane";
        const anchor = document.createElement("button");
        anchor.style.position = "fixed";
        anchor.style.left = `${window.innerWidth - 2}px`;
        anchor.style.top = `${window.innerHeight - 2}px`;
        document.body.append(anchor);
        openTitleSuggestionFlyout(terminal, anchor);
        const anchorRect = anchor.getBoundingClientRect();
        const flyoutRect = elements.titleSuggestionFlyout.getBoundingClientRect();
        window.dispatchEvent(new Event("resize"));
        elements.titleSuggestionFlyout.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        anchor.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        const result = {
          above: flyoutRect.bottom <= anchorRect.top,
          rightClamped: Math.round(flyoutRect.right) <= window.innerWidth - 8,
          plainAnchorExpanded: anchor.getAttribute("aria-expanded"),
          stayedOpenForOwnControls: !elements.titleSuggestionFlyout.hidden,
          fallbackSubtitle
        };
        anchor.remove();
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        return result;
      });
      expect(geometry).toEqual({
        above: true,
        rightClamped: true,
        plainAnchorExpanded: null,
        stayedOpenForOwnControls: true,
        fallbackSubtitle: "Terminal \u00b7 process starting"
      });
      await expect(flyout).toBeHidden();
    } finally {
      await page.evaluate((stored) => {
        closeTitleSuggestionFlyout();
        if (stored == null) localStorage.removeItem("multiterm.titleSuggestionHistory");
        else localStorage.setItem("multiterm.titleSuggestionHistory", stored);
        state.titleSuggestionHistory = loadTitleSuggestionHistory();
      }, original);
    }
  });

  test("searches the complete history and returns focus after every dismissal route", async ({ page }) => {
    await ready(page);
    const original = await page.evaluate(() => localStorage.getItem("multiterm.titleSuggestionHistory"));
    try {
      await page.evaluate(() => {
        const [terminal] = [...state.terminals.values()];
        terminal.pid = 8444;
        commitTerminalTitle(terminal, "search lane", false);
        state.titleSuggestionHistory = [
          { id: "search-accepted", terminalId: terminal.id, terminalTitle: "search lane", pid: 8444, suggestion: "publish release", suggestedAt: "2026-08-11T14:00:00.000Z", decidedAt: "2026-08-11T14:01:00.000Z", accepted: true, automatic: false },
          { id: "search-pending", terminalId: "gone", terminalTitle: "test lane", pid: null, suggestion: "run integration tests", suggestedAt: "2026-08-10T09:00:00.000Z", decidedAt: null, accepted: null, automatic: true }
        ];
        saveTitleSuggestionHistory();
      });

      const title = page.locator(".terminal-pane .pane-title").first();
      await title.focus();
      await page.evaluate(() => openTitleSuggestionHistory());
      const overlay = page.locator("#titleSuggestionHistoryOverlay");
      const rows = overlay.locator(".title-suggestion-history-row");
      await expect(overlay).toBeVisible();
      await expect(rows).toHaveCount(2);
      await expect(page.locator("#titleSuggestionHistorySummary")).toHaveText("2 suggestions");

      const filter = page.locator("#titleSuggestionHistoryFilter");
      for (const query of ["publish release", "search lane", "accepted", "manual"]) {
        await filter.fill(query);
        await expect(rows).toHaveCount(1);
      }
      await filter.fill("2026");
      await expect(rows).toHaveCount(2);
      await filter.fill("no such suggestion");
      await expect(rows).toHaveCount(0);
      await expect(page.locator("#titleSuggestionHistoryEmpty")).toBeVisible();
      await expect(page.locator("#titleSuggestionHistorySummary")).toHaveText("0 suggestions");

      await filter.fill("run integration tests");
      await expect(page.locator("#titleSuggestionHistorySummary")).toHaveText("1 suggestion");
      await overlay.dispatchEvent("keydown", { key: "x" });
      await expect(overlay).toBeVisible();
      await overlay.dispatchEvent("keydown", { key: "Escape" });
      await expect(overlay).toBeHidden();
      await expect(title).toBeFocused();

      await page.evaluate(() => openTitleSuggestionHistory([...state.terminals.values()][0]));
      await expect(overlay).toBeVisible();
      await page.evaluate(() => refreshTitleSuggestionHistoryViews());
      await overlay.click({ position: { x: 2, y: 2 } });
      await expect(overlay).toBeHidden();
      expect(await page.evaluate(() => state.titleSuggestionHistoryHub.scope)).toBeNull();

      const focusFallbacks = await page.evaluate(async () => {
        const [terminal] = [...state.terminals.values()];
        const svg = document.querySelector("svg").cloneNode(false);
        svg.setAttribute("tabindex", "-1");
        document.body.append(svg);
        svg.focus();
        terminal.pid = 0;
        terminal.titleInput.value = "";
        openTitleSuggestionHistory(terminal);
        const nonHtmlReturnFocus = state.titleSuggestionHistoryHub.returnFocus;
        const fallbackSubtitle = elements.titleSuggestionHistorySubtitle.textContent;
        closeTitleSuggestionHistory();
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        svg.remove();

        const button = document.createElement("button");
        document.body.append(button);
        button.focus();
        openTitleSuggestionHistory();
        button.remove();
        closeTitleSuggestionHistory();
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        refreshTitleSuggestionHistoryViews();
        return {
          nonHtmlReturnFocus,
          fallbackSubtitle,
          detachedCloseHidden: elements.titleSuggestionHistoryOverlay.hidden
        };
      });
      expect(focusFallbacks).toEqual({
        nonHtmlReturnFocus: null,
        fallbackSubtitle: "Terminal \u00b7 process starting",
        detachedCloseHidden: true
      });
    } finally {
      await page.evaluate((stored) => {
        closeTitleSuggestionHistory();
        if (stored == null) localStorage.removeItem("multiterm.titleSuggestionHistory");
        else localStorage.setItem("multiterm.titleSuggestionHistory", stored);
        state.titleSuggestionHistory = loadTitleSuggestionHistory();
      }, original);
    }
  });

  test("accepts a pending suggestion from history without creating a duplicate", async ({ page }) => {
    await ready(page);
    const original = await page.evaluate(() => localStorage.getItem("multiterm.titleSuggestionHistory"));
    try {
      await page.evaluate(() => {
        state.titleSuggestionHistory = [];
        localStorage.removeItem("multiterm.titleSuggestionHistory");
        const [terminal] = [...state.terminals.values()];
        commitTerminalTitle(terminal, "approval lane", false);
        showTerminalTitleSuggestion(terminal, "approved from history");
        openTitleSuggestionFlyout(terminal, terminal.titleInput);
      });

      const flyout = page.locator("#titleSuggestionFlyout");
      await expect(flyout).toBeVisible();
      await flyout.locator(".title-suggestion-flyout-option").click();
      await expect(flyout).toBeHidden();

      const result = await page.evaluate(() => {
        const [terminal] = [...state.terminals.values()];
        return {
          title: terminal.titleInput.value,
          reviewHidden: terminal.titleReview.hidden,
          records: state.titleSuggestionHistory.map((record) => ({
            accepted: record.accepted,
            suggestion: record.suggestion,
            decided: Boolean(record.decidedAt)
          }))
        };
      });
      expect(result).toEqual({
        title: "approved from history",
        reviewHidden: true,
        records: [{ accepted: true, suggestion: "approved from history", decided: true }]
      });
    } finally {
      await page.evaluate((stored) => {
        if (stored == null) localStorage.removeItem("multiterm.titleSuggestionHistory");
        else localStorage.setItem("multiterm.titleSuggestionHistory", stored);
        state.titleSuggestionHistory = loadTitleSuggestionHistory();
      }, original);
    }
  });

  test("ignores stale choices and keeps every history menu action safe", async ({ page }) => {
    await ready(page);
    const original = await page.evaluate(() => localStorage.getItem("multiterm.titleSuggestionHistory"));
    try {
      const result = await page.evaluate(() => {
        const [terminal] = [...state.terminals.values()];
        terminal.pid = 9555;
        commitTerminalTitle(terminal, "menu lane", false);
        state.titleSuggestionHistory = [
          { id: "menu-accepted", terminalId: terminal.id, terminalTitle: "menu lane", pid: 9555, suggestion: "accepted menu choice", suggestedAt: "2026-08-11T15:00:00.000Z", decidedAt: "2026-08-11T15:01:00.000Z", accepted: true, automatic: false },
          { id: "menu-rejected", terminalId: terminal.id, terminalTitle: "menu lane", pid: null, suggestion: "rejected menu choice", suggestedAt: "2026-08-11T15:02:00.000Z", decidedAt: "2026-08-11T15:03:00.000Z", accepted: false, automatic: true },
          { id: "menu-pending", terminalId: terminal.id, terminalTitle: "menu lane", pid: 9555, suggestion: "pending menu choice", suggestedAt: "2026-08-11T15:04:00.000Z", decidedAt: null, accepted: null, automatic: false }
        ];

        applyTitleSuggestionHistoryRecord(null, state.titleSuggestionHistory[0]);
        applyTitleSuggestionHistoryRecord(terminal, null);
        applyTitleSuggestionHistoryRecord({ ...terminal, id: "closed-terminal" }, state.titleSuggestionHistory[0]);

        const menuItems = titleSuggestionHistoryMenuItems(terminal);
        const menuDetails = menuItems.slice(0, 3).map((item) => ({ icon: item.icon, title: item.title }));
        menuItems[1].run();
        const titleAfterMenuRun = terminal.titleInput.value;

        terminal.titleInput.value = "";
        const untitledOption = titleSuggestionHistoryOption(state.titleSuggestionHistory[0], terminal, { compact: true });
        const untitledHint = untitledOption.title;
        terminal.titleInput.value = "menu lane";

        titleSuggestionFlyoutId = "closed-terminal";
        renderTitleSuggestionFlyout();
        const missingTerminalClosed = elements.titleSuggestionFlyout.hidden;
        elements.titleSuggestionFlyoutAll.click();
        const missingTerminalDidNotOpenHistory = elements.titleSuggestionHistoryOverlay.hidden;

        titleSuggestionFlyoutId = terminal.id;
        elements.titleSuggestionFlyoutAll.click();
        const liveTerminalOpenedHistory = !elements.titleSuggestionHistoryOverlay.hidden;
        closeTitleSuggestionHistory();

        const historyCommand = getCommands().find((command) => command.label === "Title suggestion history\u2026");
        historyCommand.run();
        const commandOpenedHistory = !elements.titleSuggestionHistoryOverlay.hidden;
        closeTitleSuggestionHistory();

        state.titleSuggestionHistory = [];
        const emptyMenu = titleSuggestionHistoryMenuItems(terminal);
        return {
          menuDetails,
          titleAfterMenuRun,
          untitledHint,
          missingTerminalClosed,
          missingTerminalDidNotOpenHistory,
          liveTerminalOpenedHistory,
          commandOpenedHistory,
          emptyInfo: emptyMenu[0],
          emptyViewAllLabel: emptyMenu.at(-1).label
        };
      });

      expect(result.menuDetails).toEqual([
        { icon: "check", title: expect.stringContaining("PID 9555") },
        { icon: "x", title: expect.not.stringContaining("PID") },
        { icon: "clock-3", title: expect.stringContaining("PID 9555") }
      ]);
      expect(result).toMatchObject({
        titleAfterMenuRun: "rejected menu choice",
        untitledHint: 'Use "accepted menu choice" for this terminal',
        missingTerminalClosed: true,
        missingTerminalDidNotOpenHistory: true,
        liveTerminalOpenedHistory: true,
        commandOpenedHistory: true,
        emptyInfo: { info: true, icon: "history", label: "No suggestions for this title or PID" },
        emptyViewAllLabel: "View all history\u2026"
      });
    } finally {
      await page.evaluate((stored) => {
        closeTitleSuggestionFlyout();
        closeTitleSuggestionHistory();
        if (stored == null) localStorage.removeItem("multiterm.titleSuggestionHistory");
        else localStorage.setItem("multiterm.titleSuggestionHistory", stored);
        state.titleSuggestionHistory = loadTitleSuggestionHistory();
      }, original);
    }
  });

  test("keeps title, notes, notification, and header-background flyouts mutually exclusive", async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      state.titleSuggestionHistory = [];
      const anchors = {
        notes: document.createElement("button"),
        notifications: document.createElement("button"),
        background: document.createElement("button")
      };
      for (const anchor of Object.values(anchors)) {
        anchor.setAttribute("aria-haspopup", "dialog");
        anchor.setAttribute("aria-expanded", "false");
        document.body.append(anchor);
      }
      const states = [];
      const snapshot = (name) => states.push({
        name,
        title: !elements.titleSuggestionFlyout.hidden,
        notes: !elements.terminalNotesFlyout.hidden,
        notifications: !elements.terminalNotificationFlyout.hidden,
        background: !elements.headerBackgroundFlyout.hidden
      });

      openTitleSuggestionFlyout(terminal, terminal.titleInput);
      openTerminalNotesFlyout(terminal, anchors.notes);
      snapshot("notes-after-title");
      openTitleSuggestionFlyout(terminal, terminal.titleInput);
      snapshot("title-after-notes");

      openTerminalNotificationFlyout(terminal, anchors.notifications);
      snapshot("notifications-after-title");
      openTitleSuggestionFlyout(terminal, terminal.titleInput);
      snapshot("title-after-notifications");

      openHeaderBackgroundFlyout(terminal, anchors.background);
      snapshot("background-after-title");
      openTitleSuggestionFlyout(terminal, terminal.titleInput);
      snapshot("title-after-background");

      closeTitleSuggestionFlyout();
      closeTerminalNotesFlyout();
      closeTerminalNotificationFlyout();
      closeHeaderBackgroundFlyout();
      for (const anchor of Object.values(anchors)) anchor.remove();
      return states;
    });

    expect(result).toEqual([
      { name: "notes-after-title", title: false, notes: true, notifications: false, background: false },
      { name: "title-after-notes", title: true, notes: false, notifications: false, background: false },
      { name: "notifications-after-title", title: false, notes: false, notifications: true, background: false },
      { name: "title-after-notifications", title: true, notes: false, notifications: false, background: false },
      { name: "background-after-title", title: false, notes: false, notifications: false, background: true },
      { name: "title-after-background", title: true, notes: false, notifications: false, background: false }
    ]);
  });
});