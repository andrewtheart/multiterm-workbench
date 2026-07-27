const defaultSettings = {
  appTheme: "dark",
  bellNotify: false,
  broadcastSendEnter: true,
  closeAction: "ask",
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
  highlightInputPrompts: true,
  layout: "auto",
  minimizedScope: "page",
  minWidth: 420,
  notifyActivity: false,
  notifySilence: false,
  paneHeight: 320,
  restoreSession: false,
  rightClickAction: "menu",
  rightClickAck: "",
  rows: 2,
  scrollOnOutput: false,
  scrollback: 20000,
  scrollbackInfinite: false,
  sidecarHidden: false,
  silenceSeconds: 10,
  snippets: [
    { name: "Clear screen", command: "Clear-Host" },
    { name: "Git status", command: "git status" },
    { name: "Top processes", command: "Get-Process | Sort-Object CPU -Descending | Select-Object -First 15" }
  ],
  startupCommand: "",
  syncInput: false,
  theme: "ember"
};

const PANE_COLORS = ["#4fd1b0", "#7ca8f6", "#f0b35a", "#e8695b", "#d486e8", "#94d36f"];

// Pane width (px) below which the secondary header actions (move left/right,
// cycle label color, duplicate) collapse into the per-pane overflow menu. Below
// roughly this width the full button row starts squeezing the title field, so
// the actions move into the menu rather than crowding or hiding the title.
const PANE_OVERFLOW_WIDTH = 600;

// Bumped on each rebuild. See /memories/repo for the convention.
const APP_VERSION = "0.1.25";
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 22;

// xterm reports focus changes back to the shell as data when the application
// enables DECSET 1004 (which ConPTY does): ESC [ I on focus in, ESC [ O on
// focus out. That is protocol chatter, not the user answering a prompt, so it
// must still be forwarded but must not count as input.
const FOCUS_REPORT_SEQUENCE = /^\u001b\[[IO]$/;

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
  aboutCheckUpdates: document.querySelector("#aboutCheckUpdates"),
  aboutOverlay: document.querySelector("#aboutOverlay"),
  aboutToggle: document.querySelector("#aboutToggle"),
  aboutVersion: document.querySelector("#aboutVersion"),
  aboutVersionText: document.querySelector("#aboutVersionText"),
  bellNotify: document.querySelector("#bellNotify"),
  bridgeStatus: document.querySelector("#bridgeStatus"),
  findAllBar: document.querySelector("#findAllBar"),
  findAllInput: document.querySelector("#findAllInput"),
  findAllCount: document.querySelector("#findAllCount"),
  broadcastBar: document.querySelector("#broadcastBar"),
  broadcastClose: document.querySelector("#broadcastClose"),
  broadcastEnter: document.querySelector("#broadcastEnter"),
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
  highlightInputPrompts: document.querySelector("#highlightInputPrompts"),
  host: document.querySelector("#terminalHost"),
  layoutMode: document.querySelector("#layoutMode"),
  logClear: document.querySelector("#logClear"),
  logClose: document.querySelector("#logClose"),
  logCopy: document.querySelector("#logCopy"),
  logLevelFilter: document.querySelector("#logLevelFilter"),
  logOutput: document.querySelector("#logOutput"),
  logPanel: document.querySelector("#logPanel"),
  logToggle: document.querySelector("#logToggle"),
  logToggleDot: document.querySelector("#logToggleDot"),
  minWidth: document.querySelector("#minWidth"),
  minWidthValue: document.querySelector("#minWidthValue"),
  minimizedDock: document.querySelector("#minimizedDock"),
  notifyActivity: document.querySelector("#notifyActivity"),
  notifySilence: document.querySelector("#notifySilence"),
  paletteInput: document.querySelector("#paletteInput"),
  paletteList: document.querySelector("#paletteList"),
  paletteOverlay: document.querySelector("#paletteOverlay"),
  pagerAdd: document.querySelector("#pagerAdd"),
  pagerList: document.querySelector("#pagerList"),
  quickSwitchInput: document.querySelector("#quickSwitchInput"),
  quickSwitchList: document.querySelector("#quickSwitchList"),
  quickSwitchOverlay: document.querySelector("#quickSwitchOverlay"),
  closeConfirmOverlay: document.querySelector("#closeConfirmOverlay"),
  closeConfirmRemember: document.querySelector("#closeConfirmRemember"),
  closeConfirmTray: document.querySelector("#closeConfirmTray"),
  closeConfirmQuit: document.querySelector("#closeConfirmQuit"),
  paneGap: document.querySelector("#paneGap"),
  paneGapValue: document.querySelector("#paneGapValue"),
  paneHeight: document.querySelector("#paneHeight"),
  paneHeightValue: document.querySelector("#paneHeightValue"),
  paneTemplate: document.querySelector("#paneTemplate"),
  resetLayout: document.querySelector("#resetLayout"),
  restoreSession: document.querySelector("#restoreSession"),
  rightClickAction: document.querySelector("#rightClickAction"),
  rightClickWarnOverlay: document.querySelector("#rightClickWarnOverlay"),
  rightClickWarnText: document.querySelector("#rightClickWarnText"),
  rightClickWarnRemember: document.querySelector("#rightClickWarnRemember"),
  rightClickWarnCancel: document.querySelector("#rightClickWarnCancel"),
  rightClickWarnProceed: document.querySelector("#rightClickWarnProceed"),
  rowCount: document.querySelector("#rowCount"),
  rowCountValue: document.querySelector("#rowCountValue"),
  scrollOnOutput: document.querySelector("#scrollOnOutput"),
  scrollbackInfinite: document.querySelector("#scrollbackInfinite"),
  scrollbackLines: document.querySelector("#scrollbackLines"),
  silenceSeconds: document.querySelector("#silenceSeconds"),
  snippetAdd: document.querySelector("#snippetAdd"),
  snippetCommand: document.querySelector("#snippetCommand"),
  snippetList: document.querySelector("#snippetList"),
  snippetName: document.querySelector("#snippetName"),
  shellSelect: document.querySelector("#shellSelect"),
  snapPreview: document.querySelector("#snapPreview"),
  shortcutsClose: document.querySelector("#shortcutsClose"),
  shortcutsOverlay: document.querySelector("#shortcutsOverlay"),
  startupCommand: document.querySelector("#startupCommand"),
  statusConn: document.querySelector("#statusConn"),
  statusAdmin: document.querySelector("#statusAdmin"),
  statusMem: document.querySelector("#statusMem"),
  statusMemText: document.querySelector("#statusMemText"),
  statusSessions: document.querySelector("#statusSessions"),
  statusShellText: document.querySelector("#statusShellText"),
  statusZoomIn: document.querySelector("#statusZoomIn"),
  statusZoomOut: document.querySelector("#statusZoomOut"),
  updateClose: document.querySelector("#updateClose"),
  updateError: document.querySelector("#updateError"),
  updateInstall: document.querySelector("#updateInstall"),
  updateLater: document.querySelector("#updateLater"),
  updateNotes: document.querySelector("#updateNotes"),
  updateOverlay: document.querySelector("#updateOverlay"),
  updateProgress: document.querySelector("#updateProgress"),
  updateProgressBar: document.querySelector("#updateProgressBar"),
  updateProgressText: document.querySelector("#updateProgressText"),
  updateSubtitle: document.querySelector("#updateSubtitle"),
  updateTitle: document.querySelector("#updateTitle"),
  updateViewRelease: document.querySelector("#updateViewRelease"),
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
  activePageId: null,
  bridgeClosingDown: false,
  findAll: { active: false, order: [], ti: 0, li: -1 },
  appElevated: false,
  broadcastScope: "all",
  manualLayouts: loadManualLayouts(),
  mem: { open: false, timer: null, requested: false, stats: null, unsupported: false, unsupportedReason: null },
  nextIndex: 1,
  pages: loadPages(),
  primaryId: null,
  reconnectAttempts: 0,
  reconnectTimer: null,
  settings: loadSettings(),
  snap: null,
  socket: null,
  socketReady: false,
  terminalPages: loadTerminalPages(),
  terminalSearch: "",
  terminals: new Map(),
  update: { release: null, downloading: false, checking: false },
  workspaces: loadWorkspaces(),
  zoomedId: null
};
state.activePageId = loadActivePageId(state.pages);

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
    if (elements.logToggleDot) elements.logToggleDot.hidden = false;
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
  bindPalette();
  bindPager();
  bindQuickSwitch();
  renderPager();
  bindContextMenu();
  bindRightClickWarning();
  bindCloseConfirm();
  bindUpdateDialog();
  bindMemStatus();
  bindGlobalShortcuts();
  bindFindAll();
  window.addEventListener("resize", noteWindowResizeDrag);
  systemThemeQuery.addEventListener("change", () => {
    if (state.settings.appTheme === "system") applyAppTheme();
  });
  connectBridge();
  refreshIcons();
  refreshElevationStatus();
  // Perf (Electron guideline #4): defer low-priority, non-visual startup work to
  // an idle period so the first terminal connects and becomes interactive sooner.
  // Ripples are cosmetic; the log/diagnostics panel is opened on demand — neither
  // is needed for first paint or early input.
  whenIdle(() => {
    attachRipples();
    bindLogConsole();
    maybeCheckForUpdatesOnStartup();
  });
  log.debug("app", "UI initialized", { theme: state.settings.appTheme, layout: state.settings.layout });
});

