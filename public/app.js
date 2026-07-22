const defaultSettings = {
  appTheme: "system",
  bellNotify: false,
  columns: 2,
  compactChrome: false,
  copyOnSelect: false,
  cursorBlink: true,
  cursorStyle: "bar",
  focusWidth: 65,
  fontFamily: "Cascadia Mono",
  fontSize: 14,
  gap: 10,
  headerHidden: false,
  layout: "auto",
  minWidth: 420,
  paneHeight: 320,
  restoreSession: false,
  rows: 2,
  sidecarHidden: false,
  startupCommand: "",
  syncInput: false,
  theme: "ember"
};

const PANE_COLORS = ["#4fd1b0", "#7ca8f6", "#f0b35a", "#e8695b", "#d486e8", "#94d36f"];

// Bumped on each rebuild. See /memories/repo for the convention.
const APP_VERSION = "0.1.1";

const fontStacks = {
  "Cascadia Mono": "'Cascadia Mono', Consolas, 'Courier New', monospace",
  "Cascadia Code": "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
  "Consolas": "Consolas, 'Cascadia Mono', 'Courier New', monospace",
  "JetBrains Mono": "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace",
  "Fira Code": "'Fira Code', 'Cascadia Mono', Consolas, monospace",
  "Courier New": "'Courier New', Consolas, monospace"
};

const themes = {
  ember: {
    background: "#0d0e0c",
    black: "#12130f",
    blue: "#6ca8f6",
    brightBlack: "#5a5f55",
    brightBlue: "#9fc4ff",
    brightCyan: "#a6f0df",
    brightGreen: "#b8e986",
    brightMagenta: "#e7a4f7",
    brightRed: "#ff8f82",
    brightWhite: "#fff7e5",
    brightYellow: "#ffd27a",
    cursor: "#79d7bd",
    cyan: "#79d7bd",
    foreground: "#eee9db",
    green: "#94d36f",
    magenta: "#d486e8",
    red: "#e36b5d",
    selectionBackground: "#36554b",
    white: "#eee9db",
    yellow: "#f0b35a"
  },
  graphite: {
    background: "#101112",
    black: "#101112",
    blue: "#7aa2f7",
    brightBlack: "#5c6370",
    brightBlue: "#9dbdff",
    brightCyan: "#8bd5ca",
    brightGreen: "#b7d97a",
    brightMagenta: "#d7a6ff",
    brightRed: "#ff8b8b",
    brightWhite: "#f4f2eb",
    brightYellow: "#ffd580",
    cursor: "#f0b35a",
    cyan: "#72c7bd",
    foreground: "#e6e1d4",
    green: "#9ece6a",
    magenta: "#bb9af7",
    red: "#f7768e",
    selectionBackground: "#40434a",
    white: "#d8d4c8",
    yellow: "#e0af68"
  },
  paper: {
    background: "#fbf7ec",
    black: "#24231f",
    blue: "#2862b9",
    brightBlack: "#777266",
    brightBlue: "#447bd4",
    brightCyan: "#158a7c",
    brightGreen: "#487a24",
    brightMagenta: "#8a4ab8",
    brightRed: "#c5443e",
    brightWhite: "#ffffff",
    brightYellow: "#9c6b0d",
    cursor: "#222222",
    cyan: "#087b70",
    foreground: "#24231f",
    green: "#3d741f",
    magenta: "#7a3fb0",
    red: "#b43631",
    selectionBackground: "#d6eadf",
    white: "#ede6d7",
    yellow: "#8b620d"
  },
  contrast: {
    background: "#000000",
    black: "#000000",
    blue: "#5da7ff",
    brightBlack: "#777777",
    brightBlue: "#9dccff",
    brightCyan: "#9effff",
    brightGreen: "#b8ff70",
    brightMagenta: "#ff9cff",
    brightRed: "#ff8d8d",
    brightWhite: "#ffffff",
    brightYellow: "#ffff87",
    cursor: "#ffffff",
    cyan: "#6ef7f2",
    foreground: "#ffffff",
    green: "#9cff57",
    magenta: "#ff7dff",
    red: "#ff5f5f",
    selectionBackground: "#555555",
    white: "#eeeeee",
    yellow: "#ffd75f"
  }
};

const elements = {
  addTerminal: document.querySelector("#addTerminal"),
  appTheme: document.querySelector("#appTheme"),
  aboutClose: document.querySelector("#aboutClose"),
  aboutOverlay: document.querySelector("#aboutOverlay"),
  aboutToggle: document.querySelector("#aboutToggle"),
  aboutVersion: document.querySelector("#aboutVersion"),
  aboutVersionText: document.querySelector("#aboutVersionText"),
  bellNotify: document.querySelector("#bellNotify"),
  bridgeStatus: document.querySelector("#bridgeStatus"),
  broadcastBar: document.querySelector("#broadcastBar"),
  broadcastClose: document.querySelector("#broadcastClose"),
  broadcastInput: document.querySelector("#broadcastInput"),
  broadcastScope: document.querySelector("#broadcastScope"),
  broadcastSend: document.querySelector("#broadcastSend"),
  broadcastToggle: document.querySelector("#broadcastToggle"),
  closeAllTerminals: document.querySelector("#closeAllTerminals"),
  columnCount: document.querySelector("#columnCount"),
  columnCountValue: document.querySelector("#columnCountValue"),
  commandPalette: document.querySelector("#commandPalette"),
  compactChrome: document.querySelector("#compactChrome"),
  contextMenu: document.querySelector("#contextMenu"),
  controlPanel: document.querySelector(".control-panel"),
  copyOnSelect: document.querySelector("#copyOnSelect"),
  cursorBlink: document.querySelector("#cursorBlink"),
  cursorStyle: document.querySelector("#cursorStyle"),
  cwdInput: document.querySelector("#cwdInput"),
  fitAll: document.querySelector("#fitAll"),
  focusWidth: document.querySelector("#focusWidth"),
  focusWidthValue: document.querySelector("#focusWidthValue"),
  fontFamily: document.querySelector("#fontFamily"),
  fontSize: document.querySelector("#fontSize"),
  fontSizeValue: document.querySelector("#fontSizeValue"),
  helpToggle: document.querySelector("#helpToggle"),
  helpDocToggle: document.querySelector("#helpDocToggle"),
  helpDocClose: document.querySelector("#helpDocClose"),
  helpOverlay: document.querySelector("#helpOverlay"),
  helpFrame: document.querySelector("#helpFrame"),
  host: document.querySelector("#terminalHost"),
  layoutMode: document.querySelector("#layoutMode"),
  logClear: document.querySelector("#logClear"),
  logClose: document.querySelector("#logClose"),
  logCopy: document.querySelector("#logCopy"),
  logFabDot: document.querySelector("#logFabDot"),
  logLevelFilter: document.querySelector("#logLevelFilter"),
  logOutput: document.querySelector("#logOutput"),
  logPanel: document.querySelector("#logPanel"),
  logToggle: document.querySelector("#logToggle"),
  minWidth: document.querySelector("#minWidth"),
  minWidthValue: document.querySelector("#minWidthValue"),
  minimizedDock: document.querySelector("#minimizedDock"),
  paletteInput: document.querySelector("#paletteInput"),
  paletteList: document.querySelector("#paletteList"),
  paletteOverlay: document.querySelector("#paletteOverlay"),
  paneGap: document.querySelector("#paneGap"),
  paneGapValue: document.querySelector("#paneGapValue"),
  paneHeight: document.querySelector("#paneHeight"),
  paneHeightValue: document.querySelector("#paneHeightValue"),
  paneTemplate: document.querySelector("#paneTemplate"),
  resetLayout: document.querySelector("#resetLayout"),
  restoreSession: document.querySelector("#restoreSession"),
  rowCount: document.querySelector("#rowCount"),
  rowCountValue: document.querySelector("#rowCountValue"),
  shellSelect: document.querySelector("#shellSelect"),
  snapPreview: document.querySelector("#snapPreview"),
  shortcutsClose: document.querySelector("#shortcutsClose"),
  shortcutsOverlay: document.querySelector("#shortcutsOverlay"),
  startupCommand: document.querySelector("#startupCommand"),
  statusConn: document.querySelector("#statusConn"),
  statusSessions: document.querySelector("#statusSessions"),
  statusShellText: document.querySelector("#statusShellText"),
  syncInput: document.querySelector("#syncInput"),
  terminalSearchInput: document.querySelector("#terminalSearchInput"),
  terminalTheme: document.querySelector("#terminalTheme"),
  themeToggle: document.querySelector("#themeToggle"),
  toastHost: document.querySelector("#toastHost"),
  toggleHeader: document.querySelector("#toggleHeader"),
  toggleHeaderTop: document.querySelector("#toggleHeaderTop"),
  toggleSidecar: document.querySelector("#toggleSidecar"),
  toggleSidecarTop: document.querySelector("#toggleSidecarTop"),
  workspaceDelete: document.querySelector("#workspaceDelete"),
  workspaceName: document.querySelector("#workspaceName"),
  workspaceRestore: document.querySelector("#workspaceRestore"),
  workspaceSave: document.querySelector("#workspaceSave"),
  workspaceSelect: document.querySelector("#workspaceSelect")
};

const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const palette = { open: false, index: 0, items: [] };

const state = {
  activeId: null,
  broadcastScope: "all",
  manualLayouts: loadManualLayouts(),
  nextIndex: 1,
  settings: loadSettings(),
  snap: null,
  socket: null,
  socketReady: false,
  terminalSearch: "",
  terminals: new Map(),
  workspaces: loadWorkspaces()
};

/* ---------------- Logging & tail console --------------- */

const LOG_LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };

const logStore = {
  entries: [],
  max: 2000,
  seq: 0,
  minLevel: "info",
  autoscroll: true,
  unseenError: false
};

function logEvent(level, source, message, detail) {
  const entry = {
    id: ++logStore.seq,
    time: Date.now(),
    level: level in LOG_LEVEL_RANK ? level : "info",
    source: source || "app",
    message: typeof message === "string" ? message : String(message)
  };
  if (detail !== undefined && detail !== null) {
    entry.detail = detail;
  }

  logStore.entries.push(entry);
  if (logStore.entries.length > logStore.max) {
    logStore.entries.splice(0, logStore.entries.length - logStore.max);
  }

  mirrorLogToConsole(entry);
  appendLogRow(entry);

  if (entry.level === "error" && elements.logPanel && elements.logPanel.hidden) {
    logStore.unseenError = true;
    if (elements.logFabDot) elements.logFabDot.hidden = false;
  }
  return entry;
}

function mirrorLogToConsole(entry) {
  const label = `[MT:${entry.source}]`;
  const args = entry.detail !== undefined ? [label, entry.message, entry.detail] : [label, entry.message];
  if (entry.level === "error") console.error(...args);
  else if (entry.level === "warn") console.warn(...args);
  else if (entry.level === "debug") console.debug(...args);
  else console.info(...args);
}

