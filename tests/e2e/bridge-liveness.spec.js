const { test, expect } = require("../support/renderer-coverage");

test.describe("Bridge liveness recovery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate(() => pendingBridgeRequests.size)).toBe(0);
    await expect.poll(() => page.evaluate(() => state.reconnectTimer)).toBe(null);
  });

  test("acknowledges application heartbeats", async ({ page }) => {
    const sent = await page.evaluate(() => ({
      sent: sendBridgeHeartbeat(),
      timerRunning: state.bridgeHeartbeatTimer !== 0
    }));
    expect(sent).toEqual({ sent: true, timerRunning: true });
    await expect.poll(() => page.evaluate(() => state.bridgeHeartbeatNonce)).toBe("");
    expect(await page.evaluate(() => state.bridgeLastMessageAt)).toBeGreaterThan(0);
  });

  // The installed bridge cannot observe WebSocket pongs, so it probes directly.
  // Answering is what keeps a hidden window alive: our own heartbeat timer only
  // runs while the document is visible.
  test("answers a bridge-initiated liveness probe without disturbing its own heartbeat", async ({ page }) => {
    const result = await page.evaluate(() => {
      const frames = [];
      const realSend = state.socket.send.bind(state.socket);
      state.socket.send = (payload) => {
        frames.push(JSON.parse(payload));
        return realSend(payload);
      };
      state.bridgeHeartbeatNonce = "mine";
      handleBridgeMessage({ type: "heartbeat", nonce: "probe-from-bridge" });
      const afterProbe = state.bridgeHeartbeatNonce;
      handleBridgeMessage({ type: "heartbeat", nonce: "mine" });
      const afterOwn = state.bridgeHeartbeatNonce;
      state.socket.send = realSend;
      return { frames, afterProbe, afterOwn };
    });

    expect(result.frames).toEqual([{ type: "heartbeat", nonce: "probe-from-bridge", reply: true }]);
    // A probe must not be mistaken for the answer we were waiting for.
    expect(result.afterProbe).toBe("mine");
    expect(result.afterOwn).toBe("");
  });

  test("ignores an unsupported heartbeat response from an older bridge", async ({ page }) => {    const result = await page.evaluate(() => {
      const before = elements.bridgeStatus.textContent;
      handleBridgeMessage({ type: "error", message: "Unsupported message type: heartbeat" });
      return {
        before,
        after: elements.bridgeStatus.textContent,
        connected: state.socketReady
      };
    });
    expect(result.after).toBe(result.before);
    expect(result.connected).toBe(true);
  });

  test("replaces a socket that remains open without responding", async ({ page }) => {
    const result = await page.evaluate(() => {
      const previous = {
        bridgeClosingDown: state.bridgeClosingDown,
        bridgeHeartbeatCheckedAt: state.bridgeHeartbeatCheckedAt,
        bridgeLastMessageAt: state.bridgeLastMessageAt,
        reconnectAttempts: state.reconnectAttempts,
        settingsTimeout: state.settings.bridgeHeartbeatTimeoutSeconds,
        socket: state.socket,
        socketReady: state.socketReady,
        terminals: state.terminals
      };
      const closeCalls = [];
      const staleSocket = {
        readyState: WebSocket.OPEN,
        close: (code, reason) => closeCalls.push({ code, reason }),
        send() {}
      };

      stopBridgeHeartbeat();
      state.terminals = new Map();
      state.bridgeClosingDown = false;
      state.reconnectAttempts = 0;
      state.reconnectTimer = null;
      state.settings.bridgeHeartbeatTimeoutSeconds = 10;
      state.socket = staleSocket;
      state.socketReady = true;
      state.bridgeLastMessageAt = 1_000;
      state.bridgeHeartbeatCheckedAt = 1_000;
      state.bridgeHeartbeatSentAt = 1_000;

      const schedulingDelayExpired = checkBridgeHeartbeat(11_000);
      const connectedAfterSchedulingDelay = state.socket === staleSocket && state.socketReady;
      const lastMessageResetAfterSchedulingDelay = state.bridgeLastMessageAt;
      state.bridgeLastMessageAt = 1_000;
      state.bridgeHeartbeatCheckedAt = 20_000;
      const expired = checkBridgeHeartbeat(21_000);
      const disconnected = {
        closeCalls,
        connectedAfterSchedulingDelay,
        expired,
        lastMessageResetAfterSchedulingDelay,
        reconnectAttempts: state.reconnectAttempts,
        reconnectTimerArmed: state.reconnectTimer !== null,
        schedulingDelayExpired,
        socketDetached: state.socket === null,
        socketReady: state.socketReady
      };
      const replacementSocket = {};
      state.socket = replacementSocket;
      disconnected.staleCloseIgnored = !transitionBridgeDisconnected(staleSocket, {}, "late close");

      window.clearTimeout(state.reconnectTimer);
      state.bridgeClosingDown = previous.bridgeClosingDown;
      state.bridgeHeartbeatCheckedAt = previous.bridgeHeartbeatCheckedAt;
      state.bridgeLastMessageAt = Date.now();
      state.reconnectAttempts = previous.reconnectAttempts;
      state.reconnectTimer = null;
      state.settings.bridgeHeartbeatTimeoutSeconds = previous.settingsTimeout;
      state.socket = previous.socket;
      state.socketReady = previous.socketReady;
      state.terminals = previous.terminals;
      if (previous.socketReady && previous.socket?.readyState === WebSocket.OPEN) startBridgeHeartbeat();
      updateTerminalActions();
      return disconnected;
    });

    expect(result).toEqual({
      closeCalls: [{ code: 4000, reason: "Bridge heartbeat timed out" }],
      connectedAfterSchedulingDelay: true,
      expired: true,
      lastMessageResetAfterSchedulingDelay: 11_000,
      reconnectAttempts: 1,
      reconnectTimerArmed: true,
      schedulingDelayExpired: false,
      socketDetached: true,
      socketReady: false,
      staleCloseIgnored: true
    });
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });
});