window.addEventListener("beforeunload", () => {
  state.bridgeClosingDown = true;
  window.clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
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
  elements.highlightInputPrompts.checked = state.settings.highlightInputPrompts;
  elements.rightClickAction.value = state.settings.rightClickAction;
  elements.scrollbackLines.value = state.settings.scrollback;
  elements.scrollbackInfinite.checked = state.settings.scrollbackInfinite;
  elements.scrollOnOutput.checked = state.settings.scrollOnOutput;
  elements.notifyActivity.checked = state.settings.notifyActivity;
  elements.notifySilence.checked = state.settings.notifySilence;
  elements.silenceSeconds.value = state.settings.silenceSeconds;
  elements.startupCommand.value = state.settings.startupCommand;

  elements.addTerminal.addEventListener("click", () => addTerminal({ reveal: true, runStartup: true }));
  elements.closeAllTerminals.addEventListener("click", closeAllTerminals);
  elements.statusZoomOut.addEventListener("click", () => fontZoom(-1));
  elements.statusZoomIn.addEventListener("click", () => fontZoom(1));
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
  elements.aboutCheckUpdates?.addEventListener("click", () => {
    closeAbout();
    checkForUpdates({ manual: true });
  });
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
  elements.broadcastEnter.addEventListener("click", () => {
    state.settings.broadcastSendEnter = !state.settings.broadcastSendEnter;
    updateBroadcastEnterToggle();
    saveSettings();
  });
  updateBroadcastEnterToggle();
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
  bindSetting(elements.highlightInputPrompts, "highlightInputPrompts", "change", (_, element) => element.checked);
  bindSetting(elements.rightClickAction, "rightClickAction", "change", (value) => value);
  bindSetting(elements.scrollbackLines, "scrollback", "change", Number);
  bindSetting(elements.scrollbackInfinite, "scrollbackInfinite", "change", (_, element) => element.checked);
  bindSetting(elements.scrollOnOutput, "scrollOnOutput", "change", (_, element) => element.checked);
  bindSetting(elements.notifyActivity, "notifyActivity", "change", (_, element) => element.checked);
  bindSetting(elements.notifySilence, "notifySilence", "change", (_, element) => element.checked);
  bindSetting(elements.silenceSeconds, "silenceSeconds", "change", Number);
  bindSetting(elements.startupCommand, "startupCommand", "change", (value) => value);

  for (const notifyToggle of [elements.notifyActivity, elements.notifySilence]) {
    notifyToggle.addEventListener("change", () => {
      if (notifyToggle.checked && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    });
  }

  elements.snippetAdd.addEventListener("click", () => addSnippet(elements.snippetName.value, elements.snippetCommand.value));
  elements.snippetCommand.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addSnippet(elements.snippetName.value, elements.snippetCommand.value);
    }
  });
  renderSnippets();

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

  window.clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/ws`;
  const reconnecting = state.reconnectAttempts > 0;
  log.info("bridge", `${reconnecting ? "Reconnecting" : "Connecting"} to ${url}`);
  state.socket = new WebSocket(url);

  state.socket.addEventListener("open", () => {
    const wasReconnecting = state.reconnectAttempts > 0;
    state.socketReady = true;
    state.reconnectAttempts = 0;
    setBridgeStatus("Bridge connected", "online");
    log.info("bridge", wasReconnecting ? "WebSocket reconnected" : "WebSocket connected");
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
    for (const terminal of state.terminals.values()) {
      setTerminalStatus(terminal, "offline", "dead");
    }
    updateTerminalActions();
    scheduleReconnect();
  });

  state.socket.addEventListener("error", () => {
    state.socketReady = false;
    log.error("bridge", "WebSocket error");
    updateTerminalActions();
    // The browser fires "close" after "error"; reconnection is scheduled there.
  });
}

// Reconnect with capped exponential backoff so a dropped bridge recovers on its
// own instead of leaving the UI stuck offline until a manual page reload.
function scheduleReconnect() {
  if (state.bridgeClosingDown) return;
  if (state.reconnectTimer) return;

  const attempt = state.reconnectAttempts + 1;
  state.reconnectAttempts = attempt;
  const delay = Math.min(500 * 2 ** (attempt - 1), 3000);
  const seconds = Math.round(delay / 100) / 10;
  setBridgeStatus(`Bridge disconnected; reconnecting in ${seconds}s\u2026`, "offline");
  log.warn("bridge", `WebSocket disconnected; reconnect attempt ${attempt} in ${delay}ms`);
  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null;
    connectBridge();
  }, delay);
}

function handleBridgeMessage(message) {
  if (message.type === "log") {
    ingestServerLog(message);
    return;
  }

  if (message.type === "scriptPicked") {
    resolveBridgeRequest(message, message.path || null);
    return;
  }

  if (message.type === "welcome") {
    log.info("bridge", "Received welcome", { cwd: message.cwd, sessions: Array.isArray(message.sessions) ? message.sessions.length : 0 });
    if (!elements.cwdInput.value) {
      elements.cwdInput.value = message.cwd || "";
    }

    if (Array.isArray(message.sessions) && message.sessions.length > 0) {
      const known = new Set();
      for (const session of orderSessionsBySavedArrangement(message.sessions)) {
        known.add(session.id);
        const existing = state.terminals.get(session.id);
        if (existing) {
          reattachExistingSession(existing, session);
        } else {
          addTerminal({ reattach: true, session });
        }
      }
      // Any terminal we still hold that the bridge no longer lists must have
      // exited while we were disconnected.
      for (const terminal of state.terminals.values()) {
        if (terminal.remoteRequested && !known.has(terminal.id)) {
          markSessionLostWhileOffline(terminal);
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
    } else {
      // Reconnected but the bridge has no sessions: everything we held is gone.
      for (const terminal of state.terminals.values()) {
        if (terminal.remoteRequested) markSessionLostWhileOffline(terminal);
      }
    }

    return;
  }

  if (message.type === "created") {
    const terminal = state.terminals.get(message.id);
    if (!terminal) return;
    terminal.cwd = message.cwd;
    terminal.pid = message.pid;
    // The bridge stamps startedAt when it spawns the shell. Fall back to now if
    // an older bridge omits it — accurate to the round-trip, and better than
    // showing nothing.
    terminal.startedAt = message.startedAt || new Date().toISOString();
    terminal.remoteRequested = true;
    terminal.status = "live";
    if (message.elevated) {
      terminal.elevated = true;
      terminal.pane.classList.add("is-admin");
    }
    setTerminalStatus(terminal, `pid ${message.pid}`, "live");
    log.info("session", `Session live: ${terminal.titleInput.value}`, { id: message.id, pid: message.pid });
    updateTerminalSearchVisibility(terminal);
    scheduleFit(terminal);

    if (terminal.runStartup && state.settings.startupCommand.trim()) {
      terminal.runStartup = false;
      const command = state.settings.startupCommand.trim();
      window.setTimeout(() => sendBridge({ type: "input", id: terminal.id, data: `${command}\r` }), 250);
    }

    // A command queued at creation time (e.g. a broadcast with no terminals
    // open) runs once the shell is live, after any startup command.
    if (terminal.pendingCommand) {
      const pending = terminal.pendingCommand;
      const withEnter = terminal.pendingCommandEnter;
      terminal.pendingCommand = null;
      window.setTimeout(() => sendBridge({ type: "input", id: terminal.id, data: `${pending}${withEnter ? "\r" : ""}` }), 500);
    }
    return;
  }

  if (message.type === "output") {
    const terminal = state.terminals.get(message.id);
    if (terminal) {
      enqueueTerminalOutput(terminal, message.data);
    }
    return;
  }

  if (message.type === "logStarted") {
    const terminal = state.terminals.get(message.id);
    if (terminal) {
      terminal.logging = true;
      terminal.logPath = message.path;
    }
    toast(`Logging to ${message.path}`, "success", 3600);
    return;
  }

  if (message.type === "logStopped") {
    const terminal = state.terminals.get(message.id);
    if (terminal) terminal.logging = false;
    toast("Logging stopped", "info", 2000);
    return;
  }

  if (message.type === "logError") {
    toast(message.message || "Logging failed", "error");
    return;
  }

  if (message.type === "revealError") {
    toast(message.message || "Could not open folder", "error");
    return;
  }

  if (message.type === "openError") {
    toast(message.message || "Could not open file", "error");
    return;
  }

  if (message.type === "elevateStarted") {
    toast(`Launching elevated ${message.shell || "terminal"}\u2014approve the UAC prompt`, "info", 2800);
    return;
  }

  if (message.type === "elevateError") {
    const terminal = message.id ? state.terminals.get(message.id) : null;
    if (terminal) {
      terminal.status = "error";
      setTerminalStatus(terminal, "error", "dead");
      writelnTerminal(terminal, `\x1b[31m${message.message || "Administrator terminal failed to launch."}\x1b[0m`);
      log.error("session", `Administrator terminal failed: ${message.message || "unknown"}`, { id: message.id });
    }
    toast(message.message || "Could not open administrator terminal", "error");
    return;
  }

  if (message.type === "memstats") {
    updateMemStatus(message);
    return;
  }

  // An older bridge that predates on-demand memory stats rejects the probe with
  // a generic "Unsupported message type: memstats" error. That frame carries no
  // id, so without this guard it would fall through to the bridge-error branch
  // below and repaint the whole bridge status as offline every few seconds while
  // the memory chip is open. Treat it as "capability unavailable" instead so the
  // feature degrades quietly against bridges that don't speak memstats.
  if (message.type === "error" && /Unsupported message type:\s*memstats/i.test(message.message || "")) {
    updateMemStatus({ supported: false, reason: "bridge" });
    return;
  }

  if (message.type === "exited") {
    const terminal = state.terminals.get(message.id);
    if (!terminal) return;
    terminal.status = "exited";
    terminal.logging = false;
    setTerminalStatus(terminal, "exited", "dead");
    setAwaitingInput(terminal, false);
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

// After an auto-reconnect the bridge re-announces sessions it kept alive. Mark
// a terminal we already hold as live again so it resumes streaming output and
// its status reflects reality instead of the stale "offline" from the drop.
function reattachExistingSession(terminal, session) {
  terminal.remoteRequested = true;
  terminal.status = "live";
  if (session.cwd) terminal.cwd = session.cwd;
  if (session.pid != null) terminal.pid = session.pid;
  // The shell kept running across the drop, so its original launch time is still
  // the truth — take the bridge's copy rather than treating this as a new start.
  if (session.startedAt) terminal.startedAt = session.startedAt;
  setTerminalStatus(terminal, session.pid != null ? `pid ${session.pid}` : "live", "live");
  updateTerminalSearchVisibility(terminal);
  scheduleFit(terminal);
  log.info("session", `Session reattached: ${terminal.titleInput.value}`, { id: terminal.id, pid: session.pid });
}

// A terminal that was live before the drop but is absent from the bridge's
// session list after reconnect exited while we were offline.
function markSessionLostWhileOffline(terminal) {
  if (terminal.status === "exited") return;
  terminal.status = "exited";
  terminal.logging = false;
  setTerminalStatus(terminal, "exited", "dead");
  setAwaitingInput(terminal, false);
  writelnTerminal(terminal, "");
  writelnTerminal(terminal, "\x1b[31mSession ended while the bridge was disconnected.\x1b[0m");
  log.info("session", `Session lost while offline: ${terminal.titleInput.value}`, { id: terminal.id });
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
    allowProposedApi: true,
    allowTransparency: false,
    convertEol: false,
    cursorBlink: state.settings.cursorBlink,
    cursorStyle: state.settings.cursorStyle,
    fontFamily: fontStacks[state.settings.fontFamily] || fontStacks["Cascadia Mono"],
    fontSize: state.settings.fontSize,
    scrollback: effectiveScrollback(),
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
  const elevated = Boolean(options.elevated || session.elevated);
  if (elevated) {
    pane.dataset.elevated = "true";
    const headerIcon = pane.querySelector(".pane-title-wrap i[data-lucide]");
    if (headerIcon) headerIcon.dataset.lucide = "shield";
  }
  elements.host.append(pane);
  term.open(screen);

  const terminal = {
    color: options.color || session.color || null,
    createdAt: performance.now(),
    cwd: session.cwd || options.cwd || elements.cwdInput.value,
    awaitingInput: false,
    elevated,
    fitAddon,
    id,
    elevated: Boolean(options.elevated),
    logging: false,
    logPath: null,
    minimized: false,
    observer: null,
    pane,
    pendingCommand: typeof options.pendingCommand === "string" ? options.pendingCommand : null,
    pendingCommandEnter: options.pendingCommandEnter !== false,
    pendingOutput: [],
    outputFlushHandle: 0,
    fitScheduled: false,
    lastSentCols: 0,
    lastSentRows: 0,
    pid: session.pid,
    pageId: resolvePageId(options.pageId || session.pageId, id),
    remoteRequested: Boolean(options.reattach),
    runStartup: Boolean(options.runStartup),
    searchAddon,
    searchText: "",
    webglAddon: null,
    webglLossTimes: [],
    webglRecoveryHandle: 0,
    screen,
    shell: options.shell || session.shell || elements.shellSelect.value,
    startedAt: session.startedAt || null,
    status: options.reattach ? "live" : "starting",
    statusElement: status,
    term,
    titleInput
  };

  terminal.observer = new ResizeObserver(() => {
    updatePaneDensity(terminal);
    scheduleFit(terminal);
  });
  state.terminals.set(id, terminal);
  attachWebglRenderer(terminal);
  state.nextIndex += 1;
  updateTerminalActions();
  terminal.observer.observe(screen);
  terminal.observer.observe(pane);
  bindPaneControls(terminal);
  bindPaneDrag(terminal);
  bindPaneFind(terminal);
  applyPaneColor(terminal);
  if (terminal.elevated) pane.classList.add("is-admin");
  applyManualLayout(terminal, ensureManualLayout(id));
  // Panes for other pages are hidden immediately so a reattached session never
  // flashes onto the page you are looking at.
  pane.classList.toggle("is-page-hidden", terminal.pageId !== state.activePageId);
  renderPager();
  saveTerminalPages();
  if (isOnActivePage(terminal)) setActiveTerminal(id);
  refreshIcons();
  bindTerminalKeyHandling(terminal);
  registerCwdTracking(terminal);

  term.onData((data) => {
    // Merely clicking away from a terminal blocked on a prompt would otherwise
    // clear its awaiting flag, erasing the indicator meant to call you back.
    const isUserInput = !FOCUS_REPORT_SEQUENCE.test(data);
    const targets = state.settings.syncInput ? [...state.terminals.keys()] : [id];
    for (const targetId of targets) {
      const target = state.terminals.get(targetId);
      if (target && isUserInput) setAwaitingInput(target, false);
      sendBridge({ type: "input", id: targetId, data });
    }
  });

  term.onResize(({ cols, rows }) => {
    queueResize(terminal, cols, rows);
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
  pane.addEventListener("pointerdown", (event) => {
    // Controls own their click behavior. Terminal/chrome presses only change the
    // keyboard-active pane; the explicit Focus action owns primary-pane promotion.
    if (event.target.closest("button, select, input, a, [contenteditable]")) return;
    setActiveTerminal(id);
  });
  pane.addEventListener("pointerup", () => syncManualLayout(terminal));

  // Keep keyboard focus in sync with the pane the user clicks. Clicking a pane's
  // CHROME — its header bar, terminal padding, or screen gaps — does not move DOM
  // focus into the terminal by itself. The browser instead blurs the previously
  // focused terminal to <body>, so keystrokes can silently vanish.
  // Intercept a primary-button mousedown on non-interactive chrome, cancel the
  // default focus shift, and focus THIS pane's terminal so typing always lands
  // in the pane that was just clicked. Clicks on the xterm surface and on
  // interactive controls (title field, buttons, selects) are left untouched so
  // xterm keeps managing its own focus/selection and controls stay usable.
  pane.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest("button, select, input, textarea, a, [contenteditable]")) return;
    if (event.target.closest(".xterm")) return;
    event.preventDefault();
    term.focus();
  });

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

    if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.code === "KeyA") {
      event.preventDefault();
      event.stopPropagation();
      terminal.term.selectAll();
      return;
    }

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
      setPrimaryTerminal(terminal.id);
      setActiveTerminal(terminal.id);
      applySettings();
      saveSettings();
      // Switching to Focus-rail layout and marking the pane active does not move
      // DOM keyboard focus into the terminal — the click leaves focus on the
      // Focus button (or blurs to <body>), so keystrokes keep flowing to
      // whichever terminal was focused before. Focus the pane's terminal so
      // typing lands in the pane the user just chose to focus.
      revealTerminal(terminal);
      terminal.term.focus();
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
    } else if (action === "maximize") {
      toggleZoomPane(terminal.id);
    } else if (action === "more") {
      setActiveTerminal(terminal.id);
      showPaneOverflowMenu(button, terminal);
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

  // The elapsed time in the tooltip is only correct at the instant it is built,
  // so build it when the pointer arrives rather than leaving a stale one behind.
  terminal.statusElement.addEventListener("pointerenter", () => {
    refreshStatusPillTooltip(terminal);
  });

  // Without this the pane's own handler wins, and with "right-click pastes"
  // configured that would dump the clipboard into the shell — an odd thing for
  // a status readout to do. Right-click here reports on the session instead.
  terminal.statusElement.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveTerminal(terminal.id);
    showSessionInfoMenu(terminal);
  });
}

function bindPaneDrag(terminal) {
  const handle = terminal.pane.querySelector(".pane-bar");
  let drag = null;

  const onMove = (event) => {
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

    const active = getSnapEdges(event.clientX, event.clientY);
    for (const edge of drag.suppressEdges) {
      if (!active.includes(edge)) drag.suppressEdges.delete(edge);
    }
    drag.edge = active.find((edge) => !drag.suppressEdges.has(edge)) ?? null;
    setSnapPreview(drag.edge);

    if (state.settings.layout === "manual") {
      if (!drag.edge) {
        const layout = ensureManualLayout(terminal.id);
        layout.x = Math.max(0, drag.x + deltaX);
        layout.y = Math.max(0, drag.y + deltaY);
        applyManualLayout(terminal, layout);
      }
      return;
    }

    // Every non-manual layout positions panes by DOM order, so dragging one over
    // its neighbours can rearrange the grid live. An edge snap takes priority:
    // while one is previewed the pane drops back into its slot so the preview
    // reads as the outcome.
    if (drag.edge) {
      clearPaneLift(terminal.pane, drag);
      return;
    }

    if (reorderPaneDuringDrag(terminal.pane, drag, event.clientX, event.clientY)) {
      drag.reordered = true;
    }
    liftPane(terminal.pane, drag, event.clientX, event.clientY);
  };

  const onUp = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    stopTracking();
    finishPaneDrag(terminal, drag);
    drag = null;
  };

  const onCancel = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    stopTracking();
    endPaneDrag(terminal);
    drag = null;
  };

  function stopTracking() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  }

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button,select")) return;

    const layout = ensureManualLayout(terminal.id);
    const rect = terminal.pane.getBoundingClientRect();
    drag = {
      edge: null,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      pointerId: event.pointerId,
      reordered: false,
      started: false,
      startX: event.clientX,
      startY: event.clientY,
      // Pane bars run along the top of each pane, so grabbing one in the top row
      // or left column puts the pointer inside a snap zone before the drag has
      // gone anywhere - and a top-row bar never leaves the top zone while being
      // dragged sideways. Every edge the pointer already occupies is disarmed and
      // re-armed individually once the pointer leaves it, so a pane can still be
      // rearranged along the edge it started on while the other edges stay live.
      suppressEdges: new Set(getSnapEdges(event.clientX, event.clientY)),
      tx: 0,
      ty: 0,
      x: layout.x,
      y: layout.y
    };

    // Pointer capture is deliberately not used: rearranging re-inserts the pane,
    // and re-inserting an element releases its capture, which would strand the
    // drag with the pane still lifted. Tracking on the window survives that and
    // also catches a release that happens off the bar.
    stopTracking();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
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
  } else if (drag.started && drag.reordered) {
    syncTerminalOrderToDom();
    saveSessionSnapshot();
    fitAllTerminals();
  }

  endPaneDrag(terminal);
}

// The pane tracks the cursor by transform rather than by layout, so the grid can
// keep reflowing underneath it. The offset is corrected against the pane's live
// rect each move instead of accumulated from the drag origin, which keeps the
// grab point under the cursor even after a reorder moves the pane's home slot.
function liftPane(pane, drag, x, y) {
  const rect = pane.getBoundingClientRect();
  drag.tx += x - (rect.left + drag.grabX);
  drag.ty += y - (rect.top + drag.grabY);
  pane.style.transform = `translate(${drag.tx}px, ${drag.ty}px)`;
}

function clearPaneLift(pane, drag) {
  drag.tx = 0;
  drag.ty = 0;
  pane.style.transform = "";
}

function paneUnderPoint(x, y, exclude) {
  for (const terminal of state.terminals.values()) {
    if (terminal.pane === exclude || terminal.minimized) continue;
    const rect = terminal.pane.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return terminal.pane;
    }
  }
  return null;
}

// Moves the dragged pane past whichever pane the cursor is over. The swap only
// commits once the cursor crosses that pane's midpoint on the axis the two are
// separated along, so resting near a shared edge cannot oscillate.
function reorderPaneDuringDrag(pane, drag, x, y) {
  const target = paneUnderPoint(x, y, pane);
  if (!target) return false;

  const targetRect = target.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();
  const horizontal =
    Math.abs(targetRect.left - (paneRect.left - drag.tx)) >=
    Math.abs(targetRect.top - (paneRect.top - drag.ty));
  const pointer = horizontal ? x : y;
  const midpoint = horizontal
    ? targetRect.left + targetRect.width / 2
    : targetRect.top + targetRect.height / 2;
  const targetIsEarlier = Boolean(
    target.compareDocumentPosition(pane) & Node.DOCUMENT_POSITION_FOLLOWING
  );

  if (targetIsEarlier ? pointer > midpoint : pointer < midpoint) return false;

  const before = capturePaneRects(pane);
  if (targetIsEarlier) {
    elements.host.insertBefore(pane, target);
  } else {
    elements.host.insertBefore(pane, target.nextElementSibling);
  }
  animatePaneShuffle(before, pane);
  return true;
}

function capturePaneRects(exclude) {
  const rects = [];
  for (const terminal of state.terminals.values()) {
    if (terminal.pane === exclude || terminal.minimized) continue;
    rects.push([terminal.pane, terminal.pane.getBoundingClientRect()]);
  }
  return rects;
}

// A grid reflow snaps panes to their new cells with no motion, so displaced panes
// are animated the FLIP way: put each one back where it was, then let the normal
// transform transition carry it to its new home.
function animatePaneShuffle(before, exclude) {
  const moved = [];

  for (const [pane, first] of before) {
    if (pane === exclude) continue;

    const last = pane.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (!dx && !dy) continue;

    pane.style.transition = "none";
    pane.style.transform = `translate(${dx}px, ${dy}px)`;
    moved.push(pane);
  }

  if (!moved.length) return;

  // One flush for the whole batch. Reading a layout property forces the inverted
  // positions to take effect before they are cleared; without it both writes land
  // in the same frame and only the final one is painted, so nothing animates.
  // Reading once here rather than per pane keeps a wide reshuffle to a single
  // forced reflow.
  void elements.host.offsetWidth;

  for (const pane of moved) {
    pane.style.transition = "";
    pane.style.transform = "";
  }
}

// Grid order is DOM order, but the session snapshot is written from the terminal
// map, so the map is realigned after a rearrange to keep a restored session in
// the order the user left it.
function syncTerminalOrderToDom() {
  const ordered = [];
  for (const pane of elements.host.children) {
    const terminal = state.terminals.get(pane.dataset.id);
    if (terminal) ordered.push(terminal);
  }
  if (ordered.length !== state.terminals.size) return;

  state.terminals.clear();
  for (const terminal of ordered) state.terminals.set(terminal.id, terminal);
}

function endPaneDrag(terminal) {
  terminal.pane.style.transform = "";
  terminal.pane.classList.remove("is-dragging");
  document.body.classList.remove("is-pane-dragging");
  setSnapPreview(null);
}

// Returns every host edge the pointer is currently within snapping distance of,
// in priority order. A corner yields two, which is what lets the drag suppress
// exactly the edges it started in without disarming the others.
function getSnapEdges(clientX, clientY) {
  const rect = elements.host.getBoundingClientRect();
  const threshold = Math.min(48, Math.max(24, Math.min(rect.width, rect.height) * 0.08));
  const edges = [];

  if (clientX <= rect.left + threshold) {
    edges.push("left");
  } else if (clientX >= rect.right - threshold) {
    edges.push("right");
  }

  if (clientY <= rect.top + threshold) {
    edges.push("top");
  } else if (clientY >= rect.bottom - threshold) {
    edges.push("bottom");
  }

  return edges;
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

/* ---------------- Administrator elevation --------------- */

async function refreshElevationStatus() {
  if (!window.multiterm || typeof window.multiterm.isElevated !== "function") return;
  try {
    state.appElevated = await window.multiterm.isElevated();
  } catch {
    state.appElevated = false;
  }
  applyElevationBadge();
}

function applyElevationBadge() {
  document.body.classList.toggle("app-elevated", Boolean(state.appElevated));
  if (elements.statusAdmin) elements.statusAdmin.hidden = !state.appElevated;
}

async function restartAsAdmin() {
  if (state.appElevated) { toast("Already running as administrator", "info", 1800); return; }
  if (!window.multiterm || typeof window.multiterm.restartAsAdmin !== "function") {
    toast("Administrator relaunch is only available in the desktop app", "error", 3000);
    return;
  }
  toast("Relaunching as administrator \u2014 approve the UAC prompt\u2026", "info", 3000);
  try {
    const ok = await window.multiterm.restartAsAdmin();
    if (!ok) toast("Could not relaunch as administrator", "error");
  } catch {
    toast("Could not relaunch as administrator", "error");
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
  if (terminal.elevated) {
    sendBridge({
      type: "elevate",
      cols: terminal.term.cols,
      cwd: terminal.cwd || elements.cwdInput.value,
      id: terminal.id,
      rows: terminal.term.rows,
      shell: terminal.shell || elements.shellSelect.value,
      title: terminal.titleInput.value
    });
    return;
  }
  sendBridge({
    type: "create",
    cols: terminal.term.cols,
    cwd: terminal.cwd || elements.cwdInput.value,
    id: terminal.id,
    rows: terminal.term.rows,
    shell: terminal.shell || elements.shellSelect.value,
    title: terminal.titleInput.value,
    elevated: Boolean(terminal.elevated)
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

  if (state.primaryId === id) {
    state.primaryId = null;
    const nextPrimary = state.terminals.has(state.activeId)
      ? state.activeId
      : firstVisibleTerminalId();
    if (nextPrimary) setPrimaryTerminal(nextPrimary);
  }

  if (state.activeId === id) {
    const next = terminalsOnActivePage()[0]?.id || state.terminals.keys().next().value;
    state.activeId = null;
    if (next) setActiveTerminal(next);
  }

  applyZoom();
  saveManualLayouts();
  renderPager();
  forgetTerminalPages([id]);
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
  const closedIds = [...state.terminals.keys()];
  for (const terminal of [...state.terminals.values()]) {
    disposeTerminal(terminal);
  }

  state.activeId = null;
  state.primaryId = null;
  saveManualLayouts();
  renderPager();
  forgetTerminalPages(closedIds);
  updateTerminalActions();
  saveSessionSnapshot();
}

function disposeTerminal(terminal) {
  const { id } = terminal;
  if (state.snap?.id === id) {
    state.snap = null;
  }
  if (state.zoomedId === id) {
    state.zoomedId = null;
  }
  window.clearTimeout(terminal.activityTimer);
  window.clearTimeout(terminal.silenceTimer);
  window.clearTimeout(terminal.promptTimer);
  window.clearTimeout(terminal.webglRecoveryHandle);
  terminal.webglRecoveryHandle = 0;
  if (terminal.outputFlushHandle) {
    window.cancelAnimationFrame(terminal.outputFlushHandle);
    terminal.outputFlushHandle = 0;
  }
  terminal.pendingOutput = [];
  terminal.observer.disconnect();
  // The WebGL addon can throw during Terminal.dispose() teardown (it dereferences
  // render state that xterm may already have torn down). Dispose it explicitly
  // first, and guard term.dispose() too, so a renderer teardown error can never
  // abort a close-all loop and strand sessions.
  try {
    terminal.webglAddon?.dispose();
  } catch {
    /* GL context already gone */
  }
  terminal.webglAddon = null;
  try {
    terminal.term.dispose();
  } catch {
    /* renderer teardown raced disposal; the pane is removed below regardless */
  }
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
  // A maximized pane that gets minimized would otherwise leave the stage empty:
  // every other pane stays hidden behind the zoom while this one is gone.
  if (state.zoomedId === id) {
    state.zoomedId = null;
    applyZoom();
  }

  if (state.activeId === id) {
    state.activeId = null;
    const next = firstVisibleTerminalId();
    if (next) setActiveTerminal(next);
  }
  if (state.primaryId === id) {
    state.primaryId = null;
    const nextPrimary = firstVisibleTerminalId();
    if (nextPrimary) setPrimaryTerminal(nextPrimary);
  }

  updateMinimizedDock();
  renderPager();
  updateTerminalActions();
  saveSessionSnapshot();
}

function restoreTerminal(id) {
  const terminal = state.terminals.get(id);
  if (!terminal || !terminal.minimized) return;

  // A minimized pane on another page is still is-page-hidden, so clearing
  // is-minimized alone would leave it invisible. Bring its page forward first so a
  // restore always puts the pane back on screen, whichever dock scope is active.
  if (terminal.pageId !== state.activePageId) {
    setActivePage(terminal.pageId, { focus: false });
  }

  terminal.minimized = false;
  terminal.pane.classList.remove("is-minimized");
  log.info("terminal", `Terminal restored: ${terminal.titleInput.value}`, { id });
  updateMinimizedDock();
  renderPager();
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
  for (const terminal of terminalsOnActivePage()) {
    if (!terminal.minimized) return terminal.id;
  }
  return null;
}

function countVisibleTerminals() {
  let visible = 0;
  for (const terminal of terminalsOnActivePage()) {
    if (!terminal.minimized) visible += 1;
  }
  return visible;
}

// The dock has two scopes (a persisted, user-flippable setting):
//   "page"   – only the active page's minimized terminals (pages stay self-contained)
//   "global" – every minimized terminal, wherever it lives (a cross-page tray)
function minimizedScope() {
  return state.settings.minimizedScope === "global" ? "global" : "page";
}

function setMinimizedScope(scope) {
  const next = scope === "global" ? "global" : "page";
  if (minimizedScope() === next) return;
  state.settings.minimizedScope = next;
  saveSettings();
  updateMinimizedDock();
  toast(next === "global" ? "Minimized: showing all pages" : "Minimized: showing this page only", "info", 1600);
}

function updateMinimizedDock() {
  const dock = elements.minimizedDock;
  if (!dock) return;
  // Never clobber an in-progress rename; the input commits on blur.
  if (dock.querySelector(".min-chip-rename")) return;

  const scope = minimizedScope();
  const allMinimized = [...state.terminals.values()].filter((terminal) => terminal.minimized);
  const scoped = scope === "global"
    ? allMinimized
    : allMinimized.filter((terminal) => terminal.pageId === state.activePageId);

  dock.textContent = "";
  dock.hidden = allMinimized.length === 0;
  if (dock.hidden) return;

  // Leading scope toggle, so the control travels with the dock and is reachable even
  // when this page has nothing parked but another page does.
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "min-dock-toggle";
  const isGlobal = scope === "global";
  toggle.dataset.scope = scope;
  toggle.title = isGlobal
    ? "Showing minimized terminals from all pages — click to show only this page"
    : "Showing minimized terminals on this page — click to show all pages";
  toggle.setAttribute("aria-label", toggle.title);
  toggle.innerHTML = `<i data-lucide="${isGlobal ? "layers" : "app-window"}"></i><span class="min-dock-toggle-label"></span>`;
  toggle.querySelector(".min-dock-toggle-label").textContent = isGlobal ? "All pages" : "This page";
  toggle.addEventListener("click", () => setMinimizedScope(isGlobal ? "page" : "global"));
  dock.append(toggle);

  // In page scope, tell the user about terminals parked on other pages so they know
  // to flip the toggle (or click the page tab's parked badge) to reach them.
  if (scope === "page" && scoped.length < allMinimized.length) {
    const remaining = allMinimized.length - scoped.length;
    const hint = document.createElement("button");
    hint.type = "button";
    hint.className = "min-chip-hint";
    hint.title = "Show minimized terminals from all pages";
    hint.textContent = `+${remaining} on other page${remaining === 1 ? "" : "s"}`;
    hint.addEventListener("click", () => setMinimizedScope("global"));
    dock.append(hint);
  }

  for (const terminal of scoped) {
    const title = terminal.titleInput.value || "PowerShell";
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "min-chip";
    chip.dataset.id = terminal.id;
    chip.title = `Restore ${title} (right-click for options)`;
    chip.setAttribute("aria-label", `Restore ${title}`);
    if (terminal.color) {
      chip.classList.add("has-color");
      chip.style.setProperty("--pane-accent", terminal.color);
    }
    chip.innerHTML = '<span class="min-chip-dot" aria-hidden="true"></span><span class="min-chip-label"></span><span class="min-chip-page" hidden></span><i data-lucide="chevron-up"></i>';
    chip.querySelector(".min-chip-label").textContent = title;

    // In global scope the chips mix pages, so name each one's page to keep it legible.
    if (scope === "global") {
      const pageTag = chip.querySelector(".min-chip-page");
      pageTag.textContent = pageName(terminal.pageId);
      pageTag.hidden = false;
    }

    chip.addEventListener("click", () => restoreTerminal(terminal.id));
    chip.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showMinChipMenu(event.clientX, event.clientY, terminal, chip);
    });
    dock.append(chip);
  }

  refreshIcons();
}

// Rename a terminal from its minimized chip, since its title input is off-screen
// while parked. Mirrors the pane title's commit path so search stays in sync.
function startMinChipRename(chip, terminal) {
  const label = chip.querySelector(".min-chip-label");
  if (!label || chip.querySelector(".min-chip-rename")) return;

  const input = document.createElement("input");
  input.className = "min-chip-rename";
  input.type = "text";
  input.value = terminal.titleInput.value;
  input.spellcheck = false;
  label.replaceWith(input);
  input.focus();
  input.select();

  let settled = false;
  const finish = (commit) => {
    if (settled) return;
    settled = true;
    const name = input.value.trim() || "PowerShell";
    // Drop the input before re-rendering so updateMinimizedDock's "rename in
    // progress" guard doesn't skip its own commit re-render.
    input.remove();
    if (commit) {
      terminal.titleInput.value = name;
      refreshTerminalSearchText(terminal);
      updateTerminalSearchVisibility(terminal);
      saveSessionSnapshot();
    }
    updateMinimizedDock();
  };
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

function showMinChipMenu(x, y, terminal, chip) {
  renderContextMenu([
    { label: "Restore", icon: "chevron-up", run: () => restoreTerminal(terminal.id) },
    { label: "Rename\u2026", icon: "pencil", run: () => startMinChipRename(chip, terminal) },
    { separator: true },
    { label: "Close", hint: "Ctrl+Shift+W", icon: "x", danger: true, run: () => removeTerminal(terminal.id) }
  ]);
  showBuiltContextMenu(x, y);
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
  syncTerminalOrderToDom();
  saveSessionSnapshot();
}

function setActiveTerminal(id) {
  if (!state.terminals.has(id)) return;
  state.activeId = id;
  if (!state.primaryId || !state.terminals.has(state.primaryId)) {
    setPrimaryTerminal(id);
  }
  for (const terminal of state.terminals.values()) {
    const isActive = terminal.id === id;
    terminal.pane.classList.toggle("is-active", isActive);
    if (isActive) {
      window.clearTimeout(terminal.activityTimer);
      terminal.pane.classList.remove("has-activity");
    }
  }
  updateStatusBar();
}

function setPrimaryTerminal(id) {
  if (!state.terminals.has(id)) return;
  state.primaryId = id;
  for (const terminal of state.terminals.values()) {
    terminal.pane.classList.toggle("is-primary", terminal.id === id);
  }
}

function setTerminalStatus(terminal, text, tone) {
  terminal.statusElement.textContent = text;
  terminal.statusElement.classList.toggle("is-live", tone === "live");
  terminal.statusElement.classList.toggle("is-dead", tone === "dead");
  refreshStatusPillTooltip(terminal);
  refreshTerminalSearchText(terminal);
  updateTerminalSearchVisibility(terminal);
}

/* ---------------- Session launch time --------------- */

// Both bridges stamp startedAt (ISO 8601) when they spawn the shell and repeat
// it in every session summary, so the launch time survives a reconnect or a page
// reload without the client having to remember anything.

function formatLaunchTimestamp(startedAt) {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return "";
  // Seconds are kept: two shells launched moments apart are otherwise
  // indistinguishable, which is exactly when you go looking for this.
  return new Date(started).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

function formatUptime(startedAt, now = Date.now()) {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return "";
  const seconds = Math.max(0, Math.round((now - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

// Recomputed on hover rather than written once, because the elapsed time in it
// goes stale the moment it is set.
function refreshStatusPillTooltip(terminal) {
  const launched = formatLaunchTimestamp(terminal.startedAt);
  if (!launched) {
    terminal.statusElement.removeAttribute("title");
    return;
  }

  const lines = [`Launched ${launched}`];
  if (terminal.status !== "exited" && terminal.status !== "error") {
    lines.push(`Up ${formatUptime(terminal.startedAt)}`);
  }
  lines.push("Right-click for details");
  terminal.statusElement.title = lines.join("\n");
}

// Browsers cap simultaneous WebGL contexts per GPU process (16 by default in
// Chrome/Electron) and force-lose the OLDEST context once you exceed it. That cap
// is the hard constraint here, because xterm's WebGL addon does NOT fall back to
// the DOM renderer when its context dies: disposing it removes the canvas and
// leaves the pane with no renderer at all, so the pane goes blank while its
// buffer still holds the text. Past ~16 panes that became a rolling eviction
// cascade — every recovered pane evicted another one — which is the white,
// flickering panes users reported.
//
// So we hand out a bounded number of contexts. Panes past the budget never get
// the addon at all and therefore keep xterm's DOM renderer, which is slower under
// heavy output but always correct. The budget sits below the stock cap so this
// holds even in a plain browser tab; our launchers additionally raise the ceiling
// with --max-active-webgl-contexts so terminal renderers never have to compete
// with the app's other canvases.
const WEBGL_MAX_CONTEXTS = 12;

function liveWebglRendererCount() {
  let count = 0;
  for (const terminal of state.terminals.values()) {
    if (terminal.webglAddon) count += 1;
  }
  return count;
}

// Attach the WebGL renderer to a terminal unless that would push us past the
// context budget. Returning null is a normal outcome, not a failure: the pane
// simply keeps xterm's DOM renderer. The other degradations land here too — addon
// script missing (offline/headless), or GPU blocklisted so construction throws.
//
// Recovery after a genuine context loss is deliberately still allowed through:
// the lost addon has already been cleared off the terminal so it no longer counts
// against the budget, and a pane that lost its context has no renderer left at
// all — it MUST get one back or it stays blank.
function attachWebglRenderer(terminal) {
  const WebglCtor = window.WebglAddon?.WebglAddon;
  if (!WebglCtor) return null;
  if (!terminal.webglAddon && liveWebglRendererCount() >= WEBGL_MAX_CONTEXTS) return null;
  const { term } = terminal;
  let webgl;
  try {
    webgl = new WebglCtor();
  } catch {
    return null;
  }
  webgl.onContextLoss(() => {
    try {
      webgl.dispose();
    } catch {
      /* already gone */
    }
    if (terminal.webglAddon === webgl) terminal.webglAddon = null;
    scheduleWebglRecovery(terminal);
  });
  try {
    term.loadAddon(webgl);
  } catch {
    return null;
  }
  terminal.webglAddon = webgl;
  return webgl;
}

// Recreate the WebGL renderer shortly after a context loss so the pane resumes
// drawing instead of staying blank/frozen. The context that was just lost frees
// a slot, so re-creation almost always succeeds. If losses keep recurring in a
// short window the GPU budget is genuinely exhausted, so we back off to a longer
// delay — but never give up permanently, because there is no working DOM-renderer
// fallback in this xterm build; a pane must get a live WebGL context back to render.
function scheduleWebglRecovery(terminal) {
  if (terminal.webglRecoveryHandle) return;
  const now = performance.now();
  terminal.webglLossTimes = (terminal.webglLossTimes || []).filter((t) => now - t < 8000);
  terminal.webglLossTimes.push(now);
  const thrashing = terminal.webglLossTimes.length > 3;
  const delay = thrashing ? 1500 : 300;
  terminal.webglRecoveryHandle = window.setTimeout(() => {
    terminal.webglRecoveryHandle = 0;
    if (terminal.webglAddon || !state.terminals.has(terminal.id)) return;
    attachWebglRenderer(terminal);
    try {
      terminal.term.refresh(0, terminal.term.rows - 1);
    } catch {
      /* renderer not ready yet; a later resize/fit will refresh */
    }
  }, delay);
}

// Live shell output can arrive as hundreds of tiny WebSocket messages per second.
// Instead of paying the full write pipeline (xterm write + search bookkeeping +
// activity/notification/prompt scheduling + scroll) per message, we queue the raw
// chunks and drain them once per animation frame. That collapses N messages/frame
// into a single term.write and a single side-effect pass, keeping the UI responsive.
function enqueueTerminalOutput(terminal, data) {
  terminal.pendingOutput.push(data);
  if (terminal.outputFlushHandle) return;
  terminal.outputFlushHandle = window.requestAnimationFrame(() => flushTerminalOutput(terminal));
}

function flushTerminalOutput(terminal) {
  if (terminal.outputFlushHandle) {
    window.cancelAnimationFrame(terminal.outputFlushHandle);
    terminal.outputFlushHandle = 0;
  }
  const chunks = terminal.pendingOutput;
  if (!chunks.length) return;
  terminal.pendingOutput = [];
  const data = chunks.length === 1 ? chunks[0] : chunks.join("");
  writeTerminal(terminal, data);
}

// Immediate, unbatched write. Coalesced live output funnels through here once per
// frame via flushTerminalOutput; status/banner lines (writelnTerminal) call it too.
function writeTerminal(terminal, data) {
  terminal.term.write(data);
  appendTerminalSearchText(terminal, data);
  updateTerminalSearchVisibility(terminal);
  markActivity(terminal);
  handleOutputNotifications(terminal);
  scheduleInputPromptCheck(terminal);
  if (state.settings.scrollOnOutput) terminal.term.scrollToBottom();
}

// Desktop / toast notifications for background activity and idle (silence),
// inspired by Terminator's ActivityWatch and InactivityWatch plugins.
function handleOutputNotifications(terminal) {
  const now = performance.now();
  terminal.lastOutputAt = now;
  const isBackground = terminal.id !== state.activeId;
  const inStartupGrace = now - terminal.createdAt < 1500;

  if (state.settings.notifyActivity && isBackground && !inStartupGrace) {
    if (!terminal.lastActivityNotify || now - terminal.lastActivityNotify > 8000) {
      terminal.lastActivityNotify = now;
      notifyDesktop(`Activity in ${terminal.titleInput.value || "terminal"}`);
    }
  }

  if (state.settings.notifySilence && !inStartupGrace) {
    terminal.hadOutput = true;
    window.clearTimeout(terminal.silenceTimer);
    const seconds = Math.max(2, Number(state.settings.silenceSeconds) || 10);
    terminal.silenceTimer = window.setTimeout(() => {
      if (!terminal.hadOutput) return;
      terminal.hadOutput = false;
      if (terminal.id !== state.activeId || document.hidden) {
        notifyDesktop(`${terminal.titleInput.value || "Terminal"} is idle`);
      }
    }, seconds * 1000);
  }
}

function notifyDesktop(body) {
  toast(body, "info", 2600);
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      new Notification("MultiTerm", { body });
    } catch {
      /* ignore */
    }
  } else if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function effectiveScrollback() {
  if (state.settings.scrollbackInfinite) return 1000000;
  const lines = Number(state.settings.scrollback);
  return Number.isFinite(lines) && lines > 0 ? Math.min(Math.round(lines), 1000000) : 20000;
}

/* ---------------- Awaiting-input detection --------------- */

// The pattern-matching heuristics live in a shared, DOM-free module
// (input-detection.js) so they can be unit-tested in isolation. The renderer's
// job here is only to decide *which* line to inspect and pass the caret context.
const promptDetector = (typeof window !== "undefined" && window.InputPromptDetector) || {
  looksLikeInputPrompt: () => false
};

// Heuristic: after output settles, inspect the line the cursor is parked on.
// A program blocked on input leaves its prompt there; an idle shell leaves its
// own prompt (excluded by the detector's shell-prompt veto). If the line reads
// like a question or choice, flag the pane so it stands out.
function scheduleInputPromptCheck(terminal) {
  window.clearTimeout(terminal.promptTimer);
  if (!state.settings.highlightInputPrompts) {
    setAwaitingInput(terminal, false);
    return;
  }
  terminal.promptTimer = window.setTimeout(() => evaluateInputPrompt(terminal), 500);
}

function evaluateInputPrompt(terminal) {
  if (!state.settings.highlightInputPrompts || terminal.status === "exited") {
    setAwaitingInput(terminal, false);
    return;
  }
  const buffer = terminal.term.buffer.active;
  if (!buffer || buffer.type === "alternate") {
    setAwaitingInput(terminal, false);
    return;
  }
  const cursorRow = buffer.baseY + buffer.cursorY;
  let row = cursorRow;
  let line = readBufferLine(buffer, row);
  // A prompt sometimes leaves the caret on a fresh empty line just below the
  // question (e.g. after a trailing newline). Walk back a couple of rows to the
  // nearest non-empty line so we inspect the actual prompt text.
  for (let probe = cursorRow - 1; !line && probe >= Math.max(0, cursorRow - 2); probe -= 1) {
    row = probe;
    line = readBufferLine(buffer, probe);
  }
  // The caret sits at the end of the prompt when a program is genuinely blocked
  // waiting for the user; if it's mid-line the program is likely still drawing.
  const cursorAtLineEnd = row !== cursorRow || buffer.cursorX >= line.length;
  const singleFlag = promptDetector.looksLikeInputPrompt(line, { cursorAtLineEnd });
  // Many interactive prompts (an agent asking a "Question" with a numbered list,
  // a wizard menu, …) span several lines, so no single parked line is enough.
  // Scan a small window of the most recent lines together as a fallback.
  let blockFlag = false;
  if (!singleFlag && typeof promptDetector.looksLikeInputPromptBlock === "function") {
    const window = readBufferWindow(buffer, cursorRow, PROMPT_WINDOW_ROWS);
    blockFlag = promptDetector.looksLikeInputPromptBlock(window, { cursorAtLineEnd });
  }
  setAwaitingInput(terminal, singleFlag || blockFlag);
}

// How many rows above the caret the multi-line block scanner considers. Large
// enough to span a "Question" header + an enumerated list, small enough that a
// long-answered prompt scrolls out of view quickly.
const PROMPT_WINDOW_ROWS = 14;

function readBufferWindow(buffer, cursorRow, count) {
  const lines = [];
  const first = Math.max(0, cursorRow - count + 1);
  for (let probe = first; probe <= cursorRow; probe += 1) {
    lines.push(readBufferLine(buffer, probe));
  }
  return lines;
}

function readBufferLine(buffer, row) {
  const line = buffer.getLine(row);
  return line ? line.translateToString(true).replace(/\s+$/, "") : "";
}

function setAwaitingInput(terminal, awaiting) {
  const next = Boolean(awaiting);
  if (terminal.awaitingInput === next) return;
  terminal.awaitingInput = next;
  terminal.pane.classList.toggle("is-awaiting-input", next);
  if (next && terminal.id !== state.activeId) {
    toast(`\u2328 ${terminal.titleInput.value || "Terminal"} needs input`, "info", 3000);
  }
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
  // Status/banner lines must appear in order relative to buffered live output,
  // so drain any queued chunks before writing this line.
  flushTerminalOutput(terminal);
  terminal.term.writeln(data);
  appendTerminalSearchText(terminal, `${data}\n`);
  updateTerminalSearchVisibility(terminal);
}

// The per-pane text filter searches this rolling transcript. It is capped so it
// never grows without bound, but re-slicing a ~200 KB string on every append is
// wasteful under heavy output, so we only trim once it drifts past the cap by a
// margin (amortising the copy across many appends).
const SEARCH_TEXT_CAP = 200000;
const SEARCH_TEXT_TRIM_MARGIN = 40000;

function appendTerminalSearchText(terminal, text) {
  let nextText = `${terminal.searchText || ""}\n${normalizeSearchText(stripTerminalControlCodes(text))}`;
  if (nextText.length > SEARCH_TEXT_CAP + SEARCH_TEXT_TRIM_MARGIN) {
    nextText = nextText.slice(-SEARCH_TEXT_CAP);
  }
  terminal.searchText = nextText;
}

function refreshTerminalSearchText(terminal) {
  const metadata = [
    terminal.titleInput.value,
    terminal.cwd,
    terminal.shell,
    terminal.statusElement.textContent
  ].filter(Boolean).join("\n");
  terminal.searchText = `${normalizeSearchText(metadata)}\n${terminal.searchText || ""}`.slice(-SEARCH_TEXT_CAP);
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
  // Runs once per output frame; skip DOM work when nothing changed (the common
  // case: no active filter, pane already visible).
  if (shouldHide === wasHidden) return;
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

// The bridge protocol is otherwise one-way; a few operations (opening a native
// file dialog) need an answer back. Requests carry a requestId the bridge echoes,
// and resolve to null when the bridge is unreachable or never replies.
const pendingBridgeRequests = new Map();

function requestBridge(message, { timeout = 300000 } = {}) {
  return new Promise((resolve) => {
    const requestId = createId();
    const settle = (value) => {
      const pending = pendingBridgeRequests.get(requestId);
      if (!pending) return;
      pendingBridgeRequests.delete(requestId);
      window.clearTimeout(pending.timer);
      resolve(value);
    };

    pendingBridgeRequests.set(requestId, { settle, timer: window.setTimeout(() => settle(null), timeout) });
    if (!sendBridge({ ...message, requestId })) settle(null);
  });
}

// Returns true when the message answered a pending request, so the caller can
// stop routing it.
function resolveBridgeRequest(message, value) {
  const pending = message.requestId ? pendingBridgeRequests.get(message.requestId) : null;
  if (!pending) return false;
  pending.settle(value);
  return true;
}

// Windows UAC-elevated terminals can't be hosted inside a non-elevated MultiTerm pane
// (ConPTY can't cross the integrity-level boundary), so the bridge launches the elevated
// shell in a separate console window via ShellExecute "runas" (raises the UAC prompt).
function newAdminTerminal(options = {}) {
  const shell = options.shell || elements.shellSelect.value || "pwsh";
  return addTerminal({
    elevated: true,
    shell,
    cwd: options.cwd,
    title: options.title || `Administrator ${state.nextIndex}`,
    pendingCommand: options.pendingCommand,
    runStartup: Boolean(options.runStartup),
    reveal: true
  });
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
    terminal.term.options.scrollback = effectiveScrollback();
    applyManualLayout(terminal, ensureManualLayout(terminal.id));
    scheduleFit(terminal);
  }
  if (!state.settings.highlightInputPrompts) {
    for (const terminal of state.terminals.values()) setAwaitingInput(terminal, false);
  }
  updateLayoutMetrics();
  updateStatusBar();
  updateMinimizedDock();
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
  updateFontZoomControls();
}

function updateFontZoomControls() {
  const atMin = state.settings.fontSize <= MIN_FONT_SIZE;
  const atMax = state.settings.fontSize >= MAX_FONT_SIZE;

  elements.statusZoomOut.disabled = atMin;
  elements.statusZoomIn.disabled = atMax;

  const downLabel = atMin ? `Font size is already at minimum (${MIN_FONT_SIZE}px)` : "Decrease font size (Ctrl+-)";
  const upLabel = atMax ? `Font size is already at maximum (${MAX_FONT_SIZE}px)` : "Increase font size (Ctrl++)";
  elements.statusZoomOut.title = downLabel;
  elements.statusZoomOut.setAttribute("aria-label", downLabel);
  elements.statusZoomIn.title = upLabel;
  elements.statusZoomIn.setAttribute("aria-label", upLabel);
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

// A continuous window drag fires the ResizeObserver — and thus the VISUAL fit
// below — dozens of times per second. That fit is cheap and keeps the panes
// tracking the layout smoothly, but forwarding every intermediate size to the
// shell makes its line editor (PSReadLine) repaint the prompt at dozens of
// widths per second; those repaints race xterm's own reflow and corrupt the
// rendered line, stranding the cursor far from the visible prompt. So while a
// window drag is in flight we hold the PTY resize (WINCH) back and forward a
// single settled size once the drag stops — the shell then repaints exactly
// once, at the size the drag landed on.
//
// Crucially the deferral is gated on an ACTIVE window-resize drag. Terminal
// creation and pane/layout changes drive the ResizeObserver too, but WITHOUT a
// window "resize" event, so those forward immediately (identical to the historic
// behaviour). A delayed creation/layout resize would let the shell's resize
// repaint land after other code wrote straight into the buffer and clobber it.
const RESIZE_DRAG_IDLE_MS = 150;
let resizeDragActive = false;
let resizeDragIdleHandle = 0;

// Fired on every window "resize" event: mark a drag in flight and (re)arm the
// idle timer that ends it. A one-off resize (maximize/snap) trips this once and
// settles after RESIZE_DRAG_IDLE_MS; a drag keeps it armed until motion stops.
function noteWindowResizeDrag() {
  resizeDragActive = true;
  if (resizeDragIdleHandle) {
    window.clearTimeout(resizeDragIdleHandle);
  }
  resizeDragIdleHandle = window.setTimeout(endWindowResizeDrag, RESIZE_DRAG_IDLE_MS);
}

// The drag has settled: forward the final size of every terminal so each shell
// repaints once at the width the drag ended on.
function endWindowResizeDrag() {
  resizeDragIdleHandle = 0;
  resizeDragActive = false;
  for (const terminal of state.terminals.values()) {
    sendResize(terminal, terminal.term.cols, terminal.term.rows);
  }
}

// Collapses the pane's secondary header actions into the overflow menu once the
// pane is too narrow to show the full button row without crowding the title.
// Driven by the pane's own width (via its ResizeObserver) so it responds to added
// terminals, layout changes and window resizes alike — not just the manual
// "Compact chrome" setting.
function updatePaneDensity(terminal) {
  const width = terminal.pane.clientWidth;
  // A hidden (minimized) pane reports 0; leave its current state alone until it
  // is laid out again, so restoring it doesn't flash the wrong control set.
  if (!width) return;
  terminal.pane.classList.toggle("is-narrow", width < PANE_OVERFLOW_WIDTH);
}

function scheduleFit(terminal) {
  // The ResizeObserver watches both the pane and its screen, so a single layout
  // change can fire this twice; coalesce to one visual fit per animation frame.
  if (terminal.fitScheduled) return;
  terminal.fitScheduled = true;
  window.requestAnimationFrame(() => {
    terminal.fitScheduled = false;
    // A pane on an inactive page is display:none, so it measures as zero and
    // would resize the pty down to a nonsense size. applyPageVisibility refits
    // it when the page comes back.
    if (terminal.pane.classList.contains("is-page-hidden")) return;
    try {
      terminal.fitAddon.fit();
    } catch {
      return;
    }
    queueResize(terminal, terminal.term.cols, terminal.term.rows);
  });
}

// Both fitAddon.fit() (above) and term.onResize funnel here. Outside a window
// drag the size is forwarded immediately; during a drag it is suppressed and
// endWindowResizeDrag() forwards the settled size once motion stops.
function queueResize(terminal, cols, rows) {
  if (resizeDragActive) return;
  sendResize(terminal, cols, rows);
}

// Single funnel for pty resize messages. queueResize routes both the fit path
// and term.onResize into here, sharing one dedupe guard: identical dimensions
// never hit the bridge twice. The cache only advances on a successful send, so a
// resize attempted while the bridge is offline is retried (not suppressed) once
// queueResize runs again after reconnect.
function sendResize(terminal, cols, rows) {
  if (terminal.lastSentCols === cols && terminal.lastSentRows === rows) return;
  if (sendBridge({ type: "resize", id: terminal.id, cols, rows })) {
    terminal.lastSentCols = cols;
    terminal.lastSentRows = rows;
  }
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

// Every reading costs the bridge a ~1s Win32_Process query, so the status bar
// asks for one only while the user is actually looking at the memory chip.
// Hover (or keyboard focus) opens the readout and starts a slow refresh loop;
// leaving collapses it and stops asking. Rendering is text-only and all the
// process-walking happens in the bridge, so the UI thread is never blocked.
const MEM_REFRESH_MS = 4000;

function bindMemStatus() {
  const chip = elements.statusMem;
  if (!chip) return;
  chip.addEventListener("pointerenter", openMemStatus);
  chip.addEventListener("pointerleave", closeMemStatus);
  chip.addEventListener("focus", openMemStatus);
  chip.addEventListener("blur", closeMemStatus);
  // Tapping is the touch equivalent of hovering; it also lets a click pin the
  // reading open long enough to read it on a trackpad.
  chip.addEventListener("click", (event) => {
    event.preventDefault();
    if (state.mem.open) requestMemStats();
    else openMemStatus();
  });
}

function openMemStatus() {
  const chip = elements.statusMem;
  if (!chip || state.mem.open) return;
  state.mem.open = true;
  chip.classList.add("is-open");
  chip.setAttribute("aria-expanded", "true");
  renderMemStatus();
  requestMemStats();
  clearInterval(state.mem.timer);
  state.mem.timer = setInterval(requestMemStats, MEM_REFRESH_MS);
}

function closeMemStatus() {
  const chip = elements.statusMem;
  if (!chip) return;
  state.mem.open = false;
  chip.classList.remove("is-open");
  chip.setAttribute("aria-expanded", "false");
  clearInterval(state.mem.timer);
  state.mem.timer = null;
  // Blank the live region while collapsed so a screen reader doesn't re-read a
  // stale figure, and so the collapsed chip has no width to animate from.
  if (elements.statusMemText) elements.statusMemText.textContent = "";
}

function requestMemStats() {
  if (state.mem.unsupported) return;
  state.mem.requested = true;
  if (!sendBridge({ type: "memstats" })) {
    // Bridge is down/reconnecting: keep whatever we last showed rather than
    // flashing an error, but make it clear nothing has arrived yet.
    if (!state.mem.stats) setMemStatusText("bridge offline");
  }
}

function updateMemStatus(stats) {
  if (stats && stats.supported === false) {
    state.mem.unsupported = true;
    state.mem.unsupportedReason = stats.reason || null;
    state.mem.stats = null;
    clearInterval(state.mem.timer);
    state.mem.timer = null;
    renderMemStatus();
    return;
  }
  if (stats && stats.error) {
    state.mem.stats = null;
    renderMemStatus(stats.error);
    return;
  }
  state.mem.stats = {
    app: Number(stats.app) || 0,
    systemUsed: Number(stats.systemUsed) || 0,
    systemTotal: Number(stats.systemTotal) || 0
  };
  renderMemStatus();
}

function renderMemStatus(errorText) {
  const chip = elements.statusMem;
  if (!chip || !elements.statusMemText) return;

  if (state.mem.unsupported) {
    chip.title = state.mem.unsupportedReason === "bridge"
      ? "Memory usage isn't supported by this MultiTerm bridge"
      : "Memory usage is only available on Windows";
    setMemStatusText("unavailable");
    return;
  }

  const stats = state.mem.stats;
  if (!stats) {
    chip.title = "Memory used by MultiTerm and its terminals \u2014 hover to read live usage";
    setMemStatusText(errorText || (state.mem.requested ? "reading\u2026" : ""));
    return;
  }

  const pct = stats.systemUsed > 0 ? (stats.app / stats.systemUsed) * 100 : 0;
  chip.title = `MultiTerm + terminals: ${formatBytes(stats.app)} \u2014 system memory in use: ${formatBytes(stats.systemUsed)} of ${formatBytes(stats.systemTotal)}`;
  setMemStatusText(`${formatBytes(stats.app)} / ${formatBytes(stats.systemUsed)} (${pct.toFixed(1)}%)`);
}

// Only paint while expanded: the collapsed chip is glyph-only, and writing to
// the aria-live region would otherwise announce readings nobody asked for.
function setMemStatusText(text) {
  if (!state.mem.open) return;
  elements.statusMemText.textContent = text;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
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

// Perf (Electron guideline #4): run low-priority, non-visual work during an idle
// period so it never competes with first paint, bridge connection, or input.
// Falls back to a short timeout where requestIdleCallback is unavailable.
function whenIdle(fn) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => fn(), { timeout: 1000 });
  } else {
    window.setTimeout(fn, 1);
  }
}

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
  // The toggle lives in the status bar now, so it stays put and flips its
  // chevron instead of vanishing - hiding it would collapse a slot in the bar
  // and shuffle the controls beside it every time the panel opened.
  elements.logToggle.setAttribute("aria-expanded", String(open));
  const label = open ? "Hide logs" : "Show logs";
  elements.logToggle.title = label;
  elements.logToggle.setAttribute("aria-label", label);
  if (open) {
    logStore.unseenError = false;
    if (elements.logToggleDot) elements.logToggleDot.hidden = true;
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
  // Cycling stays on the page you are looking at; Alt+Q crosses pages.
  const ids = terminalsOnActivePage().map((terminal) => terminal.id);
  if (ids.length === 0) return;
  const current = ids.indexOf(state.activeId);
  const next = ids[(current + direction + ids.length) % ids.length];
  setActiveTerminalAndReveal(next);
}

function setActiveTerminalAndReveal(id) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;
  // Focusing a terminal that lives on another page brings that page forward
  // first, otherwise the pane is display:none and cannot be scrolled to.
  if (!isOnActivePage(terminal)) {
    setActivePage(terminal.pageId, { focus: false });
  }
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
  const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, state.settings.fontSize + delta));
  if (next === state.settings.fontSize) return;
  state.settings.fontSize = next;
  elements.fontSize.value = next;
  applySettings();
  saveSettings();
}

function resetFontZoom() {
  const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, defaultSettings.fontSize));
  state.settings.fontSize = next;
  elements.fontSize.value = next;
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
    { label: "New Administrator terminal", run: () => newAdminTerminal() },
    { label: "Restart as Administrator", run: restartAsAdmin },
    { label: "Close active terminal", hint: "Ctrl+Shift+W", run: () => state.activeId && removeTerminal(state.activeId) },
    { label: "Minimize active terminal", run: () => state.activeId && minimizeTerminal(state.activeId) },
    { label: "Restore all minimized terminals", run: restoreAllTerminals },
    { label: "Close all terminals", run: closeAllTerminals },
    { label: "Restart active terminal", hint: "Ctrl+Shift+R", run: restartActiveSession },
    { label: "Find in active terminal", hint: "Ctrl+F", run: openFindActive },
    { label: "Find in all terminals", hint: "Ctrl+Shift+F", run: openFindAll },
    { label: "Clear active terminal", hint: "Ctrl+Shift+L", run: clearActiveTerminal },
    { label: "Copy active output", hint: "Ctrl+Shift+C", run: copyActiveTerminal },
    { label: "Cycle active terminal color", run: () => state.activeId && cyclePaneColor(state.terminals.get(state.activeId)) },
    { label: "Fit all terminals", run: fitAllTerminals },
    { label: "Reset layout", run: resetLayout },
    { label: "Broadcast command…", hint: "Ctrl+Shift+B", run: () => toggleBroadcast(true) },
    { label: "Paste into active terminal", hint: "Ctrl+Shift+V", run: pasteIntoActive },
    { label: "Maximize / restore active pane", hint: "Ctrl+Shift+X", run: () => toggleZoomPane(state.activeId) },
    { label: "Browse & run script in active terminal\u2026", run: () => browseAndRunScript(state.activeId) },
    { label: "Open active terminal folder", run: () => state.activeId && revealTerminalCwd(state.terminals.get(state.activeId)) },
    { label: "New terminal in active folder", run: () => { const active = state.activeId && state.terminals.get(state.activeId); if (active) addTerminal({ reveal: true, runStartup: true, cwd: active.cwd, title: active.titleInput.value }); } },
    { label: "Toggle logging for active terminal", run: () => state.activeId && toggleLogging(state.terminals.get(state.activeId)) },
    { label: "Cycle broadcast scope", run: () => { toggleBroadcastScope(); toast(`Broadcast: ${broadcastScopeLabel()}`, "info", 1600); } },
    { label: "Next terminal", run: () => cycleTerminal(1) },
    { label: "Previous terminal", run: () => cycleTerminal(-1) },
    { label: "Switch terminal\u2026", hint: "Alt+Q", run: openQuickSwitch },
    { label: "New page", run: () => addPage() },
    { label: "Next page", hint: "Ctrl+PageDown", run: () => cyclePage(1) },
    { label: "Previous page", hint: "Ctrl+PageUp", run: () => cyclePage(-1) },
    { label: "Close current page", run: () => removePage(state.activePageId) },
    { label: "Increase font size", hint: "Ctrl++", run: () => fontZoom(1) },
    { label: "Decrease font size", hint: "Ctrl+-", run: () => fontZoom(-1) },
    { label: "Toggle app theme", run: toggleAppTheme },
    { label: "Toggle header", run: () => toggleChrome("headerHidden") },
    { label: "Toggle layout panel", run: () => toggleChrome("sidecarHidden") },
    { label: "Keyboard shortcuts", hint: "Ctrl+/", run: openShortcuts },
    { label: "Help", run: openHelp },
    { label: "Check for updates\u2026", run: () => checkForUpdates({ manual: true }) },
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

  for (const snippet of state.settings.snippets || []) {
    commands.push({ label: `Snippet: ${snippet.name || snippet.command}`, run: () => runSnippet(state.activeId, snippet) });
  }

  for (const terminal of state.terminals.values()) {
    const id = terminal.id;
    commands.push({ label: `Focus: ${terminal.titleInput.value}`, run: () => setActiveTerminalAndReveal(id) });
  }

  if (state.pages.length > 1) {
    for (const page of state.pages) {
      if (page.id === state.activePageId) continue;
      const id = page.id;
      commands.push({ label: `Go to page: ${page.name}`, run: () => setActivePage(id) });
    }
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

/* ---------------- Terminal quick switcher (Alt+Q) --------------- */

// Every visible row gets a jump key: 1-9 first, then a-z, then nothing. Keys are
// assigned over the *filtered* list, so they stay dense as you type.
const QUICK_SWITCH_KEYS = "123456789abcdefghijklmnopqrstuvwxyz";
const quickSwitch = { open: false, index: 0, items: [] };

function quickSwitchKeyFor(index) {
  return index < QUICK_SWITCH_KEYS.length ? QUICK_SWITCH_KEYS[index] : null;
}

// Builds the searchable row list. Terminals from every page are included so the
// switcher can cross pages, which is the main reason it exists.
function quickSwitchCandidates(rawQuery) {
  const query = normalizeSearchText(rawQuery || "");
  const rows = [...state.terminals.values()].map((terminal) => ({
    id: terminal.id,
    title: terminal.titleInput.value,
    pageId: terminal.pageId,
    page: pageName(terminal.pageId),
    cwd: terminal.cwd || "",
    status: terminal.status || ""
  }));
  if (!query) return rows;
  return rows.filter((row) =>
    normalizeSearchText(`${row.title} ${row.page} ${row.cwd}`).includes(query)
  );
}

function openQuickSwitch() {
  if (state.terminals.size === 0) {
    toast("No terminals open", "info", 1600);
    return;
  }
  closePalette();
  quickSwitch.open = true;
  quickSwitch.index = 0;
  elements.quickSwitchOverlay.hidden = false;
  window.requestAnimationFrame(() => elements.quickSwitchOverlay.classList.add("is-open"));
  elements.quickSwitchInput.value = "";
  renderQuickSwitch();
  elements.quickSwitchInput.focus();
}

function closeQuickSwitch(refocus = true) {
  if (!quickSwitch.open) return;
  quickSwitch.open = false;
  elements.quickSwitchOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.quickSwitchOverlay.hidden = true;
  }, 150);
  if (refocus && state.activeId) {
    state.terminals.get(state.activeId)?.term.focus();
  }
}

function renderQuickSwitch() {
  if (!quickSwitch.open || !elements.quickSwitchList) return;

  quickSwitch.items = quickSwitchCandidates(elements.quickSwitchInput.value);
  quickSwitch.index = Math.min(quickSwitch.index, Math.max(0, quickSwitch.items.length - 1));

  const list = elements.quickSwitchList;
  list.textContent = "";
  if (quickSwitch.items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "palette-empty";
    empty.textContent = "No matching terminals";
    list.append(empty);
    return;
  }

  const multiPage = state.pages.length > 1;
  quickSwitch.items.forEach((row, index) => {
    const li = document.createElement("li");
    li.className = "palette-item quick-item";
    li.dataset.index = index;
    li.dataset.id = row.id;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(index === quickSwitch.index));

    const key = quickSwitchKeyFor(index);
    const badge = document.createElement("span");
    badge.className = key ? "quick-key" : "quick-key is-empty";
    badge.textContent = key ? key.toUpperCase() : "";
    if (key) badge.title = `Alt+${key.toUpperCase()}`;
    li.append(badge);

    const label = document.createElement("span");
    label.className = "quick-title";
    label.textContent = row.title;
    li.append(label);

    if (multiPage) {
      const page = document.createElement("span");
      page.className = "quick-page";
      page.textContent = row.page;
      li.append(page);
    }

    list.append(li);
  });
}

function moveQuickSwitchSelection(direction) {
  if (quickSwitch.items.length === 0) return;
  quickSwitch.index = (quickSwitch.index + direction + quickSwitch.items.length) % quickSwitch.items.length;
  const nodes = elements.quickSwitchList.querySelectorAll(".quick-item");
  nodes.forEach((node, index) => node.setAttribute("aria-selected", String(index === quickSwitch.index)));
  nodes[quickSwitch.index]?.scrollIntoView({ block: "nearest" });
}

function runQuickSwitchSelection(index = quickSwitch.index) {
  const row = quickSwitch.items[index];
  if (!row) return;
  closeQuickSwitch(false);
  window.setTimeout(() => setActiveTerminalAndReveal(row.id), 60);
}

function bindQuickSwitch() {
  if (!elements.quickSwitchOverlay) return;

  elements.quickSwitchInput.addEventListener("input", () => renderQuickSwitch());

  elements.quickSwitchInput.addEventListener("keydown", (event) => {
    // Alt+<key> jumps straight to a row. Alt is already held coming from Alt+Q,
    // and keeping the plain keys free is what lets the box stay searchable.
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const index = QUICK_SWITCH_KEYS.indexOf(event.key.toLowerCase());
      if (index !== -1 && index < quickSwitch.items.length) {
        event.preventDefault();
        runQuickSwitchSelection(index);
        return;
      }
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveQuickSwitchSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveQuickSwitchSelection(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runQuickSwitchSelection();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeQuickSwitch();
    }
  });

  elements.quickSwitchOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.quickSwitchOverlay) closeQuickSwitch();
  });

  elements.quickSwitchList.addEventListener("click", (event) => {
    const item = event.target.closest(".quick-item");
    if (!item) return;
    runQuickSwitchSelection(Number(item.dataset.index));
  });
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

    if (event.altKey && !event.ctrlKey && !event.metaKey && key === "q") {
      event.preventDefault();
      quickSwitch.open ? closeQuickSwitch() : openQuickSwitch();
      return;
    }

    if (!elements.shortcutsOverlay.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeShortcuts();
      }
      return;
    }

    if (elements.updateOverlay && !elements.updateOverlay.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissUpdateDialog();
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
    // The switcher owns Alt+<key> while it is open; let its own handler see them.
    if (quickSwitch.open) return;

    if (event.key === "Escape") {
      if (state.findAll.active) {
        event.preventDefault();
        closeFindAll();
        return;
      }
      if (closeAnyFind()) {
        event.preventDefault();
        return;
      }
    }

    if (event.ctrlKey && !event.altKey && !event.metaKey && key === "t") {
      // Ctrl+T is the primary new-terminal chord; Ctrl+Shift+T also works.
      event.preventDefault();
      addTerminal({ reveal: true, runStartup: true });
    } else if (event.ctrlKey && event.shiftKey && key === "w") {
      event.preventDefault();
      if (state.activeId) removeTerminal(state.activeId);
    } else if (event.ctrlKey && key === "f" && !event.altKey && !event.metaKey) {
      event.preventDefault();
      if (event.shiftKey) openFindAll();
      else openFindActive();
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
    } else if (event.ctrlKey && event.shiftKey && key === "x") {
      event.preventDefault();
      toggleZoomPane(state.activeId);
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
    } else if (event.ctrlKey && !event.altKey && event.key === "PageDown") {
      event.preventDefault();
      cyclePage(1);
    } else if (event.ctrlKey && !event.altKey && event.key === "PageUp") {
      event.preventDefault();
      cyclePage(-1);
    } else if (event.altKey && !event.ctrlKey && !event.metaKey && /^[1-9]$/.test(event.key)) {
      const page = state.pages[Number(event.key) - 1];
      if (page) {
        event.preventDefault();
        setActivePage(page.id);
      }
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
    terminal.lastFindCount = results ? results.resultCount : 0;
    terminal.lastFindIndex = results ? results.resultIndex : -1;
    if (!results || results.resultCount === 0) {
      count.textContent = "0/0";
    } else {
      const current = results.resultIndex >= 0 ? results.resultIndex + 1 : 0;
      count.textContent = `${current}/${results.resultCount}`;
    }
    if (state.findAll.active) {
      terminal.pane.classList.toggle("has-find-match", (terminal.lastFindCount || 0) > 0);
      refreshFindAllCount();
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
  if (state.findAll.active) closeFindAll();
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

/* ---------------- Find across all terminals --------------- */

function orderedTerminals() {
  const result = [];
  for (const pane of elements.host.querySelectorAll(".terminal-pane")) {
    const terminal = state.terminals.get(pane.dataset.id);
    if (terminal && terminal.searchAddon) result.push(terminal);
  }
  return result;
}

function bindFindAll() {
  const bar = elements.findAllBar;
  if (!bar) return;

  elements.findAllInput.addEventListener("input", () => {
    runFindAll(elements.findAllInput.value);
  });

  elements.findAllInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      findAllNav(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeFindAll();
    }
  });

  bar.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const kind = button.dataset.findall;
    if (kind === "next") findAllNav(1);
    else if (kind === "prev") findAllNav(-1);
    else if (kind === "close") closeFindAll();
  });
}

function openFindAll() {
  if (!elements.findAllBar) return;
  // The per-pane find bar and find-all share each terminal's single search
  // addon, so make them mutually exclusive.
  closeAnyFind();
  state.findAll.active = true;
  elements.findAllBar.hidden = false;

  const active = state.activeId ? state.terminals.get(state.activeId) : null;
  const selection = active?.term.getSelection();
  if (selection && !selection.includes("\n")) {
    elements.findAllInput.value = selection;
  }
  elements.findAllInput.focus();
  elements.findAllInput.select();
  runFindAll(elements.findAllInput.value);
}

function closeFindAll() {
  if (!state.findAll.active && elements.findAllBar?.hidden !== false) return;
  state.findAll.active = false;
  if (elements.findAllBar) elements.findAllBar.hidden = true;
  for (const terminal of state.terminals.values()) {
    terminal.searchAddon?.clearDecorations();
    terminal.pane.classList.remove("has-find-match");
  }
  state.findAll.order = [];
  state.findAll.ti = 0;
  state.findAll.li = -1;
  const active = state.activeId ? state.terminals.get(state.activeId) : null;
  active?.term.focus();
}

function runFindAll(rawQuery) {
  const query = rawQuery || "";
  if (!query) {
    for (const terminal of state.terminals.values()) {
      terminal.searchAddon?.clearDecorations();
      terminal.lastFindCount = 0;
      terminal.lastFindIndex = -1;
      terminal.pane.classList.remove("has-find-match");
    }
    state.findAll.order = [];
    state.findAll.ti = 0;
    state.findAll.li = -1;
    refreshFindAllCount();
    return;
  }

  const order = [];
  for (const terminal of orderedTerminals()) {
    // Highlight every match in this pane without scrolling, then drop the
    // active-match emphasis so nothing looks "current" until the user navigates.
    terminal.searchAddon.findNext(query, { ...findDecorations, incremental: true, noScroll: true });
    terminal.searchAddon.clearActiveDecoration();
    const has = (terminal.lastFindCount || 0) > 0;
    terminal.pane.classList.toggle("has-find-match", has);
    if (has) order.push(terminal.id);
  }
  state.findAll.order = order;
  state.findAll.ti = 0;
  state.findAll.li = -1;
  refreshFindAllCount();
}

function findAllNav(direction) {
  const order = state.findAll.order;
  if (!order.length) return;
  const query = elements.findAllInput.value;
  if (!query) return;

  let ti = state.findAll.ti >= order.length ? 0 : state.findAll.ti;
  let li = state.findAll.li;
  let switched = false;

  if (li < 0) {
    // First navigation: jump to the first (or last) match overall.
    switched = true;
    if (direction > 0) {
      ti = 0;
      li = 0;
    } else {
      ti = order.length - 1;
      li = Math.max(0, (state.terminals.get(order[ti])?.lastFindCount || 1) - 1);
    }
  } else {
    const curTerm = state.terminals.get(order[ti]);
    const curCount = curTerm ? (curTerm.lastFindCount || 0) : 0;
    if (direction > 0) {
      li += 1;
      if (li >= curCount) {
        switched = true;
        curTerm?.searchAddon?.clearActiveDecoration();
        ti = (ti + 1) % order.length;
        li = 0;
      }
    } else {
      li -= 1;
      if (li < 0) {
        switched = true;
        curTerm?.searchAddon?.clearActiveDecoration();
        ti = (ti - 1 + order.length) % order.length;
        li = Math.max(0, (state.terminals.get(order[ti])?.lastFindCount || 1) - 1);
      }
    }
  }

  state.findAll.ti = ti;
  state.findAll.li = li;

  const terminal = state.terminals.get(order[ti]);
  if (!terminal?.searchAddon) return;
  setActiveTerminal(terminal.id);
  terminal.pane.scrollIntoView({ block: "nearest", inline: "nearest" });
  // When entering a pane fresh, reset the selection so findNext/findPrevious
  // land deterministically on that pane's first/last match.
  if (switched) terminal.term.clearSelection();
  if (direction > 0) {
    terminal.searchAddon.findNext(query, findDecorations);
  } else {
    terminal.searchAddon.findPrevious(query, findDecorations);
  }
  refreshFindAllCount();
}

function refreshFindAllCount() {
  if (!elements.findAllCount) return;
  const order = state.findAll.order;
  const panes = order.length;
  let total = 0;
  for (const id of order) total += state.terminals.get(id)?.lastFindCount || 0;

  if (!elements.findAllInput.value) {
    elements.findAllCount.textContent = "0/0";
    return;
  }
  if (total === 0) {
    elements.findAllCount.textContent = "No matches";
    return;
  }

  let pos = 0;
  if (state.findAll.li >= 0 && state.findAll.ti < panes) {
    for (let i = 0; i < state.findAll.ti; i++) {
      pos += state.terminals.get(order[i])?.lastFindCount || 0;
    }
    pos += state.findAll.li + 1;
  }

  const paneLabel = `${panes} pane${panes === 1 ? "" : "s"}`;
  elements.findAllCount.textContent = pos > 0
    ? `${pos}/${total} · ${paneLabel}`
    : `${total} · ${paneLabel}`;
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
  const next = { all: "active", active: "group", group: "all" };
  state.broadcastScope = next[state.broadcastScope] || "all";
  elements.broadcastScope.dataset.scope = state.broadcastScope;
  elements.broadcastScope.textContent = broadcastScopeLabel();
}

function broadcastScopeLabel() {
  if (state.broadcastScope === "active") return "Active only";
  if (state.broadcastScope === "group") return "Color group";
  return "All terminals";
}

// "group" targets every pane sharing the active pane's label colour, giving
// Terminator-style terminal groups without a separate grouping UI.
function broadcastTargetIds() {
  if (state.broadcastScope === "active") {
    return state.activeId ? [state.activeId] : [];
  }
  if (state.broadcastScope === "group") {
    const active = state.activeId ? state.terminals.get(state.activeId) : null;
    if (!active) return [];
    const color = active.color || null;
    return [...state.terminals.values()].filter((terminal) => (terminal.color || null) === color).map((terminal) => terminal.id);
  }
  return [...state.terminals.keys()];
}

function sendBroadcast() {
  const command = elements.broadcastInput.value;
  if (!command) return;

  // No terminals at all: open one and run the command there once it is live.
  if (state.terminals.size === 0) {
    addTerminal({
      reveal: true,
      runStartup: true,
      pendingCommand: command,
      pendingCommandEnter: state.settings.broadcastSendEnter
    });
    log.info("broadcast", "Broadcast with no terminals open; started a new terminal", { command });
    toast("No terminals open \u2014 started one and ran the command", "success", 2200);
    elements.broadcastInput.select();
    return;
  }

  const ids = broadcastTargetIds();

  if (ids.length === 0) {
    toast("No target terminal", "info", 1800);
    return;
  }

  let sent = 0;
  const suffix = state.settings.broadcastSendEnter ? "\r" : "";
  for (const id of ids) {
    if (sendBridge({ type: "input", id, data: `${command}${suffix}` })) sent += 1;
  }

  log.info("broadcast", `Broadcast to ${sent} ${sent === 1 ? "terminal" : "terminals"}`, { scope: state.broadcastScope });
  toast(`Sent to ${sent} ${sent === 1 ? "terminal" : "terminals"}`, "success", 1600);
  elements.broadcastInput.select();
}

// When off, the command text is staged in each terminal without a trailing
// Enter, so the user can review/edit before running it themselves.
function updateBroadcastEnterToggle() {
  const on = Boolean(state.settings.broadcastSendEnter);
  elements.broadcastEnter.dataset.on = on ? "true" : "false";
  elements.broadcastEnter.setAttribute("aria-pressed", on ? "true" : "false");
  elements.broadcastEnter.textContent = on ? "Enter: on" : "Enter: off";
  elements.broadcastEnter.title = on
    ? "Enter is sent after each command (runs it). Click to send without Enter."
    : "Command is sent without Enter (not run). Click to send Enter after it.";
}

/* ---------------- Maximize / zoom pane --------------- */

// Transient full-stage zoom of one pane (Terminator's toggle_zoom), layered on
// top of whatever layout is active. Toggling off restores the normal layout.
function toggleZoomPane(id) {
  const targetId = id || state.activeId;
  if (!targetId || !state.terminals.has(targetId)) return;
  // Minimized panes are hidden, so zooming one would blank the stage.
  if (state.terminals.get(targetId).minimized) return;
  state.zoomedId = state.zoomedId === targetId ? null : targetId;
  applyZoom();
}

function applyZoom() {
  const zoomed = state.zoomedId && state.terminals.has(state.zoomedId) ? state.zoomedId : null;
  state.zoomedId = zoomed;
  elements.host.classList.toggle("has-zoom", Boolean(zoomed));
  let glyphChanged = false;
  for (const terminal of state.terminals.values()) {
    terminal.pane.classList.toggle("is-zoomed", terminal.id === zoomed);
    if (updateMaximizeButton(terminal)) glyphChanged = true;
  }
  if (glyphChanged) refreshIcons();
  if (zoomed) setActiveTerminal(zoomed);
  for (const terminal of state.terminals.values()) {
    scheduleFit(terminal);
  }
}

// The header button doubles as the restore control while a pane is maximized, so
// its glyph and labels track the zoom state rather than staying "Maximize".
// Returns whether the glyph placeholder was re-seeded (lucide must re-render).
function updateMaximizeButton(terminal) {
  const button = terminal.pane.querySelector('button[data-action="maximize"]');
  if (!button) return false;

  const isZoomed = state.zoomedId === terminal.id;
  const label = isZoomed ? "Restore size (Ctrl+Shift+X)" : "Maximize (Ctrl+Shift+X)";
  const icon = isZoomed ? "minimize-2" : "maximize-2";

  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", isZoomed ? "true" : "false");

  // lucide swaps the <i> for an <svg>, so seed a fresh placeholder when the glyph
  // changes instead of trying to mutate the rendered svg in place.
  if (button.dataset.icon === icon) return false;
  button.dataset.icon = icon;
  button.textContent = "";
  const placeholder = document.createElement("i");
  placeholder.setAttribute("data-lucide", icon);
  button.append(placeholder);
  return true;
}

/* ---------------- Working directory --------------- */

// Track each pane's directory from OSC 7 (file://) and OSC 9;9 (ConEmu/Windows
// Terminal) sequences when the shell emits them; otherwise the initial cwd
// stands in. Powers "Open folder" and "New terminal here".
function registerCwdTracking(terminal) {
  const parser = terminal.term.parser;
  if (!parser || typeof parser.registerOscHandler !== "function") return;

  parser.registerOscHandler(7, (data) => {
    const match = String(data || "").match(/^file:\/\/[^/]*(\/.*)$/);
    if (match) {
      let dir = decodeURIComponent(match[1]);
      if (/^\/[A-Za-z]:/.test(dir)) dir = dir.slice(1);
      updateTerminalCwd(terminal, dir);
    }
    return false;
  });

  parser.registerOscHandler(9, (data) => {
    const raw = String(data || "");
    if (raw.startsWith("9;")) {
      updateTerminalCwd(terminal, raw.slice(2).replace(/^"|"$/g, ""));
    }
    return false;
  });
}

function updateTerminalCwd(terminal, dir) {
  const clean = String(dir || "").trim().replace(/\//g, "\\");
  if (!clean) return;
  terminal.cwd = clean;
  refreshTerminalSearchText(terminal);
  if (terminal.id === state.activeId) updateStatusBar();
}

function revealTerminalCwd(terminal) {
  if (!terminal) return;
  if (!terminal.cwd) {
    toast("Working directory unknown", "info", 1800);
    return;
  }
  revealPath(terminal.cwd);
}

// Only the bridge can open Explorer; the browser cannot reach the file system.
function revealPath(path) {
  if (!path) {
    toast("Working directory unknown", "info", 1800);
    return;
  }
  if (!sendBridge({ type: "reveal", path })) {
    toast("Bridge unavailable", "error");
  }
}

/* ---------------- Command snippets --------------- */

function runSnippet(id, snippet) {
  const targetId = id || state.activeId;
  if (!targetId || !state.terminals.has(targetId)) {
    toast("No active terminal", "info", 1600);
    return;
  }
  if (!snippet || !snippet.command) return;
  sendBridge({ type: "input", id: targetId, data: `${snippet.command}\r` });
}

function addSnippet(name, command) {
  const trimmedCommand = String(command || "").trim();
  if (!trimmedCommand) {
    toast("Enter a command", "info", 1600);
    return;
  }
  const trimmedName = String(name || "").trim() || trimmedCommand;
  state.settings.snippets = [...(state.settings.snippets || []), { name: trimmedName, command: trimmedCommand }];
  saveSettings();
  elements.snippetName.value = "";
  elements.snippetCommand.value = "";
  renderSnippets();
}

function removeSnippet(index) {
  const list = [...(state.settings.snippets || [])];
  list.splice(index, 1);
  state.settings.snippets = list;
  saveSettings();
  renderSnippets();
}

function renderSnippets() {
  const host = elements.snippetList;
  if (!host) return;
  host.innerHTML = "";
  const list = state.settings.snippets || [];

  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "snippet-empty";
    empty.textContent = "No snippets yet.";
    host.append(empty);
    return;
  }

  list.forEach((snippet, index) => {
    const row = document.createElement("div");
    row.className = "snippet-row";

    const run = document.createElement("button");
    run.type = "button";
    run.className = "snippet-run";
    run.title = `Run: ${snippet.command}`;
    run.textContent = snippet.name || snippet.command;
    run.addEventListener("click", () => runSnippet(state.activeId, snippet));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "snippet-del";
    remove.title = "Delete snippet";
    remove.setAttribute("aria-label", "Delete snippet");
    remove.innerHTML = '<i data-lucide="trash-2"></i>';
    remove.addEventListener("click", () => removeSnippet(index));

    row.append(run, remove);
    host.append(row);
  });
  refreshIcons();
}

/* ---------------- Session logging --------------- */

function toggleLogging(terminal) {
  if (!terminal) return;
  if (terminal.logging) {
    sendBridge({ type: "logStop", id: terminal.id });
  } else if (!sendBridge({ type: "logStart", id: terminal.id })) {
    toast("Bridge unavailable", "error");
  }
}

// Hands the log to whatever the OS opens .log files with. Only the bridge can do
// this — the browser cannot launch a local file, and the installed app has no
// Electron shell to fall back on.
function openLogFile(terminal) {
  if (!terminal || !terminal.logPath) return;
  if (!sendBridge({ type: "openPath", path: terminal.logPath })) {
    toast("Bridge unavailable", "error");
  }
}

/* ---------------- Run a script --------------- */

// Opens the native file picker and runs the chosen .ps1/.bat/.cmd in the target
// terminal, starting from that terminal's own folder.
async function browseAndRunScript(id) {
  const targetId = id || state.activeId;
  if (!targetId || !state.terminals.has(targetId)) {
    toast("No active terminal", "info", 1600);
    return;
  }

  const scriptPath = await pickScriptPath(state.terminals.get(targetId).cwd);
  if (!scriptPath) return;

  const command = buildScriptCommand(state.terminals.get(targetId), scriptPath);
  if (!sendBridge({ type: "input", id: targetId, data: `${command}\r` })) {
    toast("Bridge unavailable", "error");
    return;
  }
  setActiveTerminal(targetId);
  toast(`Running ${scriptPath.split(/[\\/]/).pop()}`, "success", 2400);
}

// Returns the chosen script path, or null when the user cancelled or no picker
// could be opened. Electron's dialog is used when the app runs under it; the
// installed build is a plain browser window, so the bridge opens the native
// dialog on its behalf.
async function pickScriptPath(cwd) {
  if (window.multiterm && typeof window.multiterm.pickScript === "function") {
    try {
      return (await window.multiterm.pickScript()) || null;
    } catch {
      toast("Could not open the file picker", "error");
      return null;
    }
  }

  if (!state.socketReady) {
    toast("Bridge unavailable", "error");
    return null;
  }
  return requestBridge({ type: "pickScript", cwd: cwd || elements.cwdInput.value || "" });
}

// The surface menu has no terminal to run in, so one is opened for the script.
// The picker runs first on purpose: cancelling it must not leave an empty
// terminal behind.
async function browseAndRunScriptInNewTerminal(options = {}) {
  const scriptPath = await pickScriptPath(options.cwd);
  if (!scriptPath) return;

  const shell = elements.shellSelect.value;
  const command = buildScriptCommand({ shell }, scriptPath);
  const name = scriptPath.split(/[\\/]/).pop();
  const spawn = options.elevated ? newAdminTerminal : addTerminal;

  spawn({
    reveal: true,
    runStartup: true,
    shell,
    cwd: options.cwd || undefined,
    title: options.elevated ? `Admin: ${name}` : name,
    // Queued rather than sent: the shell is not live yet.
    pendingCommand: command
  });
  toast(`Running ${name} in a new terminal`, "success", 2400);
}

function buildScriptCommand(terminal, scriptPath) {
  const ext = (scriptPath.split(".").pop() || "").toLowerCase();
  const shell = (terminal && terminal.shell ? terminal.shell : "").toLowerCase();
  const isCmd = shell.includes("command prompt") || shell.includes("cmd");

  if (isCmd) {
    // In cmd.exe, run batch files directly and .ps1 via powershell.
    return ext === "ps1"
      ? `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`
      : `call "${scriptPath}"`;
  }

  // PowerShell family: the call operator runs .ps1, .bat and .cmd. Single-quote
  // the path (no expansion) and escape embedded single quotes.
  const escaped = scriptPath.replace(/'/g, "''");
  return `& '${escaped}'`;
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

/* ---------------- Right-click paste --------------- */

const RIGHT_CLICK_LEVELS = { "": 0, menu: 0, paste: 1, pasteRun: 2 };

function rightClickAckLevel(value) {
  return RIGHT_CLICK_LEVELS[value] || 0;
}

// Right-click paste is either "paste" (drop clipboard text in) or "pasteRun"
// (drop it in and press Enter). The first time each escalation happens we warn,
// because pasting — especially auto-running — clipboard contents can run
// arbitrary commands. The acknowledgement persists in settings.
function handleRightClickPaste(terminal, action) {
  const needsWarning = rightClickAckLevel(state.settings.rightClickAck) < rightClickAckLevel(action);
  if (needsWarning) {
    showRightClickWarning(action, terminal.id);
  } else {
    performRightClickPaste(terminal.id, action === "pasteRun");
  }
}

async function performRightClickPaste(id, execute) {
  if (!id || !state.terminals.has(id)) return;
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    sendBridge({ type: "input", id, data: execute ? `${text}\r` : text });
  } catch {
    toast("Clipboard unavailable", "error");
  }
}

const rightClickWarn = { action: null, terminalId: null };

function showRightClickWarning(action, terminalId) {
  rightClickWarn.action = action;
  rightClickWarn.terminalId = terminalId;
  elements.rightClickWarnText.textContent = action === "pasteRun"
    ? "Right-clicking a terminal will paste your clipboard contents and run them immediately, as if you pressed Enter. Only continue if you trust what's on your clipboard, since this can execute arbitrary commands."
    : "Right-clicking a terminal will paste your clipboard contents into it. Make sure you trust what's on your clipboard before continuing.";
  elements.rightClickWarnProceed.textContent = action === "pasteRun" ? "Paste & run" : "Paste";
  elements.rightClickWarnRemember.checked = false;
  elements.rightClickWarnOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    elements.rightClickWarnOverlay.classList.add("is-open");
    elements.rightClickWarnProceed.focus();
  });
  refreshIcons();
}

function closeRightClickWarning() {
  elements.rightClickWarnOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.rightClickWarnOverlay.hidden = true;
  }, 150);
  rightClickWarn.action = null;
  rightClickWarn.terminalId = null;
}

function confirmRightClickWarning() {
  const { action, terminalId } = rightClickWarn;
  if (elements.rightClickWarnRemember.checked && action) {
    state.settings.rightClickAck = action;
    saveSettings();
  }
  closeRightClickWarning();
  if (terminalId) performRightClickPaste(terminalId, action === "pasteRun");
}

function bindRightClickWarning() {
  elements.rightClickWarnCancel.addEventListener("click", closeRightClickWarning);
  elements.rightClickWarnProceed.addEventListener("click", confirmRightClickWarning);
  elements.rightClickWarnOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.rightClickWarnOverlay) closeRightClickWarning();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.rightClickWarnOverlay.hidden) {
      event.preventDefault();
      closeRightClickWarning();
    }
  });
}

/* ---------------- Close-to-tray confirmation --------------- */

// Entry point invoked when the user tries to close the window (relayed from the
// Electron main process). Honors a remembered choice, otherwise asks first.
function requestAppClose() {
  const action = state.settings.closeAction;
  if (action === "tray" || action === "quit") {
    finishAppClose(action);
    return;
  }
  openCloseConfirm();
}

function openCloseConfirm() {
  if (!elements.closeConfirmOverlay) return;
  elements.closeConfirmRemember.checked = false;
  elements.closeConfirmOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    elements.closeConfirmOverlay.classList.add("is-open");
    elements.closeConfirmTray.focus();
  });
  refreshIcons();
}

function closeCloseConfirm() {
  if (!elements.closeConfirmOverlay) return;
  elements.closeConfirmOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.closeConfirmOverlay.hidden = true;
  }, 150);
}

// Picks tray/quit from the modal, optionally remembering it for next time.
function chooseCloseAction(action) {
  if (elements.closeConfirmRemember && elements.closeConfirmRemember.checked
      && (action === "tray" || action === "quit")) {
    state.settings.closeAction = action;
    saveSettings();
  }
  closeCloseConfirm();
  finishAppClose(action);
}

// User dismissed the modal (Escape/backdrop): stay open, tell main to abort.
function cancelAppClose() {
  closeCloseConfirm();
  finishAppClose("cancel");
}

// Relays the decision to the Electron main process. No-op in a plain browser.
function finishAppClose(action) {
  try {
    window.multiterm?.respondClose?.(action);
  } catch { /* not running under Electron */ }
}

function bindCloseConfirm() {
  if (!elements.closeConfirmOverlay) return;
  elements.closeConfirmTray.addEventListener("click", () => chooseCloseAction("tray"));
  elements.closeConfirmQuit.addEventListener("click", () => chooseCloseAction("quit"));
  elements.closeConfirmOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.closeConfirmOverlay) cancelAppClose();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.closeConfirmOverlay.hidden) {
      event.preventDefault();
      cancelAppClose();
    }
  });
  // When running under Electron, the main process asks us before closing.
  try {
    window.multiterm?.onCloseRequest?.(() => requestAppClose());
  } catch { /* not running under Electron */ }
}

/* ---------------- Pages --------------- */

// A page is a live container. Switching pages only hides the panes that belong
// to other pages; their sessions keep running, so a long build on page 2 is
// still going when you come back to it. That is the whole difference between a
// page and a saved workspace, which tears every terminal down and rebuilds it
// from metadata.

function defaultPages() {
  return [{ id: "page-1", name: "Page 1" }];
}

// These run during `const state = {...}` near the top of the file, so they must
// not reference module constants declared further down: those are still in the
// temporal dead zone and would throw straight into the catch, silently
// resetting every page. Inline literals, same as loadSettings.
function loadPages() {
  try {
    const raw = JSON.parse(localStorage.getItem("multiterm.pages") || "null");
    const list = Array.isArray(raw) ? raw : raw?.pages;
    const pages = (Array.isArray(list) ? list : [])
      .filter((page) => page && typeof page.id === "string" && page.id)
      .map((page) => ({ id: page.id, name: String(page.name || "Page") }));
    return pages.length > 0 ? pages : defaultPages();
  } catch {
    return defaultPages();
  }
}

function loadActivePageId(pages) {
  try {
    const raw = JSON.parse(localStorage.getItem("multiterm.pages") || "null");
    const saved = raw?.activePageId;
    if (saved && pages.some((page) => page.id === saved)) return saved;
  } catch { /* fall through to the first page */ }
  return pages[0].id;
}

// Sessions outlive the tab: the bridge hands them back on reconnect, so the
// page each one belonged to has to be remembered separately from the pane list.
function loadTerminalPages() {
  try {
    const value = JSON.parse(localStorage.getItem("multiterm.terminalPages") || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function savePages() {
  localStorage.setItem("multiterm.pages", JSON.stringify({ pages: state.pages, activePageId: state.activePageId }));
}

// Merges rather than replaces. On reconnect the bridge re-adopts sessions one at
// a time, and each one calls through here; rebuilding the map from only the
// terminals adopted so far would erase the assignments of every session still
// waiting, collapsing them all onto the active page.
function saveTerminalPages() {
  const map = { ...state.terminalPages };
  for (const terminal of state.terminals.values()) {
    map[terminal.id] = terminal.pageId;
  }
  state.terminalPages = map;
  localStorage.setItem("multiterm.terminalPages", JSON.stringify(map));
}

// Closing a terminal for real is the one moment we know an id will never come
// back, so it is also the only safe moment to drop it from the map.
function forgetTerminalPages(ids) {
  for (const id of ids) delete state.terminalPages[id];
  localStorage.setItem("multiterm.terminalPages", JSON.stringify(state.terminalPages));
}

function activePage() {
  return state.pages.find((page) => page.id === state.activePageId) || state.pages[0];
}

function pageById(id) {
  return state.pages.find((page) => page.id === id) || null;
}

function pageName(id) {
  return pageById(id)?.name || "";
}

// Resolves whatever a caller supplied down to a page that actually exists,
// falling back to the remembered page for reattached sessions.
function resolvePageId(candidate, terminalId) {
  if (candidate && pageById(candidate)) return candidate;
  const remembered = terminalId ? state.terminalPages[terminalId] : null;
  if (remembered && pageById(remembered)) return remembered;
  return state.activePageId;
}

function terminalsOnPage(pageId) {
  return [...state.terminals.values()].filter((terminal) => terminal.pageId === pageId);
}

function terminalsOnActivePage() {
  return terminalsOnPage(state.activePageId);
}

function isOnActivePage(terminal) {
  return Boolean(terminal) && terminal.pageId === state.activePageId;
}

// Panes stay in the DOM and keep their xterm instance alive; only a class
// decides whether they are laid out. Same trick the terminal filter uses.
function applyPageVisibility() {
  for (const terminal of state.terminals.values()) {
    const hidden = terminal.pageId !== state.activePageId;
    const wasHidden = terminal.pane.classList.contains("is-page-hidden");
    if (hidden === wasHidden) continue;
    terminal.pane.classList.toggle("is-page-hidden", hidden);
    // A pane that was display:none has a zero-size viewport, so xterm needs a
    // fit once it is back in flow or it renders at the wrong dimensions.
    if (wasHidden && !hidden) scheduleFit(terminal);
  }
}

function setActivePage(id, options = {}) {
  const page = pageById(id);
  if (!page || state.activePageId === id) return;

  state.activePageId = id;
  applyPageVisibility();
  renderPager();
  updateMinimizedDock();
  savePages();

  // Keep the active terminal on the page you are looking at.
  const onPage = terminalsOnActivePage();
  const active = state.activeId ? state.terminals.get(state.activeId) : null;
  if (options.focus !== false && onPage.length > 0 && (!active || !isOnActivePage(active))) {
    setActiveTerminal(onPage[0].id);
    if (options.focusTerm !== false) onPage[0].term.focus();
  }

  applyZoom();
  updateTerminalActions();
  window.requestAnimationFrame(() => fitAllTerminals());
}

function uniquePageId() {
  let n = state.pages.length + 1;
  while (state.pages.some((page) => page.id === `page-${n}`)) n += 1;
  return `page-${n}`;
}

function addPage(options = {}) {
  const id = uniquePageId();
  const name = String(options.name || "").trim() || `Page ${state.pages.length + 1}`;
  state.pages.push({ id, name });
  savePages();
  renderPager();
  if (options.activate !== false) setActivePage(id);
  log.info("pages", `Added ${name}`);
  return id;
}

function renamePage(id, rawName) {
  const page = pageById(id);
  const name = String(rawName || "").trim();
  if (!page || !name || page.name === name) return;
  page.name = name;
  savePages();
  renderPager();
  renderQuickSwitch();
}

// Closing a page must not silently kill work, so its terminals move to a
// neighbouring page rather than being disposed.
function removePage(id) {
  if (state.pages.length <= 1) {
    toast("Keep at least one page", "info", 1800);
    return;
  }
  const index = state.pages.findIndex((page) => page.id === id);
  if (index === -1) return;

  const page = state.pages[index];
  const fallback = state.pages[index === 0 ? 1 : index - 1];
  const moved = terminalsOnPage(id);
  for (const terminal of moved) {
    terminal.pageId = fallback.id;
  }
  state.pages.splice(index, 1);

  if (state.activePageId === id) {
    state.activePageId = fallback.id;
  }
  applyPageVisibility();
  renderPager();
  savePages();
  saveTerminalPages();
  applyZoom();
  updateTerminalActions();
  window.requestAnimationFrame(() => fitAllTerminals());

  log.info("pages", `Closed ${page.name}`, { movedTerminals: moved.length });
  toast(
    moved.length > 0
      ? `Closed “${page.name}” — moved ${moved.length} terminal${moved.length === 1 ? "" : "s"} to “${fallback.name}”`
      : `Closed “${page.name}”`,
    "info"
  );
}

function moveTerminalToPage(terminalId, pageId) {
  const terminal = state.terminals.get(terminalId);
  const page = pageById(pageId);
  if (!terminal || !page || terminal.pageId === pageId) return;

  terminal.pageId = pageId;
  applyPageVisibility();
  renderPager();
  saveTerminalPages();
  saveSessionSnapshot();

  if (state.activeId === terminalId && !isOnActivePage(terminal)) {
    const remaining = terminalsOnActivePage();
    if (remaining.length > 0) setActiveTerminal(remaining[0].id);
  }
  applyZoom();
  updateTerminalActions();
  toast(`Moved to “${page.name}”`, "success", 1800);
}

function cyclePage(direction) {
  if (state.pages.length < 2) return;
  const index = state.pages.findIndex((page) => page.id === state.activePageId);
  const next = (index + direction + state.pages.length) % state.pages.length;
  setActivePage(state.pages[next].id);
}

function renderPager() {
  const list = elements.pagerList;
  if (!list) return;

  list.textContent = "";
  for (const page of state.pages) {
    const onPage = terminalsOnPage(page.id);
    const count = onPage.length;
    const parked = onPage.filter((terminal) => terminal.minimized).length;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "pager-chip";
    chip.dataset.pageId = page.id;
    chip.setAttribute("role", "tab");
    const isActive = page.id === state.activePageId;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-selected", isActive ? "true" : "false");
    chip.title = `${page.name} — ${count} terminal${count === 1 ? "" : "s"}${parked ? `, ${parked} minimized` : ""} (double-click or right-click to rename)`;

    const label = document.createElement("span");
    label.className = "pager-name";
    label.textContent = page.name;
    chip.append(label);

    const badge = document.createElement("span");
    badge.className = "pager-count";
    badge.textContent = String(count);
    chip.append(badge);

    // A page can hold minimized terminals you cannot see from another page, so flag
    // them on the tab. This is the "reach" affordance for the per-page dock scope.
    if (parked) {
      const park = document.createElement("span");
      park.className = "pager-parked";
      park.setAttribute("aria-label", `${parked} minimized`);
      park.title = `${parked} minimized terminal${parked === 1 ? "" : "s"}`;
      park.innerHTML = '<i data-lucide="minimize-2"></i><span class="pager-parked-count"></span>';
      park.querySelector(".pager-parked-count").textContent = String(parked);
      chip.append(park);
    }

    if (state.pages.length > 1) {
      const close = document.createElement("span");
      close.className = "pager-close";
      close.dataset.pageClose = page.id;
      close.setAttribute("role", "button");
      close.setAttribute("aria-label", `Close ${page.name}`);
      close.title = `Close ${page.name}`;
      close.textContent = "\u00d7";
      chip.append(close);
    }

    list.append(chip);
  }
  refreshIcons();
}

// Renames in place so the chip does not jump around while you type.
function startPageRename(chip) {
  const page = pageById(chip.dataset.pageId);
  const label = chip.querySelector(".pager-name");
  if (!page || !label || chip.querySelector(".pager-rename")) return;

  const input = document.createElement("input");
  input.className = "pager-rename";
  input.type = "text";
  input.value = page.name;
  input.spellcheck = false;
  label.replaceWith(input);
  input.focus();
  input.select();

  let settled = false;
  const finish = (commit) => {
    if (settled) return;
    settled = true;
    if (commit) renamePage(page.id, input.value);
    renderPager();
  };
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

function bindPager() {
  const list = elements.pagerList;
  if (!list) return;

  list.addEventListener("click", (event) => {
    const close = event.target.closest("[data-page-close]");
    if (close) {
      event.stopPropagation();
      removePage(close.dataset.pageClose);
      return;
    }
    const chip = event.target.closest(".pager-chip");
    if (chip && !chip.querySelector(".pager-rename")) setActivePage(chip.dataset.pageId);
  });

  list.addEventListener("dblclick", (event) => {
    const chip = event.target.closest(".pager-chip");
    if (chip) startPageRename(chip);
  });

  list.addEventListener("contextmenu", (event) => {
    const chip = event.target.closest(".pager-chip");
    if (!chip) return;
    event.preventDefault();
    const page = pageById(chip.dataset.pageId);
    if (!page) return;
    const items = [
      { label: "Rename\u2026", icon: "pencil", run: () => startPageRename(chip) },
      { label: "New page", icon: "plus", run: () => addPage() }
    ];
    if (state.pages.length > 1) {
      items.push({ separator: true });
      items.push({ label: `Close ${page.name}`, icon: "x", danger: true, run: () => removePage(page.id) });
    }
    renderContextMenu(items);
    showBuiltContextMenu(event.clientX, event.clientY);
  });

  elements.pagerAdd?.addEventListener("click", () => addPage());
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
    pages: state.pages.map((page) => ({ id: page.id, name: page.name })),
    activePageId: state.activePageId,
    terminals: [...state.terminals.values()].map((terminal) => ({
      title: terminal.titleInput.value,
      shell: terminal.shell,
      cwd: terminal.cwd,
      color: terminal.color,
      pageId: terminal.pageId
    }))
  };
  saveWorkspaces();
  refreshWorkspaceSelect(name);
  elements.workspaceName.value = "";
  log.info("workspace", `Saved workspace “${name}”`, { terminals: state.terminals.size, pages: state.pages.length });
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
  state.primaryId = null;

  // Workspaces saved before pages existed carry a flat terminal list; treat that
  // as a single page so old saves keep restoring.
  const savedPages = Array.isArray(workspace.pages) && workspace.pages.length > 0
    ? workspace.pages
        .filter((page) => page && typeof page.id === "string" && page.id)
        .map((page) => ({ id: page.id, name: String(page.name || "Page") }))
    : [];
  state.pages = savedPages.length > 0 ? savedPages : defaultPages();
  state.activePageId = state.pages.some((page) => page.id === workspace.activePageId)
    ? workspace.activePageId
    : state.pages[0].id;
  state.terminalPages = {};
  savePages();
  renderPager();

  const list = Array.isArray(workspace.terminals) && workspace.terminals.length > 0
    ? workspace.terminals
    : [{ title: "PowerShell 7", shell: "pwsh" }];
  for (const meta of list) {
    addTerminal({
      title: meta.title,
      shell: meta.shell,
      cwd: meta.cwd,
      color: meta.color,
      pageId: meta.pageId
    });
  }

  applyPageVisibility();
  renderPager();
  updateTerminalActions();
  log.info("workspace", `Restored workspace “${name}”`, { terminals: list.length, pages: state.pages.length });
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
  elements.highlightInputPrompts.checked = state.settings.highlightInputPrompts;
  elements.rightClickAction.value = state.settings.rightClickAction;
  elements.scrollbackLines.value = state.settings.scrollback;
  elements.scrollbackInfinite.checked = state.settings.scrollbackInfinite;
  elements.scrollOnOutput.checked = state.settings.scrollOnOutput;
  elements.notifyActivity.checked = state.settings.notifyActivity;
  elements.notifySilence.checked = state.settings.notifySilence;
  elements.silenceSeconds.value = state.settings.silenceSeconds;
  elements.startupCommand.value = state.settings.startupCommand;
  renderSnippets();
  updateBroadcastEnterToggle();
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
    minimized: terminal.minimized,
    pageId: terminal.pageId
  }));
  localStorage.setItem("multiterm.lastSession", JSON.stringify(snapshot));
  // The snapshot carries no ids, so it cannot restore an arrangement when the
  // bridge still has the sessions alive and we reattach instead of recreating.
  // Keep the id order alongside it for that path.
  localStorage.setItem("multiterm.paneOrder", JSON.stringify([...state.terminals.keys()]));
}

function loadPaneOrder() {
  try {
    const value = JSON.parse(localStorage.getItem("multiterm.paneOrder") || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

// Sessions arrive from the bridge in creation order, which throws away any
// rearranging the user did. Reapply the saved order; anything the saved order
// does not know about (created elsewhere, or since this tab last wrote) keeps its
// relative bridge order at the end.
function orderSessionsBySavedArrangement(sessions) {
  const saved = loadPaneOrder();
  if (saved.length === 0) return sessions;

  const rank = new Map(saved.map((id, index) => [id, index]));
  return [...sessions]
    .map((session, index) => ({ session, index, rank: rank.get(session.id) ?? Infinity }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.session);
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

/* ---------------- Update checker --------------- */

const UPDATE_REPO = "andrewtheart/multiterm-workbench";
const UPDATE_RELEASE_PAGE = `https://github.com/${UPDATE_REPO}/releases/latest`;
const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
// Automatic checks are throttled so launching the app repeatedly doesn't hammer
// the GitHub API (and doesn't nag about a release the user already dismissed).
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function loadUpdateMeta() {
  try {
    const value = JSON.parse(localStorage.getItem("multiterm.updateCheck") || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function saveUpdateMeta(patch) {
  try {
    localStorage.setItem("multiterm.updateCheck", JSON.stringify({ ...loadUpdateMeta(), ...patch }));
  } catch {
    /* storage unavailable (private mode) — checking still works, just unthrottled */
  }
}

// Numeric-segment compare; release tags are plain vMAJOR.MINOR.PATCH.
function compareAppVersions(a, b) {
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

function pickInstallerAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const executables = list.filter((asset) => /\.exe$/i.test(asset?.name || "") && asset?.browser_download_url);
  const installer = executables.find((asset) => /setup|install/i.test(asset.name)) || executables[0];
  if (!installer) return null;
  return { name: installer.name, url: installer.browser_download_url, size: Number(installer.size) || 0 };
}

// Browser fallback (the PowerShell bridge runs MultiTerm as a plain web app, with
// no Electron main process to ask). GitHub's API is CORS-enabled, so the *check*
// works everywhere; only the download hand-off needs Electron.
async function fetchLatestReleaseViaFetch() {
  const response = await fetch(UPDATE_API_URL, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
  const data = await response.json();
  const tag = String(data?.tag_name || "");
  return {
    ok: true,
    current: APP_VERSION,
    release: {
      tag,
      version: tag.replace(/^v/i, ""),
      name: data?.name || tag,
      notes: typeof data?.body === "string" ? data.body : "",
      url: data?.html_url || UPDATE_RELEASE_PAGE,
      publishedAt: data?.published_at || "",
      asset: pickInstallerAsset(data?.assets)
    },
    releasePage: UPDATE_RELEASE_PAGE,
    available: Boolean(tag) && compareAppVersions(tag.replace(/^v/i, ""), APP_VERSION) > 0
  };
}

async function requestLatestRelease() {
  if (window.multiterm && typeof window.multiterm.checkForUpdate === "function") {
    return window.multiterm.checkForUpdate();
  }
  return fetchLatestReleaseViaFetch();
}

async function checkForUpdates({ manual = false } = {}) {
  if (state.update.checking) return;
  state.update.checking = true;
  if (manual) toast("Checking for updates\u2026", "info", 1600);

  try {
    const result = await requestLatestRelease();
    saveUpdateMeta({ lastCheck: Date.now() });

    if (!result || result.ok === false) {
      const message = result?.error || "Could not reach GitHub.";
      log.warn("app", `Update check failed: ${message}`);
      if (manual) toast(`Update check failed: ${message}`, "error", 4000);
      return;
    }

    const release = result.release || {};
    if (!result.available) {
      log.info("app", `Update check: already on the latest version (${APP_VERSION})`);
      if (manual) toast(`MultiTerm ${APP_VERSION} is up to date.`, "success", 2600);
      return;
    }

    log.info("app", `Update available: ${release.version}`, { current: result.current || APP_VERSION });
    // An automatic check never re-opens a dialog the user already dismissed for
    // this exact version; a manual check always shows it.
    if (!manual && loadUpdateMeta().dismissedVersion === release.version) return;
    openUpdateDialog(release);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("app", `Update check failed: ${message}`);
    if (manual) toast(`Update check failed: ${message}`, "error", 4000);
  } finally {
    state.update.checking = false;
  }
}

function maybeCheckForUpdatesOnStartup() {
  // Under browser automation (Playwright/WebDriver) this unsolicited network probe
  // can resolve mid-test and pop the update modal, whose overlay then swallows
  // pointer events for every unrelated spec that follows. Automated runs exercise
  // the update flow explicitly through checkForUpdates(); only the automatic
  // startup probe is skipped here, leaving real launches untouched.
  if (navigator.webdriver) return;
  const last = Number(loadUpdateMeta().lastCheck) || 0;
  if (Date.now() - last < UPDATE_CHECK_INTERVAL_MS) return;
  checkForUpdates({ manual: false });
}

function openUpdateDialog(release) {
  if (!elements.updateOverlay) return;
  closePalette();
  state.update.release = release;

  elements.updateSubtitle.textContent = `MultiTerm ${release.version} is available \u2014 you have ${APP_VERSION}.`;
  elements.updateViewRelease.href = release.url || UPDATE_RELEASE_PAGE;
  renderReleaseNotes(release.notes);

  elements.updateError.hidden = true;
  elements.updateError.textContent = "";
  elements.updateProgress.hidden = true;
  elements.updateProgressBar.style.width = "0%";
  elements.updateInstall.disabled = false;
  state.update.downloading = false;

  // Without an Electron main process we cannot download and launch an installer,
  // so the primary action becomes "open the release page".
  const canInstall = Boolean(window.multiterm?.downloadUpdate) && Boolean(release.asset);
  elements.updateInstall.textContent = canInstall ? "Download & install" : "Open download page";

  elements.updateOverlay.hidden = false;
  window.requestAnimationFrame(() => elements.updateOverlay.classList.add("is-open"));
  refreshIcons();
  elements.updateInstall.focus();
}

function closeUpdateDialog() {
  if (!elements.updateOverlay) return;
  elements.updateOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.updateOverlay.hidden = true;
  }, 150);
}

function dismissUpdateDialog() {
  // Downloading is a hand-off to the installer; don't let a stray Escape hide it.
  if (state.update.downloading) return;
  if (state.update.release?.version) saveUpdateMeta({ dismissedVersion: state.update.release.version });
  closeUpdateDialog();
}

// Release bodies are attacker-controllable text from a network response, so they
// are rendered by building DOM nodes from a tiny markdown subset. Nothing here
// ever assigns innerHTML.
function renderReleaseNotes(markdown) {
  const host = elements.updateNotes;
  host.textContent = "";

  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  if (!lines.some((line) => line.trim())) {
    const empty = document.createElement("p");
    empty.className = "update-notes-empty";
    empty.textContent = "This release has no notes.";
    host.append(empty);
    return;
  }

  let list = null;
  let paragraph = null;
  const flushParagraph = () => {
    if (paragraph) host.append(paragraph);
    paragraph = null;
  };
  const flushList = () => {
    if (list) host.append(list);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const node = document.createElement("h3");
      appendInlineMarkdown(node, heading[1]);
      host.append(node);
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      if (!list) list = document.createElement("ul");
      const item = document.createElement("li");
      appendInlineMarkdown(item, bullet[1]);
      list.append(item);
      continue;
    }

    flushList();
    if (!paragraph) paragraph = document.createElement("p");
    else paragraph.append(document.createElement("br"));
    appendInlineMarkdown(paragraph, trimmed);
  }

  flushParagraph();
  flushList();
}

// Supports `code`, **bold** and bare URLs. Links become plain text with an href
// only when they are https, so a release body can't smuggle in a javascript: URL.
function appendInlineMarkdown(node, text) {
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|(https?:\/\/[^\s)]+)/g;
  let index = 0;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > index) node.append(document.createTextNode(text.slice(index, match.index)));
    if (match[1] !== undefined) {
      const code = document.createElement("code");
      code.textContent = match[1];
      node.append(code);
    } else if (match[2] !== undefined) {
      const strong = document.createElement("strong");
      strong.textContent = match[2];
      node.append(strong);
    } else {
      const url = match[3];
      if (/^https:\/\//i.test(url)) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = url;
        node.append(link);
      } else {
        node.append(document.createTextNode(url));
      }
    }
    index = match.index + match[0].length;
    match = pattern.exec(text);
  }

  if (index < text.length) node.append(document.createTextNode(text.slice(index)));
}

