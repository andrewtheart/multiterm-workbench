const { test, expect } = require("../support/renderer-coverage");

// Copilot CLI owns scrolling inside its alternate-screen TUI, so xterm's
// scrollToBottom cannot move it. The control stays available and drives the
// same mouse-wheel path used when selecting retained TUI search results.
test.describe("Terminal edge scroll controls with a live Copilot TUI", () => {
  test.describe.configure({ mode: "serial" });

  const topControl = (page, id) => page.locator(`.terminal-pane[data-id="${id}"] .pane-scroll-top`);
  const bottomControl = (page, id) => page.locator(`.terminal-pane[data-id="${id}"] .pane-scroll-bottom`);

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
    await page.evaluate(() => closeAllTerminals());
    await expect(page.locator(".terminal-pane")).toHaveCount(0, { timeout: 30000 });
    await page.evaluate(() => addTerminal({ reveal: true }));
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
    await expect(topControl(page, id)).toBeVisible();
    await expect(bottomControl(page, id)).toBeVisible();
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
    await expect(topControl(page, id)).toBeVisible();
    await expect(topControl(page, id)).toHaveAttribute("aria-label", "Scroll Copilot to the top");
    await expect(bottomControl(page, id)).toBeVisible();
    await expect(bottomControl(page, id)).toHaveAttribute("aria-label", "Scroll Copilot to the bottom");

    // The chevron parks on the end of Copilot's own scroll track, which stops
    // above its composer, rather than floating over the composer at the floor.
    const placement = await page.evaluate((terminalId) => {
      const terminal = state.terminals.get(terminalId);
      const pane = terminal.pane;
      const screen = pane.querySelector(".xterm-screen");
      const container = pane.querySelector(".terminal-screen");
      const screenRect = screen.getBoundingClientRect();
      const button = pane.querySelector(".pane-scroll-bottom").getBoundingClientRect();
      const composerRows = copilotComposerRows(terminal);
      // Prove the composer was genuinely located rather than falling back.
      const buffer = terminal.term.buffer.active;
      const lastRow = buffer.viewportY + terminal.term.rows - 1;
      const borderOffsets = [];
      for (let offset = 0; offset < 10; offset += 1) {
        const text = buffer.getLine(lastRow - offset)?.translateToString(true) ?? "";
        if (/[\u2500\u2501\u2504\u2505\u2508\u2509\u2550\u2580\u2584]{8,}/.test(text)) borderOffsets.push(offset);
      }
      return {
        borderOffsets,
        composerRows,
        expectedLift: Math.round(composerRows * (screenRect.height / terminal.term.rows)),
        actualLift: Math.round(screenRect.bottom - button.bottom),
        floorGap: Math.round(container.getBoundingClientRect().bottom - screenRect.bottom),
        inset: pane.style.getPropertyValue("--pane-scroll-bottom-inset"),
        rightAligned: Math.round(screenRect.right - button.right)
      };
    }, id);
    expect(placement.borderOffsets.length).toBeGreaterThan(0);
    expect(placement.composerRows).toBe(placement.borderOffsets[placement.borderOffsets.length - 1] + 1);
    expect(placement.inset).not.toBe("");
    expect(Math.abs(placement.actualLift - placement.expectedLift)).toBeLessThanOrEqual(1);
    // Horizontal placement is shared with the up chevron and must not move.
    expect(placement.rightAligned).toBeLessThanOrEqual(0);

    const tuiScroll = await page.evaluate(async (terminalId) => {
      const terminal = state.terminals.get(terminalId);
      const topButton = terminal.pane.querySelector(".pane-scroll-top");
      const bottomButton = terminal.pane.querySelector(".pane-scroll-bottom");
      const originalVisibleText = terminalVisibleText;
      const originalSendBridge = window.sendBridge;
      const downFrames = [];
      const upFrames = [];
      let position = 0;
      let pendingPosition = 0;
      let renderTimer = 0;
      try {
        // Scrolling down while already at the bottom moves nothing, so the
        // control must stay faint until a real upward scroll happens.
        bottomButton.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
        const bottomWheelState = {
          top: topButton.classList.contains("is-scrolled-down"),
          bottom: bottomButton.classList.contains("is-scrolled-up")
        };
        bottomButton.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -100 }));
        const middleState = {
          top: topButton.classList.contains("is-scrolled-down"),
          bottom: bottomButton.classList.contains("is-scrolled-up")
        };
        terminalVisibleText = () => `copilot-scroll-position-${position}`;
        window.sendBridge = (message) => {
          if (message.id === terminalId && message.data === "\u001b[<65;1;1M") {
            downFrames.push(message);
            if (pendingPosition < 3) pendingPosition += 1;
          } else if (message.id === terminalId && message.data === "\u001b[<64;1;1M") {
            upFrames.push(message);
            if (pendingPosition > 0) pendingPosition -= 1;
          }
          if (!renderTimer && position !== pendingPosition) {
            // A busy TUI can process input before xterm receives its repaint.
            // The quick sample must not mistake that lag for either edge.
            renderTimer = window.setTimeout(() => {
              position = pendingPosition;
              renderTimer = 0;
            }, 80);
          }
          return true;
        };
        bottomButton.click();
        while (terminal.tuiScrollActive) {
          await new Promise((resolve) => window.setTimeout(resolve, 20));
        }
        const bottomState = {
          top: topButton.classList.contains("is-scrolled-down"),
          bottom: bottomButton.classList.contains("is-scrolled-up")
        };
        position = 3;
        pendingPosition = 3;
        topButton.click();
        while (terminal.tuiScrollActive) {
          await new Promise((resolve) => window.setTimeout(resolve, 20));
        }
        return {
          busy: topButton.hasAttribute("aria-busy") || bottomButton.hasAttribute("aria-busy"),
          downFrames,
          upFrames,
          bottomWheelState,
          middleState,
          bottomState,
          topState: {
            top: topButton.classList.contains("is-scrolled-down"),
            bottom: bottomButton.classList.contains("is-scrolled-up")
          },
          timing: {
            batchSteps: TUI_EDGE_SCROLL_BATCH_STEPS,
            settleMs: TUI_EDGE_SCROLL_SETTLE_MS,
            confirmMs: TUI_EDGE_SCROLL_CONFIRM_MS
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
      downFrames: Array.from({ length: 16 }, () => ({
        type: "input",
        id,
        data: "\u001b[<65;1;1M"
      })),
      upFrames: Array.from({ length: 16 }, () => ({
        type: "input",
        id,
        data: "\u001b[<64;1;1M"
      })),
      bottomWheelState: { top: true, bottom: false },
      middleState: { top: true, bottom: true },
      bottomState: { top: true, bottom: false },
      topState: { top: false, bottom: true },
      timing: { batchSteps: 8, settleMs: 30, confirmMs: 120 }
    });

    await page.evaluate((terminalId) => {
      sendBridge({ type: "input", id: terminalId, data: "/exit\r" });
    }, id);
    await expect.poll(async () => (await readBuffer(page, id)).type,
      { timeout: 90000, intervals: [1000] }).toBe("normal");

    // Back on the normal screen the pre-Copilot scrollback is still there and
    // the control works on it.
    await expect(topControl(page, id)).toBeVisible();
    await expect(bottomControl(page, id)).toBeVisible();
    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.baseY > 0;
    }, id), { timeout: 30000 }).toBe(true);

    await page.evaluate((terminalId) => state.terminals.get(terminalId).term.scrollToTop(), id);
    expect((await readBuffer(page, id)).viewportY).toBe(0);

    await bottomControl(page, id).click();
    await expect.poll(() => page.evaluate((terminalId) => {
      const { term } = state.terminals.get(terminalId);
      return term.buffer.active.viewportY === term.buffer.active.baseY;
    }, id)).toBe(true);
  });
});
