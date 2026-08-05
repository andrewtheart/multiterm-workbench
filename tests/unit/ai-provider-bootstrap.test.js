/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const server = require("../../server");
const root = path.resolve(__dirname, "../..");
const installer = fs.readFileSync(path.join(root, "installer", "MultiTerm.iss"), "utf8");
const installedBridge = fs.readFileSync(path.join(root, "Start-MultiTerm.ps1"), "utf8");

describe("AI provider installer bootstrap", () => {
  let directory;
  let filePath;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "multiterm-ai-bootstrap-"));
    filePath = path.join(directory, "bootstrap.json");
  });

  afterEach(() => {
    delete process.env.MULTITERM_AI_PROVIDER_BOOTSTRAP_PATH;
    fs.rmSync(directory, { force: true, recursive: true });
  });

  it("returns only the supported provider and boolean detection hints", () => {
    fs.writeFileSync(filePath, JSON.stringify({
      version: 1,
      provider: "claude",
      detected: { claudeCli: true, copilotCli: "yes", extra: true },
      ignored: "value"
    }));

    expect(server.readAiProviderBootstrap(filePath)).toEqual({
      version: 1,
      provider: "claude",
      detected: { claudeCli: true, copilotCli: false }
    });
  });

  it("rejects malformed, unsupported, and oversized bootstrap files", () => {
    fs.writeFileSync(filePath, "{");
    expect(server.readAiProviderBootstrap(filePath)).toBeNull();

    fs.writeFileSync(filePath, JSON.stringify({ version: 1, provider: "other" }));
    expect(server.readAiProviderBootstrap(filePath)).toBeNull();

    fs.writeFileSync(filePath, "x".repeat(4097));
    expect(server.readAiProviderBootstrap(filePath)).toBeNull();
  });

  it("resolves the configured path and consumes the bootstrap explicitly", () => {
    process.env.MULTITERM_AI_PROVIDER_BOOTSTRAP_PATH = filePath;
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, provider: "none" }));

    expect(server.getAiProviderBootstrapPath()).toBe(path.resolve(filePath));
    expect(server.consumeAiProviderBootstrap()).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(server.consumeAiProviderBootstrap()).toBe(true);
  });

  it("consumes the configured bootstrap only after renderer acknowledgement", () => {
    process.env.MULTITERM_AI_PROVIDER_BOOTSTRAP_PATH = filePath;
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, provider: "copilot" }));

    server.handleClientMessage({ send: vi.fn() }, JSON.stringify({ type: "aiProviderBootstrapConsumed" }));

    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("offers detected providers and Disabled without inventing a silent-install preference", () => {
    expect(installer).toContain("CommandIsAvailable('copilot')");
    expect(installer).toContain("CommandIsAvailable('claude')");
    expect(installer).toContain("CreateInputOptionPage(");
    expect(installer).toContain("GitHub Copilot CLI (detected)");
    expect(installer).toContain("Claude Code CLI (detected)");
    expect(installer).toContain("AiProviderPage.Add('Disabled')");
    expect(installer).toContain("After launch, MultiTerm verifies sign-in");
    expect(installer).toContain("if CurStep = ssPostInstall then");
    expect(installer).toMatch(/if not WizardSilent then\s+WriteAiProviderBootstrap;/);
    expect(installer).toContain("ai-provider-bootstrap.json");
  });

  it("keeps the installed and Node bridge bootstrap protocol aligned", () => {
    expect(installedBridge).toContain('type == "aiProviderBootstrapConsumed"');
    expect(installedBridge).toContain("aiProviderBootstrap");
    expect(installedBridge).toContain("copilotCli");
    expect(installedBridge).toContain("claudeCli");
    expect(installedBridge).toContain("interactiveAvailable");
  });
});