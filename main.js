let { app, BrowserWindow, Menu, Tray, shell, dialog, ipcMain } = require("electron");
const childProcess = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

// Allows tests to inject fake Electron bindings; outside the Electron runtime
// `require("electron")` resolves to a path string, so these are set by tests.
function __setElectron(mock) {
  ({ app, BrowserWindow, Menu, Tray, shell, dialog, ipcMain } = mock);
}

function formatError(err) {
  return String(err.message || err);
}

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3177);

// Chromium force-loses the oldest WebGL context once ~16 are live, and xterm's
// WebGL addon leaves a pane with no renderer when its context dies. Raising the
// ceiling keeps terminal renderers from competing with each other (and with the
// app's other canvases) on machines running many panes. app.js still enforces its
// own, lower budget, so this is headroom rather than something we depend on.
if (app?.commandLine?.appendSwitch) {
  app.commandLine.appendSwitch("max-active-webgl-contexts", "64");
}

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
function startServer() {
  const nodeExe = process.platform === "win32" ? "node.exe" : "node";
  serverProcess = childProcess.spawn(nodeExe, [path.join(__dirname, "server.js")], {
    cwd: __dirname,
    env: { ...process.env, HOST, PORT: String(PORT), MEMSTATS: "1" },
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
      preload: path.join(__dirname, "preload.js")
    }
  });

  // Open external links in the user's default browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://${HOST}`) || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

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
  }
  ipcMain.on("multiterm:close-response", (_event, action) => {
    handleCloseResponse(action);
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
  registerAdminIpc();

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

function bootstrap() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  // Perf (Electron guideline #8): disable the default application menu *before*
  // the app is ready so Electron never builds it. We ship a frameless-feeling,
  // menu-less tool, so this shaves startup work.
  Menu.setApplicationMenu(null);

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
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
  registerAdminIpc,
  ensureElevationChecked,
  relaunchAsAdmin,
  onReady,
  bootstrap,
  __setElectron,
  formatError,
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
