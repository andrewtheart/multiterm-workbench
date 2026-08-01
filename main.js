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
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");

// Allows tests to inject fake Electron bindings; outside the Electron runtime
// `require("electron")` resolves to a path string, so these are set by tests.
function __setElectron(mock) {
  ({ app, BrowserWindow, Menu, Tray, clipboard, shell, dialog, ipcMain } = mock);
}

function formatError(err) {
  return String(err.message || err);
}

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3177);

// Whether a URL points back at the app's own local origin. Used to allow internal
// navigations/window-opens while routing everything else to the default browser.
function isInternalUrl(url) {
  return typeof url === "string"
    && (url.startsWith(`http://${HOST}`) || url.startsWith("http://localhost"));
}

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
// Timestamps of recent unexpected bridge restarts, used as a crash-loop guard so
// a bridge that dies immediately over and over surfaces an error instead of
// respawning forever.
let serverRestarts = [];
const RESTART_WINDOW_MS = 10000;
const MAX_RESTARTS = 5;

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
    env: { ...process.env, HOST, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProcess.stdout.on("data", (d) => process.stdout.write(`[bridge] ${d}`));
  serverProcess.stderr.on("data", (d) => process.stderr.write(`[bridge] ${d}`));
  serverProcess.on("error", (err) => {
    if (!app.isQuiting) {
      dialog.showErrorBox(
        "MultiTerm",
        `Could not start the terminal bridge. Ensure Node.js is installed and on PATH.\n\n${err.message}`
      );
    }
  });
  serverProcess.on("exit", (code) => {
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
      dialog.showErrorBox(
        "MultiTerm",
        `The terminal bridge keeps exiting unexpectedly (code ${code}). Giving up after ${serverRestarts.length} restart attempts.`
      );
      return;
    }
    serverRestarts.push(now);
    startServer();
  });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function waitForServer(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: HOST, port: PORT, path: "/health", timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
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
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Pin the top-level frame to the app's own origin. Nothing in MultiTerm should
  // navigate away; a stray navigation to a remote page (e.g. from injected markup
  // or a mis-handled link) would otherwise hand that page the renderer context.
  // Legitimate external links are routed to the default browser instead.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(String(url))) {
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
      wc.send("multiterm:close-request");
    } else {
      // No renderer to ask — fall back to the safe default of docking to tray.
      // The user can still quit from the tray menu.
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
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

// Explicit, user-initiated quit: bypasses the tray-docking close interception.
function quitApp() {
  app.isQuiting = true;
  app.quit();
}

// System-tray icon with Show / Quit actions, so a tray-docked app stays reachable.
function createTray() {
  if (tray || !Tray) return tray;
  tray = new Tray(path.join(__dirname, "public", "favicon.ico"));
  tray.setToolTip("MultiTerm Workbench");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show MultiTerm", click: () => showMainWindow() },
    { type: "separator" },
    { label: "Quit MultiTerm", click: () => quitApp() }
  ]));
  tray.on("click", () => showMainWindow());
  tray.on("double-click", () => showMainWindow());
  return tray;
}

// Applies the renderer's close decision: dock to tray, quit, or stay open.
function handleCloseResponse(action) {
  if (action === "quit") {
    quitApp();
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
  ipcMain.on("multiterm:close-response", (_event, action) => {
    handleCloseResponse(action);
  });
  ipcMain.on("multiterm:focus-window", () => {
    showMainWindow();
  });
}

function registerClipboardIpc() {
  if (!ipcMain || typeof ipcMain.handle !== "function" || !clipboard?.writeText) return;
  try { ipcMain.removeHandler("multiterm:write-clipboard"); } catch { /* no existing handler */ }
  ipcMain.handle("multiterm:write-clipboard", (event, text) => {
    const sender = event?.sender;
    const senderFrame = event?.senderFrame;
    const senderUrl = senderFrame?.url || sender?.getURL?.();
    let trustedOrigin = false;
    try {
      const expectedOrigin = new URL(`http://${HOST}:${PORT}`).origin;
      trustedOrigin = new URL(senderUrl).origin === expectedOrigin;
    } catch {
      trustedOrigin = false;
    }
    if (!mainWindow
        || sender !== mainWindow.webContents
        || (senderFrame && sender.mainFrame && senderFrame !== sender.mainFrame)
        || !trustedOrigin) {
      throw new Error("Clipboard writes are restricted to the MultiTerm application window.");
    }
    if (typeof text !== "string") {
      throw new TypeError("Clipboard text must be a string.");
    }
    clipboard.writeText(text);
    return true;
  });
}

// Single-instance: focus the existing window instead of launching a second app.
async function onReady() {
  startServer();
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
  try { ipcMain.removeHandler("multiterm:pick-script"); } catch { /* no existing handler */ }
  ipcMain.handle("multiterm:pick-script", async () => {
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
    }
    return result.filePaths[0];
  });
}