async function startUpdateDownload() {
  const release = state.update.release;
  if (!release || state.update.downloading) return;

  const canInstall = Boolean(window.multiterm?.downloadUpdate) && Boolean(release.asset);
  if (!canInstall) {
    openReleasePage(release.url);
    return;
  }

  state.update.downloading = true;
  elements.updateInstall.disabled = true;
  elements.updateLater.disabled = true;
  elements.updateError.hidden = true;
  elements.updateProgress.hidden = false;
  elements.updateProgressBar.style.width = "0%";
  elements.updateProgressText.textContent = `Downloading ${release.asset.name}\u2026`;

  const result = await window.multiterm.downloadUpdate(release.asset);
  if (result?.ok) {
    elements.updateProgressText.textContent = "Starting the installer\u2014 MultiTerm will close.";
    return;
  }

  state.update.downloading = false;
  elements.updateInstall.disabled = false;
  elements.updateLater.disabled = false;
  elements.updateProgress.hidden = true;
  elements.updateError.hidden = false;
  elements.updateError.textContent = result?.error || "The update could not be downloaded.";
  log.error("app", `Update download failed: ${elements.updateError.textContent}`);
}

function openReleasePage(url) {
  const target = url || UPDATE_RELEASE_PAGE;
  if (window.multiterm && typeof window.multiterm.openReleasePage === "function") {
    window.multiterm.openReleasePage(target);
  } else {
    window.open(target, "_blank", "noopener");
  }
}

