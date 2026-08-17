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
    await expect(page.locator("#bridgeIdentityChoose")).toHaveText("Refresh bridge list");
  });

  test("shows the bridge id in the header and persists window title preferences", async ({ page }) => {
    await open(page);
    const bridgeId = await page.locator("#bridgeIdentityId").textContent();
    const appVersion = await page.evaluate(() => APP_VERSION);

    await expect(page.locator("#bridgeStatus")).toHaveText(`Bridge connected (${bridgeId})`);
    await expect(page).toHaveTitle(`MultiTerm Workbench (${bridgeId})`);

    await page.locator("#settingsSearch").fill("window title");
    const showBridgeId = page.locator("#showBridgeIdInWindowTitle");
    const showVersion = page.locator("#showVersionInWindowTitle");
    await expect(showBridgeId).toBeVisible();
    await expect(showBridgeId).toBeChecked();
    await expect(showVersion).toBeVisible();
    await expect(showVersion).not.toBeChecked();

    await showVersion.check();
    await expect(page).toHaveTitle(`MultiTerm Workbench (${bridgeId}) v${appVersion}`);
    await showBridgeId.uncheck();
    await expect(page).toHaveTitle(`MultiTerm Workbench v${appVersion}`);
    expect(await page.evaluate(() => {
      const settings = JSON.parse(localStorage.getItem("multiterm.settings"));
      return {
        showBridgeIdInWindowTitle: settings.showBridgeIdInWindowTitle,
        showVersionInWindowTitle: settings.showVersionInWindowTitle
      };
    })).toEqual({ showBridgeIdInWindowTitle: false, showVersionInWindowTitle: true });

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect(page.locator("#bridgeStatus")).toHaveText(`Bridge connected (${bridgeId})`);
    await expect(page).toHaveTitle(`MultiTerm Workbench v${appVersion}`);
    await expect(page.locator("#showBridgeIdInWindowTitle")).not.toBeChecked();
    await expect(page.locator("#showVersionInWindowTitle")).toBeChecked();
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

  test("shows frontend occupancy and warns before joining an occupied bridge", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      window.__bridgeIdentityNavigations = [];
      bridgeIdentityNavigate = (url) => window.__bridgeIdentityNavigations.push(url);
      bridgeIdentityInstances.generation += 1;
      bridgeIdentityInstances.bridges = [
        { bridgeId: state.bridgeId, bridgeType: "installed", current: true, port: 3199, rendererClients: 1, sessions: 1, url: "http://127.0.0.1:3199/" },
        { bridgeId: "BRIDGE-101", bridgeType: "installed", current: false, port: 3201, rendererClients: 1, sessions: 3, url: "http://127.0.0.1:3201/" },
        { bridgeId: "BRIDGE-102", bridgeType: "installed", current: false, port: 3202, rendererClients: 0, sessions: 0, url: "http://127.0.0.1:3202/" }
      ];
      renderBridgeIdentityInstances();
    });

    await expect(page.locator("#bridgeIdentityFrontend")).toContainText("Frontend connected");
    const rows = page.locator("#bridgeIdentityList .bridge-identity-option");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveClass(/has-frontend/);
    await expect(rows.nth(0)).toContainText("BRIDGE-101");
    await expect(rows.nth(0)).toContainText("Frontend connected");
    await expect(rows.nth(0).locator('[data-lucide="monitor-check"]')).toHaveCount(1);
    await expect(rows.nth(1)).toContainText("No frontend");

    await rows.nth(0).click();
    const warning = page.locator("#bridgeIdentityWarning");
    await expect(warning).toBeVisible();
    await expect(page.locator("#bridgeIdentityWarningTitle")).toHaveText("BRIDGE-101 already has a frontend connected");
    await expect(page.locator("#bridgeIdentityWarningText")).toContainText("2 frontends share its 3 terminal sessions");
    expect(await page.evaluate(() => window.__bridgeIdentityNavigations)).toEqual([]);

    await page.locator("#bridgeIdentityWarningCancel").click();
    await expect(warning).toBeHidden();

    await rows.nth(1).click();
    expect(await page.evaluate(() => window.__bridgeIdentityNavigations)).toEqual(["http://127.0.0.1:3202/"]);

    await rows.nth(0).click();
    await page.locator("#bridgeIdentityWarningConfirm").click();
    expect(await page.evaluate(() => window.__bridgeIdentityNavigations)).toEqual([
      "http://127.0.0.1:3202/",
      "http://127.0.0.1:3201/"
    ]);
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

  test("stays open while the pointer crosses the gap into the card", async ({ page }) => {
    await open(page);
    const geometry = await page.evaluate(() => {
      const status = document.querySelector("#statusConn").getBoundingClientRect();
      const card = document.querySelector("#bridgeIdentityCard").getBoundingClientRect();
      return {
        card: { x: card.left + card.width / 2, y: card.top + card.height / 2 },
        gap: { x: card.left + card.width / 2, y: card.bottom + (status.top - card.bottom) / 2 },
        status: { x: status.left + status.width / 2, y: status.top + status.height / 2 }
      };
    });

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await page.mouse.move(geometry.status.x, geometry.status.y);
      await expect(page.locator("#bridgeIdentityCard")).toBeVisible();
      await page.mouse.move(geometry.gap.x, geometry.gap.y);
      await page.waitForTimeout(250);
      await expect(page.locator("#bridgeIdentityCard")).toBeVisible();
      await page.mouse.move(geometry.card.x, geometry.card.y);
      await page.waitForTimeout(200);
      await expect(page.locator("#bridgeIdentityCard")).toBeVisible();
    }
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
