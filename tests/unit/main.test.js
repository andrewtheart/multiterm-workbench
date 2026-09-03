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

const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const inheritedPort = process.env.PORT;
process.env.PORT = "3177";
let main;
try {
  main = require("../../src/main.js");
} finally {
  if (inheritedPort === undefined) delete process.env.PORT;
  else process.env.PORT = inheritedPort;
}

let electron;
let diagnostics;

function makeElectron() {
  const app = {
    requestSingleInstanceLock: vi.fn(() => true),
    quit: vi.fn(),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    isQuiting: false
  };
  const BrowserWindow = vi.fn();
  BrowserWindow.getAllWindows = vi.fn(() => []);
  const Tray = vi.fn(function TrayMock() {
    return {
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      on: vi.fn(),
      destroy: vi.fn()
    };
  });
  return {
    app,
    BrowserWindow,
    Tray,
    Menu: {
      setApplicationMenu: vi.fn(),
      buildFromTemplate: vi.fn((template) => ({ __template: template }))
    },
    clipboard: {
      availableFormats: vi.fn(() => []),
      readBuffer: vi.fn(() => Buffer.alloc(0)),
      readImage: vi.fn(() => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) })),
      readText: vi.fn(() => ""),
      writeText: vi.fn()
    },
    shell: { openExternal: vi.fn() },
    dialog: {
      showErrorBox: vi.fn(),
      showMessageBox: vi.fn(async () => ({ response: 0, checkboxChecked: false }))
    },
    ipcMain: {
      handle: vi.fn(),
      removeHandler: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
      removeAllListeners: vi.fn()
    }
  };
}

function makeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = vi.fn(function kill() { this.killed = true; });
  return child;
}

function sendHealthyResponse(callback, overrides = {}) {
  const response = new EventEmitter();
  response.statusCode = 200;
  response.resume = vi.fn();
  response.setEncoding = vi.fn();
  callback(response);
  process.nextTick(() => {
    response.emit("data", JSON.stringify({
      app: "MultiTerm Workbench",
      pid: 1234,
      port: 3177,
      ...overrides
    }));
    response.emit("end");
  });
}

function makeWindow() {
  return {
    webContents: {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
      session: {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn()
      }
    },
    loadURL: vi.fn(),
    loadFile: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isDestroyed: vi.fn(() => false),
    isFullScreen: vi.fn(() => true),
    minimize: vi.fn(),
    restore: vi.fn(),
    setFullScreen: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    destroy: vi.fn()
  };
}

function wcHandlerFor(win, event) {
  const call = win.webContents.on.mock.calls.find(([name]) => name === event);
  return call && call[1];
}

function winHandlerFor(win, event) {
  const call = win.on.mock.calls.find(([name]) => name === event);
  return call && call[1];
}

function handlerFor(event) {
  const call = electron.app.on.mock.calls.find(([name]) => name === event);
  return call && call[1];
}

function trustedIpcEvent() {
  const webContents = main.getMainWindow().webContents;
  const mainFrame = { url: "http://127.0.0.1:3177/" };
  webContents.mainFrame = mainFrame;
  return { sender: webContents, senderFrame: mainFrame };
}

beforeEach(() => {
  vi.restoreAllMocks();
  electron = makeElectron();
  main.__setElectron(electron);
  diagnostics = {
    append: vi.fn(),
    configure: vi.fn((settings) => settings)
  };
  main.__setRuntimeDiagnostics(diagnostics);
  electron.BrowserWindow.mockImplementation(function BrowserWindowMock() { return makeWindow(); });
  vi.spyOn(childProcess, "spawn").mockImplementation(() => makeChild());
  main.__reset();
  main.__setBridgeChooserPresenter(async (candidates) => ({
    action: candidates.length > 0 ? "connect" : "new",
    index: 0,
    remember: false
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startServer", () => {
  it("spawns the bridge under node.exe on Windows and captures its lifecycle and output", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      main.startServer();
      expect(childProcess.spawn).toHaveBeenCalledWith("node.exe", expect.arrayContaining([expect.stringContaining("server.js")]), expect.objectContaining({ env: expect.objectContaining({
        MULTITERM_UI_OWNER_PID: String(process.pid),
        PORT: expect.any(String)
      }), stdio: ["ignore", "pipe", "pipe"] }));
      const child = main.getServerProcess();
      child.stdout.emit("data", Buffer.from("hello"));
      child.stderr.emit("data", Buffer.from("warn"));
      expect(diagnostics.append).toHaveBeenCalledWith(expect.objectContaining({
        source: "electron",
        event: "bridge-spawn"
      }));
      expect(diagnostics.append).toHaveBeenCalledWith(expect.objectContaining({
        event: "bridge-stdout",
        level: "info",
        message: "hello"
      }));
      expect(diagnostics.append).toHaveBeenCalledWith(expect.objectContaining({
        event: "bridge-stderr",
        level: "error",
        message: "warn"
      }));
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  });

  it("uses node on non-Windows platforms", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    try {
      main.startServer();
      expect(childProcess.spawn).toHaveBeenCalledWith("node", expect.any(Array), expect.any(Object));
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  });

  it("shows an error box when the bridge fails to start and the app is not quitting", () => {
    main.startServer();
    main.getServerProcess().emit("error", new Error("spawn failed"));
    expect(electron.dialog.showErrorBox).toHaveBeenCalledWith("MultiTerm", expect.stringContaining("spawn failed"));
  });

  it("stays silent on spawn error while quitting", () => {
    electron.app.isQuiting = true;
    main.startServer();
    main.getServerProcess().emit("error", new Error("ignored"));
    expect(electron.dialog.showErrorBox).not.toHaveBeenCalled();
  });

  it("restarts the bridge after an unexpected exit", () => {
    main.startServer();
    const first = main.getServerProcess();
    first.emit("exit", 1);
    expect(electron.dialog.showErrorBox).not.toHaveBeenCalled();
    expect(childProcess.spawn).toHaveBeenCalledTimes(2);
    const restarted = main.getServerProcess();
    expect(restarted).not.toBeNull();
    expect(restarted).not.toBe(first);
    expect(diagnostics.append).toHaveBeenCalledWith(expect.objectContaining({
      event: "bridge-exit",
      code: 1
    }));
    expect(diagnostics.append).toHaveBeenCalledWith(expect.objectContaining({
      event: "bridge-restart",
      attempt: 1
    }));
  });

  it("gives up and reports after repeated crash-looping exits", () => {
    main.startServer();
    // Each unexpected exit restarts the bridge until the crash-loop guard trips.
    for (let i = 0; i < 6; i += 1) {
      const child = main.getServerProcess();
      child.emit("exit", 1);
    }
    expect(electron.dialog.showErrorBox).toHaveBeenCalledWith(
      "MultiTerm",
      expect.stringContaining("keeps exiting unexpectedly")
    );
  });

  it("does not report a clean exit", () => {
    main.startServer();
    main.getServerProcess().emit("exit", 0);
    expect(electron.dialog.showErrorBox).not.toHaveBeenCalled();
  });

  it("does not report an exit while quitting", () => {
    main.startServer();
    electron.app.isQuiting = true;
    main.getServerProcess().emit("exit", 1);
    expect(electron.dialog.showErrorBox).not.toHaveBeenCalled();
  });
});

describe("stopServer", () => {
  it("kills a running child and clears the reference", () => {
    main.startServer();
    const child = main.getServerProcess();
    main.stopServer();
    expect(child.kill).toHaveBeenCalled();
    expect(main.getServerProcess()).toBeNull();
  });

  it("is a no-op when there is no child", () => {
    expect(() => main.stopServer()).not.toThrow();
  });

  it("is a no-op when the child is already killed", () => {
    main.startServer();
    const child = main.getServerProcess();
    child.killed = true;
    main.stopServer();
    expect(child.kill).not.toHaveBeenCalled();
  });
});

describe("waitForServer", () => {
  it("resolves when the health endpoint responds", async () => {
    vi.spyOn(http, "get").mockImplementation((opts, cb) => {
      const req = new EventEmitter();
      req.destroy = vi.fn();
      sendHealthyResponse(cb);
      return req;
    });
    await expect(main.waitForServer()).resolves.toBeUndefined();
  });

  it("rejects a health response without a valid bridge PID", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1000).mockReturnValue(999999);
    vi.spyOn(http, "get").mockImplementation((opts, cb) => {
      const req = new EventEmitter();
      req.destroy = vi.fn();
      sendHealthyResponse(cb, { pid: 0 });
      return req;
    });
    await expect(main.waitForServer()).rejects.toThrow("did not become ready");
  });

  it("rejects after the deadline passes on repeated errors", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1000).mockReturnValue(999999);
    vi.spyOn(http, "get").mockImplementation(() => {
      const req = new EventEmitter();
      req.destroy = vi.fn();
      process.nextTick(() => req.emit("error", new Error("ECONNREFUSED")));
      return req;
    });
    await expect(main.waitForServer()).rejects.toThrow("did not become ready");
  });

  it("retries on timeout then resolves", async () => {
    vi.useFakeTimers();
    let attempt = 0;
    vi.spyOn(http, "get").mockImplementation((opts, cb) => {
      const req = new EventEmitter();
      req.destroy = vi.fn((error) => process.nextTick(() => req.emit("error", error)));
      attempt += 1;
      if (attempt === 1) {
        process.nextTick(() => req.emit("timeout"));
      } else {
        sendHealthyResponse(cb);
      }
      return req;
    });
    const promise = main.waitForServer();
    await vi.advanceTimersByTimeAsync(250);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("createWindow", () => {
  it("recognizes only internal app URLs", () => {
    expect(main.isInternalUrl("http://127.0.0.1:3177/index.html")).toBe(true);
    expect(main.isInternalUrl("http://localhost:3177/x")).toBe(true);
    expect(main.isInternalUrl("http://127.0.0.1.evil.example:3177/x")).toBe(false);
    expect(main.isInternalUrl("http://localhost.evil.example:3177/x")).toBe(false);
    expect(main.isInternalUrl("http://127.0.0.1:9999/x")).toBe(false);
    expect(main.isInternalUrl("https://example.com")).toBe(false);
    expect(main.isInternalUrl("file:///etc/passwd")).toBe(false);
    expect(main.isInternalUrl(undefined)).toBe(false);
    expect(main.isInternalUrl(null)).toBe(false);
  });

  it("allows only HTTPS URLs to leave the Electron window", () => {
    expect(main.isAllowedExternalUrl("https://example.com/path")).toBe(true);
    expect(main.isAllowedExternalUrl("http://example.com/path")).toBe(false);
    expect(main.isAllowedExternalUrl("file:///C:/Windows/System32/calc.exe")).toBe(false);
    expect(main.isAllowedExternalUrl("ms-settings:privacy")).toBe(false);
    expect(main.isAllowedExternalUrl("not a URL")).toBe(false);
    expect(main.isAllowedExternalUrl(null)).toBe(false);
  });

  it("creates the window, routes external links, and clears on close", () => {
    main.createWindow();
    const win = main.getMainWindow();
    expect(win.loadURL).toHaveBeenCalledWith(expect.stringContaining("http://127.0.0.1"));

    const openHandler = win.webContents.setWindowOpenHandler.mock.calls[0][0];
    expect(openHandler({ url: "http://127.0.0.1:3177/x" })).toEqual({ action: "allow" });
    expect(openHandler({ url: "http://localhost:3177/x" })).toEqual({ action: "allow" });
    expect(openHandler({ url: "https://example.com" })).toEqual({ action: "deny" });
    expect(electron.shell.openExternal).toHaveBeenCalledWith("https://example.com");

    electron.shell.openExternal.mockClear();
    expect(openHandler({ url: "file:///C:/Windows/System32/calc.exe" })).toEqual({ action: "deny" });
    expect(openHandler({ url: "ms-settings:privacy" })).toEqual({ action: "deny" });
    expect(electron.shell.openExternal).not.toHaveBeenCalled();

    const closedHandler = win.on.mock.calls.find(([e]) => e === "closed")[1];
    closedHandler();
    expect(main.getMainWindow()).toBeNull();
  });

  it("reports native fullscreen changes to the renderer", () => {
    main.createWindow();
    const win = main.getMainWindow();
    winHandlerFor(win, "enter-full-screen")();
    winHandlerFor(win, "leave-full-screen")();
    expect(win.webContents.send.mock.calls).toEqual([
      ["multiterm:fullscreen-change", true],
      ["multiterm:fullscreen-change", false]
    ]);
  });

  it("runs the renderer sandboxed with node integration off", () => {
    main.createWindow();
    const options = electron.BrowserWindow.mock.calls[0][0];
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      backgroundThrottling: false,
      sandbox: true
    });

  });

  it("blocks off-origin navigation and opens external links in the browser", () => {
    main.createWindow();
    const win = main.getMainWindow();
    const onNavigate = wcHandlerFor(win, "will-navigate");
    expect(onNavigate).toBeTypeOf("function");

    // Internal navigations are left alone.
    const internal = { preventDefault: vi.fn() };
    onNavigate(internal, "http://127.0.0.1:3177/index.html");
    expect(internal.preventDefault).not.toHaveBeenCalled();
    expect(electron.shell.openExternal).not.toHaveBeenCalled();

    // A remote http(s) navigation is cancelled and handed to the default browser.
    const external = { preventDefault: vi.fn() };
    onNavigate(external, "https://evil.example/pwn");
    expect(external.preventDefault).toHaveBeenCalled();
    expect(electron.shell.openExternal).toHaveBeenCalledWith("https://evil.example/pwn");

    // A non-http scheme is cancelled but never opened externally.
    electron.shell.openExternal.mockClear();
    const scheme = { preventDefault: vi.fn() };
    onNavigate(scheme, "file:///etc/passwd");
    expect(scheme.preventDefault).toHaveBeenCalled();
    expect(electron.shell.openExternal).not.toHaveBeenCalled();
  });

  it("denies every web permission request", () => {
    main.createWindow();
    const win = main.getMainWindow();
    const handler = win.webContents.session.setPermissionRequestHandler.mock.calls[0][0];
    const callback = vi.fn();
    handler({}, "media", callback);
    expect(callback).toHaveBeenCalledWith(false);
  });

  it("answers synchronous permission checks with clipboard-only, same-origin access", () => {
    main.createWindow();
    const win = main.getMainWindow();
    const check = win.webContents.session.setPermissionCheckHandler.mock.calls[0][0];
    expect(check({}, "clipboard-read", "http://127.0.0.1:3177")).toBe(true);
    expect(check({}, "clipboard-sanitized-write", "http://127.0.0.1:3177")).toBe(true);
    // Anything else, and anything asking from another origin, is refused.
    expect(check({}, "media", "http://127.0.0.1:3177")).toBe(false);
    expect(check({}, "clipboard-read", "https://evil.example")).toBe(false);
  });

  it("tolerates a session without a permission-handler API", () => {
    electron.BrowserWindow.mockImplementationOnce(function BrowserWindowMock() {
      const win = makeWindow();
      win.webContents.session = {};
      return win;
    });
    expect(() => main.createWindow()).not.toThrow();
  });
});