function updateDownloadProgress({ received = 0, total = 0 } = {}) {
  if (!state.update.downloading) return;
  if (total > 0) {
    const percent = Math.min(100, Math.round((received / total) * 100));
    elements.updateProgressBar.style.width = `${percent}%`;
    elements.updateProgressText.textContent = `Downloading\u2026 ${percent}% (${formatBytes(received)} of ${formatBytes(total)})`;
  } else {
    elements.updateProgressText.textContent = `Downloading\u2026 ${formatBytes(received)}`;
  }
}

function bindUpdateDialog() {
  if (!elements.updateOverlay) return;

  elements.updateClose.addEventListener("click", dismissUpdateDialog);
  elements.updateLater.addEventListener("click", dismissUpdateDialog);
  elements.updateInstall.addEventListener("click", startUpdateDownload);
  elements.updateViewRelease.addEventListener("click", (event) => {
    event.preventDefault();
    openReleasePage(state.update.release?.url);
  });
  elements.updateOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.updateOverlay) dismissUpdateDialog();
  });

  window.multiterm?.onUpdateProgress?.(updateDownloadProgress);
}

/* ---------------- Terminal context menu --------------- */

function bindContextMenu() {
  elements.host.addEventListener("contextmenu", (event) => {
    const pane = event.target.closest(".terminal-pane");
    if (!pane) {
      // Blank surface: no pane to act on, so offer the workspace-wide menu.
      showSurfaceContextMenu(event.clientX, event.clientY);
      event.preventDefault();
      return;
    }
    // Let the pane title input use the native editing menu.
    if (event.target.closest(".pane-title")) return;

    const terminal = state.terminals.get(pane.dataset.id);
    if (!terminal) return;

    event.preventDefault();
    setActiveTerminal(terminal.id);

    const action = state.settings.rightClickAction;
    if (action === "paste" || action === "pasteRun") {
      handleRightClickPaste(terminal, action);
    } else {
      showContextMenu(event.clientX, event.clientY, terminal);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!elements.contextMenu.hidden && !elements.contextMenu.contains(event.target)) {
      hideContextMenu();
    }
  });
  // Capture phase so menu navigation wins over xterm's own key handling while the
  // menu is open, and so accelerator keys never fall through to the terminal.
  window.addEventListener("keydown", onContextMenuKeydown, true);
  window.addEventListener("blur", hideContextMenu);
  window.addEventListener("resize", hideContextMenu);
  elements.host.addEventListener("scroll", hideContextMenu, true);
}

