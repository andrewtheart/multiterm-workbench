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
    await page.evaluate(() => {
      closeAllTerminals();
      addTerminal();
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test.afterAll(async () => {
    await stopRendererCoverage(page, "app");
    await context.close();
  });

  test("connects to the bridge and auto-creates a session", async () => {
    await expect(page.locator("#bridgeStatus")).toHaveText(/Bridge connected/i);
    await expect(page.locator("#statusSessions")).toHaveText("1 session");
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await expect(page.locator("#addTerminal")).toHaveAttribute("title", "New terminal (Ctrl+N / Ctrl+Shift+T)");
    await expect(page.locator("#addTerminal")).toHaveAttribute("aria-keyshortcuts", "Control+N Control+Shift+T");
    await expect(page.locator("#toggleHeaderTop")).toHaveAttribute("title", "Collapse top bar (Ctrl+Shift+H)");
    await expect(page.locator("#toggleHeaderTop")).toHaveAttribute("aria-label", "Collapse top bar");
    await expect(page.locator(".action-cluster > :last-child")).toHaveAttribute("id", "addTerminal");
  });

  test("numbers a new Command Prompt from the selected shell", async () => {
    const panes = page.locator(".terminal-pane");
    const before = await panes.count();
    const expectedTitle = await page.evaluate(() => nextTerminalTitle("cmd"));

    await setNative("#shellSelect", "cmd", "change");
    await page.locator("#addTerminal").click();

    await expect(panes).toHaveCount(before + 1);
    await expect(panes.last().locator(".pane-title")).toHaveValue(expectedTitle);
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].at(-1)?.shell)).toBe("cmd");
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].at(-1)?.status)).toBe("live");

    await panes.last().locator('[data-action="close"]').click();
    await expect(panes).toHaveCount(before);
    await setNative("#shellSelect", "pwsh", "change");
  });

  // Palette and context-menu entries used to pass a fixed title such as "WSL",
  // so those terminals opened unnumbered and indistinguishable from each other.
  test("numbers every shell on its own sequence", async () => {
    const panes = page.locator(".terminal-pane");
    const before = await panes.count();
    const titles = await page.evaluate(() => {
      const opened = ["wsl", "wsl", "cmd", "wsl"].map((shell) => addTerminal({ shell }).titleInput.value);
      getCommands().find((command) => command.label === "New WSL terminal").run();
      return { opened, viaPalette: [...state.terminals.values()].at(-1).titleInput.value };
    });

    expect(titles.opened).toEqual(["WSL 1", "WSL 2", "Command Prompt 1", "WSL 3"]);
    expect(titles.viaPalette).toBe("WSL 4");

    await expect(panes).toHaveCount(before + 5);
    // WSL may or may not have a distro on the host; either way the pane must
    // settle before it is closed so no bridge session is orphaned.
    await expect
      .poll(() => page.evaluate(() => [...state.terminals.values()].every((t) => t.status !== "starting")), {
        timeout: 20000
      })
      .toBe(true);
    for (let i = 0; i < 5; i += 1) await panes.last().locator('[data-action="close"]').click();
    await expect(panes).toHaveCount(before);
  });

  test("keeps New terminal fully reachable in a compressed desktop header", async () => {
    try {
      for (const width of [1041, 1145, 1270, 1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 768 });
        const addTerminalButton = page.locator("#addTerminal");
        const headerToggle = page.locator("#toggleHeaderTop");
        const minimizeButton = page.locator("#minimizeApp");
        await expect(addTerminalButton).toBeVisible();
        await expect(headerToggle).toBeVisible();
        await expect(minimizeButton).toBeVisible();

        const layout = await page.evaluate(() => {
          const bounds = (selector) => {
            const rect = document.querySelector(selector).getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return {
              left: rect.left,
              right: rect.right,
              width: rect.width,
              hit: Boolean(hit?.closest(selector))
            };
          };
          return {
            add: bounds("#addTerminal"),
            minimize: bounds("#minimizeApp"),
            toggle: bounds("#toggleHeaderTop"),
            shellWidth: document.querySelector(".shell-field").getBoundingClientRect().width,
            cwdWidth: document.querySelector("#cwdInput").getBoundingClientRect().width,
            searchWidth: document.querySelector("#terminalSearchInput").getBoundingClientRect().width,
            clusterRight: document.querySelector(".action-cluster").getBoundingClientRect().right,
            viewportWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth
          };
        });

        expect(layout.add.left, `${width}px add left`).toBeGreaterThanOrEqual(0);
        expect(layout.add.right, `${width}px add right`).toBeLessThanOrEqual(layout.viewportWidth);
        if (width <= 1270) {
          expect(layout.add.width, `${width}px compact add width`).toBe(38);
        } else {
          expect(layout.add.width, `${width}px full add width`).toBeGreaterThan(38);
        }
        expect(layout.add.hit, `${width}px add hit target`).toBe(true);
        expect(layout.minimize.hit, `${width}px minimize hit target`).toBe(true);
        expect(layout.toggle.right, `${width}px toggle right`).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.toggle.hit, `${width}px toggle hit target`).toBe(true);
        expect(layout.toggle.right, `${width}px collapse precedes add`).toBeLessThan(layout.add.left);
        expect(Math.abs(layout.add.right - layout.clusterRight), `${width}px add is rightmost`).toBeLessThan(0.5);
        expect(layout.scrollWidth, `${width}px document width`).toBeLessThanOrEqual(layout.viewportWidth);
        if (width === 1680) {
          expect(layout.shellWidth, "wide desktop shell width").toBeGreaterThanOrEqual(190);
          expect(layout.cwdWidth, "wide desktop CWD width").toBeGreaterThanOrEqual(230);
          expect(layout.searchWidth, "wide desktop search width").toBeGreaterThanOrEqual(210);
        }
      }
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test("keeps scrollable dropdowns open while their option list scrolls", async () => {
    const input = page.locator("#layoutMode").locator("xpath=..").locator(".combobox-input");
    if (!await input.isVisible()) await page.locator("#settings-group-layout").click();
    await input.click();
    const list = page.locator(".combobox-list:not([hidden])");
    await expect(list).toBeVisible();

    const dimensions = await list.evaluate((element) => {
      element.scrollTop = 0;
      return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight };
    });
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
    const box = await list.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 360);

    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(list).toBeVisible();

    await page.mouse.wheel(0, 10000);
    await expect.poll(() => list.evaluate((element) => element.scrollTop + element.clientHeight))
      .toBe(dimensions.scrollHeight);
    await page.mouse.wheel(0, 360);
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(list).toBeVisible();

    await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(list).toBeHidden();
    await page.locator("#settings-group-layout").click();
  });

  test("shows a distinct miniature beside every layout mode", async () => {
    const input = page.locator("#layoutMode").locator("xpath=..").locator(".combobox-input");
    if (!await input.isVisible()) await page.locator("#settings-group-layout").click();
    await input.click();
    const list = page.locator(".combobox-list:not([hidden])");
    const expected = await page.locator("#layoutMode option").evaluateAll((options) =>
      options.map((option) => ({ label: option.textContent, value: option.value }))
    );
    const rendered = await list.locator(".combobox-option").evaluateAll((items) =>
      items.map((item) => {
        const glyph = item.querySelector(".layout-mode-glyph");
        const label = item.querySelector(".combobox-option-label");
        return {
          glyphLeft: glyph.getBoundingClientRect().left,
          label: label.textContent,
          labelLeft: label.getBoundingClientRect().left,
          rects: glyph.querySelectorAll("rect").length,
          value: glyph.dataset.layoutMode
        };
      })
    );

    expect(rendered.map(({ label, value }) => ({ label, value }))).toEqual(expected);
    expect(rendered.every((item) => item.rects > 0 && item.glyphLeft < item.labelLeft)).toBe(true);
    expect(new Set(rendered.map((item) => item.value)).size).toBe(expected.length);
    await page.keyboard.press("Escape");

    const selected = page.locator("#layoutMode").locator("xpath=..").locator(".layout-mode-glyph-selected");
    await expect(selected).toHaveAttribute("data-layout-mode", "auto");
    await page.evaluate(() => {
      elements.layoutMode.value = "bento";
      elements.layoutMode.dispatchEvent(new Event("change", { bubbles: true }));
      elements.layoutMode._combo.sync();
    });
    await expect(selected).toHaveAttribute("data-layout-mode", "bento");
    await expect(input).toHaveValue("Bento grid");
    await page.evaluate(() => {
      elements.layoutMode.value = "auto";
      elements.layoutMode.dispatchEvent(new Event("change", { bubbles: true }));
      elements.layoutMode._combo.sync();
    });
    await page.locator("#settings-group-layout").click();
  });

  test("collapses, expands, and filters settings groups", async () => {
    const groups = page.locator(".settings-group-toggle");
    await expect(groups).toHaveCount(11);
    for (let index = 0; index < await groups.count(); index += 1) {
      await expect(groups.nth(index)).toHaveAttribute("aria-expanded", "false");
    }
    await expect(page.locator(".settings-group-body:not([hidden])")).toHaveCount(0);

    const appearance = page.locator("#settings-group-appearance");
    await appearance.click();
    await expect(appearance).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#settings-body-appearance")).toBeVisible();

    const panel = page.locator(".control-panel");
    await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const sticky = await page.evaluate(() => ({
      headingTop: document.querySelector(".settings-panel-heading").getBoundingClientRect().top,
      panelTop: document.querySelector(".control-panel").getBoundingClientRect().top,
      stickyTop: document.querySelector(".settings-panel-sticky").getBoundingClientRect().top,
      toolbarTop: document.querySelector(".settings-panel-toolbar").getBoundingClientRect().top
    }));
    expect(Math.abs(sticky.stickyTop - sticky.panelTop)).toBeLessThan(1);
    expect(sticky.headingTop).toBeGreaterThanOrEqual(sticky.stickyTop);
    expect(sticky.toolbarTop).toBeGreaterThan(sticky.headingTop);

    await page.locator("#settingsSearch").fill("startup");
    await expect(page.locator("#settings-group-session")).toBeVisible();
    await expect(page.locator("#settings-group-session")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#startupCommand")).toBeVisible();
    await expect(page.locator("#restoreSession")).toBeVisible();
    await expect(page.locator("#settings-group-appearance")).toBeHidden();
    await expect(page.locator(".settings-filter-item:not([hidden])")).toHaveCount(2);

    await page.locator("#settingsSearch").press("Escape");
    await expect(page.locator("#settingsSearch")).toHaveValue("");
    await expect(appearance).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#settings-group-session")).toHaveAttribute("aria-expanded", "false");

    await setNative("#layoutMode", "auto", "change");
    await page.locator("#settingsSearch").fill("primary");
    await expect(page.locator("#focusWidth")).toBeVisible();
    await page.locator("#settingsSearch").press("Escape");

    await page.locator("#settingsSearch").fill("dynamic search needle");
    await expect(page.locator(".settings-filter-empty")).toHaveText("No matching settings.");
    await page.evaluate(() => addSnippet("Dynamic Search Needle", "echo dynamic-settings-search"));
    await expect(page.locator("#settings-group-snippets")).toBeVisible();
    await expect(page.locator("#settings-group-snippets")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#snippetList .snippet-row", { hasText: "Dynamic Search Needle" })).toBeVisible();
    await page.evaluate(() => {
      const index = state.settings.snippets.findIndex((snippet) => snippet.name === "Dynamic Search Needle");
      removeSnippet(index);
    });
    await expect(page.locator(".settings-filter-empty")).toHaveText("No matching settings.");

    await page.locator("#settingsShowAll").click();
    await expect(page.locator("#settingsSearch")).toHaveValue("");
    await expect(page.locator("#settingsShowAll")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#settingsShowAll")).toHaveAttribute("title", "Collapse all settings");
    await expect(page.locator(".settings-group-toggle[aria-expanded='true']")).toHaveCount(11);

    await page.locator("#settingsSearch").fill("startup");
    await page.locator("#settingsShowAll").click();
    await expect(page.locator("#settingsSearch")).toHaveValue("");
    await expect(page.locator(".settings-group-toggle[aria-expanded='true']")).toHaveCount(11);

    // The single glyph flips instead of swapping icons, so lucide never re-renders it.
    const chevronRotation = () => page.locator("#settingsShowAll svg").evaluate(
      (svg) => getComputedStyle(svg).transform
    );
    await expect.poll(chevronRotation).toBe("matrix(-1, 0, 0, -1, 0, 0)");

    await page.locator("#settingsShowAll").click();
    await expect(page.locator("#settingsShowAll")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#settingsShowAll")).toHaveAttribute("title", "Show all settings");
    await expect(page.locator(".settings-group-toggle[aria-expanded='false']")).toHaveCount(11);
    await expect.poll(chevronRotation).toBe("none");
  });

  test("finds settings through comprehensive related terms without rescanning the DOM", async () => {
    const search = page.locator("#settingsSearch");
    await expect(search).toHaveAttribute("placeholder", "Search settings or related terms");
    const missingAliases = await page.evaluate(() => [...document.querySelectorAll(
      ".settings-group-body input[id], .settings-group-body select[id], .settings-group-body button[id]"
    )].filter((control) => !SETTINGS_SEARCH_ALIASES[control.id]).map((control) => control.id));
    expect(missingAliases).toEqual([]);
    const cases = [
      ["tabs dock", "#pagerPlacement"],
      ["tile arrangement", "#layoutMode"],
      ["caret shape", "#cursorStyle"],
      ["clipboard shortcut", "#ctrlVPaste"],
      ["tail output", "#scrollOnOutput"],
      ["download ceiling", "#maxInstallerSizeMb"],
      ["shells survive", "#keepSessionsOnClose"],
      ["typing focus metrics", "#analyticsReset"],
      ["awaiting question", "#highlightInputPrompts"],
      ["handoff quota", "#terminalInboxCapacity"],
      ["macros", "#snippetList"],
      ["projects snapshots", "#workspaceSelect"],
      ["right click execute", "#rightClickAction"]
    ];

    for (const [query, selector] of cases) {
      await search.fill(query);
      const item = page.locator(`${selector}.settings-filter-item, .settings-filter-item:has(${selector})`);
      const unrelated = page.locator(".settings-filter-item:has(#appTheme)");
      await expect(item).toBeVisible();
      await expect(unrelated).toBeHidden();
    }

    await search.fill("tabs");
    const pagerPlacementItem = page.locator(".settings-filter-item:has(#pagerPlacement)");
    await expect(pagerPlacementItem).toBeVisible();
    await expect(page.locator(".settings-filter-item:not([hidden])")).toHaveCount(1);
    const aliases = await pagerPlacementItem.getAttribute("data-search-aliases");
    expect(aliases).toContain("tabs");

    const itemDomScans = await page.evaluate(() => {
      const original = Element.prototype.querySelectorAll;
      let scans = 0;
      Element.prototype.querySelectorAll = function (...args) {
        if (this.classList?.contains("settings-filter-item")) scans += 1;
        return original.apply(this, args);
      };
      try {
        for (const query of ["tabs", "clipboard", "alerts", "layout", "workspace", "startup"]) {
          elements.settingsSearch.value = query;
          applySettingsFilter();
        }
      } finally {
        Element.prototype.querySelectorAll = original;
        elements.settingsSearch.value = "";
        applySettingsFilter();
      }
      return scans;
    });
    expect(itemDomScans).toBe(0);
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

  test("keeps overlay scrollbars out of the terminal text area", async () => {
    const geometry = await page.evaluate(async () => {
      const terminal = state.terminals.values().next().value;
      const viewport = terminal.term.element.querySelector(".xterm-viewport");
      const xterm = terminal.term.element;
      const originalClientWidth = Object.getOwnPropertyDescriptor(viewport, "clientWidth");
      Object.defineProperty(viewport, "clientWidth", {
        configurable: true,
        get: () => viewport.offsetWidth
      });
      reserveTerminalScrollbarGutter(terminal.term);
      terminal.fitAddon.fit();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const screenRect = xterm.querySelector(".xterm-screen").getBoundingClientRect();
      const xtermRect = xterm.getBoundingClientRect();
      const result = {
        gutter: getComputedStyle(viewport).scrollbarGutter,
        paddingRight: Number.parseFloat(getComputedStyle(xterm).paddingRight),
        reservedRight: xtermRect.right - screenRect.right
      };

      if (originalClientWidth) Object.defineProperty(viewport, "clientWidth", originalClientWidth);
      else delete viewport.clientWidth;
      reserveTerminalScrollbarGutter(terminal.term);
      terminal.fitAddon.fit();
      return result;
    });

    expect(geometry.gutter).toContain("stable");
    expect(geometry.paddingRight).toBe(10);
    expect(geometry.reservedRight).toBeGreaterThanOrEqual(9);
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

  test("uses the selected UI typography without changing terminal text", async () => {
    await setNative("#fontSize", "14", "input");
    const typography = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const settingsToggle = getComputedStyle(document.querySelector(".settings-group-toggle"));
      const status = getComputedStyle(document.querySelector(".status-bar"));
      const topbar = getComputedStyle(document.querySelector(".topbar"));
      const terminal = state.terminals.values().next().value;
      return {
        bodyFamily: body.fontFamily,
        bodySize: body.fontSize,
        settingsFamily: settingsToggle.fontFamily,
        settingsSize: settingsToggle.fontSize,
        settingsWeight: settingsToggle.fontWeight,
        settingsTracking: settingsToggle.letterSpacing,
        settingsTransform: settingsToggle.textTransform,
        statusFamily: status.fontFamily,
        statusSize: status.fontSize,
        topbarFamily: topbar.fontFamily,
        topbarSize: topbar.fontSize,
        terminalSize: terminal.term.options.fontSize
      };
    });

    expect(typography.bodyFamily).toBe(typography.statusFamily);
    expect(typography.topbarFamily).toBe(typography.statusFamily);
    expect(typography.bodyFamily).toContain("Segoe UI");
    expect(typography.bodyFamily).not.toContain("Segoe UI Variable Text");
    expect(typography.bodySize).toBe("13px");
    expect(typography.topbarSize).toBe("13px");
    expect(typography.settingsFamily).toBe(typography.bodyFamily);
    expect(typography.settingsSize).toBe("11.5px");
    expect(typography.settingsWeight).toBe("600");
    expect(typography.settingsTracking).toBe("0.25px");
    expect(typography.settingsTransform).toBe("uppercase");
    expect(typography.statusSize).toBe("12px");
    expect(typography.terminalSize).toBe(14);
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

  test("zooms an individual terminal without changing its siblings", async () => {
    const ids = await page.evaluate(() => {
      state.settings.fontSize = 14;
      elements.fontSize.value = 14;
      for (const terminal of state.terminals.values()) terminal.fontSizeOverride = null;
      applySettings();
      const terminals = [...state.terminals.values()];
      return terminals.slice(0, 2).map((terminal) => terminal.id);
    });
    expect(ids).toHaveLength(2);

    const dispatchWheel = (id, init) => page.evaluate(({ id, init }) => {
      const terminal = state.terminals.get(id);
      terminal.screen.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ...init
      }));
    }, { id, init });

    // Non-zoom gestures and a zero delta are ignored. Two line-mode events
    // demonstrate touchpad accumulation before one zoom step is applied.
    await dispatchWheel(ids[0], { deltaY: -120 });
    await dispatchWheel(ids[0], { ctrlKey: true, altKey: true, deltaY: -120 });
    await dispatchWheel(ids[0], { ctrlKey: true, metaKey: true, deltaY: -120 });
    await dispatchWheel(ids[0], { ctrlKey: true, deltaY: 0 });
    await dispatchWheel(ids[0], { ctrlKey: true, deltaMode: 1, deltaY: -1 });
    expect(await page.evaluate((id) => terminalFontSize(state.terminals.get(id)), ids[0])).toBe(14);
    await dispatchWheel(ids[0], { ctrlKey: true, deltaMode: 1, deltaY: -1 });

    await expect.poll(() => page.evaluate((id) => {
      const terminal = state.terminals.get(id);
      return {
        defaultSize: state.settings.fontSize,
        size: terminalFontSize(terminal),
        override: terminal.fontSizeOverride,
        indicator: terminal.fontZoomIndicator.textContent,
        visible: terminal.fontZoomIndicator.classList.contains("is-visible"),
        saved: loadSessionSnapshot().find((entry) => entry.id === id)?.fontSizeOverride
      };
    }, ids[0])).toEqual({
      defaultSize: 14,
      size: 15,
      override: 15,
      indicator: "15px",
      visible: true,
      saved: 15
    });
    expect(await page.evaluate((id) => terminalFontSize(state.terminals.get(id)), ids[1])).toBe(14);

    // Page- and pixel-mode wheel events follow the same one-step behavior.
    await page.evaluate((id) => resetTerminalFontZoom(id), ids[0]);
    await dispatchWheel(ids[0], { ctrlKey: true, deltaMode: 2, deltaY: -1 });
    expect(await page.evaluate((id) => terminalFontSize(state.terminals.get(id)), ids[0])).toBe(15);
    await page.evaluate((id) => resetTerminalFontZoom(id), ids[0]);
    await dispatchWheel(ids[0], { ctrlKey: true, deltaY: -40 });
    await dispatchWheel(ids[0], { ctrlKey: true, deltaY: -40 });
    expect(await page.evaluate((id) => terminalFontSize(state.terminals.get(id)), ids[0])).toBe(15);

    // The active-pane shortcuts provide a mouse-free path and Ctrl+Alt+0
    // returns the pane to the current global/default size.
    await page.evaluate((id) => {
      resetTerminalFontZoom(id);
      setActiveTerminal(id);
      window.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true, cancelable: true, ctrlKey: true, altKey: true, code: "Equal", key: "="
      }));
    }, ids[0]);
    expect(await page.evaluate((id) => terminalFontSize(state.terminals.get(id)), ids[0])).toBe(15);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true, cancelable: true, ctrlKey: true, altKey: true, code: "Minus", key: "-"
    })));
    expect(await page.evaluate((id) => terminalFontSize(state.terminals.get(id)), ids[0])).toBe(14);
    await page.evaluate((id) => {
      zoomTerminalFont(id, 1);
      window.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true, cancelable: true, ctrlKey: true, altKey: true, code: "Numpad0", key: "0"
      }));
    }, ids[0]);
    expect(await page.evaluate((id) => terminalFontSize(state.terminals.get(id)), ids[0])).toBe(14);
  });

  test("defocuses terminals, scrolls normally, and zooms the workspace only with Ctrl or pinch", async () => {
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 1400, height: 900 });
    const setup = await page.evaluate(() => {
      state.settings.layout = "auto";
      state.settings.workspaceZoom = 100;
      state.settings.minWidth = 420;
      applySettings();
      saveSettings();
      const existingIds = [...state.terminals.keys()];
      while (state.terminals.size < 8) addTerminal();
      const terminal = [...state.terminals.values()][0];
      terminal.term.focus();
      return { existingIds, focusedId: terminal.id };
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(8);
    await expect.poll(() => page.evaluate(() => state.activeId)).toBe(setup.focusedId);

    const firstRowCount = () => page.locator(".terminal-pane:not(.is-page-hidden):not(.is-minimized)").evaluateAll((panes) => {
      const tops = panes.map((pane) => Math.round(pane.getBoundingClientRect().top));
      return tops.filter((top) => Math.abs(top - tops[0]) <= 2).length;
    });
    const workspaceSizeGaps = () => page.evaluate(() => {
      const scale = workspaceZoomScale();
      const stage = elements.stage.getBoundingClientRect();
      const host = getComputedStyle(elements.host);
      return {
        height: Math.abs(stage.height - Number.parseFloat(host.height) * scale),
        width: Math.abs(stage.width - Number.parseFloat(host.width) * scale)
      };
    });
    const panesBefore = await firstRowCount();

    await page.evaluate(() => {
      elements.stage.addEventListener("pointerdown", (event) => {
        window.__workspaceBackgroundTestTarget = {
          id: event.target.id,
          isPane: Boolean(event.target.closest(".terminal-pane"))
        };
      }, { capture: true, once: true });
    });
    await page.locator("#terminalHost").click({ position: { x: 2, y: 2 } });
    expect(await page.evaluate(() => ({
      activeId: state.activeId,
      activeElement: document.activeElement === elements.stage,
      activePanes: elements.host.querySelectorAll(".terminal-pane.is-active").length,
      target: window.__workspaceBackgroundTestTarget
    }))).toEqual({
      activeId: null,
      activeElement: true,
      activePanes: 0,
      target: { id: "terminalHost", isPane: false }
    });

    const plainWheelAccepted = await page.evaluate(() => elements.host.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 24
    })));
    expect(plainWheelAccepted).toBe(true);
    await page.mouse.wheel(0, 360);
    await expect.poll(() => page.evaluate(() => elements.host.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => state.settings.workspaceZoom)).toBe(100);

    const ctrlWheelAccepted = await page.evaluate(() => elements.host.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: 120
    })));
    expect(ctrlWheelAccepted).toBe(false);
    await page.evaluate(() => {
      for (let index = 0; index < 3; index += 1) {
        elements.host.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: 120
        }));
      }
    });
    await expect.poll(() => page.evaluate(() => state.settings.workspaceZoom)).toBe(80);
    await expect(page.locator("#workspaceZoomValue")).toHaveText("80%");
    await expect(page.locator("#workspaceZoomIndicator")).toHaveText("80%");
    expect(await firstRowCount()).toBeGreaterThan(panesBefore);
    await expect.poll(async () => Math.max(...Object.values(await workspaceSizeGaps()))).toBeLessThan(1);

    await page.evaluate(() => {
      elements.host.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -120
      }));
    });
    await expect.poll(() => page.evaluate(() => state.settings.workspaceZoom)).toBe(85);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings") || "{}").workspaceZoom)).toBe(85);

    const statusZoom = page.locator("#statusWorkspaceZoom");
    const workspaceZoomHelp = "Workspace zoom\nCtrl+mouse wheel or trackpad pinch\nKeyboard: focus the slider, then use Arrow keys; Home jumps to 25%, End to 200%";
    await expect(statusZoom).toHaveAttribute("title", workspaceZoomHelp);
    await expect(page.locator("#workspaceZoom")).toHaveAttribute("title", workspaceZoomHelp);
    await expect(statusZoom).toHaveAttribute("min", "25");
    await expect(statusZoom).toHaveAttribute("max", "200");
    await expect(page.locator("#workspaceZoom")).toHaveAttribute("min", "25");
    await expect(page.locator("#workspaceZoom")).toHaveAttribute("max", "200");
    await statusZoom.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.evaluate(() => state.settings.workspaceZoom)).toBe(90);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => page.evaluate(() => state.settings.workspaceZoom)).toBe(85);
    await page.keyboard.press("Home");
    await expect.poll(() => page.evaluate(() => state.settings.workspaceZoom)).toBe(25);
    await page.keyboard.press("End");
    await expect.poll(() => page.evaluate(() => state.settings.workspaceZoom)).toBe(200);
    await statusZoom.evaluate((slider) => {
      slider.value = "140";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => state.settings.workspaceZoom)).toBe(140);
    await expect(page.locator("#statusWorkspaceZoomValue")).toHaveText("140%");
    await expect.poll(async () => Math.max(...Object.values(await workspaceSizeGaps()))).toBeLessThan(1);

    await statusZoom.evaluate((slider) => {
      slider.value = "75";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => state.settings.workspaceZoom)).toBe(75);
    await expect(page.locator("#statusWorkspaceZoomValue")).toHaveText("75%");
    await expect(page.locator("#workspaceZoom")).toHaveValue("75");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings") || "{}").workspaceZoom)).toBe(75);
    expect(await page.evaluate(() => ({
      activeId: state.activeId,
      sliderFocused: document.activeElement === elements.statusWorkspaceZoom
    }))).toEqual({ activeId: null, sliderFocused: true });

    await page.evaluate(({ existingIds }) => {
      for (const terminal of [...state.terminals.values()]) {
        if (!existingIds.includes(terminal.id)) removeTerminal(terminal.id);
      }
      setWorkspaceZoom(100);
      [...state.terminals.values()][0]?.term.focus();
    }, setup);
    await page.setViewportSize(originalViewport);
    await expect.poll(() => page.evaluate(() => state.activeId)).not.toBeNull();
  });

  test("keeps native terminal drag selection aligned at workspace zoom", async () => {
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 1280, height: 800 });
    const terminalId = await page.evaluate(() => addTerminal({ reveal: true }).id);
    const pane = page.locator(`.terminal-pane[data-id="${terminalId}"]`);
    await expect(pane).toBeVisible();

    const dragMarker = async (zoom) => {
      await page.evaluate(({ id, value }) => {
        setWorkspaceZoom(value);
        state.terminals.get(id).term.clearSelection();
      }, { id: terminalId, value: zoom });
      await page.waitForTimeout(300);
      await page.evaluate((id) => new Promise((resolve) => {
        state.terminals.get(id).term.write("\x1b[2J\x1b[H0123ZEBRA89", resolve);
      }), terminalId);
      const geometry = await page.evaluate((id) => {
        const terminal = state.terminals.get(id);
        const rect = terminal.term.element.querySelector(".xterm-screen").getBoundingClientRect();
        const cell = terminal.term._core._renderService.dimensions.css.cell;
        const scale = workspaceZoomScale();
        return {
          cellHeight: cell.height * scale,
          cellWidth: cell.width * scale,
          left: rect.left,
          top: rect.top
        };
      }, terminalId);
      await page.mouse.move(
        geometry.left + geometry.cellWidth * 4.1,
        geometry.top + geometry.cellHeight * 0.5
      );
      await page.mouse.down();
      await page.mouse.move(
        geometry.left + geometry.cellWidth * 8.9,
        geometry.top + geometry.cellHeight * 0.5,
        { steps: 6 }
      );
      await page.mouse.up();
      return page.evaluate((id) => {
        const terminal = state.terminals.get(id);
        return {
          selection: terminal.term.getSelection(),
          startColumn: terminal.term.getSelectionPosition()?.start.x
        };
      }, terminalId);
    };

    try {
      expect(await dragMarker(80)).toMatchObject({ startColumn: 4, selection: expect.stringMatching(/^Z/) });
      expect(await dragMarker(120)).toMatchObject({ startColumn: 4, selection: expect.stringMatching(/^Z/) });
    } finally {
      await page.evaluate((id) => {
        removeTerminal(id);
        setWorkspaceZoom(100);
      }, terminalId);
      await page.setViewportSize(originalViewport);
    }
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

    await expect(page.locator("#toggleHeaderTop")).toHaveAttribute("title", "Collapse top bar (Ctrl+Shift+H)");
    await page.locator("#toggleHeaderTop").click();
    await expect(page.locator("body")).toHaveClass(/header-hidden/);
    await expect(page.locator("#toggleHeader")).toBeVisible();
    await expect(page.locator("#toggleHeader")).toHaveAttribute("title", "Expand top bar");
    await page.locator("#toggleHeader").click();
    await expect(page.locator("body")).not.toHaveClass(/header-hidden/);

    // The sidecar restore control is style-hidden until the panel is collapsed,
    // so fire its shared DOM handler directly in this broad settings test.
    const domClick = (selector) => page.evaluate((s) => document.querySelector(s).click(), selector);

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
    for (const action of ["move-left", "move-right", "color", "duplicate", "find", "notifications"]) {
      await expect(firstPane.locator(`[data-action="${action}"]`)).toBeHidden();
    }
    // Primary actions stay in the header even when narrow.
    await expect(firstPane.locator('[data-action="close"]')).toBeVisible();

    await overflow.click();
    await expect(overflow).toHaveAttribute("aria-expanded", "true");
    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();
    // Every header action advertises its own remappable shortcut here.
    await expect(menu.locator(".ctx-item")).toHaveText([
      "Notifications\u2026",
      "Notes & command queueCtrl+Alt+Shift+A",
      "MinimizeCtrl+Alt+Shift+M",
      "MaximizeCtrl+Alt+Shift+X",
      "Move leftCtrl+Alt+Shift+Left",
      "Move rightCtrl+Alt+Shift+Right",
      "Find\u2026Ctrl+Alt+Shift+F",
      "ClearCtrl+Alt+Shift+L",
      "Copy outputCtrl+Alt+Shift+C",
      "Cycle label colorCtrl+Alt+Shift+K",
      "RestartCtrl+Alt+Shift+R",
      "DuplicateCtrl+Alt+Shift+D"
    ]);
    await menu.locator(".ctx-item", { hasText: "Notifications" }).click();
    await expect(page.locator("#terminalNotificationFlyout")).toBeVisible();
    await expect(menu).toBeHidden();
    await expect(overflow).toHaveAttribute("aria-expanded", "false");
    await overflow.click();
    await expect(page.locator("#terminalNotificationFlyout")).toBeHidden();
    await expect(menu).toBeVisible();
    await expect(overflow).toHaveAttribute("aria-expanded", "true");
    const disabledMove = menu.locator(".ctx-item", { hasText: "Move left" });
    await expect(disabledMove).toHaveAttribute("aria-disabled", "true");
    await expect(disabledMove).toHaveAttribute("draggable", "true");

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

  test("keeps secondary actions in the overflow menu when panes are wide", async () => {
    await setNative("#columnCount", "1", "input");

    const firstPane = page.locator(".terminal-pane").first();
    await expect(firstPane).not.toHaveClass(/is-narrow/);
    // The hamburger and notifications are always available; the rest of the row
    // either lives in the menu by default or waits for a hover.
    await expect(firstPane.locator('[data-action="more"]')).toBeVisible();
    await expect(firstPane.locator('[data-action="notifications"]')).toBeVisible();
    await expect(firstPane.locator('[data-action="close"]')).toBeVisible();
    for (const action of ["move-left", "move-right", "color", "find", "duplicate", "clear", "copy", "restart"]) {
      await expect(firstPane.locator(`[data-action="${action}"]`)).toBeHidden();
    }
    // Reveal-on-hover is opt-in, so the rest of the row stays painted.
    await expect(firstPane.locator('[data-action="maximize"]')).toBeVisible();

    await firstPane.locator('[data-action="more"]').click();
    const menu = page.locator("#contextMenu");
    await expect(menu.locator(".ctx-item")).toHaveText([
      "Move leftCtrl+Alt+Shift+Left",
      "Move rightCtrl+Alt+Shift+Right",
      "Find\u2026Ctrl+Alt+Shift+F",
      "ClearCtrl+Alt+Shift+L",
      "Copy outputCtrl+Alt+Shift+C",
      "Cycle label colorCtrl+Alt+Shift+K",
      "RestartCtrl+Alt+Shift+R",
      "DuplicateCtrl+Alt+Shift+D"
    ]);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("customizes terminal header actions by drag scope and remembers the choice", async () => {
    await setNative("#columnCount", "1", "input");
    await setNative("#headerActionDragScope", "ask", "change");
    // This test is about drag scope, so start from a header that still holds the
    // draggable actions and keep the row painted rather than hover-revealed.
    await page.evaluate(() => {
      state.settings.headerActionsInMenu = ["find", "duplicate"];
      state.settings.headerActionsRevealOnHover = false;
      applySettings();
      for (const terminal of state.terminals.values()) applyHeaderActionPlacement(terminal);
    });

    const panes = page.locator(".terminal-pane");
    if ((await panes.count()) < 2) await page.locator("#addTerminal").click();
    const firstPane = panes.first();
    const firstId = await firstPane.getAttribute("data-id");
    const more = firstPane.locator('[data-action="more"]');
    const flyout = page.locator("#headerActionScopeFlyout");

    await firstPane.locator('[data-action="clear"]').dragTo(more);
    await expect(flyout).toBeVisible();
    await expect(flyout.locator('input[value="all"]')).toBeChecked();
    await flyout.locator("#headerActionScopeApply").click();
    await expect.poll(() => panes.locator('[data-action="clear"]').evaluateAll((buttons) => (
      buttons.every((button) => button.dataset.headerPlacement === "menu")
    ))).toBe(true);

    await more.click();
    const menu = page.locator("#contextMenu");
    const clearMenuAction = menu.locator('.ctx-item[data-header-action="clear"]');
    await expect(clearMenuAction).toBeVisible();
    await clearMenuAction.dragTo(firstPane.locator(".pane-actions"));
    await expect(flyout).toBeVisible();
    await flyout.locator('input[value="terminal"]').check();
    await flyout.locator("#headerActionScopeApply").click();
    await expect(firstPane.locator('[data-action="clear"]')).toHaveAttribute("data-header-placement", "header");
    await expect(panes.nth(1).locator('[data-action="clear"]')).toHaveAttribute("data-header-placement", "menu");

    const savedOverride = await page.evaluate((terminalId) => {
      const snapshot = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]");
      return snapshot.find((terminal) => terminal.id === terminalId)?.headerActionOverrides?.clear;
    }, firstId);
    expect(savedOverride).toBe("header");

    await page.evaluate(() => {
      const group = document.querySelector("#settings-group-workspaces");
      if (group.getAttribute("aria-expanded") !== "true") group.click();
    });
    await page.locator("#workspaceName").fill("Header action placement");
    await page.locator("#workspaceSave").click();
    const workspaceOverride = await page.evaluate(() => {
      const workspaces = JSON.parse(localStorage.getItem("multiterm.workspaces") || "{}");
      return workspaces["Header action placement"]?.terminals?.[0]?.headerActionOverrides?.clear;
    });
    expect(workspaceOverride).toBe("header");
    await page.locator("#workspaceDelete").click();

    const paneCountBeforeDuplicate = await panes.count();
    await more.click();
    await menu.locator('.ctx-item[data-header-action="duplicate"]').click();
    await expect(panes.last().locator('[data-action="clear"]')).toHaveAttribute("data-header-placement", "header");
    await panes.last().locator('[data-action="close"]').click();
    await expect(panes).toHaveCount(paneCountBeforeDuplicate);
    await expect.poll(() => page.evaluate(() => new Promise((resolve, reject) => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${location.host}/ws`);
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("Timed out reading bridge sessions"));
      }, 2000);
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type !== "welcome") return;
        clearTimeout(timeout);
        socket.close();
        resolve(message.sessions.length);
      });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Could not read bridge sessions"));
      });
    }))).toBe(paneCountBeforeDuplicate);

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    const restoredFirst = page.locator(`.terminal-pane[data-id="${firstId}"]`);
    await expect(restoredFirst.locator('[data-action="clear"]')).toHaveAttribute("data-header-placement", "header");
    const secondPane = page.locator(`.terminal-pane:not([data-id="${firstId}"])`).first();
    await secondPane.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await secondPane.locator('[data-action="more"]').click();
    const restoredClearMenuAction = menu.locator('.ctx-item[data-header-action="clear"]');
    await expect(restoredClearMenuAction).toBeVisible();
    await page.evaluate((terminalId) => {
      const source = document.querySelector('#contextMenu .ctx-item[data-header-action="clear"]');
      const target = document.querySelector(`.terminal-pane[data-id="${terminalId}"] .pane-actions`);
      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
      source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer }));
    }, await secondPane.getAttribute("data-id"));
    await expect(flyout.locator('input[value="all"]')).toBeChecked();
    await flyout.locator("#headerActionScopeApply").click();
    await expect.poll(() => page.locator('.terminal-pane [data-action="clear"]').evaluateAll((buttons) => (
      buttons.every((button) => button.dataset.headerPlacement === "header")
    ))).toBe(true);

    await restoredFirst.locator('[data-action="copy"]').dragTo(restoredFirst.locator('[data-action="more"]'));
    await flyout.locator('input[value="terminal"]').check();
    await flyout.locator("#headerActionScopeRemember").check();
    await flyout.locator("#headerActionScopeApply").click();
    await expect(page.locator("#headerActionDragScope")).toHaveValue("terminal");

    await restoredFirst.locator('[data-action="restart"]').dragTo(restoredFirst.locator('[data-action="more"]'));
    await expect(flyout).toBeHidden();
    await expect(restoredFirst.locator('[data-action="restart"]')).toHaveAttribute("data-header-placement", "menu");
    await expect(secondPane.locator('[data-action="restart"]')).toHaveAttribute("data-header-placement", "header");

    await setNative("#headerActionDragScope", "ask", "change");
    await page.addInitScript(() => {
      if (localStorage.getItem("multiterm.testHeaderActionCleanup") !== "1") return;
      const snapshot = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]");
      for (const terminal of snapshot) {
        if (!terminal.headerActionOverrides) continue;
        delete terminal.headerActionOverrides.copy;
        delete terminal.headerActionOverrides.restart;
      }
      localStorage.setItem("multiterm.lastSession", JSON.stringify(snapshot));
      localStorage.removeItem("multiterm.testHeaderActionCleanup");
    });
    await page.evaluate(() => localStorage.setItem("multiterm.testHeaderActionCleanup", "1"));
    await page.reload();
    await expect(page.locator("#headerActionDragScope")).toHaveValue("ask");
    await expect(page.locator(`.terminal-pane[data-id="${firstId}"] [data-action="copy"]`)).toHaveAttribute("data-header-placement", "header");
    await page.locator("#terminalHost").evaluate((host) => { host.scrollTop = 0; });
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

    // The pane header remains in normal grid flow while maximized.
    const header = await firstPane.evaluate((pane) => {
      const bar = pane.querySelector(".pane-bar");
      const screen = pane.querySelector(".terminal-screen");
      return {
        position: getComputedStyle(bar).position,
        overlap: bar.getBoundingClientRect().bottom - screen.getBoundingClientRect().top,
      };
    });
    expect(header.position).toBe("static");
    expect(Math.abs(header.overlap)).toBeLessThan(1);

    await maximize.click();
    await expect(page.locator("#terminalHost")).not.toHaveClass(/has-zoom/);
    await expect(otherPane).toBeVisible();
    await expect(maximize).toHaveAttribute("aria-pressed", "false");
    await expect(maximize).toHaveAttribute("title", /Maximize/);

    await expect(firstPane.locator(".pane-bar")).toHaveCSS("position", "static");
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

  test("shows a long terminal title without enlarging its edit target", async () => {
    const pane = page.locator(".terminal-pane").first();
    const paneId = await pane.getAttribute("data-id");
    const title = pane.locator(".pane-title");
    await page.evaluate((id) => {
      state.zoomedId = id;
      applyZoom();
    }, paneId);
    await title.fill("Development server with a deliberately long descriptive terminal title");
    await title.press("Enter");
    await expect(title).toHaveCSS("max-width", "180px");

    const measurements = await title.evaluate((input) => {
      const bar = input.closest(".pane-bar");
      const display = bar.querySelector(".pane-title-display");
      const generate = bar.querySelector(".pane-title-generate");
      const region = bar.querySelector(".pane-title-region");
      const button = bar.querySelector('.pane-actions button[data-action="close"]');
      const barStyle = getComputedStyle(bar);
      return {
        input: input.getBoundingClientRect().width,
        inputRight: input.getBoundingClientRect().right,
        display: display.getBoundingClientRect().width,
        displayRight: display.getBoundingClientRect().right,
        displayPointerEvents: getComputedStyle(display).pointerEvents,
        generateLeft: generate.getBoundingClientRect().left,
        region: region.getBoundingClientRect().width,
        titleCenterY: input.getBoundingClientRect().top + (input.getBoundingClientRect().height / 2),
        barHeight: bar.getBoundingClientRect().height,
        buttonHeight: button.getBoundingClientRect().height,
        paddingTop: barStyle.paddingTop,
        paddingBottom: barStyle.paddingBottom
      };
    });
    expect(measurements.input).toBeLessThanOrEqual(180);
    expect(measurements.display).toBeGreaterThan(measurements.input);
    expect(measurements.display / measurements.region).toBeCloseTo(1, 1);
    expect(measurements.generateLeft - measurements.displayRight).toBeCloseTo(8, 0);
    expect(measurements.displayPointerEvents).toBe("none");
    expect(measurements.barHeight).toBe(33);
    expect(measurements.buttonHeight).toBe(30);
    expect(measurements.paddingTop).toBe("1px");
    expect(measurements.paddingBottom).toBe("1px");

    await page.mouse.click(
      measurements.inputRight + ((measurements.displayRight - measurements.inputRight) / 2),
      measurements.titleCenterY
    );
    await expect(title).not.toBeFocused();
    await title.click();
    await expect(title).toBeFocused();
    await pane.locator(".terminal-screen").click();
    await page.evaluate(() => {
      state.zoomedId = null;
      applyZoom();
    });
  });

  test("makes terminal titles 10% larger by default and supports an override", async () => {
    const title = page.locator(".terminal-pane").first().locator(".pane-title");
    const titleScale = async () => title.evaluate((input) => {
      const titleSize = Number.parseFloat(getComputedStyle(input).fontSize);
      const baseSize = Number.parseFloat(getComputedStyle(input.parentElement).fontSize);
      return titleSize / baseSize;
    });

    expect(await page.evaluate(() => state.settings.titleFontScale)).toBe(110);
    await expect(page.locator("#titleFontScaleValue")).toHaveText("110%");
    expect(await titleScale()).toBeCloseTo(1.1, 2);

    await setNative("#titleFontScale", "125", "input");
    await expect(page.locator("#titleFontScaleValue")).toHaveText("125%");
    expect(await titleScale()).toBeCloseTo(1.25, 2);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings") || "{}").titleFontScale)).toBe(125);

    await setNative("#titleFontScale", "110", "input");
  });

  test("uses the traditional copy glyph for the title-bar copy action", async () => {
    const copy = page.locator('.terminal-pane').first().locator('[data-action="copy"]');
    await expect(copy).toHaveAttribute("title", "Copy output (Ctrl+Shift+C)\nShortcut: Ctrl+Alt+Shift+C");
    await expect(copy.locator("svg")).toHaveAttribute("data-lucide", "copy");
  });

  test("saves the terminal title and exits edit mode when Enter is pressed", async () => {
    const title = page.locator(".terminal-pane").first().locator(".pane-title");
    const terminalId = await page.locator(".terminal-pane").first().getAttribute("data-id");
    const original = await title.inputValue();

    await title.fill("  Build Logs  ");
    await title.press("Enter");

    await expect(title).toHaveValue("Build Logs");
    await expect(title).not.toBeFocused();
    await expect.poll(() => page.evaluate(() => {
      const snapshot = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]");
      return snapshot[0]?.title;
    })).toBe("Build Logs");
    await expect.poll(() => page.evaluate((id) => new Promise((resolve, reject) => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${location.host}/ws`);
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("Timed out reading bridge title"));
      }, 2000);
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type !== "welcome") return;
        clearTimeout(timeout);
        const session = message.sessions.find((entry) => entry.id === id);
        socket.close();
        resolve(session?.title || null);
      });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Could not read bridge title"));
      });
    }), terminalId)).toBe("Build Logs");

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

  test("offers opt-in automatic update checks with a configurable interval", async () => {
    await page.evaluate(() => {
      stopAutomaticUpdateChecks();
      localStorage.removeItem("multiterm.updateCheck");
      syncAutomaticUpdateControls();
      window.__automaticUpdateCalls = 0;
      window.__originalRequestLatestRelease = requestLatestRelease;
      // eslint-disable-next-line no-global-assign
      requestLatestRelease = async () => {
        window.__automaticUpdateCalls += 1;
        return { ok: true, current: APP_VERSION, available: false, release: {} };
      };
      openUpdateConsentDialog();
    });

    const consent = page.locator("#updateConsentOverlay");
    await expect(consent).toBeVisible();
    await expect(page.locator("#updateConsentText")).toContainText("whenever the app starts");
    await expect(page.locator("#updateConsentInterval")).toHaveValue("6");
    await expect(page.locator("#updateConsentEnable")).toHaveText("Enable update checks");

    await page.locator("#updateConsentInterval").fill("12");
    await page.locator("#updateConsentEnable").click();
    await expect(consent).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__automaticUpdateCalls)).toBe(1);

    const enabled = await page.evaluate(() => {
      const meta = JSON.parse(localStorage.getItem("multiterm.updateCheck") || "{}");
      return {
        configured: meta.automaticChecksConfigured,
        enabled: meta.automaticChecksEnabled,
        intervalHours: meta.intervalHours,
        settingChecked: elements.autoUpdateChecks.checked,
        intervalDisabled: elements.updateCheckIntervalHours.disabled,
        timerScheduled: state.update.timer !== null
      };
    });
    expect(enabled).toEqual({
      configured: true,
      enabled: true,
      intervalHours: 12,
      settingChecked: true,
      intervalDisabled: false,
      timerScheduled: true
    });

    const restored = await page.evaluate(async () => {
      localStorage.removeItem("multiterm.updateCheck");
      const preferences = await hydrateAutomaticUpdatePreferences();
      return {
        ...preferences,
        local: loadAutomaticUpdatePreferences()
      };
    });
    expect(restored).toEqual({
      configured: true,
      enabled: true,
      intervalHours: 12,
      local: { configured: true, enabled: true, intervalHours: 12 }
    });

    // A fresh app start checks immediately even if a prior check just completed.
    await page.evaluate(() => startAutomaticUpdateChecks({ checkNow: true }));
    await expect.poll(() => page.evaluate(() => window.__automaticUpdateCalls)).toBe(2);

    const scheduledDelay = await page.evaluate(() => {
      stopAutomaticUpdateChecks();
      const originalSetTimeout = window.setTimeout;
      let delay = null;
      window.setTimeout = (_callback, milliseconds) => {
        delay = milliseconds;
        return 987654;
      };
      startAutomaticUpdateChecks({ checkNow: false });
      window.setTimeout = originalSetTimeout;
      state.update.timer = null;
      return delay;
    });
    expect(scheduledDelay).toBe(12 * 60 * 60 * 1000);

    await page.evaluate(() => {
      stopAutomaticUpdateChecks();
      localStorage.removeItem("multiterm.updateCheck");
      syncAutomaticUpdateControls();
      openUpdateConsentDialog();
    });
    await expect(consent).toBeVisible();
    await page.locator("#updateConsentInterval").fill("24");
    await page.locator("#updateConsentDecline").click();
    await expect(consent).toBeHidden();

    const declined = await page.evaluate(() => {
      const preferences = loadAutomaticUpdatePreferences();
      // eslint-disable-next-line no-global-assign
      requestLatestRelease = window.__originalRequestLatestRelease;
      delete window.__originalRequestLatestRelease;
      delete window.__automaticUpdateCalls;
      return {
        ...preferences,
        settingChecked: elements.autoUpdateChecks.checked,
        intervalDisabled: elements.updateCheckIntervalHours.disabled,
        timer: state.update.timer
      };
    });
    expect(declined).toEqual({
      configured: true,
      enabled: false,
      intervalHours: 24,
      settingChecked: false,
      intervalDisabled: true,
      timer: null
    });
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

  test("edits, persists, prints, and exports keyboard shortcuts", async () => {
    await page.evaluate(() => {
      window.__shortcutOriginalPrint = window.print;
      window.__shortcutOriginalRequestBridge = requestBridge;
    });
    await page.evaluate(() => assignContextMenuShortcut("terminal.copy-all", {
      ctrl: true, alt: true, shift: false, meta: false, key: "c"
    }));
    await page.locator("#helpToggle").click();
    await expect(page.locator("#shortcutsOverlay")).toBeVisible();
    await expect(page.locator(".shortcuts-section h3")).toContainText([
      "Top Bar Actions",
      "App shortcuts",
      "Page shortcuts",
      "Terminal shortcuts",
      "Contextual controls",
      "Custom terminal right-click shortcuts"
    ]);
    await expect(page.locator("#shortcutsCatalog")).toContainText("Creates and opens a new page");
    await expect(page.locator("#shortcutsCatalog")).toContainText("Ctrl+Alt+C");
    await expect(page.locator("#shortcutsPrint")).toBeVisible();
    await expect(page.locator("#shortcutsExport")).toBeVisible();

    const terminalRow = page.locator('[data-shortcut-action="terminal.new"]').first();
    const terminalBindings = terminalRow.locator(".shortcut-binding");
    await expect(terminalBindings).toContainText(["Ctrl+N", "Ctrl+Shift+T"]);
    await terminalBindings.first().click();
    await expect(page.locator("#shortcutsStatus")).toContainText("Press the new shortcut");
    await page.keyboard.press("Control+Alt+N");
    await expect(terminalRow.locator(".shortcut-binding")).toContainText(["Ctrl+Alt+N", "Ctrl+Shift+T"]);
    await expect(page.locator("#addTerminal")).toHaveAttribute("title", "New terminal (Ctrl+Alt+N / Ctrl+Shift+T)");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings")).keyboardShortcuts["terminal.new"][0]))
      .toEqual({ alt: true, ctrl: true, key: "n", meta: false, shift: false });

    await terminalRow.hover();
    await expect(terminalRow).not.toHaveClass(/show-shortcut-controls/);
    await expect(terminalRow).toHaveClass(/show-shortcut-controls/, { timeout: 1500 });
    await terminalRow.locator(".shortcut-edit-controls .shortcut-binding").evaluate((button) => button.click());
    await page.keyboard.press("Control+Alt+T");
    await expect(terminalRow.locator(".shortcut-binding")).toContainText(["Ctrl+Alt+N", "Ctrl+Shift+T", "Ctrl+Alt+T"]);

    const pageRow = page.locator('[data-shortcut-action="page.new"]').first();
    await pageRow.hover();
    await expect(pageRow).toHaveClass(/show-shortcut-controls/, { timeout: 1500 });
    await pageRow.locator(".shortcut-edit-controls .shortcut-binding").evaluate((button) => button.click());
    await page.keyboard.press("Control+Alt+N");
    await expect(page.locator("#shortcutsStatus")).toContainText("reassigned from New terminal");
    await expect(pageRow.locator(".shortcut-binding")).toContainText(["Ctrl+T", "Ctrl+P", "Ctrl+Alt+N"]);
    await expect(terminalRow.locator(".shortcut-binding")).toContainText(["Ctrl+Shift+T", "Ctrl+Alt+T"]);

    const printCalled = await page.evaluate(() => {
      window.__shortcutPrintCalled = false;
      window.print = () => { window.__shortcutPrintCalled = true; };
      return window.__shortcutPrintCalled;
    });
    expect(printCalled).toBe(false);
    await page.locator("#shortcutsPrint").click();
    await expect.poll(() => page.evaluate(() => window.__shortcutPrintCalled)).toBe(true);

    await page.evaluate(() => {
      window.__shortcutExport = null;
      requestBridge = async (message) => {
        window.__shortcutExport = message;
        return { path: "D:\\tmp\\MultiTerm-keyboard-shortcuts.txt" };
      };
    });
    await page.locator("#shortcutsExport").click();
    await expect.poll(() => page.evaluate(() => window.__shortcutExport?.type)).toBe("prepareSave");
    await expect.poll(() => page.evaluate(() => window.__shortcutExport?.text)).toContain("New terminal: Ctrl+Shift+T, Ctrl+Alt+T");

    await page.evaluate(() => {
      state.settings.keyboardShortcuts = {};
      saveSettings();
      refreshGlobalShortcutHints();
      renderShortcutCatalog();
    });
    await expect(page.locator("#addTerminal")).toHaveAttribute("title", "New terminal (Ctrl+N / Ctrl+Shift+T)");
    await page.locator("#shortcutsClose").click();
    await expect(page.locator("#shortcutsOverlay")).toBeHidden();
    await page.evaluate(() => {
      clearContextMenuShortcut("terminal.copy-all");
      window.print = window.__shortcutOriginalPrint;
      requestBridge = window.__shortcutOriginalRequestBridge;
      delete window.__shortcutOriginalPrint;
      delete window.__shortcutOriginalRequestBridge;
      delete window.__shortcutPrintCalled;
      delete window.__shortcutExport;
    });
  });

  test("customizes every top-bar action from its right-click menu", async () => {
    const inventory = await page.evaluate(() => {
      const actions = TOP_BAR_SHORTCUT_ACTIONS.map((action) => {
        const button = elements[action.topBarElement];
        return {
          actionId: action.id,
          bindings: globalShortcutBindings(action.id).map(formatGlobalShortcut),
          buttonId: button.id,
          exposedAction: button.dataset.topBarShortcutAction,
          title: button.title
        };
      });
      const defaultSignatures = GLOBAL_SHORTCUT_ACTIONS.flatMap((action) => action.defaults.map(globalShortcutSignature));
      const menus = TOP_BAR_SHORTCUT_ACTIONS.map((action) => {
        const button = elements[action.topBarElement];
        button.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 40
        }));
        const result = { actionId: action.id, hidden: elements.contextMenu.hidden, text: elements.contextMenu.textContent };
        hideContextMenu();
        return result;
      });
      return {
        actions,
        duplicateDefaults: defaultSignatures.filter((signature, index) => defaultSignatures.indexOf(signature) !== index),
        menus
      };
    });

    expect(inventory.actions).toEqual([
      { actionId: "top.about", bindings: ["Ctrl+Shift+F1"], buttonId: "aboutToggle", exposedAction: "top.about", title: "About MultiTerm (Ctrl+Shift+F1)" },
      { actionId: "app.shortcuts", bindings: ["Ctrl+/"], buttonId: "helpToggle", exposedAction: "app.shortcuts", title: "Keyboard shortcuts (Ctrl+/)" },
      { actionId: "app.help", bindings: ["F1"], buttonId: "helpDocToggle", exposedAction: "app.help", title: "Help (F1)" },
      { actionId: "terminal.broadcast", bindings: ["Ctrl+Shift+B"], buttonId: "broadcastToggle", exposedAction: "terminal.broadcast", title: "Broadcast command (Ctrl+Shift+B)" },
      { actionId: "app.command-palette", bindings: ["Ctrl+Shift+P"], buttonId: "commandPalette", exposedAction: "app.command-palette", title: "Command palette (Ctrl+Shift+P)" },
      { actionId: "top.artifacts", bindings: ["Ctrl+Alt+Q"], buttonId: "terminalArtifactsToggle", exposedAction: "top.artifacts", title: "Terminal notes and command queue: 0 queued, 0 recovered notes (Ctrl+Alt+Q)" },
      { actionId: "top.messages", bindings: ["Ctrl+Shift+M"], buttonId: "terminalMessagesToggle", exposedAction: "top.messages", title: "Terminal messages (Ctrl+Shift+M)" },
      { actionId: "top.automations", bindings: ["Ctrl+Shift+A"], buttonId: "automationsToggle", exposedAction: "top.automations", title: "Automations: 0 enabled (Ctrl+Shift+A)" },
      { actionId: "top.ai-sessions", bindings: ["Ctrl+Alt+R"], buttonId: "copilotSessionsToggle", exposedAction: "top.ai-sessions", title: "Resume an AI assistant session (Ctrl+Alt+R)" },
      { actionId: "top.theme", bindings: ["Ctrl+Alt+D"], buttonId: "themeToggle", exposedAction: "top.theme", title: "Toggle theme (Ctrl+Alt+D)" },
      { actionId: "top.tmux", bindings: ["Ctrl+Alt+T"], buttonId: "attachTmux", exposedAction: "top.tmux", title: "Attach WSL tmux session (Ctrl+Alt+T)" },
      { actionId: "top.minimize", bindings: ["Ctrl+Alt+M"], buttonId: "minimizeApp", exposedAction: "top.minimize", title: "Minimize MultiTerm (Ctrl+Alt+M)" },
      { actionId: "top.toggle-header", bindings: ["Ctrl+Shift+H"], buttonId: "toggleHeaderTop", exposedAction: "top.toggle-header", title: "Collapse top bar (Ctrl+Shift+H)" },
      { actionId: "terminal.new", bindings: ["Ctrl+N", "Ctrl+Shift+T"], buttonId: "addTerminal", exposedAction: "terminal.new", title: "New terminal (Ctrl+N / Ctrl+Shift+T)" }
    ]);
    expect(inventory.duplicateDefaults).toEqual([]);
    expect(inventory.menus.every((menu) => (
      !menu.hidden
      && menu.text.includes("shortcut")
      && menu.text.includes("Add another shortcut")
      && menu.text.includes("Open in Keyboard Shortcuts")
    ))).toBe(true);

    const automations = page.locator("#automationsToggle");
    await automations.click({ button: "right" });
    await page.getByRole("menuitem", { name: /Change primary shortcut/ }).click();
    await expect(page.locator("#shortcutsOverlay")).toBeVisible();
    await expect(page.locator("#shortcutsStatus")).toContainText("Press the new shortcut");
    await page.keyboard.press("Control+Alt+Shift+A");
    const row = page.locator('[data-shortcut-action="top.automations"]').first();
    await expect(row.locator(".shortcut-binding")).toContainText(["Ctrl+Alt+Shift+A"]);
    await expect(automations).toHaveAttribute("title", "Automations: 0 enabled (Ctrl+Alt+Shift+A)");
    await page.locator("#shortcutsClose").click();
    await expect(page.locator("#shortcutsOverlay")).toBeHidden();

    await page.keyboard.press("Control+Alt+Shift+A");
    await expect(page.locator("#automationsOverlay")).toBeVisible();
    await page.locator("#automationsClose").click();

    await automations.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Add another shortcut", exact: true }).click();
    await expect(page.locator("#shortcutsStatus")).toContainText("Press the new shortcut");
    await page.keyboard.press("Control+Alt+Shift+U");
    await expect(row.locator(".shortcut-binding")).toContainText(["Ctrl+Alt+Shift+A", "Ctrl+Alt+Shift+U"]);
    await page.locator("#shortcutsClose").click();

    await automations.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Open in Keyboard Shortcuts", exact: true }).click();
    await expect(row).toBeVisible();
    await expect(row.locator(".shortcut-binding").first()).toBeFocused();

    await page.evaluate(() => {
      state.settings.keyboardShortcuts = {};
      saveSettings();
      refreshGlobalShortcutHints();
      renderShortcutCatalog();
    });
    await expect(automations).toHaveAttribute("title", "Automations: 0 enabled (Ctrl+Shift+A)");
    await page.locator("#shortcutsClose").click();
  });

  test("uses F11 fullscreen focus mode and restores the prior UI with Escape", async () => {
    const before = await page.locator(".terminal-pane").count();
    const original = await page.evaluate(() => {
      window.__fullscreenRequests = [];
      window.multiterm = {
        setFullscreen: async (enabled) => {
          window.__fullscreenRequests.push(enabled);
          return enabled;
        }
      };
      state.settings.headerHidden = false;
      state.settings.sidecarHidden = false;
      state.settings.pagerPlacement = "left";
      state.settings.pagerCollapsed = false;
      applySettings();
      toggleBroadcast(true);
      setLogPanel(true);
      logStore.autoscroll = false;
      elements.logOutput.scrollTop = 0;
      elements.findAllBar.hidden = false;
      const terminal = state.terminals.get(state.activeId);
      terminal.findBar.hidden = false;
      terminal.findInput.focus();
      return {
        settings: {
          headerHidden: state.settings.headerHidden,
          sidecarHidden: state.settings.sidecarHidden,
          pagerCollapsed: state.settings.pagerCollapsed,
          pagerPlacement: state.settings.pagerPlacement
        },
        logAutoscroll: logStore.autoscroll,
        logScrollTop: elements.logOutput.scrollTop
      };
    });

    await page.keyboard.press("F11");
    await expect(page.locator("body")).toHaveClass(/fullscreen-focus/);
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".control-panel")).toBeHidden();
    await expect(page.locator("#pager")).toBeHidden();
    await expect(page.locator("#broadcastBar")).toBeHidden();
    await expect(page.locator("#findAllBar")).toBeHidden();
    await expect(page.locator("#logPanel")).toBeHidden();
    await expect(page.locator(".terminal-pane.is-active .pane-find")).toBeHidden();
    await expect(page.locator("#logToggle")).toBeHidden();
    await expect(page.locator("#fullscreenAddTerminal")).toBeVisible();
    expect(await page.locator(".workbench").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length
    )).toBe(1);
    expect(await page.evaluate(() => {
      logStore.unseenError = true;
      toggleLogPanel();
      toggleBroadcast();
      openFindAll();
      openFindActive();
      return {
        broadcastHidden: elements.broadcastBar.hidden,
        findAllActive: state.findAll.active,
        findAllHidden: elements.findAllBar.hidden,
        logHidden: elements.logPanel.hidden,
        paneFindHidden: state.terminals.get(state.activeId).findBar.hidden,
        unseenError: logStore.unseenError
      };
    })).toEqual({
      broadcastHidden: true,
      findAllActive: false,
      findAllHidden: true,
      logHidden: true,
      paneFindHidden: true,
      unseenError: true
    });

    await page.locator("#fullscreenAddTerminal").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 1);
    await expect.poll(() => page.evaluate(() => {
      const terminal = state.terminals.get(state.activeId);
      return terminal.term.element.contains(document.activeElement);
    })).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 1);
    await page.keyboard.press("Escape");

    await expect(page.locator("body")).not.toHaveClass(/fullscreen-focus/);
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator(".control-panel")).toBeVisible();
    await expect(page.locator("#pager")).toBeVisible();
    await expect(page.locator("#broadcastBar")).toBeVisible();
    await expect(page.locator("#findAllBar")).toBeVisible();
    await expect(page.locator("#logPanel")).toBeVisible();
    await expect(page.locator(".terminal-pane").first().locator(".pane-find")).toBeVisible();
    await expect(page.locator("#fullscreenAddTerminal")).toBeHidden();
    expect(await page.evaluate(() => ({
      settings: {
        headerHidden: state.settings.headerHidden,
        sidecarHidden: state.settings.sidecarHidden,
        pagerCollapsed: state.settings.pagerCollapsed,
        pagerPlacement: state.settings.pagerPlacement
      },
      activeFocusMatches: state.terminals.get(state.activeId).term.element.contains(document.activeElement),
      logRowsCurrent: elements.logOutput.querySelectorAll(".log-row").length === Math.min(
        logStore.max,
        logStore.entries.filter(passesLogFilter).length
      ),
      logAutoscroll: logStore.autoscroll,
      logScrollTop: elements.logOutput.scrollTop,
      requests: window.__fullscreenRequests
    }))).toEqual({ ...original, activeFocusMatches: true, logRowsCurrent: true, requests: [true, false] });

    await page.evaluate(() => {
      state.settings.pagerCollapsed = true;
      applySettings();
      openShortcuts();
    });
    await expect(page.locator("#shortcutsOverlay")).toBeVisible();
    await expect(page.locator(".status-restores")).toBeVisible();
    await page.keyboard.press("F11");
    await expect(page.locator("body")).toHaveClass(/fullscreen-focus/);
    await expect(page.locator(".status-restores")).toBeHidden();
    expect(await page.evaluate(() =>
      document.querySelector('#shortcutsOverlay [role="dialog"]').contains(document.activeElement)
    )).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveClass(/fullscreen-focus/);
    await expect(page.locator("#shortcutsOverlay")).toBeVisible();
    await expect(page.locator(".status-restores")).toBeVisible();
    expect(await page.evaluate(() =>
      document.querySelector('#shortcutsOverlay [role="dialog"]').contains(document.activeElement)
    )).toBe(true);
    expect(await page.evaluate(() => window.__fullscreenRequests)).toEqual([true, false, true, false]);

    await page.evaluate(() => {
      closeShortcuts();
      state.settings.pagerCollapsed = false;
      applySettings();
    });
    await expect(page.locator("#shortcutsOverlay")).toBeHidden();
    await page.evaluate(() => state.terminals.get(state.activeId).term.focus());
    await page.keyboard.press("F11");
    await expect(page.locator("body")).toHaveClass(/fullscreen-focus/);
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveClass(/fullscreen-focus/);
    await expect.poll(() => page.evaluate(() =>
      state.terminals.get(state.activeId).term.element.contains(document.activeElement)
    )).toBe(true);
    expect(await page.evaluate(() => window.__fullscreenRequests)).toEqual([
      true, false, true, false, true, false
    ]);

    await page.evaluate(() => {
      setLogPanel(false);
      toggleBroadcast(false);
      elements.findAllBar.hidden = true;
      state.findAll.active = false;
      for (const terminal of state.terminals.values()) {
        if (terminal.findBar) terminal.findBar.hidden = true;
      }
      state.settings.pagerPlacement = "bottom";
      applySettings();
      delete window.multiterm;
      delete window.__fullscreenRequests;
    });
  });

  test("labels the settings panel", async () => {
    await expect(page.locator(".settings-panel-heading")).toHaveText("Settings");
    await expect(page.locator(".settings-panel-heading")).toHaveCSS("text-transform", "uppercase");
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
    await page.locator("#settings-group-workspaces").click();
    await setNative("#titleFontScale", "125", "input");
    await page.locator("#workspaceName").fill("My Layout");
    await page.locator("#workspaceSave").click();
    await expect(page.locator("#workspaceSelect option", { hasText: "My Layout" })).toHaveCount(1);
    await setNative("#titleFontScale", "90", "input");
    await page.evaluate(() => {
      const sel = document.querySelector("#workspaceSelect");
      const opt = [...sel.options].find((o) => o.textContent.includes("My Layout"));
      sel.value = opt.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.evaluate(() => document.querySelector("#workspaceRestore").click());
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect(page.locator("#titleFontScaleValue")).toHaveText("125%");
    expect(await page.evaluate(() => state.settings.titleFontScale)).toBe(125);
    await page.locator("#settings-group-workspaces").click();
  });

  test("exercises the full settings panel", async () => {
    for (const [selector, value] of [
      ["#minWidth", "480"],
      ["#paneHeight", "360"],
      ["#focusWidth", "70"],
      ["#paneGap", "12"],
      ["#titleFontScale", "130"],
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
    await expect(page.locator("#titleFontScaleValue")).toHaveText("110%");
    expect(await page.evaluate(() => state.settings.titleFontScale)).toBe(110);
  });

  test("handles keyboard shortcuts and palette commands", async () => {
    const before = await page.locator(".terminal-pane").count();
    await page.keyboard.press("Control+N");
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 1);
    await page.keyboard.press("Control+Shift+T");
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 2);

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
    await expect(page.locator(".terminal-pane")).toHaveCount(before + 3);
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

    await expect.poll(() => page.evaluate(({ id, baseline }) => {
      const terminal = state.terminals.get(id);
      const selection = terminal.term.getSelection();
      return {
        activeId: state.activeId,
        baselineSelected: selection.includes(baseline),
        markerSelected: selection.includes("ctrl-a-selection-marker")
      };
    }, { id: expected.id, baseline: expected.selection })).toEqual({
      activeId: expected.id,
      baselineSelected: true,
      markerSelected: true
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

  // Copilot's TUI turns on xterm's modifyOtherKeys so it can bind Ctrl+Enter to
  // "queue this message". xterm.js has no support for the protocol, so both keys
  // used to collapse to CR and the binding could never fire.
  test("reports modified Enter once a TUI negotiates modifyOtherKeys", async () => {
    const negotiate = (sequence) =>
      page.evaluate((data) => new Promise((resolve) => {
        [...state.terminals.values()][0].term.write(data, resolve);
      }), sequence);

    const framesFor = async (key) => {
      await page.evaluate(() => { window.__keyFrames = []; });
      await page.keyboard.press(key);
      await page.waitForTimeout(120);
      return page.evaluate(() => window.__keyFrames.slice());
    };

    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      setActiveTerminal(terminal.id);
      terminal.term.focus();
      window.__keyFrames = [];
      window.__origSendBridge = window.sendBridge;
      window.sendBridge = function (message) {
        if (message && message.type === "input") window.__keyFrames.push(message.data);
        return window.__origSendBridge.apply(this, arguments);
      };
    });

    try {
      // Without negotiation Ctrl+Enter stays indistinguishable from Enter.
      expect(await framesFor("Control+Enter")).toEqual(["\r"]);

      await negotiate("\x1b[>4;2m");
      expect(await page.evaluate(() => [...state.terminals.values()][0].modifyOtherKeys)).toBe(2);
      expect(await framesFor("Control+Enter")).toEqual(["\x1b[27;5;13~"]);
      expect(await framesFor("Shift+Enter")).toEqual(["\x1b[27;2;13~"]);
      // Unmodified keys are never reported, so a bare Enter still submits.
      expect(await framesFor("Enter")).toEqual(["\r"]);

      // Level 1 leaves the shift form alone because it has no unique sequence.
      await negotiate("\x1b[>4;1m");
      expect(await framesFor("Shift+Enter")).toEqual(["\r"]);
      expect(await framesFor("Control+Enter")).toEqual(["\x1b[27;5;13~"]);

      await negotiate("\x1b[>4;0m");
      expect(await page.evaluate(() => [...state.terminals.values()][0].modifyOtherKeys)).toBe(0);
      expect(await framesFor("Control+Enter")).toEqual(["\r"]);
    } finally {
      await page.evaluate(() => {
        window.sendBridge = window.__origSendBridge;
        delete window.__origSendBridge;
        delete window.__keyFrames;
      });
    }
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

  // The workspace-zoom slider relays out every pane on every step, so a drag is
  // the same WINCH storm as a window drag and must be deferred the same way.
  test("holds the PTY resize while the workspace zoom slider is dragged", async () => {
    const result = await page.evaluate(async () => {
      const term = state.terminals.get(state.activeId) || state.terminals.values().next().value;
      const id = term.id;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const origSend = window.sendBridge;
      const sends = [];
      window.sendBridge = (msg) => {
        if (msg && msg.type === "resize" && msg.id === id) sends.push({ cols: msg.cols, rows: msg.rows });
        return origSend(msg);
      };
      term.lastSentCols = 0;
      term.lastSentRows = 0;
      const startCols = term.term.cols;
      let refitDuringDrag = false;
      for (const step of [95, 90, 85, 80, 75, 70]) {
        setWorkspaceZoom(step, { announce: true });
        await sleep(30);
        if (term.term.cols !== startCols) refitDuringDrag = true;
      }
      const during = sends.length;
      await sleep(300); // > RESIZE_DRAG_IDLE_MS
      const afterDrag = sends.length;
      setWorkspaceZoom(100);
      await sleep(400);
      window.sendBridge = origSend;
      return { during, afterDrag, refitDuringDrag, zoom: state.settings.workspaceZoom };
    });

    // The panes still refit visually on every step; only the pty is spared.
    expect(result.refitDuringDrag).toBe(true);
    expect(result.during).toBe(0);
    expect(result.afterDrag).toBe(1);
    expect(result.zoom).toBe(100);
  });

  test("keeps pane headers attached to equally-sized terminals while the host scrolls", async () => {
    // A sticky header made the first visible row appear to shrink while scrolling:
    // the pane stayed in its grid cell, but its header detached and followed the
    // host scrollport. Headers must instead scroll as part of their own panes.
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
      const ordered = panes
        .map((pane) => ({ pane, rect: pane.getBoundingClientRect() }))
        .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
      const top = ordered[0];
      const lower = ordered.at(-1);
      host.scrollTop = Math.min(host.scrollHeight - host.clientHeight, Math.max(48, host.scrollTop));
      const topRect = top.pane.getBoundingClientRect();
      const lowerRect = lower.pane.getBoundingClientRect();
      const bar = top.pane.querySelector(".pane-bar");
      const barRect = bar.getBoundingClientRect();
      return {
        overflows: host.scrollHeight > host.clientHeight,
        scrollTop: host.scrollTop,
        hostTop: Math.round(host.getBoundingClientRect().top),
        paneTop: Math.round(topRect.top),
        headerTop: Math.round(barRect.top),
        headerPosition: getComputedStyle(bar).position,
        heightDelta: Math.abs(topRect.height - lowerRect.height)
      };
    });

    expect(probe.overflows).toBe(true);
    expect(probe.scrollTop).toBeGreaterThan(0);
    expect(probe.headerPosition).toBe("static");
    expect(Math.abs(probe.headerTop - probe.paneTop)).toBeLessThanOrEqual(1);
    expect(probe.headerTop).toBeLessThan(probe.hostTop);
    expect(probe.heightDelta).toBeLessThanOrEqual(1);

    // Scrolling the pane back into view makes its close button reachable normally.
    const topPane = page.locator(".terminal-pane").first();
    await topPane.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => state.terminals.size);
    await topPane.locator('[data-action="close"]').click();
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