describe("window IPC", () => {
  function fullscreenHandler() {
    return electron.ipcMain.handle.mock.calls
      .find(([channel]) => channel === "multiterm:set-fullscreen")?.[1];
  }

  function minimizeHandler() {
    return electron.ipcMain.handle.mock.calls
      .find(([channel]) => channel === "multiterm:minimize-window")?.[1];
  }

  function diagnosticsHandler() {
    return electron.ipcMain.handle.mock.calls
      .find(([channel]) => channel === "multiterm:configure-diagnostics")?.[1];
  }

  it("allows only the app renderer to change native fullscreen", () => {
    main.createWindow();
    const win = main.getMainWindow();
    let fullscreen = false;
    win.setFullScreen.mockImplementation((enabled) => { fullscreen = enabled; });
    win.isFullScreen.mockImplementation(() => fullscreen);
    main.registerWindowIpc();

    const event = trustedIpcEvent();
    expect(fullscreenHandler()(event, 1)).toBe(true);
    expect(fullscreenHandler()(event, 0)).toBe(false);
    expect(win.setFullScreen.mock.calls).toEqual([[true], [false]]);
    expect(() => fullscreenHandler()({
      sender: win.webContents,
      senderFrame: { url: "https://example.com/" }
    }, true)).toThrow("restricted to the MultiTerm application window");
  });

  it("falls back to the requested state and tolerates handler replacement failures", () => {
    main.createWindow();
    const win = main.getMainWindow();
    win.isFullScreen = undefined;
    electron.ipcMain.removeHandler.mockImplementation(() => { throw new Error("missing"); });
    expect(() => main.registerWindowIpc()).not.toThrow();
    expect(fullscreenHandler()(trustedIpcEvent(), true)).toBe(true);
  });

  it("allows only the app renderer to minimize the native window", () => {
    main.createWindow();
    const win = main.getMainWindow();
    main.registerWindowIpc();
    expect(minimizeHandler()(trustedIpcEvent())).toBe(true);
    expect(win.minimize).toHaveBeenCalledOnce();
    expect(() => minimizeHandler()({
      sender: win.webContents,
      senderFrame: { url: "https://example.com/" }
    })).toThrow("restricted to the MultiTerm application window");
  });

  it("applies diagnostics settings only from the app renderer", () => {
    main.createWindow();
    main.registerWindowIpc();
    const settings = { retentionDays: 30, rotationMb: 20, viewerEntries: 7500 };
    expect(diagnosticsHandler()(trustedIpcEvent(), settings)).toEqual(settings);
    expect(diagnostics.configure).toHaveBeenCalledWith(settings);
    expect(() => diagnosticsHandler()({ sender: {} }, settings))
      .toThrow("restricted to the MultiTerm application window");
  });

  it("is unavailable when ipcMain.handle is missing", () => {
    main.__setElectron({ ...electron, ipcMain: null });
    expect(() => main.registerWindowIpc()).not.toThrow();
  });
});

describe("tray + close-to-tray", () => {
  function bootReady() {
    vi.spyOn(http, "get").mockImplementation((opts, cb) => {
      const req = new EventEmitter();
      req.destroy = vi.fn();
      sendHealthyResponse(cb);
      return req;
    });
    return main.onReady();
  }

  it("creates a tray with tooltip, menu, and click-to-restore", async () => {
    await bootReady();
    expect(electron.Tray).toHaveBeenCalledWith(expect.stringContaining("favicon.ico"));
    const tray = main.getTray();
    expect(tray.setToolTip).toHaveBeenCalledWith("MultiTerm Workbench");
    expect(electron.Menu.buildFromTemplate).toHaveBeenCalled();
    expect(tray.setContextMenu).toHaveBeenCalled();

    // The tray's Show item and click both restore the window to the foreground.
    const template = electron.Menu.buildFromTemplate.mock.calls[0][0];
    const showItem = template.find((item) => item.label === "Show MultiTerm");
    const win = main.getMainWindow();
    win.isMinimized.mockReturnValue(true);
    showItem.click();
    expect(win.restore).toHaveBeenCalled();
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();

    const clickHandler = tray.on.mock.calls.find(([e]) => e === "click")[1];
    win.show.mockClear();
    clickHandler();
    expect(win.show).toHaveBeenCalled();
  });

  it("opens the same close decision from the tray menu", async () => {
    await bootReady();
    const template = electron.Menu.buildFromTemplate.mock.calls[0][0];
    const quitItem = template.find((item) => item.label === "Quit MultiTerm");
    const win = main.getMainWindow();
    quitItem.click();
    expect(win.show).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith("multiterm:close-request", "tray");
    expect(electron.app.quit).not.toHaveBeenCalled();
  });

  it("intercepts the window close and asks the renderer instead of quitting", () => {
    main.createWindow();
    const win = main.getMainWindow();
    const closeHandler = winHandlerFor(win, "close");
    const event = { preventDefault: vi.fn() };
    closeHandler(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith("multiterm:close-request", "window");
  });

  it("allows the close through when the app is already quitting", () => {
    main.createWindow();
    const win = main.getMainWindow();
    electron.app.isQuiting = true;
    const closeHandler = winHandlerFor(win, "close");
    const event = { preventDefault: vi.fn() };
    closeHandler(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it("falls back to hiding when the renderer is gone", () => {
    main.createWindow();
    const win = main.getMainWindow();
    win.webContents.isDestroyed.mockReturnValue(true);
    const closeHandler = winHandlerFor(win, "close");
    closeHandler({ preventDefault: vi.fn() });
    expect(win.webContents.send).not.toHaveBeenCalled();
    expect(win.hide).toHaveBeenCalled();
  });

  it("registers a close-response listener that hides, keeps the bridge, or stays", async () => {
    await bootReady();
    const onCall = electron.ipcMain.on.mock.calls.find(([e]) => e === "multiterm:close-response");
    expect(onCall).toBeTruthy();
    const listener = onCall[1];
    const win = main.getMainWindow();
    const event = trustedIpcEvent();

    listener(event, "tray");
    expect(win.hide).toHaveBeenCalled();

    const keepResponse = new EventEmitter();
    keepResponse.statusCode = 200;
    keepResponse.resume = vi.fn();
    const keepRequest = new EventEmitter();
    keepRequest.end = vi.fn(() => {
      http.request.mock.calls.at(-1)[1](keepResponse);
    });
    keepRequest.destroy = vi.fn();
    vi.spyOn(http, "request").mockReturnValue(keepRequest);

    listener(event, "quitKeep");
    expect(electron.app.isQuiting).toBe(true);
    expect(http.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/watchdog/keep",
      headers: { "X-MultiTerm-Request": "Launcher" }
    }), expect.any(Function));
    expect(electron.app.quit).not.toHaveBeenCalled();

    keepResponse.emit("end");
    expect(electron.app.quit).toHaveBeenCalled();

    win.hide.mockClear();
    electron.app.quit.mockClear();
    listener(event, "cancel");
    expect(win.hide).not.toHaveBeenCalled();
    expect(electron.app.quit).not.toHaveBeenCalled();
  });

  it("requests graceful bridge shutdown before destructive quit", () => {
    const response = new EventEmitter();
    response.statusCode = 200;
    response.resume = vi.fn();
    const request = new EventEmitter();
    request.end = vi.fn(() => {
      http.request.mock.calls[0][1](response);
      response.emit("end");
    });
    request.destroy = vi.fn();
    vi.spyOn(http, "request").mockReturnValue(request);
    main.startServer();

    main.quitApp(true);

    expect(http.request).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      path: "/shutdown",
      headers: { "X-MultiTerm-Request": "Launcher" }
    }), expect.any(Function));
    expect(electron.app.quit).toHaveBeenCalled();

    electron.app.whenReady.mockReturnValue(new Promise(() => {}));
    main.bootstrap();
    expect(() => handlerFor("before-quit")()).not.toThrow();
  });

  it("restores and focuses the window for notification clicks", async () => {
    await bootReady();
    const onCall = electron.ipcMain.on.mock.calls.find(([e]) => e === "multiterm:focus-window");
    expect(onCall).toBeTruthy();
    const win = main.getMainWindow();
    win.isMinimized.mockReturnValue(true);

    onCall[1](trustedIpcEvent());

    expect(win.restore).toHaveBeenCalled();
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it("destroys the tray on before-quit", () => {
    // Keep whenReady pending so bootstrap only registers handlers (no onReady).
    electron.app.whenReady.mockReturnValue(new Promise(() => {}));
    main.createTray();
    const tray = main.getTray();
    main.bootstrap();
    const beforeQuit = handlerFor("before-quit");
    beforeQuit();
    expect(tray.destroy).toHaveBeenCalled();
    expect(main.getTray()).toBeNull();
  });

  it("still clears the tray reference when native tray destruction throws", () => {
    electron.app.whenReady.mockReturnValue(new Promise(() => {}));
    main.createTray();
    const tray = main.getTray();
    tray.destroy.mockImplementation(() => { throw new Error("already destroyed"); });
    main.bootstrap();

    expect(() => handlerFor("before-quit")()).not.toThrow();
    expect(main.getTray()).toBeNull();
  });
});

describe("onReady", () => {
  it("boots the server and window on success", async () => {
    let attempts = 0;
    vi.spyOn(http, "get").mockImplementation((opts, cb) => {
      const req = new EventEmitter();
      req.destroy = vi.fn();
      attempts += 1;
      if (attempts === 1) process.nextTick(() => req.emit("error", new Error("not started")));
      else sendHealthyResponse(cb);
      return req;
    });
    await main.onReady();
    expect(childProcess.spawn).toHaveBeenCalled();
    expect(main.getMainWindow()).not.toBeNull();

    const activate = handlerFor("activate");
    electron.BrowserWindow.getAllWindows.mockReturnValue([]);
    activate();
    electron.BrowserWindow.getAllWindows.mockReturnValue([{}]);
    activate();
    expect(electron.BrowserWindow).toHaveBeenCalledTimes(2);
  });

  it("reuses a detached MultiTerm bridge instead of spawning into its port", async () => {
    vi.spyOn(http, "get").mockImplementation((opts, cb) => {
      const req = new EventEmitter();
      req.destroy = vi.fn();
      sendHealthyResponse(cb);
      return req;
    });

    await main.onReady();

    expect(childProcess.spawn).not.toHaveBeenCalled();
    expect(main.getMainWindow()).not.toBeNull();
  });

  it("shows an error and quits when the bridge never becomes ready", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1000).mockReturnValue(999999);
    vi.spyOn(http, "get").mockImplementation(() => {
      const req = new EventEmitter();
      req.destroy = vi.fn();
      process.nextTick(() => req.emit("error", new Error("no bridge")));
      return req;
    });
    await main.onReady();
    expect(electron.dialog.showErrorBox).toHaveBeenCalled();
    expect(electron.app.quit).toHaveBeenCalled();
    expect(main.getMainWindow()).toBeNull();
  });
});