// Elevation (administrator) IPC: whole-window elevation ("Restart as
// Administrator") plus reporting whether this process is already elevated.
function registerAdminIpc() {
  if (!ipcMain || typeof ipcMain.handle !== "function") return;
  for (const channel of ["multiterm:is-elevated", "multiterm:relaunch-as-admin"]) {
    try { ipcMain.removeHandler(channel); } catch { /* no existing handler */ }
  }
  ipcMain.handle("multiterm:is-elevated", async () => { await ensureElevationChecked(); return appIsElevated; });
  ipcMain.handle("multiterm:relaunch-as-admin", () => {
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
        if (!error) appIsElevated = true;
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
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}

function getCurrentVersion() {
  try {
    if (app && typeof app.getVersion === "function") {
      const version = app.getVersion();
      if (version) return String(version);
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
          resolve(openHttpsStream(new URL(location, url).toString(), { accept }, redirects + 1));
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`GitHub returned HTTP ${status}.`));
          return;
        }
        resolve(response);
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

// Streams the installer into the temp folder, reporting progress so the renderer
// can show a determinate bar.
function downloadUpdate(asset, onProgress) {
  if (!asset || !asset.url) {
    return Promise.reject(new Error("This release does not include a Windows installer."));
  }
  if (!/^https:\/\//i.test(asset.url)) {
    return Promise.reject(new Error("Refusing to download an installer over an insecure URL."));
  }

  let tempDir;
  try {
    tempDir = app.getPath("temp");
  } catch {
    tempDir = os.tmpdir();
  }
  const safeName = String(asset.name || "MultiTerm-Setup.exe").replace(/[^\w.-]+/g, "_");
  const target = path.join(tempDir, safeName);

  return openHttpsStream(asset.url, { accept: "application/octet-stream" }).then((response) => (
    new Promise((resolve, reject) => {
      const total = Number(response.headers?.["content-length"]) || Number(asset.size) || 0;
      let received = 0;
      const file = fs.createWriteStream(target);
      const fail = (err) => {
        try { file.destroy(); } catch { /* already closed */ }
        fs.unlink(target, () => reject(err));
      };
      response.on("data", (chunk) => {
        received += chunk.length;
        if (typeof onProgress === "function") onProgress({ received, total });
      });
      response.on("error", fail);
      file.on("error", fail);
      file.on("finish", () => resolve(target));
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

  ipcMain.handle("multiterm:check-update", async () => {
    try {
      return await checkForUpdate();
    } catch (err) {
      return { ok: false, error: formatError(err), current: getCurrentVersion(), releasePage: RELEASE_PAGE_URL };
    }
  });

  ipcMain.handle("multiterm:download-update", async (_event, asset) => {
    let lastEmit = 0;
    try {
      const file = await downloadUpdate(asset, ({ received, total }) => {
        // Throttle: a 100 MB installer would otherwise flood the renderer.
        const now = Date.now();
        if (total && received < total && now - lastEmit < 150) return;
        lastEmit = now;
        sendUpdateProgress({ received, total });
      });
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

  ipcMain.handle("multiterm:open-release", async (_event, url) => {
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
    stopServer();
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
  showMainWindow,
  quitApp,
  handleCloseResponse,
  registerCloseHandler,
  registerClipboardIpc,
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
  downloadUpdate,
  runInstaller,
  sendUpdateProgress,
  ensureElevationChecked,
  relaunchAsAdmin,
  onReady,
  bootstrap,
  __setElectron,
  formatError,
  isInternalUrl,
  getMainWindow: () => mainWindow,
  getTray: () => tray,
  getServerProcess: () => serverProcess,
  __reset() {
    mainWindow = null;
    tray = null;
    serverProcess = null;
    serverRestarts = [];
    appIsElevated = false;
    elevationChecked = false;
  }
};

/* v8 ignore next 3 -- only executes when Electron loads main.js as the entry point */
if (process.versions.electron && process.type === "browser") {
  bootstrap();
}
