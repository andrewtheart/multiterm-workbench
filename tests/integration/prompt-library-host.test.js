/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PromptLibraryHostClient } = require("../../lib/prompt-library-client");

const root = path.resolve(__dirname, "..", "..");
const hostPath = path.join(root, "lib", "prompt-library-host", "publish", "x64", "MultiTerm.PromptLibraryHost.exe");
const nativePath = path.join(root, "lib", "prompt-library-host", "publish", "x64", "sqlite3mc.dll");
const canRun = process.platform === "win32" && fs.existsSync(hostPath) && fs.existsSync(nativePath);
const hostDescribe = canRun ? describe : describe.skip;

function waitForExit(child) {
  if (!child || child.exitCode != null) return Promise.resolve();
  return new Promise((resolve) => child.once("exit", resolve));
}

hostDescribe("Prompt Library Node host client", () => {
  it("keeps one encrypted host alive across correlated requests", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-prompt-host-test-"));
    const databasePath = path.join(directory, "library.db");
    const marker = `MT_NODE_HOST_${Date.now()}_${process.pid}`;
    const previousTestMode = process.env.MULTITERM_PROMPT_LIBRARY_TEST_MODE;
    const previousDatabase = process.env.MULTITERM_PROMPT_LIBRARY_DB;
    const client = new PromptLibraryHostClient({ hostPath });
    try {
      process.env.MULTITERM_PROMPT_LIBRARY_TEST_MODE = "1";
      process.env.MULTITERM_PROMPT_LIBRARY_DB = databasePath;
      const saved = await client.request({
        operation: "upsert",
        requestId: "node-save-1",
        id: "",
        name: marker,
        body: `Body:${marker}`,
        expectedRevision: 0
      });
      const hostPid = client.child.pid;
      const loaded = await client.request({
        operation: "get",
        requestId: "node-get-1",
        id: saved.prompt.id
      });

      expect(saved).toMatchObject({ ok: true, libraryRevision: 1, prompt: { revision: 1 } });
      expect(loaded).toMatchObject({
        ok: true,
        libraryRevision: 1,
        prompt: { id: saved.prompt.id, name: marker, body: `Body:${marker}`, revision: 1 }
      });
      expect(client.child.pid).toBe(hostPid);

      const child = client.child;
      client.stop();
      await waitForExit(child);
      const markerUtf8 = Buffer.from(marker, "utf8");
      const markerUtf16 = Buffer.from(marker, "utf16le");
      for (const name of fs.readdirSync(directory)) {
        const bytes = fs.readFileSync(path.join(directory, name));
        expect(bytes.includes(markerUtf8), name).toBe(false);
        expect(bytes.includes(markerUtf16), name).toBe(false);
      }
    } finally {
      const child = client.child;
      client.stop();
      await waitForExit(child);
      if (previousTestMode === undefined) delete process.env.MULTITERM_PROMPT_LIBRARY_TEST_MODE;
      else process.env.MULTITERM_PROMPT_LIBRARY_TEST_MODE = previousTestMode;
      if (previousDatabase === undefined) delete process.env.MULTITERM_PROMPT_LIBRARY_DB;
      else process.env.MULTITERM_PROMPT_LIBRARY_DB = previousDatabase;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});