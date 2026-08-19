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
const os = require("node:os");
const server = require("../../src/server.js");

function makeTerminal(pid = 4321) {
  const handlers = {};
  return {
    pid,
    onData: vi.fn((callback) => { handlers.data = callback; }),
    onExit: vi.fn((callback) => { handlers.exit = callback; }),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    fire(name, value) { handlers[name]?.(value); }
  };
}

function fakeClient() {
  return { send: vi.fn() };
}

let sessionDependencies;
let terminal;

beforeEach(() => {
  terminal = makeTerminal();
  sessionDependencies = { spawnPty: vi.fn(() => terminal) };
});

afterEach(() => {
  vi.restoreAllMocks();
  server.sessions.clear();
  server.clients.clear();
});

describe("terminal traffic counters", () => {
  it("counts input and output as string units and UTF-8 bridge bytes", () => {
    server.createSession(fakeClient(), { id: "traffic01", title: "Traffic" }, sessionDependencies);
    const session = server.sessions.get("traffic01");
    const payload = "é😀";

    server.writeSession("traffic01", payload);
    terminal.fire("data", payload);

    expect(terminal.write).toHaveBeenCalledWith(payload);
    expect(session).toMatchObject({
      keystrokesIn: 3,
      keystrokesOut: 3,
      bytesIn: 6,
      bytesOut: 6
    });
  });
});

describe("process-tree terminal statistics", () => {
  it("sums a root and all descendants while ignoring invalid and cyclic rows", () => {
    const metrics = server.collectProcessTreeMetrics(10, [
      { pid: 0, ppid: 0, cpu: 99, memory: 99 },
      { pid: 10, ppid: 30, cpu: 20, memory: 100 },
      { pid: 20, ppid: 10, cpu: 10, memory: 200 },
      { pid: 30, ppid: 20, cpu: -5, memory: -10 },
      { pid: 40, ppid: 999, cpu: 50, memory: 500 }
    ]);

    expect(metrics).toEqual({ cpu: 30, memory: 300 });
    expect(server.collectProcessTreeMetrics(0)).toEqual({ cpu: 0, memory: 0 });
    expect(server.collectProcessTreeMetrics(999, [
      { pid: 1000, ppid: 999, cpu: 4, memory: 40 }
    ])).toEqual({ cpu: 4, memory: 40 });
  });

  it("builds one-terminal and aggregate frames with normalized process use", () => {
    vi.spyOn(os, "cpus").mockReturnValue([{}, {}]);
    server.sessions.set("one", {
      id: "one",
      title: "One",
      terminal: { pid: 10 },
      keystrokesIn: 2,
      keystrokesOut: 3,
      bytesIn: 4,
      bytesOut: 5
    });
    server.sessions.set("two", {
      id: "two",
      title: "Two",
      terminal: { pid: 20 },
      keystrokesIn: 7,
      keystrokesOut: 11,
      bytesIn: 13,
      bytesOut: 17
    });
    const rows = [
      { pid: 10, ppid: 1, cpu: 160, memory: 1000 },
      { pid: 11, ppid: 10, cpu: 60, memory: 500 },
      { pid: 20, ppid: 1, cpu: 40, memory: 2000 }
    ];

    const one = server.buildStatisticsFrame({ requestId: "r1", id: "one" }, rows);
    expect(one).toMatchObject({
      type: "statistics",
      requestId: "r1",
      scope: "terminal",
      requestedId: "one",
      supported: true,
      processError: null,
      sessions: [{
        id: "one",
        title: "One",
        pid: 10,
        keystrokesIn: 2,
        keystrokesOut: 3,
        bytesIn: 4,
        bytesOut: 5,
        cpuPercent: 100,
        memoryBytes: 1500
      }]
    });
    expect(one.totals.cpuPercent).toBe(100);

    const all = server.buildStatisticsFrame({}, rows);
    expect(all.scope).toBe("all");
    expect(all.requestId).toBe("");
    expect(all.requestedId).toBeNull();
    expect(all.sessions).toHaveLength(2);
    expect(all.totals).toMatchObject({
      keystrokesIn: 9,
      keystrokesOut: 14,
      bytesIn: 17,
      bytesOut: 22,
      cpuPercent: 100,
      memoryBytes: 3500
    });
  });

  it("preserves traffic counters when process sampling is unavailable", () => {
    server.sessions.set("one", {
      id: "one",
      title: "One",
      terminal: null,
      keystrokesIn: undefined,
      keystrokesOut: undefined,
      bytesIn: undefined,
      bytesOut: undefined
    });

    const frame = server.buildStatisticsFrame({ id: "one" }, null, "sampling failed");
    expect(frame.supported).toBe(false);
    expect(frame.processError).toBe("sampling failed");
    expect(frame.sessions[0]).toMatchObject({
      pid: 0,
      keystrokesIn: 0,
      keystrokesOut: 0,
      bytesIn: 0,
      bytesOut: 0,
      cpuPercent: null,
      memoryBytes: null
    });
    expect(frame.totals).toMatchObject({ cpuPercent: null, memoryBytes: null });
  });

  it("returns an empty terminal frame for a session that already exited", () => {
    const frame = server.buildStatisticsFrame({ id: "gone" }, []);
    expect(frame.sessions).toEqual([]);
    expect(frame.totals).toMatchObject({
      keystrokesIn: 0,
      keystrokesOut: 0,
      bytesIn: 0,
      bytesOut: 0,
      cpuPercent: 0,
      memoryBytes: 0
    });
  });
});

