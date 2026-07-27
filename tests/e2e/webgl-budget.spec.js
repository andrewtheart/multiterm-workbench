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

// Chromium force-loses the OLDEST WebGL context once ~16 are live, and xterm's
// WebGL addon leaves a pane with no renderer at all when its context dies - the
// pane goes blank even though its buffer still holds the text. Past ~16 panes
// that became a rolling eviction cascade: every pane that recovered evicted
// another one, so panes flickered white indefinitely.
//
// app.js therefore caps how many WebGL renderers it hands out and lets every
// other pane keep xterm's DOM renderer. These tests open more panes than the
// budget allows and pin down the two properties that matter: we never
// over-subscribe the GPU, and no pane is ever left blank.

const { test, expect } = require("@playwright/test");

test.describe.configure({ mode: "serial" });

// Must stay above app.js's WEBGL_MAX_CONTEXTS so the budget is actually exceeded.
const PANE_COUNT = 15;

test.describe("WebGL renderer budget", () => {
  let context;
  let page;

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
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      viewport: { width: 1400, height: 900 }
    });
    page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    // Other specs share this bridge and leave sessions behind; start from empty
    // so the pane count below is exactly what this spec created.
    await page.evaluate(() => closeAllTerminals());
    await expect(page.locator(".terminal-pane")).toHaveCount(0);
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(0);

    for (let i = 0; i < PANE_COUNT; i += 1) {
      await page.evaluate((n) => addTerminal({ title: `GL${n}` }), i + 1);
    }
    await expect(page.locator(".terminal-pane")).toHaveCount(PANE_COUNT);
    await expect
      .poll(() => page.evaluate(() => [...state.terminals.values()].filter((t) => t.status === "live").length), {
        timeout: 30000
      })
      .toBe(PANE_COUNT);
  });

  test.afterAll(async () => {
    await page.evaluate(() => closeAllTerminals());
    await expect.poll(bridgeSessionCount, { timeout: 30000 }).toBe(0);
    await context.close();
  });

  test("hands out no more WebGL renderers than the budget allows", async () => {
    const counts = await page.evaluate(() => ({
      terminals: state.terminals.size,
      withWebgl: [...state.terminals.values()].filter((t) => t.webglAddon).length,
      budget: WEBGL_MAX_CONTEXTS
    }));

    expect(counts.terminals).toBe(PANE_COUNT);
    // Exact, not just "<= budget": with more panes open than the budget allows,
    // precisely `budget` of them must hold a renderer. Dropping the gate in
    // attachWebglRenderer would give all PANE_COUNT panes one and fail here.
    expect(counts.withWebgl).toBe(Math.min(PANE_COUNT, counts.budget));
    // Below Chromium's stock ~16 cap, so panes are never evicted in the first
    // place - including in a plain browser tab, where our launcher flags do not
    // apply and nothing raises the ceiling for us.
    expect(counts.budget).toBeLessThan(16);
  });

  test("leases a WebGL renderer to the active pane", async () => {
    const initial = await page.evaluate(() => {
      const active = state.terminals.get(state.activeId);
      return {
        activeId: active.id,
        activeHasWebgl: Boolean(active.webglAddon),
        withWebgl: [...state.terminals.values()].filter((terminal) => terminal.webglAddon).length
      };
    });
    expect(initial.activeHasWebgl).toBe(true);
    expect(initial.withWebgl).toBe(await page.evaluate(() => WEBGL_MAX_CONTEXTS));

    const promoted = await page.evaluate(() => {
      const candidate = [...state.terminals.values()].find((terminal) => !terminal.webglAddon);
      if (!candidate) return null;
      setActiveTerminal(candidate.id);
      return {
        activeId: state.activeId,
        candidateId: candidate.id,
        candidateHasWebgl: Boolean(candidate.webglAddon),
        withWebgl: [...state.terminals.values()].filter((terminal) => terminal.webglAddon).length
      };
    });

    expect(promoted).toBeTruthy();
    expect(promoted.activeId).toBe(promoted.candidateId);
    expect(promoted.candidateHasWebgl).toBe(true);
    expect(promoted.withWebgl).toBe(await page.evaluate(() => WEBGL_MAX_CONTEXTS));
  });

  // Headless Chromium renders through SwiftShader, which does not enforce the
  // same live-context cap as a real GPU, so over-subscription cannot actually be
  // provoked here - this passes trivially in CI. It is kept because it is the
  // direct statement of the invariant and does have teeth on a GPU-backed run.
  test("does not over-subscribe the GPU, so no context gets force-lost", async () => {
    const gl = await page.evaluate(() => {
      let live = 0;
      let lost = 0;
      for (const canvas of document.querySelectorAll("canvas")) {
        const ctx = canvas.getContext("webgl2") || canvas.getContext("webgl");
        if (!ctx) continue;
        if (ctx.isContextLost()) lost += 1;
        else live += 1;
      }
      return { live, lost };
    });

    expect(gl.lost).toBe(0);
    expect(gl.live).toBeLessThanOrEqual(await page.evaluate(() => WEBGL_MAX_CONTEXTS));
  });

  // PANE_COUNT is deliberately above the budget, so a few panes here are running
  // on xterm's built-in renderer. This also verifies that a pane demoted from
  // WebGL by the lease handoff keeps painting through xterm's fallback renderer.
  test("every pane still renders, including the ones past the budget", async () => {
    // The marker is rewritten on every attempt rather than written once: the
    // newest shells are still emitting their banner and prompt when the panes go
    // "live", and that output overwrote a single up-front marker, which made this
    // look like a rendering failure when nothing had failed to render.
    const probe = () =>
      page.evaluate(async () => {
        const marker = `RENDERCHK${Date.now()}`;
        for (const terminal of state.terminals.values()) terminal.term.write(`\r\n${marker}\r\n`);
        await new Promise((resolve) => setTimeout(resolve, 600));

        const unpainted = [];
        for (const terminal of state.terminals.values()) {
          const rows = terminal.pane.querySelector(".xterm-rows");
          // A GL pane paints into its canvas, so presence of the canvas is the
          // signal there. A DOM pane must have the text in .xterm-rows - that is
          // exactly what a pane stripped of its renderer would fail.
          const painted = terminal.webglAddon
            ? terminal.pane.querySelectorAll("canvas").length > 0
            : Boolean(rows) && rows.textContent.includes(marker);
          if (!painted) unpainted.push(terminal.title || terminal.id);
        }
        return unpainted;
      });

    await expect.poll(probe, { timeout: 30000 }).toEqual([]);
  });
});
