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

  // How many sessions the bridge still holds. A throwaway socket's welcome
  // payload is exactly what a reconnect is handed, so this answers the only
  // question that matters here: would reconnecting re-adopt anything?
  const bridgeSessionCount = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const probe = new WebSocket(`${protocol}//${window.location.host}/ws`);
          probe.addEventListener("message", (event) => {
            const message = JSON.parse(event.data);
            if (message.type !== "welcome") return;
            probe.close();
            resolve(message.sessions.length);
          });
          probe.addEventListener("error", () => reject(new Error("probe socket failed")));
        })
    );

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
    // The bridge only forgets a session once its pty has really exited, and it
    // deliberately staggers teardown and gives each shell seconds of grace to
    // leave on its own. Anything still in that map when the socket drops gets
    // re-adopted on reconnect, so wait for the map to actually be empty — a
    // fixed delay here silently rots as earlier specs leave more to clear.
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(0);
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
