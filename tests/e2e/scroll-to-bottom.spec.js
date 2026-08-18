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

  test("sits faint in the bottom-right corner and brightens on hover", async ({ page }) => {
    await freshTerminal(page);
    const control = bottomButton(page);
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

  test("places the upward control below the queue button without overlap", async ({ page }) => {
    await freshTerminal(page);
    const control = topButton(page);
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

    expect(await control.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeLessThan(0.35);
    await control.hover();
    await expect.poll(
      () => control.evaluate((node) => Number(getComputedStyle(node).opacity))
    ).toBe(1);
  });

  test("keeps the downward control clear of the pid pill in an ordinary shell", async ({ page }) => {
    await freshTerminal(page);
    const control = bottomButton(page);
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

  test("brightens while scrolled away from the bottom and fades once it arrives", async ({ page }) => {
    const id = await freshTerminal(page);
    const control = bottomButton(page);
    const opacity = () => control.evaluate((node) => Number(getComputedStyle(node).opacity));

    await page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      for (let line = 0; line < 400; line += 1) term.write(`filler line ${line}\r\n`);
    }, id);
    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.length > term.rows;
    }, id)).toBe(true);

    // Sitting at the newest line there is nowhere to jump to.
    expect(await opacity()).toBeLessThan(0.35);

    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.scrollToTop(), id);
    await expect.poll(opacity).toBeGreaterThan(0.5);

    // Output arriving underneath must not fade it back while still scrolled up.
    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.write("later line\r\n"), id);
    expect(await opacity()).toBeGreaterThan(0.5);

    await control.click();
    // Clicking leaves the pointer on the button, and :hover is deliberately
    // fully opaque, so step off it before reading the resting state.
    await page.mouse.move(5, 5);
    await expect.poll(opacity).toBeLessThan(0.35);
  });

  test("hides itself on an alternate-screen buffer that has no scrollback", async ({ page }) => {
    const id = await freshTerminal(page);
    await expect(topButton(page)).toBeVisible();
    await expect(bottomButton(page)).toBeVisible();

    // Enter the alternate screen exactly as a full-screen TUI does.
    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.write("\u001b[?1049h"), id);
    await expect(topButton(page)).toBeHidden();
    await expect(bottomButton(page)).toBeHidden();

    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.write("\u001b[?1049l"), id);
    await expect(topButton(page)).toBeVisible();
    await expect(bottomButton(page)).toBeVisible();
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
    await topButton(page).click();
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
