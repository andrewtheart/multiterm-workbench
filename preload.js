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

const { contextBridge, ipcRenderer } = require("electron");

// Minimal, safe bridge for renderer features that need the main process.
// Exposed as window.multiterm in the isolated renderer world.
contextBridge.exposeInMainWorld("multiterm", {
  // Uses Electron's native clipboard instead of relying on renderer permission
  // state for terminal selections and other copy actions.
  writeClipboardText: (text) => ipcRenderer.invoke("multiterm:write-clipboard", String(text)),

  // Opens a native file picker and resolves to the chosen script path, or
  // null if the user cancelled.
  pickScript: () => ipcRenderer.invoke("multiterm:pick-script"),

  // The main process asks before closing the window (tray-docking flow). The
  // renderer decides via a modal and replies with respondClose.
  onCloseRequest: (handler) => {
    if (typeof handler !== "function") return;
    ipcRenderer.on("multiterm:close-request", () => handler());
  },
  // Reports the user's close decision: "tray", "quit", or "cancel".
  respondClose: (action) => ipcRenderer.send("multiterm:close-response", action),
  // Restores and focuses the Electron window when a desktop notification is clicked.
  focusWindow: () => ipcRenderer.send("multiterm:focus-window"),

  // Whether this MultiTerm process is running elevated (administrator).
  isElevated: () => ipcRenderer.invoke("multiterm:is-elevated"),
  // Relaunch the whole app elevated (all panes become administrator terminals).
  restartAsAdmin: () => ipcRenderer.invoke("multiterm:relaunch-as-admin"),

  // Update checker: query the latest GitHub release, then optionally download
  // and launch its installer (which quits the app once it starts).
  checkForUpdate: () => ipcRenderer.invoke("multiterm:check-update"),
  downloadUpdate: (asset) => ipcRenderer.invoke("multiterm:download-update", asset),
  openReleasePage: (url) => ipcRenderer.invoke("multiterm:open-release", url),
  onUpdateProgress: (handler) => {
    if (typeof handler !== "function") return;
    ipcRenderer.on("multiterm:update-progress", (_event, payload) => handler(payload));
  }
});
