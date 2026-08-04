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

test.describe("Copy and prepare editor", () => {
  let context;
  let page;

  const openEditor = (text) => page.evaluate((value) => {
    const terminal = [...state.terminals.values()][0];
    openPrepareEditor(value, terminal.id);
  }, text);

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      permissions: ["clipboard-read", "clipboard-write"]
    });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      closeAllTerminals();
      addTerminal({ title: "Prepare target" });
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect(page.locator(".pane-status")).toHaveClass(/is-live/);
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      if (!elements.prepareOverlay.hidden) closePrepareEditor({ restoreFocus: false });
      closeAllTerminals();
    });
    await stopRendererCoverage(page, "copy-prepare");
    await context.close();
  });

  test("opens from the selected-text context action", async () => {
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      showContextMenu(30, 30, terminal, "Write-Host selected");
    });
    const action = page.locator("#contextMenu .ctx-item", { hasText: "Copy and prepare" }).first();
    await expect(action).toBeVisible();
    await expect(action.locator("xpath=preceding-sibling::*[contains(@class, 'ctx-item')][1]"))
      .toHaveAttribute("data-customization-id", "terminal.copy");
    await action.click();

    await expect(page.locator("#prepareOverlay")).toBeVisible();
    await expect(page.locator("#prepareText")).toHaveValue("Write-Host selected");
    await expect(page.locator("#prepareSource")).toContainText("Prepare target");
    await expect(page.locator("#prepareLanguage")).toHaveValue("powershell");
    await expect(page.locator("#prepareFileName")).toHaveValue("prepared.ps1");
    const rowGeometry = await page.evaluate(() => {
      const editor = elements.prepareText.getBoundingClientRect();
      const status = elements.prepareStatus.parentElement.getBoundingClientRect();
      return { editorBottom: editor.bottom, statusHeight: status.height, statusTop: status.top };
    });
    expect(Math.abs(rowGeometry.statusTop - rowGeometry.editorBottom)).toBeLessThan(1);
    expect(rowGeometry.statusHeight).toBeLessThan(30);
    await page.locator("#prepareClose").click();
    await expect(page.locator("#prepareOverlay")).toBeHidden();
  });

  test("defaults ambiguous shell-neutral commands to plain text", async () => {
    const inferred = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      return {
        assignment: prepareLanguageForTerminal(terminal, "$value = 42"),
        bash: prepareLanguageForTerminal(terminal, "grep needle file.txt"),
        batch: prepareLanguageForTerminal(terminal, "@echo off\nset VALUE=1"),
        csharp: prepareLanguageForTerminal(terminal, "public class Example {}"),
        ls: prepareLanguageForTerminal(terminal, "ls"),
        powerShell: prepareLanguageForTerminal(terminal, "Get-ChildItem -Force")
      };
    });
    expect(inferred).toEqual({
      assignment: "powershell",
      bash: "text",
      batch: "batch",
      csharp: "csharp",
      ls: "text",
      powerShell: "powershell"
    });

    await openEditor("ls");
    await expect(page.locator("#prepareLanguage")).toHaveValue("text");
    await expect(page.locator("#prepareFileName")).toHaveValue("prepared.txt");
    await page.locator("#prepareClose").click();
  });

  test("edits, indents, finds, replaces, and tracks the cursor", async () => {
    await openEditor("alpha\nbeta");
    const editor = page.locator("#prepareText");
    await editor.evaluate((element) => element.setSelectionRange(0, element.value.length));
    await editor.press("Tab");
    await expect(editor).toHaveValue("    alpha\n    beta");

    await editor.press("Control+f");
    await expect(page.locator("#prepareFindBar")).toBeVisible();
    await page.locator("#prepareFind").fill("beta");
    await page.locator("#prepareReplace").fill("gamma");
    await page.locator("#prepareReplaceOne").click();
    await expect(editor).toHaveValue("    alpha\n    gamma");
    await expect(page.locator("#prepareStatus")).toContainText("2 lines");
    await page.locator("#prepareClose").click();
  });

  test("removes every trailing Copilot TUI pipe border", async () => {
    await openEditor("first value   |\nplain line\nthird value|   \ncommand | value");
    await page.locator("#prepareCleanCopilot").click();
    await expect(page.locator("#prepareText")).toHaveValue(
      "first value\nplain line\nthird value\ncommand | value"
    );
    await expect(page.locator("#toastHost")).toContainText("Removed 2 trailing Copilot borders");
    await page.locator("#prepareClose").click();
  });

  test("reports Batch structure issues and navigates to them", async () => {
    await openEditor("@echo off\nif exist file.txt (\ngoto missing");
    await page.locator("#prepareLanguage").selectOption("batch");
    await page.locator("#prepareValidate").click();
    await expect(page.locator("#prepareValidation")).toContainText("issues");
    await expect(page.locator("#prepareIssues .prepare-issue")).toHaveCount(2);
    await page.locator("#prepareIssues .prepare-issue button").first().click();
    expect(await page.locator("#prepareText").evaluate((element) => element.selectionStart)).toBeGreaterThan(0);
    await page.locator("#prepareClose").click();
  });

  test("uses the bridge's real PowerShell parser", async () => {
    await openEditor("$value = (");
    await page.locator("#prepareValidate").click();
    await expect(page.locator("#prepareValidation")).toContainText("PowerShell AST parser");
    await expect(page.locator("#prepareIssues .prepare-issue").first()).toContainText(/Missing|expression|closing/i);
    await page.locator("#prepareClose").click();
  });

  test("copies the modified text and saves a single-command snippet", async () => {
    const before = await page.evaluate(() => (state.settings.snippets || []).length);
    await openEditor("Write-Host original");
    await page.locator("#prepareText").fill("Write-Host modified");
    await page.locator("#prepareSnippetName").fill("Prepared command");
    await page.locator("#prepareSaveSnippet").click();
    expect(await page.evaluate(() => state.settings.snippets.at(-1))).toEqual({
      name: "Prepared command",
      command: "Write-Host modified"
    });

    await page.locator("#prepareCopy").click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Write-Host modified");
    await page.evaluate((index) => removeSnippet(index), before);
    await page.locator("#prepareClose").click();
  });

  test("inserts into a chosen terminal without appending Enter", async () => {
    await openEditor("Get-Date");
    await page.evaluate(() => {
      window.__prepareFrames = [];
      window.__prepareOriginalSend = state.socket.send;
      state.socket.send = (payload) => window.__prepareFrames.push(JSON.parse(payload));
    });
    await page.locator("#prepareSend").click();
    await expect(page.locator("#prepareTerminalFlyout")).toBeVisible();
    await expect(page.locator("#prepareTerminalList button")).toHaveCount(1);
    await page.locator("#prepareTerminalList button").click();

    const data = await page.evaluate(() => {
      state.socket.send = window.__prepareOriginalSend;
      const terminal = [...state.terminals.values()][0];
      return window.__prepareFrames
        .filter((frame) => frame.type === "input" && frame.id === terminal.id)
        .map((frame) => frame.data);
    });
    expect(data).toContain("Get-Date");
    expect(data.some((value) => value.endsWith("\r"))).toBe(false);
    await page.locator("#prepareClose").click();
  });

  test("stays usable in a narrow window", async () => {
    await page.setViewportSize({ width: 390, height: 720 });
    await openEditor("Write-Host mobile");
    const geometry = await page.locator(".prepare-editor").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(390);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(720);
    expect(geometry.height).toBeGreaterThan(500);
    await page.locator("#prepareClose").click();
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});
