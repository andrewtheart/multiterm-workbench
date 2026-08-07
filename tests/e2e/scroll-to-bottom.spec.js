const { test, expect } = require("../support/renderer-coverage");

// The control sits over live terminal output, so the risky parts are whether a
// TUI that owns the mouse swallows the click and whether the button is honest
// about alternate-screen buffers, where xterm has no scrollback to move to.
test.describe("Scroll to bottom control", () => {
  const freshTerminal = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      closeAllTerminals();
      addTerminal({ reveal: true });
    });
    await expect.poll(() => page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      return terminal ? terminal.status : "none";
    }), { timeout: 30000 }).toBe("live");
    return page.evaluate(() => [...state.terminals.keys()][0]);
  };

  const button = (page) => page.locator(".terminal-pane .pane-scroll-bottom");

  test("sits faint in the bottom-right corner and brightens on hover", async ({ page }) => {
    await freshTerminal(page);
    const control = button(page);
    await expect(control).toBeVisible();

    const idle = await control.evaluate((node) => Number(getComputedStyle(node).opacity));
    expect(idle).toBeLessThan(0.35);

    const geometry = await control.evaluate((node) => {
      const pane = node.closest(".terminal-pane");
      const screen = node.closest(".terminal-screen").getBoundingClientRect();
      const self = node.getBoundingClientRect();
      const status = pane.querySelector(".pane-status").getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        fromRight: Math.round(screen.right - self.right),
        fromBottom: Math.round(screen.bottom - self.bottom),
        radius: style.borderRadius,
        width: Math.round(self.width),
        height: Math.round(self.height),
        overlapsStatus: !(self.right <= status.left || self.left >= status.right
          || self.bottom <= status.top || self.top >= status.bottom)
      };
    });
    expect(geometry.fromRight).toBeLessThan(24);
    expect(geometry.fromBottom).toBeLessThan(72);
    // A circle, not a rounded square.
    expect(geometry.width).toBe(geometry.height);
    expect(geometry.radius).toBe("50%");
    // The pid pill already owns the very corner; two faint overlapping shapes
    // read as a smudge.
    expect(geometry.overlapsStatus).toBe(false);

    await control.hover();
    await expect.poll(
      () => control.evaluate((node) => Number(getComputedStyle(node).opacity))
    ).toBe(1);
  });

  test("returns a scrolled-back terminal to the newest line", async ({ page }) => {
    const id = await freshTerminal(page);
    await page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      for (let line = 0; line < 400; line += 1) term.write(`filler line ${line}\r\n`);
    }, id);

    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.length > term.rows;
    }, id)).toBe(true);

    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.scrollToTop(), id);
    const scrolledUp = await page.evaluate(
      (terminalId) => state.terminals.get(terminalId).term.buffer.active.viewportY, id
    );
    expect(scrolledUp).toBe(0);

    await button(page).click();

    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.viewportY === term.buffer.active.baseY;
    }, id)).toBe(true);
  });

  test("hides itself on an alternate-screen buffer that has no scrollback", async ({ page }) => {
    const id = await freshTerminal(page);
    await expect(button(page)).toBeVisible();

    // Enter the alternate screen exactly as a full-screen TUI does.
    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.write("\u001b[?1049h"), id);
    await expect(button(page)).toBeHidden();

    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.write("\u001b[?1049l"), id);
    await expect(button(page)).toBeVisible();
  });

  test("does not leak the click into a mouse-reporting TUI", async ({ page }) => {
    const id = await freshTerminal(page);
    await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      window.__ptyWrites = [];
      terminal.term.onData((data) => window.__ptyWrites.push(data));
      // Ask for SGR mouse reporting, which is what a mouse-aware TUI enables.
      terminal.term.write("\u001b[?1000h\u001b[?1006h");
      for (let line = 0; line < 200; line += 1) terminal.term.write(`row ${line}\r\n`);
    }, id);

    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.scrollToTop(), id);
    await button(page).click();

    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.viewportY === term.buffer.active.baseY;
    }, id)).toBe(true);
    // A focus report is legitimate -- clicking hands focus back to the terminal,
    // exactly as clicking its output would. A mouse report is the actual leak,
    // because the TUI would act on a click it never received.
    const written = await page.evaluate(() => window.__ptyWrites.join(""));
    expect(written).not.toContain("\u001b[<");
    expect(written.replace(/\u001b\[[IO]/g, "")).toBe("");
  });
});