// Offers the other pages plus a "new page" escape hatch, so a pane can always be
// moved somewhere even when only one page exists.
function buildMoveToPageItems(terminal) {
  const others = state.pages.filter((page) => page.id !== terminal.pageId);
  const items = others.map((page) => ({
    label: `Move to ${page.name}`,
    icon: "corner-up-right",
    run: () => moveTerminalToPage(terminal.id, page.id)
  }));
  items.push({
    label: "Move to new page",
    icon: "plus",
    run: () => {
      const id = addPage({ activate: false });
      moveTerminalToPage(terminal.id, id);
    }
  });
  return [{ separator: true }, ...items];
}

function buildLoggingMenuItems(terminal) {
  if (!terminal.logging) {
    return [
      { label: "Log to file\u2026", icon: "file-text", run: () => toggleLogging(terminal) },
      ...(terminal.logPath
        ? [{ label: "Reveal last log", icon: "folder-search", run: () => sendBridge({ type: "reveal", path: terminal.logPath }) }]
        : [])
    ];
  }

  // While logging, the row names the file being written and offers both opening it
  // and stopping, so the state is legible without leaving the menu.
  const file = logFileName(terminal.logPath);
  return [
    {
      icon: "circle-dot",
      label: `Logging to ${file}. Stop logging`,
      parts: [
        { text: "Logging to " },
        { text: file, title: terminal.logPath, className: "ctx-link", run: () => openLogFile(terminal) },
        { text: " " },
        { text: "(Stop logging)", className: "ctx-muted", run: () => toggleLogging(terminal) }
      ]
    },
    { label: "Reveal log folder", icon: "folder-search", run: () => sendBridge({ type: "reveal", path: terminal.logPath }) }
  ];
}

