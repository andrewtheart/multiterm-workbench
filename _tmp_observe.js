// Opens the instrumented MultiTerm in Electron and holds it open, continuously
// draining window.__mtInputLog so we can see, per keystroke, which terminal
// captured it vs which pane has DOM focus vs where it was routed.
// The USER will reproduce the misroute by hand in this window.
const { _electron: electron } = require("playwright");
const path = require("path");

const PORT = process.env.OBSERVE_PORT || "3181";
const HOST = "127.0.0.1";

(async () => {
  const exe = path.join(__dirname, "node_modules", "electron", "dist", "electron.exe");
  const app = await electron.launch({ executablePath: exe, args: ["."], cwd: __dirname, env: { ...process.env, PORT, HOST } });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const win = await app.browserWindow(page);
  await win.evaluate((w) => { w.maximize(); w.show(); w.focus(); });
  await page.waitForTimeout(1200);

  async function titles() {
    try { return await page.evaluate(() => [...document.querySelectorAll(".terminal-pane")].map((p, i) => `#${i}:${p.querySelector(".pane-title")?.value}`)); }
    catch { return ["(unavailable)"]; }
  }
  console.log("READY. Instrumented MultiTerm is open on port " + PORT + ".");
  console.log("Current panes:", JSON.stringify(await titles()));
  console.log("Reproduce the bug by hand now; every keystroke will be logged below.");
  console.log("Legend: firedFor = terminal whose onData fired (has xterm focus); focus = DOM-focused pane; send = ids input was routed to.");
  console.log("--------------------------------------------------------------------");

  let lastTitleDump = 0;
  setInterval(async () => {
    try {
      const entries = await page.evaluate(() => { const l = window.__mtInputLog || []; window.__mtInputLog = []; return l; });
      for (const e of entries) {
        const diverged = e.firedForTitle !== e.focusTitle;
        const line = `[${e.t}] key=${e.data} firedFor="${e.firedForTitle}"(${String(e.firedForId).slice(0,6)}) focus="${e.focusTitle}"[${e.focusTag}] activeId=${String(e.activeId||"").slice(0,6)} send=[${e.sendingTo.map(s=>String(s).slice(0,6)).join(",")}]`;
        console.log(line + (diverged ? "   <<<<< FIRED-vs-FOCUS DIVERGENCE" : ""));
      }
      const now = Date.now();
      if (now - lastTitleDump > 15000) { lastTitleDump = now; console.log("(panes:", JSON.stringify(await titles()) + ")"); }
    } catch (err) { /* mid-reload */ }
  }, 800);

  // Keep the process (and the window) alive until externally stopped.
  await new Promise(() => {});
})().catch((e) => { console.error("OBSERVER ERROR:", e); process.exit(1); });
