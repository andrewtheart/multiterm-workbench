const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

// Copilot's composer discards the Shift bit on arrow keys and has no selection
// of its own, so MultiTerm keeps a virtual one. These run against a real
// Copilot CLI because the whole feature depends on how it redraws and moves its
// own cursor -- a stubbed TUI would prove nothing.
test.describe("Copilot composer text selection", () => {
  test.describe.configure({ mode: "serial" });

  let page;
  let id;

  const composer = () => page.evaluate((terminalId) => {
    const terminal = state.terminals.get(terminalId);
    const region = copilotComposerRegion(terminal);
    if (!region) return null;
    const buffer = terminal.term.buffer.active;
    return {
      text: region.rows
        .map((row) => buffer.getLine(buffer.viewportY + row.row)?.translateToString(true, row.start, row.end) ?? "")
        .join(""),
      cursorIndex: composerCursorIndex(terminal, region),
      selection: terminal.composerSelection,
      bandCount: terminal.screen.querySelectorAll(".pane-composer-selection-band").length,
      selectedCells: terminal.composerSelection
        ? Math.abs(terminal.composerSelection.head - terminal.composerSelection.anchor)
        : 0
    };
  }, id);

  const clearComposer = async () => {
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Backspace");
    await expect.poll(async () => (await composer()).text.trim(), { timeout: 15000 }).toBe("");
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000);
    page = await browser.newPage();
    await startRendererCoverage(page);
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => closeAllTerminals());
    await expect(page.locator(".terminal-pane")).toHaveCount(0, { timeout: 30000 });
    id = await page.evaluate(() => addTerminal({ reveal: true, runStartup: false }).id);
    await expect.poll(() => page.evaluate((terminalId) => state.terminals.get(terminalId)?.status, id),
      { timeout: 30000 }).toBe("live");

    await page.evaluate((terminalId) => {
      sendBridge({ type: "input", id: terminalId, data: "copilot\r" });
    }, id);
    await expect.poll(() => page.evaluate((terminalId) => Boolean(copilotComposerRegion(state.terminals.get(terminalId))), id),
      { timeout: 180000 }).toBe(true);
    await page.locator(`.terminal-pane[data-id="${id}"] .xterm-helper-textarea`).focus();
  });

  test.afterAll(async () => {
    if (page) {
      await stopRendererCoverage(page, "copilot-composer-selection");
      await page.close();
    }
  });

  test("extends a highlight from the cursor with Shift and the arrow keys", async () => {
    await clearComposer();
    await page.keyboard.type("ALPHA BRAVO", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("ALPHA BRAVO");
    expect((await composer()).selection).toBeFalsy();

    for (let press = 0; press < 5; press += 1) {
      await page.keyboard.press("Shift+ArrowLeft");
    }
    await expect.poll(async () => (await composer()).selectedCells, { timeout: 15000 }).toBe(5);
    const selected = await composer();
    expect(selected.selection.mode).toBe("cursor");
    expect(selected.bandCount).toBe(1);
    // Highlighting must not alter the text Copilot is holding.
    expect(selected.text).toBe("ALPHA BRAVO");

    // Shift the other way collapses back toward the anchor.
    await page.keyboard.press("Shift+ArrowRight");
    await expect.poll(async () => (await composer()).selectedCells, { timeout: 15000 }).toBe(4);
  });

  test("deletes exactly the highlighted characters", async () => {
    await clearComposer();
    await page.keyboard.type("ALPHA BRAVO", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("ALPHA BRAVO");
    for (let press = 0; press < 5; press += 1) {
      await page.keyboard.press("Shift+ArrowLeft");
    }
    await expect.poll(async () => (await composer()).selectedCells, { timeout: 15000 }).toBe(5);

    await page.keyboard.press("Delete");
    await expect.poll(async () => (await composer()).text.trimEnd(), { timeout: 15000 }).toBe("ALPHA");
    const after = await composer();
    expect(after.selection).toBeFalsy();
    expect(after.bandCount).toBe(0);
  });

  test("extends a selection to the right and backspaces exactly that range", async () => {
    await clearComposer();
    await page.keyboard.type("ALPHA BRAVO", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("ALPHA BRAVO");

    for (let press = 0; press < 5; press += 1) {
      await page.keyboard.press("ArrowLeft");
    }
    await expect.poll(async () => (await composer()).cursorIndex, { timeout: 15000 }).toBe(6);
    for (let press = 0; press < 5; press += 1) {
      await page.keyboard.press("Shift+ArrowRight");
    }
    await expect.poll(async () => (await composer()).selectedCells, { timeout: 15000 }).toBe(5);

    await page.keyboard.press("Backspace");
    await expect.poll(async () => (await composer()).text.trimEnd(), { timeout: 15000 }).toBe("ALPHA");
    const after = await composer();
    expect(after.selection).toBeFalsy();
    expect(after.bandCount).toBe(0);
  });

  test("Ctrl+A selects only the composer and clears it on Backspace", async () => {
    await clearComposer();
    await page.keyboard.type("CHARLIE DELTA", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("CHARLIE DELTA");

    await page.keyboard.press("Control+a");
    await expect.poll(async () => (await composer()).selection?.mode, { timeout: 15000 }).toBe("all");
    const selected = await composer();
    expect(selected.selectedCells).toBeGreaterThanOrEqual("CHARLIE DELTA".length);
    // The terminal-wide selection must stay untouched; only the composer is claimed.
    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).term.getSelection(), id)).toBe("");

    await page.keyboard.press("Backspace");
    await expect.poll(async () => (await composer()).text.trim(), { timeout: 15000 }).toBe("");
    expect((await composer()).bandCount).toBe(0);
  });

  test("leaves an empty composer unselected and cancels on an unmodified arrow", async () => {
    await clearComposer();
    await page.keyboard.press("Control+a");
    const empty = await composer();
    expect(empty.selection).toBeFalsy();
    expect(empty.bandCount).toBe(0);

    await page.keyboard.type("ECHO", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("ECHO");
    await page.keyboard.press("Shift+ArrowLeft");
    await expect.poll(async () => (await composer()).selectedCells, { timeout: 15000 }).toBe(1);

    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await composer()).selection, { timeout: 15000 }).toBeFalsy();
    expect((await composer()).bandCount).toBe(0);
    // The keystroke still reached Copilot, so the text is intact.
    expect((await composer()).text).toBe("ECHO");
    await clearComposer();
  });

  test("fails closed when composer geometry disappears during input", async () => {
    const result = await page.evaluate(() => {
      const original = {
        copilotComposerRegion,
        copilotTuiPainted,
        scrollableCopilotTuiActive,
        sendBridge
      };
      const line = (cells, text = cells.filter((cell) => typeof cell === "string").join("")) => ({
        length: cells.length,
        getCell: (index) => cells[index] === null || cells[index] === undefined
          ? null
          : { getChars: () => cells[index] },
        translateToString: () => text
      });
      const border = line(Array(10).fill("─"));
      const screen = document.createElement("div");
      const xtermScreen = document.createElement("div");
      xtermScreen.className = "xterm-screen";
      xtermScreen.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50 });
      screen.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50 });
      screen.append(xtermScreen);
      const pane = document.createElement("div");
      pane.append(screen);
      const buffer = {
        cursorX: 3,
        cursorY: 2,
        type: "normal",
        viewportY: 0,
        getLine: () => null
      };
      const cursorCallbacks = [];
      const renderCallbacks = [];
      const terminal = {
        id: "composer-boundary",
        pane,
        screen,
        term: {
          buffer: {
            active: buffer,
            onBufferChange: () => {}
          },
          cols: 10,
          focus: () => {},
          onCursorMove: (callback) => cursorCallbacks.push(callback),
          onRender: (callback) => renderCallbacks.push(callback),
          onScroll: () => {},
          rows: 5,
          scrollToBottom: () => {},
          scrollToTop: () => {},
          textarea: document.createElement("textarea")
        }
      };
      const event = (key, extra = {}) => ({
        altKey: false,
        code: key === "a" ? "KeyA" : "",
        ctrlKey: false,
        key,
        metaKey: false,
        shiftKey: false,
        preventDefault: () => {},
        stopPropagation: () => {},
        ...extra
      });
      try {
        copilotTuiPainted = () => true;
        const noTerminal = original.copilotTuiPainted(null);
        const noBorders = copilotComposerRegion(terminal);
        buffer.getLine = (index) => ({ 3: border, 4: border }[index] || null);
        const adjacentBorders = copilotComposerRegion(terminal);
        buffer.getLine = (index) => ({ 1: border, 4: border }[index] || null);
        const missingRows = copilotComposerRegion(terminal);
        buffer.getLine = (index) => ({
          1: border,
          2: line([null, null, "", "", "", "", "", "", "", ""]),
          3: line(["x", "q", "", "", "", "", "", "", "", ""]),
          4: border
        }[index] || null);
        buffer.cursorY = 4;
        const region = copilotComposerRegion(terminal);
        const missingIndex = composerIndexAt(region, 99, 0);
        const secondRowIndex = composerIndexAt(region, region.rows[1].row, region.rows[1].start);

        copilotComposerRegion = () => region;
        terminal.composerSelection = { mode: "cursor", anchor: 0, head: 1 };
        renderComposerSelection(terminal);
        const oneBand = screen.querySelectorAll(".pane-composer-selection-band").length;
        const zeroDelete = deleteComposerSelection(terminal, region, { mode: "cursor", anchor: 0, head: 0 });
        buffer.getLine = () => null;
        const missingText = composerText(terminal, region);
        copilotComposerRegion = () => null;
        const noSelectAll = selectAllComposerText(terminal);
        const noShiftRegion = handleComposerSelectionKey(terminal, event("ArrowLeft", { shiftKey: true }));
        const noControlRegion = handleComposerSelectionKey(terminal, event("a", { ctrlKey: true }));
        terminal.composerSelection = { mode: "cursor", anchor: 0, head: 1 };
        const noDeleteRegion = handleComposerSelectionKey(terminal, event("Delete"));

        copilotComposerRegion = () => region;
        buffer.cursorY = 99;
        const offComposerShift = handleComposerSelectionKey(terminal, event("ArrowRight", { shiftKey: true }));
        bindComposerSelection(terminal);
        terminal.composerSelection = { mode: "all", anchor: 0, head: 1 };
        cursorCallbacks[0]();
        copilotComposerRegion = () => null;
        terminal.composerSelection = { mode: "cursor", anchor: 0, head: 1 };
        cursorCallbacks[0]();
        const clearedAfterMissingRegion = terminal.composerSelection === null;
        copilotComposerRegion = () => region;
        terminal.composerSelection = { mode: "cursor", anchor: 0, head: 1 };
        cursorCallbacks[0]();
        renderCallbacks[0]();

        const insetTerminal = {
          copilotScrollInsetAt: 0,
          pane: document.createElement("div"),
          term: { rows: 0 }
        };
        syncCopilotScrollInset(insetTerminal);
        const insetMissingNodes = !insetTerminal.pane.style.getPropertyValue("--pane-scroll-bottom-inset");
        const zeroHeightScreen = document.createElement("div");
        zeroHeightScreen.className = "xterm-screen";
        zeroHeightScreen.getBoundingClientRect = () => ({ height: 0 });
        const container = document.createElement("div");
        container.className = "terminal-screen";
        insetTerminal.pane.append(zeroHeightScreen, container);
        insetTerminal.term.rows = 5;
        insetTerminal.copilotScrollInsetAt = 0;
        syncCopilotScrollInset(insetTerminal);

        const noControls = { pane: document.createElement("div"), term: terminal.term };
        syncTerminalScrollControls(noControls);
        bindTerminalScrollControls(noControls);

        const top = document.createElement("button");
        top.className = "pane-scroll-top";
        const bottom = document.createElement("button");
        bottom.className = "pane-scroll-bottom";
        pane.append(top, bottom);
        terminal.tuiScrollActive = true;
        scrollableCopilotTuiActive = () => true;
        bindTerminalScrollControls(terminal);
        top.click();

        return {
          adjacentBorders,
          clearedAfterMissingRegion,
          insetMissingNodes,
          missingIndex,
          missingRows,
          missingText,
          noBorders,
          noControlRegion,
          noDeleteRegion,
          noSelectAll,
          noShiftRegion,
          noTerminal,
          offComposerShift,
          oneBand,
          secondRowIndex,
          zeroDelete
        };
      } finally {
        copilotComposerRegion = original.copilotComposerRegion;
        copilotTuiPainted = original.copilotTuiPainted;
        scrollableCopilotTuiActive = original.scrollableCopilotTuiActive;
        sendBridge = original.sendBridge;
      }
    });

    expect(result).toEqual({
      adjacentBorders: null,
      clearedAfterMissingRegion: true,
      insetMissingNodes: true,
      missingIndex: -1,
      missingRows: null,
      missingText: "",
      noBorders: null,
      noControlRegion: false,
      noDeleteRegion: false,
      noSelectAll: false,
      noShiftRegion: false,
      noTerminal: false,
      offComposerShift: false,
      oneBand: 1,
      secondRowIndex: 0,
      zeroDelete: false
    });
  });
});
