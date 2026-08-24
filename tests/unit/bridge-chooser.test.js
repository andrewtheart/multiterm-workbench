/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const scriptUrl = pathToFileURL(path.join(__dirname, "..", "..", "public", "bridge-chooser.js")).href;

async function loadChooser() {
  let deliver = null;
  const complete = vi.fn();
  const createIcons = vi.fn();
  const dom = new JSDOM(`<!doctype html><html><body>
    <p id="chooserSummary"></p>
    <div id="bridgeList"></div>
    <div id="emptyState" hidden></div>
    <section id="bridgeChoiceWarning" hidden>
      <h2 id="bridgeChoiceWarningTitle"></h2>
      <p id="bridgeChoiceWarningText"></p>
    </section>
    <input id="rememberChoice" type="checkbox">
    <button id="connectBridge"><span>Connect</span></button>
    <button id="newBridge">New</button>
    <button id="cancelChooser">Cancel</button>
    <button id="closeChooser">Close</button>
    <script src="${scriptUrl}"></script>
  </body></html>`, {
    beforeParse(window) {
      window.bridgeChooser = {
        complete,
        onData(callback) { deliver = callback; }
      };
      window.lucide = { createIcons };
      window.requestAnimationFrame = (callback) => callback();
    },
    pretendToBeVisual: true,
    resources: "usable",
    runScripts: "dangerously",
    url: "https://multiterm.local/bridge-chooser.html"
  });
  await new Promise((resolve, reject) => {
    dom.window.addEventListener("load", resolve, { once: true });
    dom.window.addEventListener("error", reject, { once: true });
  });
  return { complete, createIcons, deliver, dom };
}

function bridge(overrides = {}) {
  return {
    bridgeId: "BRIDGE-001",
    bridgeType: "installed",
    port: 3199,
    rendererClients: 0,
    sessions: 1,
    startedAt: "2026-08-16T12:30:00.000Z",
    ...overrides
  };
}

describe("bridge chooser", () => {
  it("renders running bridges and confirms sharing an occupied bridge", async () => {
    const { complete, createIcons, deliver, dom } = await loadChooser();
    const { document, Event } = dom.window;
    deliver([
      bridge({ bridgeId: "BRIDGE-001", rendererClients: 0, sessions: 1 }),
      bridge({
        bridgeId: "BRIDGE-002",
        bridgeType: "electron",
        rendererClients: 2,
        sessions: 3,
        startedAt: "invalid"
      })
    ]);

    expect(document.querySelectorAll(".bridge-option")).toHaveLength(2);
    expect(document.getElementById("chooserSummary").textContent).toContain("2 running bridges are available");
    expect(document.querySelector(".bridge-badge").textContent).toBe("Installed");
    expect(document.getElementById("bridgeList").textContent).toContain("Start time unavailable");
    expect(createIcons).toHaveBeenCalled();

    const second = document.querySelectorAll('input[name="bridge"]')[1];
    second.checked = true;
    second.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("rememberChoice").checked = true;
    document.getElementById("connectBridge").click();
    expect(document.getElementById("bridgeChoiceWarning").hidden).toBe(false);
    expect(document.getElementById("bridgeChoiceWarningTitle").textContent).toContain("2 frontends");
    expect(complete).not.toHaveBeenCalled();

    document.getElementById("connectBridge").click();
    expect(complete).toHaveBeenCalledWith({ action: "connect", index: 1, remember: true });
    document.getElementById("connectBridge").click();
    expect(complete).toHaveBeenCalledOnce();
    dom.window.close();
  });

  it("supports empty results, starting a bridge, and cancelling with Escape", async () => {
    const first = await loadChooser();
    first.deliver(null);
    expect(first.dom.window.document.getElementById("bridgeList").hidden).toBe(true);
    expect(first.dom.window.document.getElementById("emptyState").hidden).toBe(false);
    expect(first.dom.window.document.getElementById("connectBridge").disabled).toBe(true);
    first.dom.window.document.getElementById("connectBridge")
      .dispatchEvent(new first.dom.window.Event("click", { bubbles: true }));
    expect(first.complete).not.toHaveBeenCalled();
    first.dom.window.document.getElementById("newBridge").click();
    expect(first.complete).toHaveBeenCalledWith({ action: "new", index: -1, remember: false });
    first.dom.window.close();

    const second = await loadChooser();
    second.deliver([bridge({ rendererClients: 1, sessions: 1 })]);
    second.dom.window.document.getElementById("connectBridge").click();
    expect(second.dom.window.document.getElementById("bridgeChoiceWarningTitle").textContent).toContain("a frontend");
    expect(second.dom.window.document.getElementById("bridgeChoiceWarningText").textContent).toContain("1 terminal session.");
    second.dom.window.document.dispatchEvent(new second.dom.window.KeyboardEvent("keydown", { key: "Space", bubbles: true }));
    second.dom.window.document.dispatchEvent(new second.dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(second.complete).toHaveBeenCalledWith({ action: "cancel", index: 0, remember: false });
    second.dom.window.document.getElementById("cancelChooser").click();
    second.dom.window.document.getElementById("closeChooser").click();
    second.dom.window.close();
  });

  it("connects an unoccupied bridge by double-click or keyboard", async () => {
    const first = await loadChooser();
    first.deliver([bridge({ rendererClients: 0, sessions: 0, startedAt: "" })]);
    first.dom.window.document.querySelector(".bridge-option")
      .dispatchEvent(new first.dom.window.MouseEvent("dblclick", { bubbles: true }));
    expect(first.complete).toHaveBeenCalledWith({ action: "connect", index: 0, remember: false });
    first.dom.window.close();

    const second = await loadChooser();
    second.deliver([bridge({ bridgeType: "electron", rendererClients: 0, sessions: 2 })]);
    const radio = second.dom.window.document.querySelector('input[name="bridge"]');
    radio.dispatchEvent(new second.dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(second.complete).toHaveBeenCalledWith({ action: "connect", index: 0, remember: false });
    second.dom.window.close();
  });
});
