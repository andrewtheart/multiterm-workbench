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

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");
const { version: PKG_VERSION } = require("../../package.json");

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
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });

  test.afterAll(async () => {
    await stopRendererCoverage(page, "app");
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

  test("status-bar font zoom buttons adjust font size", async () => {
    await setNative("#fontSize", "14", "input");
    await expect(page.locator("#fontSizeValue")).toHaveText("14px");

    await page.locator("#statusZoomIn").click();
    await expect(page.locator("#fontSizeValue")).toHaveText("15px");

    await page.locator("#statusZoomOut").click();
    await expect(page.locator("#fontSizeValue")).toHaveText("14px");
  });

  test("status-bar zoom buttons disable at font-size limits", async () => {
    await setNative("#fontSize", "10", "input");
    await expect(page.locator("#statusZoomOut")).toBeDisabled();

    await setNative("#fontSize", "22", "input");
    await expect(page.locator("#statusZoomIn")).toBeDisabled();

    await setNative("#fontSize", "14", "input");
    await expect(page.locator("#statusZoomOut")).toBeEnabled();
    await expect(page.locator("#statusZoomIn")).toBeEnabled();
  });

  test("status-bar memory readout stays collapsed until the chip is hovered", async () => {
    const chip = page.locator("#statusMem");
    const value = page.locator("#statusMemText");

    // At rest the chip is glyph-only: no reading has been requested, so the
    // bridge has not been asked to run its (expensive) process-memory probe.
    await expect(chip).toHaveAttribute("aria-expanded", "false");
    await expect(value).toHaveText("");
    expect(await value.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(1);

    await chip.hover();
    await expect(chip).toHaveAttribute("aria-expanded", "true");
    await expect(chip).toHaveClass(/is-open/);
    // The bridge answers with a real reading on Windows; elsewhere it reports
    // that the probe is unavailable rather than leaving the chip spinning.
    await expect(value).toHaveText(/^(\d[\d.]* [KMGB]+ \/ \d[\d.]* [KMGB]+ \(\d+\.\d%\)|unavailable)$/, { timeout: 15000 });
    expect(await value.evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(10);

    // Moving away collapses it again and stops the refresh loop.
    await page.locator("#statusSessions").hover();
    await expect(chip).toHaveAttribute("aria-expanded", "false");
    await expect(value).toHaveText("");
    // `state` is a top-level const in a classic script, so it is reachable by
    // bare name in the page context but not as a window property.
    expect(await page.evaluate(() => state.mem.timer)).toBeNull();
  });

  test("status-bar memory readout expands on keyboard focus too", async () => {
    const chip = page.locator("#statusMem");
    const value = page.locator("#statusMemText");

    await chip.focus();
    await expect(chip).toHaveAttribute("aria-expanded", "true");
    await expect(value).not.toHaveText("");

    await chip.blur();
    await expect(chip).toHaveAttribute("aria-expanded", "false");
    await expect(value).toHaveText("");
  });

  test("degrades the memory chip quietly when the bridge rejects memstats", async () => {
    // Simulate an older bridge that predates on-demand memory stats: it answers
    // the probe with a generic "Unsupported message type: memstats" error frame
    // (which carries no id). That must mark the chip unavailable without flapping
    // the bridge status readout to offline or logging a bridge error.
    const result = await page.evaluate(() => {
      const bridgeStatus = document.querySelector("#bridgeStatus");
      const before = { text: bridgeStatus.textContent, tone: bridgeStatus.dataset.tone };
      handleBridgeMessage({ type: "error", message: "Unsupported message type: memstats" });
      return {
        before,
        unsupported: state.mem.unsupported,
        unsupportedReason: state.mem.unsupportedReason,
        timer: state.mem.timer,
        bridgeText: bridgeStatus.textContent,
        bridgeTone: bridgeStatus.dataset.tone
      };
    });

    expect(result.unsupported).toBe(true);
    expect(result.unsupportedReason).toBe("bridge");
    expect(result.timer).toBeNull();
    // The bridge status readout is untouched: no "offline" flap, no error text.
    expect(result.bridgeText).toBe(result.before.text);
    expect(result.bridgeTone).toBe(result.before.tone);
    expect(result.bridgeText).not.toContain("Unsupported message type");

    // Re-arm the chip so later shared-page tests see a working reading again.
    await page.evaluate(() => {
      state.mem.unsupported = false;
      state.mem.unsupportedReason = null;
    });
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

  test("moves pane actions into an overflow menu when panes get narrow", async () => {
    // The collapse must be driven by pane width, not the manual compact-chrome
    // setting, so explicitly turn that setting off first.
    await setCheck("#compactChrome", false);
    await expect(page.locator("#terminalHost")).not.toHaveClass(/compact/);

    await setNative("#layoutMode", "columns", "change");
    await setNative("#columnCount", "3", "input");

    const firstPane = page.locator(".terminal-pane").first();
    const firstId = await firstPane.getAttribute("data-id");
    const overflow = firstPane.locator('[data-action="more"]');

    await expect(firstPane).toHaveClass(/is-narrow/);
    await expect(overflow).toBeVisible();
    for (const action of ["move-left", "move-right", "color", "duplicate", "find"]) {
      await expect(firstPane.locator(`[data-action="${action}"]`)).toBeHidden();
    }
    // Primary actions stay in the header even when narrow.
    await expect(firstPane.locator('[data-action="close"]')).toBeVisible();

    await overflow.click();
    await expect(overflow).toHaveAttribute("aria-expanded", "true");
    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".ctx-item")).toHaveText([
      "Move left",
      "Move right",
      "Cycle label color",
      "Find…Ctrl+F",
      "Duplicate"
    ]);
    await expect(menu.locator(".ctx-item", { hasText: "Move left" })).toHaveAttribute("aria-disabled", "true");

    await menu.locator(".ctx-item", { hasText: "Move right" }).click();
    await expect(page.locator(".terminal-pane").nth(1)).toHaveAttribute("data-id", firstId);

    const movedPane = page.locator(`.terminal-pane[data-id="${firstId}"]`);
    await movedPane.locator('[data-action="more"]').click();
    await menu.locator(".ctx-item", { hasText: "Move left" }).click();
    await expect(page.locator(".terminal-pane").first()).toHaveAttribute("data-id", firstId);

    await movedPane.locator('[data-action="more"]').click();
    await menu.locator(".ctx-item", { hasText: "Cycle label color" }).click();
    await expect(movedPane).toHaveClass(/has-color/);

    const beforeDuplicate = await page.locator(".terminal-pane").count();
    await movedPane.locator('[data-action="more"]').click();
    await menu.locator(".ctx-item", { hasText: "Duplicate" }).click();
    await expect(page.locator(".terminal-pane")).toHaveCount(beforeDuplicate + 1);
  });

  test("keeps find and duplicate in the overflow menu when panes are wide", async () => {
    await setNative("#columnCount", "1", "input");

    const firstPane = page.locator(".terminal-pane").first();
    await expect(firstPane).not.toHaveClass(/is-narrow/);
    // The hamburger is always available; find/duplicate always live inside it.
    await expect(firstPane.locator('[data-action="more"]')).toBeVisible();
    for (const action of ["move-left", "move-right", "color"]) {
      await expect(firstPane.locator(`[data-action="${action}"]`)).toBeVisible();
    }
    for (const action of ["find", "duplicate"]) {
      await expect(firstPane.locator(`[data-action="${action}"]`)).toBeHidden();
    }

    await firstPane.locator('[data-action="more"]').click();
    const menu = page.locator("#contextMenu");
    await expect(menu.locator(".ctx-item")).toHaveText(["Find…Ctrl+F", "Duplicate"]);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("maximize button overlays the other panes and toggles back", async () => {
    await setNative("#columnCount", "2", "input");
    const panes = page.locator(".terminal-pane");
    if ((await panes.count()) < 2) {
      await page.locator("#addTerminal").click();
    }

    const firstPane = panes.first();
    const firstId = await firstPane.getAttribute("data-id");
    const otherPane = page.locator(`.terminal-pane:not([data-id="${firstId}"])`).first();
    const maximize = firstPane.locator('[data-action="maximize"]');

    await expect(maximize).toHaveAttribute("aria-pressed", "false");
    await maximize.click();

    await expect(page.locator("#terminalHost")).toHaveClass(/has-zoom/);
    await expect(firstPane).toHaveClass(/is-zoomed/);
    await expect(otherPane).toBeHidden();
    await expect(maximize).toHaveAttribute("aria-pressed", "true");
    await expect(maximize).toHaveAttribute("title", /Restore size/);

    // The maximized pane fills the whole workspace viewport.
    const fills = await firstPane.evaluate((pane) => {
      const host = document.querySelector("#terminalHost");
      const paneBox = pane.getBoundingClientRect();
      const hostBox = host.getBoundingClientRect();
      return Math.abs(paneBox.width - hostBox.width) < 2 && Math.abs(paneBox.height - hostBox.height) < 2;
    });
    expect(fills).toBe(true);

    // The sticky pane header must drop back into normal flow while maximized:
    // the absolutely positioned pane gives sticky a scrollport offset to resolve
    // against, which slid the header down over the terminal and clipped row 0.
    const header = await firstPane.evaluate((pane) => {
      const bar = pane.querySelector(".pane-bar");
      const screen = pane.querySelector(".terminal-screen");
      return {
        position: getComputedStyle(bar).position,
        overlap: bar.getBoundingClientRect().bottom - screen.getBoundingClientRect().top,
      };
    });
    expect(header.position).toBe("relative");
    expect(Math.abs(header.overlap)).toBeLessThan(1);

    await maximize.click();
    await expect(page.locator("#terminalHost")).not.toHaveClass(/has-zoom/);
    await expect(otherPane).toBeVisible();
    await expect(maximize).toHaveAttribute("aria-pressed", "false");
    await expect(maximize).toHaveAttribute("title", /Maximize/);

    // Normal panes keep the sticky header that keeps their X reachable.
    await expect(firstPane.locator(".pane-bar")).toHaveCSS("position", "sticky");
  });

  test("new terminal restores a maximized viewport so the new pane is visible", async () => {
    const panes = page.locator(".terminal-pane");
    const before = await panes.count();
    const firstPane = panes.first();

    await firstPane.locator('[data-action="maximize"]').click();
    await expect(page.locator("#terminalHost")).toHaveClass(/has-zoom/);

    await page.locator("#addTerminal").click();

    await expect(panes).toHaveCount(before + 1);
    await expect(page.locator("#terminalHost")).not.toHaveClass(/has-zoom/);
    await expect(panes.last()).toBeVisible();
    await expect(panes.last()).toHaveClass(/is-active/);
  });

  test("keeps the editable terminal title compact", async () => {
    const title = page.locator(".terminal-pane").first().locator(".pane-title");
    await expect(title).toHaveCSS("max-width", "180px");

    const widths = await title.evaluate((input) => ({
      input: input.getBoundingClientRect().width,
      wrapper: input.parentElement.getBoundingClientRect().width
    }));
    expect(widths.input).toBeLessThanOrEqual(180);
    expect(widths.wrapper - widths.input).toBeGreaterThan(8);
  });

  test("saves the terminal title and exits edit mode when Enter is pressed", async () => {
    const title = page.locator(".terminal-pane").first().locator(".pane-title");
    const original = await title.inputValue();

    await title.fill("  Build Logs  ");
    await title.press("Enter");

    await expect(title).toHaveValue("Build Logs");
    await expect(title).not.toBeFocused();
    await expect.poll(() => page.evaluate(() => {
      const snapshot = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]");
      return snapshot[0]?.title;
    })).toBe("Build Logs");

    await title.fill(original);
    await title.press("Enter");
  });

  test("shows the pid as a translucent pill at the bottom right of the pane", async () => {
    const pane = page.locator(".terminal-pane").first();
    const status = pane.locator(".pane-status");

    await expect(status).toHaveText(/^pid \d+$/);
    // The pill overlays the terminal rather than sitting in the header.
    await expect(pane.locator(".pane-bar .pane-status")).toHaveCount(0);

    const boxes = await pane.evaluate((el) => {
      const pill = el.querySelector(".pane-status");
      const paneBox = el.getBoundingClientRect();
      const pillBox = pill.getBoundingClientRect();
      const barBox = el.querySelector(".pane-bar").getBoundingClientRect();
      return {
        position: getComputedStyle(pill).position,
        fromRight: paneBox.right - pillBox.right,
        fromBottom: paneBox.bottom - pillBox.bottom,
        belowBar: pillBox.top > barBox.bottom
      };
    });

    expect(boxes.position).toBe("absolute");
    expect(boxes.belowBar).toBe(true);
    expect(boxes.fromRight).toBeLessThan(24);
    expect(boxes.fromBottom).toBeLessThan(24);

    const opacity = () => status.evaluate((el) => Number(getComputedStyle(el).opacity));

    // Park the pointer away from the pane; earlier tests can leave it hovering.
    await page.mouse.move(0, 0);
    // Very translucent when idle so it does not compete with terminal output.
    await expect.poll(opacity).toBeLessThan(0.35);

    // Hovering or focusing the pane must leave it alone - only the pill itself
    // reacts, so the number never brightens just because a pane is in use.
    const resting = await opacity();
    await pane.locator(".pane-title").hover();
    await expect.poll(opacity).toBe(resting);

    await pane.locator(".terminal-screen").click();
    await expect.poll(opacity).toBe(resting);

    // Hovering the pill itself makes it fully legible.
    await status.hover();
    await expect.poll(opacity).toBe(1);

    await page.mouse.move(0, 0);
    await expect.poll(opacity).toBe(resting);
  });

  test("docks the log toggle in the status bar beside Close all", async () => {
    const report = await page.evaluate(() => {
      const toggle = document.querySelector("#logToggle");
      const closeAll = document.querySelector("#closeAllTerminals");
      const t = toggle.getBoundingClientRect();
      const c = closeAll.getBoundingClientRect();
      return {
        inStatusBar: toggle.closest(".status-bar") !== null,
        // Immediately to the right of Close all, with nothing in between.
        followsCloseAll: closeAll.nextElementSibling === toggle,
        toRightOfCloseAll: t.left >= c.right,
        sameRow: Math.abs(t.top - c.top) < 6,
        position: getComputedStyle(toggle).position,
        overlapsWorkbench: (() => {
          const h = document.querySelector("#terminalHost").getBoundingClientRect();
          return t.right > h.left && t.left < h.right && t.bottom > h.top && t.top < h.bottom;
        })(),
        pillInsets: [...document.querySelectorAll(".terminal-pane")].map((pane) => {
          const b = pane.querySelector(".pane-status").getBoundingClientRect();
          return Math.round(pane.getBoundingClientRect().right - b.right);
        })
      };
    });

    expect(report.inStatusBar).toBe(true);
    expect(report.followsCloseAll).toBe(true);
    expect(report.toRightOfCloseAll).toBe(true);
    expect(report.sameRow).toBe(true);
    // Docked in the bar, not floating over the workbench.
    expect(report.position).not.toBe("fixed");
    expect(report.overlapsWorkbench).toBe(false);
    // Nothing hovers over the panes any more, so every pill sits flush right
    // instead of one being nudged clear of a floating button.
    expect(report.pillInsets.length).toBeGreaterThan(0);
    for (const inset of report.pillInsets) expect(inset).toBeLessThan(24);
    expect(new Set(report.pillInsets).size).toBe(1);
  });

  test("keeps the log toggle in place and flips its chevron when the panel opens", async () => {
    const toggle = page.locator("#logToggle");
    const panel = page.locator("#logPanel");

    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const closed = await toggle.boundingBox();

    await toggle.click();
    await expect(panel).toBeVisible();
    // It used to hide itself when open; in the bar that would collapse a slot
    // and shuffle its neighbours, so it stays put and turns into the closer.
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(toggle).toHaveAttribute("aria-label", "Hide logs");
    const open = await toggle.boundingBox();
    expect(Math.round(open.x)).toBe(Math.round(closed.x));
    expect(Math.round(open.y)).toBe(Math.round(closed.y));

    // The chevron points at the panel: up to summon it, down to dismiss it.
    // Poll rather than sample once - the rotation is animated, so an immediate
    // read catches it partway round.
    const chevron = () => toggle.locator("svg").evaluate((el) => getComputedStyle(el).transform);
    await expect.poll(chevron).toBe("matrix(-1, 0, 0, -1, 0, 0)");

    await toggle.click();
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-label", "Show logs");
    await expect.poll(chevron).toBe("none");
  });

  test("opens the About dialog and shows the version", async () => {
    await page.locator("#aboutToggle").click();
    await expect(page.locator("#aboutOverlay")).toBeVisible();
    // Read the version from package.json rather than hard-coding a prefix, so
    // the assertion keeps its teeth across releases instead of going stale.
    await expect(page.locator("#aboutVersionText")).toContainText(PKG_VERSION);
    await page.locator("#aboutClose").click();
    await expect(page.locator("#aboutOverlay")).toBeHidden();
  });

  test("offers an update when GitHub reports a newer release", async () => {
    // GitHub is stubbed at the network layer so the check runs end to end
    // (fetch → compare → dialog) without depending on the real API.
    const stubRelease = (body) => page.route("https://api.github.com/repos/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(body)
    }));

    await stubRelease({
      tag_name: "v999.0.0",
      name: "MultiTerm 999.0.0",
      body: "## Highlights\n- Real **maximize** button\n- `Ctrl+Shift+X` still works\n\nSee https://example.com/notes",
      html_url: "https://github.com/andrewtheart/multiterm-workbench/releases/tag/v999.0.0",
      assets: [{ name: "MultiTerm-Setup-999.0.0.exe", browser_download_url: "https://example.com/setup.exe", size: 1024 }]
    });

    await page.evaluate(() => checkForUpdates({ manual: true }));
    const overlay = page.locator("#updateOverlay");
    await expect(overlay).toBeVisible();
    await expect(page.locator("#updateSubtitle")).toContainText(`MultiTerm 999.0.0 is available`);
    await expect(page.locator("#updateSubtitle")).toContainText(PKG_VERSION);

    // Release notes render as real DOM, not raw markdown.
    await expect(page.locator("#updateNotes h3")).toHaveText("Highlights");
    await expect(page.locator("#updateNotes li")).toHaveCount(2);
    await expect(page.locator("#updateNotes strong")).toHaveText("maximize");
    await expect(page.locator("#updateNotes code")).toHaveText("Ctrl+Shift+X");
    await expect(page.locator("#updateNotes a")).toHaveAttribute("href", "https://example.com/notes");

    // Without the Electron bridge the primary action degrades to the download page.
    await expect(page.locator("#updateInstall")).toHaveText("Open download page");
    await expect(page.locator("#updateViewRelease")).toHaveAttribute("href", /releases\/tag\/v999\.0\.0/);

    await page.locator("#updateLater").click();
    await expect(overlay).toBeHidden();
    // "Later" is remembered so automatic checks stop nagging about this version.
    const dismissed = await page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.updateCheck") || "{}").dismissedVersion);
    expect(dismissed).toBe("999.0.0");
  });

  test("never renders release notes as HTML", async () => {
    await page.route("https://api.github.com/repos/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        tag_name: "v999.0.1",
        body: "<img src=x onerror=\"window.__pwned = true\"> and [link](javascript:alert(1))",
        assets: []
      })
    }));

    await page.evaluate(() => checkForUpdates({ manual: true }));
    await expect(page.locator("#updateOverlay")).toBeVisible();
    await expect(page.locator("#updateNotes img")).toHaveCount(0);
    await expect(page.locator("#updateNotes a")).toHaveCount(0);
    await expect(page.locator("#updateNotes")).toContainText("<img src=x");
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();

    await page.keyboard.press("Escape");
    await expect(page.locator("#updateOverlay")).toBeHidden();
  });

  test("reports being up to date and surfaces check failures", async () => {
    await page.route("https://api.github.com/repos/**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ tag_name: `v${PKG_VERSION}`, body: "", assets: [] })
    }));

    await page.evaluate(() => checkForUpdates({ manual: true }));
    await expect(page.locator(".toast").last()).toContainText("up to date");
    await expect(page.locator("#updateOverlay")).toBeHidden();

    await page.route("https://api.github.com/repos/**", (route) => route.fulfill({
      status: 503,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "nope"
    }));
    await page.evaluate(() => checkForUpdates({ manual: true }));
    await expect(page.locator(".toast").last()).toContainText("Update check failed");
    await expect(page.locator("#updateOverlay")).toBeHidden();

    await page.unroute("https://api.github.com/repos/**");
  });

  test("renders the brand mark from the shipped app icon", async () => {
    // The taskbar icon and the in-app brand mark must be the same artwork; the
    // mark used to be an unrelated CSS gradient blob.
    for (const selector of [".topbar .brand-mark", ".about-head .brand-mark"]) {
      const image = await page
        .locator(selector)
        .evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(image).toContain("favicon.svg");
    }
    const reachable = await page.evaluate(async () => {
      const res = await fetch("favicon.svg");
      return { ok: res.ok, body: await res.text() };
    });
    expect(reachable.ok).toBe(true);
    // Same two marks the .ico carries: the teal chevron and the amber cursor.
    expect(reachable.body).toContain("#79d7bd");
    expect(reachable.body).toContain("#f0b35a");
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

  test("selects all output in the focused terminal with Ctrl+A", async () => {
    const expected = await page.evaluate(async () => {
      const terminal = state.terminals.get(state.activeId);
      await new Promise((resolve) => terminal.term.write("\r\nctrl-a-selection-marker", resolve));
      terminal.term.selectAll();
      const selection = terminal.term.getSelection();
      terminal.term.clearSelection();
      terminal.term.focus();
      return { id: terminal.id, selection };
    });

    expect(expected.selection).toContain("ctrl-a-selection-marker");
    await page.keyboard.press("Control+a");

    await expect.poll(() => page.evaluate((id) => {
      const terminal = state.terminals.get(id);
      return {
        activeId: state.activeId,
        selection: terminal.term.getSelection()
      };
    }, expected.id)).toEqual({
      activeId: expected.id,
      selection: expected.selection
    });

    await page.evaluate((id) => state.terminals.get(id).term.clearSelection(), expected.id);
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

  test("recovers the WebGL renderer after a GPU context loss", async () => {
    // Probe a pane's screen for a live WebGL canvas. The link-layer canvas is 2D,
    // so getContext('webgl') returns null there and is skipped.
    const probe = () => page.evaluate(() => {
      const screen = document.querySelector(".terminal-pane .xterm-screen");
      if (!screen) return { present: false, live: false };
      for (const c of screen.querySelectorAll("canvas")) {
        let gl = null;
        try { gl = c.getContext("webgl2") || c.getContext("webgl"); } catch { gl = null; }
        if (gl) return { present: true, live: !gl.isContextLost() };
      }
      return { present: false, live: false };
    });

    const start = await probe();
    // The DOM renderer (no GPU in some headless envs) has no WebGL canvas; the
    // recovery path only applies when the WebGL renderer is actually active.
    test.skip(!start.present, "WebGL renderer not active in this environment");
    expect(start.live).toBe(true);

    const pageErrors = [];
    const onError = (err) => pageErrors.push(String(err));
    page.on("pageerror", onError);

    const forceLoss = () => page.evaluate(() => {
      const screen = document.querySelector(".terminal-pane .xterm-screen");
      for (const c of screen.querySelectorAll("canvas")) {
        let gl = null;
        try { gl = c.getContext("webgl2") || c.getContext("webgl"); } catch { gl = null; }
        if (gl && !gl.isContextLost()) {
          const ext = gl.getExtension("WEBGL_lose_context");
          if (!ext) return false;
          ext.loseContext();
          return true;
        }
      }
      return false;
    });

    // Four rapid loss/recover cycles inside the 8s throttle window exercise BOTH
    // recovery delays: the fast 300ms path for the first losses and the backed-off
    // 1500ms path once repeated losses mark the pane as thrashing. Each cycle must
    // end with a fresh, live (non-lost) WebGL context — proof the pane resumes
    // drawing instead of freezing blank (the overlap/ghosting bug).
    for (let i = 0; i < 4; i += 1) {
      expect(await forceLoss()).toBe(true);
      await expect.poll(async () => (await probe()).live, { timeout: 6000 }).toBe(true);
    }

    page.off("pageerror", onError);
    expect(pageErrors).toEqual([]);
  });

  test("holds the PTY resize during a window drag and forwards one settled size", async () => {
    // Regression guard for the cursor-desync bug: forwarding a fresh size to the
    // shell on every ResizeObserver frame during a continuous WINDOW drag sends a
    // WINCH storm to the PTY, and PSReadLine's line reflow races xterm's own
    // reflow — corrupting the rendered line and stranding the cursor far from the
    // visible prompt. The visual fit still runs every frame (so panes track the
    // layout smoothly), but while a window drag is in flight the PTY resize is
    // held back and a SINGLE settled size is forwarded once the drag stops. A
    // discrete resize with no window drag (terminal creation / layout change)
    // must still forward immediately.
    const result = await page.evaluate(async () => {
      const term = state.terminals.get(state.activeId) || state.terminals.values().next().value;
      const id = term.id;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      // Intercept the bridge so we can count the resize messages this pane emits.
      const origSend = window.sendBridge;
      const sends = [];
      window.sendBridge = (msg) => {
        if (msg && msg.type === "resize" && msg.id === id) sends.push({ cols: msg.cols, rows: msg.rows });
        return origSend(msg);
      };
      // Prime the dedupe cache so the settled size is guaranteed to be a change.
      term.lastSentCols = 0;
      term.lastSentRows = 0;
      const rows = term.term.rows;
      // 8 changing widths, 20ms apart — mimics a drag's frames. Each frame a
      // window "resize" event marks the drag in flight; the terminal then refits.
      const widths = [70, 90, 72, 92, 74, 94, 76, 96];
      for (const w of widths) {
        window.dispatchEvent(new Event("resize"));
        term.term.resize(w, rows); // fires onResize -> queueResize (deferred mid-drag)
        await sleep(20);
      }
      const during = sends.length; // the WINCH is held back for the whole drag
      await sleep(300);            // > RESIZE_DRAG_IDLE_MS: drag settles, size flushed
      const afterDrag = sends.length;
      // Outside a drag, a discrete resize forwards at once (creation/layout path).
      term.term.resize(88, rows);
      const immediate = sends.length;
      window.sendBridge = origSend;
      return { during, afterDrag, immediate, sent: sends, finalWidth: widths[widths.length - 1], rows };
    });
    // Mid-drag the shell is never resized; the drag collapses to exactly ONE
    // settled WINCH carrying the final width — never one-per-frame.
    expect(result.during).toBe(0);                        // no WINCH while dragging
    expect(result.afterDrag).toBe(1);                     // one settled send at drag end
    expect(result.sent[0].cols).toBe(result.finalWidth);  // it carried the final size
    expect(result.sent[0].rows).toBe(result.rows);
    // A resize with no active window drag is forwarded immediately.
    expect(result.immediate).toBe(2);
    expect(result.sent[1].cols).toBe(88);
  });

  test("keeps every pane's close button clickable when the terminal host scrolls", async () => {
    // Regression guard for "pressing the right-most terminal's X does nothing".
    // At the default 1280x720 viewport, 3 panes overflow the host vertically, so
    // revealing the newly-added pane scrolls the top row's headers up toward the
    // topbar. Before the sticky-header fix a top-row pane's X slid under the
    // topbar's action buttons (e.g. #toggleHeaderTop), which then intercepted the
    // click, so the X had no effect. Note a naive locator.click() auto-scrolls the
    // button into view and MASKS the bug — the guard must hit-test real
    // coordinates and click via the raw mouse.
    await page.evaluate(() => {
      for (const t of [...state.terminals.values()]) disposeTerminal(t);
      state.terminals.clear();
      state.activeId = null;
      addTerminal({ reveal: true });
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await page.locator("#addTerminal").click();
    await page.locator("#addTerminal").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(3);
    await page.waitForTimeout(200); // let the reveal scroll settle

    const probe = await page.evaluate(() => {
      const host = document.querySelector("#terminalHost");
      const panes = [...document.querySelectorAll(".terminal-pane")];
      panes.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
      const pane = panes[0]; // the right-most pane (worst-affected top-row pane)
      const btn = pane.querySelector('[data-action="close"]');
      const bar = pane.querySelector(".pane-bar");
      const r = btn.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const at = document.elementFromPoint(cx, cy);
      return {
        overflows: host.scrollHeight > host.clientHeight,
        scrollTop: host.scrollTop,
        hostTop: Math.round(host.getBoundingClientRect().top),
        headerTop: Math.round(barRect.top),
        buttonTop: Math.round(r.top),
        cx,
        cy,
        hitsButton: !!(at && btn.contains(at))
      };
    });

    // The scenario must genuinely scroll the host, else it guards nothing.
    expect(probe.overflows).toBe(true);
    expect(probe.scrollTop).toBeGreaterThan(0);
    // The sticky header pins flush to the host's top edge. Leaving the host's
    // stage padding above it exposes a detached strip of terminal output.
    expect(Math.abs(probe.headerTop - probe.hostTop)).toBeLessThanOrEqual(1);
    // Its X remains clear of the topbar, and a real hit-test at the X's centre
    // lands on the close button — not the topbar.
    expect(probe.buttonTop).toBeGreaterThanOrEqual(probe.hostTop);
    expect(probe.hitsButton).toBe(true);

    // A real coordinate click (raw mouse, no auto-scroll) closes that pane.
    const before = await page.evaluate(() => state.terminals.size);
    await page.mouse.click(probe.cx, probe.cy);
    await expect(page.locator(".terminal-pane")).toHaveCount(before - 1);
  });

  test("moves keyboard focus into a pane when its chrome is clicked", async () => {
    // Regression guard for "click the second terminal, then type, and the text
    // lands in the FIRST terminal". Clicking a pane's CHROME (its header bar or
    // the padding around the terminal) marks it active after the click completes,
    // but before the fix it did NOT move DOM focus into that pane's
    // xterm. The browser blurred the previously focused terminal to <body>, so
    // the active pane and the keyboard-focused pane diverged and keystrokes kept
    // flowing to whichever terminal was focused before. The fix intercepts a
    // primary-button mousedown on non-interactive chrome and focuses THIS pane's
    // terminal, so keystrokes always land in the pane that was just clicked.
    await page.evaluate(() => {
      for (const t of [...state.terminals.values()]) disposeTerminal(t);
      state.terminals.clear();
      state.activeId = null;
      addTerminal();
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await page.locator("#addTerminal").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await page.waitForTimeout(150); // let the layout + fit settle

    // Identify the left (A) and right (B) panes and a click point in B's top
    // screen-padding gutter: inside .terminal-screen but ABOVE the .xterm
    // surface and clear of every control (the exact "chrome" the fix targets).
    const info = await page.evaluate(() => {
      const panes = [...document.querySelectorAll(".terminal-pane")];
      panes.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      const [A, B] = panes;
      const screen = B.querySelector(".terminal-screen").getBoundingClientRect();
      const cx = Math.round(screen.left + screen.width / 2);
      const cy = Math.round(screen.top + 3);
      const hit = document.elementFromPoint(cx, cy);
      return {
        aId: A.dataset.id,
        bId: B.dataset.id,
        cx,
        cy,
        hitInXterm: !!(hit && hit.closest(".xterm")),
        hitIsControl: !!(hit && hit.closest("button, select, input, textarea, a, [contenteditable]")),
        hitInB: !!(hit && hit.closest(".terminal-pane") === B)
      };
    });

    // The chosen point must be pane B's chrome (not the xterm surface, not a
    // control), otherwise it would not exercise the focus-follows-activation path.
    expect(info.hitInB).toBe(true);
    expect(info.hitInXterm).toBe(false);
    expect(info.hitIsControl).toBe(false);

    // Focus terminal A first by clicking its xterm, and confirm it holds focus.
    const aCenter = await page.evaluate((aId) => {
      const A = [...document.querySelectorAll(".terminal-pane")].find((p) => p.dataset.id === aId);
      const r = A.querySelector(".xterm").getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    }, info.aId);
    await page.mouse.click(aCenter.x, aCenter.y);
    await page.waitForTimeout(50);

    const readFocus = () => page.evaluate(() => {
      const a = document.activeElement;
      const pane = a && a.closest ? a.closest(".terminal-pane") : null;
      return {
        activeId: state.activeId,
        focusPaneId: pane ? pane.dataset.id : null,
        isTerminalTextarea: !!(a && a.classList && a.classList.contains("xterm-helper-textarea"))
      };
    });

    const before = await readFocus();
    expect(before.activeId).toBe(info.aId);
    expect(before.focusPaneId).toBe(info.aId);
    expect(before.isTerminalTextarea).toBe(true);

    // Click terminal B's chrome with the raw mouse (no auto-scroll/synthetic focus).
    await page.mouse.click(info.cx, info.cy);
    await page.waitForTimeout(50);

    // Activation AND keyboard focus both move to B: xterm routes keystrokes to
    // the focused terminal, so typing now lands in the pane the user clicked.
    // Pre-fix, focus stayed off B (blurred to <body>), so these fail.
    const after = await readFocus();
    expect(after.activeId).toBe(info.bId);
    expect(after.focusPaneId).toBe(info.bId);
    expect(after.isTerminalTextarea).toBe(true);
  });

  test("moves keyboard focus into a pane when its Focus button is used", async () => {
    // Regression guard for "add 5 terminals, focus the 4th with its Focus button,
    // then type, and the text lands in a DIFFERENT terminal". The pane toolbar's
    // Focus button ([data-action="focus"]) switches to the Focus-rail layout and
    // marks the pane active, but before the fix it did NOT move DOM focus into
    // that pane's xterm. Keyboard focus stayed on the button (or blurred to
    // <body>), so keystrokes kept flowing to whichever terminal was focused
    // before. The fix focuses the pane's terminal after switching layout, so
    // typing always lands in the pane the user chose to focus.
    await page.evaluate(() => {
      for (const t of [...state.terminals.values()]) disposeTerminal(t);
      state.terminals.clear();
      state.activeId = null;
      state.settings.layout = "auto";
      elements.layoutMode.value = "auto";
      applySettings();
      addTerminal();
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    for (let i = 0; i < 4; i++) await page.locator("#addTerminal").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(5);
    await page.waitForTimeout(150); // let the layout + fit settle

    const ids = await page.evaluate(() =>
      [...document.querySelectorAll(".terminal-pane")].map((p) => p.dataset.id)
    );
    const firstId = ids[0];
    const fourthId = ids[3];

    const readFocus = () => page.evaluate(() => {
      const a = document.activeElement;
      const pane = a && a.closest ? a.closest(".terminal-pane") : null;
      return {
        layout: state.settings.layout,
        activeId: state.activeId,
        focusPaneId: pane ? pane.dataset.id : null,
        isTerminalTextarea: !!(a && a.classList && a.classList.contains("xterm-helper-textarea"))
      };
    });

    // Establish a "previously focused" pane: focus the FIRST terminal's xterm and
    // confirm it holds keyboard focus (this is the pane that wrongly received
    // keystrokes before the fix). Focus it programmatically so the precondition is
    // not subject to pane overflow/scroll at this viewport.
    await page.evaluate((id) => state.terminals.get(id).term.focus(), firstId);
    const before = await readFocus();
    expect(before.focusPaneId).toBe(firstId);
    expect(before.isTerminalTextarea).toBe(true);

    // Use the 4th pane's Focus button. The bug is in the button handler (missing
    // term.focus()), independent of scroll position, so an auto-scrolling
    // locator click is a faithful and stable trigger here.
    await page.locator(".terminal-pane").nth(3).locator('[data-action="focus"]').click();
    await page.waitForTimeout(50);

    // Layout switches to Focus rail AND both activation and keyboard focus move to
    // the 4th pane: xterm routes keystrokes to the focused terminal, so typing now
    // lands in the pane whose Focus button was pressed. Pre-fix, focus stayed off
    // the 4th pane (on the button / <body>), so these fail.
    const after = await readFocus();
    expect(after.layout).toBe("focus");
    expect(after.activeId).toBe(fourthId);
    expect(after.focusPaneId).toBe(fourthId);
    expect(after.isTerminalTextarea).toBe(true);

    // Restore a normal layout so later tests start from a clean state.
    await page.evaluate(() => {
      state.settings.layout = "auto";
      elements.layoutMode.value = "auto";
      applySettings();
      saveSettings();
    });
  });

  test("keeps a rail pane's controls working when activating it reflows the layout", async () => {
    // Regression guard for the Focus-rail "press a control, the layout reflows the
    // pane out from under the cursor, and the click misses the button" bug. In
    // The explicit Focus action promotes a pane to the large primary slot. The old
    // pointerdown coupling ran before the control click
    // was delivered — so pressing a small rail pane's Focus/Close button moved the
    // button hundreds of pixels between mousedown and mouseup: mouseup/click landed
    // on empty chrome, the button's own handler never ran, and the Focus button
    // (which grabbed DOM focus on mousedown) left keyboard focus stuck on itself so
    // typing went nowhere, while Close silently did nothing. The fix skips the
    // pointerdown re-activation for control presses, so the control's click handler
    // runs after the click has actually been delivered.
    await page.evaluate(() => {
      for (const t of [...state.terminals.values()]) disposeTerminal(t);
      state.terminals.clear();
      state.activeId = null;
      state.settings.layout = "auto";
      elements.layoutMode.value = "auto";
      applySettings();
      addTerminal();
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    for (let i = 0; i < 4; i++) await page.locator("#addTerminal").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(5);

    const ids = await page.evaluate(() =>
      [...document.querySelectorAll(".terminal-pane")].map((p) => p.dataset.id)
    );

    // Enter Focus-rail with the FIRST pane as the large primary, so the other four
    // are small rail panes whose controls WILL move when they are activated.
    await page.evaluate((id) => {
      state.settings.layout = "focus";
      elements.layoutMode.value = "focus";
      if (typeof setPrimaryTerminal === "function") setPrimaryTerminal(id);
      setActiveTerminal(id);
      applySettings();
      saveSettings();
    }, ids[0]);
    await page.waitForTimeout(200); // let the rail layout settle
    await expect(page.locator(".terminal-pane.is-primary")).toHaveCount(1);
    const primaryBefore = await page.evaluate(() =>
      document.querySelector(".terminal-pane.is-primary")?.dataset.id
    );
    expect(primaryBefore).toBe(ids[0]);

    const focusTargetId = ids[3]; // a small rail pane (not the primary)

    const readFocus = () => page.evaluate(() => {
      const a = document.activeElement;
      const pane = a && a.closest ? a.closest(".terminal-pane") : null;
      const primary = document.querySelector(".terminal-pane.is-primary");
      return {
        activeId: state.activeId,
        focusPaneId: pane ? pane.dataset.id : null,
        isTerminalTextarea: !!(a && a.classList && a.classList.contains("xterm-helper-textarea")),
        primaryId: primary ? primary.dataset.id : null
      };
    });

    // Use a rail pane's Focus button with a real trusted click. The reflow happens
    // during the click; the fix keeps the button under the cursor so its handler
    // runs. Pre-fix, focus stayed on the button (isTerminalTextarea === false).
    await page.locator(".terminal-pane").nth(3).locator('[data-action="focus"]').click();
    await page.waitForTimeout(80);

    const after = await readFocus();
    expect(after.activeId).toBe(focusTargetId);
    expect(after.primaryId).toBe(focusTargetId);
    expect(after.focusPaneId).toBe(focusTargetId);
    expect(after.isTerminalTextarea).toBe(true);

    // Typing now routes to the focused pane (the actual user-visible symptom):
    // xterm delivers the keystroke to the terminal whose textarea holds focus.
    // Pre-fix that textarea was never focused, so this keystroke never arrives.
    // Arm the listener in its own awaited evaluate: a pending page.evaluate is not
    // ordered against page.keyboard.type, so registering and typing in parallel can
    // deliver the keystroke before onData is subscribed.
    await page.evaluate((id) => {
      window.__routedKey = new Promise((resolve) => {
        const term = state.terminals.get(id).term;
        const sub = term.onData((d) => { sub.dispose(); resolve(d); });
        setTimeout(() => { try { sub.dispose(); } catch {} resolve(null); }, 2000);
      });
    }, focusTargetId);
    await page.keyboard.type("x");
    const routed = await page.evaluate(() => window.__routedKey);
    expect(routed).toBe("x");

    // A DIFFERENT rail pane's Close button must actually close it despite the same
    // reflow. Pre-fix the pointerdown promotion moved the X and the click missed it,
    // so nothing closed; post-fix the X's handler runs and the pane is removed.
    const closeTargetId = ids[4];
    await page.locator(`.terminal-pane[data-id="${closeTargetId}"] [data-action="close"]`).click();
    await expect(page.locator(`.terminal-pane[data-id="${closeTargetId}"]`)).toHaveCount(0);

    // Restore a normal layout so later tests start from a clean state.
    await page.evaluate(() => {
      state.settings.layout = "auto";
      elements.layoutMode.value = "auto";
      applySettings();
      saveSettings();
    });
  });

  test("focuses a rail xterm without promoting it", async () => {
    await page.evaluate(() => {
      for (const t of [...state.terminals.values()]) disposeTerminal(t);
      state.terminals.clear();
      state.activeId = null;
      state.settings.layout = "auto";
      elements.layoutMode.value = "auto";
      applySettings();
      addTerminal();
    });
    for (let i = 0; i < 4; i++) await page.locator("#addTerminal").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(5);

    const ids = await page.evaluate(() =>
      [...document.querySelectorAll(".terminal-pane")].map((pane) => pane.dataset.id)
    );
    const originalPrimaryId = ids[3];
    const targetId = ids[1];
    await page.evaluate((id) => {
      state.settings.layout = "focus";
      elements.layoutMode.value = "focus";
      if (typeof setPrimaryTerminal === "function") setPrimaryTerminal(id);
      setActiveTerminal(id);
      applySettings();
    }, originalPrimaryId);
    await page.waitForTimeout(200);

    const point = await page.evaluate((id) => {
      const pane = [...document.querySelectorAll(".terminal-pane")]
        .find((candidate) => candidate.dataset.id === id);
      const xterm = pane.querySelector(".xterm");
      const rect = xterm.getBoundingClientRect();
      for (const yRatio of [0.3, 0.5, 0.7]) {
        for (const xRatio of [0.3, 0.5, 0.7]) {
          const x = rect.left + (rect.width * xRatio);
          const y = rect.top + (rect.height * yRatio);
          const hit = document.elementFromPoint(x, y);
          if (hit?.closest(".xterm") === xterm && hit.closest(".terminal-pane") === pane) {
            state.terminals.get(id).term.clearSelection();
            const paneRect = pane.getBoundingClientRect();
            return {
              x,
              y,
              paneRect: {
                x: paneRect.x,
                y: paneRect.y,
                width: paneRect.width,
                height: paneRect.height
              }
            };
          }
        }
      }
      return null;
    }, targetId);
    expect(point).not.toBeNull();

    await page.mouse.move(point.x - 80, point.y - 40);
    await page.mouse.move(point.x, point.y, { steps: 24 });
    await page.mouse.down();
    await page.waitForTimeout(100);

    // Clicking changes only the keyboard-active pane. The explicit Focus button
    // remains the sole owner of primary-pane promotion.
    const whilePressed = await page.evaluate(() => ({
      activeId: state.activeId,
      primaryId: document.querySelector(".terminal-pane.is-primary")?.dataset.id
    }));
    expect(whilePressed.activeId).toBe(targetId);
    expect(whilePressed.primaryId).toBe(originalPrimaryId);

    await page.mouse.up();
    await page.waitForTimeout(50);

    const afterRelease = await page.evaluate((id) => {
      const terminal = state.terminals.get(id);
      const focusedPane = document.activeElement?.closest(".terminal-pane");
      const paneRect = terminal.pane.getBoundingClientRect();
      return {
        activeId: state.activeId,
        primaryId: document.querySelector(".terminal-pane.is-primary")?.dataset.id,
        focusPaneId: focusedPane?.dataset.id || null,
        isTerminalTextarea: document.activeElement?.classList.contains("xterm-helper-textarea") || false,
        hasSelection: terminal.term.hasSelection(),
        selection: terminal.term.getSelection(),
        paneRect: {
          x: paneRect.x,
          y: paneRect.y,
          width: paneRect.width,
          height: paneRect.height
        }
      };
    }, targetId);
    expect(afterRelease.activeId).toBe(targetId);
    expect(afterRelease.primaryId).toBe(originalPrimaryId);
    expect(afterRelease.focusPaneId).toBe(targetId);
    expect(afterRelease.isTerminalTextarea).toBe(true);
    expect(afterRelease.hasSelection).toBe(false);
    expect(afterRelease.selection).toBe("");
    expect(afterRelease.paneRect.x).toBeCloseTo(point.paneRect.x, 1);
    expect(afterRelease.paneRect.y).toBeCloseTo(point.paneRect.y, 1);
    expect(afterRelease.paneRect.width).toBeCloseTo(point.paneRect.width, 1);
    expect(afterRelease.paneRect.height).toBeCloseTo(point.paneRect.height, 1);

    // Arm the listener before typing; see the note above about evaluate/keyboard ordering.
    await page.evaluate((id) => {
      window.__routedKey = new Promise((resolve) => {
        const sub = state.terminals.get(id).term.onData((data) => {
          sub.dispose();
          resolve(data);
        });
        setTimeout(() => {
          try { sub.dispose(); } catch {}
          resolve(null);
        }, 2000);
      });
    }, targetId);
    await page.keyboard.type("z");
    expect(await page.evaluate(() => window.__routedKey)).toBe("z");

    await page.evaluate(() => {
      state.settings.layout = "auto";
      elements.layoutMode.value = "auto";
      applySettings();
      saveSettings();
    });
  });

  test("closes all terminals", async () => {
    await page.locator("#closeAllTerminals").click();
    await expect(page.locator("#statusSessions")).toHaveText("0 sessions");
  });
});
