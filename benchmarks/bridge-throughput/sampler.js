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

/**
 * Process CPU/working-set sampler for the bridge throughput benchmark.
 *
 * Samples are turned into a CPU rate by differencing cumulative processor time
 * between the first and last sample of the measured window, so a single missed
 * sample cannot invent or hide load.
 */

"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");
const { WINDOWS_POWERSHELL, windowsPowerShellEnvironment } = require("./bridge-control");

const SAMPLER_SCRIPT = path.join(__dirname, "sample-processes.ps1");

class ProcessSampler {
  /**
   * @param {{ processIds: number[], intervalMs?: number }} options
   */
  constructor(options) {
    this.processIds = options.processIds.filter((value) => Number.isInteger(value) && value > 0);
    this.intervalMs = options.intervalMs || 250;
    this.spawnImpl = options.spawnImpl || spawn;
    this.samples = [];
    this.child = null;
    this.pending = "";
  }

  start() {
    if (this.processIds.length === 0) return this;
    this.child = this.spawnImpl(
      WINDOWS_POWERSHELL,
      [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-File", SAMPLER_SCRIPT,
        "-ProcessIds", this.processIds.join(","),
        "-IntervalMs", String(this.intervalMs)
      ],
      { stdio: ["ignore", "pipe", "ignore"], env: windowsPowerShellEnvironment(), windowsHide: true }
    );
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (text) => this.#consume(text));
    return this;
  }

  #consume(text) {
    this.pending += text;
    const lines = this.pending.split(/\r?\n/);
    this.pending = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        this.samples.push(JSON.parse(trimmed));
      } catch {
        // A partially flushed sample is simply skipped; the window uses the
        // first and last complete samples.
      }
    }
  }

  /** Marks the start of a measured window; everything before it is warm-up. */
  mark() {
    this.markIndex = this.samples.length;
    return this;
  }

  stop() {
    if (this.child && this.child.exitCode === null) this.child.kill();
    this.child = null;
    return this;
  }

  /**
   * @returns {{ windowMs: number, processes: Record<string, object>, sampleCount: number }}
   */
  summarize() {
    const window = this.samples.slice(this.markIndex || 0);
    if (window.length < 2) {
      return { processes: {}, sampleCount: window.length, windowMs: 0 };
    }
    const first = window[0];
    const last = window[window.length - 1];
    const windowMs = last.at - first.at;
    const firstByPid = new Map((first.rows || []).map((row) => [row.pid, row]));
    const processes = {};

    for (const row of last.rows || []) {
      const before = firstByPid.get(row.pid);
      if (!before) continue;
      const cpuMs = row.cpuMs - before.cpuMs;
      let peakWorkingSet = 0;
      for (const sample of window) {
        for (const candidate of sample.rows || []) {
          if (candidate.pid === row.pid && candidate.workingSet > peakWorkingSet) {
            peakWorkingSet = candidate.workingSet;
          }
        }
      }
      processes[String(row.pid)] = {
        cpuMs: Number(cpuMs.toFixed(3)),
        cpuPercent: windowMs > 0 ? Number(((cpuMs / windowMs) * 100).toFixed(2)) : 0,
        finalWorkingSetBytes: row.workingSet,
        peakWorkingSetBytes: peakWorkingSet,
        threads: row.threads
      };
    }

    return { processes, sampleCount: window.length, windowMs };
  }
}

module.exports = { ProcessSampler, SAMPLER_SCRIPT };
