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

let { app, BrowserWindow, Menu, Tray, clipboard, shell, dialog, ipcMain } = require("electron");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { RuntimeDiagnostics } = require("./lib/runtime-diagnostics");

// Allows tests to inject fake Electron bindings; outside the Electron runtime
// `require("electron")` resolves to a path string, so these are set by tests.
function __setElectron(mock) {
  ({ app, BrowserWindow, Menu, Tray, clipboard, shell, dialog, ipcMain } = mock);
}

function registerWindowIpc() {
  if (!ipcMain || typeof ipcMain.handle !== "function") return;
  try { ipcMain.removeHandler("multiterm:set-fullscreen"); } catch { /* no existing handler */ }
  try { ipcMain.removeHandler("multiterm:minimize-window"); } catch { /* no existing handler */ }
  try { ipcMain.removeHandler("multiterm:configure-diagnostics"); } catch { /* no existing handler */ }
  ipcMain.handle("multiterm:set-fullscreen", (event, enabled) => {
    assertTrustedIpcSender(event);
    const next = Boolean(enabled);
    mainWindow.setFullScreen(next);
    return typeof mainWindow.isFullScreen === "function" ? mainWindow.isFullScreen() : next;
  });
  ipcMain.handle("multiterm:minimize-window", (event) => {
    assertTrustedIpcSender(event);
    mainWindow.minimize();
    return true;
  });
  ipcMain.handle("multiterm:configure-diagnostics", (event, settings) => {
    assertTrustedIpcSender(event);
    return runtimeDiagnostics.configure({
      retentionDays: settings?.retentionDays,
      rotationMb: settings?.rotationMb,
      viewerEntries: settings?.viewerEntries
    });
  });
}

function formatError(err) {
  return String(err.message || err);
}

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3177);
let clipboardImageDirectory = null;

// Whether a URL points back at the app's own local origin. Used to allow internal
// navigations/window-opens while routing everything else to the default browser.
function isInternalUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:"
      && (parsed.hostname === HOST || parsed.hostname === "localhost")
      && parsed.port === String(PORT);
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url) {
  if (typeof url !== "string") return false;
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:";
  } catch {
    return false;
  }
}

function isTrustedIpcSender(event) {
  const sender = event?.sender;
  const senderFrame = event?.senderFrame;
  const webContents = mainWindow?.webContents;
  if (!webContents || sender !== webContents) return false;
  if (senderFrame && webContents.mainFrame && senderFrame !== webContents.mainFrame) return false;
  return isInternalUrl(senderFrame?.url || sender?.getURL?.());
}

function assertTrustedIpcSender(event) {
  if (!isTrustedIpcSender(event)) {
    throw new Error("IPC is restricted to the MultiTerm application window.");
  }
}

// The only web capabilities the workbench itself uses, for the permission CHECK
// handler installed in createWindow.
const ALLOWED_PERMISSIONS = new Set(["clipboard-read", "clipboard-sanitized-write"]);

// Chromium force-loses the oldest WebGL context once ~16 are live, and xterm's
// WebGL addon leaves a pane with no renderer when its context dies. Raising the
// ceiling keeps terminal renderers from competing with each other (and with the
// app's other canvases) on machines running many panes. app.js still enforces its
// own, lower budget, so this is headroom rather than something we depend on.
function configureChromiumCommandLine(targetApp = app) {
  if (targetApp?.commandLine?.appendSwitch) {
    targetApp.commandLine.appendSwitch("max-active-webgl-contexts", "64");
  }
}
configureChromiumCommandLine();

// Whether this process is already elevated (administrator). Cached after a
// one-time check so "Restart as Administrator" can short-circuit.
let appIsElevated = process.env.MULTITERM_ELEVATED === "1";
let elevationChecked = false;

let mainWindow = null;
let tray = null;
let serverProcess = null;
let runtimeDiagnostics = new RuntimeDiagnostics();
let bridgeHandledForQuit = false;
// Timestamps of recent unexpected bridge restarts, used as a crash-loop guard so
// a bridge that dies immediately over and over surfaces an error instead of
// respawning forever.
let serverRestarts = [];
const RESTART_WINDOW_MS = 10000;
const MAX_RESTARTS = 5;

function recordElectronDiagnostic(record) {
  try {
    runtimeDiagnostics.append({ source: "electron", ...record });
  } catch (error) {
    console.error("[electron] Could not persist runtime diagnostics:", formatError(error));
  }
}

function captureBridgeOutput(stream, level, event) {
  stream?.on?.("data", (chunk) => {
    const message = String(chunk ?? "").replace(/[\r\n]+$/, "");
    if (!message) return;
    recordElectronDiagnostic({ level, event, message });
  });
}

