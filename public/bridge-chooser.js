/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const elements = {
  summary: document.getElementById("chooserSummary"),
  list: document.getElementById("bridgeList"),
  empty: document.getElementById("emptyState"),
  warning: document.getElementById("bridgeChoiceWarning"),
  warningTitle: document.getElementById("bridgeChoiceWarningTitle"),
  warningText: document.getElementById("bridgeChoiceWarningText"),
  remember: document.getElementById("rememberChoice"),
  connect: document.getElementById("connectBridge"),
  startNew: document.getElementById("newBridge"),
  cancel: document.getElementById("cancelChooser"),
  close: document.getElementById("closeChooser")
};

let bridges = [];
let selectedIndex = -1;
let confirmedIndex = -1;
let completed = false;

function refreshIcons() {
  window.lucide?.createIcons({
    attrs: {
      "aria-hidden": "true",
      "stroke-width": 1.8
    }
  });
}

function complete(action) {
  if (completed) return;
  completed = true;
  window.bridgeChooser.complete({
    action,
    index: selectedIndex,
    remember: elements.remember.checked
  });
}

function sessionLabel(count) {
  return `${count} active session${count === 1 ? "" : "s"}`;
}

function startedLabel(value) {
  if (!value) return "Start time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Start time unavailable";
  return `Started ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date)}`;
}

function icon(name) {
  const iconElement = document.createElement("i");
  iconElement.dataset.lucide = name;
  iconElement.setAttribute("aria-hidden", "true");
  return iconElement;
}

function metadata(iconName, text) {
  const item = document.createElement("span");
  item.append(icon(iconName), document.createTextNode(text));
  return item;
}

function selectBridge(index) {
  selectedIndex = index;
  confirmedIndex = -1;
  elements.warning.hidden = true;
  elements.connect.querySelector("span").textContent = "Connect";
  elements.connect.disabled = index < 0;
}

function createBridgeOption(bridge, position) {
  const label = document.createElement("label");
  label.className = "bridge-option";

  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "bridge";
  radio.value = String(position);
  radio.checked = position === 0;
  const frontend = bridge.rendererClients > 0
    ? `${bridge.rendererClients} frontend${bridge.rendererClients === 1 ? "" : "s"} connected`
    : "no frontend connected";
  radio.setAttribute("aria-label", `${bridge.bridgeId}, ${sessionLabel(bridge.sessions)}, ${frontend}, port ${bridge.port}`);
  radio.addEventListener("change", () => selectBridge(position));

  const radioMark = document.createElement("span");
  radioMark.className = "radio-mark";
  radioMark.setAttribute("aria-hidden", "true");

  const copy = document.createElement("span");
  copy.className = "bridge-copy";
  const heading = document.createElement("span");
  heading.className = "bridge-heading";
  const name = document.createElement("span");
  name.className = "bridge-name";
  name.textContent = bridge.bridgeId;
  const badge = document.createElement("span");
  badge.className = `bridge-badge${bridge.bridgeType === "installed" ? " is-installed" : ""}`;
  badge.textContent = bridge.bridgeType === "installed" ? "Installed" : "Electron";
  heading.append(name, badge);

  const meta = document.createElement("span");
  meta.className = "bridge-meta";
  meta.append(
    metadata("network", `Port ${bridge.port}`),
    metadata("clock-3", startedLabel(bridge.startedAt)),
    metadata(bridge.rendererClients > 0 ? "monitor-check" : "monitor-off", bridge.rendererClients > 0 ? frontend : "No frontend")
  );
  copy.append(heading, meta);

  const live = document.createElement("span");
  live.className = "bridge-live";
  const dot = document.createElement("span");
  dot.className = "live-dot";
  dot.setAttribute("aria-hidden", "true");
  live.append(dot, document.createTextNode(sessionLabel(bridge.sessions)));

  label.append(radio, radioMark, copy, live);
  label.addEventListener("dblclick", () => {
    selectBridge(position);
    requestConnect();
  });
  return label;
}

function render(candidateRows) {
  bridges = Array.isArray(candidateRows) ? candidateRows : [];
  selectedIndex = bridges.length > 0 ? 0 : -1;
  confirmedIndex = -1;
  elements.warning.hidden = true;
  elements.connect.querySelector("span").textContent = "Connect";
  elements.list.replaceChildren(...bridges.map(createBridgeOption));
  elements.list.hidden = bridges.length === 0;
  elements.empty.hidden = bridges.length > 0;
  elements.connect.disabled = bridges.length === 0;
  elements.summary.textContent = bridges.length === 0
    ? "No existing bridge is available for this window."
    : `${bridges.length} running bridge${bridges.length === 1 ? " is" : "s are"} available. Select one to share its active terminal sessions, or start an independent bridge.`;
  refreshIcons();
  requestAnimationFrame(() => {
    if (bridges.length > 0) elements.list.querySelector("input")?.focus();
    else elements.startNew.focus();
  });
}

function requestConnect() {
  const bridge = bridges[selectedIndex];
  if (!bridge) return;
  if (bridge.rendererClients > 0 && confirmedIndex !== selectedIndex) {
    confirmedIndex = selectedIndex;
    elements.warningTitle.textContent = `${bridge.bridgeId} already has ${bridge.rendererClients === 1 ? "a frontend" : `${bridge.rendererClients} frontends`} connected`;
    elements.warningText.textContent = `Connecting this window will make ${bridge.rendererClients + 1} frontends share its ${bridge.sessions} terminal session${bridge.sessions === 1 ? "" : "s"}.`;
    elements.warning.hidden = false;
    elements.connect.querySelector("span").textContent = "Connect anyway";
    elements.connect.focus();
    return;
  }
  complete("connect");
}

elements.connect.addEventListener("click", requestConnect);
elements.startNew.addEventListener("click", () => complete("new"));
elements.cancel.addEventListener("click", () => complete("cancel"));
elements.close.addEventListener("click", () => complete("cancel"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    complete("cancel");
  } else if (event.key === "Enter" && event.target.matches('input[name="bridge"]')) {
    event.preventDefault();
    requestConnect();
  }
});

refreshIcons();
window.bridgeChooser.onData(render);