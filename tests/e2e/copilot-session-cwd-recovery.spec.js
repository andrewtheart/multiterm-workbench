const { test, expect } = require("../support/renderer-coverage");

test.describe("Copilot session working-directory recovery", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      if (window.__cwdRecoveryOriginalSend) state.socket.send = window.__cwdRecoveryOriginalSend;
      if (window.__cwdRecoveryOriginalSetTimeout) window.setTimeout = window.__cwdRecoveryOriginalSetTimeout;
      delete window.__cwdRecoveryOriginalSend;
      delete window.__cwdRecoveryOriginalSetTimeout;
      delete window.__cwdRecoveryTimeout;
      delete window.__cwdRecoveryTimeoutDelay;
      state.settings.copilotCwdQueryTimeoutSeconds = 180;
      closeCwdChange({ restoreResume: false });
      copilotResume.suspended = false;
      closeAllTerminals();
    });
  });

  test("privately asks an unavailable session and promotes that terminal on Send", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      if (!elements.assistantRestoreOverlay.hidden) closeAssistantRestoreDialog({ forget: false });
      closeAllTerminals();
      addTerminal({ reveal: true, runStartup: false });
    });
    await expect.poll(() => page.evaluate(() => [...state.terminals.values()][0]?.status)).toBe("live");
    const visibleBefore = await page.locator("#terminalHost .terminal-pane").count();

    await page.evaluate(() => {
      const recoveredPath = "D:\\recovered project";
      state.aiProviders = [{
        id: "copilot",
        available: true,
        interactiveAvailable: true,
        titleAvailable: true,
        cwdChangeAvailable: true,
        models: [{ id: "auto", name: "Auto", efforts: [] }]
      }];
      state.settings.aiSessionProvider = "copilot";
      copilotResume.newTerminal = true;
      copilotResume.provider = "copilot";
      window.__cwdRecoveryFrames = [];
      window.__cwdRecoveryOriginalSend = state.socket.send;
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        window.__cwdRecoveryFrames.push(frame);
        if (frame.type === "create" && String(frame.title || "").startsWith("CWD query")) {
          window.setTimeout(() => handleBridgeMessage({
            type: "created",
            id: frame.id,
            pid: 42420,
            cwd: "D:\\probe launch",
            startedAt: new Date().toISOString(),
            title: frame.title
          }), 0);
          return;
        }
        if (frame.type === "validateDirectory") {
          const valid = frame.path === recoveredPath;
          window.setTimeout(() => handleBridgeMessage({
            type: "directoryValidation",
            requestId: frame.requestId,
            kind: "host",
            valid,
            path: valid ? recoveredPath : "",
            error: valid ? "" : "That directory is unavailable."
          }), 0);
          return;
        }
        if (frame.type === "input" && String(frame.data || "").includes("--resume")) {
          window.setTimeout(() => {
            const terminal = state.terminals.get(frame.id);
            const token = terminal?.cwdSessionProbe?.token;
            if (!token) return;
            handleBridgeMessage({ type: "output", id: frame.id, data: `The prompt mentioned ${token}, but not its response delimiter.\r\n${token}::D:\\rec` });
            handleBridgeMessage({ type: "output", id: frame.id, data: `overed project::${token} ┃\r\n` });
          }, 0);
          return;
        }
        if (frame.type === "promoteSession") {
          window.setTimeout(() => handleBridgeMessage({
            type: "sessionPromoted",
            requestId: frame.requestId,
            id: frame.id,
            ok: true,
            reason: ""
          }), 0);
          return;
        }
        if (frame.type === "kill") return;
        window.__cwdRecoveryOriginalSend.call(this, payload);
      };

      openResumeCwdChange({
        id: "62d43a25-c209-4933-af9a-24d9bff3789c",
        key: "cli:62d43a25-c209-4933-af9a-24d9bff3789c",
        source: "cli",
        name: "Unavailable project session",
        cwd: "Z:\\missing saved project"
      });
    });

    await expect(page.locator("#cwdChangeOverlay")).toBeVisible();
    await expect(page.locator("#cwdChangeAskSession")).toBeVisible();
    await expect(page.locator("#cwdChangeInput")).toHaveValue("D:\\recovered project");
    await expect(page.locator("#cwdChangeStatus")).toHaveAttribute("data-tone", "ready");
    await expect(page.locator("#cwdChangeSend")).toBeEnabled();
    await expect(page.locator("#terminalHost .terminal-pane")).toHaveCount(visibleBefore);
    await expect(page.locator("#transientTerminalHost .terminal-pane")).toHaveCount(1);

    const hiddenState = await page.evaluate(() => {
      saveSessionSnapshot();
      return {
        artifactIds: liveArtifactTerminals().map((terminal) => terminal.id),
        automationIds: automationLiveTerminals().map((terminal) => terminal.id),
        broadcastIds: broadcastTargetIds(),
        groupedIds: buildTerminalGroupCatalog().terminals.map((terminal) => terminal.id),
        messageIds: liveMessageTerminals().map((terminal) => terminal.id),
        probeId: cwdChange.queryTerminalId,
        quickSwitchIds: quickSwitchCandidates("").map((row) => row.id),
        recoveryIds: assistantSessionRows().map((row) => row.id),
        snapshotIds: JSON.parse(localStorage.getItem("multiterm.lastSession") || "[]").map((row) => row.id),
        status: elements.statusSessions.textContent
      };
    });
    expect(hiddenState.quickSwitchIds).not.toContain(hiddenState.probeId);
    expect(hiddenState.snapshotIds).not.toContain(hiddenState.probeId);
    expect(hiddenState.artifactIds).not.toContain(hiddenState.probeId);
    expect(hiddenState.automationIds).not.toContain(hiddenState.probeId);
    expect(hiddenState.broadcastIds).not.toContain(hiddenState.probeId);
    expect(hiddenState.groupedIds).not.toContain(hiddenState.probeId);
    expect(hiddenState.messageIds).not.toContain(hiddenState.probeId);
    expect(hiddenState.recoveryIds).not.toContain(hiddenState.probeId);
    expect(hiddenState.status).toBe(`${visibleBefore} ${visibleBefore === 1 ? "session" : "sessions"}`);

    await page.setViewportSize({ width: 390, height: 844 });
    const compact = await page.evaluate(() => {
      const dialog = elements.cwdChangeOverlay.querySelector(".cwd-change").getBoundingClientRect();
      const button = elements.cwdChangeAskSession;
      return {
        dialogLeft: dialog.left,
        dialogRight: dialog.right,
        buttonFits: button.scrollWidth <= button.clientWidth
      };
    });
    expect(compact.dialogLeft).toBeGreaterThanOrEqual(0);
    expect(compact.dialogRight).toBeLessThanOrEqual(390);
    expect(compact.buttonFits).toBe(true);

    await page.locator("#cwdChangeSend").click();
    await expect(page.locator("#cwdChangeOverlay")).toBeHidden();
    await expect(page.locator("#transientTerminalHost .terminal-pane")).toHaveCount(0);
    await expect(page.locator("#terminalHost .terminal-pane")).toHaveCount(visibleBefore + 1);
    const promoted = await page.evaluate((probeId) => {
      const terminal = state.terminals.get(probeId);
      return {
        activeId: state.activeId,
        queryWasToolFree: window.__cwdRecoveryFrames.some((frame) => frame.type === "input"
          && String(frame.data || "").includes("--resume")
          && String(frame.data || "").includes("--available-tools=")),
        pendingCwdChange: terminal?.pendingCwdChange,
        transient: terminal?.transient,
        resumeCommands: window.__cwdRecoveryFrames.filter((frame) => frame.type === "input" && String(frame.data || "").includes("--resume")).length
      };
    }, hiddenState.probeId);
    expect(promoted).toEqual({
      activeId: hiddenState.probeId,
      queryWasToolFree: true,
      pendingCwdChange: { path: "D:\\recovered project", provider: "copilot" },
      transient: false,
      resumeCommands: 1
    });

    await page.evaluate(() => {
      openResumeCwdChange({
        id: "0298ec3b-6599-4e8d-a620-c1338f9bb47b",
        key: "cli:0298ec3b-6599-4e8d-a620-c1338f9bb47b",
        source: "cli",
        name: "Cancelled query",
        cwd: ""
      });
    });
    await expect(page.locator("#transientTerminalHost .terminal-pane")).toHaveCount(1);
    const cancelProbeId = await page.evaluate(() => cwdChange.queryTerminalId);
    await page.locator("#cwdChangeCancel").click();
    await expect(page.locator("#transientTerminalHost .terminal-pane")).toHaveCount(0);
    expect(await page.evaluate((id) => window.__cwdRecoveryFrames.some((frame) => frame.type === "kill" && frame.id === id), cancelProbeId)).toBe(true);
  });

  test("keeps an ephemeral probe out of reconnects and closes it with its renderer", async ({ page }) => {
    const owner = await page.context().newPage();
    await owner.goto("http://127.0.0.1:3199/");
    await expect(owner.locator("#statusConn")).toHaveText("Connected");
    await owner.evaluate(() => closeAllTerminals());
    const probeId = await owner.evaluate(() => addTerminal({
      transient: true,
      runStartup: false,
      shell: "pwsh",
      title: "Ephemeral lifecycle probe"
    }).id);
    await expect.poll(() => owner.evaluate((id) => state.terminals.get(id)?.status, probeId), { timeout: 30000 }).toBe("live");
    await expect.poll(() => owner.evaluate(() => fetch("/health").then((response) => response.json()).then((health) => health.sessions))).toBe(0);

    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    expect(await page.evaluate((id) => state.terminals.has(id), probeId)).toBe(false);
    await expect.poll(() => page.evaluate(() => userTerminals().filter((terminal) => terminal.status === "live").length), {
      timeout: 30000
    }).toBe(1);
    await expect.poll(() => page.evaluate(() => fetch("/health").then((response) => response.json()).then((health) => health.sessions))).toBe(1);
    const deniedStatistics = await page.evaluate((id) => requestBridge({ type: "statistics", id }, { timeout: 10000 }), probeId);
    expect(deniedStatistics.sessions).toEqual([]);
    await page.evaluate((id) => {
      sendBridge({ type: "title", id, title: "Cross-client rename" });
      sendBridge({ type: "input", id, data: "Write-Output 'CROSS_CLIENT_INJECTION'\r" });
      sendBridge({ type: "kill", id });
    }, probeId);
    await expect.poll(() => owner.evaluate((id) => ({
      status: state.terminals.get(id)?.status,
      title: state.terminals.get(id)?.titleInput.value
    }), probeId)).toEqual({ status: "live", title: "Ephemeral lifecycle probe" });

    await owner.close();
    await expect.poll(() => page.evaluate(() => fetch("/health").then((response) => response.json()).then((health) => health.sessions)), {
      timeout: 15000
    }).toBe(1);
  });

  test("promotes the bridge session before revealing it and preserves it across reload", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => closeAllTerminals());
    const probeId = await page.evaluate(() => addTerminal({
      transient: true,
      runStartup: false,
      shell: "pwsh",
      title: "Durable promoted probe"
    }).id);
    await expect.poll(() => page.evaluate((id) => state.terminals.get(id)?.status, probeId), { timeout: 30000 }).toBe("live");

    await page.evaluate((id) => sendBridge({ type: "promoteSession", id, requestId: "dropped-promotion-ack" }), probeId);
    await expect.poll(() => page.evaluate(() => fetch("/health").then((response) => response.json()).then((health) => health.sessions))).toBe(1);
    const retried = await page.evaluate((id) => requestBridge({ type: "promoteSession", id }, { timeout: 10000 }), probeId);
    expect(retried).toMatchObject({ ok: true, id: probeId });
    expect(await page.evaluate((id) => state.terminals.get(id)?.transient, probeId)).toBe(true);

    await page.evaluate(() => {
      window.__promotionOldSocket = state.socket;
      state.socket.close();
    });
    await expect.poll(() => page.evaluate(() => state.socketReady && state.socket !== window.__promotionOldSocket), {
      timeout: 30000
    }).toBe(true);
    await expect.poll(() => page.evaluate((id) => state.terminals.get(id)?.transient, probeId)).toBe(false);
    await expect(page.locator(`#terminalHost .terminal-pane[data-id="${probeId}"]`)).toBeVisible();

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect.poll(() => page.evaluate((id) => ({
      exists: state.terminals.has(id),
      status: state.terminals.get(id)?.status,
      transient: state.terminals.get(id)?.transient
    }), probeId), { timeout: 30000 }).toEqual({ exists: true, status: "live", transient: false });
    await page.evaluate(() => closeAllTerminals());
  });

  test("disables stale Send state and times out a malformed response", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      if (!elements.assistantRestoreOverlay.hidden) closeAssistantRestoreDialog({ forget: false });
      closeAllTerminals();
      addTerminal({ reveal: true, runStartup: false });
    });
    await expect.poll(() => page.evaluate(() => userTerminals()[0]?.status)).toBe("live");

    await page.evaluate(() => {
      const savedPath = "D:\\known project";
      state.aiProviders = [{
        id: "copilot",
        available: true,
        interactiveAvailable: true,
        cwdChangeAvailable: true,
        models: [{ id: "auto", name: "Auto", efforts: [] }]
      }];
      state.settings.aiSessionProvider = "copilot";
      state.settings.copilotCwdQueryTimeoutSeconds = 30;
      copilotResume.newTerminal = true;
      copilotResume.provider = "copilot";
      window.__cwdRecoveryOriginalSend = state.socket.send;
      window.__cwdRecoveryOriginalSetTimeout = window.setTimeout;
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 30000) {
          window.__cwdRecoveryTimeout = callback;
          window.__cwdRecoveryTimeoutDelay = delay;
          return 987654;
        }
        return window.__cwdRecoveryOriginalSetTimeout(callback, delay, ...args);
      };
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        if (frame.type === "validateDirectory") {
          window.__cwdRecoveryOriginalSetTimeout(() => handleBridgeMessage({
            type: "directoryValidation",
            requestId: frame.requestId,
            kind: "host",
            valid: frame.path === savedPath,
            path: frame.path === savedPath ? savedPath : "",
            error: frame.path === savedPath ? "" : "Unavailable"
          }), 0);
          return;
        }
        if (frame.type === "create" && String(frame.title || "").startsWith("CWD query")) {
          window.__cwdRecoveryOriginalSetTimeout(() => handleBridgeMessage({
            type: "created",
            id: frame.id,
            pid: 42421,
            cwd: "D:\\probe launch",
            startedAt: new Date().toISOString(),
            title: frame.title
          }), 0);
          return;
        }
        if (frame.type === "input" && String(frame.data || "").includes("--resume")) {
          window.__cwdRecoveryOriginalSetTimeout(() => {
            const terminal = state.terminals.get(frame.id);
            const token = terminal?.cwdSessionProbe?.token;
            if (token) handleBridgeMessage({
              type: "output",
              id: frame.id,
              data: `This is not an exact response line: ${token}::D:\\wrong::${token}\r\n`
            });
          }, 0);
          return;
        }
        if (frame.type === "kill") return;
        window.__cwdRecoveryOriginalSend.call(this, payload);
      };
      openResumeCwdChange({
        id: "70ea177d-5558-40c4-b068-2477e84b9325",
        key: "cli:70ea177d-5558-40c4-b068-2477e84b9325",
        source: "cli",
        name: "Timeout session",
        cwd: savedPath
      });
    });

    await expect(page.locator("#cwdChangeSend")).toBeEnabled();
    await page.locator("#cwdChangeAskSession").click();
    await expect(page.locator("#cwdChangeSend")).toBeDisabled();
    await expect(page.locator("#cwdChangeAskSession")).toBeDisabled();
    expect(await page.evaluate(() => window.__cwdRecoveryTimeoutDelay)).toBe(30000);
    expect(await page.evaluate(() => cwdChange.queryReportedPath)).toBe("");

    await page.evaluate(() => window.__cwdRecoveryTimeout());
    await expect(page.locator("#cwdChangeStatus")).toContainText("within 30 seconds");
    await expect(page.locator("#cwdChangeAskSession")).toBeEnabled();
    await expect(page.locator("#cwdChangeAskSession")).toContainText("Ask again");
    await expect(page.locator("#transientTerminalHost .terminal-pane")).toHaveCount(0);
  });
});