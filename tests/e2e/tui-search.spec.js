const { test, expect } = require("../support/renderer-coverage");

// A TUI (Copilot) puts the pane on the alternate screen, which has no
// scrollback: whatever scrolls past inside it is discarded by xterm, so it can
// only be found if it was retained while streaming.
test.describe("Searching TUI scrollback", () => {
  const ready = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      closeAllTerminals();
      addTerminal({ reveal: true });
    });
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0]?.status || "none"),
      { timeout: 30000 }).toBe("live");
  };

  const fillTui = (page) => page.evaluate(() => {
    const [terminal] = [...state.terminals.values()];
    let payload = "\u001b[?1049h";
    for (let i = 1; i <= 120; i += 1) payload += `MARKER-${i} some scrolled content\r\n`;
    writeTerminal(terminal, payload);
  });

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
    await page.waitForTimeout(900);
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
    await page.waitForTimeout(900);

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
    await page.waitForTimeout(400);
    const retained = await page.evaluate(() => [...state.terminals.values()][0].tuiTranscript || "");
    expect(retained).toBe("");
  });
});
