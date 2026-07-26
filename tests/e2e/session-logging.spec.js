// Covers session logging from the renderer's side: starting it must not be
// rejected by the bridge, and while it runs the context menu has to name the
// file being written and offer opening it and stopping, as two separate actions
// on one row.

const { test, expect } = require("@playwright/test");

test.describe.configure({ mode: "serial" });

test.describe("Session logging", () => {
  let context;
  let page;
  const errors = [];

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      viewport: { width: 1400, height: 900 }
    });
    page = await context.newPage();
    page.on("pageerror", (err) => errors.push(String(err.message || err)));
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    // Earlier specs share this bridge, so start from exactly one live terminal.
    await page.evaluate(() => closeAllTerminals());
    await expect(page.locator(".terminal-pane")).toHaveCount(0);
    const id = await page.evaluate(() => addTerminal({ reveal: true }).id);
    await expect.poll(() => page.evaluate((i) => state.terminals.get(i)?.status, id), { timeout: 15000 }).toBe("live");
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      const terminal = state.terminals.get(state.activeId);
      if (terminal && terminal.logging) toggleLogging(terminal);
    });
    await context.close();
  });

  // Records outbound bridge messages while still letting them reach the bridge,
  // so assertions can check the wire format without stubbing out real behaviour.
  // openPath is the exception: forwarding it would really launch a text viewer
  // on the machine running the suite.
  async function recordBridge() {
    await page.evaluate(() => {
      window.__sent = [];
      if (!window.__realSend) window.__realSend = window.sendBridge;
      window.sendBridge = (message) => {
        window.__sent.push(message);
        if (message.type === "openPath") return true;
        return window.__realSend(message);
      };
    });
  }

  // Bridge-level rejections (the "Unsupported message type" regression) arrive as
  // error frames on the socket rather than as page errors.
  async function recordBridgeErrors() {
    await page.evaluate(() => {
      window.__bridgeErrors = [];
      state.socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "error") window.__bridgeErrors.push(message.message);
      });
    });
  }

  const activeTerminal = (fn) => page.evaluate(fn);

  test("starting a log is accepted by the bridge and reports the file", async () => {
    await recordBridge();
    await recordBridgeErrors();

    const state1 = await activeTerminal(async () => {
      const terminal = state.terminals.get(state.activeId);
      toggleLogging(terminal);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return { logging: terminal.logging, logPath: terminal.logPath };
    });

    expect(state1.logging).toBe(true);
    expect(state1.logPath).toBeTruthy();

    // The regression this guards: the bridge used to answer logStart with
    // "Unsupported message type", which surfaced as an error toast.
    expect(await page.evaluate(() => window.__bridgeErrors)).toEqual([]);
  });

  test("the context menu names the log file and offers opening and stopping", async () => {
    await page.evaluate(() => {
      const terminal = state.terminals.get(state.activeId);
      buildContextMenu(terminal);
    });

    const row = page.locator("#contextMenu .ctx-item.ctx-multi");
    await expect(row).toHaveCount(1);

    const logPath = await page.evaluate(() => state.terminals.get(state.activeId).logPath);
    const fileName = logPath.split(/[\\/]/).pop();

    // "Logging to <file> (Stop logging)" — the file is a link, stop is its own control.
    const link = row.locator(".ctx-link");
    await expect(link).toHaveText(fileName);
    await expect(link).toHaveAttribute("title", logPath);
    await expect(row.locator(".ctx-muted")).toHaveText("(Stop logging)");
    await expect(row).toContainText("Logging to");

    // Both controls sit on one line, and the row is no taller than a plain one.
    const heights = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#contextMenu .ctx-item")];
      const multi = rows.find((r) => r.classList.contains("ctx-multi"));
      const plain = rows.find((r) => !r.classList.contains("ctx-multi"));
      return {
        multi: Math.round(multi.getBoundingClientRect().height),
        plain: Math.round(plain.getBoundingClientRect().height)
      };
    });
    expect(heights.multi).toBe(heights.plain);
  });

  test("clicking the file name opens it without stopping the log", async () => {
    await recordBridge();
    await page.evaluate(() => {
      buildContextMenu(state.terminals.get(state.activeId));
      document.querySelector("#contextMenu .ctx-link").click();
    });

    const result = await page.evaluate(() => ({
      sent: window.__sent,
      logging: state.terminals.get(state.activeId).logging,
      logPath: state.terminals.get(state.activeId).logPath
    }));

    const open = result.sent.find((m) => m.type === "openPath");
    expect(open).toBeTruthy();
    expect(open.path).toBe(result.logPath);
    // Opening is not stopping.
    expect(result.logging).toBe(true);
  });

  test("clicking stop ends the log and restores the plain menu entry", async () => {
    await recordBridge();
    await page.evaluate(async () => {
      buildContextMenu(state.terminals.get(state.activeId));
      document.querySelector("#contextMenu .ctx-muted").click();
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });

    const after = await page.evaluate(() => {
      const terminal = state.terminals.get(state.activeId);
      buildContextMenu(terminal);
      return {
        logging: terminal.logging,
        sent: window.__sent.map((m) => m.type),
        hasMultiRow: Boolean(document.querySelector("#contextMenu .ctx-multi")),
        labels: [...document.querySelectorAll("#contextMenu .ctx-item")]
          .map((r) => r.textContent)
          .filter((text) => /log/i.test(text))
      };
    });

    expect(after.sent).toContain("logStop");
    expect(after.logging).toBe(false);
    expect(after.hasMultiRow).toBe(false);
    expect(after.labels).toEqual(["Log to file\u2026", "Reveal last log"]);
  });

  test("no uncaught errors across the logging flow", async () => {
    expect(errors).toEqual([]);
  });
});
