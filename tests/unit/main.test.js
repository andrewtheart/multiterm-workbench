const { EventEmitter } = require("node:events");
const http = require("node:http");
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
      send: vi.fn(),
      isDestroyed: vi.fn(() => false)
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

function winHandlerFor(win, event) {
  const call = win.on.mock.calls.find(([name]) => name === event);
  return call && call[1];
}

function handlerFor(event) {
  const call = electron.app.on.mock.calls.find(([name]) => name === event);
  return call && call[1];
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
  it("creates the window, routes external links, and clears on close", () => {
    main.createWindow();
    const win = main.getMainWindow();
    expect(win.loadURL).toHaveBeenCalledWith(expect.stringContaining("http://127.0.0.1"));

    const openHandler = win.webContents.setWindowOpenHandler.mock.calls[0][0];
    expect(openHandler({ url: "http://127.0.0.1:3177/x" })).toEqual({ action: "allow" });
    expect(openHandler({ url: "http://localhost:3177/x" })).toEqual({ action: "allow" });
    expect(openHandler({ url: "https://example.com" })).toEqual({ action: "deny" });
    expect(electron.shell.openExternal).toHaveBeenCalledWith("https://example.com");

    const closedHandler = win.on.mock.calls.find(([e]) => e === "closed")[1];
    closedHandler();
    expect(main.getMainWindow()).toBeNull();
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

    listener({}, "tray");
    expect(win.hide).toHaveBeenCalled();

    listener({}, "quit");
    expect(electron.app.isQuiting).toBe(true);
    expect(electron.app.quit).toHaveBeenCalled();

    win.hide.mockClear();
    electron.app.quit.mockClear();
    listener({}, "cancel");
    expect(win.hide).not.toHaveBeenCalled();
    expect(electron.app.quit).not.toHaveBeenCalled();
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
    await expect(handler()).resolves.toBe("C:\\scripts\\deploy.ps1");
    expect(electron.dialog.showOpenDialog).toHaveBeenCalled();
  });

  it("returns null for every empty/cancelled dialog outcome", async () => {
    electron.dialog.showOpenDialog = vi.fn();
    await bootReady();
    const handler = pickHandler();

    electron.dialog.showOpenDialog.mockResolvedValueOnce(null);
    await expect(handler()).resolves.toBeNull();

    electron.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true });
    await expect(handler()).resolves.toBeNull();

    electron.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: "not-an-array" });
    await expect(handler()).resolves.toBeNull();

    electron.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [] });
    await expect(handler()).resolves.toBeNull();
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