function logFileName(logPath) {
  const parts = String(logPath || "").split(/[\\/]/);
  return parts[parts.length - 1] || "log";
}

function buildContextMenu(terminal) {
  const hasSelection = Boolean(terminal.term.getSelection());
  const isZoomed = state.zoomedId === terminal.id;
  const snippetItems = (state.settings.snippets || []).slice(0, 8).map((snippet) => ({
    label: snippet.name || snippet.command,
    icon: "terminal",
    run: () => runSnippet(terminal.id, snippet)
  }));

  const items = [
    { label: "Copy", hint: "Ctrl+Shift+C", icon: "clipboard-copy", disabled: !hasSelection, run: () => copyTerminalOutput(terminal.id) },
    { label: "Copy all output", icon: "copy", run: () => { terminal.term.clearSelection(); copyTerminalOutput(terminal.id); } },
    { label: "Paste", hint: "Ctrl+Shift+V", icon: "clipboard-paste", run: () => pasteIntoTerminal(terminal.id) },
    { label: "Select all", hint: "Ctrl+A", icon: "text-select", run: () => terminal.term.selectAll() },
    { separator: true },
    { label: "Find\u2026", hint: "Ctrl+F", icon: "search", run: () => openFind(terminal) },
    { label: "Find in all terminals\u2026", hint: "Ctrl+Shift+F", icon: "search", run: openFindAll },
    { label: "Clear", hint: "Ctrl+Shift+L", icon: "eraser", run: () => clearTerminal(terminal.id) },
    { label: isZoomed ? "Restore size" : "Maximize", hint: "Ctrl+Shift+X", icon: isZoomed ? "minimize-2" : "maximize-2", run: () => toggleZoomPane(terminal.id) },
    { separator: true },
    { label: "Open folder", icon: "folder-open", run: () => revealTerminalCwd(terminal) },
    { label: "New terminal here", icon: "folder-plus", run: () => addTerminal({ reveal: true, runStartup: true, cwd: terminal.cwd, title: terminal.titleInput.value }) },
    { label: "New Administrator terminal", icon: "shield", run: () => newAdminTerminal({ shell: terminal.shell, cwd: terminal.cwd }) },
    { label: "Run script\u2026", icon: "file-code", run: () => browseAndRunScript(terminal.id) },
    ...buildLoggingMenuItems(terminal),
    ...(snippetItems.length ? [{ separator: true }, ...snippetItems] : []),
    { separator: true },
    { label: "Split (duplicate)", icon: "copy-plus", run: () => addTerminal({ reveal: true, runStartup: true, title: `${terminal.titleInput.value} copy` }) },
    { label: "Restart", hint: "Ctrl+Shift+R", icon: "rotate-cw", run: () => restartSession(terminal.id) },
    { label: "Cycle color", icon: "tag", run: () => cyclePaneColor(terminal) },
    ...buildMoveToPageItems(terminal),
    { separator: true },
    { label: "Close", hint: "Ctrl+Shift+W", icon: "x", danger: true, run: () => removeTerminal(terminal.id) }
  ];

  renderContextMenu(items);
}

