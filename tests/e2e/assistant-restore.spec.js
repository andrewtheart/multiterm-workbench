const { test, expect } = require("../support/renderer-coverage");

// The record now lives in %LOCALAPPDATA%\MultiTerm via the bridge, so it has to
// survive clearing browser storage and round-trip through the bridge.
test.describe("Assistant session restore", () => {
  const ready = async (page) => {
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
  };

  test("round-trips the record through the bridge, not browser storage", async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(async () => {
      const [terminal] = [...state.terminals.values()];
      terminal.aiAssistantTuiProvider = "copilot";
      terminal.cwd = "D:\\work\\demo";
      saveAssistantSessionRecord();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const rows = await readAssistantSessionRecord();
      return { rows, storage: localStorage.getItem("multiterm.assistantSessions") };
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ provider: "copilot", cwd: "D:\\work\\demo" });
    // Nothing is left behind in browser storage any more.
    expect(result.storage).toBeNull();
  });

  test("records only live terminals running an assistant", async ({ page }) => {
    await ready(page);
    const count = await page.evaluate(async () => {
      const [terminal] = [...state.terminals.values()];
      terminal.aiAssistantTuiProvider = "";
      saveAssistantSessionRecord();
      await new Promise((resolve) => setTimeout(resolve, 500));
      return (await readAssistantSessionRecord()).length;
    });
    expect(count).toBe(0);
  });

  test("treats a recorded session the bridge no longer lists as lost", async ({ page }) => {
    await ready(page);
    const lost = await page.evaluate(async () => {
      const [terminal] = [...state.terminals.values()];
      terminal.aiAssistantTuiProvider = "copilot";
      saveAssistantSessionRecord();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const live = await lostAssistantSessions(new Set([terminal.id]));
      const dead = await lostAssistantSessions(new Set());
      return { live: live.length, dead: dead.length, deadId: dead[0]?.id === terminal.id };
    });
    expect(lost.live).toBe(0);
    expect(lost.dead).toBe(1);
    expect(lost.deadId).toBe(true);
  });

  test("drops rows the bridge returns with an unknown provider", async ({ page }) => {
    await ready(page);
    const counts = await page.evaluate(() => ({
      junk: normalizeAssistantSessionRows("nope").length,
      missing: normalizeAssistantSessionRows(undefined).length,
      mixed: normalizeAssistantSessionRows([
        { id: "a", cwd: "C:\\x", provider: "evil" },
        { id: "b", cwd: "C:\\y", provider: "copilot" }
      ]).length
    }));
    expect(counts).toEqual({ junk: 0, missing: 0, mixed: 1 });
  });

  test("asks which lost sessions to restore and lists each one", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      state.settings.resumeAssistantSessions = "ask";
      openAssistantRestoreDialog([
        { id: "gone-1", title: "release notes", cwd: "D:\\multiTerm", provider: "copilot", shell: "pwsh" },
        { id: "gone-2", title: "", cwd: "D:\\other", provider: "claude", shell: "pwsh" }
      ]);
    });
    await expect(page.locator("#assistantRestoreOverlay")).toBeVisible();
    await expect(page.locator("#assistantRestoreStatus")).toHaveText("2 assistant sessions did not survive.");
    const rows = page.locator(".assistant-restore-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("release notes");
    await expect(rows.first()).toContainText("D:\\multiTerm");
    await expect(rows.nth(1)).toContainText("D:\\other");
    // Every row starts selected so the common case is one click.
    await expect(rows.first().locator("input")).toBeChecked();

    await page.locator("#assistantRestoreDismiss").click();
    await expect(page.locator("#assistantRestoreOverlay")).toBeHidden();
  });

  test("opens restored terminals before Copilot catalog discovery completes", async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(async () => {
      closeAllTerminals();
      const originalRequestBridge = requestBridge;
      const originalSendBridge = sendBridge;
      let resolveCatalog;
      let requestedSource = "";
      let sentCommand = "";
      requestBridge = (message, options) => {
        if (message.type !== "listCopilotSessions") return originalRequestBridge(message, options);
        requestedSource = message.source || "";
        return new Promise((resolve) => { resolveCatalog = resolve; });
      };
      sendBridge = (message) => {
        if (message.type === "input" && String(message.data || "").includes("--resume")) {
          sentCommand = message.data;
        }
        return originalSendBridge(message);
      };
      try {
        const restoring = restoreAssistantSessions([
          { id: "gone-1", title: "crashed task", cwd: "D:\\multiTerm", provider: "copilot", shell: "pwsh" }
        ]);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const [terminal] = [...state.terminals.values()];
        const openedBeforeCatalog = Boolean(terminal);
        resolveCatalog({ sessions: [{
          id: "12345678-1234-4123-8123-123456789abc",
          cwd: "D:\\multiTerm",
          updatedAt: "2026-08-06T12:00:00Z"
        }] });
        await restoring;
        return {
          openedBeforeCatalog,
          resumeCommand: terminal?.pendingCommand || sentCommand,
          source: requestedSource
        };
      } finally {
        requestBridge = originalRequestBridge;
        sendBridge = originalSendBridge;
      }
    });
    expect(result.openedBeforeCatalog).toBe(true);
    expect(result.resumeCommand).toContain("--resume \"12345678-1234-4123-8123-123456789abc\"");
    expect(result.source).toBe("cli");
  });

  test("never opens the dialog when the setting is off", async ({ page }) => {
    await ready(page);
    const opened = await page.evaluate(async () => {
      const [terminal] = [...state.terminals.values()];
      terminal.aiAssistantTuiProvider = "copilot";
      saveAssistantSessionRecord();
      await new Promise((resolve) => setTimeout(resolve, 500));
      state.settings.resumeAssistantSessions = "never";
      await reviewLostAssistantSessions(new Set());
      return !document.querySelector("#assistantRestoreOverlay").hidden;
    });
    expect(opened).toBe(false);
  });

  test("still closes on Escape after clicking dialog chrome", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => openAssistantRestoreDialog([
      { id: "gone-1", title: "x", cwd: "D:\\multiTerm", provider: "copilot", shell: "pwsh" }
    ]));
    await page.locator("#assistantRestoreTitle").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#assistantRestoreOverlay")).toBeHidden();
  });
});
