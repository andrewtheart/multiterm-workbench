/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

"use strict";

const Module = require("node:module");

let api;
let ipcRenderer;

beforeEach(() => {
  vi.resetModules();
  api = null;
  ipcRenderer = {
    invoke: vi.fn(),
    on: vi.fn(),
    send: vi.fn()
  };
  const originalLoad = Module._load;
  vi.spyOn(Module, "_load").mockImplementation((request, parent, isMain) => {
    if (request === "electron") {
      return {
        contextBridge: {
          exposeInMainWorld: vi.fn((_name, exposed) => { api = exposed; })
        },
        ipcRenderer
      };
    }
    return originalLoad(request, parent, isMain);
  });
  delete require.cache[require.resolve("../../preload.js")];
  require("../../preload.js");
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("exposes every isolated renderer API over the expected IPC channels", async () => {
  ipcRenderer.invoke.mockResolvedValue("result");

  await expect(api.writeClipboardText(42)).resolves.toBe("result");
  await expect(api.pickScript()).resolves.toBe("result");
  await expect(api.isElevated()).resolves.toBe("result");
  await expect(api.restartAsAdmin()).resolves.toBe("result");
  await expect(api.checkForUpdate()).resolves.toBe("result");
  await expect(api.downloadUpdate({ name: "setup.exe" }, 512)).resolves.toBe("result");
  await expect(api.openReleasePage("https://github.com/example/release")).resolves.toBe("result");

  expect(ipcRenderer.invoke.mock.calls).toEqual([
    ["multiterm:write-clipboard", "42"],
    ["multiterm:pick-script"],
    ["multiterm:is-elevated"],
    ["multiterm:relaunch-as-admin"],
    ["multiterm:check-update"],
    ["multiterm:download-update", { name: "setup.exe" }, 512],
    ["multiterm:open-release", "https://github.com/example/release"]
  ]);

  api.respondClose("tray");
  api.focusWindow();
  expect(ipcRenderer.send.mock.calls).toEqual([
    ["multiterm:close-response", "tray"],
    ["multiterm:focus-window"]
  ]);
});

test("registers close and progress callbacks and ignores invalid handlers", () => {
  const close = vi.fn();
  const progress = vi.fn();
  api.onCloseRequest(close);
  api.onUpdateProgress(progress);
  api.onCloseRequest(null);
  api.onUpdateProgress("invalid");

  expect(ipcRenderer.on).toHaveBeenCalledTimes(2);
  const closeListener = ipcRenderer.on.mock.calls.find(([channel]) => channel === "multiterm:close-request")[1];
  const progressListener = ipcRenderer.on.mock.calls.find(([channel]) => channel === "multiterm:update-progress")[1];
  closeListener({}, "ignored");
  progressListener({}, { received: 5, total: 10 });
  expect(close).toHaveBeenCalledWith();
  expect(progress).toHaveBeenCalledWith({ received: 5, total: 10 });
});
