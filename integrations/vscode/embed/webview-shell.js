/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

// Builds the webview document that frames the bridge.
//
// The shell is deliberately tiny: it owns no UI, only an iframe and a message
// relay. Keeping the real renderer same-origin with the bridge is the whole point
// of the design, so nothing here may proxy or rewrite renderer content.

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function isFramableBridgeUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname) && url.port !== "";
  } catch {
    return false;
  }
}

function renderShellHtml(options = {}) {
  const frameUrl = String(options.frameUrl || "");
  const nonce = String(options.nonce || "");
  // A non-loopback frame would mean the renderer is no longer same-origin with a
  // bridge we control, so refuse rather than render something unsafe.
  if (!isFramableBridgeUrl(frameUrl)) throw new Error(`Refusing to frame a non-loopback URL: ${frameUrl}`);
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("A CSP nonce is required to render the shell.");
  const origin = new URL(frameUrl).origin;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origin}; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
<title>MultiTerm</title>
<style nonce="${nonce}">
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #0c0d0b; }
  iframe { display: block; border: 0; width: 100%; height: 100%; }
</style>
</head>
<body>
<iframe id="workbench" src="${frameUrl}" allow="clipboard-read; clipboard-write"></iframe>
<script nonce="${nonce}">
  (function () {
    const vscode = acquireVsCodeApi();
    const frame = document.getElementById("workbench");
    const origin = ${JSON.stringify(origin)};
    const CHANNEL = "multiterm.embed";

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.channel !== CHANNEL) return;
      if (event.source === frame.contentWindow) {
        vscode.postMessage(data);
      } else {
        frame.contentWindow.postMessage(data, origin);
      }
    });

    frame.addEventListener("load", () => vscode.postMessage({ channel: CHANNEL, type: "loaded" }));
    vscode.postMessage({ channel: CHANNEL, type: "ready" });
  }());
</script>
</body>
</html>`;
}

function renderPlaceholderHtml(options = {}) {
  const nonce = String(options.nonce || "");
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("A CSP nonce is required to render the shell.");
  const where = String(options.activeSurfaceLabel || "another view");
  const escaped = where.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
<title>MultiTerm</title>
<style nonce="${nonce}">
  body { margin: 0; padding: 24px; background: #0c0d0b; color: #d7dbd2; font: 13px "Segoe UI", system-ui, sans-serif; }
  p { color: #98a08f; margin: 0 0 16px; }
  button { font: inherit; color: inherit; background: #1c2016; border: 1px solid #33392b; border-radius: 4px; padding: 6px 12px; cursor: pointer; }
  button:hover { background: #262c1e; }
</style>
</head>
<body>
<p>MultiTerm is open in ${escaped}. Only one view runs the workbench at a time, so terminals are not duplicated.</p>
<button id="claim" type="button">Move MultiTerm here</button>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.getElementById("claim").addEventListener("click", () => {
    vscode.postMessage({ channel: "multiterm.embed", type: "claim" });
  });
</script>
</body>
</html>`;
}

module.exports = { isFramableBridgeUrl, renderShellHtml, renderPlaceholderHtml };
