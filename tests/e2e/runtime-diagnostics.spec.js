"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("../support/renderer-coverage");

test.describe("Runtime diagnostics", () => {
  test("persists sanitized records and loads the durable viewer tail", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    const marker = `durable-${Date.now()}`;

    await page.evaluate((marker) => {
      log.warn("diagnostic-test", marker, {
        requestId: "durable-request",
        terminalOutput: "must not persist"
      });
    }, marker);

    await expect.poll(() => page.evaluate(async (marker) => {
      const response = await requestBridge({ type: "diagnosticList", limit: 0 }, { timeout: 5000 });
      return response?.entries?.find((entry) => entry.message === marker) || null;
    }, marker)).not.toBeNull();

    const entry = await page.evaluate(async (marker) => {
      const response = await requestBridge({ type: "diagnosticList", limit: 0 }, { timeout: 5000 });
      return response.entries.find((candidate) => candidate.message === marker);
    }, marker);
    expect(entry).toEqual(expect.objectContaining({
      event: "log",
      level: "warn",
      requestId: "durable-request",
      source: "diagnostic-test"
    }));
    expect(entry).not.toHaveProperty("terminalOutput");

    const loaded = await page.evaluate(async () => {
      logStore.entries = [];
      await loadDurableDiagnostics();
      return logStore.entries.some((candidate) => candidate.source === "diagnostic-test");
    });
    expect(loaded).toBe(true);
  });

  test("includes only MultiTerm-owned Copilot logs after opt-in", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    const root = await page.evaluate(() => {
      state.settings.copilotLogViewerEnabled = true;
      state.settings.copilotLogInitialTailKb = 0;
      state.copilotLogEnabledAt = Date.now();
      sendBridgeConfig();
      return state.copilotLogDirectory;
    });
    expect(path.basename(root)).toBe("Copilot");

    const sessionDirectory = path.join(root, `e2e-${Date.now()}`);
    const logKey = path.basename(sessionDirectory);
    const ownedMarker = `owned-copilot-${Date.now()}`;
    const unrelatedMarker = `unrelated-copilot-${Date.now()}`;
    const unrelatedPath = path.join(path.dirname(root), `unrelated-${Date.now()}.log`);
    fs.mkdirSync(sessionDirectory, { recursive: true });
    await page.evaluate((key) => sendBridge({
      type: "copilotLogRegister",
      key,
      terminalId: "terminal-e2e",
      terminalTitle: "Copilot E2E"
    }), logKey);
    fs.writeFileSync(
      path.join(sessionDirectory, "process-e2e.log"),
      `2026-08-12T01:00:00.000Z [WARNING] ${ownedMarker}\n`,
      "utf8"
    );
    fs.writeFileSync(unrelatedPath, `2026-08-12T01:00:00.000Z [ERROR] ${unrelatedMarker}\n`, "utf8");

    try {
      await expect.poll(() => page.evaluate((marker) => logStore.entries.some((entry) => (
        entry.source === "copilot:Copilot E2E" && entry.level === "warn" && entry.message === marker
      )), ownedMarker)).toBe(true);
      const durable = await page.evaluate(async (marker) => {
        const response = await requestBridge({ type: "diagnosticList", limit: 0 }, { timeout: 5000 });
        return response.entries.filter((entry) => entry.source === "copilot:Copilot E2E" && entry.message === marker);
      }, ownedMarker);
      expect(durable).toHaveLength(1);
      expect(durable[0]).toEqual(expect.objectContaining({
        copilotLogKey: logKey,
        terminalId: "terminal-e2e",
        terminalTitle: "Copilot E2E"
      }));
      expect(await page.evaluate((marker) => logStore.entries.some((entry) => entry.message === marker), unrelatedMarker)).toBe(false);
    } finally {
      await page.evaluate(() => {
        state.settings.copilotLogViewerEnabled = false;
        state.copilotLogEnabledAt = 0;
        sendBridgeConfig();
      });
      fs.rmSync(sessionDirectory, { force: true, recursive: true });
      fs.rmSync(unrelatedPath, { force: true });
    }
  });

  test("correlates bridge request completion, timeout, disconnect, and late replies", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate(() => pendingBridgeRequests.size)).toBe(0);

    const result = await page.evaluate(async () => {
      const originalSend = state.socket.send;
      const originalReady = state.socketReady;
      const frames = [];
      const progress = [];
      logStore.entries = [];
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        frames.push(frame);
        if (frame.type === "diagnostic-complete") {
          window.setTimeout(() => handleBridgeMessage({
            type: "operationProgress",
            requestId: frame.requestId,
            operation: "diagnostic-complete",
            phase: "working",
            elapsedMs: 3,
            message: "Working..."
          }), 0);
          window.setTimeout(() => resolveBridgeRequest({
            type: "diagnosticReply",
            requestId: frame.requestId
          }, { ok: true }), 0);
        }
      };

      try {
        const completed = await requestBridge(
          { type: "diagnostic-complete" },
          { timeout: 1000, onProgress: (update) => progress.push(update) }
        );
        const timedOut = await requestBridge({ type: "diagnostic-timeout" }, { timeout: 5 });
        const timeoutFrame = frames.find((frame) => frame.type === "diagnostic-timeout");
        const lateReplyMatched = resolveBridgeRequest({
          type: "diagnosticLateReply",
          requestId: timeoutFrame.requestId
        }, { late: true });

        const disconnectedPromise = requestBridge({ type: "diagnostic-disconnect" }, { timeout: 1000 });
        settlePendingBridgeRequests("disconnected", { code: 1006 });
        const disconnected = await disconnectedPromise;

        state.socketReady = false;
        const unsent = await requestBridge({ type: "diagnostic-unsent" }, { timeout: 1000 });

        return {
          completed,
          disconnected,
          lateReplyMatched,
          pending: pendingBridgeRequests.size,
          progress,
          timedOut,
          unsent,
          entries: logStore.entries
            .filter((entry) => entry.source === "bridge-request")
            .map((entry) => ({
              detail: entry.detail,
              level: entry.level,
              message: entry.message
            }))
        };
      } finally {
        state.socket.send = originalSend;
        state.socketReady = originalReady;
      }
    });

    expect(result.completed).toEqual({ ok: true });
    expect(result.timedOut).toBeNull();
    expect(result.disconnected).toBeNull();
    expect(result.unsent).toBeNull();
    expect(result.lateReplyMatched).toBe(false);
    expect(result.pending).toBe(0);
    expect(result.progress).toEqual([expect.objectContaining({
      elapsedMs: 3,
      message: "Working...",
      operation: "diagnostic-complete",
      phase: "working"
    })]);

    const completed = result.entries.find((entry) => entry.message === "Completed diagnostic-complete");
    expect(completed).toEqual(expect.objectContaining({
      level: "debug",
      detail: expect.objectContaining({
        outcome: "response",
        requestType: "diagnostic-complete",
        timeoutMs: 1000
      })
    }));
    expect(result.entries).toContainEqual(expect.objectContaining({
      level: "debug",
      message: "Progress diagnostic-complete: working",
      detail: expect.objectContaining({
        elapsedMs: 3,
        operation: "diagnostic-complete",
        phase: "working",
        requestType: "diagnostic-complete"
      })
    }));
    expect(result.entries).toContainEqual(expect.objectContaining({
      level: "warn",
      message: "Failed diagnostic-timeout: timeout",
      detail: expect.objectContaining({ outcome: "timeout", timeoutMs: 5 })
    }));
    expect(result.entries).toContainEqual(expect.objectContaining({
      level: "warn",
      message: "Failed diagnostic-disconnect: disconnected",
      detail: expect.objectContaining({ code: 1006, outcome: "disconnected" })
    }));
    expect(result.entries).toContainEqual(expect.objectContaining({
      level: "warn",
      message: "Failed diagnostic-unsent: disconnected",
      detail: expect.objectContaining({ outcome: "disconnected" })
    }));
    expect(result.entries).toContainEqual(expect.objectContaining({
      level: "warn",
      message: "Ignored unmatched diagnosticLateReply"
    }));
  });
});
