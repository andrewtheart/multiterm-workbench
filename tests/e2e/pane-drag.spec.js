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

// Rearranging panes by dragging their title bar. These cover two failure modes
// that are easy to reintroduce and invisible without a real pointer:
//  - the pane bar of a top-row pane sits inside the host's top snap zone, so a
//    naive edge check swallows every horizontal drag;
//  - reordering re-inserts the pane, which releases pointer capture, so a drag
//    tracked on the bar loses its own pointerup and strands the pane lifted.
test.describe.configure({ mode: "serial" });

test.describe("pane drag to rearrange", () => {
  let context;
  let page;

  const setLayout = (value) => page.evaluate((layout) => {
    const el = document.querySelector("#layoutMode");
    el.value = layout;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);

  const paneOrder = () => page.evaluate(() =>
    [...document.querySelector("#terminalHost").children].map((pane) => pane.dataset.id));

  const paneBoxes = () => page.evaluate(() =>
    [...document.querySelector("#terminalHost").children].map((pane) => {
      const rect = pane.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        midX: Math.round(rect.left + rect.width / 2),
        midY: Math.round(rect.top + rect.height / 2)
      };
    }));

  const dragState = () => page.evaluate(() => ({
    lifted: [...document.querySelectorAll(".terminal-pane")].filter((pane) => pane.style.transform).length,
    dragging: document.querySelectorAll(".terminal-pane.is-dragging").length,
    bodyFlag: document.body.classList.contains("is-pane-dragging"),
    preview: document.querySelector("#snapPreview").dataset.edge || null
  }));

  const dragPane = async (from, path) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (const point of path) {
      await page.mouse.move(point.x, point.y, { steps: 8 });
      await page.waitForTimeout(120);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
  };

  // closeAllTerminals only proves the *client* let go of its panes; the bridge
  // drains its sessions a moment later. Any session still alive at reload time
  // is reattached, so this spec has to wait for the bridge itself to reach zero
  // or the reload brings back panes an earlier spec created.
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

  test.beforeAll(async ({ browser }) => {
    // Enough room for four panes to sit in view at once. In a smaller window the
    // host scrolls and pane 0 can be above the fold, which no pointer drag can
    // reach.
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      viewport: { width: 1600, height: 1000 }
    });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    // The bridge is shared across spec files, so start from a known four panes
    // rather than inheriting however many an earlier spec left running.
    if ((await page.locator(".terminal-pane").count()) > 0) {
      await page.locator("#closeAllTerminals").click();
      await expect(page.locator(".terminal-pane")).toHaveCount(0);
    }
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(0);
    for (let i = 0; i < 4; i += 1) {
      await page.locator("#addTerminal").click();
      await expect(page.locator(".terminal-pane")).toHaveCount(i + 1);
    }

    await setLayout("auto");
    await page.waitForTimeout(600);

    const boxes = await paneBoxes();
    const hostTop = await page.evaluate(() =>
      Math.round(document.querySelector("#terminalHost").getBoundingClientRect().top));
    expect(boxes[0].top).toBeGreaterThanOrEqual(hostTop - 1);
  });

  test.afterAll(async () => {
    await stopRendererCoverage(page, "pane-drag");
    await context.close();
  });

  test("dragging a pane past its neighbour's midpoint swaps them", async () => {
    const before = await paneOrder();
    const boxes = await paneBoxes();

    await dragPane(
      { x: boxes[0].left + 5, y: boxes[0].top + 3 },
      [{ x: boxes[0].midX, y: boxes[0].top + 3 }, { x: boxes[1].midX + 25, y: boxes[1].top + 3 }]
    );

    const after = await paneOrder();
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    expect(after.slice(2)).toEqual(before.slice(2));
  });

  test("a drag released away from the pane bar still completes", async () => {
    const before = await paneOrder();
    const boxes = await paneBoxes();

    // Release deep inside another pane's body. Pointer capture is gone by now
    // because the reorder re-inserted the pane, so this only works if the drag
    // is tracked on the window.
    await dragPane(
      { x: boxes[0].left + 5, y: boxes[0].top + 3 },
      [{ x: boxes[1].midX, y: boxes[1].midY }, { x: boxes[2].midX, y: boxes[2].midY }]
    );

    expect(await paneOrder()).not.toEqual(before);
    expect(await dragState()).toEqual({ lifted: 0, dragging: 0, bodyFlag: false, preview: null });
  });

  test("the arrangement survives a reload", async () => {
    const expected = await paneOrder();

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect(page.locator(".terminal-pane")).toHaveCount(expected.length);
    await page.waitForTimeout(800);

    expect(await paneOrder()).toEqual(expected);
  });

  test("dragging a pane onto a bottom page tab moves it and persists the assignment", async () => {
    const before = await paneOrder();
    const sourcePage = await page.evaluate(() => state.activePageId);
    const targetPage = await page.evaluate(() => addPage({ name: "Drop target", activate: false }));
    const boxes = await paneBoxes();
    const tabBox = await page.locator(`.pager-chip[data-page-id="${targetPage}"]`).boundingBox();

    await page.mouse.move(boxes[0].left + 5, boxes[0].top + 3);
    await page.mouse.down();
    // Cross a neighbour first: tab-drop must undo this incidental live reorder.
    await page.mouse.move(boxes[1].midX + 25, boxes[1].top + 3, { steps: 8 });
    await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2, { steps: 12 });
    await expect(page.locator(`.pager-chip[data-page-id="${targetPage}"]`)).toHaveClass(/is-pane-page-drop-target/);
    await page.mouse.up();
    await page.waitForTimeout(250);

    const result = await page.evaluate(({ terminalId, targetPage }) => ({
      activePageId: state.activePageId,
      mappedPageId: JSON.parse(localStorage.getItem("multiterm.terminalPages"))[terminalId],
      pageId: state.terminals.get(terminalId).pageId,
      targetCount: terminalsOnPage(targetPage).length
    }), { terminalId: before[0], targetPage });
    expect(result).toEqual({
      activePageId: sourcePage,
      mappedPageId: targetPage,
      pageId: targetPage,
      targetCount: 1
    });
    expect(await paneOrder()).toEqual(before);
    expect(await dragState()).toEqual({ lifted: 0, dragging: 0, bodyFlag: false, preview: null });
    await expect(page.locator(".pager-chip.is-pane-page-drop-target")).toHaveCount(0);

    await page.evaluate(({ terminalId, sourcePage, targetPage }) => {
      moveTerminalToPage(terminalId, sourcePage);
      removePage(targetPage);
    }, { terminalId: before[0], sourcePage, targetPage });
  });

  test("dragging onto a vertical page tab uses the same move contract", async () => {
    await page.evaluate(() => setPagerPlacement("left"));
    const terminalId = (await paneOrder())[0];
    const sourcePage = await page.evaluate(() => state.activePageId);
    const targetPage = await page.evaluate(() => addPage({ name: "Vertical target", activate: false }));
    const paneBox = await page.locator(`.terminal-pane[data-id="${terminalId}"] .pane-bar`).boundingBox();
    const tabBox = await page.locator(`.pager-chip[data-page-id="${targetPage}"]`).boundingBox();

    await dragPane(
      { x: paneBox.x + 35, y: paneBox.y + 10 },
      [{ x: tabBox.x + tabBox.width / 2, y: tabBox.y + tabBox.height / 2 }]
    );

    expect(await page.evaluate((id) => state.terminals.get(id).pageId, terminalId)).toBe(targetPage);
    await expect(page.locator(`.pager-chip[data-page-id="${targetPage}"] .pager-count`)).toHaveText("1");
    await expect(page.locator(".pager-chip.is-pane-page-drop-target")).toHaveCount(0);

    await page.evaluate(({ terminalId, sourcePage, targetPage }) => {
      moveTerminalToPage(terminalId, sourcePage);
      removePage(targetPage);
      setPagerPlacement("bottom");
    }, { terminalId, sourcePage, targetPage });
  });

  test("dragging to the host edge still snaps instead of rearranging", async () => {
    await setLayout("auto");
    await page.waitForTimeout(600);

    const before = await paneOrder();
    const boxes = await paneBoxes();
    const host = await page.evaluate(() => {
      const rect = document.querySelector("#terminalHost").getBoundingClientRect();
      return { right: Math.round(rect.right) - 8, midY: Math.round(rect.top + rect.height / 2) };
    });

    await page.mouse.move(boxes[0].left + 5, boxes[0].top + 3);
    await page.mouse.down();
    await page.mouse.move(boxes[0].midX + 60, host.midY, { steps: 8 });
    await page.waitForTimeout(120);
    await page.mouse.move(host.right, host.midY, { steps: 8 });
    await page.waitForTimeout(180);

    await expect(page.locator("#snapPreview")).toHaveAttribute("data-edge", "right");

    await page.mouse.up();
    await page.waitForTimeout(500);

    await expect(page.locator("#terminalHost")).toHaveAttribute("data-snap-edge", "right");
    await expect(page.locator(".terminal-pane.is-snapped")).toHaveCount(1);
    // Snapping wins over rearranging, so the order is left alone.
    expect(await paneOrder()).toEqual(before);
  });

  test("manual layout keeps free positioning instead of rearranging", async () => {
    await setLayout("manual");
    await page.waitForTimeout(700);

    const before = await paneOrder();
    const boxes = await paneBoxes();

    await dragPane(
      { x: boxes[0].left + 5, y: boxes[0].top + 3 },
      [{ x: boxes[0].left + 205, y: boxes[0].top + 163 }]
    );

    expect(await paneOrder()).toEqual(before);
    expect(await dragState()).toEqual({ lifted: 0, dragging: 0, bodyFlag: false, preview: null });

    await setLayout("auto");
    await page.waitForTimeout(600);
    await expect(page.locator(".pane-resize-handle:visible")).toHaveCount(0);
  });

  test("manual layout resizes and persists from every edge and corner", async () => {
    await setLayout("manual");
    await page.waitForTimeout(500);
    const terminalId = await page.locator(".terminal-pane").last().getAttribute("data-id");
    const pane = page.locator(`.terminal-pane[data-id="${terminalId}"]`);
    const base = { x: 300, y: 220, w: 420, h: 280 };
    const cases = [
      { direction: "n", dx: 0, dy: -50, expected: { x: 300, y: 170, w: 420, h: 330 } },
      { direction: "nw", dx: -70, dy: -50, expected: { x: 230, y: 170, w: 490, h: 330 } },
      { direction: "ne", dx: 70, dy: -50, expected: { x: 300, y: 170, w: 490, h: 330 } },
      { direction: "e", dx: 70, dy: 0, expected: { x: 300, y: 220, w: 490, h: 280 } },
      { direction: "se", dx: 70, dy: 50, expected: { x: 300, y: 220, w: 490, h: 330 } },
      { direction: "s", dx: 0, dy: 50, expected: { x: 300, y: 220, w: 420, h: 330 } },
      { direction: "sw", dx: -70, dy: 50, expected: { x: 230, y: 220, w: 490, h: 330 } },
      { direction: "w", dx: -70, dy: 0, expected: { x: 230, y: 220, w: 490, h: 280 } },
      { direction: "nw", dx: 400, dy: 300, expected: { x: 460, y: 320, w: 260, h: 180 } }
    ];

    await expect(pane.locator(".pane-resize-handle")).toHaveCount(8);
    for (const resizeCase of cases) {
      await page.evaluate(({ id, layout }) => {
        elements.host.scrollTo(0, 0);
        state.manualLayouts[id] = { ...layout };
        applyManualLayout(state.terminals.get(id), state.manualLayouts[id]);
      }, { id: terminalId, layout: base });
      await page.waitForTimeout(100);

      const handle = pane.locator(`.pane-resize-handle[data-resize="${resizeCase.direction}"]`);
      const hitTarget = await handle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return { className: target?.className || "", resize: target?.dataset?.resize || null };
      });
      expect(hitTarget).toEqual({ className: "pane-resize-handle", resize: resizeCase.direction });
      await handle.hover();
      const box = await handle.boundingBox();
      await page.mouse.down();
      await expect(pane).toHaveClass(/is-resizing/);
      await page.mouse.move(
        box.x + box.width / 2 + resizeCase.dx,
        box.y + box.height / 2 + resizeCase.dy,
        { steps: 8 }
      );
      await expect.poll(() => page.evaluate((id) => ({ ...state.manualLayouts[id] }), terminalId))
        .toEqual(resizeCase.expected);
      await page.mouse.up();
      await page.waitForTimeout(180);

      const result = await page.evaluate((id) => ({
        bodyResizing: document.body.classList.contains("is-pane-resizing"),
        layout: { ...state.manualLayouts[id] },
        paneResizing: state.terminals.get(id).pane.classList.contains("is-resizing"),
        stored: JSON.parse(localStorage.getItem("multiterm.manualLayouts"))[id]
      }), terminalId);
      expect(result.layout).toEqual(resizeCase.expected);
      expect(result.stored).toEqual(resizeCase.expected);
      expect(result.bodyResizing).toBe(false);
      expect(result.paneResizing).toBe(false);
    }

    await setLayout("auto");
    await page.waitForTimeout(600);
  });

  test("manual drag and resize stay pointer-accurate at workspace zoom", async () => {
    await setLayout("manual");
    await page.evaluate(() => setWorkspaceZoom(80));
    await page.waitForTimeout(400);
    const terminalId = await page.locator(".terminal-pane").last().getAttribute("data-id");
    const pane = page.locator(`.terminal-pane[data-id="${terminalId}"]`);

    await page.evaluate((id) => {
      state.manualLayouts[id] = { x: 100, y: 100, w: 420, h: 280 };
      applyManualLayout(state.terminals.get(id), state.manualLayouts[id]);
      const bar = state.terminals.get(id).pane.querySelector(".pane-bar");
      bar.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, button: 0, clientX: 100, clientY: 100, pointerId: 91
      }));
      window.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, button: 0, clientX: 180, clientY: 140, pointerId: 91
      }));
      window.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, button: 0, clientX: 180, clientY: 140, pointerId: 91
      }));
    }, terminalId);
    await expect.poll(() => page.evaluate((id) => ({ ...state.manualLayouts[id] }), terminalId)).toEqual({
      x: 200,
      y: 150,
      w: 420,
      h: 280
    });

    await page.evaluate((id) => {
      const handle = state.terminals.get(id).pane.querySelector('[data-resize="e"]');
      handle.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, button: 0, clientX: 200, clientY: 200, pointerId: 92
      }));
      window.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, button: 0, clientX: 280, clientY: 200, pointerId: 92
      }));
      window.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, button: 0, clientX: 280, clientY: 200, pointerId: 92
      }));
    }, terminalId);
    await expect.poll(() => page.evaluate((id) => ({ ...state.manualLayouts[id] }), terminalId)).toEqual({
      x: 200,
      y: 150,
      w: 520,
      h: 280
    });

    await page.evaluate(() => setWorkspaceZoom(100));
    await setLayout("auto");
    await page.waitForTimeout(400);
  });

  test("the pid pill only brightens on direct hover", async () => {
    const pill = page.locator(".terminal-pane .pane-status").first();
    const opacity = () => pill.evaluate((el) => getComputedStyle(el).opacity);

    await page.mouse.move(5, 5);
    await page.waitForTimeout(250);
    const resting = await opacity();
    expect(Number(resting)).toBeLessThan(0.4);

    // Focusing the pane must not change it.
    await page.locator(".terminal-pane .terminal-screen").first().click();
    await page.waitForTimeout(250);
    expect(await opacity()).toBe(resting);

    await pill.hover();
    await page.waitForTimeout(300);
    expect(Number(await opacity())).toBeGreaterThan(0.9);

    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
    expect(await opacity()).toBe(resting);
  });
});
