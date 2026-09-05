const { test, expect } = require("../support/renderer-coverage");

// The control sits over live terminal output, so the risky parts are whether a
// TUI that owns the mouse swallows the click and whether the button is honest
// about alternate-screen buffers, where xterm has no scrollback to move to.
test.describe("Terminal edge scroll controls", () => {
  const freshTerminal = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => closeAllTerminals());
    // A real Copilot pty left by an earlier spec takes a moment to go away.
    await expect(page.locator(".terminal-pane")).toHaveCount(0, { timeout: 30000 });
    await page.evaluate(() => addTerminal({ reveal: true }));
    await expect.poll(() => page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      return terminal ? terminal.status : "none";
    }), { timeout: 30000 }).toBe("live");
    return page.evaluate(() => [...state.terminals.keys()][0]);
  };

  const topButton = (page) => page.locator(".terminal-pane .pane-scroll-top");
  const bottomButton = (page) => page.locator(".terminal-pane .pane-scroll-bottom");

  test("hides Copilot edge controls when its painted thumb fills the scroll track", async ({ page }) => {
    const id = await freshTerminal(page);
    await page.evaluate(async (terminalId) => {
      const terminal = state.terminals.get(terminalId);
      const { term } = terminal;
      terminal.aiAssistantTuiProvider = "copilot";
      terminal.tuiScrollEdge = "middle";
      let frame = "\u001b[?1049h\u001b[2J\u001b[H";
      for (let row = 2; row < term.rows - 6; row += 1) {
        frame += `\u001b[${row + 1};${term.cols}H\u001b[38;2;145;152;161m\u2503`;
      }
      frame += `\u001b[0m\u001b[${term.rows - 4};1H${"\u2584".repeat(term.cols)}`;
      frame += `\u001b[${term.rows - 2};1H${"\u2580".repeat(term.cols)}`;
      await new Promise((resolve) => term.write(frame, resolve));
      syncTerminalScrollControls(terminal);
    }, id);
    await expect(topButton(page)).toBeHidden();
    await expect(bottomButton(page)).toBeHidden();
    await page.locator(".terminal-pane").dispatchEvent("wheel", { deltaY: -100 });
    await expect(bottomButton(page)).toBeHidden();
  });

  test("follows Copilot's painted scroll position across redraws in light and dark themes", async ({ page }) => {
    const id = await freshTerminal(page);
    const themes = [
      { background: "#0d1117", track: "145;152;161", thumb: "240;246;252" },
      { background: "#ffffff", track: "145;152;161", thumb: "31;35;40" }
    ];
    for (const theme of themes) {
      for (const position of ["bottom", "middle", "top", "full", "bottom"]) {
        await page.evaluate(async ({ terminalId, theme, position }) => {
          const terminal = state.terminals.get(terminalId);
          const { term } = terminal;
          terminal.aiAssistantTuiProvider = "copilot";
          terminal.tuiScrollEdge = "middle";
          term.options.theme = { ...term.options.theme, background: theme.background };
          const trackTop = 2;
          const trackBottom = term.rows - 7;
          const thumbTop = position === "top" || position === "full" ? trackTop
            : position === "bottom" ? trackBottom - 2 : trackTop + 3;
          const thumbBottom = position === "full" ? trackBottom : thumbTop + 2;
          let frame = "\u001b[?1049h\u001b[2J\u001b[H";
          for (let row = trackTop; row <= trackBottom; row += 1) {
            const color = row >= thumbTop && row <= thumbBottom ? theme.thumb : theme.track;
            frame += `\u001b[${row + 1};${term.cols}H\u001b[38;2;${color}m\u2503`;
          }
          frame += `\u001b[0m\u001b[${term.rows - 4};1H${"\u2584".repeat(term.cols)}`;
          frame += `\u001b[${term.rows - 2};1H${"\u2580".repeat(term.cols)}`;
          await new Promise((resolve) => term.write(frame, resolve));
        }, { terminalId: id, theme, position });
        if (position === "top" || position === "full") await expect(topButton(page)).toBeHidden();
        else await expect(topButton(page)).toBeVisible();
        if (position === "bottom" || position === "full") await expect(bottomButton(page)).toBeHidden();
        else await expect(bottomButton(page)).toBeVisible();
      }
    }
  });

  test("shows the downward control only while downward scrolling is possible", async ({ page }) => {
    const id = await freshTerminal(page);
    const control = bottomButton(page);
    await expect(control).toBeHidden();
    await page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      for (let line = 0; line < 400; line += 1) term.write(`filler line ${line}\r\n`);
    }, id);
    await expect(topButton(page)).toBeVisible();
    await expect(control).toBeHidden();
    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.scrollToTop(), id);
    await expect(topButton(page)).toBeHidden();
    await expect(control).toBeVisible();

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

    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.scrollToBottom(), id);
    await expect(control).toBeHidden();
    await expect(topButton(page)).toBeVisible();
  });

  test("places the upward control below the queue button without overlap", async ({ page }) => {
    const id = await freshTerminal(page);
    const control = topButton(page);
    await page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      for (let line = 0; line < 400; line += 1) term.write(`filler line ${line}\r\n`);
    }, id);
    await expect(control).toBeVisible();

    const geometry = await control.evaluate((node) => {
      const pane = node.closest(".terminal-pane");
      const screen = node.closest(".terminal-screen").getBoundingClientRect();
      const self = node.getBoundingClientRect();
      const queue = pane.querySelector(".pane-queue-add").getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        fromRight: Math.round(screen.right - self.right),
        fromTop: Math.round(self.top - screen.top),
        radius: style.borderRadius,
        width: Math.round(self.width),
        height: Math.round(self.height),
        overlapsQueue: !(self.right <= queue.left || self.left >= queue.right
          || self.bottom <= queue.top || self.top >= queue.bottom)
      };
    });
    expect(geometry.fromRight).toBeLessThan(24);
    expect(geometry.fromTop).toBeGreaterThan(32);
    expect(geometry.fromTop).toBeLessThan(80);
    expect(geometry.width).toBe(geometry.height);
    expect(geometry.radius).toBe("50%");
    expect(geometry.overlapsQueue).toBe(false);

    await control.hover();
    await expect.poll(
      () => control.evaluate((node) => Number(getComputedStyle(node).opacity))
    ).toBe(1);
  });

  test("keeps the downward control clear of the pid pill in an ordinary shell", async ({ page }) => {
    const id = await freshTerminal(page);
    const control = bottomButton(page);
    await page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      for (let line = 0; line < 400; line += 1) term.write(`filler line ${line}\r\n`);
    }, id);
    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.length > term.rows;
    }, id)).toBe(true);
    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.scrollToTop(), id);
    await expect(control).toBeVisible();

    // Copilot panes lift this control onto their own scroll track; a plain
    // shell must keep the original placement above the pid pill.
    const geometry = await control.evaluate((node) => {
      const pane = node.closest(".terminal-pane");
      const self = node.getBoundingClientRect();
      const status = pane.querySelector(".pane-status").getBoundingClientRect();
      const screen = node.closest(".terminal-screen").getBoundingClientRect();
      return {
        fromBottom: Math.round(screen.bottom - self.bottom),
        inset: pane.style.getPropertyValue("--pane-scroll-bottom-inset"),
        overlapsStatus: !(self.right <= status.left || self.left >= status.right
          || self.bottom <= status.top || self.top >= status.bottom)
      };
    });
    expect(geometry.inset).toBe("");
    expect(geometry.fromBottom).toBe(36);
    expect(geometry.overlapsStatus).toBe(false);
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

    await bottomButton(page).click();

    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.viewportY === term.buffer.active.baseY;
    }, id)).toBe(true);
  });

  test("returns a terminal at the newest line to its oldest retained line", async ({ page }) => {    const id = await freshTerminal(page);
    await page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      for (let line = 0; line < 400; line += 1) term.write(`filler line ${line}\r\n`);
    }, id);
    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.length > term.rows
        && term.buffer.active.viewportY === term.buffer.active.baseY;
    }, id)).toBe(true);

    await topButton(page).click();
    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.viewportY;
    }, id)).toBe(0);
  });

  test("shows both controls in the middle and hides each one at its edge", async ({ page }) => {
    const id = await freshTerminal(page);
    const control = bottomButton(page);

    await page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      for (let line = 0; line < 400; line += 1) term.write(`filler line ${line}\r\n`);
    }, id);
    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.length > term.rows;
    }, id)).toBe(true);

    await expect(topButton(page)).toBeVisible();
    await expect(control).toBeHidden();

    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.scrollToTop(), id);
    await expect(topButton(page)).toBeHidden();
    await expect(control).toBeVisible();

    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.scrollLines(5), id);
    await expect(topButton(page)).toBeVisible();
    await expect(control).toBeVisible();

    // Output arriving underneath must not hide the downward action while the viewport stays up.
    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.write("later line\r\n"), id);
    await expect(control).toBeVisible();

    await control.click();
    await expect(control).toBeHidden();
    await expect(topButton(page)).toBeVisible();
  });

  test("hides itself on an alternate-screen buffer that has no scrollback", async ({ page }) => {
    const id = await freshTerminal(page);
    await expect(topButton(page)).toBeHidden();
    await expect(bottomButton(page)).toBeHidden();

    // Enter the alternate screen exactly as a full-screen TUI does.
    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.write("\u001b[?1049h"), id);
    await expect(topButton(page)).toBeHidden();
    await expect(bottomButton(page)).toBeHidden();

    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.write("\u001b[?1049l"), id);
    await expect(topButton(page)).toBeHidden();
    await expect(bottomButton(page)).toBeHidden();
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

    await expect(topButton(page)).toBeVisible();
    await topButton(page).click();
    await expect(topButton(page)).toBeHidden();
    await expect(bottomButton(page)).toBeVisible();
    await bottomButton(page).click();

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
