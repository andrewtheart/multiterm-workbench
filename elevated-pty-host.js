"use strict";

// Elevated PTY helper for MultiTerm's in-app administrator terminals.
//
// A UAC-elevated shell runs at HIGH integrity, which the (medium-integrity) MultiTerm
// bridge cannot attach a ConPTY pseudo-console across. So this helper is launched elevated
// via UAC, owns the elevated shell's pseudo-console on the high side of the integrity
// boundary, and streams the terminal back to the bridge over a loopback channel.
//
// Security model (the whole point of this file):
//   * The bridge guards the channel with a one-time token, which we present on connect.
//   * BEFORE we spawn or feed any input to the elevated shell, we independently verify (by
//     PID) that the loopback listener we connected to is owned by the exact bridge process
//     that launched us, and that it is really our bridge (node running server.js). Because
//     we run at higher integrity than the bridge, we can fully inspect it. This is what
//     prevents a lower-integrity impostor from driving the elevated session: even if such a
//     process learned the token, it cannot masquerade as the bridge's PID.

const net = require("node:net");
const childProcess = require("node:child_process");

// Decode the base64-encoded JSON config the bridge passed as our sole argument.
function decodeConfig(encoded) {
  return JSON.parse(Buffer.from(String(encoded), "base64").toString("utf8"));
}

function encodeData(text) {
  return Buffer.from(String(text), "utf8").toString("base64");
}

function decodeData(text) {
  return Buffer.from(String(text), "base64").toString("utf8");
}

// STRONG escalation gate. Confirm the listener on config.port is owned by config.bridgePid
// and that the process is our bridge. The bridge binds the port BEFORE launching us, so the
// listener's owner is deterministically the real bridge; a lower-integrity process cannot
// have that PID nor pre-empt the already-bound port.
function verifyBridge(config, execFileSync) {
  try {
    const script =
      "$ErrorActionPreference='Stop';" +
      `$c = Get-NetTCPConnection -State Listen -LocalPort ${Number(config.port)} | Select-Object -First 1;` +
      "$p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$c.OwningProcess);" +
      "[pscustomobject]@{ Pid = [int]$c.OwningProcess; Cmd = [string]$p.CommandLine } | ConvertTo-Json -Compress";
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout: 8000 }
    ).toString();
    const info = JSON.parse(out);
    return Number(info.Pid) === Number(config.bridgePid) && /server\.js/i.test(String(info.Cmd || ""));
  } catch {
    return false;
  }
}

// Connect to the (verified) bridge and relay the elevated shell. Returns the socket so the
// caller/tests can observe it.
function run(config, deps) {
  if (!verifyBridge(config, deps.execFileSync)) {
    deps.log("bridge verification failed; refusing to launch an elevated shell");
    deps.exit(1);
    return null;
  }

  const socket = deps.net.connect(config.port, "127.0.0.1");
  let terminal = null;
  let buffer = "";

  const send = (payload) => {
    try { socket.write(JSON.stringify(payload) + "\n"); } catch { /* socket gone */ }
  };

  const startTerminal = () => {
    terminal = deps.spawnPty(config);
    send({ type: "started", pid: terminal.pid });
    terminal.onData((data) => send({ type: "output", data: encodeData(data) }));
    terminal.onExit((event) => {
      send({ type: "exit", code: event && Number.isFinite(event.exitCode) ? event.exitCode : null });
      try { socket.end(); } catch { /* already closing */ }
      deps.exit(0);
    });
  };

  const handleLine = (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    if (msg.type === "ready" && !terminal) {
      startTerminal();
    } else if (msg.type === "input" && terminal) {
      terminal.write(decodeData(msg.data));
    } else if (msg.type === "resize" && terminal) {
      try { terminal.resize(Number(msg.cols) || 80, Number(msg.rows) || 24); } catch { /* pty closed */ }
    } else if (msg.type === "kill" && terminal) {
      try { terminal.kill(); } catch { /* already dead */ }
    }
  };

  socket.on("connect", () => send({ type: "auth", token: config.token }));

  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line) handleLine(line);
    }
  });

  socket.on("close", () => {
    if (terminal) {
      try { terminal.kill(); } catch { /* already dead */ }
    }
    deps.exit(0);
  });
  // 'error' is always followed by 'close', which performs teardown.
  socket.on("error", () => {});

  return socket;
}

// Real dependencies. node-pty and process side effects are injectable so the relay logic in
// run() can be unit-tested without spawning real elevated shells.
function createRealDeps(overrides = {}) {
  const ptyLib = overrides.pty || require("@homebridge/node-pty-prebuilt-multiarch");
  const proc = overrides.process || process;
  const cp = overrides.childProcess || childProcess;
  return {
    net: overrides.net || net,
    execFileSync: cp.execFileSync,
    spawnPty: (config) => ptyLib.spawn(config.shellFile, config.shellArgs, {
      cols: Number(config.cols) || 120,
      rows: Number(config.rows) || 30,
      cwd: config.cwd,
      name: "xterm-256color",
      env: { ...proc.env, COLORTERM: proc.env.COLORTERM || "truecolor", TERM: proc.env.TERM || "xterm-256color" },
      useConpty: true
    }),
    log: (message) => proc.stderr.write(`[elevated-pty-host] ${message}\n`),
    exit: (code) => proc.exit(code)
  };
}

function main(argv, deps) {
  run(decodeConfig(argv[2]), deps);
}

/* v8 ignore next 3 -- only executes when elevated-pty-host.js is the process entry point */
if (require.main === module) {
  main(process.argv, createRealDeps());
}

module.exports = { run, verifyBridge, decodeConfig, encodeData, decodeData, createRealDeps, main };
