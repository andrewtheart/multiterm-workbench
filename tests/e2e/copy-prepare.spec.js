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

  // The overlay unhides and only then gets its open class, so measuring right
  // after this call can read a row that has not been laid out yet.
  const openEditor = async (text) => {
    await page.evaluate((value) => {
      const terminal = [...state.terminals.values()][0];
      openPrepareEditor(value, terminal.id);
    }, text);
    await expect(page.locator("#prepareOverlay")).toBeVisible();
  };

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

  test("copies a terminal selection with Ctrl+C and interrupts on the third rapid press", async () => {
    const marker = `ctrl-c-selection-${Date.now()}`;
    const select = (text) => page.evaluate((value) => {
      const terminal = [...state.terminals.values()][0];
      const buffer = terminal.term.buffer.active;
      for (let row = buffer.length - 1; row >= 0; row -= 1) {
        const line = buffer.getLine(row)?.translateToString(true) || "";
        const column = line.indexOf(value);
        if (column < 0) continue;
        terminal.term.select(column, row, value.length);
        break;
      }
      terminal.term.focus();
    }, text);

    await page.evaluate(async (text) => {
      const terminal = [...state.terminals.values()][0];
      await new Promise((resolve) => terminal.term.write(`\r\n${text}`, resolve));
    }, marker);
    await select(marker);
    await page.evaluate(() => {
      window.__ctrlCFrames = [];
      window.__ctrlCOriginalSend = state.socket.send;
      state.socket.send = (payload) => window.__ctrlCFrames.push(JSON.parse(payload));
    });

    await page.keyboard.down("Control");
    await page.keyboard.press("c");
    await page.keyboard.up("Control");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(marker);
    expect(await page.evaluate(() => window.__ctrlCFrames
      .filter((frame) => frame.type === "input" && frame.data === "\x03"))).toEqual([]);

    // A live selection keeps the press ambiguous, so the interrupt still needs
    // three deliberate presses.
    await page.waitForTimeout(750);
    await select(marker);
    await page.keyboard.down("Control");
    await page.keyboard.press("c");
    await page.keyboard.press("c");
    await page.keyboard.press("c");
    await page.keyboard.up("Control");
    await expect.poll(() => page.evaluate(() => window.__ctrlCFrames
      .filter((frame) => frame.type === "input" && frame.data === "\x03")
      .map((frame) => frame.data))).toEqual(["\x03"]);

    await page.evaluate(() => {
      state.socket.send = window.__ctrlCOriginalSend;
      delete window.__ctrlCFrames;
      delete window.__ctrlCOriginalSend;
    });
  });

  test("interrupts on the first Ctrl+C when nothing is selected", async () => {
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      forgetTerminalSelection(terminal);
      terminal.term.focus();
      window.__interruptFrames = [];
      window.__interruptOriginalSend = state.socket.send;
      state.socket.send = (payload) => window.__interruptFrames.push(JSON.parse(payload));
    });
    await page.waitForTimeout(750);

    await page.keyboard.down("Control");
    await page.keyboard.press("c");
    await page.keyboard.up("Control");

    await expect.poll(() => page.evaluate(() => window.__interruptFrames
      .filter((frame) => frame.type === "input" && frame.data === "\x03").length)).toBe(1);

    // A second press interrupts again rather than being swallowed by a counter.
    await page.keyboard.down("Control");
    await page.keyboard.press("c");
    await page.keyboard.up("Control");
    await expect.poll(() => page.evaluate(() => window.__interruptFrames
      .filter((frame) => frame.type === "input" && frame.data === "\x03").length)).toBe(2);

    await page.evaluate(() => {
      state.socket.send = window.__interruptOriginalSend;
      delete window.__interruptFrames;
      delete window.__interruptOriginalSend;
    });
  });

  test("uses a centered toolbar and symmetrical footer tracks", async () => {
    await openEditor("Write-Host balanced");
    const geometry = await page.locator(".prepare-editor").evaluate((dialog) => {
      const rect = (selector) => dialog.querySelector(selector).getBoundingClientRect();
      const toolbar = rect(".prepare-toolbar");
      const tools = rect(".prepare-tool-buttons");
      const fields = [...dialog.querySelectorAll(".prepare-save-fields label")].map((element) => element.getBoundingClientRect());
      const actions = [...dialog.querySelectorAll(".prepare-actions > button, .prepare-actions > .prepare-send-wrap")]
        .map((element) => element.getBoundingClientRect());
      return {
        actionTopSpread: Math.max(...actions.map((item) => item.top)) - Math.min(...actions.map((item) => item.top)),
        actionWidthSpread: Math.max(...actions.map((item) => item.width)) - Math.min(...actions.map((item) => item.width)),
        fieldWidthSpread: Math.max(...fields.map((item) => item.width)) - Math.min(...fields.map((item) => item.width)),
        hasHeadingIcon: Boolean(dialog.querySelector(".prepare-head-icon svg")),
        toolbarCenterDelta: Math.abs((tools.left + tools.width / 2) - (toolbar.left + toolbar.width / 2))
      };
    });
    expect(geometry.hasHeadingIcon).toBe(true);
    expect(geometry.toolbarCenterDelta).toBeLessThanOrEqual(1);
    expect(geometry.fieldWidthSpread).toBeLessThanOrEqual(1);
    expect(geometry.actionWidthSpread).toBeLessThanOrEqual(1);
    expect(geometry.actionTopSpread).toBeLessThanOrEqual(1);
    await page.locator("#prepareClose").click();
  });

  test("prepares clipboard text and pastes the edited result into the invoking terminal", async () => {
    await page.evaluate(async () => {
      await navigator.clipboard.writeText("Write-Host clipboard");
      window.__prepareClipboardReads = 0;
      window.__prepareReadClipboardText = window.readClipboardText;
      window.readClipboardText = async () => {
        window.__prepareClipboardReads += 1;
        return window.__prepareReadClipboardText();
      };
      const terminal = [...state.terminals.values()][0];
      showContextMenu(30, 30, terminal, "");
    });
    const action = page.locator("#contextMenu .ctx-item", { hasText: "Prepare and paste" }).first();
    await expect(action).toBeVisible();
    expect(await page.evaluate(() => window.__prepareClipboardReads)).toBe(0);
    await action.click();

    await expect(page.locator("#prepareOverlay")).toBeVisible();
    await expect(page.locator("#prepareTitle")).toHaveText("Prepare and paste");
    await expect(page.locator("#prepareSource")).toContainText("Prepare target");
    await expect(page.locator("#prepareText")).toHaveValue("Write-Host clipboard");
    await expect(page.locator("#prepareCopy")).toContainText("Paste");
    expect(await page.evaluate(() => window.__prepareClipboardReads)).toBe(1);

    await page.locator("#prepareText").fill("Write-Host edited");
    await page.evaluate(() => {
      window.__prepareFrames = [];
      window.__prepareOriginalSend = state.socket.send;
      state.socket.send = (payload) => window.__prepareFrames.push(JSON.parse(payload));
    });
    await page.locator("#prepareCopy").click();
    await expect(page.locator("#prepareOverlay")).toBeHidden();

    const result = await page.evaluate(() => {
      state.socket.send = window.__prepareOriginalSend;
      window.readClipboardText = window.__prepareReadClipboardText;
      const terminal = [...state.terminals.values()][0];
      const input = window.__prepareFrames
        .filter((frame) => frame.type === "input" && frame.id === terminal.id)
        .map((frame) => frame.data);
      delete window.__prepareFrames;
      delete window.__prepareOriginalSend;
      delete window.__prepareReadClipboardText;
      delete window.__prepareClipboardReads;
      return input;
    });
    expect(result).toContain("Write-Host edited");
    expect(result.some((value) => value.endsWith("\r"))).toBe(false);
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

  test("shows synchronized line numbers and wraps by default", async () => {
    const longLine = "Write-Host wrapped ".repeat(80);
    await openEditor(`${longLine}\n\nsecond line\nthird line`);
    const editor = page.locator("#prepareText");
    const wrap = page.locator("#prepareWrap");
    const numbers = page.locator("#prepareLineNumbers .prepare-line-number");

    await expect(wrap).toHaveAttribute("aria-pressed", "true");
    await expect(editor).toHaveAttribute("wrap", "soft");
    await expect(numbers).toHaveCount(4);
    await expect(numbers).toHaveText(["1", "2", "3", "4"]);
    await expect.poll(() => numbers.evaluateAll((rows) => {
      const heights = rows.map((row) => row.getBoundingClientRect().height);
      return heights[1] > 0 && heights[0] > heights[1] * 2;
    })).toBe(true);

    await wrap.click();
    await expect(wrap).toHaveAttribute("aria-pressed", "false");
    await expect(editor).toHaveAttribute("wrap", "off");
    await expect.poll(() => numbers.evaluateAll((rows) => {
      const heights = rows.map((row) => row.getBoundingClientRect().height);
      return Math.abs(heights[0] - heights[1]);
    })).toBeLessThan(1);

    await editor.fill(Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join("\n"));
    await expect(numbers).toHaveCount(80);
    await editor.evaluate((element) => {
      element.scrollTop = 500;
      element.dispatchEvent(new Event("scroll"));
    });
    expect(await page.locator("#prepareLineNumbers").evaluate((element) => element.scrollTop)).toBe(
      await editor.evaluate((element) => element.scrollTop)
    );
    await page.locator("#prepareClose").click();

    await openEditor("wrap resets on reopen");
    await expect(wrap).toHaveAttribute("aria-pressed", "true");
    await expect(editor).toHaveAttribute("wrap", "soft");
    await page.locator("#prepareClose").click();
  });

  test("removes Copilot TUI frames while preserving interior pipes", async () => {
    await openEditor([
      "│                         │",
      "└─────────────────────────┘",
      "│",
      "│ PageFile already exceeds RAM, and crashdmp.sys is present │",
      "│ so the write path itself | was sound. │",
      "│",
      "│ The key finding",
      "│",
      "│ command | value",
      "╰─────────────────────────╯",
      "legacy trailing border   |"
    ].join("\n"));
    await page.locator("#prepareCleanCopilot").click();
    await expect(page.locator("#prepareText")).toHaveValue(
      [
        "PageFile already exceeds RAM, and crashdmp.sys is present",
        "so the write path itself | was sound.",
        "",
        "The key finding",
        "",
        "command | value",
        "legacy trailing border"
      ].join("\n")
    );
    await expect(page.locator("#toastHost")).toContainText("Cleaned 11 Copilot frame rows");
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
    await expect(page.locator("#prepareTerminalList button")).toHaveCount(2);
    await expect(page.locator("#prepareTerminalSearch")).toBeFocused();
    await page.locator("#prepareTerminalList button:not(.prepare-terminal-new)").click();

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

  test("wraps and pages through send-to-terminal options with arrow keys", async () => {
    await page.evaluate(() => {
      for (let index = 2; index <= 8; index += 1) addTerminal({ title: `Picker target ${index}` });
    });
    await expect(page.locator(".pane-status.is-live")).toHaveCount(8);
    await openEditor("Get-Date");
    await page.locator("#prepareSend").click();
    const options = page.locator("#prepareTerminalList button");
    await expect(options).toHaveCount(9);
    const search = page.locator("#prepareTerminalSearch");
    await expect(search).toBeFocused();
    await search.fill("Picker target 6");
    await expect(options).toHaveCount(2);
    await expect(options.first()).toContainText("Picker target 6");
    await search.fill("");
    await expect(options).toHaveCount(9);
    await search.press("ArrowDown");
    await expect(options.first()).toBeFocused();

    await options.first().press("ArrowUp");
    await expect(options.last()).toBeFocused();
    await options.last().press("ArrowUp");
    await expect(options.nth(7)).toBeFocused();
    await options.nth(7).press("PageUp");
    await expect(options.nth(2)).toBeFocused();
    await options.nth(2).press("PageDown");
    await expect(options.nth(7)).toBeFocused();
    await options.nth(7).press("ArrowDown");
    await expect(options.last()).toBeFocused();

    await page.locator("#prepareClose").click();
    await page.evaluate(() => {
      [...state.terminals.values()].slice(1).forEach((terminal) => removeTerminal(terminal.id));
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test("opens a new terminal on the current page and inserts without Enter", async () => {
    const currentPageId = await page.evaluate(() => addPage({ name: "Prepared page" }));
    await openEditor("Write-Output first\nWrite-Output second");
    await page.evaluate(() => {
      window.__prepareFrames = [];
      window.__prepareOriginalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        window.__prepareFrames.push(frame);
        if (frame.type !== "input") window.__prepareOriginalSend.call(this, payload);
      };
    });

    await page.locator("#prepareSend").click();
    const create = page.locator("#prepareTerminalList .prepare-terminal-new");
    await expect(create).toContainText("New terminal");
    await expect(create).toContainText("Prepared page");
    await expect(create.locator("xpath=preceding-sibling::*[1]")).toHaveAttribute("role", "separator");
    expect(await create.evaluate((element) => element === element.parentElement.lastElementChild)).toBe(true);
    await create.click();
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => window.__prepareFrames
      .filter((frame) => frame.type === "input")
      .map((frame) => frame.data)
      .join(""))).toContain("Write-Output second");

    const result = await page.evaluate((expectedPageId) => {
      state.socket.send = window.__prepareOriginalSend;
      delete window.__prepareOriginalSend;
      const createdFrame = window.__prepareFrames.find((frame) => frame.type === "create");
      const terminal = state.terminals.get(createdFrame.id);
      const input = window.__prepareFrames
        .filter((frame) => frame.type === "input" && frame.id === createdFrame.id)
        .map((frame) => frame.data)
        .join("");
      delete window.__prepareFrames;
      return {
        currentPageId: state.activePageId,
        input,
        terminalId: terminal.id,
        terminalPageId: terminal.pageId,
        expectedPageId
      };
    }, currentPageId);
    expect(result.currentPageId).toBe(currentPageId);
    expect(result.terminalPageId).toBe(currentPageId);
    expect(result.input).toContain("Write-Output first");
    expect(result.input).toContain("Write-Output second");
    expect(result.input.endsWith("\r")).toBe(false);

    await page.locator("#prepareClose").click();
    await page.evaluate(({ terminalId, pageId }) => {
      removeTerminal(terminalId);
      removePage(pageId);
    }, { terminalId: result.terminalId, pageId: currentPageId });
  });

  test("turns the Send button into a direct new-terminal action while Alt is held", async () => {
    await openEditor("Write-Output alt-target");
    const send = page.locator("#prepareSend");
    await expect(send).toContainText("Send to terminal");

    await page.keyboard.down("Alt");
    await expect(send).toContainText("Send to new terminal");
    await expect(page.locator("#prepareSendChevron")).toBeHidden();
    await page.keyboard.up("Alt");
    await expect(send).toContainText("Send to terminal");

    const before = await page.locator(".terminal-pane").count();
    await page.keyboard.down("Alt");
    await send.click();
    await page.keyboard.up("Alt");
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 1);
    await expect(page.locator("#prepareTerminalFlyout")).toBeHidden();

    await page.evaluate(() => {
      const created = [...state.terminals.values()].at(-1);
      removeTerminal(created.id);
    });
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
    await page.locator("#prepareSend").click();
    const flyout = await page.locator("#prepareTerminalFlyout").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    expect(flyout.left).toBeGreaterThanOrEqual(0);
    expect(flyout.right).toBeLessThanOrEqual(390);
    await page.locator("#prepareClose").click();
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("keeps line numbers usable when browser metrics are unavailable", async () => {
    await openEditor("fallback metrics");
    const result = await page.evaluate(() => {
      const realGetComputedStyle = window.getComputedStyle;
      window.getComputedStyle = (element) => element === elements.prepareText
        ? { lineHeight: "normal", paddingLeft: "auto", paddingRight: "auto" }
        : realGetComputedStyle(element);
      try {
        updatePrepareLineNumbers();
        return {
          // The rendered rect follows ancestor scaling, so assert the height the
          // fallback actually sets and check separately that it renders.
          lineHeight: elements.prepareLineNumbers.firstElementChild.style.height,
          rendered: elements.prepareLineNumbers.firstElementChild.getBoundingClientRect().height > 0,
          observerWithoutApi: createPrepareResizeObserver(null)
        };
      } finally {
        window.getComputedStyle = realGetComputedStyle;
      }
    });
    expect(result).toEqual({ lineHeight: "20px", rendered: true, observerWithoutApi: null });
    await page.locator("#prepareClose").click();
  });
});
