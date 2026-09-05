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

// Reproduces the reported overlay: in Focus rail, adding more panes than the
// primary's row span pushed the overflow into column 1 underneath the primary,
// which then painted over it.
//
// The viewport height matters. The old rule paired a fixed `span 4` with
// `min-height: calc(100vh - 150px)`, while the four spanned rows clamp to
// 180px each — roughly 750px regardless of window size. The primary therefore
// only outgrew its own grid area on a tall window, which is why this needs an
// explicit viewport rather than Playwright's 720px default.
test.describe("Focus rail overlap", () => {
  test.use({ viewport: { width: 1360, height: 1080 } });

  const overlapReport = (page) =>
    page.evaluate(() => {
      const host = document.querySelector("#terminalHost");
      const primary = host.querySelector(".terminal-pane.is-primary");
      if (!primary) return { error: "no primary pane" };
      const others = [...host.querySelectorAll(".terminal-pane")].filter(
        (pane) => pane !== primary && pane.offsetParent !== null
      );
      const a = primary.getBoundingClientRect();
      const hits = [];
      for (const pane of others) {
        const b = pane.getBoundingClientRect();
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        // A 1px allowance absorbs sub-pixel grid rounding.
        if (overlapX > 1 && overlapY > 1) {
          const title = pane.querySelector(".pane-title");
          hits.push({
            // .pane-title is an <input>, so read value rather than textContent.
            title: title?.value ?? "?",
            overlapX: Math.round(overlapX),
            overlapY: Math.round(overlapY),
          });
        }
      }
      return {
        hits,
        restCount: getComputedStyle(host).getPropertyValue("--rest-count").trim(),
        paneCount: others.length + 1,
        primaryBottom: Math.round(a.bottom),
        primaryHeight: Math.round(a.height),
        hostHeight: host.clientHeight,
        contentBottom: Math.round(host.getBoundingClientRect().top + host.scrollHeight),
      };
    });

  test("no pane overlaps the primary as the rail fills up", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    await page.evaluate(() => {
      const el = document.querySelector("#layoutMode");
      el.value = "focus";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "focus");

    // The bridge is shared across specs, so start from whatever is already
    // open rather than assuming a clean slate.
    const start = await page.locator(".terminal-pane").count();
    const added = [];

    // Grow the rail well past the old hard-coded span of 4.
    for (let count = start + 1; count <= start + 7; count += 1) {
      await page.locator("#addTerminal").click();
      await expect(page.locator(".terminal-pane")).toHaveCount(count);
      added.push(count);
      await page.waitForTimeout(150);

      const report = await overlapReport(page);
      expect(
        report.hits,
        `pane(s) overlapped the primary with ${report.paneCount} panes ` +
          `(--rest-count=${report.restCount}): ${JSON.stringify(report.hits)}`
      ).toEqual([]);
      // The primary must stay inside the scrollable content, not spill past
      // the rows it was allotted.
      expect(report.primaryBottom).toBeLessThanOrEqual(report.contentBottom + 2);
      // The fix drops the old min-height and lets the grid size the primary
      // instead, so guard that it still fills the stage rather than collapsing
      // to one rail row.
      expect(
        report.primaryHeight,
        `primary collapsed with ${report.paneCount} panes`
      ).toBeGreaterThan(report.hostHeight * 0.8);
    }

    // Hand the shared bridge back roughly as we found it. This is cleanup, not
    // the behaviour under test, so bypass the close confirmation.
    await page.evaluate((count) => {
      [...state.terminals.keys()].slice(-count).forEach((id) => removeTerminal(id));
    }, added.length);
    await expect(page.locator(".terminal-pane")).toHaveCount(start);
  });
});

// A sidebar-width stage (the VS Code panel is the reported case) cannot show a
// rail beside the primary, so the rail stacks under it. The primary must stay
// dominant and must not paint over the first rail pane: it used to carry
// `min-height: var(--pane-height)` inside a 180px auto row, overflowing 140px.
test.describe("Focus rail on a narrow window", () => {
  test.use({ viewport: { width: 430, height: 900 } });

  test("stacks a dominant primary over condensed rail strips", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    await page.evaluate(() => {
      const el = document.querySelector("#layoutMode");
      el.value = "focus";
      el.dispatchEvent(new Event("change", { bubbles: true }));
      // The stage is otherwise too short at this width to measure a share.
      document.querySelector("#toggleSidecar")?.click();
    });
    await expect(page.locator("#terminalHost")).toHaveAttribute("data-layout", "focus");

    const start = await page.locator(".terminal-pane").count();
    for (let count = start + 1; count <= start + 4; count += 1) {
      await page.locator("#addTerminal").click();
      await expect(page.locator(".terminal-pane")).toHaveCount(count);
    }
    await page.waitForTimeout(300);

    const info = await page.evaluate(() => {
      const host = document.querySelector("#terminalHost");
      const panes = [...host.querySelectorAll(".terminal-pane")];
      const boxes = panes.map((pane) => ({
        primary: pane.classList.contains("is-primary"),
        rect: pane.getBoundingClientRect(),
      }));
      const hits = [];
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i].rect;
          const b = boxes[j].rect;
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          if (overlapY > 1 && overlapX > 1) hits.push({ i, j, overlapY: Math.round(overlapY) });
        }
      }
      const primary = boxes.find((box) => box.primary);
      return {
        hits,
        gridRow: getComputedStyle(panes.find((pane) => pane.classList.contains("is-primary"))).gridRow,
        primaryHeight: Math.round(primary.rect.height),
        railHeights: boxes.filter((box) => !box.primary).map((box) => Math.round(box.rect.height)),
        hostHeight: host.clientHeight,
      };
    });

    expect(info.hits, `panes overlapped: ${JSON.stringify(info.hits)}`).toEqual([]);
    // Pinned to the first row so the rail always reads as being below the focus.
    expect(info.gridRow).toBe("1");
    // Dominant, but capped so a long rail cannot squeeze it out.
    expect(info.primaryHeight).toBeGreaterThan(info.hostHeight * 0.5);
    expect(info.primaryHeight).toBeLessThan(info.hostHeight * 0.8);
    // Condensed strips: shorter than a full pane, tall enough to read.
    for (const height of info.railHeights) {
      expect(height).toBeGreaterThanOrEqual(120);
      expect(height).toBeLessThan(info.primaryHeight);
    }

    await page.evaluate(() => document.querySelector("#restoreSidecar")?.click());
    await page.evaluate(() => {
      [...state.terminals.keys()].slice(-4).forEach((id) => removeTerminal(id));
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(start);
  });

  test("gives the whole stage to a lone primary", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    await page.evaluate(() => {
      const el = document.querySelector("#layoutMode");
      el.value = "focus";
      el.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("#toggleSidecar")?.click();
      closeAllTerminals();
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(0);
    await page.locator("#addTerminal").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(1);
    await page.waitForTimeout(300);

    const share = await page.evaluate(() => {
      const host = document.querySelector("#terminalHost");
      const pane = host.querySelector(".terminal-pane");
      return pane.getBoundingClientRect().height / host.clientHeight;
    });
    // No rail means no reserved rail space.
    expect(share).toBeGreaterThan(0.85);

    await page.evaluate(() => document.querySelector("#restoreSidecar")?.click());
  });
});
