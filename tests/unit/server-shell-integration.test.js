/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const server = require("../../src/server");
const shellIntegration = require("../../src/shell-integration");

function makeTerminal() {
  return {
    pid: 4242,
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn()
  };
}

function spawnOptionsFor(options) {
  const spawn = vi.fn(() => makeTerminal());
  server.createSession({ send: vi.fn() }, options, { spawnPty: spawn });
  return { spawn, call: spawn.mock.calls[0] };
}

describe("shell integration prompt hook", () => {
  it("wraps the prompt already in place rather than replacing it", () => {
    expect(server.POWERSHELL_INTEGRATION_SCRIPT).toContain("$global:__MultiTermInnerPrompt = $function:prompt");
    expect(server.POWERSHELL_INTEGRATION_SCRIPT).toContain("& $global:__MultiTermInnerPrompt");
  });

  it("reports only a real filesystem location", () => {
    expect(server.POWERSHELL_INTEGRATION_SCRIPT).toContain("$location.Provider.Name -eq 'FileSystem'");
  });

  it("never lets a failing hook break the prompt", () => {
    expect(server.POWERSHELL_INTEGRATION_SCRIPT).toContain("try {");
    expect(server.POWERSHELL_INTEGRATION_SCRIPT).toContain("} catch {");
  });

  it("applies itself once so a re-sourced profile cannot nest the wrapper", () => {
    expect(server.POWERSHELL_INTEGRATION_SCRIPT).toContain("if (-not $global:__MultiTermShellIntegration) {");
  });

  it("keeps the script path out of the command line", () => {
    expect(server.powerShellIntegrationArguments()).toEqual([
      "-Command",
      "if ($env:MULTITERM_SHELL_INTEGRATION) { . $env:MULTITERM_SHELL_INTEGRATION }"
    ]);
  });
});

describe("cmd prompt reporting", () => {
  it("restates the documented default when the user has no prompt", () => {
    expect(server.cmdPromptWithIntegration("")).toBe("$e]9;9;$p$e\\$P$G");
    expect(server.cmdPromptWithIntegration(undefined)).toBe("$e]9;9;$p$e\\$P$G");
  });

  it("keeps a prompt the user already chose", () => {
    expect(server.cmdPromptWithIntegration("[$T] $P$G")).toBe("$e]9;9;$p$e\\[$T] $P$G");
  });

  it("does not stack a second reporter onto an inherited prompt", () => {
    const once = server.cmdPromptWithIntegration("$P$G");
    expect(server.cmdPromptWithIntegration(once)).toBe(once);
  });
});

describe("POSIX prompt reporting", () => {
  it("emits the sequence when no PROMPT_COMMAND exists", () => {
    expect(server.bashPromptCommandWithIntegration("")).toBe("printf '\\033]9;9;%s\\033\\\\' \"$PWD\"");
  });

  it("appends to a PROMPT_COMMAND the user already set", () => {
    expect(server.bashPromptCommandWithIntegration("history -a")).toBe(
      "history -a; printf '\\033]9;9;%s\\033\\\\' \"$PWD\""
    );
  });

  it("does not stack a second reporter onto an inherited PROMPT_COMMAND", () => {
    const once = server.bashPromptCommandWithIntegration("history -a");
    expect(server.bashPromptCommandWithIntegration(once)).toBe(once);
  });

  it("adds the variable to WSLENV without disturbing the user's list", () => {
    expect(server.wslEnvWithIntegration("")).toBe("PROMPT_COMMAND");
    expect(server.wslEnvWithIntegration("EDITOR")).toBe("EDITOR:PROMPT_COMMAND");
  });

  it("leaves an existing WSLENV entry and its translation flags alone", () => {
    expect(server.wslEnvWithIntegration("PROMPT_COMMAND/u:EDITOR")).toBe("PROMPT_COMMAND/u:EDITOR");
  });
});

describe("shell integration plan", () => {
  it("hooks the prompt for every PowerShell family shell", () => {
    const plan = server.shellIntegrationPlan({ integration: "powershell" }, {});
    expect(plan.args[0]).toBe("-Command");
    expect(plan.env.MULTITERM_SHELL_INTEGRATION).toContain("multiterm-shell-integration.ps1");
  });

  it("uses the environment rather than arguments for cmd", () => {
    const plan = server.shellIntegrationPlan({ integration: "cmd" }, { PROMPT: "" });
    expect(plan.args).toEqual([]);
    expect(plan.env.PROMPT).toContain("]9;9;");
  });

  it("forwards the reporter into WSL", () => {
    const plan = server.shellIntegrationPlan({ integration: "posix" }, { PROMPT_COMMAND: "", WSLENV: "" });
    expect(plan.env.PROMPT_COMMAND).toContain("]9;9;");
    expect(plan.env.WSLENV).toBe("PROMPT_COMMAND");
  });

  it("leaves a tmux attach target untouched", () => {
    expect(server.shellIntegrationPlan({ integration: undefined }, {})).toEqual({ args: [], env: {} });
    expect(server.shellIntegrationPlan(null, {})).toEqual({ args: [], env: {} });
  });
});

