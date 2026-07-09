const defaultSettings = {
  columns: 2,
  compactChrome: false,
  focusWidth: 65,
  fontSize: 14,
  gap: 10,
  headerHidden: false,
  layout: "auto",
  minWidth: 420,
  paneHeight: 320,
  rows: 2,
  sidecarHidden: false,
  syncInput: false,
  theme: "ember"
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
  bridgeStatus: document.querySelector("#bridgeStatus"),
  closeAllTerminals: document.querySelector("#closeAllTerminals"),
  columnCount: document.querySelector("#columnCount"),
  columnCountValue: document.querySelector("#columnCountValue"),
  compactChrome: document.querySelector("#compactChrome"),
  controlPanel: document.querySelector(".control-panel"),
  cwdInput: document.querySelector("#cwdInput"),
  fitAll: document.querySelector("#fitAll"),
  focusWidth: document.querySelector("#focusWidth"),
  focusWidthValue: document.querySelector("#focusWidthValue"),
  fontSize: document.querySelector("#fontSize"),
  fontSizeValue: document.querySelector("#fontSizeValue"),
  host: document.querySelector("#terminalHost"),
  layoutMode: document.querySelector("#layoutMode"),
  minWidth: document.querySelector("#minWidth"),
  minWidthValue: document.querySelector("#minWidthValue"),
  paneGap: document.querySelector("#paneGap"),
  paneGapValue: document.querySelector("#paneGapValue"),
  paneHeight: document.querySelector("#paneHeight"),
  paneHeightValue: document.querySelector("#paneHeightValue"),
  paneTemplate: document.querySelector("#paneTemplate"),
  resetLayout: document.querySelector("#resetLayout"),
  rowCount: document.querySelector("#rowCount"),
  rowCountValue: document.querySelector("#rowCountValue"),
  shellSelect: document.querySelector("#shellSelect"),
  snapPreview: document.querySelector("#snapPreview"),
  syncInput: document.querySelector("#syncInput"),
  terminalSearchInput: document.querySelector("#terminalSearchInput"),
  terminalTheme: document.querySelector("#terminalTheme"),
  toggleHeader: document.querySelector("#toggleHeader"),
  toggleSidecar: document.querySelector("#toggleSidecar")
};

const state = {
  activeId: null,
  manualLayouts: loadManualLayouts(),
  nextIndex: 1,
  settings: loadSettings(),
  snap: null,
  socket: null,
  socketReady: false,
  terminalSearch: "",
  terminals: new Map()
};

window.addEventListener("DOMContentLoaded", () => {
  bindControls();
  applySettings();
  connectBridge();
  refreshIcons();
});

window.addEventListener("beforeunload", () => {
  saveSettings();
  saveManualLayouts();
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
  elements.compactChrome.checked = state.settings.compactChrome;
  elements.syncInput.checked = state.settings.syncInput;

  elements.addTerminal.addEventListener("click", () => addTerminal({ reveal: true }));
  elements.closeAllTerminals.addEventListener("click", closeAllTerminals);
  elements.fitAll.addEventListener("click", fitAllTerminals);
  elements.resetLayout.addEventListener("click", resetLayout);
  elements.terminalSearchInput.addEventListener("input", () => {
    state.terminalSearch = normalizeSearchText(elements.terminalSearchInput.value);
    applyTerminalSearch();
  });
  elements.toggleHeader.addEventListener("click", () => toggleChrome("headerHidden"));
  elements.toggleSidecar.addEventListener("click", () => toggleChrome("sidecarHidden"));

  bindSetting(elements.layoutMode, "layout", "change", (value) => value);
  bindSetting(elements.minWidth, "minWidth", "input", Number);
  bindSetting(elements.columnCount, "columns", "input", Number);
  bindSetting(elements.rowCount, "rows", "input", Number);
  bindSetting(elements.paneHeight, "paneHeight", "input", Number);
  bindSetting(elements.focusWidth, "focusWidth", "input", Number);
  bindSetting(elements.paneGap, "gap", "input", Number);
  bindSetting(elements.fontSize, "fontSize", "input", Number);
  bindSetting(elements.terminalTheme, "theme", "change", (value) => value);
  bindSetting(elements.compactChrome, "compactChrome", "change", (_, element) => element.checked);
  bindSetting(elements.syncInput, "syncInput", "change", (_, element) => element.checked);
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
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  state.socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  state.socket.addEventListener("open", () => {
    state.socketReady = true;
    setBridgeStatus("Bridge connected", "online");
    updateTerminalActions();
    for (const terminal of state.terminals.values()) {
      if (!terminal.remoteRequested && terminal.status !== "live") {
        requestSession(terminal);
      }
    }
  });

  state.socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    handleBridgeMessage(message);
  });

  state.socket.addEventListener("close", () => {
    state.socketReady = false;
    setBridgeStatus("Bridge disconnected", "offline");
    for (const terminal of state.terminals.values()) {
      setTerminalStatus(terminal, "offline", "dead");
    }
    updateTerminalActions();
  });

  state.socket.addEventListener("error", () => {
    state.socketReady = false;
    setBridgeStatus("Bridge error", "offline");
    updateTerminalActions();
  });
}