// The bridge uses node-pty (a native module built for the system Node ABI),
// so it runs under the system `node` executable rather than inside Electron's
// runtime, whose Node ABI differs from the installed prebuilt binary.
//
// MEMSTATS is deliberately not set: each reading costs the bridge a ~1s
// Win32_Process query, and the status bar now requests one on demand only
// while its memory chip is hovered. Set MEMSTATS=1 to restore the old 10s
// background broadcast.
function startServer() {
  const nodeExe = process.platform === "win32" ? "node.exe" : "node";
  serverProcess = childProcess.spawn(nodeExe, [path.join(__dirname, "server.js")], {
    cwd: __dirname,
    detached: true,
    env: { ...process.env, HOST, PORT: String(PORT), MULTITERM_UI_OWNER_PID: String(process.pid) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  recordElectronDiagnostic({
    level: "info",
    event: "bridge-spawn",
    message: `Started terminal bridge on ${HOST}:${PORT}.`,
    pid: serverProcess.pid
  });
  captureBridgeOutput(serverProcess.stdout, "info", "bridge-stdout");
  captureBridgeOutput(serverProcess.stderr, "error", "bridge-stderr");
  serverProcess.unref?.();
  serverProcess.on("error", (err) => {
    recordElectronDiagnostic({
      level: "error",
      event: "bridge-spawn-error",
      message: formatError(err)
    });
    if (!app.isQuiting) {
      dialog.showErrorBox(
        "MultiTerm",
        `Could not start the terminal bridge. Ensure Node.js is installed and on PATH.\n\n${err.message}`
      );
    }
  });
  serverProcess.on("exit", (code, signal) => {
    recordElectronDiagnostic({
      level: app.isQuiting || code === 0 || code === null ? "info" : "error",
      event: "bridge-exit",
      message: `Terminal bridge exited with code ${code === null ? "none" : code}${signal ? ` (${signal})` : ""}.`,
      code,
      signal
    });
    serverProcess = null;
    // A clean exit (0) or a kill we requested (null on signal) needs no action.
    if (app.isQuiting || code === 0 || code === null) return;

    // The bridge died unexpectedly. node-pty's native ConPTY path can abort the
    // whole process during heavy churn, which no in-process handler can catch.
    // Restart it so the renderer's auto-reconnect can recover the workspace,
    // unless we're clearly in a crash loop.
    const now = Date.now();
    serverRestarts = serverRestarts.filter((t) => now - t < RESTART_WINDOW_MS);
    if (serverRestarts.length >= MAX_RESTARTS) {
      recordElectronDiagnostic({
        level: "error",
        event: "bridge-restart-abandoned",
        message: `Terminal bridge restart abandoned after ${serverRestarts.length} attempts.`,
        code
      });
      dialog.showErrorBox(
        "MultiTerm",
        `The terminal bridge keeps exiting unexpectedly (code ${code}). Giving up after ${serverRestarts.length} restart attempts.`
      );
      return;
    }
    serverRestarts.push(now);
    recordElectronDiagnostic({
      level: "warn",
      event: "bridge-restart",
      message: `Restarting terminal bridge after exit code ${code}.`,
      code,
      attempt: serverRestarts.length
    });
    startServer();
  });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function requestServerShutdown(callback) {
  const child = serverProcess;

  let finished = false;
  const finish = (force) => {
    if (finished) {
      return;
    } else {
      finished = true;
      if (force && child && !child.killed) {
        child.kill();
      } else {
        // A successful shutdown, absent child, or already-stopped child needs no force kill.
      }
      serverProcess = null;
      callback();
    }
  };
  const request = http.request({
    host: HOST,
    port: PORT,
    path: "/shutdown",
    method: "POST",
    headers: { "X-MultiTerm-Request": "Launcher" },
    timeout: 3000
  }, (response) => {
    response.resume();
    response.on("end", () => finish(response.statusCode !== 200));
  });
  request.on("timeout", () => request.destroy(new Error("Bridge shutdown timed out.")));
  request.on("error", () => finish(true));
  request.end();
}

function requestWatchdogSuppression(callback) {
  let finished = false;
  const finish = () => {
    if (finished) {
      return;
    } else {
      finished = true;
      callback();
    }
  };
  const request = http.request({
    host: HOST,
    port: PORT,
    path: "/watchdog/keep",
    method: "POST",
    headers: { "X-MultiTerm-Request": "Launcher" },
    timeout: 2000
  }, (response) => {
    response.resume();
    response.on("end", finish);
  });
  request.on("timeout", () => request.destroy(new Error("Bridge watchdog update timed out.")));
  request.on("error", finish);
  request.end();
}

function probeServer(timeoutMs = 500) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready) => {
      if (settled) {
        return;
      } else {
        settled = true;
        resolve(ready);
      }
    };
    const request = http.get({ host: HOST, port: PORT, path: "/health", timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding?.("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          const health = JSON.parse(body);
          finish(response.statusCode === 200
            && health.app === "MultiTerm Workbench"
            && Number.isSafeInteger(Number(health.pid))
            && Number(health.pid) > 0
            && Number(health.port) === PORT);
        } catch {
          finish(false);
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Bridge health check timed out.")));
    request.on("error", () => finish(false));
  });
}

function waitForServer(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      if (await probeServer(1000)) {
        resolve();
        return;
      }
      retry();
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error("Bridge did not become ready in time."));
      } else {
        setTimeout(attempt, 200);
      }
    };
    attempt();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#1e1e1e",
    title: "MultiTerm Workbench",
    icon: path.join(__dirname, "public", "favicon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Nothing in this app embeds foreign content, so remove the machinery that
      // would host it. Explicit rather than relying on Electron's defaults, which
      // have changed between major versions.
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      // Chromium stops requestAnimationFrame entirely for a minimized/occluded
      // window (measured: 0 ticks over 3s). The renderer drains buffered terminal
      // output on rAF, so throttling would let a background build accumulate its
      // whole transcript in memory and then replay it in one blocking write on
      // restore. Terminals must keep consuming output whether or not you are
      // looking at them.
      backgroundThrottling: false,
      // Run the renderer in Chromium's OS sandbox. Nothing in the renderer needs
      // Node; the preload only touches contextBridge/ipcRenderer, both of which
      // remain available to a sandboxed preload. This contains a renderer
      // compromise (e.g. via hostile terminal output) behind the sandbox broker.
      sandbox: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  // Open external links in the user's default browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      return { action: "allow" };
    }
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Pin the top-level frame to the app's own origin. Nothing in MultiTerm should
  // navigate away; a stray navigation to a remote page (e.g. from injected markup
  // or a mis-handled link) would otherwise hand that page the renderer context.
  // Legitimate external links are routed to the default browser instead.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) {
        shell.openExternal(url);
      }
    }
  });

  // The workbench needs no web permissions (camera, microphone, geolocation,
  // notifications from web content, and so on). Deny every request so nothing the
  // renderer displays can provoke an OS permission prompt.
  const ses = mainWindow.webContents.session;
  if (ses && typeof ses.setPermissionRequestHandler === "function") {
    ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    // Some permissions are resolved by a synchronous CHECK that never reaches the
    // request handler above, so it has to be answered separately or those default
    // to allowed. Terminal copy/paste is the only capability the workbench uses.
    ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => (
      ALLOWED_PERMISSIONS.has(permission) && isInternalUrl(requestingOrigin)
    ));
  }

  mainWindow.loadURL(`http://${HOST}:${PORT}/`);

  // Closing the window docks MultiTerm to the system tray instead of quitting,
  // so terminal sessions survive. The renderer decides (via a modal) whether to
  // dock or quit; we only quit outright when the user explicitly asked to.
  mainWindow.on("close", (event) => {
    if (app.isQuiting) return;
    event.preventDefault();
    const wc = mainWindow.webContents;
    if (wc && !wc.isDestroyed()) {
      wc.send("multiterm:close-request", "window");
    } else {
      // No renderer to ask — fall back to the safe default of docking to tray.
      // The user can still quit from the tray menu.
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.on("enter-full-screen", () => {
    mainWindow?.webContents.send("multiterm:fullscreen-change", true);
  });
  mainWindow.on("leave-full-screen", () => {
    mainWindow?.webContents.send("multiterm:fullscreen-change", false);
  });
}

// Brings the (possibly hidden/minimized) window back to the foreground.
function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function requestCloseDecision(source) {
  showMainWindow();
  const wc = mainWindow && mainWindow.webContents;
  if (wc && !wc.isDestroyed()) {
    wc.send("multiterm:close-request", source);
  } else {
    // A destroyed renderer cannot participate in the close decision.
  }
}

// Explicit, user-initiated quit after the renderer has made the bridge decision.
function quitApp(closeBridge = true) {
  app.isQuiting = true;
  bridgeHandledForQuit = true;
  if (!closeBridge) {
    requestWatchdogSuppression(() => {
      serverProcess?.unref?.();
      serverProcess = null;
      app.quit();
    });
    return;
  }
  requestServerShutdown(() => app.quit());
}

// System-tray icon with Show / Quit actions, so a tray-docked app stays reachable.
function createTray() {
  if (tray || !Tray) return tray;
  tray = new Tray(path.join(__dirname, "public", "favicon.ico"));
  tray.setToolTip("MultiTerm Workbench");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show MultiTerm", click: () => showMainWindow() },
    { type: "separator" },
    { label: "Quit MultiTerm", click: () => requestCloseDecision("tray") }
  ]));
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
  return tray;
}