describe("generated integration script", () => {
  const savedLocalAppData = process.env.LOCALAPPDATA;
  let scratch = "";

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-shell-integration-"));
    process.env.LOCALAPPDATA = scratch;
    shellIntegration.resetShellIntegrationScriptPath();
  });

  afterEach(() => {
    shellIntegration.resetShellIntegrationScriptPath();
    if (savedLocalAppData === undefined) {
      delete process.env.LOCALAPPDATA;
    } else {
      process.env.LOCALAPPDATA = savedLocalAppData;
    }
    fs.rmSync(scratch, { force: true, recursive: true });
  });

  it("resolves the script under the MultiTerm data root", () => {
    expect(server.getShellIntegrationDirectory()).toBe(path.join(scratch, "MultiTerm", "ShellIntegration"));
  });

  it("reports no script when there is no data root to write into", () => {
    delete process.env.LOCALAPPDATA;
    expect(server.getShellIntegrationDirectory()).toBeNull();
  });

  it("writes the script once and reuses its path for later terminals", () => {
    const fileSystem = {
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn()
    };
    const expected = path.join(scratch, "MultiTerm", "ShellIntegration", "multiterm-shell-integration.ps1");

    expect(shellIntegration.ensureShellIntegrationScript({ fileSystem, localAppData: scratch })).toBe(expected);
    expect(shellIntegration.ensureShellIntegrationScript({
      fileSystem: { mkdirSync: vi.fn(() => { throw new Error("should not write twice"); }) },
      localAppData: scratch
    })).toBe(expected);
    expect(fileSystem.writeFileSync).toHaveBeenCalledOnce();
  });

  it("opens PowerShell untouched when the script cannot be generated", () => {
    const fileSystem = {
      mkdirSync: vi.fn(() => { throw new Error("read-only profile"); }),
      writeFileSync: vi.fn()
    };

    expect(shellIntegration.shellIntegrationPlan(
      { integration: "powershell" },
      {},
      { fileSystem, localAppData: scratch }
    )).toEqual({ args: [], env: {} });
    expect(fileSystem.writeFileSync).not.toHaveBeenCalled();
  });

  it("opens PowerShell untouched when Windows has no local app-data root", () => {
    expect(shellIntegration.shellIntegrationPlan(
      { integration: "powershell" },
      {},
      { localAppData: "" }
    )).toEqual({ args: [], env: {} });
  });
});

describe("session creation with shell integration", () => {
  afterEach(() => {
    server.sessions.clear();
  });

  it("adds the prompt hook to a PowerShell session", () => {
    const { call } = spawnOptionsFor({ id: "integrate1", shell: "powershell" });
    expect(call[1]).toContain("-NoLogo");
    expect(call[1]).toContain("-Command");
    expect(call[2].env.MULTITERM_SHELL_INTEGRATION).toContain("multiterm-shell-integration.ps1");
  });

  it("gives cmd its reporter through PROMPT and no extra arguments", () => {
    const { call } = spawnOptionsFor({ id: "integrate2", shell: "cmd" });
    expect(call[1]).toEqual([]);
    expect(call[2].env.PROMPT).toContain("]9;9;");
  });

  it("spawns the shell untouched when the renderer opts out", () => {
    const { call } = spawnOptionsFor({ id: "integrate3", shell: "powershell", shellIntegration: false });
    expect(call[1]).toEqual(["-NoLogo", "-NoExit"]);
    expect(call[2].env.MULTITERM_SHELL_INTEGRATION).toBeUndefined();
  });

  // An older renderer predates the opt-out and still expects tracking to work.
  it("integrates when the renderer says nothing about it", () => {
    const { call } = spawnOptionsFor({ id: "integrate4", shell: "cmd" });
    expect(call[2].env.PROMPT).toContain("]9;9;");
  });

  it("never touches a tmux attach target", () => {
    const { call } = spawnOptionsFor({ id: "integrate5", tmux: { distro: "Ubuntu", session: "dev" } });
    expect(call[1]).toEqual(["--distribution", "Ubuntu", "--exec", "tmux", "attach-session", "-t", "dev"]);
    expect(call[2].env.PROMPT_COMMAND).toBe(process.env.PROMPT_COMMAND);
  });
});