describe("statistics process sampler and protocol", () => {
  it("reports unsupported platforms without spawning PowerShell", () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
    const exec = vi.spyOn(childProcess, "execFile");
    const callback = vi.fn();

    server.collectProcessStatistics(callback);

    expect(exec).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(null, "Process statistics are available on Windows only.");
    Object.defineProperty(process, "platform", platform);
  });

  it("parses array, object, and empty PowerShell samples", () => {
    const exec = vi.spyOn(childProcess, "execFile");
    const callback = vi.fn();

    exec.mockImplementationOnce((_file, _args, _options, done) => done(null, '[{"pid":1}]'));
    server.collectProcessStatistics(callback);
    expect(callback).toHaveBeenLastCalledWith([{ pid: 1 }], null);

    exec.mockImplementationOnce((_file, _args, _options, done) => done(null, '{"pid":2}'));
    server.collectProcessStatistics(callback);
    expect(callback).toHaveBeenLastCalledWith([{ pid: 2 }], null);

    exec.mockImplementationOnce((_file, _args, _options, done) => done(null, ""));
    server.collectProcessStatistics(callback);
    expect(callback).toHaveBeenLastCalledWith([], null);
    expect(exec.mock.calls[0][0]).toBe("powershell.exe");
    expect(exec.mock.calls[0][1]).toContain("-Command");
  });

  it("reports process execution and JSON parse failures", () => {
    const exec = vi.spyOn(childProcess, "execFile");
    const callback = vi.fn();

    exec.mockImplementationOnce((_file, _args, _options, done) => done(new Error("CIM failed"), ""));
    server.collectProcessStatistics(callback);
    expect(callback).toHaveBeenLastCalledWith(null, "CIM failed");

    exec.mockImplementationOnce((_file, _args, _options, done) => done({ message: "" }, ""));
    server.collectProcessStatistics(callback);
    expect(callback).toHaveBeenLastCalledWith(null, "Could not sample processes.");

    exec.mockImplementationOnce((_file, _args, _options, done) => done(null, "not-json"));
    server.collectProcessStatistics(callback);
    expect(callback).toHaveBeenLastCalledWith(null, "Could not parse process statistics.");
  });

  it("samples and sends a correlated statistics response", () => {
    vi.spyOn(childProcess, "execFile").mockImplementation((_file, _args, _options, done) => done(null, "[]"));
    const client = fakeClient();

    server.requestStatistics(client, { requestId: "direct" });

    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "statistics",
      requestId: "direct",
      scope: "all",
      supported: true
    }));
  });

  it("routes statistics requests through the bridge message handler", () => {
    vi.spyOn(childProcess, "execFile").mockImplementation((_file, _args, _options, done) => done(null, "[]"));
    const client = fakeClient();

    server.handleClientMessage(client, JSON.stringify({ type: "statistics", requestId: "routed" }));

    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "statistics",
      requestId: "routed"
    }));
  });

  it("can broadcast while excluding the requesting client", () => {
    const included = fakeClient();
    const excluded = fakeClient();
    server.clients.add(included);
    server.clients.add(excluded);

    server.broadcast({ type: "statistics" }, excluded);

    expect(included.send).toHaveBeenCalledWith({ type: "statistics" });
    expect(excluded.send).not.toHaveBeenCalled();
  });
});
