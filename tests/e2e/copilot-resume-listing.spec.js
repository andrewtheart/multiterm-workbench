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

const CLI_SESSION = {
  id: "3818ca4d-66ba-49ef-9a68-56192d4c04ce",
  key: "cli:3818ca4d-66ba-49ef-9a68-56192d4c04ce",
  source: "cli",
  name: "Native CLI history",
  cwd: "D:\\multiTerm.worktrees\\resume-controls",
  worktreePath: "D:\\multiTerm.worktrees\\resume-controls",
  worktreeBranch: "resume-controls",
  worktreeParentBranch: "main",
  worktreeRepositoryRoot: "D:\\multiTerm.worktrees\\resume-controls",
  updatedAt: "2026-08-09T20:07:27.844Z"
};
const EDITOR_SESSION = {
  id: "62d43a25-c209-4933-af9a-24d9bff3789c",
  key: "vscode:aaaa:62d43a25-c209-4933-af9a-24d9bff3789c",
  source: "vscode",
  name: "Editor history",
  cwd: "D:\\multiTerm",
  updatedAt: "2026-08-09T19:00:00.000Z"
};
const EXTERNAL_CLI_SESSION = {
  id: "8cdab4d5-2a0c-4a61-8bc1-4dc5b3659f29",
  key: "cli:8cdab4d5-2a0c-4a61-8bc1-4dc5b3659f29",
  source: "cli",
  name: "External CLI in same folder",
  cwd: CLI_SESSION.cwd,
  repository: "multiTerm",
  updatedAt: "2026-08-08T19:00:00.000Z"
};

