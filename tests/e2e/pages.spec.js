// Pages are live containers, not saved snapshots: switching pages hides panes
// but keeps their sessions running. These tests pin down that guarantee, the
// pager UI, what happens to terminals when a page is closed, that the split
// survives a reload, and the Alt+Q quick switcher's key assignment and jumping.

const { test, expect } = require("@playwright/test");

test.describe.configure({ mode: "serial" });

test.describe("Pages and the quick switcher", () => {
  let context;
  let page;
  const errors = [];

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      viewport: { width: 1400, height: 900 }
    });
    page = await context.newPage();
    page.on("pageerror", (err) => errors.push(String(err.message || err)));
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });

  test.afterAll(async () => {
    // The bridge is shared with every other spec, and the next one expects to
    // start from an empty one, so drain it rather than just closing the page.
    await page.evaluate(() => closeAllTerminals());
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(0);
    await context.close();
  });

  // The bridge outlives the page, so a reload re-adopts whatever sessions it
  // still holds. Kills are asynchronous, so wait for it to actually drain
  // before building the arrangement a test is going to reload into.
  const bridgeSessionCount = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
          const probe = new WebSocket(`${protocol}//${window.location.host}/ws`);
          probe.addEventListener("message", (event) => {
            const message = JSON.parse(event.data);
            if (message.type !== "welcome") return;
            probe.close();
            resolve(message.sessions.length);
          });
          probe.addEventListener("error", () => reject(new Error("probe socket failed")));
        })
    );

  // Other specs share this bridge and leave sessions behind, and pages persist
  // in localStorage, so every test starts from one page and a known pane count.
  async function reset(paneCount) {
    await page.evaluate(() => closeAllTerminals());
    await expect(page.locator(".terminal-pane")).toHaveCount(0);
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(0);
    await page.evaluate(() => {
      state.pages = [{ id: "page-1", name: "Page 1" }];
      state.activePageId = "page-1";
      state.terminalPages = {};
      savePages();
      saveTerminalPages();
      renderPager();
    });
    for (let i = 0; i < paneCount; i += 1) {
      await page.evaluate((n) => addTerminal({ title: `T${n}` }), i + 1);
    }
    await expect(page.locator(".terminal-pane")).toHaveCount(paneCount);
    await expect
      .poll(() => page.evaluate(() => [...state.terminals.values()].filter((t) => t.status === "live").length), {
        timeout: 20000
      })
      .toBe(paneCount);
  }

  const perPage = () =>
    page.evaluate(() => state.pages.map((p) => `${p.name}=${terminalsOnPage(p.id).length}`));

  test("the pager lists pages with their terminal counts and marks the active one", async () => {
    await reset(3);
    await page.evaluate(() => addPage({ name: "Builds", activate: false }));

    const chips = page.locator(".pager-chip");
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0).locator(".pager-name")).toHaveText("Page 1");
    await expect(chips.nth(0).locator(".pager-count")).toHaveText("3");
    await expect(chips.nth(1).locator(".pager-name")).toHaveText("Builds");
    await expect(chips.nth(1).locator(".pager-count")).toHaveText("0");
    await expect(chips.nth(0)).toHaveClass(/is-active/);
    await expect(chips.nth(1)).not.toHaveClass(/is-active/);
  });

  test("switching pages hides panes without killing their sessions", async () => {
    await reset(2);
    const marker = "PAGE-ALIVE-MARKER";
    const id = await page.evaluate(() => [...state.terminals.keys()][0]);
    await page.evaluate(
      ([tid, text]) => state.terminals.get(tid).term.write(`${text}\r\n`),
      [id, marker]
    );

    await page.evaluate(() => addPage({ name: "Second" }));
    await expect(page.locator(".terminal-pane.is-page-hidden")).toHaveCount(2);
    // Hidden, but still mounted and still connected to a running pty.
    expect(await page.evaluate((tid) => state.terminals.get(tid).status, id)).toBe("live");
    expect(await page.evaluate((tid) => document.body.contains(state.terminals.get(tid).pane), id)).toBe(true);

    await page.evaluate(() => setActivePage("page-1"));
    await expect(page.locator(".terminal-pane.is-page-hidden")).toHaveCount(0);
    const buffer = await page.evaluate((tid) => {
      const term = state.terminals.get(tid).term;
      let out = "";
      for (let i = 0; i < term.buffer.active.length; i += 1) {
        out += term.buffer.active.getLine(i)?.translateToString(true) ?? "";
      }
      return out;
    }, id);
    expect(buffer).toContain(marker);
  });

  test("moving a terminal to another page updates both counts", async () => {
    await reset(3);
    const target = await page.evaluate(() => addPage({ name: "Builds", activate: false }));
    const moved = await page.evaluate(() => [...state.terminals.keys()][0]);
    await page.evaluate(([tid, pid]) => moveTerminalToPage(tid, pid), [moved, target]);

    expect(await perPage()).toEqual(["Page 1=2", "Builds=1"]);
    expect(await page.evaluate((tid) => state.terminals.get(tid).pageId, moved)).toBe(target);
    // It left the visible set but is still a live session.
    expect(await page.evaluate((tid) => state.terminals.get(tid).status, moved)).toBe("live");
  });

  test("closing a page relocates its terminals instead of killing them", async () => {
    await reset(3);
    const target = await page.evaluate(() => addPage({ name: "Doomed" }));
    await page.evaluate(
      (pid) => [...state.terminals.keys()].forEach((tid) => moveTerminalToPage(tid, pid)),
      target
    );
    expect(await perPage()).toEqual(["Page 1=0", "Doomed=3"]);

    await page.evaluate((pid) => removePage(pid), target);

    expect(await page.evaluate(() => state.pages.length)).toBe(1);
    expect(await perPage()).toEqual(["Page 1=3"]);
    await expect(page.locator(".terminal-pane")).toHaveCount(3);
    expect(
      await page.evaluate(() => [...state.terminals.values()].every((t) => t.status === "live"))
    ).toBe(true);
  });

  test("the last page cannot be closed", async () => {
    await reset(1);
    await page.evaluate(() => removePage(state.activePageId));
    expect(await page.evaluate(() => state.pages.length)).toBe(1);
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  // Regression: loadPages ran inside the `const state = {...}` initializer, so
  // referencing a module const declared further down threw a ReferenceError into
  // its own catch and silently reset every page. Separately, saveTerminalPages
  // used to rebuild its map from only the terminals adopted so far, which wiped
  // the assignments of sessions still being re-adopted and collapsed them all
  // onto one page.
  test("the page split and each terminal's page survive a reload", async () => {
    await reset(4);
    const target = await page.evaluate(() => addPage({ name: "Builds", activate: false }));
    await page.evaluate(
      (pid) => [...state.terminals.keys()].slice(0, 3).forEach((tid) => moveTerminalToPage(tid, pid)),
      target
    );
    expect(await perPage()).toEqual(["Page 1=1", "Builds=3"]);

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect
      .poll(() => page.evaluate(() => state.terminals.size), { timeout: 25000 })
      .toBe(4);
    await expect
      .poll(() => page.evaluate(() => state.pages.length), { timeout: 10000 })
      .toBe(2);

    await expect.poll(perPage, { timeout: 15000 }).toEqual(["Page 1=1", "Builds=3"]);
    await expect(page.locator(".terminal-pane.is-page-hidden")).toHaveCount(3);
    // No orphaned ids left behind in the remembered map.
    expect(
      await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("multiterm.terminalPages"))).length)
    ).toBe(4);
  });

  test("Alt+Q assigns 1-9 then letters, and re-keys densely when filtered", async () => {
    await reset(11);
    await page.evaluate((n) => {
      [...state.terminals.values()].forEach((t, i) => {
        t.titleInput.value = i < n ? `Term ${i + 1}` : `Other ${i + 1}`;
        t.title = t.titleInput.value;
      });
    }, 11);

    await page.keyboard.press("Alt+q");
    await expect(page.locator("#quickSwitchOverlay")).toBeVisible();
    const keys = () => page.locator(".quick-item .quick-key").allTextContents();
    expect(await keys()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B"]);

    // Filtering must renumber from 1 rather than keep the original keys.
    await page.locator("#quickSwitchInput").fill("Term 1");
    await expect(page.locator(".quick-item")).toHaveCount(3); // Term 1, 10, 11
    expect(await keys()).toEqual(["1", "2", "3"]);

    await page.keyboard.press("Escape");
    await expect(page.locator("#quickSwitchOverlay")).toBeHidden();
  });

  test("Alt+<key> in the switcher focuses the terminal and switches to its page", async () => {
    await reset(3);
    const target = await page.evaluate(() => addPage({ name: "Elsewhere", activate: false }));
    const moved = await page.evaluate(() => [...state.terminals.keys()][2]);
    await page.evaluate(([tid, pid]) => {
      moveTerminalToPage(tid, pid);
      const t = state.terminals.get(tid);
      t.titleInput.value = "Far away";
      t.title = "Far away";
    }, [moved, target]);
    expect(await page.evaluate(() => state.activePageId)).toBe("page-1");

    await page.keyboard.press("Alt+q");
    await page.locator("#quickSwitchInput").fill("Far away");
    await expect(page.locator(".quick-item")).toHaveCount(1);
    await page.keyboard.press("Alt+1");

    await expect(page.locator("#quickSwitchOverlay")).toBeHidden();
    expect(await page.evaluate(() => state.activePageId)).toBe(target);
    expect(await page.evaluate(() => state.activeId)).toBe(moved);
    // Revealed, not just selected.
    expect(
      await page.evaluate((tid) => state.terminals.get(tid).pane.classList.contains("is-page-hidden"), moved)
    ).toBe(false);
  });

  test("no page errors were raised", () => {
    expect(errors).toEqual([]);
  });
});
