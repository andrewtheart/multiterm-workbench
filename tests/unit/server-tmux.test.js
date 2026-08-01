/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const childProcess = require("node:child_process");
const server = require("../../server.js");

function fakeClient() {
  return { send: vi.fn() };
}

function makeTerminal(pid = 5511) {
  const handlers = {};
  return {
    pid,
    onData: vi.fn((handler) => { handlers.data = handler; }),
    onExit: vi.fn((handler) => { handlers.exit = handler; }),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    fire(name, value) { handlers[name]?.(value); }
  };
}

let platformDescriptor;

beforeEach(() => {
  platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
});

afterEach(() => {
  vi.restoreAllMocks();
  if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
  server.__setPty(require("@homebridge/node-pty-prebuilt-multiarch"));
  server.sessions.clear();
  server.clients.clear();
});

describe("tmux target validation and shell construction", () => {
  it("normalizes a valid WSL tmux target", () => {
    expect(server.normalizeTmuxTarget({ distro: " Ubuntu ", session: " dev " }))
      .toEqual({ distro: "Ubuntu", session: "dev" });
  });

  it("rejects absent, malformed, oversized, and control-character targets", () => {
    expect(server.normalizeTmuxTarget(null)).toBeNull();
    expect(server.normalizeTmuxTarget("Ubuntu/dev")).toBeNull();
    expect(server.normalizeTmuxTarget({ distro: "", session: "dev" })).toBeNull();
    expect(server.normalizeTmuxTarget({ distro: "Ubuntu", session: "" })).toBeNull();
    expect(server.normalizeTmuxTarget({ distro: "x".repeat(129), session: "dev" })).toBeNull();
    expect(server.normalizeTmuxTarget({ distro: "Ubuntu", session: "x".repeat(129) })).toBeNull();
    expect(server.normalizeTmuxTarget({ distro: "Ubuntu\n", session: "dev" })).toBeNull();
    expect(server.normalizeTmuxTarget({ distro: "Ubuntu", session: "dev\u007f" })).toBeNull();
    // Non-string fields must degrade to empty, not stringify into a target.
    expect(server.normalizeTmuxTarget({ distro: 5, session: 6 })).toBeNull();
  });

  it("builds an argument-safe wsl tmux attach command", () => {
    expect(server.getTmuxShell({ distro: "Ubuntu 24.04", session: "dev session" })).toEqual({
      args: ["--distribution", "Ubuntu 24.04", "--exec", "tmux", "attach-session", "-t", "dev session"],
      file: "wsl.exe",
      label: "tmux: dev session (Ubuntu 24.04)"
    });
  });
});

describe("tmux session output parsing", () => {
  it("normalizes WSL UTF-16-like nulls and a BOM", () => {
    expect(server.normalizeWslOutput("\uFEFFU\u0000b\u0000u\u0000n\u0000t\u0000u\u0000\r\n"))
      .toBe("Ubuntu\r\n");
    expect(server.normalizeWslOutput(null)).toBe("");
  });

  it("parses session metadata, defaults malformed numeric values, and skips blank names", () => {
    const parsed = server.parseTmuxSessions("Ubuntu", [
      "dev\t2\t1\t1720000000\t4321\tpwsh\twork title",
      "ops\tbad\t0\tbad\tbad\tbash\ttitle\twith tab",
      "\t1\t0\t1\t2\tsh\tmissing name",
      ""
    ].join("\n"));

    expect(parsed).toEqual([
      {
        attached: true,
        command: "pwsh",
        created: 1720000000,
        distro: "Ubuntu",
        panePid: 4321,
        session: "dev",
        title: "work title",
        windows: 2
      },
      {
        attached: false,
        command: "bash",
        created: 0,
        distro: "Ubuntu",
        panePid: null,
        session: "ops",
        title: "title\twith tab",
        windows: 0
      }
    ]);
  });
});