// Applies the renderer's close decision: dock to tray, quit, or stay open.
function handleCloseResponse(action) {
  if (action === "quitClose") {
    quitApp(true);
  } else if (action === "quitKeep") {
    quitApp(false);
  } else if (action === "tray") {
    if (mainWindow) mainWindow.hide();
  }
  // "cancel" (or anything unrecognized): leave the window open.
}

function registerCloseHandler() {
  if (!ipcMain || typeof ipcMain.on !== "function") return;
  if (typeof ipcMain.removeAllListeners === "function") {
    ipcMain.removeAllListeners("multiterm:close-response");
    ipcMain.removeAllListeners("multiterm:focus-window");
  }
  ipcMain.on("multiterm:close-response", (event, action) => {
    if (!isTrustedIpcSender(event)) {
      return;
    } else {
      handleCloseResponse(action);
    }
  });
  ipcMain.on("multiterm:focus-window", (event) => {
    if (!isTrustedIpcSender(event)) {
      return;
    } else {
      showMainWindow();
    }
  });
}

function registerClipboardIpc() {
  if (!ipcMain || typeof ipcMain.handle !== "function" || !clipboard) return;
  if (typeof clipboard.writeText === "function") {
    try { ipcMain.removeHandler("multiterm:write-clipboard"); } catch { /* no existing handler */ }
    ipcMain.handle("multiterm:write-clipboard", (event, text) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Clipboard writes are restricted to the MultiTerm application window.");
      }
      if (typeof text !== "string") {
        throw new TypeError("Clipboard text must be a string.");
      }
      clipboard.writeText(text);
      return true;
    });
  }
  if (typeof clipboard.readText === "function" || typeof clipboard.readImage === "function") {
    try { ipcMain.removeHandler("multiterm:read-clipboard"); } catch { /* no existing handler */ }
    ipcMain.handle("multiterm:read-clipboard", (event) => {
      if (!isTrustedIpcSender(event)) {
        throw new Error("Clipboard reads are restricted to the MultiTerm application window.");
      }
      return readTerminalClipboardText(clipboard);
    });
  }
}

