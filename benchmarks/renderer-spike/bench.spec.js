/*
 * MultiTerm Workbench - Terminal Renderer Performance Spike
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

"use strict";

const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ASSETS = path.join(__dirname, "target", "assets");
const RESULTS = path.join(__dirname, "target", "renderer-results.json");
const UPDATES = 90;
const UPDATE_INTERVAL_MS = 50;
const SETTLE_MS = 350;
const MEASURED_RUNS = 3;

const variants = [
  { version: "5.5.0", renderer: "webgl", addon: "addon-webgl-5x.js", overlay: "blur" },
  { version: "5.5.0", renderer: "webgl", addon: "addon-webgl-5x.js", overlay: "opaque" },
  { version: "5.5.0", renderer: "canvas", addon: "addon-canvas-5x.js", overlay: "blur" },
  { version: "5.5.0", renderer: "canvas", addon: "addon-canvas-5x.js", overlay: "opaque" },
  { version: "5.5.0", renderer: "dom", overlay: "blur" },
  { version: "5.5.0", renderer: "dom", overlay: "opaque" },
  // Stable Canvas/WebGL addons still declare xterm ^5 compatibility.
  { version: "6.0.0", renderer: "dom", overlay: "blur" },
  { version: "6.0.0", renderer: "dom", overlay: "opaque" }
];

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function median(values) {
  return percentile(values, 0.5);
}

function fixed(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function medianField(samples, field) {
  return median(samples.map((sample) => sample[field]));
}

function summarize(variant, samples) {
  return {
    variant: `xterm ${variant.version} ${variant.renderer} ${variant.overlay}`,
    version: variant.version,
    renderer: variant.renderer,
    overlay: variant.overlay,
    "write p95 ms": fixed(medianField(samples, "writeP95Ms")),
    "render p95 ms": fixed(medianField(samples, "renderP95Ms")),
    "rAF p95 ms": fixed(medianField(samples, "rafP95Ms")),
    "rAF p99 ms": fixed(medianField(samples, "rafP99Ms")),
    "frames >25ms": fixed(medianField(samples, "slowFrames"), 0),
    renders: fixed(medianField(samples, "renderCount"), 0),
    "task ms": fixed(medianField(samples, "TaskDurationMs")),
    "script ms": fixed(medianField(samples, "ScriptDurationMs")),
    "layout ms": fixed(medianField(samples, "LayoutDurationMs")),
    "style ms": fixed(medianField(samples, "RecalcStyleDurationMs")),
    "long tasks": fixed(medianField(samples, "longTaskCount"), 0)
  };
}

function metricMap(result) {
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}

function metricDelta(before, after, name) {
  return ((after[name] || 0) - (before[name] || 0)) * 1000;
}

async function installBenchmarkPage(page, variant, manifest) {
  const xtermAsset = `xterm-${variant.version}.js`;
  const cssAsset = `xterm-${variant.version}.css`;
  const expectedPackage = `@xterm/xterm@${variant.version}`;
  expect(manifest.assets[xtermAsset]?.package).toBe(expectedPackage);
  expect(manifest.assets[cssAsset]?.package).toBe(expectedPackage);
  if (variant.addon) expect(manifest.assets[variant.addon]?.package).toContain("@xterm/addon-");

  await page.setContent(`
    <!doctype html>
    <html>
      <head><meta charset="utf-8"></head>
      <body>
        <main class="stage">
          <section class="terminal-pane">
            <div id="terminal"></div>
            <div class="status-pill">pid 12345</div>
          </section>
        </main>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: path.join(ASSETS, cssAsset) });
  await page.addStyleTag({
    content: `
      * { box-sizing: border-box; }
      html, body { background: #0c0d0b; height: 100%; margin: 0; overflow: hidden; }
      body { color: #e5e5e0; font-family: "Segoe UI", sans-serif; padding: 34px; }
      .stage { height: 700px; margin: 0 auto; width: 1180px; }
      .terminal-pane {
        background: #11130f;
        border: 1px solid #4f5548;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
        height: 100%;
        overflow: hidden;
        padding: 12px;
        position: relative;
      }
      #terminal { height: 100%; width: 100%; }
      .xterm { height: 100%; }
      .status-pill {
        background: ${variant.overlay === "blur" ? "rgba(28, 32, 25, .45)" : "#242920"};
        backdrop-filter: ${variant.overlay === "blur" ? "blur(10px) saturate(140%)" : "none"};
        -webkit-backdrop-filter: ${variant.overlay === "blur" ? "blur(10px) saturate(140%)" : "none"};
        border: 1px solid rgba(190, 205, 175, .35);
        border-radius: 999px;
        bottom: 20px;
        color: #dce7d2;
        font: 12px/1 "Segoe UI", sans-serif;
        opacity: .8;
        padding: 6px 10px;
        position: absolute;
        right: 24px;
        z-index: 10;
      }
    `
  });

  await page.evaluate(() => {
    window.__canvasContextRequests = [];
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function trackedGetContext(type, ...args) {
      window.__canvasContextRequests.push(String(type));
      return original.call(this, type, ...args);
    };
  });
  await page.addScriptTag({ path: path.join(ASSETS, xtermAsset) });
  if (variant.addon) await page.addScriptTag({ path: path.join(ASSETS, variant.addon) });

  const setup = await page.evaluate(({ variant, xtermAsset, expectedHash }) => {
    const hashMarker = { asset: xtermAsset, sha256: expectedHash };
    const term = new Terminal({
      allowTransparency: false,
      cols: 120,
      convertEol: false,
      cursorBlink: false,
      fontFamily: "Cascadia Mono, Consolas, monospace",
      fontSize: 14,
      rows: 40,
      scrollback: 20000,
      theme: {
        background: "#11130f",
        foreground: "#e5e5e0",
        cursor: "#b8e986"
      }
    });
    term.open(document.querySelector("#terminal"));

    let addon = null;
    if (variant.renderer === "webgl") {
      addon = new WebglAddon.WebglAddon();
      term.loadAddon(addon);
    } else if (variant.renderer === "canvas") {
      addon = new CanvasAddon.CanvasAddon();
      term.loadAddon(addon);
    }

    window.__bench = {
      addon,
      hashMarker,
      renderCount: 0,
      renderedRows: 0,
      renderLatencies: [],
      latestWriteAt: 0,
      term
    };
    term.onRender(({ start, end }) => {
      window.__bench.renderCount += 1;
      window.__bench.renderedRows += end - start + 1;
      if (window.__bench.latestWriteAt) {
        window.__bench.renderLatencies.push(performance.now() - window.__bench.latestWriteAt);
      }
    });
    return {
      hasTerminal: Boolean(window.Terminal),
      loadedAsset: hashMarker.asset,
      loadedHash: hashMarker.sha256
    };
  }, {
    variant,
    xtermAsset,
    expectedHash: manifest.assets[xtermAsset].sha256
  });
  expect(setup.hasTerminal).toBe(true);
  expect(setup.loadedAsset).toBe(xtermAsset);
  expect(setup.loadedHash).toBe(manifest.assets[xtermAsset].sha256);

  await page.evaluate(() => new Promise((resolve) => {
    window.__bench.term.write("\x1b[?1049h\x1b[2J\x1b[Hrenderer warmup", resolve);
  }));
  await page.waitForTimeout(100);

  const rendererEvidence = await page.evaluate((expectedRenderer) => {
    const contexts = window.__canvasContextRequests;
    const canvases = [...document.querySelectorAll("#terminal canvas")];
    const domRows = document.querySelector(".xterm-rows");
    return {
      expectedRenderer,
      contexts,
      canvasCount: canvases.length,
      nonzeroCanvases: canvases.filter((canvas) => canvas.width > 0 && canvas.height > 0).length,
      hasDomRows: Boolean(domRows)
    };
  }, variant.renderer);

  if (variant.renderer === "webgl") {
    expect(rendererEvidence.contexts).toContain("webgl2");
    expect(rendererEvidence.nonzeroCanvases).toBeGreaterThan(0);
  } else if (variant.renderer === "canvas") {
    expect(rendererEvidence.contexts).toContain("2d");
    expect(rendererEvidence.nonzeroCanvases).toBeGreaterThan(0);
  } else {
    expect(rendererEvidence.hasDomRows).toBe(true);
    expect(rendererEvidence.contexts).not.toContain("webgl2");
  }
  return rendererEvidence;
}

async function runWorkload(page) {
  return page.evaluate(async ({ updates, intervalMs, settleMs }) => {
    const bench = window.__bench;
    const term = bench.term;
    const longTasks = [];
    const writeLatencies = [];
    const rafIntervals = [];
    let previousRaf = 0;
    let rafHandle = 0;
    let observer = null;

    if (typeof PerformanceObserver === "function") {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });
      try { observer.observe({ type: "longtask", buffered: false }); } catch {}
    }

    const sampleRaf = (timestamp) => {
      if (previousRaf) rafIntervals.push(timestamp - previousRaf);
      previousRaf = timestamp;
      rafHandle = requestAnimationFrame(sampleRaf);
    };
    rafHandle = requestAnimationFrame(sampleRaf);

    bench.renderCount = 0;
    bench.renderedRows = 0;
    bench.renderLatencies = [];
    bench.latestWriteAt = 0;

    const colors = [
      [101, 177, 255],
      [184, 233, 134],
      [255, 203, 107],
      [199, 146, 234],
      [240, 113, 120],
      [137, 221, 255]
    ];
    const expectedChecksum = `GHCP-CHECKSUM-${updates - 1}`;

    function row(rowNumber, text, colorIndex) {
      const [red, green, blue] = colors[colorIndex % colors.length];
      return `\x1b[${rowNumber};1H\x1b[2K\x1b[38;2;${red};${green};${blue}m${text}\x1b[0m`;
    }

    function updatePayload(index) {
      const progress = Math.round(((index + 1) / updates) * 100);
      let data = "";
      if (index % 15 === 0) {
        data += "\x1b[2J\x1b[H";
        data += row(1, "┌─ GitHub Copilot CLI ───────────────────────────────────────────────────────────────────────────────┐", 1);
        for (let line = 2; line < 36; line += 1) {
          data += row(
            line,
            `│ ${String(line - 1).padStart(2, "0")}  Analyzing workspace and preparing response ${"·".repeat((line + index) % 24)} ${index}`,
            line + index
          );
        }
        data += row(36, "└────────────────────────────────────────────────────────────────────────────────────────────────────┘", 1);
      } else {
        const base = 3 + (index % 24);
        for (let offset = 0; offset < 6; offset += 1) {
          const line = 3 + ((base + offset) % 30);
          data += row(
            line,
            `│ ${String(line - 1).padStart(2, "0")}  Updating analysis block ${index}:${offset} ${"█".repeat((index + offset) % 28)}`,
            index + offset
          );
        }
      }
      data += row(38, `Model: Claude Sonnet 4.6  Progress: ${String(progress).padStart(3, " ")}%`, index);
      data += row(39, `❯ ${expectedChecksum}`, 1);
      data += "\x1b[39;3H";
      return data;
    }

    const startedAt = performance.now();
    const completions = [];
    for (let index = 0; index < updates; index += 1) {
      const target = startedAt + index * intervalMs;
      const delay = Math.max(0, target - performance.now());
      await new Promise((resolve) => setTimeout(resolve, delay));
      const writeAt = performance.now();
      bench.latestWriteAt = writeAt;
      completions.push(new Promise((resolve) => {
        term.write(updatePayload(index), () => {
          writeLatencies.push(performance.now() - writeAt);
          resolve();
        });
      }));
    }
    await Promise.all(completions);
    await new Promise((resolve) => setTimeout(resolve, settleMs));

    cancelAnimationFrame(rafHandle);
    observer?.disconnect();
    const elapsedMs = performance.now() - startedAt;
    const active = term.buffer.active;
    const checksumRows = [];
    for (let rowIndex = 0; rowIndex < active.length; rowIndex += 1) {
      const line = active.getLine(rowIndex);
      if (line) checksumRows.push(line.translateToString(true));
    }
    const checksumText = checksumRows.join("\n");
    let checksum = 2166136261;
    for (let index = 0; index < checksumText.length; index += 1) {
      checksum ^= checksumText.charCodeAt(index);
      checksum = Math.imul(checksum, 16777619);
    }
    const checksumHex = (checksum >>> 0).toString(16).padStart(8, "0");

    function p(values, fraction) {
      if (!values.length) return 0;
      const sorted = [...values].sort((left, right) => left - right);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
    }

    return {
      alternateBuffer: active.type === "alternate",
      checksumFound: checksumText.includes(expectedChecksum),
      checksumHex,
      elapsedMs,
      longTaskCount: longTasks.length,
      longTaskTotalMs: longTasks.reduce((sum, value) => sum + value, 0),
      maxRafMs: Math.max(0, ...rafIntervals),
      rafP50Ms: p(rafIntervals, 0.5),
      rafP95Ms: p(rafIntervals, 0.95),
      rafP99Ms: p(rafIntervals, 0.99),
      renderCount: bench.renderCount,
      renderedRows: bench.renderedRows,
      renderP95Ms: p(bench.renderLatencies, 0.95),
      slowFrames: rafIntervals.filter((value) => value > 25).length,
      updateCount: updates,
      writeCount: writeLatencies.length,
      writeP50Ms: p(writeLatencies, 0.5),
      writeP95Ms: p(writeLatencies, 0.95),
      writeP99Ms: p(writeLatencies, 0.99)
    };
  }, { updates: UPDATES, intervalMs: UPDATE_INTERVAL_MS, settleMs: SETTLE_MS });
}

test("benchmarks Copilot-style terminal rendering variants", async ({ browser }) => {
  const manifestPath = path.join(ASSETS, "versions.json");
  expect(fs.existsSync(manifestPath), "Run prepare.js before the benchmark.").toBe(true);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const allResults = [];
  const environment = {};

  for (const variant of variants) {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const evidence = await installBenchmarkPage(page, variant, manifest);

    if (!environment.userAgent) {
      environment.userAgent = await page.evaluate(() => navigator.userAgent);
      environment.devicePixelRatio = await page.evaluate(() => devicePixelRatio);
      environment.webgl = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2");
        if (!gl) return "unavailable";
        const extension = gl.getExtension("WEBGL_debug_renderer_info");
        return extension
          ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER);
      });
    }

    // One untimed warm-up populates glyph atlases and JITs the workload.
    const warmup = await runWorkload(page);
    expect(warmup.checksumFound).toBe(true);
    expect(warmup.alternateBuffer).toBe(true);

    const samples = [];
    for (let run = 0; run < MEASURED_RUNS; run += 1) {
      const before = metricMap(await cdp.send("Performance.getMetrics"));
      const sample = await runWorkload(page);
      const after = metricMap(await cdp.send("Performance.getMetrics"));

      expect(sample.checksumFound).toBe(true);
      expect(sample.alternateBuffer).toBe(true);
      expect(sample.updateCount).toBe(UPDATES);
      expect(sample.writeCount).toBe(UPDATES);
      expect(sample.renderCount).toBeGreaterThan(0);
      expect(sample.elapsedMs).toBeLessThan(8000);

      for (const name of ["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"]) {
        sample[`${name}Ms`] = metricDelta(before, after, name);
      }
      samples.push(sample);
    }

    allResults.push({ variant, evidence, samples, summary: summarize(variant, samples) });
    await cdp.detach();
    await page.close();
  }

  const summaries = allResults.map((result) => result.summary);
  console.log("\nRenderer benchmark environment:");
  console.table(environment);
  console.log("\nMedian of three measured runs after one warm-up:");
  console.table(summaries);

  const webglBlur = summaries.find((row) =>
    row.version === "5.5.0" && row.renderer === "webgl" && row.overlay === "blur");
  const webglOpaque = summaries.find((row) =>
    row.version === "5.5.0" && row.renderer === "webgl" && row.overlay === "opaque");
  const recommendations = [];
  const blurTaskDelta = webglBlur["task ms"] - webglOpaque["task ms"];
  const blurFrameDelta = webglBlur["rAF p95 ms"] - webglOpaque["rAF p95 ms"];
  recommendations.push(
    blurTaskDelta > 5 || blurFrameDelta > 0.5
      ? `Opaque status overlays improved WebGL (task delta ${fixed(blurTaskDelta)} ms; rAF p95 delta ${fixed(blurFrameDelta)} ms).`
      : `Backdrop blur had no material WebGL cost in this environment (task delta ${fixed(blurTaskDelta)} ms; rAF p95 delta ${fixed(blurFrameDelta)} ms).`
  );

  const best55 = summaries
    .filter((row) => row.version === "5.5.0" && row.overlay === "opaque")
    .sort((left, right) => left["task ms"] - right["task ms"])[0];
  recommendations.push(`Lowest xterm 5.5 task time: ${best55.renderer} at ${best55["task ms"]} ms.`);

  const dom55 = summaries.find((row) =>
    row.version === "5.5.0" && row.renderer === "dom" && row.overlay === "opaque");
  const dom60 = summaries.find((row) =>
    row.version === "6.0.0" && row.renderer === "dom" && row.overlay === "opaque");
  recommendations.push(
    `xterm 6 DOM versus 5.5 DOM task delta: ${fixed(dom60["task ms"] - dom55["task ms"])} ms ` +
    "(negative favors xterm 6; positive favors xterm 5.5)."
  );
  console.log("\nRecommendations:");
  for (const recommendation of recommendations) console.log(`- ${recommendation}`);
  console.log("- Results are from automated Chromium; validate winners in packaged Electron before release.");

  const output = {
    generatedAt: new Date().toISOString(),
    workload: {
      updates: UPDATES,
      updateIntervalMs: UPDATE_INTERVAL_MS,
      measuredRuns: MEASURED_RUNS,
      description: "Alternate-screen Copilot-style true-color cursor/erase repaint stream"
    },
    compatibility: {
      xterm55: ["DOM", "@xterm/addon-canvas 0.7.0", "@xterm/addon-webgl 0.19.0"],
      xterm60: ["DOM only; stable renderer addons declare @xterm/xterm ^5"]
    },
    environment,
    manifest,
    recommendations,
    results: allResults
  };
  fs.writeFileSync(RESULTS, JSON.stringify(output, null, 2), "utf8");
  expect(crypto.createHash("sha256").update(fs.readFileSync(RESULTS)).digest("hex")).toHaveLength(64);
});