describe("WSL tmux discovery", () => {
  it("reports that discovery is Windows-only", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const client = fakeClient();
    server.listWslTmuxSessions(client, "req-linux");
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "tmuxSessions",
      requestId: "req-linux",
      sessions: [],
      message: expect.stringMatching(/only on Windows/i)
    }));
  });

  it("reports WSL enumeration failures and empty installations", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const failed = fakeClient();
    const empty = fakeClient();
    const execFile = vi.spyOn(childProcess, "execFile");
    execFile.mockImplementationOnce((_file, _args, _options, callback) => callback(new Error("missing"), ""));
    server.listWslTmuxSessions(failed, "req-failed");
    expect(failed.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/could not list/i) }));

    execFile.mockImplementationOnce((_file, _args, _options, callback) => callback(null, "\u0000\r\n"));
    server.listWslTmuxSessions(empty, "req-empty");
    expect(empty.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/no WSL distributions/i) }));
  });

  it("queries every distro, ignores distros without tmux sessions, and sorts results", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const client = fakeClient();
    vi.spyOn(childProcess, "execFile").mockImplementation((file, args, options, callback) => {
      expect(file).toBe("wsl.exe");
      expect(options).toMatchObject({ encoding: "utf8", timeout: 8000, windowsHide: true });
      if (args[0] === "--list") callback(null, "Ubuntu\r\nDebian\r\nArch\r\n");
      else if (args[1] === "Ubuntu") callback(null, "zeta\t1\t0\t1\t10\tbash\tz\nalpha\t2\t1\t2\t20\tpwsh\ta");
      else if (args[1] === "Debian") callback(new Error("tmux absent"), "");
      else callback(null, "main\t1\t0\t3\t30\tsh\tm");
    });

    server.listWslTmuxSessions(client, "req-ok");

    expect(client.send).toHaveBeenCalledOnce();
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "tmuxSessions",
      requestId: "req-ok",
      message: "",
      sessions: [
        expect.objectContaining({ distro: "Arch", session: "main" }),
        expect.objectContaining({ distro: "Ubuntu", session: "alpha" }),
        expect.objectContaining({ distro: "Ubuntu", session: "zeta" })
      ]
    }));
  });

  it("returns an actionable empty result when no distro has a running tmux server", () => {
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const client = fakeClient();
    vi.spyOn(childProcess, "execFile").mockImplementation((_file, args, _options, callback) => {
      if (args[0] === "--list") callback(null, "Ubuntu\n");
      else callback(new Error("no server"), "");
    });
    server.listWslTmuxSessions(client, "req-none");
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      sessions: [],
      message: expect.stringMatching(/start tmux/i)
    }));
  });

  it("dispatches listTmux bridge messages", () => {
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const client = fakeClient();
    server.handleClientMessage(client, JSON.stringify({ type: "listTmux", requestId: "dispatch1" }));
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ requestId: "dispatch1", type: "tmuxSessions" }));
  });
});

describe("tmux-backed terminal lifecycle", () => {
  it("creates a real wsl tmux client and includes its identity in summaries", () => {
    const terminal = makeTerminal();
    const spawn = vi.fn(() => terminal);
    server.__setPty({ spawn });
    const client = fakeClient();

    server.createSession(client, {
      id: "tmuxsess1",
      cols: 90,
      rows: 28,
      tmux: { distro: " Ubuntu ", session: " dev " },
      title: "Development"
    });

    expect(spawn).toHaveBeenCalledWith(
      "wsl.exe",
      ["--distribution", "Ubuntu", "--exec", "tmux", "attach-session", "-t", "dev"],
      expect.objectContaining({ cols: 90, rows: 28, useConpty: true })
    );
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: "created",
      shell: "wsl",
      tmux: { distro: "Ubuntu", session: "dev" }
    }));
    expect(server.toSessionSummary(server.sessions.get("tmuxsess1"))).toMatchObject({
      tmux: { distro: "Ubuntu", session: "dev" }
    });
  });

  it("rejects invalid tmux targets before spawning", () => {
    const spawn = vi.fn();
    server.__setPty({ spawn });
    const client = fakeClient();
    server.createSession(client, { id: "tmuxbad01", tmux: { distro: "Ubuntu", session: "bad\nname" } });
    expect(spawn).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({ type: "createFailed", message: expect.stringMatching(/invalid/i) }));
  });

  it("detaches a tmux client instead of sending shell exit", () => {
    const terminal = makeTerminal();
    const session = { terminal, tmux: { distro: "Ubuntu", session: "dev" }, exited: false, killed: false };
    server.endSessionInput(session);
    expect(terminal.write).toHaveBeenCalledWith("\u0002d");
  });

  it("force-closes only the tmux client during interrupt fallback", () => {
    const terminal = makeTerminal();
    const session = { terminal, tmux: { distro: "Ubuntu", session: "dev" }, exited: false, killed: false };
    server.interruptAndExit(session);
    expect(terminal.kill).toHaveBeenCalledOnce();
    expect(terminal.write).not.toHaveBeenCalledWith("exit\r");
  });

  it("keeps the ordinary shell interrupt-and-exit sequence unchanged", () => {
    const terminal = makeTerminal();
    const session = { terminal, tmux: null, exited: false, killed: false };
    server.interruptAndExit(session);
    expect(terminal.write.mock.calls).toEqual([["\u0003"], ["exit\r"]]);
    expect(terminal.kill).not.toHaveBeenCalled();
  });
});