const log = {
  debug: (source, message, detail) => logEvent("debug", source, message, detail),
  info: (source, message, detail) => logEvent("info", source, message, detail),
  warn: (source, message, detail) => logEvent("warn", source, message, detail),
  error: (source, message, detail) => logEvent("error", source, message, detail)
};

window.addEventListener("error", (event) => {
  log.error("app", `Uncaught error: ${event.message}`, { file: event.filename, line: event.lineno, col: event.colno });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  log.error("app", `Unhandled promise rejection: ${reason}`);
});

window.addEventListener("DOMContentLoaded", () => {
  log.info("app", `MultiTerm ${APP_VERSION} starting`);
  bindControls();
  applyVersion();
  applySettings();
  enhanceComboboxes();
  refreshWorkspaceSelect();
  attachRipples();
  bindPalette();
  bindContextMenu();
  bindGlobalShortcuts();
  bindLogConsole();
  systemThemeQuery.addEventListener("change", () => {
    if (state.settings.appTheme === "system") applyAppTheme();
  });
  connectBridge();
  refreshIcons();
  log.debug("app", "UI initialized", { theme: state.settings.appTheme, layout: state.settings.layout });
});

window.addEventListener("beforeunload", () => {
  saveSettings();
  saveManualLayouts();
  saveSessionSnapshot();
});

function bindControls() {
  elements.layoutMode.value = state.settings.layout;
  elements.minWidth.value = state.settings.minWidth;
  elements.columnCount.value = state.settings.columns;
  elements.rowCount.value = state.settings.rows;
  elements.paneHeight.value = state.settings.paneHeight;
  elements.focusWidth.value = state.settings.focusWidth;
  elements.paneGap.value = state.settings.gap;
  elements.fontSize.value = state.settings.fontSize;
  elements.terminalTheme.value = state.settings.theme;
  elements.appTheme.value = state.settings.appTheme;
  elements.fontFamily.value = state.settings.fontFamily;
  elements.cursorStyle.value = state.settings.cursorStyle;
  elements.cursorBlink.checked = state.settings.cursorBlink;
  elements.compactChrome.checked = state.settings.compactChrome;
  elements.syncInput.checked = state.settings.syncInput;
  elements.restoreSession.checked = state.settings.restoreSession;
  elements.bellNotify.checked = state.settings.bellNotify;
  elements.copyOnSelect.checked = state.settings.copyOnSelect;
  elements.startupCommand.value = state.settings.startupCommand;

  elements.addTerminal.addEventListener("click", () => addTerminal({ reveal: true, runStartup: true }));
  elements.closeAllTerminals.addEventListener("click", closeAllTerminals);
  elements.fitAll.addEventListener("click", fitAllTerminals);
  elements.resetLayout.addEventListener("click", resetLayout);
  elements.commandPalette.addEventListener("click", openPalette);
  elements.themeToggle.addEventListener("click", toggleAppTheme);
  elements.helpToggle.addEventListener("click", openShortcuts);
  elements.helpDocToggle.addEventListener("click", openHelp);
  elements.helpDocClose.addEventListener("click", closeHelp);
  elements.helpOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.helpOverlay) closeHelp();
  });
  elements.aboutToggle.addEventListener("click", openAbout);
  elements.aboutClose.addEventListener("click", closeAbout);
  elements.aboutOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.aboutOverlay) closeAbout();
  });
  elements.shortcutsClose.addEventListener("click", closeShortcuts);
  elements.shortcutsOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.shortcutsOverlay) closeShortcuts();
  });
  elements.broadcastToggle.addEventListener("click", () => toggleBroadcast());
  elements.broadcastClose.addEventListener("click", () => toggleBroadcast(false));
  elements.broadcastSend.addEventListener("click", sendBroadcast);
  elements.broadcastScope.addEventListener("click", toggleBroadcastScope);
  elements.broadcastInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendBroadcast();
    } else if (event.key === "Escape") {
      event.preventDefault();
      toggleBroadcast(false);
    }
  });
  elements.workspaceSave.addEventListener("click", () => saveWorkspace(elements.workspaceName.value));
  elements.workspaceRestore.addEventListener("click", () => restoreWorkspace(elements.workspaceSelect.value));
  elements.workspaceDelete.addEventListener("click", () => deleteWorkspace(elements.workspaceSelect.value));
  elements.terminalSearchInput.addEventListener("input", () => {
    state.terminalSearch = normalizeSearchText(elements.terminalSearchInput.value);
    applyTerminalSearch();
  });
  elements.toggleHeader.addEventListener("click", () => toggleChrome("headerHidden"));
  elements.toggleSidecar.addEventListener("click", () => toggleChrome("sidecarHidden"));
  elements.toggleHeaderTop.addEventListener("click", () => toggleChrome("headerHidden"));
  elements.toggleSidecarTop.addEventListener("click", () => toggleChrome("sidecarHidden"));
  elements.shellSelect.addEventListener("change", updateStatusBar);

  bindSetting(elements.layoutMode, "layout", "change", (value) => value);
  bindSetting(elements.minWidth, "minWidth", "input", Number);
  bindSetting(elements.columnCount, "columns", "input", Number);
  bindSetting(elements.rowCount, "rows", "input", Number);
  bindSetting(elements.paneHeight, "paneHeight", "input", Number);
  bindSetting(elements.focusWidth, "focusWidth", "input", Number);
  bindSetting(elements.paneGap, "gap", "input", Number);
  bindSetting(elements.fontSize, "fontSize", "input", Number);
  bindSetting(elements.terminalTheme, "theme", "change", (value) => value);
  bindSetting(elements.appTheme, "appTheme", "change", (value) => value);
  bindSetting(elements.fontFamily, "fontFamily", "change", (value) => value);
  bindSetting(elements.cursorStyle, "cursorStyle", "change", (value) => value);
  bindSetting(elements.cursorBlink, "cursorBlink", "change", (_, element) => element.checked);
  bindSetting(elements.compactChrome, "compactChrome", "change", (_, element) => element.checked);
  bindSetting(elements.syncInput, "syncInput", "change", (_, element) => element.checked);
  bindSetting(elements.restoreSession, "restoreSession", "change", (_, element) => element.checked);
  bindSetting(elements.copyOnSelect, "copyOnSelect", "change", (_, element) => element.checked);
  bindSetting(elements.startupCommand, "startupCommand", "change", (value) => value);
  elements.bellNotify.addEventListener("change", () => {
    state.settings.bellNotify = elements.bellNotify.checked;
    saveSettings();
    if (elements.bellNotify.checked && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  });
}

function toggleChrome(key) {
  state.settings[key] = !state.settings[key];
  applySettings();
  saveSettings();
}

function bindSetting(element, key, eventName, transform) {
  element.addEventListener(eventName, () => {
    state.settings[key] = transform(element.value, element);
    if (key === "layout") {
      clearSnapLayout(false);
    }
    applySettings();
    saveSettings();
  });
}

