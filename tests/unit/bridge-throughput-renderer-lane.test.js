/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

"use strict";

const {
  RendererLane,
  installInstrumentation,
  startRendererLane,
  wrapRendererFunctions
} = require("../../benchmarks/bridge-throughput/renderer-lane");

function createBench() {
  return {
    binaryMessages: 0,
    dispatchMs: [],
    enqueueMs: [],
    longTasks: [],
    messages: 0,
    renderLatencyMs: [],
    textBytes: 0,
    writeMs: []
  };
}

describe("bridge throughput renderer instrumentation", () => {
  const originals = {};

  beforeEach(() => {
    for (const name of ["window", "WebSocket", "PerformanceObserver", "performance"]) {
      originals[name] = global[name];
    }
    global.window = {};
    global.performance = { now: vi.fn(() => 5), timeOrigin: 1_000 };
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete global[name];
      else global[name] = value;
    }
    vi.restoreAllMocks();
  });

  it("counts text, binary, dispatch, and long-task activity around message listeners", () => {
    let observerCallback;
    global.PerformanceObserver = class {
      constructor(callback) {
        observerCallback = callback;
      }

      observe(options) {
        this.options = options;
      }
    };
    global.WebSocket = class {
      constructor() {
        this.listeners = [];
      }

      addEventListener(type, listener, options) {
        this.listeners.push({ listener, options, type });
        return "registered";
      }
    };
    performance.now.mockReturnValueOnce(10).mockReturnValueOnce(13).mockReturnValueOnce(20).mockReturnValueOnce(25);

    installInstrumentation();
    const socket = new WebSocket();
    const ordinary = vi.fn();
    expect(socket.addEventListener("open", ordinary, { once: true })).toBe("registered");
    expect(socket.addEventListener("message", null)).toBe("registered");
    const textListener = vi.fn(() => "text-result");
    const binaryListener = vi.fn(() => { throw new Error("listener failed"); });
    socket.addEventListener("message", textListener);
    socket.addEventListener("message", binaryListener);

    expect(socket.listeners[2].listener.call(socket, { data: "hello" })).toBe("text-result");
    expect(() => socket.listeners[3].listener.call(socket, { data: Buffer.from([1, 2]) })).toThrow("listener failed");
    observerCallback({ getEntries: () => [{ duration: 12 }, { duration: 34 }] });

    expect(window.__mtBench).toMatchObject({
      binaryMessages: 1,
      dispatchMs: [3, 5],
      longTasks: [12, 34],
      messages: 2,
      textBytes: 5
    });
    expect(textListener.mock.instances[0]).toBe(socket);
  });

  it("keeps instrumentation usable when long-task observation is unavailable", () => {
    global.WebSocket = class { addEventListener() {} };
    global.PerformanceObserver = class { constructor() { throw new Error("unsupported"); } };
    expect(() => installInstrumentation()).not.toThrow();
    expect(window.__mtBench.longTasks).toEqual([]);
  });

  it("wraps renderer enqueue/write functions and extracts valid record latency", () => {
    window.__mtBench = createBench();
    const enqueued = [];
    const written = [];
    window.enqueueTerminalOutput = function enqueue(terminal, data) {
      enqueued.push([this, terminal, data]);
      if (data === "throw") throw new Error("enqueue failed");
      return "enqueued";
    };
    window.writeTerminal = function write(terminal, data) {
      written.push([this, terminal, data]);
      if (data === "throw") throw new Error("write failed");
      return "written";
    };
    performance.now
      .mockReturnValueOnce(1).mockReturnValueOnce(3)
      .mockReturnValueOnce(4).mockReturnValueOnce(7)
      .mockReturnValueOnce(10).mockReturnValueOnce(12)
      .mockReturnValueOnce(20).mockReturnValueOnce(24)
      .mockReturnValueOnce(30).mockReturnValueOnce(35)
      .mockReturnValueOnce(40).mockReturnValueOnce(46)
      .mockReturnValueOnce(50).mockReturnValueOnce(57)
      .mockReturnValueOnce(60).mockReturnValueOnce(68)
      .mockReturnValueOnce(70).mockReturnValueOnce(79);

    expect(wrapRendererFunctions()).toBe(true);
    expect(window.enqueueTerminalOutput({ id: 1 }, "data")).toBe("enqueued");
    expect(() => window.enqueueTerminalOutput({ id: 1 }, "throw")).toThrow("enqueue failed");
    expect(window.writeTerminal({ id: 1 }, Buffer.from("binary"))).toBe("written");
    window.writeTerminal({}, "ordinary output");
    window.writeTerminal({}, "MTB|missing separators");
    window.writeTerminal({}, "MTB|1|missing stamp terminator");
    window.writeTerminal({}, "MTB|1|invalid|");
    window.writeTerminal({}, "MTB|1|0|");
    window.writeTerminal({}, "MTB|1|1000000|");

    expect(window.__mtBench.enqueueMs).toEqual([2, 3]);
    expect(window.__mtBench.writeMs).toHaveLength(7);
    expect(window.__mtBench.renderLatencyMs).toEqual([5]);
    expect(enqueued).toHaveLength(2);
    expect(written).toHaveLength(7);
  });

  it("reports that wrapping is incomplete when renderer globals are missing", () => {
    window.__mtBench = createBench();
    window.enqueueTerminalOutput = null;
    window.writeTerminal = null;
    expect(wrapRendererFunctions()).toBe(false);
  });
});

