const { test, expect } = require("../support/renderer-coverage");

test.describe("External terminal window focus", () => {
  test("asks after the first focus and remembers the reversible choice", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const original = await page.evaluate(() => ({
      preference: state.settings.externalTerminalFocus,
      multiterm: window.multiterm
    }));

    try {
      const first = await page.evaluate(() => {
        state.settings.externalTerminalFocus = "ask";
        saveSettings();
        window.__externalTerminalFocusCalls = 0;
        window.__externalTerminalIds = [];
        window.multiterm = {
          ...(window.multiterm || {}),
          focusWindow() { window.__externalTerminalFocusCalls += 1; }
        };
        const before = state.terminals.size;
        const terminal = openFolderInNewTerminal("D:\\multiTerm");
        window.__externalTerminalIds.push(terminal.id);
        return { before, id: terminal.id };
      });

      await expect(page.locator(".terminal-pane")).toHaveCount(first.before + 1);
      await expect(page.locator("#externalTerminalFocusOverlay")).toBeVisible();
      await expect(page.locator("#externalTerminalFocusEnable")).toBeFocused();
      expect(await page.evaluate(() => window.__externalTerminalFocusCalls)).toBe(1);

      await page.locator("#externalTerminalFocusDecline").click();
      await expect(page.locator("#externalTerminalFocusOverlay")).toBeHidden();
      expect(await page.evaluate(() => ({
        control: elements.externalTerminalFocus.value,
        persisted: JSON.parse(localStorage.getItem("multiterm.settings")).externalTerminalFocus,
        setting: state.settings.externalTerminalFocus
      }))).toEqual({ control: "never", persisted: "never", setting: "never" });

      await page.evaluate(() => {
        const terminal = openExternalTerminal({ path: "D:\\multiTerm", title: "External review" });
        window.__externalTerminalIds.push(terminal.id);
      });
      expect(await page.evaluate(() => window.__externalTerminalFocusCalls)).toBe(1);
      await expect(page.locator("#externalTerminalFocusOverlay")).toBeHidden();

      await page.evaluate(() => {
        elements.externalTerminalFocus.value = "always";
        elements.externalTerminalFocus.dispatchEvent(new Event("change", { bubbles: true }));
        const terminal = openFolderInNewTerminal("D:\\multiTerm");
        window.__externalTerminalIds.push(terminal.id);
      });
      expect(await page.evaluate(() => window.__externalTerminalFocusCalls)).toBe(2);
      await expect(page.locator("#externalTerminalFocusOverlay")).toBeHidden();
    } finally {
      await page.evaluate(({ preference, multiterm }) => {
        for (const id of window.__externalTerminalIds || []) removeTerminal(id);
        state.settings.externalTerminalFocus = preference;
        saveSettings();
        window.multiterm = multiterm;
        delete window.__externalTerminalFocusCalls;
        delete window.__externalTerminalIds;
      }, original);
    }
  });
});