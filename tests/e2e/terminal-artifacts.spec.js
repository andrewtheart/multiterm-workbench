/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const { test, expect } = require("../support/renderer-coverage");

async function reset(page, count = 1) {
  await page.goto("/");
  await expect(page.locator("#statusConn")).toHaveText("Connected");
  await page.evaluate(() => closeAllTerminals());
  await expect(page.locator(".terminal-pane")).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.removeItem("multiterm.terminalArtifacts");
    state.terminalArtifacts = emptyTerminalArtifacts();
    updateTerminalArtifactIndicators();
  });
  for (let index = 0; index < count; index += 1) {
    await page.evaluate((number) => addTerminal({ title: `Artifact terminal ${number}` }), index + 1);
  }
  await expect(page.locator(".terminal-pane")).toHaveCount(count);
  await expect
    .poll(() => page.evaluate(() => [...state.terminals.values()].filter((terminal) => terminal.status === "live").length))
    .toBe(count);
}

test.describe("Terminal notes and command queue", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      closeTerminalArtifacts({ restoreFocus: false });
      closeAllTerminals();
      localStorage.removeItem("multiterm.terminalArtifacts");
      state.terminalArtifacts = emptyTerminalArtifacts();
    });
  });

  test("saves PID-bound notes and restores them after a reload", async ({ page }) => {
    await reset(page);
    await page.locator('.terminal-pane [data-action="artifacts"]').click();

    await expect(page.locator("#terminalArtifactsOverlay")).toBeVisible();
    await expect(page.locator("#terminalArtifactsTarget option").first()).toContainText(/PID \d+/);
    await page.locator("#terminalNotesInput").fill("Investigate the parser edge case.\nKeep the reproduction command.");
    await expect(page.locator("#terminalNotesSaved")).toHaveText("Saved");

    const stored = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const record = state.terminalArtifacts.terminals[terminal.id];
      return { notes: record.notes, pid: record.pid, terminalPid: terminal.pid, terminalId: terminal.id };
    });
    expect(stored.notes).toContain("parser edge case");
    expect(stored.pid).toBe(stored.terminalPid);

    await page.locator("#terminalArtifactsClose").click();
    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate((id) => state.terminals.has(id), stored.terminalId)).toBe(true);
    await page.locator("#terminalArtifactsToggle").click();
    await page.locator("#terminalArtifactsTarget").selectOption(stored.terminalId);
    await expect(page.locator("#terminalNotesInput")).toHaveValue(stored.notes);
  });

  test("dequeues a command by inserting it without Enter", async ({ page }) => {
    await reset(page);
    await page.locator("#terminalArtifactsToggle").click();
    await page.locator("#commandQueueInput").fill("copilot --model gpt-test");
    await page.locator("#commandQueueAdd").click();
    await expect(page.locator(".command-queue-item")).toHaveCount(1);
    await expect(page.locator("#terminalArtifactsBadge")).toHaveText("1");

    await page.evaluate(() => {
      window.__artifactFrames = [];
      window.__artifactOriginalSend = state.socket.send.bind(state.socket);
      state.socket.send = (payload) => window.__artifactFrames.push(JSON.parse(payload));
    });
    await page.locator(".command-queue-send").click();

    const result = await page.evaluate(() => {
      const frames = window.__artifactFrames.filter((frame) => frame.type === "input");
      state.socket.send = window.__artifactOriginalSend;
      return {
        frames,
        queued: Object.values(state.terminalArtifacts.terminals).flatMap((record) => record.queue).length,
        overlayHidden: elements.terminalArtifactsOverlay.hidden
      };
    });
    expect(result.frames).toEqual([
      { type: "input", id: expect.any(String), data: "copilot --model gpt-test" }
    ]);
    expect(result.frames[0].data).not.toMatch(/[\r\n]$/);
    expect(result.queued).toBe(0);
    expect(result.overlayHidden).toBe(false);
    await expect(page.locator("#terminalArtifactsOverlay")).toBeHidden();
  });

  test("quickly dequeues FIFO commands from the pane and keyboard", async ({ page }) => {
    await reset(page);
    await page.locator("#terminalArtifactsToggle").click();
    for (const command of ["first staged prompt", "second staged prompt"]) {
      await page.locator("#commandQueueInput").fill(command);
      await page.locator("#commandQueueAdd").click();
    }
    await page.locator("#terminalArtifactsClose").click();
    await expect(page.locator("#terminalArtifactsOverlay")).toBeHidden();

    const dequeue = page.locator('.terminal-pane [data-action="dequeue"]');
    await expect(dequeue).toBeVisible();
    await expect(dequeue.locator("svg")).toHaveCount(1);
    await expect(dequeue.locator(".pane-dequeue-badge")).toHaveText("2");
    await expect(dequeue).toHaveAttribute("title", /first staged prompt/);

    await page.evaluate(() => {
      window.__artifactFrames = [];
      window.__artifactOriginalSend = state.socket.send.bind(state.socket);
      state.socket.send = (payload) => window.__artifactFrames.push(JSON.parse(payload));
    });
    await dequeue.click();
    await expect(dequeue.locator(".pane-dequeue-badge")).toHaveText("1");
    await expect(dequeue).toHaveAttribute("title", /second staged prompt/);

    await page.keyboard.press("Control+Shift+Q");
    await expect(dequeue).toBeHidden();
    const result = await page.evaluate(() => {
      const frames = window.__artifactFrames.filter(
        (frame) => frame.type === "input" && !/^\u001b\[[IO]$/.test(frame.data)
      );
      state.socket.send = window.__artifactOriginalSend;
      return {
        frames,
        queued: Object.values(state.terminalArtifacts.terminals).flatMap((record) => record.queue).length,
        overlayHidden: elements.terminalArtifactsOverlay.hidden
      };
    });
    expect(result.frames).toEqual([
      { type: "input", id: expect.any(String), data: "first staged prompt" },
      { type: "input", id: expect.any(String), data: "second staged prompt" }
    ]);
    expect(result.frames.every((frame) => !/[\r\n]$/.test(frame.data))).toBe(true);
    expect(result.queued).toBe(0);
    expect(result.overlayHidden).toBe(true);
  });

  test("recovers notes and makes queued commands unparented when a PID exits", async ({ page }) => {
    await reset(page, 2);
    const ids = await page.evaluate(() => [...state.terminals.keys()]);
    await page.locator("#terminalArtifactsToggle").click();
    await page.locator("#terminalArtifactsTarget").selectOption(ids[0]);
    await page.locator("#terminalNotesInput").fill("Do not lose this process context.");
    await page.locator("#commandQueueInput").fill("echo recovered-command");
    await page.locator("#commandQueueAdd").click();

    await page.evaluate((id) => handleBridgeMessage({ type: "exited", id, code: 1 }), ids[0]);
    await expect(page.locator("#terminalArtifactsTarget")).toHaveValue("__unparented__");
    await expect(page.locator(".recovered-note-input")).toHaveValue("Do not lose this process context.");
    await expect(page.locator(".command-queue-item.is-unparented")).toContainText("echo recovered-command");
    await expect(page.locator("#unparentedQueueTarget")).toHaveValue(ids[1]);

    await page.evaluate(() => {
      window.__artifactFrames = [];
      window.__artifactOriginalSend = state.socket.send.bind(state.socket);
      state.socket.send = (payload) => window.__artifactFrames.push(JSON.parse(payload));
    });
    await page.locator(".command-queue-send").click();
    const sent = await page.evaluate(() => {
      const frames = window.__artifactFrames.filter((frame) => frame.type === "input");
      state.socket.send = window.__artifactOriginalSend;
      return frames;
    });
    expect(sent).toEqual([{ type: "input", id: ids[1], data: "echo recovered-command" }]);
  });
});
