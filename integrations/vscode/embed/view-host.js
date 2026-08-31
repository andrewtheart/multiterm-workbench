/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

// VS Code glue for the embedded workbench. Deliberately thin: the decisions live
// in bridge-resolver / webview-shell / host-rpc, which are testable in Node.
//
// MultiTerm can be shown in an editor tab, the bottom panel, or the sidebar, but
// only ONE of them runs the workbench at a time. Every live surface is a full
// renderer holding xterm buffers for every terminal, so duplicating them would
// multiply memory for no benefit. Inactive surfaces show a placeholder that can
// claim the workbench back.

const crypto = require("node:crypto");
const vscode = require("vscode");
const { renderShellHtml, renderPlaceholderHtml } = require("./webview-shell");
const { createHostRpc } = require("./host-rpc");
const {
  discoverBridges,
  findFreePort,
  findNodeExecutable,
  isBundledRuntimeScript,
  probeFramePolicy,
  probeHealth,
  readNodeTarget,
  readRuntimeManifest,
  resolveBridgeScript,
  runtimeCompatibility,
  spawnBridge,
  spawnInstalledBridge
} = require("./bridge-resolver");
const { findLauncher } = require("../launcher");

const VIEW_TYPE = "multiterm.workbench";
const SURFACE_LABELS = {
  editor: "an editor tab",
  panel: "the panel",
  sidebar: "the sidebar"
};
const SURFACE_NAMES = {
  editor: "Editor tab",
  panel: "Panel",
  sidebar: "Sidebar"
};
// VS Code registers "<viewId>.focus" for every contributed view, which is the
// only way to make a WebviewView resolve on demand.
const SURFACE_VIEW_IDS = {
  panel: "multiterm.panelView",
  sidebar: "multiterm.sidebarView"
};

function nonce() {
  return crypto.randomBytes(16).toString("base64");
}

class MultiTermViewHost {
  constructor(context, output) {
    this.context = context;
    this.output = output;
    this.surfaces = new Map();
    this.activeKind = null;
    this.bridge = null;
    this.bridgePending = null;
    this.rpc = createHostRpc({
      readClipboard: () => vscode.env.clipboard.readText(),
      writeClipboard: (text) => vscode.env.clipboard.writeText(text),
      pickScript: () => this.pickPath(false),
      pickFolder: (initial) => this.pickPath(true, initial),
      openExternal: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
      focusView: () => this.revealActive(),
      log: (message) => this.log(message)
    });
  }

