const { test, expect } = require("../support/renderer-coverage");

// "Could not validate that directory." was shown whenever the bridge simply did
// not answer -- including when the socket was down -- which sends people off
// checking a folder that was never the problem.
test.describe("Change working directory diagnostics", () => {
  // Every spec shares one bridge, so whatever pane happened to be active could
  // already be exiting by the time validation runs -- which surfaces as "The
  // selected terminal is no longer available" rather than a directory verdict.
  // Own the terminal instead of borrowing state.activeId.
  const openDialog = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      closeAllTerminals();
      addTerminal({ reveal: true });
    });
    // The dialog refuses a terminal that is missing or already exited, so wait
    // for the bridge to actually bring this one up before opening it.
    await expect.poll(() => page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      return terminal ? terminal.status : "none";
    }), { timeout: 30000 }).toBe("live");
    await page.evaluate(() => openCwdChange([...state.terminals.keys()][0]));
    await expect(page.locator("#cwdChangeOverlay")).toBeVisible();
  };

  test("validates a real directory against the live bridge", async ({ page }) => {
    await openDialog(page);
    await page.locator("#cwdChangeInput").fill("D:\\multiTerm");
    await expect(page.locator("#cwdChangeStatus")).toHaveAttribute("data-tone", "ready");
    await expect(page.locator("#cwdChangeSend")).toBeEnabled();

    await page.locator("#cwdChangeInput").fill("D:\\definitely-not-here-xyz");
    await expect(page.locator("#cwdChangeStatus")).toContainText("does not exist");
    await expect(page.locator("#cwdChangeSend")).toBeDisabled();
    await page.evaluate(() => closeCwdChange());
  });

  test("blames the bridge, not the folder, when the socket is down", async ({ page }) => {
    await openDialog(page);
    await page.evaluate(() => {
      window.__realSend = state.socket.send.bind(state.socket);
      state.socketReady = false;
    });
    await page.locator("#cwdChangeInput").fill("D:\\multiTerm");
    await expect(page.locator("#cwdChangeStatus")).toContainText("not connected to its bridge");
    await expect(page.locator("#cwdChangeStatus")).not.toContainText("Could not validate");
    await expect(page.locator("#cwdChangeSend")).toBeDisabled();
    await page.evaluate(() => { state.socketReady = true; });
    await page.evaluate(() => closeCwdChange());
  });

  test("says the bridge went quiet when a reply never arrives", async ({ page }) => {
    await openDialog(page);
    // Socket still "ready", but the bridge swallows the request.
    await page.evaluate(() => {
      const send = state.socket.send.bind(state.socket);
      state.socket.send = function (payload) {
        const frame = JSON.parse(payload);
        if (frame.type === "validateDirectory") return undefined;
        return send(payload);
      };
      cwdChange.silenceProbe = true;
    });
    await page.locator("#cwdChangeInput").fill("D:\\multiTerm");
    await expect(page.locator("#cwdChangeStatus")).toContainText("did not answer", { timeout: 30000 });
    await expect(page.locator("#cwdChangeSend")).toBeDisabled();
    await page.evaluate(() => closeCwdChange());
  });
});
