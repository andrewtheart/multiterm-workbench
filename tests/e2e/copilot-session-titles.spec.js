const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

const SESSION_ID = "9f1d4a52-6c3b-4d21-9a77-2b8e0c5f1a34";
const OTHER_ID = "1c2b3a49-5d6e-4f80-9a1b-2c3d4e5f6a7b";
const SESSION = {
  id: SESSION_ID,
  key: `cli:${SESSION_ID}`,
  source: "cli",
  name: "Session with title history",
  cwd: "D:\\multiTerm",
  updatedAt: "2026-08-13T20:00:00.000Z"
};

test.describe("Copilot session terminal title associations", () => {
  let context;
  let page;
  let terminalId;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199", viewport: { width: 1400, height: 900 } });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    terminalId = await page.evaluate(({ session }) => {
      closeAllTerminals();
      const terminal = addTerminal({ reveal: true, runStartup: false, title: "Current linked title" });
      terminal.assistantSessionKey = session.key;
      terminal.aiSessionId = session.id;
      return terminal.id;
    }, { session: SESSION });
    await expect.poll(() => page.evaluate((id) => state.terminals.get(id)?.status, terminalId), { timeout: 30000 }).toBe("live");
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      state.titleSuggestionHistory = [];
      state.sessionManualTitleHistory = [];
      saveTitleSuggestionHistory();
      saveSessionManualTitleHistory();
      closeCopilotResume();
      closeAllTerminals();
    });
    await stopRendererCoverage(page, "copilot-session-titles");
    await context.close();
  });

  const seed = async () => {
    await page.evaluate(({ session, otherId, terminalId }) => {
      const terminal = state.terminals.get(terminalId);
      terminal.titleInput.value = "Current linked title";
      setTerminalTitleDisplay(terminal, "Current linked title");
      terminal.assistantSessionKey = session.key;
      terminal.aiSessionId = session.id;
      terminal.pid = 42424;
      const now = Date.parse("2026-08-13T20:00:00.000Z");
      state.sessionManualTitleHistory = [{
        id: "manual-1",
        assistantSessionKey: session.key,
        aiSessionId: session.id,
        terminalId,
        terminalTitle: "Manual production title",
        previousTitle: "Current linked title",
        title: "Manual production title",
        pid: 42424,
        committedAt: new Date(now - 1000).toISOString()
      }, {
        id: "legacy-manual",
        assistantSessionKey: "",
        aiSessionId: "",
        terminalId,
        terminalStartedAt: terminal.startedAt,
        terminalTitle: "Legacy exact terminal",
        previousTitle: "Older",
        title: "Legacy exact terminal",
        pid: null,
        committedAt: new Date(now - 5000).toISOString()
      }, {
        id: "other-manual",
        assistantSessionKey: `cli:${otherId}`,
        aiSessionId: otherId,
        terminalId,
        terminalTitle: "Must not leak",
        previousTitle: "No",
        title: "Must not leak",
        pid: 42424,
        committedAt: new Date(now).toISOString()
      }];
      state.titleSuggestionHistory = [{
        id: "accepted",
        assistantSessionKey: session.key,
        aiSessionId: session.id,
        terminalId,
        terminalTitle: "Current linked title",
        pid: 42424,
        suggestion: "Accepted title",
        suggestedAt: new Date(now - 4000).toISOString(),
        decidedAt: new Date(now - 3000).toISOString(),
        accepted: true,
        automatic: false
      }, {
        id: "rejected",
        assistantSessionKey: session.key,
        aiSessionId: session.id,
        terminalId,
        terminalTitle: "Current linked title",
        pid: 42424,
        suggestion: "Rejected title",
        suggestedAt: new Date(now - 3000).toISOString(),
        decidedAt: new Date(now - 2000).toISOString(),
        accepted: false,
        automatic: true
      }, {
        id: "pending",
        assistantSessionKey: session.key,
        aiSessionId: session.id,
        terminalId,
        terminalTitle: "Current linked title",
        pid: 42424,
        suggestion: "Pending title",
        suggestedAt: new Date(now - 500).toISOString(),
        decidedAt: null,
        accepted: null,
        automatic: true
      }, {
        id: "other-suggestion",
        assistantSessionKey: `cli:${otherId}`,
        aiSessionId: otherId,
        terminalId,
        terminalTitle: "Must not leak",
        pid: 42424,
        suggestion: "Other session suggestion",
        suggestedAt: new Date(now).toISOString(),
        decidedAt: null,
        accepted: null,
        automatic: false
      }];
      copilotResume.provider = "copilot";
      copilotResume.scope = "local";
      copilotResume.newTerminal = false;
      copilotResume.terminalId = terminalId;
      copilotResume.sessions = [session];
      elements.copilotResumeOverlay.hidden = false;
      elements.copilotResumeOverlay.classList.add("is-open");
      renderCopilotSessions();
    }, { session: SESSION, otherId: OTHER_ID, terminalId });
  };

  test("shows current, manual, accepted, rejected, pending, and legacy titles on hover", async () => {
    await seed();
    const card = page.locator(".copilot-session-card");
    await card.hover();
    const flyout = page.locator("#copilotSessionTitlesFlyout");
    await expect(flyout).toBeVisible();
    await expect(flyout).toContainText("Current linked title");
    await expect(flyout).toContainText("Manual production title");
    await expect(flyout).toContainText("Legacy exact terminal");
    await expect(flyout).toContainText("Accepted title");
    await expect(flyout).toContainText("Rejected title");
    await expect(flyout).toContainText("Pending title");
    await expect(flyout).toContainText("PID 42424");
    await expect(flyout).not.toContainText("Must not leak");
    await expect(flyout).not.toContainText("Other session suggestion");
    await expect(flyout.locator('[data-outcome="current"]')).toHaveCount(1);
    await expect(flyout.locator('[data-outcome="manual"]')).toHaveCount(2);
    await expect(flyout.locator('[data-outcome="accepted"]')).toHaveCount(1);
    await expect(flyout.locator('[data-outcome="rejected"]')).toHaveCount(1);
    await expect(flyout.locator('[data-outcome="pending"]')).toHaveCount(1);
  });

  test("opens on keyboard focus, closes on Escape, and fits a mobile viewport", async () => {
    await seed();
    const card = page.locator(".copilot-session-card");
    await card.focus();
    await expect(page.locator("#copilotSessionTitlesFlyout")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#copilotSessionTitlesFlyout")).toBeHidden();
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await card.focus();
    const geometry = await page.locator("#copilotSessionTitlesFlyout").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const card = document.querySelector(".copilot-session-entry").getBoundingClientRect();
      const overlap = Math.max(0, Math.min(rect.right, card.right) - Math.max(rect.left, card.left))
        * Math.max(0, Math.min(rect.bottom, card.bottom) - Math.max(rect.top, card.top));
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, overlap, scrollable: element.querySelector('[role="list"]').scrollHeight >= element.querySelector('[role="list"]').clientHeight };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(390);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(844);
    expect(geometry.overlap).toBe(0);
    await page.setViewportSize({ width: 1400, height: 900 });
  });

  test("exposes the same associations and Resume action on right-click", async () => {
    await seed();
    const card = page.locator(".copilot-session-card");
    await card.click({ button: "right" });
    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("Associated terminal titles");
    await expect(menu).toContainText("Accepted title — Accepted · Current linked title · PID 42424");
    await expect(menu).toContainText("Rejected title — Not accepted · Current linked title · PID 42424");
    await expect(menu).toContainText("Manual production title — Manual title · Manual production title · PID 42424");
    await expect(menu.getByRole("menuitem", { name: "Resume session", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toBeFocused();
  });

  test("records only user-entered titles and backfills session identity and PID", async () => {
    await page.evaluate(({ terminalId, otherId }) => {
      state.sessionManualTitleHistory = [];
      state.titleSuggestionHistory = [{
        id: "other-explicit",
        assistantSessionKey: `cli:${otherId}`,
        aiSessionId: "",
        terminalId,
        terminalTitle: "Other explicit session",
        pid: null,
        suggestion: "Do not backfill",
        suggestedAt: new Date().toISOString(),
        decidedAt: null,
        accepted: null,
        automatic: false
      }];
      const terminal = state.terminals.get(terminalId);
      terminal.assistantSessionKey = "";
      terminal.aiSessionId = "";
      terminal.pid = null;
      terminal.titleInput.value = "Before manual rename";
      setTerminalTitleDisplay(terminal, "Before manual rename");
      elements.copilotResumeOverlay.hidden = true;
      elements.copilotResumeOverlay.classList.remove("is-open");
    }, { terminalId, otherId: OTHER_ID });
    const paneTitle = page.locator(`.terminal-pane[data-id="${terminalId}"] .pane-title`);
    await paneTitle.fill("Manual UI rename");
    await paneTitle.press("Enter");
    await expect.poll(() => page.evaluate(() => state.sessionManualTitleHistory.length)).toBe(1);
    await page.evaluate(({ terminalId, sessionId }) => {
      const terminal = state.terminals.get(terminalId);
      commitTerminalTitle(terminal, "Bridge repaint", false);
      showTerminalTitleSuggestion(terminal, "Accepted AI rename", { auto: false });
      acceptTerminalTitleSuggestion(terminal);
      terminal.pid = 55555;
      terminal.assistantSessionKey = `cli:${sessionId}`;
      claimAiSessionId(terminal, sessionId);
    }, { terminalId, sessionId: SESSION_ID });
    const history = await page.evaluate(() => ({
      manual: state.sessionManualTitleHistory,
      suggestions: state.titleSuggestionHistory
    }));
    expect(history.manual).toHaveLength(1);
    expect(history.manual[0]).toMatchObject({ title: "Manual UI rename", previousTitle: "Before manual rename", assistantSessionKey: `cli:${SESSION_ID}`, aiSessionId: SESSION_ID, pid: 55555 });
    expect(history.suggestions).toHaveLength(2);
    expect(history.suggestions.find((entry) => entry.id !== "other-explicit")).toMatchObject({ suggestion: "Accepted AI rename", accepted: true, assistantSessionKey: `cli:${SESSION_ID}`, aiSessionId: SESSION_ID, pid: 55555 });
    expect(history.suggestions.find((entry) => entry.id === "other-explicit")).toMatchObject({ assistantSessionKey: `cli:${OTHER_ID}`, aiSessionId: "", pid: null });
  });

  test("persists identity and applies the visible history retention limit", async () => {
    const result = await page.evaluate(({ terminalId, sessionId }) => {
      const terminal = state.terminals.get(terminalId);
      terminal.assistantSessionKey = `cli:${sessionId}`;
      terminal.aiSessionId = sessionId;
      saveSessionSnapshot();
      state.settings.titleSuggestionHistoryLimit = 25;
      state.sessionManualTitleHistory = Array.from({ length: 30 }, (_, index) => ({
        id: `manual-${index}`,
        assistantSessionKey: `cli:${sessionId}`,
        aiSessionId: sessionId,
        terminalId,
        terminalTitle: `Title ${index}`,
        previousTitle: "",
        title: `Title ${index}`,
        pid: 55555,
        committedAt: new Date(Date.now() - index * 1000).toISOString()
      }));
      saveSessionManualTitleHistory();
      const snapshot = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]").find((entry) => entry.id === terminalId);
      return { count: state.sessionManualTitleHistory.length, snapshot };
    }, { terminalId, sessionId: SESSION_ID });
    expect(result.count).toBe(25);
    expect(result.snapshot).toMatchObject({ assistantSessionKey: `cli:${SESSION_ID}`, aiSessionId: SESSION_ID });
  });

  test("replaces stale identity, persists immediately, and ignores a reused PID from another lifecycle", async () => {
    const result = await page.evaluate(({ terminalId, sessionId, otherId }) => {
      const terminal = state.terminals.get(terminalId);
      terminal.assistantSessionKey = `cli:${otherId}`;
      terminal.aiSessionId = otherId;
      terminal.startedAt = "2026-08-13T10:00:00.000Z";
      state.titleSuggestionHistory = [{
        id: "old-lifecycle",
        assistantSessionKey: "",
        aiSessionId: "",
        terminalId: "old-terminal",
        terminalStartedAt: "2026-08-12T10:00:00.000Z",
        terminalTitle: "Old process",
        pid: 77777,
        suggestion: "Old reused PID title",
        suggestedAt: new Date().toISOString(),
        decidedAt: null,
        accepted: null,
        automatic: false
      }];
      terminal.pid = 77777;
      claimAiSessionId(terminal, sessionId);
      const snapshot = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]").find((entry) => entry.id === terminalId);
      return { snapshot, suggestion: state.titleSuggestionHistory[0] };
    }, { terminalId, sessionId: SESSION_ID, otherId: OTHER_ID });
    expect(result.snapshot).toMatchObject({ assistantSessionKey: `cli:${SESSION_ID}`, aiSessionId: SESSION_ID });
    expect(result.suggestion).toMatchObject({ assistantSessionKey: "", aiSessionId: "", pid: 77777 });
  });

  test("archives the last associated title even when the terminal has no notes", async () => {
    const archived = await page.evaluate(({ terminalId, session }) => {
      const terminal = state.terminals.get(terminalId);
      delete state.terminalArtifacts.terminals[terminalId];
      assignAssistantSessionIdentity(terminal, session.id, session.key);
      terminal.titleInput.value = "Archived without notes";
      setTerminalTitleDisplay(terminal, "Archived without notes");
      const artifact = state.terminalArtifacts.terminals[terminalId];
      artifact.notes = [];
      artifact.queue = [];
      orphanTerminalArtifacts(terminal, "test archive");
      return state.terminalArtifacts.recoveredTitles;
    }, { terminalId, session: SESSION });
    expect(archived).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Archived without notes", assistantSessionKey: SESSION.key, aiSessionId: SESSION.id })]));
  });

  test("keeps unavailable remote cards focusable for title inspection", async () => {
    await page.evaluate(({ terminalId, session }) => {
      const terminal = state.terminals.get(terminalId);
      terminal.assistantSessionKey = "remote:9f1d4a52-6c3b-4d21-9a77-2b8e0c5f1a34";
      terminal.aiSessionId = "";
      copilotResume.scope = "remote";
      copilotResume.sessions = [{ ...session, key: terminal.assistantSessionKey, source: "remote", steerable: false, state: "cancelled" }];
      elements.copilotResumeOverlay.hidden = false;
      elements.copilotResumeOverlay.classList.add("is-open");
      renderCopilotSessions();
    }, { terminalId, session: SESSION });
    const card = page.locator(".copilot-session-card");
    await expect(card).toHaveAttribute("aria-disabled", "true");
    await card.focus();
    await expect(page.locator("#copilotSessionTitlesFlyout")).toBeVisible();
    await card.press("Enter");
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
  });

  test("does not open an empty hover flyout", async () => {
    await page.evaluate(({ session }) => {
      state.sessionManualTitleHistory = [];
      state.titleSuggestionHistory = [];
      for (const terminal of state.terminals.values()) {
        terminal.assistantSessionKey = "";
        terminal.aiSessionId = "";
      }
      copilotResume.sessions = [session];
      elements.copilotResumeOverlay.hidden = false;
      elements.copilotResumeOverlay.classList.add("is-open");
      renderCopilotSessions();
    }, { session: { ...SESSION, id: OTHER_ID, key: `cli:${OTHER_ID}` } });
    await page.locator(".copilot-session-card").hover();
    await expect(page.locator("#copilotSessionTitlesFlyout")).toBeHidden();
  });
});