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

const childProcess = require("node:child_process");
const server = require("../../src/server.js");

function fakeClient() {
  return { send: vi.fn() };
}

let ppidDescriptor;
let platformDescriptor;

beforeEach(() => {
  ppidDescriptor = Object.getOwnPropertyDescriptor(process, "ppid");
  platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (ppidDescriptor) Object.defineProperty(process, "ppid", ppidDescriptor);
  if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
  server.__setMemStatsEnabled(false);
  server.stopMemStats();
  server.sessions.clear();
  server.clients.clear();
});

describe("getShell — every shell branch and the default", () => {
  it("returns Windows PowerShell for 'powershell'", () => {
    expect(server.getShell("powershell")).toMatchObject({ file: "powershell.exe", label: "Windows PowerShell" });
  });

  it("returns Command Prompt for 'cmd'", () => {
    expect(server.getShell("cmd")).toMatchObject({ file: "cmd.exe", label: "Command Prompt" });
  });

  it("returns WSL for 'wsl'", () => {
    expect(server.getShell("wsl")).toMatchObject({ file: "wsl.exe", label: "WSL" });
  });

  it("falls through every guard to the pwsh default for an unknown shell", () => {
    expect(server.getShell("bash")).toMatchObject({ file: "pwsh.exe", label: "PowerShell 7" });
    expect(server.getShell(undefined)).toMatchObject({ file: "pwsh.exe" });
  });
});

describe("isLocalAddress — each allowed form and a remote address", () => {
  it("accepts every loopback representation", () => {
    expect(server.isLocalAddress("127.0.0.1")).toBe(true);
    expect(server.isLocalAddress("::1")).toBe(true);
    expect(server.isLocalAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("rejects a non-loopback address", () => {
    expect(server.isLocalAddress("10.0.0.5")).toBe(false);
  });
});

describe("isLoopbackBindHost — normalized startup host validation", () => {
  it("accepts supported names and literals and rejects absent or remote hosts", () => {
    expect(server.isLoopbackBindHost("LOCALHOST")).toBe(true);
    expect(server.isLoopbackBindHost("[::1]")).toBe(true);
    expect(server.isLoopbackBindHost("127.0.0.1")).toBe(true);
    expect(server.isLoopbackBindHost(undefined)).toBe(false);
    expect(server.isLoopbackBindHost("0.0.0.0")).toBe(false);
  });
});

describe("revealPath — empty/non-string target guard", () => {
  it("returns early for a whitespace-only path", () => {
    const client = fakeClient();
    expect(() => server.revealPath(client, { path: "   " })).not.toThrow();
    expect(client.send).not.toHaveBeenCalled();
  });

  it("returns early for a non-string path", () => {
    const client = fakeClient();
    expect(() => server.revealPath(client, { path: 42 })).not.toThrow();
    expect(client.send).not.toHaveBeenCalled();
  });
});

describe("computeMemStats — tree traversal edge branches", () => {
  it("skips the parent root when process.ppid is unavailable and dedupes duplicate children", () => {
    Object.defineProperty(process, "ppid", { value: 0, configurable: true });
    const procs = [
      { ProcessId: process.pid, ParentProcessId: 1, WorkingSetSize: 1000 },
      { ProcessId: 5001, ParentProcessId: process.pid, WorkingSetSize: 500 },
      // Duplicate row => childrenByParent[pid] = [5001, 5001]; both get pushed
      // before either is marked seen, exercising the `seen.has(pid) continue`
      // guard, while 5001 itself is a leaf (no children).
      { ProcessId: 5001, ParentProcessId: process.pid, WorkingSetSize: 500 }
    ];
    vi.spyOn(childProcess, "execFile").mockImplementation((_f, _a, _o, cb) => cb(null, JSON.stringify(procs)));

    let stats;
    server.computeMemStats((s) => { stats = s; });
    expect(stats.appBytes).toBe(1500);
  });
});

describe("pushMemStats — null-stats short circuit", () => {
  it("does not broadcast when the memory probe yields no stats", () => {
    server.__setMemStatsEnabled(true);
    const client = fakeClient();
    server.clients.add(client);
    vi.spyOn(childProcess, "execFile").mockImplementation((_f, _a, _o, cb) => cb(new Error("probe failed"), ""));

    server.pushMemStats();

    expect(client.send).not.toHaveBeenCalled();
  });
});

describe("memory-stats timers — guard and clear branches", () => {
  it("scheduleMemStats returns immediately while disabled", () => {
    vi.useFakeTimers();
    server.__setMemStatsEnabled(false);
    server.scheduleMemStats(500);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stopMemStats clears an armed interval and settle timer", () => {
    vi.useFakeTimers();
    server.__setMemStatsEnabled(true);
    server.startMemStats(); // arms both the settle timeout and the interval
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    server.stopMemStats();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stopMemStats is a harmless no-op when nothing is armed", () => {
    server.__setMemStatsEnabled(false);
    server.stopMemStats(); // both timers null -> skip both clears
    expect(() => server.stopMemStats()).not.toThrow();
  });
});

describe("module load — MEMSTATS platform gate", () => {
  it("computeMemStatsDefault evaluates both operands of the env+platform gate", () => {
    const prev = process.env.MEMSTATS;

    // MEMSTATS unset -> left operand false (right never needed).
    delete process.env.MEMSTATS;
    expect(server.computeMemStatsDefault()).toBe(false);

    // MEMSTATS="1" -> left operand true, forcing the platform right operand.
    process.env.MEMSTATS = "1";
    expect(server.computeMemStatsDefault()).toBe(process.platform === "win32");

    if (prev === undefined) delete process.env.MEMSTATS;
    else process.env.MEMSTATS = prev;
  });
});
