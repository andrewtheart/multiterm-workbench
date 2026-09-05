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
    return {
      text: composerText(terminal, region),
      rowCount: region.rows.length,
      length: composerLength(region),
      boxRows: copilotComposerRows(terminal),
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

  // Copilot grows the prompt box a row per line, so pasting is the quickest way
  // to put a real multi-line composer on screen.
  const seedLines = async (count) => {
    await clearComposer();
    const text = Array.from({ length: count }, (unused, index) => `L${index + 1}ABCDE`).join("\n");
    await page.evaluate(({ terminalId, payload }) => {
      state.terminals.get(terminalId).term.paste(payload);
    }, { terminalId: id, payload: text });
    await expect.poll(async () => (await composer()).text, { timeout: 20000 }).toBe(text);
    return text;
  };

  // Row 0 is the top line of the box; -1 lands in the transcript above it.
  const clickComposerRow = async (offset) => {
    const point = await page.evaluate(({ terminalId, row }) => {
      const terminal = state.terminals.get(terminalId);
      const region = copilotComposerRegion(terminal);
      const rect = terminal.term.element.querySelector(".xterm-screen").getBoundingClientRect();
      const cellHeight = rect.height / terminal.term.rows;
      const target = Math.min(...region.rows.map((entry) => entry.row)) + row;
      return { x: rect.left + rect.width / 2, y: rect.top + target * cellHeight + cellHeight / 2 };
    }, { terminalId: id, row: offset });
    await page.mouse.click(point.x, point.y);
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240000);
    page = await browser.newPage();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:3199" });
    await startRendererCoverage(page);
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    // A fresh renderer opens its own welcome terminal, which can arrive after the
    // first close, so keep closing until the stage is genuinely empty.
    await expect.poll(async () => {
      await page.evaluate(() => closeAllTerminals());
      return page.locator(".terminal-pane").count();
    }, { timeout: 30000 }).toBe(0);
    id = await page.evaluate(() => addTerminal({ reveal: true, runStartup: false }).id);
    await expect.poll(() => page.evaluate((terminalId) => state.terminals.get(terminalId)?.status, id),
      { timeout: 30000 }).toBe("live");

    await page.evaluate((terminalId) => {
      sendBridge({ type: "input", id: terminalId, data: "copilot\r" });
    }, id);
    // A newer CLI offers to restore interrupted sessions before it shows the
    // composer, and that screen waits for an answer; Escape starts fresh.
    await expect.poll(() => page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      if (!terminal) return "missing";
      if (copilotComposerRegion(terminal)) return "composer";
      const buffer = terminal.term.buffer.active;
      const screen = Array.from({ length: terminal.term.rows },
        (unused, row) => buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "").join("\n");
      if (/start fresh/i.test(screen) && !window.__composerRestoreDismissed) {
        window.__composerRestoreDismissed = true;
        sendBridge({ type: "input", id: terminalId, data: "\u001b" });
      }
      return "waiting";
    }, id), { timeout: 180000 }).toBe("composer");
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

  // A press in Copilot's output means the user is working with the transcript,
  // so Ctrl+A has to mean the terminal rather than the prompt box.
  test("Ctrl+A selects the whole terminal after a click outside the prompt box", async () => {
    await clearComposer();
    await page.keyboard.type("ECHO ONE", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("ECHO ONE");

    const point = await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      const region = copilotComposerRegion(terminal);
      const rect = terminal.term.element.querySelector(".xterm-screen").getBoundingClientRect();
      const cellHeight = rect.height / terminal.term.rows;
      const topComposerRow = Math.min(...region.rows.map((row) => row.row));
      return {
        outside: { x: rect.left + rect.width / 2, y: rect.top + (topComposerRow - 3) * cellHeight + cellHeight / 2 },
        inside: { x: rect.left + 20, y: rect.top + region.rows[0].row * cellHeight + cellHeight / 2 }
      };
    }, id);

    await page.mouse.click(point.outside.x, point.outside.y);
    await page.keyboard.press("Control+a");
    const wide = await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      return { selected: terminal.term.getSelection().length, composer: terminal.composerSelection };
    }, id);
    expect(wide.composer).toBeFalsy();
    expect(wide.selected).toBeGreaterThan("ECHO ONE".length);
    expect((await composer()).bandCount).toBe(0);

    // Clicking back into the prompt box hands Ctrl+A back to the composer.
    await page.mouse.click(point.inside.x, point.inside.y);
    await page.keyboard.press("Control+a");
    await expect.poll(async () => (await composer()).selection?.mode, { timeout: 15000 }).toBe("all");
    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).term.getSelection(), id)).toBe("");
  });

  test("replaces the whole composer when you type over a Ctrl+A selection", async () => {
    await clearComposer();
    await page.keyboard.type("CHARLIE DELTA", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("CHARLIE DELTA");

    await page.keyboard.press("Control+a");
    await expect.poll(async () => (await composer()).selection?.mode, { timeout: 15000 }).toBe("all");

    await page.keyboard.type("Z", { delay: 40 });
    await expect.poll(async () => (await composer()).text.trim(), { timeout: 15000 }).toBe("Z");
    const after = await composer();
    expect(after.selection).toBeFalsy();
    expect(after.bandCount).toBe(0);
  });

  test("replaces a shift-selected range with the character typed", async () => {
    await clearComposer();
    await page.keyboard.type("ALPHA BRAVO", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("ALPHA BRAVO");
    for (let press = 0; press < 5; press += 1) {
      await page.keyboard.press("Shift+ArrowLeft");
    }
    await expect.poll(async () => (await composer()).selectedCells, { timeout: 15000 }).toBe(5);

    await page.keyboard.type("Z", { delay: 40 });
    await expect.poll(async () => (await composer()).text.trimEnd(), { timeout: 15000 }).toBe("ALPHA Z");
    expect((await composer()).selection).toBeFalsy();
  });

  test("replaces a selection dragged out with the mouse", async () => {
    await clearComposer();
    await page.keyboard.type("ALPHA BRAVO", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("ALPHA BRAVO");

    // A drag selects in xterm alone, which Copilot never sees.
    await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      const region = copilotComposerRegion(terminal);
      const row = region.rows[0];
      terminal.term.select(row.start + 6, terminal.term.buffer.active.viewportY + row.row, 5);
    }, id);
    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).term.getSelection(), id)).toBe("BRAVO");

    await page.keyboard.type("Z", { delay: 40 });
    await expect.poll(async () => (await composer()).text.trimEnd(), { timeout: 15000 }).toBe("ALPHA Z");
  });

  test("cuts a highlighted range to the clipboard with Ctrl+X", async () => {
    await clearComposer();
    await page.evaluate(() => navigator.clipboard.writeText("PLACEHOLDER"));
    await page.keyboard.type("ALPHA BRAVO", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("ALPHA BRAVO");
    for (let press = 0; press < 5; press += 1) {
      await page.keyboard.press("Shift+ArrowLeft");
    }
    await expect.poll(async () => (await composer()).selectedCells, { timeout: 15000 }).toBe(5);

    await page.keyboard.press("Control+x");
    await expect.poll(async () => (await composer()).text.trimEnd(), { timeout: 15000 }).toBe("ALPHA");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15000 }).toBe("BRAVO");
    const after = await composer();
    expect(after.selection).toBeFalsy();
    expect(after.bandCount).toBe(0);
  });

  test("cuts a mouse-dragged composer range with Ctrl+X", async () => {
    await clearComposer();
    await page.evaluate(() => navigator.clipboard.writeText("PLACEHOLDER"));
    await page.keyboard.type("ALPHA BRAVO", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("ALPHA BRAVO");

    await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      const region = copilotComposerRegion(terminal);
      const row = region.rows[0];
      terminal.term.select(row.start + 6, terminal.term.buffer.active.viewportY + row.row, 5);
    }, id);
    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).term.getSelection(), id)).toBe("BRAVO");

    await page.keyboard.press("Control+x");
    await expect.poll(async () => (await composer()).text.trimEnd(), { timeout: 15000 }).toBe("ALPHA");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15000 }).toBe("BRAVO");
    // The highlight has to go with the text, or the selection restorer paints it back.
    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).term.getSelection(), id)).toBe("");
  });

  test("types normally when the selection is output rather than composer text", async () => {
    await clearComposer();
    await page.keyboard.type("ALPHA", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("ALPHA");

    // The composer border is not editable text, so nothing may be deleted here.
    await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      const region = copilotComposerRegion(terminal);
      const buffer = terminal.term.buffer.active;
      terminal.term.select(2, buffer.viewportY + region.rows[0].row - 1, 4);
    }, id);

    await page.keyboard.type("Z", { delay: 40 });
    await expect.poll(async () => (await composer()).text.trimEnd(), { timeout: 15000 }).toBe("ALPHAZ");
    await clearComposer();
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

  // A pasted block grows the prompt box past the rows the border scan used to
  // look at, which left MultiTerm unable to find the box at all: Ctrl+A then
  // highlighted the whole TUI instead of the text the user had just pasted.
  test("selects only the prompt box after a paste makes it taller than the scan window", async () => {
    const text = await seedLines(8);
    const seeded = await composer();
    expect(seeded.rowCount).toBe(8);
    expect(seeded.length).toBe(text.length);

    await clickComposerRow(7);
    await page.keyboard.press("Control+a");
    await expect.poll(async () => (await composer()).selection?.mode, { timeout: 15000 }).toBe("all");
    const selected = await composer();
    expect(selected.selectedCells).toBe(text.length);
    expect(selected.bandCount).toBe(8);
    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).term.getSelection(), id)).toBe("");
  });

  test("selects only the prompt box when it holds two lines", async () => {
    const text = await seedLines(2);
    await clickComposerRow(1);
    await page.keyboard.press("Control+a");
    await expect.poll(async () => (await composer()).selection?.mode, { timeout: 15000 }).toBe("all");
    const selected = await composer();
    expect(selected.selectedCells).toBe(text.length);
    expect(selected.bandCount).toBe(2);
    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).term.getSelection(), id)).toBe("");
  });

  test("clears every line of a multi-line prompt box with Ctrl+A and Backspace", async () => {
    await seedLines(2);
    await page.keyboard.press("Control+a");
    await expect.poll(async () => (await composer()).selection?.mode, { timeout: 15000 }).toBe("all");

    await page.keyboard.press("Backspace");
    // The line break is a character of its own, so a count that misses it leaves
    // the first line's opening character behind.
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("");
    expect((await composer()).bandCount).toBe(0);
  });

  test("replaces a whole multi-line prompt box with the character typed", async () => {
    await seedLines(2);
    await page.keyboard.press("Control+a");
    await expect.poll(async () => (await composer()).selection?.mode, { timeout: 15000 }).toBe("all");

    await page.keyboard.type("Z", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("Z");
    expect((await composer()).selection).toBeFalsy();
  });

  test("extends a highlight across a line break and deletes exactly that span", async () => {
    await seedLines(2);
    // Nine cells back from the end reaches the last character of the first line.
    for (let press = 0; press < 9; press += 1) {
      await page.keyboard.press("Shift+ArrowLeft");
    }
    await expect.poll(async () => (await composer()).selectedCells, { timeout: 15000 }).toBe(9);
    expect((await composer()).bandCount).toBe(2);

    await page.keyboard.press("Backspace");
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("L1ABCD");
    expect((await composer()).rowCount).toBe(1);
  });

  test("cuts a range that spans a line break", async () => {
    await seedLines(2);
    await page.evaluate(() => navigator.clipboard.writeText("PLACEHOLDER"));
    for (let press = 0; press < 9; press += 1) {
      await page.keyboard.press("Shift+ArrowLeft");
    }
    await expect.poll(async () => (await composer()).selectedCells, { timeout: 15000 }).toBe(9);

    await page.keyboard.press("Control+x");
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("L1ABCD");
    // Windows hands back CRLF for a line break written as LF.
    await expect.poll(async () => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n"),
      { timeout: 15000 }).toBe("E\nL2ABCDE");
  });

  test("replaces a dragged range on the first line of a multi-line prompt box", async () => {
    await seedLines(2);
    await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      const region = copilotComposerRegion(terminal);
      const row = region.rows[0];
      terminal.term.select(row.start + 1, terminal.term.buffer.active.viewportY + row.row, 5);
    }, id);
    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).term.getSelection(), id)).toBe("1ABCD");

    // The caret sits on the last line, so walking back to the drag has to cross
    // the break; a count that skips it removes the wrong five characters.
    await page.keyboard.type("Z", { delay: 40 });
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("LZE\nL2ABCDE");
  });

  test("counts a wrapped line as one line of the prompt box", async () => {
    await clearComposer();
    const wrapped = "W".repeat(260);
    await page.evaluate(({ terminalId, payload }) => {
      state.terminals.get(terminalId).term.paste(payload);
    }, { terminalId: id, payload: wrapped });
    await expect.poll(async () => (await composer()).text, { timeout: 20000 }).toBe(wrapped);
    const seeded = await composer();
    expect(seeded.rowCount).toBeGreaterThan(1);
    expect(seeded.length).toBe(wrapped.length);

    await page.keyboard.press("Control+a");
    await expect.poll(async () => (await composer()).selectedCells, { timeout: 15000 }).toBe(wrapped.length);
    await page.keyboard.press("Backspace");
    await expect.poll(async () => (await composer()).text, { timeout: 15000 }).toBe("");
  });

  test("parks the scroll chevron above a tall prompt box", async () => {
    await seedLines(2);
    const short = (await composer()).boxRows;
    await seedLines(8);
    const tall = await composer();
    // The chevron sits on the box lid, so its allowance has to grow with the box
    // rather than stop at the rows the old scan could see.
    expect(tall.boxRows).toBe(short + 6);
    expect(tall.boxRows).toBeGreaterThan(tall.rowCount + 1);
    await clearComposer();
  });

  // The reported sequence end to end: paste a block, work with the transcript,
  // then come back to the prompt box.
  test("hands Ctrl+A back to the prompt box after a click outside a tall one", async () => {
    const text = await seedLines(8);

    await clickComposerRow(-3);
    await page.keyboard.press("Control+a");
    const wide = await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      return { selected: terminal.term.getSelection().length, composer: terminal.composerSelection };
    }, id);
    expect(wide.composer).toBeFalsy();
    expect(wide.selected).toBeGreaterThan(text.length);

    await clickComposerRow(0);
    await page.keyboard.press("Control+a");
    await expect.poll(async () => (await composer()).selection?.mode, { timeout: 15000 }).toBe("all");
    expect((await composer()).selectedCells).toBe(text.length);
    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).term.getSelection(), id)).toBe("");
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
      // The break at the end of the first row owns an index of its own.
      secondRowIndex: 1,
      zeroDelete: false
    });
  });

  // The lid can sit anywhere once the box grows, so the search for it has to
  // tell the box's own lid from a rule the user pasted inside it.
  test("finds the prompt box lid past pasted rules and gives up when there is none", async () => {
    const result = await page.evaluate(() => {
      const line = (cells) => ({
        length: cells.length,
        getCell: (index) => (cells[index] === undefined ? null : { getChars: () => cells[index] }),
        translateToString: () => cells.map((cell) => cell ?? "").join("")
      });
      const rule = (lead) => line([lead, ...Array(12).fill("\u2500")]);
      const borders = (rows) => copilotComposerBorders({
        term: { rows: rows.length, buffer: { active: { viewportY: 0, getLine: (at) => rows[at] || null } } }
      });

      const text = (value) => line([...value]);
      // Rows are top to bottom; the box is pinned to the last of them.
      const pasted = borders([
        text("output"),
        rule("\u257b"),
        // A pasted rule inside the box: it carries the box's side glyph.
        rule("\u2503"),
        text("\u2503 typed"),
        rule("\u2579")
      ]);
      // The lid's own trailing cells are blank, so the width scan walks back.
      const padded = borders([
        line(["\u257b", ...Array(12).fill("\u2500"), " ", " "]),
        text("\u2503 typed"),
        rule("\u2579")
      ]);
      // A floor with nothing above it that could be a lid.
      const floorOnly = borders([text("output"), text("\u2503 typed"), rule("\u2579")]);
      // A cell the renderer has not filled in reads as empty rather than throwing.
      const sparseLid = borders([
        { length: 3, getCell: () => null, translateToString: () => "\u2500".repeat(12) },
        rule("\u2579")
      ]);
      return { pasted, padded, floorOnly, sparseLid, none: borders([text("output")]) };
    });

    expect(result.pasted, "the lid is the row above the pasted rule").toEqual({ bottom: 0, top: 3, contentEnd: 12 });
    expect(result.padded.contentEnd, "trailing blanks do not count towards the box width").toBe(12);
    expect(result.floorOnly, "a box with no lid is not a box").toBeNull();
    expect(result.sparseLid.contentEnd, "an unfilled lid reports no width").toBe(0);
    expect(result.none, "and no floor means no box at all").toBeNull();
  });
});

