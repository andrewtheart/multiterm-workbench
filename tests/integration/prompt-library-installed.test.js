/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const bridgeScript = path.join(root, "Start-MultiTerm.ps1");
const hostPath = path.join(root, "lib", "prompt-library-host", "publish", "x64", "MultiTerm.PromptLibraryHost.exe");
const nativePath = path.join(root, "lib", "prompt-library-host", "publish", "x64", "sqlite3mc.dll");
const canRun = process.platform === "win32" && fs.existsSync(hostPath) && fs.existsSync(nativePath);
const installedDescribe = canRun ? describe : describe.skip;

function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHealth(port, bridge, output) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (bridge.exitCode != null) {
      throw new Error(`Installed bridge exited with code ${bridge.exitCode}.\n${output()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // The embedded C# bridge is still compiling or binding its listener.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for the installed bridge.\n${output()}`);
}

function socketInbox(socket) {
  const messages = [];
  const waiters = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    messages.push(message);
    for (let index = waiters.length - 1; index >= 0; index--) {
      const waiter = waiters[index];
      if (!waiter.predicate(message)) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  return {
    messages,
    wait(predicate, timeoutMs = 10000) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`Timed out waiting for WebSocket message. Seen: ${JSON.stringify(messages)}`));
        }, timeoutMs);
        waiters.push(waiter);
      });
    }
  };
}

async function connect(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox = socketInbox(socket);
  const failed = new Promise((resolve, reject) => {
    socket.addEventListener("error", () => reject(new Error("Installed bridge WebSocket failed.")), { once: true });
  });
  await Promise.race([inbox.wait((message) => message.type === "welcome"), failed]);
  return { socket, inbox };
}

function request(socket, inbox, payload) {
  const response = inbox.wait((message) =>
    message.type === "promptLibraryResponse" && message.requestId === payload.requestId);
  socket.send(JSON.stringify(payload));
  return response;
}

function waitForExit(child, timeoutMs = 10000) {
  if (!child || child.exitCode != null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Installed bridge did not exit after shutdown.")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function storageFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? storageFiles(item) : [item];
  });
}

