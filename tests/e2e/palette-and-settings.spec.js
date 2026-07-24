// End-to-end verification that EVERY command-palette option and EVERY
// settings-panel control works and produces its expected effect.
//
// The app is a classic (non-module) script, so every top-level function in
// public/app.js is global and callable from page.evaluate: openPalette(),
// getCommands(), addTerminal(), closeAllTerminals(), applySettings(), the
// `state`/`elements`/`themes` objects, etc. We drive the real palette UI
// (open -> filter -> click the exact item -> deferred run) and assert the
// observable DOM/state effect for each command, plus guard against any
// uncaught JS error (pageerror) for every single command.

const { test, expect } = require("@playwright/test");

test.describe.configure({ mode: "serial" });

// label -> host[data-layout] value, mirroring the layouts table in getCommands().
const LAYOUTS = [
  ["Auto fit", "auto"],
  ["Fixed columns", "columns"],
  ["Fixed rows", "rows"],
  ["Horizontal strip", "horizontal"],
  ["Vertical stack", "vertical"],
  ["Focus rail", "focus"],
  ["Balanced grid", "grid"],
  ["Master top", "master-top"],
  ["Master right", "master-right"],
  ["Bento grid", "bento"],
  ["Manual canvas", "manual"]
];

// Every non-dynamic command label (the 35th, "Toggle sync input (…)", is
// dynamic and handled separately). Used for the completeness assertion.
const STATIC_LABELS = [
  "New terminal",
  "New PowerShell 7 terminal",
  "New Windows PowerShell terminal",
  "New Command Prompt terminal",
  "New WSL terminal",
  "Close active terminal",
  "Minimize active terminal",
  "Restore all minimized terminals",
  "Close all terminals",
  "Restart active terminal",
  "Find in active terminal",
  "Find in all terminals",
  "Clear active terminal",
  "Copy active output",
  "Cycle active terminal color",
  "Fit all terminals",
  "Reset layout",
  "Broadcast command\u2026",
  "Paste into active terminal",
  "Maximize / restore active pane",
  "Browse & run script in active terminal\u2026",
  "Open active terminal folder",
  "New terminal in active folder",
  "Toggle logging for active terminal",
  "Cycle broadcast scope",
  "Next terminal",
  "Previous terminal",
  "Increase font size",
  "Decrease font size",
  "Toggle app theme",
  "Toggle header",
  "Toggle layout panel",
  "Keyboard shortcuts",
  "Help",
  "About MultiTerm"
];

