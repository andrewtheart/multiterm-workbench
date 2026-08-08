/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const { test, expect } = require("../support/renderer-coverage");

async function reset(page, count = 2) {
  await page.goto("/");
  await expect(page.locator("#statusConn")).toHaveText("Connected");
  await page.evaluate(() => closeAllTerminals());
  await expect(page.locator(".terminal-pane")).toHaveCount(0);
  await page.evaluate((terminalCount) => {
    for (let index = 0; index < terminalCount; index += 1) {
      addTerminal({ title: `Gradient terminal ${index + 1}` });
    }
  }, count);
  await expect(page.locator(".terminal-pane")).toHaveCount(count);
  await expect.poll(() => page.evaluate(() => (
    [...state.terminals.values()].filter((terminal) => terminal.status === "live").length
  ))).toBe(count);
}

async function openHeaderBackgroundEditor(page, paneIndex = 0) {
  const header = page.locator(".terminal-pane .pane-bar").nth(paneIndex);
  await header.click({ button: "right", position: { x: 6, y: 16 } });
  const menu = page.locator("#contextMenu");
  await expect(menu).toBeVisible();
  await menu.locator('[data-customization-id="terminal.header-background"]').click();
  await expect(page.locator("#headerBackgroundOverlay")).toBeVisible();
}

const readHeaderBackground = (bar) => bar.style.getPropertyValue("--pane-bar-custom-bg");

