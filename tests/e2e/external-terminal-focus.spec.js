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

  // Without the shared confirm styling the card had no padding, so its content
  // sat flush against the 1px edge and the dialog read as having no border.
  test("wears the same card chrome as the other confirm dialogs", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    await page.evaluate(() => openExternalTerminalFocusPrompt());
    await expect(page.locator("#externalTerminalFocusOverlay")).toBeVisible();

    const measured = await page.evaluate(() => {
      const card = document.querySelector("#externalTerminalFocusOverlay .palette");
      const style = getComputedStyle(card);
      const cardBox = card.getBoundingClientRect();
      const headBox = card.querySelector(".confirm-head").getBoundingClientRect();
      const actionsBox = card.querySelector(".confirm-actions").getBoundingClientRect();
      return {
        borderWidth: style.borderTopWidth,
        borderStyle: style.borderTopStyle,
        borderColor: style.borderTopColor,
        padding: style.padding,
        confirmPadding: getComputedStyle(document.querySelector("#terminalCloseOverlay .palette")).padding,
        insetLeft: Math.round(headBox.left - cardBox.left),
        insetTop: Math.round(headBox.top - cardBox.top),
        insetRight: Math.round(cardBox.right - actionsBox.right),
        insetBottom: Math.round(cardBox.bottom - actionsBox.bottom)
      };
    });

    expect(measured.borderWidth).toBe("1px");
    expect(measured.borderStyle).toBe("solid");
    expect(measured.borderColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(measured.padding).toBe(measured.confirmPadding);
    for (const edge of ["insetLeft", "insetTop", "insetRight", "insetBottom"]) {
      expect(measured[edge], `${edge} keeps the content off the card edge`).toBeGreaterThan(12);
    }

    await page.evaluate(() => closeExternalTerminalFocusPrompt());
    await expect(page.locator("#externalTerminalFocusOverlay")).toBeHidden();
  });
});