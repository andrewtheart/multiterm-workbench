/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const path = require("node:path");
const resolver = require("../../integrations/vscode/embed/bridge-resolver");
const shell = require("../../integrations/vscode/embed/webview-shell");
const { createHostRpc, CHANNEL } = require("../../integrations/vscode/embed/host-rpc");
const manifest = require("../../integrations/vscode/package.json");

const NONCE = "aaaaaaaaaaaaaaaaaaaaaa==";

function record(overrides = {}) {
  return JSON.stringify({
    app: "MultiTerm Workbench",
    bridgeId: "BRIDGE-001",
    bridgeType: "electron",
    pid: 4242,
    port: 3177,
    startedAt: "2026-08-28T10:00:00.000Z",
    url: "http://127.0.0.1:3177/",
    ...overrides
  });
}

function fakeFileSystem(files) {
  return {
    readdirSync: () => Object.keys(files).map((name) => ({ name, isFile: () => true })),
    readFileSync: (file) => files[path.basename(file)]
  };
}

describe("embedded bridge resolution", () => {
  it("accepts only a well-formed loopback record", () => {
    expect(resolver.readRecord(record())).toMatchObject({ host: "127.0.0.1", pid: 4242, port: 3177 });
    expect(resolver.readRecord(record({ app: "Something Else" }))).toBeNull();
    expect(resolver.readRecord(record({ url: "https://example.invalid:3177/" }))).toBeNull();
    expect(resolver.readRecord(record({ url: "http://evil.example:3177/" }))).toBeNull();
    // A record whose url disagrees with its own port is not trustworthy.
    expect(resolver.readRecord(record({ port: 4000 }))).toBeNull();
    expect(resolver.readRecord(record({ pid: 0 }))).toBeNull();
  });

  it("requires the live health answer to match the recorded pid", async () => {
    const files = { "4242.json": record() };
    const healthy = await resolver.discoverBridges({
      fileSystem: fakeFileSystem(files),
      directory: "C:/instances",
      probe: async () => ({ app: "MultiTerm Workbench", pid: 4242, port: 3177, sessions: 3 })
    });
    expect(healthy).toHaveLength(1);
    expect(healthy[0]).toMatchObject({ url: "http://127.0.0.1:3177/", sessions: 3 });

    // A recycled port answered by some other process must never be adopted.
    const impostor = await resolver.discoverBridges({
      fileSystem: fakeFileSystem(files),
      directory: "C:/instances",
      probe: async () => ({ app: "MultiTerm Workbench", pid: 9999, port: 3177 })
    });
    expect(impostor).toEqual([]);
  });

  it("skips records whose bridge is gone", async () => {
    const bridges = await resolver.discoverBridges({
      fileSystem: fakeFileSystem({ "4242.json": record() }),
      directory: "C:/instances",
      probe: async () => null
    });
    expect(bridges).toEqual([]);
  });

  it("recognises a bridge that refuses to be framed", () => {
    // A MultiTerm released before embedded mode answers /health perfectly and
    // then renders as an empty black panel, with no error anywhere.
    expect(resolver.readFramePolicy({
      "content-security-policy": "default-src 'self'; frame-ancestors 'none'; script-src 'self'"
    })).toMatchObject({ framable: false });
    expect(resolver.readFramePolicy({})).toMatchObject({ framable: false });
    expect(resolver.readFramePolicy({
      "content-security-policy": "frame-ancestors 'self'"
    }).reason).toMatch(/frame-ancestors 'self'/);
    // A webview nests inside the workbench window, so a policy naming only the
    // webview scheme still produces the blank panel this probe exists to catch.
    expect(resolver.readFramePolicy({
      "content-security-policy": "frame-ancestors vscode-webview:"
    })).toMatchObject({ framable: false });
    expect(resolver.readFramePolicy({
      "content-security-policy": "frame-ancestors vscode-file:"
    })).toMatchObject({ framable: false });
    expect(resolver.readFramePolicy({
      "content-security-policy": "default-src 'self'; frame-ancestors vscode-webview: vscode-file:"
    })).toEqual({ framable: true, reason: "" });
  });

  it("reports whether each discovered bridge can actually be framed", async () => {
    const bridges = await resolver.discoverBridges({
      fileSystem: fakeFileSystem({ "4242.json": record() }),
      directory: "C:/instances",
      probe: async () => ({ app: "MultiTerm Workbench", pid: 4242, port: 3177 }),
      framePolicy: async () => ({ framable: false, reason: "its framing policy is \"frame-ancestors 'none'\"" })
    });
    expect(bridges[0]).toMatchObject({ framable: false });
    expect(bridges[0].frameReason).toMatch(/frame-ancestors 'none'/);
  });

  it("survives a malformed or unreadable instance directory", async () => {
    await expect(resolver.discoverBridges({
      fileSystem: fakeFileSystem({ "bad.json": "{ not json" }),
      directory: "C:/instances",
      probe: async () => ({ pid: 1 })
    })).resolves.toEqual([]);
    await expect(resolver.discoverBridges({
      fileSystem: { readdirSync: () => { throw new Error("gone"); } },
      directory: "C:/instances"
    })).resolves.toEqual([]);
    await expect(resolver.discoverBridges({ directory: "" })).resolves.toEqual([]);
  });

  it("prefers an explicit bridge script, then a bundled one, then an install", () => {
    const present = new Set([
      path.resolve("C:/explicit/server.js"),
      path.resolve("C:/ext/runtime/src/server.js"),
      path.resolve("C:/app/src/server.js")
    ]);
    const fileSystem = { statSync: (file) => {
      if (!present.has(file)) throw new Error("missing");
      return { isFile: () => true };
    } };
    const options = { fileSystem, extensionRoot: "C:/ext", launcherPath: "C:/app/Start-MultiTerm.ps1" };
    expect(resolver.resolveBridgeScript({ ...options, configuredPath: "C:/explicit/server.js" }))
      .toBe(path.resolve("C:/explicit/server.js"));
    expect(resolver.resolveBridgeScript(options)).toBe(path.resolve("C:/ext/runtime/src/server.js"));
    expect(resolver.resolveBridgeScript({ fileSystem, launcherPath: "C:/app/Start-MultiTerm.ps1" }))
      .toBe(path.resolve("C:/app/src/server.js"));
    expect(resolver.resolveBridgeScript({ fileSystem: { statSync: () => { throw new Error("no"); } } })).toBeNull();
  });

  it("runs the bridge under system node with the chosen port", () => {
    const calls = [];
    const spawn = (file, args, options) => { calls.push({ file, args, options }); return {}; };
    resolver.spawnBridge({ scriptPath: "C:/app/src/server.js", port: 3456, env: {}, spawn });
    expect(calls[0].file).toMatch(/^node(\.exe)?$/);
    expect(calls[0].args).toEqual(["C:/app/src/server.js"]);
    expect(calls[0].options.env).toMatchObject({ HOST: "127.0.0.1", PORT: "3456" });
    // A machine can hold several Node installations, so the chosen one is used.
    resolver.spawnBridge({ scriptPath: "C:/app/src/server.js", port: 3456, env: {}, spawn, nodeExecutable: "C:/tools/node.exe" });
    expect(calls[1].file).toBe("C:/tools/node.exe");
    expect(() => resolver.spawnBridge({ scriptPath: "x", port: 0 })).toThrow(/Invalid bridge port/);
    expect(() => resolver.spawnBridge({ port: 3456 })).toThrow(/No MultiTerm bridge script/);
  });

  it("starts the installed bridge through Windows PowerShell, which needs no Node.js", () => {
    const calls = [];
    resolver.spawnInstalledBridge({
      launcherPath: "C:/app/Start-MultiTerm.ps1",
      port: 3456,
      spawn: (file, args, options) => { calls.push({ file, args, options }); return {}; }
    });
    expect(calls[0].file).toBe("powershell.exe");
    expect(calls[0].args).toEqual([
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", "C:/app/Start-MultiTerm.ps1", "-Port", "3456", "-NoBrowser", "-NewInstance"
    ]);
    expect(calls[0].options).toMatchObject({ windowsHide: true });
    expect(() => resolver.spawnInstalledBridge({ port: 3456 })).toThrow(/No installed MultiTerm launcher/);
    expect(() => resolver.spawnInstalledBridge({ launcherPath: "C:/app/Start-MultiTerm.ps1", port: 0 }))
      .toThrow(/Invalid bridge port/);
  });

  it("finds Node.js by setting, then PATH, then the standard install locations", () => {
    const programFilesNode = path.join("C:/Program Files", "nodejs", "node.exe");
    const present = new Set([path.resolve("C:/custom/node.exe"), path.resolve("C:/env/node.exe"), programFilesNode, "C:/tools/node.exe"]);
    const fileSystem = { statSync: (file) => {
      if (!present.has(file)) throw new Error("missing");
      return { isFile: () => true };
    } };
    const env = { ProgramFiles: "C:/Program Files" };
    const base = { fileSystem, env, platform: "win32" };
    expect(resolver.findNodeExecutable({ ...base, configuredPath: "C:/custom/node.exe", execFileSync: () => "" }))
      .toBe(path.resolve("C:/custom/node.exe"));
    expect(resolver.findNodeExecutable({ ...base, env: { ...env, MULTITERM_NODE: "C:/env/node.exe" }, execFileSync: () => "" }))
      .toBe(path.resolve("C:/env/node.exe"));
    expect(resolver.findNodeExecutable({ ...base, execFileSync: () => "C:/missing/node.exe\r\nC:/tools/node.exe\r\n" }))
      .toBe("C:/tools/node.exe");
    expect(resolver.findNodeExecutable({ ...base, execFileSync: () => { throw new Error("not on PATH"); } }))
      .toBe(programFilesNode);
    expect(resolver.findNodeExecutable({
      fileSystem: { statSync: () => { throw new Error("missing"); } },
      env,
      platform: "win32",
      execFileSync: () => ""
    })).toBe("");
    expect(resolver.nodeLocatorCommand("win32")).toBe("where.exe");
    expect(resolver.nodeLocatorCommand("linux")).toBe("which");
    expect(resolver.nodeInstallCandidates({}, "linux")).toContain("/usr/bin/node");
    expect(resolver.nodeInstallCandidates({ "ProgramFiles(x86)": "C:/PFx86", LOCALAPPDATA: "C:/local" }, "win32"))
      .toHaveLength(2);
  });

  it("refuses a bundled runtime whose architecture or Node ABI cannot load here", () => {
    expect(resolver.readNodeTarget("node", () => " win32 x64 137 \n"))
      .toEqual({ platform: "win32", arch: "x64", abi: "137" });
    expect(resolver.readNodeTarget("node", () => "garbage")).toBeNull();
    expect(resolver.readNodeTarget("node", () => { throw new Error("nope"); })).toBeNull();

    const staged = { platform: "win32", arch: "x64", nodeAbi: "137", nodeRange: "24.x" };
    expect(resolver.runtimeCompatibility(staged, { platform: "win32", arch: "x64", abi: "137" }))
      .toEqual({ compatible: true, reason: "" });
    expect(resolver.runtimeCompatibility(null, { platform: "win32", arch: "x64", abi: "137" }).reason)
      .toMatch(/no bundled bridge runtime/);
    expect(resolver.runtimeCompatibility(staged, null).reason).toMatch(/did not report/);
    expect(resolver.runtimeCompatibility(staged, { platform: "linux", arch: "x64", abi: "137" }).reason)
      .toMatch(/built for win32, not linux/);
    // node-pty loads build/Release/*.node directly, so an ARM64 or x86 machine
    // and a different Node major each fail at require time with no useful error.
    expect(resolver.runtimeCompatibility(staged, { platform: "win32", arch: "arm64", abi: "137" }).reason)
      .toMatch(/built for x64 but the Node\.js found is arm64/);
    expect(resolver.runtimeCompatibility(staged, { platform: "win32", arch: "x64", abi: "115" }).reason)
      .toMatch(/ABI 137 \(Node 24\.x\) but the Node\.js found reports ABI 115/);
    expect(resolver.runtimeCompatibility({ ...staged, nodeRange: undefined }, { platform: "win32", arch: "x64", abi: "115" }).reason)
      .toMatch(/Node unknown/);
  });

  it("reads the staged runtime manifest and recognises the bundled script", () => {
    const staged = { platform: "win32", arch: "x64", nodeAbi: "137" };
    expect(resolver.readRuntimeManifest("C:/ext", { readFileSync: () => JSON.stringify(staged) })).toEqual(staged);
    expect(resolver.readRuntimeManifest("C:/ext", { readFileSync: () => "{ not json" })).toBeNull();
    expect(resolver.readRuntimeManifest("C:/ext", { readFileSync: () => "\"text\"" })).toBeNull();
    expect(resolver.runtimeManifestPath("C:/ext")).toBe(path.join("C:/ext", "runtime", "runtime.json"));
    expect(resolver.isBundledRuntimeScript(path.join("C:/ext", "runtime", "src", "server.js"), "C:/ext")).toBe(true);
    expect(resolver.isBundledRuntimeScript("C:/elsewhere/src/server.js", "C:/ext")).toBe(false);
    expect(resolver.isBundledRuntimeScript("", "C:/ext")).toBe(false);
    expect(resolver.isBundledRuntimeScript("C:/ext/runtime/src/server.js", "")).toBe(false);
  });
});