// "Here" on the blank surface means the folder you were last working in, which
// tracks `cd` via OSC 7/9, falling back to the workspace CWD field.
function surfaceCwd() {
  const active = state.activeId ? state.terminals.get(state.activeId) : null;
  return (active && active.cwd) || elements.cwdInput.value || "";
}

// Right-clicking the empty area around the panes gets the same menu styling as a
// pane, minus everything that needs a specific terminal. Terminal-specific
// actions that still make sense here (running a script) open a terminal to act
// on instead of being dropped.
function buildSurfaceContextMenu() {
  const here = surfaceCwd();
  const hasTerminals = state.terminals.size > 0;
  const minimized = [...state.terminals.values()].filter((terminal) => terminal.minimized).length;
  const newTerminal = (options) => addTerminal({ reveal: true, runStartup: true, ...options });

  renderContextMenu([
    { label: "New terminal", hint: "Ctrl+T", icon: "plus", run: () => newTerminal({ cwd: here || undefined }) },
    { label: "New terminal here", icon: "folder-plus", title: here || undefined, disabled: !here, run: () => newTerminal({ cwd: here }) },
    { label: "New Administrator terminal", icon: "shield", run: () => newAdminTerminal({ cwd: here || undefined, runStartup: true }) },
    { label: "Run script\u2026", icon: "file-code", run: () => browseAndRunScriptInNewTerminal({ cwd: here }) },
    { label: "Run script as Administrator\u2026", icon: "file-code", run: () => browseAndRunScriptInNewTerminal({ cwd: here, elevated: true }) },
    { separator: true },
    { label: "New PowerShell 7 terminal", icon: "terminal", run: () => newTerminal({ shell: "pwsh", title: "PowerShell 7", cwd: here || undefined }) },
    { label: "New Windows PowerShell terminal", icon: "terminal", run: () => newTerminal({ shell: "powershell", title: "Windows PowerShell", cwd: here || undefined }) },
    { label: "New Command Prompt terminal", icon: "terminal", run: () => newTerminal({ shell: "cmd", title: "Command Prompt", cwd: here || undefined }) },
    { label: "New WSL terminal", icon: "terminal", run: () => newTerminal({ shell: "wsl", title: "WSL", cwd: here || undefined }) },
    { separator: true },
    { label: "Find in all terminals\u2026", hint: "Ctrl+Shift+F", icon: "search", disabled: !hasTerminals, run: openFindAll },
    { label: "Broadcast command\u2026", hint: "Ctrl+Shift+B", icon: "megaphone", disabled: !hasTerminals, run: () => toggleBroadcast(true) },
    { label: "Command palette\u2026", hint: "Ctrl+Shift+P", icon: "command", run: openPalette },
    { separator: true },
    { label: "Open folder", icon: "folder-open", title: here || undefined, disabled: !here, run: () => revealPath(here) },
    ...(minimized
      ? [{ label: `Restore ${minimized} minimized terminal${minimized === 1 ? "" : "s"}`, icon: "maximize-2", run: restoreAllTerminals }]
      : []),
    { label: "Fit all terminals", icon: "maximize", disabled: !hasTerminals, run: fitAllTerminals },
    { label: "Reset layout", icon: "rotate-ccw", run: resetLayout },
    { separator: true },
    { label: "New page", icon: "plus", run: () => addPage() },
    { separator: true },
    { label: "Close all terminals", icon: "trash-2", danger: true, disabled: !hasTerminals, run: closeAllTerminals }
  ]);
}

