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

// The PID pill is the only place a session's identity surfaces, but a PID alone
// does not tell you which of several similar shells you are looking at. Hovering
// it and right-clicking it both have to surface when the shell was launched.
//
// The launch time must come from the bridge (`startedAt`, stamped when it spawns
// the shell) rather than from the client, so it stays truthful across a
// reconnect or a page reload. This reads the bridge's own frame off the
// WebSocket and asserts the UI reports that exact instant.
test.describe("Session launch time on the PID pill", () => {
  test("hover tooltip and right-click menu both report the launch time", async ({ page }) => {
    const launchTimes = [];
    page.on("websocket", (ws) => {
      ws.on("framereceived", (frame) => {
        try {
          const message = JSON.parse(frame.payload.toString());
          if (message.type === "created" && message.startedAt) {
            launchTimes.push({ pid: message.pid, startedAt: message.startedAt });
          }
        } catch {
          // Binary or non-JSON frames are not ours to read.
        }
      });
    });

    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    // The bridge is shared across specs, so add our own pane and hand it back.
    const start = await page.locator(".terminal-pane").count();
    const before = Date.now();
    await page.locator("#addTerminal").click();
    await expect(page.locator(".terminal-pane")).toHaveCount(start + 1);

    const pane = page.locator(".terminal-pane").nth(start);
    const pill = pane.locator(".pane-status");

    // Wait for the shell to go live, which is when the bridge sends startedAt.
    await expect(pill).toHaveText(/^pid \d+$/, { timeout: 15000 });
    const pid = Number((await pill.textContent()).replace("pid ", ""));

    const announced = launchTimes.find((entry) => entry.pid === pid);
    expect(announced, "bridge must announce a launch timestamp for the session").toBeTruthy();
    const launchedMs = Date.parse(announced.startedAt);
    expect(Number.isFinite(launchedMs)).toBe(true);
    expect(launchedMs).toBeGreaterThanOrEqual(before - 5000);
    expect(launchedMs).toBeLessThanOrEqual(Date.now() + 5000);

    // Format it the way the browser under test would, so the assertion does not
    // depend on the locale the tests happen to run under.
    const expected = await page.evaluate(
      (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }),
      launchedMs
    );

    // Hover: the native tooltip carries the launch time and the uptime. It is
    // rebuilt on pointerenter, because the elapsed figure in it goes stale the
    // instant it is written.
    await pill.hover();
    const tooltip = await pill.getAttribute("title");
    expect(tooltip, "hovering the pill must reveal the launch time").toContain(
      `Launched ${expected}`
    );
    expect(tooltip, "tooltip must report how long the shell has been up").toMatch(/\nUp \d/);

    // Right-click: the same fact, in a form that stays on screen and can be copied.
    await pill.click({ button: "right" });
    const menu = page.locator("#contextMenu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(`Launched ${expected}`);
    await expect(menu).toContainText(`PID ${pid}`);
    await expect(menu.locator(".ctx-info").first()).toBeVisible();

    // It must read as belonging to the pill: hung off the pill's top-right
    // corner, growing up and to the left so it never covers the thing you
    // clicked. Anchoring to the pointer instead would drift with the click.
    const pillBox = await pill.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(Math.abs(menuBox.x + menuBox.width - (pillBox.x + pillBox.width))).toBeLessThan(2);
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(pillBox.y);

    // Right-clicking a status readout must never fall through to the pane's own
    // handler — with "right-click pastes" configured that would dump the
    // clipboard into the shell.
    await expect(menu).not.toContainText("Select all");

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await page.locator('.terminal-pane [data-action="close"]').last().click();
    await expect(page.locator(".terminal-pane")).toHaveCount(start);
  });
});
