/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron, expect, test } = require("@playwright/test");
const { closeElectronTestApp } = require("../support/electron-app-cleanup");

function startBridgeOnFreePort(sessions, rendererClients = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (request.url !== "/health") {
        response.writeHead(404).end();
        return;
      }
      const port = server.address().port;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        app: "MultiTerm Workbench",
        pid: process.pid,
        port,
        rendererClients,
        sessions
      }));
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("shows many running bridges in the modern startup chooser", async () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-bridge-chooser-"));
  const userDataDir = path.join(localAppData, "electron-profile");
  const instanceDirectory = path.join(localAppData, "MultiTerm", "Instances");
  const servers = [];
  let electronApp;

  try {
    fs.mkdirSync(instanceDirectory, { recursive: true });
    for (let index = 0; index < 8; index += 1) {
      const server = await startBridgeOnFreePort(index === 0 ? 0 : index + 1, index === 2 ? 1 : 0);
      servers.push(server);
      const port = server.address().port;
      fs.writeFileSync(path.join(instanceDirectory, `${index + 1}.json`), JSON.stringify({
        app: "MultiTerm Workbench",
        bridgeId: `BRIDGE-${String(index + 1).padStart(3, "0")}`,
        bridgeType: index % 2 === 0 ? "installed" : "electron",
        pid: process.pid,
        port,
        startedAt: new Date(Date.UTC(2026, 7, 16, 8 + index)).toISOString(),
        url: `http://127.0.0.1:${port}/`
      }));
    }

    electronApp = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, repoRoot],
      cwd: repoRoot,
      env: {
        ...process.env,
        LOCALAPPDATA: localAppData,
        PORT: String(servers[0].address().port),
        MULTITERM_UPDATE_REPO: "invalid/disabled"
      }
    });

    const page = await electronApp.firstWindow();
    await expect(page).toHaveTitle("Choose a MultiTerm bridge");
    await expect(page.locator(".bridge-option")).toHaveCount(8);
    await expect(page.locator('.bridge-option input[type="radio"]:checked')).toHaveCount(1);
    await expect(page.locator("#connectBridge")).toBeEnabled();
    await expect(page.locator("#chooserSummary")).toContainText("8 running bridges are available");

    const layout = await page.evaluate(() => {
      const list = document.getElementById("bridgeList");
      const shell = document.querySelector(".chooser-shell");
      return {
        listClientHeight: list.clientHeight,
        listScrollHeight: list.scrollHeight,
        horizontalOverflow: shell.scrollWidth - shell.clientWidth,
        overflowingRows: [...document.querySelectorAll(".bridge-option")]
          .filter((row) => row.scrollWidth > row.clientWidth).length
      };
    });
    expect(layout.listScrollHeight).toBeGreaterThan(layout.listClientHeight);
    expect(layout.horizontalOverflow).toBe(0);
    expect(layout.overflowingRows).toBe(0);

    const target = page.locator(".bridge-option").filter({ hasText: "BRIDGE-003" });
    await target.click();
    await expect(target.locator("input")).toBeChecked();
    await expect(target).toContainText("1 frontend connected");
    await expect(target.locator('[data-lucide="monitor-check"]')).toHaveCount(1);
    await page.locator("#connectBridge").click();
    await expect(page.locator("#bridgeChoiceWarning")).toBeVisible();
    await expect(page.locator("#bridgeChoiceWarningTitle")).toHaveText(/BRIDGE-003 already has a frontend connected/);
    await expect(page.locator("#bridgeChoiceWarningText")).toContainText("2 frontends share its 3 terminal sessions");
    await expect(page.locator("#connectBridge span")).toHaveText("Connect anyway");
    await expect(page.locator("#rememberChoice")).not.toBeChecked();
    await page.locator("#rememberChoice").check();
    await expect(page.locator("#rememberChoice")).toBeChecked();

    fs.mkdirSync(path.join(repoRoot, "test-results"), { recursive: true });
    await page.screenshot({ path: path.join(repoRoot, "test-results", "bridge-chooser-multiple.png") });
  } finally {
    await closeElectronTestApp(electronApp);
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    fs.rmSync(localAppData, { force: true, recursive: true });
  }
});