describe("bridge startup discovery", () => {
  it("formats IPv4 and IPv6 loopback bridge origins", () => {
    expect(main.bridgeOrigin("127.0.0.1", 3177)).toBe("http://127.0.0.1:3177");
    expect(main.bridgeOrigin("::1", 3177)).toBe("http://[::1]:3177");
  });

  it("normalizes and persists the reversible startup preference", () => {
    const files = new Map();
    const fileSystem = {
      mkdirSync: vi.fn(),
      readFileSync: vi.fn((target) => files.get(target)),
      writeFileSync: vi.fn((target, text) => files.set(target, text)),
      renameSync: vi.fn((from, to) => { files.set(to, files.get(from)); files.delete(from); })
    };
    const target = "C:\\prefs\\bridge-startup.json";
    expect(main.saveBridgeStartupPreference({ askOnStartup: false, mode: "bridge", bridgeId: "BRIDGE-007" }, fileSystem, target))
      .toEqual({ askOnStartup: false, mode: "bridge", bridgeId: "BRIDGE-007", bridgePort: 0 });
    expect(main.loadBridgeStartupPreference(fileSystem, target))
      .toEqual({ askOnStartup: false, mode: "bridge", bridgeId: "BRIDGE-007", bridgePort: 0 });
    expect(main.normalizeBridgeStartupPreference({ askOnStartup: "no", mode: "junk", bridgeId: 9 }))
      .toEqual({ askOnStartup: true, mode: "new", bridgeId: "", bridgePort: 0 });
    expect(main.normalizeBridgeStartupPreference({ mode: "bridge", bridgeId: "x".repeat(80), bridgePort: 65535 }))
      .toEqual({ askOnStartup: true, mode: "bridge", bridgeId: "x".repeat(64), bridgePort: 65535 });
  });

  it("falls back safely when preference and instance paths are unavailable", () => {
    expect(main.bridgePreferencePath({})).toBe("");
    expect(main.loadBridgeStartupPreference({}, ""))
      .toEqual({ askOnStartup: true, mode: "new", bridgeId: "", bridgePort: 0 });
    expect(main.loadBridgeStartupPreference({ readFileSync: () => "{" }, "C:\\bad.json"))
      .toEqual({ askOnStartup: true, mode: "new", bridgeId: "", bridgePort: 0 });
    expect(main.saveBridgeStartupPreference({ askOnStartup: false }, {}, ""))
      .toEqual({ askOnStartup: false, mode: "new", bridgeId: "", bridgePort: 0 });
    expect(main.bridgeInstanceDirectory({})).toBe("");
  });

  it("returns only live, PID-matched loopback bridge records", async () => {
    const records = new Map([
      ["good.json", JSON.stringify({ app: "MultiTerm Workbench", bridgeId: "BRIDGE-002", bridgeType: "installed", pid: 22, port: 3190, startedAt: "2026-08-14T12:00:00Z", url: "http://127.0.0.1:3190/" })],
      ["stale.json", JSON.stringify({ app: "MultiTerm Workbench", bridgeId: "BRIDGE-003", pid: 99, port: 3191, startedAt: "2026-08-14T13:00:00Z", url: "http://127.0.0.1:3191/" })],
      ["remote.json", JSON.stringify({ app: "MultiTerm Workbench", pid: 44, port: 3192, url: "http://example.com:3192/" })],
      ["bad.json", "{not json"]
    ]);
    const fileSystem = {
      readdirSync: vi.fn(() => [...records.keys()].map((name) => ({ name, isFile: () => true }))),
      readFileSync: vi.fn((target) => records.get(path.basename(target)))
    };
    const probe = vi.fn(async (_host, port) => (
      port === 3190 ? { app: "MultiTerm Workbench", pid: 22, port, sessions: 3, rendererClients: 1 } : { app: "MultiTerm Workbench", pid: 55, port }
    ));

    const result = await main.discoverBridgeInstances({ fileSystem, directory: "C:\\instances", probe });

    expect(result).toEqual([expect.objectContaining({
      bridgeId: "BRIDGE-002",
      bridgeType: "installed",
      port: 3190,
      health: expect.objectContaining({ sessions: 3 })
    })]);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("filters invalid instance records and sorts viable loopback variants", async () => {
    const records = new Map([
      ["localhost.json", { app: "MultiTerm Workbench", pid: 10, port: 3200, startedAt: "2026-08-15T13:00:00Z", url: "http://localhost:3200/" }],
      ["ipv6.json", { app: "MultiTerm Workbench", bridgeId: "BRIDGE-V6", bridgeType: "installed", pid: 11, port: 3201, startedAt: "2026-08-15T12:00:00Z", url: "http://[::1]:3201/" }],
      ["default-time.json", { app: "MultiTerm Workbench", bridgeId: "BRIDGE-OLD", pid: 12, port: 3202, url: "http://127.0.0.1:3202/" }],
      ["wrong-app.json", { app: "Other", pid: 20, port: 3220, url: "http://127.0.0.1:3220/" }],
      ["https.json", { app: "MultiTerm Workbench", pid: 21, port: 3221, url: "https://127.0.0.1:3221/" }],
      ["float.json", { app: "MultiTerm Workbench", pid: 22, port: 3222.5, url: "http://127.0.0.1:3222/" }],
      ["zero.json", { app: "MultiTerm Workbench", pid: 23, port: 0, url: "http://127.0.0.1:3223/" }],
      ["high.json", { app: "MultiTerm Workbench", pid: 24, port: 70000, url: "http://127.0.0.1:3224/" }],
      ["mismatch.json", { app: "MultiTerm Workbench", pid: 25, port: 3225, url: "http://127.0.0.1:3226/" }],
      ["missing-url.json", { app: "MultiTerm Workbench", pid: 26, port: 3226 }],
      ["no-health.json", { app: "MultiTerm Workbench", pid: 27, port: 3227, url: "http://127.0.0.1:3227/" }],
      ["stale-pid.json", { app: "MultiTerm Workbench", pid: 28, port: 3228, url: "http://127.0.0.1:3228/" }]
    ]);
    const entries = [
      { name: "folder.json", isFile: () => false },
      { name: "notes.txt", isFile: () => true },
      ...[...records.keys()].map((name) => ({ name, isFile: () => true }))
    ];
    const fileSystem = {
      readdirSync: vi.fn(() => entries),
      readFileSync: vi.fn((target) => JSON.stringify(records.get(path.basename(target))))
    };
    const probe = vi.fn(async (_host, port) => {
      if (port === 3227) return null;
      if (port === 3228) return { pid: 999 };
      return { pid: port === 3200 ? 10 : port === 3201 ? 11 : 12, sessions: 0 };
    });

    await expect(main.discoverBridgeInstances({ fileSystem, directory: "C:\\instances", probe }))
      .resolves.toEqual([
        expect.objectContaining({ bridgeId: "Bridge", bridgeType: "electron", host: "127.0.0.1", port: 3200 }),
        expect.objectContaining({ bridgeId: "BRIDGE-V6", bridgeType: "installed", host: "::1", port: 3201 }),
        expect.objectContaining({ bridgeId: "BRIDGE-OLD", bridgeType: "electron", host: "127.0.0.1", port: 3202, startedAt: "" })
      ]);
    await expect(main.discoverBridgeInstances({
      fileSystem: { readdirSync: () => { throw new Error("denied"); } },
      directory: "C:\\denied"
    })).resolves.toEqual([]);
    await expect(main.discoverBridgeInstances({ directory: "" })).resolves.toEqual([]);
  });

  it("skips an occupied preferred port when starting a separate bridge", async () => {
    let attempts = 0;
    vi.spyOn(net, "createServer").mockImplementation(() => {
      const listener = new EventEmitter();
      listener.listen = vi.fn((_port, _host, callback) => {
        attempts += 1;
        if (attempts === 1) process.nextTick(() => listener.emit("error", new Error("occupied")));
        else callback();
      });
      listener.close = vi.fn((callback) => callback());
      return listener;
    });

    await expect(main.findFreePort(3200)).resolves.toBe(3201);
    expect(attempts).toBe(2);
  });

  it("reports when the local port range is exhausted", async () => {
    await expect(main.findFreePort(65536)).rejects.toThrow("No free local port");
  });

  it("labels a bridge with identity, type, port, and session count", () => {
    expect(main.bridgeChoiceLabel({ bridgeId: "BRIDGE-004", bridgeType: "electron", port: 3200, health: { sessions: 1 } }))
      .toBe("BRIDGE-004 · Electron · port 3200 · 1 session");
    expect(main.bridgeChoiceLabel({ bridgeId: "BRIDGE-005", bridgeType: "installed", port: 3201 }))
      .toBe("BRIDGE-005 · installed · port 3201 · 0 sessions");
  });

  it("offers every live bridge to the custom chooser", async () => {
    const candidate = { bridgeId: "BRIDGE-004", bridgeType: "installed", host: "127.0.0.1", port: 3200, health: { sessions: 2 } };
    const presentChooser = vi.fn(async () => ({ action: "connect", index: 0, remember: false }));
    await expect(main.chooseStartupBridge(
      [candidate],
      { askOnStartup: true, mode: "new", bridgeId: "" },
      { presentChooser }
    ))
      .resolves.toEqual({ candidate, startNew: false, preference: { askOnStartup: true, mode: "new", bridgeId: "" } });
    expect(presentChooser).toHaveBeenCalledWith([candidate]);
  });

  it("asks before starting a new bridge from the manual chooser when no alternative exists", async () => {
    const presentChooser = vi.fn(async () => ({ action: "cancel", remember: false }));
    await expect(main.chooseStartupBridge(
      [],
      { askOnStartup: true, mode: "new", bridgeId: "" },
      { alwaysPrompt: true, presentChooser }
    )).resolves.toMatchObject({ cancelled: true });
    expect(presentChooser).toHaveBeenCalledWith([]);
  });

  it("honors remembered new and existing bridge choices without prompting", async () => {
    const presentChooser = vi.fn();
    const candidate = { bridgeId: "BRIDGE-004", bridgeType: "installed", host: "127.0.0.1", port: 3200, health: { sessions: 2 } };
    await expect(main.chooseStartupBridge(
      [candidate],
      { askOnStartup: false, mode: "bridge", bridgeId: "BRIDGE-004" },
      { presentChooser }
    ))
      .resolves.toEqual({ candidate, startNew: false, preference: { askOnStartup: false, mode: "bridge", bridgeId: "BRIDGE-004" } });
    await expect(main.chooseStartupBridge(
      [candidate],
      { askOnStartup: false, mode: "new", bridgeId: "" },
      { presentChooser }
    ))
      .resolves.toEqual({ candidate: null, startNew: true, preference: { askOnStartup: false, mode: "new", bridgeId: "" } });
    expect(presentChooser).not.toHaveBeenCalled();
  });

  it("falls back to a new bridge when a remembered bridge is gone", async () => {
    await expect(main.chooseStartupBridge([], { askOnStartup: false, mode: "bridge", bridgeId: "BRIDGE-404", bridgePort: 3299 }))
      .resolves.toEqual({ candidate: null, startNew: true, preference: { askOnStartup: false, mode: "bridge", bridgeId: "BRIDGE-404", bridgePort: 3299 } });
    const reusedId = { bridgeId: "BRIDGE-004", bridgeType: "installed", host: "127.0.0.1", port: 3300, health: { sessions: 0 } };
    await expect(main.chooseStartupBridge([reusedId], { askOnStartup: false, mode: "bridge", bridgeId: "BRIDGE-004", bridgePort: 3200 }))
      .resolves.toMatchObject({ candidate: null, startNew: true });
  });

  it("cancels cleanly and persists a remembered bridge choice", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-choice-"));
    electron.app.getPath = vi.fn(() => root);
    const candidate = { bridgeId: "BRIDGE-004", bridgeType: "installed", host: "127.0.0.1", port: 3200, health: { sessions: 2 } };
    const presentChooser = vi.fn()
      .mockResolvedValueOnce({ action: "connect", index: 0, remember: true })
      .mockResolvedValueOnce({ action: "cancel", remember: false });

    const remembered = await main.chooseStartupBridge(
      [candidate],
      { askOnStartup: true, mode: "new", bridgeId: "" },
      { presentChooser }
    );
    expect(remembered).toEqual({
      candidate,
      startNew: false,
      preference: { askOnStartup: false, mode: "bridge", bridgeId: "BRIDGE-004", bridgePort: 3200 }
    });
    expect(main.loadBridgeStartupPreference()).toEqual(remembered.preference);
    await expect(main.chooseStartupBridge(
      [candidate],
      { askOnStartup: true, mode: "new", bridgeId: "" },
      { presentChooser }
    ))
      .resolves.toMatchObject({ cancelled: true });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("uses the selected bridge even when saving a remembered choice fails", async () => {
    electron.app.getPath = vi.fn(() => "Z:\\denied");
    const presentChooser = vi.fn(async () => ({ action: "connect", index: 0, remember: true }));
    const candidate = { bridgeId: "BRIDGE-004", bridgeType: "installed", host: "127.0.0.1", port: 3200, health: { sessions: 2 } };
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => { throw new Error("denied"); });

    await expect(main.chooseStartupBridge(
      [candidate],
      { askOnStartup: true, mode: "new", bridgeId: "", bridgePort: 0 },
      { presentChooser }
    ))
      .resolves.toEqual({
        candidate,
        startNew: false,
        preference: { askOnStartup: true, mode: "new", bridgeId: "", bridgePort: 0 }
      });
  });

  it("remembers a choice to start a new bridge", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-choice-new-"));
    electron.app.getPath = vi.fn(() => root);
    const presentChooser = vi.fn(async () => ({ action: "new", remember: true }));
    try {
      await expect(main.chooseStartupBridge(
        [],
        { askOnStartup: true, mode: "bridge", bridgeId: "BRIDGE-OLD", bridgePort: 3200 },
        { alwaysPrompt: true, presentChooser }
      )).resolves.toEqual({
        candidate: null,
        startNew: true,
        preference: { askOnStartup: false, mode: "new", bridgeId: "", bridgePort: 0 }
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders a sandboxed frameless chooser and accepts only its selected bridge result", async () => {
    const candidates = [
      { bridgeId: "BRIDGE-004", bridgeType: "installed", port: 3200, startedAt: "2026-08-16T10:00:00Z", health: { sessions: 2 } },
      { bridgeId: "BRIDGE-005", bridgeType: "electron", port: 3201, startedAt: "2026-08-16T11:00:00Z", health: { sessions: 1 } }
    ];
    const parentWindow = { isDestroyed: vi.fn(() => false) };

    expect(main.normalizeBridgeChooserResult({ action: "new", remember: 1 }, candidates.length))
      .toEqual({ action: "new", remember: true });
    expect(main.normalizeBridgeChooserResult({ action: "cancel" }, candidates.length))
      .toEqual({ action: "cancel", remember: false });
    expect(main.bridgeChooserWindowOptions(candidates.length, parentWindow))
      .toEqual(expect.objectContaining({ parent: parentWindow, modal: true }));

    const pending = main.showBridgeChooser(candidates, { parentWindow: null });
    const chooser = electron.BrowserWindow.mock.results.at(-1).value;
    await vi.waitFor(() => expect(chooser.show).toHaveBeenCalled());

    expect(electron.BrowserWindow).toHaveBeenLastCalledWith(expect.objectContaining({
      frame: false,
      show: false,
      minHeight: 420,
      webPreferences: expect.objectContaining({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: expect.stringContaining("bridge-chooser-preload.js")
      })
    }));
    expect(chooser.loadFile).toHaveBeenCalledWith(expect.stringContaining("bridge-chooser.html"));
    expect(chooser.webContents.send).toHaveBeenCalledWith("multiterm:bridge-chooser-data", [
      expect.objectContaining({ index: 0, bridgeId: "BRIDGE-004", bridgeType: "installed", port: 3200, sessions: 2 }),
      expect.objectContaining({ index: 1, bridgeId: "BRIDGE-005", bridgeType: "electron", port: 3201, sessions: 1 })
    ]);

    const resultHandler = electron.ipcMain.on.mock.calls
      .find(([channel]) => channel === "multiterm:bridge-chooser-result")[1];
    resultHandler({ sender: {} }, { action: "connect", index: 0, remember: false });
    expect(chooser.destroy).not.toHaveBeenCalled();
    resultHandler({ sender: chooser.webContents }, { action: "connect", index: 9, remember: false });
    expect(chooser.destroy).not.toHaveBeenCalled();
    resultHandler({ sender: chooser.webContents }, { action: "connect", index: 1, remember: true });

    await expect(pending).resolves.toEqual({ action: "connect", index: 1, remember: true });
    expect(chooser.destroy).toHaveBeenCalledOnce();
    expect(electron.ipcMain.removeListener).toHaveBeenCalledWith("multiterm:bridge-chooser-result", resultHandler);
  });

  it("does not detach when no owned bridge exists", async () => {
    await expect(main.detachOwnedBridge()).resolves.toBeUndefined();
  });

  it("maps configured-port health and startup choices without mutating new-bridge choices", () => {
    const candidates = [];
    const health = { pid: 317700, port: 3177, sessions: 2 };
    const configured = main.appendConfiguredBridgeCandidate(health, candidates);
    expect(configured).toEqual(expect.objectContaining({
      bridgeId: "Existing bridge",
      host: "127.0.0.1",
      port: 3177,
      health
    }));
    expect(candidates).toEqual([configured]);
    expect(main.appendConfiguredBridgeCandidate(null, candidates)).toBeNull();
    expect(candidates).toEqual([configured]);

    const chosen = { bridgeId: "BRIDGE-CHOSEN", port: 3299 };
    expect(main.selectStartupBridge({ startNew: true, candidate: chosen }, configured)).toBeNull();
    expect(main.selectStartupBridge({ startNew: false, candidate: chosen }, configured)).toBe(chosen);
    expect(main.selectStartupBridge({ startNew: false, candidate: null }, configured)).toBe(configured);
  });
});

describe("bridge startup preference IPC", () => {
  function bridgeStartupHandler(channel) {
    return electron.ipcMain.handle.mock.calls.find(([registered]) => registered === channel)?.[1];
  }

  it("reads and reverses the startup prompt preference through trusted IPC", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-bridge-pref-"));
    electron.app.getPath = vi.fn(() => root);
    vi.spyOn(http, "get").mockImplementation((_options, callback) => {
      const request = new EventEmitter();
      request.destroy = vi.fn();
      sendHealthyResponse(callback);
      return request;
    });
    await main.onReady();
    const getHandler = bridgeStartupHandler("multiterm:get-bridge-startup-preference");
    const setHandler = bridgeStartupHandler("multiterm:set-bridge-startup-ask");
    const event = trustedIpcEvent();

    expect(getHandler(event)).toMatchObject({ askOnStartup: true });
    expect(setHandler(event, false)).toMatchObject({ askOnStartup: false });
    expect(getHandler(event)).toMatchObject({ askOnStartup: false });
    expect(setHandler(event, true)).toMatchObject({ askOnStartup: true });
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("switches to a discovered bridge and detaches the owned bridge", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-bridge-switch-"));
    electron.app.getPath = vi.fn(() => root);
    const previousLocalAppData = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    const instanceDirectory = path.join(root, "MultiTerm", "Instances");
    fs.mkdirSync(instanceDirectory, { recursive: true });
    fs.writeFileSync(path.join(instanceDirectory, "9009.json"), JSON.stringify({
      app: "MultiTerm Workbench",
      bridgeId: "BRIDGE-009",
      bridgeType: "installed",
      pid: 9009,
      port: 3299,
      startedAt: "2026-08-15T10:00:00Z",
      url: "http://127.0.0.1:3299/"
    }));
    vi.spyOn(http, "get").mockImplementation((options, callback) => {
      const request = new EventEmitter();
      request.destroy = vi.fn();
      sendHealthyResponse(callback, { pid: 9009, port: Number(options.port), sessions: 2 });
      return request;
    });
    vi.spyOn(http, "request").mockImplementation((_options, callback) => {
      const response = new EventEmitter();
      response.resume = vi.fn();
      const request = new EventEmitter();
      request.destroy = vi.fn();
      request.end = vi.fn(() => {
        callback(response);
        process.nextTick(() => response.emit("end"));
      });
      return request;
    });
    main.__setBridgeChooserPresenter(async () => ({ action: "connect", index: 0, remember: false }));
    main.createWindow();
    main.registerWindowIpc();
    main.startServer();
    const ownedBridge = main.getServerProcess();
    ownedBridge.unref = vi.fn();

    try {
      await expect(bridgeStartupHandler("multiterm:choose-bridge-now")(trustedIpcEvent()))
        .resolves.toEqual({ changed: true, host: "127.0.0.1", port: 3299 });
      expect(ownedBridge.unref).toHaveBeenCalled();
      expect(main.getMainWindow().loadURL).toHaveBeenLastCalledWith("http://127.0.0.1:3299/");
      ownedBridge.emit("exit", 1, null);
      expect(childProcess.spawn).toHaveBeenCalledTimes(1);
    } finally {
      if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previousLocalAppData;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("starts a fresh bridge from the manual chooser", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-bridge-new-"));
    const previousLocalAppData = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    const listener = new EventEmitter();
    listener.listen = vi.fn((_port, _host, callback) => callback());
    listener.close = vi.fn((callback) => callback());
    vi.spyOn(net, "createServer").mockReturnValue(listener);
    vi.spyOn(http, "get").mockImplementation((options, callback) => {
      const request = new EventEmitter();
      request.destroy = vi.fn();
      sendHealthyResponse(callback, { port: Number(options.port) });
      return request;
    });
    main.__setBridgeChooserPresenter(async () => ({ action: "new", remember: false }));
    main.createWindow();
    main.registerWindowIpc();

    try {
      await expect(bridgeStartupHandler("multiterm:choose-bridge-now")(trustedIpcEvent()))
        .resolves.toEqual({ changed: true, host: "127.0.0.1", port: 3177 });
      expect(childProcess.spawn).toHaveBeenCalledOnce();
      expect(main.getMainWindow().loadURL).toHaveBeenLastCalledWith("http://127.0.0.1:3177/");
    } finally {
      if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previousLocalAppData;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("excludes the current bridge and leaves it unchanged when the chooser is cancelled", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-bridge-current-"));
    electron.app.getPath = vi.fn(() => root);
    const previousLocalAppData = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    const instanceDirectory = path.join(root, "MultiTerm", "Instances");
    fs.mkdirSync(instanceDirectory, { recursive: true });
    fs.writeFileSync(path.join(instanceDirectory, "3177.json"), JSON.stringify({
      app: "MultiTerm Workbench",
      bridgeId: "BRIDGE-CURRENT",
      pid: 317700,
      port: 3177,
      url: "http://127.0.0.1:3177/"
    }));
    vi.spyOn(http, "get").mockImplementation((options, callback) => {
      const request = new EventEmitter();
      request.destroy = vi.fn();
      sendHealthyResponse(callback, { pid: 317700, port: Number(options.port) });
      return request;
    });
    main.__setBridgeChooserPresenter(async (candidates) => {
      expect(candidates).toEqual([]);
      return { action: "cancel", remember: false };
    });
    main.createWindow();
    main.registerWindowIpc();

    try {
      await expect(bridgeStartupHandler("multiterm:choose-bridge-now")(trustedIpcEvent()))
        .resolves.toEqual({ changed: false, cancelled: true });
      expect(childProcess.spawn).not.toHaveBeenCalled();
      expect(main.getMainWindow().loadURL).toHaveBeenCalledTimes(1);
    } finally {
      if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previousLocalAppData;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("bridge startup selection integration", () => {
  it("quits cleanly when startup bridge selection is cancelled", async () => {
    vi.spyOn(http, "get").mockImplementation((options, callback) => {
      const request = new EventEmitter();
      request.destroy = vi.fn();
      sendHealthyResponse(callback, { port: Number(options.port) });
      return request;
    });
    main.__setBridgeChooserPresenter(async () => ({ action: "cancel", remember: false }));

    await main.onReady();

    expect(electron.app.quit).toHaveBeenCalledOnce();
    expect(main.getMainWindow()).toBeNull();
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it("uses a discovered configured-port bridge without probing it twice before selection", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-default-bridge-"));
    electron.app.getPath = vi.fn(() => root);
    const previousLocalAppData = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    const instanceDirectory = path.join(root, "MultiTerm", "Instances");
    fs.mkdirSync(instanceDirectory, { recursive: true });
    fs.writeFileSync(path.join(instanceDirectory, "317700.json"), JSON.stringify({
      app: "MultiTerm Workbench",
      bridgeId: "BRIDGE-DEFAULT",
      bridgeType: "installed",
      pid: 317700,
      port: 3177,
      url: "http://127.0.0.1:3177/"
    }));
    vi.spyOn(http, "get").mockImplementation((options, callback) => {
      const request = new EventEmitter();
      request.destroy = vi.fn();
      sendHealthyResponse(callback, { pid: 317700, port: Number(options.port) });
      return request;
    });
    main.__setBridgeChooserPresenter(async () => ({ action: "connect", index: 0, remember: false }));

    try {
      await main.onReady();
      expect(http.get).toHaveBeenCalledTimes(2);
      expect(childProcess.spawn).not.toHaveBeenCalled();
      expect(main.getMainWindow().loadURL).toHaveBeenCalledWith("http://127.0.0.1:3177/");
    } finally {
      if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previousLocalAppData;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("loads a selected non-default bridge without spawning another", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-select-"));
    electron.app.getPath = vi.fn(() => root);
    main.__setBridgeChooserPresenter(async () => ({ action: "connect", index: 0, remember: false }));
    const record = { app: "MultiTerm Workbench", bridgeId: "BRIDGE-009", bridgeType: "installed", pid: 9009, port: 3299, startedAt: "2026-08-14T12:00:00Z", url: "http://127.0.0.1:3299/" };
    const previousLocalAppData = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    const expectedDirectory = path.join(process.env.LOCALAPPDATA, "MultiTerm", "Instances");
    fs.mkdirSync(expectedDirectory, { recursive: true });
    fs.writeFileSync(path.join(expectedDirectory, "9009.json"), JSON.stringify(record));
    vi.spyOn(http, "get").mockImplementation((options, callback) => {
      const request = new EventEmitter();
      request.destroy = vi.fn();
      sendHealthyResponse(callback, { pid: 9009, port: Number(options.port), sessions: 2 });
      return request;
    });
    try {
      await main.onReady();
      expect(childProcess.spawn).not.toHaveBeenCalled();
      expect(main.getMainWindow().loadURL).toHaveBeenCalledWith("http://127.0.0.1:3299/");
      electron.app.whenReady.mockReturnValue(new Promise(() => {}));
      main.bootstrap();
      handlerFor("before-quit")();
      expect(childProcess.spawn).not.toHaveBeenCalled();
    } finally {
      if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previousLocalAppData;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("starts a separate bridge when that chooser button is selected", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-new-"));
    electron.app.getPath = vi.fn(() => root);
    main.__setBridgeChooserPresenter(async () => ({ action: "new", remember: false }));
    const record = { app: "MultiTerm Workbench", bridgeId: "BRIDGE-009", bridgeType: "installed", pid: 9009, port: 3299, startedAt: "2026-08-14T12:00:00Z", url: "http://127.0.0.1:3299/" };
    const previousLocalAppData = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    const instanceDirectory = path.join(process.env.LOCALAPPDATA, "MultiTerm", "Instances");
    fs.mkdirSync(instanceDirectory, { recursive: true });
    fs.writeFileSync(path.join(instanceDirectory, "9009.json"), JSON.stringify(record));
    let attempts = 0;
    vi.spyOn(http, "get").mockImplementation((options, callback) => {
      const request = new EventEmitter();
      request.destroy = vi.fn();
      attempts += 1;
      if (Number(options.port) === 3299) sendHealthyResponse(callback, { pid: 9009, port: 3299, sessions: 2 });
      else if (attempts < 3) process.nextTick(() => request.emit("error", new Error("starting")));
      else sendHealthyResponse(callback, { port: Number(options.port) });
      return request;
    });
    try {
      await main.onReady();
      const environment = childProcess.spawn.mock.calls[0][2].env;
      expect(Number(environment.PORT)).toBeGreaterThanOrEqual(3177);
      expect(main.getMainWindow().loadURL).toHaveBeenCalledWith(`http://127.0.0.1:${environment.PORT}/`);
    } finally {
      if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previousLocalAppData;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("on-demand bridge restart for background automations", () => {
  function mockHealth(handler) {
    vi.spyOn(http, "get").mockImplementation((options, callback) => {
      const request = new EventEmitter();
      request.destroy = vi.fn();
      handler(options, callback, request);
      return request;
    });
  }

  it("reports a healthy bridge without spawning another", async () => {
    mockHealth((options, callback) => sendHealthyResponse(callback, { port: Number(options.port) }));
    childProcess.spawn.mockClear();
    await expect(main.ensureBridgeAvailable())
      .resolves.toMatchObject({ ok: true, restarted: false, navigated: false, port: 3177 });
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it("reclaims the same port so the hidden renderer keeps its origin", async () => {
    let started = false;
    mockHealth((options, callback, request) => {
      if (started) sendHealthyResponse(callback, { port: Number(options.port) });
      else process.nextTick(() => request.emit("error", new Error("refused")));
    });
    vi.spyOn(net, "createServer").mockImplementation(() => {
      const listener = new EventEmitter();
      listener.listen = vi.fn((_port, _host, callback) => callback());
      listener.close = vi.fn((callback) => callback());
      return listener;
    });
    childProcess.spawn.mockImplementation(() => { started = true; return makeChild(); });
    main.createWindow();
    const win = main.getMainWindow();
    win.loadURL.mockClear();

    await expect(main.ensureBridgeAvailable())
      .resolves.toMatchObject({ ok: true, restarted: true, navigated: false, port: 3177 });
    expect(childProcess.spawn).toHaveBeenCalled();
    expect(win.loadURL).not.toHaveBeenCalled();
  });

  it("moves the hidden window to a new origin when a real listener holds the port", async () => {
    const squatter = net.createServer();
    await new Promise((resolve, reject) => {
      squatter.once("error", reject);
      squatter.listen(3177, "127.0.0.1", resolve);
    });
    try {
      let startedPort = 0;
      mockHealth((options, callback, request) => {
        if (Number(options.port) === startedPort) sendHealthyResponse(callback, { port: Number(options.port) });
        else process.nextTick(() => request.emit("error", new Error("refused")));
      });
      childProcess.spawn.mockImplementation((_exe, _args, options) => {
        startedPort = Number(options.env.PORT);
        return makeChild();
      });
      main.createWindow();
      const win = main.getMainWindow();
      win.loadURL.mockClear();

      const result = await main.ensureBridgeAvailable();
      expect(result).toMatchObject({ ok: true, restarted: true, navigated: true });
      expect(result.port).toBeGreaterThan(3177);
      expect(win.loadURL).toHaveBeenCalledWith(`http://127.0.0.1:${result.port}/`);
      expect(main.bridgeOrigin()).toBe(`http://127.0.0.1:${result.port}`);
    } finally {
      await new Promise((resolve) => squatter.close(resolve));
    }
  });

  it("waits out a transient holder before giving up the origin", async () => {
    let attempts = 0;
    vi.spyOn(net, "createServer").mockImplementation(() => {
      const listener = new EventEmitter();
      listener.listen = vi.fn((port, _host, callback) => {
        attempts += 1;
        // The first two probes see the port held, the third finds it released.
        if (attempts <= 2 && port === 3177) process.nextTick(() => listener.emit("error", new Error("occupied")));
        else callback();
      });
      listener.close = vi.fn((callback) => callback());
      return listener;
    });

    await expect(main.reclaimBridgePort(3177, "127.0.0.1", 6, 0)).resolves.toBe(3177);
    expect(attempts).toBeGreaterThan(2);
  });

  it("accepts a different port once the holder outlasts every retry", async () => {
    vi.spyOn(net, "createServer").mockImplementation(() => {
      const listener = new EventEmitter();
      listener.listen = vi.fn((port, _host, callback) => {
        if (port === 3177) process.nextTick(() => listener.emit("error", new Error("occupied")));
        else callback();
      });
      listener.close = vi.fn((callback) => callback());
      return listener;
    });

    await expect(main.reclaimBridgePort(3177, "127.0.0.1", 2, 0)).resolves.toBe(3178);
  });

  it("throttles repeated attempts after a failure instead of spawn-looping", async () => {
    mockHealth((_options, _callback, request) => process.nextTick(() => request.emit("error", new Error("refused"))));
    vi.spyOn(net, "createServer").mockImplementation(() => { throw new Error("network is unavailable"); });

    const first = await main.ensureBridgeAvailable();
    expect(first).toMatchObject({ ok: false, error: "network is unavailable" });
    const spawnCalls = childProcess.spawn.mock.calls.length;

    const second = await main.ensureBridgeAvailable();
    expect(second).toMatchObject({ ok: false, throttled: true });
    expect(childProcess.spawn.mock.calls.length).toBe(spawnCalls);
  });

  it("shares one in-flight restart between concurrent callers", async () => {
    mockHealth((options, callback) => sendHealthyResponse(callback, { port: Number(options.port) }));
    const [left, right] = await Promise.all([main.ensureBridgeAvailable(), main.ensureBridgeAvailable()]);
    expect(left).toBe(right);
  });

  it("registers the ensure-bridge channel only when ipcMain can handle invocations", () => {
    main.__setElectron({ ...electron, ipcMain: null });
    expect(() => main.registerEnsureBridgeIpc()).not.toThrow();

    main.__setElectron(electron);
    electron.ipcMain.removeHandler.mockImplementation(() => { throw new Error("no existing handler"); });
    main.registerEnsureBridgeIpc();
    const handler = electron.ipcMain.handle.mock.calls.find(([channel]) => channel === "multiterm:ensure-bridge")[1];
    expect(() => handler({ sender: {}, senderFrame: { url: "https://evil.example" } })).toThrow();
  });
});

describe("background scheduled task and launch lifetime", () => {
  it("recognizes the scheduled task's argv only when the switch is present", () => {
    expect(main.hasBackgroundArgv(["electron.exe", "D:\\multiTerm", "--background"])).toBe(true);
    expect(main.hasBackgroundArgv(["electron.exe", "D:\\multiTerm"])).toBe(false);
    expect(main.hasBackgroundArgv(undefined)).toBe(false);
  });

  it("constructs the window hidden on the scheduled-task path", () => {
    main.__reset();
    main.createWindow();
    expect(electron.BrowserWindow.mock.calls.at(-1)[0]).toMatchObject({ show: true });

    main.__reset();
    main.__setStartedInBackground(true);
    main.createWindow();
    expect(electron.BrowserWindow.mock.calls.at(-1)[0]).toMatchObject({ show: false });
  });

  it("never pulls the window forward when the task launches a second instance", () => {
    main.__reset();
    main.bootstrap();
    const secondInstance = handlerFor("second-instance");
    main.createWindow();
    const win = main.getMainWindow();
    win.isMinimized.mockReturnValue(true);

    secondInstance({}, ["electron.exe", "D:\\multiTerm", "--background"]);
    expect(win.restore).not.toHaveBeenCalled();
    expect(win.focus).not.toHaveBeenCalled();

    secondInstance({}, ["electron.exe", "D:\\multiTerm"]);
    expect(win.restore).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it("clamps the repeat interval and keeps it inside its documented range", () => {
    expect(main.backgroundTaskIntervalMinutes(30)).toBe(30);
    expect(main.backgroundTaskIntervalMinutes(1)).toBe(5);
    expect(main.backgroundTaskIntervalMinutes(99999)).toBe(1440);
    expect(main.backgroundTaskIntervalMinutes("nonsense")).toBe(15);
  });

  it("registers a per-user logon task that repeats and catches up after sleep", () => {
    const xml = main.backgroundTaskXml(20, "CONTOSO\\andre & co", { executable: "C:\\a b\\electron.exe", args: ["D:\\multiTerm", "--background"] });
    expect(xml).toContain("<Interval>PT20M</Interval>");
    expect(xml).toContain("<StartWhenAvailable>true</StartWhenAvailable>");
    expect(xml).toContain("<LogonType>InteractiveToken</LogonType>");
    expect(xml).toContain("<RunLevel>LeastPrivilege</RunLevel>");
    expect(xml).toContain("<UserId>CONTOSO\\andre &amp; co</UserId>");
    expect(xml).toContain("<Command>C:\\a b\\electron.exe</Command>");
    expect(xml).toContain("<Arguments>&quot;D:\\multiTerm&quot; &quot;--background&quot;</Arguments>");
    // Never SYSTEM: the CLI would read config\systemprofile instead of the user's own.
    expect(xml).not.toContain("S-1-5-18");
    expect(xml).not.toContain("HighestAvailable");
  });

  it("omits the repository argument once the app is packaged", () => {
    expect(main.backgroundTaskInvocation(false).args).toEqual([expect.stringContaining("multiTerm"), "--background"]);
    expect(main.backgroundTaskInvocation(true).args).toEqual(["--background"]);
  });

  it("creates the task while a rule wants it and deletes it when the last one clears", () => {
    const calls = [];
    const execute = vi.fn((exe, args) => { calls.push([exe, ...args]); });

    const created = main.syncBackgroundAutomationTask({ enabled: true, intervalMinutes: 20 }, execute);
    expect(created).toMatchObject({ ok: true, action: "created" });
    expect(calls[0].slice(0, 4)).toEqual(["schtasks.exe", "/Create", "/TN", "MultiTerm Background Automations"]);
    expect(calls[0]).toContain("/XML");
    expect(calls[0]).toContain("/F");
    expect(fs.existsSync(calls[0][calls[0].indexOf("/XML") + 1])).toBe(false);

    const removed = main.syncBackgroundAutomationTask({ enabled: false }, execute);
    expect(removed).toMatchObject({ ok: true, action: "removed" });
    expect(calls[1]).toEqual(["schtasks.exe", "/Delete", "/TN", "MultiTerm Background Automations", "/F"]);
  });

  it("reports a refused registration instead of throwing", () => {
    const failure = Object.assign(new Error("Access is denied."), { status: 5 });
    const created = main.syncBackgroundAutomationTask({ enabled: true }, () => { throw failure; });
    expect(created).toMatchObject({ ok: false, action: "created", code: 5, error: "Access is denied." });

    // A delete for a task that was never created is the normal path, not a failure.
    const removed = main.syncBackgroundAutomationTask({ enabled: false }, () => { throw new Error("cannot find the file"); });
    expect(removed).toMatchObject({ ok: true, action: "removed" });

    const staging = vi.spyOn(fs, "mkdtempSync").mockImplementation(() => { throw new Error("no temp"); });
    expect(main.syncBackgroundAutomationTask({ enabled: true }, vi.fn()))
      .toMatchObject({ ok: false, action: "created", error: "no temp" });
    staging.mockRestore();

    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    try {
      expect(main.syncBackgroundAutomationTask({ enabled: true }, vi.fn())).toMatchObject({ action: "unsupported", ok: false });
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  });

  it("retires only a task-started instance, and only before the user opens it", () => {
    main.__reset();
    main.createWindow();
    expect(main.finishBackgroundRun()).toBe(false);
    expect(electron.app.quit).not.toHaveBeenCalled();

    main.__setStartedInBackground(true);
    main.showMainWindow();
    expect(main.finishBackgroundRun()).toBe(false);

    main.__setStartedInBackground(true);
    expect(main.finishBackgroundRun()).toBe(true);
    expect(main.finishBackgroundRun()).toBe(false);
  });

  it("tells the renderer the window is unattended, because Electron keeps the page visible", () => {
    main.__reset();
    expect(main.publishBackgroundWindowState()).toBe(false);

    main.createWindow();
    const win = main.getMainWindow();
    win.webContents.send.mockClear();
    expect(main.windowIsUnattended()).toBe(false);

    main.handleCloseResponse("background");
    expect(main.windowIsUnattended()).toBe(true);
    expect(win.webContents.send).toHaveBeenLastCalledWith("multiterm:background-window", true);

    main.showMainWindow();
    expect(main.windowIsUnattended()).toBe(false);
    expect(win.webContents.send).toHaveBeenLastCalledWith("multiterm:background-window", false);

    // A task-started instance counts even before any close decision.
    main.__setStartedInBackground(true);
    expect(main.windowIsUnattended()).toBe(true);

    win.webContents.isDestroyed.mockReturnValue(true);
    expect(main.publishBackgroundWindowState()).toBe(false);
  });

  it("registers the background channels only when ipcMain can handle invocations", () => {
    main.__setElectron({ ...electron, ipcMain: null });
    expect(() => main.registerBackgroundTaskIpc()).not.toThrow();

    main.__setElectron(electron);
    electron.ipcMain.removeHandler.mockImplementation(() => { throw new Error("no existing handler"); });
    main.registerBackgroundTaskIpc();
    const ipcHandlerFor = (channel) => electron.ipcMain.handle.mock.calls.find(([name]) => name === channel)[1];
    const hostile = { sender: {}, senderFrame: { url: "https://evil.example" } };
    expect(() => ipcHandlerFor("multiterm:sync-background-task")(hostile, { enabled: true })).toThrow();
    expect(() => ipcHandlerFor("multiterm:background-launch")(hostile)).toThrow();
    expect(() => ipcHandlerFor("multiterm:background-window")(hostile)).toThrow();
    expect(() => ipcHandlerFor("multiterm:finish-background-run")(hostile)).toThrow();

    main.__reset();
    main.createWindow();
    main.__setStartedInBackground(true);
    expect(ipcHandlerFor("multiterm:background-launch")(trustedIpcEvent())).toBe(true);
    expect(ipcHandlerFor("multiterm:background-window")(trustedIpcEvent())).toBe(true);
    expect(ipcHandlerFor("multiterm:finish-background-run")(trustedIpcEvent())).toBe(true);
  });
});

describe("formatError", () => {
  it("uses the error message when present", () => {
    expect(main.formatError(new Error("boom"))).toBe("boom");
  });

  it("falls back to the value when there is no message", () => {
    expect(main.formatError("plain string failure")).toBe("plain string failure");
  });
});

describe("Chromium command-line configuration", () => {
  it("raises the WebGL context ceiling when Electron exposes appendSwitch", () => {
    const appendSwitch = vi.fn();
    main.configureChromiumCommandLine({ commandLine: { appendSwitch } });
    expect(appendSwitch).toHaveBeenCalledWith("max-active-webgl-contexts", "64");
  });

  it("is harmless when command-line configuration is unavailable", () => {
    expect(() => main.configureChromiumCommandLine({})).not.toThrow();
    expect(() => main.configureChromiumCommandLine(null)).not.toThrow();
  });
});

describe("showMainWindow / createTray / close handling edge cases", () => {
  it("creates a window when none exists yet", () => {
    main.__reset();
    expect(main.getMainWindow()).toBeNull();
    main.showMainWindow();
    expect(electron.BrowserWindow).toHaveBeenCalledTimes(1);
    expect(main.getMainWindow()).not.toBeNull();
  });

  it("shows and focuses a non-minimized window without restoring it", () => {
    main.createWindow();
    const win = main.getMainWindow();
    win.isMinimized.mockReturnValue(false);
    win.show.mockClear();
    win.focus.mockClear();
    main.showMainWindow();
    expect(win.restore).not.toHaveBeenCalled();
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });

  it("returns the existing tray on a second createTray call", () => {
    const first = main.createTray();
    expect(electron.Tray).toHaveBeenCalledTimes(1);
    const second = main.createTray();
    expect(electron.Tray).toHaveBeenCalledTimes(1); // early return, no new Tray
    expect(second).toBe(first);
  });

  it("does nothing when the platform has no Tray support", () => {
    main.__setElectron({ ...electron, Tray: undefined });
    main.__reset();
    expect(main.createTray()).toBeNull();
    expect(main.getTray()).toBeNull();
  });

  it("restores the window from the tray double-click handler", () => {
    const tray = main.createTray();
    main.createWindow();
    const win = main.getMainWindow();
    const dblClick = tray.on.mock.calls.find(([e]) => e === "double-click")[1];
    win.show.mockClear();
    dblClick();
    expect(win.show).toHaveBeenCalled();
  });

  it("ignores a tray-dock response when there is no window", () => {
    main.__reset();
    expect(() => main.handleCloseResponse("tray")).not.toThrow();
  });

  it("leaves everything alone for an unrecognized close response", () => {
    main.createWindow();
    const win = main.getMainWindow();
    win.hide.mockClear();
    main.handleCloseResponse("something-else");
    expect(win.hide).not.toHaveBeenCalled();
    expect(electron.app.quit).not.toHaveBeenCalled();
  });

  it("hides the window for background mode and advertises it in the tray", () => {
    main.__reset();
    main.createWindow();
    const win = main.getMainWindow();
    electron.Menu.buildFromTemplate.mockClear();
    main.handleCloseResponse("background");

    expect(win.hide).toHaveBeenCalled();
    expect(win.destroy).not.toHaveBeenCalled();
    expect(electron.app.quit).not.toHaveBeenCalled();
    const tray = main.getTray();
    expect(tray.setToolTip).toHaveBeenLastCalledWith("MultiTerm Workbench - running automations in the background");
    const backgroundTemplate = electron.Menu.buildFromTemplate.mock.calls.at(-1)[0];
    expect(backgroundTemplate.find((item) => item.label === "Automations are running in the background"))
      .toMatchObject({ enabled: false });

    electron.Menu.buildFromTemplate.mockClear();
    main.showMainWindow();
    expect(tray.setToolTip).toHaveBeenLastCalledWith("MultiTerm Workbench");
    const clearedTemplate = electron.Menu.buildFromTemplate.mock.calls.at(-1)[0];
    expect(clearedTemplate.some((item) => item.label === "Automations are running in the background")).toBe(false);
  });

  it("tolerates background state changes before a tray exists", () => {
    main.__setElectron({ ...electron, Tray: undefined });
    main.__reset();
    expect(() => main.setBackgroundMode(true)).not.toThrow();
    expect(main.setBackgroundMode(true)).toBe(true);
    expect(main.setBackgroundMode(false)).toBe(false);
    expect(() => main.applyTrayBackgroundState()).not.toThrow();
  });

  it("registerCloseHandler is a no-op without an ipcMain.on", () => {
    main.__setElectron({ ...electron, ipcMain: null });
    expect(() => main.registerCloseHandler()).not.toThrow();
  });

  it("registerCloseHandler wires a listener even without removeAllListeners", () => {
    const on = vi.fn();
    main.__setElectron({ ...electron, ipcMain: { on } });
    main.registerCloseHandler();
    expect(on).toHaveBeenCalledWith("multiterm:close-response", expect.any(Function));
  });
});

describe("clipboard IPC", () => {
  function clipboardHandler(channel) {
    return electron.ipcMain.handle.mock.calls.find(([registered]) => registered === channel)?.[1];
  }

  it("writes validated text through Electron's main-process clipboard", () => {
    main.createWindow();
    const webContents = main.getMainWindow().webContents;
    const mainFrame = { url: "http://127.0.0.1:3177/" };
    webContents.mainFrame = mainFrame;
    main.registerClipboardIpc();
    const registration = electron.ipcMain.handle.mock.calls
      .find(([channel]) => channel === "multiterm:write-clipboard");
    const handler = registration[1];
    const event = { sender: webContents, senderFrame: mainFrame };

    expect(handler(event, "selected text")).toBe(true);
    expect(electron.clipboard.writeText).toHaveBeenCalledWith("selected text");
    expect(() => handler(event, 42)).toThrow("Clipboard text must be a string.");
    expect(() => handler({ sender: webContents, senderFrame: { url: "https://example.com/" } }, "blocked"))
      .toThrow("restricted to the MultiTerm application window");
    expect(() => handler({ sender: {}, senderFrame: mainFrame }, "blocked"))
      .toThrow("restricted to the MultiTerm application window");
  });

  it("reads copied Explorer files as terminal-ready paths", () => {
    main.createWindow();
    const webContents = main.getMainWindow().webContents;
    const mainFrame = { url: "http://127.0.0.1:3177/" };
    webContents.mainFrame = mainFrame;
    const first = "C:\\src\\README.md";
    const second = "C:\\Copilot Files\\notes.txt";
    electron.clipboard.availableFormats.mockReturnValue(["FileNameW"]);
    electron.clipboard.readBuffer.mockReturnValue(
      Buffer.from(`${first}\0${second}\0\0`, "utf16le")
    );
    vi.spyOn(fs, "statSync").mockReturnValue({
      isDirectory: () => false,
      isFile: () => true
    });

    main.registerClipboardIpc();
    const handler = clipboardHandler("multiterm:read-clipboard");
    expect(handler({ sender: webContents, senderFrame: mainFrame }))
      .toBe(`${first} "${second}"`);
    expect(electron.clipboard.readText).not.toHaveBeenCalled();
    expect(() => handler({ sender: webContents, senderFrame: { url: "https://example.com/" } }))
      .toThrow("Clipboard reads are restricted");
  });

  it("decodes CF_HDROP lists and falls back to ordinary text", () => {
    const paths = ["C:\\one.txt", "D:\\two.txt"];
    const payload = Buffer.from(`${paths.join("\0")}\0\0`, "utf16le");
    const drop = Buffer.alloc(20 + payload.length);
    drop.writeUInt32LE(20, 0);
    drop.writeUInt32LE(1, 16);
    payload.copy(drop, 20);

    expect(main.decodeWindowsFileDrop(drop)).toEqual(paths);
    expect(main.decodeWindowsFileDrop(null)).toEqual([]);
    expect(main.decodeWindowsFileDrop(Buffer.alloc(19))).toEqual([]);
    expect(main.decodeNullSeparatedClipboardPaths(null, "utf16le")).toEqual([]);
    expect(main.decodeNullSeparatedClipboardPaths(Buffer.from("x"), "utf8", -1)).toEqual([]);
    expect(main.decodeNullSeparatedClipboardPaths(Buffer.from("x"), "utf8", 1)).toEqual([]);
    const lowOffset = Buffer.alloc(21);
    lowOffset.writeUInt32LE(19, 0);
    expect(main.decodeWindowsFileDrop(lowOffset)).toEqual([]);
    const invalidOffset = Buffer.alloc(20);
    invalidOffset.writeUInt32LE(20, 0);
    expect(main.decodeWindowsFileDrop(invalidOffset)).toEqual([]);
    const ansiPayload = Buffer.from(`${paths.join("\0")}\0\0`, "latin1");
    const ansiDrop = Buffer.alloc(20 + ansiPayload.length);
    ansiDrop.writeUInt32LE(20, 0);
    ansiPayload.copy(ansiDrop, 20);
    expect(main.decodeWindowsFileDrop(ansiDrop)).toEqual(paths);

    const nativeClipboard = {
      availableFormats: () => ["CF_HDROP"],
      readBuffer: () => drop,
      readText: () => "fallback"
    };
    const fileSystem = {
      statSync: (filePath) => ({
        isDirectory: () => filePath === paths[1],
        isFile: () => filePath === paths[0]
      })
    };
    expect(main.readTerminalClipboardText(nativeClipboard, fileSystem))
      .toBe(paths.join(" "));
    expect(main.readTerminalClipboardText({
      availableFormats: () => [],
      readBuffer: () => Buffer.alloc(0),
      readImage: () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) }),
      readText: () => "ordinary text"
    }, fileSystem)).toBe("ordinary text");
    expect(main.readClipboardFilePaths({}, fileSystem)).toEqual([]);
    expect(main.readClipboardFilePaths({
      availableFormats: () => [],
      readBuffer: null
    }, fileSystem)).toEqual([]);
  });

  it("materializes native clipboard images as reusable PNG paths", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-image-paste-unit-"));
    const imageDirectory = path.join(root, "clipboard images");
    const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
    const image = { isEmpty: () => false, toPNG: () => png };
    const nativeClipboard = {
      availableFormats: () => ["Bitmap", "PNG"],
      readBuffer: () => Buffer.alloc(0),
      readImage: () => image,
      readText: vi.fn(() => "unused text")
    };

    try {
      const pasted = main.readTerminalClipboardText(nativeClipboard, fs, imageDirectory);
      expect(pasted).toMatch(/^".+\.png"$/);
      const imagePath = pasted.slice(1, -1);
      expect(fs.readFileSync(imagePath)).toEqual(png);
      expect(main.persistClipboardImage(image, fs, imageDirectory)).toBe(imagePath);
      expect(nativeClipboard.readText).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it("ignores empty or unavailable native clipboard images", () => {
    const imageDirectory = path.join(os.tmpdir(), "unused-multiterm-image-directory");
    expect(main.readClipboardImagePath({}, fs, imageDirectory)).toBe("");
    expect(main.persistClipboardImage(null, fs, imageDirectory)).toBe("");
    expect(main.persistClipboardImage({}, fs, imageDirectory)).toBe("");
    expect(main.persistClipboardImage({ isEmpty: () => true }, fs, imageDirectory)).toBe("");
    expect(main.persistClipboardImage({
      isEmpty: () => false,
      toPNG: () => "not a buffer"
    }, fs, imageDirectory)).toBe("");
    expect(main.persistClipboardImage({
      isEmpty: () => false,
      toPNG: () => Buffer.alloc(0)
    }, fs, imageDirectory)).toBe("");
    expect(main.readTerminalClipboardText({
      availableFormats: () => [],
      readBuffer: () => Buffer.alloc(0),
      readImage: () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) })
    }, fs, imageDirectory)).toBe("");
    expect(fs.existsSync(imageDirectory)).toBe(false);
  });

  it("reuses and cleans its private clipboard image directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-image-lifecycle-unit-"));
    const png = Buffer.from("89504e470d0a1a0a01020304", "hex");
    const image = { isEmpty: () => false, toPNG: () => png };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const fallbackDirectory = main.getClipboardImageDirectory();
      expect(main.getClipboardImageDirectory()).toBe(fallbackDirectory);
      expect(main.persistClipboardImage(image)).toMatch(/clipboard-[a-f0-9]{64}\.png$/);
      main.cleanupClipboardImages();
      expect(fs.existsSync(fallbackDirectory)).toBe(false);

      const targetApp = { getPath: vi.fn(() => root) };
      const appDirectory = main.getClipboardImageDirectory(fs, targetApp);
      expect(appDirectory.startsWith(root)).toBe(true);
      expect(targetApp.getPath).toHaveBeenCalledWith("temp");
      main.cleanupClipboardImages({
        rmSync() { throw new Error("locked"); }
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Could not remove temporary clipboard images"));
      main.cleanupClipboardImages();
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  it("filters malformed, duplicate, missing, and non-file clipboard entries", () => {
    const valid = "C:\\valid.txt";
    const duplicate = "c:\\VALID.txt";
    const special = "C:\\device";
    const missing = "C:\\missing.txt";
    const oversized = `C:\\${"x".repeat(32767)}`;
    const buffer = Buffer.from(
      `${valid}\0${duplicate}\0${special}\0${missing}\0${oversized}\0\0`,
      "utf16le"
    );
    const fileSystem = {
      statSync(filePath) {
        if (filePath === missing) throw new Error("missing");
        return {
          isDirectory: () => false,
          isFile: () => filePath !== special
        };
      }
    };
    const paths = main.readClipboardFilePaths({
      availableFormats: () => ["FileNameW"],
      readBuffer: () => buffer
    }, fileSystem);

    expect(paths).toEqual([valid]);
    expect(main.formatClipboardFilePaths([
      "C:\\plain.txt",
      "C:\\with space.txt",
      'C:\\with"quote.txt'
    ])).toBe('C:\\plain.txt "C:\\with space.txt" "C:\\with\\"quote.txt"');
  });

  it("decodes Electron's URI-list representation of Explorer files", () => {
    const uriList = Buffer.from([
      "# copied files",
      "file:///C:/Copilot%20Files/context.txt",
      "https://example.com/not-a-file",
      "not a URL"
    ].join("\r\n"));
    expect(main.decodeClipboardUriList(null)).toEqual([]);
    expect(main.decodeClipboardUriList(uriList)).toEqual([
      "C:\\Copilot Files\\context.txt"
    ]);
    expect(main.readClipboardFilePaths({
      availableFormats: () => ["text/uri-list"],
      read: () => uriList.toString("utf8"),
      readBuffer: () => Buffer.alloc(0)
    }, {
      statSync: () => ({
        isDirectory: () => false,
        isFile: () => true
      })
    })).toEqual(["C:\\Copilot Files\\context.txt"]);
  });

  it("falls back to the native Windows file-drop list when Electron hides the URI payload", () => {
    const copiedFile = "C:\\Copilot Files\\native.txt";
    const execute = vi.fn(() => `\uFEFF["${copiedFile.replace(/\\/g, "\\\\")}"]`);
    expect(main.readWindowsClipboardFileDrop(execute)).toEqual([copiedFile]);
    expect(execute).toHaveBeenCalledWith(
      "powershell.exe",
      expect.arrayContaining(["-STA", "-Command"]),
      expect.objectContaining({ encoding: "utf8", windowsHide: true })
    );

    const nativeFallback = vi.fn(() => [copiedFile]);
    expect(main.readClipboardFilePaths({
      availableFormats: () => ["text/uri-list"],
      read: () => "",
      readBuffer: () => Buffer.alloc(0)
    }, {
      statSync: () => ({
        isDirectory: () => false,
        isFile: () => true
      })
    }, nativeFallback)).toEqual([copiedFile]);
    expect(nativeFallback).toHaveBeenCalledOnce();
  });

  it("registers whichever clipboard capabilities are available", () => {
    electron.ipcMain.handle.mockClear();
    main.__setElectron({
      ...electron,
      clipboard: { readText: vi.fn(() => "read only") }
    });
    main.registerClipboardIpc();
    expect(electron.ipcMain.handle.mock.calls.map(([channel]) => channel))
      .toEqual(["multiterm:read-clipboard"]);

    electron.ipcMain.handle.mockClear();
    main.__setElectron({
      ...electron,
      clipboard: { writeText: vi.fn() }
    });
    main.registerClipboardIpc();
    expect(electron.ipcMain.handle.mock.calls.map(([channel]) => channel))
      .toEqual(["multiterm:write-clipboard"]);

    electron.ipcMain.handle.mockClear();
    main.__setElectron({
      ...electron,
      clipboard: {
        readImage: vi.fn(() => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) }))
      }
    });
    main.registerClipboardIpc();
    expect(electron.ipcMain.handle.mock.calls.map(([channel]) => channel))
      .toEqual(["multiterm:read-clipboard"]);
  });

  it("falls back to the sender's own URL when the frame does not expose one", () => {
    main.createWindow();
    const webContents = main.getMainWindow().webContents;
    // Electron only populates senderFrame.url for frames it has finished
    // navigating; the trust check must still resolve an origin without it.
    const mainFrame = {};
    webContents.mainFrame = mainFrame;
    webContents.getURL = vi.fn(() => "http://127.0.0.1:3177/index.html");
    main.registerClipboardIpc();
    const handler = electron.ipcMain.handle.mock.calls
      .find(([channel]) => channel === "multiterm:write-clipboard")[1];

    expect(handler({ sender: webContents, senderFrame: mainFrame }, "from frame url fallback")).toBe(true);
    expect(webContents.getURL).toHaveBeenCalled();
    expect(electron.clipboard.writeText).toHaveBeenCalledWith("from frame url fallback");
  });

  it("treats a sender with an unparseable URL as untrusted instead of throwing on the parse", () => {
    main.createWindow();
    const webContents = main.getMainWindow().webContents;
    const mainFrame = {};
    webContents.mainFrame = mainFrame;
    // Neither source yields a URL, so `new URL(undefined)` throws inside the
    // origin check. That must deny the write, not escape as a parse error.
    webContents.getURL = vi.fn(() => undefined);
    main.registerClipboardIpc();
    const handler = electron.ipcMain.handle.mock.calls
      .find(([channel]) => channel === "multiterm:write-clipboard")[1];

    expect(() => handler({ sender: webContents, senderFrame: mainFrame }, "blocked"))
      .toThrow("restricted to the MultiTerm application window");
    expect(electron.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("replaces an existing handler and tolerates a missing one", () => {
    electron.ipcMain.removeHandler.mockImplementation(() => { throw new Error("missing"); });
    expect(() => main.registerClipboardIpc()).not.toThrow();
    expect(electron.ipcMain.handle).toHaveBeenCalledWith("multiterm:write-clipboard", expect.any(Function));
  });

  it("is unavailable without IPC or a native clipboard writer", () => {
    main.__setElectron({ ...electron, ipcMain: null });
    expect(() => main.registerClipboardIpc()).not.toThrow();

    main.__setElectron({ ...electron, clipboard: null });
    expect(() => main.registerClipboardIpc()).not.toThrow();
  });
});

describe("registerScriptPicker (via onReady)", () => {
  function bootReady() {
    vi.spyOn(http, "get").mockImplementation((opts, cb) => {
      const req = new EventEmitter();
      req.destroy = vi.fn();
      sendHealthyResponse(cb);
      return req;
    });
    return main.onReady();
  }

  function pickHandler() {
    const call = electron.ipcMain.handle.mock.calls.find(([e]) => e === "multiterm:pick-script");
    return call && call[1];
  }

  function folderHandler() {
    const call = electron.ipcMain.handle.mock.calls.find(([e]) => e === "multiterm:pick-folder");
    return call && call[1];
  }

  it("does not register a handler when ipcMain.handle is unavailable", async () => {
    electron.ipcMain.handle = undefined;
    await bootReady();
    // No throw and no handler registration attempted.
    expect(main.getMainWindow()).not.toBeNull();
  });

  it("returns the chosen file path when a script is selected", async () => {
    electron.dialog.showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: ["C:\\scripts\\deploy.ps1"] }));
    await bootReady();
    const handler = pickHandler();
    await expect(handler(trustedIpcEvent())).resolves.toBe("C:\\scripts\\deploy.ps1");
    expect(electron.dialog.showOpenDialog).toHaveBeenCalled();
  });

  it("returns null for every empty/cancelled dialog outcome", async () => {
    electron.dialog.showOpenDialog = vi.fn();
    await bootReady();
    const handler = pickHandler();
    const event = trustedIpcEvent();

    electron.dialog.showOpenDialog.mockResolvedValueOnce(null);
    await expect(handler(event)).resolves.toBeNull();

    electron.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true });
    await expect(handler(event)).resolves.toBeNull();

    electron.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: "not-an-array" });
    await expect(handler(event)).resolves.toBeNull();

    electron.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [] });
    await expect(handler(event)).resolves.toBeNull();
  });

  it("opens a directory picker at a valid requested path", async () => {
    vi.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true });
    electron.dialog.showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: ["C:\\work"] }));
    await bootReady();

    await expect(folderHandler()(trustedIpcEvent(), "C:\\work")).resolves.toBe("C:\\work");
    expect(electron.dialog.showOpenDialog).toHaveBeenCalledWith(
      main.getMainWindow(),
      expect.objectContaining({
        defaultPath: path.resolve("C:\\work"),
        properties: ["openDirectory"],
        title: "Select a working directory"
      })
    );
  });

  it("omits an invalid initial folder and returns null when cancelled", async () => {
    vi.spyOn(fs, "statSync")
      .mockReturnValueOnce({ isDirectory: () => false })
      .mockImplementationOnce(() => { throw new Error("missing"); });
    electron.dialog.showOpenDialog = vi.fn(async () => ({ canceled: true, filePaths: [] }));
    await bootReady();

    await expect(folderHandler()(trustedIpcEvent(), "C:\\file.txt")).resolves.toBeNull();
    expect(electron.dialog.showOpenDialog.mock.calls[0][1]).not.toHaveProperty("defaultPath");

    await expect(folderHandler()(trustedIpcEvent(), "C:\\missing")).resolves.toBeNull();
    expect(electron.dialog.showOpenDialog.mock.calls[1][1]).not.toHaveProperty("defaultPath");
  });
});


describe("bootstrap", () => {
  it("quits immediately when the single-instance lock is not acquired", () => {
    electron.app.requestSingleInstanceLock.mockReturnValue(false);
    main.bootstrap();
    expect(electron.app.quit).toHaveBeenCalled();
    expect(electron.app.on).not.toHaveBeenCalled();
  });

  it("registers lifecycle handlers when the lock is acquired", () => {
    main.bootstrap();
    expect(electron.app.whenReady).toHaveBeenCalled();
    // Perf: the default menu is disabled before ready (guideline #8).
    expect(electron.Menu.setApplicationMenu).toHaveBeenCalledWith(null);

    const beforeQuit = handlerFor("before-quit");
    beforeQuit();
    expect(electron.app.isQuiting).toBe(true);

    const allClosed = handlerFor("window-all-closed");
    allClosed();
    expect(electron.app.quit).toHaveBeenCalled();
  });

  it("focuses the existing window on a second instance", () => {
    main.bootstrap();
    const secondInstance = handlerFor("second-instance");

    // No window yet: handler must be a no-op.
    expect(() => secondInstance()).not.toThrow();

    // With a minimized window: restore + focus.
    main.createWindow();
    const win = main.getMainWindow();
    win.isMinimized.mockReturnValue(true);
    secondInstance();
    expect(win.restore).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();

    // With a non-minimized window: focus only.
    win.isMinimized.mockReturnValue(false);
    win.restore.mockClear();
    secondInstance();
    expect(win.restore).not.toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
  });
});

describe("administrator elevation IPC", () => {
  const adminHandler = (event) => {
    const call = electron.ipcMain.handle.mock.calls.find(([e]) => e === event);
    return call && call[1];
  };
  let originalPlatform;
  beforeEach(() => {
    originalPlatform = process.platform;
    main.createWindow();
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  });
  const setPlatform = (value) =>
    Object.defineProperty(process, "platform", { value, configurable: true });

  it("registerAdminIpc is a no-op without a usable ipcMain", () => {
    main.__setElectron({ ...electron, ipcMain: null });
    expect(() => main.registerAdminIpc()).not.toThrow();
    main.__setElectron({ ...electron, ipcMain: { handle: undefined } });
    expect(() => main.registerAdminIpc()).not.toThrow();
  });

  it("registers is-elevated and relaunch-as-admin, clearing any stale handlers first", () => {
    main.registerAdminIpc();
    expect(electron.ipcMain.removeHandler).toHaveBeenCalledWith("multiterm:is-elevated");
    expect(electron.ipcMain.removeHandler).toHaveBeenCalledWith("multiterm:relaunch-as-admin");
    expect(adminHandler("multiterm:is-elevated")).toBeInstanceOf(Function);
    expect(adminHandler("multiterm:relaunch-as-admin")).toBeInstanceOf(Function);
    // The relay-only channels from main's original design must NOT be registered.
    expect(electron.ipcMain.handle.mock.calls.some(([e]) => e === "multiterm:get-ui-token")).toBe(false);
    expect(electron.ipcMain.handle.mock.calls.some(([e]) => e === "multiterm:spawn-admin-bridge")).toBe(false);
  });

  it("still registers handlers when removeHandler throws", () => {
    electron.ipcMain.removeHandler = vi.fn(() => { throw new Error("no such handler"); });
    expect(() => main.registerAdminIpc()).not.toThrow();
    expect(adminHandler("multiterm:is-elevated")).toBeInstanceOf(Function);
  });

  it("is-elevated handler reports the cached elevation flag (non-Windows short-circuit)", async () => {
    setPlatform("linux");
    main.registerAdminIpc();
    await expect(adminHandler("multiterm:is-elevated")(trustedIpcEvent())).resolves.toBe(false);
  });

  it("is-elevated handler resolves true after a successful net session check on Windows", async () => {
    setPlatform("win32");
    vi.spyOn(childProcess, "exec").mockImplementation((cmd, opts, cb) => { cb(null); });
    main.registerAdminIpc();
    await expect(adminHandler("multiterm:is-elevated")(trustedIpcEvent())).resolves.toBe(true);
    expect(childProcess.exec).toHaveBeenCalledWith("net session", expect.any(Object), expect.any(Function));
  });

  it("relaunch-as-admin handler flags quit and schedules app.quit when relaunch succeeds", () => {
    vi.useFakeTimers();
    setPlatform("win32");
    childProcess.spawn.mockImplementation(() => ({ unref: vi.fn() }));
    main.registerAdminIpc();
    const result = adminHandler("multiterm:relaunch-as-admin")(trustedIpcEvent());
    expect(result).toBe(true);
    expect(electron.app.isQuiting).toBe(true);
    expect(electron.app.quit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(electron.app.quit).toHaveBeenCalled();
  });

  it("relaunch-as-admin handler returns false without quitting when relaunch is unsupported", () => {
    setPlatform("linux");
    main.registerAdminIpc();
    const result = adminHandler("multiterm:relaunch-as-admin")(trustedIpcEvent());
    expect(result).toBe(false);
    expect(electron.app.isQuiting).toBe(false);
    expect(electron.app.quit).not.toHaveBeenCalled();
  });

  it("ensureElevationChecked short-circuits once already checked", async () => {
    setPlatform("win32");
    const execSpy = vi.spyOn(childProcess, "exec").mockImplementation((cmd, opts, cb) => { cb(null); });
    await main.ensureElevationChecked();
    execSpy.mockClear();
    // Second call must not probe again (cached).
    await main.ensureElevationChecked();
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("ensureElevationChecked resolves without probing off Windows", async () => {
    setPlatform("linux");
    const execSpy = vi.spyOn(childProcess, "exec");
    await expect(main.ensureElevationChecked()).resolves.toBeUndefined();
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("ensureElevationChecked leaves the flag false when net session fails", async () => {
    setPlatform("win32");
    vi.spyOn(childProcess, "exec").mockImplementation((cmd, opts, cb) => { cb(new Error("not admin")); });
    main.registerAdminIpc();
    await main.ensureElevationChecked();
    await expect(adminHandler("multiterm:is-elevated")(trustedIpcEvent())).resolves.toBe(false);
  });

  it("rejects privileged IPC from a different frame or origin", async () => {
    main.registerAdminIpc();
    const webContents = main.getMainWindow().webContents;
    webContents.mainFrame = { url: "http://127.0.0.1:3177/" };
    const untrusted = { sender: webContents, senderFrame: { url: "https://example.com/" } };
    await expect(adminHandler("multiterm:is-elevated")(untrusted)).rejects.toThrow(/restricted/);
  });

  it("ensureElevationChecked swallows a synchronous exec failure", async () => {
    setPlatform("win32");
    vi.spyOn(childProcess, "exec").mockImplementation(() => { throw new Error("spawn ENOENT"); });
    await expect(main.ensureElevationChecked()).resolves.toBeUndefined();
  });

  it("relaunchAsAdmin returns false off Windows without spawning", () => {
    setPlatform("linux");
    expect(main.relaunchAsAdmin()).toBe(false);
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it("relaunchAsAdmin spawns an elevated PowerShell relaunch on Windows", () => {
    setPlatform("win32");
    const unref = vi.fn();
    childProcess.spawn.mockImplementation(() => ({ unref }));
    expect(main.relaunchAsAdmin()).toBe(true);
    const [file, args, opts] = childProcess.spawn.mock.calls.at(-1);
    expect(file).toBe("powershell.exe");
    expect(args).toContain("-Command");
    expect(args.some((a) => /Start-Process[\s\S]*-Verb RunAs/.test(a))).toBe(true);
    expect(args.some((a) => /MULTITERM_ELEVATED='1'/.test(a))).toBe(true);
    expect(opts).toMatchObject({ detached: true, windowsHide: true });
    expect(unref).toHaveBeenCalled();
  });

  it("relaunchAsAdmin omits ArgumentList when Electron has no application arguments", () => {
    setPlatform("win32");
    const originalArgv = process.argv;
    const unref = vi.fn();
    childProcess.spawn.mockImplementation(() => ({ unref }));
    try {
      process.argv = [process.execPath];
      expect(main.relaunchAsAdmin()).toBe(true);
      const command = childProcess.spawn.mock.calls.at(-1)[1].at(-1);
      expect(command).not.toContain("-ArgumentList");
    } finally {
      process.argv = originalArgv;
    }
  });

  it("relaunchAsAdmin returns false when the launcher spawn throws", () => {
    setPlatform("win32");
    childProcess.spawn.mockImplementation(() => { throw new Error("spawn failed"); });
    expect(main.relaunchAsAdmin()).toBe(false);
  });
});

describe("backend completion edge cases", () => {
  it("rejects malformed internal URLs without throwing", () => {
    expect(main.isInternalUrl("not a valid URL")).toBe(false);
  });

  it("force-kills a failed bridge shutdown once, even after duplicate failures", () => {
    main.startServer();
    const child = main.getServerProcess();
    const request = new EventEmitter();
    request.end = vi.fn();
    request.destroy = vi.fn((error) => request.emit("error", error));
    vi.spyOn(http, "request").mockReturnValue(request);
    const callback = vi.fn();

    main.requestServerShutdown(callback);
    request.emit("timeout");
    request.emit("error", new Error("duplicate failure"));

    expect(request.destroy).toHaveBeenCalledWith(expect.objectContaining({ message: "Bridge shutdown timed out." }));
    expect(child.kill).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
  });

  it("settles watchdog suppression once after timeout and duplicate errors", () => {
    const request = new EventEmitter();
    request.end = vi.fn();
    request.destroy = vi.fn((error) => request.emit("error", error));
    vi.spyOn(http, "request").mockReturnValue(request);
    const callback = vi.fn();

    main.requestWatchdogSuppression(callback);
    request.emit("timeout");
    request.emit("error", new Error("duplicate failure"));

    expect(request.destroy).toHaveBeenCalledWith(expect.objectContaining({ message: "Bridge watchdog update timed out." }));
    expect(callback).toHaveBeenCalledOnce();
  });

  it("rejects malformed health JSON once when a later request error arrives", async () => {
    const request = new EventEmitter();
    request.destroy = vi.fn();
    let response;
    vi.spyOn(http, "get").mockImplementation((_options, callback) => {
      response = new EventEmitter();
      response.statusCode = 200;
      response.setEncoding = vi.fn();
      callback(response);
      return request;
    });

    const result = main.probeServer();
    response.emit("data", "{not json");
    response.emit("end");
    request.emit("error", new Error("late socket error"));

    await expect(result).resolves.toBe(false);
  });

  it("does not ask a destroyed renderer for a close decision", () => {
    main.createWindow();
    const win = main.getMainWindow();
    win.webContents.isDestroyed.mockReturnValue(true);
    win.webContents.send.mockClear();

    main.requestCloseDecision("tray");

    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it("handles quitClose and rejects untrusted close and focus IPC", () => {
    const response = new EventEmitter();
    response.statusCode = 200;
    response.resume = vi.fn();
    const request = new EventEmitter();
    request.destroy = vi.fn();
    request.end = vi.fn(() => {
      http.request.mock.calls.at(-1)[1](response);
      response.emit("end");
    });
    vi.spyOn(http, "request").mockReturnValue(request);

    main.handleCloseResponse("quitClose");
    expect(electron.app.quit).toHaveBeenCalledOnce();

    main.createWindow();
    const win = main.getMainWindow();
    main.registerCloseHandler();
    const closeListener = electron.ipcMain.on.mock.calls.find(([name]) => name === "multiterm:close-response")[1];
    const focusListener = electron.ipcMain.on.mock.calls.find(([name]) => name === "multiterm:focus-window")[1];
    win.hide.mockClear();
    win.focus.mockClear();
    closeListener({ sender: {} }, "tray");
    focusListener({ sender: {} });
    expect(win.hide).not.toHaveBeenCalled();
    expect(win.focus).not.toHaveBeenCalled();
  });

  it("clamps installer limits and rejects an otherwise-valid asset without a digest", () => {
    const fallback = main.DEFAULT_MAX_INSTALLER_SIZE_MB * 1024 * 1024;
    expect(main.installerSizeLimitBytes(undefined)).toBe(fallback);
    expect(main.installerSizeLimitBytes(1)).toBe(1024 * 1024);
    expect(main.installerSizeLimitBytes(Number.MAX_VALUE)).toBe(fallback);
    expect(main.isAllowedInstallerAsset(null)).toBe(false);
    expect(main.isAllowedInstallerAsset({
      name: "setup.exe",
      size: 1,
      url: "https://github.com/andrewtheart/multiterm-workbench/releases/download/v1.0.0/setup.exe"
    })).toBe(false);
    expect(main.isAllowedInstallerAsset({
      digest: 42,
      name: "setup.exe",
      size: 1,
      url: "https://github.com/andrewtheart/multiterm-workbench/releases/download/v1.0.0/setup.exe"
    })).toBe(false);
    expect(main.isAllowedInstallerAsset({ url: 42 })).toBe(false);
  });
});

describe("update checker", () => {
  function digestFor(data) {
    return `sha256:${crypto.createHash("sha256").update(data).digest("hex")}`;
  }

  function installerAsset({
    data = Buffer.alloc(1),
    name = "setup.exe",
    url = "https://github.com/andrewtheart/multiterm-workbench/releases/download/v1.0.0/setup.exe"
  } = {}) {
    return { digest: digestFor(data), name, size: data.length, url };
  }

  function makeResponse({ status = 200, headers = {}, body } = {}) {
    const response = new EventEmitter();
    response.statusCode = status;
    response.headers = headers;
    response.resume = vi.fn();
    response.setEncoding = vi.fn();
    response.pipe = vi.fn();
    // Only JSON responses replay themselves; download tests drive their own chunks.
    if (typeof body === "string") {
      response.__emit = () => {
        response.emit("data", body);
        response.emit("end");
      };
    }
    return response;
  }

  // https.get(url, opts, cb) with a request object that supports error/timeout.
  function stubHttps(responder) {
    return vi.spyOn(https, "get").mockImplementation((url, _opts, callback) => {
      const request = new EventEmitter();
      request.setTimeout = vi.fn();
      request.destroy = vi.fn();
      const response = responder(url);
      queueMicrotask(() => {
        callback(response);
        // Give the promise chain a turn to attach its stream listeners first.
        if (response.__emit) setTimeout(response.__emit, 0);
      });
      return request;
    });
  }

  const releaseBody = JSON.stringify({
    tag_name: "v9.9.9",
    name: "MultiTerm 9.9.9",
    body: "## Fixes\n- something",
    html_url: "https://github.com/andrewtheart/multiterm-workbench/releases/tag/v9.9.9",
    published_at: "2026-01-01T00:00:00Z",
    assets: [
      { name: "notes.txt", browser_download_url: "https://example.com/notes.txt", size: 1 },
      { name: "MultiTerm-Setup-9.9.9.exe", browser_download_url: "https://example.com/setup.exe", size: 4096, digest: `sha256:${"a".repeat(64)}` }
    ]
  });

  describe("compareVersions", () => {
    it("orders released versions numerically, not lexically", () => {
      expect(main.compareVersions("0.1.10", "0.1.9")).toBe(1);
      expect(main.compareVersions("v1.0.0", "1.0.0")).toBe(0);
      expect(main.compareVersions("0.1.2", "0.2.0")).toBe(-1);
      expect(main.compareVersions("1.2", "1.2.0")).toBe(0);
    });

    it("treats missing or unparsable versions as zero", () => {
      expect(main.compareVersions("", "")).toBe(0);
      expect(main.compareVersions("0.0.1", null)).toBe(1);
      expect(main.compareVersions(undefined, "0.0.1")).toBe(-1);
    });
  });

  describe("pickInstallerAsset", () => {
    it("prefers the setup executable over other assets", () => {
      const asset = main.pickInstallerAsset([
        { name: "portable.zip", browser_download_url: "https://example.com/p.zip", size: 1 },
        { name: "extra.exe", browser_download_url: "https://example.com/extra.exe", size: 2 },
        { name: "MultiTerm-Setup-1.0.0.exe", browser_download_url: "https://example.com/setup.exe", size: 3, digest: `sha256:${"a".repeat(64)}` }
      ]);
      expect(asset).toEqual({ digest: `sha256:${"a".repeat(64)}`, name: "MultiTerm-Setup-1.0.0.exe", url: "https://example.com/setup.exe", size: 3 });
    });

    it("falls back to any executable and returns null when there is none", () => {
      expect(main.pickInstallerAsset([{ name: "tool.exe", browser_download_url: "https://example.com/t.exe" }]))
        .toMatchObject({ name: "tool.exe", size: 0 });
      expect(main.pickInstallerAsset([{ name: "readme.md", browser_download_url: "https://example.com/r.md" }])).toBeNull();
      expect(main.pickInstallerAsset(null)).toBeNull();
    });

    it("ignores malformed assets without names or download URLs", () => {
      expect(main.pickInstallerAsset([
        { browser_download_url: "https://example.com/unnamed" },
        { name: "missing-url.exe" }
      ])).toBeNull();
    });
  });

  describe("normalizeRelease", () => {
    it("strips the leading v and defaults missing fields", () => {
      const release = main.normalizeRelease({ tag_name: "v2.3.4" });
      expect(release).toMatchObject({ tag: "v2.3.4", version: "2.3.4", name: "v2.3.4", notes: "", asset: null });
      expect(release.url).toContain("/releases/latest");
    });

    it("normalizes a missing release payload", () => {
      expect(main.normalizeRelease(null)).toMatchObject({
        tag: "",
        version: "",
        name: "",
        notes: "",
        publishedAt: "",
        asset: null
      });
    });
  });

  describe("fetchLatestRelease / checkForUpdate", () => {
    it("reads the latest release and reports an available update", async () => {
      stubHttps(() => makeResponse({ body: releaseBody }));
      electron.app.getVersion = vi.fn(() => "0.1.0");

      const result = await main.checkForUpdate();
      expect(result.ok).toBe(true);
      expect(result.available).toBe(true);
      expect(result.current).toBe("0.1.0");
      expect(result.release.version).toBe("9.9.9");
      expect(result.release.asset.url).toBe("https://example.com/setup.exe");
    });

    it("reports no update when the running version is already newest", async () => {
      stubHttps(() => makeResponse({ body: releaseBody }));
      electron.app.getVersion = vi.fn(() => "9.9.9");

      const result = await main.checkForUpdate();
      expect(result.available).toBe(false);
    });

    it("follows redirects and rejects on non-200 responses", async () => {
      let call = 0;
      stubHttps(() => {
        call += 1;
        return call === 1
          ? makeResponse({ status: 302, headers: { location: "https://api.github.com/elsewhere" } })
          : makeResponse({ body: releaseBody });
      });
      await expect(main.fetchLatestRelease()).resolves.toMatchObject({ version: "9.9.9" });

      stubHttps(() => makeResponse({ status: 404 }));
      await expect(main.fetchLatestRelease()).rejects.toThrow(/HTTP 404/);

      stubHttps(() => makeResponse({ status: 302, headers: {} }));
      await expect(main.fetchLatestRelease()).rejects.toThrow(/HTTP 302/);
    });

    it("reports a response without an HTTP status as status zero", async () => {
      const response = makeResponse();
      response.statusCode = undefined;
      stubHttps(() => response);
      await expect(main.fetchLatestRelease()).rejects.toThrow(/HTTP 0/);
    });

    it("rejects redirect loops after the configured limit", async () => {
      stubHttps(() => makeResponse({ status: 302, headers: { location: "/loop" } }));
      await expect(main.fetchLatestRelease()).rejects.toThrow(/Too many redirects/);
      expect(https.get).toHaveBeenCalledTimes(6);
    });

    it("refuses to follow a redirect off HTTPS", async () => {
      stubHttps(() => makeResponse({ status: 302, headers: { location: "http://api.github.com/plain" } }));
      await expect(main.fetchLatestRelease()).rejects.toThrow(/away from HTTPS/);
      expect(https.get).toHaveBeenCalledTimes(1);
    });

    it("propagates synchronous request setup failures", async () => {
      vi.spyOn(https, "get").mockImplementation(() => { throw new Error("bad URL setup"); });
      await expect(main.openHttpsStream("https://example.com")).rejects.toThrow("bad URL setup");
    });

    it("propagates request errors and destroys timed-out requests", async () => {
      let request;
      vi.spyOn(https, "get").mockImplementation(() => {
        request = new EventEmitter();
        request.setTimeout = vi.fn((_delay, callback) => { request.timeoutCallback = callback; });
        request.destroy = vi.fn();
        return request;
      });

      const failed = main.openHttpsStream("https://example.com/error");
      request.emit("error", new Error("network down"));
      await expect(failed).rejects.toThrow("network down");

      const timedOut = main.openHttpsStream("https://example.com/slow");
      request.timeoutCallback();
      expect(request.destroy).toHaveBeenCalledWith(expect.objectContaining({ message: "Timed out contacting GitHub." }));
      request.emit("error", new Error("Timed out contacting GitHub."));
      await expect(timedOut).rejects.toThrow(/Timed out/);
    });

    it("falls back to package.json when Electron cannot report a version", () => {
      electron.app.getVersion = vi.fn(() => { throw new Error("not ready"); });
      expect(main.getCurrentVersion()).toBe(require("../../package.json").version);
    });

    it("falls back to package.json when Electron reports an empty version", () => {
      // app.getVersion() succeeds but yields nothing useful before the app is
      // packaged, so an empty string must not be reported as the version.
      electron.app.getVersion = vi.fn(() => "");
      expect(main.getCurrentVersion()).toBe(require("../../package.json").version);
      expect(electron.app.getVersion).toHaveBeenCalled();
    });
  });

  describe("downloadUpdate", () => {
    beforeEach(() => {
      // The real call would create a directory on disk; keep it deterministic.
      vi.spyOn(fs, "mkdtempSync").mockImplementation((prefix) => `${prefix}a1b2c3`);
      vi.spyOn(fs, "rm").mockImplementation((_path, _options, callback) => callback());
    });

    it("rejects assets that are missing, insecure, or outside the project releases", async () => {
      await expect(main.downloadUpdate(null)).rejects.toThrow(/does not include a Windows installer/);
      await expect(main.downloadUpdate({ url: "http://example.com/setup.exe" })).rejects.toThrow(/insecure/);
      await expect(main.downloadUpdate({ url: "https://example.com/setup.exe" })).rejects.toThrow(/untrusted/);
      await expect(main.downloadUpdate({
        name: "other.exe",
        url: "https://github.com/andrewtheart/multiterm-workbench/releases/download/v1.0.0/setup.exe"
      })).rejects.toThrow(/untrusted/);
      await expect(main.downloadUpdate({
        name: "setup.exe",
        size: 1,
        url: "https://github.com/andrewtheart/multiterm-workbench/releases/download/v1.0.0/setup.exe"
      })).rejects.toThrow(/untrusted/);
    });

    it("streams the installer to disk and reports progress", async () => {
      const data = Buffer.alloc(10);
      const response = makeResponse({ headers: { "content-length": "10" } });
      response.pipe = vi.fn();
      stubHttps(() => response);

      const file = new EventEmitter();
      file.destroy = vi.fn();
      vi.spyOn(fs, "createWriteStream").mockReturnValue(file);

      const progress = [];
      const pending = main.downloadUpdate(
        installerAsset({
          data,
          name: "MultiTerm Setup.exe",
          url: "https://github.com/andrewtheart/multiterm-workbench/releases/download/v1.0.0/MultiTerm%20Setup.exe"
        }),
        (payload) => progress.push(payload)
      );

      await new Promise((resolve) => setTimeout(resolve, 0));
      response.emit("data", data.subarray(0, 4));
      response.emit("data", data.subarray(4));
      file.emit("finish");

      const target = await pending;
      // The asset name is sanitized before it is used as a file name.
      expect(target).toMatch(/MultiTerm_Setup\.exe$/);
      // ...and it lands in a per-download directory, not straight in the temp root.
      expect(fs.mkdtempSync).toHaveBeenCalledWith(expect.stringContaining("multiterm-update-"));
      expect(target).toContain("multiterm-update-a1b2c3");
      expect(progress).toEqual([{ received: 4, total: 10 }, { received: 10, total: 10 }]);
    });

    it("uses Electron's temp folder, a default name, and tolerates no progress callback", async () => {
      electron.app.getPath = vi.fn(() => "C:\\ElectronTemp");
      const response = makeResponse();
      stubHttps(() => response);
      const file = new EventEmitter();
      file.destroy = vi.fn();
      vi.spyOn(fs, "createWriteStream").mockReturnValue(file);

      const data = Buffer.alloc(7);
      const pending = main.downloadUpdate({
        digest: digestFor(data),
        size: data.length,
        url: "https://github.com/andrewtheart/multiterm-workbench/releases/download/v1.0.0/setup.exe",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      response.emit("data", data);
      file.emit("finish");

      await expect(pending).resolves.toBe("C:\\ElectronTemp\\multiterm-update-a1b2c3\\MultiTerm-Setup.exe");
      expect(electron.app.getPath).toHaveBeenCalledWith("temp");
    });

    it("removes a partial download when the stream fails", async () => {
      const response = makeResponse();
      response.pipe = vi.fn();
      stubHttps(() => response);

      const file = new EventEmitter();
      file.destroy = vi.fn();
      vi.spyOn(fs, "createWriteStream").mockReturnValue(file);

      const pending = main.downloadUpdate(installerAsset());
      await new Promise((resolve) => setTimeout(resolve, 0));
      response.emit("error", new Error("socket hang up"));

      await expect(pending).rejects.toThrow(/socket hang up/);
      expect(file.destroy).toHaveBeenCalled();
      expect(fs.rm).toHaveBeenCalled();
    });

    it("still removes a partial download when closing the file throws", async () => {
      const response = makeResponse();
      stubHttps(() => response);
      const file = new EventEmitter();
      file.destroy = vi.fn(() => { throw new Error("already closed"); });
      vi.spyOn(fs, "createWriteStream").mockReturnValue(file);

      const pending = main.downloadUpdate(installerAsset());
      await new Promise((resolve) => setTimeout(resolve, 0));
      file.emit("error", new Error("disk full"));

      await expect(pending).rejects.toThrow("disk full");
      expect(fs.rm).toHaveBeenCalled();
    });

    it("rejects oversized, truncated, and digest-mismatched installers", async () => {
      await expect(main.downloadUpdate({
        digest: `sha256:${"a".repeat(64)}`,
        name: "setup.exe",
        size: 2 * 1024 * 1024,
        url: "https://github.com/andrewtheart/multiterm-workbench/releases/download/v1.0.0/setup.exe"
      }, undefined, 1))
        .rejects.toThrow(/untrusted/);

      const truncatedResponse = makeResponse({ headers: { "content-length": "2" } });
      stubHttps(() => truncatedResponse);
      const truncatedFile = new EventEmitter();
      truncatedFile.destroy = vi.fn();
      vi.spyOn(fs, "createWriteStream").mockReturnValueOnce(truncatedFile);
      const truncated = main.downloadUpdate(installerAsset({ data: Buffer.alloc(1) }));
      const truncatedAssertion = expect(truncated).rejects.toThrow(/size does not match/);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await truncatedAssertion;

      vi.restoreAllMocks();
      vi.spyOn(fs, "mkdtempSync").mockImplementation((prefix) => `${prefix}a1b2c3`);
      vi.spyOn(fs, "rm").mockImplementation((_path, _options, callback) => callback());
      const response = makeResponse({ headers: { "content-length": "1" } });
      stubHttps(() => response);
      const file = new EventEmitter();
      file.destroy = vi.fn();
      vi.spyOn(fs, "createWriteStream").mockReturnValue(file);
      const pending = main.downloadUpdate({ ...installerAsset(), digest: `sha256:${"f".repeat(64)}` });
      await new Promise((resolve) => setTimeout(resolve, 0));
      response.emit("data", Buffer.alloc(1));
      file.emit("finish");
      await expect(pending).rejects.toThrow(/SHA-256/);
      expect(fs.rm).toHaveBeenCalled();
    });

    it("stops an oversized stream once and ignores later stream events", async () => {
      const response = makeResponse();
      response.unpipe = vi.fn(() => { throw new Error("already detached"); });
      stubHttps(() => response);
      const file = new EventEmitter();
      file.destroy = vi.fn();
      vi.spyOn(fs, "createWriteStream").mockReturnValue(file);

      const pending = main.downloadUpdate(installerAsset({ data: Buffer.alloc(1) }));
      const assertion = expect(pending).rejects.toThrow(/exceeded trusted release metadata/);
      await new Promise((resolve) => setTimeout(resolve, 0));
      response.emit("data", Buffer.alloc(2));
      file.emit("finish");
      response.emit("error", new Error("late stream error"));

      await assertion;
      expect(response.unpipe).toHaveBeenCalledWith(file);
      expect(file.destroy).toHaveBeenCalledOnce();
      expect(fs.rm).toHaveBeenCalledOnce();
    });
  });

  describe("runInstaller", () => {
    it("spawns the installer detached so it outlives the app", () => {
      const unref = vi.fn();
      childProcess.spawn.mockImplementation(() => ({ unref }));
      expect(main.runInstaller("C:/temp/setup.exe")).toBe(true);
      expect(childProcess.spawn).toHaveBeenCalledWith("C:/temp/setup.exe", [], expect.objectContaining({ detached: true }));
      expect(unref).toHaveBeenCalled();
    });

    it("falls back to the shell when spawning fails, and refuses an empty path", () => {
      childProcess.spawn.mockImplementation(() => { throw new Error("EACCES"); });
      electron.shell.openPath = vi.fn();
      expect(main.runInstaller("C:/temp/setup.exe")).toBe(true);
      expect(electron.shell.openPath).toHaveBeenCalledWith("C:/temp/setup.exe");
      expect(main.runInstaller("")).toBe(false);
    });

    it("returns false when both process launch mechanisms fail", () => {
      childProcess.spawn.mockImplementation(() => { throw new Error("EACCES"); });
      electron.shell.openPath = vi.fn(() => { throw new Error("no association"); });
      expect(main.runInstaller("C:/temp/setup.exe")).toBe(false);
      expect(electron.shell.openPath).toHaveBeenCalledWith("C:/temp/setup.exe");
    });
  });

  describe("sendUpdateProgress", () => {
    it("sends progress only to a live renderer", () => {
      main.createWindow();
      const win = main.getMainWindow();
      main.sendUpdateProgress({ received: 5, total: 10 });
      expect(win.webContents.send).toHaveBeenCalledWith(
        "multiterm:update-progress",
        { received: 5, total: 10 }
      );

      win.webContents.send.mockClear();
      win.webContents.isDestroyed.mockReturnValue(true);
      main.sendUpdateProgress({ received: 10, total: 10 });
      expect(win.webContents.send).not.toHaveBeenCalled();
    });

    it("is a no-op without a window or a send-capable webContents", () => {
      expect(() => main.sendUpdateProgress({ received: 1, total: 1 })).not.toThrow();
      main.createWindow();
      main.getMainWindow().webContents.send = undefined;
      expect(() => main.sendUpdateProgress({ received: 1, total: 1 })).not.toThrow();
    });
  });

  describe("registerUpdateIpc", () => {
    beforeEach(() => {
      main.createWindow();
      vi.spyOn(fs, "mkdtempSync").mockImplementation((prefix) => `${prefix}a1b2c3`);
    });

    function handlerFor(channel) {
      const call = electron.ipcMain.handle.mock.calls.find(([name]) => name === channel);
      return call && call[1];
    }

    it("returns a structured error instead of throwing when GitHub is unreachable", async () => {
      stubHttps(() => makeResponse({ status: 500 }));
      main.registerUpdateIpc();

      const result = await handlerFor("multiterm:check-update")(trustedIpcEvent());
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/HTTP 500/);
      expect(result.releasePage).toContain("/releases/latest");
    });

    it("reports a download failure without quitting the app", async () => {
      main.registerUpdateIpc();
      const result = await handlerFor("multiterm:download-update")(trustedIpcEvent(), null);
      expect(result).toMatchObject({ ok: false });
      expect(electron.app.isQuiting).toBe(false);
    });

    it("downloads, throttles progress, launches the installer, and quits after handoff", async () => {
      vi.useFakeTimers();
      electron.app.getPath = vi.fn(() => "C:\\temp");
      const response = makeResponse({ headers: { "content-length": "10" } });
      stubHttps(() => response);
      const file = new EventEmitter();
      file.destroy = vi.fn();
      vi.spyOn(fs, "createWriteStream").mockReturnValue(file);
      const unref = vi.fn();
      childProcess.spawn.mockReturnValue({ unref });
      vi.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValue(1100);
      main.registerUpdateIpc();

      const pending = handlerFor("multiterm:download-update")(trustedIpcEvent(), installerAsset({ data: Buffer.alloc(10) }));
      await vi.runAllTicks();
      await Promise.resolve();
      response.emit("data", Buffer.alloc(4));
      response.emit("data", Buffer.alloc(2));
      response.emit("data", Buffer.alloc(4));
      file.emit("finish");

      await expect(pending).resolves.toEqual({ ok: true, path: "C:\\temp\\multiterm-update-a1b2c3\\setup.exe" });
      expect(unref).toHaveBeenCalled();
      expect(main.getMainWindow().webContents.send.mock.calls).toEqual(expect.arrayContaining([
        ["multiterm:update-progress", { received: 4, total: 10 }],
        ["multiterm:update-progress", { received: 10, total: 10 }],
        ["multiterm:update-progress", { received: 1, total: 1, done: true }]
      ]));
      expect(electron.app.isQuiting).toBe(true);
      vi.advanceTimersByTime(1200);
      expect(electron.app.quit).toHaveBeenCalled();
    });

    it("reports a downloaded installer that cannot be launched", async () => {
      const response = makeResponse();
      stubHttps(() => response);
      const file = new EventEmitter();
      file.destroy = vi.fn();
      vi.spyOn(fs, "createWriteStream").mockReturnValue(file);
      childProcess.spawn.mockImplementation(() => { throw new Error("blocked"); });
      electron.shell.openPath = vi.fn(() => { throw new Error("blocked"); });
      main.registerUpdateIpc();

      const data = Buffer.alloc(1);
      const pending = handlerFor("multiterm:download-update")(trustedIpcEvent(), installerAsset({ data }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      response.emit("data", data);
      file.emit("finish");

      await expect(pending).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining("could not be launched")
      });
      expect(electron.app.isQuiting).toBe(false);
    });

    it("only opens github.com URLs from the release-page handler", async () => {
      main.registerUpdateIpc();
      const open = handlerFor("multiterm:open-release");
      const event = trustedIpcEvent();

      await open(event, "https://github.com/andrewtheart/multiterm-workbench/releases/tag/v1.0.0");
      expect(electron.shell.openExternal).toHaveBeenLastCalledWith("https://github.com/andrewtheart/multiterm-workbench/releases/tag/v1.0.0");

      await open(event, "https://evil.example.com/pwn");
      expect(electron.shell.openExternal).toHaveBeenLastCalledWith(expect.stringContaining("github.com/andrewtheart/multiterm-workbench"));
    });

    it("returns false when the release page cannot be opened", async () => {
      electron.shell.openExternal.mockRejectedValue(new Error("no browser"));
      main.registerUpdateIpc();
      await expect(handlerFor("multiterm:open-release")(trustedIpcEvent(), null)).resolves.toBe(false);
    });

    it("does nothing when ipcMain is unavailable", () => {
      main.__setElectron({ ...electron, ipcMain: null });
      expect(() => main.registerUpdateIpc()).not.toThrow();
    });

    it("replaces update handlers even when none were registered before", () => {
      electron.ipcMain.removeHandler.mockImplementation(() => {
        throw new Error("missing");
      });
      expect(() => main.registerUpdateIpc()).not.toThrow();
      expect(electron.ipcMain.handle).toHaveBeenCalledWith(
        "multiterm:download-update",
        expect.any(Function)
      );
    });
  });
});