installedDescribe("installed Prompt Library bridge", () => {
  it("persists encrypted CRUD with revision broadcasts and no plaintext storage", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-prompt-library-test-"));
    const databasePath = path.join(directory, "library.db");
    const port = await unusedPort();
    let bridge;
    let socket;
    let stdout = "";
    let stderr = "";
    const output = () => `${stdout}\n${stderr}`.trim();
    const marker = `MT_PROMPT_LIBRARY_${Date.now()}_${process.pid}`;
    const name = `${marker}'); DROP TABLE prompts; --`;
    const originalBody = `# ${marker}\n\nOriginal body`;
    const updatedBody = `# ${marker}\n\nUpdated body`;

    try {
      bridge = childProcess.spawn("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", bridgeScript,
        "-Port", String(port),
        "-NoBrowser"
      ], {
        cwd: root,
        windowsHide: true,
        env: {
          ...process.env,
          MULTITERM_PROMPT_LIBRARY_TEST_MODE: "1",
          MULTITERM_PROMPT_LIBRARY_DB: databasePath
        }
      });
      bridge.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-16384); });
      bridge.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16384); });
      await waitForHealth(port, bridge, output);

      const connection = await connect(port);
      socket = connection.socket;
      const { inbox } = connection;
      const changeCreated = inbox.wait((message) =>
        message.type === "promptLibraryChanged" && message.libraryRevision === 1);
      const created = await request(socket, inbox, {
        type: "promptLibrarySave",
        requestId: "create-1",
        id: "",
        name,
        body: originalBody,
        expectedRevision: 0
      });
      expect(created).toMatchObject({ ok: true, libraryRevision: 1, prompt: { name, body: originalBody, revision: 1 } });
      await expect(changeCreated).resolves.toMatchObject({ libraryRevision: 1 });

      const listed = await request(socket, inbox, { type: "promptLibraryList", requestId: "list-1" });
      expect(listed).toMatchObject({ ok: true, libraryRevision: 1 });
      expect(listed.prompts).toEqual([
        expect.objectContaining({ id: created.prompt.id, name, revision: 1 })
      ]);
      expect(listed.prompts[0]).not.toHaveProperty("body");

      const loaded = await request(socket, inbox, {
        type: "promptLibraryGet",
        requestId: "get-1",
        id: created.prompt.id
      });
      expect(loaded.prompt).toMatchObject({ id: created.prompt.id, name, body: originalBody, revision: 1 });

      const changeUpdated = inbox.wait((message) =>
        message.type === "promptLibraryChanged" && message.libraryRevision === 2);
      const updated = await request(socket, inbox, {
        type: "promptLibrarySave",
        requestId: "update-1",
        id: created.prompt.id,
        name,
        body: updatedBody,
        expectedRevision: 1
      });
      expect(updated).toMatchObject({ ok: true, libraryRevision: 2, prompt: { body: updatedBody, revision: 2 } });
      await expect(changeUpdated).resolves.toMatchObject({ libraryRevision: 2 });

      const conflict = await request(socket, inbox, {
        type: "promptLibrarySave",
        requestId: "conflict-1",
        id: created.prompt.id,
        name,
        body: originalBody,
        expectedRevision: 1
      });
      expect(conflict).toMatchObject({ ok: false, errorCode: "conflict" });

      const changeDeleted = inbox.wait((message) =>
        message.type === "promptLibraryChanged" && message.libraryRevision === 3);
      const deleted = await request(socket, inbox, {
        type: "promptLibraryDelete",
        requestId: "delete-1",
        id: created.prompt.id,
        expectedRevision: 2
      });
      expect(deleted).toMatchObject({ ok: true, libraryRevision: 3 });
      await expect(changeDeleted).resolves.toMatchObject({ libraryRevision: 3 });
      const finalList = await request(socket, inbox, { type: "promptLibraryList", requestId: "list-2" });
      expect(finalList).toMatchObject({ ok: true, libraryRevision: 3, prompts: [] });

      socket.close();
      socket = null;
      const shutdown = await fetch(`http://127.0.0.1:${port}/shutdown`, {
        method: "POST",
        headers: { "X-MultiTerm-Request": "Launcher" }
      });
      expect(shutdown.ok).toBe(true);
      await waitForExit(bridge);

      const files = storageFiles(directory);
      expect(files.map((file) => path.basename(file))).toEqual(expect.arrayContaining(["library.db", "library.db.key"]));
      const markerUtf8 = Buffer.from(marker, "utf8");
      const markerUtf16 = Buffer.from(marker, "utf16le");
      for (const file of files) {
        const bytes = fs.readFileSync(file);
        expect(bytes.includes(markerUtf8), file).toBe(false);
        expect(bytes.includes(markerUtf16), file).toBe(false);
      }
      expect(fs.readFileSync(databasePath).subarray(0, 16).toString("ascii")).not.toBe("SQLite format 3\0");
      expect(fs.readFileSync(`${databasePath}.key`).subarray(0, 8).toString("ascii")).toBe("MTPKEY01");
      const aclScript = [
        "$acl = (New-Object System.IO.DirectoryInfo($env:MULTITERM_ACL_PATH)).GetAccessControl()",
        "$rules = @($acl.Access | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value })",
        "[pscustomobject]@{ Protected = $acl.AreAccessRulesProtected; Rules = $rules } | ConvertTo-Json -Compress"
      ].join("; ");
      const acl = JSON.parse(childProcess.execFileSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-Command", aclScript
      ], {
        encoding: "utf8",
        env: { ...process.env, MULTITERM_ACL_PATH: directory }
      }));
      const currentUserSid = childProcess.execFileSync("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-Command",
        "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value"
      ], { encoding: "utf8" }).trim();
      expect(acl).toEqual({ Protected: true, Rules: expect.arrayContaining([currentUserSid, "S-1-5-18"]) });
      expect(acl.Rules.every((sid) => sid === currentUserSid || sid === "S-1-5-18")).toBe(true);
    } finally {
      socket?.close();
      if (bridge && bridge.exitCode == null) {
        try {
          await fetch(`http://127.0.0.1:${port}/shutdown`, {
            method: "POST",
            headers: { "X-MultiTerm-Request": "Launcher" }
          });
          await waitForExit(bridge, 3000);
        } catch {
          bridge.kill();
          await waitForExit(bridge, 3000).catch(() => {});
        }
      }
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 45000);
});