function connectBridge() {
  if (window.location.protocol === "file:") {
    setBridgeStatus("Open via bridge", "offline");
    log.warn("bridge", "Opened from file:// protocol; bridge unavailable");
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/ws`;
  log.info("bridge", `Connecting to ${url}`);
  state.socket = new WebSocket(url);

  state.socket.addEventListener("open", () => {
    state.socketReady = true;
    setBridgeStatus("Bridge connected", "online");
    log.info("bridge", "WebSocket connected");
    updateTerminalActions();
    for (const terminal of state.terminals.values()) {
      if (!terminal.remoteRequested && terminal.status !== "live") {
        requestSession(terminal);
      }
    }
  });

  state.socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (err) {
      log.error("bridge", "Failed to parse bridge message", { error: String(err) });
      return;
    }
    handleBridgeMessage(message);
  });

  state.socket.addEventListener("close", () => {
    state.socketReady = false;
    setBridgeStatus("Bridge disconnected", "offline");
    log.warn("bridge", "WebSocket disconnected");
    for (const terminal of state.terminals.values()) {
      setTerminalStatus(terminal, "offline", "dead");
    }
    updateTerminalActions();
  });

  state.socket.addEventListener("error", () => {
    state.socketReady = false;
    setBridgeStatus("Bridge error", "offline");
    log.error("bridge", "WebSocket error");
    updateTerminalActions();
  });
}

function handleBridgeMessage(message) {
  if (message.type === "log") {
    ingestServerLog(message);
    return;
  }

  if (message.type === "welcome") {
    log.info("bridge", "Received welcome", { cwd: message.cwd, sessions: Array.isArray(message.sessions) ? message.sessions.length : 0 });
    if (!elements.cwdInput.value) {
      elements.cwdInput.value = message.cwd || "";
    }

    if (Array.isArray(message.sessions) && message.sessions.length > 0) {
      for (const session of message.sessions) {
        if (!state.terminals.has(session.id)) {
          addTerminal({ reattach: true, session });
        }
      }
    } else if (state.terminals.size === 0) {
      const snapshot = state.settings.restoreSession ? loadSessionSnapshot() : null;
      if (snapshot && snapshot.length > 0) {
        for (const meta of snapshot) {
          const restored = addTerminal({ title: meta.title, shell: meta.shell, cwd: meta.cwd, color: meta.color });
          if (meta.minimized && restored) minimizeTerminal(restored.id);
        }
      } else {
        addTerminal();
      }
    }

    return;
  }

  if (message.type === "created") {
    const terminal = state.terminals.get(message.id);
    if (!terminal) return;
    terminal.cwd = message.cwd;
    terminal.pid = message.pid;
    terminal.remoteRequested = true;
    terminal.status = "live";
    setTerminalStatus(terminal, `pid ${message.pid}`, "live");
    log.info("session", `Session live: ${terminal.titleInput.value}`, { id: message.id, pid: message.pid });
    updateTerminalSearchVisibility(terminal);
    scheduleFit(terminal);

    if (terminal.runStartup && state.settings.startupCommand.trim()) {
      terminal.runStartup = false;
      const command = state.settings.startupCommand.trim();
      window.setTimeout(() => sendBridge({ type: "input", id: terminal.id, data: `${command}\r` }), 250);
    }
    return;
  }

  if (message.type === "output") {
    const terminal = state.terminals.get(message.id);
    if (terminal) {
      writeTerminal(terminal, message.data);
    }
    return;
  }

  if (message.type === "exited") {
    const terminal = state.terminals.get(message.id);
    if (!terminal) return;
    terminal.status = "exited";
    setTerminalStatus(terminal, "exited", "dead");
    log.info("session", `Session exited: ${terminal.titleInput.value}`, { id: message.id, code: message.code ?? message.signal ?? "closed" });
    writelnTerminal(terminal, "");
    writelnTerminal(terminal, `\x1b[31mSession exited (${message.code ?? message.signal ?? "closed"}).\x1b[0m`);
    toast(`${terminal.titleInput.value} exited`, "info", 2600);
    return;
  }

  if (message.type === "createFailed" || message.type === "error") {
    const terminal = state.terminals.get(message.id);
    if (terminal) {
      log.error("session", `Session error: ${message.message || "unknown"}`, { id: message.id });
      writelnTerminal(terminal, `\x1b[31m${message.message}\x1b[0m`);
      setTerminalStatus(terminal, "error", "dead");
      toast(message.message || "Session error", "error");
    } else {
      log.error("bridge", `Bridge error: ${message.message || "unknown"}`);
      setBridgeStatus(message.message || "Bridge error", "offline");
    }
  }
}

function addTerminal(options = {}) {
  if (options.reveal) {
    clearTerminalSearch();
  }

  const session = options.session || {};
  const id = session.id || createId();
  const title = session.title || options.title || `PowerShell ${state.nextIndex}`;
  const pane = elements.paneTemplate.content.firstElementChild.cloneNode(true);
  const screen = pane.querySelector(".terminal-screen");
  const titleInput = pane.querySelector(".pane-title");
  const status = pane.querySelector(".pane-status");
  const term = new Terminal({
    allowTransparency: false,
    convertEol: false,
    cursorBlink: state.settings.cursorBlink,
    cursorStyle: state.settings.cursorStyle,
    fontFamily: fontStacks[state.settings.fontFamily] || fontStacks["Cascadia Mono"],
    fontSize: state.settings.fontSize,
    scrollback: 20000,
    tabStopWidth: 4,
    theme: themes[state.settings.theme]
  });
  const fitAddon = new FitAddon.FitAddon();

  term.loadAddon(fitAddon);

  let searchAddon = null;
  if (window.SearchAddon?.SearchAddon) {
    searchAddon = new SearchAddon.SearchAddon();
    term.loadAddon(searchAddon);
  }
  if (window.WebLinksAddon?.WebLinksAddon) {
    term.loadAddon(new WebLinksAddon.WebLinksAddon((event, uri) => window.open(uri, "_blank")));
  }

  titleInput.value = title;
  pane.dataset.id = id;
  elements.host.append(pane);
  term.open(screen);

  const terminal = {
    color: options.color || session.color || null,
    createdAt: performance.now(),
    cwd: session.cwd || options.cwd || elements.cwdInput.value,
    fitAddon,
    id,
    minimized: false,
    observer: null,
    pane,
    pid: session.pid,
    remoteRequested: Boolean(options.reattach),
    runStartup: Boolean(options.runStartup),
    searchAddon,
    searchText: "",
    screen,
    shell: options.shell || session.shell || elements.shellSelect.value,
    status: options.reattach ? "live" : "starting",
    statusElement: status,
    term,
    titleInput
  };

  terminal.observer = new ResizeObserver(() => scheduleFit(terminal));
  state.terminals.set(id, terminal);
  state.nextIndex += 1;
  updateTerminalActions();
  terminal.observer.observe(screen);
  terminal.observer.observe(pane);
  bindPaneControls(terminal);
  bindPaneDrag(terminal);
  bindPaneFind(terminal);
  applyPaneColor(terminal);
  applyManualLayout(terminal, ensureManualLayout(id));
  setActiveTerminal(id);
  refreshIcons();
  bindTerminalKeyHandling(terminal);

  term.onData((data) => {
    const targets = state.settings.syncInput ? [...state.terminals.keys()] : [id];
    for (const targetId of targets) {
      sendBridge({ type: "input", id: targetId, data });
    }
  });

  term.onResize(({ cols, rows }) => {
    sendBridge({ type: "resize", id, cols, rows });
  });

  term.onBell(() => handleBell(terminal));

  term.onSelectionChange(() => {
    if (!state.settings.copyOnSelect) return;
    const selection = term.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).catch(() => {});
    }
  });

  screen.addEventListener("mousedown", (event) => {
    if (event.button === 1) {
      event.preventDefault();
      pasteIntoTerminal(id);
    }
  });

  term.element?.addEventListener("focusin", () => setActiveTerminal(id));
  pane.addEventListener("pointerdown", () => setActiveTerminal(id));
  pane.addEventListener("pointerup", () => syncManualLayout(terminal));

  if (options.reattach) {
    setTerminalStatus(terminal, session.pid ? `pid ${session.pid}` : "live", "live");
    writelnTerminal(terminal, "\x1b[36mReattached to running session.\x1b[0m");
    log.info("terminal", `Reattached terminal: ${terminal.titleInput.value}`, { id, shell: terminal.shell });
  } else {
    requestSession(terminal);
    log.info("terminal", `Terminal added: ${terminal.titleInput.value}`, { id, shell: terminal.shell || elements.shellSelect.value });
  }

  refreshTerminalSearchText(terminal);
  applySettings();
  revealTerminal(terminal);
  scheduleFit(terminal);
  saveSessionSnapshot();
  return terminal;
}

function bindTerminalKeyHandling(terminal) {
  terminal.term.element?.addEventListener("keydown", (event) => {
    if (event.type !== "keydown") return;

    if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.code === "KeyC") {
      event.preventDefault();
      event.stopPropagation();
      sendBridge({ type: "input", id: terminal.id, data: "\x03" });
      return;
    }

    if (!event.ctrlKey && !event.altKey && !event.metaKey && event.code === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      sendBridge({ type: "input", id: terminal.id, data: event.shiftKey ? "\x1b[Z" : "\t" });
    }
  }, true);
}

function bindPaneControls(terminal) {
  terminal.titleInput.addEventListener("change", () => {
    terminal.titleInput.value = terminal.titleInput.value.trim() || "PowerShell";
    refreshTerminalSearchText(terminal);
    updateTerminalSearchVisibility(terminal);
    saveSessionSnapshot();
  });

  terminal.pane.querySelector(".pane-actions").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    const action = button.dataset.action;
    if (action === "close") {
      removeTerminal(terminal.id);
    } else if (action === "focus") {
      clearSnapLayout(false);
      state.settings.layout = "focus";
      elements.layoutMode.value = "focus";
      setActiveTerminal(terminal.id);
      applySettings();
      saveSettings();
    } else if (action === "clear") {
      clearTerminal(terminal.id);
    } else if (action === "copy") {
      copyTerminalOutput(terminal.id);
    } else if (action === "color") {
      cyclePaneColor(terminal);
    } else if (action === "find") {
      openFind(terminal);
    } else if (action === "restart") {
      restartSession(terminal.id);
    } else if (action === "minimize") {
      minimizeTerminal(terminal.id);
    } else if (action === "duplicate") {
      addTerminal({ reveal: true, runStartup: true, title: `${terminal.titleInput.value} copy` });
    } else if (action === "move-left") {
      moveTerminal(terminal.id, -1);
    } else if (action === "move-right") {
      moveTerminal(terminal.id, 1);
    }
  });
}

function bindPaneDrag(terminal) {
  const handle = terminal.pane.querySelector(".pane-bar");
  let drag = null;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button,select")) return;

    const layout = ensureManualLayout(terminal.id);
    drag = {
      edge: null,
      pointerId: event.pointerId,
      started: false,
      startX: event.clientX,
      startY: event.clientY,
      x: layout.x,
      y: layout.y
    };

    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.started && Math.hypot(deltaX, deltaY) < 8) return;

    if (!drag.started) {
      drag.started = true;
      terminal.titleInput.blur();
      terminal.pane.classList.add("is-dragging");
      document.body.classList.add("is-pane-dragging");
    }

    drag.edge = getSnapEdge(event.clientX, event.clientY);
    setSnapPreview(drag.edge);

    if (state.settings.layout === "manual" && !drag.edge) {
      const layout = ensureManualLayout(terminal.id);
      layout.x = Math.max(0, drag.x + deltaX);
      layout.y = Math.max(0, drag.y + deltaY);
      applyManualLayout(terminal, layout);
    }
  });

  handle.addEventListener("pointerup", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    finishPaneDrag(terminal, drag);
    drag = null;
  });

  handle.addEventListener("pointercancel", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    endPaneDrag(terminal);
    drag = null;
  });
}

function finishPaneDrag(terminal, drag) {
  if (drag.started && drag.edge) {
    snapTerminal(terminal.id, drag.edge);
  } else if (drag.started && state.settings.layout === "manual") {
    clearSnapLayout(false);
    syncManualLayout(terminal);
    saveManualLayouts();
  } else if (drag.started && state.snap?.id === terminal.id) {
    clearSnapLayout(true);
  }

  endPaneDrag(terminal);
}

function endPaneDrag(terminal) {
  terminal.pane.classList.remove("is-dragging");
  document.body.classList.remove("is-pane-dragging");
  setSnapPreview(null);
}

function getSnapEdge(clientX, clientY) {
  const rect = elements.host.getBoundingClientRect();
  const threshold = Math.min(48, Math.max(24, Math.min(rect.width, rect.height) * 0.08));
  const nearLeft = clientX <= rect.left + threshold;
  const nearRight = clientX >= rect.right - threshold;
  const nearTop = clientY <= rect.top + threshold;
  const nearBottom = clientY >= rect.bottom - threshold;

  if (nearLeft || nearRight) {
    return nearLeft ? "left" : "right";
  }

  if (nearTop || nearBottom) {
    return nearTop ? "top" : "bottom";
  }

  return null;
}

function setSnapPreview(edge) {
  if (edge) {
    elements.snapPreview.dataset.edge = edge;
  } else {
    delete elements.snapPreview.dataset.edge;
  }
}

function snapTerminal(id, edge) {
  if (!state.terminals.has(id)) return;

  state.snap = { edge, id };
  applySnapLayout();
  fitAllTerminals();
}

function clearSnapLayout(shouldFit) {
  if (!state.snap) return;

  state.snap = null;
  applySnapLayout();
  if (shouldFit) {
    fitAllTerminals();
  }
}

function requestSession(terminal) {
  if (!state.socketReady) {
    terminal.remoteRequested = false;
    setTerminalStatus(terminal, "waiting", "dead");
    writelnTerminal(terminal, "\x1b[33mWaiting for local bridge.\x1b[0m");
    log.warn("session", `Bridge not ready; deferring session for ${terminal.titleInput.value}`, { id: terminal.id });
    return;
  }

  terminal.remoteRequested = true;
  setTerminalStatus(terminal, "starting", "dead");
  log.debug("session", `Requesting session: ${terminal.titleInput.value}`, { id: terminal.id, shell: terminal.shell || elements.shellSelect.value });
  sendBridge({
    type: "create",
    cols: terminal.term.cols,
    cwd: terminal.cwd || elements.cwdInput.value,
    id: terminal.id,
    rows: terminal.term.rows,
    shell: terminal.shell || elements.shellSelect.value,
    title: terminal.titleInput.value
  });
}

function removeTerminal(id) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;

  if (!sendBridge({ type: "kill", id }) && terminal.remoteRequested) {
    setBridgeStatus("Bridge unavailable; session still running", "offline");
    log.warn("terminal", `Cannot close ${terminal.titleInput.value}; bridge unavailable`, { id });
    updateTerminalActions();
    return;
  }

  log.info("terminal", `Terminal closed: ${terminal.titleInput.value}`, { id });
  disposeTerminal(terminal);

  if (state.activeId === id) {
    const next = state.terminals.keys().next().value;
    state.activeId = null;
    if (next) setActiveTerminal(next);
  }

  saveManualLayouts();
  updateTerminalActions();
  saveSessionSnapshot();
}

function closeAllTerminals() {
  if (state.terminals.size === 0) return;

  if (!sendBridge({ type: "killAll" })) {
    setBridgeStatus("Bridge unavailable; sessions still running", "offline");
    log.warn("terminal", "Cannot close all; bridge unavailable");
    updateTerminalActions();
    return;
  }

  log.info("terminal", `Closing all terminals (${state.terminals.size})`);
  for (const terminal of [...state.terminals.values()]) {
    disposeTerminal(terminal);
  }

  state.activeId = null;
  saveManualLayouts();
  updateTerminalActions();
  saveSessionSnapshot();
}

function disposeTerminal(terminal) {
  const { id } = terminal;
  if (state.snap?.id === id) {
    state.snap = null;
  }
  window.clearTimeout(terminal.activityTimer);
  terminal.observer.disconnect();
  terminal.term.dispose();
  terminal.pane.remove();
  state.terminals.delete(id);
  delete state.manualLayouts[id];
  updateMinimizedDock();
}

function minimizeTerminal(id) {
  const terminal = state.terminals.get(id);
  if (!terminal || terminal.minimized) return;

  terminal.minimized = true;
  terminal.pane.classList.add("is-minimized");
  log.info("terminal", `Terminal minimized: ${terminal.titleInput.value}`, { id });
  if (state.snap?.id === id) {
    clearSnapLayout(false);
  }

  if (state.activeId === id) {
    state.activeId = null;
    const next = firstVisibleTerminalId();
    if (next) setActiveTerminal(next);
  }

  updateMinimizedDock();
  updateTerminalActions();
  saveSessionSnapshot();
}

function restoreTerminal(id) {
  const terminal = state.terminals.get(id);
  if (!terminal || !terminal.minimized) return;

  terminal.minimized = false;
  terminal.pane.classList.remove("is-minimized");
  log.info("terminal", `Terminal restored: ${terminal.titleInput.value}`, { id });
  updateMinimizedDock();
  updateTerminalActions();
  setActiveTerminal(id);
  applyManualLayout(terminal, ensureManualLayout(id));
  revealTerminal(terminal);
  scheduleFit(terminal);
  saveSessionSnapshot();
}

function restoreAllTerminals() {
  for (const terminal of [...state.terminals.values()]) {
    if (terminal.minimized) restoreTerminal(terminal.id);
  }
}

function firstVisibleTerminalId() {
  for (const terminal of state.terminals.values()) {
    if (!terminal.minimized) return terminal.id;
  }
  return null;
}

function countVisibleTerminals() {
  let visible = 0;
  for (const terminal of state.terminals.values()) {
    if (!terminal.minimized) visible += 1;
  }
  return visible;
}

function updateMinimizedDock() {
  const dock = elements.minimizedDock;
  if (!dock) return;

  dock.textContent = "";
  const minimized = [...state.terminals.values()].filter((terminal) => terminal.minimized);
  dock.hidden = minimized.length === 0;

  for (const terminal of minimized) {
    const title = terminal.titleInput.value || "PowerShell";
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "min-chip";
    chip.dataset.id = terminal.id;
    chip.title = `Restore ${title}`;
    chip.setAttribute("aria-label", `Restore ${title}`);
    if (terminal.color) {
      chip.classList.add("has-color");
      chip.style.setProperty("--pane-accent", terminal.color);
    }
    chip.innerHTML = '<span class="min-chip-dot" aria-hidden="true"></span><span class="min-chip-label"></span><i data-lucide="chevron-up"></i>';
    chip.querySelector(".min-chip-label").textContent = title;
    chip.addEventListener("click", () => restoreTerminal(terminal.id));
    dock.append(chip);
  }

  refreshIcons();
}

function moveTerminal(id, direction) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;

  const sibling = direction < 0 ? terminal.pane.previousElementSibling : terminal.pane.nextElementSibling;
  if (!sibling) return;

  if (direction < 0) {
    elements.host.insertBefore(terminal.pane, sibling);
  } else {
    elements.host.insertBefore(sibling, terminal.pane);
  }

  scheduleFit(terminal);
}

function setActiveTerminal(id) {
  state.activeId = id;
  for (const terminal of state.terminals.values()) {
    const isActive = terminal.id === id;
    terminal.pane.classList.toggle("is-active", isActive);
    terminal.pane.classList.toggle("is-primary", isActive);
    if (isActive) {
      window.clearTimeout(terminal.activityTimer);
      terminal.pane.classList.remove("has-activity");
    }
  }
  updateStatusBar();
}

function setTerminalStatus(terminal, text, tone) {
  terminal.statusElement.textContent = text;
  terminal.statusElement.classList.toggle("is-live", tone === "live");
  terminal.statusElement.classList.toggle("is-dead", tone === "dead");
  refreshTerminalSearchText(terminal);
  updateTerminalSearchVisibility(terminal);
}

function writeTerminal(terminal, data) {
  terminal.term.write(data);
  appendTerminalSearchText(terminal, data);
  updateTerminalSearchVisibility(terminal);
  markActivity(terminal);
}

function markActivity(terminal, force) {
  if (terminal.id === state.activeId) return;
  // Ignore the shell's own startup banner right after the pane is created.
  if (!force && performance.now() - terminal.createdAt < 1200) return;

  terminal.pane.classList.add("has-activity");
  window.clearTimeout(terminal.activityTimer);
  terminal.activityTimer = window.setTimeout(() => {
    terminal.pane.classList.remove("has-activity");
  }, 4000);
}

function writelnTerminal(terminal, data) {
  terminal.term.writeln(data);
  appendTerminalSearchText(terminal, `${data}\n`);
  updateTerminalSearchVisibility(terminal);
}

function appendTerminalSearchText(terminal, text) {
  const nextText = `${terminal.searchText || ""}\n${normalizeSearchText(stripTerminalControlCodes(text))}`;
  terminal.searchText = nextText.slice(-200000);
}

function refreshTerminalSearchText(terminal) {
  const metadata = [
    terminal.titleInput.value,
    terminal.cwd,
    terminal.shell,
    terminal.statusElement.textContent
  ].filter(Boolean).join("\n");
  terminal.searchText = `${normalizeSearchText(metadata)}\n${terminal.searchText || ""}`.slice(-200000);
}

function applyTerminalSearch() {
  for (const terminal of state.terminals.values()) {
    updateTerminalSearchVisibility(terminal);
  }
}

function clearTerminalSearch() {
  if (!state.terminalSearch && !elements.terminalSearchInput.value) return;

  elements.terminalSearchInput.value = "";
  state.terminalSearch = "";
  applyTerminalSearch();
}

function updateTerminalSearchVisibility(terminal) {
  const query = state.terminalSearch;
  const shouldHide = Boolean(query) && !terminal.searchText.includes(query);
  const wasHidden = terminal.pane.classList.contains("is-search-hidden");
  terminal.pane.classList.toggle("is-search-hidden", shouldHide);

  if (wasHidden && !shouldHide) {
    scheduleFit(terminal);
  }
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase();
}

function stripTerminalControlCodes(value) {
  return String(value || "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function sendBridge(message) {
  if (!state.socketReady || !state.socket || state.socket.readyState !== WebSocket.OPEN) return false;

  try {
    state.socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

function updateTerminalActions() {
  const hasTerminals = state.terminals.size > 0;
  const canCloseAll = hasTerminals && state.socketReady;
  const label = hasTerminals
    ? state.socketReady ? "Close all terminal sessions" : "Bridge disconnected; cannot close all sessions"
    : "No terminal sessions to close";

  elements.closeAllTerminals.disabled = !canCloseAll;
  elements.closeAllTerminals.title = label;
  elements.closeAllTerminals.setAttribute("aria-label", label);
  updateLayoutMetrics();
  updateStatusBar();
}

function updateLayoutMetrics() {
  const count = Math.max(1, countVisibleTerminals());
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  elements.host.style.setProperty("--grid-cols", cols);
  elements.host.style.setProperty("--grid-rows", rows);
  elements.host.style.setProperty("--rest-count", Math.max(1, count - 1));
}

function applySettings() {
  applyAppTheme();
  document.body.classList.toggle("header-hidden", state.settings.headerHidden);
  document.body.classList.toggle("sidecar-hidden", state.settings.sidecarHidden);
  elements.host.dataset.layout = state.settings.layout;
  elements.controlPanel.dataset.mode = state.settings.layout;
  elements.host.classList.toggle("compact", state.settings.compactChrome);
  elements.host.style.setProperty("--min-pane-width", `${state.settings.minWidth}px`);
  elements.host.style.setProperty("--fixed-columns", state.settings.columns);
  elements.host.style.setProperty("--fixed-rows", state.settings.rows);
  elements.host.style.setProperty("--pane-height", `${state.settings.paneHeight}px`);
  elements.host.style.setProperty("--focus-width", `${state.settings.focusWidth}%`);
  elements.host.style.setProperty("--pane-gap", `${state.settings.gap}px`);

  elements.layoutMode.value = state.settings.layout;
  elements.minWidthValue.textContent = `${state.settings.minWidth}px`;
  elements.columnCountValue.textContent = state.settings.columns;
  elements.rowCountValue.textContent = state.settings.rows;
  elements.paneHeightValue.textContent = `${state.settings.paneHeight}px`;
  elements.focusWidthValue.textContent = `${state.settings.focusWidth}%`;
  elements.paneGapValue.textContent = `${state.settings.gap}px`;
  elements.fontSizeValue.textContent = `${state.settings.fontSize}px`;
  updateChromeToggles();
  applySnapLayout();

  const fontFamily = fontStacks[state.settings.fontFamily] || fontStacks["Cascadia Mono"];
  for (const terminal of state.terminals.values()) {
    terminal.term.options.fontSize = state.settings.fontSize;
    terminal.term.options.fontFamily = fontFamily;
    terminal.term.options.cursorStyle = state.settings.cursorStyle;
    terminal.term.options.cursorBlink = state.settings.cursorBlink;
    terminal.term.options.theme = themes[state.settings.theme];
    applyManualLayout(terminal, ensureManualLayout(terminal.id));
    scheduleFit(terminal);
  }
  updateLayoutMetrics();
  updateStatusBar();
  refreshComboboxes();
}

function resolveAppTheme() {
  if (state.settings.appTheme === "light") return "light";
  if (state.settings.appTheme === "dark") return "dark";
  return systemThemeQuery.matches ? "dark" : "light";
}

function applyAppTheme() {
  const resolved = resolveAppTheme();
  document.documentElement.dataset.appTheme = resolved;
  if (elements.themeToggle) {
    const icon = resolved === "dark" ? "sun" : "moon";
    elements.themeToggle.innerHTML = `<i data-lucide="${icon}"></i>`;
    refreshIcons();
  }
}

function toggleAppTheme() {
  const resolved = resolveAppTheme();
  state.settings.appTheme = resolved === "dark" ? "light" : "dark";
  elements.appTheme.value = state.settings.appTheme;
  applySettings();
  saveSettings();
  log.info("ui", `App theme set to ${state.settings.appTheme}`);
  toast(`${state.settings.appTheme === "dark" ? "Dark" : "Light"} theme`, "info", 1600);
}

function updateStatusBar() {
  const count = state.terminals.size;
  elements.statusSessions.textContent = `${count} ${count === 1 ? "session" : "sessions"}`;
  const active = state.activeId ? state.terminals.get(state.activeId) : null;
  const shellValue = active?.shell || elements.shellSelect.value;
  elements.statusShellText.textContent = shellValue === "powershell" ? "Windows PowerShell" : "PowerShell 7";
  const online = state.socketReady;
  elements.statusConn.textContent = online ? "Connected" : "Disconnected";
  elements.statusConn.dataset.tone = online ? "online" : "offline";
}

function updateChromeToggles() {
  setChromeToggle(elements.toggleHeader, state.settings.headerHidden, "Show header", "Hide header");
  setChromeToggle(elements.toggleSidecar, state.settings.sidecarHidden, "Show layout controls", "Hide layout controls");
  setChromeToggle(elements.toggleHeaderTop, state.settings.headerHidden, "Show header", "Hide header");
  setChromeToggle(elements.toggleSidecarTop, state.settings.sidecarHidden, "Show layout controls", "Hide layout controls");
}

function setChromeToggle(button, isHidden, showLabel, hideLabel) {
  const label = isHidden ? showLabel : hideLabel;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(isHidden));
  button.title = label;
}

function fitAllTerminals() {
  for (const terminal of state.terminals.values()) {
    scheduleFit(terminal);
  }
}

function scheduleFit(terminal) {
  window.requestAnimationFrame(() => {
    try {
      terminal.fitAddon.fit();
    } catch {
      return;
    }
    sendBridge({ type: "resize", id: terminal.id, cols: terminal.term.cols, rows: terminal.term.rows });
  });
}

function resetLayout() {
  clearSnapLayout(false);

  if (state.settings.layout === "manual") {
    let index = 0;
    for (const terminal of state.terminals.values()) {
      state.manualLayouts[terminal.id] = defaultManualLayout(index);
      applyManualLayout(terminal, state.manualLayouts[terminal.id]);
      index += 1;
    }
    saveManualLayouts();
  } else {
    state.settings = { ...defaultSettings, theme: state.settings.theme };
    elements.layoutMode.value = state.settings.layout;
    elements.minWidth.value = state.settings.minWidth;
    elements.columnCount.value = state.settings.columns;
    elements.rowCount.value = state.settings.rows;
    elements.paneHeight.value = state.settings.paneHeight;
    elements.focusWidth.value = state.settings.focusWidth;
    elements.paneGap.value = state.settings.gap;
    elements.fontSize.value = state.settings.fontSize;
    elements.compactChrome.checked = state.settings.compactChrome;
    elements.syncInput.checked = state.settings.syncInput;
    applySettings();
    saveSettings();
  }
  fitAllTerminals();
}

function ensureManualLayout(id) {
  if (!state.manualLayouts[id]) {
    state.manualLayouts[id] = defaultManualLayout(state.terminals.size - 1);
  }
  return state.manualLayouts[id];
}

function defaultManualLayout(index) {
  const host = elements.host;
  const padding = 16;
  const gap = Math.max(12, Number(state.settings.gap) || 10);
  const hostWidth = host?.clientWidth || window.innerWidth || 520;
  const availableWidth = Math.max(260, hostWidth - padding * 2);
  const paneWidth = Math.min(460, availableWidth);
  const paneHeight = 280;
  const strideX = paneWidth + gap;
  const strideY = paneHeight + gap;
  const columns = Math.max(1, Math.floor((availableWidth + gap) / strideX));
  const safeIndex = Math.max(0, index);
  const column = safeIndex % columns;
  const row = Math.floor(safeIndex / columns);
  return {
    h: paneHeight,
    w: paneWidth,
    x: (host?.scrollLeft || 0) + padding + column * strideX,
    y: (host?.scrollTop || 0) + padding + row * strideY
  };
}

function applyManualLayout(terminal, layout) {
  terminal.pane.style.setProperty("--manual-x", `${layout.x}px`);
  terminal.pane.style.setProperty("--manual-y", `${layout.y}px`);
  terminal.pane.style.setProperty("--manual-w", `${layout.w}px`);
  terminal.pane.style.setProperty("--manual-h", `${layout.h}px`);
}

function syncManualLayout(terminal) {
  if (state.settings.layout !== "manual") return;

  const layout = ensureManualLayout(terminal.id);
  const rect = terminal.pane.getBoundingClientRect();
  layout.w = Math.round(rect.width);
  layout.h = Math.round(rect.height);
  saveManualLayouts();
  scheduleFit(terminal);
}

function revealTerminal(terminal) {
  window.requestAnimationFrame(() => {
    terminal.pane.scrollIntoView({ block: "nearest", inline: "nearest" });
    scheduleFit(terminal);
  });
}

function setBridgeStatus(text, tone) {
  elements.bridgeStatus.textContent = text;
  elements.bridgeStatus.dataset.tone = tone;
}

function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem("multiterm.settings") || "{}") };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings() {
  localStorage.setItem("multiterm.settings", JSON.stringify(state.settings));
}

function loadManualLayouts() {
  try {
    return JSON.parse(localStorage.getItem("multiterm.manualLayouts") || "{}");
  } catch {
    return {};
  }
}

function saveManualLayouts() {
  localStorage.setItem("multiterm.manualLayouts", JSON.stringify(state.manualLayouts));
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function applySnapLayout() {
  const snap = state.snap && state.terminals.has(state.snap.id) ? state.snap : null;

  if (!snap) {
    state.snap = null;
    delete elements.host.dataset.snapEdge;
    elements.host.style.removeProperty("--snap-rest-count");
    for (const terminal of state.terminals.values()) {
      terminal.pane.classList.remove("is-snapped", "is-snap-rest");
    }
    return;
  }

  elements.host.dataset.snapEdge = snap.edge;
  elements.host.style.setProperty("--snap-rest-count", Math.max(1, state.terminals.size - 1));

  for (const terminal of state.terminals.values()) {
    const isSnapped = terminal.id === snap.id;
    terminal.pane.classList.toggle("is-snapped", isSnapped);
    terminal.pane.classList.toggle("is-snap-rest", !isSnapped);
  }
}

/* ---------------- Ripple (Material) --------------- */

function attachRipples() {
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const button = event.target.closest("button");
    if (!button || button.disabled) return;

    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    button.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
  });
}

/* ---------------- Toasts (Material snackbar) --------------- */

function toast(message, tone = "success", timeout = 3200) {
  if (!elements.toastHost) return;

  const el = document.createElement("div");
  el.className = `toast toast-${tone}`;
  el.textContent = message;
  elements.toastHost.append(el);
  window.requestAnimationFrame(() => el.classList.add("is-in"));

  const dismiss = () => {
    el.classList.remove("is-in");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  };

  const timer = window.setTimeout(dismiss, timeout);
  el.addEventListener("click", () => {
    window.clearTimeout(timer);
    dismiss();
  });
}

/* ---------------- Log console (tail view) --------------- */

function bindLogConsole() {
  if (!elements.logToggle) return;
  elements.logToggle.addEventListener("click", toggleLogPanel);
  elements.logClose.addEventListener("click", () => setLogPanel(false));
  elements.logClear.addEventListener("click", clearLogs);
  elements.logCopy.addEventListener("click", copyLogs);
  elements.logLevelFilter.value = logStore.minLevel;
  elements.logLevelFilter.addEventListener("change", () => {
    logStore.minLevel = elements.logLevelFilter.value;
    log.debug("ui", `Log filter set to ${logStore.minLevel}+`);
    renderAllLogs();
  });
  elements.logOutput.addEventListener("scroll", () => {
    const out = elements.logOutput;
    logStore.autoscroll = out.scrollTop + out.clientHeight >= out.scrollHeight - 24;
  });
}

function toggleLogPanel() {
  setLogPanel(elements.logPanel.hidden);
}

function setLogPanel(open) {
  if (!elements.logPanel) return;
  elements.logPanel.hidden = !open;
  elements.logToggle.hidden = open;
  elements.logToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    logStore.unseenError = false;
    if (elements.logFabDot) elements.logFabDot.hidden = true;
    logStore.autoscroll = true;
    renderAllLogs();
    scrollLogToEnd();
    log.debug("ui", "Log console opened");
  }
}

function passesLogFilter(entry) {
  return LOG_LEVEL_RANK[entry.level] >= LOG_LEVEL_RANK[logStore.minLevel];
}

function formatLogTime(time) {
  const date = new Date(time);
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function safeLogDetail(detail) {
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function buildLogRow(entry) {
  const row = document.createElement("div");
  row.className = `log-row log-${entry.level}`;
  row.dataset.id = entry.id;

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = formatLogTime(entry.time);

  const level = document.createElement("span");
  level.className = "log-level";
  level.textContent = entry.level;

  const source = document.createElement("span");
  source.className = "log-source";
  source.textContent = entry.source;

  const message = document.createElement("span");
  message.className = "log-msg";
  message.textContent = entry.detail !== undefined
    ? `${entry.message}  ${safeLogDetail(entry.detail)}`
    : entry.message;

  row.append(time, level, source, message);
  return row;
}

function appendLogRow(entry) {
  const out = elements.logOutput;
  if (!out || !elements.logPanel || elements.logPanel.hidden) return;
  if (!passesLogFilter(entry)) return;

  const empty = out.querySelector(".log-empty");
  if (empty) empty.remove();

  out.append(buildLogRow(entry));
  while (out.childElementCount > logStore.max) {
    out.firstElementChild.remove();
  }
  if (logStore.autoscroll) scrollLogToEnd();
}

function renderAllLogs() {
  const out = elements.logOutput;
  if (!out) return;

  out.textContent = "";
  const visible = logStore.entries.filter(passesLogFilter);
  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "log-empty";
    empty.textContent = "No log entries at this level yet.";
    out.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of visible) {
    fragment.append(buildLogRow(entry));
  }
  out.append(fragment);
  if (logStore.autoscroll) scrollLogToEnd();
}

function scrollLogToEnd() {
  const out = elements.logOutput;
  if (out) out.scrollTop = out.scrollHeight;
}

function clearLogs() {
  logStore.entries = [];
  renderAllLogs();
  log.info("ui", "Log console cleared");
}

function copyLogs() {
  const text = logStore.entries
    .filter(passesLogFilter)
    .map((entry) => {
      const detail = entry.detail !== undefined ? `  ${safeLogDetail(entry.detail)}` : "";
      return `${formatLogTime(entry.time)} [${entry.level}] [${entry.source}] ${entry.message}${detail}`;
    })
    .join("\n");

  if (!text) {
    toast("No logs to copy", "info", 1600);
    return;
  }
  navigator.clipboard.writeText(text).then(
    () => toast("Logs copied", "success", 1600),
    () => toast("Copy failed", "error", 1800)
  );
}

function ingestServerLog(message) {
  logEvent(message.level, message.source || "server", message.message || "", null);
}

/* ---------------- Per-pane actions --------------- */

function clearTerminal(id) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;
  terminal.term.clear();
  terminal.searchText = "";
  refreshTerminalSearchText(terminal);
}

function clearActiveTerminal() {
  if (state.activeId) clearTerminal(state.activeId);
}

function terminalBufferText(term) {
  const buffer = term.buffer.active;
  const lines = [];
  for (let i = 0; i < buffer.length; i += 1) {
    const line = buffer.getLine(i);
    if (line) lines.push(line.translateToString(true));
  }
  return lines.join("\n").replace(/\s+$/, "");
}

async function copyTerminalOutput(id) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;

  const selection = terminal.term.getSelection();
  const text = selection || terminalBufferText(terminal.term);
  if (!text) {
    toast("Nothing to copy", "info", 1800);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    toast(selection ? "Selection copied" : "Output copied", "success", 1800);
  } catch {
    toast("Clipboard unavailable", "error");
  }
}

function copyActiveTerminal() {
  if (state.activeId) copyTerminalOutput(state.activeId);
}

function cycleTerminal(direction) {
  const ids = [...state.terminals.keys()];
  if (ids.length === 0) return;
  const current = ids.indexOf(state.activeId);
  const next = ids[(current + direction + ids.length) % ids.length];
  setActiveTerminalAndReveal(next);
}

function setActiveTerminalAndReveal(id) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;
  setActiveTerminal(id);
  revealTerminal(terminal);
  terminal.term.focus();
}

function setLayoutMode(value) {
  clearSnapLayout(false);
  state.settings.layout = value;
  elements.layoutMode.value = value;
  applySettings();
  saveSettings();
}

function fontZoom(delta) {
  const next = Math.min(22, Math.max(10, state.settings.fontSize + delta));
  if (next === state.settings.fontSize) return;
  state.settings.fontSize = next;
  elements.fontSize.value = next;
  applySettings();
  saveSettings();
}

function resetFontZoom() {
  state.settings.fontSize = defaultSettings.fontSize;
  elements.fontSize.value = defaultSettings.fontSize;
  applySettings();
  saveSettings();
}

/* ---------------- Command palette --------------- */

function getCommands() {
  const commands = [
    { label: "New terminal", hint: "Ctrl+T", run: () => addTerminal({ reveal: true, runStartup: true }) },
    { label: "New PowerShell 7 terminal", run: () => addTerminal({ reveal: true, runStartup: true, shell: "pwsh", title: "PowerShell 7" }) },
    { label: "New Windows PowerShell terminal", run: () => addTerminal({ reveal: true, runStartup: true, shell: "powershell", title: "Windows PowerShell" }) },
    { label: "New Command Prompt terminal", run: () => addTerminal({ reveal: true, runStartup: true, shell: "cmd", title: "Command Prompt" }) },
    { label: "New WSL terminal", run: () => addTerminal({ reveal: true, runStartup: true, shell: "wsl", title: "WSL" }) },
    { label: "Close active terminal", hint: "Ctrl+Shift+W", run: () => state.activeId && removeTerminal(state.activeId) },
    { label: "Minimize active terminal", run: () => state.activeId && minimizeTerminal(state.activeId) },
    { label: "Restore all minimized terminals", run: restoreAllTerminals },
    { label: "Close all terminals", run: closeAllTerminals },
    { label: "Restart active terminal", hint: "Ctrl+Shift+R", run: restartActiveSession },
    { label: "Find in active terminal", hint: "Ctrl+Shift+F", run: openFindActive },
    { label: "Clear active terminal", hint: "Ctrl+Shift+L", run: clearActiveTerminal },
    { label: "Copy active output", hint: "Ctrl+Shift+C", run: copyActiveTerminal },
    { label: "Cycle active terminal color", run: () => state.activeId && cyclePaneColor(state.terminals.get(state.activeId)) },
    { label: "Fit all terminals", run: fitAllTerminals },
    { label: "Reset layout", run: resetLayout },
    { label: "Broadcast command…", hint: "Ctrl+Shift+B", run: () => toggleBroadcast(true) },
    { label: "Paste into active terminal", hint: "Ctrl+Shift+V", run: pasteIntoActive },
    { label: "Next terminal", run: () => cycleTerminal(1) },
    { label: "Previous terminal", run: () => cycleTerminal(-1) },
    { label: "Increase font size", hint: "Ctrl++", run: () => fontZoom(1) },
    { label: "Decrease font size", hint: "Ctrl+-", run: () => fontZoom(-1) },
    { label: "Toggle app theme", run: toggleAppTheme },
    { label: "Toggle header", run: () => toggleChrome("headerHidden") },
    { label: "Toggle layout panel", run: () => toggleChrome("sidecarHidden") },
    { label: "Keyboard shortcuts", hint: "Ctrl+/", run: openShortcuts },
    { label: "Help", run: openHelp },
    { label: "About MultiTerm", run: openAbout },
    {
      label: `Toggle sync input (${state.settings.syncInput ? "on" : "off"})`,
      run: () => {
        elements.syncInput.checked = !elements.syncInput.checked;
        elements.syncInput.dispatchEvent(new Event("change"));
        toast(`Sync input ${elements.syncInput.checked ? "on" : "off"}`, "info", 1600);
      }
    }
  ];

  const layouts = [
    ["Auto fit", "auto"],
    ["Fixed columns", "columns"],
    ["Fixed rows", "rows"],
    ["Horizontal strip", "horizontal"],
    ["Vertical stack", "vertical"],
    ["Focus rail", "focus"],
    ["Balanced grid", "grid"],
    ["Master top", "master-top"],
    ["Master right", "master-right"],
    ["Bento grid", "bento"],
    ["Manual canvas", "manual"]
  ];
  for (const [label, value] of layouts) {
    commands.push({ label: `Layout: ${label}`, run: () => setLayoutMode(value) });
  }

  for (const terminal of state.terminals.values()) {
    const id = terminal.id;
    commands.push({ label: `Focus: ${terminal.titleInput.value}`, run: () => setActiveTerminalAndReveal(id) });
  }

  for (const name of Object.keys(state.workspaces).sort((a, b) => a.localeCompare(b))) {
    commands.push({ label: `Restore workspace: ${name}`, run: () => restoreWorkspace(name) });
  }

  return commands;
}

function bindPalette() {
  elements.paletteInput.addEventListener("input", () => renderPalette());
  elements.paletteInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      movePaletteSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      movePaletteSelection(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runPaletteSelection();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    }
  });

  elements.paletteOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.paletteOverlay) closePalette();
  });

  elements.paletteList.addEventListener("click", (event) => {
    const item = event.target.closest(".palette-item");
    if (!item) return;
    palette.index = Number(item.dataset.index);
    runPaletteSelection();
  });
}

function openPalette() {
  palette.open = true;
  palette.index = 0;
  elements.paletteOverlay.hidden = false;
  window.requestAnimationFrame(() => elements.paletteOverlay.classList.add("is-open"));
  elements.paletteInput.value = "";
  renderPalette();
  elements.paletteInput.focus();
}

function closePalette() {
  if (!palette.open) return;
  palette.open = false;
  elements.paletteOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.paletteOverlay.hidden = true;
  }, 150);
  if (state.activeId) {
    state.terminals.get(state.activeId)?.term.focus();
  }
}

function renderPalette() {
  const query = normalizeSearchText(elements.paletteInput.value);
  const all = getCommands();
  palette.items = query ? all.filter((cmd) => normalizeSearchText(cmd.label).includes(query)) : all;
  palette.index = Math.min(palette.index, Math.max(0, palette.items.length - 1));

  elements.paletteList.innerHTML = "";
  if (palette.items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "palette-empty";
    empty.textContent = "No matching commands";
    elements.paletteList.append(empty);
    return;
  }

  palette.items.forEach((cmd, index) => {
    const li = document.createElement("li");
    li.className = "palette-item";
    li.dataset.index = index;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(index === palette.index));

    const label = document.createElement("span");
    label.textContent = cmd.label;
    li.append(label);

    if (cmd.hint) {
      const hint = document.createElement("span");
      hint.className = "palette-hint";
      hint.textContent = cmd.hint;
      li.append(hint);
    }

    elements.paletteList.append(li);
  });
}

function movePaletteSelection(direction) {
  if (palette.items.length === 0) return;
  palette.index = (palette.index + direction + palette.items.length) % palette.items.length;
  const nodes = elements.paletteList.querySelectorAll(".palette-item");
  nodes.forEach((node, index) => node.setAttribute("aria-selected", String(index === palette.index)));
  nodes[palette.index]?.scrollIntoView({ block: "nearest" });
}

function runPaletteSelection() {
  const command = palette.items[palette.index];
  closePalette();
  if (command) {
    window.setTimeout(() => command.run(), 60);
  }
}

/* ---------------- Global keyboard shortcuts --------------- */

function bindGlobalShortcuts() {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if ((event.ctrlKey && event.shiftKey && key === "p") || event.key === "F1") {
      event.preventDefault();
      palette.open ? closePalette() : openPalette();
      return;
    }

    if (event.ctrlKey && event.key === "/") {
      event.preventDefault();
      elements.shortcutsOverlay.hidden ? openShortcuts() : closeShortcuts();
      return;
    }

    if (!elements.shortcutsOverlay.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeShortcuts();
      }
      return;
    }

    if (!elements.aboutOverlay.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAbout();
      }
      return;
    }

    if (!elements.helpOverlay.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHelp();
      }
      return;
    }

    if (palette.open) return;

    if (event.key === "Escape" && closeAnyFind()) {
      event.preventDefault();
      return;
    }

    if (event.ctrlKey && !event.altKey && !event.metaKey && key === "t") {
      // Ctrl+T is the primary new-terminal chord; Ctrl+Shift+T also works.
      event.preventDefault();
      addTerminal({ reveal: true, runStartup: true });
    } else if (event.ctrlKey && event.shiftKey && key === "w") {
      event.preventDefault();
      if (state.activeId) removeTerminal(state.activeId);
    } else if (event.ctrlKey && event.shiftKey && key === "f") {
      event.preventDefault();
      openFindActive();
    } else if (event.ctrlKey && event.shiftKey && key === "e") {
      event.preventDefault();
      elements.terminalSearchInput.focus();
      elements.terminalSearchInput.select();
    } else if (event.ctrlKey && event.shiftKey && key === "r") {
      event.preventDefault();
      restartActiveSession();
    } else if (event.ctrlKey && event.shiftKey && key === "b") {
      event.preventDefault();
      toggleBroadcast();
    } else if (event.ctrlKey && event.shiftKey && key === "v") {
      event.preventDefault();
      pasteIntoActive();
    } else if (event.ctrlKey && event.shiftKey && key === "l") {
      event.preventDefault();
      clearActiveTerminal();
    } else if (event.ctrlKey && event.shiftKey && key === "c") {
      const active = state.activeId ? state.terminals.get(state.activeId) : null;
      if (active && !active.term.getSelection()) {
        event.preventDefault();
        copyActiveTerminal();
      }
    } else if (event.ctrlKey && event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      cycleTerminal(1);
    } else if (event.ctrlKey && event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      cycleTerminal(-1);
    } else if (event.ctrlKey && (event.key === "=" || event.key === "+")) {
      event.preventDefault();
      fontZoom(1);
    } else if (event.ctrlKey && event.key === "-") {
      event.preventDefault();
      fontZoom(-1);
    } else if (event.ctrlKey && event.key === "0") {
      event.preventDefault();
      resetFontZoom();
    }
  }, true);
}

/* ---------------- Restart session --------------- */

function restartSession(id) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;

  const meta = {
    title: terminal.titleInput.value,
    shell: terminal.shell,
    cwd: terminal.cwd
  };
  const anchor = terminal.pane.nextElementSibling;

  log.info("session", `Restarting session: ${meta.title}`, { id });
  removeTerminal(id);
  const next = addTerminal({ reveal: true, title: meta.title, shell: meta.shell, cwd: meta.cwd });
  if (next && anchor && anchor.parentElement === elements.host) {
    elements.host.insertBefore(next.pane, anchor);
  }
  toast("Session restarted", "info", 1600);
}

function restartActiveSession() {
  if (state.activeId) restartSession(state.activeId);
}

/* ---------------- In-terminal find --------------- */

const findDecorations = {
  decorations: {
    matchBackground: "#ffd75f",
    matchBorder: "#ffd75f",
    matchOverviewRuler: "#ffd75f",
    activeMatchBackground: "#f0b35a",
    activeMatchBorder: "#f0b35a",
    activeMatchColorOverviewRuler: "#f0b35a"
  }
};

function bindPaneFind(terminal) {
  const bar = terminal.pane.querySelector(".pane-find");
  if (!bar || !terminal.searchAddon) return;

  const input = bar.querySelector(".pane-find-input");
  const count = bar.querySelector(".pane-find-count");
  terminal.findBar = bar;
  terminal.findInput = input;
  terminal.findCount = count;

  terminal.searchAddon.onDidChangeResults((results) => {
    if (!results || results.resultCount === 0) {
      count.textContent = "0/0";
    } else {
      const current = results.resultIndex >= 0 ? results.resultIndex + 1 : 0;
      count.textContent = `${current}/${results.resultCount}`;
    }
  });

  input.addEventListener("input", () => {
    if (input.value) {
      terminal.searchAddon.findNext(input.value, { ...findDecorations, incremental: true });
    } else {
      terminal.searchAddon.clearDecorations();
      count.textContent = "0/0";
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      findNav(terminal, event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeFind(terminal);
    }
  });

  bar.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const kind = button.dataset.find;
    if (kind === "next") findNav(terminal, 1);
    else if (kind === "prev") findNav(terminal, -1);
    else if (kind === "close") closeFind(terminal);
  });
}

function openFind(terminal) {
  if (!terminal?.searchAddon || !terminal.findBar) return;
  setActiveTerminal(terminal.id);
  terminal.findBar.hidden = false;
  const selection = terminal.term.getSelection();
  if (selection && !selection.includes("\n")) {
    terminal.findInput.value = selection;
  }
  terminal.findInput.focus();
  terminal.findInput.select();
  if (terminal.findInput.value) {
    terminal.searchAddon.findNext(terminal.findInput.value, findDecorations);
  }
}

function openFindActive() {
  if (state.activeId) openFind(state.terminals.get(state.activeId));
}

function closeFind(terminal) {
  if (!terminal?.findBar) return;
  terminal.findBar.hidden = true;
  terminal.searchAddon?.clearDecorations();
  terminal.term.focus();
}

function closeAnyFind() {
  for (const terminal of state.terminals.values()) {
    if (terminal.findBar && !terminal.findBar.hidden) {
      closeFind(terminal);
      return true;
    }
  }
  return false;
}

function findNav(terminal, direction) {
  if (!terminal?.searchAddon || !terminal.findInput.value) return;
  if (direction < 0) {
    terminal.searchAddon.findPrevious(terminal.findInput.value, findDecorations);
  } else {
    terminal.searchAddon.findNext(terminal.findInput.value, findDecorations);
  }
}

/* ---------------- Broadcast command bar --------------- */

function toggleBroadcast(force) {
  const show = typeof force === "boolean" ? force : elements.broadcastBar.hidden;
  elements.broadcastBar.hidden = !show;
  elements.broadcastToggle.setAttribute("aria-pressed", String(show));
  if (show) {
    elements.broadcastInput.focus();
    elements.broadcastInput.select();
  } else if (state.activeId) {
    state.terminals.get(state.activeId)?.term.focus();
  }
}

function toggleBroadcastScope() {
  state.broadcastScope = state.broadcastScope === "all" ? "active" : "all";
  elements.broadcastScope.dataset.scope = state.broadcastScope;
  elements.broadcastScope.textContent = state.broadcastScope === "all" ? "All terminals" : "Active only";
}

function sendBroadcast() {
  const command = elements.broadcastInput.value;
  if (!command) return;

  const ids = state.broadcastScope === "all"
    ? [...state.terminals.keys()]
    : state.activeId ? [state.activeId] : [];

  if (ids.length === 0) {
    toast("No target terminal", "info", 1800);
    return;
  }

  let sent = 0;
  for (const id of ids) {
    if (sendBridge({ type: "input", id, data: `${command}\r` })) sent += 1;
  }

  log.info("broadcast", `Broadcast to ${sent} ${sent === 1 ? "terminal" : "terminals"}`, { scope: state.broadcastScope });
  toast(`Sent to ${sent} ${sent === 1 ? "terminal" : "terminals"}`, "success", 1600);
  elements.broadcastInput.select();
}

/* ---------------- Paste --------------- */

async function pasteIntoTerminal(id) {
  if (!id || !state.terminals.has(id)) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text) sendBridge({ type: "input", id, data: text });
  } catch {
    toast("Clipboard unavailable", "error");
  }
}

function pasteIntoActive() {
  if (state.activeId) pasteIntoTerminal(state.activeId);
}

/* ---------------- Workspaces --------------- */

function loadWorkspaces() {
  try {
    return JSON.parse(localStorage.getItem("multiterm.workspaces") || "{}");
  } catch {
    return {};
  }
}

function saveWorkspaces() {
  localStorage.setItem("multiterm.workspaces", JSON.stringify(state.workspaces));
}

function refreshWorkspaceSelect(selected) {
  const names = Object.keys(state.workspaces).sort((a, b) => a.localeCompare(b));
  elements.workspaceSelect.innerHTML = "";

  if (names.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No saved workspaces";
    option.disabled = true;
    option.selected = true;
    elements.workspaceSelect.append(option);
    return;
  }

  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    elements.workspaceSelect.append(option);
  }
  if (selected && state.workspaces[selected]) {
    elements.workspaceSelect.value = selected;
  }
  refreshComboboxes();
}

function saveWorkspace(rawName) {
  const name = String(rawName || "").trim();
  if (!name) {
    toast("Enter a workspace name", "info", 1800);
    elements.workspaceName.focus();
    return;
  }

  state.workspaces[name] = {
    savedAt: new Date().toISOString(),
    settings: { ...state.settings },
    terminals: [...state.terminals.values()].map((terminal) => ({
      title: terminal.titleInput.value,
      shell: terminal.shell,
      cwd: terminal.cwd,
      color: terminal.color
    }))
  };
  saveWorkspaces();
  refreshWorkspaceSelect(name);
  elements.workspaceName.value = "";
  log.info("workspace", `Saved workspace “${name}”`, { terminals: state.terminals.size });
  toast(`Saved workspace “${name}”`, "success");
}

function restoreWorkspace(name) {
  const workspace = name && state.workspaces[name];
  if (!workspace) {
    toast("Select a workspace first", "info", 1800);
    return;
  }

  state.settings = { ...defaultSettings, ...workspace.settings };
  syncControlsFromSettings();
  clearSnapLayout(false);
  applySettings();
  saveSettings();

  for (const terminal of [...state.terminals.values()]) {
    disposeTerminal(terminal);
  }
  state.activeId = null;

  const list = Array.isArray(workspace.terminals) && workspace.terminals.length > 0
    ? workspace.terminals
    : [{ title: "PowerShell 7", shell: "pwsh" }];
  for (const meta of list) {
    addTerminal({ title: meta.title, shell: meta.shell, cwd: meta.cwd, color: meta.color });
  }

  updateTerminalActions();
  log.info("workspace", `Restored workspace “${name}”`, { terminals: list.length });
  toast(`Restored “${name}”`, "success");
}

function deleteWorkspace(name) {
  if (!name || !state.workspaces[name]) {
    toast("Select a workspace first", "info", 1800);
    return;
  }
  delete state.workspaces[name];
  saveWorkspaces();
  refreshWorkspaceSelect();
  log.info("workspace", `Deleted workspace “${name}”`);
  toast(`Deleted “${name}”`, "info");
}

function syncControlsFromSettings() {
  elements.layoutMode.value = state.settings.layout;
  elements.minWidth.value = state.settings.minWidth;
  elements.columnCount.value = state.settings.columns;
  elements.rowCount.value = state.settings.rows;
  elements.paneHeight.value = state.settings.paneHeight;
  elements.focusWidth.value = state.settings.focusWidth;
  elements.paneGap.value = state.settings.gap;
  elements.fontSize.value = state.settings.fontSize;
  elements.terminalTheme.value = state.settings.theme;
  elements.appTheme.value = state.settings.appTheme;
  elements.fontFamily.value = state.settings.fontFamily;
  elements.cursorStyle.value = state.settings.cursorStyle;
  elements.cursorBlink.checked = state.settings.cursorBlink;
  elements.compactChrome.checked = state.settings.compactChrome;
  elements.syncInput.checked = state.settings.syncInput;
  elements.restoreSession.checked = state.settings.restoreSession;
  elements.bellNotify.checked = state.settings.bellNotify;
  elements.copyOnSelect.checked = state.settings.copyOnSelect;
  elements.startupCommand.value = state.settings.startupCommand;
  refreshComboboxes();
}

/* ---------------- Per-terminal color labels --------------- */

function applyPaneColor(terminal) {
  if (terminal.color) {
    terminal.pane.style.setProperty("--pane-accent", terminal.color);
    terminal.pane.classList.add("has-color");
  } else {
    terminal.pane.style.removeProperty("--pane-accent");
    terminal.pane.classList.remove("has-color");
  }
}

function cyclePaneColor(terminal) {
  const current = terminal.color ? PANE_COLORS.indexOf(terminal.color) : -1;
  const nextIndex = current + 1;
  terminal.color = nextIndex >= PANE_COLORS.length ? null : PANE_COLORS[nextIndex];
  applyPaneColor(terminal);
  saveSessionSnapshot();
}

/* ---------------- Bell notifications --------------- */

function handleBell(terminal) {
  if (!state.settings.bellNotify) return;

  const name = terminal.titleInput.value || "Terminal";
  if (terminal.id !== state.activeId || document.hidden) {
    toast(`🔔 ${name}`, "info", 2600);
    markActivity(terminal, true);
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("MultiTerm", { body: `Bell in ${name}` });
      } catch {
        /* ignore */
      }
    }
  }
}

/* ---------------- Session snapshot (auto-restore) --------------- */

function saveSessionSnapshot() {
  const snapshot = [...state.terminals.values()].map((terminal) => ({
    title: terminal.titleInput.value,
    shell: terminal.shell,
    cwd: terminal.cwd,
    color: terminal.color,
    minimized: terminal.minimized
  }));
  localStorage.setItem("multiterm.lastSession", JSON.stringify(snapshot));
}

function loadSessionSnapshot() {
  try {
    const value = JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/* ---------------- Shortcuts cheat sheet --------------- */

function openShortcuts() {
  closePalette();
  elements.shortcutsOverlay.hidden = false;
  window.requestAnimationFrame(() => elements.shortcutsOverlay.classList.add("is-open"));
  refreshIcons();
}

function closeShortcuts() {
  elements.shortcutsOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.shortcutsOverlay.hidden = true;
  }, 150);
}

/* ---------------- Help --------------- */

function openHelp() {
  closePalette();
  const resolved = document.documentElement.dataset.appTheme === "light" ? "light" : "dark";
  const wanted = `help.html?theme=${resolved}`;
  // Load (or reload with the current theme) only when needed.
  if (elements.helpFrame.dataset.src !== wanted) {
    elements.helpFrame.dataset.src = wanted;
    elements.helpFrame.src = wanted;
  }
  elements.helpOverlay.hidden = false;
  window.requestAnimationFrame(() => elements.helpOverlay.classList.add("is-open"));
  refreshIcons();
}

function closeHelp() {
  elements.helpOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.helpOverlay.hidden = true;
  }, 150);
}

/* ---------------- About --------------- */

function applyVersion() {
  if (elements.aboutVersion) elements.aboutVersion.textContent = `v${APP_VERSION}`;
  if (elements.aboutVersionText) elements.aboutVersionText.textContent = APP_VERSION;
}

function openAbout() {
  closePalette();
  elements.aboutOverlay.hidden = false;
  window.requestAnimationFrame(() => elements.aboutOverlay.classList.add("is-open"));
  refreshIcons();
}

function closeAbout() {
  elements.aboutOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.aboutOverlay.hidden = true;
  }, 150);
}

/* ---------------- Terminal context menu --------------- */

function bindContextMenu() {
  elements.host.addEventListener("contextmenu", (event) => {
    const pane = event.target.closest(".terminal-pane");
    if (!pane) return;
    // Let the pane title input use the native editing menu.
    if (event.target.closest(".pane-title")) return;

    const terminal = state.terminals.get(pane.dataset.id);
    if (!terminal) return;

    event.preventDefault();
    setActiveTerminal(terminal.id);
    showContextMenu(event.clientX, event.clientY, terminal);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!elements.contextMenu.hidden && !elements.contextMenu.contains(event.target)) {
      hideContextMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.contextMenu.hidden) hideContextMenu();
  });
  window.addEventListener("blur", hideContextMenu);
  window.addEventListener("resize", hideContextMenu);
  elements.host.addEventListener("scroll", hideContextMenu, true);
}

function buildContextMenu(terminal) {
  const hasSelection = Boolean(terminal.term.getSelection());
  const items = [
    { label: "Copy", hint: "Ctrl+Shift+C", icon: "clipboard-copy", disabled: !hasSelection, run: () => copyTerminalOutput(terminal.id) },
    { label: "Copy all output", icon: "copy", run: () => { terminal.term.clearSelection(); copyTerminalOutput(terminal.id); } },
    { label: "Paste", hint: "Ctrl+Shift+V", icon: "clipboard-paste", run: () => pasteIntoTerminal(terminal.id) },
    { label: "Select all", icon: "text-select", run: () => terminal.term.selectAll() },
    { separator: true },
    { label: "Find\u2026", hint: "Ctrl+Shift+F", icon: "search", run: () => openFind(terminal) },
    { label: "Clear", hint: "Ctrl+Shift+L", icon: "eraser", run: () => clearTerminal(terminal.id) },
    { separator: true },
    { label: "Split (duplicate)", icon: "copy-plus", run: () => addTerminal({ reveal: true, runStartup: true, title: `${terminal.titleInput.value} copy` }) },
    { label: "Restart", hint: "Ctrl+Shift+R", icon: "rotate-cw", run: () => restartSession(terminal.id) },
    { label: "Cycle color", icon: "tag", run: () => cyclePaneColor(terminal) },
    { separator: true },
    { label: "Close", hint: "Ctrl+Shift+W", icon: "x", danger: true, run: () => removeTerminal(terminal.id) }
  ];

  elements.contextMenu.innerHTML = "";
  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement("div");
      sep.className = "ctx-sep";
      elements.contextMenu.append(sep);
      continue;
    }

    const el = document.createElement("div");
    el.className = `ctx-item${item.danger ? " danger" : ""}`;
    el.setAttribute("role", "menuitem");
    if (item.disabled) el.setAttribute("aria-disabled", "true");

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", item.icon);
    el.append(icon);

    const label = document.createElement("span");
    label.textContent = item.label;
    el.append(label);

    if (item.hint) {
      const hint = document.createElement("span");
      hint.className = "ctx-hint";
      hint.textContent = item.hint;
      el.append(hint);
    }

    if (!item.disabled) {
      el.addEventListener("click", () => {
        hideContextMenu();
        item.run();
      });
    }
    elements.contextMenu.append(el);
  }
}

function showContextMenu(x, y, terminal) {
  buildContextMenu(terminal);
  const menu = elements.contextMenu;
  menu.hidden = false;
  menu.style.left = "0px";
  menu.style.top = "0px";

  const rect = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  refreshIcons();
}

function hideContextMenu() {
  if (!elements.contextMenu.hidden) {
    elements.contextMenu.hidden = true;
  }
}

/* ---------------- Searchable comboboxes --------------- */

const comboSelects = [];
let openCombo = null;

function enhanceComboboxes() {
  const targets = [
    elements.shellSelect,
    elements.layoutMode,
    elements.appTheme,
    elements.fontFamily,
    elements.cursorStyle,
    elements.terminalTheme,
    elements.workspaceSelect
  ];
  for (const select of targets) {
    if (select && !select._combo) {
      enhanceSelect(select);
      comboSelects.push(select);
    }
  }
  window.addEventListener("scroll", () => openCombo?.close(), true);
  window.addEventListener("resize", () => openCombo?.close());
  refreshIcons();
}

function refreshComboboxes() {
  for (const select of comboSelects) select._combo?.sync();
}

function enhanceSelect(select) {
  const wrap = document.createElement("div");
  wrap.className = "combobox";
  select.parentNode.insertBefore(wrap, select);
  wrap.append(select);
  select.classList.add("combobox-native");
  select.setAttribute("tabindex", "-1");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "combobox-input";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-label", select.getAttribute("aria-label") || select.id || "Select");

  const chevron = document.createElement("i");
  chevron.className = "combobox-chevron";
  chevron.setAttribute("data-lucide", "chevron-down");

  const list = document.createElement("ul");
  list.className = "combobox-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  document.body.append(list);

  wrap.append(input, chevron);

  const box = { open: false, index: 0, items: [] };

  const currentLabel = () => {
    const opt = select.options[select.selectedIndex];
    return opt ? opt.textContent : "";
  };

  const positionList = () => {
    const r = input.getBoundingClientRect();
    const height = Math.min(264, list.scrollHeight || 264);
    const spaceBelow = window.innerHeight - r.bottom;
    list.style.left = `${r.left}px`;
    list.style.width = `${r.width}px`;
    if (spaceBelow < height + 12 && r.top > spaceBelow) {
      list.style.top = `${Math.max(8, r.top - 4 - height)}px`;
    } else {
      list.style.top = `${r.bottom + 4}px`;
    }
  };

  const render = (filter) => {
    const query = (filter || "").toLowerCase();
    box.items = [...select.options].filter((o) => !o.disabled && (!query || o.textContent.toLowerCase().includes(query)));
    list.innerHTML = "";

    if (box.items.length === 0) {
      const empty = document.createElement("li");
      empty.className = "combobox-empty";
      empty.textContent = "No matches";
      list.append(empty);
      if (box.open) positionList();
      return;
    }

    box.index = query ? 0 : Math.max(0, box.items.findIndex((o) => o.value === select.value));
    box.items.forEach((o, i) => {
      const li = document.createElement("li");
      li.className = `combobox-option${i === box.index ? " is-active" : ""}`;
      li.textContent = o.textContent;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(o.value === select.value));
      li.addEventListener("mousedown", (event) => {
        event.preventDefault();
        choose(o);
      });
      list.append(li);
    });
    if (box.open) positionList();
  };

  const highlight = () => {
    [...list.children].forEach((li, i) => li.classList.toggle("is-active", i === box.index));
    list.children[box.index]?.scrollIntoView({ block: "nearest" });
  };

  const move = (delta) => {
    if (box.items.length === 0) return;
    box.index = (box.index + delta + box.items.length) % box.items.length;
    highlight();
  };

  function choose(option) {
    if (option && select.value !== option.value) {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close();
  }

  const open = () => {
    if (box.open) return;
    if (openCombo && openCombo !== api) openCombo.close();
    box.open = true;
    openCombo = api;
    wrap.classList.add("is-open");
    input.setAttribute("aria-expanded", "true");
    list.hidden = false;
    render("");
    positionList();
    input.select();
  };

  const close = () => {
    if (!box.open) return;
    box.open = false;
    if (openCombo === api) openCombo = null;
    wrap.classList.remove("is-open");
    input.setAttribute("aria-expanded", "false");
    list.hidden = true;
    sync();
  };

  const sync = () => {
    if (!box.open) input.value = currentLabel();
  };

  input.addEventListener("focus", open);
  input.addEventListener("pointerdown", () => {
    if (!box.open) open();
  });
  input.addEventListener("input", () => render(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      box.open ? move(1) : open();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(box.items[box.index]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close();
    }
  });
  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (box.open) close();
    }, 120);
  });

  const api = { close, sync };
  select._combo = api;
  sync();
}