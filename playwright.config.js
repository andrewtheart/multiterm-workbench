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

const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/e2e",
  globalSetup: require.resolve("./tests/support/coverage-global-setup"),
  grepInvert: /@full/,
  fullyParallel: false,
  workers: 1,
  // Retry transient failures once. The suite drives real ConPTYs and one shared
  // bridge, so a loaded machine produces occasional one-off failures that pass
  // immediately on rerun. A retry that also fails still fails the run, and
  // anything that only passed on retry is reported as flaky so it stays visible
  // rather than being silently tolerated.
  retries: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3199",
    headless: true,
    trace: "off"
  },
  webServer: {
    command: "node tests/support/bridge-supervisor.js",
    port: 3199,
    env: { PORT: "3199", HOST: "127.0.0.1" },
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 30000
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