describe("bridge throughput RendererLane", () => {
  const originalWindow = global.window;

  beforeEach(() => {
    global.window = { __mtBench: createBench() };
  });

  afterEach(() => {
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  });

  it("marks a baseline, clears counters, and summarizes renderer deltas", async () => {
    const snapshots = [
      { metrics: [{ name: "LayoutDuration", value: 1 }, { name: "ScriptDuration", value: 2 }] },
      { metrics: [
        { name: "LayoutDuration", value: 1.25 },
        { name: "ScriptDuration", value: 2.5 },
        { name: "TaskDuration", value: 3 },
        { name: "JSHeapUsedSize", value: 4096 }
      ] }
    ];
    const cdp = { send: vi.fn(async () => snapshots.shift()) };
    const page = { evaluate: vi.fn(async (callback) => callback()) };
    const context = { close: vi.fn(async () => {}) };
    const browser = { close: vi.fn(async () => {}) };
    Object.assign(window.__mtBench, {
      binaryMessages: 2,
      dispatchMs: [1],
      enqueueMs: [2],
      longTasks: [3],
      messages: 4,
      renderLatencyMs: [5],
      textBytes: 6,
      writeMs: [7]
    });
    const lane = new RendererLane({ browser, cdp, context, page });

    await lane.mark();
    expect(window.__mtBench).toMatchObject({
      binaryMessages: 0,
      dispatchMs: [],
      enqueueMs: [],
      longTasks: [],
      messages: 0,
      renderLatencyMs: [],
      textBytes: 0,
      writeMs: []
    });
    Object.assign(window.__mtBench, {
      binaryMessages: 1,
      dispatchMs: [2, 4],
      enqueueMs: [3],
      longTasks: [20],
      messages: 2,
      renderLatencyMs: [8],
      textBytes: 100,
      writeMs: [5]
    });
    const summary = await lane.summarize();

    expect(summary).toMatchObject({
      binaryMessages: 1,
      jsHeapUsedBytes: 4096,
      messages: 2,
      rendererLayoutSeconds: 0.25,
      rendererScriptSeconds: 0.5,
      rendererTaskSeconds: 3,
      textBytes: 100
    });
    expect(summary.dispatchMs).toMatchObject({ count: 2, mean: 3 });
    await lane.close();
    expect(context.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("uses zero baselines and swallows close failures", async () => {
    const lane = new RendererLane({
      browser: { close: vi.fn(async () => { throw new Error("browser close"); }) },
      context: { close: vi.fn(async () => { throw new Error("context close"); }) },
      page: { evaluate: vi.fn(async () => window.__mtBench) },
      cdp: { send: vi.fn(async () => ({ metrics: [] })) }
    });
    const summary = await lane.summarize();
    expect(summary).toMatchObject({
      jsHeapUsedBytes: 0,
      rendererLayoutSeconds: 0,
      rendererScriptSeconds: 0,
      rendererTaskSeconds: 0
    });
    await expect(lane.close()).resolves.toBeUndefined();
  });
});

describe("bridge throughput renderer lane startup", () => {
  function createBrowserHarness({ wrapped = true, failNewPage = false, rejectClose = false } = {}) {
    const cdp = { send: vi.fn(async () => ({})) };
    let waitIndex = 0;
    const page = {
      addInitScript: vi.fn(async () => {}),
      evaluate: vi.fn(async () => wrapped),
      goto: vi.fn(async () => {}),
      waitForFunction: vi.fn(async (predicate) => {
        const previousWindow = global.window;
        try {
          if (waitIndex === 0) {
            global.window = {};
            expect(predicate()).toBe(false);
            global.window.enqueueTerminalOutput = () => {};
            expect(predicate()).toBe(false);
            global.window.writeTerminal = () => {};
            expect(predicate()).toBe(true);
          } else {
            global.window = { __mtBench: { messages: 1 } };
            expect(predicate()).toBe(true);
          }
          waitIndex += 1;
        } finally {
          if (previousWindow === undefined) delete global.window;
          else global.window = previousWindow;
        }
      }),
      waitForSelector: vi.fn(async () => {})
    };
    const context = {
      close: vi.fn(async () => {}),
      newCDPSession: vi.fn(async () => cdp),
      newPage: vi.fn(async () => {
        if (failNewPage) throw new Error("new page failed");
        return page;
      })
    };
    const browser = {
      close: vi.fn(async () => {
        if (rejectClose) throw new Error("close failed");
      }),
      newContext: vi.fn(async () => context)
    };
    const chromium = { launch: vi.fn(async () => browser) };
    return { browser, cdp, chromium, context, page };
  }

  it("starts an instrumented lane and waits for an attached benchmark session", async () => {
    const harness = createBrowserHarness();
    const lane = await startRendererLane({
      chromium: harness.chromium,
      port: 3199,
      sessionId: "session-1"
    });

    expect(lane).toBeInstanceOf(RendererLane);
    expect(harness.chromium.launch).toHaveBeenCalledWith({ headless: true });
    expect(harness.browser.newContext).toHaveBeenCalledWith({ viewport: { height: 1200, width: 2560 } });
    expect(harness.page.addInitScript).toHaveBeenCalledWith(installInstrumentation);
    expect(harness.page.goto).toHaveBeenCalledWith("http://127.0.0.1:3199/", { waitUntil: "domcontentloaded" });
    expect(harness.page.evaluate).toHaveBeenCalledWith(wrapRendererFunctions);
    expect(harness.page.waitForFunction).toHaveBeenCalledTimes(2);
    expect(harness.page.waitForSelector).toHaveBeenCalledWith(
      '.terminal-pane[data-id="session-1"]',
      { state: "attached", timeout: 30000 }
    );
    expect(harness.cdp.send).toHaveBeenCalledWith("Performance.enable");
  });

  it("does not wait for a pane when no benchmark session is requested", async () => {
    const harness = createBrowserHarness();
    await startRendererLane({ chromium: harness.chromium, port: 3200 });
    expect(harness.page.waitForSelector).not.toHaveBeenCalled();
  });

  it("closes the browser when wrapping or page startup fails", async () => {
    const unwrap = createBrowserHarness({ wrapped: false });
    await expect(startRendererLane({ chromium: unwrap.chromium, port: 3201 }))
      .rejects.toThrow("could not wrap");
    expect(unwrap.browser.close).toHaveBeenCalledOnce();

    const pageFailure = createBrowserHarness({ failNewPage: true, rejectClose: true });
    await expect(startRendererLane({ chromium: pageFailure.chromium, port: 3202 }))
      .rejects.toThrow("new page failed");
    expect(pageFailure.browser.close).toHaveBeenCalledOnce();
  });
});