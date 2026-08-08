/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

"use strict";

const fs = require("node:fs");
const vscode = require("vscode");
const { findLauncher, folderForResource, launchFolder } = require("./launcher");

function configuredLauncherPath() {
  return vscode.workspace.getConfiguration("multiterm").get("launcherPath", "").trim();
}

function configuredLaunchOptions() {
  const configuration = vscode.workspace.getConfiguration("multiterm");
  return {
    title: configuration.get("terminalTitle", ""),
    command: configuration.get("terminalCommand", ""),
    assistantType: configuration.get("assistantType", ""),
    assistantModel: configuration.get("assistantModel", ""),
    assistantEffort: configuration.get("assistantEffort", ""),
    assistantContext: configuration.get("assistantContext", "")
  };
}

function launchOptions(overrides = {}) {
  const configured = configuredLaunchOptions();
  const result = {};
  for (const key of ["title", "command", "assistantType", "assistantModel", "assistantEffort", "assistantContext"]) {
    result[key] = typeof overrides[key] === "string" ? overrides[key] : configured[key];
  }
  return result;
}

function terminalLaunchOverrides(value) {
  if (!value || typeof value !== "object" || value.scheme || value.fsPath) return {};
  return value;
}

async function chooseWorkspaceFolder() {
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) return null;
  if (folders.length === 1) return folders[0].uri.fsPath;
  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { placeHolder: "Choose the workspace folder to open in MultiTerm" }
  );
  return picked?.folder.uri.fsPath || null;
}

async function resolveResourceFolder(resource, forceWorkspace = false) {
  if (!forceWorkspace && resource?.scheme === "file") {
    try {
      const isDirectory = fs.statSync(resource.fsPath).isDirectory();
      return folderForResource(resource.fsPath, isDirectory);
    } catch (error) {
      throw new Error(`The selected Explorer path is unavailable: ${error.message}`);
    }
  }
  return chooseWorkspaceFolder();
}

async function openInMultiTerm(resource, forceWorkspace = false, overrides = {}) {
  overrides = terminalLaunchOverrides(overrides);
  let folder;
  const requestedPath = typeof overrides.path === "string" && overrides.path.trim()
    ? overrides.path.trim()
    : typeof overrides.folder === "string" ? overrides.folder.trim() : "";
  if (requestedPath) {
    try {
      folder = folderForResource(requestedPath, fs.statSync(requestedPath).isDirectory());
    } catch (error) {
      throw new Error(`The requested MultiTerm folder is unavailable: ${error.message}`);
    }
  } else {
    folder = await resolveResourceFolder(resource, forceWorkspace);
  }
  if (!folder) {
    vscode.window.showErrorMessage("MultiTerm needs an open local workspace or a selected local file or folder.");
    return;
  }

  const launcher = findLauncher(configuredLauncherPath());
  if (!launcher) {
    const choice = await vscode.window.showErrorMessage(
      "MultiTerm Workbench is not installed in a standard location. Set multiterm.launcherPath to Start-MultiTerm.ps1.",
      "Open Settings"
    );
    if (choice === "Open Settings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "multiterm.launcherPath");
    }
    return;
  }

  try {
    const child = launchFolder(launcher, folder, launchOptions(overrides));
    child.once("error", (error) => {
      vscode.window.showErrorMessage(`Could not start MultiTerm: ${error.message}`);
    });
    child.once("exit", (code) => {
      if (typeof code === "number" && code !== 0) {
        vscode.window.showErrorMessage(`MultiTerm could not open ${folder} (launcher exit code ${code}).`);
      }
    });
    vscode.window.setStatusBarMessage(`Opening ${folder} in MultiTerm…`, 3000);
  } catch (error) {
    vscode.window.showErrorMessage(`Could not open MultiTerm: ${error.message}`);
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("multiterm.openContainingFolder", (resource) => openInMultiTerm(resource)),
    vscode.commands.registerCommand("multiterm.openFolder", (resource) => openInMultiTerm(resource)),
    vscode.commands.registerCommand("multiterm.openWorkspace", (overrides = {}) => openInMultiTerm(null, true, overrides)),
    vscode.commands.registerCommand("multiterm.openTerminal", (overrides = {}) => openInMultiTerm(null, true, overrides))
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