describe("embedded webview shell", () => {
  it("frames only a loopback bridge", () => {
    expect(shell.isFramableBridgeUrl("http://127.0.0.1:3177/")).toBe(true);
    expect(shell.isFramableBridgeUrl("http://localhost:3177/")).toBe(true);
    expect(shell.isFramableBridgeUrl("https://example.invalid/")).toBe(false);
    expect(shell.isFramableBridgeUrl("http://example.invalid:3177/")).toBe(false);
    expect(shell.isFramableBridgeUrl("http://127.0.0.1/")).toBe(false);
    expect(() => shell.renderShellHtml({ frameUrl: "http://evil.example/", nonce: NONCE }))
      .toThrow(/non-loopback/);
  });

  it("locks the shell down to the bridge origin and a nonced script", () => {
    const html = shell.renderShellHtml({ frameUrl: "http://127.0.0.1:3177/", nonce: NONCE });
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("frame-src http://127.0.0.1:3177");
    expect(html).toContain(`script-src 'nonce-${NONCE}'`);
    expect(html).not.toContain("unsafe-inline");
    expect(html).toContain('src="http://127.0.0.1:3177/"');
    expect(() => shell.renderShellHtml({ frameUrl: "http://127.0.0.1:3177/", nonce: "short" }))
      .toThrow(/nonce/);
  });

  it("offers an inactive surface a way to claim the workbench back", () => {
    const html = shell.renderPlaceholderHtml({ nonce: NONCE, activeSurfaceLabel: "an editor tab" });
    expect(html).toContain("MultiTerm is open in an editor tab");
    expect(html).toContain('id="claim"');
    expect(html).toContain('type: "claim"');
    expect(html).toContain("default-src 'none'");
    // No frame at all, so an idle surface never runs a second renderer.
    expect(html).not.toContain("<iframe");
    expect(() => shell.renderPlaceholderHtml({ nonce: "short" })).toThrow(/nonce/);
  });

  it("escapes the surface label it is given", () => {
    const html = shell.renderPlaceholderHtml({ nonce: NONCE, activeSurfaceLabel: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("refuses to render without a frame URL or a nonce", () => {
    expect(() => shell.renderShellHtml()).toThrow(/non-loopback/);
    expect(() => shell.renderShellHtml({ frameUrl: "not a url at all" })).toThrow(/non-loopback/);
    expect(() => shell.renderShellHtml({ frameUrl: "http://127.0.0.1:3177/" })).toThrow(/nonce/);
    expect(() => shell.renderPlaceholderHtml()).toThrow(/nonce/);
  });

  it("names a neutral location when it is not told which surface is running", () => {
    expect(shell.renderPlaceholderHtml({ nonce: NONCE })).toContain("another view");
  });
});

describe("embedded host RPC", () => {
  function harness(overrides = {}) {
    const calls = { external: [], written: [], focused: 0, logs: [] };
    const rpc = createHostRpc({
      readClipboard: async () => "clip text",
      writeClipboard: async (text) => { calls.written.push(text); },
      pickScript: async () => "C:/scripts/run.ps1",
      pickFolder: async () => "C:/projects",
      openExternal: async (url) => { calls.external.push(url); },
      focusView: () => { calls.focused += 1; },
      log: (message) => calls.logs.push(message),
      ...overrides
    });
    return { rpc, calls };
  }

  const request = (method, args = []) => ({ channel: CHANNEL, type: "request", id: "r1", method, args });

  it("answers the renderer's clipboard calls", async () => {
    const { rpc, calls } = harness();
    await expect(rpc.handle(request("readClipboardText"))).resolves.toMatchObject({ ok: true, value: "clip text" });
    await expect(rpc.handle(request("writeClipboardText", [42]))).resolves.toMatchObject({ ok: true });
    expect(calls.written).toEqual(["42"]);

    // A copy request with nothing attached must clear rather than write "undefined".
    await expect(rpc.handle(request("writeClipboardText"))).resolves.toMatchObject({ ok: true });
    expect(calls.written).toEqual(["42", ""]);
  });

  it("reports an empty clipboard as empty text, not a failure", async () => {
    // The renderer forwards Ctrl+V to the program when this is "", which is how
    // image paste keeps working inside an editor tab.
    const { rpc } = harness({ readClipboard: async () => null });
    await expect(rpc.handle(request("readClipboardText"))).resolves.toMatchObject({ ok: true, value: "" });
  });

  it("turns a cancelled picker into null rather than an error", async () => {
    const { rpc } = harness({ pickScript: async () => null, pickFolder: async () => undefined });
    await expect(rpc.handle(request("pickScript"))).resolves.toMatchObject({ ok: true, value: null });
    await expect(rpc.handle(request("pickFolder", [""]))).resolves.toMatchObject({ ok: true, value: null });
  });

  it("reports a capability failure instead of going silent", async () => {
    const { rpc } = harness({ readClipboard: async () => { throw new Error("clipboard is busy"); } });
    await expect(rpc.handle(request("readClipboardText"))).resolves.toMatchObject({ ok: false, error: "clipboard is busy" });
    await expect(rpc.handle(request("nope"))).resolves.toMatchObject({ ok: false, error: "Unsupported method: nope" });
  });

  it("hands off https only, matching the desktop build", async () => {
    const { rpc, calls } = harness();
    await rpc.handle({ channel: CHANNEL, type: "notify", method: "openExternal", args: ["https://example.invalid/docs"] });
    expect(calls.external).toEqual(["https://example.invalid/docs"]);
    for (const blocked of ["http://example.invalid/", "file:///C:/Windows/System32", "javascript:alert(1)", ""]) {
      await rpc.handle({ channel: CHANNEL, type: "notify", method: "openExternal", args: [blocked] });
    }
    expect(calls.external).toEqual(["https://example.invalid/docs"]);
    expect(calls.logs.length).toBe(4);
  });

  it("pins release links to github.com", async () => {
    const { rpc, calls } = harness();
    await rpc.handle(request("openReleasePage", ["https://github.com/andrewtheart/multiterm-workbench/releases/tag/v1"]));
    await rpc.handle(request("openReleasePage", ["https://evil.example/releases"]));
    expect(calls.external[0]).toBe("https://github.com/andrewtheart/multiterm-workbench/releases/tag/v1");
    expect(calls.external[1]).toMatch(/^https:\/\/github\.com\//);
  });

  it("ignores traffic that is not ours", async () => {
    const { rpc } = harness();
    await expect(rpc.handle(null)).resolves.toBeNull();
    await expect(rpc.handle({ channel: "other", type: "request", method: "readClipboardText" })).resolves.toBeNull();
    await expect(rpc.handle({ channel: CHANNEL, type: "loaded" })).resolves.toBeNull();
  });

  it("treats focusWindow as fire-and-forget", async () => {
    const { rpc, calls } = harness();
    await expect(rpc.handle({ channel: CHANNEL, type: "notify", method: "focusWindow", args: [] })).resolves.toBeNull();
    expect(calls.focused).toBe(1);
  });

  it("acknowledges diagnostics configuration, which the bridge owns when embedded", async () => {
    const { rpc } = harness();
    await expect(rpc.handle(request("configureDiagnostics", [{ enabled: true }])))
      .resolves.toMatchObject({ ok: true, value: true });
  });

  it("ignores an unknown notification and a notification with no arguments", async () => {
    const { rpc, calls } = harness();
    await expect(rpc.handle({ channel: CHANNEL, type: "notify", method: "nope", args: [] })).resolves.toBeNull();
    await expect(rpc.handle({ channel: CHANNEL, type: "notify", method: "focusWindow" })).resolves.toBeNull();
    expect(calls.focused).toBe(1);
  });

  it("reports a thrown value that is not an Error", async () => {
    const { rpc } = harness({
      pickScript: async () => {
        throw "the dialog vanished";
      }
    });
    await expect(rpc.handle(request("pickScript"))).resolves.toMatchObject({ ok: false, error: "the dialog vanished" });
  });

  it("works with no capabilities configured at all", async () => {
    const external = [];
    const bare = createHostRpc({ openExternal: async (url) => external.push(url) });
    // No log and no configured release page: the built-in defaults must hold.
    await bare.handle({ channel: CHANNEL, type: "notify", method: "openExternal", args: ["file:///etc/passwd"] });
    expect(external).toEqual([]);
    await bare.handle(request("openReleasePage", ["https://evil.example/"]));
    expect(external).toEqual(["https://github.com/andrewtheart/multiterm-workbench/releases/latest"]);
    await bare.handle({ channel: CHANNEL, type: "notify", method: "focusWindow", args: [] });
  });
});

describe("embedded workbench manifest", () => {
  it("contributes the embedded commands and bridge settings", () => {
    const commands = manifest.contributes.commands.map((entry) => entry.command);
    expect(commands).toEqual(expect.arrayContaining([
      "multiterm.openEmbedded",
      "multiterm.focusEditor",
      "multiterm.showBridgeLog",
      "multiterm.chooseBridge"
    ]));
    expect(manifest.activationEvents).toContain("onCommand:multiterm.openEmbedded");
    // Registering a serializer is not enough: VS Code only activates an extension
    // to restore a webview when this event is declared, so without it a restored
    // editor tab stays empty after a restart.
    expect(manifest.activationEvents).toContain("onWebviewPanel:multiterm.workbench");
    const properties = manifest.contributes.configuration.properties;
    expect(properties["multiterm.bridgeUrl"].scope).toBe("machine");
    expect(properties["multiterm.bridgePath"].scope).toBe("machine");
    expect(properties["multiterm.nodePath"].scope).toBe("machine");
    // Terminals must outlive the editor unless the user opts in to closing them.
    expect(properties["multiterm.closeTerminalsOnExit"]).toMatchObject({ type: "boolean", default: false });
    // The external launcher commands must survive alongside embedded mode.
    expect(commands).toEqual(expect.arrayContaining(["multiterm.openWorkspace", "multiterm.openFolder"]));
  });

  it("contributes a panel and a sidebar webview view", () => {
    expect(manifest.contributes.views.multitermPanel).toContainEqual(
      expect.objectContaining({ id: "multiterm.panelView", type: "webview" })
    );
    expect(manifest.contributes.views.multitermSidebar).toContainEqual(
      expect.objectContaining({ id: "multiterm.sidebarView", type: "webview" })
    );
    expect(manifest.contributes.viewsContainers.panel).toContainEqual(
      expect.objectContaining({ id: "multitermPanel" })
    );
    expect(manifest.contributes.viewsContainers.activitybar).toContainEqual(
      expect.objectContaining({ id: "multitermSidebar" })
    );
  });

  it("offers a move command for every surface, and one in each view title bar", () => {
    const commands = manifest.contributes.commands.map((entry) => entry.command);
    for (const command of [
      "multiterm.moveWorkbench",
      "multiterm.moveToEditor",
      "multiterm.moveToPanel",
      "multiterm.moveToSidebar"
    ]) {
      expect(commands).toContain(command);
    }
    const titles = manifest.contributes.menus["view/title"];
    for (const view of ["multiterm.panelView", "multiterm.sidebarView"]) {
      expect(titles).toContainEqual(expect.objectContaining({
        command: "multiterm.moveWorkbench",
        when: `view == ${view}`
      }));
    }
    // A title-bar entry without an icon renders as an overflow menu item only.
    expect(manifest.contributes.commands.find((entry) => entry.command === "multiterm.moveWorkbench").icon)
      .toBeTruthy();
  });

  it("moves by focusing the target view, since a webview view resolves lazily", () => {
    const source = require("node:fs").readFileSync(
      path.join(__dirname, "../../integrations/vscode/embed/view-host.js"),
      "utf8"
    );
    expect(source).toContain(".focus`");
    expect(source).toContain("SURFACE_VIEW_IDS");
    // Leaving the editor tab behind would strand a placeholder the user has to
    // close by hand.
    expect(source).toContain("closeEditorSurface");
    expect(source).toContain('if (kind !== "editor") this.closeEditorSurface();');
  });

  it("registers the view providers and a panel serializer", () => {
    const source = require("node:fs").readFileSync(
      path.join(__dirname, "../../integrations/vscode/extension.js"),
      "utf8"
    );
    expect(source).toContain("registerWebviewViewProvider");
    expect(source).toContain("multiterm.panelView");
    expect(source).toContain("multiterm.sidebarView");
    expect(source).toContain("registerWebviewPanelSerializer");
    expect(source).toContain("retainContextWhenHidden: true");
  });
});

describe("embedded workbench packaging", () => {
  const fs = require("node:fs");
  const root = path.resolve(__dirname, "../..");
  const runtimeScript = fs.readFileSync(path.join(root, "integrations/vscode/build-runtime.ps1"), "utf8");
  const buildScript = fs.readFileSync(path.join(root, "integrations/vscode/build.ps1"), "utf8");
  const vscodeIgnore = fs.readFileSync(path.join(root, "integrations/vscode/.vscodeignore"), "utf8");

  it("omits the optional CLI binaries that dominate the dependency tree", () => {
    // @github/copilot-win32-x64 and the Claude equivalent ship ~600 MB of CLI
    // executables MultiTerm never launches from node_modules.
    expect(runtimeScript).toContain("--omit=optional");
    expect(runtimeScript).toContain("--omit=dev");
  });

  it("keeps native bindings while pruning build leftovers", () => {
    expect(runtimeScript).toContain("*.pdb");
    expect(runtimeScript).toContain("*.obj");
    // Losing the .node files would package a bridge that cannot open a terminal.
    expect(runtimeScript).toContain('$_.Extension -ne ".node"');
    expect(runtimeScript).toContain("No native bindings survived staging");
  });

  it("stages the bridge modules from lib and the Prompt Library host it needs", () => {
    expect(runtimeScript).toContain("copilot-log-aggregator.js");
    expect(runtimeScript).toContain("prompt-library-client.js");
    expect(runtimeScript).toContain("runtime-diagnostics.js");
    // prompt-library-client.js resolves this executable; without it every
    // Prompt Library request answers "storage is unavailable".
    expect(runtimeScript).toContain("MultiTerm.PromptLibraryHost.exe");
    expect(runtimeScript).toContain("sqlite3mc.dll");
    expect(runtimeScript).toContain("lib\\prompt-library-host\\publish");
  });

  it("bundles every SDK the bridge imports", () => {
    // server.js imports the Claude SDK for provider discovery, saved sessions,
    // and titles; omitting it made bundled mode report Claude as unavailable.
    expect(runtimeScript).toContain("@anthropic-ai/claude-agent-sdk");
    expect(runtimeScript).toContain("@github/copilot-sdk");
    expect(runtimeScript).toContain("@homebridge/node-pty-prebuilt-multiarch");
    expect(runtimeScript).toContain("@msgpack/msgpack");
  });

  it("records the one architecture and Node ABI the staged runtime can serve", () => {
    // node-pty loads build/Release/*.node directly, so a mismatched machine gets
    // a bridge that cannot start. The manifest is what lets the extension tell.
    expect(runtimeScript).toContain("runtime.json");
    expect(runtimeScript).toContain("nodeAbi");
    expect(runtimeScript).toContain("Get-PeMachine");
    expect(runtimeScript).toContain("but this runtime targets");
  });

  it("installs runtime dependencies from a committed lock", () => {
    // Regenerating the manifest and running npm install made the lock an output,
    // so identical commits could produce different packages.
    expect(runtimeScript).toContain("npm ci");
    expect(runtimeScript).toContain("runtime-package-lock.json");
    expect(runtimeScript).toContain("-UpdateLock");
    expect(fs.existsSync(path.join(root, "integrations/vscode/runtime-package-lock.json"))).toBe(true);
    // The lock is a build input, not something users need in the package.
    expect(vscodeIgnore).toContain("runtime-package-lock.json");
  });

  it("stages every file server.js resolves from its repository root", () => {
    // A missing root file fails at run time, not package time: the guided
    // Copilot CLI setup shipped broken because Install-CopilotCli.ps1 was absent.
    const server = fs.readFileSync(path.join(root, "src/server.js"), "utf8");
    const referenced = [...server.matchAll(/path\.join\(repoRoot,\s*"([^"]+)"\)/g)]
      .map((match) => match[1]);
    expect(referenced.length).toBeGreaterThan(0);
    for (const reference of referenced) {
      expect(runtimeScript).toContain(reference);
    }
    expect(referenced).toContain("Install-CopilotCli.ps1");
    // The staging script must also verify this itself, so a future root
    // reference cannot slip through unnoticed.
    expect(runtimeScript).toContain("but staging did not produce it");
  });

  it("ships the staged runtime inside the package", () => {
    expect(vscodeIgnore).toContain("!runtime/**");
    expect(buildScript).toContain("build-runtime.ps1");
    // A launcher-only package must remain buildable for installs that already
    // have MultiTerm.
    expect(buildScript).toContain("SkipRuntime");
  });
});

/* -------------------------------------------------------------------------
 * The surface host and the extension entry point both require "vscode", which
 * only exists inside the editor, so they are loaded with that module stubbed.
 * Each module is loaded exactly ONCE and the stubs are reset per test: a fresh
 * require per test would evaluate the file again, and only one of those script
 * instances survives into the coverage report.
 * ---------------------------------------------------------------------- */

const Module = require("node:module");

function loadWithStubs(modulePath, stubs) {
  const originalLoad = Module._load;
  const spy = vi.spyOn(Module, "_load").mockImplementation((request, parent, isMain) => {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return originalLoad(request, parent, isMain);
  });
  delete require.cache[modulePath];
  try {
    return require(modulePath);
  } finally {
    spy.mockRestore();
    delete require.cache[modulePath];
  }
}

function fakeWebview() {
  return {
    html: "",
    options: null,
    posted: [],
    listeners: [],
    onDidReceiveMessage(handler) {
      this.listeners.push(handler);
      return { dispose() {} };
    },
    postMessage(message) {
      this.posted.push(message);
      return true;
    },
    async emit(message) {
      for (const handler of this.listeners) await handler(message);
    }
  };
}

function fakeWebviewPanel() {
  return {
    webview: fakeWebview(),
    disposed: false,
    revealed: [],
    disposeListeners: [],
    onDidDispose(handler) {
      this.disposeListeners.push(handler);
      return { dispose() {} };
    },
    reveal(column, preserveFocus) {
      this.revealed.push([column, preserveFocus]);
    },
    dispose() {
      this.disposed = true;
      for (const handler of this.disposeListeners) handler();
    }
  };
}

function fakeWebviewView() {
  return {
    webview: fakeWebview(),
    shown: [],
    disposeListeners: [],
    onDidDispose(handler) {
      this.disposeListeners.push(handler);
      return { dispose() {} };
    },
    show(preserveFocus) {
      this.shown.push(preserveFocus);
    },
    dispose() {
      for (const handler of this.disposeListeners) handler();
    }
  };
}

function fakeVscode(settings = {}) {
  const seen = { info: [], error: [], executed: [], status: [], quickPicks: [], openDialogs: [] };
  const api = {
    seen,
    settings,
    ViewColumn: { Active: "active" },
    Uri: { parse: (value) => ({ parsed: value }), file: (value) => ({ file: value }) },
    env: {
      clipboard: {
        readText: vi.fn(async () => "clipboard text"),
        writeText: vi.fn(async () => {})
      },
      openExternal: vi.fn(async () => true)
    },
    workspace: {
      workspaceFolders: [],
      getConfiguration: vi.fn(() => ({
        get: (key, fallback) =>
          (Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback)
      }))
    },
    commands: {
      registered: new Map(),
      registerCommand: vi.fn((id, handler) => {
        api.commands.registered.set(id, handler);
        return { dispose() {} };
      }),
      executeCommand: vi.fn(async (id, ...args) => {
        seen.executed.push([id, ...args]);
      })
    },
    window: {
      quickPickResult: undefined,
      openDialogResult: undefined,
      errorMessageResult: undefined,
      createdPanels: [],
      outputChannels: [],
      registeredViewProviders: [],
      registeredSerializers: [],
      createOutputChannel: vi.fn((name) => {
        const channel = {
          name,
          lines: [],
          appendLine(line) {
            this.lines.push(line);
          },
          show: vi.fn(),
          dispose() {}
        };
        api.window.outputChannels.push(channel);
        return channel;
      }),
      showInformationMessage: vi.fn(async (message) => {
        seen.info.push(message);
      }),
      showErrorMessage: vi.fn(async (message) => {
        seen.error.push(message);
        return api.window.errorMessageResult;
      }),
      showQuickPick: vi.fn(async (items) => {
        seen.quickPicks.push(items);
        return typeof api.window.quickPickResult === "function"
          ? api.window.quickPickResult(items)
          : api.window.quickPickResult;
      }),
      showOpenDialog: vi.fn(async (options) => {
        seen.openDialogs.push(options);
        return api.window.openDialogResult;
      }),
      setStatusBarMessage: vi.fn((message) => {
        seen.status.push(message);
      }),
      createWebviewPanel: vi.fn(() => {
        const panel = fakeWebviewPanel();
        api.window.createdPanels.push(panel);
        return panel;
      }),
      registerWebviewViewProvider: vi.fn((viewId, provider, options) => {
        api.window.registeredViewProviders.push({ viewId, provider, options });
        return { dispose() {} };
      }),
      registerWebviewPanelSerializer: vi.fn((viewType, serializer) => {
        api.window.registeredSerializers.push({ viewType, serializer });
        return { dispose() {} };
      })
    }
  };
  return api;
}

function fakeChild() {
  return {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    unref: vi.fn()
  };
}

const vscodeStub = {};
const fsStub = {};
const extensionHost = { current: null };

// view-host destructures these at require time, so the stub has to expose stable
// wrappers that delegate to whatever the current test installed.
const resolverBehavior = {};
const launcherBehavior = {};
const bridgeResolverStub = {
  discoverBridges: (...args) => resolverBehavior.discoverBridges(...args),
  findFreePort: (...args) => resolverBehavior.findFreePort(...args),
  findNodeExecutable: (...args) => resolverBehavior.findNodeExecutable(...args),
  isBundledRuntimeScript: (...args) => resolverBehavior.isBundledRuntimeScript(...args),
  probeFramePolicy: (...args) => resolverBehavior.probeFramePolicy(...args),
  probeHealth: (...args) => resolverBehavior.probeHealth(...args),
  readNodeTarget: (...args) => resolverBehavior.readNodeTarget(...args),
  readRuntimeManifest: (...args) => resolverBehavior.readRuntimeManifest(...args),
  resolveBridgeScript: (...args) => resolverBehavior.resolveBridgeScript(...args),
  runtimeCompatibility: (...args) => resolverBehavior.runtimeCompatibility(...args),
  spawnBridge: (...args) => resolverBehavior.spawnBridge(...args),
  spawnInstalledBridge: (...args) => resolverBehavior.spawnInstalledBridge(...args)
};
const launcherStub = {
  findLauncher: (...args) => launcherBehavior.findLauncher(...args),
  folderForResource: (...args) => launcherBehavior.folderForResource(...args),
  launchFolder: (...args) => launcherBehavior.launchFolder(...args)
};

function resetVscode(settings = {}) {
  for (const key of Object.keys(vscodeStub)) delete vscodeStub[key];
  Object.assign(vscodeStub, fakeVscode(settings));
  return vscodeStub;
}

function defaultResolver() {
  return {
    discoverBridges: vi.fn(async () => []),
    findFreePort: vi.fn(async () => 3210),
    findNodeExecutable: vi.fn(() => "C:/Program Files/nodejs/node.exe"),
    isBundledRuntimeScript: vi.fn(() => false),
    probeFramePolicy: vi.fn(async () => ({ framable: true, reason: "" })),
    probeHealth: vi.fn(async () => ({ pid: 7, port: 3210 })),
    readNodeTarget: vi.fn(() => ({ platform: "win32", arch: "x64", abi: "137" })),
    readRuntimeManifest: vi.fn(() => ({ platform: "win32", arch: "x64", nodeAbi: "137" })),
    resolveBridgeScript: vi.fn(() => "C:/MultiTerm/src/server.js"),
    runtimeCompatibility: vi.fn(() => ({ compatible: true, reason: "" })),
    spawnBridge: vi.fn(() => fakeChild()),
    spawnInstalledBridge: vi.fn(() => fakeChild())
  };
}

const viewHostModule = loadWithStubs(require.resolve("../../integrations/vscode/embed/view-host"), {
  vscode: vscodeStub,
  "./bridge-resolver": bridgeResolverStub,
  "../launcher": launcherStub
});

const extensionModule = loadWithStubs(require.resolve("../../integrations/vscode/extension"), {
  vscode: vscodeStub,
  "node:fs": fsStub,
  "./launcher": launcherStub,
  "./embed/view-host": {
    MultiTermViewHost: function () {
      return extensionHost.current;
    },
    VIEW_TYPE: "multiterm.workbench"
  }
});

function createHost({ settings = {}, resolver: resolverOverrides = {}, launcherPath = "C:/MultiTerm/Start-MultiTerm.ps1" } = {}) {
  const vscode = resetVscode(settings);
  Object.assign(resolverBehavior, defaultResolver(), resolverOverrides);
  launcherBehavior.findLauncher = vi.fn(() => launcherPath);
  launcherBehavior.folderForResource = vi.fn((value) => value);
  launcherBehavior.launchFolder = vi.fn(() => ({ once: vi.fn() }));
  const output = {
    lines: [],
    appendLine(line) {
      this.lines.push(line);
    },
    show: vi.fn()
  };
  const context = { extensionPath: "C:/ext", subscriptions: [] };
  const host = new viewHostModule.MultiTermViewHost(context, output);
  return { host, vscode, bridgeResolver: resolverBehavior, launcher: launcherBehavior, output, context };
}

async function registerSurface(host, kind) {
  const view = fakeWebviewView();
  await host.resolveView(kind, view);
  return view;
}

describe("embedded workbench bridge selection", () => {
  it("attaches to a configured bridge only when it is healthy and framable", async () => {
    const { host, bridgeResolver, output } = createHost({ settings: { bridgeUrl: "http://127.0.0.1:3177/" } });
    expect(await host.resolveBridge()).toEqual({ url: "http://127.0.0.1:3177/", owned: false });
    expect(bridgeResolver.probeHealth).toHaveBeenCalledWith("127.0.0.1", 3177, 2000);
    expect(output.lines.join("\n")).toContain("Attached to the configured bridge");
  });

  it("reports a configured bridge that is not answering", async () => {
    const { host } = createHost({
      settings: { bridgeUrl: "http://127.0.0.1:3177/" },
      resolver: { probeHealth: vi.fn(async () => null) }
    });
    await expect(host.resolveBridge()).rejects.toThrow("No MultiTerm bridge answered at http://127.0.0.1:3177/.");
  });

  it("explains a configured bridge that refuses to be framed instead of showing an empty panel", async () => {
    const { host } = createHost({
      settings: { bridgeUrl: "http://127.0.0.1:3177/" },
      resolver: { probeFramePolicy: vi.fn(async () => ({ framable: false, reason: "it sends frame-ancestors 'none'" })) }
    });
    await expect(host.resolveBridge()).rejects.toThrow(/cannot be shown inside VS Code because it sends frame-ancestors 'none'/);
  });

  it("prefers a running framable bridge and logs the ones it skipped", async () => {
    const { host, output } = createHost({
      resolver: {
        discoverBridges: vi.fn(async () => [
          { bridgeId: "BRIDGE-001", port: 3177, framable: false, frameReason: "it sends X-Frame-Options", url: "http://127.0.0.1:3177/", sessions: 1 },
          { bridgeId: "BRIDGE-002", port: 3200, framable: true, url: "http://127.0.0.1:3200/", sessions: 4 }
        ])
      }
    });
    expect(await host.resolveBridge()).toEqual({ url: "http://127.0.0.1:3200/", owned: false });
    expect(output.lines.join("\n")).toContain("Skipped BRIDGE-001 on port 3177: it sends X-Frame-Options.");
    expect(output.lines.join("\n")).toContain("Attached to BRIDGE-002 on port 3200 (4 sessions).");
  });

  it("starts its own bridge and says why when every running bridge is too old", async () => {
    const { host, vscode, bridgeResolver } = createHost({
      resolver: {
        discoverBridges: vi.fn(async () => [
          { bridgeId: "BRIDGE-001", port: 3177, framable: false, frameReason: "it is old", url: "http://127.0.0.1:3177/", sessions: 1 }
        ])
      }
    });
    expect(await host.resolveBridge()).toEqual({ url: "http://127.0.0.1:3210/", owned: true, process: expect.anything() });
    expect(vscode.seen.info.join("\n")).toContain("too old to be shown inside VS Code");
    expect(bridgeResolver.spawnBridge).toHaveBeenCalledWith({
      scriptPath: "C:/MultiTerm/src/server.js",
      nodeExecutable: "C:/Program Files/nodejs/node.exe",
      port: 3210
    });
  });

  it("falls back to the installed bridge when the bundled one cannot run here", async () => {
    // The installed bridge is PowerShell and C#: no Node.js, any architecture.
    const { host, bridgeResolver, output } = createHost({
      resolver: { findNodeExecutable: vi.fn(() => "") }
    });
    expect(await host.startBridge()).toMatchObject({ url: "http://127.0.0.1:3210/", owned: true });
    expect(bridgeResolver.spawnBridge).not.toHaveBeenCalled();
    expect(bridgeResolver.spawnInstalledBridge).toHaveBeenCalledWith({
      launcherPath: "C:/MultiTerm/Start-MultiTerm.ps1",
      port: 3210
    });
    expect(output.lines.join("\n")).toContain("because Node.js was not found on this computer");
  });

  it("checks the bundled runtime against the Node.js it found before using it", async () => {
    const { host, bridgeResolver, output } = createHost({
      resolver: {
        resolveBridgeScript: vi.fn(() => "C:/ext/runtime/src/server.js"),
        isBundledRuntimeScript: vi.fn(() => true),
        runtimeCompatibility: vi.fn(() => ({ compatible: false, reason: "the bundled bridge is built for x64 but the Node.js found is arm64" }))
      }
    });
    await host.startBridge();
    expect(bridgeResolver.spawnBridge).not.toHaveBeenCalled();
    expect(bridgeResolver.spawnInstalledBridge).toHaveBeenCalled();
    expect(output.lines.join("\n")).toContain("built for x64 but the Node.js found is arm64");

    // A script the user configured is their own checkout, so it is taken as given.
    const configured = createHost({ settings: { bridgePath: "C:/checkout/src/server.js" } });
    await configured.host.startBridge();
    expect(configured.bridgeResolver.runtimeCompatibility).not.toHaveBeenCalled();
    expect(configured.bridgeResolver.spawnBridge).toHaveBeenCalled();
  });

  it("explains what to install when neither bridge can be started", async () => {
    const { host } = createHost({
      launcherPath: null,
      resolver: { findNodeExecutable: vi.fn(() => "") }
    });
    await expect(host.startBridge()).rejects.toThrow(/Node\.js was not found on this computer, and MultiTerm Workbench is not installed/);
  });

  it("pipes bridge output into the log and gives up if it never becomes healthy", async () => {
    const child = fakeChild();
    const { host, output } = createHost({
      resolver: { probeHealth: vi.fn(async () => null), spawnBridge: vi.fn(() => child) }
    });
    vi.useFakeTimers();
    try {
      const settled = expect(host.startBridge()).rejects.toThrow("The MultiTerm bridge did not become healthy in time.");
      await vi.advanceTimersByTimeAsync(21000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
    child.stdout.on.mock.calls[0][1]("noisy startup line\n");
    child.stderr.on.mock.calls[0][1]("a warning\n");
    child.on.mock.calls[1][1](3);
    const logged = output.lines.join("\n");
    expect(logged).toContain("[bridge] noisy startup line");
    expect(logged).toContain("[bridge] a warning");
    expect(logged).toContain("Bridge exited with code 3.");
  });

  it("reports why a bridge child failed instead of only that it timed out", async () => {
    // Without this the only symptom of a missing Node.js is a 20 second wait.
    const child = fakeChild();
    child.on = vi.fn((event, handler) => {
      if (event === "error") handler(new Error("spawn node.exe ENOENT"));
    });
    const { host } = createHost({
      resolver: { probeHealth: vi.fn(async () => null), spawnBridge: vi.fn(() => child) }
    });
    await expect(host.startBridge()).rejects.toThrow(/Last output: spawn node\.exe ENOENT/);
  });

  it("stops polling once the bridge child has exited", async () => {
    const child = fakeChild();
    child.on = vi.fn((event, handler) => {
      if (event === "exit") handler(1);
    });
    const { host, output } = createHost({
      resolver: { probeHealth: vi.fn(async () => null), spawnBridge: vi.fn(() => child) }
    });
    await expect(host.startBridge()).rejects.toThrow("The MultiTerm bridge did not become healthy in time.");
    expect(output.lines.join("\n")).toContain("Bridge exited with code 1.");
  });

  it("resolves the bridge once and reuses it", async () => {
    const { host, bridgeResolver } = createHost();
    const first = await host.ensureBridge();
    expect(await host.ensureBridge()).toBe(first);
    expect(bridgeResolver.discoverBridges).toHaveBeenCalledTimes(1);
  });

  it("starts only one bridge when surfaces resolve at the same time", async () => {
    // Each surface resolves independently, and a second started bridge would be
    // orphaned with no reference left to stop it.
    const { host, bridgeResolver } = createHost();
    const [first, second, third] = await Promise.all([host.ensureBridge(), host.ensureBridge(), host.ensureBridge()]);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(bridgeResolver.spawnBridge).toHaveBeenCalledTimes(1);
    expect(bridgeResolver.discoverBridges).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed resolution instead of caching the failure", async () => {
    const { host, bridgeResolver } = createHost({
      resolver: { discoverBridges: vi.fn(async () => { throw new Error("instance directory unreadable"); }) }
    });
    await expect(host.ensureBridge()).rejects.toThrow("instance directory unreadable");
    bridgeResolver.discoverBridges = vi.fn(async () => []);
    await expect(host.ensureBridge()).resolves.toMatchObject({ owned: true });
  });

  it("forgets a bridge that exits so the next action does not target a dead port", async () => {
    const child = fakeChild();
    const { host } = createHost({ resolver: { spawnBridge: vi.fn(() => child) } });
    await host.ensureBridge();
    expect(host.bridge).toMatchObject({ owned: true });
    child.on.mock.calls.find(([event]) => event === "exit")[1](0);
    expect(host.bridge).toBeNull();
  });

  it("offers running bridges for switching and flags the occupied ones", async () => {
    const { host, vscode } = createHost({
      resolver: {
        discoverBridges: vi.fn(async () => [
          { bridgeId: "BRIDGE-001", port: 3177, sessions: 2, rendererClients: 1, framable: true, url: "http://127.0.0.1:3177/" },
          { bridgeId: "BRIDGE-002", port: 3200, sessions: 0, rendererClients: 0, framable: true, url: "http://127.0.0.1:3200/" },
          { bridgeId: "BRIDGE-003", port: 3300, sessions: 0, rendererClients: 0, framable: false, frameReason: "it is old", url: "http://127.0.0.1:3300/" }
        ])
      }
    });
    vscode.window.quickPickResult = (items) => items[0];
    expect(await host.chooseBridge()).toEqual({ url: "http://127.0.0.1:3177/", owned: false });
    const offered = vscode.seen.quickPicks[0];
    expect(offered[0].detail).toBe("Already in use by 1 other MultiTerm window(s)");
    expect(offered[1].detail).toBeUndefined();
    expect(offered[2].label).toContain("$(warning)");
    expect(offered[3].label).toContain("Start a new bridge");
  });

  it("keeps the current bridge when the switcher is dismissed", async () => {
    const { host, vscode } = createHost();
    vscode.window.quickPickResult = undefined;
    expect(await host.chooseBridge()).toBeNull();
    expect(host.bridge).toBeNull();
  });

  it("refuses to switch to a bridge that cannot be framed", async () => {
    const { host, vscode } = createHost({
      resolver: {
        discoverBridges: vi.fn(async () => [
          { bridgeId: "BRIDGE-003", port: 3300, sessions: 0, rendererClients: 0, framable: false, frameReason: "it is old", url: "http://127.0.0.1:3300/" }
        ])
      }
    });
    vscode.window.quickPickResult = (items) => items[0];
    expect(await host.chooseBridge()).toBeNull();
    expect(vscode.seen.error.join("\n")).toContain("cannot be framed because it is old");
    expect(host.bridge).toBeNull();
  });

  it("starts a new bridge when that entry is chosen and repaints every surface", async () => {
    const { host, vscode } = createHost();
    const view = await registerSurface(host, "panel");
    vscode.window.quickPickResult = (items) => items[items.length - 1];
    expect(await host.chooseBridge()).toMatchObject({ url: "http://127.0.0.1:3210/", owned: true });
    expect(view.webview.html).toContain("<iframe");
  });

  it("stops the bridge it owned when switching to another one", async () => {
    const { host, vscode, bridgeResolver } = createHost();
    await host.ensureBridge();
    const owned = bridgeResolver.spawnBridge.mock.results[0].value;
    bridgeResolver.discoverBridges = vi.fn(async () => [
      { bridgeId: "BRIDGE-001", port: 3177, sessions: 0, rendererClients: 0, framable: true, url: "http://127.0.0.1:3177/" }
    ]);
    vscode.window.quickPickResult = (items) => items[0];
    await host.chooseBridge();
    expect(owned.kill).toHaveBeenCalled();
    expect(host.bridge).toMatchObject({ url: "http://127.0.0.1:3177/", owned: false });
  });

  it("keeps the bridge running when the user reselects the one already in use", async () => {
    const { host, vscode, bridgeResolver } = createHost();
    await host.ensureBridge();
    const owned = bridgeResolver.spawnBridge.mock.results[0].value;
    // The bridge it started registers itself, so it appears in the list too.
    bridgeResolver.discoverBridges = vi.fn(async () => [
      { bridgeId: "BRIDGE-002", port: 3210, sessions: 1, rendererClients: 0, framable: true, url: "http://127.0.0.1:3210/" }
    ]);
    vscode.window.quickPickResult = (items) => items[0];
    await host.chooseBridge();
    expect(owned.kill).not.toHaveBeenCalled();
  });
});

describe("embedded workbench surfaces", () => {
  it("runs the workbench in one surface and offers the others a way to claim it", async () => {
    const { host } = createHost();
    const panel = await registerSurface(host, "panel");
    const sidebar = await registerSurface(host, "sidebar");
    expect(panel.webview.html).toContain("<iframe");
    expect(sidebar.webview.html).toContain("Move MultiTerm here");
    expect(sidebar.webview.html).toContain("the panel");

    await sidebar.webview.emit({ channel: CHANNEL, type: "claim" });
    expect(host.activeKind).toBe("sidebar");
    expect(sidebar.webview.html).toContain("<iframe");
    expect(panel.webview.html).toContain("Move MultiTerm here");
    expect(sidebar.shown).toContain(true);
  });

  it("answers renderer requests through the host RPC and stays silent for notifications", async () => {
    const { host, vscode } = createHost();
    const view = await registerSurface(host, "panel");
    await view.webview.emit({ channel: CHANNEL, type: "request", id: 9, method: "readClipboardText", args: [] });
    expect(view.webview.posted).toEqual([{ channel: CHANNEL, type: "response", id: 9, ok: true, value: "clipboard text" }]);

    view.webview.posted.length = 0;
    await view.webview.emit({ channel: CHANNEL, type: "notify", method: "focusWindow" });
    expect(view.webview.posted).toEqual([]);
    expect(view.shown).toContain(true);
    expect(vscode.env.clipboard.readText).toHaveBeenCalled();
  });

  it("routes the file and folder pickers to VS Code dialogs", async () => {
    const { host, vscode } = createHost();
    vscode.window.openDialogResult = [{ fsPath: "C:/chosen/script.ps1" }];
    expect(await host.pickPath(false)).toBe("C:/chosen/script.ps1");
    expect(vscode.seen.openDialogs[0]).toMatchObject({ canSelectFiles: true, canSelectFolders: false, openLabel: "Run script" });

    expect(await host.pickPath(true, "C:/start")).toBe("C:/chosen/script.ps1");
    expect(vscode.seen.openDialogs[1]).toMatchObject({ canSelectFolders: true, openLabel: "Use folder", defaultUri: { file: "C:/start" } });
    expect(vscode.seen.openDialogs[0].defaultUri).toBeUndefined();

    vscode.window.openDialogResult = undefined;
    expect(await host.pickPath(true)).toBeNull();
  });

  it("hands the workbench to the next surface when the running one closes", async () => {
    const { host } = createHost();
    const panel = await registerSurface(host, "panel");
    const sidebar = await registerSurface(host, "sidebar");
    expect(host.activeKind).toBe("panel");

    panel.dispose();
    expect(host.activeKind).toBe("sidebar");
    expect(sidebar.webview.html).toContain("<iframe");

    sidebar.dispose();
    expect(host.activeKind).toBeNull();
  });

  it("keeps the active surface when an inactive one closes", async () => {
    const { host } = createHost();
    await registerSurface(host, "panel");
    const sidebar = await registerSurface(host, "sidebar");
    sidebar.dispose();
    expect(host.activeKind).toBe("panel");
    expect(host.surfaces.has("sidebar")).toBe(false);
  });

  it("does not repaint when the surface already running the workbench claims it again", async () => {
    const { host, output } = createHost();
    const panel = await registerSurface(host, "panel");
    panel.webview.html = "sentinel";
    host.claim("panel");
    expect(panel.webview.html).toBe("sentinel");
    expect(output.lines.join("\n")).not.toContain("MultiTerm moved to");
  });

  it("ignores a repaint request for a surface that is not registered", () => {
    const { host } = createHost();
    expect(() => host.render("panel")).not.toThrow();
    expect(() => host.revealActive()).not.toThrow();
  });

  it("shows a placeholder while no bridge has been resolved", async () => {
    const { host } = createHost();
    const view = fakeWebviewView();
    host.register("panel", view.webview, () => view.show(true));
    expect(view.webview.html).toContain("Move MultiTerm here");
  });

  it("describes the running surface neutrally when it has no name", async () => {
    const { host } = createHost();
    const unnamed = fakeWebviewView();
    host.register("floating", unnamed.webview, () => unnamed.show(true));
    const panel = fakeWebviewView();
    host.register("panel", panel.webview, () => panel.show(true));
    expect(panel.webview.html).toContain("another view");
  });

  it("serves every host capability the framed renderer asks for", async () => {
    const { host, vscode } = createHost();
    const view = await registerSurface(host, "panel");
    vscode.window.openDialogResult = [{ fsPath: "C:/picked" }];

    async function call(method, args) {
      view.webview.posted.length = 0;
      await view.webview.emit({ channel: CHANNEL, type: "request", id: method, method, args });
      return view.webview.posted[0];
    }

    expect(await call("writeClipboardText", ["copied"])).toMatchObject({ ok: true, value: true });
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith("copied");
    expect(await call("pickScript", [])).toMatchObject({ ok: true, value: "C:/picked" });
    expect(await call("pickFolder", ["C:/start"])).toMatchObject({ ok: true, value: "C:/picked" });
    expect(await call("openReleasePage", ["https://github.com/andrewtheart/multiterm-workbench/releases/latest"]))
      .toMatchObject({ ok: true, value: true });
    expect(vscode.env.openExternal).toHaveBeenCalledWith({ parsed: "https://github.com/andrewtheart/multiterm-workbench/releases/latest" });
    expect(await call("configureDiagnostics", [{}])).toMatchObject({ ok: true, value: true });
  });

  it("logs and refuses a non-https link the workbench tries to open", async () => {
    const { host, vscode, output } = createHost();
    const view = await registerSurface(host, "panel");
    await view.webview.emit({ channel: CHANNEL, type: "notify", method: "openExternal", args: ["file:///C:/secret"] });
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
    expect(output.lines.join("\n")).toContain("Refused to open a non-https URL");

    await view.webview.emit({ channel: CHANNEL, type: "notify", method: "openExternal", args: ["https://example.invalid/docs"] });
    expect(vscode.env.openExternal).toHaveBeenCalledWith({ parsed: "https://example.invalid/docs" });
  });
});

describe("embedded workbench surface moves", () => {
  it("opens the target view before claiming it, because a webview view resolves lazily", async () => {
    const { host, vscode } = createHost();
    await registerSurface(host, "editor");
    vscode.commands.executeCommand = vi.fn(async (id) => {
      vscode.seen.executed.push([id]);
      if (id === "multiterm.sidebarView.focus") await registerSurface(host, "sidebar");
    });
    expect(await host.moveTo("sidebar")).toBe("sidebar");
    expect(vscode.seen.executed).toContainEqual(["multiterm.sidebarView.focus"]);
    expect(host.activeKind).toBe("sidebar");
  });

  it("rejects a surface it does not know", async () => {
    const { host } = createHost();
    await expect(host.moveTo("floating")).rejects.toThrow("Unknown MultiTerm surface: floating");
  });

  it("reports a view that never opened rather than silently doing nothing", async () => {
    const { host } = createHost();
    vi.useFakeTimers();
    try {
      const settled = expect(host.moveTo("panel")).rejects.toThrow("The Panel view did not open.");
      await vi.advanceTimersByTimeAsync(3000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats the editor tab as its own reveal route", async () => {
    const { host, vscode } = createHost();
    expect(await host.revealSurface("editor")).toBe(true);
    expect(vscode.window.createdPanels).toHaveLength(1);
    expect(await host.revealSurface("floating")).toBe(false);
  });

  it("closes the editor tab when the workbench moves elsewhere, so no placeholder is stranded", async () => {
    const { host, vscode } = createHost();
    await host.open();
    const [panel] = vscode.window.createdPanels;
    vscode.commands.executeCommand = vi.fn(async (id) => {
      if (id === "multiterm.panelView.focus") await registerSurface(host, "panel");
    });
    await host.moveTo("panel");
    expect(panel.disposed).toBe(true);
    expect(host.surfaces.has("editor")).toBe(false);
  });

  it("closes the editor tab when another surface claims the workbench from its placeholder", async () => {
    const { host, vscode } = createHost();
    await host.open();
    const [panel] = vscode.window.createdPanels;
    const sidebar = await registerSurface(host, "sidebar");
    await sidebar.webview.emit({ channel: CHANNEL, type: "claim" });
    expect(panel.disposed).toBe(true);
    expect(host.activeKind).toBe("sidebar");
  });

  it("keeps the editor tab open when the workbench moves back to it", async () => {
    const { host, vscode } = createHost();
    await host.open();
    const [panel] = vscode.window.createdPanels;
    const sidebar = await registerSurface(host, "sidebar");
    vscode.commands.executeCommand = vi.fn(async (id) => {
      if (id === "multiterm.sidebarView.focus") return undefined;
      return undefined;
    });
    await sidebar.webview.emit({ channel: CHANNEL, type: "claim" });
    expect(panel.disposed).toBe(true);

    // Moving back to the editor must not dispose the tab it just opened.
    await host.moveTo("editor");
    const restored = vscode.window.createdPanels.at(-1);
    expect(host.activeKind).toBe("editor");
    expect(restored.disposed).toBe(false);
    expect(restored.webview.html).toContain("<iframe");
  });

  it("leaves a surface that has no editor tab alone", async () => {
    const { host } = createHost();
    expect(() => host.closeEditorSurface()).not.toThrow();
    host.surfaces.set("editor", { webview: fakeWebview(), reveal: () => {} });
    host.closeEditorSurface();
    expect(host.surfaces.has("editor")).toBe(true);
  });

  it("lets the user pick the surface, and does nothing when the picker is dismissed", async () => {
    const { host, vscode } = createHost();
    vscode.window.quickPickResult = undefined;
    expect(await host.chooseSurface()).toBeNull();

    await host.open();
    vscode.window.quickPickResult = (items) => items.find((item) => item.kind === "editor");
    expect(await host.chooseSurface()).toBe("editor");
    const offered = vscode.seen.quickPicks[1];
    expect(offered.map((item) => item.label)).toEqual(["Editor tab", "Panel", "Sidebar"]);
    expect(offered.find((item) => item.kind === "editor").description).toBe("current");
    expect(offered.find((item) => item.kind === "panel").description).toBeUndefined();
  });
});

describe("embedded workbench editor tab", () => {
  it("reveals the existing tab instead of opening a second one", async () => {
    const { host, vscode } = createHost();
    const panel = await host.open();
    expect(await host.open()).toBe(panel);
    expect(vscode.window.createdPanels).toHaveLength(1);
    expect(panel.revealed).toEqual([[undefined, false]]);
  });

  it("restores the tab after a VS Code restart", async () => {
    const { host } = createHost();
    const panel = fakeWebviewPanel();
    await host.restorePanel(panel);
    expect(host.activeKind).toBe("editor");
    expect(panel.webview.html).toContain("<iframe");
  });

  it("enables scripts on a view it adopts", async () => {
    const { host } = createHost();
    const view = await registerSurface(host, "panel");
    expect(view.webview.options).toEqual({ enableScripts: true });
  });

  it("keeps terminals running when VS Code exits", async () => {
    // MultiTerm's own default is to keep terminals when the window closes, and
    // the bridge owns the PTYs, so killing it here would destroy live work.
    const { host, bridgeResolver } = createHost();
    await host.ensureBridge();
    const child = bridgeResolver.spawnBridge.mock.results[0].value;
    host.dispose();
    expect(child.kill).not.toHaveBeenCalled();
    expect(child.unref).toHaveBeenCalled();
    expect(host.bridge).toBeNull();
  });

  it("stops a bridge it started when asked to, and never one it attached to", async () => {
    const owned = createHost({ settings: { closeTerminalsOnExit: true } });
    await owned.host.ensureBridge();
    const child = owned.bridgeResolver.spawnBridge.mock.results[0].value;
    owned.host.dispose();
    expect(child.kill).toHaveBeenCalled();
    expect(owned.host.bridge).toBeNull();

    const attached = createHost({
      settings: { closeTerminalsOnExit: true },
      resolver: {
        discoverBridges: vi.fn(async () => [
          { bridgeId: "BRIDGE-001", port: 3177, framable: true, url: "http://127.0.0.1:3177/", sessions: 1 }
        ])
      }
    });
    await attached.host.ensureBridge();
    expect(() => attached.host.dispose()).not.toThrow();
    expect(attached.bridgeResolver.spawnBridge).not.toHaveBeenCalled();
  });

  it("survives a bridge that has already exited", async () => {
    const child = fakeChild();
    child.kill = vi.fn(() => {
      throw new Error("ESRCH");
    });
    const { host } = createHost({
      settings: { closeTerminalsOnExit: true },
      resolver: { spawnBridge: vi.fn(() => child) }
    });
    await host.ensureBridge();
    expect(() => host.dispose()).not.toThrow();
  });
});

describe("embedded workbench activation", () => {
  function activateExtension({ settings = {}, viewHost, files = {} } = {}) {
    const vscode = resetVscode(settings);
    extensionHost.current = viewHost || {
      open: vi.fn(async () => {}),
      moveTo: vi.fn(async () => {}),
      chooseSurface: vi.fn(async () => {}),
      chooseBridge: vi.fn(async () => {}),
      resolveView: vi.fn(async () => {}),
      restorePanel: vi.fn(async () => {}),
      dispose: vi.fn()
    };
    launcherBehavior.findLauncher = vi.fn(() => "C:/MultiTerm/Start-MultiTerm.ps1");
    launcherBehavior.folderForResource = vi.fn((value) => value);
    launcherBehavior.launchFolder = vi.fn(() => ({ once: vi.fn() }));
    fsStub.statSync = vi.fn((target) => {
      if (Object.prototype.hasOwnProperty.call(files, target)) return { isDirectory: () => files[target] };
      throw new Error(`ENOENT: ${target}`);
    });
    const context = { extensionPath: "C:/ext", subscriptions: [] };
    extensionModule.activate(context);
    return { extension: extensionModule, vscode, host: extensionHost.current, launcher: launcherBehavior, context };
  }

  it("registers every contributed command", () => {
    const { vscode } = activateExtension();
    for (const contributed of manifest.contributes.commands) {
      expect(vscode.commands.registered.has(contributed.command)).toBe(true);
    }
  });

  it("registers both webview views and the panel serializer", () => {
    const { vscode, host } = activateExtension();
    expect(vscode.window.registeredViewProviders.map((entry) => entry.viewId))
      .toEqual(["multiterm.panelView", "multiterm.sidebarView"]);
    // Losing the retained context would rebuild every xterm buffer on each hide.
    expect(vscode.window.registeredViewProviders[0].options)
      .toEqual({ webviewOptions: { retainContextWhenHidden: true } });

    const view = fakeWebviewView();
    vscode.window.registeredViewProviders[1].provider.resolveWebviewView(view);
    expect(host.resolveView).toHaveBeenCalledWith("sidebar", view);

    const panel = fakeWebviewPanel();
    vscode.window.registeredSerializers[0].serializer.deserializeWebviewPanel(panel);
    expect(host.restorePanel).toHaveBeenCalledWith(panel);
  });

  it("routes each move command to its surface", async () => {
    const { vscode, host } = activateExtension();
    await vscode.commands.registered.get("multiterm.moveToEditor")();
    await vscode.commands.registered.get("multiterm.moveToPanel")();
    await vscode.commands.registered.get("multiterm.moveToSidebar")();
    expect(host.moveTo.mock.calls.map(([kind]) => kind)).toEqual(["editor", "panel", "sidebar"]);

    await vscode.commands.registered.get("multiterm.moveWorkbench")();
    expect(host.chooseSurface).toHaveBeenCalled();
  });

  it("surfaces the log when opening or moving fails", async () => {
    const host = {
      open: vi.fn(async () => {
        throw new Error("no bridge");
      }),
      moveTo: vi.fn(async () => {
        throw new Error("no view");
      }),
      chooseSurface: vi.fn(),
      chooseBridge: vi.fn(),
      resolveView: vi.fn(),
      restorePanel: vi.fn(),
      dispose: vi.fn()
    };
    const { vscode } = activateExtension({ viewHost: host });
    await vscode.commands.registered.get("multiterm.openEmbedded")();
    await vscode.commands.registered.get("multiterm.moveToPanel")();
    expect(vscode.seen.error).toEqual([
      "Could not open MultiTerm in VS Code: no bridge",
      "Could not move MultiTerm: no view"
    ]);
    expect(vscode.window.outputChannels[0].show).toHaveBeenCalledTimes(2);
  });

  it("gives the terminal frame a keyboard route back to the editor", async () => {
    const { vscode } = activateExtension();
    await vscode.commands.registered.get("multiterm.focusEditor")();
    expect(vscode.seen.executed).toContainEqual(["workbench.action.focusActiveEditorGroup"]);

    await vscode.commands.registered.get("multiterm.showBridgeLog")();
    expect(vscode.window.outputChannels[0].show).toHaveBeenCalledWith(true);
  });

  it("disposes the view host with the extension", () => {
    const { context, host, extension } = activateExtension();
    for (const subscription of context.subscriptions) subscription.dispose?.();
    expect(host.dispose).toHaveBeenCalled();
    expect(extension.deactivate()).toBeUndefined();
  });

  it("asks for a workspace folder only when the Explorer did not supply one", async () => {
    const { vscode, launcher } = activateExtension();
    vscode.workspace.workspaceFolders = [{ name: "repo", uri: { fsPath: "C:/repo" } }];
    await vscode.commands.registered.get("multiterm.openWorkspace")();
    expect(launcher.launchFolder).toHaveBeenCalledWith(
      "C:/MultiTerm/Start-MultiTerm.ps1",
      "C:/repo",
      expect.objectContaining({ title: "", command: "" })
    );
    expect(vscode.seen.status[0]).toContain("Opening C:/repo in MultiTerm");
  });

  it("reports that MultiTerm needs a folder when none is available", async () => {
    const { vscode } = activateExtension();
    await vscode.commands.registered.get("multiterm.openWorkspace")();
    expect(vscode.seen.error[0]).toContain("needs an open local workspace");

    // A window with no folder at all reports workspaceFolders as undefined.
    vscode.workspace.workspaceFolders = undefined;
    vscode.seen.error.length = 0;
    await vscode.commands.registered.get("multiterm.openWorkspace")();
    expect(vscode.seen.error[0]).toContain("needs an open local workspace");
  });

  it("opens the folder the Explorer selected, and the parent of a selected file", async () => {
    const { vscode, launcher } = activateExtension({
      files: { "C:/repo/src": true, "C:/repo/src/index.js": false }
    });
    launcher.folderForResource = vi.fn((value, isDirectory) => (isDirectory ? value : "C:/repo/src"));

    await vscode.commands.registered.get("multiterm.openContainingFolder")({ scheme: "file", fsPath: "C:/repo/src" });
    expect(launcher.folderForResource).toHaveBeenCalledWith("C:/repo/src", true);

    await vscode.commands.registered.get("multiterm.openFolder")({ scheme: "file", fsPath: "C:/repo/src/index.js" });
    expect(launcher.folderForResource).toHaveBeenLastCalledWith("C:/repo/src/index.js", false);
  });

  it("explains an Explorer path that has gone away", async () => {
    const { vscode } = activateExtension();
    await expect(vscode.commands.registered.get("multiterm.openFolder")({ scheme: "file", fsPath: "C:/gone" }))
      .rejects.toThrow("The selected Explorer path is unavailable");
  });

  it("asks which workspace folder to use when several are open", async () => {
    const { vscode, launcher } = activateExtension();
    vscode.workspace.workspaceFolders = [
      { name: "api", uri: { fsPath: "C:/api" } },
      { name: "web", uri: { fsPath: "C:/web" } }
    ];    vscode.window.quickPickResult = (items) => items[1];
    await vscode.commands.registered.get("multiterm.openWorkspace")();
    expect(launcher.launchFolder).toHaveBeenCalledWith("C:/MultiTerm/Start-MultiTerm.ps1", "C:/web", expect.anything());

    vscode.window.quickPickResult = undefined;
    launcher.launchFolder.mockClear();
    await vscode.commands.registered.get("multiterm.openWorkspace")();
    expect(launcher.launchFolder).not.toHaveBeenCalled();
  });

  it("honours an explicitly requested folder over the Explorer selection", async () => {
    const { vscode, launcher } = activateExtension({ files: { "C:/explicit": true } });
    await vscode.commands.registered.get("multiterm.openTerminal")({ path: " C:/explicit " });
    expect(launcher.launchFolder).toHaveBeenCalledWith("C:/MultiTerm/Start-MultiTerm.ps1", "C:/explicit", expect.anything());

    launcher.launchFolder.mockClear();
    await vscode.commands.registered.get("multiterm.openTerminal")({ folder: "C:/explicit" });
    expect(launcher.launchFolder).toHaveBeenCalledWith("C:/MultiTerm/Start-MultiTerm.ps1", "C:/explicit", expect.anything());

    await expect(vscode.commands.registered.get("multiterm.openTerminal")({ path: "C:/missing" }))
      .rejects.toThrow("The requested MultiTerm folder is unavailable");
  });

  it("ignores an Explorer resource passed where launch overrides are expected", async () => {
    const { vscode, launcher } = activateExtension();
    vscode.workspace.workspaceFolders = [{ name: "repo", uri: { fsPath: "C:/repo" } }];
    // VS Code passes the clicked resource to every command, so a Uri must not be
    // mistaken for a launch-options object.
    await vscode.commands.registered.get("multiterm.openWorkspace")({ scheme: "file", fsPath: "C:/elsewhere" });
    expect(launcher.launchFolder).toHaveBeenCalledWith("C:/MultiTerm/Start-MultiTerm.ps1", "C:/repo", expect.anything());
  });

  it("passes configured launch options through, letting explicit overrides win", async () => {
    const { vscode, launcher } = activateExtension({
      settings: {
        terminalTitle: "Configured",
        terminalCommand: "npm start",
        assistantType: "copilot",
        assistantModel: "gpt-5",
        assistantEffort: "high",
        assistantContext: "default"
      }
    });
    vscode.workspace.workspaceFolders = [{ name: "repo", uri: { fsPath: "C:/repo" } }];
    await vscode.commands.registered.get("multiterm.openTerminal")({ title: "Override" });
    expect(launcher.launchFolder).toHaveBeenCalledWith("C:/MultiTerm/Start-MultiTerm.ps1", "C:/repo", {
      title: "Override",
      command: "npm start",
      assistantType: "copilot",
      assistantModel: "gpt-5",
      assistantEffort: "high",
      assistantContext: "default"
    });
  });

  it("offers to fix the setting when the launcher cannot be found", async () => {
    const { vscode, launcher } = activateExtension();
    vscode.workspace.workspaceFolders = [{ name: "repo", uri: { fsPath: "C:/repo" } }];
    launcher.findLauncher = vi.fn(() => "");
    vscode.window.errorMessageResult = "Open Settings";
    await vscode.commands.registered.get("multiterm.openWorkspace")();
    expect(vscode.seen.executed).toContainEqual(["workbench.action.openSettings", "multiterm.launcherPath"]);

    vscode.window.errorMessageResult = undefined;
    vscode.seen.executed.length = 0;
    await vscode.commands.registered.get("multiterm.openWorkspace")();
    expect(vscode.seen.executed).toEqual([]);
  });

  it("reports a launcher that fails to start or exits badly", async () => {
    const { vscode, launcher } = activateExtension();
    vscode.workspace.workspaceFolders = [{ name: "repo", uri: { fsPath: "C:/repo" } }];
    const handlers = {};
    launcher.launchFolder = vi.fn(() => ({ once: (event, handler) => { handlers[event] = handler; } }));
    await vscode.commands.registered.get("multiterm.openWorkspace")();

    handlers.error(new Error("spawn failed"));
    expect(vscode.seen.error).toContain("Could not start MultiTerm: spawn failed");

    handlers.exit(1);
    expect(vscode.seen.error).toContain("MultiTerm could not open C:/repo (launcher exit code 1).");

    vscode.seen.error.length = 0;
    handlers.exit(0);
    handlers.exit(null);
    expect(vscode.seen.error).toEqual([]);
  });

  it("reports a launcher that throws outright", async () => {
    const { vscode, launcher } = activateExtension();
    vscode.workspace.workspaceFolders = [{ name: "repo", uri: { fsPath: "C:/repo" } }];
    launcher.launchFolder = vi.fn(() => {
      throw new Error("access denied");
    });
    await vscode.commands.registered.get("multiterm.openWorkspace")();
    expect(vscode.seen.error).toContain("Could not open MultiTerm: access denied");
  });

  it("hands the bridge switcher straight to the view host", async () => {
    const { vscode, host } = activateExtension();
    await vscode.commands.registered.get("multiterm.chooseBridge")();
    expect(host.chooseBridge).toHaveBeenCalled();
  });

  it("opens the embedded workbench when asked", async () => {
    const { vscode, host } = activateExtension();
    await vscode.commands.registered.get("multiterm.openEmbedded")();
    expect(host.open).toHaveBeenCalled();
  });

  it("still registers the views when the editor has no panel serializer", () => {
    const vscode = resetVscode();
    vscode.window.registerWebviewPanelSerializer = undefined;
    extensionHost.current = { dispose: vi.fn() };
    launcherBehavior.findLauncher = vi.fn(() => "C:/MultiTerm/Start-MultiTerm.ps1");
    expect(() => extensionModule.activate({ extensionPath: "C:/ext", subscriptions: [] })).not.toThrow();
    expect(vscode.window.registeredViewProviders).toHaveLength(2);
  });
});

describe("embedded bridge transport", () => {
  function fakeGet(plan) {
    return vi.fn((options, onResponse) => {
      const request = {
        handlers: {},
        on(event, handler) {
          (this.handlers[event] ||= []).push(handler);
          return this;
        },
        destroy(error) {
          for (const handler of this.handlers.error || []) handler(error);
        }
      };
      const step = typeof plan === "function" ? plan(options) : plan;
      queueMicrotask(() => {
        if (step.networkError) {
          for (const handler of request.handlers.error || []) handler(step.networkError);
          return;
        }
        if (step.timeout) {
          for (const handler of request.handlers.timeout || []) handler();
          return;
        }
        const response = {
          statusCode: step.statusCode ?? 200,
          headers: step.headers || {},
          resume() {},
          on(event, handler) {
            if (event === "data" && step.body !== undefined) handler(step.body);
            if (event === "end") handler();
            return this;
          }
        };
        if (step.setEncoding !== false) response.setEncoding = () => {};
        onResponse(response);
      });
      return request;
    });
  }

  const healthy = JSON.stringify({ app: "MultiTerm Workbench", port: 3177, pid: 42, sessions: 3, rendererClients: 1 });

  it("accepts a health answer only from a MultiTerm bridge on the port it was asked about", async () => {
    expect(await resolver.probeHealth("127.0.0.1", 3177, 500, fakeGet({ body: healthy })))
      .toMatchObject({ app: "MultiTerm Workbench", pid: 42 });
    // A stream without setEncoding still has to be read.
    expect(await resolver.probeHealth("127.0.0.1", 3177, 500, fakeGet({ body: healthy, setEncoding: false })))
      .toMatchObject({ pid: 42 });
    expect(await resolver.probeHealth("127.0.0.1", 3177, 500, fakeGet({ body: healthy, statusCode: 503 }))).toBeNull();
    expect(await resolver.probeHealth("127.0.0.1", 3177, 500, fakeGet({ body: JSON.stringify({ app: "Other", port: 3177 }) }))).toBeNull();
    expect(await resolver.probeHealth("127.0.0.1", 3177, 500, fakeGet({ body: JSON.stringify({ app: "MultiTerm Workbench", port: 9999 }) }))).toBeNull();
    expect(await resolver.probeHealth("127.0.0.1", 3177, 500, fakeGet({ body: "not json" }))).toBeNull();
  });

  it("treats an unreachable or silent bridge as absent rather than hanging", async () => {
    expect(await resolver.probeHealth("127.0.0.1", 3177, 500, fakeGet({ networkError: new Error("ECONNREFUSED") }))).toBeNull();
    expect(await resolver.probeHealth("127.0.0.1", 3177, 500, fakeGet({ timeout: true }))).toBeNull();
  });

  it("answers once even if the response and an error both arrive", async () => {
    // A socket that errors after delivering a body must not resolve twice.
    const settleTwice = (extra) => vi.fn((options, onResponse) => {
      const request = {
        handlers: {},
        on(event, handler) {
          (this.handlers[event] ||= []).push(handler);
          return this;
        },
        destroy() {}
      };
      queueMicrotask(() => {
        const response = {
          statusCode: 200,
          headers: { "content-security-policy": "frame-ancestors vscode-webview: vscode-file:" },
          setEncoding() {},
          resume() {},
          on(event, handler) {
            if (event === "data") handler(extra);
            if (event === "end") handler();
            return this;
          }
        };
        onResponse(response);
        for (const handler of request.handlers.error || []) handler(new Error("socket hang up"));
      });
      return request;
    });

    expect(await resolver.probeHealth("127.0.0.1", 3177, 500, settleTwice(healthy))).toMatchObject({ pid: 42 });
    expect(await resolver.probeFramePolicy("127.0.0.1", 3177, 500, settleTwice(""))).toEqual({ framable: true, reason: "" });
  });

  it("reads the framing policy a bridge actually serves", async () => {
    const framable = await resolver.probeFramePolicy("127.0.0.1", 3177, 500, fakeGet({
      headers: { "content-security-policy": "default-src 'self'; frame-ancestors 'self' vscode-webview: vscode-file:" }
    }));
    expect(framable).toEqual({ framable: true, reason: "" });

    const partial = await resolver.probeFramePolicy("127.0.0.1", 3177, 500, fakeGet({
      headers: { "content-security-policy": "frame-ancestors 'self' vscode-webview:" }
    }));
    expect(partial).toMatchObject({ framable: false });

    const blocked = await resolver.probeFramePolicy("127.0.0.1", 3177, 500, fakeGet({
      headers: { "content-security-policy": "frame-ancestors 'none'" }
    }));
    expect(blocked).toMatchObject({ framable: false });
    expect(blocked.reason).toContain("frame-ancestors 'none'");

    expect(await resolver.probeFramePolicy("127.0.0.1", 3177, 500, fakeGet({ headers: {} })))
      .toEqual({ framable: false, reason: "it sends no frame-ancestors policy" });
    expect(await resolver.probeFramePolicy("127.0.0.1", 3177, 500, fakeGet({ networkError: new Error("nope") })))
      .toEqual({ framable: false, reason: "it could not be reached" });
    expect(await resolver.probeFramePolicy("127.0.0.1", 3177, 500, fakeGet({ timeout: true })))
      .toEqual({ framable: false, reason: "it could not be reached" });
  });

  it("normalizes the loopback spellings a record may use", () => {
    expect(resolver.readRecord(record({ url: "http://localhost:3177/" }))).toMatchObject({ host: "127.0.0.1" });
    expect(resolver.readRecord(record({ url: "http://[::1]:3177/" }))).toMatchObject({ host: "::1" });
    expect(resolver.normalizeHost("example.invalid")).toBe("example.invalid");
    expect(resolver.readRecord(record({ bridgeId: undefined, bridgeType: "installed", startedAt: undefined })))
      .toMatchObject({ bridgeId: "Bridge", bridgeType: "installed", startedAt: "" });
  });

  it("looks for instance records under the local application data directory", () => {
    expect(resolver.instanceDirectory({ LOCALAPPDATA: "C:/Users/a/AppData/Local" }))
      .toBe(path.join("C:/Users/a/AppData/Local", "MultiTerm", "Instances"));
    expect(resolver.instanceDirectory({})).toBe("");
  });

  it("finds nothing when there is nowhere to look or nothing to read", async () => {
    expect(await resolver.discoverBridges({ directory: "" })).toEqual([]);
    expect(await resolver.discoverBridges({
      directory: "C:/instances",
      fileSystem: {
        readdirSync() {
          throw new Error("ENOENT");
        }
      }
    })).toEqual([]);
  });

  it("rejects a record with no URL at all", () => {
    expect(() => resolver.readRecord(JSON.stringify({ app: "MultiTerm Workbench", port: 3177, pid: 42 }))).toThrow();
  });

  it("defaults to the machine's own instance directory", async () => {
    const readdirSync = vi.fn(() => []);
    // No directory given, so it resolves one itself; the fake file system keeps
    // this away from the real records on this machine.
    expect(await resolver.discoverBridges({ fileSystem: { readdirSync }, probe: async () => null })).toEqual([]);
    const expected = resolver.instanceDirectory();
    if (expected) {
      expect(readdirSync).toHaveBeenCalledWith(expected, { withFileTypes: true });
    } else {
      expect(readdirSync).not.toHaveBeenCalled();
    }
  });

  it("skips records that are not files, not JSON, unreadable, or whose bridge died", async () => {
    const files = {
      "notes.txt": "",
      "broken.json": "{ not json",
      "stale.json": record({ pid: 999 }),
      "live.json": record({ pid: 42, port: 3177, url: "http://127.0.0.1:3177/", startedAt: "2026-08-28T09:00:00.000Z" }),
      "newer.json": record({ pid: 43, port: 3200, url: "http://127.0.0.1:3200/", startedAt: "2026-08-28T11:00:00.000Z" })
    };
    const found = await resolver.discoverBridges({
      directory: "C:/instances",
      fileSystem: {
        readdirSync: () => [
          { name: "subdir", isFile: () => false },
          ...Object.keys(files).map((name) => ({ name, isFile: () => true }))
        ],
        readFileSync: (file) => files[path.basename(file)]
      },
      probe: async (host, port) => (port === 3177
        ? { pid: 42, sessions: 2, rendererClients: 1 }
        : port === 3200 ? { pid: 43 } : { pid: 1 }),
      framePolicy: async () => ({ framable: true, reason: "" })
    });
    // Newest first, so the most recently started bridge is preferred.
    expect(found.map((entry) => entry.port)).toEqual([3200, 3177]);
    expect(found[1]).toMatchObject({ sessions: 2, rendererClients: 1, url: "http://127.0.0.1:3177/" });
    // A health answer with no counters must not become NaN.
    expect(found[0]).toMatchObject({ sessions: 0, rendererClients: 0 });
  });

  it("brackets an IPv6 loopback record back into a usable URL", async () => {
    const found = await resolver.discoverBridges({
      directory: "C:/instances",
      fileSystem: {
        readdirSync: () => [{ name: "v6.json", isFile: () => true }],
        readFileSync: () => record({ url: "http://[::1]:3177/" })
      },
      probe: async () => ({ pid: 4242 }),
      framePolicy: async () => ({ framable: true, reason: "" })
    });
    expect(found[0].url).toBe("http://[::1]:3177/");
  });

  it("takes the first port nothing is listening on", async () => {
    const attempted = [];
    const createServer = () => {
      const server = {
        handlers: {},
        once(event, handler) {
          this.handlers[event] = handler;
          return this;
        },
        listen(port) {
          attempted.push(port);
          queueMicrotask(() => {
            if (port < 3202) this.handlers.error(new Error("EADDRINUSE"));
            else this.handlers.listening();
          });
        },
        close(done) {
          done();
        }
      };
      return server;
    };
    expect(await resolver.findFreePort(3200, "127.0.0.1", createServer)).toBe(3202);
    expect(attempted).toEqual([3200, 3201, 3202]);
  });

  it("gives up rather than scanning past the last valid port", async () => {
    const createServer = () => ({
      handlers: {},
      once(event, handler) {
        this.handlers[event] = handler;
        return this;
      },
      listen() {
        queueMicrotask(() => this.handlers.error(new Error("EADDRINUSE")));
      },
      close(done) {
        done();
      }
    });
    await expect(resolver.findFreePort(65535, "127.0.0.1", createServer))
      .rejects.toThrow("No free local port is available for a MultiTerm bridge.");
  });

  it("prefers a configured script, then the bundled runtime, then the installed app", () => {
    const present = new Set([
      path.resolve("C:/ext/runtime/src/server.js"),
      path.resolve("C:/Program Files/MultiTerm/src/server.js"),
      path.resolve("C:/custom/server.js")
    ]);
    const fileSystem = {
      statSync: (candidate) => {
        if (!present.has(candidate)) throw new Error("ENOENT");
        return { isFile: () => true };
      }
    };
    expect(resolver.resolveBridgeScript({
      fileSystem,
      configuredPath: "C:/custom/server.js",
      extensionRoot: "C:/ext",
      launcherPath: "C:/Program Files/MultiTerm/Start-MultiTerm.ps1"
    })).toBe(path.resolve("C:/custom/server.js"));

    expect(resolver.resolveBridgeScript({
      fileSystem,
      extensionRoot: "C:/ext",
      launcherPath: "C:/Program Files/MultiTerm/Start-MultiTerm.ps1"
    })).toBe(path.resolve("C:/ext/runtime/src/server.js"));

    expect(resolver.resolveBridgeScript({
      fileSystem,
      launcherPath: "C:/Program Files/MultiTerm/Start-MultiTerm.ps1"
    })).toBe(path.resolve("C:/Program Files/MultiTerm/src/server.js"));

    expect(resolver.resolveBridgeScript({ fileSystem })).toBeNull();
    expect(resolver.resolveBridgeScript({ fileSystem, configuredPath: "C:/missing/server.js" })).toBeNull();
  });

  it("runs the bridge under system node, since node-pty is built for that ABI", () => {
    const spawn = vi.fn(() => fakeChild());
    resolver.spawnBridge({ spawn, scriptPath: "C:/app/src/server.js", port: 3210, env: { EXISTING: "1" } });
    const [executable, args, options] = spawn.mock.calls[0];
    expect(executable).toBe(process.platform === "win32" ? "node.exe" : "node");
    expect(args).toEqual(["C:/app/src/server.js"]);
    expect(options.env).toMatchObject({ EXISTING: "1", HOST: "127.0.0.1", PORT: "3210" });
    expect(options.cwd).toBe(path.resolve("C:/app"));
    expect(options).toMatchObject({ windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

    resolver.spawnBridge({ spawn, scriptPath: "C:/app/src/server.js", port: 3210, host: "::1" });
    expect(spawn.mock.calls[1][2].env).toMatchObject({ HOST: "::1" });
  });

  it("refuses to spawn without a script or with an unusable port", () => {
    const spawn = vi.fn();
    expect(() => resolver.spawnBridge({ spawn })).toThrow("No MultiTerm bridge script was found.");
    expect(() => resolver.spawnBridge({ spawn, scriptPath: "C:/app/src/server.js", port: 0 })).toThrow("Invalid bridge port: 0");
    expect(() => resolver.spawnBridge({ spawn, scriptPath: "C:/app/src/server.js", port: 70000 })).toThrow("Invalid bridge port: 70000");
    expect(() => resolver.spawnBridge({ spawn, scriptPath: "C:/app/src/server.js", port: 1.5 })).toThrow("Invalid bridge port: 1.5");
    expect(spawn).not.toHaveBeenCalled();
  });
});
