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
      const r = btn.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const at = document.elementFromPoint(cx, cy);
      return {
        overflows: host.scrollHeight > host.clientHeight,
        scrollTop: host.scrollTop,
        hostTop: Math.round(host.getBoundingClientRect().top),
        buttonTop: Math.round(r.top),
        cx,
        cy,
        hitsButton: !!(at && btn.contains(at))
      };
    });

    // The scenario must genuinely scroll the host, else it guards nothing.
    expect(probe.overflows).toBe(true);
    expect(probe.scrollTop).toBeGreaterThan(0);
    // The sticky header pins the X below the host's top edge (clear of the topbar)
    // and a real hit-test at the X's centre lands on the close button — not the
    // topbar. Both assertions fail on the pre-fix (clipped) layout.
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
    // the padding around the terminal) marks it active via the pointerdown
    // handler, but before the fix it did NOT move DOM focus into that pane's
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

  test("closes all terminals", async () => {
    await page.locator("#closeAllTerminals").click();
    await expect(page.locator("#statusSessions")).toHaveText("0 sessions");
  });
});
