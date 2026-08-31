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

/*
 * Embedded-host bridge.
 *
 * When a VS Code extension frames the workbench, the renderer keeps running the
 * ordinary browser build: it is same-origin with the bridge, so terminals, the
 * WebSocket and storage all work untouched. What it loses is the Electron
 * preload, and with it the handful of capabilities a sandboxed frame cannot
 * reach on its own -- notably clipboard access and native pickers.
 *
 * This module rebuilds that surface as `window.multiterm`, backed by postMessage
 * to the webview shell rather than Electron IPC. It installs ONLY when framed,
 * so the desktop and plain-browser builds are unaffected.
 *
 * Capabilities that have no meaning inside an editor tab -- elevation, the
 * in-app updater, fullscreen, minimise -- are deliberately absent, because the
 * renderer already degrades gracefully when a `window.multiterm` method is
 * missing. Answering them badly would be worse than not offering them.
 *
 * Keep this file free of `document`/`state` references so it stays testable in
 * Node, and mirror the Electron preload's return shapes exactly: callers treat a
 * rejection as "no text to paste" and fall through to other behaviour.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  /* v8 ignore start -- the browser build loads this as a classic script, where module is undefined; install() itself is covered */
  } else {
    root.MultiTermEmbedHost = api;
    // No-ops unless this document is framed, so the desktop and plain-browser
    // builds keep their existing behaviour.
    api.install(root);
  }
  /* v8 ignore stop */
})(globalThis, function () {
  "use strict";

  const CHANNEL = "multiterm.embed";
  const DEFAULT_TIMEOUT_MS = 15000;

  // Methods the extension host answers. Anything the Electron preload exposes
  // that is absent here stays undefined on purpose.
  const REQUEST_METHODS = Object.freeze([
    "readClipboardText",
    "writeClipboardText",
    "pickScript",
    "pickFolder",
    "openReleasePage",
    "configureDiagnostics"
  ]);

  // Fire-and-forget: the renderer never waits on these.
  const NOTIFY_METHODS = Object.freeze(["focusWindow", "openExternal"]);

  function isEmbedded(win) {
    return Boolean(win) && Boolean(win.parent) && win.parent !== win;
  }

  function createEmbedHost(options) {
    const settings = options || {};
    const send = settings.send;
    if (typeof send !== "function") throw new TypeError("createEmbedHost requires a send function.");
    const timeoutMs = Number.isFinite(settings.timeoutMs) && settings.timeoutMs > 0
      ? settings.timeoutMs
      : DEFAULT_TIMEOUT_MS;
    const setTimer = settings.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = settings.clearTimeout || ((handle) => clearTimeout(handle));
    const pending = new Map();
    let sequence = 0;

    function request(method, args) {
      return new Promise((resolve, reject) => {
        sequence += 1;
        const id = `${method}#${sequence}`;
        // Silence must settle, not hang: a caller awaiting the clipboard would
        // otherwise stall the paste path forever.
        const timer = setTimer(() => {
          pending.delete(id);
          reject(new Error(`The MultiTerm host did not answer ${method}.`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer, method });
        try {
          send({ channel: CHANNEL, type: "request", id, method, args: args || [] });
        } catch (error) {
          clearTimer(timer);
          pending.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    }

    function notify(method, args) {
      try {
        send({ channel: CHANNEL, type: "notify", method, args: args || [] });
        return true;
      } catch {
        return false;
      }
    }

    function handleMessage(data) {
      if (!data || data.channel !== CHANNEL || data.type !== "response") return false;
      const entry = pending.get(data.id);
      if (!entry) return false;
      pending.delete(data.id);
      clearTimer(entry.timer);
      if (data.ok) {
        entry.resolve(data.value);
      } else {
        entry.reject(new Error(String(data.error || `${entry.method} failed in the MultiTerm host.`)));
      }
      return true;
    }

    const api = {
      // Resolves "" when the clipboard holds no text (an image, say). The
      // renderer relies on that to forward Ctrl+V to the running program
      // instead of pasting nothing.
      readClipboardText: () => request("readClipboardText"),
      writeClipboardText: (text) => request("writeClipboardText", [String(text)]),
      pickScript: () => request("pickScript"),
      pickFolder: (initialDirectory) => request("pickFolder", [String(initialDirectory || "")]),
      openReleasePage: (url) => request("openReleasePage", [String(url)]),
      configureDiagnostics: (diagnostics) => request("configureDiagnostics", [diagnostics]),
      focusWindow: () => notify("focusWindow"),
      openExternal: (url) => notify("openExternal", [String(url)])
    };

    return { api, handleMessage, request, notify, pending };
  }

  function install(win, options) {
    if (!isEmbedded(win)) return null;
    const settings = options || {};
    const host = createEmbedHost({
      send: (message) => win.parent.postMessage(message, "*"),
      timeoutMs: settings.timeoutMs,
      setTimeout: settings.setTimeout,
      clearTimeout: settings.clearTimeout
    });

    win.addEventListener("message", (event) => {
      // Only the shell that frames us may answer; any other sender is ignored.
      if (event.source !== win.parent) return;
      host.handleMessage(event.data);
    });

    Object.defineProperty(win, "multiterm", {
      configurable: true,
      enumerable: true,
      value: host.api,
      writable: false
    });

    // A sandboxed frame cannot open a browser tab, so terminal link clicks and
    // release links go to the host instead. Overriding here keeps the renderer
    // itself free of embed-specific branches.
    const openExternally = (url) => {
      host.api.openExternal(url);
      return null;
    };
    Object.defineProperty(win, "open", {
      configurable: true,
      enumerable: false,
      value: openExternally,
      writable: true
    });

    return host;
  }

  return { CHANNEL, DEFAULT_TIMEOUT_MS, REQUEST_METHODS, NOTIFY_METHODS, isEmbedded, createEmbedHost, install };
});