test.describe("Command palette — every option works", () => {
  let context;
  let page;
  const pageErrors = [];
  const consoleErrors = [];

  const allLabels = () => page.evaluate(() => getCommands().map((c) => c.label));
  const labelsByPrefix = (prefix) =>
    page.evaluate((p) => getCommands().map((c) => c.label).filter((l) => l.startsWith(p)), prefix);
  const paneCount = () => page.locator(".terminal-pane").count();
  const activeId = () => page.evaluate(() => state.activeId);

  // Drive a command exactly as a user would: open the palette, type the label
  // to filter, then click the matching list item (which runs it). Returns
  // whether the command was present, and asserts no uncaught error resulted.
  async function runCmd(label, { mustExist = true } = {}) {
    const before = pageErrors.length;
    await page.evaluate(() => openPalette());
    await expect(page.locator("#paletteOverlay")).toBeVisible();
    await page.locator("#paletteInput").fill(label);
    const clicked = await page.evaluate((lbl) => {
      const items = [...document.querySelectorAll("#paletteList .palette-item")];
      const el = items.find((li) => li.querySelector("span")?.textContent === lbl);
      if (!el) return false;
      el.click();
      return true;
    }, label);
    if (mustExist) expect(clicked, `command present & selectable in palette: "${label}"`).toBe(true);
    if (!clicked) {
      await page.keyboard.press("Escape");
      return false;
    }
    await expect(page.locator("#paletteOverlay")).toBeHidden();
    await page.waitForTimeout(150); // runPaletteSelection defers command.run() ~60ms
    expect(pageErrors.slice(before), `no uncaught error from "${label}"`).toEqual([]);
    return true;
  }

  // Deterministic starting point: no terminals, then N fresh auto terminals.
  // closeAllTerminals() early-returns if the bridge is momentarily offline (its
  // killAll send fails), so retry the close across any transient drop — the app
  // auto-reconnects within ~1s — until the session count actually drains to 0.
  async function resetTo(n) {
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            if (state.socketReady) closeAllTerminals();
          });
          return page.evaluate(() => state.terminals.size);
        },
        { timeout: 30000, message: "closeAllTerminals should drain sessions to 0" }
      )
      .toBe(0);
    await expect(page.locator("#statusSessions")).toHaveText("0 sessions");
    for (let i = 0; i < n; i += 1) {
      await page.evaluate(() => addTerminal({ reveal: true }));
    }
    await expect(page.locator(".terminal-pane")).toHaveCount(n);
    if (n > 0) await expect.poll(activeId).not.toBeNull();
  }

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      permissions: ["clipboard-read", "clipboard-write"]
    });
    page = await context.newPage();
    page.on("pageerror", (err) => pageErrors.push(String(err.message || err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("palette UI mechanics: open, filter, keyboard nav, run-by-click, shortcuts", async () => {
    // Open via toolbar button.
    await page.locator("#commandPalette").click();
    await expect(page.locator("#paletteOverlay")).toBeVisible();

    // Filtering narrows the list.
    await page.locator("#paletteInput").fill("terminal");
    const filtered = await page.locator("#paletteList .palette-item").count();
    expect(filtered).toBeGreaterThan(0);
    await page.locator("#paletteInput").fill("");
    const unfiltered = await page.locator("#paletteList .palette-item").count();
    expect(unfiltered).toBeGreaterThanOrEqual(filtered);

    // Arrow key moves selection.
    await page.locator("#paletteInput").press("ArrowDown");
    await expect(page.locator('#paletteList .palette-item[aria-selected="true"]')).toHaveCount(1);
    const selectedIndex = await page.evaluate(() => palette.index);
    expect(selectedIndex).toBe(1);

    // Escape closes.
    await page.keyboard.press("Escape");
    await expect(page.locator("#paletteOverlay")).toBeHidden();

    // Ctrl+Shift+P opens, Escape closes.
    await page.keyboard.press("Control+Shift+P");
    await expect(page.locator("#paletteOverlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#paletteOverlay")).toBeHidden();

    // "No matching commands" empty state.
    await page.evaluate(() => openPalette());
    await page.locator("#paletteInput").fill("zzzzz-nope-nope");
    await expect(page.locator("#paletteList .palette-empty")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("commands that open dialogs: Keyboard shortcuts, Help, About", async () => {
    await runCmd("Keyboard shortcuts");
    await expect(page.locator("#shortcutsOverlay")).toBeVisible();
    await page.locator("#shortcutsClose").click();
    await expect(page.locator("#shortcutsOverlay")).toBeHidden();

    await runCmd("Help");
    await expect(page.locator("#helpOverlay")).toBeVisible();
    await page.locator("#helpDocClose").click();
    await expect(page.locator("#helpOverlay")).toBeHidden();

    await runCmd("About MultiTerm");
    await expect(page.locator("#aboutOverlay")).toBeVisible();
    await expect(page.locator("#aboutVersionText")).toContainText("0.1.11");
    await page.locator("#aboutClose").click();
    await expect(page.locator("#aboutOverlay")).toBeHidden();
  });

  test("chrome + theme + font-size commands", async () => {
    const body = page.locator("body");

    await runCmd("Toggle header");
    await expect(body).toHaveClass(/header-hidden/);
    await runCmd("Toggle header");
    await expect(body).not.toHaveClass(/header-hidden/);

    await runCmd("Toggle layout panel");
    await expect(body).toHaveClass(/sidecar-hidden/);
    await runCmd("Toggle layout panel");
    await expect(body).not.toHaveClass(/sidecar-hidden/);

    const themeBefore = await page.evaluate(() => document.documentElement.dataset.appTheme);
    await runCmd("Toggle app theme");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.appTheme))
      .not.toBe(themeBefore);
    await runCmd("Toggle app theme");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.appTheme))
      .toBe(themeBefore);

    const fontBefore = await page.evaluate(() => state.settings.fontSize);
    await runCmd("Increase font size");
    await expect(page.locator("#fontSizeValue")).toHaveText(`${fontBefore + 1}px`);
    await runCmd("Decrease font size");
    await expect(page.locator("#fontSizeValue")).toHaveText(`${fontBefore}px`);
  });

  test("all 11 layout commands set the host layout", async () => {
    for (const [label, value] of LAYOUTS) {
      await runCmd(`Layout: ${label}`);
      await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", value);
      await expect(page.locator(".control-panel")).toHaveAttribute("data-mode", value);
    }
    // Leave a sane layout for later tests.
    await runCmd("Layout: Auto fit");
    await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "auto");
  });

  test("broadcast bar + scope commands", async () => {
    await page.evaluate(() => {
      state.broadcastScope = "all";
      elements.broadcastScope.dataset.scope = "all";
    });

    await runCmd("Broadcast command\u2026");
    await expect(page.locator("#broadcastBar")).toBeVisible();

    await runCmd("Cycle broadcast scope");
    await expect(page.locator("#broadcastScope")).toHaveAttribute("data-scope", "active");
    await runCmd("Cycle broadcast scope");
    await expect(page.locator("#broadcastScope")).toHaveAttribute("data-scope", "group");
    await runCmd("Cycle broadcast scope");
    await expect(page.locator("#broadcastScope")).toHaveAttribute("data-scope", "all");

    await page.locator("#broadcastClose").click();
    await expect(page.locator("#broadcastBar")).toBeHidden();
  });

  test("find, zoom, next/prev, colour, minimise/restore", async () => {
    await resetTo(3);

    // Find in active terminal.
    await runCmd("Find in active terminal");
    await expect(page.locator(".terminal-pane.is-active .pane-find")).toBeVisible();

    // Typing highlights real matches (SearchAddon decorations require the
    // proposed-API terminal option — this asserts that highlight path works).
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const t = state.terminals.get(state.activeId);
          t.term.write("\r\nZEBRA one ZEBRA two ZEBRA\r\n", () => resolve());
        })
    );
    const findInput = page.locator(".terminal-pane.is-active .pane-find-input");
    await findInput.fill("ZEBRA");
    await expect(page.locator(".terminal-pane.is-active .pane-find-count")).toHaveText(/^[1-9]\d*\/[1-9]\d*$/);

    await page.evaluate(() => closeAnyFind());
    await expect(page.locator(".terminal-pane.is-active .pane-find")).toBeHidden();

    // Maximise / restore active pane.
    await runCmd("Maximize / restore active pane");
    await expect(page.locator("#terminalHost")).toHaveClass(/has-zoom/);
    await runCmd("Maximize / restore active pane");
    await expect(page.locator("#terminalHost")).not.toHaveClass(/has-zoom/);

    // Next / previous terminal move the active pane.
    const first = await activeId();
    await runCmd("Next terminal");
    await expect.poll(activeId).not.toBe(first);
    await runCmd("Previous terminal");
    await expect.poll(activeId).toBe(first);

    // Cycle active terminal colour (fresh panes start uncoloured).
    await expect(page.locator(".terminal-pane.is-active")).not.toHaveClass(/has-color/);
    await runCmd("Cycle active terminal color");
    await expect(page.locator(".terminal-pane.is-active")).toHaveClass(/has-color/);

    // Minimise then restore all.
    await expect(page.locator("#minimizedDock")).toBeHidden();
    await runCmd("Minimize active terminal");
    await expect(page.locator("#minimizedDock")).toBeVisible();
    await expect(page.locator(".terminal-pane.is-minimized")).toHaveCount(1);
    await runCmd("Restore all minimized terminals");
    await expect(page.locator("#minimizedDock")).toBeHidden();
    await expect(page.locator(".terminal-pane.is-minimized")).toHaveCount(0);
  });

  test("find in all terminals: keybindings, cross-pane highlights, navigation", async () => {
    await resetTo(3);

    // Ctrl+F opens the per-pane find bar on the active terminal (was Ctrl+Shift+F).
    await page.keyboard.press("Control+f");
    await expect(page.locator(".terminal-pane.is-active .pane-find")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".terminal-pane.is-active .pane-find")).toBeHidden();

    // Ctrl+Shift+F opens the global find-in-all bar.
    await page.keyboard.press("Control+Shift+f");
    await expect(page.locator("#findAllBar")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#findAllBar")).toBeHidden();

    // Seed a unique, searchable token into every terminal's buffer (direct
    // xterm writes — no shell involvement — so the match set is deterministic).
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const terms = [...state.terminals.values()];
          let pending = terms.length;
          if (!pending) return resolve();
          terms.forEach((t, i) =>
            t.term.write(`\r\nZEBRA marker ${i} ZEBRA\r\n`, () => {
              pending -= 1;
              if (pending === 0) resolve();
            })
          );
        })
    );

    // Open via the command palette and search.
    await runCmd("Find in all terminals");
    await expect(page.locator("#findAllBar")).toBeVisible();
    await page.locator("#findAllInput").fill("ZEBRA");

    // Every pane matched, so every pane is flagged and the count spans panes.
    await expect
      .poll(() => page.evaluate(() => state.findAll.order.length))
      .toBe(3);
    await expect(page.locator(".terminal-pane.has-find-match")).toHaveCount(3);
    await expect(page.locator("#findAllCount")).toContainText("panes");

    // Next steps across matches/panes; the global position becomes 1/N.
    await page.locator("#findAllInput").press("Enter");
    await expect(page.locator("#findAllCount")).toContainText(/^1\//);
    const firstNavId = await page.evaluate(() => state.findAll.order[state.findAll.ti]);
    expect(await activeId()).toBe(firstNavId);

    // Wrap-around: Shift+Enter from the first match lands on the last match.
    await page.locator("#findAllInput").press("Shift+Enter");
    await expect(page.locator("#findAllCount")).not.toContainText(/^1\//);

    // Escape closes and clears every pane's highlight flag.
    await page.locator("#findAllInput").press("Escape");
    await expect(page.locator("#findAllBar")).toBeHidden();
    await expect(page.locator(".terminal-pane.has-find-match")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => state.findAll.active)).toBe(false);
  });

  test("active-terminal side-effect commands run without error", async () => {
    await resetTo(2);

    // Put something in the clipboard so Copy/Paste exercise real clipboard I/O.
    await page.evaluate(() => navigator.clipboard.writeText("e2e-clip"));

    await runCmd("Clear active terminal");
    await runCmd("Copy active output");
    await runCmd("Paste into active terminal");
    await runCmd("Restart active terminal");
    await runCmd("Browse & run script in active terminal\u2026"); // browser -> graceful toast, no throw

    // Sync-input toggle (label reflects current state).
    const [syncLabelOff] = await labelsByPrefix("Toggle sync input");
    await runCmd(syncLabelOff);
    await expect.poll(() => page.evaluate(() => elements.syncInput.checked)).toBe(true);
    const [syncLabelOn] = await labelsByPrefix("Toggle sync input");
    await runCmd(syncLabelOn);
    await expect.poll(() => page.evaluate(() => elements.syncInput.checked)).toBe(false);
  });

  test("bridge-message commands emit the right message (reveal, logging)", async () => {
    await resetTo(1);
    // Spy on sendBridge so we verify the emitted message without opening
    // Explorer windows or writing real log files on the host.
    await page.evaluate(() => {
      window.__origSendBridge = sendBridge;
      window.__sent = [];
      // eslint-disable-next-line no-global-assign
      sendBridge = (msg) => {
        window.__sent.push(msg);
        return true;
      };
      // Give the active terminal a known cwd so reveal takes the real branch.
      const active = state.terminals.get(state.activeId);
      if (active) active.cwd = "C:\\Windows";
    });

    await runCmd("Open active terminal folder");
    expect(await page.evaluate(() => window.__sent.some((m) => m.type === "reveal"))).toBe(true);

    await page.evaluate(() => (window.__sent = []));
    await runCmd("Toggle logging for active terminal");
    expect(await page.evaluate(() => window.__sent.some((m) => m.type === "logStart"))).toBe(true);

    // Simulate the bridge confirming logging so the next toggle stops it.
    await page.evaluate(() => {
      const id = state.activeId;
      const t = state.terminals.get(id);
      if (t) t.logging = true;
      window.__sent = [];
    });
    await runCmd("Toggle logging for active terminal");
    expect(await page.evaluate(() => window.__sent.some((m) => m.type === "logStop"))).toBe(true);

    await page.evaluate(() => {
      // eslint-disable-next-line no-global-assign
      sendBridge = window.__origSendBridge;
    });
  });

  test("all new-terminal commands create a pane", async () => {
    await resetTo(1);
    for (const label of [
      "New terminal",
      "New PowerShell 7 terminal",
      "New Windows PowerShell terminal",
      "New Command Prompt terminal",
      "New WSL terminal",
      "New terminal in active folder"
    ]) {
      const before = await paneCount();
      await runCmd(label);
      await expect(page.locator(".terminal-pane")).toHaveCount(before + 1);
    }
  });

  test("fit all + reset layout", async () => {
    await runCmd("Fit all terminals");

    await page.evaluate(() => {
      state.settings.layout = "columns";
      elements.layoutMode.value = "columns";
      applySettings();
    });
    await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "columns");
    await runCmd("Reset layout");
    await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "auto");
  });

  test("dynamic: every snippet command runs in the active terminal", async () => {
    await resetTo(1);
    const snippetLabels = await labelsByPrefix("Snippet: ");
    expect(snippetLabels.length).toBeGreaterThanOrEqual(3); // 3 defaults
    for (const label of snippetLabels) {
      await runCmd(label);
    }
  });

  test("dynamic: every focus command activates its terminal", async () => {
    await resetTo(3);
    // Ensure unique titles so labels map 1:1 to terminals.
    await page.evaluate(() => {
      let i = 1;
      for (const t of state.terminals.values()) {
        t.titleInput.value = `E2E Term ${i}`;
        i += 1;
      }
    });

    const terminals = await page.evaluate(() =>
      [...state.terminals.values()].map((t) => ({ id: t.id, title: t.titleInput.value }))
    );
    for (const t of terminals) {
      await runCmd(`Focus: ${t.title}`);
      await expect.poll(activeId).toBe(t.id);
    }
  });

  test("dynamic: restore-workspace command restores layout + terminals", async () => {
    await resetTo(2);
    await page.evaluate(() => {
      state.settings.layout = "rows";
      elements.layoutMode.value = "rows";
      applySettings();
    });
    await page.locator("#workspaceName").fill("PaletteWS");
    await page.locator("#workspaceSave").click();

    // Diverge from the saved state: different layout and fewer terminals.
    await page.evaluate(() => {
      state.settings.layout = "columns";
      elements.layoutMode.value = "columns";
      applySettings();
    });
    await resetTo(1);
    await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "columns");
    await expect(page.locator(".terminal-pane")).toHaveCount(1);

    await runCmd("Restore workspace: PaletteWS");
    await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "rows");
    await expect(page.locator(".terminal-pane")).toHaveCount(2);

    // Cleanup the workspace.
    await page.evaluate(() => {
      const sel = document.querySelector("#workspaceSelect");
      const opt = [...sel.options].find((o) => o.textContent.includes("PaletteWS"));
      if (opt) {
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      document.querySelector("#workspaceDelete").click();
    });
  });

  test("destructive: close active then close all", async () => {
    await resetTo(2);
    await runCmd("Close active terminal");
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await runCmd("Close all terminals");
    // The palette command ran; drain resiliently in case the bridge blipped at
    // that exact moment (the app auto-reconnects and a retry then succeeds).
    await expect
      .poll(
        async () => {
          await page.evaluate(() => {
            if (state.socketReady) closeAllTerminals();
          });
          return page.evaluate(() => state.terminals.size);
        },
        { timeout: 30000, message: "close all should drain sessions to 0" }
      )
      .toBe(0);
    await expect(page.locator("#statusSessions")).toHaveText("0 sessions");
  });

  test("completeness: every catalogued command exists in the palette", async () => {
    const labels = await allLabels();
    const missing = STATIC_LABELS.filter((l) => !labels.includes(l));
    expect(missing, "static commands all present").toEqual([]);

    // Dynamic sync-input toggle is always present.
    expect(labels.some((l) => l.startsWith("Toggle sync input"))).toBe(true);

    // All 11 layout commands are present.
    for (const [label] of LAYOUTS) {
      expect(labels).toContain(`Layout: ${label}`);
    }

    // No uncaught JS errors were produced by ANY command during this suite.
    expect(pageErrors, "no uncaught page errors across all commands").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Every settings-panel control, driven exactly like a user (set value + fire
// the bound event) with a concrete assertion that the expected effect landed:
// a CSS variable / class / <output> text / xterm option / state.settings value.
// ---------------------------------------------------------------------------
test.describe("Settings panel — every control has its expected effect", () => {
    let context;
    let page;
    const pageErrors = [];

    // The app hides native <select>/<input> controls behind custom comboboxes,
    // so drive them by setting the value and dispatching the bound event.
    const setNative = (selector, value, eventName) =>
      page.evaluate(
        ({ selector, value, eventName }) => {
          const el = document.querySelector(selector);
          el.value = value;
          el.dispatchEvent(new Event(eventName, { bubbles: true }));
        },
        { selector, value, eventName }
      );

    const setCheck = (selector, checked) =>
      page.evaluate(
        ({ selector, checked }) => {
          const el = document.querySelector(selector);
          el.checked = checked;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        },
        { selector, checked }
      );

    // Some chrome buttons are style-hidden until hover; click them via the DOM.
    const domClick = (selector) => page.evaluate((s) => document.querySelector(s).click(), selector);

    const setting = (key) => page.evaluate((k) => state.settings[k], key);
    const termOpt = (name) =>
      page.evaluate((n) => {
        const t = [...state.terminals.values()][0];
        return t ? t.term.options[n] : undefined;
      }, name);

    async function ensureTerminal() {
      const count = await page.evaluate(() => state.terminals.size);
      if (count === 0) {
        await page.evaluate(() => addTerminal({ reveal: true }));
        await expect(page.locator(".terminal-pane")).toHaveCount(1);
      }
    }

    test.beforeAll(async ({ browser }) => {
      context = await browser.newContext({
        baseURL: "http://127.0.0.1:3199",
        // Grant notifications so the activity/silence/bell toggles never trigger a
        // permission prompt (their change handlers request it when "default").
        permissions: ["clipboard-read", "clipboard-write", "notifications"]
      });
      page = await context.newPage();
      page.on("pageerror", (err) => pageErrors.push(String(err.message || err)));
      await page.goto("/");
      await expect(page.locator("#statusConn")).toHaveText("Connected");
        // The bridge keeps ptys alive globally (they survive a client disconnect),
        // so a freshly-loaded page reattaches whatever sessions earlier suites left
        // behind. Wait for that one-time `welcome` to settle (>=1 pane), then
        // normalise to exactly one terminal so effect assertions start from a known
        // state regardless of suite ordering. Retry the close across any transient
        // bridge drop (the app auto-reconnects) until sessions actually drain to 0.
        await expect(page.locator(".terminal-pane")).not.toHaveCount(0);
        await expect
          .poll(
            async () => {
              await page.evaluate(() => {
                if (state.socketReady) closeAllTerminals();
              });
              return page.evaluate(() => state.terminals.size);
            },
            { timeout: 30000, message: "closeAllTerminals should drain sessions to 0" }
          )
          .toBe(0);
        await expect(page.locator("#statusSessions")).toHaveText("0 sessions");
        await page.evaluate(() => addTerminal({ reveal: true }));
        await expect(page.locator(".terminal-pane")).toHaveCount(1);
      });

    test.afterAll(async () => {
      await context.close();
    });

    // ---- Appearance --------------------------------------------------------

    test("App theme: system / dark / light resolve onto <html data-app-theme>", async () => {
      await setNative("#appTheme", "light", "change");
      await expect(page.locator("html")).toHaveAttribute("data-app-theme", "light");

      await setNative("#appTheme", "dark", "change");
      await expect(page.locator("html")).toHaveAttribute("data-app-theme", "dark");

      // "system" resolves against prefers-color-scheme (light in headless Chromium).
      const expected = await page.evaluate(
        () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      );
      await setNative("#appTheme", "system", "change");
      await expect(page.locator("html")).toHaveAttribute("data-app-theme", expected);

      await setNative("#appTheme", "dark", "change"); // restore
      await expect(page.locator("html")).toHaveAttribute("data-app-theme", "dark");
    });

    test("Font family: applies the mapped font stack to live terminals", async () => {
      await ensureTerminal();
      for (const family of ["Consolas", "JetBrains Mono", "Fira Code", "Cascadia Mono"]) {
        await setNative("#fontFamily", family, "change");
        const [expected, actual] = await page.evaluate((f) => {
          const stack = fontStacks[f] || fontStacks["Cascadia Mono"];
          const t = [...state.terminals.values()][0];
          return [stack, t.term.options.fontFamily];
        }, family);
        expect(actual, `font stack for ${family}`).toBe(expected);
        expect(await setting("fontFamily")).toBe(family);
      }
    });

    test("Cursor style + blink apply to live terminals", async () => {
      await ensureTerminal();
      for (const style of ["block", "underline", "bar"]) {
        await setNative("#cursorStyle", style, "change");
        expect(await termOpt("cursorStyle")).toBe(style);
        expect(await setting("cursorStyle")).toBe(style);
      }

      await setCheck("#cursorBlink", false);
      expect(await termOpt("cursorBlink")).toBe(false);
      await setCheck("#cursorBlink", true);
      expect(await termOpt("cursorBlink")).toBe(true);
    });

    // ---- Layout ------------------------------------------------------------

    test("Layout mode: every option updates host[data-layout] + control-panel[data-mode]", async () => {
      for (const [, value] of LAYOUTS) {
        await setNative("#layoutMode", value, "change");
        await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", value);
        await expect(page.locator(".control-panel")).toHaveAttribute("data-mode", value);
      }
      await setNative("#layoutMode", "auto", "change");
    });

    test("Layout sliders: each writes its CSS var and mirrors into its <output>", async () => {
      const cases = [
        { sel: "#minWidth", value: "480", css: "--min-pane-width", cssVal: "480px", out: "#minWidthValue", outText: "480px" },
        { sel: "#columnCount", value: "3", css: "--fixed-columns", cssVal: "3", out: "#columnCountValue", outText: "3" },
        { sel: "#rowCount", value: "4", css: "--fixed-rows", cssVal: "4", out: "#rowCountValue", outText: "4" },
        { sel: "#paneHeight", value: "360", css: "--pane-height", cssVal: "360px", out: "#paneHeightValue", outText: "360px" },
        { sel: "#focusWidth", value: "70", css: "--focus-width", cssVal: "70%", out: "#focusWidthValue", outText: "70%" },
        { sel: "#paneGap", value: "12", css: "--pane-gap", cssVal: "12px", out: "#paneGapValue", outText: "12px" }
      ];
      for (const c of cases) {
        await setNative(c.sel, c.value, "input");
        const cssActual = await page.evaluate(
          (name) => document.getElementById("terminalHost").style.getPropertyValue(name).trim(),
          c.css
        );
        expect(cssActual, `${c.css} after setting ${c.sel}=${c.value}`).toBe(c.cssVal);
        await expect(page.locator(c.out)).toHaveText(c.outText);
      }
    });

    // ---- Terminal ----------------------------------------------------------

    test("Font size: updates the <output> and every live terminal's fontSize", async () => {
      await ensureTerminal();
      await setNative("#fontSize", "18", "input");
      await expect(page.locator("#fontSizeValue")).toHaveText("18px");
      expect(await termOpt("fontSize")).toBe(18);
      await setNative("#fontSize", "14", "input"); // restore default
      await expect(page.locator("#fontSizeValue")).toHaveText("14px");
    });

    test("Terminal theme: each palette applies its background to live terminals", async () => {
      await ensureTerminal();
      for (const name of ["graphite", "paper", "contrast", "ember"]) {
        await setNative("#terminalTheme", name, "change");
        const [expectedBg, actualBg] = await page.evaluate((n) => {
          const t = [...state.terminals.values()][0];
          return [themes[n].background, t.term.options.theme.background];
        }, name);
        expect(actualBg, `background for ${name}`).toBe(expectedBg);
        expect(await setting("theme")).toBe(name);
      }
    });

    test("Compact chrome toggles the #terminalHost.compact class", async () => {
      await setCheck("#compactChrome", true);
      await expect(page.locator("#terminalHost")).toHaveClass(/(^|\s)compact(\s|$)/);
      await setCheck("#compactChrome", false);
      await expect(page.locator("#terminalHost")).not.toHaveClass(/(^|\s)compact(\s|$)/);
    });

    test("Sync input toggle flips state.settings.syncInput", async () => {
      await setCheck("#syncInput", true);
      expect(await setting("syncInput")).toBe(true);
      await setCheck("#syncInput", false);
      expect(await setting("syncInput")).toBe(false);
    });

    test("Right-click action select stores every option", async () => {
      for (const value of ["paste", "pasteRun", "menu"]) {
        await setNative("#rightClickAction", value, "change");
        expect(await setting("rightClickAction")).toBe(value);
      }
    });

    test("Scrollback lines + infinite drive effectiveScrollback and term.options.scrollback", async () => {
      await ensureTerminal();
      await setNative("#scrollbackLines", "50000", "change");
      expect(await setting("scrollback")).toBe(50000);
      expect(await termOpt("scrollback")).toBe(50000);

      await setCheck("#scrollbackInfinite", true);
      expect(await page.evaluate(() => effectiveScrollback())).toBe(1000000);
      expect(await termOpt("scrollback")).toBe(1000000);

      await setCheck("#scrollbackInfinite", false);
      expect(await page.evaluate(() => effectiveScrollback())).toBe(50000);
      expect(await termOpt("scrollback")).toBe(50000);

      await setNative("#scrollbackLines", "20000", "change"); // restore default
      expect(await setting("scrollback")).toBe(20000);
    });

    test("Scroll on output toggle flips state.settings.scrollOnOutput", async () => {
      await setCheck("#scrollOnOutput", true);
      expect(await setting("scrollOnOutput")).toBe(true);
      await setCheck("#scrollOnOutput", false);
      expect(await setting("scrollOnOutput")).toBe(false);
    });

    // ---- Session -----------------------------------------------------------

    test("Session checkboxes each persist their boolean into state.settings", async () => {
      const toggles = [
        ["#restoreSession", "restoreSession"],
        ["#bellNotify", "bellNotify"],
        ["#copyOnSelect", "copyOnSelect"],
        ["#highlightInputPrompts", "highlightInputPrompts"],
        ["#notifyActivity", "notifyActivity"],
        ["#notifySilence", "notifySilence"]
      ];
      for (const [sel, key] of toggles) {
        await setCheck(sel, true);
        expect(await setting(key), `${key} = true`).toBe(true);
        await setCheck(sel, false);
        expect(await setting(key), `${key} = false`).toBe(false);
      }
    });

    test("Silence seconds + startup command persist into state.settings", async () => {
      await setNative("#silenceSeconds", "45", "change");
      expect(await setting("silenceSeconds")).toBe(45);
      await setNative("#silenceSeconds", "10", "change"); // restore default

      await setNative("#startupCommand", "echo ready", "change");
      expect(await setting("startupCommand")).toBe("echo ready");
      await setNative("#startupCommand", "", "change"); // restore
      expect(await setting("startupCommand")).toBe("");
    });

    // ---- Shell select ------------------------------------------------------

    test("Shell select sets the default shell for the next terminal + status bar", async () => {
      // "powershell" is the one value that maps to the "Windows PowerShell" label.
      await setNative("#shellSelect", "powershell", "change");
      await page.evaluate(() => addTerminal({ reveal: true }));
      await expect.poll(() => page.evaluate(() => state.terminals.size)).toBeGreaterThan(0);
      let shell = await page.evaluate(() => state.terminals.get(state.activeId)?.shell);
      expect(shell).toBe("powershell");
      await expect(page.locator("#statusShellText")).toHaveText("Windows PowerShell");

      await setNative("#shellSelect", "pwsh", "change");
      await page.evaluate(() => addTerminal({ reveal: true }));
      shell = await page.evaluate(() => state.terminals.get(state.activeId)?.shell);
      expect(shell).toBe("pwsh");
      await expect(page.locator("#statusShellText")).toHaveText("PowerShell 7");
    });

    // ---- Snippets ----------------------------------------------------------

    test("Snippets: add via the form appears in the list + palette, remove reverses it", async () => {
      const before = await page.locator("#snippetList .snippet-row").count();

      await page.locator("#snippetName").fill("E2E Snip");
      await page.locator("#snippetCommand").fill("echo e2e");
      await page.locator("#snippetAdd").click();

      await expect(page.locator("#snippetList .snippet-row")).toHaveCount(before + 1);
      let labels = await page.evaluate(() => getCommands().map((c) => c.label));
      expect(labels).toContain("Snippet: E2E Snip");

      // Remove the row we just added (its run button carries the snippet name).
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll("#snippetList .snippet-row")];
        const row = rows.find((r) => r.querySelector(".snippet-run")?.textContent === "E2E Snip");
        row.querySelector(".snippet-del").click();
      });

      await expect(page.locator("#snippetList .snippet-row")).toHaveCount(before);
      labels = await page.evaluate(() => getCommands().map((c) => c.label));
      expect(labels).not.toContain("Snippet: E2E Snip");
    });

    // ---- Layout action buttons --------------------------------------------

    test("Fit all + Reset layout buttons work; reset returns to auto", async () => {
      await setNative("#layoutMode", "columns", "change");
      await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "columns");

      await page.locator("#fitAll").click(); // must not throw

      await page.locator("#resetLayout").click();
      await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "auto");
    });

    // ---- Chrome toggle buttons --------------------------------------------

    test("Header + layout-panel toggle buttons flip body classes both ways", async () => {
      await domClick("#toggleHeader");
      await expect(page.locator("body")).toHaveClass(/(^|\s)header-hidden(\s|$)/);
      await domClick("#toggleHeader");
      await expect(page.locator("body")).not.toHaveClass(/(^|\s)header-hidden(\s|$)/);

      await domClick("#toggleSidecar");
      await expect(page.locator("body")).toHaveClass(/(^|\s)sidecar-hidden(\s|$)/);
      await domClick("#toggleSidecar");
      await expect(page.locator("body")).not.toHaveClass(/(^|\s)sidecar-hidden(\s|$)/);
    });

    // ---- Workspaces --------------------------------------------------------

    test("Workspace save / restore / delete roundtrip restores the saved layout", async () => {
      await ensureTerminal();
      await setNative("#layoutMode", "rows", "change");
      await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "rows");

      await page.locator("#workspaceName").fill("E2E WS");
      await page.locator("#workspaceSave").click();
      await expect(page.locator('#workspaceSelect option[value="E2E WS"]')).toHaveCount(1);
      await expect(page.locator("#workspaceSelect")).toHaveValue("E2E WS");

      // Diverge the layout, then restore should bring it back to "rows".
      await setNative("#layoutMode", "columns", "change");
      await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "columns");

      await page.locator("#workspaceRestore").click();
      await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "rows");
      await expect(page.locator(".terminal-pane")).not.toHaveCount(0);

      await page.locator("#workspaceDelete").click();
      await expect(page.locator('#workspaceSelect option[value="E2E WS"]')).toHaveCount(0);

      await setNative("#layoutMode", "auto", "change"); // leave tidy
    });

    test("completeness: no uncaught page errors across the settings suite", async () => {
      expect(pageErrors, "no uncaught page errors from any settings control").toEqual([]);
    });
});
