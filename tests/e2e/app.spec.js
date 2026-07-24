const { test, expect } = require("@playwright/test");
const MCR = require("monocart-coverage-reports");

// A single shared page collects JS coverage across all steps so the
// renderer (public/app.js) is exercised as one continuous session.
test.describe.configure({ mode: "serial" });

test.describe("MultiTerm Workbench UI", () => {
  let context;
  let page;

  // The app hides native <select>/<input> controls behind custom comboboxes,
  // so drive them by setting the value and dispatching the bound event.
  const setNative = (selector, value, eventName) => page.evaluate(({ selector, value, eventName }) => {
    const el = document.querySelector(selector);
    el.value = value;
    el.dispatchEvent(new Event(eventName, { bubbles: true }));
  }, { selector, value, eventName });

  const setCheck = (selector, checked) => page.evaluate(({ selector, checked }) => {
    const el = document.querySelector(selector);
    el.checked = checked;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, { selector, checked });

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ baseURL: "http://127.0.0.1:3199" });
    page = await context.newPage();
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });

  test.afterAll(async () => {
    const coverage = await page.coverage.stopJSCoverage();
    const mcr = MCR({
      name: "MultiTerm E2E Coverage",
      outputDir: "coverage/e2e",
      reports: ["console-summary", "v8", "lcovonly"],
      entryFilter: (entry) => entry.url.endsWith("/app.js"),
      sourceFilter: (sourcePath) => sourcePath.includes("app.js")
    });
    await mcr.add(coverage);
    await mcr.generate();
    await context.close();
  });

  test("connects to the bridge and auto-creates a session", async () => {
    await expect(page.locator("#bridgeStatus")).toHaveText(/Bridge connected/i);
    await expect(page.locator("#statusSessions")).toHaveText("1 session");
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test("adds terminals and runs a command", async () => {
    await page.locator("#addTerminal").click();
    await expect(page.locator("#statusSessions")).toHaveText("2 sessions");

    const firstScreen = page.locator(".terminal-screen").first();
    await firstScreen.click();
    await page.keyboard.type("Write-Output 'e2e-hello'");
    await page.keyboard.press("Enter");
    // The pty echoes back; give xterm a moment to render.
    await page.waitForTimeout(500);
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
  });

  test("applies layout and appearance settings", async () => {
    await setNative("#layoutMode", "columns", "change");
    await setNative("#columnCount", "3", "input");
    await expect(page.locator("#columnCountValue")).toHaveText("3");

    await setNative("#terminalTheme", "graphite", "change");
    await setNative("#appTheme", "dark", "change");
    await setNative("#fontSize", "16", "input");
    await expect(page.locator("#fontSizeValue")).toHaveText("16px");
    await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "columns");
  });

  test("toggles chrome and input synchronisation", async () => {
    await setCheck("#syncInput", true);
    await expect.poll(() => page.evaluate(() => document.querySelector("#syncInput").checked)).toBe(true);

    await setCheck("#compactChrome", true);
    await expect(page.locator("#terminalHost")).toHaveClass(/compact/);

    // Chrome toggles are style-hidden until hover, so fire the DOM handler directly.
    const domClick = (selector) => page.evaluate((s) => document.querySelector(s).click(), selector);

    await domClick("#toggleHeader");
    await expect(page.locator("body")).toHaveClass(/header-hidden/);
    await domClick("#toggleHeader");
    await expect(page.locator("body")).not.toHaveClass(/header-hidden/);

    await domClick("#toggleSidecar");
    await expect(page.locator("body")).toHaveClass(/sidecar-hidden/);
    await domClick("#toggleSidecar");
    await expect(page.locator("body")).not.toHaveClass(/sidecar-hidden/);
  });

  test("opens the About dialog and shows the version", async () => {
    await page.locator("#aboutToggle").click();
    await expect(page.locator("#aboutOverlay")).toBeVisible();
    await expect(page.locator("#aboutVersionText")).toContainText("0.1.1");
    await page.locator("#aboutClose").click();
    await expect(page.locator("#aboutOverlay")).toBeHidden();
  });

  test("opens the keyboard shortcuts dialog", async () => {
    await page.locator("#helpToggle").click();
    await expect(page.locator("#shortcutsOverlay")).toBeVisible();
    await page.locator("#shortcutsClose").click();
    await expect(page.locator("#shortcutsOverlay")).toBeHidden();
  });

  test("opens and filters the command palette", async () => {
    await page.evaluate(() => openPalette());
    await expect(page.locator("#paletteOverlay")).toBeVisible();
    await page.locator("#paletteInput").fill("terminal");
    await page.keyboard.press("Escape");
    await expect(page.locator("#paletteOverlay")).toBeHidden();
  });

  test("uses the broadcast bar", async () => {
    await page.locator("#broadcastToggle").click();
    await expect(page.locator("#broadcastBar")).toBeVisible();
    await page.locator("#broadcastInput").fill("Get-Date");
    await page.locator("#broadcastSend").click();
    await page.locator("#broadcastClose").click();
    await expect(page.locator("#broadcastBar")).toBeHidden();
  });

  test("saves and restores a workspace", async () => {
    await page.locator("#workspaceName").fill("My Layout");
    await page.locator("#workspaceSave").click();
    await expect(page.locator("#workspaceSelect option", { hasText: "My Layout" })).toHaveCount(1);
    await page.evaluate(() => {
      const sel = document.querySelector("#workspaceSelect");
      const opt = [...sel.options].find((o) => o.textContent.includes("My Layout"));
      sel.value = opt.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.evaluate(() => document.querySelector("#workspaceRestore").click());
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });

  test("exercises the full settings panel", async () => {
    for (const [selector, value] of [
      ["#minWidth", "480"],
      ["#paneHeight", "360"],
      ["#focusWidth", "70"],
      ["#paneGap", "12"],
      ["#rowCount", "3"],
      ["#columnCount", "2"]
    ]) {
      await setNative(selector, value, "input");
    }
    await expect(page.locator("#rowCountValue")).toHaveText("3");

    await setNative("#cursorStyle", "block", "change");
    await setNative("#fontFamily", "Consolas", "change");
    await setNative("#terminalTheme", "paper", "change");
    await setNative("#appTheme", "light", "change");

    for (const selector of ["#cursorBlink", "#bellNotify", "#copyOnSelect", "#restoreSession"]) {
      await setCheck(selector, true);
    }

    for (const mode of ["rows", "horizontal", "focus", "auto"]) {
      await setNative("#layoutMode", mode, "change");
      await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", mode);
    }

    await page.evaluate(() => document.querySelector("#fitAll").click());
    await page.evaluate(() => document.querySelector("#resetLayout").click());
  });

  test("handles keyboard shortcuts and palette commands", async () => {
    const before = await page.locator(".terminal-pane").count();
    await page.keyboard.press("Control+Shift+T");
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 1);

    await page.keyboard.press("Control+Shift+P");
    await expect(page.locator("#paletteOverlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#paletteOverlay")).toBeHidden();

    await page.keyboard.press("Control+Slash");
    await expect(page.locator("#shortcutsOverlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#shortcutsOverlay")).toBeHidden();

    // Run a command from the palette by filtering and pressing Enter.
    await page.evaluate(() => openPalette());
    await page.locator("#paletteInput").fill("New terminal");
    await page.keyboard.press("Enter");
    await expect(page.locator("#paletteOverlay")).toBeHidden();
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 2);
  });

  test("opens a pane context menu and deletes a workspace", async () => {
    // Fire the contextmenu handler on a pane (menu positioning is best-effort).
    await page.evaluate(() => {
      const pane = document.querySelector(".terminal-pane");
      pane.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 120, clientY: 120 }));
    });
    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      const sel = document.querySelector("#workspaceSelect");
      const opt = [...sel.options].find((o) => o.textContent.includes("My Layout"));
      if (opt) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await page.evaluate(() => document.querySelector("#workspaceDelete").click());
    await expect(page.locator("#workspaceSelect option", { hasText: "My Layout" })).toHaveCount(0);
  });

  test("closes all terminals", async () => {
    await page.locator("#closeAllTerminals").click();
    await expect(page.locator("#statusSessions")).toHaveText("0 sessions");
  });
});
