/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const server = require("../../src/server.js");

function execFileReturning(lines) {
  return (file, args, options, callback) => {
    const done = typeof options === "function" ? options : callback;
    done(null, lines.join("\r\n"), "");
  };
}

describe("Copilot CLI path for slim deployments", () => {
  it("picks an executable Node can actually spawn on Windows", async () => {
    if (process.platform !== "win32") return;
    // .bat gives spawn EINVAL, .ps1 gives EFTYPE, and the extensionless shim is a
    // POSIX script, so only the .exe is usable as COPILOT_CLI_PATH.
    const found = await server.findSpawnableCopilotExecutable(execFileReturning([
      "C:\\cli\\copilot",
      "C:\\cli\\copilot.bat",
      "C:\\cli\\copilot.ps1",
      "C:\\links\\copilot.exe"
    ]));
    expect(found).toBe("C:\\links\\copilot.exe");
  });

  it("reports nothing usable when only unspawnable shims exist", async () => {
    if (process.platform !== "win32") return;
    const found = await server.findSpawnableCopilotExecutable(execFileReturning([
      "C:\\cli\\copilot.bat"
    ]));
    expect(found).toBe("");
  });

  it("leaves the SDK alone when its platform package is present", async () => {
    const env = {};
    const configured = await server.configureCopilotCliPath({
      env,
      hasBundled: () => true,
      findExecutable: async () => "C:\\links\\copilot.exe"
    });
    expect(configured).toBe("");
    expect(env.COPILOT_CLI_PATH).toBeUndefined();
  });

  it("points the SDK at an installed CLI when the platform package is absent", async () => {
    const env = {};
    const configured = await server.configureCopilotCliPath({
      env,
      hasBundled: () => false,
      findExecutable: async () => "C:\\links\\copilot.exe"
    });
    expect(configured).toBe("C:\\links\\copilot.exe");
    expect(env.COPILOT_CLI_PATH).toBe("C:\\links\\copilot.exe");
  });

  it("never overrides an explicit COPILOT_CLI_PATH", async () => {
    const env = { COPILOT_CLI_PATH: "C:\\chosen\\copilot.exe" };
    await server.configureCopilotCliPath({
      env,
      hasBundled: () => false,
      findExecutable: async () => "C:\\other\\copilot.exe"
    });
    expect(env.COPILOT_CLI_PATH).toBe("C:\\chosen\\copilot.exe");
  });

  it("leaves the variable unset when no CLI is installed", async () => {
    const env = {};
    const configured = await server.configureCopilotCliPath({
      env,
      hasBundled: () => false,
      findExecutable: async () => ""
    });
    expect(configured).toBe("");
    expect(env.COPILOT_CLI_PATH).toBeUndefined();
  });

  it("detects a missing platform package rather than assuming one", () => {
    expect(server.hasBundledCopilotCli(() => { throw new Error("not found"); })).toBe(false);
    expect(server.hasBundledCopilotCli(() => "C:/pkg/index.js")).toBe(true);
  });

  it("locates the CLI with the tool each platform actually provides", () => {
    expect(server.copilotLocatorCommand("win32")).toBe("where.exe");
    expect(server.copilotLocatorCommand("linux")).toBe("which");
    expect(server.copilotLocatorCommand("darwin")).toBe("which");
  });

  it("requires a real .exe on Windows but takes the first match elsewhere", () => {
    const entries = ["C:\\links\\copilot", "C:\\links\\copilot.bat", "C:\\links\\copilot.exe"];
    expect(server.spawnableCopilotEntry(entries, "win32")).toBe("C:\\links\\copilot.exe");
    // Only Windows cannot exec a shim, so other platforms must not skip one.
    expect(server.spawnableCopilotEntry(entries, "linux")).toBe("C:\\links\\copilot");
    expect(server.spawnableCopilotEntry(["/usr/bin/copilot"], "darwin")).toBe("/usr/bin/copilot");
    expect(server.spawnableCopilotEntry([], "win32")).toBe("");
    expect(server.spawnableCopilotEntry([], "linux")).toBe("");
    expect(server.spawnableCopilotEntry(["C:\\links\\copilot.ps1"], "win32")).toBe("");
  });

  it("re-checks the CLI on every capability probe", async () => {
    // The guided setup installs the CLI long after the bridge started, so a
    // one-time startup check would leave AI features dead until a restart.
    let configured = 0;
    await server.copilotProviderCapabilities(
      () => { throw new Error("no client"); },
      async () => "",
      { authenticated: null },
      async () => { configured += 1; return ""; }
    );
    expect(configured).toBe(1);
  });
});