// The highlight is painted into the pane in local CSS pixels while the workspace
// zoom scales the whole stage, so its geometry is measured here rather than
// against a live CLI: the placement maths is what breaks, not the TUI.
test.describe("Copilot composer highlight placement under workspace zoom", () => {
  test.describe.configure({ mode: "serial" });

  let page;
  let id;

  // Where the highlight actually lands versus the cells it claims to cover.
  const measure = (terminalId, zoom) => page.evaluate(({ terminalId: target, zoom: percent }) => {
    const terminal = state.terminals.get(target);
    setWorkspaceZoom(percent);
    const row = 2;
    const start = 3;
    const end = 11;
    copilotComposerRegion = () => ({ rows: [{ row, start, end }] });
    terminal.composerSelection = { mode: "all", anchor: 0, head: end - start };
    renderComposerSelection(terminal);

    const band = terminal.screen.querySelector(".pane-composer-selection-band");
    if (!band) return null;
    const screen = terminal.pane.querySelector(".xterm-screen");
    const screenRect = screen.getBoundingClientRect();
    const bandRect = band.getBoundingClientRect();
    const cellWidth = screenRect.width / terminal.term.cols;
    const cellHeight = screenRect.height / terminal.term.rows;
    return {
      topDrift: bandRect.top - (screenRect.top + row * cellHeight),
      leftDrift: bandRect.left - (screenRect.left + start * cellWidth),
      widthDrift: bandRect.width - (end - start) * cellWidth,
      heightDrift: bandRect.height - cellHeight
    };
  }, { terminalId, zoom });

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await startRendererCoverage(page);
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(async () => {
      await page.evaluate(() => closeAllTerminals());
      return page.locator(".terminal-pane").count();
    }, { timeout: 30000 }).toBe(0);
    id = await page.evaluate(() => addTerminal({ reveal: true, runStartup: false }).id);
    await expect.poll(() => page.evaluate((terminalId) => state.terminals.get(terminalId)?.status, id),
      { timeout: 30000 }).toBe("live");
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      setWorkspaceZoom(defaultSettings.workspaceZoom);
      saveSettings();
      closeAllTerminals();
    });
    await stopRendererCoverage(page, "copilot-composer-selection-zoom");
    await page.close();
  });

  // A zoom above 100% used to push the band below the composer, and one below
  // 100% pushed it above, because the maths mixed visual and local pixels.
  for (const zoom of [100, 150, 80, 200]) {
    test(`paints the highlight over the composed text at ${zoom}% zoom`, async () => {
      const drift = await measure(id, zoom);
      expect(drift).not.toBeNull();
      expect(Math.abs(drift.topDrift)).toBeLessThan(1.5);
      expect(Math.abs(drift.leftDrift)).toBeLessThan(1.5);
      expect(Math.abs(drift.widthDrift)).toBeLessThan(1.5);
      expect(Math.abs(drift.heightDrift)).toBeLessThan(1.5);
    });
  }

  // The scroll chevron is parked with the same measurement, so it drifts too.
  for (const zoom of [100, 150, 80]) {
    test(`parks the scroll chevron on the composer edge at ${zoom}% zoom`, async () => {
      await page.evaluate((percent) => setWorkspaceZoom(percent), zoom);
      // The inset is only meaningful once the pane has refit to the new scale.
      await expect.poll(() => page.evaluate((terminalId) => {
        const terminal = state.terminals.get(terminalId);
        const screen = terminal.pane.querySelector(".xterm-screen");
        const container = terminal.pane.querySelector(".terminal-screen");
        return Math.round(container.getBoundingClientRect().bottom - screen.getBoundingClientRect().bottom);
      }, id), { timeout: 15000 }).toBeGreaterThanOrEqual(0);

      const drift = await page.evaluate(({ terminalId, percent }) => {
        const terminal = state.terminals.get(terminalId);
        copilotComposerRows = () => 3;
        terminal.copilotScrollInsetAt = 0;
        syncCopilotScrollInset(terminal);

        const screen = terminal.pane.querySelector(".xterm-screen");
        const container = terminal.pane.querySelector(".terminal-screen");
        const screenRect = screen.getBoundingClientRect();
        const scale = percent / 100;
        const expected = ((container.getBoundingClientRect().bottom - screenRect.bottom)
          + 3 * (screenRect.height / terminal.term.rows)) / scale;
        const applied = Number.parseFloat(terminal.pane.style.getPropertyValue("--pane-scroll-bottom-inset"));
        return applied - expected;
      }, { terminalId: id, percent: zoom });
      expect(Math.abs(drift)).toBeLessThan(1.5);
    });
  }
});

