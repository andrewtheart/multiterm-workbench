/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

function launcherCandidates(configuredPath, env = process.env) {
  const candidates = [
    configuredPath,
    env.MULTITERM_LAUNCHER,
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "MultiTerm Workbench", "Start-MultiTerm.ps1"),
    env.ProgramFiles && path.join(env.ProgramFiles, "MultiTerm Workbench", "Start-MultiTerm.ps1"),
    env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"], "MultiTerm Workbench", "Start-MultiTerm.ps1")
  ].filter(Boolean);

  try {
    const command = childProcess.execFileSync("where.exe", ["multiterm.cmd"], {
      encoding: "utf8",
      windowsHide: true
    }).split(/\r?\n/).map((value) => value.trim()).find(Boolean);
    if (command) candidates.push(path.join(path.dirname(command), "Start-MultiTerm.ps1"));
  } catch {
    // PATH integration is optional, so standard install locations remain valid.
  }

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

function findLauncher(configuredPath, env = process.env) {
  return launcherCandidates(configuredPath, env).find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) || null;
}

function folderForResource(resourcePath, isDirectory) {
  if (!resourcePath) return null;
  return path.resolve(isDirectory ? resourcePath : path.dirname(resourcePath));
}

function launchFolder(launcherPath, folderPath, options = {}) {
  const argumentsList = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-WindowStyle",
    "Hidden",
    "-File",
    launcherPath,
    "-OpenFolder",
    folderPath
  ];
  for (const [parameter, value] of [
    ["-TerminalTitle", options.title],
    ["-TerminalCommand", options.command],
    ["-AssistantType", options.assistantType],
    ["-AssistantModel", options.assistantModel],
    ["-AssistantEffort", options.assistantEffort],
    ["-AssistantContext", options.assistantContext]
  ]) {
    if (typeof value === "string" && value.trim()) argumentsList.push(parameter, value.trim());
  }
  const child = childProcess.spawn(
    "powershell.exe",
    argumentsList,
    {
      stdio: "ignore",
      windowsHide: true
    }
  );
  child.unref();
  return child;
}

module.exports = {
  findLauncher,
  folderForResource,
  launchFolder,
  launcherCandidates
};
