/*
 * MultiTerm Workbench — Terminal Renderer Spike: Playwright Configuration
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

"use strict";

const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: ["bench.spec.js"],
  fullyParallel: false,
  workers: 1,
  // Eight variants, each with one warm-up and three measured five-second runs.
  timeout: 600_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: [
        "--no-first-run",
        "--no-default-browser-check"
      ]
    }
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
