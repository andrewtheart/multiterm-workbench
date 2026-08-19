/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridgeChooser", {
  onData(callback) {
    if (typeof callback !== "function") return;
    ipcRenderer.once("multiterm:bridge-chooser-data", (_event, bridges) => callback(bridges));
  },
  complete(result) {
    ipcRenderer.send("multiterm:bridge-chooser-result", result);
  }
});