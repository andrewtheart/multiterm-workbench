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
    const background = await page.locator("#bridgeIdentityCard").evaluate((card) => getComputedStyle(card).backgroundColor);
    const surface = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--surface-high").trim());
    expect(background).toBe(surface.startsWith("#")
      ? `rgb(${Number.parseInt(surface.slice(1, 3), 16)}, ${Number.parseInt(surface.slice(3, 5), 16)}, ${Number.parseInt(surface.slice(5, 7), 16)})`
      : surface);
    await expect(page.locator("#bridgeIdentityChoose")).toBeHidden();
  });

  test("offers bridge switching in Electron and reports cancel and failure", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      window.__chooseBridgeCalls = 0;
      window.multiterm = {
        chooseBridgeNow: async () => {
          window.__chooseBridgeCalls += 1;
          return { changed: false, cancelled: true };
        }
      };
      renderBridgeIdentity();
    });
    await page.locator(".status-conn-wrap").hover();
    const choose = page.locator("#bridgeIdentityChoose");
    await expect(choose).toBeVisible();
    await choose.click();
    await expect(page.locator("#bridgeIdentityStatus")).toHaveText("Kept this bridge.");
    expect(await page.evaluate(() => window.__chooseBridgeCalls)).toBe(1);

    await page.evaluate(() => {
      window.multiterm.chooseBridgeNow = async () => { throw new Error("chooser unavailable"); };
    });
    await page.locator(".status-conn-wrap").hover();
    await expect(choose).toBeVisible();
    await choose.click();
    await expect(page.locator("#bridgeIdentityStatus")).toContainText("Could not choose a bridge: chooser unavailable");
    await expect(page.locator("#bridgeIdentityStatus")).toHaveAttribute("data-tone", "error");
  });

  test("handles unavailable, successful, and unchanged bridge choices", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    const result = await page.evaluate(async () => {
      const previous = window.multiterm;
      window.multiterm = {};
      const unavailable = await chooseAnotherBridge();

      elements.bridgeIdentityCard.hidden = true;
      window.multiterm.chooseBridgeNow = async () => ({ changed: true });
      const changed = await chooseAnotherBridge();
      const changedStatus = elements.bridgeIdentityStatus.textContent;

      elements.bridgeIdentityCard.hidden = false;
      window.multiterm.chooseBridgeNow = async () => ({ changed: false, cancelled: false });
      const unchanged = await chooseAnotherBridge();
      const unchangedStatus = elements.bridgeIdentityStatus.textContent;

      window.multiterm.chooseBridgeNow = async () => { throw "raw chooser failure"; };
      const failed = await chooseAnotherBridge();
      const failedStatus = elements.bridgeIdentityStatus.textContent;
      window.multiterm = previous;
      return { changed, changedStatus, failed, failedStatus, unavailable, unchanged, unchangedStatus };
    });

    expect(result).toEqual({
      changed: true,
      changedStatus: "Connecting to the selected bridge...",
      failed: false,
      failedStatus: "Could not choose a bridge: raw chooser failure",
      unavailable: false,
      unchanged: false,
      unchangedStatus: "No bridge change was made."
    });
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
