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
      .toBeLessThan(installerBuildScript.indexOf("Snapshot every pending change"));
  });

  it("exposes a visible question-mark button and the help modal", () => {
    const index = read(path.join("public", "index.html"));

    expect(index).toContain('id="helpDocToggle"');
    expect(index).toContain('class="help-doc-glyph"');
    expect(index).toContain('id="helpOverlay"');
    expect(index).toContain('id="helpFrame"');
  });
});
