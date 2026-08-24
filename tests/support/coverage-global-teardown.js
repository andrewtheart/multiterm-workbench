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
const MCR = require("monocart-coverage-reports");

module.exports = async function coverageGlobalTeardown() {
  const root = path.join(__dirname, "..", "..");
  const rawDir = path.join(root, "coverage", "e2e-raw");
  const files = fs.existsSync(rawDir)
    ? fs.readdirSync(rawDir).filter((file) => file.endsWith(".json"))
    : [];
  let thresholdError = null;
  const report = new MCR.CoverageReport({
    name: "MultiTerm Renderer Coverage",
    outputDir: path.join(root, "coverage", "e2e"),
    reports: ["console-summary", "v8", "lcovonly", "json"],
    entryFilter: (entry) => /\/(?:app|input-detection)\.js(?:\?|$)/.test(entry.url),
    sourceFilter: (sourcePath) => /(?:^|[\\/])(?:app|input-detection)\.js$/.test(sourcePath),
    onEnd: ({ summary }) => {
      const metrics = ["statements", "branches", "functions", "lines"];
      const failures = metrics
        .filter((metric) => summary[metric].pct < 95)
        .map((metric) => `${metric}: ${summary[metric].pct}%`);
      if (failures.length) thresholdError = new Error(`Renderer coverage is below 95% (${failures.join(", ")})`);
    }
  });
  const coverage = files.flatMap((file) => JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf8")));
  await report.add(coverage);
  await report.generate();
  if (thresholdError) throw thresholdError;
};
