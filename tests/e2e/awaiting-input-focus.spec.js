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

const { test, expect } = require("../support/renderer-coverage");

// The awaiting-input treatment (keyboard pill + yellow border + glow) exists to
// pull your eye towards a terminal you are *not* watching. On the pane you are
// actually typing in it is pure noise — the prompt itself is already the cue —
// and the yellow border fights the blue active-pane highlight.
//
// The rules are keyed off `.is-active`, which `setActiveTerminal` moves with
// focus, so the treatment must arm and disarm purely by switching panes with no
// change to the underlying awaiting state.
test.describe("Awaiting-input highlight and focus", () => {
  const awaitStyle = (page, index) =>
    page.evaluate((paneIndex) => {
      const pane = document.querySelectorAll(".terminal-pane")[paneIndex];
      const pill = pane.querySelector(".pane-await");
      const paneStyle = getComputedStyle(pane);
      return {
        awaiting: pane.classList.contains("is-awaiting-input"),
        active: pane.classList.contains("is-active"),
        pillDisplay: getComputedStyle(pill).display,
        animation: paneStyle.animationName,
        borderColor: paneStyle.borderTopColor,
        barBackground: getComputedStyle(pane.querySelector(".pane-bar")).backgroundColor,
      };
    }, index);

  test("suppressed on the focused pane, shown once focus moves away", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    // The bridge is shared across specs, so add our own panes rather than
    // assuming a clean slate, and hand them back at the end.
    const start = await page.locator(".terminal-pane").count();
    await page.locator("#addTerminal").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(start + 1);
    await page.locator("#addTerminal").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(start + 2);
    await page.waitForTimeout(600);

    const subject = start; // first pane we added
    const other = start + 1;

    // Park a genuine blocking prompt in the subject pane. Read-Host renders
    // "Continue? (y/n): " and blocks with the caret at end of line, which is
    // exactly the shape the detector looks for.
    await page.locator(".terminal-pane").nth(subject).locator(".xterm").click();
    await page.keyboard.type('Read-Host "Continue? (y/n)"');
    await page.keyboard.press("Enter");

    const subjectPane = page.locator(".terminal-pane").nth(subject);
    await expect(subjectPane).toHaveClass(/is-awaiting-input/, { timeout: 15000 });

    // Focused: state is set, but every visual is suppressed.
    const pill = subjectPane.locator(".pane-await");
    await expect(pill).toBeHidden();
    const focused = await awaitStyle(page, subject);
    expect(focused.awaiting).toBe(true);
    expect(focused.active).toBe(true);
    expect(focused.pillDisplay, "input pill must be hidden on the focused pane").toBe("none");
    expect(focused.animation, "await-glow must not run on the focused pane").not.toContain(
      "await-glow"
    );

    // Move focus elsewhere. Nothing about the awaiting state changes — only
    // `.is-active` — so the treatment must appear on its own.
    await page.locator(".terminal-pane").nth(other).locator(".xterm").click();
    await expect(subjectPane).toHaveClass(/is-awaiting-input/);
    await expect(subjectPane).not.toHaveClass(/is-active/);

    const blurred = await awaitStyle(page, subject);
    expect(blurred.awaiting).toBe(true);
    expect(blurred.active).toBe(false);
    await expect(pill).toBeVisible();
    // `inline-flex` blockifies to `flex` for a flex item, so assert on the
    // absence of `none` rather than the authored keyword.
    expect(blurred.pillDisplay, "input pill must show on an unfocused pane").not.toBe("none");
    expect(blurred.animation).toContain("await-glow");
    // The pane transitions its border colour, so poll rather than sampling a
    // single frame at t=0 of the transition. Comparing against the focused
    // reading keeps this theme-agnostic.
    await expect
      .poll(async () => (await awaitStyle(page, subject)).borderColor, {
        message: "unfocused awaiting pane must take the warn border",
      })
      .not.toBe(focused.borderColor);
    await expect
      .poll(async () => (await awaitStyle(page, subject)).barBackground, {
        message: "unfocused awaiting pane must tint its title bar",
      })
      .not.toBe(focused.barBackground);

    // Focusing it again puts it straight back to suppressed.
    await page.locator(".terminal-pane").nth(subject).locator(".xterm").click();
    await expect(subjectPane).toHaveClass(/is-active/);
    await expect(pill).toBeHidden();
    const refocused = await awaitStyle(page, subject);
    expect(refocused.awaiting).toBe(true);
    expect(refocused.pillDisplay).toBe("none");
    expect(refocused.animation).not.toContain("await-glow");
    await expect
      .poll(async () => (await awaitStyle(page, subject)).borderColor, {
        message: "refocused pane must drop the warn border again",
      })
      .toBe(focused.borderColor);

    // Release the blocked Read-Host, then hand the bridge back as we found it.
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    for (let i = 0; i < 2; i += 1) {
      await page.locator('.terminal-pane [data-action="close"]').last().click();
      await page.waitForTimeout(120);
    }
    await expect(page.locator(".terminal-pane")).toHaveCount(start);
  });
});
