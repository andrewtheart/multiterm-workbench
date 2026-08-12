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

const LIVE_REMOTE_ID = "80f9b2ee-4618-4e71-b8a0-ae5fb172b62b";
const ENDED_REMOTE_ID = "fd7faf1f-6888-437a-b518-24cf12ef365e";
// Pinned so the assertions below describe the remote flags rather than whatever
// model, effort and context the profile happens to carry.
const PLAIN = { model: "", effort: "none", context: "" };

test.describe("Copilot remote control", () => {
  let context;
  let page;

  async function stubRemoteSessions(source, sessions, message = "") {
    await page.evaluate(({ source, sessions, message }) => {
      window.__remoteFrames = [];
      window.__remoteOriginalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        window.__remoteFrames.push(frame);
        if (frame.type === "listRemoteCopilotSessions") {
          window.setTimeout(() => handleBridgeMessage({
            type: "remoteCopilotSessions",
            requestId: frame.requestId,
            source,
            sessions,
            agentsPage: "https://github.com/copilot/agents",
            message
          }), 0);
        } else if (frame.type === "listCopilotSessions") {
          window.setTimeout(() => handleBridgeMessage({
            type: "copilotSessions",
            requestId: frame.requestId,
            sessions: [{
              id: "3818ca4d-66ba-49ef-9a68-56192d4c04ce",
              key: "cli:3818ca4d-66ba-49ef-9a68-56192d4c04ce",
              source: "cli",
              name: "Local history",
              cwd: "D:\\multiTerm",
              updatedAt: "2026-08-08T20:07:27.844Z"
            }],
            message: ""
          }), 0);
        } else {
          window.__remoteOriginalSend.call(this, payload);
        }
      };
    }, { source, sessions, message });
  }

  async function readFrames() {
    return page.evaluate(() => {
      if (window.__remoteOriginalSend) state.socket.send = window.__remoteOriginalSend;
      delete window.__remoteOriginalSend;
      const frames = window.__remoteFrames || [];
      delete window.__remoteFrames;
      return frames;
    });
  }

  // The panes are backed by a real shell, so the staged command is recorded and
  // stripped rather than typed into it.
  async function captureLaunches() {
    await page.evaluate(() => {
      window.__launches = [];
      window.__originalAddTerminal = addTerminal;
      window.addTerminal = function (options = {}) {
        window.__launches.push({ ...options });
        return window.__originalAddTerminal({ ...options, pendingCommand: "" });
      };
    });
  }

  async function readLaunches() {
    return page.evaluate(() => {
      if (window.__originalAddTerminal) window.addTerminal = window.__originalAddTerminal;
      delete window.__originalAddTerminal;
      const launches = window.__launches || [];
      delete window.__launches;
      return launches;
    });
  }

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
    await stopRendererCoverage(page);
    await context.close();
  });

  test("keeps remote control opt-in and off by default", async () => {
    const defaults = await page.evaluate(() => ({
      sessions: defaultSettings.copilotRemoteSessions,
      keepAlive: defaultSettings.copilotRemoteKeepAlive
    }));
    expect(defaults).toEqual({ sessions: false, keepAlive: "off" });

    const off = await page.evaluate((plain) => {
      state.settings.copilotRemoteSessions = false;
      return buildAiAssistantCommand({ provider: "copilot", ...plain });
    }, PLAIN);
    expect(off).toBe("copilot --yolo");
    expect(off).not.toContain("--no-remote");
  });

  test("adds --remote only when the setting is on, and never for Claude", async () => {
    const commands = await page.evaluate((plain) => {
      state.settings.copilotRemoteSessions = true;
      return {
        copilot: buildAiAssistantCommand({ provider: "copilot", ...plain }),
        claude: buildAiAssistantCommand({ provider: "claude", ...plain }),
        resumed: buildAiAssistantCommand({ provider: "copilot", resumeId: "3818ca4d-66ba-49ef-9a68-56192d4c04ce", ...plain })
      };
    }, PLAIN);
    expect(commands.copilot).toBe("copilot --yolo --remote");
    expect(commands.claude).toBe("claude --dangerously-skip-permissions");
    expect(commands.resumed).toBe('copilot --yolo --resume "3818ca4d-66ba-49ef-9a68-56192d4c04ce" --remote');
  });

  test("uses --connect for a remote id and never combines it with --resume", async () => {
    const commands = await page.evaluate((plain) => ({
      connect: buildAiAssistantCommand({ provider: "copilot", connectId: "80f9b2ee-4618-4e71-b8a0-ae5fb172b62b", ...plain }),
      both: buildAiAssistantCommand({
        provider: "copilot",
        connectId: "80f9b2ee-4618-4e71-b8a0-ae5fb172b62b",
        resumeId: "3818ca4d-66ba-49ef-9a68-56192d4c04ce",
        ...plain
      }),
      rejected: buildAiAssistantCommand({ provider: "copilot", connectId: "not-a-session", ...plain })
    }), PLAIN);
    expect(commands.connect).toBe("copilot --yolo --connect=80f9b2ee-4618-4e71-b8a0-ae5fb172b62b");
    expect(commands.both).not.toContain("--resume");
    expect(commands.both).toContain("--connect=80f9b2ee-4618-4e71-b8a0-ae5fb172b62b");
    expect(commands.rejected).toBe("copilot --yolo --remote");
  });

  test("clamps the keep-alive setting to values the CLI accepts", async () => {
    const values = await page.evaluate(() => [
      normalizeCopilotKeepAlive("on"),
      normalizeCopilotKeepAlive("BUSY"),
      normalizeCopilotKeepAlive("30m"),
      normalizeCopilotKeepAlive("8h"),
      normalizeCopilotKeepAlive("1d"),
      normalizeCopilotKeepAlive("45"),
      normalizeCopilotKeepAlive("forever"),
      normalizeCopilotKeepAlive(""),
      normalizeCopilotKeepAlive(null)
    ]);
    expect(values).toEqual(["on", "busy", "30m", "8h", "1d", "45", "off", "off", "off"]);
  });

  test("persists the settings controls through a reload", async () => {
    await page.evaluate(() => {
      const group = document.querySelector("#copilotRemoteSessions").closest(".control-section");
      group?.querySelector(".settings-group-toggle")?.click();
    });
    await page.locator("#copilotRemoteSessions").check();
    await page.selectOption("#copilotRemoteKeepAlive", "busy");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings")).copilotRemoteKeepAlive))
      .toBe("busy");

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    expect(await page.evaluate(() => ({
      sessions: state.settings.copilotRemoteSessions,
      keepAlive: state.settings.copilotRemoteKeepAlive,
      checked: document.querySelector("#copilotRemoteSessions").checked,
      selected: document.querySelector("#copilotRemoteKeepAlive").value
    }))).toEqual({ sessions: true, keepAlive: "busy", checked: true, selected: "busy" });

    await page.evaluate(() => {
      state.settings.copilotRemoteSessions = false;
      state.settings.copilotRemoteKeepAlive = "off";
      saveSettings();
      syncControlsFromSettings();
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
    await page.evaluate(() => closeAllTerminals());
    await page.evaluate(() => addTerminal());
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test("captures the github.com session link from the terminal and clears it on /remote off", async () => {
    const captured = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const url = `https://github.com/copilot/agents/sessions/${"80f9b2ee-4618-4e71-b8a0-ae5fb172b62b"}`;
      setTerminalRemoteSession(terminal, url);
      return { url: terminal.remoteSessionUrl, id: terminal.remoteSessionId, at: Boolean(terminal.remoteEnabledAt) };
    });
    expect(captured.url).toContain("https://github.com/copilot/");
    expect(captured.id).toBe("80f9b2ee-4618-4e71-b8a0-ae5fb172b62b");
    expect(captured.at).toBe(true);

    expect(await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      return JSON.parse(localStorage.getItem("multiterm.lastSession"))
        .some((entry) => entry.remoteSessionUrl === terminal.remoteSessionUrl);
    })).toBe(true);

    expect(await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      clearTerminalRemoteSession(terminal);
      return [terminal.remoteSessionUrl, terminal.remoteSessionId, terminal.remoteEnabledAt];
    })).toEqual(["", "", ""]);
  });

  test("refuses a link that is not a github.com Copilot session", async () => {
    expect(await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      return [
        setTerminalRemoteSession(terminal, "https://evil.example/copilot/agents/x"),
        setTerminalRemoteSession(terminal, "http://github.com/copilot/agents/x"),
        setTerminalRemoteSession(terminal, ""),
        terminal.remoteSessionUrl
      ];
    })).toEqual([false, false, false, ""]);
  });

  test("lists remote sessions in their own tab and marks the ones that cannot be steered", async () => {
    await stubRemoteSessions("api", [
      {
        id: LIVE_REMOTE_ID,
        key: `remote:${LIVE_REMOTE_ID}`,
        source: "remote",
        localId: "f8a92fba-f4eb-4558-b3e6-1fde977d0a5c",
        name: "Live remote session",
        state: "idle",
        steerable: true,
        repository: "andrewtheart/multiterm-workbench",
        cwd: "",
        branch: "",
        createdAt: "2026-08-09T02:02:31.884Z",
        updatedAt: "2026-08-09T02:03:34.282Z"
      },
      {
        id: ENDED_REMOTE_ID,
        key: `remote:${ENDED_REMOTE_ID}`,
        source: "remote",
        localId: "",
        name: "Finished remote session",
        state: "cancelled",
        steerable: false,
        repository: "",
        cwd: "",
        branch: "",
        createdAt: "2026-08-08T20:07:27.844Z",
        updatedAt: "2026-08-09T01:29:36.264Z"
      }
    ]);

    await page.locator("#copilotSessionsToggle").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator("#copilotResumeTabs")).toBeVisible();
    await expect(page.locator(".copilot-session-card")).toHaveCount(1);
    await expect(page.locator("#copilotResumeRemoteFoot")).toBeHidden();

    await page.locator("#copilotResumeTabRemote").click();
    await expect(page.locator("#copilotResumeTabRemote")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#copilotResumeRemoteFoot")).toBeVisible();
    await expect(page.locator("#copilotResumeNotice")).toBeHidden();
    await expect(page.locator(".copilot-session-card")).toHaveCount(2);
    await expect(page.locator(".copilot-session-source").first()).toHaveText("Remote");
    await expect(page.locator(".copilot-session-card").first()).toBeEnabled();
    await expect(page.locator(".copilot-session-card").nth(1)).toBeDisabled();
    await expect(page.locator(".copilot-session-card").nth(1)).toHaveAttribute("title", /has ended \(cancelled\)/);

    // A live session that is merely waiting on its user must not be called ended.
    expect(await page.evaluate(() => [
      remoteSessionBlockReason({ state: "waiting_for_user", steerable: false }),
      remoteSessionBlockReason({ state: "idle", steerable: false }),
      remoteSessionBlockReason({ state: "queued", steerable: false }),
      remoteSessionBlockReason({ state: "completed", steerable: false }),
      remoteSessionBlockReason({ state: "cancelled", steerable: true })
    ])).toEqual([
      "Remote control is not enabled for this session. Your organization policy may not allow it.",
      "Remote control is not enabled for this session. Your organization policy may not allow it.",
      "Remote control is not enabled for this session. Your organization policy may not allow it.",
      "This session has ended (completed).",
      ""
    ]);

    const frames = await readFrames();
    expect(frames.some((frame) => frame.type === "listRemoteCopilotSessions")).toBe(true);
    await page.locator("#copilotResumeClose").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
  });

  test("warns in the dialog when GitHub could not be asked and only recorded sessions are shown", async () => {
    await stubRemoteSessions("fallback", [], "GitHub did not return a remote session list: host broke.");
    await page.locator("#copilotSessionsToggle").click();
    await page.locator("#copilotResumeTabRemote").click();
    await expect(page.locator("#copilotResumeNotice")).toBeVisible();
    await expect(page.locator("#copilotResumeNotice")).toContainText("GitHub did not return a remote session list");
    await expect(page.locator(".copilot-resume-empty")).toContainText("No remote sessions were found");

    await readFrames();
    await page.locator("#copilotResumeClose").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
  });

  test("connects by pasted id and rejects anything that is not a session id", async () => {
    await stubRemoteSessions("api", []);
    await captureLaunches();
    const before = await page.locator(".terminal-pane").count();
    await page.locator("#copilotSessionsToggle").click();
    await page.locator("#copilotResumeTabRemote").click();

    await page.locator("#copilotResumeConnectId").fill("definitely not an id");
    await page.locator("#copilotResumeConnect").click();
    await expect(page.locator("#copilotResumeStatus")).toContainText("Enter a remote session id");
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator(".terminal-pane")).toHaveCount(before);

    await page.locator("#copilotResumeConnectId").fill(`https://github.com/copilot/agents/sessions/${LIVE_REMOTE_ID}`);
    await page.locator("#copilotResumeConnect").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 1);
    await expect(page.locator(".terminal-pane").last().locator(".pane-title")).toHaveValue(/^Remote /);

    const launches = await readLaunches();
    expect(launches.at(-1).pendingCommand).toContain(`--connect=${LIVE_REMOTE_ID}`);
    await readFrames();
    await page.evaluate((count) => {
      while (state.terminals.size > count) removeTerminal([...state.terminals.keys()].pop());
    }, before);
    await expect(page.locator(".terminal-pane")).toHaveCount(before);
  });

  test("hands off to the CLI's own picker when GitHub's list cannot help", async () => {
    await stubRemoteSessions("fallback", [], "GitHub did not return a remote session list: host broke.");
    await captureLaunches();
    const before = await page.locator(".terminal-pane").count();
    await page.locator("#copilotSessionsToggle").click();
    await page.locator("#copilotResumeTabRemote").click();
    await page.locator("#copilotResumePicker").click();

    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 1);
    await expect(page.locator(".terminal-pane").last().locator(".pane-title")).toHaveValue("Copilot remote picker");
    const pickerCommand = (await readLaunches()).at(-1).pendingCommand;
    expect(pickerCommand).toContain("copilot --yolo");
    expect(pickerCommand).toContain("--connect");
    expect(pickerCommand).not.toContain("--session-id");

    await readFrames();
    await page.evaluate((count) => {
      while (state.terminals.size > count) removeTerminal([...state.terminals.keys()].pop());
    }, before);
    await expect(page.locator(".terminal-pane")).toHaveCount(before);
  });

  test("hides the remote tab when the session must continue in an existing terminal", async () => {
    await stubRemoteSessions("api", []);
    await page.evaluate(() => openCopilotResume([...state.terminals.values()][0]));
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(page.locator("#copilotResumeTabs")).toBeHidden();
    expect(await page.evaluate(() => copilotResumeSupportsRemote())).toBe(false);

    await readFrames();
    await page.locator("#copilotResumeClose").click();
    await expect(page.locator("#copilotResumeOverlay")).toBeHidden();
  });

  test("offers remote control in the terminal menu only for a Copilot pane", async () => {
    const withoutCopilot = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      terminal.aiAssistantTuiProvider = "";
      return buildCopilotRemoteMenuItem(terminal).map((item) => ({
        label: item.label,
        rows: item.submenu.filter((row) => !row.separator).map((row) => ({ label: row.label, disabled: Boolean(row.disabled) }))
      }));
    });
    expect(withoutCopilot).toHaveLength(1);
    expect(withoutCopilot[0].rows.map((row) => row.label)).toEqual([
      "Enable remote control",
      "Show status and link",
      "Disable remote control",
      "Open session on GitHub",
      "Copy session link",
      "Keep awake while running",
      "Keep awake while busy",
      "Let the machine sleep"
    ]);
    expect(withoutCopilot[0].rows.every((row) => row.disabled)).toBe(true);

    const forClaude = await page.evaluate(() => {
      state.settings.aiSessionProvider = "claude";
      const rows = buildCopilotRemoteMenuItem([...state.terminals.values()][0]);
      state.settings.aiSessionProvider = "copilot";
      return rows;
    });
    expect(forClaude).toEqual([]);
  });

  test("sends bare and argument slash commands without leaking control characters", async () => {
    const sent = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      window.__slashFrames = [];
      const original = state.socket.send;
      state.socket.send = function (payload) {
        window.__slashFrames.push(JSON.parse(payload));
      };
      sendTerminalSlashDirective(terminal, "remote");
      sendTerminalSlashDirective(terminal, "keep-alive", "busy");
      sendTerminalSlashDirective(terminal, "remote", "on\rrm -rf /");
      state.socket.send = original;
      const frames = window.__slashFrames;
      delete window.__slashFrames;
      return frames.filter((frame) => frame.type === "input").map((frame) => frame.data);
    });
    expect(sent).toContain("/remote\r");
    expect(sent).toContain("/keep-alive busy\r");
    // An injected carriage return is stripped, so the text cannot run as a
    // second command; only the single trailing return submits the slash command.
    const commands = sent.filter((data) => data.startsWith("/"));
    expect(commands.at(-1)).toBe("/remote on rm -rf /\r");
    expect(commands.every((data) => data.match(/\r/g).length === 1)).toBe(true);
    expect(commands.some((data) => data.includes("\n"))).toBe(false);
    // Every slash command is preceded by the prompt clear.
    expect(sent.filter((data) => data === "\x15")).toHaveLength(commands.length);
  });
});
