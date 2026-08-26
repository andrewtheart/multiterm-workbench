/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Verifies the bridge WebSocket auto-reconnects after an unexpected drop and
// re-attaches the sessions the server kept alive — so the UI recovers on its
// own instead of staying stuck offline until a manual page reload.

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

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
    await startRendererCoverage(page);
    page.on("pageerror", (err) => pageErrors.push(String(err.message || err)));
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });

  test.afterAll(async () => {
    await stopRendererCoverage(page, "bridge-reconnect");
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

  test("replays the output produced while the socket was down", async () => {
    const id = await freshLiveTerminal();
    const marker = `MTGAP${Date.now().toString(36).toUpperCase()}`;

    // Drop the socket, produce output that only the bridge can see, then let the
    // renderer reconnect and resume from the sequence it last received.
    await page.evaluate(() => state.socket.close());
    await expect.poll(socketReady).toBe(false);
    await page.evaluate(
      ([terminalId, text]) =>
        new Promise((resolve) => {
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const probe = new WebSocket(`${protocol}//${window.location.host}/ws`);
          probe.addEventListener("open", () => {
            probe.send(JSON.stringify({ type: "input", id: terminalId, data: `Write-Output '${text}'\r` }));
            setTimeout(() => {
              probe.close();
              resolve();
            }, 1500);
          });
        }),
      [id, marker]
    );

    await expect.poll(socketReady, { timeout: 15000 }).toBe(true);
    await expect.poll(
      () =>
        page.evaluate((terminalId) => {
          const terminal = state.terminals.get(terminalId);
          if (!terminal) return "";
          const buffer = terminal.term.buffer.active;
          let text = "";
          for (let row = 0; row < buffer.length; row += 1) {
            text += `${buffer.getLine(row)?.translateToString(true) ?? ""}\n`;
          }
          return text;
        }, id),
      { timeout: 20000 }
    ).toContain(marker);

    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).lastOutputSeq, id)).toBeGreaterThan(0);
    await expect(page.locator(`.terminal-pane[data-id="${id}"] .pane-desync`)).toBeHidden();
  });

  test("replays existing output into a pane rebuilt in a second window", async () => {
    const id = await freshLiveTerminal();
    const marker = `MTFRESH${Date.now().toString(36).toUpperCase()}`;
    await page.evaluate(([terminalId, text]) => {
      sendBridge({ type: "input", id: terminalId, data: `Write-Output '${text}'\r` });
    }, [id, marker]);

    const secondPage = await context.newPage();
    try {
      await startRendererCoverage(secondPage);
      await secondPage.goto("/");
      await expect(secondPage.locator("#statusConn")).toHaveText("Connected");
      await expect.poll(
        () => secondPage.evaluate((terminalId) => {
          const terminal = state.terminals.get(terminalId);
          if (!terminal) return "";
          const buffer = terminal.term.buffer.active;
          let text = "";
          for (let row = 0; row < buffer.length; row += 1) {
            text += `${buffer.getLine(row)?.translateToString(true) ?? ""}\n`;
          }
          return text;
        }, id),
        { timeout: 20000 }
      ).toContain(marker);
      await expect(secondPage.locator(`.terminal-pane[data-id="${id}"] .pane-desync`)).toBeHidden();
    } finally {
      await stopRendererCoverage(secondPage, "bridge-reconnect-fresh-window");
      await secondPage.close();
    }
  });

  test("adds a session created by another already-connected window", async () => {
    await freshLiveTerminal();
    const secondPage = await context.newPage();
    try {
      await startRendererCoverage(secondPage);
      await secondPage.goto("/");
      await expect(secondPage.locator("#statusConn")).toHaveText("Connected");
      const id = await page.evaluate(() => addTerminal().id);
      await expect.poll(() => statusOf(id), { timeout: 15000 }).toBe("live");
      await expect.poll(
        () => secondPage.evaluate((terminalId) => state.terminals.get(terminalId)?.status ?? null, id),
        { timeout: 15000 }
      ).toBe("live");

      const marker = `MTFOREIGN${Date.now().toString(36).toUpperCase()}`;
      await page.evaluate(([terminalId, text]) => {
        sendBridge({ type: "input", id: terminalId, data: `Write-Output '${text}'\r` });
      }, [id, marker]);
      await expect.poll(
        () => secondPage.evaluate((terminalId) => {
          const terminal = state.terminals.get(terminalId);
          if (!terminal) return "";
          const buffer = terminal.term.buffer.active;
          let text = "";
          for (let row = 0; row < buffer.length; row += 1) {
            text += `${buffer.getLine(row)?.translateToString(true) ?? ""}\n`;
          }
          return text;
        }, id),
        { timeout: 20000 }
      ).toContain(marker);
    } finally {
      await stopRendererCoverage(secondPage, "bridge-reconnect-foreign-created");
      await secondPage.close();
    }
  });

  test("marks a pane desynchronized and offers recovery when replay is impossible", async () => {
    const id = await freshLiveTerminal();

    // A gap the bridge cannot bridge: the renderer is told, and must never
    // present the incomplete screen as current. The sequence is read in the same
    // evaluate that delivers the gap, because this is a live shell whose own
    // output would otherwise overwrite the adopted sequence before the check.
    const seqAfterGap = await page.evaluate((terminalId) => {
      handleBridgeMessage({
        type: "outputGap",
        id: terminalId,
        reason: "retention",
        expected: 5,
        available: 40,
        seq: 120
      });
      return state.terminals.get(terminalId).lastOutputSeq;
    }, id);

    const notice = page.locator(`.terminal-pane[data-id="${id}"] .pane-desync`);
    await expect(notice).toBeVisible();
    await expect(page.locator(`.terminal-pane[data-id="${id}"]`)).toHaveClass(/is-desynchronized/);
    expect(seqAfterGap).toBe(120);

    await notice.locator('[data-desync="clear"]').click();
    await expect(notice).toBeVisible();
    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).desynchronized, id)).toBe(true);
  });

  test("keeps the incomplete screen marked until restart resolves it", async () => {
    const id = await freshLiveTerminal();
    await page.evaluate((terminalId) => {
      handleBridgeMessage({ type: "outputGap", id: terminalId, reason: "retention", expected: 1, available: 9, seq: 9 });
    }, id);

    const notice = page.locator(`.terminal-pane[data-id="${id}"] .pane-desync`);
    await expect(notice).toBeVisible();
    // Dismissing silences the notice but must not imply the screen is trustworthy:
    // the pane stays marked so the gap is still visible until a restart.
    await notice.locator('[data-desync="dismiss"]').click();
    await expect(notice).toBeHidden();
    await expect(page.locator(`.terminal-pane[data-id="${id}"]`)).toHaveClass(/is-desynchronized/);
    expect(await page.evaluate((terminalId) => state.terminals.get(terminalId).desynchronized, id)).toBe(true);
    // An unknown action still resolves nothing.
    expect(await page.evaluate((terminalId) => resolveTerminalDesynchronized(state.terminals.get(terminalId), "ignore"), id)).toBe(false);

    // A fresh gap has to raise the notice again rather than stay silenced.
    await page.evaluate((terminalId) => {
      handleBridgeMessage({ type: "outputGap", id: terminalId, reason: "retention", expected: 10, available: 19, seq: 19 });
    }, id);
    await expect(notice).toBeVisible();

    await notice.locator('[data-desync="restart"]').click();
    // Restarting replaces the pane with a fresh session, so the old id is gone.
    await expect.poll(() => statusOf(id), { timeout: 20000 }).toBeNull();
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect(page.locator(".pane-desync:visible")).toHaveCount(0);
  });

  test("ignores gap and resume frames for a terminal this window does not hold", async () => {
    const id = await freshLiveTerminal();
    // Measured against the live pane's own state rather than a page-wide notice
    // count, and read in the same evaluate as the injection, so that a genuine
    // gap on the real terminal cannot be mistaken for the foreign frames taking
    // effect.
    const result = await page.evaluate((terminalId) => {
      const before = state.terminals.get(terminalId).desynchronized;
      handleBridgeMessage({ type: "outputGap", id: "no-such-session", expected: 1, available: 2, seq: 2 });
      handleBridgeMessage({ type: "outputResumed", id: "no-such-session", seq: 4, replayedBytes: 0 });
      return {
        disturbedRealTerminal: state.terminals.get(terminalId).desynchronized !== before,
        trackedForeignSession: state.terminals.has("no-such-session"),
        panes: document.querySelectorAll(".terminal-pane").length
      };
    }, id);
    expect(result).toEqual({ disturbedRealTerminal: false, trackedForeignSession: false, panes: 1 });
  });
});
