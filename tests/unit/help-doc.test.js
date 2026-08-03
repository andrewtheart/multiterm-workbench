/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("in-app help", () => {
  it("keeps HELP.md as the canonical source and generates a themed document", () => {
    const helpSource = read("HELP.md");
    const generatedHelp = read(path.join("public", "help.html"));
    const buildScript = read(path.join("scripts", "build-help.ps1"));
    const installerBuildScript = read(path.join("scripts", "build-installer.ps1"));
    const packageJson = JSON.parse(read("package.json"));

    expect(helpSource).toContain("# MultiTerm Workbench Help");
    expect(helpSource).toContain("## Notes and command queues");
    expect(helpSource).toContain("## Windows integration");
    expect(generatedHelp).toContain("<title>MultiTerm Workbench Help</title>");
    expect(generatedHelp).toContain('id="notes-and-command-queues"');
    expect(generatedHelp).toContain("data-theme");
    expect(generatedHelp).toContain('<script src="help-theme.js"></script>');
    expect(generatedHelp).not.toMatch(/<script>(?:.|\r|\n)*?<\/script>/);
    expect(read(path.join("public", "help-theme.js"))).toContain("URLSearchParams");
    expect(buildScript).toContain('"HELP.md"');
    expect(buildScript).toContain('"public\\help.html"');
    expect(packageJson.scripts["build:help"]).toContain("build-help.ps1");
    expect(packageJson.scripts.prestart).toBe("npm run build:help");
    expect(installerBuildScript.indexOf("Generate in-app help from HELP.md"))
      .toBeLessThan(installerBuildScript.indexOf("Conservatively commit pending changes"));
  });

  it("ships terminal messaging examples and rewrites their generated image paths", () => {
    const helpSource = read("HELP.md");
    const generatedHelp = read(path.join("public", "help.html"));
    const buildScript = read(path.join("scripts", "build-help.ps1"));
    const imageFilter = read(path.join("scripts", "help-image-paths.lua"));
    const screenshots = [
      "terminal-message-command.png",
      "terminal-message-text.png",
      "terminal-message-path.png",
      "terminal-message-status.png",
      "terminal-message-task.png",
      "terminal-message-result.png",
      "terminal-message-inbox.png",
      "terminal-connection-pending.png",
      "terminal-connection-link.png",
      "terminal-connection-send-action.png"
    ];

    expect(helpSource).toContain("### Developer examples by message kind");
    expect(buildScript).toContain("--lua-filter=$imageFilterPath");
    expect(imageFilter).toContain('local sourcePrefix = "public/help-images/"');
    expect(generatedHelp).not.toContain('src="public/help-images/');
    for (const screenshot of screenshots) {
      expect(fs.statSync(path.join(repoRoot, "public", "help-images", screenshot)).size).toBeGreaterThan(0);
      expect(helpSource).toContain(`public/help-images/${screenshot}`);
      expect(generatedHelp).toContain(`src="help-images/${screenshot}"`);
    }
  });

  it("ships the illustrated Copy and prepare workflow", () => {
    const helpSource = read("HELP.md");
    const generatedHelp = read(path.join("public", "help.html"));
    const readme = read("README.md");
    const screenshots = [
      "copy-prepare-cleanup.png",
      "copy-prepare-save-send.png"
    ];

    expect(readme).toContain("Copy and prepare selected text");
    expect(readme).toContain("save it as a script or snippet");
    expect(helpSource).toContain("### Copy and prepare selected text");
    expect(helpSource).toContain("**Save file** or <kbd>Ctrl+S</kbd> opens Save As");
    expect(generatedHelp).not.toContain('src="public/help-images/');
    for (const screenshot of screenshots) {
      expect(fs.statSync(path.join(repoRoot, "public", "help-images", screenshot)).size).toBeGreaterThan(0);
      expect(helpSource).toContain(`public/help-images/${screenshot}`);
      expect(generatedHelp).toContain(`src="help-images/${screenshot}"`);
    }
  });

  it("exposes a visible question-mark button and the help modal", () => {
    const index = read(path.join("public", "index.html"));

    expect(index).toContain('id="helpDocToggle"');
    expect(index).toContain('class="help-doc-glyph"');
    expect(index).toContain('id="helpOverlay"');
    expect(index).toContain('id="helpFrame"');
  });
});
