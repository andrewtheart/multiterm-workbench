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

// Page groups are a second level above pages: a named band of page tabs in the
// pager. These tests pin down that membership lives on the page, that a group
// always draws as one contiguous band, that collapsing can never hide the page
// you are on, and that explicitly empty drop-target groups remain available.

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

test.describe.configure({ mode: "serial" });

test.describe("Page groups", () => {
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
    // Storage is shared with every later spec file on this origin, so the bar has
    // to go back to a stock single page before this one finishes.
    await page.evaluate(() => {
      state.pageGroups = [];
      state.pages = [{ id: "page-1", name: "Page 1", groupId: null }];
      state.activePageId = "page-1";
      savePages();
      renderPager();
    });
    await page.evaluate(() => closeAllTerminals());
    await stopRendererCoverage(page, "page-groups");
    await context.close();
  });

  // Groups are pure renderer state, so every test can start from a known bar
  // without touching the shared bridge.
  test.beforeEach(async () => {
    await page.evaluate(() => {
      state.pageGroups = [];
      state.pages = [
        { id: "page-1", name: "Alpha", groupId: null },
        { id: "page-2", name: "Beta", groupId: null },
        { id: "page-3", name: "Gamma", groupId: null }
      ];
      state.activePageId = "page-1";
      savePages();
      renderPager();
    });
  });

  const groupIds = () => page.evaluate(() => state.pages.map((entry) => entry.groupId));

  test("collects pages into one named band and drops the group when it empties", async () => {
    await page.evaluate(() => createPageGroup("Release", ["page-1", "page-3"]));

    const band = page.locator(".pager-group");
    await expect(band).toHaveCount(1);
    await expect(band.locator(".pager-group-name")).toHaveText("Release");
    await expect(band.locator(".pager-chip")).toHaveCount(2);

    // Gamma was third; joining a group whose first member is Alpha has to pull
    // it up beside Alpha or the band could not be drawn in one piece.
    expect(await page.evaluate(() => state.pages.map((entry) => entry.name))).toEqual(["Alpha", "Gamma", "Beta"]);
    await expect(page.locator(".pager-list > .pager-chip")).toHaveCount(1);

    await page.evaluate(() => assignPagesToGroup(["page-1", "page-3"], null));
    await expect(page.locator(".pager-group")).toHaveCount(0);
    expect(await page.evaluate(() => state.pageGroups)).toEqual([]);
  });

  test("creates an empty drop-target group from blank space in every pager position", async () => {
    for (const placement of ["top", "bottom", "left", "right"]) {
      await page.evaluate((nextPlacement) => {
        state.settings.pagerPlacement = nextPlacement;
        applyPagerPlacement();
        elements.pagerList.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 40
        }));
      }, placement);
      await expect(page.getByRole("menuitem", { name: "Create new group", exact: true })).toBeVisible();
      await page.evaluate(() => hideContextMenu());
    }

    await page.evaluate(() => {
      state.settings.pagerPlacement = "top";
      applyPagerPlacement();
      elements.pagerList.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 40
      }));
    });
    await page.getByRole("menuitem", { name: "Create new group", exact: true }).click();
    const rename = page.locator(".pager-group-rename");
    await expect(rename).toBeVisible();
    await rename.fill("Drop zone");
    await rename.press("Enter");
    await expect(page.locator(".pager-group.is-empty .pager-group-empty")).toHaveText("Drop pages here");
    expect(await page.evaluate(() => state.pageGroups[0])).toMatchObject({ name: "Drop zone", keepEmpty: true });

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect(page.locator(".pager-group.is-empty .pager-group-empty")).toHaveText("Drop pages here");
    const groupId = await page.evaluate(() => state.pageGroups[0].id);

    await page.evaluate((targetGroupId) => {
      const source = document.querySelector('[data-page-id="page-2"]');
      const zone = document.querySelector(`[data-group-id="${CSS.escape(targetGroupId)}"] .pager-group-chips`);
      const sourceRect = source.getBoundingClientRect();
      const zoneRect = zone.getBoundingClientRect();
      const start = { x: sourceRect.right - 4, y: sourceRect.top + sourceRect.height / 2 };
      const end = { x: zoneRect.left + zoneRect.width / 2, y: zoneRect.top + zoneRect.height / 2 };
      const transfer = new DataTransfer();
      const dispatch = (target, type, point) => target.dispatchEvent(new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        dataTransfer: transfer
      }));

      dispatch(source, "dragstart", start);
      for (let step = 1; step <= 15; step += 1) {
        const point = {
          x: start.x + ((end.x - start.x) * step / 15),
          y: start.y + ((end.y - start.y) * step / 15)
        };
        dispatch(document.elementFromPoint(point.x, point.y), "dragover", point);
      }
      dispatch(document.elementFromPoint(end.x, end.y), "drop", end);
      dispatch(source, "dragend", end);
    }, groupId);
    expect(await page.evaluate(() => pageById("page-2").groupId)).toBe(groupId);

    const transfer = await page.evaluateHandle(() => new DataTransfer());
    const groupedBeta = page.locator('[data-page-id="page-2"]');
    await groupedBeta.dispatchEvent("dragstart", { dataTransfer: transfer });
    await page.locator("#pagerList").dispatchEvent("dragover", { dataTransfer: transfer });
    await page.locator("#pagerList").dispatchEvent("drop", { dataTransfer: transfer });
    await groupedBeta.dispatchEvent("dragend", { dataTransfer: transfer });
    expect(await page.evaluate(() => pageById("page-2").groupId)).toBeNull();
    await expect(page.locator(".pager-group.is-empty .pager-group-empty")).toHaveText("Drop pages here");

    await page.locator(".pager-group-header").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete group", exact: true }).click();
    await expect(page.locator(".pager-group")).toHaveCount(0);
  });

  test("opens a new page inside the empty group whose drop target was invoked", async () => {
    const groupId = await page.evaluate(() => createPageGroup("Destination", [], { keepEmpty: true }));
    const empty = page.locator(`[data-group-id="${groupId}"] .pager-group-empty`);
    const dropZone = page.locator(`[data-group-id="${groupId}"] .pager-group-chips`);
    await expect(empty).toHaveText("Drop pages here");

    await dropZone.click({ button: "right" });
    const open = page.getByRole("menuitem", { name: /^Open new page/ });
    await expect(open).toBeVisible();
    await open.click();

    const created = await page.evaluate((targetGroupId) => {
      const active = pageById(state.activePageId);
      return {
        activeId: active?.id,
        activeGroupId: active?.groupId,
        groupPages: pagesInGroup(targetGroupId).map((entry) => entry.id),
        persisted: JSON.parse(localStorage.getItem("multiterm.pages") || "{}")
      };
    }, groupId);
    expect(created.activeGroupId).toBe(groupId);
    expect(created.groupPages).toEqual([created.activeId]);
    expect(created.persisted.pages.find((entry) => entry.id === created.activeId)?.groupId).toBe(groupId);
    await expect(page.locator(`[data-group-id="${groupId}"] .pager-chip.is-active`)).toHaveCount(1);
    await expect(page.locator(`[data-group-id="${groupId}"] .pager-group-empty`)).toHaveCount(0);

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect(page.locator(`[data-group-id="${groupId}"] .pager-chip.is-active`)).toHaveCount(1);
    expect(await page.evaluate((targetGroupId) => pageById(state.activePageId)?.groupId === targetGroupId, groupId)).toBe(true);
  });

  test("hides every tab in a collapsed group while its active page stays open", async () => {
    const id = await page.evaluate(() => createPageGroup("Release", ["page-1", "page-2"]));
    await page.evaluate((groupId) => setPageGroupCollapsed(groupId, true), id);

    // page-1 is active, and collapsing tidies the bar rather than moving you.
    await expect(page.locator(".pager-group .pager-chip")).toHaveCount(0);
    await expect(page.locator(".pager-group-count"), "the badge counts every member").toHaveText("2");
    expect(await page.evaluate(() => state.activePageId), "the page itself stays open").toBe("page-1");
    // Collapsing tidies the bar; it must not move you to another page.
    await expect(page.locator(".pager-group")).toHaveClass(/is-collapsed/);

    await page.evaluate(() => setActivePage("page-3"));
    await expect(page.locator(".pager-group .pager-chip")).toHaveCount(0);
    await expect(page.locator(".pager-group-count")).toHaveText("2");

    // Collapsed membership must never be written back as the new page order.
    expect(await page.evaluate(() => state.pages.length)).toBe(3);

    await page.evaluate((groupId) => setPageGroupCollapsed(groupId, false), id);
    await expect(page.locator(".pager-group .pager-chip")).toHaveCount(2);
  });

  // A page opened from a tab belongs beside it, not at the far end of the bar.
  test("opens a new page inside the right-clicked tab's group", async () => {
    const id = await page.evaluate(() => createPageGroup("Release", ["page-1", "page-2"]));
    await page.locator(".pager-chip", { hasText: "Alpha" }).click({ button: "right" });
    await expect(page.locator("#contextMenu")).toBeVisible();
    await page.locator("#contextMenu .ctx-item").filter({ hasText: "New page" }).first().click();

    const placed = await page.evaluate((groupId) => {
      const created = state.pages.find((entry) => ![
        "page-1", "page-2", "page-3"
      ].includes(entry.id));
      return {
        groupId: created?.groupId,
        matchesBand: created?.groupId === groupId,
        index: state.pages.findIndex((entry) => entry.id === created?.id),
        alphaIndex: state.pages.findIndex((entry) => entry.id === "page-1"),
        active: state.activePageId === created?.id
      };
    }, id);
    expect(placed.matchesBand, "the new page joins the band it was opened from").toBe(true);
    expect(placed.index, "and lands directly after the tab it came from").toBe(placed.alphaIndex + 1);
    expect(placed.active).toBe(true);
    await expect(page.locator(".pager-group .pager-chip")).toHaveCount(3);
  });

  test("toggles a group from its header and renames it from the group menu", async () => {
    await page.evaluate(() => createPageGroup("Release", ["page-1", "page-2"]));
    const header = page.locator(".pager-group-header");

    await header.click();
    await expect(page.locator(".pager-group-header")).toHaveAttribute("aria-expanded", "false");
    await page.locator(".pager-group-header").click();
    await expect(page.locator(".pager-group-header")).toHaveAttribute("aria-expanded", "true");

    await page.locator(".pager-group-header").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename group\u2026", exact: true }).click();
    const input = page.locator(".pager-group-rename");
    await expect(input).toBeVisible();
    await input.fill("Shipping");
    await input.press("Enter");
    await expect(page.locator(".pager-group-name")).toHaveText("Shipping");
    expect(await page.evaluate(() => state.pageGroups[0].name)).toBe("Shipping");
  });

  test("colours a group from the same flyout a terminal header uses", async () => {
    await page.evaluate(() => createPageGroup("Release", ["page-1", "page-2"]));
    const control = page.locator(".pager-group-color");
    await expect(control).toHaveAttribute("aria-label", "Colour for Release");

    // The control belongs in the band's top-right corner, in every placement: a
    // side pager stacks the band into a column, which once pushed it to the foot.
    for (const placement of ["top", "left"]) {
      await page.evaluate((value) => setPagerPlacement(value), placement);
      const band = await page.locator(".pager-group").boundingBox();
      const corner = await control.boundingBox();
      expect(band.x + band.width - (corner.x + corner.width)).toBeLessThan(8);
      expect(corner.y - band.y).toBeLessThan(8);
    }

    // The header owns its own row in a column band, so the control is centred on
    // that row rather than riding the band's top edge.
    const headerRow = await page.locator(".pager-group-header").boundingBox();
    const centred = await control.boundingBox();
    expect(Math.abs((centred.y + centred.height / 2) - (headerRow.y + headerRow.height / 2))).toBeLessThan(1);

    // Only the header shares the corner in a column band, so the tabs below it
    // keep the band's full width rather than being inset by the control.
    const band = await page.locator(".pager-group").boundingBox();
    const chips = await page.locator(".pager-group-chips").boundingBox();
    expect(band.x + band.width - (chips.x + chips.width)).toBeLessThan(8);
    await page.evaluate(() => setPagerPlacement("top"));

    await control.click();
    const flyout = page.locator("#headerBackgroundFlyout");
    await expect(flyout).toBeVisible();
    // The flyout names its subject, so it is clear which thing is being coloured.
    await expect(flyout.locator("#headerBackgroundFlyoutSubtitle")).toHaveText("Release");
    await expect(page.locator("#headerBackgroundFlyoutReset")).toBeDisabled();

    await flyout.locator(".header-background-swatch").nth(2).click();
    await expect(page.locator(".pager-group")).toHaveClass(/has-color/);
    const stored = await page.evaluate(() => state.pageGroups[0].headerBackground);
    expect(stored).toMatchObject({ type: "linear" });
    expect(stored.stops.length).toBeGreaterThan(1);
    // A group colour belongs to the group, never to a terminal.
    expect(await page.evaluate(() => [...state.terminals.values()].some((entry) => entry.headerBackground))).toBe(false);

    await page.locator("#headerBackgroundFlyoutReset").click();
    expect(await page.evaluate(() => state.pageGroups[0].headerBackground)).toBeUndefined();
    await expect(page.locator(".pager-group")).not.toHaveClass(/has-color/);
    await page.keyboard.press("Escape");
  });

  test("opens the gradient editor for the group from More options", async () => {
    await page.evaluate(() => createPageGroup("Release", ["page-1", "page-2"]));
    await page.locator(".pager-group-color").click();
    await page.locator("#headerBackgroundFlyoutMore").click();

    const dialog = page.locator("#headerBackgroundOverlay");
    await expect(dialog).toBeVisible();
    await expect(page.locator("#headerBackgroundSubtitle")).toHaveText("Release");
    // One dialog serves terminals and groups, so it has to say which it is on.
    await expect(page.locator("#headerBackgroundTitle")).toHaveText("Page group appearance");
    await expect(page.locator("#headerBackgroundPreviewLabel")).toHaveText("Page group header");
    await expect(page.locator("#headerBackgroundClose"))
      .toHaveAttribute("aria-label", "Close page group appearance editor");
    // A group is not a terminal, so the preview must not wear a terminal glyph.
    expect(await page.evaluate(() => {
      const glyph = document.querySelector(".header-background-preview-title > svg");
      return glyph ? getComputedStyle(glyph).display : "absent";
    })).toBe("none");
    // A group has no body appearance, so that tab is withdrawn entirely.
    await expect(page.locator("#terminalAppearanceTabTerminal")).toBeHidden();
    await expect(page.locator("#terminalHeaderAppearancePanel")).toBeVisible();

    await page.evaluate(() => {
      headerBackgroundDraft.stops[0].color = "#123456";
      updateHeaderBackgroundPreview();
    });
    // Apply commits straight to the group rather than asking for a scope.
    await page.locator("#headerBackgroundApply").click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => state.pageGroups[0].headerBackground.stops[0].color)).toBe("#123456");
    await expect(page.locator(".pager-group")).toHaveClass(/has-color/);
    // The dialog must hand the body tab back for the next terminal that uses it.
    expect(await page.evaluate(() => elements.terminalAppearanceTabTerminal.hidden)).toBe(false);

    // ...and its labelling too, or every later terminal is titled as a group.
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0] || addTerminal({ reveal: true, runStartup: false });
      openTerminalAppearanceEditor(terminal);
    });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#headerBackgroundTitle")).toHaveText("Terminal appearance");
    await expect(page.locator("#headerBackgroundPreviewLabel")).toHaveText("Terminal header");
    expect(await page.evaluate(() => {
      const glyph = document.querySelector(".header-background-preview-title > svg");
      return glyph ? getComputedStyle(glyph).display : "absent";
    })).not.toBe("none");
    await page.locator("#headerBackgroundCancel").click();
    await expect(dialog).toBeHidden();
  });

  test("keeps a group colour across a reload", async () => {
    await page.evaluate(() => {
      const id = createPageGroup("Release", ["page-1", "page-2"]);
      setPageGroupHeaderBackground(id, headerBackgroundFromColor("#4F8A5B"));
    });
    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect(page.locator(".pager-group")).toHaveClass(/has-color/);
    expect(await page.evaluate(() => state.pageGroups[0].headerBackground.stops[0].color)).toBe("#4F8A5B");
  });

  // The band is the box around the label, so a neutral border made the colour
  // look like it belonged to the label alone rather than to the group.
  test("draws the group box in the colour its label carries", async () => {
    const measured = await page.evaluate(() => {
      // Earlier tests in this file leave their own coloured groups behind.
      state.pageGroups = [];
      state.pages.forEach((entry) => { entry.groupId = null; });
      const id = createPageGroup("Release", ["page-1", "page-2"]);
      setPageGroupHeaderBackground(id, headerBackgroundFromColor("#E248A8"));
      const band = document.querySelector(`.pager-group[data-group-id="${CSS.escape(id)}"]`);
      const header = band.querySelector(".pager-group-header");
      const swatch = document.createElement("span");
      swatch.style.color = "#E248A8";
      document.body.append(swatch);
      const expected = getComputedStyle(swatch).color;
      swatch.remove();
      const style = getComputedStyle(band);
      return {
        expected,
        // The active tab's own accent rule outranks a plain .has-color rule,
        // so the colour must win specifically while the group holds it.
        holdsActiveChip: Boolean(band.querySelector(".pager-chip.is-active")),
        borders: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
        headerImage: getComputedStyle(header).backgroundImage
      };
    });

    expect(measured.holdsActiveChip, "the group must contain the active tab").toBe(true);
    for (const border of measured.borders) {
      expect(border, "every edge of the band carries the group colour").toBe(measured.expected);
    }
    // The label still leads with the same colour, so box and label cannot drift.
    expect(measured.headerImage).toContain(measured.expected);
  });

  test("keeps the group's palette button legible on any header colour", async () => {
    const measured = await page.evaluate(() => {
      state.pageGroups = [];
      state.pages.forEach((entry) => { entry.groupId = null; });
      // Only a column band stretches the header under the button.
      setPagerPlacement("left");
      const id = createPageGroup("Release", ["page-1", "page-2"]);

      const toLinear = (channel) => {
        const ratio = channel / 255;
        return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
      };
      const luminance = ([red, green, blue]) => (
        0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue)
      );
      const channels = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number);
      const contrast = (first, second) => (
        (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
      );

      const read = (hex) => {
        setPageGroupHeaderBackground(id, headerBackgroundFromColor(hex));
        const band = document.querySelector(`.pager-group[data-group-id="${CSS.escape(id)}"]`);
        const button = band.querySelector(".pager-group-color");
        const header = band.querySelector(".pager-group-header");
        const ink = getComputedStyle(button).color;
        const box = button.getBoundingClientRect();
        const headerBox = header.getBoundingClientRect();
        const bandLuminance = luminance([1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)));
        return {
          ink,
          contrast: contrast(luminance(channels(ink)), bandLuminance),
          overHeader: box.left >= headerBox.left && box.right <= headerBox.right + 0.5
        };
      };

      const column = { bright: read("#FFB900"), dark: read("#101010"), saturated: read("#0000FF") };

      // In a row the button sits on the band surface instead, so a header-derived
      // ink would be wrong there. A bright header is the revealing case: it is the
      // one that would hand the button a dark ink against the dark band.
      setPageGroupHeaderBackground(id, headerBackgroundFromColor("#FFB900"));
      setPagerPlacement("top");
      const rowBand = document.querySelector(`.pager-group[data-group-id="${CSS.escape(id)}"]`);
      const rowButton = rowBand.querySelector(".pager-group-color");
      const rowHeaderBox = rowBand.querySelector(".pager-group-header").getBoundingClientRect();
      const rowBox = rowButton.getBoundingClientRect();
      const row = {
        ink: getComputedStyle(rowButton).color,
        overHeader: rowBox.left >= rowHeaderBox.left && rowBox.right <= rowHeaderBox.right + 0.5
      };
      setPagerPlacement("left");
      return { column, row };
    });

    for (const [name, result] of Object.entries(measured.column)) {
      expect(result.overHeader, `the button sits on a ${name} header`).toBe(true);
      expect(result.contrast, `the palette button stays readable on a ${name} header`).toBeGreaterThanOrEqual(4.5);
    }
    // Proves the ink follows the colour rather than being a new fixed value.
    expect(measured.column.bright.ink, "a bright header takes a dark button").not.toBe(measured.column.dark.ink);
    expect(measured.column.dark.ink, "a dark header takes a white button").toBe("rgb(255, 255, 255)");
    // A row band leaves the button on the surface, where the theme ink belongs.
    expect(measured.row.overHeader, "a row band does not stretch the header under the button").toBe(false);
    expect(measured.row.ink, "so it keeps the theme ink").not.toBe("rgb(17, 22, 29)");
  });

  // A solid band colour and a nearly transparent one are the two cases the
  // contrast rule cannot judge the same way as an ordinary gradient.
  test("derives band ink and edge colour from solid and translucent colours", async () => {
    const measured = await page.evaluate(() => {
      const solid = { mode: "solid", color: "#FFB900", stops: [{ color: "#FFB900", opacity: 100, position: 0 }] };
      const darkSolid = { mode: "solid", color: "#101010", stops: [{ color: "#101010", opacity: 100, position: 0 }] };
      const ghost = {
        mode: "gradient",
        type: "linear",
        angle: 135,
        stops: [{ color: "#FFB900", opacity: 10, position: 0 }, { color: "#0000FF", opacity: 20, position: 100 }]
      };
      const gradient = {
        mode: "gradient",
        type: "linear",
        angle: 135,
        stops: [{ color: "#0044CC", opacity: 100, position: 0 }, { color: "#00CC44", opacity: 100, position: 100 }]
      };
      const darkGradient = {
        mode: "gradient",
        type: "linear",
        angle: 135,
        stops: [{ color: "#101010", opacity: 100, position: 0 }, { color: "#202033", opacity: 100, position: 100 }]
      };
      return {
        solidEdge: headerBackgroundEdgeCss(solid),
        gradientEdge: headerBackgroundEdgeCss(gradient),
        noEdge: headerBackgroundEdgeCss(null),
        brightSolidInk: headerBackgroundInk(solid)?.ink,
        darkSolidInk: headerBackgroundInk(darkSolid)?.ink,
        ghostInk: headerBackgroundInk(ghost),
        gradientInk: headerBackgroundInk(gradient)?.ink,
        darkGradientInk: headerBackgroundInk(darkGradient)?.ink
      };
    });

    expect(measured.solidEdge, "a solid band supplies its own edge colour").toBe("#FFB900");
    expect(measured.gradientEdge, "a gradient's first stop stands for the band").toBe("#0044CC");
    expect(measured.noEdge).toBe("");
    expect(measured.brightSolidInk, "a bright solid band takes dark ink").toBe("#11161D");
    expect(measured.darkSolidInk, "a dark solid band takes white ink").toBe("#FFFFFF");
    // Every stop shows the surface behind it, so hue says nothing about contrast.
    expect(measured.ghostInk, "a translucent band falls back to the default ink").toBeNull();
    // The worst stop decides, so one bright stop is enough to force dark ink.
    expect(measured.gradientInk).toBe("#11161D");
    expect(measured.darkGradientInk).toBe("#FFFFFF");
  });

  // A band is only as movable as its pages: the bar is rendered from state.pages,
  // so reordering one has to carry its whole run with it.
  test("reorders bands by dragging a group header", async () => {
    const ids = await page.evaluate(() => ({
      first: createPageGroup("First", ["page-1"]),
      second: createPageGroup("Second", ["page-3"])
    }));
    const bandNames = () => page.evaluate(() => (
      [...document.querySelectorAll(".pager-list > .pager-group .pager-group-name")].map((node) => node.textContent)
    ));
    const pageNames = () => page.evaluate(() => state.pages.map((entry) => entry.name));
    expect(await bandNames()).toEqual(["First", "Second"]);
    expect(await pageNames()).toEqual(["Alpha", "Beta", "Gamma"]);

    const leading = page.locator(`.pager-group[data-group-id="${ids.first}"]`);
    await page.locator(`.pager-group[data-group-id="${ids.second}"] .pager-group-header`).dragTo(leading, {
      // The leading corner reads as "before" whether the bar runs across or down,
      // so the gesture does not depend on the placement an earlier test left.
      targetPosition: { x: 4, y: 4 }
    });

    expect(await bandNames(), "the dragged band lands ahead of the one it was dropped on")
      .toEqual(["Second", "First"]);
    // Gamma travelled with its band rather than the band jumping over it.
    expect(await pageNames()).toEqual(["Gamma", "Alpha", "Beta"]);
    expect(await page.evaluate(() => state.pageGroups.map((group) => group.name)))
      .toEqual(["Second", "First"]);

    // Nothing may be left holding the next gesture.
    expect(await page.evaluate(() => ({
      dragged: draggedGroupId,
      markers: document.querySelectorAll("[data-group-drop-edge]").length,
      dragging: document.querySelectorAll(".is-group-dragging").length
    }))).toEqual({ dragged: null, markers: 0, dragging: 0 });
    // A drag must not also fire the header's collapse toggle.
    expect(await page.evaluate((id) => pageGroupById(id).collapsed, ids.second)).toBe(false);
  });

  test("leaves the bands alone when a group drag is cancelled", async () => {
    await page.evaluate(() => {
      createPageGroup("First", ["page-1"]);
      createPageGroup("Second", ["page-3"]);
    });
    const before = await page.evaluate(() => state.pageGroups.map((group) => group.name));

    const cancelled = await page.evaluate(() => {
      const header = document.querySelector(".pager-group .pager-group-header");
      header.dispatchEvent(new DragEvent("dragstart", { bubbles: true }));
      const started = draggedGroupId;
      header.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
      return { started, dragged: draggedGroupId };
    });
    expect(cancelled.started, "the header really starts a group drag").not.toBeNull();
    expect(cancelled.dragged).toBeNull();
    expect(await page.evaluate(() => state.pageGroups.map((group) => group.name))).toEqual(before);
  });

  // Tab styling rides CSS custom-property inheritance, so the three scopes need
  // no precedence logic of their own -- but that only holds if each one is set
  // on the right element.
  test("styles tabs globally, per group, and per tab", async () => {
    const groupId = await page.evaluate(() => {
      state.settings.pagerTabBackground = "#402020";
      state.settings.pagerTabForeground = "#FFEEDD";
      state.settings.pagerTabFontSize = 18;
      const id = createPageGroup("Band", ["page-2"]);
      renderPager();
      return id;
    });
    const chipStyle = (pageId) => page.evaluate((id) => {
      const style = getComputedStyle(document.querySelector(`.pager-chip[data-page-id="${id}"]`));
      return { fontSize: style.fontSize, background: style.backgroundColor };
    }, pageId);

    // page-1 is active, so it wears the configured colour at full strength.
    expect((await chipStyle("page-1")).background).toBe("rgb(64, 32, 32)");
    expect((await chipStyle("page-1")).fontSize).toBe("18px");
    expect((await chipStyle("page-2")).fontSize, "the global size reaches grouped tabs too").toBe("18px");

    await page.evaluate((id) => {
      pageGroupById(id).tabAppearance = { background: "#204020", foreground: "#DDFFEE", fontSize: 9 };
      renderPager();
    }, groupId);
    expect((await chipStyle("page-2")).fontSize, "a group overrides the global size").toBe("9px");
    expect((await chipStyle("page-1")).fontSize, "and leaves tabs outside it alone").toBe("18px");

    await page.evaluate(() => {
      pageById("page-2").tabAppearance = { background: "#600060", foreground: "#FFDDFF", fontSize: 25 };
      renderPager();
    });
    expect((await chipStyle("page-2")).fontSize, "a tab overrides its own group").toBe("25px");

    // Both overrides ride out a reload.
    const persisted = await page.evaluate(() => {
      savePages();
      const pages = loadPages();
      return {
        page: pages.find((entry) => entry.id === "page-2")?.tabAppearance,
        group: loadPageGroups(pages)[0]?.tabAppearance
      };
    });
    expect(persisted.page).toEqual({ background: "#600060", foreground: "#FFDDFF", fontSize: 25 });
    expect(persisted.group).toEqual({ background: "#204020", foreground: "#DDFFEE", fontSize: 9 });

    await page.evaluate(() => {
      state.settings.pagerTabBackground = "";
      state.settings.pagerTabForeground = "";
      state.settings.pagerTabFontSize = 0;
      saveSettings();
    });
  });

  test("carries membership and order through a reload", async () => {
    const id = await page.evaluate(() => {
      const groupId = createPageGroup("Release", ["page-1", "page-2"]);
      setPageGroupCollapsed(groupId, true);
      return groupId;
    });

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    await expect(page.locator(".pager-group")).toHaveCount(1);
    await expect(page.locator(".pager-group-name")).toHaveText("Release");
    expect(await page.evaluate(() => state.pageGroups[0].collapsed)).toBe(true);
    expect(await groupIds()).toEqual([id, id, null]);
  });

  test("joins and leaves a group when a tab is moved across its edge", async () => {
    const id = await page.evaluate(() => createPageGroup("Release", ["page-1"]));

    // Beta sits directly after the one-member band, so stepping left over Alpha
    // lands it inside the group.
    await page.evaluate(() => movePageByOffset("page-2", -1));
    expect(await groupIds()).toEqual([id, id, null]);

    // Stepping right once only swaps it with the other member; it takes a second
    // step, past the group's last member, to leave.
    await page.evaluate(() => movePageByOffset("page-2", 1));
    expect(await groupIds()).toEqual([id, id, null]);
    await page.evaluate(() => movePageByOffset("page-2", 1));
    expect(await groupIds()).toEqual([id, null, null]);
    expect(await page.evaluate(() => state.pages.map((entry) => entry.name))).toEqual(["Alpha", "Gamma", "Beta"]);
  });

  test("only offers AI page grouping once there are at least two pages", async () => {
    const button = page.locator("#pagerGroupPages");
    await expect(button).toHaveAttribute("aria-label", /Group pages into page groups|not signed in/);

    await page.evaluate(() => {
      state.pages = [{ id: "page-1", name: "Alpha", groupId: null }];
      state.activePageId = "page-1";
      state.pageGroups = [];
      savePages();
      renderPager();
    });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-label", /at least two pages|not signed in/);
  });

  test("normalizes persisted groups and rejects invalid manual operations", async () => {
    const result = await page.evaluate(() => {
      const storage = localStorage.getItem("multiterm.pages");
      localStorage.setItem("multiterm.pages", JSON.stringify({
        pages: [
          { id: "page-1", name: "", groupId: "group-1" },
          { id: "page-2", name: "Two", groupId: 7 },
          null,
          { id: "", name: "Ignored" }
        ],
        pageGroups: [
          { id: "group-1", name: "", collapsed: true },
          { id: "group-1", name: "Duplicate" },
          { id: "orphan", name: "Orphan" },
          { id: "empty", name: "Inbox", keepEmpty: true },
          { id: "", name: "Invalid empty", keepEmpty: true },
          null
        ]
      }));
      const loadedPages = loadPages();
      const loadedGroups = loadPageGroups(loadedPages);
      const groupsWithoutPages = loadPageGroups(null);
      localStorage.setItem("multiterm.pages", "{broken");
      const brokenPages = loadPages();
      const brokenGroups = loadPageGroups(brokenPages);
      if (storage == null) localStorage.removeItem("multiterm.pages");
      else localStorage.setItem("multiterm.pages", storage);

      state.pages = [
        { id: "page-1", name: "One", groupId: null },
        { id: "page-2", name: "Two", groupId: "missing" }
      ];
      state.activePageId = "page-1";
      state.pageGroups = [];
      const invalidAssign = assignPagesToGroup(["page-1"], "missing");
      pruneEmptyPageGroups();
      const staleMembership = state.pages[1].groupId;
      const emptyCreate = createPageGroup("", []);
      const groupId = createPageGroup("", ["page-1"]);
      const duplicateCreate = createPageGroup("Other", ["missing"]);
      const noChange = assignPagesToGroup(["page-1", "missing"], groupId);
      const renameMissing = renamePageGroup("missing", "Name");
      const renameNull = renamePageGroup(groupId, null);
      const renameEmpty = renamePageGroup(groupId, "  ");
      const renameSame = renamePageGroup(groupId, pageGroupById(groupId).name);
      const collapseMissing = setPageGroupCollapsed("missing", true);
      const collapseSame = setPageGroupCollapsed(groupId, false);
      const ungroupMissing = ungroupPageGroup("missing");
      const ungrouped = ungroupPageGroup(groupId);
      return {
        loadedPages,
        loadedGroups,
        groupsWithoutPages,
        brokenPages,
        brokenGroups,
        invalidAssign,
        staleMembership,
        emptyCreate,
        groupId,
        duplicateCreate,
        noChange,
        renameMissing,
        renameNull,
        renameEmpty,
        renameSame,
        collapseMissing,
        collapseSame,
        ungroupMissing,
        ungrouped,
        missingGroup: pageGroupById("missing"),
        noPageGroup: pageGroupOf(null)
      };
    });

    expect(result.loadedPages).toEqual([
      { id: "page-1", name: "Page", groupId: "group-1" },
      { id: "page-2", name: "Two", groupId: null }
    ]);
    expect(result.loadedGroups).toEqual([
      { id: "group-1", name: "Group", collapsed: true },
      { id: "empty", name: "Inbox", collapsed: false, keepEmpty: true }
    ]);
    expect(result.groupsWithoutPages).toEqual([
      { id: "empty", name: "Inbox", collapsed: false, keepEmpty: true }
    ]);
    expect(result.brokenPages).toEqual([{ id: "page-1", name: "Page 1", groupId: null }]);
    expect(result.brokenGroups).toEqual([]);
    expect(result).toMatchObject({
      invalidAssign: false,
      staleMembership: null,
      emptyCreate: "",
      duplicateCreate: "",
      noChange: false,
      renameMissing: false,
      renameNull: false,
      renameEmpty: false,
      renameSame: false,
      collapseMissing: false,
      collapseSame: false,
      ungroupMissing: false,
      ungrouped: true,
      missingGroup: null,
      noPageGroup: null
    });
    expect(result.groupId).toMatch(/^group-/);
  });

  test("samples start middle and latest output within the configured budget", async () => {
    const result = await page.evaluate(() => {
      const fakeTerm = (values) => ({
        buffer: {
          active: {
            length: values.length,
            getLine: (index) => values[index] == null ? null : {
              translateToString: () => values[index]
            }
          }
        }
      });
      const many = Array.from({ length: 24 }, (_, index) => `line ${index}`);
      const originalPages = state.pages;
      const originalGroups = state.pageGroups;
      const originalTerminals = state.terminals;
      state.pages = [
        { id: "page-1", name: "Build", groupId: "group-1" },
        { id: "page-2", name: "Empty", groupId: null }
      ];
      state.pageGroups = [{ id: "group-1", name: "Release", collapsed: false }];
      state.terminals = new Map([
        ["live-1", { id: "live-1", status: "live", pageId: "page-1", shell: "pwsh", cwd: "D:\\repo", titleInput: { value: "API" }, term: fakeTerm(many) }],
        ["live-2", { id: "live-2", status: "live", pageId: "page-1", shell: "pwsh", cwd: "D:\\repo", titleInput: { value: "API" }, term: fakeTerm(["short", "", "tail"]) }],
        ["live-empty", { id: "live-empty", status: "live", pageId: "missing", shell: "", cwd: "", titleInput: { value: "" }, term: fakeTerm([]) }],
        ["dead", { id: "dead", status: "exited", pageId: "page-1", shell: "cmd", cwd: "D:\\old", titleInput: { value: "Dead" }, term: fakeTerm(["ignored"]) }]
      ]);
      const catalog = buildPageCatalog();
      const terminalCatalog = buildTerminalGroupCatalog();
      state.pages = [];
      const emptyCatalog = buildPageCatalog();
      state.pages = originalPages;
      state.pageGroups = originalGroups;
      state.terminals = originalTerminals;
      return {
        zero: clampSampleToBudget(["x"], 0),
        emptyParts: clampSampleToBudget([], 10),
        complete: clampSampleToBudget(["ab", "cd"], 20),
        clipped: clampSampleToBudget(["🙂🙂", "abcdef"], 6),
        emptySample: sampleTerminalOutput(fakeTerm(["", "  "]), 100),
        shortSample: sampleTerminalOutput(fakeTerm([" a ", "", " b "]), 100, 2),
        longSample: sampleTerminalOutput(fakeTerm(many), 240, 2),
        catalog,
        terminalCatalog,
        emptyCatalog
      };
    });

    expect(result.zero).toBe("");
    expect(result.emptyParts).toBe("");
    expect(result.complete).toBe("ab cd");
    expect(result.clipped).not.toContain("�");
    expect(result.emptySample).toBe("");
    expect(result.shortSample).toBe("a | b");
    expect(result.longSample).toContain("[start]");
    expect(result.longSample).toContain("[middle]");
    expect(result.longSample).toContain("[latest]");
    expect(result.catalog.pages).toHaveLength(2);
    expect(result.catalog.catalog[0]).toMatchObject({
      title: "Build",
      shell: "pwsh",
      cwd: "D:\\repo",
      page: "Release",
      members: "API"
    });
    expect(result.catalog.catalog[1].excerpt).toBe("");
    expect(result.terminalCatalog.terminals).toHaveLength(3);
    expect(result.terminalCatalog.catalog[2]).toMatchObject({ title: "", shell: "", cwd: "", page: "", excerpt: "" });
    expect(result.emptyCatalog).toEqual({ pages: [], catalog: [] });
  });

  test("handles AI page-group proposals, bridge failures, and stale membership", async () => {
    const result = await page.evaluate(async () => {
      state.pages = [
        { id: "page-1", name: "Alpha", groupId: null },
        { id: "page-2", name: "Beta", groupId: null }
      ];
      state.activePageId = "page-1";
      state.pageGroups = [];
      pageGrouping.active = false;
      pageGrouping.mode = "pages";

      const normalizedInvalid = normalizePageGroupResponse(null, new Set());
      const normalizedPartial = normalizePageGroupResponse([
        { name: "", terminals: ["page-1"] },
        { name: "A".repeat(50), terminals: ["page-1", "page-1", "invented"] }
      ], new Set(["page-1", "page-2"]));
      const originalRequest = window.requestBridge;
      window.requestBridge = async () => null;
      const silent = await runCopilotGrouping({
        mode: "pages", ids: ["page-1", "page-2"], catalog: [], working: "working", subject: "pages", unit: "page"
      });
      const silentText = elements.pageGroupStatus.textContent;
      window.requestBridge = async () => ({ error: "provider failed" });
      const errored = await runCopilotGrouping({
        mode: "pages", ids: ["page-1", "page-2"], catalog: [], working: "working", subject: "pages", unit: "page"
      });
      const errorText = elements.pageGroupStatus.textContent;
      window.requestBridge = async () => ({ groups: [{ name: "Only", terminals: ["page-1"] }] });
      const partial = await runCopilotGrouping({
        mode: "pages", ids: ["page-1", "page-2"], catalog: [], working: "working", subject: "pages", unit: "page"
      });
      const partialText = elements.pageGroupStatus.textContent;
      window.requestBridge = async () => ({ groups: [{ name: "Both", terminals: ["page-1", "page-2"] }] });
      const proposed = await runCopilotGrouping({
        mode: "pages", ids: ["page-1", "page-2"], catalog: [], working: "working", subject: "pages", unit: "page"
      });
      const proposal = elements.pageGroupList.textContent;
      window.requestBridge = originalRequest;

      const current = pageGroupPagesProposalIsCurrent(["page-1", "page-2"]);
      const stale = pageGroupPagesProposalIsCurrent(["page-1"]);
      const staleApply = applyAiPageGroups([{ name: "Nope", terminals: ["page-1"] }], ["page-1"]);
      state.pageGroups.push({ id: "existing", name: "Both", collapsed: false });
      const applied = applyAiPageGroups([
        { name: "Both", terminals: ["page-1"] },
        { name: "New", terminals: ["page-2", "missing"] }
      ], ["page-1", "page-2"]);
      const groupNames = state.pageGroups.map((group) => group.name);
      const memberships = state.pages.map((entry) => entry.groupId);

      pageGrouping.groups = [];
      const emptyConfirm = confirmPageGroupProposal();
      pageGrouping.mode = "pages";
      pageGrouping.groups = [{ name: "Stale", terminals: ["page-1"] }];
      pageGrouping.memberIds = ["page-1"];
      const staleConfirm = confirmPageGroupProposal();
      const staleStatus = elements.pageGroupStatus.textContent;
      closePageGroupFlyout({ restoreFocus: false });
      return {
        normalizedInvalid,
        normalizedPartial,
        silent,
        silentText,
        errored,
        errorText,
        partial,
        partialText,
        proposed,
        proposal,
        current,
        stale,
        staleApply,
        applied,
        groupNames,
        memberships,
        emptyConfirm,
        staleConfirm,
        staleStatus
      };
    });

    expect(result.normalizedInvalid).toEqual([]);
    expect(result.normalizedPartial).toEqual([]);
    expect(result.silent).toBe(false);
    expect(result.silentText).toMatch(/bridge|connected/i);
    expect(result.errored).toBe(false);
    expect(result.errorText).toBe("provider failed");
    expect(result.partial).toBe(false);
    expect(result.partialText).toContain("every page");
    expect(result.proposed).toBe(true);
    expect(result.proposal).toContain("Both");
    expect(result.current).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.staleApply).toBe(false);
    expect(result.applied).toBe(true);
    expect(result.groupNames).toEqual(expect.arrayContaining(["Both", "New"]));
    expect(result.memberships.every(Boolean)).toBe(true);
    expect(result.emptyConfirm).toBe(false);
    expect(result.staleConfirm).toBe(false);
    expect(result.staleStatus).toContain("changed");
  });

  test("renders unknown proposal members and both confirmation plural forms", async () => {
    const result = await page.evaluate(() => {
      pageGrouping.mode = "terminals";
      renderPageGroupProposal([{ name: "Unknown", terminals: ["missing-terminal"] }]);
      const fallbackMember = elements.pageGroupList.textContent;

      // One terminal page exercises the singular terminal confirmation text.
      const originalTerminalApply = window.applyTerminalPageGroups;
      const originalPageApply = window.applyAiPageGroups;
      window.applyTerminalPageGroups = () => true;
      window.applyAiPageGroups = () => true;
      pageGrouping.mode = "terminals";
      pageGrouping.groups = [{ name: "One terminal page", terminals: ["only"] }];
      pageGrouping.memberIds = ["only"];
      const terminalConfirmed = confirmPageGroupProposal();

      pageGrouping.mode = "pages";
      pageGrouping.groups = [
        { name: "First", terminals: ["page-1"] },
        { name: "Second", terminals: ["page-2"] }
      ];
      pageGrouping.memberIds = ["page-1", "page-2"];
      const pagesConfirmed = confirmPageGroupProposal();
      window.applyTerminalPageGroups = originalTerminalApply;
      window.applyAiPageGroups = originalPageApply;
      return { fallbackMember, terminalConfirmed, pagesConfirmed };
    });
    expect(result).toEqual({ fallbackMember: "Unknownmissing-terminal", terminalConfirmed: true, pagesConfirmed: true });
  });

  test("exercises group menus and inline creation controls", async () => {
    const groupId = await page.evaluate(() => createPageGroup("Release", ["page-1", "page-2"]));
    await page.locator(".pager-group-header").click({ button: "right" });
    await page.getByRole("menuitem", { name: "New page in group", exact: true }).click();
    expect(await page.evaluate((id) => pagesInGroup(id).length, groupId)).toBe(3);

    await page.locator(".pager-group-header").click({ button: "right" });
    await page.getByRole("menuitem", { name: /Ungroup 3 pages/ }).click();
    await expect(page.locator(".pager-group")).toHaveCount(0);

    await page.locator('.pager-chip[data-page-id="page-1"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Add to group", exact: true }).hover();
    await expect(page.locator("#contextSubmenu")).toBeVisible();
    await page.locator("#contextSubmenu").getByRole("menuitem", { name: "New group…", exact: true }).click();
    const input = page.locator(".pager-group-rename");
    await expect(input).toBeVisible();
    await input.fill("Created inline");
    await input.press("Escape");
    await expect(page.locator(".pager-group-name")).not.toHaveText("Created inline");
  });

  test("covers page-group wrapper gates and successful confirmation", async () => {
    const result = await page.evaluate(async () => {
      const originalRequest = window.requestBridge;
      const originalProviders = state.aiProviders;
      state.aiProviders = [{
        id: "copilot",
        available: true,
        interactiveAvailable: true,
        titleAvailable: true,
        models: [{ id: "auto", name: "Auto", efforts: [] }]
      }];

      pageGrouping.active = true;
      const busy = await groupPageBandsWithAi();
      pageGrouping.active = false;
      const savedPages = state.pages;
      state.pages = [{ id: "page-1", name: "One", groupId: null }];
      const tooFew = await groupPageBandsWithAi();
      state.pages = savedPages;
      state.aiProviders = [];
      const unavailable = await groupPageBandsWithAi();
      state.aiProviders = originalProviders.length ? originalProviders : [{
        id: "copilot", available: true, interactiveAvailable: true, titleAvailable: true, models: []
      }];
      window.requestBridge = async () => ({
        groups: [{ name: "All pages", terminals: state.pages.map((entry) => entry.id) }]
      });
      const proposed = await groupPageBandsWithAi();
      const confirmed = confirmPageGroupProposal();
      const groups = state.pageGroups.map((entry) => entry.name);
      window.requestBridge = originalRequest;
      state.aiProviders = originalProviders;
      return { busy, tooFew, unavailable, proposed, confirmed, groups };
    });

    expect(result).toMatchObject({ busy: false, tooFew: false, unavailable: false, proposed: true, confirmed: true });
    expect(result.groups).toContain("All pages");
  });

  test("covers terminal-group wrapper gates and creates proposed pages", async () => {
    await page.evaluate(() => {
      closeAllTerminals();
      addTerminal({ title: "API", runStartup: false });
      addTerminal({ title: "Docs", runStartup: false });
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(2);

    const result = await page.evaluate(async () => {
      const originalRequest = window.requestBridge;
      const originalProviders = state.aiProviders;
      pageGrouping.active = true;
      const busy = await groupPagesWithAi();
      pageGrouping.active = false;

      const terminals = [...state.terminals.values()];
      const savedStatus = terminals[1].status;
      terminals[1].status = "exited";
      const tooFew = await groupPagesWithAi();
      terminals[1].status = savedStatus;

      state.aiProviders = [];
      const unavailable = await groupPagesWithAi();
      state.aiProviders = [{ id: "copilot", available: true, interactiveAvailable: true, titleAvailable: true, models: [] }];
      window.requestBridge = async () => ({
        groups: [
          { name: "New API page", terminals: [terminals[0].id] },
          { name: "New Docs page", terminals: [terminals[1].id] }
        ]
      });
      const proposed = await groupPagesWithAi();
      const confirmed = confirmPageGroupProposal();
      const pageNames = state.pages.map((entry) => entry.name);
      window.requestBridge = originalRequest;
      state.aiProviders = originalProviders;
      return { busy, tooFew, unavailable, proposed, confirmed, pageNames };
    });

    expect(result).toMatchObject({ busy: false, tooFew: false, unavailable: false, proposed: true, confirmed: true });
    expect(result.pageNames).toEqual(expect.arrayContaining(["New API page", "New Docs page"]));
  });

  test("executes existing-group, remove, and failed-create menu callbacks", async () => {
    const result = await page.evaluate(() => {
      const groupId = createPageGroup("Release", ["page-1"]);
      const beta = pageById("page-2");
      const ungroupedMenu = pageGroupMenuItems(beta);
      const existing = ungroupedMenu[0].submenu.find((item) => item.label === "Release");
      existing.run();
      const groupedMenu = pageGroupMenuItems(beta);
      const remove = groupedMenu.find((item) => item.label === "Remove from group");
      remove.run();
      const missingCreate = startPageGroupCreation("missing-page");

      // The group still exists through page-1. Remove the rendered header to hit
      // the defensive rename callback path, then execute the remaining menu rows.
      renderPager();
      elements.pagerList.querySelector(`[data-group-toggle="${groupId}"]`)?.remove();
      showPageGroupMenu(pageGroupById(groupId), 10, 10);
      const callbacks = [...elements.contextMenu.querySelectorAll(".ctx-item")];
      const rename = callbacks.find((row) => row.textContent.includes("Rename group"));
      rename.click();
      return {
        joined: beta.groupId === groupId,
        removed: beta.groupId === null,
        missingCreate,
        menuText: elements.contextMenu.textContent
      };
    });

    expect(result.joined).toBe(false); // joined first, then removed by the second callback
    expect(result.removed).toBe(true);
    expect(result.missingCreate).toBeUndefined();
    expect(result.menuText).toContain("Collapse group");
  });

  test("commits an inline rename on blur and protects duplicate editor starts", async () => {
    await page.evaluate(() => createPageGroup("Release", ["page-1"]));
    const header = page.locator(".pager-group-header");
    await page.evaluate(() => {
      const element = document.querySelector(".pager-group-header");
      startPageGroupRename(element);
      startPageGroupRename(element);
    });
    const input = page.locator(".pager-group-rename");
    await input.fill("Blurred name");
    await input.evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await input.blur();
    await expect(page.locator(".pager-group-name")).toHaveText("Blurred name");

    await page.evaluate(() => startPageGroupRename(document.querySelector(".pager-group-header")));
    await page.locator(".pager-group-rename").press("ArrowLeft");
    await page.locator(".pager-group-rename").press("Escape");
    await expect(page.locator(".pager-group-name")).toHaveText("Blurred name");

    await page.evaluate(() => startPageRename(document.querySelector(".pager-chip")));
    await page.locator(".pager-rename:not(.pager-group-rename)").fill("Do not keep");
    await page.locator(".pager-rename:not(.pager-group-rename)").press("Escape");
    await expect(page.locator(".pager-name").first()).not.toHaveText("Do not keep");
  });

  test("covers missing controls and collapsed group menu actions", async () => {
    const result = await page.evaluate(() => {
      const groupId = createPageGroup("Release", ["page-1"]);
      const originalButton = elements.pagerGroup;
      const originalBands = elements.pagerGroupPages;
      elements.pagerGroup = null;
      updatePageGroupButton();
      elements.pagerGroup = originalButton;
      elements.pagerGroupPages = null;
      updatePageGroupButton();
      elements.pagerGroupPages = originalBands;

      const originalQuery = elements.pagerList.querySelector.bind(elements.pagerList);
      elements.pagerList.querySelector = () => null;
      startPageGroupCreation("page-2");
      elements.pagerList.querySelector = originalQuery;

      setPageGroupCollapsed(groupId, true);
      showPageGroupMenu(pageGroupById(groupId), 10, 10);
      const expand = [...elements.contextMenu.querySelectorAll(".ctx-item")]
        .find((row) => row.textContent.includes("Expand group"));
      expand.click();

      const fake = document.createElement("button");
      fake.dataset.groupToggle = "missing";
      elements.pagerList.append(fake);
      fake.click();
      fake.remove();
      return {
        expanded: pageGroupById(groupId).collapsed === false,
        secondGroup: Boolean(pageById("page-2").groupId)
      };
    });
    expect(result).toEqual({ expanded: true, secondGroup: true });
  });

  test("covers drag guards, accepted movement, and rollback", async () => {
    const result = await page.evaluate(() => {
      renderPager();
      const first = elements.pagerList.querySelector('[data-page-id="page-1"]');
      const second = elements.pagerList.querySelector('[data-page-id="page-2"]');
      draggedPageId = "missing";
      moveDraggedPage(second, true);
      draggedPageId = "page-1";
      moveDraggedPage(first, true);
      const beforeAdjacent = state.pages.map((entry) => entry.id);
      moveDraggedPage(second, false);
      const moved = state.pages.map((entry) => entry.id);

      // Roll the changed DOM order back through the same dragend path the browser uses.
      originalPageOrder = beforeAdjacent.map((id) => ({ id, groupId: null }));
      pageDragChanged = true;
      first.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
      const rolledBack = state.pages.map((entry) => entry.id);

      draggedPageId = "page-1";
      originalPageOrder = rolledBack.map((id) => ({ id, groupId: null }));
      pageDragChanged = true;
      elements.pagerList.querySelector('[data-page-id="page-1"]')
        .dispatchEvent(new DragEvent("dragend", { bubbles: true }));
      return { beforeAdjacent, moved, rolledBack, settled: draggedPageId === null };
    });

    expect(result.moved).not.toEqual(result.beforeAdjacent);
    expect(result.rolledBack).toEqual(result.beforeAdjacent);
    expect(result.settled).toBe(true); // dragend settles the drag
  });

  test("moves a dragged tab into group and bar drop zones", async () => {
    const groupId = await page.evaluate(() => createPageGroup("Drop group", ["page-1"]));
    const beta = page.locator('[data-page-id="page-2"]');
    const groupZone = page.locator(`[data-group-id="${groupId}"] .pager-group-chips`);
    const transfer = await page.evaluateHandle(() => new DataTransfer());

    await beta.dispatchEvent("dragstart", { dataTransfer: transfer });
    await groupZone.dispatchEvent("dragover", { dataTransfer: transfer });
    await groupZone.dispatchEvent("dragover", { dataTransfer: transfer });
    await groupZone.dispatchEvent("drop", { dataTransfer: transfer });
    await beta.dispatchEvent("dragend", { dataTransfer: transfer });
    expect(await page.evaluate(() => pageById("page-2").groupId)).toBe(groupId);

    const freshBeta = page.locator('[data-page-id="page-2"]');
    await freshBeta.dispatchEvent("dragstart", { dataTransfer: transfer });
    await page.locator("#pagerList").dispatchEvent("dragover", { dataTransfer: transfer });
    await page.locator("#pagerList").dispatchEvent("drop", { dataTransfer: transfer });
    await freshBeta.dispatchEvent("dragend", { dataTransfer: transfer });
    expect(await page.evaluate(() => pageById("page-2").groupId)).toBeNull();

    const before = await page.evaluate(() => pageGroupById("group-1")?.collapsed ?? false);
    await page.evaluate(() => document.querySelector(".pager-group-header")
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await page.evaluate(() => elements.pagerList
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(await page.evaluate(() => pageGroupById("group-1")?.collapsed ?? false)).toBe(before);
  });

  test("labels singular and plural minimized counts", async () => {
    const result = await page.evaluate(() => {
      const original = state.terminals;
      const page = { id: "parked", name: "Parked", groupId: null };
      const terminal = (id) => ({ id, pageId: page.id, minimized: true });
      state.terminals = new Map([["one", terminal("one")]]);
      const singular = buildPageChip(page).querySelector(".pager-parked").title;
      state.terminals.set("two", terminal("two"));
      const plural = buildPageChip(page).querySelector(".pager-parked").title;
      state.terminals = original;
      return { singular, plural };
    });
    expect(result).toEqual({ singular: "1 minimized terminal", plural: "2 minimized terminals" });
  });

  test("covers partial pager sync, missing rollback pages, and button context menus", async () => {
    const result = await page.evaluate(() => {
      const groupId = createPageGroup("Collapsed", ["page-1", "page-2"]);
      setPageGroupCollapsed(groupId, true);
      const before = state.pages.map((entry) => entry.id);
      syncPageOrderFromPager();
      const after = state.pages.map((entry) => entry.id);
      setPageGroupCollapsed(groupId, false);

      originalPageOrder = [
        { id: "missing", groupId: null },
        ...state.pages.map((entry) => ({ id: entry.id, groupId: entry.groupId }))
      ];
      pageDragChanged = true;
      pageDropAccepted = false;
      elements.pagerList.querySelector(".pager-chip").dispatchEvent(new DragEvent("dragend", { bubbles: true }));

      elements.pagerAdd.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      return { before, after, pageCount: state.pages.length };
    });
    expect(result.after).toEqual(result.before);
    expect(result.pageCount).toBe(3);
  });

  test("saves and restores page groups with a workspace", async () => {
    const result = await page.evaluate(() => {
      state.workspaces = {};
      const groupId = createPageGroup("Workspace group", ["page-1", "page-2"]);
      setPageGroupCollapsed(groupId, true);
      saveWorkspace("Grouped workspace");
      const saved = structuredClone(state.workspaces["Grouped workspace"]);
      state.pages = [{ id: "other", name: "Other", groupId: null }];
      state.pageGroups = [];
      state.activePageId = "other";
      restoreWorkspace("Grouped workspace");
      const restored = {
        pages: state.pages.map((entry) => ({ ...entry })),
        groups: state.pageGroups.map((entry) => ({ ...entry })),
        activePageId: state.activePageId
      };
      delete state.workspaces["Grouped workspace"];
      saveWorkspaces();
      return { saved, restored };
    });

    expect(result.saved.pages.filter((entry) => entry.groupId)).toHaveLength(2);
    expect(result.saved.pageGroups).toEqual([{ id: expect.any(String), name: "Workspace group", collapsed: true }]);
    expect(result.restored.groups).toEqual(result.saved.pageGroups);
    expect(result.restored.pages.map((entry) => entry.groupId)).toEqual(result.saved.pages.map((entry) => entry.groupId));
    expect(result.restored.activePageId).toBe(result.saved.activePageId);
  });

  test("restores legacy workspace page and group defaults", async () => {
    const result = await page.evaluate(() => {
      state.workspaces = {
        "No groups": {
          settings: {},
          pages: [{ id: "legacy", name: "", groupId: null }],
          pageGroups: null,
          activePageId: "missing",
          terminals: []
        },
        "Default group": {
          settings: {},
          pages: [{ id: "grouped", name: "Grouped", groupId: "g" }],
          pageGroups: [{ id: "g", name: "", collapsed: false }, null, { id: "", name: "ignored" }],
          activePageId: "grouped",
          terminals: []
        }
      };
      restoreWorkspace("No groups");
      const noGroups = {
        page: { ...state.pages[0] },
        groups: [...state.pageGroups],
        active: state.activePageId
      };
      restoreWorkspace("Default group");
      const defaultGroup = { ...state.pageGroups[0] };
      state.workspaces = {};
      saveWorkspaces();
      return { noGroups, defaultGroup };
    });
    expect(result.noGroups).toEqual({
      page: { id: "legacy", name: "Page", groupId: null },
      groups: [],
      active: "legacy"
    });
    expect(result.defaultGroup).toEqual({ id: "g", name: "Group", collapsed: false });
  });

  test("reports no page errors", () => {
    expect(errors).toEqual([]);
  });
});
