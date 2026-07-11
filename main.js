const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 3177);

let mainWindow = null;
let serverProcess = null;

// The bridge uses node-pty (a native module built for the system Node ABI),
// so it runs under the system `node` executable rather than inside Electron's
// runtime, whose Node ABI differs from the installed prebuilt binary.
function startServer() {
  const nodeExe = process.platform === "win32" ? "node.exe" : "node";
  serverProcess = spawn(nodeExe, [path.join(__dirname, "server.js")], {
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
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
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
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // No default application menu — keeps it feeling like a native tool, not a browser.
    Menu.setApplicationMenu(null);
    startServer();
    try {
      await waitForServer();
    } catch (err) {
      dialog.showErrorBox("MultiTerm", String(err.message || err));
      app.quit();
      return;
    }
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("before-quit", () => {
    app.isQuiting = true;
    stopServer();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
