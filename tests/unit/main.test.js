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
const childProcess = require("node:child_process");
const main = require("../../main.js");

let electron;

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
    clipboard: { writeText: vi.fn() },
    shell: { openExternal: vi.fn() },
    dialog: { showErrorBox: vi.fn() },
    ipcMain: {
      handle: vi.fn(),
      removeHandler: vi.fn(),
      on: vi.fn(),
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
    on: vi.fn(),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isDestroyed: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn()
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
  electron.BrowserWindow.mockImplementation(function BrowserWindowMock() { return makeWindow(); });
  vi.spyOn(childProcess, "spawn").mockImplementation(() => makeChild());
  main.__reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startServer", () => {
  it("spawns the bridge under node.exe on Windows and wires stdio", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      main.startServer();
      expect(childProcess.spawn).toHaveBeenCalledWith("node.exe", expect.arrayContaining([expect.stringContaining("server.js")]), expect.objectContaining({ env: expect.objectContaining({ PORT: expect.any(String) }) }));
      const child = main.getServerProcess();
      child.stdout.emit("data", Buffer.from("hello"));
      child.stderr.emit("data", Buffer.from("warn"));
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
      cb({ resume: vi.fn() });
      return req;
    });
    await expect(main.waitForServer()).resolves.toBeUndefined();
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
      req.destroy = vi.fn();
      attempt += 1;
      if (attempt === 1) {
        process.nextTick(() => req.emit("timeout"));
      } else {
        cb({ resume: vi.fn() });
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

describe("tray + close-to-tray", () => {
  function bootReady() {
    vi.spyOn(http, "get").mockImplementation((opts, cb) => {
      const req = new EventEmitter();
      req.destroy = vi.fn();
      cb({ resume: vi.fn() });
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

  it("quits from the tray menu bypassing the close interception", async () => {
    await bootReady();
    const template = electron.Menu.buildFromTemplate.mock.calls[0][0];
    const quitItem = template.find((item) => item.label === "Quit MultiTerm");
    quitItem.click();
    expect(electron.app.isQuiting).toBe(true);
    expect(electron.app.quit).toHaveBeenCalled();
  });

  it("intercepts the window close and asks the renderer instead of quitting", () => {
    main.createWindow();
    const win = main.getMainWindow();
    const closeHandler = winHandlerFor(win, "close");
    const event = { preventDefault: vi.fn() };
    closeHandler(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith("multiterm:close-request");
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

  it("registers a close-response listener that hides, quits, or stays", async () => {
    await bootReady();
    const onCall = electron.ipcMain.on.mock.calls.find(([e]) => e === "multiterm:close-response");
    expect(onCall).toBeTruthy();
    const listener = onCall[1];
    const win = main.getMainWindow();
    const event = trustedIpcEvent();

    listener(event, "tray");
    expect(win.hide).toHaveBeenCalled();

    listener(event, "quit");
    expect(electron.app.isQuiting).toBe(true);
    expect(electron.app.quit).toHaveBeenCalled();

    win.hide.mockClear();
    electron.app.quit.mockClear();
    listener(event, "cancel");
    expect(win.hide).not.toHaveBeenCalled();
    expect(electron.app.quit).not.toHaveBeenCalled();
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
    vi.spyOn(http, "get").mockImplementation((opts, cb) => {
      const req = new EventEmitter();
      req.destroy = vi.fn();
      cb({ resume: vi.fn() });
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
      cb({ resume: vi.fn() });
      return req;
    });
    return main.onReady();
  }

  function pickHandler() {
    const call = electron.ipcMain.handle.mock.calls.find(([e]) => e === "multiterm:pick-script");
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

  it("relaunchAsAdmin returns false when the launcher spawn throws", () => {
    setPlatform("win32");
    childProcess.spawn.mockImplementation(() => { throw new Error("spawn failed"); });
    expect(main.relaunchAsAdmin()).toBe(false);
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
  });
});