function handleBridgeMessage(message) {
  if (message.type === "welcome") {
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
      addTerminal();
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
    updateTerminalSearchVisibility(terminal);
    scheduleFit(terminal);
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
    writelnTerminal(terminal, "");
    writelnTerminal(terminal, `\x1b[31mSession exited (${message.code ?? message.signal ?? "closed"}).\x1b[0m`);
    return;
  }

  if (message.type === "createFailed" || message.type === "error") {
    const terminal = state.terminals.get(message.id);
    if (terminal) {
      writelnTerminal(terminal, `\x1b[31m${message.message}\x1b[0m`);
      setTerminalStatus(terminal, "error", "dead");
    } else {
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
    cursorBlink: true,
    cursorStyle: "bar",
    fontFamily: "Cascadia Mono, Consolas, 'Courier New', monospace",
    fontSize: state.settings.fontSize,
    scrollback: 20000,
    tabStopWidth: 4,
    theme: themes[state.settings.theme]
  });
  const fitAddon = new FitAddon.FitAddon();

  term.loadAddon(fitAddon);
  titleInput.value = title;
  pane.dataset.id = id;
  elements.host.append(pane);
  term.open(screen);

  const terminal = {
    cwd: session.cwd || elements.cwdInput.value,
    fitAddon,
    id,
    observer: null,
    pane,
    pid: session.pid,
    remoteRequested: Boolean(options.reattach),
    searchText: "",
    screen,
    shell: elements.shellSelect.value,
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

  term.element?.addEventListener("focusin", () => setActiveTerminal(id));
  pane.addEventListener("pointerdown", () => setActiveTerminal(id));
  pane.addEventListener("pointerup", () => syncManualLayout(terminal));

  if (options.reattach) {
    setTerminalStatus(terminal, session.pid ? `pid ${session.pid}` : "live", "live");
    writelnTerminal(terminal, "\x1b[36mReattached to running session.\x1b[0m");
  } else {
    requestSession(terminal);
  }

  refreshTerminalSearchText(terminal);
  applySettings();
  revealTerminal(terminal);
  scheduleFit(terminal);
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
    } else if (action === "duplicate") {
      addTerminal({ reveal: true, title: `${terminal.titleInput.value} copy` });
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
    return;
  }

  terminal.remoteRequested = true;
  setTerminalStatus(terminal, "starting", "dead");
  sendBridge({
    type: "create",
    cols: terminal.term.cols,
    cwd: elements.cwdInput.value,
    id: terminal.id,
    rows: terminal.term.rows,
    shell: elements.shellSelect.value,
    title: terminal.titleInput.value
  });
}

function removeTerminal(id) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;

  if (!sendBridge({ type: "kill", id }) && terminal.remoteRequested) {
    setBridgeStatus("Bridge unavailable; session still running", "offline");
    updateTerminalActions();
    return;
  }

  disposeTerminal(terminal);

  if (state.activeId === id) {
    const next = state.terminals.keys().next().value;
    state.activeId = null;
    if (next) setActiveTerminal(next);
  }

  saveManualLayouts();
  updateTerminalActions();
}

function closeAllTerminals() {
  if (state.terminals.size === 0) return;

  if (!sendBridge({ type: "killAll" })) {
    setBridgeStatus("Bridge unavailable; sessions still running", "offline");
    updateTerminalActions();
    return;
  }

  for (const terminal of [...state.terminals.values()]) {
    disposeTerminal(terminal);
  }

  state.activeId = null;
  saveManualLayouts();
  updateTerminalActions();
}

function disposeTerminal(terminal) {
  const { id } = terminal;
  if (state.snap?.id === id) {
    state.snap = null;
  }
  terminal.observer.disconnect();
  terminal.term.dispose();
  terminal.pane.remove();
  state.terminals.delete(id);
  delete state.manualLayouts[id];
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
    terminal.pane.classList.toggle("is-active", terminal.id === id);
    terminal.pane.classList.toggle("is-primary", terminal.id === id);
  }
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
}

function applySettings() {
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

  for (const terminal of state.terminals.values()) {
    terminal.term.options.fontSize = state.settings.fontSize;
    terminal.term.options.theme = themes[state.settings.theme];
    applyManualLayout(terminal, ensureManualLayout(terminal.id));
    scheduleFit(terminal);
  }
}

function updateChromeToggles() {
  setChromeToggle(elements.toggleHeader, state.settings.headerHidden, "Show header", "Hide header");
  setChromeToggle(elements.toggleSidecar, state.settings.sidecarHidden, "Show layout controls", "Hide layout controls");
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