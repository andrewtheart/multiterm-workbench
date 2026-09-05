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

// Pages are live containers, not saved snapshots: switching pages hides panes
// but keeps their sessions running. These tests pin down that guarantee, the
// pager UI, what happens to terminals when a page is closed, that the split
// survives a reload, and the Alt+Q quick switcher's key assignment and jumping.

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

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
    await startRendererCoverage(page);
    page.on("pageerror", (err) => errors.push(String(err.stack || err.message || err)));
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });

  test.afterAll(async () => {
    // The bridge is shared with every other spec, and the next one expects to
    // start from an empty one, so drain it rather than just closing the page.
    await page.evaluate(() => closeAllTerminals());
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(0);
    await stopRendererCoverage(page, "pages");
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
      state.settings.pageCloseAction = "ask";
      state.settings.pagerCollapsed = false;
      state.settings.pagerPlacement = "bottom";
      savePages();
      saveTerminalPages();
      saveSettings();
      applyPagerPlacement();
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

  // A live shell repaints over synthetic text written straight into its pane
  // (PSReadLine redraws the prompt region), so a search test that seeds a marker
  // has to confirm the marker actually stuck before it searches for it.
  async function seedMarker(terminalId, marker) {
    await expect
      .poll(async () => page.evaluate(async ({ id, text }) => {
        const terminal = state.terminals.get(id);
        const buffer = terminal.term.buffer.active;
        for (let row = 0; row < buffer.length; row += 1) {
          if ((buffer.getLine(row)?.translateToString(true) || "").includes(text)) return true;
        }
        await new Promise((resolve) => terminal.term.write(`${text}\r\n`, resolve));
        return false;
      }, { id: terminalId, text: marker }), { timeout: 15000 })
      .toBe(true);
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

    await page.evaluate(() => minimizeTerminal([...state.terminals.keys()][0]));
    await expect(chips.nth(0).locator(".pager-parked")).toBeVisible();
    expect(await chips.nth(0).evaluate((tab) => {
      const editControl = tab.querySelector(".pager-edit");
      return editControl.previousElementSibling === tab.querySelector(".pager-parked")
        && editControl.nextElementSibling === tab.querySelector(".pager-close");
    })).toBe(true);

    const edit = chips.nth(1).locator(".pager-edit");
    await expect(edit).toBeVisible();
    await expect(edit).toHaveAttribute("role", "button");
    await expect(edit).toHaveAttribute("aria-label", "Rename Builds");
    expect(await chips.nth(1).evaluate((tab) => (
      tab.querySelector(".pager-close").previousElementSibling === tab.querySelector(".pager-edit")
    ))).toBe(true);

    await edit.click();
    await expect(chips.nth(0)).toHaveClass(/is-active/);
    await expect(chips.nth(1)).not.toHaveClass(/is-active/);
    const rename = chips.nth(1).locator(".pager-rename");
    await expect(rename).toBeFocused();
    await rename.fill("Release builds");
    await rename.press("Enter");
    await expect(chips.nth(1).locator(".pager-name")).toHaveText("Release builds");
    await expect.poll(() => page.evaluate(() => pageName("page-2"))).toBe("Release builds");

    await page.evaluate(() => setPagerPlacement("left"));
    await expect(chips.nth(1).locator(".pager-edit")).toBeVisible();
    expect(await chips.nth(1).evaluate((tab) => {
      const name = tab.querySelector(".pager-name").getBoundingClientRect();
      const editBox = tab.querySelector(".pager-edit").getBoundingClientRect();
      return editBox.left >= name.right;
    })).toBe(true);
  });

  test("contains long horizontal page lists and scrolls them without visible chrome", async () => {
    await reset(0);
    try {
      await page.setViewportSize({ width: 900, height: 700 });
      await page.evaluate(() => {
        setPagerPlacement("bottom");
        let newest = state.activePageId;
        for (let index = 2; index <= 30; index += 1) {
          newest = addPage({ name: `Long page ${index}`, activate: false });
        }
        setActivePage(newest, { focus: false });
      });

      await expect(page.locator(".pager-chip")).toHaveCount(30);
      await expect.poll(() => page.evaluate(() => {
        const active = elements.pagerList.querySelector(".pager-chip.is-active").getBoundingClientRect();
        const list = elements.pagerList.getBoundingClientRect();
        return active.left >= list.left && active.right <= list.right + 1;
      })).toBe(true);

      const geometry = await page.evaluate(() => {
        const listStyle = getComputedStyle(elements.pagerList);
        const webkitScrollbar = getComputedStyle(elements.pagerList, "::-webkit-scrollbar");
        return {
          appWidth: elements.appShell.getBoundingClientRect().width,
          bodyWidth: document.body.getBoundingClientRect().width,
          clientWidth: elements.pagerList.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          overflowX: listStyle.overflowX,
          scrollWidth: elements.pagerList.scrollWidth,
          scrollbarDisplay: webkitScrollbar.display,
          scrollbarWidth: listStyle.scrollbarWidth,
          viewportWidth: innerWidth
        };
      });
      expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
      expect(geometry.overflowX).toBe("auto");
      expect(geometry.scrollbarWidth).toBe("none");
      expect(geometry.scrollbarDisplay).toBe("none");
      expect(geometry.appWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);

      const verticalWheel = await page.evaluate(() => {
        elements.pagerList.scrollLeft = 0;
        elements.pagerList.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 180 }));
        return elements.pagerList.scrollLeft;
      });
      expect(verticalWheel).toBeGreaterThan(0);

      const horizontalWheel = await page.evaluate(() => {
        elements.pagerList.scrollLeft = 0;
        elements.pagerList.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 140 }));
        return elements.pagerList.scrollLeft;
      });
      expect(horizontalWheel).toBeGreaterThan(0);
    } finally {
      await page.setViewportSize({ width: 1400, height: 900 });
    }
  });

  test("opens a new page with quick key 1 and shows close controls on proper tabs", async () => {
    await reset(1);
    await page.evaluate(() => elements.pagerList.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 420,
      clientY: 700
    })));

    const menuRows = page.locator("#contextMenu .ctx-item");
    await expect(menuRows.first()).toContainText("Open new page");
    await expect(menuRows.first()).toHaveAttribute("data-accel-num", "1");
    await expect(menuRows.first().locator(".ctx-accel-num")).toHaveAttribute("data-num", "1");
    await page.keyboard.press("1");

    const tabs = page.locator(".pager-chip");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.locator(".pager-close")).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      const tab = tabs.nth(index);
      const close = tab.locator(".pager-close");
      await expect(tab).toHaveAttribute("role", "tab");
      await expect(close).toBeVisible();
      await expect(close).toHaveText("\u00d7");
      await expect(close).toHaveAttribute("aria-disabled", "false");
      const positions = await tab.evaluate((element) => {
        const name = element.querySelector(".pager-name").getBoundingClientRect();
        const closeBox = element.querySelector(".pager-close").getBoundingClientRect();
        const style = getComputedStyle(element);
        return { closeLeft: closeBox.left, nameRight: name.right, radius: style.borderRadius };
      });

      expect(positions.closeLeft).toBeGreaterThanOrEqual(positions.nameRight);
      expect(positions.radius).not.toContain("999px");
    }

    await tabs.last().locator(".pager-close").click();
    await expect(tabs).toHaveCount(1);
    const lastClose = tabs.first().locator(".pager-close");
    await expect(lastClose).toBeVisible();
    await expect(lastClose).toHaveAttribute("aria-disabled", "true");
    await lastClose.click({ force: true });
    await expect(tabs).toHaveCount(1);

    await page.evaluate(() => setPagerPlacement("left"));
    const pagerBox = await page.locator("#pager").boundingBox();
    await page.mouse.click(pagerBox.x + pagerBox.width / 2, pagerBox.y + pagerBox.height / 2, { button: "right" });
    await expect(menuRows.first()).toContainText("Open new page");
    await expect(menuRows.first()).toHaveAttribute("data-accel-num", "1");
    await expect(tabs.first().locator(".pager-close")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("offers Close page and Close all and remembers how populated pages close", async () => {
    await reset(2);
    const doomed = await page.evaluate(() => {
      const id = addPage({ name: "Doomed", activate: false });
      moveTerminalToPage([...state.terminals.keys()][0], id);
      return id;
    });
    const doomedTab = page.locator(`.pager-chip[data-page-id="${doomed}"]`);
    await doomedTab.click({ button: "right" });

    const items = page.locator("#contextMenu .ctx-item");
    // The creative and destructive rows each keep a generous gap above them so
    // neither is a misclick away from renaming or regrouping.
    const rows = await items.evaluateAll((all) => all.map((row) => {
      const rect = row.getBoundingClientRect();
      return { text: row.textContent.trim(), top: rect.top, bottom: rect.bottom };
    }));
    const gapAbove = (label) => {
      const index = rows.findIndex((row) => row.text.startsWith(label));
      return rows[index].top - rows[index - 1].bottom;
    };
    expect(gapAbove("New page")).toBeGreaterThanOrEqual(28);
    expect(gapAbove("Close page")).toBeGreaterThanOrEqual(28);
    await expect(items).toContainText(["Rename…", "Add to group", "New page", "Close page", "Close other pages", "Close all"]);
    await expect(items.filter({ hasText: "Close Doomed" })).toHaveCount(0);
    await items.filter({ hasText: "Close page" }).click();
    await expect(page.locator("#pageCloseOverlay")).toBeVisible();
    await expect(page.locator("#pageCloseText")).toContainText("Doomed");
    await page.locator("#pageCloseRemember").check();
    await page.locator("#pageCloseMove").click();

    await expect(doomedTab).toHaveCount(0);
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await expect(page.locator("#pageCloseAction")).toHaveValue("move");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings")).pageCloseAction)).toBe("move");

    const closeTarget = await page.evaluate(() => {
      const id = addPage({ name: "Close terminals", activate: false });
      moveTerminalToPage([...state.terminals.keys()][0], id);
      state.settings.pageCloseAction = "close";
      elements.pageCloseAction.value = "close";
      saveSettings();
      renderPager();
      return id;
    });
    await page.locator(`.pager-chip[data-page-id="${closeTarget}"]`).click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Close page" }).click();
    await expect(page.locator("#pageCloseOverlay")).toBeHidden();
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
  });

  test("Close all is always available and resets to one empty Page 1", async () => {
    await reset(2);
    await page.evaluate(() => addPage({ name: "Second", activate: false }));
    await page.locator(".pager-chip").first().click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Close all" }).click();
    await expect(page.locator("#pageCloseOverlay")).toBeVisible();
    await page.locator("#pageCloseTerminals").click();

    await expect(page.locator(".terminal-pane")).toHaveCount(0);
    await expect(page.locator(".pager-chip")).toHaveCount(1);
    await expect(page.locator(".pager-name")).toHaveText("Page 1");

    await page.locator(".pager-chip").click({ button: "right" });
    await expect(page.locator("#contextMenu .ctx-item", { hasText: "Close all" })).toBeVisible();
    await expect(page.locator("#contextMenu .ctx-item", { hasText: "Close page" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("Close other pages keeps the right-clicked page and relocates the rest", async () => {
    await reset(2);
    // Three pages, and the page that survives is deliberately not the active one.
    const [keeper, other] = await page.evaluate(() => {
      const ids = [addPage({ name: "Keeper", activate: false }), addPage({ name: "Other", activate: false })];
      moveTerminalToPage([...state.terminals.keys()][0], ids[1]);
      return ids;
    });

    await page.locator(`.pager-chip[data-page-id="${keeper}"]`).click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Close other pages" }).click();

    await expect(page.locator("#pageCloseOverlay")).toBeVisible();
    await expect(page.locator("#pageCloseTitle")).toHaveText("Close other pages?");
    await expect(page.locator("#pageCloseText")).toContainText("Keeper");
    await page.locator("#pageCloseMove").click();

    // Only the right-clicked page survives, it becomes active, and no session is killed.
    await expect(page.locator(".pager-chip")).toHaveCount(1);
    await expect(page.locator(".pager-name")).toHaveText("Keeper");
    await expect(page.locator(`.pager-chip[data-page-id="${other}"]`)).toHaveCount(0);
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    expect(await perPage()).toEqual(["Keeper=2"]);
    expect(await page.evaluate(() => state.activePageId)).toBe(keeper);

    // A single remaining page has no others to close.
    await page.locator(".pager-chip").click({ button: "right" });
    await expect(page.locator("#contextMenu .ctx-item", { hasText: "Close other pages" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("Ctrl+T and Ctrl+P both create pages without opening browser commands", async () => {
    await reset(0);
    await page.keyboard.press("Control+T");
    await expect(page.locator(".pager-chip")).toHaveCount(2);
    await expect(page.locator(".terminal-pane")).toHaveCount(0);
    await page.keyboard.press("Control+P");
    await expect(page.locator(".pager-chip")).toHaveCount(3);
    await expect(page.locator(".pager-chip").last().locator(".pager-name")).toHaveText("Page 3");
    await expect(page.locator(".terminal-pane")).toHaveCount(0);
  });

  test("moves the pager around the workbench and collapses vertical panels", async () => {
    await reset(2);
    await page.evaluate(() => {
      state.settings.sidecarHidden = false;
      setPagerPlacement("bottom");
      elements.pager.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 400,
        clientY: 700
      }));
    });

    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".ctx-item")).toContainText([
      "Open new page",
      "Move pages to top",
      "Move pages to bottom",
      "Move pages to left",
      "Move pages to right"
    ]);
    await page.keyboard.press("Escape");

    const geometry = async (placement) => {
      await page.evaluate((value) => setPagerPlacement(value), placement);
      return page.evaluate(() => {
        const box = (element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
        };
        return {
          parent: elements.pager.parentElement.className,
          pager: box(elements.pager),
          settings: box(elements.controlPanel),
          stage: box(elements.stage),
          workbench: box(elements.workbench),
          orientation: elements.pagerList.getAttribute("aria-orientation")
        };
      });
    };

    const top = await geometry("top");
    expect(top.parent).toBe("app-shell");
    expect(top.orientation).toBe("horizontal");
    expect(top.pager.bottom).toBeLessThanOrEqual(top.workbench.top + 1);
    expect(await page.evaluate(() => elements.pager.nextElementSibling === elements.workbench)).toBe(true);

    const bottom = await geometry("bottom");
    expect(bottom.parent).toBe("app-shell");
    expect(bottom.pager.top).toBeGreaterThanOrEqual(bottom.workbench.bottom - 1);

    const dockedSidecarPadding = await page.evaluate(() => {
      state.settings.sidecarHidden = true;
      applySettings();
      setPagerPlacement("top");
      const top = {
        paddingLeft: getComputedStyle(elements.pager).paddingLeft,
        tabInset: elements.pagerList.querySelector(".pager-chip").getBoundingClientRect().left
          - elements.pager.getBoundingClientRect().left
      };
      setPagerPlacement("bottom");
      const bottom = {
        paddingLeft: getComputedStyle(elements.pager).paddingLeft,
        tabInset: elements.pagerList.querySelector(".pager-chip").getBoundingClientRect().left
          - elements.pager.getBoundingClientRect().left
      };
      state.settings.sidecarHidden = false;
      applySettings();
      return { top, bottom };
    });
    expect(dockedSidecarPadding.top.paddingLeft).toBe("10px");
    expect(dockedSidecarPadding.top.tabInset).toBeLessThan(20);
    expect(dockedSidecarPadding.bottom.paddingLeft).toBe("10px");
    expect(dockedSidecarPadding.bottom.tabInset).toBeLessThan(20);

    const left = await geometry("left");
    expect(left.parent).toBe("workbench");
    expect(left.orientation).toBe("vertical");
    expect(Math.abs(left.settings.right - left.pager.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(left.pager.right - left.stage.left)).toBeLessThanOrEqual(1);
    expect(left.pager.width).toBe(230);

    const right = await geometry("right");
    expect(right.parent).toBe("workbench");
    expect(Math.abs(right.settings.right - right.stage.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(right.stage.right - right.pager.left)).toBeLessThanOrEqual(1);
    await expect(page.locator("#pagerPlacement")).toHaveValue("right");

    await page.locator("#pagerCollapse").click();
    await expect(page.locator("#pager")).toBeHidden();
    await expect(page.locator("#togglePager")).toBeVisible();
    await page.locator("#togglePager").click();
    await expect(page.locator("#pager")).toBeVisible();

    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-pager-placement", "right");
    await expect(page.locator("#pagerPlacement")).toHaveValue("right");
    await expect(page.locator("#pagerList")).toHaveAttribute("aria-orientation", "vertical");
    await expect(page.locator("#pager")).toBeVisible();

    await page.setViewportSize({ width: 900, height: 800 });
    const responsive = await page.evaluate(() => {
      setPagerPlacement("left");
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      return {
        pager: box(elements.pager),
        settings: box(elements.controlPanel),
        stage: box(elements.stage),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
      };
    });
    expect(responsive.pager.top).toBeGreaterThanOrEqual(responsive.settings.bottom - 1);
    expect(Math.abs(responsive.pager.right - responsive.stage.left)).toBeLessThanOrEqual(1);
    expect(responsive.scrollWidth).toBeLessThanOrEqual(responsive.viewportWidth);

    await page.setViewportSize({ width: 320, height: 700 });
    await page.locator("#pagerCollapse").click();
    const narrowRestore = await page.locator("#togglePager").boundingBox();
    expect(narrowRestore.x).toBeGreaterThanOrEqual(0);
    expect(narrowRestore.x + narrowRestore.width).toBeLessThanOrEqual(320);

    await page.evaluate(() => {
      state.settings.sidecarHidden = true;
      applySettings();
    });
    const combinedRestores = await page.evaluate(() => {
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      const sidecar = box(elements.toggleSidecar);
      const pager = box(elements.togglePager);
      const width = Math.max(0, Math.min(sidecar.right, pager.right) - Math.max(sidecar.left, pager.left));
      const height = Math.max(0, Math.min(sidecar.bottom, pager.bottom) - Math.max(sidecar.top, pager.top));
      return {
        bothInStatusBar: elements.toggleSidecar.closest(".status-bar") === elements.togglePager.closest(".status-bar"),
        overlap: width * height,
        pager,
        sidecar
      };
    });
    expect(combinedRestores.bothInStatusBar).toBe(true);
    expect(combinedRestores.overlap).toBe(0);
    expect(combinedRestores.sidecar.left).toBeGreaterThanOrEqual(0);
    expect(combinedRestores.pager.right).toBeLessThanOrEqual(320);

    await page.locator("#togglePager").click();
    await page.evaluate(() => {
      state.settings.sidecarHidden = false;
      applySettings();
    });

    await page.setViewportSize({ width: 1400, height: 900 });
    const overlap = await page.evaluate(() => {
      state.settings.sidecarHidden = true;
      applySettings();
      setPagerPlacement("left");
      const first = elements.toggleSidecar.getBoundingClientRect();
      const second = elements.pagerAdd.getBoundingClientRect();
      const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
      const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
      return width * height;
    });
    expect(overlap).toBe(0);
    await page.evaluate(() => {
      state.settings.sidecarHidden = false;
      applySettings();
    });
  });

  test("moves the whole page bar only from its deliberate drag grip", async () => {
    await reset(0);
    const handle = page.locator("#pagerMove");
    const targets = page.locator("#pagerDockTargets");
    const placement = () => page.getAttribute("body", "data-pager-placement");

    await expect(handle).toBeVisible();
    await expect(handle).toHaveAttribute("aria-label", "Move pages bar");
    await expect(handle.locator("svg")).toBeVisible();
    await handle.click();
    await expect(page.locator("#contextMenu")).toBeVisible();
    expect(await placement()).toBe("bottom");
    await page.keyboard.press("Escape");

    const handleCenter = async () => {
      const box = await handle.boundingBox();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const beginGripDrag = async () => {
      const start = await handleCenter();
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + 16, start.y + 16, { steps: 3 });
      await expect(targets).toBeVisible();
    };

    const start = await handleCenter();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 5, start.y + 5);
    await page.mouse.up();
    await expect(targets).toBeHidden();
    expect(await placement()).toBe("bottom");

    const list = await page.locator("#pagerList").boundingBox();
    await page.mouse.move(list.x + list.width - 8, list.y + list.height / 2);
    await page.mouse.down();
    await page.mouse.move(700, 30, { steps: 4 });
    await page.mouse.up();
    await expect(targets).toBeHidden();
    expect(await placement()).toBe("bottom");

    await page.evaluate(() => {
      addPage({ name: "Builds", activate: false });
      addPage({ name: "Logs", activate: false });
    });
    await page.locator(".pager-chip", { hasText: "Page 1" }).dragTo(
      page.locator(".pager-chip", { hasText: "Logs" })
    );
    await expect(targets).toBeHidden();
    expect(await placement()).toBe("bottom");

    await beginGripDrag();
    await page.mouse.move(700, 450, { steps: 4 });
    await page.mouse.up();
    await expect(targets).toBeHidden();
    expect(await placement()).toBe("bottom");

    await beginGripDrag();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(targets).toBeHidden();
    expect(await placement()).toBe("bottom");

    const placements = ["top", "bottom", "left", "right"];
    for (const source of placements) {
      for (const destination of placements.filter((candidate) => candidate !== source)) {
        await page.evaluate((value) => setPagerPlacement(value), source);
        await beginGripDrag();
        await expect(page.locator(`[data-pager-dock="${source}"]`)).toBeHidden();
        await expect(page.locator(".pager-dock-target:visible")).toHaveCount(3);
        const target = page.locator(`[data-pager-dock="${destination}"]`);
        const box = await target.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
        await expect(target).toHaveClass(/is-targeted/);
        await page.mouse.up();
        await expect(targets).toBeHidden();
        await expect(page.locator("body")).toHaveAttribute("data-pager-placement", destination);
        await expect.poll(() => page.evaluate(() => (
          JSON.parse(localStorage.getItem("multiterm.settings") || "{}").pagerPlacement
        ))).toBe(destination);
      }
    }
  });

  test("persists page placement changed from the Layout side panel", async () => {
    await reset(1);
    await page.locator("#settings-group-layout").click();
    const placementInput = page.locator("#pagerPlacement").locator("xpath=..").locator(".combobox-input");
    const placementCombo = page.locator("#pagerPlacement").locator("xpath=..");
    await expect(placementInput).toBeVisible();
    await expect(placementInput).toHaveValue("Bottom");
    await expect(placementCombo.locator(".combobox-selected-glyph")).toHaveAttribute("data-lucide", "panel-bottom");
    await placementInput.click();
    const optionIcons = await page.locator(".combobox-list:visible .combobox-option .combobox-option-icon")
      .evaluateAll((icons) => icons.map((icon) => icon.dataset.lucide));
    expect(optionIcons).toEqual([
      "panel-top",
      "panel-bottom",
      "panel-left",
      "panel-right"
    ]);
    await page.locator(".combobox-list:visible .combobox-option", { hasText: "Left" }).click();

    await expect(page.locator("body")).toHaveAttribute("data-pager-placement", "left");
    await expect(page.locator("#pagerPlacement")).toHaveValue("left");
    await expect(placementInput).toHaveValue("Left");
    await expect(placementCombo.locator(".combobox-selected-glyph")).toHaveAttribute("data-lucide", "panel-left");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings") || "{}").pagerPlacement)).toBe("left");

    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-pager-placement", "left");
    await expect(page.locator("#pagerPlacement")).toHaveValue("left");

    await page.evaluate(() => {
      setPagerPlacement("top");
    });
    await expect(page.locator("#pagerPlacement")).toHaveValue("top");
    await expect(page.locator("#pagerPlacement").locator("xpath=..").locator(".combobox-input")).toHaveValue("Top");
    await expect(page.locator("#pagerPlacement").locator("xpath=..").locator(".combobox-selected-glyph")).toHaveAttribute("data-lucide", "panel-top");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.settings") || "{}").pagerPlacement)).toBe("top");
  });

  test("melds a top page tab and page bar into the workbench", async () => {
    await reset(0);
    await page.evaluate(() => setPagerPlacement("top"));
    const seam = await page.evaluate(() => {
      const pager = elements.pager.getBoundingClientRect();
      const workbench = elements.workbench.getBoundingClientRect();
      const active = elements.pagerList.querySelector(".pager-chip.is-active");
      const pagerStyle = getComputedStyle(elements.pager);
      const activeStyle = getComputedStyle(active);
      return {
        gap: workbench.top - pager.bottom,
        pagerBorder: pagerStyle.borderBottomWidth,
        pagerPadding: pagerStyle.paddingBottom,
        tabBorder: activeStyle.borderBottomColor,
        tabMargin: activeStyle.marginBottom,
        tabRadius: activeStyle.borderRadius
      };
    });
    expect(Math.abs(seam.gap)).toBeLessThanOrEqual(1);
    expect(seam.pagerBorder).toBe("0px");
    expect(seam.pagerPadding).toBe("0px");
    expect(seam.tabMargin).toBe("-1px");
    expect(seam.tabRadius).toContain("0px");
  });

  test("docks the top-bar restore chevron after New page when pages are at the top", async () => {
    await reset(0);
    await page.evaluate(() => {
      state.settings.headerHidden = true;
      state.settings.pagerPlacement = "top";
      applySettings();
    });

    const dockedToggle = page.locator("#pager > #pagerAdd + #toggleHeader");
    await expect(dockedToggle).toBeVisible();
    await expect(dockedToggle).toHaveAttribute("title", "Expand top bar");
    const dockedBounds = await page.evaluate(() => {
      const add = elements.pagerAdd.getBoundingClientRect();
      const toggle = elements.toggleHeader.getBoundingClientRect();
      return { addRight: add.right, toggleLeft: toggle.left };
    });
    expect(dockedBounds.toggleLeft).toBeGreaterThanOrEqual(dockedBounds.addRight);

    await dockedToggle.click();
    await expect(page.locator("body")).not.toHaveClass(/header-hidden/);
    await expect(page.locator(".chrome-controls > #toggleHeader")).toBeHidden();

    await page.evaluate(() => {
      state.settings.headerHidden = true;
      state.settings.pagerPlacement = "bottom";
      applySettings();
    });
    await expect(page.locator(".chrome-controls > #toggleHeader")).toBeVisible();
    await page.locator("#toggleHeader").click();
  });

  test("reorders pages by dragging on the pager axis and persists the order", async () => {
    await reset(1);
    await page.evaluate(() => {
      addPage({ name: "Builds", activate: false });
      addPage({ name: "Logs", activate: false });
      setPagerPlacement("bottom");
    });

    const order = () => page.evaluate(() => state.pages.map((item) => item.name));
    await page.locator(".pager-chip", { hasText: "Builds" }).focus();
    await page.keyboard.press("Control+Shift+ArrowLeft");
    await expect.poll(order).toEqual(["Builds", "Page 1", "Logs"]);
    await page.keyboard.press("Control+Shift+ArrowRight");
    await expect.poll(order).toEqual(["Page 1", "Builds", "Logs"]);

    const cancelled = await page.evaluate(() => {
      const source = elements.pagerList.querySelector('[data-page-id="page-1"]');
      const target = [...elements.pagerList.querySelectorAll(".pager-chip")].find((chip) => chip.textContent.includes("Logs"));
      const transfer = new DataTransfer();
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
      moveDraggedPage(target, false);
      source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
      return {
        pages: state.pages.map((item) => item.name),
        chips: [...elements.pagerList.querySelectorAll(".pager-name")].map((item) => item.textContent)
      };
    });
    expect(cancelled.pages).toEqual(["Page 1", "Builds", "Logs"]);
    expect(cancelled.chips).toEqual(cancelled.pages);

    const logsBox = await page.locator(".pager-chip", { hasText: "Logs" }).boundingBox();
    await page.locator(".pager-chip", { hasText: "Page 1" }).dragTo(
      page.locator(".pager-chip", { hasText: "Logs" }),
      { targetPosition: { x: logsBox.width - 2, y: logsBox.height / 2 } }
    );
    await expect.poll(order).toEqual(["Builds", "Logs", "Page 1"]);

    await page.evaluate(() => setPagerPlacement("left"));
    await page.locator(".pager-chip", { hasText: "Page 1" }).dragTo(
      page.locator(".pager-chip", { hasText: "Builds" }),
      { targetPosition: { x: 20, y: 2 } }
    );
    await expect.poll(order).toEqual(["Page 1", "Builds", "Logs"]);

    await page.locator(".pager-chip", { hasText: "Logs" }).focus();
    await page.keyboard.press("Control+Shift+ArrowUp");
    await expect.poll(order).toEqual(["Page 1", "Logs", "Builds"]);
    await page.keyboard.press("Control+Shift+ArrowDown");
    await expect.poll(order).toEqual(["Page 1", "Builds", "Logs"]);

    await page.reload();
    await expect.poll(order).toEqual(["Page 1", "Builds", "Logs"]);
    await expect(page.locator("body")).toHaveAttribute("data-pager-placement", "left");
  });

  test("selects a range of page tabs with Shift and moves them into a group at once", async () => {
    await reset(1);
    const archive = await page.evaluate(() => {
      addPage({ name: "Builds", activate: false });
      addPage({ name: "Logs", activate: false });
      const id = addPage({ name: "Archive", activate: false });
      setPagerPlacement("bottom");
      createPageGroup("Bundle", [id]);
      return id;
    });

    await page.locator(".pager-chip", { hasText: "Page 1" }).click();
    await page.locator(".pager-chip", { hasText: "Logs" }).click({ modifiers: ["Shift"] });

    const selected = () => page.evaluate(() => [...document.querySelectorAll(".pager-chip.is-range-selected .pager-name")]
      .map((name) => name.textContent));
    await expect.poll(selected).toEqual(["Page 1", "Builds", "Logs"]);
    // Extending a range is a gathering gesture, so it must not navigate away.
    expect(await page.evaluate(() => pageById(state.activePageId).name)).toBe("Page 1");

    // Dragging any member carries the whole selection into the target's band.
    await page.locator(".pager-chip", { hasText: "Builds" }).dragTo(
      page.locator(".pager-chip", { hasText: "Archive" })
    );
    const grouped = await page.evaluate((id) => {
      const groupId = pageById(id).groupId;
      return state.pages.filter((item) => item.groupId === groupId).map((item) => item.name);
    }, archive);
    expect(grouped).toHaveLength(4);
    expect(grouped).toEqual(expect.arrayContaining(["Page 1", "Builds", "Logs", "Archive"]));

    // A plain click is the way out of a range.
    await page.locator(".pager-chip", { hasText: "Archive" }).click();
    await expect(page.locator(".pager-chip.is-range-selected")).toHaveCount(0);
  });

  // The hover rule carries the same weight as the range tint and is declared
  // later, so the chip that ends the Shift-click kept the plain hover colour and
  // only turned green once the pointer left it.
  test("tints the chip the pointer is still resting on after a Shift-click", async () => {
    await reset(1);
    await page.evaluate(() => {
      addPage({ name: "Builds", activate: false });
      addPage({ name: "Logs", activate: false });
      setPagerPlacement("bottom");
    });

    await page.locator(".pager-chip", { hasText: "Page 1" }).click();
    await page.locator(".pager-chip", { hasText: "Logs" }).click({ modifiers: ["Shift"] });
    await expect(page.locator(".pager-chip.is-range-selected")).toHaveCount(3);

    // The chip carries a background transition, so let it settle before reading.
    const tints = async () => {
      await page.waitForTimeout(400);
      return page.evaluate(() => [...document.querySelectorAll(".pager-chip.is-range-selected")]
        .map((chip) => ({
          name: chip.querySelector(".pager-name").textContent,
          hovered: chip.matches(":hover"),
          background: getComputedStyle(chip).backgroundColor
        })));
    };

    const hovering = await tints();
    const under = hovering.find((chip) => chip.hovered);
    expect(under, "the pointer must still be resting on the chip it just selected").toBeTruthy();
    const others = hovering.filter((chip) => !chip.hovered && !chip.name.includes("Page 1"));
    expect(others.length).toBeGreaterThan(0);
    for (const chip of others) {
      expect(under.background, `${under.name} matches the tint on ${chip.name}`).toBe(chip.background);
    }

    // And it does not change when the pointer finally leaves.
    await page.mouse.move(5, 5);
    const away = await tints();
    const moved = away.find((chip) => chip.name === under.name);
    expect(moved.hovered).toBe(false);
    expect(moved.background).toBe(under.background);
  });

  // Page 1, Builds and Logs on the bar; Archive alone in a group called Bundle.
  const buildGroupedPager = ({ collapsed = false } = {}) => page.evaluate((collapse) => {
    state.pageGroups = [];
    addPage({ name: "Builds", activate: false });
    addPage({ name: "Logs", activate: false });
    const archive = addPage({ name: "Archive", activate: false });
    setPagerPlacement("bottom");
    const groupId = createPageGroup("Bundle", [archive]);
    if (collapse) setPageGroupCollapsed(groupId, true);
    return groupId;
  }, collapsed);

  const namesInGroup = (groupId) => page.evaluate(
    (id) => state.pages.filter((item) => item.groupId === id).map((item) => item.name),
    groupId
  );

  const selectPagerRange = async (from, to, expected) => {
    await page.locator(".pager-chip", { hasText: from }).click();
    await page.locator(".pager-chip", { hasText: to }).click({ modifiers: ["Shift"] });
    await expect
      .poll(() => page.evaluate(() => [...document.querySelectorAll(".pager-chip.is-range-selected .pager-name")]
        .map((name) => name.textContent)))
      .toEqual(expected);
  };

  // Aiming at the group itself rather than at one of its tabs used to drop the
  // pages onto the bar, which took them out of every group instead.
  test("moves a selected range into a group dropped on the band itself", async () => {
    await reset(1);
    const bundle = await buildGroupedPager();

    await selectPagerRange("Page 1", "Logs", ["Page 1", "Builds", "Logs"]);
    await page.locator(".pager-chip", { hasText: "Builds" }).dragTo(
      page.locator(".pager-group-header", { hasText: "Bundle" })
    );
    await expect.poll(() => namesInGroup(bundle)).toEqual(["Page 1", "Builds", "Logs", "Archive"]);

    // The bar has to be usable straight after a drop: a drag that never settles
    // swallows the next click on a tab.
    await page.locator(".pager-chip", { hasText: "Archive" }).click();
    await expect.poll(() => page.evaluate(() => pageById(state.activePageId).name)).toBe("Archive");

    // The band reserves a lane for its colour control, so the padding around the
    // tabs is a drop target of its own.
    await page.evaluate((groupId) => {
      assignPagesToGroup(state.pages.filter((item) => item.groupId === groupId && item.name !== "Archive")
        .map((item) => item.id), null);
    }, bundle);
    await expect.poll(() => namesInGroup(bundle)).toEqual(["Archive"]);

    await selectPagerRange("Page 1", "Logs", ["Page 1", "Builds", "Logs"]);
    const band = page.locator(".pager-group");
    const box = await band.boundingBox();
    await page.locator(".pager-chip", { hasText: "Builds" }).dragTo(band, {
      targetPosition: { x: box.width - 4, y: box.height - 3 }
    });
    await expect.poll(() => namesInGroup(bundle)).toEqual(["Page 1", "Builds", "Logs", "Archive"]);

    // Dropping the same tabs back on the band they already belong to changes
    // nothing, so the drop must not report the bar as reordered.
    await page.locator(".pager-chip", { hasText: "Builds" }).dragTo(
      page.locator(".pager-group-header", { hasText: "Bundle" })
    );
    await expect.poll(() => namesInGroup(bundle)).toEqual(["Page 1", "Builds", "Logs", "Archive"]);
    await page.locator(".pager-chip", { hasText: "Archive" }).click();
    await expect.poll(() => page.evaluate(() => pageById(state.activePageId).name)).toBe("Archive");
  });

  // A collapsed band has no tabs on screen to aim at, so its header is the only
  // target there is.
  test("moves a selected range into a collapsed group and reopens it", async () => {
    await reset(1);
    const bundle = await buildGroupedPager({ collapsed: true });
    await expect(page.locator(".pager-group .pager-chip")).toHaveCount(0);

    await selectPagerRange("Page 1", "Logs", ["Page 1", "Builds", "Logs"]);
    await page.locator(".pager-chip", { hasText: "Builds" }).dragTo(
      page.locator(".pager-group-header", { hasText: "Bundle" })
    );

    await expect.poll(() => namesInGroup(bundle)).toEqual(["Page 1", "Builds", "Logs", "Archive"]);
    // Landing in a collapsed group would otherwise hide the tabs just moved there.
    expect(await page.evaluate((id) => pageGroupById(id).collapsed, bundle)).toBe(false);
  });

  test("keeps a page drag working while an unrelated group is collapsed", async () => {
    await reset(1);
    const bundle = await buildGroupedPager();
    await page.evaluate(() => {
      const stash = addPage({ name: "Stash", activate: false });
      setPageGroupCollapsed(createPageGroup("Other", [stash]), true);
    });

    // A group's hidden member used to make the bar unreadable, so every drag
    // anywhere on it was discarded on the way back to state.
    const order = () => page.evaluate(() => state.pages.map((item) => item.name));
    await page.locator(".pager-chip", { hasText: "Logs" }).dragTo(
      page.locator(".pager-chip", { hasText: "Page 1" }),
      { targetPosition: { x: 6, y: 6 } }
    );
    await expect.poll(order).toEqual(["Logs", "Page 1", "Builds", "Archive", "Stash"]);

    await selectPagerRange("Logs", "Builds", ["Logs", "Page 1", "Builds"]);
    await page.locator(".pager-chip", { hasText: "Builds" }).dragTo(
      page.locator(".pager-chip", { hasText: "Archive" })
    );

    await expect.poll(() => namesInGroup(bundle)).toEqual(["Logs", "Page 1", "Builds", "Archive"]);
    // The hidden member has to survive a drag that never saw it on the bar.
    expect(await page.evaluate(() => {
      const other = state.pageGroups.find((group) => group.name === "Other");
      return state.pages.filter((item) => item.groupId === other.id).map((item) => item.name);
    })).toEqual(["Stash"]);
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

  // A maximized pane hides every sibling in the stage. Scoping that to the page
  // that owns it is what stops another page from looking empty while its
  // sessions are still running.
  test("a maximized pane only blanks its own page", async () => {
    await reset(4);
    const arrangement = await page.evaluate(() => {
      const ids = [...state.terminals.keys()];
      const second = addPage({ name: "Second", activate: false });
      moveTerminalToPage(ids[2], second);
      moveTerminalToPage(ids[3], second);
      setActivePage("page-1");
      toggleZoomPane(ids[0]);
      return { ids, second };
    });

    const visibleCount = () =>
      page.locator(".terminal-pane:not(.is-page-hidden)").evaluateAll(
        (panes) => panes.filter((pane) => getComputedStyle(pane).display !== "none").length
      );

    expect(await visibleCount()).toBe(1);

    await page.evaluate((pid) => setActivePage(pid), arrangement.second);
    expect(await visibleCount()).toBe(2);
    await expect(page.locator("#terminalHost")).not.toHaveClass(/has-zoom/);
    // The zoom is only suppressed while off-page, not forgotten.
    expect(await page.evaluate(() => state.zoomedId)).toBe(arrangement.ids[0]);

    await page.evaluate(() => setActivePage("page-1"));
    await expect(page.locator("#terminalHost")).toHaveClass(/has-zoom/);
    expect(await visibleCount()).toBe(1);

    await page.evaluate((id) => toggleZoomPane(id), arrangement.ids[0]);
    expect(await visibleCount()).toBe(2);
  });

  // A match on another page is only useful if you can actually see it, so the
  // search borrows those panes onto the current stage and badges them with the
  // page they belong to.
  test("borrows matching panes from other pages while a search is running", async () => {
    await reset(3);
    const arrangement = await page.evaluate(async () => {
      const ids = [...state.terminals.keys()];
      const second = addPage({ name: "Second", activate: false });
      moveTerminalToPage(ids[2], second);
      setActivePage("page-1");
      return { ids, second };
    });
    await seedMarker(arrangement.ids[0], "ZEBRAFISH here");
    await seedMarker(arrangement.ids[2], "ZEBRAFISH there");
    const pane = (id) => page.locator(`.terminal-pane[data-id="${id}"]`);
    const badge = pane(arrangement.ids[2]).locator(".pane-page-tag");

    await page.locator("#terminalSearchInput").fill("ZEBRAFISH");
    await expect(page.locator("#terminalHost")).toHaveClass(/is-search-gathering/);
    await expect(pane(arrangement.ids[0])).toBeVisible();
    await expect(pane(arrangement.ids[1])).toBeHidden();
    // Off-page, but pulled onto this stage and labelled with its own page.
    await expect(pane(arrangement.ids[2])).toBeVisible();
    await expect(badge).toBeVisible();
    await expect(badge.locator(".pane-page-tag-name")).toHaveText("Second");
    await expect(page.locator("#terminalSearchCount")).toContainText("2 pages");

    // Narrowing the scope sends the borrowed pane home and offers it back.
    await page.evaluate(() => setSearchAcrossPages(false));
    await expect(pane(arrangement.ids[2])).toBeHidden();
    await expect(page.locator("#terminalHost")).not.toHaveClass(/is-search-gathering/);
    await expect(badge).toBeHidden();
    await expect(page.locator("#findAllReveal .find-all-reveal-count")).toHaveText("1");
    await page.evaluate(() => setSearchAcrossPages(true));
    await expect(pane(arrangement.ids[2])).toBeVisible();

    // Clearing the search hands every borrowed pane back to its own page.
    await page.evaluate(() => clearTerminalSearch());
    await expect(pane(arrangement.ids[2])).toBeHidden();
    await expect(pane(arrangement.ids[1])).toBeVisible();
    await expect(badge).toBeHidden();
  });

  // Grouping spends a real AI request, so the bridge reply is stubbed here; the
  // behaviour under test is the review-then-apply contract, not the model.
  test("previews a Copilot page grouping and only applies it on confirmation", async () => {
    await reset(3);
    const ids = await page.evaluate(() => [...state.terminals.keys()]);

    await page.evaluate((terminalIds) => {
      window.__groupFrames = [];
      const originalSend = state.socket.send.bind(state.socket);
      window.__restoreGroupBridge = () => { state.socket.send = originalSend; };
      state.socket.send = (raw) => {
        const frame = JSON.parse(raw);
        if (frame.type === "groupTerminalPages") {
          window.__groupFrames.push(frame);
          window.setTimeout(() => handleBridgeMessage({
            type: "terminalPageGroups",
            requestId: frame.requestId,
            groups: [
              { name: "Build work", terminals: [terminalIds[0], terminalIds[1]] },
              { name: "Docs", terminals: [terminalIds[2]] }
            ]
          }), 10);
          return;
        }
        originalSend(raw);
      };
      state.aiProviders = [{
        id: "copilot",
        name: "GitHub Copilot",
        authenticated: true,
        cliInstalled: true,
        available: true,
        titleAvailable: true,
        interactiveAvailable: true,
        models: [{ id: "gpt-test", name: "GPT Test", efforts: [], maxContextTokens: 64000 }]
      }];
      updatePageGroupButton();
    }, ids);

    const flyout = page.locator("#pageGroupFlyout");
    const groupButton = page.locator("#pagerGroup");
    await expect(groupButton).toBeEnabled();

    // The catalog must name every live terminal exactly once.
    await groupButton.click();
    await expect(flyout).toBeVisible();
    await expect(page.locator(".page-group-item")).toHaveCount(2);
    await expect(page.locator("#pageGroupStatus")).toContainText("2 pages proposed");
    const catalog = await page.evaluate(() => JSON.parse(window.__groupFrames[0].terminals));
    expect(catalog.map((entry) => entry.id).sort()).toEqual([...ids].sort());
    expect(catalog.every((entry) => typeof entry.title === "string" && typeof entry.excerpt === "string")).toBe(true);

    // Cancel must not touch the pages.
    await page.locator("#pageGroupCancel").click();
    await expect(flyout).toBeHidden();
    expect(await perPage()).toEqual(["Page 1=3"]);

    await groupButton.click();
    await expect(page.locator(".page-group-item")).toHaveCount(2);
    await page.locator("#pageGroupApply").click();
    await expect(flyout).toBeHidden();
    expect(await perPage()).toEqual(["Build work=2", "Docs=1"]);
    await expect(page.locator(".pager-chip")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("multiterm.pages")).pages.map((p) => p.name)))
      .toEqual(["Build work", "Docs"]);

    // A proposal stops being valid once the set of open terminals changes.
    await groupButton.click();
    await expect(page.locator(".page-group-item")).toHaveCount(2);
    await page.evaluate((id) => removeTerminal(id), ids[2]);
    await expect(page.locator(".terminal-pane")).toHaveCount(2);
    await page.locator("#pageGroupApply").click();
    await expect(page.locator("#pageGroupStatus")).toContainText("terminals changed");
    await expect(flyout).toBeVisible();
    await page.locator("#pageGroupClose").click();
    await expect(flyout).toBeHidden();

    await page.evaluate(() => {
      window.__restoreGroupBridge();
      delete window.__restoreGroupBridge;
      delete window.__groupFrames;
    });
  });

  // The find-all bar floats over the stage. Left to sit on the pane header row
  // it swallows clicks on the badge that is the only way back to a borrowed
  // pane's own page — and the bar is exactly what produced that pane.
  test("keeps pane headers clear of the floating find-all bar", async () => {
    await reset(3);
    const arrangement = await page.evaluate(async () => {
      const ids = [...state.terminals.keys()];
      const second = addPage({ name: "Second", activate: false });
      moveTerminalToPage(ids[2], second);
      setActivePage("page-1");
      return { ids, second };
    });
    await seedMarker(arrangement.ids[2], "MARMOSET there");

    await page.evaluate(() => openFindAll());
    await expect(page.locator(".stage")).toHaveClass(/is-find-all-open/);
    await page.locator("#findAllInput").fill("MARMOSET");

    const badge = page.locator(`.terminal-pane[data-id="${arrangement.ids[2]}"] .pane-page-tag`);
    await expect(badge).toBeVisible();

    const headerUnderBar = await page.evaluate(() => {
      const bar = document.querySelector("#findAllBar").getBoundingClientRect();
      return [...document.querySelectorAll(".terminal-pane")]
        .filter((candidate) => candidate.getBoundingClientRect().width > 0)
        .some((candidate) => {
          const head = candidate.querySelector(".pane-bar").getBoundingClientRect();
          return head.top < bar.bottom && head.bottom > bar.top && head.left < bar.right && head.right > bar.left;
        });
    });
    expect(headerUnderBar).toBe(false);

    // Playwright's actionability check fails if anything covers the badge, so
    // this proves the click genuinely reaches it and not the bar above.
    await badge.click();
    await expect.poll(() => page.evaluate(() => state.activePageId)).toBe(arrangement.second);

    await page.evaluate(() => {
      setActivePage("page-1");
      closeFindAll();
    });
    await expect(page.locator(".stage")).not.toHaveClass(/is-find-all-open/);
    // The reserved space is given back, so the stage is not permanently short.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("#terminalHost")).paddingTop))
      .toBe(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--stage-pad").trim()));
  });

  // Right-clicking a selection must never hide the terminal it was made in,
  // even when that terminal is the only one without a second occurrence.
  test("searches every terminal for a selection and keeps the invoking pane", async () => {
    await reset(3);
    const ids = await page.evaluate(async () => {
      const keys = [...state.terminals.keys()];
      const second = addPage({ name: "Second", activate: false });
      moveTerminalToPage(keys[2], second);
      setActivePage("page-1");
      return keys;
    });
    await seedMarker(ids[1], "KESTREL nest");
    await seedMarker(ids[2], "KESTREL flight");
    const pane = (id) => page.locator(`.terminal-pane[data-id="${id}"]`);

    const started = await page.evaluate((tid) => {
      const terminal = state.terminals.get(tid);
      return searchAllTerminalsForSelection(terminal, "  KESTREL  \nignored second line");
    }, ids[0]);
    expect(started).toBe(true);

    await expect(page.locator("#terminalSearchInput")).toHaveValue("KESTREL");
    // Exempt: the pane the menu was opened from has no match of its own.
    await expect(pane(ids[0])).toBeVisible();
    await expect(pane(ids[1])).toBeVisible();
    await expect(pane(ids[2])).toBeVisible();
    await expect(pane(ids[2]).locator(".pane-page-tag")).toBeVisible();

    // Editing the query by hand drops the exemption.
    await page.locator("#terminalSearchInput").fill("KESTREL");
    await expect(pane(ids[0])).toBeHidden();
    await page.evaluate(() => clearTerminalSearch());
    await expect(pane(ids[0])).toBeVisible();
  });

  test("switching pages promotes a visible terminal to primary", async () => {
    await reset(2);
    const result = await page.evaluate(() => {
      const ids = [...state.terminals.keys()];
      const secondPage = addPage({ name: "Second", activate: false });
      moveTerminalToPage(ids[1], secondPage);
      setActivePage(secondPage);
      return {
        activeId: state.activeId,
        primaryId: state.primaryId,
        movedId: ids[1],
        visiblePrimaryId: document.querySelector(".terminal-pane.is-primary:not(.is-page-hidden)")?.dataset.id
      };
    });

    expect(result.activeId).toBe(result.movedId);
    expect(result.primaryId).toBe(result.movedId);
    expect(result.visiblePrimaryId).toBe(result.movedId);
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
    const renamedId = await page.evaluate((pid) => {
      const terminals = [...state.terminals.values()];
      terminals.slice(0, 3).forEach((terminal) => moveTerminalToPage(terminal.id, pid));
      terminals[0].titleInput.value = "Custom build terminal";
      terminals[0].titleInput.dispatchEvent(new Event("change", { bubbles: true }));
      renamePage(pid, "Release builds");
      return terminals[0].id;
    }, target);
    expect(await perPage()).toEqual(["Page 1=1", "Release builds=3"]);

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect
      .poll(() => page.evaluate(() => state.terminals.size), { timeout: 25000 })
      .toBe(4);
    await expect
      .poll(() => page.evaluate(() => state.pages.length), { timeout: 10000 })
      .toBe(2);

    await expect.poll(perPage, { timeout: 15000 }).toEqual(["Page 1=1", "Release builds=3"]);
    await expect(page.locator(".terminal-pane.is-page-hidden")).toHaveCount(3);
    expect(await page.evaluate((id) => state.terminals.get(id)?.titleInput.value, renamedId)).toBe("Custom build terminal");
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
