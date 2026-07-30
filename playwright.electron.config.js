/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/electron",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  use: { trace: "off" }
});
