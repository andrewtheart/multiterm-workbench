const { contextBridge, ipcRenderer } = require("electron");

// Minimal, safe bridge for renderer features that need the main process.
// Exposed as window.multiterm in the isolated renderer world.
contextBridge.exposeInMainWorld("multiterm", {
  // Opens a native file picker and resolves to the chosen script path, or
  // null if the user cancelled.
  pickScript: () => ipcRenderer.invoke("multiterm:pick-script")
});
