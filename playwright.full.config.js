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

const { defineConfig } = require("@playwright/test");
const iterativeConfig = require("./playwright.config");

module.exports = defineConfig({
  ...iterativeConfig,
  grepInvert: undefined,
  globalTeardown: require.resolve("./tests/support/coverage-global-teardown")
});
