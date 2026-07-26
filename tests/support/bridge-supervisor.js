"use strict";

// Test webServer supervisor.
//
// Playwright launches the bridge once and never restarts it. On Windows the
// node-pty ConPTY path can abort the whole process natively — an uncatchable,
// in-process failure. Without supervision that leaves the socket permanently
// refused and every later test fails.
//
// The known cause was a use-after-free: node-pty frees the native ConPTY inside
// kill() but reports the exit asynchronously, so any write/resize/clear/kill
// issued in that gap crashed the bridge (0xC0000005 / 0xC0000374). server.js now
// marks sessions dead synchronously via killSessionPty(), which closes that
// window. This wrapper stays as defence in depth against any remaining native
// aborts: it forwards stdio, respawns the bridge if it exits unexpectedly, and
// tears the child down cleanly when Playwright stops the webServer. It mirrors
// the production restart behaviour in main.js so the client's auto-reconnect can
// actually recover.
//
// Note: "AttachConsole failed" stack traces in the test output come from
// node-pty's forked conpty_console_list_agent helper. They are noisy but
// harmless — that is a separate short-lived child process, not the bridge.

const childProcess = require("node:child_process");
const path = require("node:path");

const serverPath = path.join(__dirname, "..", "..", "server.js");
const cwd = path.join(__dirname, "..", "..");

let child = null;
let shuttingDown = false;

// Crash-loop guard: if the bridge dies almost immediately many times in a row,
// stop retrying so the tests fail loudly instead of hanging on a broken build.
let rapidFailures = 0;
const RAPID_FAILURE_WINDOW_MS = 1500;
const MAX_RAPID_FAILURES = 8;
const RESTART_DELAY_MS = 250;

function spawnBridge() {
  const startedAt = Date.now();
  child = childProcess.spawn(process.execPath, [serverPath], {
    cwd,
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"]
  });

  child.on("exit", (code, signal) => {
    child = null;
    if (shuttingDown) return;

    const ranFor = Date.now() - startedAt;
    if (ranFor < RAPID_FAILURE_WINDOW_MS) {
      rapidFailures += 1;
    } else {
      rapidFailures = 0;
    }

    if (rapidFailures > MAX_RAPID_FAILURES) {
      console.error(
        `[supervisor] bridge crashed ${rapidFailures} times in a row; giving up (last code=${code} signal=${signal}).`
      );
      process.exit(1);
      return;
    }

    console.error(
      `[supervisor] bridge exited (code=${code} signal=${signal}); restarting in ${RESTART_DELAY_MS}ms.`
    );
    setTimeout(spawnBridge, RESTART_DELAY_MS);
  });

  child.on("error", (err) => {
    console.error("[supervisor] failed to spawn bridge:", err && err.message ? err.message : err);
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (child && !child.killed) {
    child.kill();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => {
  if (child && !child.killed) child.kill();
});

spawnBridge();
