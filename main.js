let { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require("electron");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

// Allows tests to inject fake Electron bindings; outside the Electron runtime
// `require("electron")` resolves to a path string, so these are set by tests.
function __setElectron(mock) {
  ({ app, BrowserWindow, Menu, shell, dialog, ipcMain } = mock);
}

function formatError(err) {
  return String(err.message || err);
}

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3177);

// Per-launch secrets: UI_TOKEN authenticates the renderer to the bridge for
// elevated operations; RELAY_TOKEN authenticates the elevated helper process.
const UI_TOKEN = crypto.randomBytes(24).toString("hex");
const RELAY_TOKEN = crypto.randomBytes(24).toString("hex");
let appIsElevated = process.env.MULTITERM_ELEVATED === "1";
let elevationChecked = false;

let mainWindow = null;
let serverProcess = null;

// The bridge uses node-pty (a native module built for the system Node ABI),
// so it runs under the system `node` executable rather than inside Electron's
// runtime, whose Node ABI differs from the installed prebuilt binary.
function startServer() {
  const nodeExe = process.platform === "win32" ? "node.exe" : "node";
  serverProcess = childProcess.spawn(nodeExe, [path.join(__dirname, "server.js")], {
    cwd: __dirname,
    env: { ...process.env, HOST, PORT: String(PORT), MEMSTATS: "1", UI_TOKEN, RELAY_TOKEN },
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
    if (code && code !== 0 && !app.isQuiting) {
      dialog.showErrorBox("MultiTerm", `The terminal bridge exited unexpectedly (code ${code}).`);
    }
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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Single-instance: focus the existing window instead of launching a second app.
async function onReady() {
  // No default application menu — keeps it feeling like a native tool, not a browser.
  Menu.setApplicationMenu(null);
  startServer();
  try {
    await waitForServer();
  } catch (err) {
    dialog.showErrorBox("MultiTerm", formatError(err));
    app.quit();
    return;
  }
  createWindow();

  registerScriptPicker();
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

// Elevation (administrator) IPC: whole-window elevation (restart as admin) and
// the on-demand elevated helper for per-pane admin terminals.
function registerAdminIpc() {
  if (!ipcMain || typeof ipcMain.handle !== "function") return;
  for (const channel of ["multiterm:is-elevated", "multiterm:get-ui-token", "multiterm:relaunch-as-admin", "multiterm:spawn-admin-bridge"]) {
    try { ipcMain.removeHandler(channel); } catch { /* no existing handler */ }
  }
  ipcMain.handle("multiterm:is-elevated", async () => { await ensureElevationChecked(); return appIsElevated; });
  ipcMain.handle("multiterm:get-ui-token", () => UI_TOKEN);
  ipcMain.handle("multiterm:relaunch-as-admin", () => {
    const ok = relaunchAsAdmin();
    if (ok) {
      app.isQuiting = true;
      setTimeout(() => app.quit(), 600);
    }
    return ok;
  });
  ipcMain.handle("multiterm:spawn-admin-bridge", () => spawnAdminBridge());
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

// Approach A: relaunch the whole app elevated (one UAC prompt); every terminal
// in the new window is then an administrator terminal.
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

// Approach B: spawn an elevated helper (UAC prompt) that hosts admin ptys and
// relays their I/O back to the bridge. The helper only connects OUT (never
// listens) and authenticates with a one-time token written to a user-ACL'd file.
function spawnAdminBridge() {
  if (process.platform !== "win32") return { ok: false, reason: "Elevated terminals are only supported on Windows." };
  try {
    const tokenFile = path.join(os.tmpdir(), `multiterm-relay-${crypto.randomBytes(10).toString("hex")}.token`);
    fs.writeFileSync(tokenFile, RELAY_TOKEN, { encoding: "utf8", mode: 0o600 });
    // Best-effort: restrict the token file to the current user only.
    try {
      childProcess.execSync(`icacls "${tokenFile}" /inheritance:r /grant:r "%USERNAME%":F`, { windowsHide: true, stdio: "ignore" });
    } catch { /* ACL hardening is best-effort */ }

    const serverPath = path.join(__dirname, "server.js");
    const relayUrl = `ws://${HOST}:${PORT}/ws`;
    const psCommand = [
      "$env:RELAY_MODE='1';",
      `$env:RELAY_URL='${relayUrl}';`,
      `$env:RELAY_TOKEN_FILE='${tokenFile.replace(/'/g, "''")}';`,
      `Start-Process -FilePath 'node.exe' -ArgumentList '${serverPath.replace(/'/g, "''")}' -WorkingDirectory '${__dirname.replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden`
    ].join(" ");
    childProcess.spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function bootstrap() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

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
  onReady,
  bootstrap,
  __setElectron,
  formatError,
  getMainWindow: () => mainWindow,
  getServerProcess: () => serverProcess,
  __reset() {
    mainWindow = null;
    serverProcess = null;
  }
};

/* v8 ignore next 3 -- only executes when Electron loads main.js as the entry point */
if (process.versions.electron && process.type === "browser") {
  bootstrap();
}