function buildPaneOverflowMenu(terminal) {
  // Move/colour live in the header unless the pane is too narrow (or the host is in
  // compact mode) to show them; find and duplicate live in this menu permanently.
  const collapsed = terminal.pane.classList.contains("is-narrow")
    || elements.host.classList.contains("compact");
  const collapsedItems = collapsed
    ? [
      {
        label: "Move left",
        icon: "arrow-left",
        disabled: !terminal.pane.previousElementSibling,
        run: () => moveTerminal(terminal.id, -1)
      },
      {
        label: "Move right",
        icon: "arrow-right",
        disabled: !terminal.pane.nextElementSibling,
        run: () => moveTerminal(terminal.id, 1)
      },
      { label: "Cycle label color", icon: "tag", run: () => cyclePaneColor(terminal) }
    ]
    : [];

  renderContextMenu([
    ...collapsedItems,
    { label: "Find\u2026", hint: "Ctrl+F", icon: "search", run: () => openFind(terminal) },
    {
      label: "Duplicate",
      icon: "copy-plus",
      run: () => addTerminal({ reveal: true, runStartup: true, title: `${terminal.titleInput.value} copy` })
    }
  ]);
}

// Keyboard activation state for the open menu. Every actionable row earns a
// letter mnemonic (underlined in its label) and, for the first nine, a 1-9
// badge; arrow keys move a highlight, Enter/Space runs it, and pressing a
// mnemonic or badge digit runs that row outright.
let ctxFocusables = [];
let ctxKeyIndex = -1;
const ctxByLetter = new Map();
const ctxByNumber = new Map();

// Picks a unique, memorable accelerator letter for a label: word initials first
// (so "Find in all terminals" prefers F, then I, A, T), then any remaining
// letter, skipping ones already claimed by earlier rows in the same menu.
function assignAccelLetter(label, used) {
  const lower = String(label).toLowerCase();
  const positions = [];
  const wordRe = /[a-z0-9]+/g;
  let match;
  while ((match = wordRe.exec(lower))) positions.push(match.index);
  // Fall back to every remaining character so a short unique letter can still be
  // found once all the word initials are taken.
  for (let i = 0; i < lower.length; i += 1) positions.push(i);
  for (const index of positions) {
    const ch = lower[index];
    if (ch < "a" || ch > "z") continue; // letters only; digits belong to badges
    if (used.has(ch)) continue;
    used.add(ch);
    return { key: ch, index };
  }
  return null;
}

// Builds a label node, underlining the accelerator character in place so the
// shortcut reads straight off the menu.
function renderAccelLabel(text, index) {
  const label = document.createElement("span");
  label.className = "ctx-label";
  if (index == null || index < 0 || index >= text.length) {
    label.textContent = text;
    return label;
  }
  label.append(document.createTextNode(text.slice(0, index)));
  const key = document.createElement("u");
  key.className = "ctx-key";
  key.textContent = text[index];
  label.append(key);
  label.append(document.createTextNode(text.slice(index + 1)));
  return label;
}

function renderContextMenu(items) {
  elements.contextMenu.innerHTML = "";
  ctxFocusables = [];
  ctxKeyIndex = -1;
  ctxByLetter.clear();
  ctxByNumber.clear();
  elements.contextMenu.removeAttribute("aria-activedescendant");
  const usedLetters = new Set();
  let rowId = 0;

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement("div");
      sep.className = "ctx-sep";
      elements.contextMenu.append(sep);
      continue;
    }

    const el = document.createElement("div");
    el.className = `ctx-item${item.danger ? " danger" : ""}${item.info ? " ctx-info" : ""}`;
    // An info row reports a fact rather than offering an action, so it is not a
    // menuitem and must not be reachable or announced as one.
    el.setAttribute("role", item.info ? "presentation" : "menuitem");
    if (item.disabled) el.setAttribute("aria-disabled", "true");

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", item.icon);
    el.append(icon);

    // A row can carry several independent actions (the logging row offers both the
    // log file and a stop control), in which case the row itself is not clickable
    // and each part handles its own activation.
    if (item.parts) {
      el.classList.add("ctx-multi");
      const label = document.createElement("span");
      label.className = "ctx-parts";
      label.setAttribute("aria-label", item.label);
      for (const part of item.parts) {
        if (!part.run) {
          label.append(document.createTextNode(part.text));
          continue;
        }

        const action = document.createElement("button");
        action.type = "button";
        action.className = `ctx-part${part.className ? ` ${part.className}` : ""}`;
        action.textContent = part.text;
        if (part.title) action.title = part.title;
        action.addEventListener("click", (event) => {
          event.stopPropagation();
          hideContextMenu();
          part.run();
        });
        label.append(action);
      }
      el.append(label);
      elements.contextMenu.append(el);
      continue;
    }

    // A plain row you can actually run is the only kind that earns an accelerator.
    const actionable = Boolean(item.run) && !item.disabled && !item.info;
    const accel = actionable ? assignAccelLetter(item.label, usedLetters) : null;
    const number = actionable && ctxByNumber.size < 9 ? ctxByNumber.size + 1 : null;

    el.append(renderAccelLabel(item.label, accel ? accel.index : -1));

    // Rows whose label cannot spell out the whole story (a path, say) carry the
    // detail as a tooltip rather than growing the menu.
    if (item.title) el.title = item.title;

    // The keyboard hint and the number badge share a right-aligned tail so they
    // never collide with the label.
    if (item.hint || number != null) {
      const accessories = document.createElement("span");
      accessories.className = "ctx-accessories";
      if (item.hint) {
        const hint = document.createElement("span");
        hint.className = "ctx-hint";
        hint.textContent = item.hint;
        accessories.append(hint);
      }
      if (number != null) {
        const badge = document.createElement("span");
        badge.className = "ctx-accel-num";
        // The digit is painted by CSS (::after) rather than a text node so this
        // purely decorative, aria-hidden affordance never leaks into the row's
        // textContent — keyboard activation reads dataset.accelNum, not this label.
        badge.setAttribute("data-num", String(number));
        badge.setAttribute("aria-hidden", "true");
        accessories.append(badge);
      }
      el.append(accessories);
    }

    if (actionable) {
      el.id = `ctx-item-${rowId++}`;
      el.addEventListener("click", () => {
        hideContextMenu();
        item.run();
      });
      // Keep the keyboard highlight in step with the pointer so the two input
      // modes never disagree about which row is current.
      el.addEventListener("pointerenter", () => setContextFocus(ctxFocusables.indexOf(el)));
      ctxFocusables.push(el);
      if (accel) {
        el.dataset.accelKey = accel.key;
        ctxByLetter.set(accel.key, el);
      }
      if (number != null) {
        el.dataset.accelNum = String(number);
        ctxByNumber.set(String(number), el);
      }
    }

    elements.contextMenu.append(el);
  }
}

// Moves the keyboard highlight to a specific row, syncing the class, scroll
// position and aria-activedescendant that a screen reader follows.
function setContextFocus(index) {
  if (ctxKeyIndex >= 0 && ctxFocusables[ctxKeyIndex]) {
    ctxFocusables[ctxKeyIndex].classList.remove("is-key-focus");
  }
  ctxKeyIndex = index;
  const el = ctxFocusables[index];
  if (el) {
    el.classList.add("is-key-focus");
    el.scrollIntoView({ block: "nearest" });
    elements.contextMenu.setAttribute("aria-activedescendant", el.id);
  } else {
    elements.contextMenu.removeAttribute("aria-activedescendant");
  }
}

// Steps the highlight by delta, wrapping around, and seeds the first/last row
// when nothing is highlighted yet so a single arrow press always lands.
function moveContextFocus(delta) {
  if (!ctxFocusables.length) return;
  let next = ctxKeyIndex;
  if (next < 0) next = delta > 0 ? 0 : ctxFocusables.length - 1;
  else next = (next + delta + ctxFocusables.length) % ctxFocusables.length;
  setContextFocus(next);
}

// While the menu owns the screen it also owns the keyboard: navigation keys move
// the highlight, Enter/Space run the highlighted row, and any unmodified letter
// or 1-9 digit fires its accelerator. Stray keys are swallowed so they never
// leak into the terminal underneath.
function onContextMenuKeydown(event) {
  if (elements.contextMenu.hidden) return;
  const key = event.key;
  const stop = () => {
    event.preventDefault();
    event.stopPropagation();
  };

  if (key === "Escape") {
    hideContextMenu();
    stop();
    return;
  }
  if (key === "ArrowDown") {
    moveContextFocus(1);
    stop();
    return;
  }
  if (key === "ArrowUp") {
    moveContextFocus(-1);
    stop();
    return;
  }
  if (key === "Tab") {
    moveContextFocus(event.shiftKey ? -1 : 1);
    stop();
    return;
  }
  if (key === "Home") {
    setContextFocus(0);
    stop();
    return;
  }
  if (key === "End") {
    setContextFocus(ctxFocusables.length - 1);
    stop();
    return;
  }
  if (key === "Enter" || key === " ") {
    const el = ctxFocusables[ctxKeyIndex];
    if (el) el.click();
    // Swallow either way so a stray Enter never reaches the terminal while the
    // menu is up.
    stop();
    return;
  }

  // Accelerators are single, unmodified key presses so app-wide chords still work.
  if (event.ctrlKey || event.altKey || event.metaKey || key.length !== 1) return;
  let target = null;
  if (key >= "1" && key <= "9") target = ctxByNumber.get(key);
  else if (/[a-z]/i.test(key)) target = ctxByLetter.get(key.toLowerCase());
  if (target) target.click();
  // Whether or not it matched, keep the keystroke from reaching the terminal.
  stop();
}

function showContextMenu(x, y, terminal) {
  buildContextMenu(terminal);
  showBuiltContextMenu(x, y);
}

function showSurfaceContextMenu(x, y) {
  buildSurfaceContextMenu();
  showBuiltContextMenu(x, y);
}

function showPaneOverflowMenu(button, terminal) {
  buildPaneOverflowMenu(terminal);
  button.setAttribute("aria-expanded", "true");
  const rect = button.getBoundingClientRect();
  showBuiltContextMenu(rect.right, rect.bottom + 4, { alignRight: true });
}

// Right-clicking the PID pill reports on the session behind it. Built fresh each
// time so the elapsed time is current.
function showSessionInfoMenu(terminal) {
  const launched = formatLaunchTimestamp(terminal.startedAt);
  const items = [];

  if (launched) {
    items.push({ info: true, icon: "calendar-clock", label: `Launched ${launched}` });
    if (terminal.status !== "exited" && terminal.status !== "error") {
      items.push({ info: true, icon: "timer", label: `Up ${formatUptime(terminal.startedAt)}` });
    }
  } else {
    items.push({ info: true, icon: "calendar-clock", label: "Launch time unavailable" });
  }

  if (terminal.pid != null) {
    items.push({ info: true, icon: "hash", label: `PID ${terminal.pid}` });
  }

  const details = [
    terminal.titleInput.value,
    terminal.pid != null ? `PID ${terminal.pid}` : null,
    launched ? `launched ${launched}` : null,
    terminal.shell || null,
    terminal.cwd || null
  ]
    .filter(Boolean)
    .join("\n");

  items.push({ separator: true });
  items.push({
    label: "Copy session details",
    icon: "clipboard-copy",
    run: () =>
      navigator.clipboard.writeText(details).then(
        () => toast("Session details copied", "success", 1600),
        () => toast("Copy failed", "error", 1800)
      )
  });

  renderContextMenu(items);
  // Anchored to the pill rather than the pointer, growing up and to the left, so
  // it reads as belonging to the pill and never covers it. The pill lives in the
  // bottom-right of a pane, which is the only direction with room anyway.
  const rect = terminal.statusElement.getBoundingClientRect();
  showBuiltContextMenu(rect.right, rect.top - 6, { alignRight: true, alignBottom: true });
}

function showBuiltContextMenu(x, y, { alignRight = false, alignBottom = false } = {}) {
  const menu = elements.contextMenu;
  menu.hidden = false;
  menu.style.left = "0px";
  menu.style.top = "0px";

  // Swap the <i data-lucide> placeholders for real SVGs *before* measuring.
  // Placeholders occupy no width, so measuring first reports a menu ~16px
  // narrower than the one that ends up on screen, and every right/bottom-aligned
  // menu lands 16px off its anchor.
  refreshIcons();

  // x/y name the corner the menu should hang from: alignRight grows it leftward,
  // alignBottom grows it upward. Clamping still wins, so a menu anchored near an
  // edge stays on screen rather than honouring the requested direction.
  const rect = menu.getBoundingClientRect();
  const desiredLeft = alignRight ? x - rect.width : x;
  const desiredTop = alignBottom ? y - rect.height : y;
  const left = Math.max(8, Math.min(desiredLeft, window.innerWidth - rect.width - 8));
  const top = Math.max(8, Math.min(desiredTop, window.innerHeight - rect.height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function hideContextMenu() {
  if (!elements.contextMenu.hidden) {
    elements.contextMenu.hidden = true;
    ctxKeyIndex = -1;
    elements.contextMenu.removeAttribute("aria-activedescendant");
  }
  for (const button of elements.host.querySelectorAll('button[data-action="more"][aria-expanded="true"]')) {
    button.setAttribute("aria-expanded", "false");
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
    elements.rightClickAction,
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