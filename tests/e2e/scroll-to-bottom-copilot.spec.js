const { test, expect } = require("../support/renderer-coverage");

// Copilot CLI takes over the alternate screen, where xterm keeps no scrollback
// at all (baseY and viewportY are pinned to 0). A scroll-to-bottom control is
// meaningless there, so the real requirement is that it disappears for the
// duration and comes back, working, the moment Copilot gives the screen up.
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

  test("hides for the full-screen session and returns usable afterwards", async ({ page }) => {
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
    await expect(control(page)).toBeHidden();

    // The alternate buffer flips the moment Copilot claims the screen, well
    // before it has painted its composer, so wait for the UI itself.
    await expect.poll(async () => (await readBuffer(page, id)).text,
      { timeout: 120000, intervals: [1000] }).toMatch(/commands|help/i);
    const duringCopilot = await readBuffer(page, id);
    expect(duringCopilot.type).toBe("alternate");
    // Nothing to scroll to on the alternate screen; the hidden control is honest.
    expect(duringCopilot.baseY).toBe(0);
    await expect(control(page)).toBeHidden();

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
