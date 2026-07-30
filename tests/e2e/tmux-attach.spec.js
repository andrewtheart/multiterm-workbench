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

test.describe("WSL tmux session attachment", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199" });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });

  test.afterAll(async () => {
    await stopRendererCoverage(page, "tmux-attach");
    await context.close();
  });

  test.beforeEach(async () => {
    await page.evaluate(() => {
      closeTmuxAttach();
      window.__tmuxMessages = [];
      window.__originalSendBridge = sendBridge;
      window.__originalRequestBridge = requestBridge;
      sendBridge = (message) => { window.__tmuxMessages.push(message); return true; };
    });
  });

  test.afterEach(async () => {
    await page.evaluate(() => {
      sendBridge = window.__originalSendBridge;
      requestBridge = window.__originalRequestBridge;
      delete window.__originalSendBridge;
      delete window.__originalRequestBridge;
      delete window.__tmuxMessages;
      closeTmuxAttach();
    });
  });

  test("command palette exposes the attachment workflow and renders discovered sessions safely", async () => {
    await page.evaluate(() => {
      requestBridge = async () => ({
        type: "tmuxSessions",
        sessions: [
          { distro: "Ubuntu", session: "dev<script>", windows: 2, attached: true, panePid: 4321, command: "pwsh" },
          { distro: "Debian", session: "ops", windows: 1, attached: false, panePid: null, command: "bash" }
        ],
        message: ""
      });
      const command = getCommands().find((entry) => entry.label === "Attach WSL tmux session");
      if (command) throw new Error("unexpected escape variant");
      getCommands().find((entry) => entry.label === "Attach WSL tmux session…").run();
    });

    await expect(page.locator("#tmuxAttachOverlay")).toBeVisible();
    await expect(page.locator("#tmuxAttachStatus")).toHaveText("2 sessions across 2 WSL distributions");
    await expect(page.locator(".tmux-session-card")).toHaveCount(2);
    await expect(page.locator(".tmux-session-title").first()).toHaveText("dev<script>");
    await expect(page.locator("#tmuxAttachList script")).toHaveCount(0);
    await expect(page.locator(".tmux-session-state").first()).toHaveText("attached elsewhere");
    await expect(page.locator(".tmux-session-meta").first()).toContainText("pane PID 4321");

    await page.locator("#tmuxAttachClose").click();
    await expect(page.locator("#tmuxAttachOverlay")).toBeHidden();
    await page.locator("#attachTmux").click();
    await expect(page.locator("#tmuxAttachOverlay")).toBeVisible();
  });

  test("selecting a session creates a WSL pane with an argument-safe tmux target", async () => {
    await page.evaluate(() => {
      requestBridge = async () => ({
        sessions: [{ distro: "Ubuntu 24.04", session: "dev session", windows: 1, attached: false, panePid: 99, command: "bash" }],
        message: ""
      });
      openTmuxAttach();
    });
    await page.locator(".tmux-session-card").click();

    await expect(page.locator("#tmuxAttachOverlay")).toBeHidden();
    const attached = await page.evaluate(() => {
      const terminal = [...state.terminals.values()].find((entry) => entry.tmux?.session === "dev session");
      const create = window.__tmuxMessages.find((message) => message.type === "create" && message.id === terminal?.id);
      return {
        title: terminal?.titleInput.value,
        shell: terminal?.shell,
        tmux: terminal?.tmux,
        create,
        snapshot: JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]").find((entry) => entry.id === terminal?.id)
      };
    });
    expect(attached).toMatchObject({
      title: "dev session · Ubuntu 24.04",
      shell: "wsl",
      tmux: { distro: "Ubuntu 24.04", session: "dev session" },
      create: { type: "create", shell: "wsl", tmux: { distro: "Ubuntu 24.04", session: "dev session" } },
      snapshot: { tmux: { distro: "Ubuntu 24.04", session: "dev session" } }
    });
  });

  test("empty discovery, refresh, backdrop, Escape, and stale responses are handled", async () => {
    await page.evaluate(() => {
      requestBridge = async () => ({ sessions: [], message: "No running tmux sessions were found. Start tmux inside WSL first." });
      openTmuxAttach();
    });
    await expect(page.locator("#tmuxAttachStatus")).toContainText("Start tmux inside WSL first");
    await expect(page.locator(".tmux-attach-empty")).toHaveText("No attachable tmux sessions found.");

    await page.evaluate(() => {
      requestBridge = async () => ({ sessions: [{ distro: "Ubuntu", session: "fresh", windows: 1 }], message: "" });
    });
    await page.locator("#tmuxAttachRefresh").click();
    await expect(page.locator(".tmux-session-card")).toHaveCount(1);
    await expect(page.locator("#tmuxAttachStatus")).toHaveText("1 session across 1 WSL distribution");

    await page.locator("#tmuxAttachRefresh").press("Escape");
    await expect(page.locator("#tmuxAttachOverlay")).toBeHidden();

    await page.evaluate(() => {
      requestBridge = () => new Promise((resolve) => setTimeout(() => resolve({ sessions: [{ distro: "Ubuntu", session: "late" }] }), 75));
      openTmuxAttach();
      closeTmuxAttach();
    });
    await page.waitForTimeout(120);
    await expect(page.locator("#tmuxAttachOverlay")).toBeHidden();

    await page.evaluate(() => {
      requestBridge = async () => null;
      openTmuxAttach();
    });
    await expect(page.locator("#tmuxAttachStatus")).toContainText("did not return");
    await page.locator("#tmuxAttachOverlay").click({ position: { x: 5, y: 5 } });
    await expect(page.locator("#tmuxAttachOverlay")).toBeHidden();
  });

  test("invalid selector candidates are ignored", async () => {
    const result = await page.evaluate(() => ({
      missing: attachTmuxSession(null),
      badDistro: attachTmuxSession({ distro: 42, session: "dev" }),
      badSession: attachTmuxSession({ distro: "Ubuntu", session: null })
    }));
    expect(result).toEqual({ missing: null, badDistro: null, badSession: null });
    expect(await page.evaluate(() => window.__tmuxMessages.length)).toBe(0);
  });
});
