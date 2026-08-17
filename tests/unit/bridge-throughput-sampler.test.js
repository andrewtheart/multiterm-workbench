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

const { EventEmitter } = require("node:events");
const { WINDOWS_POWERSHELL, WINDOWS_POWERSHELL_MODULE_PATH } = require("../../benchmarks/bridge-throughput/bridge-control");
const { ProcessSampler, SAMPLER_SCRIPT } = require("../../benchmarks/bridge-throughput/sampler");

function createChild(exitCode = null) {
  const stdout = new EventEmitter();
  stdout.setEncoding = vi.fn();
  return {
    exitCode,
    kill: vi.fn(),
    stdout
  };
}

describe("bridge throughput process sampler", () => {
  it("filters process ids and does not spawn for an empty set", () => {
    const spawnImpl = vi.fn();
    const sampler = new ProcessSampler({
      processIds: [0, -1, 1.5, "2", Number.NaN],
      intervalMs: 0,
      spawnImpl
    });

    expect(sampler).toMatchObject({ intervalMs: 250, processIds: [] });
    expect(sampler.start()).toBe(sampler);
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(sampler.stop()).toBe(sampler);
  });

  it("spawns Windows PowerShell and parses complete streamed samples", () => {
    const child = createChild();
    const spawnImpl = vi.fn(() => child);
    const sampler = new ProcessSampler({ processIds: [22, 11, 22], intervalMs: 500, spawnImpl });

    expect(sampler.start()).toBe(sampler);
    expect(spawnImpl).toHaveBeenCalledWith(
      WINDOWS_POWERSHELL,
      [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-File", SAMPLER_SCRIPT,
        "-ProcessIds", "22,11,22",
        "-IntervalMs", "500"
      ],
      expect.objectContaining({
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
        env: expect.objectContaining({ PSModulePath: WINDOWS_POWERSHELL_MODULE_PATH })
      })
    );
    expect(child.stdout.setEncoding).toHaveBeenCalledWith("utf8");

    child.stdout.emit("data", "\nnot-json\n{\"at\":100,\"rows\":[");
    child.stdout.emit("data", "{\"pid\":11,\"cpuMs\":5,\"workingSet\":100,\"threads\":2}]}\r\n");
    child.stdout.emit("data", "{\"at\":150,\"rows\":[]}\nunfinished");
    expect(sampler.samples).toEqual([
      { at: 100, rows: [{ pid: 11, cpuMs: 5, workingSet: 100, threads: 2 }] },
      { at: 150, rows: [] }
    ]);
    expect(sampler.pending).toBe("unfinished");

    expect(sampler.stop()).toBe(sampler);
    expect(child.kill).toHaveBeenCalledOnce();
    expect(sampler.child).toBeNull();
  });

  it("does not kill a child that has already exited", () => {
    const child = createChild(0);
    const sampler = new ProcessSampler({ processIds: [1], spawnImpl: () => child }).start();
    sampler.stop();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("returns empty summaries for fewer than two measured samples", () => {
    const sampler = new ProcessSampler({ processIds: [] });
    expect(sampler.summarize()).toEqual({ processes: {}, sampleCount: 0, windowMs: 0 });
    sampler.samples.push({ at: 10, rows: [] });
    sampler.markIndex = 0;
    expect(sampler.summarize()).toEqual({ processes: {}, sampleCount: 1, windowMs: 0 });
  });

  it("summarizes marked CPU and peak working-set windows", () => {
    const sampler = new ProcessSampler({ processIds: [11, 22] });
    sampler.samples.push({ at: 0, rows: [{ pid: 11, cpuMs: 1, workingSet: 50, threads: 1 }] });
    expect(sampler.mark()).toBe(sampler);
    sampler.samples.push(
      {
        at: 100,
        rows: [
          { pid: 11, cpuMs: 10.1111, workingSet: 100, threads: 2 },
          { pid: 22, cpuMs: 1, workingSet: 500, threads: 1 }
        ]
      },
      { at: 150 },
      { at: 175 },
      {
        at: 200,
        rows: [
          { pid: 11, cpuMs: 30.5678, workingSet: 200, threads: 3 },
          { pid: 33, cpuMs: 5, workingSet: 900, threads: 4 }
        ]
      }
    );
    sampler.samples[2].rows = [{ pid: 11, cpuMs: 20, workingSet: 300, threads: 2 }];

    expect(sampler.summarize()).toEqual({
      processes: {
        11: {
          cpuMs: 20.457,
          cpuPercent: 20.46,
          finalWorkingSetBytes: 200,
          peakWorkingSetBytes: 300,
          threads: 3
        }
      },
      sampleCount: 4,
      windowMs: 100
    });
  });

  it("handles zero-duration windows and absent row collections", () => {
    const sampler = new ProcessSampler({ processIds: [7] });
    sampler.samples = [
      { at: 100, rows: [{ pid: 7, cpuMs: 1, workingSet: 10, threads: 1 }] },
      { at: 100, rows: [{ pid: 7, cpuMs: 2, workingSet: 20, threads: 2 }] }
    ];
    expect(sampler.summarize()).toMatchObject({
      processes: { 7: { cpuPercent: 0, peakWorkingSetBytes: 20 } },
      sampleCount: 2,
      windowMs: 0
    });

    sampler.samples = [{ at: 1 }, { at: 2 }];
    expect(sampler.summarize()).toEqual({ processes: {}, sampleCount: 2, windowMs: 1 });
  });
});