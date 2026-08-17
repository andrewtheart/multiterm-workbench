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

/**
 * Playwright lane for the bridge throughput benchmark.
 *
 * Raw WebSocket clients can measure wire bytes and delivery latency, but they
 * cannot measure what the product actually pays: WebSocket dispatch, JSON.parse,
 * the renderer output queue, and the xterm write. Those only exist in the real
 * renderer, so a second lane drives it.
 */

"use strict";

const { distribution } = require("./metrics");

/**
 * Runs before any page script, so the WebSocket wrapper is in place before
 * app.js constructs its socket.
 */
function installInstrumentation() {
  const bench = {
    binaryMessages: 0,
    dispatchMs: [],
    enqueueMs: [],
    longTasks: [],
    messages: 0,
    renderLatencyMs: [],
    textBytes: 0,
    writeMs: []
  };
  window.__mtBench = bench;

  const originalAddEventListener = WebSocket.prototype.addEventListener;
  WebSocket.prototype.addEventListener = function addEventListener(type, listener, options) {
    if (type !== "message" || typeof listener !== "function") {
      return originalAddEventListener.call(this, type, listener, options);
    }
    const wrapped = function instrumentedMessage(event) {
      const start = performance.now();
      try {
        return listener.call(this, event);
      } finally {
        bench.messages += 1;
        if (typeof event.data === "string") {
          bench.textBytes += event.data.length;
        } else {
          bench.binaryMessages += 1;
        }
        bench.dispatchMs.push(performance.now() - start);
      }
    };
    return originalAddEventListener.call(this, type, wrapped, options);
  };

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) bench.longTasks.push(entry.duration);
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // Long-task timing is a nice-to-have; its absence must not fail a run.
  }
}

/** Runs after app.js has defined its global functions. */
function wrapRendererFunctions() {
  const bench = window.__mtBench;
  const originalEnqueue = window.enqueueTerminalOutput;
  const originalWrite = window.writeTerminal;

  window.enqueueTerminalOutput = function instrumentedEnqueue(terminal, data) {
    const start = performance.now();
    try {
      return originalEnqueue.call(this, terminal, data);
    } finally {
      bench.enqueueMs.push(performance.now() - start);
    }
  };

  window.writeTerminal = function instrumentedWrite(terminal, data) {
    const start = performance.now();
    try {
      return originalWrite.call(this, terminal, data);
    } finally {
      bench.writeMs.push(performance.now() - start);
      if (typeof data === "string") {
        const marker = data.lastIndexOf("MTB|");
        if (marker !== -1) {
          const sequenceEnd = data.indexOf("|", marker + 4);
          const stampEnd = sequenceEnd === -1 ? -1 : data.indexOf("|", sequenceEnd + 1);
          if (stampEnd !== -1) {
            const stamp = Number(data.slice(sequenceEnd + 1, stampEnd));
            if (Number.isFinite(stamp) && stamp > 0) {
              const nowMicros = Math.round((performance.timeOrigin + performance.now()) * 1000);
              bench.renderLatencyMs.push((nowMicros - stamp) / 1000);
            }
          }
        }
      }
    }
  };

  return Boolean(originalEnqueue && originalWrite);
}

class RendererLane {
  constructor({ browser, context, page, cdp }) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.cdp = cdp;
    this.baselineMetrics = null;
  }

  async mark() {
    this.baselineMetrics = await this.#metrics();
    await this.page.evaluate(() => {
      const bench = window.__mtBench;
      bench.dispatchMs.length = 0;
      bench.enqueueMs.length = 0;
      bench.writeMs.length = 0;
      bench.longTasks.length = 0;
      bench.renderLatencyMs.length = 0;
      bench.messages = 0;
      bench.binaryMessages = 0;
      bench.textBytes = 0;
    });
  }

  async #metrics() {
    const response = await this.cdp.send("Performance.getMetrics");
    return Object.fromEntries(response.metrics.map((metric) => [metric.name, metric.value]));
  }

  async summarize() {
    const bench = await this.page.evaluate(() => window.__mtBench);
    const metrics = await this.#metrics();
    const baseline = this.baselineMetrics || {};
    const deltaSeconds = (name) => {
      const before = Number(baseline[name] || 0);
      const after = Number(metrics[name] || 0);
      return Number((after - before).toFixed(4));
    };

    return {
      binaryMessages: bench.binaryMessages,
      dispatchMs: distribution(bench.dispatchMs),
      enqueueMs: distribution(bench.enqueueMs),
      jsHeapUsedBytes: Number(metrics.JSHeapUsedSize || 0),
      longTaskMs: distribution(bench.longTasks),
      messages: bench.messages,
      renderLatencyMs: distribution(bench.renderLatencyMs),
      rendererLayoutSeconds: deltaSeconds("LayoutDuration"),
      rendererScriptSeconds: deltaSeconds("ScriptDuration"),
      rendererTaskSeconds: deltaSeconds("TaskDuration"),
      textBytes: bench.textBytes,
      writeMs: distribution(bench.writeMs)
    };
  }

  async close() {
    await this.context.close().catch(() => {});
    await this.browser.close().catch(() => {});
  }
}

/**
 * @param {{ port: number, chromium: import("@playwright/test").BrowserType }} options
 */
/**
 * @param {{ port: number, chromium: import("@playwright/test").BrowserType, sessionId?: string }} options
 */
async function startRendererLane({ port, chromium, sessionId }) {
  const browser = await chromium.launch({ headless: true });
  try {
    // A wide viewport keeps the renderer's own PTY fit well clear of the record
    // width, so the lane cannot silently turn the workload into wrapped lines.
    const context = await browser.newContext({ viewport: { height: 1200, width: 2560 } });
    const page = await context.newPage();
    await page.addInitScript(installInstrumentation);
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.enqueueTerminalOutput === "function"
      && typeof window.writeTerminal === "function", null, { timeout: 30000 });
    const wrapped = await page.evaluate(wrapRendererFunctions);
    if (!wrapped) throw new Error("Renderer lane could not wrap the output path.");
    // A delivered message proves both that the socket is open and that the
    // instrumentation wrapper is in the dispatch path. Reading a status label
    // would only prove the former.
    await page.waitForFunction(() => window.__mtBench.messages > 0, null, { timeout: 30000 });
    if (sessionId) {
      // Without a pane bound to the benchmark session the renderer drops its
      // output, and the lane would silently report a zero-cost render path.
      // "attached" rather than "visible": a restored session can land on a
      // non-active page, and the write path still runs there.
      await page.waitForSelector(`.terminal-pane[data-id="${sessionId}"]`, { state: "attached", timeout: 30000 });
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    return new RendererLane({ browser, cdp, context, page });
  } catch (error) {
    // Playwright keeps the browser process alive until it is closed, so a
    // failure here would otherwise hang the whole benchmark process.
    await browser.close().catch(() => {});
    throw error;
  }
}

module.exports = { RendererLane, installInstrumentation, startRendererLane, wrapRendererFunctions };
