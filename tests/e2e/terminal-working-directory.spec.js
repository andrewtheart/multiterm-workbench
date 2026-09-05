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

test.describe("terminal working-directory tracking", () => {
  let context;
  let page;
  let savedShellIntegration;

  const activeTerminalCwd = () => page.evaluate(() => state.terminals.get(state.activeId).cwd);

  // The shell reports its directory through an escape sequence, so writing one
  // into the pane is the same path a real prompt takes.
  const report = (sequence) => page.evaluate((data) => {
    const terminal = state.terminals.get(state.activeId);
    terminal.term.write(data);
    return new Promise((resolve) => window.setTimeout(resolve, 150));
  }, sequence);

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199" });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    savedShellIntegration = await page.evaluate(() => state.settings.shellIntegration);
    await page.evaluate(() => closeAllTerminals());
    await page.evaluate(() => addTerminal({ runStartup: false }));
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test.afterAll(async () => {
    // Settings persist into every later spec file on this shared origin.
    await page.evaluate((restore) => {
      state.settings.shellIntegration = restore;
      saveSettings();
      closeAllTerminals();
    }, savedShellIntegration);
    await stopRendererCoverage(page);
    await context.close();
  });

  test("asks the bridge for the prompt hook by default", async () => {
    const frame = await page.evaluate(async () => {
      const captured = [];
      const original = state.socket.send;
      state.socket.send = (payload) => { captured.push(JSON.parse(payload)); return original.call(state.socket, payload); };
      state.settings.shellIntegration = true;
      addTerminal({ runStartup: false });
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      state.socket.send = original;
      return captured.find((entry) => entry.type === "create") || null;
    });
    expect(frame).not.toBeNull();
    expect(frame.shellIntegration).toBe(true);
  });

  test("tells the bridge to leave the shell alone when tracking is off", async () => {
    const frame = await page.evaluate(async () => {
      const captured = [];
      const original = state.socket.send;
      state.socket.send = (payload) => { captured.push(JSON.parse(payload)); return original.call(state.socket, payload); };
      state.settings.shellIntegration = false;
      addTerminal({ runStartup: false });
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      state.socket.send = original;
      state.settings.shellIntegration = true;
      return captured.find((entry) => entry.type === "create") || null;
    });
    expect(frame).not.toBeNull();
    expect(frame.shellIntegration).toBe(false);
  });

  test("follows a directory reported by the shell prompt", async () => {
    await report("\u001b]9;9;C:\\Windows\\System32\u001b\\");
    expect(await activeTerminalCwd()).toBe("C:\\Windows\\System32");
  });

  test("accepts the quoted form of the same report", async () => {
    await report("\u001b]9;9;\"C:\\Users\\Public\"\u001b\\");
    expect(await activeTerminalCwd()).toBe("C:\\Users\\Public");
  });

  test("still understands the file URL form other terminals emit", async () => {
    await report("\u001b]7;file://localhost/C:/Program%20Files\u001b\\");
    expect(await activeTerminalCwd()).toBe("C:\\Program Files");
  });

  // decodeURIComponent throws on a stray percent, which used to take the whole
  // OSC handler down with it.
  test("survives a file URL that was never percent-encoded", async () => {
    await report("\u001b]7;file://localhost/C:/100%discount\u001b\\");
    expect(await activeTerminalCwd()).toBe("C:\\100%discount");
    await report("\u001b]9;9;C:\\After\u001b\\");
    expect(await activeTerminalCwd()).toBe("C:\\After");
  });

  // A Copilot TUI relocates itself without the shell moving. The hooked shell
  // still prints a prompt, and that prompt must not take the assistant's folder
  // away underneath it.
  // What the user types is only a guess at the destination: tab-completion, a
  // picker or a relative path never reach the capture as the final folder. The
  // assistant printing the move is what actually decides.
  test("follows the folder an assistant announces without any keystrokes", async () => {
    const result = await page.evaluate(async () => {
      const terminal = state.terminals.get(state.activeId);
      terminal.cwd = "C:\\Launch";
      terminal.assistantCwd = "";
      terminal.assistantCommandBuffer = "";
      terminal.assistantAnnouncementApplied = "";
      // Repainted the way a TUI does it: cursor moves, no line of its own.
      terminal.term.write("\u001b[2J\u001b[H");
      writeTerminal(terminal, "\u001b[3;1H  Changed working directory to: C:\\Windows");
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      const firstApplied = terminal.assistantAnnouncementApplied;
      scanAssistantDirectoryAnnouncement(terminal);
      return {
        keystrokeBuffer: terminal.assistantCommandBuffer,
        assistantCwd: terminal.assistantCwd,
        git: terminalGitDirectory(terminal),
        firstApplied,
        appliedAfterDuplicateScan: terminal.assistantAnnouncementApplied
      };
    });
    expect(result.keystrokeBuffer, "nothing was typed").toBe("");
    expect(result.assistantCwd).toBe("C:\\Windows");
    expect(result.git).toBe("C:\\Windows");
    expect(result.appliedAfterDuplicateScan).toBe(result.firstApplied);
  });

  test("keeps guard paths inert and stops live refresh work for removed terminals", async () => {
    const result = await page.evaluate(async () => {
      const terminal = state.terminals.get(state.activeId);
      const originalCwd = terminal.cwd;
      const originalProvider = terminal.aiAssistantTuiProvider;
      const originalRevision = terminal.outputRevision;
      const originalCheckedRevision = terminal.assistantCwdCheckedRevision;

      scheduleTerminalGitInspection(null);
      scheduleTerminalGitInspection({ transient: true });
      scheduleAssistantDirectoryScan(null);
      scheduleAssistantDirectoryScan({ transient: true });
      scanAssistantDirectoryAnnouncement(null);
      scanAssistantDirectoryAnnouncement({ transient: true });
      trackAssistantDirectoryCommand(null, "/cwd C:\\Ignored\r");
      noteAssistantWorkingDirectory(null, "C:\\Ignored");
      noteAssistantWorkingDirectory(terminal, "");

      terminal.cwd = "C:\\Launch";
      terminal.assistantCwd = "C:\\Same";
      noteAssistantWorkingDirectory(terminal, "C:\\Same");

      terminal.aiAssistantTuiProvider = "copilot";
      terminal.outputRevision = 101;
      terminal.assistantCwdCheckedRevision = -1;
      await refreshAssistantWorkingDirectory(terminal);
      const checked = terminal.assistantCwdCheckedRevision;
      await refreshAssistantWorkingDirectory(terminal);

      terminal.outputRevision = 102;
      const pending = refreshAssistantWorkingDirectory(terminal);
      state.terminals.delete(terminal.id);
      await pending;
      const removedInspection = await runTerminalGitInspection(terminal);
      state.terminals.set(terminal.id, terminal);

      terminal.cwd = originalCwd;
      terminal.aiAssistantTuiProvider = originalProvider;
      terminal.outputRevision = originalRevision;
      terminal.assistantCwdCheckedRevision = originalCheckedRevision;
      return { checked, removedInspection, retained: terminal.assistantCwd };
    });

    expect(result.checked).toBe(101);
    expect(result.removedInspection).toBeNull();
    expect(result.retained).toBe("C:\\Same");
  });

  test("ignores an announced path that is not absolute", async () => {
    const result = await page.evaluate(async () => {
      const terminal = state.terminals.get(state.activeId);
      terminal.cwd = "C:\\Launch";
      terminal.assistantCwd = "";
      terminal.assistantAnnouncementApplied = "";
      terminal.term.write("\u001b[2J\u001b[H");
      writeTerminal(terminal, "\u001b[3;1H  Changed working directory to: ../sibling");
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      return { assistantCwd: terminal.assistantCwd, git: terminalGitDirectory(terminal) };
    });
    expect(result.assistantCwd).toBe("");
    expect(result.git).toBe("C:\\Launch");
  });

  test("keeps a live assistant directory when the shell reprints its own prompt", async () => {
    const result = await page.evaluate(async () => {
      const terminal = state.terminals.get(state.activeId);
      terminal.cwd = "C:\\Launch";
      terminal.assistantCwd = "";
      noteAssistantWorkingDirectory(terminal, "C:\\AssistantMoved");
      const recorded = terminalGitDirectory(terminal);
      terminal.term.write("\u001b]9;9;C:\\Launch\u001b\\");
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      return { recorded, afterPrompt: terminalGitDirectory(terminal) };
    });
    expect(result.recorded).toBe("C:\\AssistantMoved");
    expect(result.afterPrompt).toBe("C:\\AssistantMoved");
  });

  test("retires a recorded assistant directory once the shell reports again", async () => {
    await page.evaluate(() => {
      const terminal = state.terminals.get(state.activeId);
      noteAssistantWorkingDirectory(terminal, "C:\\Assistant");
    });
    expect(await page.evaluate(() => terminalGitDirectory(state.terminals.get(state.activeId)))).toBe("C:\\Assistant");
    await report("\u001b]9;9;C:\\Shell\u001b\\");
    expect(await page.evaluate(() => terminalGitDirectory(state.terminals.get(state.activeId)))).toBe("C:\\Shell");
  });

  // A hooked shell reports on every prompt, so an unchanged directory must not
  // cost a git process per Enter.
  test("ignores a repeated report of the directory it is already in", async () => {
    const inspections = await page.evaluate(async () => {
      const terminal = state.terminals.get(state.activeId);
      terminal.term.write("\u001b]9;9;C:\\Steady\u001b\\");
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      let scheduled = 0;
      const original = window.scheduleTerminalGitInspection;
      window.scheduleTerminalGitInspection = (...args) => { scheduled += 1; return original(...args); };
      terminal.term.write("\u001b]9;9;C:\\Steady\u001b\\");
      terminal.term.write("\u001b]9;9;C:\\Steady\u001b\\");
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      window.scheduleTerminalGitInspection = original;
      return { scheduled, cwd: terminal.cwd };
    });
    expect(inspections.cwd).toBe("C:\\Steady");
    expect(inspections.scheduled).toBe(0);
  });

  test("exposes the tracking toggle in settings", async () => {
    if (await page.locator("#expandSettingsRail").isVisible()) await page.locator("#expandSettingsRail").click();
    await page.evaluate(() => {
      const group = document.querySelector("#settingsShowAll");
      if (group) group.click();
    });
    const toggle = page.locator("#shellIntegration");
    await expect(toggle).toHaveCount(1);
    expect(await page.evaluate(() => state.settings.shellIntegration)).toBe(true);
    await toggle.uncheck();
    expect(await page.evaluate(() => state.settings.shellIntegration)).toBe(false);
    await toggle.check();
    expect(await page.evaluate(() => state.settings.shellIntegration)).toBe(true);
  });
});
