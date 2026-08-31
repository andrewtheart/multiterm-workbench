/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const embedHost = require("../../public/embed-host.js");

function fakeWindow({ framed = true } = {}) {
  const listeners = new Map();
  const win = {
    posted: [],
    listeners,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    dispatch(type, event) {
      for (const handler of listeners.get(type) || []) handler(event);
    }
  };
  win.parent = framed ? { postMessage: (message) => win.posted.push(message) } : win;
  return win;
}

function createHost(overrides = {}) {
  const sent = [];
  const host = embedHost.createEmbedHost({
    send: (message) => sent.push(message),
    setTimeout: () => 0,
    clearTimeout: () => {},
    ...overrides
  });
  return { host, sent };
}

function respond(host, sent, index, patch) {
  return host.handleMessage({
    channel: embedHost.CHANNEL,
    type: "response",
    id: sent[index].id,
    ...patch
  });
}

describe("embedded host bridge", () => {
  it("installs only when the workbench document is framed", () => {
    const standalone = fakeWindow({ framed: false });
    expect(embedHost.isEmbedded(standalone)).toBe(false);
    expect(embedHost.install(standalone)).toBeNull();
    // The desktop and plain-browser builds must keep seeing no preload at all.
    expect(standalone.multiterm).toBeUndefined();

    const framed = fakeWindow();
    expect(embedHost.isEmbedded(framed)).toBe(true);
    expect(embedHost.install(framed, { setTimeout: () => 0, clearTimeout: () => {} })).not.toBeNull();
    expect(typeof framed.multiterm.readClipboardText).toBe("function");
  });

  it("omits the capabilities an editor tab cannot honour", () => {
    const framed = fakeWindow();
    embedHost.install(framed, { setTimeout: () => 0, clearTimeout: () => {} });
    // The renderer branches on these being absent to show its "desktop app only"
    // paths; offering them would strand the user waiting on a reply.
    for (const absent of [
      "isElevated",
      "restartAsAdmin",
      "setFullscreen",
      "minimizeWindow",
      "checkForUpdate",
      "downloadUpdate",
      "onCloseRequest",
      "respondClose",
      "chooseBridgeNow"
    ]) {
      expect(framed.multiterm[absent]).toBeUndefined();
    }
  });

  it("resolves a request with the host's value", async () => {
    const { host, sent } = createHost();
    const pending = host.api.readClipboardText();
    expect(sent[0]).toMatchObject({ channel: embedHost.CHANNEL, type: "request", method: "readClipboardText" });
    respond(host, sent, 0, { ok: true, value: "copied text" });
    await expect(pending).resolves.toBe("copied text");
  });

  it("resolves empty clipboard text rather than failing", async () => {
    // An image-only clipboard must look like "no text" so the renderer forwards
    // Ctrl+V to the program instead of pasting nothing.
    const { host, sent } = createHost();
    const pending = host.api.readClipboardText();
    respond(host, sent, 0, { ok: true, value: "" });
    await expect(pending).resolves.toBe("");
  });

  it("rejects with the host's reason", async () => {
    const { host, sent } = createHost();
    const pending = host.api.writeClipboardText("x");
    respond(host, sent, 0, { ok: false, error: "Clipboard is locked" });
    await expect(pending).rejects.toThrow("Clipboard is locked");
  });

  it("settles a silent host instead of hanging forever", async () => {
    let fire = null;
    const { host } = createHost({ setTimeout: (fn) => { fire = fn; return 1; } });
    const pending = host.api.readClipboardText();
    fire();
    await expect(pending).rejects.toThrow(/did not answer readClipboardText/);
  });

  it("rejects when the shell cannot be reached at all", async () => {
    const host = embedHost.createEmbedHost({
      send: () => { throw new Error("frame is gone"); },
      setTimeout: () => 0,
      clearTimeout: () => {}
    });
    await expect(host.api.pickScript()).rejects.toThrow("frame is gone");
    expect(host.pending.size).toBe(0);
  });

  it("coerces arguments the way the Electron preload does", () => {
    const { host, sent } = createHost();
    host.api.writeClipboardText(42);
    host.api.pickFolder(undefined);
    host.api.openReleasePage("https://example.invalid/r");
    expect(sent[0].args).toEqual(["42"]);
    expect(sent[1].args).toEqual([""]);
    expect(sent[2].args).toEqual(["https://example.invalid/r"]);
  });

  it("sends fire-and-forget notifications without awaiting a reply", () => {
    const { host, sent } = createHost();
    expect(host.api.focusWindow()).toBe(true);
    expect(sent[0]).toMatchObject({ type: "notify", method: "focusWindow" });
    expect(host.pending.size).toBe(0);
  });

  it("ignores replies that are not ours", () => {
    const { host, sent } = createHost();
    host.api.readClipboardText();
    expect(host.handleMessage(null)).toBe(false);
    expect(host.handleMessage({ channel: "other", type: "response", id: sent[0].id })).toBe(false);
    expect(host.handleMessage({ channel: embedHost.CHANNEL, type: "request", id: sent[0].id })).toBe(false);
    expect(host.handleMessage({ channel: embedHost.CHANNEL, type: "response", id: "unknown" })).toBe(false);
    expect(host.pending.size).toBe(1);
  });

  it("accepts replies only from the frame that owns us", async () => {
    const framed = fakeWindow();
    embedHost.install(framed, { setTimeout: () => 0, clearTimeout: () => {} });
    const pending = framed.multiterm.readClipboardText();
    const id = framed.posted[0].id;

    framed.dispatch("message", {
      source: { impostor: true },
      data: { channel: embedHost.CHANNEL, type: "response", id, ok: true, value: "stolen" }
    });
    framed.dispatch("message", {
      source: framed.parent,
      data: { channel: embedHost.CHANNEL, type: "response", id, ok: true, value: "genuine" }
    });

    await expect(pending).resolves.toBe("genuine");
  });

  it("routes window.open through the host because a framed page cannot open tabs", () => {
    const framed = fakeWindow();
    embedHost.install(framed, { setTimeout: () => 0, clearTimeout: () => {} });
    expect(framed.open("https://example.invalid/docs", "_blank")).toBeNull();
    expect(framed.posted.at(-1)).toMatchObject({
      type: "notify",
      method: "openExternal",
      args: ["https://example.invalid/docs"]
    });
  });

  it("requires a send channel", () => {
    expect(() => embedHost.createEmbedHost({})).toThrow(TypeError);
    expect(() => embedHost.createEmbedHost()).toThrow(TypeError);
  });

  it("falls back to the default timeout when none is configured", () => {
    const timers = [];
    const { host } = createHost({ setTimeout: (fn, ms) => timers.push(ms), timeoutMs: undefined });
    host.request("readClipboardText");
    expect(timers).toEqual([embedHost.DEFAULT_TIMEOUT_MS]);

    const configured = [];
    const custom = createHost({ setTimeout: (fn, ms) => configured.push(ms), timeoutMs: 250 });
    custom.host.request("pickScript");
    expect(configured).toEqual([250]);

    const rejected = [];
    const invalid = createHost({ setTimeout: (fn, ms) => rejected.push(ms), timeoutMs: -1 });
    invalid.host.request("pickScript");
    expect(rejected).toEqual([embedHost.DEFAULT_TIMEOUT_MS]);
  });

  it("uses the ambient timers when none are injected", async () => {
    vi.useFakeTimers();
    try {
      const sent = [];
      const host = embedHost.createEmbedHost({ send: (message) => sent.push(message) });
      const answered = host.request("readClipboardText");
      // Resolving clears the pending timer through the default clearTimeout.
      host.handleMessage({ channel: embedHost.CHANNEL, type: "response", id: sent[0].id, ok: true, value: "text" });
      await expect(answered).resolves.toBe("text");
      expect(host.pending.size).toBe(0);

      const abandoned = expect(host.request("pickFolder")).rejects.toThrow("The MultiTerm host did not answer pickFolder.");
      await vi.advanceTimersByTimeAsync(embedHost.DEFAULT_TIMEOUT_MS + 10);
      await abandoned;
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a notification that could not be sent at all", () => {
    const host = embedHost.createEmbedHost({
      send: () => {
        throw new Error("the shell is gone");
      },
      setTimeout: () => 0,
      clearTimeout: () => {}
    });
    expect(host.notify("focusWindow")).toBe(false);
    expect(host.api.focusWindow()).toBe(false);
  });

  it("rejects a request whose send failed, even when the failure is not an Error", async () => {
    const host = embedHost.createEmbedHost({
      send: () => {
        throw "the shell is gone";
      },
      setTimeout: () => 0,
      clearTimeout: () => {}
    });
    await expect(host.request("readClipboardText")).rejects.toThrow("the shell is gone");
    expect(host.pending.size).toBe(0);
  });

  it("installs with no options, using the ambient timers", () => {
    const framed = fakeWindow();
    expect(embedHost.install(framed)).not.toBeNull();
    expect(typeof framed.multiterm.readClipboardText).toBe("function");
  });

  it("names every method it exposes so the renderer can feature-detect", () => {
    const framed = fakeWindow();
    embedHost.install(framed, { setTimeout: () => 0, clearTimeout: () => {} });
    for (const method of embedHost.REQUEST_METHODS) {
      expect(typeof framed.multiterm[method]).toBe("function");
    }
    for (const method of embedHost.NOTIFY_METHODS) {
      expect(typeof framed.multiterm[method]).toBe("function");
    }
  });

  it("passes each request its own arguments", () => {
    const { host, sent } = createHost();
    host.api.writeClipboardText(42);
    host.api.pickFolder();
    host.api.openReleasePage("https://github.com/andrewtheart/multiterm-workbench/releases/latest");
    host.api.configureDiagnostics({ enabled: true });
    host.api.pickScript();
    expect(sent.map((message) => [message.method, message.args])).toEqual([
      ["writeClipboardText", ["42"]],
      ["pickFolder", [""]],
      ["openReleasePage", ["https://github.com/andrewtheart/multiterm-workbench/releases/latest"]],
      ["configureDiagnostics", [{ enabled: true }]],
      ["pickScript", []]
    ]);
  });

  it("reports a failure with no reason using the method that failed", async () => {
    const { host, sent } = createHost();
    const pending = host.api.pickScript();
    respond(host, sent, 0, { ok: false });
    await expect(pending).rejects.toThrow("pickScript failed in the MultiTerm host.");
  });
});
