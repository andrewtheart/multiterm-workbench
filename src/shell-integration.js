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

const fs = require("node:fs");
const path = require("node:path");

const SHELL_INTEGRATION_MARKER = "]9;9;";
const SHELL_INTEGRATION_ENV_VAR = "MULTITERM_SHELL_INTEGRATION";
const POWERSHELL_INTEGRATION_SCRIPT = [
  "if (-not $global:__MultiTermShellIntegration) {",
  "  $global:__MultiTermShellIntegration = $true",
  "  $global:__MultiTermInnerPrompt = $function:prompt",
  "  function global:prompt {",
  "    try {",
  "      $location = $ExecutionContext.SessionState.Path.CurrentLocation",
  "      if ($location.Provider.Name -eq 'FileSystem') {",
  "        [Console]::Write([char]27 + ']9;9;' + $location.ProviderPath + [char]27 + '\\')",
  "      }",
  "    } catch {",
  "    }",
  "    if ($global:__MultiTermInnerPrompt) {",
  "      & $global:__MultiTermInnerPrompt",
  "    } else {",
  "      'PS ' + $PWD.Path + '> '",
  "    }",
  "  }",
  "}",
  ""
].join("\r\n");
const EMPTY_SHELL_INTEGRATION = Object.freeze({ args: [], env: {} });
let shellIntegrationScriptPath = "";

function getShellIntegrationDirectory(localAppData = process.env.LOCALAPPDATA) {
  return localAppData ? path.join(localAppData, "MultiTerm", "ShellIntegration") : null;
}

function resetShellIntegrationScriptPath() {
  shellIntegrationScriptPath = "";
}

function ensureShellIntegrationScript({
  fileSystem = fs,
  localAppData = process.env.LOCALAPPDATA
} = {}) {
  if (shellIntegrationScriptPath) return shellIntegrationScriptPath;
  const directory = getShellIntegrationDirectory(localAppData);
  if (!directory) return "";
  try {
    fileSystem.mkdirSync(directory, { recursive: true });
    const target = path.join(directory, "multiterm-shell-integration.ps1");
    fileSystem.writeFileSync(target, POWERSHELL_INTEGRATION_SCRIPT, "utf8");
    shellIntegrationScriptPath = target;
  } catch {
    shellIntegrationScriptPath = "";
  }
  return shellIntegrationScriptPath;
}

function powerShellIntegrationArguments() {
  return ["-Command", `if ($env:${SHELL_INTEGRATION_ENV_VAR}) { . $env:${SHELL_INTEGRATION_ENV_VAR} }`];
}

function cmdPromptWithIntegration(existing) {
  const current = String(existing || "").trim() || "$P$G";
  return current.includes(SHELL_INTEGRATION_MARKER)
    ? current
    : `$e${SHELL_INTEGRATION_MARKER}$p$e\\${current}`;
}

function bashPromptCommandWithIntegration(existing) {
  const emit = `printf '\\033${SHELL_INTEGRATION_MARKER}%s\\033\\\\' "$PWD"`;
  const current = String(existing || "").trim();
  if (current.includes(SHELL_INTEGRATION_MARKER)) return current;
  return current ? `${current}; ${emit}` : emit;
}

function wslEnvWithIntegration(existing, names = ["PROMPT_COMMAND"]) {
  const entries = String(existing || "")
    .split(":")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const name of names) {
    if (!entries.some((entry) => entry.split("/")[0] === name)) entries.push(name);
  }
  return entries.join(":");
}

function shellIntegrationPlan(shell, baseEnv = {}, dependencies) {
  const kind = shell?.integration || "";
  if (kind === "powershell") {
    const script = ensureShellIntegrationScript(dependencies);
    return script
      ? { args: powerShellIntegrationArguments(), env: { [SHELL_INTEGRATION_ENV_VAR]: script } }
      : EMPTY_SHELL_INTEGRATION;
  }
  if (kind === "cmd") {
    return { args: [], env: { PROMPT: cmdPromptWithIntegration(baseEnv.PROMPT) } };
  }
  if (kind === "posix") {
    return {
      args: [],
      env: {
        PROMPT_COMMAND: bashPromptCommandWithIntegration(baseEnv.PROMPT_COMMAND),
        WSLENV: wslEnvWithIntegration(baseEnv.WSLENV)
      }
    };
  }
  return EMPTY_SHELL_INTEGRATION;
}

module.exports = {
  EMPTY_SHELL_INTEGRATION,
  POWERSHELL_INTEGRATION_SCRIPT,
  bashPromptCommandWithIntegration,
  cmdPromptWithIntegration,
  ensureShellIntegrationScript,
  getShellIntegrationDirectory,
  powerShellIntegrationArguments,
  resetShellIntegrationScriptPath,
  shellIntegrationPlan,
  wslEnvWithIntegration
};
