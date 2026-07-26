const { test, expect } = require("@playwright/test");

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

    // Hand the shared bridge back roughly as we found it.
    for (let i = 0; i < added.length; i += 1) {
      await page.locator('.terminal-pane [data-action="close"]').last().click();
      await page.waitForTimeout(80);
    }
    await expect(page.locator(".terminal-pane")).toHaveCount(start);
  });
});

// Below 920px the host collapses to a single column. The primary must stop
// spanning the rail rows there, or it would claim every row of that one column
// and push the rest of the terminals far below the fold.
test.describe("Focus rail on a narrow window", () => {
  test.use({ viewport: { width: 800, height: 1000 } });

  test("primary drops its row span in single-column mode", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    await page.evaluate(() => {
      const el = document.querySelector("#layoutMode");
      el.value = "focus";
      el.dispatchEvent(new Event("change", { bubbles: true }));
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
      const primary = host.querySelector(".terminal-pane.is-primary");
      return {
        gridRow: getComputedStyle(primary).gridRow,
        primaryHeight: Math.round(primary.getBoundingClientRect().height),
      };
    });

    expect(info.gridRow).toBe("auto");
    // One row, kept a little taller than the rest by the narrow-screen
    // min-height. Spanning four rail rows would be 750px or more.
    expect(info.primaryHeight).toBeLessThan(600);
  });
});