function decodeNullSeparatedClipboardPaths(buffer, encoding, offset = 0) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset >= buffer.length) return [];
  return buffer.subarray(offset).toString(encoding).split("\0").filter(Boolean);
}

function decodeWindowsFileDrop(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) return [];
  const offset = buffer.readUInt32LE(0);
  if (offset < 20 || offset >= buffer.length) return [];
  return decodeNullSeparatedClipboardPaths(buffer, buffer.readUInt32LE(16) ? "utf16le" : "latin1", offset);
}

function decodeClipboardUriList(buffer) {
  if (!Buffer.isBuffer(buffer)) return [];
  const paths = [];
  for (const entry of buffer.toString("utf8").split(/\r?\n/)) {
    if (!entry || entry.startsWith("#")) continue;
    try {
      const url = new URL(entry);
      if (url.protocol === "file:") paths.push(fileURLToPath(url));
    } catch {
      // Malformed and non-file clipboard entries are not terminal file paths.
    }
  }
  return paths;
}

function readWindowsClipboardFileDrop(execute = childProcess.execFileSync) {
  const script = [
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)",
    "Add-Type -AssemblyName System.Windows.Forms",
    "$files = @([Windows.Forms.Clipboard]::GetFileDropList() | ForEach-Object { [string]$_ })",
    "ConvertTo-Json -Compress -InputObject $files"
  ].join("; ");
  const output = execute("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-STA",
    "-NonInteractive",
    "-Command",
    script
  ], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true
  });
  return JSON.parse(String(output).replace(/^\uFEFF/, "").trim());
}

function readClipboardFilePaths(
  nativeClipboard,
  fileSystem = fs,
  readNativeFileDrop = readWindowsClipboardFileDrop
) {
  if (typeof nativeClipboard?.availableFormats !== "function"
      || typeof nativeClipboard?.readBuffer !== "function") {
    return [];
  }
  const formats = nativeClipboard.availableFormats();
  const dropFormat = ["CF_HDROP", "FileDrop"].find((format) => formats.includes(format));
  let candidates = dropFormat
    ? decodeWindowsFileDrop(nativeClipboard.readBuffer(dropFormat))
    : [];
  if (candidates.length === 0 && formats.includes("FileNameW")) {
    candidates = decodeNullSeparatedClipboardPaths(nativeClipboard.readBuffer("FileNameW"), "utf16le");
  }
  if (candidates.length === 0 && formats.includes("text/uri-list")) {
    const uriList = typeof nativeClipboard.read === "function"
      ? nativeClipboard.read("text/uri-list")
      : "";
    candidates = decodeClipboardUriList(
      uriList ? Buffer.from(uriList, "utf8") : nativeClipboard.readBuffer("text/uri-list")
    );
    if (candidates.length === 0) {
      candidates = readNativeFileDrop();
    }
  }

  const paths = [];
  const seen = new Set();
  for (const candidate of candidates.slice(0, 256)) {
    if (candidate.length > 32767) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) {
      continue;
    } else {
      // The first valid occurrence preserves the clipboard's ordering.
    }
    try {
      const stat = fileSystem.statSync(candidate);
      if (!stat.isFile() && !stat.isDirectory()) continue;
    } catch {
      continue;
    }
    seen.add(key);
    paths.push(candidate);
  }
  return paths;
}

