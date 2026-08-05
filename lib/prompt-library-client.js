/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const childProcess = require("node:child_process");

const MAX_HOST_LINE_BYTES = 1024 * 1024;
const HOST_REQUEST_TIMEOUT_MS = 15000;

function promptLibraryArchitecture(architecture = process.arch) {
  if (architecture === "ia32" || architecture === "x86") return "x86";
  if (architecture === "arm64") return "arm64";
  return "x64";
}

function promptLibraryHostPath(root = path.resolve(__dirname, ".."), architecture = process.arch) {
  const configured = process.env.MULTITERM_PROMPT_LIBRARY_HOST;
  const packagedArchitecture = promptLibraryArchitecture(architecture);
  const candidates = [
    configured ? path.resolve(configured) : "",
    path.join(root, "lib", "prompt-library-host", "MultiTerm.PromptLibraryHost.exe"),
    path.join(root, "lib", "prompt-library-host", "publish", packagedArchitecture, "MultiTerm.PromptLibraryHost.exe"),
    path.join(root, "lib", "prompt-library-host", "publish", "MultiTerm.PromptLibraryHost.exe")
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || "";
}

class PromptLibraryHostClient {
  constructor({
    hostPath = promptLibraryHostPath(),
    spawnProcess = childProcess.spawn,
    timeoutMs = HOST_REQUEST_TIMEOUT_MS
  } = {}) {
    this.hostPath = hostPath;
    this.spawnProcess = spawnProcess;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.lines = null;
    this.pending = new Map();
    this.stderr = "";
  }

  ensureStarted() {
    if (this.child && this.child.exitCode == null && !this.child.killed) return;
    if (!this.hostPath || !fs.existsSync(this.hostPath)) {
      throw new Error("The encrypted Prompt Library host is not installed.");
    }
    const child = this.spawnProcess(this.hostPath, [], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    this.child = child;
    this.stderr = "";
    this.lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.lines.on("line", (line) => this.onLine(line));
    child.stderr.on("data", (chunk) => {
      this.stderr = `${this.stderr}${String(chunk)}`.slice(-8192);
    });
    child.on("error", (error) => this.failAll(error));
    child.on("exit", (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.lines?.close();
      this.lines = null;
      if (this.pending.size) {
        const detail = this.stderr.trim();
        this.failAll(new Error(detail || `Prompt Library host exited with code ${code}.`));
      }
    });
  }

  request(message) {
    const requestId = typeof message?.requestId === "string" ? message.requestId : "";
    if (!requestId || this.pending.has(requestId)) {
      return Promise.reject(new Error("Prompt Library requests require a unique requestId."));
    }
    try {
      this.ensureStarted();
    } catch (error) {
      return Promise.reject(error);
    }
    const encoded = `${JSON.stringify(message)}\n`;
    if (Buffer.byteLength(encoded, "utf8") > MAX_HOST_LINE_BYTES) {
      return Promise.reject(new Error("Prompt Library request exceeds the bridge message limit."));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Prompt Library host request timed out."));
        this.stop();
      }, this.timeoutMs);
      timer.unref?.();
      this.pending.set(requestId, { resolve, reject, timer });
      this.child.stdin.write(encoded, "utf8", (error) => {
        if (!error) return;
        const pending = this.pending.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        pending.reject(error);
      });
    });
  }

  onLine(line) {
    if (Buffer.byteLength(line, "utf8") > MAX_HOST_LINE_BYTES) {
      this.failAll(new Error("Prompt Library host returned an oversized response."));
      this.stop();
      return;
    }
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      this.failAll(new Error("Prompt Library host returned invalid JSON."));
      this.stop();
      return;
    }
    const requestId = typeof response?.requestId === "string" ? response.requestId : "";
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    pending.resolve(response);
  }

  failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  stop() {
    const child = this.child;
    this.child = null;
    this.lines?.close();
    this.lines = null;
    this.failAll(new Error("Prompt Library host stopped."));
    if (child && child.exitCode == null && !child.killed) child.kill();
  }
}

let sharedClient;

function requestPromptLibraryHost(message) {
  if (!sharedClient) sharedClient = new PromptLibraryHostClient();
  return sharedClient.request(message);
}

function stopPromptLibraryHost() {
  sharedClient?.stop();
  sharedClient = null;
}

module.exports = {
  HOST_REQUEST_TIMEOUT_MS,
  MAX_HOST_LINE_BYTES,
  PromptLibraryHostClient,
  promptLibraryArchitecture,
  promptLibraryHostPath,
  requestPromptLibraryHost,
  stopPromptLibraryHost
};