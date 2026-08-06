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

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

// Exhaustive verification of every command-palette option and every settings
// control. Runs against `node server.js` (the browser build) on :3199, so
// desktop-only Electron features are expected to degrade gracefully.
test.describe.configure({ mode: "serial" });

const CAN_SHOW_NATIVE_FILE_DIALOG =
  process.platform === "win32" && !process.env.CI && !process.env.GITHUB_ACTIONS;

test.describe("Command palette + settings verification", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      permissions: ["clipboard-read", "clipboard-write"]
    });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    // Reset to exactly one fresh terminal so this file is independent of any
    // state left behind by other e2e specs sharing the same bridge.
    await page.evaluate(() => closeAllTerminals());
    await page.evaluate(() => addTerminal());
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test.afterAll(async () => {
    await stopRendererCoverage(page, "palette-verify");
    await context.close();
  });

  // Run a palette command by exact label; returns whether it ran without throwing.
  const runCmd = (label) => page.evaluate((label) => {
    const cmd = (typeof getCommands === "function" ? getCommands() : []).find((c) => c.label === label);
    if (!cmd) return { found: false, ok: false };
    try { cmd.run(); return { found: true, ok: true }; }
    catch (e) { return { found: true, ok: false, error: String(e && e.message || e) }; }
  }, label);

  const lastToast = () => page.evaluate(() => {
    const host = document.querySelector("#toastHost");
    const t = host && host.lastElementChild;
    return t ? t.textContent : "";
  });

  const size = () => page.evaluate(() => state.terminals.size);

  test("command palette exposes the expected set of commands", async () => {
    const labels = await page.evaluate(() => getCommands().map((c) => c.label));
    const required = [
      "New terminal", "New PowerShell 7 terminal", "New Windows PowerShell terminal",
      "New Command Prompt terminal", "New WSL terminal", "Attach WSL tmux session…", "New Administrator terminal",
      "Restart as Administrator", "Close active terminal", "Minimize active terminal",
      "Restore all minimized terminals", "Close all terminals", "Restart active terminal",
      "Find in active terminal", "Clear active terminal", "Copy active output",
      "Cycle active terminal color", "Fit all terminals", "Reset layout", "Broadcast command\u2026",
      "Dequeue next command", "Terminal notes & command queue\u2026",
      "Paste into active terminal", "Maximize / restore active pane", "Open active terminal folder",
      "New terminal in active folder", "Change active terminal working directory\u2026",
      "Toggle logging for active terminal", "Cycle broadcast scope",
      "Next terminal", "Previous terminal", "Zoom in active terminal", "Zoom out active terminal",
      "Reset active terminal zoom", "Increase default terminal font size", "Decrease default terminal font size",
      "Toggle app theme", "Toggle header", "Toggle layout panel", "Keyboard shortcuts",
      "Help", "About MultiTerm"
    ];
    const missing = required.filter((r) => !labels.includes(r));
    expect(missing, `Missing commands: ${missing.join(", ")}`).toEqual([]);
    expect(labels.some((l) => l.startsWith("Layout: "))).toBe(true);
    expect(labels.some((l) => l.startsWith("Snippet: "))).toBe(true);
    expect(labels.some((l) => l.startsWith("Focus: "))).toBe(true);
  });

  test("new-terminal commands each open a terminal with the right shell", async () => {
    const cases = [
      ["New terminal", null],
      ["New PowerShell 7 terminal", "pwsh"],
      ["New Windows PowerShell terminal", "powershell"],
      ["New Command Prompt terminal", "cmd"],
      ["New WSL terminal", "wsl"],
      ["New terminal in active folder", null]
    ];
    for (const [label, shell] of cases) {
      const before = await size();
      const res = await runCmd(label);
      expect(res, `${label} -> ${JSON.stringify(res)}`).toMatchObject({ found: true, ok: true });
      await expect.poll(size, { message: `${label} did not add a terminal` }).toBe(before + 1);
      if (shell) {
        const ok = await page.evaluate((shell) => [...state.terminals.values()].some((t) => t.shell === shell), shell);
        expect(ok, `${label} shell=${shell}`).toBe(true);
      }
    }
  });

  test("restart-as-administrator degrades gracefully in the browser build", async () => {
    // "New Administrator terminal" is intentionally excluded: in this build it
    // hosts an in-app elevated pane via the bridge (an `elevate` request) rather
    // than degrading, so it is covered separately (stubbed, no real UAC) in
    // palette-and-settings.spec.js.
    const label = "Restart as Administrator";
    const before = await size();
    const res = await runCmd(label);
    expect(res, `${label} threw`).toMatchObject({ found: true, ok: true });
    await page.waitForTimeout(150);
    const toast = await lastToast();
    expect(toast, `${label} toast=${toast}`).toMatch(/desktop app/i);
    expect(await size(), `${label} must not add a terminal`).toBe(before);
  });

  test("opens the native script picker on an interactive Windows host @full", async () => {
    test.skip(
      !CAN_SHOW_NATIVE_FILE_DIALOG,
      "Requires a local interactive Windows desktop; native dialogs are unavailable in CI."
    );

    const res = await runCmd("Browse & run script in active terminal\u2026");
    expect(res).toMatchObject({ found: true, ok: true });
    await expect
      .poll(() => page.evaluate(() => pendingBridgeRequests.size))
      .toBeGreaterThan(0);
  });

  test("layout commands set the host layout", async () => {
    const layouts = [
      ["Auto fit", "auto"], ["Fixed columns", "columns"], ["Fixed rows", "rows"],
      ["Horizontal strip", "horizontal"], ["Vertical stack", "vertical"], ["Focus rail", "focus"],
      ["Balanced grid", "grid"], ["Master top", "master-top"], ["Master right", "master-right"],
      ["Master bottom", "master-bottom"], ["Master left", "master-left"],
      ["Priority grid", "priority-grid"], ["Compact matrix", "compact-matrix"],
      ["Horizontal carousel", "carousel-horizontal"], ["Vertical carousel", "carousel-vertical"],
      ["Spotlight", "spotlight"],
      ["Bento grid", "bento"], ["Manual canvas", "manual"]
    ];
    for (const [name, value] of layouts) {
      const res = await runCmd(`Layout: ${name}`);
      expect(res, `Layout: ${name}`).toMatchObject({ found: true, ok: true });
      const applied = await page.evaluate(() => document.querySelector("#terminalHost").dataset.layout);
      expect(applied, `Layout: ${name}`).toBe(value);
    }
    await runCmd("Layout: Auto fit");
  });

  test("in-app toggles have their effect", async () => {
    // Maximize / restore
    await runCmd("Maximize / restore active pane");
    expect(await page.evaluate(() => document.querySelector("#terminalHost").classList.contains("has-zoom"))).toBe(true);
    await runCmd("Maximize / restore active pane");
    expect(await page.evaluate(() => document.querySelector("#terminalHost").classList.contains("has-zoom"))).toBe(false);

    // Broadcast bar
    await runCmd("Broadcast command\u2026");
    expect(await page.evaluate(() => !document.querySelector("#broadcastBar").hidden)).toBe(true);

    // Cycle broadcast scope
    const scope0 = await page.evaluate(() => state.broadcastScope);
    await runCmd("Cycle broadcast scope");
    expect(await page.evaluate(() => state.broadcastScope)).not.toBe(scope0);

    // App theme
    const theme0 = await page.evaluate(() => document.documentElement.dataset.appTheme);
    await runCmd("Toggle app theme");
    expect(await page.evaluate(() => document.documentElement.dataset.appTheme)).not.toBe(theme0);

    // Header / sidecar chrome
    const header0 = await page.evaluate(() => state.settings.headerHidden);
    await runCmd("Toggle header");
    expect(await page.evaluate(() => state.settings.headerHidden)).toBe(!header0);
    await runCmd("Toggle header");
    const side0 = await page.evaluate(() => state.settings.sidecarHidden);
    await runCmd("Toggle layout panel");
    expect(await page.evaluate(() => state.settings.sidecarHidden)).toBe(!side0);
    await runCmd("Toggle layout panel");

    // Sync input
    const sync0 = await page.evaluate(() => state.settings.syncInput);
    await runCmd("Toggle sync input (off)");
    await runCmd("Toggle sync input (on)");
    expect(await page.evaluate(() => typeof state.settings.syncInput)).toBe("boolean");

    // Per-terminal font zoom
    const activeId = await page.evaluate(() => state.activeId);
    const terminalFont0 = await page.evaluate((id) => terminalFontSize(state.terminals.get(id)), activeId);
    await runCmd("Zoom in active terminal");
    expect(await page.evaluate((id) => terminalFontSize(state.terminals.get(id)), activeId)).toBe(terminalFont0 + 1);
    await runCmd("Zoom out active terminal");
    await runCmd("Reset active terminal zoom");
    expect(await page.evaluate((id) => terminalFontSize(state.terminals.get(id)), activeId)).toBe(terminalFont0);

    // Global/default font zoom
    const fs0 = await page.evaluate(() => state.settings.fontSize);
    await runCmd("Increase default terminal font size");
    expect(await page.evaluate(() => state.settings.fontSize)).toBe(fs0 + 1);
    await runCmd("Decrease default terminal font size");
    expect(await page.evaluate(() => state.settings.fontSize)).toBe(fs0);

    // Cycle color
    await runCmd("Cycle active terminal color");
    expect(await page.evaluate(() => { const t = state.terminals.get(state.activeId); return t ? t.color : "none"; })).toBeTruthy();
  });

  test("overlays open and close", async () => {
    for (const [label, sel] of [["Keyboard shortcuts", "#shortcutsOverlay"], ["Help", "#helpOverlay"], ["About MultiTerm", "#aboutOverlay"]]) {
      await runCmd(label);
      expect(await page.evaluate((s) => !document.querySelector(s).hidden, sel), `${label} overlay`).toBe(true);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      expect(await page.evaluate((s) => document.querySelector(s).hidden, sel), `${label} overlay close`).toBe(true);
    }
  });

  test("focus / next / previous change the active terminal", async () => {
    const ids = await page.evaluate(() => [...state.terminals.keys()]);
    expect(ids.length).toBeGreaterThan(1);
    await page.evaluate((id) => setActiveTerminal(id), ids[0]);
    await runCmd("Next terminal");
    expect(await page.evaluate(() => state.activeId)).not.toBe(ids[0]);
    await runCmd("Previous terminal");
    const focusLabel = await page.evaluate(() => { const t = state.terminals.get([...state.terminals.keys()][1]); return `Focus: ${t.titleInput.value}`; });
    await runCmd(focusLabel);
    expect(await page.evaluate(() => state.activeId)).toBe(ids[1]);
  });

  test("find opens for the active terminal", async () => {
    await runCmd("Find in active terminal");
    await page.waitForTimeout(150);
    const open = await page.evaluate(() => { const t = state.terminals.get(state.activeId); const f = t && t.pane.querySelector(".pane-find"); return f ? !f.hidden : false; });
    expect(open).toBe(true);
    await page.keyboard.press("Escape");
  });

  test("clipboard, snippet, fit run without error", async () => {
    for (const label of ["Copy active output", "Paste into active terminal", "Fit all terminals"]) {
      const res = await runCmd(label);
      expect(res, `${label}`).toMatchObject({ found: true, ok: true });
    }
    const snippetLabel = await page.evaluate(() => { const c = getCommands().find((x) => x.label.startsWith("Snippet: ")); return c ? c.label : null; });
    if (snippetLabel) expect(await runCmd(snippetLabel)).toMatchObject({ found: true, ok: true });
  });

  test("open-folder sends a reveal message (no real Explorer launched)", async () => {
    const rec = await page.evaluate(() => {
      const recorded = [];
      const orig = sendBridge;
      sendBridge = (m) => { recorded.push(m); return true; };
      try { getCommands().find((c) => c.label === "Open active terminal folder").run(); }
      finally { sendBridge = orig; }
      return recorded;
    });
    expect(rec.some((m) => m && m.type === "reveal")).toBe(true);
  });

  test("toggle-logging sends logStart (wiring)", async () => {
    const rec = await page.evaluate(() => {
      const recorded = [];
      const orig = sendBridge;
      sendBridge = (m) => { recorded.push(m); return true; };
      try { getCommands().find((c) => c.label === "Toggle logging for active terminal").run(); }
      finally { sendBridge = orig; }
      return recorded;
    });
    expect(rec.some((m) => m && m.type === "logStart")).toBe(true);
  });

  test("minimize + restore all", async () => {
    await runCmd("Minimize active terminal");
    expect(await page.evaluate(() => [...state.terminals.values()].some((t) => t.minimized))).toBe(true);
    await runCmd("Restore all minimized terminals");
    expect(await page.evaluate(() => [...state.terminals.values()].every((t) => !t.minimized))).toBe(true);
  });

  test("restart / clear run without error", async () => {
    for (const label of ["Restart active terminal", "Clear active terminal"]) {
      const res = await runCmd(label);
      expect(res, label).toMatchObject({ found: true, ok: true });
    }
    await page.waitForTimeout(300);
  });

  test("reset layout restores defaults", async () => {
    await runCmd("Layout: Bento grid");
    await runCmd("Reset layout");
    expect(await page.evaluate(() => state.settings.layout)).toBe("auto");
  });

  test("close active + close all remove terminals", async () => {
    const before = await size();
    await runCmd("Close active terminal");
    await expect.poll(size).toBe(before - 1);
    await runCmd("Close all terminals");
    await expect.poll(size).toBe(0);
  });
});
