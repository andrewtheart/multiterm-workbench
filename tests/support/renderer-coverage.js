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
const base = require("@playwright/test");

const rawDir = path.join(__dirname, "..", "..", "coverage", "e2e-raw");
const startedPages = new WeakSet();
let sequence = 0;

function safeName(value) {
  return String(value || "renderer").replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 100);
}

async function startRendererCoverage(page) {
  if (!page || startedPages.has(page)) return;
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  startedPages.add(page);
}

async function stopRendererCoverage(page, name) {
  if (!page || !startedPages.has(page) || page.isClosed()) return;
  const coverage = await page.coverage.stopJSCoverage();
  startedPages.delete(page);
  fs.mkdirSync(rawDir, { recursive: true });
  const file = `${process.pid}-${sequence++}-${safeName(name)}.json`;
  fs.writeFileSync(path.join(rawDir, file), JSON.stringify(coverage));
}

const test = base.test.extend({
  page: async ({ page }, use, testInfo) => {
    await startRendererCoverage(page);
    await use(page);
    await stopRendererCoverage(page, testInfo.titlePath.join("-"));
  }
});

module.exports = {
  test,
  expect: base.expect,
  startRendererCoverage,
  stopRendererCoverage,
  rawDir
};
