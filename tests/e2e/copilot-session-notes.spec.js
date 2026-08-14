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

// The Copilot CLI never reports the id of a session it starts, so MultiTerm mints
// one with --session-id and uses it to hang that terminal's notes off the resume
// card. These tests pin the exact link, the folder-matched fallback, and that the
// inline expander cannot be mistaken for "resume this session".

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

test.describe.configure({ mode: "serial" });

const LINKED = "9f1d4a52-6c3b-4d21-9a77-2b8e0c5f1a34";
const UNLINKED = "1c2b3a49-5d6e-4f80-9a1b-2c3d4e5f6a7b";

const SESSIONS = [
  { id: LINKED, key: `cli:${LINKED}`, source: "cli", name: "Direct session", cwd: "D:\\multiTerm", updatedAt: "2026-08-09T20:00:00.000Z" },
  { id: UNLINKED, key: `cli:${UNLINKED}`, source: "cli", name: "Legacy session", cwd: "D:\\legacy", updatedAt: "2026-08-09T19:00:00.000Z" }
];

test.describe("Copilot session notes", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199", viewport: { width: 1400, height: 900 } });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      state.terminalArtifacts.terminals = {};
      state.terminalArtifacts.recoveredNotes = [];
      saveTerminalArtifacts();
      closeCopilotResume();
    });
    await stopRendererCoverage(page, "copilot-session-notes");
    await context.close();
  });

  const seed = async () => {
    await page.evaluate(({ sessions, linked }) => {
      state.terminalArtifacts.terminals = {
        "term-live": {
          terminalId: "term-live",
          title: "Renamed long after the fact",
          cwd: "D:\\multiTerm",
          aiSessionId: linked,
          notes: "Live note about the linked session.",
          notesUpdatedAt: "2026-08-09T20:05:00.000Z",
          queue: []
        }
      };
      state.terminalArtifacts.recoveredNotes = [
        {
          id: "rec-1",
          title: "Ended terminal",
          cwd: "D:\\multiTerm",
          aiSessionId: linked,
          notes: "R".repeat(400),
          notesUpdatedAt: "2026-08-09T19:30:00.000Z",
          recoveredAt: "2026-08-09T19:31:00.000Z"
        },
        {
          id: "rec-2",
          title: "Legacy terminal",
          cwd: "D:\\legacy",
          aiSessionId: "",
          notes: "Folder matched note.",
          recoveredAt: "2026-08-09T18:00:00.000Z"
        }
      ];
      saveTerminalArtifacts();

      copilotResume.provider = "copilot";
      copilotResume.scope = "local";
      copilotResume.sessions = sessions;
      copilotResume.expandedNotes.clear();
      elements.copilotResumeOverlay.hidden = false;
      renderCopilotSessions();
    }, { sessions: SESSIONS, linked: LINKED });
  };

  const card = (id) => page.locator(".copilot-session-card").filter({ hasText: id === LINKED ? "Direct session" : "Legacy session" });

  test("hangs notes off the session id, not the terminal title", async () => {
    await seed();
    const notes = card(LINKED).locator(".copilot-session-notes");
    await expect(notes).toHaveCount(1);
    await expect(notes.locator(".copilot-session-note-text").first()).toHaveText("Live note about the linked session.");
    // The title was changed after the notes were written, so it must not be the key.
    await expect(notes.locator(".copilot-session-note-meta").first()).toContainText("Renamed long after the fact");
    await expect(notes.locator(".copilot-session-note-hint")).toHaveCount(0);
  });

  test("labels a folder match as the weaker claim it is", async () => {
    await seed();
    const notes = card(UNLINKED).locator(".copilot-session-notes");
    await expect(notes.locator(".copilot-session-note-text")).toHaveText("Folder matched note.");
    await expect(notes.locator(".copilot-session-note-hint")).toHaveText("Matched by folder");
  });

  test("expands the rest inline without resuming the session", async () => {
    await seed();
    const notes = card(LINKED).locator(".copilot-session-notes");
    const more = notes.locator(".copilot-session-notes-more");
    await expect(more).toBeVisible();

    const before = await page.evaluate(() => state.terminals.size);
    await more.click();

    // Expanding must not be read as "resume this session".
    expect(await page.evaluate(() => state.terminals.size)).toBe(before);
    await expect(page.locator("#copilotResumeOverlay")).toBeVisible();
    await expect(notes.locator(".copilot-session-note-text").nth(1)).toHaveText("R".repeat(400));
    await expect(notes.locator(".copilot-session-notes-more")).toHaveText("Show less");

    await notes.locator(".copilot-session-notes-more").click();
    await expect(notes.locator(".copilot-session-notes-more")).toContainText("Show");
    await expect(notes.locator(".copilot-session-note-text").nth(1)).not.toHaveText("R".repeat(400));
  });

  test("shows nothing when no note belongs to the session", async () => {
    await page.evaluate(({ sessions }) => {
      state.terminalArtifacts.terminals = {};
      state.terminalArtifacts.recoveredNotes = [];
      saveTerminalArtifacts();
      copilotResume.sessions = sessions;
      copilotResume.expandedNotes.clear();
      elements.copilotResumeOverlay.hidden = false;
      renderCopilotSessions();
    }, { sessions: SESSIONS });
    await expect(page.locator(".copilot-session-notes")).toHaveCount(0);
  });

  test("mints a session id for a fresh launch and never alongside a resume", async () => {
    const result = await page.evaluate(() => {
      const fresh = buildAiAssistantCommand({ provider: "copilot", sessionId: "9f1d4a52-6c3b-4d21-9a77-2b8e0c5f1a34" });
      const resumed = buildAiAssistantCommand({
        provider: "copilot",
        resumeId: "1c2b3a49-5d6e-4f80-9a1b-2c3d4e5f6a7b",
        sessionId: "9f1d4a52-6c3b-4d21-9a77-2b8e0c5f1a34"
      });
      const rejected = buildAiAssistantCommand({ provider: "copilot", sessionId: "not-a-uuid" });
      const claude = buildAiAssistantCommand({ provider: "claude", sessionId: "9f1d4a52-6c3b-4d21-9a77-2b8e0c5f1a34" });
      return { fresh, resumed, rejected, claude, generated: createAiSessionId() };
    });

    expect(result.fresh).toContain("--session-id=9f1d4a52-6c3b-4d21-9a77-2b8e0c5f1a34");
    // Resuming already names the session, so the two must never both appear.
    expect(result.resumed).toContain("--resume");
    expect(result.resumed).not.toContain("--session-id");
    expect(result.rejected).not.toContain("--session-id");
    expect(result.claude).not.toContain("--session-id");
    expect(result.generated).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test("adds MultiTerm-owned Copilot logs only when opted in and quotes each shell", async () => {
    const result = await page.evaluate(() => {
      const originalEnabled = state.settings.copilotLogViewerEnabled;
      const originalDirectory = state.copilotLogDirectory;
      const sessionId = "9f1d4a52-6c3b-4d21-9a77-2b8e0c5f1a34";
      state.copilotLogDirectory = "C:\\Users\\andre\\AppData\\Local\\MultiTerm\\Diagnostics\\Copilot";
      try {
        state.settings.copilotLogViewerEnabled = false;
        const disabled = buildAiAssistantCommand({ provider: "copilot", sessionId });
        state.settings.copilotLogViewerEnabled = true;
        return {
          disabled,
          powershell: buildAiAssistantCommand({ provider: "copilot", sessionId, shell: "pwsh" }),
          cmd: buildAiAssistantCommand({ provider: "copilot", sessionId, shell: "cmd" }),
          wsl: buildAiAssistantCommand({ provider: "copilot", sessionId, shell: "wsl" }),
          claude: buildAiAssistantCommand({ provider: "claude", sessionId, shell: "pwsh" }),
          picker: buildAiAssistantCommand({ provider: "copilot", connectPicker: true, shell: "pwsh" })
        };
      } finally {
        state.settings.copilotLogViewerEnabled = originalEnabled;
        state.copilotLogDirectory = originalDirectory;
      }
    });

    expect(result.disabled).not.toContain("--log-dir");
    expect(result.powershell).toContain("--log-dir 'C:\\Users\\andre\\AppData\\Local\\MultiTerm\\Diagnostics\\Copilot\\9f1d4a52-6c3b-4d21-9a77-2b8e0c5f1a34'");
    expect(result.cmd).toContain('--log-dir "C:\\Users\\andre\\AppData\\Local\\MultiTerm\\Diagnostics\\Copilot\\9f1d4a52-6c3b-4d21-9a77-2b8e0c5f1a34"');
    expect(result.wsl).toContain("--log-dir '/mnt/c/Users/andre/AppData/Local/MultiTerm/Diagnostics/Copilot/9f1d4a52-6c3b-4d21-9a77-2b8e0c5f1a34'");
    expect(result.claude).not.toContain("--log-dir");
    expect(result.picker).toContain("--connect");
  });

  test("registers the terminal before sending a Copilot launch command", async () => {
    const frames = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const original = {
        directory: state.copilotLogDirectory,
        enabled: state.settings.copilotLogViewerEnabled,
        provider: state.settings.aiSessionProvider,
        providers: state.aiProviders,
        send: state.socket.send
      };
      const sent = [];
      try {
        state.copilotLogDirectory = "C:\\Users\\andre\\AppData\\Local\\MultiTerm\\Diagnostics\\Copilot";
        state.settings.copilotLogViewerEnabled = true;
        state.settings.aiSessionProvider = "copilot";
        state.aiProviders = [{ id: "copilot", interactiveAvailable: true }];
        state.socket.send = (payload) => sent.push(JSON.parse(payload));
        invokeAiAssistant(terminal);
        return sent;
      } finally {
        state.socket.send = original.send;
        state.copilotLogDirectory = original.directory;
        state.settings.copilotLogViewerEnabled = original.enabled;
        state.settings.aiSessionProvider = original.provider;
        state.aiProviders = original.providers;
      }
    });

    expect(frames[0]).toEqual(expect.objectContaining({
      type: "copilotLogRegister",
      terminalId: expect.any(String),
      terminalTitle: expect.any(String),
      key: expect.stringMatching(/^[0-9a-f-]{36}$/i)
    }));
    expect(frames[1]).toEqual(expect.objectContaining({ type: "input", id: frames[0].terminalId }));
    expect(frames[1].data).toContain(`\\${frames[0].key}'`);
    expect(frames[1].data).toContain(`--session-id=${frames[0].key}`);
    expect(frames[2]).toEqual({ type: "input", id: frames[0].terminalId, data: "\r" });
  });

  test("covers exact, inferred, empty, and generated-id edge cases", async () => {
    const result = await page.evaluate(({ linked }) => {
      state.terminalArtifacts.terminals = {
        empty: { terminalId: "empty", title: "Empty", cwd: "D:\\multiTerm", aiSessionId: linked, notes: "   ", queue: [] },
        exact: {
          terminalId: "exact",
          title: "",
          cwd: "D:\\elsewhere",
          aiSessionId: linked.toUpperCase(),
          notes: "exact live",
          notesUpdatedAt: null,
          queue: []
        },
        inferred: {
          terminalId: "inferred",
          title: "Folder terminal",
          cwd: "D:\\multiTerm\\",
          aiSessionId: "",
          notes: "folder fallback",
          queue: []
        }
      };
      state.terminalArtifacts.recoveredNotes = [{
        id: "recovered-edge",
        title: "",
        cwd: "D:\\multiTerm",
        aiSessionId: linked,
        notes: "recovered exact",
        notesUpdatedAt: null,
        recoveredAt: "2026-08-09T18:00:00.000Z"
      }];
      state.terminalArtifacts.terminals.nullRecord = null;
      state.terminalArtifacts.terminals.missingNotes = {
        terminalId: "missing-notes", cwd: "D:\\multiTerm", aiSessionId: ""
      };

      const exact = copilotSessionNoteEntries({ id: linked, cwd: "D:\\multiTerm" });
      const inferred = copilotSessionNoteEntries({ id: "", cwd: "D:\\multiTerm" });
      const noSession = copilotSessionNoteEntries(null);
      delete state.terminalArtifacts.terminals.nullRecord;
      delete state.terminalArtifacts.terminals.missingNotes;
      const previousRandomUuid = crypto.randomUUID;
      const previousRandom = Math.random;
      Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
      Math.random = () => 0.5;
      const fallbackUuid = createAiSessionId();
      Object.defineProperty(crypto, "randomUUID", { configurable: true, value: previousRandomUuid });
      Math.random = previousRandom;

      const withoutTerminal = claimAiSessionId(null, linked);
      const terminalWithoutRecord = { id: "no-record", aiSessionId: "" };
      const generatedForTerminal = claimAiSessionId(terminalWithoutRecord, "bad");
      const terminalWithRecord = { id: "with-record", aiSessionId: "" };
      state.terminalArtifacts.terminals[terminalWithRecord.id] = {
        terminalId: terminalWithRecord.id,
        title: "Record",
        cwd: "D:\\multiTerm",
        aiSessionId: "",
        notes: "",
        queue: []
      };
      const existingForRecord = claimAiSessionId(terminalWithRecord, linked);
      return {
        exact,
        inferred,
        noSession,
        fallbackUuid,
        withoutTerminal,
        generatedForTerminal,
        generatedStored: terminalWithoutRecord.aiSessionId,
        existingForRecord,
        recordStored: state.terminalArtifacts.terminals[terminalWithRecord.id].aiSessionId
      };
    }, { linked: LINKED });

    expect(result.exact.exact).toBe(true);
    expect(result.exact.entries.map((entry) => entry.text)).toEqual(["exact live", "recovered exact"]);
    expect(result.exact.entries[0].title).toBe("Terminal");
    expect(result.exact.entries[1].live).toBe(false);
    expect(result.inferred).toMatchObject({ exact: false, entries: [{ text: "folder fallback" }] });
    expect(result.noSession).toEqual({ entries: [], exact: false });
    expect(result.fallbackUuid).toMatch(/^88888888-8888-4888-[89ab]888-888888888888$/i);
    expect(result.withoutTerminal).toBe(LINKED);
    expect(result.generatedForTerminal).toBe(result.generatedStored);
    expect(result.generatedForTerminal).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.existingForRecord).toBe(LINKED);
    expect(result.recordStored).toBe(LINKED);
  });

  test("renders singular and plural hidden-note counts", async () => {
    const result = await page.evaluate(({ linked }) => {
      const session = { id: linked, key: `cli:${linked}`, cwd: "D:\\multiTerm" };
      state.terminalArtifacts.terminals = {
        one: { terminalId: "one", aiSessionId: linked, title: "One", cwd: "D:\\multiTerm", notes: "x".repeat(300), queue: [] }
      };
      state.terminalArtifacts.recoveredNotes = [{
        id: "two", aiSessionId: linked, title: "Two", cwd: "D:\\multiTerm", notes: "second", recoveredAt: null
      }];
      copilotResume.expandedNotes.delete(session.key);
      const singular = buildCopilotSessionNotes(session);
      const singularText = singular.querySelector(".copilot-session-notes-more")?.textContent;
      state.terminalArtifacts.recoveredNotes.push({
        id: "three", aiSessionId: linked, title: "Three", cwd: "D:\\multiTerm", notes: "third", recoveredAt: null
      });
      const plural = buildCopilotSessionNotes(session);
      const pluralText = plural.querySelector(".copilot-session-notes-more")?.textContent;
      copilotResume.expandedNotes.add(session.key);
      const expanded = buildCopilotSessionNotes(session);
      return {
        singularText,
        pluralText,
        expandedText: expanded.querySelector(".copilot-session-notes-more")?.textContent,
        recoveredClasses: [...expanded.querySelectorAll(".copilot-session-note")].map((entry) => entry.className),
        noNotes: buildCopilotSessionNotes({ id: "00000000-0000-4000-8000-000000000000", key: "none", cwd: "D:\\none" })
      };
    }, { linked: LINKED });

    expect(result.singularText).toBe("Show 1 more note…");
    expect(result.pluralText).toBe("Show 2 more notes…");
    expect(result.expandedText).toBe("Show less");
    expect(result.recoveredClasses.filter((value) => value.includes("is-recovered"))).toHaveLength(2);
    expect(result.noNotes).toBeNull();
  });

  test("normalizes session ids while loading legacy and malformed artifact records", async () => {
    const result = await page.evaluate(({ linked }) => {
      const saved = localStorage.getItem(TERMINAL_ARTIFACTS_STORAGE_KEY);
      localStorage.setItem(TERMINAL_ARTIFACTS_STORAGE_KEY, JSON.stringify({
        terminals: {
          valid: {
            pid: "42",
            startedAt: 7,
            title: 8,
            shell: 9,
            cwd: 10,
            notes: 11,
            notesUpdatedAt: 12,
            aiSessionId: 7,
            queue: "not-an-array"
          },
          ignored: null
        },
        recoveredNotes: [
          { notes: "legacy", pid: "9", aiSessionId: linked },
          { id: "kept", notes: "kept", pid: 10, aiSessionId: 7 },
          { notes: 9 },
          null
        ],
        unparentedQueue: "not-an-array"
      }));
      const normalized = loadTerminalArtifacts();
      localStorage.setItem(TERMINAL_ARTIFACTS_STORAGE_KEY, "{broken");
      const broken = loadTerminalArtifacts();
      localStorage.setItem(TERMINAL_ARTIFACTS_STORAGE_KEY, "null");
      const empty = loadTerminalArtifacts();
      const metadata = terminalArtifactMetadata({
        id: "meta",
        pid: null,
        startedAt: "",
        titleInput: { value: "" },
        shell: "",
        cwd: "",
        aiSessionId: ""
      });
      if (saved == null) localStorage.removeItem(TERMINAL_ARTIFACTS_STORAGE_KEY);
      else localStorage.setItem(TERMINAL_ARTIFACTS_STORAGE_KEY, saved);
      return { normalized, broken, empty, metadata };
    }, { linked: LINKED });

    expect(result.normalized.terminals.valid).toMatchObject({
      terminalId: "valid",
      pid: 42,
      startedAt: null,
      title: "Terminal",
      shell: "",
      cwd: "",
      notes: [],
      aiSessionId: "",
      queue: []
    });
    expect(result.normalized.version).toBe(3);
    expect(result.normalized.recoveredTitles).toEqual([]);
    expect(result.normalized.recoveredNotes).toHaveLength(2);
    expect(result.normalized.recoveredNotes[0]).toMatchObject({ notes: "legacy", pid: 9, aiSessionId: LINKED });
    expect(result.normalized.recoveredNotes[0].id).toMatch(/^recovered-/);
    expect(result.normalized.recoveredNotes[1]).toMatchObject({ id: "kept", aiSessionId: "" });
    expect(result.normalized.unparentedQueue).toEqual([]);
    expect(result.broken).toEqual(result.empty);
    expect(result.metadata).toMatchObject({
      terminalId: "meta",
      pid: null,
      startedAt: null,
      title: "Terminal",
      shell: "",
      cwd: "",
      aiSessionId: ""
    });
  });
});