test.describe("Terminal header backgrounds", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      closeHeaderBackgroundEditor({ restoreFocus: false });
      closeAllTerminals();
    });
  });

  test("builds an arbitrary gradient for only the invoked header and restores it", async ({ page }) => {
    await reset(page, 2);
    const initial = await page.evaluate(() => {
      const terminals = [...state.terminals.values()];
      return {
        firstId: terminals[0].id,
        paneBackground: getComputedStyle(terminals[0].pane).backgroundColor,
        secondHeader: terminals[1].pane.querySelector(".pane-bar").style.getPropertyValue("--pane-bar-custom-bg")
      };
    });

    await openHeaderBackgroundEditor(page);
    await page.locator('[data-header-gradient-type="conic"]').click();
    await expect(page.locator('[data-header-gradient-type="conic"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#headerGradientAngleRow")).toBeVisible();
    await expect(page.locator("#headerGradientCenterXRow")).toBeVisible();

    await page.locator("#headerGradientAngleValue").fill("210");
    await page.locator("#headerGradientCenterXValue").fill("34");
    await page.locator("#headerGradientCenterYValue").fill("68");
    await page.locator("#headerGradientAddStop").click();
    await page.locator("#headerGradientAddStop").click();
    await expect(page.locator(".header-gradient-stop")).toHaveCount(4);

    await page.locator('.header-gradient-stop').first().locator('[data-stop-field="color"] input').fill("#112233");
    await page.locator('.header-gradient-stop').nth(1).locator('[data-stop-field="opacity"] input').fill("65");
    await page.locator('.header-gradient-stop').nth(2).locator('[data-stop-field="position"] input').fill("73");

    await expect.poll(() => page.locator("#headerBackgroundPreview").evaluate((preview) => preview.style.background)).toContain("conic-gradient");
    await page.locator("#headerBackgroundApply").click();
    await expect(page.locator("#headerBackgroundOverlay")).toBeHidden();

    const applied = await page.evaluate((firstId) => {
      const first = state.terminals.get(firstId);
      const second = [...state.terminals.values()].find((terminal) => terminal.id !== firstId);
      const snapshot = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]")
        .find((entry) => entry.id === firstId);
      return {
        background: first.pane.querySelector(".pane-bar").style.getPropertyValue("--pane-bar-custom-bg"),
        definition: first.headerBackground,
        paneBackground: getComputedStyle(first.pane).backgroundColor,
        secondHeader: second.pane.querySelector(".pane-bar").style.getPropertyValue("--pane-bar-custom-bg"),
        snapshot: snapshot?.headerBackground
      };
    }, initial.firstId);

    expect(applied.background).toContain("conic-gradient");
    expect(applied.background).toContain("from 210deg at 34% 68%");
    expect(applied.definition).toMatchObject({ type: "conic", angle: 210, centerX: 34, centerY: 68 });
    expect(applied.definition.stops).toHaveLength(4);
    expect(applied.definition.stops[0].color).toBe("#112233");
    expect(applied.definition.stops.some((stop) => stop.opacity === 65)).toBe(true);
    expect(applied.paneBackground).toBe(initial.paneBackground);
    expect(applied.secondHeader).toBe(initial.secondHeader);
    expect(applied.snapshot).toEqual(applied.definition);

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate((id) => state.terminals.has(id), initial.firstId)).toBe(true);
    await expect.poll(() => page.locator(`[data-id="${initial.firstId}"] .pane-bar`).evaluate(readHeaderBackground)).toContain("conic-gradient");

    const beforeDuplicate = await page.locator(".terminal-pane").count();
    await page.evaluate((id) => runHeaderAction(state.terminals.get(id), "duplicate"), initial.firstId);
    await expect(page.locator(".terminal-pane")).toHaveCount(beforeDuplicate + 1);
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()].at(-1)?.headerBackground?.type)).toBe("conic");

    await page.evaluate((id) => restartSession(id), initial.firstId);
    await expect.poll(() => page.evaluate((id) => !state.terminals.has(id), initial.firstId)).toBe(true);
    await expect.poll(() => page.evaluate(() => (
      [...state.terminals.values()].some((terminal) => (
        terminal.titleInput.value === "Gradient terminal 1" && terminal.headerBackground?.type === "conic"
      ))
    ))).toBe(true);
    const restartedId = await page.evaluate(() => (
      [...state.terminals.values()].find((terminal) => terminal.titleInput.value === "Gradient terminal 1")?.id
    ));
    const restartedHeader = page.locator(`[data-id="${restartedId}"] .pane-bar`);

    await page.evaluate((id) => openHeaderBackgroundEditor(state.terminals.get(id)), restartedId);
    await expect(page.locator("#headerBackgroundOverlay")).toBeVisible();
    await page.locator("#headerBackgroundReset").click();
    await expect.poll(() => restartedHeader.evaluate(readHeaderBackground)).toBe("");
    expect(await page.evaluate((id) => state.terminals.get(id)?.headerBackground, restartedId)).toBeNull();
  });

  test("supports every gradient mode, bounded stops, cancellation, and mobile containment", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await reset(page, 1);
    await page.evaluate(() => openHeaderBackgroundEditor([...state.terminals.values()][0]));
    await expect(page.locator("#headerBackgroundOverlay")).toBeVisible();

    await page.locator('[data-header-gradient-type="radial"]').click();
    await expect(page.locator("#headerGradientShapeRow")).toBeVisible();
    await expect(page.locator("#headerGradientAngleRow")).toBeHidden();
    await page.locator("#headerGradientShape").selectOption("circle");
    await expect.poll(() => page.locator("#headerBackgroundPreview").evaluate((preview) => preview.style.background)).toContain("radial-gradient");

    const addStop = page.locator("#headerGradientAddStop");
    while (await addStop.isEnabled()) await addStop.click();
    await expect(page.locator(".header-gradient-stop")).toHaveCount(8);
    await expect(addStop).toBeDisabled();

    const containment = await page.evaluate(() => {
      const dialog = document.querySelector(".header-background-dialog");
      const dialogRect = dialog.getBoundingClientRect();
      const controls = [...dialog.querySelectorAll("button, input, select")]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        });
      return {
        bottom: dialogRect.bottom,
        left: dialogRect.left,
        right: dialogRect.right,
        top: dialogRect.top,
        bodyClientWidth: document.querySelector(".header-background-body").clientWidth,
        bodyScrollWidth: document.querySelector(".header-background-body").scrollWidth,
        controls
      };
    });
    expect(containment.left).toBeGreaterThanOrEqual(0);
    expect(containment.top).toBeGreaterThanOrEqual(0);
    expect(containment.right).toBeLessThanOrEqual(390);
    expect(containment.bottom).toBeLessThanOrEqual(720);
    expect(containment.bodyScrollWidth).toBeLessThanOrEqual(containment.bodyClientWidth);
    expect(containment.controls.every((control) => (
      control.left >= containment.left && control.right <= containment.right
    ))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator("#headerBackgroundOverlay")).toBeHidden();
    expect(await page.evaluate(() => [...state.terminals.values()][0].headerBackground)).toBeNull();
  });

  test("keeps the elevated and awaiting-input header cues above a custom gradient", async ({ page }) => {
    await reset(page, 1);
    const cues = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const bar = terminal.pane.querySelector(".pane-bar");
      const read = () => ({
        color: getComputedStyle(bar).backgroundColor,
        image: getComputedStyle(bar).backgroundImage
      });
      const resting = read().color;

      terminal.pane.classList.add("is-admin");
      const adminPlain = read();
      terminal.pane.classList.remove("is-admin");
      // The awaiting-input tint only applies to panes that are not focused.
      terminal.pane.classList.remove("is-active");
      terminal.pane.classList.add("is-awaiting-input");
      const awaitingPlain = read();
      terminal.pane.classList.remove("is-awaiting-input");

      terminal.headerBackground = {
        type: "linear",
        angle: 90,
        centerX: 50,
        centerY: 50,
        shape: "ellipse",
        stops: [
          { color: "#FFFFFF", opacity: 100, position: 0 },
          { color: "#FFFFFF", opacity: 100, position: 100 }
        ]
      };
      applyTerminalHeaderBackground(terminal);
      const styled = read();

      terminal.pane.classList.add("is-admin");
      const adminStyled = read();
      terminal.pane.classList.remove("is-admin");
      terminal.pane.classList.add("is-awaiting-input");
      const awaitingStyled = read();
      terminal.pane.classList.remove("is-awaiting-input");
      return { resting, adminPlain, awaitingPlain, styled, adminStyled, awaitingStyled };
    });

    // Guard against a vacuous pass: both cue rules must really change the bar.
    expect(cues.adminPlain.color).not.toBe(cues.resting);
    expect(cues.awaitingPlain.color).not.toBe(cues.resting);
    expect(cues.styled.image).toContain("linear-gradient");
    expect(cues.adminStyled.image).toBe("none");
    expect(cues.adminStyled.color).toBe(cues.adminPlain.color);
    expect(cues.awaitingStyled.image).toBe("none");
    expect(cues.awaitingStyled.color).toBe(cues.awaitingPlain.color);
  });

  test("previews on the real header and reverts when cancelled", async ({ page }) => {
    await reset(page, 1);
    const seeded = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const bar = terminal.pane.querySelector(".pane-bar");
      const resting = getComputedStyle(bar).backgroundColor;
      openHeaderBackgroundEditor(terminal);
      return {
        resting,
        seedColor: headerBackgroundDraft.stops[0].color,
        livePreview: bar.style.getPropertyValue("--pane-bar-custom-bg"),
        previewHeight: document.querySelector("#headerBackgroundPreview").style.getPropertyValue("--header-preview-height"),
        barHeight: `${Math.round(bar.getBoundingClientRect().height)}px`
      };
    });

    expect(seeded.livePreview).toContain("linear-gradient");
    expect(seeded.seedColor).toBe(cssColorToHexInPage(seeded.resting));
    expect(seeded.previewHeight).toBe(seeded.barHeight);

    await page.locator("#headerBackgroundCancel").click();
    await expect(page.locator("#headerBackgroundOverlay")).toBeHidden();
    const reverted = await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      return {
        custom: terminal.pane.querySelector(".pane-bar").style.getPropertyValue("--pane-bar-custom-bg"),
        stored: terminal.headerBackground
      };
    });
    expect(reverted.custom).toBe("");
    expect(reverted.stored).toBeNull();
  });

  test("survives being reopened during the close animation", async ({ page }) => {
    await reset(page, 1);
    const outcome = await page.evaluate(async () => {
      const terminal = [...state.terminals.values()][0];
      openHeaderBackgroundEditor(terminal);
      closeHeaderBackgroundEditor({ restoreFocus: false });
      openHeaderBackgroundEditor(terminal);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const overlay = document.querySelector("#headerBackgroundOverlay");
      return { hidden: overlay.hidden, open: overlay.classList.contains("is-open"), hasDraft: !!headerBackgroundDraft };
    });
    expect(outcome).toEqual({ hidden: false, open: true, hasDraft: true });
    await expect(page.locator("#headerBackgroundOverlay")).toBeVisible();
  });

  test("closes itself when the terminal it edits goes away", async ({ page }) => {
    await reset(page, 2);
    await page.evaluate(() => openHeaderBackgroundEditor([...state.terminals.values()][0]));
    await expect(page.locator("#headerBackgroundOverlay")).toBeVisible();
    await page.evaluate(() => removeTerminal([...state.terminals.values()][0].id));
    await expect(page.locator("#headerBackgroundOverlay")).toBeHidden();
    expect(await page.evaluate(() => headerBackgroundDraft)).toBeNull();
  });

  test("reorders stop rows once a position moves past its neighbour", async ({ page }) => {
    await reset(page, 1);
    await page.evaluate(() => openHeaderBackgroundEditor([...state.terminals.values()][0]));
    await page.locator("#headerGradientAddStop").click();
    await expect(page.locator(".header-gradient-stop")).toHaveCount(3);

    const first = page.locator(".header-gradient-stop").first().locator('[data-stop-field="position"] input');
    await first.fill("95");
    await first.blur();

    const rendered = await page.evaluate(() => ({
      rows: [...document.querySelectorAll(".header-gradient-stop")]
        .map((row) => Number(row.querySelector('[data-stop-field="position"] input').value)),
      draft: headerBackgroundDraft.stops.map((stop) => stop.position)
    }));
    expect(rendered.rows).toEqual([...rendered.rows].sort((left, right) => left - right));
    expect(rendered.rows).toEqual(rendered.draft);
  });
});

function cssColorToHexInPage(value) {
  const rgb = String(value).match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (!rgb) return value;
  return `#${[rgb[1], rgb[2], rgb[3]]
    .map((part) => Math.round(Number(part)).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}