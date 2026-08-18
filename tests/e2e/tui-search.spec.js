const { test, expect } = require("../support/renderer-coverage");

// A TUI (Copilot) puts the pane on the alternate screen, which has no
// scrollback: whatever scrolls past inside it is discarded by xterm, so it can
// only be found if it was retained while streaming.
test.describe("Searching TUI scrollback", () => {
  const ready = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => closeAllTerminals());
    // A real Copilot pty left by an earlier spec takes a moment to go away.
    await expect(page.locator(".terminal-pane")).toHaveCount(0, { timeout: 30000 });
    await page.evaluate(() => addTerminal({ reveal: true }));
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0]?.status || "none"),
      { timeout: 30000 }).toBe("live");
  };

  const fillTui = (page) => page.evaluate(() => {
    const [terminal] = [...state.terminals.values()];
    let payload = "\u001b[?1049h";
    for (let i = 1; i <= 120; i += 1) payload += `MARKER-${i} some scrolled content\r\n`;
    writeTerminal(terminal, payload);
  });

  const bufferHas = (page, needle) => page.evaluate((text) => {
    const buffer = [...state.terminals.values()][0].term.buffer.active;
    for (let i = 0; i < buffer.length; i += 1) {
      if ((buffer.getLine(i)?.translateToString(true) || "").includes(text)) return true;
    }
    return false;
  }, needle);

  // writeTerminal batches output through the renderer's flush queue, so wait for
  // the content to reach the buffer instead of guessing how long that takes.
  const waitForBuffer = (page, needle) =>
    expect.poll(() => bufferHas(page, needle), { timeout: 15000 }).toBe(true);

  const search = async (page, query) => {
    await page.evaluate((q) => {
      elements.terminalSearchInput.value = q;
      state.terminalSearch = q;
      applyTerminalSearch();
    }, query);
    return page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      return {
        hidden: terminal.pane.classList.contains("is-search-hidden"),
        historyMatch: terminal.pane.classList.contains("has-history-match")
      };
    });
  };

  test("xterm really does discard what a TUI scrolls past", async ({ page }) => {
    await ready(page);
    await fillTui(page);
    await waitForBuffer(page, "MARKER-120 ");
    const buffers = await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      const read = (buffer) => {
        const lines = [];
        for (let i = 0; i < buffer.length; i += 1) lines.push(buffer.getLine(i)?.translateToString(true) || "");
        return lines.join("\n");
      };
      return {
        type: terminal.term.buffer.active.type,
        earlyInActive: read(terminal.term.buffer.active).includes("MARKER-3 "),
        earlyInNormal: read(terminal.term.buffer.normal).includes("MARKER-3 "),
        lateInActive: read(terminal.term.buffer.active).includes("MARKER-118 ")
      };
    });
    expect(buffers.type).toBe("alternate");
    // This is why the buffer alone can never answer the search.
    expect(buffers.earlyInActive).toBe(false);
    expect(buffers.earlyInNormal).toBe(false);
    expect(buffers.lateInActive).toBe(true);
  });

  test("keeps a pane whose scrolled-past TUI output matches", async ({ page }) => {
    await ready(page);
    await fillTui(page);
    await waitForBuffer(page, "MARKER-120 ");

    const early = await search(page, "MARKER-3 ");
    expect(early.hidden).toBe(false);
    // It cannot be highlighted, so it is flagged as a history-only match.
    expect(early.historyMatch).toBe(true);

    const visible = await search(page, "MARKER-118 ");
    expect(visible.hidden).toBe(false);
    expect(visible.historyMatch).toBe(false);

    const absent = await search(page, "MARKER-NOT-PRESENT");
    expect(absent.hidden).toBe(true);
  });

  test("does not retain output from an ordinary shell pane", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      writeTerminal(terminal, "ordinary shell output\r\n");
    });
    await waitForBuffer(page, "ordinary shell output");
    const retained = await page.evaluate(() => [...state.terminals.values()][0].tuiTranscript || "");
    expect(retained).toBe("");
  });

  test("separates retained matches and their context lines", async ({ page }) => {
    await ready(page);
    await fillTui(page);
    await waitForBuffer(page, "MARKER-120 ");
    await search(page, "MARKER-");
    await page.evaluate(() => openTuiSearchResults([...state.terminals.values()][0]));
    await expect(page.locator("#tuiSearchOverlay")).toBeVisible();

    const spacing = await page.locator("#tuiSearchList").evaluate((list) => {
      const rows = [...list.querySelectorAll(".tui-search-row")];
      const first = rows[0].getBoundingClientRect();
      const second = rows[1].getBoundingClientRect();
      const lines = [...rows[0].children].map((line) => line.getBoundingClientRect());
      return {
        resultGap: second.top - first.bottom,
        contextGapBefore: lines[1].top - lines[0].bottom,
        contextGapAfter: lines[2].top - lines[1].bottom,
        rowHeight: first.height,
        listMaxHeight: getComputedStyle(list).maxHeight
      };
    });
    expect(spacing.resultGap).toBeGreaterThanOrEqual(8);
    expect(spacing.contextGapBefore).toBeGreaterThanOrEqual(3);
    expect(spacing.contextGapAfter).toBeGreaterThanOrEqual(3);
    expect(spacing.rowHeight).toBeGreaterThan(65);
    expect(spacing.listMaxHeight).toBe("420px");
  });

  test("marks the pane mid-scroll when an upward step reveals a retained match", async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      const original = {
        searchTerminalPane,
        syncTerminalScrollControls,
        terminalVisibleText,
        tuiScrollStep
      };
      let steps = 0;
      let searches = 0;
      let syncs = 0;
      try {
        terminalVisibleText = () => steps > 0 ? "the retained needle is visible" : "not yet";
        tuiScrollStep = () => { steps += 1; };
        syncTerminalScrollControls = () => { syncs += 1; };
        searchTerminalPane = () => { searches += 1; };
        const response = await jumpToTuiMatch(terminal, "needle");
        return { edge: terminal.tuiScrollEdge, response, searches, steps, syncs };
      } finally {
        searchTerminalPane = original.searchTerminalPane;
        syncTerminalScrollControls = original.syncTerminalScrollControls;
        terminalVisibleText = original.terminalVisibleText;
        tuiScrollStep = original.tuiScrollStep;
      }
    });

    expect(result).toEqual({
      edge: "middle",
      response: { ok: true, steps: 1 },
      searches: 1,
      steps: 1,
      syncs: 2
    });
  });
});
