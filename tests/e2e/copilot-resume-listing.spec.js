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
  cwd: "D:\\multiTerm",
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

test.describe("Copilot resume listing", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199" });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => closeAllTerminals());
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
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      if (window.__originalSend) state.socket.send = window.__originalSend;
      delete window.__originalSend;
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
        if (frame.source === "cli") window.setTimeout(() => reply([cli]), 0);
        else window.__releaseFull = () => reply([cli, editor]);
      };
      openCopilotResume([...state.terminals.values()][0]);
    }, { cli: CLI_SESSION, editor: EDITOR_SESSION });

    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    // The resumable session is on screen while the aggregate request is still open.
    await expect(page.locator(".copilot-session-card")).toHaveCount(1);
    await expect(page.locator(".copilot-session-card")).toContainText("Native CLI history");
    await expect(page.locator("#copilotResumeStatus")).toContainText("Adding VS Code and Visual Studio history");
    expect(await page.evaluate(() => typeof window.__releaseFull === "function")).toBe(true);

    const requested = await page.evaluate(() => window.__frames.map((frame) => frame.source || "all"));
    expect(requested).toEqual(["cli", "all"]);

    await page.evaluate(() => window.__releaseFull());
    await expect(page.locator(".copilot-session-card")).toHaveCount(2);
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

  test("says the bridge went quiet instead of claiming there are no sessions", async () => {
    await page.evaluate(() => {
      window.__originalSend = state.socket.send;
      // A throwing send makes sendBridge report failure, which is the same null
      // result requestBridge produces when a request times out.
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        if (frame.type === "listCopilotSessions") throw new Error("bridge unreachable");
        window.__originalSend.call(this, payload);
      };
      openCopilotResume([...state.terminals.values()][0]);
    });

    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator(".copilot-resume-empty")).toContainText("did not answer in time");
    await expect(page.locator(".copilot-resume-empty")).not.toContainText("No resumable");
    await expect(page.locator("#copilotResumeStatus")).toContainText("did not answer in time");

    await page.evaluate(() => {
      state.socket.send = window.__originalSend;
      delete window.__originalSend;
      closeCopilotResume();
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
});
