// Verifies the bridge WebSocket auto-reconnects after an unexpected drop and
// re-attaches the sessions the server kept alive — so the UI recovers on its
// own instead of staying stuck offline until a manual page reload.

const { test, expect } = require("@playwright/test");

test.describe.configure({ mode: "serial" });

test.describe("Bridge auto-reconnect", () => {
  let context;
  let page;
  const pageErrors = [];

  const socketReady = () => page.evaluate(() => state.socketReady);
  const statusOf = (id) => page.evaluate((i) => state.terminals.get(i)?.status ?? null, id);

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199" });
    page = await context.newPage();
    page.on("pageerror", (err) => pageErrors.push(String(err.message || err)));
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });

  test.afterAll(async () => {
    await context.close();
  });

  // Bring the server to a known-empty session state, then create exactly one
  // fresh terminal and wait until the bridge confirms it live.
  async function freshLiveTerminal() {
    await page.evaluate(() => closeAllTerminals());
    // Let the "exit" reach each pty (+1.5s force-kill fallback) so no orphan
    // sessions linger on the server to be re-adopted on reconnect.
    await page.waitForTimeout(2000);
    const id = await page.evaluate(() => addTerminal().id);
    await expect.poll(() => statusOf(id), { timeout: 15000 }).toBe("live");
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    return id;
  }

  test("recovers automatically after the socket drops and re-attaches the session", async () => {
    const id = await freshLiveTerminal();

    // Force an unexpected disconnect.
    await page.evaluate(() => state.socket.close());

    // The drop is observed: offline status + a visible "reconnecting" hint.
    await expect.poll(socketReady).toBe(false);
    await expect(page.locator("#statusConn")).toHaveText("Disconnected");
    await expect(page.locator("#bridgeStatus")).toContainText("reconnecting");

    // It comes back on its own — no reload.
    await expect.poll(socketReady, { timeout: 15000 }).toBe(true);
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    // The kept-alive session is re-attached and marked live again (same id,
    // no duplicate pane).
    await expect.poll(() => statusOf(id), { timeout: 15000 }).toBe("live");
    await expect(page.locator(".terminal-pane")).toHaveCount(1);

    // The attempt counter resets after a successful reconnect.
    expect(await page.evaluate(() => state.reconnectAttempts)).toBe(0);
  });

  test("control commands work again after reconnecting", async () => {
    await freshLiveTerminal();

    await page.evaluate(() => state.socket.close());
    await expect.poll(socketReady).toBe(false);
    await expect.poll(socketReady, { timeout: 15000 }).toBe(true);

    // Before auto-reconnect existed, sendBridge stayed false forever here and
    // closeAllTerminals early-returned, leaving sessions stuck. Now it works.
    expect(await page.evaluate(() => sendBridge({ type: "list" }))).toBe(true);
    await page.evaluate(() => closeAllTerminals());
    await expect(page.locator("#statusSessions")).toHaveText("0 sessions");
  });

  test("survives several consecutive drops", async () => {
    const id = await freshLiveTerminal();
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => state.socket.close());
      await expect.poll(socketReady).toBe(false);
      await expect.poll(socketReady, { timeout: 15000 }).toBe(true);
    }
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => statusOf(id), { timeout: 15000 }).toBe("live");
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    expect(pageErrors, "no uncaught errors across reconnect churn").toEqual([]);
  });
});
