const { contextBridge, ipcRenderer } = require("electron");

// Minimal, safe bridge for renderer features that need the main process.
// Exposed as window.multiterm in the isolated renderer world.
contextBridge.exposeInMainWorld("multiterm", {
  // Opens a native file picker and resolves to the chosen script path, or
  // null if the user cancelled.
  pickScript: () => ipcRenderer.invoke("multiterm:pick-script"),
  // Whether this MultiTerm process is running elevated (administrator).
  isElevated: () => ipcRenderer.invoke("multiterm:is-elevated"),
  // Token the renderer presents to the bridge to authorize elevated operations.
  getUiToken: () => ipcRenderer.invoke("multiterm:get-ui-token"),
  // Approach A: relaunch the whole app elevated (all panes become admin).
  restartAsAdmin: () => ipcRenderer.invoke("multiterm:relaunch-as-admin"),
  // Approach B: spawn the elevated helper (UAC) that hosts per-pane admin ptys.
  spawnAdminBridge: () => ipcRenderer.invoke("multiterm:spawn-admin-bridge")
});