test.describe("Copilot resume listing", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199" });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      if (!elements.assistantRestoreOverlay.hidden) closeAssistantRestoreDialog({ forget: false });
    });
    await page.evaluate(() => closeAllTerminals());
    await expect(page.locator(".terminal-pane")).toHaveCount(0, { timeout: 30000 });
    await page.evaluate(() => addTerminal());
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await page.evaluate(() => {
      state.settings.aiSessionProvider = "copilot";
      state.aiProviders = [{
        id: "copilot",
        name: "GitHub Copilot",
        available: true,
        interactiveAvailable: true,
        titleAvailable: true,
        models: [{ id: "auto", name: "Auto", efforts: [] }]
      }];
    });
    await page.evaluate(({ id, key }) => {
      assignAssistantSessionIdentity([...state.terminals.values()][0], id, key);
    }, CLI_SESSION);
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      if (window.__originalSend) state.socket.send = window.__originalSend;
      if (window.__originalRequestBridge) requestBridge = window.__originalRequestBridge;
      delete window.__originalSend;
      delete window.__originalRequestBridge;
      closeCopilotResume();
    });
    await stopRendererCoverage(page);
    await context.close();
  });

  test("lists resumable CLI sessions before the slow editor scan finishes", async () => {
    await page.evaluate(({ cli, editor }) => {
      window.__frames = [];
      window.__releaseFull = null;
      window.__originalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        if (frame.type !== "listCopilotSessions") {
          window.__originalSend.call(this, payload);
          return;
        }
        window.__frames.push(frame);
        const reply = (sessions) => handleBridgeMessage({
          type: "copilotSessions",
          requestId: frame.requestId,
          sessions,
          message: ""
        });
        // The CLI pass answers at once; the aggregate pass is held open to stand
        // in for the cold editor-history scan that used to time the request out.
        if (frame.source === "cli") {
          const fastCli = { ...cli };
          delete fastCli.worktreePath;
          delete fastCli.worktreeBranch;
          delete fastCli.worktreeParentBranch;
          delete fastCli.worktreeRepositoryRoot;
          window.setTimeout(() => reply([fastCli]), 0);
        }
        else window.__releaseFull = () => reply([cli, editor]);
      };
      openCopilotResume([...state.terminals.values()][0]);
    }, { cli: CLI_SESSION, editor: EDITOR_SESSION });

    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    // The resumable session is on screen while the aggregate request is still open.
    await expect(page.locator(".copilot-session-card")).toHaveCount(1);
    await expect(page.locator(".copilot-session-card")).toContainText("Native CLI history");
    const worktreeActions = page.locator(".copilot-session-worktree-actions");
    await expect(worktreeActions).toHaveCount(0);
    await expect(page.locator("#copilotResumeStatus")).toContainText("Adding VS Code and Visual Studio history");
    expect(await page.evaluate(() => typeof window.__releaseFull === "function")).toBe(true);
    await page.evaluate(() => window.__releaseFull());
    await expect(page.locator(".copilot-session-card")).toHaveCount(1);
    await expect(worktreeActions.getByRole("button", { name: "Review", exact: true })).toBeVisible();
    await expect(worktreeActions.getByRole("button", { name: "Bring changes back", exact: true })).toBeVisible();

    await page.locator("#copilotResumeOriginAll").click();
    await page.locator("#copilotResumeSourceFilter").selectOption("all");
    await expect(page.locator(".copilot-session-card")).toHaveCount(2);

    await page.evaluate(() => {
      window.__originalRequestBridge = requestBridge;
      requestBridge = async (message, options) => message.type === "gitDiff"
        ? { ok: true, diff: "diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n", truncated: false }
        : window.__originalRequestBridge(message, options);
    });
    await worktreeActions.getByRole("button", { name: "Review", exact: true }).click();
    await expect(page.locator("#worktreeReviewOverlay")).toBeVisible();
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
    await page.locator("#worktreeReviewDone").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    const rowWidths = await page.locator(".copilot-session-entry").evaluateAll((entries) => entries.map((entry) => ({
      card: entry.querySelector(".copilot-session-card").getBoundingClientRect().width,
      entry: entry.getBoundingClientRect().width,
      hasActions: entry.classList.contains("has-worktree-actions")
    })));
    expect(rowWidths[0].hasActions).toBe(true);
    expect(rowWidths[0].entry - rowWidths[0].card).toBeGreaterThan(100);
    expect(rowWidths[1].hasActions).toBe(false);
    expect(Math.abs(rowWidths[1].entry - rowWidths[1].card)).toBeLessThan(1);

    await worktreeActions.getByRole("button", { name: "Bring changes back", exact: true }).click();
    await expect(page.locator("#worktreeMergeOverlay")).toBeVisible();
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
    await page.locator("#worktreeMergeCancel").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await page.evaluate(() => {
      requestBridge = window.__originalRequestBridge;
      delete window.__originalRequestBridge;
    });
    const requested = await page.evaluate(() => window.__frames.map((frame) => frame.source || "all"));
    expect(requested).toEqual(["cli", "all"]);

    await expect(page.locator(".copilot-session-card").nth(1)).toContainText("Editor history");

    await page.evaluate(() => {
      state.socket.send = window.__originalSend;
      delete window.__originalSend;
      delete window.__frames;
      delete window.__releaseFull;
      closeCopilotResume();
    });
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
  });

  test("defaults to exact MultiTerm CLI sessions and filters the loaded catalog", async () => {
    await page.evaluate(({ owned, external, editor }) => {
      window.__originalSend = state.socket.send;
      const now = Date.now();
      const sessions = [
        { ...owned, repository: "owned-project", updatedAt: new Date(now - 60 * 60 * 1000).toISOString() },
        { ...external, updatedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString() },
        { ...editor, repository: "editor-project", updatedAt: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString() }
      ];
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        if (frame.type !== "listCopilotSessions") {
          window.__originalSend.call(this, payload);
          return;
        }
        const listed = frame.source === "cli" ? sessions.filter((session) => session.source === "cli") : sessions;
        window.setTimeout(() => handleBridgeMessage({
          type: "copilotSessions",
          requestId: frame.requestId,
          sessions: listed,
          message: ""
        }), 0);
      };
      openCopilotResume([...state.terminals.values()][0]);
    }, { owned: CLI_SESSION, external: EXTERNAL_CLI_SESSION, editor: EDITOR_SESSION });

    const cards = page.locator(".copilot-session-card");
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Native CLI history");
    await expect(cards.locator(".copilot-session-origin")).toHaveText("MultiTerm");
    await expect(page.locator("#copilotResumeSourceFilter")).toHaveValue("cli");
    await expect(page.locator("#copilotResumeOriginMultiTerm")).toHaveAttribute("aria-pressed", "true");

    await page.locator("#copilotResumeOriginOther").click();
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("External CLI in same folder");
    await expect(cards.locator(".copilot-session-origin")).toHaveCount(0);

    await page.locator("#copilotResumeOriginAll").click();
    await expect(cards).toHaveCount(2);
    await page.locator("#copilotResumeSourceFilter").selectOption("all");
    await expect(cards).toHaveCount(3);

    await page.locator("#copilotResumeProjectFilter").selectOption({ label: "owned-project" });
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Native CLI history");

    await page.locator("#copilotResumeProjectFilter").selectOption("all");
    await page.locator("#copilotResumeUpdatedFilter").selectOption("day");
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Native CLI history");
    await expect(page.locator("#copilotResumeStatus")).toContainText("1 matching filters, 3 total");

    await page.evaluate(() => {
      state.socket.send = window.__originalSend;
      delete window.__originalSend;
      closeCopilotResume();
    });
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
  });

  test("says the bridge went quiet instead of claiming there are no sessions", async () => {
    await page.evaluate(() => {
      window.__originalSend = state.socket.send;
      window.__silentSessionRequests = [];
      // A throwing send makes sendBridge report failure, which is the same null
      // result requestBridge produces when a request times out.
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        if (frame.type === "listCopilotSessions") {
          window.__silentSessionRequests.push(frame.source || "all");
          throw new Error("bridge unreachable");
        }
        window.__originalSend.call(this, payload);
      };
      openCopilotResume([...state.terminals.values()][0]);
    });

    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator(".copilot-resume-empty")).toContainText("did not answer in time");
    await expect(page.locator(".copilot-resume-empty")).not.toContainText("No resumable");
    await expect(page.locator("#copilotResumeStatus")).toContainText("did not answer in time");
    await expect(page.locator("#copilotResumeRefresh")).toBeEnabled();
    expect(await page.evaluate(() => window.__silentSessionRequests)).toEqual(["cli"]);

    await page.evaluate((session) => {
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        if (frame.type !== "listCopilotSessions") {
          window.__originalSend.call(this, payload);
          return;
        }
        window.setTimeout(() => handleBridgeMessage({
          type: "copilotSessions",
          requestId: frame.requestId,
          sessions: [session],
          message: ""
        }), 0);
      };
    }, CLI_SESSION);
    await page.locator("#copilotResumeRefresh").click();
    await expect(page.locator(".copilot-session-card")).toContainText("Native CLI history");
    await expect(page.locator("#copilotResumeRefresh")).toBeEnabled();

    await page.evaluate(() => {
      state.socket.send = window.__originalSend;
      delete window.__originalSend;
      delete window.__silentSessionRequests;
      closeCopilotResume();
    });
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
  });

  test("reopens after a pending request with the configured local timeout", async () => {
    await page.evaluate((session) => {
      window.__resumeListingOriginalRequestBridge = requestBridge;
      window.__resumeListingPreviousTimeout = state.settings.copilotSessionListTimeoutSeconds;
      window.__resumeListingRequests = [];
      window.__resumeListingReply = false;
      window.__resumeListingRelease = null;
      state.settings.copilotSessionListTimeoutSeconds = 45;
      requestBridge = (message, options) => {
        if (message.type !== "listCopilotSessions") {
          return window.__resumeListingOriginalRequestBridge(message, options);
        }
        window.__resumeListingRequests.push({ source: message.source || "all", timeout: options.timeout });
        if (!window.__resumeListingReply) {
          return new Promise((resolve) => { window.__resumeListingRelease = resolve; });
        }
        return Promise.resolve({ sessions: [session], message: "" });
      };
      openCopilotResume([...state.terminals.values()][0]);
    }, CLI_SESSION);

    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator("#copilotResumeRefresh")).toBeDisabled();
    expect(await page.evaluate(() => window.__resumeListingRequests[0])).toEqual({ source: "cli", timeout: 45_000 });

    await page.evaluate(() => closeCopilotResume());
    expect(await page.evaluate(() => elements.copilotResumeRefresh.disabled)).toBe(false);
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();

    await page.evaluate(() => {
      window.__resumeListingReply = true;
      openCopilotResume([...state.terminals.values()][0]);
    });
    await expect(page.locator(".copilot-session-card")).toContainText("Native CLI history");
    await expect(page.locator("#copilotResumeRefresh")).toBeEnabled();
    expect(await page.evaluate(() => window.__resumeListingRequests.slice(0, 2))).toEqual([
      { source: "cli", timeout: 45_000 },
      { source: "cli", timeout: 45_000 }
    ]);

    await page.evaluate(() => {
      window.__resumeListingRelease?.(null);
      closeCopilotResume();
      requestBridge = window.__resumeListingOriginalRequestBridge;
      state.settings.copilotSessionListTimeoutSeconds = window.__resumeListingPreviousTimeout;
      clampCopilotSessionListTimeoutSeconds(state.settings.copilotSessionListTimeoutSeconds);
      delete window.__resumeListingOriginalRequestBridge;
      delete window.__resumeListingPreviousTimeout;
      delete window.__resumeListingRequests;
      delete window.__resumeListingReply;
      delete window.__resumeListingRelease;
    });
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
  });

  test("still reports a genuinely empty catalog as no sessions found", async () => {
    await page.evaluate(() => {
      window.__originalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        if (frame.type !== "listCopilotSessions") {
          window.__originalSend.call(this, payload);
          return;
        }
        window.setTimeout(() => handleBridgeMessage({
          type: "copilotSessions",
          requestId: frame.requestId,
          sessions: [],
          message: ""
        }), 0);
      };
      openCopilotResume([...state.terminals.values()][0]);
    });

    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator(".copilot-resume-empty")).toContainText("No resumable");
    await expect(page.locator(".copilot-resume-empty")).not.toContainText("did not answer");

    await page.evaluate(() => {
      state.socket.send = window.__originalSend;
      delete window.__originalSend;
      closeCopilotResume();
    });
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
  });

  test("selects multiple sessions, reviews editable CWDs, and opens the validated batch", async () => {
    await page.evaluate(({ first, second }) => {
      window.__multiResumeOriginalRequestBridge = requestBridge;
      window.__multiResumeOriginalResume = resumeCopilotSession;
      window.__multiResumeOpened = [];
      requestBridge = async (message, options) => {
        if (message.type === "listCopilotSessions") return { sessions: [first, second], message: "" };
        if (message.type === "validateDirectory") {
          return { type: "directoryValidation", valid: true, path: `${message.path}-validated` };
        }
        return window.__multiResumeOriginalRequestBridge(message, options);
      };
      window.__multiResumeStubbedRequestBridge = requestBridge;
      resumeCopilotSession = async (session, options) => {
        window.__multiResumeOpened.push({ key: session.key, options });
        return true;
      };
      openCopilotResume(null, { newTerminal: true });
    }, { first: CLI_SESSION, second: EXTERNAL_CLI_SESSION });

    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await page.locator("#copilotResumeOriginAll").click();
    const firstEntry = page.locator(".copilot-session-entry", { hasText: "Native CLI history" });
    const secondEntry = page.locator(".copilot-session-entry", { hasText: "External CLI in same folder" });
    const firstCard = firstEntry.locator(".copilot-session-card");
    const firstSelect = firstEntry.locator(".copilot-session-select");
    const secondSelect = secondEntry.locator(".copilot-session-select");
    // The card itself must still be the resume control, not a selection toggle.
    await expect(firstCard).toHaveAttribute("aria-label", /^Resume Native CLI history/);
    await expect(firstSelect).toHaveAttribute("aria-label", /^Select Native CLI history/);
    await firstSelect.click();
    await secondSelect.click();
    await expect(firstSelect).toHaveAttribute("aria-pressed", "true");
    await expect(secondSelect).toHaveAttribute("aria-pressed", "true");
    await expect(firstSelect).toHaveAttribute("aria-label", /^Deselect Native CLI history/);
    await expect(firstCard).toHaveClass(/is-selected/);
    await expect(page.locator("#copilotResumeSelectionCount")).toHaveText("2 sessions selected");

    // The base button rule's 38px min-height must not inflate the checkbox.
    expect(await firstSelect.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    })).toEqual({ width: 16, height: 16 });

    await page.locator("#copilotResumeSelectionReview").click();
    await expect(page.locator("#copilotResumeReview")).toBeVisible();
    await expect(page.locator("#copilotResumeList")).toBeHidden();
    await expect(page.locator(".copilot-resume-review-row")).toHaveCount(2);
    const firstCwd = page.getByLabel("Working directory for Native CLI history");
    const secondCwd = page.getByLabel("Working directory for External CLI in same folder");
    await expect(firstCwd).toHaveValue(CLI_SESSION.cwd);
    await expect(secondCwd).toHaveValue(EXTERNAL_CLI_SESSION.cwd);

    await page.setViewportSize({ width: 390, height: 844 });
    const containment = await page.locator("#copilotResumeReview").evaluate((review) => {
      const dialog = review.closest(".copilot-resume").getBoundingClientRect();
      const controls = [...review.querySelectorAll("button, input")]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        });
      return {
        clientWidth: review.clientWidth,
        controls,
        dialogLeft: dialog.left,
        dialogRight: dialog.right,
        scrollWidth: review.scrollWidth
      };
    });
    expect(containment.scrollWidth).toBeLessThanOrEqual(containment.clientWidth);
    expect(containment.controls.every((control) => (
      control.left >= containment.dialogLeft && control.right <= containment.dialogRight
    ))).toBe(true);
    await page.setViewportSize({ width: 1280, height: 720 });

    await secondCwd.fill("");
    await page.locator("#copilotResumeReviewOpen").click();
    await expect(secondCwd).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#copilotResumeReviewStatus")).toContainText("Fix the highlighted");
    expect(await page.evaluate(() => window.__multiResumeOpened)).toEqual([]);
    await expect(page.locator("#copilotResumeReviewOpen")).toBeEnabled();

    // A bridge that never answers must not be reported as a missing folder.
    await page.evaluate(() => {
      window.__multiResumeSilent = true;
      requestBridge = async (message, options) => (message.type === "validateDirectory" && window.__multiResumeSilent
        ? null
        : window.__multiResumeStubbedRequestBridge(message, options));
    });
    await secondCwd.fill("D:\\edited-session-folder");
    await page.locator("#copilotResumeReviewOpen").click();
    await expect(page.locator("#copilotResumeReviewStatus")).toContainText("bridge");
    await expect(page.locator("#copilotResumeReviewStatus")).not.toContainText("Fix the highlighted");
    expect(await page.evaluate(() => window.__multiResumeOpened)).toEqual([]);
    await page.evaluate(() => {
      window.__multiResumeSilent = false;
    });

    await page.locator("#copilotResumeReviewOpen").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
    const opened = await page.evaluate(() => window.__multiResumeOpened);
    expect(opened).toEqual([
      { key: CLI_SESSION.key, options: { batch: true, confirmedCwd: `${CLI_SESSION.cwd}-validated` } },
      { key: EXTERNAL_CLI_SESSION.key, options: { batch: true, confirmedCwd: "D:\\edited-session-folder-validated" } }
    ]);

    await page.evaluate(() => {
      requestBridge = window.__multiResumeOriginalRequestBridge;
      resumeCopilotSession = window.__multiResumeOriginalResume;
      delete window.__multiResumeOriginalRequestBridge;
      delete window.__multiResumeStubbedRequestBridge;
      delete window.__multiResumeOriginalResume;
      delete window.__multiResumeOpened;
      delete window.__multiResumeSilent;
    });
  });

  test("recovers a signed-out Copilot picker interactively and resumes it after setup", async () => {
    await page.evaluate((session) => {
      window.__signedOutOriginalProviders = state.aiProviders;
      window.__signedOutOriginalSetup = startCopilotGuidedSetup;
      window.__signedOutOriginalRequestBridge = requestBridge;
      window.__signedOutContinuation = null;
      state.aiProviders = [{
        id: "copilot",
        name: "GitHub Copilot",
        available: false,
        authenticated: false,
        cliInstalled: true,
        interactiveAvailable: false,
        interactiveStatus: "Sign in required",
        models: []
      }];
      startCopilotGuidedSetup = (options) => {
        window.__signedOutContinuation = options;
        return true;
      };
      requestBridge = async (message, options) => message.type === "listCopilotSessions"
        ? { sessions: [session], message: "" }
        : window.__signedOutOriginalRequestBridge(message, options);
      syncAiSessionControls();
      window.__signedOutToolbarDisabled = elements.copilotSessionsToggle.disabled;
      window.__signedOutInitialOpen = openCopilotResume(null, { newTerminal: true });
    }, CLI_SESSION);

    const recovery = await page.evaluate(() => ({
      disabled: window.__signedOutToolbarDisabled,
      initialOpen: window.__signedOutInitialOpen,
      origin: window.__signedOutContinuation?.origin,
      closeSetup: window.__signedOutContinuation?.closeSetup,
      hasContinuation: typeof window.__signedOutContinuation?.onReady === "function"
    }));
    expect(recovery).toEqual({
      disabled: false,
      initialOpen: true,
      origin: "the session picker",
      closeSetup: false,
      hasContinuation: true
    });
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();

    await page.evaluate(() => {
      state.aiProviders = [{
        id: "copilot",
        name: "GitHub Copilot",
        available: true,
        authenticated: true,
        cliInstalled: true,
        interactiveAvailable: true,
        titleAvailable: true,
        models: [{ id: "auto", name: "Auto", efforts: [] }]
      }];
      window.__signedOutContinuation.onReady();
    });
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator(".copilot-session-card")).toContainText("Native CLI history");

    await page.evaluate(() => {
      closeCopilotResume();
      state.aiProviders = window.__signedOutOriginalProviders;
      startCopilotGuidedSetup = window.__signedOutOriginalSetup;
      requestBridge = window.__signedOutOriginalRequestBridge;
      syncAiSessionControls();
      delete window.__signedOutOriginalProviders;
      delete window.__signedOutOriginalSetup;
      delete window.__signedOutOriginalRequestBridge;
      delete window.__signedOutContinuation;
      delete window.__signedOutToolbarDisabled;
      delete window.__signedOutInitialOpen;
    });
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
  });

  test("brings the suspended picker back when Copilot setup is abandoned", async () => {
    await page.evaluate((session) => {
      window.__abandonOriginalProviders = state.aiProviders;
      window.__abandonOriginalSetup = startCopilotGuidedSetup;
      window.__abandonOriginalRequestBridge = requestBridge;
      window.__abandonOptions = null;
      state.aiProviders = [{
        id: "copilot",
        name: "GitHub Copilot",
        available: false,
        authenticated: false,
        cliInstalled: true,
        interactiveAvailable: false,
        models: []
      }];
      startCopilotGuidedSetup = (options) => {
        window.__abandonOptions = options;
        return true;
      };
      requestBridge = async (message, options) => (message.type === "listCopilotSessions"
        ? { sessions: [session], message: "" }
        : window.__abandonOriginalRequestBridge(message, options));
      copilotResume.provider = "copilot";
      copilotResume.newTerminal = true;
      copilotResume.sessions = [session];
      copilotResume.suspended = false;
      copilotResume.view = "list";
      elements.copilotResumeOverlay.hidden = false;
      elements.copilotResumeOverlay.classList.add("is-open");
      void resumeCopilotSession(session);
    }, CLI_SESSION);

    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
    expect(await page.evaluate(() => ({
      origin: window.__abandonOptions?.origin,
      hasAbandon: typeof window.__abandonOptions?.onAbandon === "function"
    }))).toEqual({ origin: "resuming that session", hasAbandon: true });

    // Closing the setup terminal must not strand the picker off screen.
    await page.evaluate(() => window.__abandonOptions.onAbandon());
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();

    await page.evaluate(() => {
      closeCopilotResume();
      state.aiProviders = window.__abandonOriginalProviders;
      startCopilotGuidedSetup = window.__abandonOriginalSetup;
      requestBridge = window.__abandonOriginalRequestBridge;
      syncAiSessionControls();
      delete window.__abandonOriginalProviders;
      delete window.__abandonOriginalSetup;
      delete window.__abandonOriginalRequestBridge;
      delete window.__abandonOptions;
    });
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
  });

  test("handles selection cancellation, stale catalog entries, and partial batch failures", async () => {
    const result = await page.evaluate(async ({ first, second }) => {
      const original = {
        generation: copilotResume.generation,
        newTerminal: copilotResume.newTerminal,
        provider: copilotResume.provider,
        requestBridge,
        resumeCopilotSession,
        scope: copilotResume.scope,
        sessions: copilotResume.sessions,
        stateCwd: state.cwd,
        inputCwd: elements.cwdInput.value,
        view: copilotResume.view
      };
      const withNoCwd = { ...second, cwd: "", key: `${second.key}:no-cwd`, name: "Session without a folder" };
      try {
        copilotResume.newTerminal = true;
        copilotResume.provider = "copilot";
        copilotResume.scope = "local";
        copilotResume.sessions = [first, withNoCwd];
        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();

        state.cwd = "D:\\state-folder";
        elements.cwdInput.value = "D:\\input-folder";
        const cwdFallbacks = [
          copilotResumeDefaultCwd({ cwd: "D:\\session-folder" }),
          copilotResumeDefaultCwd({ cwd: "" })
        ];
        state.cwd = "";
        cwdFallbacks.push(copilotResumeDefaultCwd({ cwd: "" }));
        elements.cwdInput.value = "";
        cwdFallbacks.push(copilotResumeDefaultCwd({ cwd: "" }));

        copilotResume.newTerminal = false;
        const unavailable = toggleCopilotResumeSelection(first);
        copilotResume.newTerminal = true;
        const missingKey = toggleCopilotResumeSelection({ ...first, key: "" });
        const selected = toggleCopilotResumeSelection(first);
        const deselected = toggleCopilotResumeSelection(first);

        copilotResume.selectedKeys.add(first.key);
        copilotResume.selectedCwds.set(first.key, first.cwd);
        setCopilotResumeView("review");
        clearCopilotResumeSelection();
        const clearedView = copilotResume.view;
        setCopilotResumeView("not-a-view");
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const normalizedView = copilotResume.view;
        const emptyReview = openCopilotResumeReview();
        const wrongViewOpen = await openSelectedCopilotSessions();

        copilotResume.selectedKeys.add(first.key);
        copilotResume.selectedKeys.add(withNoCwd.key);
        copilotResume.selectedCwds.set(first.key, first.cwd);
        copilotResume.selectedCwds.set(withNoCwd.key, "D:\\chosen-folder");
        setCopilotResumeView("review");
        const noCwdLabel = elements.copilotResumeReviewList
          .querySelector(`[data-session-key="${withNoCwd.key}"] label span`)?.textContent;

        let requestCount = 0;
        requestBridge = async (message, options) => {
          if (message.type !== "validateDirectory") return original.requestBridge(message, options);
          requestCount += 1;
          return { type: "directoryValidation", valid: true, path: `${message.path}-checked` };
        };
        resumeCopilotSession = async (session) => session.key === first.key;
        const partial = await openSelectedCopilotSessions();
        const partialState = {
          partial,
          remaining: [...copilotResume.selectedKeys],
          status: elements.copilotResumeReviewStatus.textContent,
          tone: elements.copilotResumeReviewStatus.dataset.tone,
          requests: requestCount
        };

        copilotResume.provider = "claude";
        copilotResume.scope = "local";
        copilotResume.suspended = false;
        copilotResume.selectedKeys.add(first.key);
        copilotResume.selectedKeys.add("stale-session");
        copilotResume.selectedCwds.set(first.key, first.cwd);
        copilotResume.selectedCwds.set("stale-session", "D:\\stale");
        elements.copilotResumeOverlay.hidden = false;
        requestBridge = async (message, options) => message.type === "listClaudeSessions"
          ? { sessions: [first], message: "" }
          : original.requestBridge(message, options);
        await refreshCopilotSessions();
        const retainedKeys = [...copilotResume.selectedKeys];

        return {
          clearedView,
          cwdFallbacks,
          deselected,
          emptyReview,
          missingKey,
          noCwdLabel,
          normalizedView,
          partialState,
          retainedKeys,
          selected,
          unavailable,
          wrongViewOpen
        };
      } finally {
        requestBridge = original.requestBridge;
        resumeCopilotSession = original.resumeCopilotSession;
        copilotResume.generation = original.generation;
        copilotResume.newTerminal = original.newTerminal;
        copilotResume.provider = original.provider;
        copilotResume.scope = original.scope;
        copilotResume.sessions = original.sessions;
        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();
        copilotResume.view = original.view;
        copilotResume.suspended = false;
        state.cwd = original.stateCwd;
        elements.cwdInput.value = original.inputCwd;
        closeCopilotResume();
      }
    }, { first: CLI_SESSION, second: EXTERNAL_CLI_SESSION });

    expect(result).toEqual({
      clearedView: "list",
      cwdFallbacks: ["D:\\session-folder", "D:\\state-folder", "D:\\input-folder", ""],
      deselected: true,
      emptyReview: false,
      missingKey: false,
      noCwdLabel: "Working directory (session did not record one)",
      normalizedView: "list",
      partialState: {
        partial: false,
        remaining: [`${EXTERNAL_CLI_SESSION.key}:no-cwd`],
        status: "1 session could not be opened. Review and retry.",
        tone: "error",
        requests: 2
      },
      retainedKeys: [CLI_SESSION.key],
      selected: true,
      unavailable: false,
      wrongViewOpen: false
    });
  });

  test("restores suspended pickers after recovery and cancels stale batch work", async () => {
    const result = await page.evaluate(async ({ local, remote }) => {
      const original = {
        addTerminal,
        buildAiAssistantCommand,
        closeCopilotResume,
        copilotCliRecoveryNeeded,
        generation: copilotResume.generation,
        newTerminal: copilotResume.newTerminal,
        openResumeCwdChange,
        provider: copilotResume.provider,
        recoverCopilotCliForAction,
        registerCopilotLogTerminal,
        requestBridge,
        restoreCopilotResume,
        resumeCopilotSession,
        scope: copilotResume.scope,
        sessions: copilotResume.sessions,
        suspendCopilotResume,
        terminalId: copilotResume.terminalId,
        view: copilotResume.view
      };
      const recoveries = [];
      let recoveryNeeded = true;
      let restored = 0;
      let suspended = 0;
      try {
        copilotCliRecoveryNeeded = () => recoveryNeeded;
        recoverCopilotCliForAction = (onReady, options) => {
          recoveries.push({ onReady, options });
          return false;
        };
        restoreCopilotResume = () => { restored += 1; };
        suspendCopilotResume = () => { suspended += 1; };
        closeCopilotResume = () => {};
        addTerminal = () => ({ id: "recovery-terminal" });
        registerCopilotLogTerminal = () => {};
        buildAiAssistantCommand = () => "copilot";
        openResumeCwdChange = () => false;

        copilotResume.newTerminal = true;
        copilotResume.provider = "copilot";
        copilotResume.scope = "local";
        copilotResume.sessions = [local];
        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();
        copilotResume.selectedKeys.add(local.key);
        copilotResume.selectedCwds.set(local.key, local.cwd);
        copilotResume.view = "review";
        renderCopilotResumeReview();
        const selectedRecovery = await openSelectedCopilotSessions();
        const remoteRecovery = connectToRemoteCopilotSession(remote);
        const pickerRecovery = openCopilotRemotePicker();
        const resumeRecovery = await resumeCopilotSession(local);

        recoveryNeeded = false;
        copilotResume.selectedKeys.clear();
        copilotResume.newTerminal = false;
        copilotResume.terminalId = null;
        for (const recovery of recoveries) recovery.onReady();
        await new Promise((resolve) => setTimeout(resolve, 0));

        copilotResume.newTerminal = true;
        copilotResume.terminalId = null;
        copilotResume.provider = "copilot";
        copilotResume.sessions = [local];
        copilotResume.selectedKeys.add(local.key);
        copilotResume.selectedCwds.set(local.key, local.cwd);
        copilotResume.view = "review";
        renderCopilotResumeReview();
        let cancelMode = "validation";
        requestBridge = async (message, options) => {
          if (message.type !== "validateDirectory") return original.requestBridge(message, options);
          if (cancelMode === "validation") copilotResume.generation += 1;
          return { valid: true, path: message.path };
        };
        resumeCopilotSession = async () => {
          if (cancelMode === "opening") copilotResume.generation += 1;
          return true;
        };
        const cancelledValidation = await openSelectedCopilotSessions();

        copilotResume.selectedKeys.add(local.key);
        copilotResume.selectedCwds.set(local.key, local.cwd);
        copilotResume.view = "review";
        renderCopilotResumeReview();
        cancelMode = "opening";
        const cancelledOpening = await openSelectedCopilotSessions();

        resumeCopilotSession = original.resumeCopilotSession;
        copilotResume.provider = "copilot";
        copilotResume.newTerminal = true;
        buildAiAssistantCommand = () => "";
        const missingCommand = await resumeCopilotSession(local, { confirmedCwd: local.cwd });

        buildAiAssistantCommand = () => "claude";
        copilotResume.provider = "claude";
        const claudeNoFolder = await resumeCopilotSession({ ...local, source: "claude", cwd: "" }, {
          confirmedCwd: "D:\\chosen"
        });
        requestBridge = async (message, options) => message.type === "validateDirectory"
          ? { valid: false, error: "missing" }
          : original.requestBridge(message, options);
        const claudeMissingFolder = await resumeCopilotSession({ ...local, source: "claude" }, {
          confirmedCwd: "D:\\chosen"
        });

        copilotResume.provider = "copilot";
        requestBridge = async (message, options) => message.type === "prepareCopilotSessionContext"
          ? { error: "context unavailable" }
          : original.requestBridge(message, options);
        const importFailure = await resumeCopilotSession({ ...local, source: "vscode" }, {
          confirmedCwd: "D:\\chosen"
        });
        requestBridge = async (message, options) => {
          if (message.type === "prepareCopilotSessionContext") {
            copilotResume.generation += 1;
            return { contextPath: "D:\\context.md" };
          }
          return original.requestBridge(message, options);
        };
        const staleImport = await resumeCopilotSession({ ...local, source: "vscode" }, {
          confirmedCwd: "D:\\chosen"
        });

        return {
          cancelledOpening,
          cancelledValidation,
          claudeMissingFolder,
          claudeNoFolder,
          importFailure,
          missingCommand,
          origins: recoveries.map((entry) => entry.options.origin),
          pickerRecovery,
          remoteRecovery,
          restored,
          resumeRecovery,
          selectedRecovery,
          staleImport,
          suspended
        };
      } finally {
        addTerminal = original.addTerminal;
        buildAiAssistantCommand = original.buildAiAssistantCommand;
        closeCopilotResume = original.closeCopilotResume;
        copilotCliRecoveryNeeded = original.copilotCliRecoveryNeeded;
        openResumeCwdChange = original.openResumeCwdChange;
        recoverCopilotCliForAction = original.recoverCopilotCliForAction;
        registerCopilotLogTerminal = original.registerCopilotLogTerminal;
        requestBridge = original.requestBridge;
        restoreCopilotResume = original.restoreCopilotResume;
        resumeCopilotSession = original.resumeCopilotSession;
        suspendCopilotResume = original.suspendCopilotResume;
        copilotResume.generation = original.generation;
        copilotResume.newTerminal = original.newTerminal;
        copilotResume.provider = original.provider;
        copilotResume.scope = original.scope;
        copilotResume.sessions = original.sessions;
        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();
        copilotResume.terminalId = original.terminalId;
        copilotResume.view = original.view;
        original.closeCopilotResume();
      }
    }, {
      local: CLI_SESSION,
      remote: {
        id: "7f72d94a-e3c4-4e57-a8df-9f920809f9f2",
        key: "remote:7f72d94a-e3c4-4e57-a8df-9f920809f9f2",
        localId: "3818ca4d-66ba-49ef-9a68-56192d4c04ce",
        name: "Remote task",
        source: "remote",
        state: "idle",
        steerable: true
      }
    });

    expect(result).toMatchObject({
      cancelledOpening: false,
      cancelledValidation: false,
      claudeMissingFolder: false,
      claudeNoFolder: false,
      importFailure: false,
      missingCommand: false,
      origins: [
        "opening the selected sessions",
        "connecting to that remote session",
        "the remote session picker",
        "resuming that session"
      ],
      pickerRecovery: false,
      remoteRecovery: false,
      resumeRecovery: false,
      selectedRecovery: false,
      staleImport: false,
      suspended: 4
    });
    expect(result.restored).toBeGreaterThanOrEqual(8);
  });

  test("restores review focus, switches scope, and completes local and imported resumes", async () => {
    const result = await page.evaluate(async ({ local, editor }) => {
      const original = {
        buildAiAssistantCommand,
        closeCopilotResume,
        generation: copilotResume.generation,
        newTerminal: copilotResume.newTerminal,
        openCopilotSessionTerminal,
        provider: copilotResume.provider,
        refreshCopilotSessions,
        requestBridge,
        scope: copilotResume.scope,
        sessions: copilotResume.sessions,
        suspended: copilotResume.suspended,
        view: copilotResume.view
      };
      const launches = [];
      let closes = 0;
      let refreshes = 0;
      try {
        copilotResume.newTerminal = true;
        copilotResume.provider = "copilot";
        copilotResume.scope = "local";
        copilotResume.sessions = [local];
        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();
        copilotResume.selectedKeys.add(local.key);
        copilotResume.view = "review";
        renderCopilotResumeReview();
        syncCopilotResumeView();
        copilotResume.suspended = true;
        restoreCopilotResume();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const reviewFocused = document.activeElement === elements.copilotResumeReviewList.querySelector("input");
        elements.copilotResumeReviewBack.click();

        refreshCopilotSessions = () => { refreshes += 1; };
        const sameScope = setCopilotResumeScope("local");
        const changedScope = setCopilotResumeScope("remote");

        copilotResume.scope = "local";
        copilotResume.newTerminal = true;
        copilotResume.provider = "copilot";
        closeCopilotResume = () => { closes += 1; };
        buildAiAssistantCommand = (options) => `command:${options.resumeId || options.sessionId || "none"}`;
        openCopilotSessionTerminal = (...args) => {
          launches.push(args);
          return { id: `launch-${launches.length}` };
        };
        requestBridge = async (message, options) => {
          if (message.type === "validateDirectory") return { valid: true, path: message.path };
          if (message.type === "prepareCopilotSessionContext") return { contextPath: "D:\\context.md" };
          return original.requestBridge(message, options);
        };
        const localSingle = await resumeCopilotSession(local, { confirmedCwd: local.cwd });
        const localBatch = await resumeCopilotSession(local, { batch: true, confirmedCwd: local.cwd });
        const importedSingle = await resumeCopilotSession(editor, { confirmedCwd: "D:\\import" });
        const importedBatch = await resumeCopilotSession(editor, { batch: true, confirmedCwd: "D:\\import" });

        buildAiAssistantCommand = () => "";
        const noCommandBatch = await resumeCopilotSession(local, { batch: true, confirmedCwd: local.cwd });
        buildAiAssistantCommand = () => "claude";
        copilotResume.provider = "claude";
        const claudeNoFolderBatch = await resumeCopilotSession({ ...local, source: "claude", cwd: "" }, {
          batch: true,
          confirmedCwd: "D:\\chosen"
        });
        requestBridge = async (message, options) => message.type === "validateDirectory"
          ? { valid: false, error: "missing" }
          : original.requestBridge(message, options);
        const claudeMissingBatch = await resumeCopilotSession({ ...local, source: "claude" }, {
          batch: true,
          confirmedCwd: "D:\\chosen"
        });
        copilotResume.provider = "copilot";
        requestBridge = async (message, options) => message.type === "prepareCopilotSessionContext"
          ? { error: "missing context" }
          : original.requestBridge(message, options);
        const importFailureBatch = await resumeCopilotSession(editor, {
          batch: true,
          confirmedCwd: "D:\\import"
        });

        return {
          changedScope,
          claudeMissingBatch,
          claudeNoFolderBatch,
          closes,
          importFailureBatch,
          importedBatch,
          importedSingle,
          launchCount: launches.length,
          localBatch,
          localSingle,
          noCommandBatch,
          refreshes,
          reviewFocused,
          sameScope
        };
      } finally {
        buildAiAssistantCommand = original.buildAiAssistantCommand;
        closeCopilotResume = original.closeCopilotResume;
        openCopilotSessionTerminal = original.openCopilotSessionTerminal;
        refreshCopilotSessions = original.refreshCopilotSessions;
        requestBridge = original.requestBridge;
        copilotResume.generation = original.generation;
        copilotResume.newTerminal = original.newTerminal;
        copilotResume.provider = original.provider;
        copilotResume.scope = original.scope;
        copilotResume.sessions = original.sessions;
        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();
        copilotResume.suspended = original.suspended;
        copilotResume.view = original.view;
        original.closeCopilotResume();
      }
    }, { local: CLI_SESSION, editor: EDITOR_SESSION });

    expect(result).toEqual({
      changedScope: true,
      claudeMissingBatch: false,
      claudeNoFolderBatch: false,
      closes: 2,
      importFailureBatch: false,
      importedBatch: true,
      importedSingle: true,
      launchCount: 4,
      localBatch: true,
      localSingle: true,
      noCommandBatch: false,
      refreshes: 1,
      reviewFocused: true,
      sameScope: false
    });
  });

  test("handles missing review controls, all-failed batches, and accepted recovery launches", async () => {
    const result = await page.evaluate(async ({ first, second, remote }) => {
      const original = {
        closeCopilotResume,
        copilotCliRecoveryNeeded,
        generation: copilotResume.generation,
        newTerminal: copilotResume.newTerminal,
        provider: copilotResume.provider,
        recoverCopilotCliForAction,
        requestBridge,
        resumeCopilotSession,
        scope: copilotResume.scope,
        sessions: copilotResume.sessions,
        suspended: copilotResume.suspended,
        view: copilotResume.view
      };
      let closes = 0;
      const recoveries = [];
      try {
        copilotResume.newTerminal = true;
        copilotResume.provider = "copilot";
        copilotResume.scope = "local";
        copilotResume.sessions = [first, second];
        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();
        copilotResume.selectedKeys.add(first.key);
        copilotResume.selectedKeys.add(second.key);
        copilotResume.selectedCwds.set(first.key, first.cwd);
        copilotResume.selectedCwds.set(second.key, second.cwd);
        copilotResume.view = "review";
        renderCopilotResumeReview();
        elements.copilotResumeReviewList.querySelector(`[data-session-key="${second.key}"]`)?.remove();
        let validation = 0;
        requestBridge = async (message, options) => {
          if (message.type !== "validateDirectory") return original.requestBridge(message, options);
          validation += 1;
          return validation === 1 ? { valid: false, error: "invalid folder" } : null;
        };
        const invalidWithoutEveryInput = await openSelectedCopilotSessions();

        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();
        copilotResume.selectedKeys.add(first.key);
        copilotResume.selectedCwds.set(first.key, "");
        copilotResume.view = "review";
        renderCopilotResumeReview();
        elements.copilotResumeReviewList.replaceChildren();
        const emptyWithoutInput = await openSelectedCopilotSessions();

        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();
        copilotResume.selectedKeys.add(first.key);
        copilotResume.selectedCwds.set(first.key, first.cwd);
        copilotResume.view = "review";
        renderCopilotResumeReview();
        elements.copilotResumeReviewList.replaceChildren();
        requestBridge = async (message, options) => message.type === "validateDirectory"
          ? { valid: true, path: `${message.path}-without-input` }
          : original.requestBridge(message, options);
        resumeCopilotSession = async () => true;
        const validWithoutInput = await openSelectedCopilotSessions();

        closeCopilotResume = () => { closes += 1; };
        requestBridge = async (message, options) => message.type === "validateDirectory"
          ? { valid: true, path: message.path }
          : original.requestBridge(message, options);
        resumeCopilotSession = async () => true;
        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();
        copilotResume.selectedKeys.add(first.key);
        copilotResume.selectedCwds.set(first.key, first.cwd);
        copilotResume.view = "review";
        renderCopilotResumeReview();
        const singleSuccess = await openSelectedCopilotSessions();

        resumeCopilotSession = async () => false;
        copilotResume.selectedKeys.add(first.key);
        copilotResume.selectedKeys.add(second.key);
        copilotResume.selectedCwds.set(first.key, first.cwd);
        copilotResume.selectedCwds.set(second.key, second.cwd);
        copilotResume.view = "review";
        renderCopilotResumeReview();
        const allFailed = await openSelectedCopilotSessions();
        const allFailedStatus = elements.copilotResumeReviewStatus.textContent;

        copilotCliRecoveryNeeded = () => true;
        recoverCopilotCliForAction = (onReady, options) => {
          recoveries.push(options.origin);
          return true;
        };
        resumeCopilotSession = original.resumeCopilotSession;
        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();
        copilotResume.selectedKeys.add(first.key);
        copilotResume.selectedCwds.set(first.key, first.cwd);
        copilotResume.view = "review";
        renderCopilotResumeReview();
        const selectedAccepted = await openSelectedCopilotSessions();
        const remoteAccepted = connectToRemoteCopilotSession(remote);
        const pickerAccepted = openCopilotRemotePicker();

        copilotResume.suspended = true;
        copilotResume.view = "review";
        elements.copilotResumeReviewList.replaceChildren();
        restoreCopilotResume();
        await new Promise((resolve) => requestAnimationFrame(resolve));

        return {
          allFailed,
          allFailedStatus,
          closes,
          emptyWithoutInput,
          invalidWithoutEveryInput,
          pickerAccepted,
          recoveries,
          remoteAccepted,
          selectedAccepted,
          singleSuccess,
          validWithoutInput
        };
      } finally {
        closeCopilotResume = original.closeCopilotResume;
        copilotCliRecoveryNeeded = original.copilotCliRecoveryNeeded;
        recoverCopilotCliForAction = original.recoverCopilotCliForAction;
        requestBridge = original.requestBridge;
        resumeCopilotSession = original.resumeCopilotSession;
        copilotResume.generation = original.generation;
        copilotResume.newTerminal = original.newTerminal;
        copilotResume.provider = original.provider;
        copilotResume.scope = original.scope;
        copilotResume.sessions = original.sessions;
        copilotResume.selectedKeys.clear();
        copilotResume.selectedCwds.clear();
        copilotResume.suspended = original.suspended;
        copilotResume.view = original.view;
        original.closeCopilotResume();
      }
    }, {
      first: CLI_SESSION,
      second: EXTERNAL_CLI_SESSION,
      remote: {
        id: "7f72d94a-e3c4-4e57-a8df-9f920809f9f2",
        key: "remote:7f72d94a-e3c4-4e57-a8df-9f920809f9f2",
        name: "Remote task",
        source: "remote",
        state: "idle",
        steerable: true
      }
    });

    expect(result).toEqual({
      allFailed: false,
      allFailedStatus: "2 sessions could not be opened. Review and retry.",
      closes: 1,
      emptyWithoutInput: false,
      invalidWithoutEveryInput: false,
      pickerAccepted: false,
      recoveries: ["opening the selected sessions", "connecting to that remote session", "the remote session picker"],
      remoteAccepted: false,
      selectedAccepted: false,
      singleSuccess: true,
      validWithoutInput: true
    });
  });

  test("classifies recovered session identities and guards resume filters", async () => {
    const result = await page.evaluate(({ sessionId, sessionKey }) => {
      const previous = {
        aiKeys: copilotResume.aiKeys,
        filters: { ...copilotResume.filters },
        notes: state.terminalArtifacts.recoveredNotes,
        origin: copilotResume.filters.origin,
        provider: copilotResume.provider,
        scope: copilotResume.scope,
        sessions: copilotResume.sessions,
        silent: copilotResume.silent,
        terminals: state.terminalArtifacts.terminals,
        titles: state.terminalArtifacts.recoveredTitles
      };
      state.terminalArtifacts.terminals = {};
      state.terminalArtifacts.recoveredTitles = [{ assistantSessionKey: sessionKey }];
      state.terminalArtifacts.recoveredNotes = [];
      const fromRecoveredTitle = copilotSessionStartedByMultiTerm({
        id: sessionId, key: sessionKey, source: "cli"
      });

      state.terminalArtifacts.recoveredTitles = [];
      state.terminalArtifacts.recoveredNotes = [{ aiSessionId: sessionId.toUpperCase() }];
      const fromRecoveredNote = copilotSessionStartedByMultiTerm({
        id: sessionId, key: "", source: "cli"
      });
      state.terminalArtifacts.recoveredNotes = [];
      const editor = copilotSessionStartedByMultiTerm({ id: sessionId, key: sessionKey, source: "vscode" });
      const identityless = copilotSessionStartedByMultiTerm({ id: "not-an-id", key: "", source: "cli" });
      const unmatched = copilotSessionStartedByMultiTerm({ id: sessionId, key: sessionKey, source: "cli" });
      state.terminalArtifacts.recoveredTitles = null;
      state.terminalArtifacts.recoveredNotes = null;
      const missingRecoveredCollections = copilotSessionStartedByMultiTerm({
        id: sessionId, key: sessionKey, source: "cli"
      });

      copilotResume.provider = "copilot";
      copilotResume.filters.origin = "multiterm";
      setCopilotResumeOriginFilter("invalid");
      const afterInvalidOrigin = copilotResume.filters.origin;
      copilotResume.provider = "claude";
      setCopilotResumeOriginFilter("all");
      const afterUnsupportedProvider = copilotResume.filters.origin;

      copilotResume.provider = "copilot";
      copilotResume.scope = "remote";
      copilotResume.sessions = [];
      copilotResume.aiKeys = null;
      copilotResume.silent = false;
      renderCopilotSessions();
      const remoteEmpty = elements.copilotResumeList.textContent;

      copilotResume.scope = "local";
      copilotResume.sessions = [{
        id: sessionId,
        key: sessionKey,
        source: "cli",
        name: "Filtered by AI"
      }];
      copilotResume.aiKeys = new Set();
      renderCopilotSessions();
      const aiEmpty = elements.copilotResumeList.textContent;

      state.terminalArtifacts.terminals = previous.terminals;
      state.terminalArtifacts.recoveredTitles = previous.titles;
      state.terminalArtifacts.recoveredNotes = previous.notes;
      copilotResume.provider = previous.provider;
      copilotResume.scope = previous.scope;
      copilotResume.sessions = previous.sessions;
      copilotResume.aiKeys = previous.aiKeys;
      copilotResume.silent = previous.silent;
      copilotResume.filters = previous.filters;
      syncCopilotResumeScope();
      syncCopilotResumeFilters();
      renderCopilotSessions();
      return {
        aiEmpty,
        afterInvalidOrigin,
        afterUnsupportedProvider,
        editor,
        fromRecoveredNote,
        fromRecoveredTitle,
        identityless,
        missingRecoveredCollections,
        remoteEmpty,
        unmatched
      };
    }, { sessionId: CLI_SESSION.id, sessionKey: CLI_SESSION.key });

    expect(result).toEqual({
      aiEmpty: "Copilot found no sessions matching that request.",
      afterInvalidOrigin: "multiterm",
      afterUnsupportedProvider: "multiterm",
      editor: false,
      fromRecoveredNote: true,
      fromRecoveredTitle: true,
      identityless: false,
      missingRecoveredCollections: false,
      remoteEmpty: "No remote sessions were found for this account.",
      unmatched: false
    });
  });
});
