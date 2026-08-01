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

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

test.describe.configure({ mode: "serial" });

test.describe("Renderer coverage completion", () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      permissions: ["clipboard-read", "clipboard-write", "notifications"]
    });
    page = await context.newPage();
    await startRendererCoverage(page);
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });

  test.afterAll(async () => {
    await page.evaluate(() => {
      state.settings.keepSessionsOnClose = true;
      closeAllTerminals();
    });
    await page.evaluate(() => new Promise((resolve, reject) => {
      const socket = new WebSocket(`${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`);
      socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "killAll" })));
      socket.addEventListener("error", () => reject(new Error("cleanup socket failed")));
      window.setTimeout(() => { socket.close(); resolve(); }, 500);
    }));
    await stopRendererCoverage(page, "coverage-completion");
    await context.close();
  });

  test("classifies every input detector fallback and block shape", async () => {
    const result = await page.evaluate(async () => {
      const d = window.InputPromptDetector;
      const classifications = {
        nullAnsi: d.stripAnsi(null),
        emptyShell: d.isShellPrompt(null),
        shell: d.isShellPrompt("PS C:\\work>"),
        weak: d.classifyInputPrompt("Widget ready?"),
        weakMid: d.classifyInputPrompt("Widget ready?", { cursorAtLineEnd: false }),
        weakExcluded: d.classifyInputPrompt("Warning:"),
        questionList: d.classifyInputPromptBlock(["Question", "1. Alpha", "Pick:"]),
        menuHeader: d.classifyInputPromptBlock("Choose:\n1. Alpha\n2. Beta".split("\n")),
        menuTail: d.classifyInputPromptBlock(["1. Alpha", "2. Beta", ">"]),
        noBlock: d.classifyInputPromptBlock(["ordinary output"]),
        emptyBlock: d.classifyInputPromptBlock(["", "  "]),
        shellBlock: d.classifyInputPromptBlock(["Question", "1. Alpha", "PS C:\\work>"]),
        looksBlock: d.looksLikeInputPromptBlock(["Question", "1. Alpha"]),
        looksSingle: d.looksLikeInputPrompt("Password:")
      };
      window.module = { exports: {} };
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/input-detection.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
      classifications.commonJsApi = Object.keys(window.module.exports).sort();
      delete window.module;
      return classifications;
    });

    expect(result).toMatchObject({
      nullAnsi: "",
      emptyShell: true,
      shell: true,
      weak: { category: "generic", confidence: "low" },
      weakMid: null,
      weakExcluded: null,
      questionList: { category: "question", confidence: "high" },
      menuHeader: { category: "select", confidence: "high" },
      menuTail: { category: "select", confidence: "high" },
      noBlock: null,
      emptyBlock: null,
      shellBlock: null,
      looksBlock: true,
      looksSingle: true,
      commonJsApi: ["PROMPT_PATTERNS", "SHELL_PROMPT_PATTERNS", "classifyInputPrompt", "classifyInputPromptBlock", "isShellPrompt", "looksLikeInputPrompt", "looksLikeInputPromptBlock", "stripAnsi"]
    });
  });

  test("records malformed global errors and all log-console outcomes", async () => {
    const result = await page.evaluate(async () => {
      const oldMax = logStore.max;
      logStore.entries = [];
      logStore.max = 2;
      logEvent("bogus", "", 42, { circular: true });
      const circular = {};
      circular.self = circular;
      const safeCircular = safeLogDetail(circular);
      logEvent("warn", "probe", "warning");
      logEvent("error", "probe", "failure", circular);
      window.dispatchEvent(new ErrorEvent("error", { message: "boom", filename: "probe.js", lineno: 3, colno: 4 }));
      window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", { promise: Promise.resolve(), reason: new Error("rejected") }));
      window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", { promise: Promise.resolve(), reason: "string rejection" }));

      setLogPanel(true);
      logStore.minLevel = "error";
      renderAllLogs();
      const filteredRows = elements.logOutput.querySelectorAll(".log-row").length;
      logStore.minLevel = "debug";
      renderAllLogs();
      const allRows = elements.logOutput.querySelectorAll(".log-row").length;
      elements.logOutput.scrollTop = 0;
      elements.logOutput.dispatchEvent(new Event("scroll"));

      const originalWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
      const copied = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (text) => { copied.push(text); }, readText: async () => "" }
      });
      copyLogs();
      await Promise.resolve();
      logStore.entries = [];
      copyLogs();
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
      logEvent("info", "probe", "copy rejection");
      copyLogs();
      await Promise.resolve();
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: originalWrite } });

      clearLogs();
      setLogPanel(false);
      logStore.max = oldMax;
      return { safeCircular, filteredRows, allRows, copied: copied.length, unseen: logStore.unseenError };
    });

    expect(result.safeCircular).toBe("[object Object]");
    expect(result.filteredRows).toBeGreaterThan(0);
    expect(result.allRows).toBeGreaterThanOrEqual(result.filteredRows);
    expect(result.copied).toBe(1);
  });

  test("handles bridge frames, pending requests, reconnect guards, and transport failures", async () => {
    const result = await page.evaluate(async () => {
      const originalSocket = state.socket;
      const terminal = [...state.terminals.values()][0];
      const writes = [];
      const oldWriteln = terminal.term.writeln.bind(terminal.term);
      terminal.term.writeln = (text) => writes.push(text);

      handleBridgeMessage({ type: "output", id: "missing", data: "ignored" });
      handleBridgeMessage({ type: "logStarted", id: "missing", path: "D:\\missing.log" });
      handleBridgeMessage({ type: "logStopped", id: "missing" });
      handleBridgeMessage({ type: "logError", message: "log failed" });
      handleBridgeMessage({ type: "revealError", message: "reveal failed" });
      handleBridgeMessage({ type: "openError", message: "open failed" });
      handleBridgeMessage({ type: "elevateStarted", shell: "cmd" });
      handleBridgeMessage({ type: "elevateError", id: "missing", message: "elevation failed" });
      handleBridgeMessage({ type: "exited", id: "missing" });
      handleBridgeMessage({ type: "createFailed", id: "missing", message: "create failed" });
      handleBridgeMessage({ type: "error", id: terminal.id, message: "session failed" });
      handleBridgeMessage({ type: "error", message: "bridge failed" });
      terminal.term.writeln = oldWriteln;

      state.socketReady = true;
      state.socket = { readyState: WebSocket.OPEN, send: () => { throw new Error("send failed"); } };
      const sendFailed = sendBridge({ type: "probe" });
      state.socketReady = false;
      const offline = sendBridge({ type: "probe" });
      const noRequest = resolveBridgeRequest({}, "value");
      const quickNull = await requestBridge({ type: "probe" }, { timeout: 2 });

      state.bridgeClosingDown = true;
      scheduleReconnect();
      state.bridgeClosingDown = false;
      state.reconnectTimer = 1;
      scheduleReconnect();
      state.reconnectTimer = null;

      state.socket = originalSocket;
      state.socketReady = originalSocket?.readyState === WebSocket.OPEN;
      return { sendFailed, offline, noRequest, quickNull, writes };
    });

    expect(result).toMatchObject({ sendFailed: false, offline: false, noRequest: false, quickNull: null });
  });

  test("executes startup controls, bridge listeners, and xterm callbacks through real events", async () => {
    const result = await page.evaluate(async () => {
      const click = (element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      const key = (element, value, init = {}) => element.dispatchEvent(new KeyboardEvent("keydown", {
        key: value, code: init.code || "", bubbles: true, cancelable: true, ...init
      }));
      const pointer = (element, type, init = {}) => element.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, button: 0, pointerId: 91, clientX: 20, clientY: 20, ...init
      }));

      const oldTheme = state.settings.appTheme;
      state.settings.appTheme = "system";
      systemThemeQuery.dispatchEvent(new Event("change"));
      state.settings.appTheme = oldTheme;

      openHelp();
      pointer(elements.helpOverlay, "pointerdown");
      openAbout();
      pointer(elements.aboutOverlay, "pointerdown");
      openShortcuts();
      pointer(elements.shortcutsOverlay, "pointerdown");
      click(elements.statusZoomOut);
      click(elements.statusZoomIn);
      click(elements.broadcastEnter);
      toggleBroadcast(true);
      elements.broadcastInput.value = "";
      key(elements.broadcastInput, "Enter");
      key(elements.broadcastInput, "Escape");
      elements.workspaceName.value = "";
      click(elements.workspaceSave);
      click(elements.workspaceRestore);
      click(elements.workspaceDelete);
      elements.terminalSearchInput.value = "coverage-event";
      elements.terminalSearchInput.dispatchEvent(new Event("input", { bubbles: true }));

      const oldNotification = window.Notification;
      let permissionRequests = 0;
      class PermissionProbe {
        static permission = "default";
        static requestPermission() { permissionRequests += 1; }
      }
      window.Notification = PermissionProbe;
      for (const toggle of [elements.notifyActivity, elements.notifySilence, elements.bellNotify]) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event("change", { bubbles: true }));
      }
      window.Notification = oldNotification;
      elements.snippetName.value = "";
      elements.snippetCommand.value = "";
      click(elements.snippetAdd);
      key(elements.snippetCommand, "Enter");

      const socket = state.socket;
      socket.dispatchEvent(new MessageEvent("message", { data: "{" }));
      socket.dispatchEvent(new Event("error"));
      state.socketReady = true;

      closeAllTerminals();
      const terminal = addTerminal({ title: "Event terminal" });
      await new Promise((resolve) => setTimeout(resolve, 30));
      terminal.term._core._onData.fire("coverage input");
      terminal.term._core._onData.fire("\x1b[I");
      terminal.term._core._onResize.fire({ cols: 91, rows: 27 });
      terminal.term._core._onBell.fire();
      terminal.term._core._onSelectionChange.fire();

      terminal.titleInput.value = "  ";
      terminal.titleInput.dispatchEvent(new Event("change", { bubbles: true }));
      key(terminal.titleInput, "Enter");
      key(terminal.titleInput, "x");
      key(terminal.titleInput, "Enter", { isComposing: true });

      const actions = terminal.pane.querySelector(".pane-actions");
      click(actions);
      for (const action of ["clear", "copy", "color", "find", "maximize", "more", "minimize", "move-left", "move-right"]) {
        const button = terminal.pane.querySelector(`[data-action="${action}"]`);
        if (button) click(button);
      }
      if (terminal.minimized) restoreTerminal(terminal.id);
      terminal.statusElement.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
      terminal.statusElement.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      hideContextMenu();

      pointer(terminal.pane, "pointerdown", { target: terminal.pane });
      terminal.pane.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 91 }));
      terminal.pane.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 1 }));
      terminal.pane.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2 }));
      const bar = terminal.pane.querySelector(".pane-bar");
      pointer(bar, "pointerdown", { button: 1 });
      pointer(bar, "pointerdown");
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 999, clientX: 30, clientY: 30 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 91, clientX: 80, clientY: 80 }));
      window.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 91 }));

      attachRipples();
      document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 1 }));
      const disabled = document.createElement("button");
      disabled.disabled = true;
      document.body.append(disabled);
      pointer(disabled, "pointerdown");
      disabled.remove();
      const rippleButton = document.createElement("button");
      document.body.append(rippleButton);
      pointer(rippleButton, "pointerdown", { clientX: 2, clientY: 2 });
      rippleButton.querySelector(".ripple")?.dispatchEvent(new Event("animationend"));
      rippleButton.remove();

      return { permissionRequests, title: terminal.titleInput.value, socketReady: state.socketReady };
    });

    expect(result.permissionRequests).toBe(3);
    expect(result.title).toBe("PowerShell");
  });

  test("covers terminal lifecycle guard, elevation, selection, notification, and renderer fallbacks @full", async () => {
    const result = await page.evaluate(async () => {
      closeAllTerminals();
      const first = addTerminal({ title: "Coverage A", shell: "pwsh" });
      const second = addTerminal({ title: "Coverage B", shell: "cmd", elevated: true });
      await new Promise((resolve) => setTimeout(resolve, 30));

      applyElevationBadge();
      state.appElevated = true;
      applyElevationBadge();
      state.appElevated = false;
      const previousMultiterm = window.multiterm;
      window.multiterm = { isElevated: async () => { throw new Error("probe"); }, restartAsAdmin: async () => false };
      await refreshElevationStatus();
      await restartAsAdmin();
      window.multiterm.restartAsAdmin = async () => { throw new Error("probe"); };
      await restartAsAdmin();
      delete window.multiterm.restartAsAdmin;
      await restartAsAdmin();

      requestSession(second);
      const missingRemove = removeTerminal("missing");
      state.socketReady = false;
      first.remoteRequested = true;
      removeTerminal(first.id);
      state.socketReady = true;

      const fakePane = document.createElement("div");
      fakePane.className = "terminal-pane";
      const fakeStatus = document.createElement("span");
      const fake = {
        id: "coverage-fake", pane: fakePane, statusElement: fakeStatus,
        titleInput: { value: "Fake" }, term: { dispose() { throw new Error("dispose"); } },
        observer: { disconnect() {} }, pendingOutput: [], pendingOutputBytes: 0,
        outputFlushHandle: 0, outputFlushTimer: 0,
        webglAddon: { dispose() { throw new Error("gl"); } }, webglRecoveryHandle: 0
      };
      state.terminals.set(fake.id, fake);
      state.manualLayouts[fake.id] = { x: 0, y: 0, w: 1, h: 1 };
      disposeTerminal(fake);

      const oldNotification = window.Notification;
      let permissionRequests = 0;
      class GrantedNotification {
        static permission = "granted";
        constructor(title, options) { this.title = title; this.options = options; GrantedNotification.last = this; }
        close() { this.closed = true; }
      }
      window.Notification = GrantedNotification;
      notifyDesktop("with terminal", second);
      GrantedNotification.last.onclick();
      notifyDesktop("without terminal");
      class DefaultNotification { static permission = "default"; static requestPermission() { permissionRequests += 1; } }
      window.Notification = DefaultNotification;
      notifyDesktop("permission");
      class ThrowingNotification { static permission = "granted"; constructor() { throw new Error("blocked"); } }
      window.Notification = ThrowingNotification;
      notifyDesktop("blocked");
      delete window.Notification;
      notifyDesktop("unsupported");
      window.Notification = oldNotification;

      markSessionLostWhileOffline(second);
      markSessionLostWhileOffline(second);
      setAwaitingInput(second, true);
      setAwaitingInput(second, false);
      firstVisibleTerminalId();
      countVisibleTerminals();
      minimizeTerminal("missing");
      restoreTerminal("missing");

      window.multiterm = previousMultiterm;
      return { permissionRequests, secondExited: second.status };
    });

    expect(result.permissionRequests).toBe(1);
    expect(result.secondExited).toBe("exited");
  });

  test("covers WebGL, output batching, prompt buffers, selection, and pane-order fallbacks", async () => {
    const result = await page.evaluate(async () => {
      closeAllTerminals();
      const first = addTerminal({ title: "Render first" });
      const second = addTerminal({ title: "Render second" });
      await new Promise((resolve) => setTimeout(resolve, 30));

      const screen = first.screen;
      screen.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 1 }));
      first.term.element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      first.term.element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2 }));
      first.term.element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 1 }));
      first.term.element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));

      const oldClipboard = navigator.clipboard;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error("selection denied")), readText: async () => "" }
      });
      state.settings.copyOnSelect = true;
      first.term.selectAll();
      first.term._core._onSelectionChange.fire();
      state.settings.copyOnSelect = false;
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: oldClipboard });

      const oldWebgl = window.WebglAddon;
      delete window.WebglAddon;
      rebalanceWebglRenderers();
      const noCtor = attachWebglRenderer(first);
      class ThrowCtor { constructor() { throw new Error("ctor"); } }
      window.WebglAddon = { WebglAddon: ThrowCtor };
      const ctorFailure = attachWebglRenderer(first);

      let contextLoss;
      let disposed = 0;
      class ProbeAddon {
        onContextLoss(fn) { contextLoss = fn; }
        dispose() { disposed += 1; }
      }
      window.WebglAddon = { WebglAddon: ProbeAddon };
      const oldLoadAddon = first.term.loadAddon.bind(first.term);
      first.term.loadAddon = () => { throw new Error("load"); };
      const loadFailure = attachWebglRenderer(first);
      first.term.loadAddon = () => {};
      const addon = attachWebglRenderer(first);
      contextLoss();
      first.webglAddon = { dispose() { throw new Error("gone"); } };
      detachWebglRenderer(first);
      first.webglAddon = null;
      first.term.refresh = () => { throw new Error("refresh"); };
      detachWebglRenderer(first);

      let staleLoss;
      class StaleAddon {
        onContextLoss(fn) { staleLoss = fn; }
        dispose() { disposed += 1; throw new Error("stale gone"); }
      }
      window.WebglAddon = { WebglAddon: StaleAddon };
      first.term.loadAddon = () => {};
      const stale = attachWebglRenderer(first);
      first.webglAddon = { dispose() {} };
      staleLoss();

      first.webglRecoveryHandle = 0;
      first.webglLossTimes = [performance.now(), performance.now(), performance.now()];
      scheduleWebglRecovery(first);
      scheduleWebglRecovery(first);
      clearTimeout(first.webglRecoveryHandle);
      first.webglRecoveryHandle = 0;
      window.WebglAddon = oldWebgl;
      first.term.loadAddon = oldLoadAddon;

      const emptyTerminal = { pendingOutput: [], pendingOutputBytes: 0, outputFlushHandle: 0, outputFlushTimer: 0 };
      flushTerminalOutput(emptyTerminal);
      const writes = [];
      const outputProbe = {
        id: "output-probe", pendingOutput: ["a", "b"], pendingOutputBytes: 2,
        outputFlushHandle: 1, outputFlushTimer: 0,
        term: { write: (value) => writes.push(value), scrollToBottom() {} },
        pane: document.createElement("div"), titleInput: { value: "Probe" },
        createdAt: performance.now(), searchText: "", status: "live"
      };
      state.settings.notifyActivity = false;
      state.settings.notifySilence = false;
      flushTerminalOutput(outputProbe);

      // Enqueue paths: a visible window schedules on rAF, a hidden one falls back
      // to a timer, and a pane whose backlog passes the configured ceiling drains
      // straight away rather than hoarding a whole transcript.
      const enqueueWrites = [];
      const makeEnqueueProbe = () => ({
        id: "enqueue-probe", pendingOutput: [], pendingOutputBytes: 0,
        outputFlushHandle: 0, outputFlushTimer: 0,
        term: { write: (value) => enqueueWrites.push(value.length), scrollToBottom() {} },
        pane: document.createElement("div"), titleInput: { value: "Enqueue" },
        createdAt: performance.now(), searchText: "", status: "live"
      });
      const priorBacklogKb = state.settings.outputBacklogKb;
      const framed = makeEnqueueProbe();
      enqueueTerminalOutput(framed, "x");
      const scheduledFrame = framed.outputFlushHandle !== 0;
      // A second chunk must ride the already-armed frame rather than arming another.
      enqueueTerminalOutput(framed, "y");
      const reusedFrame = framed.pendingOutput.length === 2;
      cancelTerminalOutputFlush(framed);

      const hidden = makeEnqueueProbe();
      const hiddenDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      enqueueTerminalOutput(hidden, "z");
      const scheduledTimer = hidden.outputFlushTimer !== 0;
      cancelTerminalOutputFlush(hidden);
      const clearedTimer = hidden.outputFlushTimer === 0;
      Object.defineProperty(document, "hidden", hiddenDescriptor);

      const overflowing = makeEnqueueProbe();
      state.settings.outputBacklogKb = 64;
      enqueueTerminalOutput(overflowing, "!".repeat(64 * 1024));
      const drainedOnOverflow = overflowing.pendingOutput.length === 0;
      // A nonsense ceiling falls back to the default rather than flushing per byte.
      state.settings.outputBacklogKb = "not-a-number";
      const fallbackBacklog = outputBacklogLimitBytes();
      state.settings.outputBacklogKb = priorBacklogKb;
      flushAllTerminalOutput();

      // Both performance fields fold typos back to something usable and write the
      // corrected value into the field; the real bindings push the batching window
      // across to the bridge on change.
      const priorCoalesce = state.settings.outputCoalesceMs;
      elements.outputCoalesceMs.value = "500";
      elements.outputCoalesceMs.dispatchEvent(new Event("change"));
      const clampedField = elements.outputCoalesceMs.value;
      elements.outputCoalesceMs.value = String(priorCoalesce);
      elements.outputCoalesceMs.dispatchEvent(new Event("change"));
      const numberField = document.createElement("input");
      const clamped = [
        clampOutputCoalesceMs("-3", numberField),
        clampOutputCoalesceMs("abc", numberField),
        clampOutputBacklogKb("99999999", numberField),
        clampOutputBacklogKb("nonsense", numberField)
      ];

      // An older bridge answers "config" with an error frame; batching just stays off.
      handleBridgeMessage({ type: "error", message: "Unsupported message type: config" });

      state.settings.highlightInputPrompts = true;
      const lines = ["Question", "1. Alpha", "2. Beta", "Choose:", ""];
      const buffer = {
        type: "normal", baseY: 0, cursorY: 4, cursorX: 0,
        getLine(row) {
          const text = lines[row];
          return text === undefined ? null : { translateToString: () => text };
        }
      };
      const promptPane = document.createElement("div");
      const prompt = { id: "prompt", status: "live", awaitingInput: false, pane: promptPane, term: { buffer: { active: buffer } }, titleInput: { value: "Prompt" } };
      evaluateInputPrompt(prompt);

      const oldActive = state.activeId;
      state.activeId = first.id;
      first.createdAt = performance.now() - 5000;
      second.createdAt = performance.now() - 5000;
      state.settings.notifyActivity = true;
      state.settings.notifySilence = true;
      state.settings.silenceSeconds = 0;
      handleOutputNotifications(second);
      second.lastActivityNotify = performance.now();
      handleOutputNotifications(second);
      second.hadOutput = false;
      clearTimeout(second.silenceTimer);
      state.activeId = oldActive;

      const noHit = paneUnderPoint(-100, -100, first.pane);
      const originalRect = second.pane.getBoundingClientRect.bind(second.pane);
      second.pane.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 });
      const hit = paneUnderPoint(50, 50, first.pane);
      second.pane.getBoundingClientRect = originalRect;
      const before = capturePaneRects(first.pane);
      animatePaneShuffle([], first.pane);
      animatePaneShuffle(before, first.pane);
      const savedSize = state.terminals.size;
      const orphan = document.createElement("div");
      orphan.dataset.id = "orphan";
      elements.host.append(orphan);
      syncTerminalOrderToDom();
      orphan.remove();
      syncTerminalOrderToDom();

      return {
        noCtor: noCtor === null,
        ctorFailure: ctorFailure === null,
        loadFailure: loadFailure === null,
        addon: Boolean(addon), stale: Boolean(stale), disposed,
        writes, prompt: prompt.awaitingInput, noHit: noHit === null, hit: Boolean(hit), savedSize,
        scheduledFrame, reusedFrame, scheduledTimer, clearedTimer,
        drainedOnOverflow, enqueueWrites, fallbackBacklog, clampedField, clamped
      };
    });

    expect(result).toMatchObject({
      noCtor: true,
      ctorFailure: true,
      loadFailure: true,
      addon: true,
      stale: true,
      writes: ["ab"],
      prompt: true,
      noHit: true,
      hit: true,
      scheduledFrame: true,
      reusedFrame: true,
      scheduledTimer: true,
      clearedTimer: true,
      drainedOnOverflow: true,
      // Only the pane that passed its ceiling drained; the other two were cancelled.
      enqueueWrites: [64 * 1024],
      fallbackBacklog: 1024 * 1024,
      clampedField: "100",
      clamped: [0, 8, 65536, 1024]
    });
  });

  test("covers layout, search, prompt, resize, memory, storage, and utility edge behavior", async () => {
    const result = await page.evaluate(async () => {
      let terminal = [...state.terminals.values()][0];
      if (!terminal) terminal = addTerminal({ title: "Utility" });

      const priorSearch = terminal.searchText;
      // The transcript is only maintained while a query is live, so arm one
      // before feeding it enough text to trip the cap.
      state.terminalSearch = "not-present";
      appendTerminalSearchText(terminal, "x".repeat(SEARCH_TEXT_CAP + SEARCH_TEXT_TRIM_MARGIN + 10));
      updateTerminalSearchVisibility(terminal);
      terminal.searchText += "not-present";
      updateTerminalSearchVisibility(terminal);

      // With no query live the append is skipped and the pane is only marked
      // stale; the next search rebuilds the transcript from the xterm buffer.
      state.terminalSearch = "";
      terminal.searchTextStale = false;
      appendTerminalSearchText(terminal, "dropped-while-idle");
      const wentStale = terminal.searchTextStale;
      state.terminalSearch = "not-present";
      updateTerminalSearchVisibility(terminal);
      const rebuilt = terminal.searchTextStale === false;
      // A second pass is a no-op, and a pane with no xterm yet rebuilds to just
      // its metadata rather than throwing.
      rebuildTerminalSearchText(terminal);
      const bufferless = {
        searchTextStale: true, searchText: "",
        titleInput: { value: "Bufferless" }, statusElement: { textContent: "live" }
      };
      rebuildTerminalSearchText(bufferless);

      clearTerminalSearch();
      clearTerminalSearch();
      stripTerminalControlCodes("\x1b[31mred\x1b[0m\x07");
      normalizeSearchText(null);

      state.settings.highlightInputPrompts = false;
      scheduleInputPromptCheck(terminal);
      state.settings.highlightInputPrompts = true;
      terminal.status = "exited";
      evaluateInputPrompt(terminal);
      terminal.status = "live";
      const oldBuffer = terminal.term.buffer.active;
      Object.defineProperty(terminal.term.buffer, "active", { configurable: true, value: { type: "alternate" } });
      evaluateInputPrompt(terminal);
      Object.defineProperty(terminal.term.buffer, "active", { configurable: true, value: oldBuffer });
      readBufferLine({ getLine: () => null }, 0);
      readBufferWindow({ getLine: () => null }, 2, 4);

      state.settings.scrollbackInfinite = true;
      const infinite = effectiveScrollback();
      state.settings.scrollbackInfinite = false;
      state.settings.scrollback = -1;
      const fallbackScrollback = effectiveScrollback();
      state.settings.scrollback = 20000;

      updatePaneDensity({ pane: { clientWidth: 0, classList: { toggle() {} } } });
      const fitProbe = { fitScheduled: false, pane: document.createElement("div"), fitAddon: { fit() { throw new Error("fit"); } }, term: { cols: 1, rows: 1 } };
      scheduleFit(fitProbe);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      fitProbe.pane.classList.add("is-page-hidden");
      fitProbe.fitScheduled = false;
      scheduleFit(fitProbe);

      const oldSocketReady = state.socketReady;
      state.socketReady = false;
      sendResize(terminal, 111, 22);
      terminal.lastSentCols = 7;
      terminal.lastSentRows = 8;
      sendResize(terminal, 7, 8);
      resizeDragActive = true;
      queueResize(terminal, 9, 9);
      resizeDragActive = false;
      noteWindowResizeDrag();
      endWindowResizeDrag();
      state.socketReady = oldSocketReady;

      const manualA = defaultManualLayout(-5);
      const oldLayout = state.settings.layout;
      state.settings.layout = "auto";
      syncManualLayout(terminal);
      state.settings.layout = "manual";
      syncManualLayout(terminal);
      resetLayout();
      state.settings.layout = oldLayout;

      state.mem.open = true;
      state.mem.unsupported = true;
      state.mem.unsupportedReason = "platform";
      renderMemStatus();
      state.mem.unsupportedReason = "bridge";
      renderMemStatus();
      state.mem.unsupported = false;
      state.mem.stats = null;
      state.mem.requested = false;
      renderMemStatus("probe error");
      updateMemStatus({ error: "failure" });
      updateMemStatus({ supported: false, reason: "platform" });
      state.mem.unsupported = false;
      updateMemStatus({ app: 100, systemUsed: 0, systemTotal: 1000 });
      const bytes = [formatBytes(12), formatBytes(2048), formatBytes(2 * 1024 ** 2), formatBytes(2 * 1024 ** 3)];
      state.mem.open = false;
      setMemStatusText("hidden");

      localStorage.setItem("multiterm.settings", "{");
      const loadedSettings = loadSettings();
      localStorage.setItem("multiterm.manualLayouts", "{");
      const loadedLayouts = loadManualLayouts();
      localStorage.setItem("multiterm.workspaces", "{");
      const loadedWorkspaces = loadWorkspaces();
      localStorage.setItem("multiterm.lastSession", "{");
      const loadedSession = loadSessionSnapshot();
      localStorage.setItem("multiterm.paneOrder", "{");
      const loadedOrder = loadPaneOrder();
      saveSettings();
      saveManualLayouts();

      const oldRandomUUID = window.crypto.randomUUID;
      Object.defineProperty(window.crypto, "randomUUID", { configurable: true, value: undefined });
      const fallbackId = createId();
      Object.defineProperty(window.crypto, "randomUUID", { configurable: true, value: oldRandomUUID });

      return { priorSearch: typeof priorSearch, wentStale, rebuilt, bufferless: bufferless.searchText, infinite, fallbackScrollback, manualA, bytes, loadedSettings: Boolean(loadedSettings), loadedLayouts, loadedWorkspaces, loadedSession, loadedOrder, fallbackId };
    });

    expect(result.wentStale).toBe(true);
    expect(result.rebuilt).toBe(true);
    expect(result.bufferless).toContain("bufferless");
    expect(result.infinite).toBe(1000000);
    expect(result.fallbackScrollback).toBe(20000);
    expect(result.bytes).toEqual(["12 B", "2 KB", "2 MB", "2.0 GB"]);
    expect(result.loadedLayouts).toEqual({});
    expect(result.loadedWorkspaces).toEqual({});
    expect(result.loadedSession).toEqual([]);
    expect(result.loadedOrder).toEqual([]);
    expect(result.fallbackId).toMatch(/^terminal-/);
  });

  test("covers palette, quick switch, pages, workspaces, snippets, and dock editing fallbacks", async () => {
    const result = await page.evaluate(async () => {
      closeAllTerminals();
      const first = addTerminal({ title: "Alpha", cwd: "D:\\alpha" });
      const secondPage = addPage({ name: "Second", activate: false });
      const second = addTerminal({ title: "Beta", pageId: secondPage, cwd: "D:\\beta" });

      quickSwitchKeyFor(QUICK_SWITCH_KEYS.length + 1);
      quickSwitchCandidates("");
      quickSwitchCandidates("alpha");
      moveQuickSwitchSelection(1);
      runQuickSwitchSelection(999);
      openQuickSwitch();
      elements.quickSwitchInput.value = "no-match";
      renderQuickSwitch();
      closeQuickSwitch(false);
      closeQuickSwitch();

      palette.items = [];
      movePaletteSelection(1);
      runPaletteSelection();
      openPalette();
      elements.paletteInput.value = "definitely-no-command";
      renderPalette();
      closePalette();
      closePalette();

      renamePage("missing", "Name");
      renamePage(first.pageId, "");
      setActivePage("missing");
      setActivePage(state.activePageId);
      moveTerminalToPage("missing", secondPage);
      moveTerminalToPage(first.id, "missing");
      moveTerminalToPage(first.id, first.pageId);
      cyclePage(1);
      cyclePage(-1);
      activePage();
      pageById("missing");
      pageName("missing");
      resolvePageId("missing", "missing");
      isOnActivePage(null);

      minimizeTerminal(second.id);
      setMinimizedScope("global");
      setMinimizedScope("global");
      updateMinimizedDock();
      const chip = elements.minimizedDock.querySelector(`.min-chip[data-id="${second.id}"]`);
      startMinChipRename(chip, second);
      startMinChipRename(chip, second);
      const rename = elements.minimizedDock.querySelector(".min-chip-rename");
      rename.value = "Renamed Beta";
      rename.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      restoreTerminal(second.id);

      addSnippet("", "");
      const oldSnippets = state.settings.snippets;
      state.settings.snippets = [];
      renderSnippets();
      addSnippet("", "echo coverage");
      document.querySelector(".snippet-run")?.click();
      document.querySelector(".snippet-del")?.click();
      runSnippet("missing", { command: "echo" });
      runSnippet(first.id, null);
      state.settings.snippets = oldSnippets;

      saveWorkspace("");
      restoreWorkspace("missing");
      deleteWorkspace("missing");
      state.workspaces.Legacy = { settings: {}, terminals: [], pages: null };
      restoreWorkspace("Legacy");
      deleteWorkspace("Legacy");

      removePage("missing");
      while (state.pages.length > 1) removePage(state.pages.at(-1).id);
      removePage(state.pages[0].id);
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { pageCount: state.pages.length, terminalCount: state.terminals.size };
    });

    expect(result.pageCount).toBe(1);
    expect(result.terminalCount).toBeGreaterThan(0);
  });

  test("drives palette, switcher, find bars, and global keyboard controllers", async () => {
    const result = await page.evaluate(async () => {
      const dispatchKey = (target, key, init = {}) => target.dispatchEvent(new KeyboardEvent("keydown", {
        key, code: init.code || "", bubbles: true, cancelable: true, ...init
      }));
      closeAllTerminals();
      const first = addTerminal({ title: "Keyboard one" });
      const second = addTerminal({ title: "Keyboard two" });
      await new Promise((resolve) => setTimeout(resolve, 30));

      ingestServerLog({});
      resetFontZoom();

      openPalette();
      elements.paletteInput.value = "layout";
      elements.paletteInput.dispatchEvent(new Event("input", { bubbles: true }));
      dispatchKey(elements.paletteInput, "ArrowDown");
      dispatchKey(elements.paletteInput, "ArrowUp");
      dispatchKey(elements.paletteInput, "Enter");
      await new Promise((resolve) => setTimeout(resolve, 70));
      openPalette();
      dispatchKey(elements.paletteInput, "Escape");
      openPalette();
      elements.paletteList.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      elements.paletteList.querySelector(".palette-item")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 70));

      openQuickSwitch();
      elements.quickSwitchInput.value = "keyboard";
      elements.quickSwitchInput.dispatchEvent(new Event("input", { bubbles: true }));
      dispatchKey(elements.quickSwitchInput, "ArrowDown");
      dispatchKey(elements.quickSwitchInput, "ArrowUp");
      dispatchKey(elements.quickSwitchInput, "Alt", { altKey: true });
      dispatchKey(elements.quickSwitchInput, "1", { altKey: true });
      await new Promise((resolve) => setTimeout(resolve, 70));
      openQuickSwitch();
      dispatchKey(elements.quickSwitchInput, "Escape");
      openQuickSwitch();
      elements.quickSwitchList.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      elements.quickSwitchList.querySelector(".quick-item")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 70));

      if (first.findInput) {
        first.findInput.value = "probe";
        first.findInput.dispatchEvent(new Event("input", { bubbles: true }));
        dispatchKey(first.findInput, "Enter");
        dispatchKey(first.findInput, "Enter", { shiftKey: true });
        dispatchKey(first.findInput, "Escape");
        first.findBar.querySelector('[data-find="next"]')?.click();
        first.findBar.querySelector('[data-find="prev"]')?.click();
        first.findBar.querySelector('[data-find="close"]')?.click();
        first.findBar.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }

      openFindAll();
      elements.findAllInput.value = "probe";
      elements.findAllInput.dispatchEvent(new Event("input", { bubbles: true }));
      dispatchKey(elements.findAllInput, "Enter");
      dispatchKey(elements.findAllInput, "Enter", { shiftKey: true });
      dispatchKey(elements.findAllInput, "Escape");
      elements.findAllBar.querySelector('[data-findall="next"]')?.click();
      elements.findAllBar.querySelector('[data-findall="prev"]')?.click();
      elements.findAllBar.querySelector('[data-findall="close"]')?.click();
      elements.findAllBar.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      const globalKeys = [
        ["F1", {}], ["F1", {}], ["/", { ctrlKey: true }], ["Escape", {}],
        ["q", { altKey: true }], ["q", { altKey: true }],
        ["t", { ctrlKey: true }], ["e", { ctrlKey: true, shiftKey: true }],
        ["r", { ctrlKey: true, shiftKey: true }], ["b", { ctrlKey: true, shiftKey: true }],
        ["v", { ctrlKey: true, shiftKey: true }], ["l", { ctrlKey: true, shiftKey: true }],
        ["x", { ctrlKey: true, shiftKey: true }], ["c", { ctrlKey: true, shiftKey: true }],
        ["ArrowRight", { ctrlKey: true, altKey: true }], ["ArrowLeft", { ctrlKey: true, altKey: true }],
        ["PageDown", { ctrlKey: true }], ["PageUp", { ctrlKey: true }], ["9", { altKey: true }],
        ["=", { ctrlKey: true }], ["+", { ctrlKey: true }], ["-", { ctrlKey: true }], ["0", { ctrlKey: true }]
      ];
      for (const [key, init] of globalKeys) dispatchKey(window, key, init);

      openAbout();
      dispatchKey(window, "Escape");
      openHelp();
      dispatchKey(window, "Escape");
      openUpdateDialog({ version: "7.7.7", notes: "" });
      dispatchKey(window, "Escape");
      openShortcuts();
      dispatchKey(window, "x");
      dispatchKey(window, "Escape");
      return { terminals: state.terminals.size, first: first.id, second: second.id };
    });

    expect(result.terminals).toBeGreaterThanOrEqual(2);
  });

  test("covers find, broadcast, working-directory, logging, clipboard, and script execution branches @full", async () => {
    const result = await page.evaluate(async () => {
      let terminal = [...state.terminals.values()][0];
      if (!terminal) terminal = addTerminal({ title: "Actions" });

      revealTerminalCwd(null);
      const oldCwd = terminal.cwd;
      terminal.cwd = "";
      revealTerminalCwd(terminal);
      revealPath("");
      terminal.cwd = oldCwd;
      updateTerminalCwd(terminal, "");
      updateTerminalCwd(terminal, "/C:/Temp/path");

      toggleLogging(null);
      terminal.logging = false;
      const oldReady = state.socketReady;
      state.socketReady = false;
      toggleLogging(terminal);
      openLogFile(null);
      terminal.logPath = null;
      openLogFile(terminal);
      terminal.logPath = "D:\\logs\\probe.log";
      openLogFile(terminal);
      state.socketReady = oldReady;
      terminal.logging = true;
      toggleLogging(terminal);
      terminal.logging = false;

      findNav(null, 1);
      const originalFindInput = terminal.findInput?.value;
      if (terminal.findInput) {
        terminal.findInput.value = "";
        findNav(terminal, 1);
        terminal.findInput.value = "probe";
        findNav(terminal, -1);
        findNav(terminal, 1);
        terminal.findInput.value = originalFindInput || "";
      }
      state.findAll.order = [];
      findAllNav(1);
      elements.findAllInput.value = "";
      state.findAll.order = [terminal.id];
      findAllNav(1);
      runFindAll("");
      refreshFindAllCount();
      elements.findAllInput.value = "probe";
      terminal.lastFindCount = 0;
      state.findAll.order = [];
      refreshFindAllCount();

      state.broadcastScope = "active";
      const activeTargets = broadcastTargetIds();
      state.activeId = null;
      const noActiveTargets = broadcastTargetIds();
      state.broadcastScope = "group";
      const noGroupTargets = broadcastTargetIds();
      state.activeId = terminal.id;
      terminal.color = null;
      const groupTargets = broadcastTargetIds();
      state.broadcastScope = "all";
      elements.broadcastInput.value = "";
      sendBroadcast();
      state.broadcastScope = "active";
      state.activeId = null;
      elements.broadcastInput.value = "echo none";
      sendBroadcast();
      state.activeId = terminal.id;

      const oldClipboard = navigator.clipboard;
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => { throw new Error("denied"); }, writeText: async () => {} } });
      await pasteIntoTerminal(terminal.id);
      await performRightClickPaste(terminal.id, false);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => "", writeText: async () => {} } });
      await performRightClickPaste(terminal.id, true);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: oldClipboard });

      await browseAndRunScript("missing");
      const previousMultiterm = window.multiterm;
      window.multiterm = { pickScript: async () => { throw new Error("picker"); } };
      const pickerFailure = await pickScriptPath();
      window.multiterm.pickScript = async () => null;
      await browseAndRunScript(terminal.id);
      state.socketReady = false;
      delete window.multiterm.pickScript;
      const bridgePickerFailure = await pickScriptPath();
      state.socketReady = oldReady;
      window.multiterm = previousMultiterm;

      const commands = [
        buildScriptCommand({ shell: "cmd" }, "D:\\a.ps1"),
        buildScriptCommand({ shell: "Command Prompt" }, "D:\\a.cmd"),
        buildScriptCommand(null, "D:\\it's.cmd")
      ];
      return { activeTargets, noActiveTargets, noGroupTargets, groupTargets, pickerFailure, bridgePickerFailure, commands };
    });

    expect(result.noActiveTargets).toEqual([]);
    expect(result.noGroupTargets).toEqual([]);
    expect(result.pickerFailure).toBeNull();
    expect(result.bridgePickerFailure).toBeNull();
    expect(result.commands[0]).toContain("powershell");
    expect(result.commands[1]).toContain("call");
    expect(result.commands[2]).toContain("it''s");
  });

  test("covers warning dialogs, page editors, bells, and generated action callbacks @full", async () => {
    const result = await page.evaluate(async () => {
      closeAllTerminals();
      const terminal = addTerminal({ title: "Callbacks", cwd: "D:\\callbacks" });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const oldClipboard = navigator.clipboard;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { readText: async () => "echo callback", writeText: async () => {} }
      });

      rightClickAckLevel("");
      rightClickAckLevel("unknown");
      state.settings.rightClickAck = "";
      handleRightClickPaste(terminal, "paste");
      elements.rightClickWarnRemember.checked = true;
      confirmRightClickWarning();
      await Promise.resolve();
      state.settings.rightClickAck = "pasteRun";
      handleRightClickPaste(terminal, "paste");
      await Promise.resolve();
      showRightClickWarning("pasteRun", terminal.id);
      elements.rightClickWarnOverlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      showRightClickWarning("paste", terminal.id);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      closeRightClickWarning();
      rightClickWarn.action = null;
      rightClickWarn.terminalId = null;
      confirmRightClickWarning();

      state.settings.bellNotify = false;
      handleBell(terminal);
      state.settings.bellNotify = true;
      const oldTitle = terminal.titleInput.value;
      terminal.titleInput.value = "";
      const oldActive = state.activeId;
      state.activeId = null;
      handleBell(terminal);
      terminal.titleInput.value = oldTitle;
      state.activeId = oldActive;

      const pageId = addPage({ name: "Rename target", activate: false });
      renderPager();
      let chip = elements.pagerList.querySelector(`[data-page-id="${pageId}"]`);
      startPageRename(chip);
      startPageRename(chip);
      let input = chip.querySelector(".pager-rename");
      input.value = "Renamed page";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      chip = elements.pagerList.querySelector(`[data-page-id="${pageId}"]`);
      startPageRename(chip);
      input = chip.querySelector(".pager-rename");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      chip = elements.pagerList.querySelector(`[data-page-id="${pageId}"]`);
      chip.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      chip.querySelector(".pager-rename")?.dispatchEvent(new Event("blur"));
      chip = elements.pagerList.querySelector(`[data-page-id="${pageId}"]`);
      chip.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
      hideContextMenu();

      const clickRendered = (label) => {
        const item = [...elements.contextMenu.querySelectorAll(".ctx-item")]
          .find((el) => el.textContent.includes(label));
        if (item) item.click();
        return Boolean(item);
      };
      const fake = { ...terminal, id: "missing-callback", cwd: "", logging: false, logPath: null };
      for (const label of ["Copy all output", "Paste", "Select all", "Find", "Clear", "Maximize", "Open folder", "New terminal here", "New Administrator", "Run script", "Log to file", "Split", "Restart", "Cycle color", "Move to new page", "Close"]) {
        buildContextMenu(fake, "");
        clickRendered(label);
      }
      fake.logging = true;
      fake.logPath = "D:\\logs\\callback.log";
      buildContextMenu(fake, "text");
      elements.contextMenu.querySelector(".ctx-part")?.click();
      buildContextMenu(fake, "text");
      clickRendered("Reveal log folder");

      elements.cwdInput.value = "";
      state.activeId = null;
      for (const label of ["New terminal", "New Administrator", "Run script", "Command palette", "Open folder", "Fit all", "Reset layout", "New page", "Close all"]) {
        buildSurfaceContextMenu();
        clickRendered(label);
        if (palette.open) closePalette();
      }

      const beforePages = state.pages.length;
      const callbackPage = addPage({ name: "Move callback", activate: false });
      const mover = addTerminal({ title: "Mover" });
      const moveItems = buildMoveToPageItems(mover).filter((item) => item.run);
      moveItems[0]?.run();
      moveItems.at(-1)?.run();

      state.update.release = { version: "8.8.8", url: "https://example.test" };
      openUpdateDialog(state.update.release);
      elements.updateViewRelease.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      elements.updateOverlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      openUpdateDialog(state.update.release);
      elements.updateClose.click();
      openUpdateDialog(state.update.release);
      elements.updateLater.click();

      Object.defineProperty(navigator, "clipboard", { configurable: true, value: oldClipboard });
      return { pageName: pageById(pageId)?.name, beforePages, afterPages: state.pages.length, callbackPage };
    });

    expect(result.pageName).toBe("Renamed page");
    expect(result.afterPages).toBeGreaterThan(result.beforePages);
  });

  test("covers remaining lifecycle, guard, storage, command, and widget paths @full", async () => {
    const result = await page.evaluate(async () => {
      const withMissingElement = (name, fn) => {
        const saved = elements[name];
        elements[name] = null;
        try { return fn(); } finally { elements[name] = saved; }
      };
      const dispatchKey = (target, key, init = {}) => target.dispatchEvent(new KeyboardEvent("keydown", {
        key, code: init.code || "", bubbles: true, cancelable: true, ...init
      }));

      state.settings.keepSessionsOnClose = false;
      window.dispatchEvent(new Event("beforeunload"));
      state.bridgeClosingDown = false;
      state.settings.keepSessionsOnClose = true;

      const previousMultiterm = window.multiterm;
      window.multiterm = { checkForUpdate: async () => ({ ok: true, available: false }) };
      openAbout();
      elements.aboutCheckUpdates?.click();
      await Promise.resolve();
      window.multiterm = previousMultiterm;

      for (const [element, eventName] of [
        [elements.minWidth, "input"], [elements.columnCount, "input"], [elements.rowCount, "input"],
        [elements.paneHeight, "input"], [elements.focusWidth, "input"], [elements.paneGap, "input"],
        [elements.fontSize, "input"], [elements.terminalTheme, "change"], [elements.appTheme, "change"],
        [elements.fontFamily, "change"], [elements.cursorStyle, "change"], [elements.cursorBlink, "change"],
        [elements.compactChrome, "change"], [elements.syncInput, "change"], [elements.ctrlVPaste, "change"],
        [elements.cleanCopilotClipboard, "change"], [elements.keepSessionsOnClose, "change"],
        [elements.restoreSession, "change"], [elements.copyOnSelect, "change"], [elements.highlightInputPrompts, "change"],
        [elements.rightClickAction, "change"], [elements.scrollbackLines, "change"], [elements.scrollbackInfinite, "change"],
        [elements.scrollOnOutput, "change"], [elements.notifyActivity, "change"], [elements.notifySilence, "change"],
        [elements.silenceSeconds, "change"], [elements.startupCommand, "change"]
      ]) element.dispatchEvent(new Event(eventName, { bubbles: true }));

      handleBridgeMessage({ type: "log", level: "info", source: "bridge", message: "covered" });
      handleBridgeMessage({ type: "scriptPicked", requestId: "missing", path: "" });
      closeAllTerminals();
      localStorage.setItem("multiterm.lastSession", JSON.stringify([{ title: "Snapshot", shell: "pwsh", cwd: "D:\\snap", minimized: true }]));
      state.settings.restoreSession = true;
      handleBridgeMessage({ type: "welcome", cwd: "D:\\welcome", sessions: [] });
      let terminal = [...state.terminals.values()][0];
      terminal.remoteRequested = true;
      handleBridgeMessage({ type: "welcome", sessions: [] });

      closeAllTerminals();
      const reattachId = "reattach-coverage";
      localStorage.setItem("multiterm.lastSession", JSON.stringify([{ id: reattachId, title: "Saved", minimized: true }]));
      handleBridgeMessage({ type: "welcome", sessions: [{ id: reattachId, title: "Bridge", shell: "pwsh", cwd: "D:\\r", pid: 44 }] });
      terminal = state.terminals.get(reattachId);
      const lost = addTerminal({ title: "Lost" });
      lost.remoteRequested = true;
      handleBridgeMessage({ type: "welcome", sessions: [{ id: reattachId, pid: 45 }] });
      if (terminal.minimized) restoreTerminal(terminal.id);

      state.settings.startupCommand = "echo startup";
      terminal.runStartup = true;
      terminal.pendingCommand = "echo pending";
      terminal.pendingCommandEnter = false;
      handleBridgeMessage({ type: "created", id: terminal.id, cwd: "D:\\created", pid: 55, elevated: true });
      handleBridgeMessage({ type: "elevateError", id: terminal.id });
      await new Promise((resolve) => setTimeout(resolve, 550));
      state.settings.startupCommand = "";

      state.socketReady = false;
      requestSession(terminal);
      state.socketReady = true;
      state.appElevated = true;
      await restartAsAdmin();
      state.appElevated = false;

      dispatchKey(terminal.term.element, "c", { code: "KeyC", ctrlKey: true });
      dispatchKey(terminal.term.element, "Tab", { code: "Tab" });
      dispatchKey(terminal.term.element, "Tab", { code: "Tab", shiftKey: true });
      bindTerminalSelectionHandling({ term: { element: null } });

      const actions = terminal.pane.querySelector(".pane-actions");
      for (const action of ["restart", "duplicate"]) actions.querySelector(`[data-action="${action}"]`)?.click();
      await new Promise((resolve) => setTimeout(resolve, 20));

      const dragTerminal = [...state.terminals.values()][0];
      const bar = dragTerminal.pane.querySelector(".pane-bar");
      bar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 72, clientX: 20, clientY: 20 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 72, clientX: 21, clientY: 21 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 999 }));
      window.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 999 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 72 }));
      finishPaneDrag(dragTerminal, { started: true, edge: null, reordered: false });
      state.snap = { id: dragTerminal.id, edge: "left" };
      finishPaneDrag(dragTerminal, { started: true, edge: null, reordered: false });
      snapTerminal("missing", "left");
      clearSnapLayout(false);
      clearSnapLayout(true);
      getSnapEdges(0, window.innerHeight);

      const fakeA = document.createElement("div");
      const fakeB = document.createElement("div");
      animatePaneShuffle([[fakeA, { left: 0, top: 0 }], [fakeB, { left: 0, top: 0 }]], fakeA);
      syncTerminalOrderToDom();
      setActiveTerminal("missing");
      moveTerminal("missing", 1);

      const timeValues = [formatUptime("bad"), formatUptime(new Date(Date.now() - 120000).toISOString()), formatUptime(new Date(Date.now() - 7200000).toISOString()), formatUptime(new Date(Date.now() - 172800000).toISOString())];
      for (const item of state.terminals.values()) item.webglAddon = {};
      while (state.terminals.size < WEBGL_MAX_CONTEXTS) addTerminal({ title: `Budget ${state.terminals.size}` }).webglAddon = {};
      const budgetBlocked = attachWebglRenderer({ webglAddon: null }) === null;

      state.settings.scrollOnOutput = true;
      writeTerminal([...state.terminals.values()][0], "scroll output");
      state.settings.scrollOnOutput = false;
      const oldSetTimeout = window.setTimeout;
      let idleNotified = false;
      const notifyTarget = [...state.terminals.values()][1];
      notifyTarget.createdAt = performance.now() - 5000;
      notifyTarget.hadOutput = true;
      state.activeId = null;
      state.settings.notifySilence = true;
      window.setTimeout = (fn) => { fn(); idleNotified = true; return 1; };
      handleOutputNotifications(notifyTarget);
      window.setTimeout = oldSetTimeout;
      focusNotifiedTerminal(null);

      const savedSocket = state.socket;
      state.socket = { readyState: WebSocket.OPEN, send() {} };
      state.socketReady = true;
      const requestPromise = requestBridge({ type: "pickScript" }, { timeout: 500 });
      const pendingId = [...pendingBridgeRequests.keys()].at(-1);
      handleBridgeMessage({ type: "scriptPicked", requestId: pendingId, path: "D:\\chosen.ps1" });
      const requestValue = await requestPromise;
      state.socket = savedSocket;

      withMissingElement("statusMem", bindMemStatus);
      withMissingElement("statusMem", openMemStatus);
      withMissingElement("statusMem", closeMemStatus);
      withMissingElement("statusMemText", () => renderMemStatus());
      state.mem.open = true;
      elements.statusMem.click();
      state.mem.open = false;
      elements.statusMem.click();
      state.mem.unsupported = true;
      requestMemStats();
      state.mem.unsupported = false;
      state.mem.stats = null;
      state.socketReady = false;
      requestMemStats();
      state.socketReady = true;

      const pendingTerminal = addTerminal({ title: "Coverage pending command" });
      pendingTerminal.pendingCommand = "echo coverage";
      pendingTerminal.pendingCommandEnter = true;
      const pendingSetTimeout = window.setTimeout;
      window.setTimeout = (callback) => { callback(); return 1; };
      handleBridgeMessage({
        type: "created",
        id: pendingTerminal.id,
        cwd: "",
        pid: 123,
        startedAt: new Date().toISOString(),
        elevated: false
      });
      window.setTimeout = pendingSetTimeout;

      localStorage.setItem("multiterm.paneOrder", JSON.stringify(["coverage-known"]));
      orderSessionsBySavedArrangement([
        { id: "coverage-known" },
        { id: "coverage-unknown-1" },
        { id: "coverage-unknown-2" }
      ]);

      const oldIdle = window.requestIdleCallback;
      delete window.requestIdleCallback;
      let idleFallback = false;
      whenIdle(() => { idleFallback = true; });
      await new Promise((resolve) => oldSetTimeout(resolve, 5));
      window.requestIdleCallback = oldIdle;
      withMissingElement("toastHost", () => toast("missing"));
      withMissingElement("logToggle", bindLogConsole);
      withMissingElement("logPanel", () => setLogPanel(true));
      withMissingElement("logOutput", () => { renderAllLogs(); appendLogRow({}); });
      safeLogDetail("text");

      const oldClipboard = navigator.clipboard;
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("copy"); }, readText: async () => "" } });
      await copyTerminalOutput([...state.terminals.keys()][0], "forced");
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: oldClipboard });

      const savedTerminals = state.terminals;
      state.terminals = new Map();
      cycleTerminal(1);
      setActiveTerminalAndReveal("missing");
      openQuickSwitch();
      state.terminals = savedTerminals;
      const oldFont = state.settings.fontSize;
      state.settings.fontSize = MAX_FONT_SIZE;
      fontZoom(1);
      state.settings.fontSize = oldFont;

      openPalette();
      elements.paletteOverlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      const allCommands = getCommands();
      for (const command of allCommands) {
        try { command.run(); } catch { /* guard-oriented command */ }
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (palette.open) closePalette();

      const noSearch = { searchAddon: null, pane: document.createElement("div") };
      bindPaneFind(noSearch);
      openFind(noSearch);
      closeFind(noSearch);
      withMissingElement("findAllBar", bindFindAll);
      withMissingElement("findAllBar", openFindAll);
      withMissingElement("findAllCount", refreshFindAllCount);
      const findTerm = [...state.terminals.values()].find((item) => item.findInput);
      if (findTerm) {
        findTerm.term.selectAll();
        openFind(findTerm);
        findTerm.findInput.value = "";
        findTerm.findInput.dispatchEvent(new Event("input", { bubbles: true }));
      }

      closeAllTerminals();
      elements.broadcastInput.value = "echo auto";
      sendBroadcast();
      terminal = [...state.terminals.values()][0];
      terminal.minimized = true;
      toggleZoomPane(terminal.id);
      updateMaximizeButton({ id: "x", pane: document.createElement("div") });

      registerCwdTracking({ term: { parser: null } });
      const osc = {};
      registerCwdTracking({
        id: "osc", cwd: "", titleInput: { value: "OSC" }, statusElement: { textContent: "" }, searchText: "",
        term: { parser: { registerOscHandler: (code, fn) => { osc[code] = fn; } } }
      });
      osc[7]("file://host/C:/A%20B");
      osc[7]("invalid");
      osc[9]("9;\"D:\\Nine\"");
      osc[9]("invalid");

      withMissingElement("snippetList", renderSnippets);
      state.socketReady = false;
      revealPath("D:\\offline");
      normalizeClipboardText(42);
      await performRightClickPaste("missing", false);
      withMissingElement("closeConfirmOverlay", openCloseConfirm);
      withMissingElement("closeConfirmOverlay", closeCloseConfirm);
      withMissingElement("closeConfirmOverlay", bindCloseConfirm);
      openCloseConfirm();
      elements.closeConfirmOverlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

      localStorage.setItem("multiterm.pages", "{");
      const fallbackPages = loadPages();
      localStorage.setItem("multiterm.terminalPages", "[]");
      const fallbackTerminalPages = loadTerminalPages();
      state.pages = [{ id: "page-1", name: "One" }, { id: "page-3", name: "Three" }];
      const collision = uniquePageId();
      removePage("missing");
      cyclePage(1);
      while (state.pages.length > 1) removePage(state.pages.at(-1).id);
      cyclePage(1);
      withMissingElement("pagerList", renderPager);
      withMissingElement("pagerList", bindPager);
      renderPager();
      elements.pagerList.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      elements.pagerList.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      elements.pagerList.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

      localStorage.setItem("multiterm.updateCheck", JSON.stringify({ dismissedVersion: "9.0.0", lastCheck: Date.now() }));
      window.multiterm = { checkForUpdate: async () => ({ ok: true, available: true, release: { version: "9.0.0" } }) };
      await checkForUpdates({ manual: false });
      initializeAutomaticUpdateChecks();
      withMissingElement("updateOverlay", () => openUpdateDialog({ version: "x", notes: "" }));
      withMissingElement("updateOverlay", closeUpdateDialog);
      withMissingElement("updateOverlay", bindUpdateDialog);
      state.update.downloading = false;
      updateDownloadProgress({ received: 1 });

      const hostEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      terminal.pane.querySelector(".pane-title").dispatchEvent(hostEvent);
      const unknownPane = document.createElement("div");
      unknownPane.className = "terminal-pane";
      unknownPane.dataset.id = "missing";
      elements.host.append(unknownPane);
      unknownPane.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      unknownPane.remove();
      state.settings.rightClickAction = "paste";
      terminal.pane.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      sendTerminalSlashCommand(null, "model", "x");
      sendTerminalSlashCommand(terminal, "model", "");

      showSessionInfoMenu({ ...terminal, startedAt: null, pid: null, shell: "", cwd: "" });
      const copyDetails = [...elements.contextMenu.querySelectorAll(".ctx-item")].find((el) => el.textContent.includes("Copy session details"));
      copyDetails?.click();

      const comboA = comboSelects[0].parentElement.querySelector(".combobox-input");
      const comboB = comboSelects[1].parentElement.querySelector(".combobox-input");
      comboA.focus();
      comboA.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      comboB.focus();
      comboB.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      const option = document.querySelector(".combobox-list:not([hidden]) .combobox-option");
      option?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      comboB.focus();
      comboB.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      comboB.blur();
      await new Promise((resolve) => setTimeout(resolve, 140));

      window.multiterm = previousMultiterm;
      return { timeValues, budgetBlocked, idleNotified, requestValue, idleFallback, fallbackPages, fallbackTerminalPages, collision };
    });

    expect(result.timeValues[0]).toBe("");
    expect(result.timeValues.slice(1)).toEqual(["2m", "2h 0m", "2d 0h"]);
    expect(result.budgetBlocked).toBe(true);
    expect(result.idleNotified).toBe(true);
    expect(result.requestValue).toBe("D:\\chosen.ps1");
    expect(result.idleFallback).toBe(true);
    expect(result.fallbackPages).toEqual([{ id: "page-1", name: "Page 1" }]);
    expect(result.fallbackTerminalPages).toEqual({});
    expect(result.collision).toBe("page-4");
  });

  test("drives remaining generated UI callbacks through their bound events", async () => {
    const result = await page.evaluate(async () => {
      const key = (target, value, init = {}) => target.dispatchEvent(new KeyboardEvent("keydown", {
        key: value, bubbles: true, cancelable: true, ...init
      }));
      const clickMenu = (label) => {
        const row = [...elements.contextMenu.querySelectorAll(".ctx-item")].find((item) => item.textContent.includes(label));
        row?.click();
        return Boolean(row);
      };
      const closeOverlays = () => {
        closePalette(); closeQuickSwitch(false); closeFindAll(); closeAbout(); closeHelp(); closeShortcuts(); closeUpdateDialog();
        elements.shortcutsOverlay.hidden = true;
        elements.aboutOverlay.hidden = true;
        elements.helpOverlay.hidden = true;
        if (elements.updateOverlay) elements.updateOverlay.hidden = true;
      };

      closeOverlays();
      closeAllTerminals();
      state.pages = defaultPages();
      state.activePageId = state.pages[0].id;
      const first = addTerminal({ title: "Callbacks A" });
      const secondPage = addPage({ name: "Callbacks page", activate: false });
      const second = addTerminal({ title: "Callbacks B", pageId: secondPage });
      second.pageId = secondPage;
      minimizeTerminal(first.id);
      minimizeTerminal(second.id);
      state.settings.minimizedScope = "page";
      updateMinimizedDock();

      elements.minimizedDock.querySelector(".min-chip-hint")?.click();
      elements.minimizedDock.querySelector(".min-dock-toggle")?.click();
      state.settings.minimizedScope = "global";
      updateMinimizedDock();
      let chip = elements.minimizedDock.querySelector(`[data-id="${first.id}"]`);
      chip?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
      clickMenu("Rename");
      let rename = elements.minimizedDock.querySelector(".min-chip-rename");
      if (rename) key(rename, "Escape");
      chip = elements.minimizedDock.querySelector(`[data-id="${first.id}"]`);
      chip?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      clickMenu("Rename");
      rename = elements.minimizedDock.querySelector(".min-chip-rename");
      if (rename) { rename.value = "Renamed callback"; key(rename, "Enter"); }
      chip = elements.minimizedDock.querySelector(`[data-id="${first.id}"]`);
      chip?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      clickMenu("Restore");
      minimizeTerminal(first.id);
      chip = elements.minimizedDock.querySelector(`[data-id="${first.id}"]`);
      chip?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      clickMenu("Close");

      toast("click callback", "info", 5000);
      elements.toastHost.lastElementChild?.click();
      elements.logLevelFilter.value = "warn";
      elements.logLevelFilter.dispatchEvent(new Event("change", { bubbles: true }));
      elements.logClose.click();

      restoreTerminal(second.id);
      setActivePage(secondPage);
      setActiveTerminal(second.id);
      openQuickSwitch();
      key(elements.quickSwitchInput, "Enter");
      await new Promise((resolve) => setTimeout(resolve, 70));
      openQuickSwitch();
      elements.quickSwitchOverlay.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

      const shortcutCases = [
        ["e", { ctrlKey: true, shiftKey: true }], ["r", { ctrlKey: true, shiftKey: true }],
        ["b", { ctrlKey: true, shiftKey: true }], ["v", { ctrlKey: true, shiftKey: true }],
        ["l", { ctrlKey: true, shiftKey: true }], ["x", { ctrlKey: true, shiftKey: true }],
        ["c", { ctrlKey: true, shiftKey: true }], ["ArrowRight", { ctrlKey: true, altKey: true }],
        ["ArrowLeft", { ctrlKey: true, altKey: true }], ["PageDown", { ctrlKey: true }],
        ["PageUp", { ctrlKey: true }], ["1", { altKey: true }], ["=", { ctrlKey: true }],
        ["-", { ctrlKey: true }], ["0", { ctrlKey: true }]
      ];
      for (const [value, init] of shortcutCases) {
        closeOverlays();
        key(window, value, init);
      }
      closeOverlays();
      key(window, "w", { ctrlKey: true, shiftKey: true });
      const active = addTerminal({ title: "Find callbacks" });
      setActiveTerminal(active.id);

      const savedSearch = active.searchAddon;
      const calls = [];
      let resultsHandler = null;
      active.searchAddon = {
        onDidChangeResults(fn) { resultsHandler = fn; },
        findNext(value) { calls.push(`next:${value}`); },
        findPrevious(value) { calls.push(`prev:${value}`); },
        clearDecorations() { calls.push("clear"); },
        clearActiveDecoration() { calls.push("clear-active"); }
      };
      bindPaneFind(active);
      resultsHandler?.(null);
      resultsHandler?.({ resultCount: 0, resultIndex: -1 });
      resultsHandler?.({ resultCount: 3, resultIndex: 1 });
      active.findInput.value = "";
      active.findInput.dispatchEvent(new Event("input", { bubbles: true }));
      active.findInput.value = "needle";
      active.findInput.dispatchEvent(new Event("input", { bubbles: true }));
      key(active.findInput, "Enter");
      key(active.findInput, "Enter", { shiftKey: true });
      key(active.findInput, "Escape");
      for (const kind of ["next", "prev", "close"]) active.findBar.querySelector(`[data-find="${kind}"]`)?.click();
      active.term.selectAll();
      openFind(active);
      closeFind(active);

      state.findAll.active = true;
      elements.findAllInput.value = "needle";
      state.findAll.order = [active.id];
      state.findAll.ti = 0;
      state.findAll.li = -1;
      active.lastFindCount = 2;
      findAllNav(-1);
      findAllNav(1);
      findAllNav(1);
      findAllNav(1);
      state.findAll.order = ["missing"];
      state.findAll.ti = 0;
      state.findAll.li = 0;
      findAllNav(1);
      state.findAll.active = false;
      active.searchAddon = savedSearch;

      state.pages = defaultPages();
      state.activePageId = "page-1";
      addPage({ name: "Pager callback", activate: false });
      renderPager();
      let pagerChip = elements.pagerList.querySelector(".pager-chip");
      pagerChip?.click();
      pagerChip?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      let pageRename = elements.pagerList.querySelector(".pager-rename");
      if (pageRename) key(pageRename, "Escape");
      pagerChip = elements.pagerList.querySelector(".pager-chip");
      pagerChip?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      pageRename = elements.pagerList.querySelector(".pager-rename");
      if (pageRename) { pageRename.value = "Pager renamed"; key(pageRename, "Enter"); }
      pagerChip = elements.pagerList.querySelector(".pager-chip");
      pagerChip?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      clickMenu("New page");
      pagerChip = elements.pagerList.querySelector(".pager-chip");
      pagerChip?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      clickMenu("Rename");
      pageRename = elements.pagerList.querySelector(".pager-rename");
      pageRename?.blur();
      const closeButton = elements.pagerList.querySelector("[data-page-close]");
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      elements.pagerAdd?.click();

      let ranInput = "";
      let partRuns = 0;
      renderContextMenu([
        { input: true, label: "Input callback", run: (value) => { ranInput = value; } },
        { label: "Parts callback", parts: [{ text: "plain" }, { text: "run", run: () => { partRuns += 1; } }] },
        { label: "Plain callback", run: () => { partRuns += 10; } },
        { label: "Disabled callback", disabled: true, run: () => { partRuns += 100; } },
        { info: true, label: "Information" }
      ]);
      showBuiltContextMenu(10, 10);
      const commandInput = elements.contextMenu.querySelector(".ctx-command-input");
      commandInput.value = "";
      key(commandInput, "Enter");
      commandInput.value = "value";
      key(commandInput, "Enter");
      renderContextMenu([{ input: true, label: "Escape input", run() {} }]);
      showBuiltContextMenu(10, 10);
      key(elements.contextMenu.querySelector(".ctx-command-input"), "Escape");
      renderContextMenu([{ label: "Parts", parts: [{ text: "run", run: () => { partRuns += 1; } }] }]);
      showBuiltContextMenu(10, 10);
      elements.contextMenu.querySelector(".ctx-part")?.click();
      renderContextMenu([{ label: "Pointer callback", run: () => { partRuns += 10; } }]);
      showBuiltContextMenu(10, 10);
      const plain = elements.contextMenu.querySelector(".ctx-item");
      plain?.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
      plain?.click();

      const select = comboSelects[0];
      const comboInput = select.parentElement.querySelector(".combobox-input");
      comboInput.focus();
      comboInput.value = "no-option-can-match-this";
      comboInput.dispatchEvent(new Event("input", { bubbles: true }));
      comboInput.value = "";
      comboInput.dispatchEvent(new Event("input", { bubbles: true }));
      key(comboInput, "ArrowDown");
      key(comboInput, "ArrowUp");
      const visibleOption = document.querySelector(".combobox-list:not([hidden]) .combobox-option");
      visibleOption?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      comboInput.focus();
      key(comboInput, "Escape");
      comboInput.focus();
      key(comboInput, "Tab");

      await new Promise((resolve) => setTimeout(resolve, 180));
      return { renamed: "Renamed callback", findCalls: calls.length, ranInput, partRuns, pages: state.pages.length };
    });

    expect(result.renamed).toBe("Renamed callback");
    expect(result.findCalls).toBeGreaterThan(5);
    expect(result.ranInput).toBe("value");
    expect(result.partRuns).toBe(11);
    expect(result.pages).toBeGreaterThan(1);
  });

  test("covers detector-free bootstrap fallback", async () => {
    const fallbackPage = await context.newPage();
    await fallbackPage.route("**/input-detection.js", (route) => route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.InputPromptDetector = undefined;"
    }));
    await startRendererCoverage(fallbackPage);
    await fallbackPage.goto("/");
    await expect(fallbackPage.locator("#statusConn")).toHaveText("Connected");
    const awaiting = await fallbackPage.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      state.settings.highlightInputPrompts = true;
      evaluateInputPrompt(terminal);
      return terminal.awaitingInput;
    });
    expect(awaiting).toBe(false);
    await fallbackPage.evaluate(() => closeAllTerminals());
    await stopRendererCoverage(fallbackPage, "coverage-detector-fallback");
    await fallbackPage.close();
  });

  test("covers final guards, script choices, storage variants, and menu actions @full", async () => {
    const result = await page.evaluate(async () => {
      connectBridge("file:");
      elements.toggleHeaderTop.click();
      elements.toggleSidecarTop.click();

      const NativeWebSocket = window.WebSocket;
      const bridgeSocket = state.socket;
      const bridgeReady = state.socketReady;
      const socketListeners = {};
      window.WebSocket = class {
        static OPEN = 1;
        readyState = 1;
        addEventListener(name, fn) { socketListeners[name] = fn; }
        send() {}
      };
      connectBridge("http:");
      socketListeners.message?.({ data: "not-json" });
      window.WebSocket = NativeWebSocket;
      state.socket = bridgeSocket;
      state.socketReady = bridgeReady;

      const terminal = [...state.terminals.values()][0] || addTerminal({ title: "Final guards" });
      let webLink = null;
      const NativeLinksAddon = window.WebLinksAddon.WebLinksAddon;
      window.WebLinksAddon.WebLinksAddon = class {
        constructor(handler) { webLink = handler; }
        activate() {}
        dispose() {}
      };
      const nativeOpen = window.open;
      window.open = () => null;
      const linked = addTerminal({ title: "Web link callback" });
      webLink?.({}, "https://example.invalid/");
      window.open = nativeOpen;
      window.WebLinksAddon.WebLinksAddon = NativeLinksAddon;
      const fakePane = document.createElement("div");
      fakePane.className = "terminal-pane";
      fakePane.dataset.id = terminal.id;
      elements.host.append(fakePane);
      syncTerminalOrderToDom();
      fakePane.remove();

      const primary = addTerminal({ title: "Primary removal" });
      const successor = addTerminal({ title: "Primary successor" });
      setActiveTerminal(successor.id);
      setPrimaryTerminal(primary.id);
      state.snap = { id: primary.id, edge: "left" };
      state.zoomedId = primary.id;
      removeTerminal(primary.id);
      const snapTarget = addTerminal({ title: "Snap minimize" });
      const other = addTerminal({ title: "Other primary" });
      setActiveTerminal(other.id);
      setPrimaryTerminal(snapTarget.id);
      state.snap = { id: snapTarget.id, edge: "right" };
      state.zoomedId = snapTarget.id;
      minimizeTerminal(snapTarget.id);
      const savedDock = elements.minimizedDock;
      elements.minimizedDock = null;
      updateMinimizedDock();
      elements.minimizedDock = savedDock;
      const blocker = document.createElement("input");
      blocker.className = "min-chip-rename";
      savedDock.append(blocker);
      updateMinimizedDock();
      blocker.remove();
      updateMinimizedDock();
      savedDock.querySelector(`[data-id="${snapTarget.id}"]`)?.click();
      minimizeTerminal(snapTarget.id);
      savedDock.querySelector(`[data-id="${snapTarget.id}"]`)?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      [...elements.contextMenu.querySelectorAll(".ctx-item")].find((row) => row.textContent.includes("Rename"))?.click();
      savedDock.querySelector(".min-chip-rename")?.click();

      setActiveTerminal("missing");
      setPrimaryTerminal("missing");
      const silent = addTerminal({ title: "No output" });
      silent.createdAt = performance.now() - 5000;
      state.settings.notifySilence = true;
      const nativeSetTimeout = window.setTimeout;
      let silenceCallback = null;
      window.setTimeout = (fn) => { silenceCallback = fn; return 1; };
      handleOutputNotifications(silent);
      window.setTimeout = nativeSetTimeout;
      silent.hadOutput = false;
      silenceCallback?.();

      const actualSocket = state.socket;
      const actualReady = state.socketReady;
      state.socket = { readyState: WebSocket.OPEN, send() {} };
      state.socketReady = true;
      const timeoutPromise = requestBridge({ type: "probe" }, { timeout: 1000 });
      const pending = [...pendingBridgeRequests.values()].at(-1);
      pending.settle("first");
      pending.settle("second");
      const settled = await timeoutPromise;
      const timedOut = await requestBridge({ type: "timeout-probe" }, { timeout: 1 });

      terminal.createdAt = performance.now() - 5000;
      const nativeTimer = window.setTimeout;
      let activityCallback = null;
      window.setTimeout = (fn) => { activityCallback = fn; return 1; };
      state.activeId = "another";
      markActivity(terminal, true);
      window.setTimeout = nativeTimer;
      activityCallback?.();

      const savedQuick = elements.quickSwitchOverlay;
      elements.quickSwitchOverlay = null;
      bindQuickSwitch();
      elements.quickSwitchOverlay = savedQuick;
      openFind(null);
      const oldSelection = terminal.term.getSelection.bind(terminal.term);
      terminal.term.getSelection = () => "needle";
      openFind(terminal);
      state.findAll.active = false;
      openFindAll();
      terminal.term.getSelection = oldSelection;

      const oldMultiterm = window.multiterm;
      window.multiterm = { pickScript: async () => "D:\\scripts\\chosen.ps1" };
      await browseAndRunScript(terminal.id);
      state.socketReady = false;
      await browseAndRunScript(terminal.id);
      state.socketReady = true;
      await browseAndRunScriptInNewTerminal({ cwd: "D:\\scripts" });
      await browseAndRunScriptInNewTerminal({ cwd: "D:\\scripts", elevated: true });
      window.multiterm.pickScript = async () => null;
      await browseAndRunScriptInNewTerminal({});
      window.multiterm = oldMultiterm;

      localStorage.setItem("multiterm.pages", JSON.stringify({
        pages: [null, {}, { id: "saved", name: "Saved" }], activePageId: "saved"
      }));
      const loaded = loadPages();
      const loadedActive = loadActivePageId(loaded);
      localStorage.setItem("multiterm.terminalPages", "{");
      const terminalPagesFallback = loadTerminalPages();
      state.pages = [{ id: "page-1", name: "One" }, { id: "page-2", name: "Two" }];
      state.activePageId = "page-1";
      state.terminalPages.remembered = "page-2";
      const remembered = resolvePageId("missing", "remembered");
      terminal.pageId = "page-1";
      moveTerminalToPage(terminal.id, "page-2");
      renderPager();
      const invalidChip = document.createElement("button");
      invalidChip.className = "pager-chip";
      invalidChip.dataset.pageId = "missing";
      elements.pagerList.append(invalidChip);
      invalidChip.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      elements.pagerList.querySelector(".pager-chip")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      const closePage = [...elements.contextMenu.querySelectorAll(".ctx-item")].find((row) => row.textContent.includes("Close"));
      closePage?.click();

      state.workspaces = { Zebra: [], Alpha: [] };
      refreshWorkspaceSelect();
      getCommands();

      let closeRequest = null;
      window.multiterm = { onCloseRequest(fn) { closeRequest = fn; } };
      bindCloseConfirm();
      closeRequest?.();
      cancelAppClose();
      window.multiterm = oldMultiterm;

      terminal.logging = false;
      terminal.logPath = "D:\\logs\\last.log";
      renderContextMenu(buildLoggingMenuItems(terminal));
      [...elements.contextMenu.querySelectorAll(".ctx-item")].find((row) => row.textContent.includes("Reveal last log"))?.click();
      state.settings.snippets = [{ name: "Menu snippet", command: "echo menu" }];
      buildContextMenu(terminal, "selection");
      [...elements.contextMenu.querySelectorAll(".ctx-item")].find((row) => row.textContent.includes("Menu snippet"))?.click();

      const surfaceLabels = ["New terminal here", "New Administrator terminal", "Run script as Administrator", "New PowerShell 7", "New Windows PowerShell", "New WSL", "Broadcast command", "Open folder"];
      for (const label of surfaceLabels) {
        buildSurfaceContextMenu();
        const row = [...elements.contextMenu.querySelectorAll(".ctx-item")].find((item) => item.textContent.includes(label));
        row?.click();
      }
      buildPaneOverflowMenu(terminal);
      [...elements.contextMenu.querySelectorAll(".ctx-item")].find((row) => row.textContent.includes("Find"))?.click();

      renderContextMenu([{ label: "Focus removal", run() {} }]);
      setContextFocus(0);
      setContextFocus(-1);

      const oldClipboard = navigator.clipboard;
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
      showSessionInfoMenu(terminal);
      [...elements.contextMenu.querySelectorAll(".ctx-item")].find((row) => row.textContent.includes("Copy session details"))?.click();
      await Promise.resolve();
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: oldClipboard });

      const select = comboSelects[0];
      const comboInput = select.parentElement.querySelector(".combobox-input");
      const oldRect = comboInput.getBoundingClientRect.bind(comboInput);
      comboInput.getBoundingClientRect = () => ({ left: 10, right: 210, top: 700, bottom: 730, width: 200, height: 30 });
      comboInput.blur();
      await new Promise((resolve) => setTimeout(resolve, 140));
      comboInput.focus();
      comboInput.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      elements.terminalSearchInput.focus();
      await new Promise((resolve) => setTimeout(resolve, 140));
      comboInput.getBoundingClientRect = oldRect;

      state.update.checking = false;
      window.multiterm = { checkForUpdate: async () => ({ ok: true, available: true, release: { version: "dismiss-me" } }) };
      saveUpdateMeta({ dismissedVersion: "dismiss-me", lastCheck: 0 });
      await checkForUpdates({ manual: false });
      const webdriverDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, "webdriver");
      Object.defineProperty(Navigator.prototype, "webdriver", { configurable: true, get: () => false });
      saveAutomaticUpdatePreferences({ configured: true, enabled: false, intervalHours: 6 });
      initializeAutomaticUpdateChecks();
      saveAutomaticUpdatePreferences({ configured: true, enabled: true, intervalHours: 6 });
      initializeAutomaticUpdateChecks();
      await Promise.resolve();
      stopAutomaticUpdateChecks();
      if (webdriverDescriptor) Object.defineProperty(Navigator.prototype, "webdriver", webdriverDescriptor);
      window.multiterm = oldMultiterm;

      state.socket = actualSocket;
      state.socketReady = actualReady;

      return { settled, timedOut, loadedActive, terminalPagesFallback, remembered, linked: linked.titleInput.value };
    });

    expect(result).toEqual({ settled: "first", timedOut: null, loadedActive: "saved", terminalPagesFallback: {}, remembered: "page-2", linked: "Web link callback" });
  });

  test("covers the remaining branch truth table @full", async () => {
    const result = await page.evaluate(async () => {
      const swapElement = (name, value, fn) => {
        const saved = elements[name];
        elements[name] = value;
        try { return fn(); } finally { elements[name] = saved; }
      };
      const key = (target, value, init = {}) => target.dispatchEvent(new KeyboardEvent("keydown", {
        key: value, bubbles: true, cancelable: true, ...init
      }));
      const savedSocket = state.socket;
      const savedReady = state.socketReady;
      closeAllTerminals();
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      state.socket = { readyState: WebSocket.OPEN, send() {} };
      state.socketReady = true;

      setLogPanel(false);
      swapElement("logToggleDot", null, () => logEvent("error", "branch", "without dot"));
      state.settings.appTheme = "dark";
      applySettings();
      state.settings.appTheme = "system";
      applySettings();
      elements.broadcastInput.value = "";
      key(elements.broadcastInput, "Escape");
      elements.snippetName.value = "Enter branch";
      elements.snippetCommand.value = "echo enter";
      key(elements.snippetCommand, "Enter");

      const NativeWebSocket = window.WebSocket;
      const listeners = {};
      window.WebSocket = class {
        static OPEN = 1;
        readyState = 1;
        addEventListener(name, fn) { listeners[name] = fn; }
        send() {}
      };
      connectBridge("https:");
      const waiting = addTerminal({ title: "Open request" });
      waiting.remoteRequested = false;
      waiting.status = "waiting";
      const live = addTerminal({ title: "Already live" });
      live.remoteRequested = false;
      live.status = "live";
      listeners.open?.();
      window.WebSocket = NativeWebSocket;
      state.socket = { readyState: WebSocket.OPEN, send() {} };
      state.socketReady = true;

      elements.cwdInput.value = "preset";
      handleBridgeMessage({ type: "welcome", sessions: null });
      elements.cwdInput.value = "";
      handleBridgeMessage({ type: "welcome", cwd: "", sessions: [] });
      closeAllTerminals();
      localStorage.setItem("multiterm.lastSession", JSON.stringify([{ title: "Not minimized", minimized: false }]));
      state.settings.restoreSession = true;
      handleBridgeMessage({ type: "welcome", sessions: [] });
      const notRemote = [...state.terminals.values()][0];
      notRemote.remoteRequested = false;
      handleBridgeMessage({ type: "welcome", sessions: [] });

      for (const type of ["logError", "revealError", "openError"]) handleBridgeMessage({ type, message: "" });
      handleBridgeMessage({ type: "elevateStarted", shell: "" });
      handleBridgeMessage({ type: "elevateError", id: "" });
      handleBridgeMessage({ type: "error", message: "" });
      const frameTerminal = [...state.terminals.values()][0];
      handleBridgeMessage({ type: "error", id: frameTerminal.id, message: "" });
      frameTerminal.status = "live";
      handleBridgeMessage({ type: "exited", id: frameTerminal.id, signal: "SIGTERM" });
      const closedTerminal = addTerminal({ title: "Closed code" });
      handleBridgeMessage({ type: "exited", id: closedTerminal.id });
      const reattach = addTerminal({ title: "No PID" });
      reattachExistingSession(reattach, {});

      const oldFont = state.settings.fontFamily;
      state.settings.fontFamily = "missing-font";
      const SavedSearch = window.SearchAddon;
      const SavedLinks = window.WebLinksAddon;
      window.SearchAddon = null;
      window.WebLinksAddon = null;
      const plainAddon = addTerminal({ title: "No optional addons", elevated: true, session: { pid: 0 } });
      window.SearchAddon = SavedSearch;
      window.WebLinksAddon = SavedLinks;
      state.settings.fontFamily = oldFont;
      plainAddon.shell = "";
      requestSession(plainAddon);
      newAdminTerminal({ shell: "", cwd: "" });

      const bar = plainAddon.pane.querySelector(".pane-bar");
      bar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2, pointerId: 810, clientX: 1, clientY: 1 }));
      const actions = plainAddon.pane.querySelector(".pane-actions");
      actions.querySelector('[data-action="move-right"]')?.click();
      finishPaneDrag(plainAddon, { started: true, edge: null, reordered: true });
      const geometryTarget = [...state.terminals.values()].find((item) => item.id !== plainAddon.id);
      if (geometryTarget) {
        plainAddon.pane.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 });
        geometryTarget.pane.getBoundingClientRect = () => ({ left: 20, top: 0, right: 120, bottom: 100, width: 100, height: 100 });
        reorderPaneDuringDrag(plainAddon.pane, { tx: 0, ty: 0 }, 30, 30);
        geometryTarget.pane.getBoundingClientRect = () => ({ left: 0, top: 20, right: 100, bottom: 120, width: 100, height: 100 });
        reorderPaneDuringDrag(plainAddon.pane, { tx: 0, ty: 0 }, 30, 30);
      }

      swapElement("statusAdmin", null, updateStatusBar);
      const oldMultiterm = window.multiterm;
      window.multiterm = { relaunchElevated: async () => false };
      await restartAsAdmin();
      window.multiterm = oldMultiterm;

      const removeA = addTerminal({ title: "Remove A" });
      const removeB = addTerminal({ title: "Remove B" });
      setActiveTerminal(removeA.id);
      setPrimaryTerminal(removeA.id);
      removeTerminal(removeA.id);
      removeTerminal(removeB.id);

      const scope = addTerminal({ title: "" });
      scope.titleInput.value = "";
      scope.pageId = state.activePageId;
      minimizeTerminal(scope.id);
      state.settings.minimizedScope = "page";
      updateMinimizedDock();
      elements.minimizedDock.querySelector(".min-dock-toggle")?.click();
      elements.minimizedDock.querySelector(".min-dock-toggle")?.click();
      elements.minimizedDock.querySelector(`[data-id="${scope.id}"]`)?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      [...elements.contextMenu.querySelectorAll(".ctx-item")].find((row) => row.textContent.includes("Rename"))?.click();
      const rename = elements.minimizedDock.querySelector(".min-chip-rename");
      if (rename) { rename.value = ""; key(rename, "Escape"); }

      scope.webglLossTimes = null;
      scheduleWebglRecovery(scope);
      scope.createdAt = performance.now() - 5000;
      scope.titleInput.value = "";
      state.settings.notifyActivity = true;
      state.settings.notifySilence = true;
      state.settings.silenceSeconds = 2;
      state.activeId = "other";
      handleOutputNotifications(scope);
      setAwaitingInput(scope, true);
      stripTerminalControlCodes(0);
      newAdminTerminal({ shell: null });
      state.settings.fontFamily = "missing-font";
      applySettings();
      state.settings.fontFamily = oldFont;
      const oldMatches = systemThemeQuery.matches;
      Object.defineProperty(systemThemeQuery, "matches", { configurable: true, value: false });
      resolveAppTheme();
      Object.defineProperty(systemThemeQuery, "matches", { configurable: true, value: oldMatches });
      swapElement("themeToggle", null, applyAppTheme);

      const host = elements.host;
      const oldGap = state.settings.gap;
      state.settings.gap = 0;
      const widthDescriptor = Object.getOwnPropertyDescriptor(host, "clientWidth");
      Object.defineProperty(host, "clientWidth", { configurable: true, value: 0 });
      defaultManualLayout(0);
      if (widthDescriptor) Object.defineProperty(host, "clientWidth", widthDescriptor); else delete host.clientWidth;
      state.settings.gap = oldGap;

      swapElement("statusMemText", null, closeMemStatus);
      updateMemStatus({ supported: false, reason: "" });
      updateMemStatus({ supported: true, app: "", systemTotal: "" });
      state.mem.requested = true;
      state.mem.stats = null;
      renderMemStatus();
      state.mem.requested = false;
      renderMemStatus();
      const savedLucide = window.lucide;
      window.lucide = null;
      refreshIcons(document.body);
      window.lucide = savedLucide;

      swapElement("logToggleDot", null, () => { clearLogs(); logEvent("info", "branch", "no dot"); });
      logStore.autoscroll = false;
      renderAllLogs();
      appendLogRow({ ts: new Date().toISOString(), level: "info", source: "branch", message: "no scroll" });
      swapElement("logOutput", null, scrollLogToEnd);
      appendLogRow({ ts: new Date().toISOString(), level: "info", source: "branch", message: "detail", detail: undefined });
      const fakeBuffer = { length: 1, getLine: () => null };
      terminalBufferText({ buffer: { active: fakeBuffer } });

      state.settings.snippets = null;
      getCommands();
      state.settings.snippets = [{ name: "", command: "echo fallback" }];
      getCommands();
      openPalette();
      elements.paletteList.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      closePalette();

      const savedPages = state.pages;
      state.pages = defaultPages();
      scope.cwd = "";
      scope.status = "";
      const many = [];
      for (let i = 0; i < 37; i += 1) many.push({ ...scope, id: `quick-${i}`, titleInput: { value: `Quick ${i}` } });
      const oldTerminals = state.terminals;
      state.terminals = new Map(many.map((item) => [item.id, item]));
      state.activeId = many[0].id;
      openQuickSwitch();
      renderQuickSwitch();
      elements.quickSwitchList.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      closeQuickSwitch(false);
      state.terminals = oldTerminals;
      state.pages = savedPages;

      openShortcuts();
      key(window, "Escape");
      openAbout();
      key(window, "x");
      closeAbout();
      state.activeId = null;
      key(window, "w", { ctrlKey: true, shiftKey: true });
      key(window, "c", { ctrlKey: true, shiftKey: true });
      key(window, "9", { altKey: true });

      hideContextMenu();
      openShortcuts();
      elements.shortcutsOverlay.hidden = false;
      key(window, "x");
      handleShortcutsOverlayKey(new KeyboardEvent("keydown", { key: "x", cancelable: true }));
      handleShortcutsOverlayKey(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
      closeShortcuts();
      openUpdateDialog({ version: "coverage-non-escape" });
      key(window, "x");
      closeUpdateDialog();
      openAbout();
      key(window, "x");
      closeAbout();
      openHelp("shortcuts");
      key(window, "x");
      closeHelp();

      closePalette();
      closeQuickSwitch(false);
      closeFindAll();
      hideContextMenu();
      elements.shortcutsOverlay.hidden = true;
      elements.updateOverlay.hidden = true;
      elements.aboutOverlay.hidden = true;
      elements.helpOverlay.hidden = true;
      state.activeId = null;
      state.pages = [{ id: "coverage-page", name: "Coverage page" }];
      key(window, "w", { ctrlKey: true, shiftKey: true });
      key(window, "c", { ctrlKey: true, shiftKey: true });
      key(window, "9", { altKey: true });
      const selectedTerminal = state.terminals.values().next().value;
      if (selectedTerminal) {
        state.activeId = selectedTerminal.id;
        const originalSelection = selectedTerminal.term.getSelection.bind(selectedTerminal.term);
        selectedTerminal.term.getSelection = () => "selected";
        key(window, "c", { ctrlKey: true, shiftKey: true });
        selectedTerminal.term.getSelection = originalSelection;
      }

      // Defensive renderer/Electron fallbacks are reached with throwing stubs.
      detachWebglRenderer({
        webglAddon: { dispose() {} },
        term: { _core: null, rows: 1, refresh() { throw new Error("not ready"); } }
      });
      const recovery = {
        id: "coverage-recovery",
        webglAddon: null,
        webglRecoveryHandle: 0,
        webglLossTimes: [],
        term: { rows: 1, refresh() { throw new Error("not ready"); } }
      };
      state.terminals.set(recovery.id, recovery);
      const savedWebgl = window.WebglAddon;
      window.WebglAddon = null;
      const recoverySetTimeout = window.setTimeout;
      window.setTimeout = (callback) => { callback(); return 1; };
      scheduleWebglRecovery(recovery);
      window.setTimeout = recoverySetTimeout;
      window.WebglAddon = savedWebgl;
      state.terminals.delete(recovery.id);

      window.multiterm = { focusWindow() { throw new Error("browser fallback"); } };
      focusNotifiedTerminal(null);
      window.multiterm = { respondClose() { throw new Error("browser fallback"); } };
      finishAppClose("cancel");
      window.multiterm = { onCloseRequest() { throw new Error("browser fallback"); } };
      bindCloseConfirm();
      localStorage.setItem("multiterm.pages", "{");
      loadActivePageId([{ id: "coverage-page" }]);

      const storageSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = () => { throw new Error("storage unavailable"); };
      saveUpdateMeta({ coverage: true });
      Storage.prototype.setItem = storageSetItem;
      window.multiterm = { onUpdateProgress() {} };
      bindUpdateDialog();

      const findTerminal = addTerminal({ title: "Branch find" });
      const originalSearch = findTerminal.searchAddon;
      let resultCallback = null;
      findTerminal.searchAddon = {
        onDidChangeResults(fn) { resultCallback = fn; },
        findNext() {}, findPrevious() {}, clearDecorations() {}, clearActiveDecoration() {}
      };
      bindPaneFind(findTerminal);
      resultCallback?.({ resultCount: 2, resultIndex: -1 });
      key(findTerminal.findInput, "Escape");
      findTerminal.findBar.querySelector('[data-find="close"]')?.click();
      const roguePane = document.createElement("div");
      roguePane.className = "terminal-pane";
      roguePane.dataset.id = "missing";
      elements.host.append(roguePane);
      orderedTerminals();
      roguePane.remove();
      elements.findAllBar.querySelector('[data-findall="close"]')?.click();
      swapElement("findAllBar", null, closeFindAll);
      state.findAll.order = [findTerminal.id];
      state.findAll.ti = 99;
      state.findAll.li = -1;
      findTerminal.lastFindCount = 0;
      elements.findAllInput.value = "x";
      findAllNav(-1);
      state.findAll.li = 0;
      findAllNav(-1);
      state.findAll.order = ["missing"];
      state.findAll.ti = 0;
      state.findAll.li = 0;
      findAllNav(-1);
      findTerminal.searchAddon = originalSearch;

      state.broadcastScope = "bogus";
      toggleBroadcastScope();
      state.broadcastScope = "active";
      state.activeId = findTerminal.id;
      elements.broadcastInput.value = "one";
      state.settings.broadcastSendEnter = false;
      sendBroadcast();

      const osc = {};
      registerCwdTracking({ term: { parser: { registerOscHandler(code, fn) { osc[code] = fn; } } }, cwd: "", titleInput: { value: "" }, statusElement: document.createElement("span"), searchText: "" });
      osc[7](null);
      osc[7]("file://host/path");
      osc[9](null);
      state.settings.snippets = null;
      addSnippet("a", "b");
      state.settings.snippets = null;
      removeSnippet(0);
      state.settings.snippets = null;
      renderSnippets();

      normalizeClipboardText("a\nb");
      await pasteIntoTerminal("missing");
      await performRightClickPaste(findTerminal.id, false);
      const warningEvent = new PointerEvent("pointerdown", { bubbles: true });
      elements.rightClickWarnOverlay.dispatchEvent(warningEvent);

      localStorage.setItem("multiterm.pages", JSON.stringify({ pages: [{ id: "p", name: "" }] }));
      loadPages();
      state.activePageId = "missing";
      activePage();
      resolvePageId(null, null);
      state.pages = [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }];
      state.activePageId = "p1";
      findTerminal.pageId = "p1";
      minimizeTerminal(findTerminal.id);
      renderPager();
      const pageChip = elements.pagerList.querySelector(".pager-chip");
      pageChip?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      const pageInput = elements.pagerList.querySelector(".pager-rename");
      if (pageInput) key(pageInput, "Escape");
      state.pages = [{ id: "only", name: "Only" }];
      renderPager();
      elements.pagerList.querySelector(".pager-chip")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

      findTerminal.color = null;
      cyclePaneColor(findTerminal);
      findTerminal.color = PANE_COLORS.at(-1);
      cyclePaneColor(findTerminal);
      localStorage.setItem("multiterm.paneOrder", "{}");
      loadPaneOrder();
      localStorage.setItem("multiterm.lastSession", "{}");
      loadSessionSnapshot();
      openHelp("shortcuts");
      swapElement("aboutVersion", null, openAbout);
      swapElement("aboutVersionText", null, openAbout);
      localStorage.setItem("multiterm.updateCheck", "null");
      loadUpdateMeta();
      compareAppVersions("1", "1.1");
      pickInstallerAsset([{ name: null }, { name: "setup.exe", browser_download_url: "url" }]);
      const savedFetch = window.fetch;
      window.fetch = async () => ({ ok: true, json: async () => ({ tag_name: null, body: null, assets: [] }) });
      await fetchLatestReleaseViaFetch();
      window.fetch = savedFetch;

      window.multiterm = { checkForUpdate: async () => ({ ok: false, error: "manual fail" }) };
      await checkForUpdates({ manual: false });
      window.multiterm.checkForUpdate = async () => ({ ok: true, available: false });
      await checkForUpdates({ manual: false });
      window.multiterm.checkForUpdate = async () => { throw "string failure"; };
      await checkForUpdates({ manual: false });
      openUpdateDialog({ version: "x", asset: null });
      openUpdateDialog({ version: "x", asset: { url: "x" } });
      window.multiterm = oldMultiterm;

      logFileName(null);
      logFileName("\\");
      state.settings.snippets = null;
      state.zoomedId = findTerminal.id;
      buildContextMenu(findTerminal, "");
      state.zoomedId = null;
      state.settings.snippets = [{ name: "", command: "fallback" }];
      buildContextMenu(findTerminal, "");
      findTerminal.cwd = "";
      buildSurfaceContextMenu();
      findTerminal.cwd = "D:\\here";
      state.activeId = findTerminal.id;
      buildSurfaceContextMenu();

      renderContextMenu([{ label: "One", run() {} }]);
      showBuiltContextMenu(1, 1);
      moveContextFocus(-1);
      setContextFocus(-1);
      key(window, "Enter");
      renderContextMenu([{ label: "Alpha", run() {} }]);
      showBuiltContextMenu(1, 1);
      key(window, "z");
      showSessionInfoMenu({ ...findTerminal, status: "exited", startedAt: new Date().toISOString() });

      const untouched = document.createElement("select");
      untouched.innerHTML = '<option value="">Empty</option>';
      const holder = document.createElement("div");
      holder.append(untouched);
      document.body.append(holder);
      enhanceSelect(untouched);
      enhanceComboboxes();
      const input = untouched.parentElement.querySelector(".combobox-input");
      input.focus();
      input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      input.value = "none";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      key(input, "Tab");
      input.focus();
      elements.terminalSearchInput.focus();
      await new Promise((resolve) => setTimeout(resolve, 140));
      holder.remove();

      state.socket = savedSocket;
      state.socketReady = savedReady;
      return { branches: true, terminalCount: state.terminals.size };
    });

    expect(result.branches).toBe(true);
    expect(result.terminalCount).toBeGreaterThan(0);
  });

  test("covers the final residual branch alternatives @full", async () => {
    const result = await page.evaluate(async () => {
      const key = (target, value, init = {}) => target.dispatchEvent(new KeyboardEvent("keydown", {
        key: value, bubbles: true, cancelable: true, ...init
      }));
      const savedSocket = state.socket;
      const savedReady = state.socketReady;
      state.socket = { readyState: WebSocket.OPEN, send() {} };
      state.socketReady = true;

      state.settings.appTheme = "dark";
      systemThemeQuery.dispatchEvent(new Event("change"));
      elements.helpOverlay.querySelector(".modal-card")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      key(elements.snippetCommand, "Escape");
      key(elements.broadcastInput, "x");
      key(elements.snippetCommand, "x");

      const icon = elements.paneTemplate.content.querySelector(".pane-title-wrap i[data-lucide]");
      const iconParent = icon?.parentNode;
      const iconNext = icon?.nextSibling;
      icon?.remove();
      const noIcon = addTerminal({ title: "No elevated icon", elevated: true });
      if (icon && iconParent) iconParent.insertBefore(icon, iconNext);
      const oldShellValue = elements.shellSelect.value;
      elements.shellSelect.value = "";
      const fallbackShell = addTerminal({ title: "Fallback shell", shell: "" });
      const reattachedZero = addTerminal({ reattach: true, session: { id: `zero-${Date.now()}`, title: "Zero PID", pid: 0, shell: "" } });
      requestSession(fallbackShell);
      newAdminTerminal({ shell: "" });
      elements.shellSelect.value = oldShellValue;

      noIcon.term.element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2 }));
      noIcon.term.element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 1 }));
      const movable = addTerminal({ title: "Move right" });
      noIcon.pane.querySelector('[data-action="move-right"]')?.click();
      const unknownAction = document.createElement("button");
      unknownAction.dataset.action = "unknown";
      noIcon.pane.querySelector(".pane-actions")?.append(unknownAction);
      unknownAction.click();
      state.settings.layout = "manual";
      const dragBar = movable.pane.querySelector(".pane-bar");
      dragBar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 991, clientX: 300, clientY: 300 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 991, clientX: 320, clientY: 320 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 991, clientX: 320, clientY: 320 }));
      dragBar.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerId: 992, clientX: 300, clientY: 300 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 992, clientX: 1, clientY: 300 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 992, clientX: 1, clientY: 300 }));
      state.settings.layout = "grid";

      const savedAdmin = elements.statusAdmin;
      delete elements.statusAdmin;
      updateStatusBar();
      elements.statusAdmin = savedAdmin;
      const oldMulti = window.multiterm;
      window.multiterm = { relaunchElevated: async () => false };
      state.appElevated = false;
      await restartAsAdmin();
      window.multiterm.relaunchElevated = async () => true;
      await restartAsAdmin();
      window.multiterm = oldMulti;

      const primaryA = addTerminal({ title: "Primary A" });
      const primaryB = addTerminal({ title: "Primary B" });
      setActiveTerminal(primaryB.id);
      setPrimaryTerminal(primaryA.id);
      removeTerminal(primaryA.id);
      const onlyPrimary = addTerminal({ title: "Only primary" });
      setActiveTerminal(onlyPrimary.id);
      setPrimaryTerminal(onlyPrimary.id);
      removeTerminal(onlyPrimary.id);
      const activeA = addTerminal({ title: "Active A" });
      const activeB = addTerminal({ title: "Active B" });
      setActiveTerminal(activeA.id);
      removeTerminal(activeA.id);

      const renameTerm = addTerminal({ title: "Rename escape" });
      minimizeTerminal(renameTerm.id);
      const renameChip = elements.minimizedDock.querySelector(`[data-id="${renameTerm.id}"]`);
      renameChip?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      [...elements.contextMenu.querySelectorAll(".ctx-item")].find((row) => row.textContent.includes("Rename"))?.click();
      const renameInput = elements.minimizedDock.querySelector(".min-chip-rename");
      if (renameInput) key(renameInput, "Escape");
      minimizeTerminal(renameTerm.id);
      const renameChip2 = elements.minimizedDock.querySelector(`[data-id="${renameTerm.id}"]`);
      renameChip2?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      [...elements.contextMenu.querySelectorAll(".ctx-item")].find((row) => row.textContent.includes("Rename"))?.click();
      const renameInput2 = elements.minimizedDock.querySelector(".min-chip-rename");
      if (renameInput2) key(renameInput2, "x");
      renameInput2?.blur();

      const idle = addTerminal({ title: "" });
      idle.titleInput.value = "";
      idle.createdAt = performance.now() - 5000;
      state.activeId = idle.id;
      state.settings.notifySilence = true;
      const nativeTimer = window.setTimeout;
      let silence = null;
      window.setTimeout = (fn) => { silence = fn; return 1; };
      handleOutputNotifications(idle);
      window.setTimeout = nativeTimer;
      const hiddenDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
      Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => true });
      silence?.();
      if (hiddenDescriptor) Object.defineProperty(Document.prototype, "hidden", hiddenDescriptor);

      elements.shellSelect.value = "";
      newAdminTerminal({ shell: "" });
      elements.shellSelect.value = oldShellValue;
      const matchesDescriptor = Object.getOwnPropertyDescriptor(systemThemeQuery, "matches");
      Object.defineProperty(systemThemeQuery, "matches", { configurable: true, value: true });
      state.settings.appTheme = "system";
      resolveAppTheme();
      Object.defineProperty(systemThemeQuery, "matches", { configurable: true, value: false });
      resolveAppTheme();
      if (matchesDescriptor) Object.defineProperty(systemThemeQuery, "matches", matchesDescriptor); else delete systemThemeQuery.matches;
      const innerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");
      const hostWidthDescriptor = Object.getOwnPropertyDescriptor(elements.host, "clientWidth");
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 0 });
      Object.defineProperty(elements.host, "clientWidth", { configurable: true, value: 0 });
      defaultManualLayout(0);
      if (innerWidthDescriptor) Object.defineProperty(window, "innerWidth", innerWidthDescriptor);
      if (hostWidthDescriptor) Object.defineProperty(elements.host, "clientWidth", hostWidthDescriptor); else delete elements.host.clientWidth;

      state.mem.open = true;
      state.mem.stats = null;
      state.socketReady = false;
      requestMemStats();
      state.mem.requested = true;
      renderMemStatus();
      state.mem.requested = false;
      renderMemStatus();
      state.mem.stats = { supported: false, reason: "error" };
      renderMemStatus();
      state.socketReady = true;
      const oldDot = elements.logToggleDot;
      delete elements.logToggleDot;
      clearLogs();
      elements.logToggleDot = oldDot;
      logStore.autoscroll = true;
      renderAllLogs();
      appendLogRow({ ts: new Date().toISOString(), level: "info", source: "residual", message: "defined detail", detail: "detail" });
      logStore.autoscroll = false;
      renderAllLogs();
      appendLogRow({ ts: new Date().toISOString(), level: "info", source: "residual", message: "undefined detail" });

      openPalette();
      elements.paletteInput.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      closePalette();
      openQuickSwitch();
      elements.quickSwitchInput.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      closeQuickSwitch(false);
      key(window, "/", { ctrlKey: true });
      key(window, "/", { ctrlKey: true });
      openUpdateDialog({ version: "key-escape" });
      key(window, "x");
      key(window, "Escape");
      openUpdateDialog({ version: "coverage-helper" });
      dismissUpdateDialogFromKey(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
      state.activeId = null;
      openPalette();
      closePalette();
      state.activeId = null;
      key(window, "w", { ctrlKey: true, shiftKey: true });
      key(window, "c", { ctrlKey: true, shiftKey: true });
      key(window, "9", { altKey: true });
      state.pages = [{ id: "number-page", name: "Number" }];
      key(window, "1", { altKey: true });

      const find = addTerminal({ title: "Residual find" });
      setActiveTerminal(find.id);
      const originalSelection = find.term.getSelection.bind(find.term);
      find.term.getSelection = () => "selected";
      key(window, "c", { ctrlKey: true, shiftKey: true });
      find.term.getSelection = originalSelection;
      const originalSearch = find.searchAddon;
      find.searchAddon = { onDidChangeResults() {}, findNext() {}, findPrevious() {}, clearDecorations() {}, clearActiveDecoration() {} };
      bindPaneFind(find);
      key(find.findInput, "Escape");
      key(find.findInput, "x");
      find.findBar.querySelector('[data-find="close"]')?.click();
      const bogusFind = document.createElement("button");
      bogusFind.dataset.find = "bogus";
      find.findBar.append(bogusFind);
      bogusFind.click();
      elements.findAllBar.querySelector('[data-findall="close"]')?.click();
      const bogusFindAll = document.createElement("button");
      bogusFindAll.dataset.findall = "bogus";
      elements.findAllBar.append(bogusFindAll);
      bogusFindAll.click();
      const oldFindAllBar = elements.findAllBar;
      delete elements.findAllBar;
      state.findAll.active = true;
      closeFindAll();
      elements.findAllBar = oldFindAllBar;
      state.activeId = null;
      state.findAll.active = true;
      closeFindAll();
      state.findAll.order = [find.id];
      state.findAll.ti = 0;
      state.findAll.li = 0;
      find.lastFindCount = 1;
      elements.findAllInput.value = "x";
      findAllNav(-1);
      state.findAll.order = [find.id];
      state.findAll.ti = 0;
      state.findAll.li = 2;
      find.lastFindCount = 4;
      findAllNav(-1);
      state.findAll.order = ["missing", find.id];
      state.findAll.li = 0;
      refreshFindAllCount();
      find.searchAddon = originalSearch;

      state.broadcastOpen = true;
      state.activeId = null;
      toggleBroadcast(false);
      state.socketReady = false;
      elements.broadcastInput.value = "not sent";
      sendBroadcast();
      state.socketReady = true;

      state.settings.snippets = [{ name: "", command: "fallback label" }];
      renderSnippets();
      window.multiterm = { pickScript: async () => "D:\\no-cwd.cmd" };
      await browseAndRunScriptInNewTerminal({ cwd: "" });
      buildScriptCommand(find, "");
      buildScriptCommand(find, "noextension");
      state.settings.cleanCopilotClipboard = true;
      normalizeClipboardText("one |\r\ntwo |");
      normalizeClipboardText("one |\ntwo |");
      const oldClipboard = navigator.clipboard;
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => "" } });
      await pasteIntoTerminal(find.id);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => "run" } });
      await performRightClickPaste(find.id, true);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: oldClipboard });
      elements.rightClickWarnText.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      window.multiterm = oldMulti;

      localStorage.setItem("multiterm.pages", JSON.stringify([{ id: "array-page", name: "Array" }]));
      loadPages();
      state.pages = [{ id: "p1", name: "One" }, { id: "p2", name: "Two" }];
      state.activePageId = "p1";
      const remain = addTerminal({ title: "Remain" });
      remain.pageId = "p1";
      const moving = addTerminal({ title: "Moving one" });
      moving.pageId = "p1";
      setActiveTerminal(moving.id);
      moveTerminalToPage(moving.id, "p2");
      const moveOne = addTerminal({ title: "Move one" });
      moveOne.pageId = "p2";
      const moveTwo = addTerminal({ title: "Move two" });
      moveTwo.pageId = "p2";
      removePage("p2");

      state.pages = [{ id: "park1", name: "Park 1" }, { id: "park2", name: "Park 2" }];
      state.activePageId = "park1";
      remain.pageId = "park1";
      remain.minimized = true;
      find.pageId = "park1";
      find.minimized = true;
      renderPager();
      const renamePageChip = elements.pagerList.querySelector(".pager-chip");
      renamePageChip?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      const renamePageInput = elements.pagerList.querySelector(".pager-rename");
      if (renamePageInput) key(renamePageInput, "Escape");
      localStorage.setItem("multiterm.workspaces", JSON.stringify({ W: { pages: [{ id: "w", name: "" }] } }));
      state.workspaces = loadWorkspaces();
      await restoreWorkspace("W");

      const oldAboutVersion = elements.aboutVersion;
      const oldAboutText = elements.aboutVersionText;
      elements.aboutVersion = null;
      elements.aboutVersionText = null;
      openAbout();
      elements.aboutVersion = oldAboutVersion;
      elements.aboutVersionText = oldAboutText;
      compareAppVersions("1.2", "1");
      window.multiterm = { downloadUpdate() {} };
      openUpdateDialog({ version: "installable", asset: { url: "asset" } });
      window.multiterm = oldMulti;

      state.activeId = null;
      elements.cwdInput.value = "";
      remain.minimized = true;
      state.terminals.set(remain.id, remain);
      buildSurfaceContextMenu();
      for (const label of ["New PowerShell 7", "New Windows PowerShell", "New Command Prompt", "New WSL"]) {
        const row = [...elements.contextMenu.querySelectorAll(".ctx-item")].find((item) => item.textContent.includes(label));
        row?.click();
        buildSurfaceContextMenu();
      }
      const restoreRow = [...elements.contextMenu.querySelectorAll(".ctx-item")].find((item) => item.textContent.includes("Restore"));
      restoreRow?.click();

      renderContextMenu([{ label: "Alpha", run() {} }]);
      showBuiltContextMenu(1, 1);
      onContextMenuKeydown(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
      renderContextMenu([{ label: "Alpha", run() {} }]);
      showBuiltContextMenu(1, 1);
      onContextMenuKeydown(new KeyboardEvent("keydown", { key: "?", bubbles: true, cancelable: true }));

      const selectA = comboSelects[0];
      const selectB = comboSelects[1];
      const inputA = selectA.parentElement.querySelector(".combobox-input");
      const inputB = selectB.parentElement.querySelector(".combobox-input");
      const listA = document.querySelectorAll(".combobox-list")[0];
      const scrollDescriptor = Object.getOwnPropertyDescriptor(listA, "scrollHeight");
      Object.defineProperty(listA, "scrollHeight", { configurable: true, value: 100 });
      inputA.dispatchEvent(new FocusEvent("focus"));
      inputA.dispatchEvent(new FocusEvent("focus"));
      inputA.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      inputA.value = "p";
      inputA.dispatchEvent(new Event("input", { bubbles: true }));
      key(inputA, "x");
      key(inputA, "Tab");
      inputA.dispatchEvent(new FocusEvent("focus"));
      inputB.dispatchEvent(new FocusEvent("focus"));
      inputA.dispatchEvent(new FocusEvent("blur"));
      inputB.dispatchEvent(new FocusEvent("focus"));
      inputB.dispatchEvent(new FocusEvent("blur"));
      await new Promise((resolve) => setTimeout(resolve, 140));
      if (scrollDescriptor) Object.defineProperty(listA, "scrollHeight", scrollDescriptor); else delete listA.scrollHeight;

      state.socket = savedSocket;
      state.socketReady = savedReady;
      return { residual: true, zeroPid: reattachedZero.pid };
    });

    expect(result).toEqual({ residual: true, zeroPid: 0 });
  });

  test("covers update checker, downloader, notes renderer, and browser/desktop handoffs", async () => {
    const result = await page.evaluate(async () => {
      const previousMultiterm = window.multiterm;
      const originalOpen = window.open;
      const opened = [];
      window.open = (...args) => { opened.push(args); return null; };

      compareAppVersions(null, "0");
      compareAppVersions("1", "1.0.1");
      compareAppVersions("2", "1");
      pickInstallerAsset(null);
      pickInstallerAsset([{ name: "readme.txt" }]);
      pickInstallerAsset([{ name: "portable.exe", browser_download_url: "https://example/portable", size: "bad" }]);

      localStorage.setItem("multiterm.updateCheck", "{");
      loadUpdateMeta();
      saveUpdateMeta({ probe: true });

      window.multiterm = { checkForUpdate: async () => ({ ok: false }), openReleasePage: (url) => opened.push([url]) };
      await requestLatestRelease();
      await checkForUpdates({ manual: true });
      window.multiterm.checkForUpdate = async () => null;
      await checkForUpdates({ manual: true });
      window.multiterm.checkForUpdate = async () => { throw "string failure"; };
      await checkForUpdates({ manual: true });
      state.update.checking = true;
      await checkForUpdates();
      state.update.checking = false;

      const release = { version: "9.9.9", url: "https://example/release", notes: "", asset: { name: "setup.exe", url: "https://example/setup" } };
      openUpdateDialog(release);
      renderReleaseNotes("");
      renderReleaseNotes("# Heading\n\n* item with `code` and **bold**\nplain http://example.test and https://example.test\nsecond line");
      dismissUpdateDialog();
      state.update.downloading = true;
      dismissUpdateDialog();
      updateDownloadProgress();
      updateDownloadProgress({ received: 200, total: 100 });
      updateDownloadProgress({ received: 200, total: 0 });
      state.update.downloading = false;

      delete window.multiterm.downloadUpdate;
      state.update.release = release;
      await startUpdateDownload();
      window.multiterm.downloadUpdate = async () => ({ ok: false, error: "download failed" });
      await startUpdateDownload();
      window.multiterm.downloadUpdate = async () => null;
      await startUpdateDownload();
      window.multiterm.downloadUpdate = async () => ({ ok: true });
      await startUpdateDownload();
      state.update.downloading = false;
      state.update.release = null;
      await startUpdateDownload();

      openReleasePage();
      delete window.multiterm.openReleasePage;
      openReleasePage("https://example/browser");
      closeUpdateDialog();
      window.open = originalOpen;
      window.multiterm = previousMultiterm;
      return { opened: opened.length, noteTags: [...elements.updateNotes.children].map((el) => el.tagName) };
    });

    expect(result.opened).toBeGreaterThan(1);
    expect(result.noteTags).toContain("H3");
    expect(result.noteTags).toContain("UL");
    expect(result.noteTags).toContain("P");
  });

  test("covers context menu row types, keyboard navigation, callbacks, placement, and combobox interaction", async () => {
    const result = await page.evaluate(async () => {
      let runs = 0;
      renderContextMenu([]);
      moveContextFocus(1);
      renderContextMenu([
        { separator: true },
        { info: true, icon: "info", label: "Information" },
        { input: true, icon: "terminal", label: "Command", placeholder: "", value: "", run: () => { runs += 1; } },
        { icon: "link", label: "Parts", parts: [
          { text: "plain" },
          { text: "run", title: "part title", className: "ctx-link", run: () => { runs += 1; } }
        ] },
        { icon: "play", label: "Run item", hint: "Ctrl+R", title: "title", run: () => { runs += 1; } },
        { icon: "ban", label: "Disabled", disabled: true, run: () => { runs += 100; } }
      ]);
      showBuiltContextMenu(-100, -100, { alignRight: true, alignBottom: true });
      const input = elements.contextMenu.querySelector(".ctx-command-input");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      input.value = "value";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

      renderContextMenu([{ icon: "play", label: "Alpha", run: () => { runs += 1; } }, { icon: "play", label: "Beta", run: () => { runs += 1; } }]);
      showBuiltContextMenu(window.innerWidth + 100, window.innerHeight + 100);
      const key = (value, init = {}) => window.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...init }));
      key("ArrowDown");
      key("ArrowUp");
      key("Tab");
      key("Tab", { shiftKey: true });
      key("Home");
      key("End");
      key("Enter");
      renderContextMenu([{ icon: "play", label: "Alpha", run: () => { runs += 1; } }]);
      showBuiltContextMenu(10, 10);
      key("1");
      renderContextMenu([{ icon: "play", label: "Alpha", run: () => { runs += 1; } }]);
      showBuiltContextMenu(10, 10);
      key("a");
      renderContextMenu([{ icon: "play", label: "Alpha", run: () => { runs += 1; } }]);
      showBuiltContextMenu(10, 10);
      key("z");
      key("x", { ctrlKey: true });
      key("Escape");
      onContextMenuKeydown(new KeyboardEvent("keydown", { key: "x" }));

      const selects = comboSelects.filter((select) => select._combo);
      const firstInput = selects[0].parentElement.querySelector(".combobox-input");
      firstInput.focus();
      firstInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      firstInput.value = "no matches whatsoever";
      firstInput.dispatchEvent(new Event("input", { bubbles: true }));
      firstInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
      firstInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      firstInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      firstInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
      firstInput.blur();
      await new Promise((resolve) => setTimeout(resolve, 140));
      refreshComboboxes();
      return { runs, selectCount: selects.length };
    });

    expect(result.runs).toBe(4);
    expect(result.selectCount).toBeGreaterThan(0);
  });

  test("covers all report-identified renderer branch alternatives @full", async () => {
    const result = await page.evaluate(async () => {
      const key = (target, value, init = {}) => target.dispatchEvent(new KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
        ...init
      }));
      const savedSocket = state.socket;
      const savedReady = state.socketReady;
      const savedMultiterm = window.multiterm;
      state.socket = { readyState: WebSocket.OPEN, send() {} };
      state.socketReady = true;

      // Elevated pane without an icon: the icon is optional in custom templates.
      const templateIcons = [...elements.paneTemplate.content.querySelectorAll(".pane-title-wrap [data-lucide]")];
      const iconLocations = templateIcons.map((icon) => ({ icon, parent: icon.parentNode, next: icon.nextSibling }));
      templateIcons.forEach((icon) => icon.remove());
      const noIcon = addTerminal({ title: "Coverage no icon", elevated: true });
      for (const { icon, parent, next } of iconLocations) parent.insertBefore(icon, next);

      // In manual mode an armed edge bypasses free-position updates.
      state.settings.layout = "manual";
      applySettings();
      const hostRect = elements.host.getBoundingClientRect();
      const dragBar = noIcon.pane.querySelector(".pane-bar");
      const startX = hostRect.left + hostRect.width / 2;
      const startY = hostRect.top + hostRect.height / 2;
      dragBar.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, button: 0, pointerId: 7001, clientX: startX, clientY: startY
      }));
      window.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, pointerId: 7001, clientX: hostRect.left + 1, clientY: startY
      }));
      window.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 7001 }));
      state.settings.layout = "auto";
      applySettings();

      // Optional elevation/status controls and both restart outcomes.
      const savedStatusAdmin = elements.statusAdmin;
      elements.statusAdmin = null;
      applyElevationBadge();
      elements.statusAdmin = savedStatusAdmin;
      state.appElevated = false;
      window.multiterm = { restartAsAdmin: async () => true };
      await restartAsAdmin();

      // Removing the sole active primary has no replacement for either role.
      const sole = addTerminal({ title: "Coverage sole terminal" });
      const existingTerminals = state.terminals;
      const existingActive = state.activeId;
      const existingPrimary = state.primaryId;
      existingTerminals.delete(sole.id);
      state.terminals = new Map([[sole.id, sole]]);
      state.activeId = sole.id;
      state.primaryId = sole.id;
      removeTerminal(sole.id);
      state.terminals = existingTerminals;
      state.activeId = existingTerminals.has(existingActive) ? existingActive : existingTerminals.keys().next().value || null;
      state.primaryId = existingTerminals.has(existingPrimary) ? existingPrimary : null;

      // Memory readout: requested-without-data and zero system-used denominator.
      state.mem.unsupported = false;
      state.mem.unsupportedReason = null;
      state.mem.stats = null;
      state.mem.requested = true;
      renderMemStatus();
      state.mem.stats = { app: 1, systemUsed: 0, systemTotal: 10 };
      renderMemStatus();
      state.socketReady = false;
      requestMemStats();
      state.socketReady = true;

      // Log rendering/copying with autoscroll off and a defined detail payload.
      setLogPanel(true);
      logStore.minLevel = "debug";
      logStore.entries = [{ id: 9001, time: Date.now(), level: "info", source: "coverage", message: "detail", detail: "value" }];
      logStore.autoscroll = false;
      renderAllLogs();
      appendLogRow({ id: 9002, time: Date.now(), level: "info", source: "coverage", message: "no scroll" });
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => {}, readText: async () => "" }
      });
      copyLogs();
      await Promise.resolve();
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });

      const savedDot = elements.logToggleDot;
      elements.logToggleDot = null;
      setLogPanel(false);
      setLogPanel(true);
      elements.logToggleDot = savedDot;

      // Global-shortcut false alternatives must run with no overlay intercepting.
      openUpdateDialog({ version: "coverage-key" });
      key(window, "x");
      closeUpdateDialog();
      closePalette();
      closeQuickSwitch(false);
      closeFindAll();
      elements.shortcutsOverlay.hidden = true;
      elements.aboutOverlay.hidden = true;
      elements.helpOverlay.hidden = true;
      state.activeId = null;
      key(window, "w", { ctrlKey: true, shiftKey: true });
      key(window, "c", { ctrlKey: true, shiftKey: true });
      key(window, "9", { altKey: true });

      // Missing terminal in an earlier find pane contributes zero matches.
      const findTarget = existingTerminals.values().next().value;
      if (findTarget) {
        findTarget.lastFindCount = 2;
        state.findAll.order = ["coverage-missing", findTarget.id];
        state.findAll.ti = 1;
        state.findAll.li = 0;
        elements.findAllInput.value = "coverage";
        refreshFindAllCount();
      }

      // A real target plus an offline socket reaches sendBridge's false result.
      if (findTarget) {
        state.activeId = findTarget.id;
        state.broadcastScope = "active";
        elements.broadcastInput.value = "coverage offline";
        state.socketReady = false;
        sendBroadcast();
        state.socketReady = true;
      }

      // Page rename ignores ordinary keys before committing on blur.
      state.pages = [{ id: "coverage-page", name: "Coverage page" }];
      state.activePageId = "coverage-page";
      for (const terminal of state.terminals.values()) terminal.pageId = "coverage-page";
      renderPager();
      const pageChip = elements.pagerList.querySelector(".pager-chip");
      startPageRename(pageChip);
      const pageInput = elements.pagerList.querySelector(".pager-rename");
      key(pageInput, "x");
      pageInput.blur();

      // Version labels are optional in embedded variants.
      const savedVersion = elements.aboutVersion;
      const savedVersionText = elements.aboutVersionText;
      elements.aboutVersion = null;
      elements.aboutVersionText = null;
      applyVersion();
      elements.aboutVersion = savedVersion;
      elements.aboutVersionText = savedVersionText;

      // Context input ordinary key and combobox zero-height/focus-loss paths.
      renderContextMenu([{ input: true, icon: "terminal", label: "Coverage input", run() {} }]);
      const commandInput = elements.contextMenu.querySelector(".ctx-command-input");
      key(commandInput, "x");

      const holder = document.createElement("div");
      const select = document.createElement("select");
      select.innerHTML = '<option value="one">One</option><option value="two">Two</option>';
      holder.append(select);
      document.body.append(holder);
      enhanceSelect(select);
      const comboInput = select.parentElement.querySelector(".combobox-input");
      const comboList = [...document.querySelectorAll(".combobox-list")].at(-1);
      Object.defineProperty(comboList, "scrollHeight", { configurable: true, value: 0 });
      const nativeSetTimeout = window.setTimeout;
      window.setTimeout = (callback) => { callback(); return 1; };
      comboInput.dispatchEvent(new FocusEvent("focus"));
      window.dispatchEvent(new Event("resize"));
      comboInput.dispatchEvent(new FocusEvent("focus"));
      comboInput.dispatchEvent(new FocusEvent("blur"));
      window.setTimeout = nativeSetTimeout;
      comboList.remove();
      holder.remove();

      // Cover the scalar block-input normalization path.
      InputPromptDetector.classifyInputPromptBlock("Question?");

      window.multiterm = savedMultiterm;
      state.socket = savedSocket;
      state.socketReady = savedReady;
      const cleanupUrl = savedSocket?.url || `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
      const cleanupSocket = new WebSocket(cleanupUrl);
      const cleanupReady = await new Promise((resolve) => {
        cleanupSocket.addEventListener("open", () => resolve(true), { once: true });
        cleanupSocket.addEventListener("error", () => resolve(false), { once: true });
      });
      if (cleanupReady) cleanupSocket.send(JSON.stringify({ type: "killAll" }));
      cleanupSocket.close();
      for (const terminal of [...state.terminals.values()]) disposeTerminal(terminal);
      return { covered: true, remaining: state.terminals.size };
    });

    await page.waitForTimeout(200);
    await page.evaluate(() => {
      hideContextMenu();
      openShortcuts();
    });
    await page.keyboard.press("x");
    await page.evaluate(() => closeShortcuts());
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      hideContextMenu();
      openUpdateDialog({ version: "coverage-ordinary-key" });
    });
    await page.keyboard.press("x");
    await page.evaluate(() => closeUpdateDialog());

    expect(result.covered).toBe(true);
    expect(result.remaining).toBe(0);
  });

  test("covers header-search filter internals, off-host panes, and counter fallbacks", async () => {
    const setup = await page.evaluate(async () => {
      closeAllTerminals();
      const alpha = addTerminal({ title: "Header search alpha" });
      const beta = addTerminal({ title: "Header search beta" });
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { alpha: alpha.id, beta: beta.id };
    });

    const result = await page.evaluate(async ({ alpha: alphaId, beta: betaId }) => {
      const alpha = state.terminals.get(alphaId);
      const beta = state.terminals.get(betaId);
      const originalQueueResize = window.queueResize;
      // Hiding a pane reflows the layout, and the resulting pty WINCH makes the
      // live shell repaint over the tokens written straight into the buffer.
      window.queueResize = () => {};

      // The live shell keeps painting its prompt after the pane opens, so a
      // single write can be scrolled or cleared away before the search runs.
      // Re-write until the token is actually resolvable in the buffer.
      const bufferHasToken = (terminal, token) => {
        const buffer = terminal.term.buffer.active;
        for (let row = 0; row < buffer.length; row += 1) {
          const line = buffer.getLine(row);
          if (line && line.translateToString(true).includes(token)) return true;
        }
        return false;
      };
      const writeUntilVisible = async (terminal, text, token) => {
        for (let attempt = 0; attempt < 25; attempt += 1) {
          terminal.term.write(text);
          await new Promise((resolve) => setTimeout(resolve, 80));
          if (bufferHasToken(terminal, token)) return true;
        }
        return false;
      };

      const results = {};
      beta.term.write("\r\nplain beta line\r\n");
      results.alphaTokenVisible = await writeUntilVisible(alpha, "\r\nCOVERTOKEN alpha line\r\n", "COVERTOKEN");

      // preserveNav keeps the caller's position when the pass is a refresh
      // rather than a brand-new query.
      state.findAll.query = "";
      state.findAll.ti = 0;
      state.findAll.li = 4;
      runSearchPass("COVERTOKEN", { filter: false, preserveNav: true });
      results.preservedNav = state.findAll.li;
      results.preservedOrder = state.findAll.order.length;

      // A pane without a search addon is skipped instead of throwing.
      const savedAddon = beta.searchAddon;
      beta.searchAddon = null;
      results.addonlessMatched = searchTerminalPane(beta, "COVERTOKEN");
      beta.searchAddon = savedAddon;

      // Visibility reconciliation is a no-op once the query is gone.
      const savedQuery = state.findAll.query;
      state.findAll.query = "";
      results.reconciledWithoutQuery = reconcileFilterVisibility(beta);
      state.findAll.query = savedQuery;

      // Panes parked off-host still take part in the ordered search sweep.
      const parkedParent = beta.pane.parentNode;
      const parkedNext = beta.pane.nextSibling;
      beta.pane.remove();
      results.offHostOrdered = orderedTerminals().map((terminal) => terminal.id);
      parkedParent.insertBefore(beta.pane, parkedNext);

      // The header counter is optional markup, so refreshes tolerate its absence.
      const savedCount = elements.terminalSearchCount;
      elements.terminalSearchCount = null;
      refreshFindAllCount();
      elements.terminalSearchCount = savedCount;
      results.countSurvivedMissingElement = elements.terminalSearchCount.textContent;

      // Shift+Enter in the header box walks the matches backwards.
      elements.terminalSearchInput.value = "COVERTOKEN";
      elements.terminalSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      const forward = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      elements.terminalSearchInput.dispatchEvent(forward);
      const backward = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true });
      elements.terminalSearchInput.dispatchEvent(backward);
      results.shiftEnterHandled = backward.defaultPrevented;
      results.filterCount = elements.terminalSearchCount.textContent;

      // A pane that starts matching mid-session schedules a debounced refresh
      // that re-runs the pass while the query is still live.
      results.betaTokenVisible = await writeUntilVisible(beta, "\r\nCOVERTOKEN arrives late\r\n", "COVERTOKEN");
      beta.searchText = `${beta.searchText}covertoken`;
      updateTerminalSearchVisibility(beta);
      await new Promise((resolve) => setTimeout(resolve, 320));
      results.refreshedOrder = state.findAll.order.length;
      results.betaVisible = !beta.pane.classList.contains("is-search-hidden");

      // The same debounce bails out when the query disappears before it fires.
      alpha.searchText = "";
      updateTerminalSearchVisibility(alpha);
      state.terminalSearch = "";
      await new Promise((resolve) => setTimeout(resolve, 260));

      clearTerminalSearch();
      window.queueResize = originalQueueResize;
      return results;
    }, setup);

    expect(result.alphaTokenVisible).toBe(true);
    expect(result.betaTokenVisible).toBe(true);
    expect(result.preservedNav).toBe(4);
    expect(result.preservedOrder).toBeGreaterThan(0);
    expect(result.addonlessMatched).toBe(false);
    expect(result.reconciledWithoutQuery).toBe(false);
    expect(result.offHostOrdered).toContain(setup.beta);
    expect(result.countSurvivedMissingElement).toBe("");
    expect(result.shiftEnterHandled).toBe(true);
    expect(result.filterCount).not.toBe("");
    expect(result.refreshedOrder).toBeGreaterThan(0);
    expect(result.betaVisible).toBe(true);

    await page.evaluate(() => {
      state.settings.keepSessionsOnClose = true;
      closeAllTerminals();
    });
  });
});
