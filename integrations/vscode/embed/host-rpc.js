/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

// Answers the renderer's window.multiterm calls (see public/embed-host.js).
//
// Capabilities are injected rather than imported from `vscode` so the whole
// dispatch table is testable in Node. Every method must resolve or reject; a
// silent path would strand the renderer until its timeout.

const CHANNEL = "multiterm.embed";

// Matches src/main.js isAllowedExternalUrl: the desktop build hands off https
// only, and embedded mode must not be the weaker door.
function isAllowedExternalUrl(value) {
  try {
    return new URL(String(value)).protocol === "https:";
  } catch {
    return false;
  }
}

function isReleasePageUrl(value) {
  return typeof value === "string" && /^https:\/\/github\.com\//i.test(value);
}

function createHostRpc(capabilities = {}) {
  const {
    readClipboard,
    writeClipboard,
    pickScript,
    pickFolder,
    openExternal,
    focusView,
    releasePageUrl = "https://github.com/andrewtheart/multiterm-workbench/releases/latest",
    log = () => {}
  } = capabilities;

  const requests = {
    async readClipboardText() {
      // "" is a legitimate answer: the renderer reads it as "no text to paste"
      // and forwards Ctrl+V so the program can take the clipboard itself.
      return String((await readClipboard()) ?? "");
    },
    async writeClipboardText(text) {
      await writeClipboard(String(text ?? ""));
      return true;
    },
    async pickScript() {
      return (await pickScript()) || null;
    },
    async pickFolder(initialDirectory) {
      return (await pickFolder(String(initialDirectory || ""))) || null;
    },
    async openReleasePage(url) {
      const target = isReleasePageUrl(url) ? url : releasePageUrl;
      await openExternal(target);
      return true;
    },
    async configureDiagnostics() {
      // Diagnostics are owned by the bridge in embedded mode; acknowledge so the
      // renderer's optional call settles instead of timing out.
      return true;
    }
  };

  const notifications = {
    focusWindow() {
      focusView?.();
    },
    openExternal(url) {
      if (!isAllowedExternalUrl(url)) {
        log(`Refused to open a non-https URL from the workbench: ${String(url).slice(0, 120)}`);
        return;
      }
      openExternal(String(url));
    }
  };

  async function handle(message) {
    if (!message || message.channel !== CHANNEL) return null;

    if (message.type === "notify") {
      const handler = notifications[message.method];
      if (handler) handler(...(message.args || []));
      return null;
    }

    if (message.type !== "request") return null;

    const handler = requests[message.method];
    if (!handler) {
      return { channel: CHANNEL, type: "response", id: message.id, ok: false, error: `Unsupported method: ${message.method}` };
    }
    try {
      const value = await handler(...(message.args || []));
      return { channel: CHANNEL, type: "response", id: message.id, ok: true, value };
    } catch (error) {
      return { channel: CHANNEL, type: "response", id: message.id, ok: false, error: String(error?.message || error) };
    }
  }

  return { handle, isAllowedExternalUrl, isReleasePageUrl };
}

module.exports = { CHANNEL, createHostRpc, isAllowedExternalUrl, isReleasePageUrl };
