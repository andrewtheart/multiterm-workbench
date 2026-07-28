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

const fs = require("node:fs");
const path = require("node:path");

module.exports = async function coverageGlobalSetup() {
  for (const dir of ["coverage/e2e", "coverage/e2e-raw"]) {
    fs.rmSync(path.join(__dirname, "..", "..", dir), { recursive: true, force: true });
  }
};
