const { test, expect } = require("../support/renderer-coverage");

// The bridge runs in a terminal window of its own, and nothing in the UI used to
// say which one. The status label is the only place the bridge is visible.
test.describe("Bridge identity card", () => {
  const open = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.locator(".status-conn-wrap").hover();
    await expect(page.locator("#bridgeIdentityCard")).toBeVisible();
  };

  test("shows the bridge id when hovering the connection status", async ({ page }) => {
    await open(page);
    await expect(page.locator("#bridgeIdentityId")).toHaveText(/^BRIDGE-\d{3,}$/);
    await expect(page.locator("#statusConn")).toHaveAttribute("title", /^Bridge BRIDGE-\d{3,}$/);
  });

  test("hides the card again once the pointer leaves", async ({ page }) => {
    await open(page);
    await page.locator("#statusSessions").hover();
    await expect(page.locator("#bridgeIdentityCard")).toBeHidden();
  });

  test("opens the card from the keyboard", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.locator("#statusConn").focus();
    await expect(page.locator("#bridgeIdentityCard")).toBeVisible();
  });

  // This bridge is spawned by the harness rather than owning a terminal window,
  // so the button must explain itself instead of pretending it can help.
  test("disables the focus button when the bridge owns no terminal", async ({ page }) => {
    await open(page);
    await expect(page.locator("#bridgeIdentityFocus")).toBeDisabled();
    await expect(page.locator("#bridgeIdentityNote")).toContainText("does not run in its own terminal window");
  });

  test("asks for consent once and remembers it", async ({ page }) => {
    await open(page);
    // Pretend this bridge owns a terminal so the button becomes usable.
    await page.evaluate(() => {
      state.canFocusBridgeTerminal = true;
      renderBridgeIdentity();
    });
    await expect(page.locator("#bridgeIdentityFocus")).toBeEnabled();

    const prompts = [];
    await page.evaluate(() => {
      window.__prompts = [];
      window.confirm = (text) => {
        window.__prompts.push(text);
        return true;
      };
    });
    await page.locator("#bridgeIdentityFocus").click();
    await expect(page.locator("#bridgeIdentityStatus")).toBeVisible();

    prompts.push(...(await page.evaluate(() => window.__prompts)));
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("UI Automation");
    expect(await page.evaluate(() => state.settings.allowBridgeTerminalFocus)).toBe(true);

    // Consent is remembered, so a second click must not prompt again.
    await page.locator(".status-conn-wrap").hover();
    await expect(page.locator("#bridgeIdentityCard")).toBeVisible();
    await page.locator("#bridgeIdentityFocus").click();
    expect(await page.evaluate(() => window.__prompts.length)).toBe(1);
  });

  test("reports the bridge's refusal instead of claiming success", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      state.canFocusBridgeTerminal = true;
      state.settings.allowBridgeTerminalFocus = true;
      renderBridgeIdentity();
    });
    await page.locator("#bridgeIdentityFocus").click();
    const status = page.locator("#bridgeIdentityStatus");
    await expect(status).toContainText("does not run in its own terminal window");
    await expect(status).toHaveAttribute("data-tone", "error");
  });

  // The consent prompt promises the choice can be reversed in Settings.
  test("lets the settings toggle withdraw the consent again", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.locator("#settingsSearch").fill("bridge terminal");
    const toggle = page.locator("#allowBridgeTerminalFocus");
    await expect(toggle).toBeVisible();

    await toggle.check();
    expect(await page.evaluate(() => state.settings.allowBridgeTerminalFocus)).toBe(true);

    await toggle.uncheck();
    expect(await page.evaluate(() => state.settings.allowBridgeTerminalFocus)).toBe(false);
    expect(await page.evaluate(
      () => JSON.parse(localStorage.getItem("multiterm.settings")).allowBridgeTerminalFocus
    )).toBe(false);
  });
});