function formatClipboardFilePaths(paths) {
  return paths.map((filePath) => (
    /[\s"]/.test(filePath)
      ? `"${filePath.replace(/"/g, '\\"')}"`
      : filePath
  )).join(" ");
}

function getClipboardImageDirectory(fileSystem = fs, targetApp = app) {
  if (clipboardImageDirectory) return clipboardImageDirectory;
  const tempRoot = typeof targetApp?.getPath === "function" ? targetApp.getPath("temp") : os.tmpdir();
  clipboardImageDirectory = fileSystem.mkdtempSync(path.join(tempRoot, "multiterm-clipboard-images-"));
  return clipboardImageDirectory;
}

function persistClipboardImage(image, fileSystem = fs, imageDirectory = null) {
  if (!image || typeof image.isEmpty !== "function" || image.isEmpty() || typeof image.toPNG !== "function") {
    return "";
  }
  const png = image.toPNG();
  if (!Buffer.isBuffer(png) || png.length === 0) return "";
  const directory = imageDirectory || getClipboardImageDirectory(fileSystem);
  fileSystem.mkdirSync(directory, { recursive: true });
  const digest = crypto.createHash("sha256").update(png).digest("hex");
  const imagePath = path.join(directory, `clipboard-${digest}.png`);
  fileSystem.writeFileSync(imagePath, png, { flag: "w", mode: 0o600 });
  return imagePath;
}

function readClipboardImagePath(
  nativeClipboard,
  fileSystem = fs,
  imageDirectory = null
) {
  if (typeof nativeClipboard?.readImage !== "function") return "";
  return persistClipboardImage(nativeClipboard.readImage(), fileSystem, imageDirectory);
}

function cleanupClipboardImages(fileSystem = fs) {
  if (!clipboardImageDirectory) return;
  const directory = clipboardImageDirectory;
  clipboardImageDirectory = null;
  try {
    fileSystem.rmSync(directory, { force: true, recursive: true });
  } catch (error) {
    console.warn(`Could not remove temporary clipboard images from ${directory}: ${formatError(error)}`);
  }
}

function readTerminalClipboardText(
  nativeClipboard = clipboard,
  fileSystem = fs,
  imageDirectory = null
) {
  const paths = readClipboardFilePaths(nativeClipboard, fileSystem);
  const imagePaths = paths.length === 0
    ? [readClipboardImagePath(nativeClipboard, fileSystem, imageDirectory)].filter(Boolean)
    : [];
  const terminalPaths = paths.concat(imagePaths);
  return terminalPaths.length > 0
    ? formatClipboardFilePaths(terminalPaths)
    : (typeof nativeClipboard?.readText === "function" ? nativeClipboard.readText() : "");
}

// Single-instance: focus the existing window instead of launching a second app.
async function onReady() {
  const reusedBridge = await probeServer();
  if (!reusedBridge) {
    startServer();
  } else {
    // A healthy detached bridge can be reused by this Electron window.
  }
  try {
    await waitForServer();
  } catch (err) {
    dialog.showErrorBox("MultiTerm", formatError(err));
    app.quit();
    return;
  }
  createWindow();
  createTray();

  registerScriptPicker();
  registerCloseHandler();
  registerClipboardIpc();
  registerWindowIpc();
  registerAdminIpc();
  registerUpdateIpc();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

// Native "browse for a script" dialog for the renderer's run-script feature.
function registerScriptPicker() {
  if (!ipcMain || typeof ipcMain.handle !== "function") return;
  for (const channel of ["multiterm:pick-script", "multiterm:pick-folder"]) {
    try { ipcMain.removeHandler(channel); } catch { /* no existing handler */ }
  }
  ipcMain.handle("multiterm:pick-script", async (event) => {
    assertTrustedIpcSender(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select a script to run",
      properties: ["openFile"],
      filters: [
        { name: "Scripts", extensions: ["ps1", "bat", "cmd"] },
        { name: "PowerShell", extensions: ["ps1"] },
        { name: "Batch", extensions: ["bat", "cmd"] },
        { name: "All files", extensions: ["*"] }
      ]
    });
    if (!result || result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
      return null;
    } else {
      return result.filePaths[0];
    }
  });
  ipcMain.handle("multiterm:pick-folder", async (event, initialDirectory) => {
    assertTrustedIpcSender(event);
    let defaultPath;
    try {
      const candidate = path.resolve(String(initialDirectory || "").trim());
      if (fs.statSync(candidate).isDirectory()) {
        defaultPath = candidate;
      } else {
        defaultPath = undefined;
      }
    } catch { /* start in the native dialog's default location */ }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Select a working directory",
      properties: ["openDirectory"],
      ...(defaultPath ? { defaultPath } : {})
    });
    if (!result || result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
      return null;
    } else {
      return result.filePaths[0];
    }
  });
}

// Elevation (administrator) IPC: whole-window elevation ("Restart as
// Administrator") plus reporting whether this process is already elevated.
function registerAdminIpc() {
  if (!ipcMain || typeof ipcMain.handle !== "function") return;
  for (const channel of ["multiterm:is-elevated", "multiterm:relaunch-as-admin"]) {
    try { ipcMain.removeHandler(channel); } catch { /* no existing handler */ }
  }
  ipcMain.handle("multiterm:is-elevated", async (event) => {
    assertTrustedIpcSender(event);
    await ensureElevationChecked();
    return appIsElevated;
  });
  ipcMain.handle("multiterm:relaunch-as-admin", (event) => {
    assertTrustedIpcSender(event);
    const ok = relaunchAsAdmin();
    if (!ok) {
      /* relaunch unsupported or failed — keep the current window running */
    } else {
      app.isQuiting = true;
      setTimeout(() => app.quit(), 600);
    }
    return ok;
  });
}

