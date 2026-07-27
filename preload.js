const { contextBridge, ipcRenderer } = require("electron");

// Minimal, safe bridge for renderer features that need the main process.
// Exposed as window.multiterm in the isolated renderer world.
contextBridge.exposeInMainWorld("multiterm", {
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
