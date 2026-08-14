const { test, expect } = require("../support/renderer-coverage");

// Copilot CLI owns scrolling inside its alternate-screen TUI, so xterm's
// scrollToBottom cannot move it. The control stays available and drives the
// same mouse-wheel path used when selecting retained TUI search results.
test.describe("Scroll to bottom control with a live Copilot TUI", () => {
  test.describe.configure({ mode: "serial" });

  const control = (page) => page.locator(".terminal-pane .pane-scroll-bottom");

  const readBuffer = (page, id) => page.evaluate((terminalId) => {
    const { term } = state.terminals.get(terminalId);
    const buffer = term.buffer.active;
    const lines = [];
    for (let i = 0; i < buffer.length; i += 1) {
      lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
    }
    return {
      type: buffer.type,
      baseY: buffer.baseY,
      viewportY: buffer.viewportY,
      text: lines.join("\n")
    };
  }, id);

  test("scrolls the full-screen Copilot session and returns to xterm scrolling afterwards", async ({ page }) => {
    test.setTimeout(240000);
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
    const id = await page.evaluate(() => [...state.terminals.keys()][0]);

    // Enough scrollback that the control has real work to do before and after.
    await page.evaluate((terminalId) => {
      sendBridge({ type: "input", id: terminalId, data: "1..120 | ForEach-Object { \"pre-copilot line $_\" }\r" });
    }, id);
    await expect.poll(async () => (await readBuffer(page, id)).text, { timeout: 60000 })
      .toContain("pre-copilot line 120");
    await expect(control(page)).toBeVisible();
    expect((await readBuffer(page, id)).type).toBe("normal");

    await page.evaluate((terminalId) => {
      sendBridge({ type: "input", id: terminalId, data: "copilot --yolo\r" });
    }, id);

    // Copilot has the screen once xterm reports the alternate buffer.
    await expect.poll(async () => (await readBuffer(page, id)).type,
      { timeout: 150000, intervals: [1000] }).toBe("alternate");

    // Wait for the UI itself rather than relying on the brief transition
    // between alternate-screen activation and provider recognition.
    await expect.poll(async () => (await readBuffer(page, id)).text,
      { timeout: 120000, intervals: [1000] }).toMatch(/commands|help/i);
    const duringCopilot = await readBuffer(page, id);
    expect(duringCopilot.type).toBe("alternate");
    expect(duringCopilot.baseY).toBe(0);
    await expect(control(page)).toBeVisible();
    await expect(control(page)).toHaveAttribute("aria-label", "Scroll Copilot to the bottom");

    const tuiScroll = await page.evaluate(async (terminalId) => {
      const terminal = state.terminals.get(terminalId);
      const button = terminal.pane.querySelector(".pane-scroll-bottom");
      const originalVisibleText = terminalVisibleText;
      const originalSendBridge = window.sendBridge;
      const frames = [];
      let position = 0;
      let pendingPosition = 0;
      let renderTimer = 0;
      try {
        button.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -100 }));
        const scrolledUpBefore = button.classList.contains("is-scrolled-up");
        terminalVisibleText = () => `copilot-scroll-position-${position}`;
        window.sendBridge = (message) => {
          if (message.id === terminalId && message.data === "\u001b[<65;1;1M") {
            frames.push(message);
            if (pendingPosition < 3) pendingPosition += 1;
            if (!renderTimer && position !== pendingPosition) {
              // A busy TUI can process input before xterm receives its repaint.
              // The quick sample must not mistake that lag for the bottom.
              renderTimer = window.setTimeout(() => {
                position = pendingPosition;
                renderTimer = 0;
              }, 80);
            }
          }
          return true;
        };
        button.click();
        while (terminal.tuiScrollToBottomActive) {
          await new Promise((resolve) => window.setTimeout(resolve, 20));
        }
        return {
          busy: button.hasAttribute("aria-busy"),
          frames,
          scrolledUpBefore,
          scrolledUp: button.classList.contains("is-scrolled-up"),
          timing: {
            batchSteps: TUI_SCROLL_TO_BOTTOM_BATCH_STEPS,
            settleMs: TUI_SCROLL_TO_BOTTOM_SETTLE_MS,
            confirmMs: TUI_SCROLL_TO_BOTTOM_CONFIRM_MS
          }
        };
      } finally {
        window.clearTimeout(renderTimer);
        terminalVisibleText = originalVisibleText;
        window.sendBridge = originalSendBridge;
      }
    }, id);
    expect(tuiScroll).toEqual({
      busy: false,
      frames: Array.from({ length: 8 }, () => ({
        type: "input",
        id,
        data: "\u001b[<65;1;1M"
      })),
      scrolledUpBefore: true,
      scrolledUp: false,
      timing: { batchSteps: 4, settleMs: 45, confirmMs: 120 }
    });

    await page.evaluate((terminalId) => {
      sendBridge({ type: "input", id: terminalId, data: "/exit\r" });
    }, id);
    await expect.poll(async () => (await readBuffer(page, id)).type,
      { timeout: 90000, intervals: [1000] }).toBe("normal");

    // Back on the normal screen the pre-Copilot scrollback is still there and
    // the control works on it.
    await expect(control(page)).toBeVisible();
    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.baseY > 0;
    }, id), { timeout: 30000 }).toBe(true);

    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.scrollToTop(), id);
    expect((await readBuffer(page, id)).viewportY).toBe(0);

    await control(page).click();
    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.viewportY === term.buffer.active.baseY;
    }, id)).toBe(true);
  });
});
