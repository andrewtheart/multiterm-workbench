/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron, expect, test } = require("@playwright/test");
const { closeElectronTestApp } = require("../support/electron-app-cleanup");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function health(port) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/health`, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
    });
    request.once("error", reject);
  });
}

async function waitForHealth(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const value = await health(port);
      if (value.app === "MultiTerm Workbench" && Number(value.port) === port) return value;
    } catch {
      // The child is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Bridge ${port} did not become healthy.`);
}

function startBridge(repoRoot, localAppData, port) {
  const child = childProcess.spawn(process.execPath, [path.join(repoRoot, "src", "server.js")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LOCALAPPDATA: localAppData,
      MULTITERM_UPDATE_REPO: "invalid/disabled",
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  return child;
}

function occupyBridge(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "rendererPresence", visible: true }));
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return;
  child.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

test("switches between occupied real bridges in the Electron shell", async () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-electron-live-bridges-"));
  const userDataDir = path.join(localAppData, "electron-profile");
  const firstPort = await freePort();
  const secondPort = await freePort();
  const firstBridge = startBridge(repoRoot, localAppData, firstPort);
  let secondBridge;
  let firstOccupier;
  let secondOccupier;
  let electronApp;

  try {
    await waitForHealth(firstPort);
    secondBridge = startBridge(repoRoot, localAppData, secondPort);
    await waitForHealth(secondPort);
    firstOccupier = await occupyBridge(firstPort);
    secondOccupier = await occupyBridge(secondPort);
  await expect.poll(async () => (await health(firstPort)).rendererClients).toBe(1);
  await expect.poll(async () => (await health(secondPort)).rendererClients).toBe(1);

    electronApp = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, repoRoot],
      cwd: repoRoot,
      env: {
        ...process.env,
        LOCALAPPDATA: localAppData,
        MULTITERM_UPDATE_REPO: "invalid/disabled",
        PORT: String(firstPort)
      }
    });

    const chooser = await electronApp.firstWindow();
    await expect(chooser).toHaveTitle("Choose a MultiTerm bridge");
    const target = chooser.locator(".bridge-option").filter({ hasText: "BRIDGE-002" });
    await expect(target).toContainText("1 frontend connected");
    await target.click();
    await chooser.locator("#connectBridge").click();
    await expect(chooser.locator("#bridgeChoiceWarning")).toBeVisible();
    await expect(chooser.locator("#bridgeChoiceWarningText")).toContainText("2 frontends share");

    await chooser.locator("#connectBridge").click();
    const selectedUrl = `http://127.0.0.1:${secondPort}/`;
    await expect.poll(() => electronApp.windows().map((window) => window.url())).toContain(selectedUrl);
    const mainWindow = electronApp.windows().find((window) => window.url() === selectedUrl);
    await expect(mainWindow).toHaveTitle("MultiTerm Workbench (BRIDGE-002)");
    await expect(mainWindow.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(async () => (await health(secondPort)).rendererClients).toBe(2);

    await mainWindow.evaluate(() => openBridgeIdentityCard());
    await expect(mainWindow.locator("#bridgeIdentityFrontend")).toContainText("2 frontends connected");
    const alternative = mainWindow.locator("#bridgeIdentityList .bridge-identity-option").filter({ hasText: "BRIDGE-001" });
    await expect(alternative).toContainText("Frontend connected");

    const secondChooserPromise = electronApp.waitForEvent("window");
    await mainWindow.locator("#bridgeIdentityChoose").click();
    const secondChooser = await secondChooserPromise;
    const firstTarget = secondChooser.locator(".bridge-option").filter({ hasText: "BRIDGE-001" });
    await expect(firstTarget).toContainText("1 frontend connected");
    await firstTarget.click();
    await secondChooser.locator("#connectBridge").click();
    await expect(secondChooser.locator("#bridgeChoiceWarning")).toBeVisible();
    await expect(secondChooser.locator("#connectBridge span")).toHaveText("Connect anyway");
    await secondChooser.locator("#cancelChooser").click();
  } finally {
    await closeElectronTestApp(electronApp);
    firstOccupier?.close();
    secondOccupier?.close();
    await Promise.all([stopChild(firstBridge), stopChild(secondBridge)]);
    fs.rmSync(localAppData, { force: true, recursive: true });
  }
});