  log(message) {
    this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  async pickPath(folders, initialDirectory = "") {
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: !folders,
      canSelectFolders: folders,
      canSelectMany: false,
      defaultUri: initialDirectory ? vscode.Uri.file(initialDirectory) : undefined,
      openLabel: folders ? "Use folder" : "Run script"
    });
    return selection?.[0]?.fsPath || null;
  }

  configuration() {
    return vscode.workspace.getConfiguration("multiterm");
  }

  /* ---------------- Bridge ---------------- */

  async resolveBridge() {
    const configured = String(this.configuration().get("bridgeUrl", "")).trim();
    if (configured) {
      const url = new URL(configured);
      const health = await probeHealth(url.hostname, Number(url.port), 2000);
      if (!health) throw new Error(`No MultiTerm bridge answered at ${configured}.`);
      const policy = await probeFramePolicy(url.hostname, Number(url.port), 2000);
      if (!policy.framable) {
        throw new Error(`The bridge at ${configured} cannot be shown inside VS Code because ${policy.reason}. It is likely an older MultiTerm; update it or clear multiterm.bridgeUrl to use the bundled bridge.`);
      }
      this.log(`Attached to the configured bridge at ${configured}.`);
      return { url: configured, owned: false };
    }

    const running = await discoverBridges();
    const framable = running.filter((entry) => entry.framable);
    // An older bridge answers /health but refuses to be framed, which would show
    // as an empty panel with no explanation. Skip it and say so.
    for (const rejected of running.filter((entry) => !entry.framable)) {
      this.log(`Skipped ${rejected.bridgeId} on port ${rejected.port}: ${rejected.frameReason}.`);
    }
    if (framable.length > 0) {
      const chosen = framable[0];
      this.log(`Attached to ${chosen.bridgeId} on port ${chosen.port} (${chosen.sessions} sessions).`);
      return { url: chosen.url, owned: false };
    }
    if (running.length > 0) {
      vscode.window.showInformationMessage(
        `A running MultiTerm bridge is too old to be shown inside VS Code, so a separate one was started. Update MultiTerm to share one bridge.`
      );
    }

    return this.startBridge();
  }

  // The bundled runtime is version-matched to this extension, so it is preferred
  // whenever it can actually run here. It cannot always: it carries native modules
  // built for one architecture and one Node ABI, and Node.js may not be installed
  // at all.
  planNodeBridge() {
    const configuration = this.configuration();
    const scriptPath = resolveBridgeScript({
      configuredPath: String(configuration.get("bridgePath", "")).trim(),
      extensionRoot: this.context.extensionPath,
      launcherPath: findLauncher(String(configuration.get("launcherPath", "")).trim())
    });
    if (!scriptPath) return { reason: "no MultiTerm bridge script is bundled or configured" };
    const nodeExecutable = findNodeExecutable({
      configuredPath: String(configuration.get("nodePath", "")).trim()
    });
    if (!nodeExecutable) return { reason: "Node.js was not found on this computer" };
    // A configured script is the user's own checkout, so it is taken as given.
    if (!isBundledRuntimeScript(scriptPath, this.context.extensionPath)) {
      return { scriptPath, nodeExecutable };
    }
    const check = runtimeCompatibility(
      readRuntimeManifest(this.context.extensionPath),
      readNodeTarget(nodeExecutable)
    );
    return check.compatible ? { scriptPath, nodeExecutable } : { reason: check.reason };
  }

  async startBridge() {
    const plan = this.planNodeBridge();
    const port = await findFreePort(3200);
    if (plan.scriptPath) {
      this.log(`Starting a bridge from ${plan.scriptPath} on port ${port}.`);
      return this.superviseBridge(spawnBridge({ ...plan, port }), port);
    }
    // The installed bridge is PowerShell and C#: no Node.js, every architecture.
    const launcherPath = findLauncher(String(this.configuration().get("launcherPath", "")).trim());
    if (!launcherPath) {
      throw new Error(`Could not start a MultiTerm bridge because ${plan.reason}, and MultiTerm Workbench is not installed. Install MultiTerm Workbench, or install Node.js and set multiterm.nodePath.`);
    }
    this.log(`Starting the installed MultiTerm bridge on port ${port} because ${plan.reason}.`);
    return this.superviseBridge(spawnInstalledBridge({ launcherPath, port }), port);
  }

  // A child that cannot launch, or exits at once, has to report its own reason:
  // the health poll on its own can only ever say "timed out".
  async superviseBridge(child, port) {
    const failures = [];
    let stopped = false;
    child.stdout?.on("data", (chunk) => this.log(`[bridge] ${String(chunk).trimEnd()}`));
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk).trimEnd();
      failures.push(text);
      this.log(`[bridge] ${text}`);
    });
    child.on("error", (error) => {
      stopped = true;
      failures.push(error?.message || String(error));
      this.log(`Bridge could not be started: ${error?.message || error}`);
    });
    child.on("exit", (code) => {
      stopped = true;
      this.log(`Bridge exited with code ${code}.`);
      this.forgetBridge(child);
    });

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (await probeHealth("127.0.0.1", port, 1000)) {
        return { url: `http://127.0.0.1:${port}/`, owned: true, process: child };
      }
      if (stopped) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const detail = failures.length > 0 ? ` Last output: ${failures[failures.length - 1]}` : "";
    throw new Error(`The MultiTerm bridge did not become healthy in time.${detail}`);
  }

  // A bridge that has exited must not stay cached, or every later action would
  // target a URL that no longer answers.
  forgetBridge(child) {
    if (this.bridge?.process !== child) return;
    this.bridge = null;
  }

  releaseBridge(bridge) {
    if (!bridge?.owned || !bridge.process) return;
    try {
      bridge.process.kill();
    } catch {
      // The bridge already exited.
    }
  }

  // Serialized: two surfaces resolving at once would each start a bridge, and one
  // of them would be orphaned with no reference left to stop it.
  ensureBridge() {
    if (this.bridge) return Promise.resolve(this.bridge);
    if (!this.bridgePending) {
      this.bridgePending = this.resolveBridge()
        .then((bridge) => {
          this.bridge = bridge;
          return bridge;
        })
        .finally(() => {
          this.bridgePending = null;
        });
    }
    return this.bridgePending;
  }

  async chooseBridge() {
    const running = await discoverBridges();
    const items = running.map((entry) => ({
      label: entry.framable ? entry.bridgeId : `$(warning) ${entry.bridgeId}`,
      description: `port ${entry.port} \u00b7 ${entry.sessions} sessions`,
      // An occupied bridge already has a window driving it. Connecting anyway is
      // supported, but the user should know before terminals appear twice.
      detail: entry.framable
        ? (entry.rendererClients > 0
          ? `Already in use by ${entry.rendererClients} other MultiTerm window(s)`
          : undefined)
        : `Cannot be shown inside VS Code because ${entry.frameReason}`,
      url: entry.url,
      framable: entry.framable
    }));
    items.push({ label: "$(add) Start a new bridge", url: "", framable: true });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Choose the MultiTerm bridge to connect to"
    });
    if (!picked) return null;
    if (!picked.framable) {
      vscode.window.showErrorMessage(`That bridge ${picked.detail?.replace("Cannot be shown inside VS Code because ", "cannot be framed because ")}.`);
      return null;
    }
    const previous = this.bridge;

    this.bridge = picked.url ? { url: picked.url, owned: false } : await this.startBridge();
    // Only stop the previous bridge once its replacement exists, and never when
    // the user simply reselected the one already in use.
    if (previous && previous.url !== this.bridge.url) this.releaseBridge(previous);
    this.log(`Switched to ${this.bridge.url}.`);
    this.renderAll();
    return this.bridge;
  }

  /* ---------------- Surfaces ---------------- */

  register(kind, webview, reveal) {
    const surface = { webview, reveal };
    this.surfaces.set(kind, surface);
    if (!this.activeKind) this.activeKind = kind;
    webview.onDidReceiveMessage(async (message) => {
      if (message?.channel === "multiterm.embed" && message.type === "claim") {
        this.activateSurface(kind);
        return;
      }
      const response = await this.rpc.handle(message);
      if (response) webview.postMessage(response);
    }, null, this.context.subscriptions);
    this.render(kind);
    return surface;
  }

  unregister(kind) {
    this.surfaces.delete(kind);
    if (this.activeKind !== kind) return;
    this.activeKind = this.surfaces.keys().next().value || null;
    this.renderAll();
  }

  claim(kind) {
    if (this.activeKind === kind) return;
    this.activeKind = kind;
    this.log(`MultiTerm moved to ${SURFACE_LABELS[kind] || kind}.`);
    this.renderAll();
  }

  // Claim first, then close: an editor tab left behind would only show a
  // placeholder the user has to dismiss by hand.
  activateSurface(kind) {
    this.claim(kind);
    this.surfaces.get(kind)?.reveal?.();
    if (kind !== "editor") this.closeEditorSurface();
  }

  render(kind) {
    const surface = this.surfaces.get(kind);
    if (!surface) return;
    if (kind === this.activeKind && this.bridge) {
      surface.webview.html = renderShellHtml({ frameUrl: this.bridge.url, nonce: nonce() });
    } else {
      surface.webview.html = renderPlaceholderHtml({
        nonce: nonce(),
        activeSurfaceLabel: SURFACE_LABELS[this.activeKind] || "another view"
      });
    }
  }

  renderAll() {
    for (const kind of this.surfaces.keys()) this.render(kind);
  }

  revealActive() {
    this.surfaces.get(this.activeKind)?.reveal?.();
  }

  /* ---------------- Moving between surfaces ---------------- */

  // A WebviewView only resolves once VS Code shows its container, so the view has
  // to be focused before it can be claimed.
  async revealSurface(kind) {
    if (kind === "editor") {
      await this.open();
      return true;
    }
    const viewId = SURFACE_VIEW_IDS[kind];
    if (!viewId) return false;
    await vscode.commands.executeCommand(`${viewId}.focus`);
    for (let attempt = 0; attempt < 40 && !this.surfaces.has(kind); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return this.surfaces.has(kind);
  }

  async moveTo(kind) {
    if (!SURFACE_LABELS[kind]) throw new Error(`Unknown MultiTerm surface: ${kind}`);
    await this.ensureBridge();
    if (!await this.revealSurface(kind)) {
      throw new Error(`The ${SURFACE_NAMES[kind]} view did not open.`);
    }
    this.activateSurface(kind);
    return kind;
  }

  closeEditorSurface() {
    const editor = this.surfaces.get("editor");
    if (!editor?.panel) return;
    this.surfaces.delete("editor");
    editor.panel.dispose();
  }

  async chooseSurface() {
    const picked = await vscode.window.showQuickPick(
      Object.keys(SURFACE_LABELS).map((kind) => ({
        label: SURFACE_NAMES[kind],
        description: kind === this.activeKind ? "current" : undefined,
        kind
      })),
      { placeHolder: "Show the MultiTerm workbench in" }
    );
    if (!picked) {
      return null;
    } else {
      return this.moveTo(picked.kind);
    }
  }

  /* ---------------- Editor tab ---------------- */

  async open() {
    const existing = this.surfaces.get("editor");
    if (existing) {
      this.claim("editor");
      existing.reveal?.();
      return existing.panel;
    }
    await this.ensureBridge();
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "MultiTerm", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true
    });
    this.adoptPanel(panel);
    this.claim("editor");
    return panel;
  }

  adoptPanel(panel) {
    panel.onDidDispose(() => this.unregister("editor"), null, this.context.subscriptions);
    const surface = this.register("editor", panel.webview, () => panel.reveal(undefined, false));
    surface.panel = panel;
  }

  // Restores the editor tab after a VS Code restart.
  async restorePanel(panel) {
    await this.ensureBridge();
    this.adoptPanel(panel);
    this.claim("editor");
  }

  async resolveView(kind, webviewView) {
    webviewView.webview.options = { enableScripts: true };
    await this.ensureBridge();
    webviewView.onDidDispose(() => this.unregister(kind), null, this.context.subscriptions);
    this.register(kind, webviewView.webview, () => webviewView.show?.(true));
  }

  dispose() {
    // Terminals outlive the editor by default, matching MultiTerm's own "Keep
    // terminals when closed" setting. A bridge left running re-registers itself,
    // so the next session attaches to it and its sessions are still there.
    if (this.configuration().get("closeTerminalsOnExit", false)) {
      this.releaseBridge(this.bridge);
    } else {
      this.bridge?.process?.unref?.();
    }
    this.bridge = null;
    this.bridgePending = null;
  }
}

module.exports = { MultiTermViewHost, VIEW_TYPE, SURFACE_LABELS, SURFACE_NAMES, SURFACE_VIEW_IDS };
