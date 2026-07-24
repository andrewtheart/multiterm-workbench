let { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require("electron");
const childProcess = require("node:child_process");
const http = require("node:http");
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

let mainWindow = null;
let serverProcess = null;

// The bridge uses node-pty (a native module built for the system Node ABI),
// so it runs under the system `node` executable rather than inside Electron's
// runtime, whose Node ABI differs from the installed prebuilt binary.
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
