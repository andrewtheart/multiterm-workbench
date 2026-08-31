/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.js", "tests/integration/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "json"],
      reportsDirectory: "coverage/vitest",
      include: [
        "src/server.js",
        "src/main.js",
        "src/elevated-pty-host.js",
        "src/preload.js",
        "src/ws-origin.js",
        "src/shell-integration.js",
        "src/copilot-automation-output.js",
        "src/renderer-routing.js",
        "lib/runtime-diagnostics.js",
        "public/automations.js",
        "public/embed-host.js",
        "public/git-worktrees.js",
        "public/syntax-highlight.js",
        "public/terminal-messaging.js",
        "public/bridge-chooser.js",
        "public/help-theme.js",
        "integrations/vscode/extension.js",
        "integrations/vscode/embed/bridge-resolver.js",
        "integrations/vscode/embed/host-rpc.js",
        "integrations/vscode/embed/view-host.js",
        "integrations/vscode/embed/webview-shell.js"
      ],
      // public/app.js is a browser renderer script exercised by Playwright E2E.
      all: true,
      thresholds: {
        perFile: true,
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95
      }
    }
  }
});
