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

const MODES = ["node", "installed"];
const SCENARIOS = ["clients-1", "clients-2", "clients-4", "clients-8", "slow-client", "idle-control"];
const REQUIRED_REPEATS = 5;

function classifyOutcome(summary) {
  const aggregate = summary?.aggregate || {};
  if (summary?.scenario === "idle-control") return "control";
  if (aggregate.completedRuns < REQUIRED_REPEATS) return "blocked";
  if (aggregate.exactOutput !== true) return "inexact";
  if (aggregate.stable !== true) return "unstable";
  return "pass";
}

function validateSummary(summary, expectedMode, expectedScenario, expectedHost) {
  const errors = [];
  if (!summary || typeof summary !== "object") return ["summary is not an object"];
  if (summary.bridgeMode !== expectedMode) errors.push(`bridgeMode is ${summary.bridgeMode}`);
  if (summary.scenario !== expectedScenario) errors.push(`scenario is ${summary.scenario}`);
  if (summary.renderer !== true) errors.push("renderer lane was not enabled");
  const runs = Array.isArray(summary.runs) ? summary.runs : [];
  if (summary.repeats !== REQUIRED_REPEATS || runs.length !== REQUIRED_REPEATS) {
    errors.push(`expected ${REQUIRED_REPEATS} runs`);
  }
  if (!summary.machine?.hostname) errors.push("machine identity is missing");
  else if (expectedHost && summary.machine.hostname !== expectedHost) errors.push(`machine is ${summary.machine.hostname}, expected ${expectedHost}`);
  if (!summary.workload || !Number.isFinite(summary.workload.rate) || !Number.isFinite(summary.workload.recordBytes)) {
    errors.push("workload metadata is incomplete");
  }
  for (const [index, run] of runs.entries()) {
    if (!run?.bridge?.health?.ok) errors.push(`run ${index + 1} has no healthy bridge record`);
    if (!Number.isFinite(run?.durationMs) || run.durationMs <= 0) errors.push(`run ${index + 1} has no duration`);
    if (!Number.isFinite(run?.harness?.sampleCount) || run.harness.sampleCount < 2) errors.push(`run ${index + 1} has insufficient samples`);
    if (!run?.renderer) errors.push(`run ${index + 1} has no renderer summary`);
    if (!Array.isArray(run?.clients) || run.clients.length !== summary.clients) errors.push(`run ${index + 1} client count is wrong`);
  }
  return errors;
}

function evaluateBaselineDirectory(directory) {
  const configurationPath = path.join(directory, "vm-configuration.json");
  const errors = [];
  let configuration = null;
  try {
    configuration = JSON.parse(fs.readFileSync(configurationPath, "utf8"));
  } catch (error) {
    errors.push(`cannot read vm-configuration.json: ${error.message}`);
  }
  if (configuration?.DynamicMemoryEnabled !== false) errors.push("authoritative VM baseline must use fixed memory");
  if (!Number.isFinite(configuration?.AssignedMemoryBytes) || configuration.AssignedMemoryBytes <= 0) {
    errors.push("assigned fixed memory is missing");
  }
  if (!configuration?.SourceRevision) errors.push("deployed source revision is missing");

  let expectedVersion = "";
  try {
    expectedVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "..", "package.json"), "utf8")).version;
  } catch (error) {
    errors.push(`cannot read current app version: ${error.message}`);
  }

  const rows = [];
  let expectedHost = "";
  for (const mode of MODES) {
    for (const scenario of SCENARIOS) {
      const file = path.join(directory, `vm-baseline-${mode}-${scenario}.json`);
      let summary = null;
      let rowErrors = [];
      try {
        summary = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!expectedHost && summary.machine?.hostname) expectedHost = summary.machine.hostname;
        rowErrors = validateSummary(summary, mode, scenario, expectedHost);
        if (summary.appVersion !== expectedVersion) rowErrors.push(`appVersion is ${summary.appVersion}, expected ${expectedVersion}`);
        if (summary.sourceRevision !== configuration?.SourceRevision) {
          rowErrors.push(`sourceRevision is ${summary.sourceRevision || "missing"}, expected ${configuration?.SourceRevision || "missing"}`);
        }
      } catch (error) {
        rowErrors = [`cannot read summary: ${error.message}`];
      }
      const outcome = summary ? classifyOutcome(summary) : "missing";
      rows.push({ mode, scenario, outcome, valid: rowErrors.length === 0, errors: rowErrors });
      for (const error of rowErrors) errors.push(`${mode}/${scenario}: ${error}`);
    }
  }

  const valid = errors.length === 0;
  return {
    configuration,
    outcomes: rows,
    valid,
    errors,
    phase1Ready: valid
  };
}

function main(argv, stdout = process.stdout, runtime = process) {
  const directory = path.resolve(argv[0] || path.join(__dirname, "results", "vm"));
  const report = evaluateBaselineDirectory(directory);
  stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.valid) runtime.exitCode = 1;
  return report;
}

function runCliIfMain(isMain, argv = process.argv.slice(2), stdout = process.stdout, runtime = process) {
  if (!isMain) return null;
  return main(argv, stdout, runtime);
}

runCliIfMain(require.main === module);

module.exports = {
  MODES,
  REQUIRED_REPEATS,
  SCENARIOS,
  classifyOutcome,
  evaluateBaselineDirectory,
  main,
  runCliIfMain,
  validateSummary
};