// Detect whether this process is already elevated. `net session` succeeds only
// for administrators; run once and cache. Skipped off Windows and in tests
// (only invoked from the is-elevated IPC, which tests never call).
function ensureElevationChecked() {
  return new Promise((resolve) => {
    if (elevationChecked || process.platform !== "win32") { elevationChecked = true; resolve(); return; }
    elevationChecked = true;
    try {
      childProcess.exec("net session", { windowsHide: true, timeout: 4000 }, (error) => {
        if (!error) {
          appIsElevated = true;
        } else {
          // A failed probe means the process is not elevated.
        }
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

// Relaunch the whole app elevated (one UAC prompt); every terminal in the new
// window is then an administrator terminal.
function relaunchAsAdmin() {
  if (process.platform !== "win32") return false;
  try {
    const exe = process.execPath;
    const args = process.argv.slice(1);
    const argList = args.length ? args.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(",") : "";
    const startArgs = argList ? `-ArgumentList ${argList} ` : "";
    const psCommand = `$env:PORT='${PORT}'; $env:MULTITERM_ELEVATED='1'; Start-Process -FilePath '${exe.replace(/'/g, "''")}' ${startArgs}-WorkingDirectory '${__dirname.replace(/'/g, "''")}' -Verb RunAs`;
    childProcess.spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Update checker
//
// MultiTerm ships as a GitHub release with a single Windows installer asset, so
// the update flow is: read the latest release from the GitHub API, compare its
// tag against the running version, then (on request) download the installer and
// hand off to it. There is no auto-update framework here on purpose — the
// installer is what actually replaces the app.
// ---------------------------------------------------------------------------
const UPDATE_REPO = process.env.MULTITERM_UPDATE_REPO || "andrewtheart/multiterm-workbench";
const UPDATE_API_BASE = process.env.MULTITERM_UPDATE_API || "https://api.github.com";
const LATEST_RELEASE_URL = `${UPDATE_API_BASE}/repos/${UPDATE_REPO}/releases/latest`;
const RELEASE_PAGE_URL = `https://github.com/${UPDATE_REPO}/releases/latest`;
const UPDATE_USER_AGENT = "MultiTerm-Workbench";
const UPDATE_TIMEOUT_MS = 20000;
const MAX_UPDATE_REDIRECTS = 5;
const DEFAULT_MAX_INSTALLER_SIZE_MB = 256;

function installerSizeLimitBytes(value) {
  const requested = Math.round(Number(value));
  let megabytes;
  if (Number.isFinite(requested) && requested > 0) {
    megabytes = requested;
  } else {
    megabytes = DEFAULT_MAX_INSTALLER_SIZE_MB;
  }
  const bytes = megabytes * 1024 * 1024;
  return Number.isSafeInteger(bytes) ? bytes : DEFAULT_MAX_INSTALLER_SIZE_MB * 1024 * 1024;
}

// Numeric-segment version compare (1 = a is newer). Release tags are plain
// `vMAJOR.MINOR.PATCH`, so a full semver parser would be dead weight; any
// trailing pre-release digits simply sort after the release they follow.
function compareVersions(a, b) {
  const parse = (value) => String(value ?? "")
    .trim()
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) {
      return l > r ? 1 : -1;
    } else {
      // Equal segments defer the decision to the next version segment.
    }
  }
  return 0;
}

function getCurrentVersion() {
  try {
    if (app && typeof app.getVersion === "function") {
      const version = app.getVersion();
      if (version) {
        return String(version);
      } else {
        // Before Electron is ready, fall through to package metadata.
      }
    }
  } catch {
    /* not running under Electron (tests) — fall back to package.json */
  }
  return require("./package.json").version;
}

// GET that follows GitHub's redirects (release assets live on a CDN) and
// resolves with the still-unread response stream.
function openHttpsStream(url, { accept } = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = https.get(url, {
        headers: {
          "User-Agent": UPDATE_USER_AGENT,
          Accept: accept || "application/vnd.github+json"
        }
      }, (response) => {
        const status = response.statusCode || 0;
        const location = response.headers?.location;
        if (status >= 300 && status < 400 && location) {
          response.resume();
          if (redirects >= MAX_UPDATE_REDIRECTS) {
            reject(new Error("Too many redirects while contacting GitHub."));
            return;
          }
          // Release downloads redirect to a CDN host, so the target host cannot be
          // pinned — but the transport can. Without this an attacker who could
          // influence the redirect would get the installer fetched in cleartext.
          const next = new URL(location, url);
          if (next.protocol !== "https:") {
            reject(new Error("Refusing to follow a redirect away from HTTPS."));
            return;
          } else {
            // HTTPS redirects may proceed to the trusted transport checks.
          }
          resolve(openHttpsStream(next.toString(), { accept }, redirects + 1));
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`GitHub returned HTTP ${status}.`));
          return;
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      reject(err);
      return;
    }
    request.on("error", reject);
    request.setTimeout(UPDATE_TIMEOUT_MS, () => {
      request.destroy(new Error("Timed out contacting GitHub."));
    });
  });
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    let body = "";
    stream.setEncoding?.("utf8");
    stream.on("data", (chunk) => { body += chunk; });
    stream.on("error", reject);
    stream.on("end", () => resolve(body));
  });
}

// A release can carry portable zips and checksums alongside the installer, so
// prefer the setup executable and fall back to any .exe.
function pickInstallerAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const executables = list.filter((asset) => /\.exe$/i.test(asset?.name || "") && asset?.browser_download_url);
  const installer = executables.find((asset) => /setup|install/i.test(asset.name)) || executables[0];
  if (!installer) {
    return null;
  } else {
    return {
      digest: typeof installer.digest === "string" ? installer.digest.toLowerCase() : "",
      name: installer.name,
      url: installer.browser_download_url,
      size: Number(installer.size) || 0
    };
  }
}

function normalizeRelease(data) {
  const tag = String(data?.tag_name || "");
  return {
    tag,
    version: tag.replace(/^v/i, ""),
    name: data?.name || tag,
    notes: typeof data?.body === "string" ? data.body : "",
    url: data?.html_url || RELEASE_PAGE_URL,
    publishedAt: data?.published_at || "",
    asset: pickInstallerAsset(data?.assets)
  };
}

async function fetchLatestRelease() {
  const stream = await openHttpsStream(LATEST_RELEASE_URL);
  const body = await readStream(stream);
  return normalizeRelease(JSON.parse(body));
}

async function checkForUpdate() {
  const release = await fetchLatestRelease();
  const current = getCurrentVersion();
  return {
    ok: true,
    current,
    available: Boolean(release.version) && compareVersions(release.version, current) > 0,
    release,
    releasePage: RELEASE_PAGE_URL
  };
}

function isAllowedInstallerAsset(asset, maxInstallerSizeMb = DEFAULT_MAX_INSTALLER_SIZE_MB) {
  if (!asset) {
    return false;
  } else if (typeof asset.url !== "string") {
    return false;
  } else {
    try {
      const parsed = new URL(asset.url);
      const releasePrefix = `/${UPDATE_REPO}/releases/download/`.toLowerCase();
      const urlName = decodeURIComponent(path.posix.basename(parsed.pathname));
      const size = Number(asset.size);
      return parsed.protocol === "https:"
        && parsed.hostname === "github.com"
        && parsed.port === ""
        && parsed.username === ""
        && parsed.password === ""
        && parsed.search === ""
        && parsed.hash === ""
        && parsed.pathname.toLowerCase().startsWith(releasePrefix)
        && /\.exe$/i.test(urlName)
        && (asset.name === undefined || asset.name === urlName)
        && Number.isSafeInteger(size)
        && size > 0
        && size <= installerSizeLimitBytes(maxInstallerSizeMb)
        && typeof asset.digest === "string"
        && /^sha256:[a-f0-9]{64}$/i.test(asset.digest);
    } catch {
      return false;
    }
  }
}

// Streams the installer into the temp folder, reporting progress so the renderer
// can show a determinate bar.
function downloadUpdate(asset, onProgress, maxInstallerSizeMb = DEFAULT_MAX_INSTALLER_SIZE_MB) {
  if (!asset || !asset.url) {
    return Promise.reject(new Error("This release does not include a Windows installer."));
  } else if (!/^https:\/\//i.test(asset.url)) {
    return Promise.reject(new Error("Refusing to download an installer over an insecure URL."));
  } else if (!isAllowedInstallerAsset(asset, maxInstallerSizeMb)) {
    return Promise.reject(new Error("Refusing to download an installer from an untrusted release URL."));
  } else {
    // A trusted HTTPS installer can proceed to the streamed download.
  }

  let tempDir;
  try {
    tempDir = app.getPath("temp");
  } catch {
    tempDir = os.tmpdir();
  }
  const safeName = String(asset.name || "MultiTerm-Setup.exe").replace(/[^\w.-]+/g, "_");
  // Land the installer in a fresh, unguessable directory. A fixed name directly in
  // the shared temp folder is predictable, so any other process running as this user
  // could pre-create or swap the file between this download and runInstaller() and
  // have MultiTerm execute it for them.
  const downloadDir = fs.mkdtempSync(path.join(tempDir, "multiterm-update-"));
  const target = path.join(downloadDir, safeName);
  const expectedSize = Number(asset.size);
  const expectedDigest = String(asset.digest).toLowerCase();
  const maxInstallerSize = installerSizeLimitBytes(maxInstallerSizeMb);

  return openHttpsStream(asset.url, { accept: "application/octet-stream" }).then((response) => (
    new Promise((resolve, reject) => {
      const responseSize = Number(response.headers?.["content-length"]);
      const total = Number.isFinite(responseSize) && responseSize > 0 ? responseSize : expectedSize;
      if (total > maxInstallerSize || (responseSize > 0 && responseSize !== expectedSize)) {
        response.resume();
        fs.rm(downloadDir, { recursive: true, force: true }, () => {
          reject(new Error("The installer download size does not match trusted release metadata."));
        });
        return;
      }

      let received = 0;
      let settled = false;
      const hash = crypto.createHash("sha256");
      const file = fs.createWriteStream(target);
      const fail = (err) => {
        if (settled) {
          return;
        } else {
          settled = true;
          try {
            response.unpipe?.(file);
          } catch {
            // The stream was already detached.
          }
          try {
            file.destroy();
          } catch {
            // The file was already closed.
          }
          fs.rm(downloadDir, { recursive: true, force: true }, () => reject(err));
        }
      };
      response.on("data", (chunk) => {
        received += chunk.length;
        if (received > maxInstallerSize || received > expectedSize) {
          fail(new Error("The installer download exceeded trusted release metadata."));
          return;
        } else {
          hash.update(chunk);
          if (typeof onProgress === "function") {
            onProgress({ received, total });
          } else {
            // Progress reporting is optional.
          }
        }
      });
      response.on("error", fail);
      file.on("error", fail);
      file.on("finish", () => {
        if (settled) {
          return;
        } else {
          const actualDigest = `sha256:${hash.digest("hex")}`;
          if (received !== expectedSize || actualDigest !== expectedDigest) {
            fail(new Error("The installer failed SHA-256 integrity verification."));
            return;
          }
          settled = true;
          resolve(target);
        }
      });
      response.pipe(file);
    })
  ));
}

// Hands off to the downloaded installer. Spawned detached so it survives the
// app quitting out from under it (the installer replaces these very files).
function runInstaller(filePath) {
  if (!filePath) {
    return false;
  } else {
    try {
      const child = childProcess.spawn(filePath, [], { detached: true, stdio: "ignore" });
      child.unref();
      return true;
    } catch {
      try {
        shell.openPath(filePath);
        return true;
      } catch {
        return false;
      }
    }
  }
}

function sendUpdateProgress(payload) {
  const wc = mainWindow?.webContents;
  if (wc && typeof wc.send === "function" && !wc.isDestroyed?.()) {
    wc.send("multiterm:update-progress", payload);
  }
}

function registerUpdateIpc() {
  if (!ipcMain || typeof ipcMain.handle !== "function") return;
  for (const channel of ["multiterm:check-update", "multiterm:download-update", "multiterm:open-release"]) {
    try { ipcMain.removeHandler(channel); } catch { /* no existing handler */ }
  }

  ipcMain.handle("multiterm:check-update", async (event) => {
    assertTrustedIpcSender(event);
    try {
      return await checkForUpdate();
    } catch (err) {
      return { ok: false, error: formatError(err), current: getCurrentVersion(), releasePage: RELEASE_PAGE_URL };
    }
  });

  ipcMain.handle("multiterm:download-update", async (event, asset, maxInstallerSizeMb) => {
    assertTrustedIpcSender(event);
    let lastEmit = 0;
    try {
      const file = await downloadUpdate(asset, ({ received, total }) => {
        // Throttle: a 100 MB installer would otherwise flood the renderer.
        const now = Date.now();
        if (received < total && now - lastEmit < 150) {
          return;
        } else {
          lastEmit = now;
          sendUpdateProgress({ received, total });
        }
      }, maxInstallerSizeMb);
      sendUpdateProgress({ received: 1, total: 1, done: true });
      const started = runInstaller(file);
      if (started) {
        app.isQuiting = true;
        setTimeout(() => app.quit(), 1200);
        return { ok: true, path: file };
      } else {
        return { ok: false, path: file, error: "Downloaded, but the installer could not be launched." };
      }
    } catch (err) {
      return { ok: false, error: formatError(err) };
    }
  });

  ipcMain.handle("multiterm:open-release", async (event, url) => {
    assertTrustedIpcSender(event);
    const target = typeof url === "string" && /^https:\/\/github\.com\//i.test(url) ? url : RELEASE_PAGE_URL;
    try {
      await shell.openExternal(target);
      return true;
    } catch {
      return false;
    }
  });
}

function bootstrap() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  } else {
    // Continue bootstrapping the sole application instance.
  }

  // Perf (Electron guideline #8): disable the default application menu *before*
  // the app is ready so Electron never builds it. We ship a frameless-feeling,
  // menu-less tool, so this shaves startup work.
  Menu.setApplicationMenu(null);

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      } else {
        // The visible window only needs focus.
      }
      mainWindow.focus();
    } else {
      // Readiness has not created the first window yet.
    }
  });

  app.whenReady().then(onReady);

  app.on("before-quit", () => {
    app.isQuiting = true;
    if (bridgeHandledForQuit) {
      // The renderer's quit flow already chose whether the bridge should survive.
    } else {
      stopServer();
    }
    cleanupClipboardImages();
    if (!tray) {
      /* no tray to tear down */
    } else {
      try { tray.destroy(); } catch { /* already gone */ }
      tray = null;
    }
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}

module.exports = {
  startServer,
  stopServer,
  waitForServer,
  createWindow,
  createTray,
  requestCloseDecision,
  showMainWindow,
  quitApp,
  requestServerShutdown,
  requestWatchdogSuppression,
  probeServer,
  handleCloseResponse,
  registerCloseHandler,
  registerClipboardIpc,
  registerWindowIpc,
  decodeNullSeparatedClipboardPaths,
  decodeWindowsFileDrop,
  decodeClipboardUriList,
  readWindowsClipboardFileDrop,
  readClipboardFilePaths,
  formatClipboardFilePaths,
  getClipboardImageDirectory,
  persistClipboardImage,
  readClipboardImagePath,
  cleanupClipboardImages,
  readTerminalClipboardText,
  registerAdminIpc,
  registerUpdateIpc,
  configureChromiumCommandLine,
  compareVersions,
  getCurrentVersion,
  pickInstallerAsset,
  normalizeRelease,
  openHttpsStream,
  readStream,
  fetchLatestRelease,
  checkForUpdate,
  isAllowedInstallerAsset,
  installerSizeLimitBytes,
  DEFAULT_MAX_INSTALLER_SIZE_MB,
  downloadUpdate,
  runInstaller,
  sendUpdateProgress,
  ensureElevationChecked,
  relaunchAsAdmin,
  onReady,
  bootstrap,
  __setElectron,
  __setRuntimeDiagnostics(diagnostics) {
    runtimeDiagnostics = diagnostics;
  },
  formatError,
  isInternalUrl,
  isAllowedExternalUrl,
  isTrustedIpcSender,
  getMainWindow: () => mainWindow,
  getTray: () => tray,
  getServerProcess: () => serverProcess,
  __reset() {
    mainWindow = null;
    tray = null;
    serverProcess = null;
    bridgeHandledForQuit = false;
    serverRestarts = [];
    appIsElevated = false;
    elevationChecked = false;
    cleanupClipboardImages();
  }
};

/* v8 ignore next 3 -- only executes when Electron loads main.js as the entry point */
if (process.versions.electron && process.type === "browser") {
  bootstrap();
}
