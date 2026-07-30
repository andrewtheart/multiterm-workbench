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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

const fs = require("node:fs");
const path = require("node:path");

const bridgeScript = fs.readFileSync(path.resolve(__dirname, "../../Start-MultiTerm.ps1"), "utf8");

describe("PowerShell bridge terminal statistics", () => {
  it("counts UTF-8 payload bytes and string units while excluding bridge shutdown input", () => {
    expect(bridgeScript).toContain("Interlocked.Add(ref this.keystrokesIn, data.Length)");
    expect(bridgeScript).toContain("Interlocked.Add(ref this.bytesIn, bytes.Length)");
    expect(bridgeScript).toContain("Interlocked.Add(ref this.keystrokesOut, data.Length)");
    expect(bridgeScript).toContain("Interlocked.Add(ref this.bytesOut, byteCount)");
    expect(bridgeScript).toContain('this.WriteCore("exit\\r", false)');
    expect(bridgeScript).toContain('this.WriteCore("\\u0003", false)');
  });

  it("samples positive per-process CPU deltas across the complete process tree", () => {
    expect(bridgeScript).toContain("private Dictionary<int, TimeSpan> CaptureProcessCpu");
    expect(bridgeScript).toContain("private TimeSpan SumProcessCpuDelta");
    expect(bridgeScript).toContain("if (delta > TimeSpan.Zero) total += delta");
    expect(bridgeScript).toContain("sample.Elapsed.TotalMilliseconds * Environment.ProcessorCount");
    expect(bridgeScript).toContain("this.SumProcessMemory(session.Pid, secondTree)");
  });

  it("uses one counter snapshot for each row and its aggregate totals", () => {
    expect(bridgeScript).toMatch(/long keysIn = session\.KeystrokesIn;[\s\S]*session\.StatisticsJson\(cpu, memory, keysIn, keysOut, bytesIn, bytesOut\)[\s\S]*totalKeysIn \+= keysIn/);
    expect(bridgeScript).toContain("!Object.ReferenceEquals(current, session)");
  });

  it("preserves live traffic rows when process sampling fails", () => {
    expect(bridgeScript).toContain("session.StatisticsJson(null, null, keysIn, keysOut, bytesIn, bytesOut)");
    expect(bridgeScript).toContain('"cpuPercent\\":null,\\"memoryBytes\\":null}');
    expect(bridgeScript).toContain('"supported\\":false,\\"processError\\":\\"Could not sample process statistics.\\",\\"sessions\\":[" + entries');
  });
});
