// Test whether input misroutes AFTER a renderer reload (session reattach/reconnect),
// which is what the user's long-lived session has been through many times.
const { _electron: electron } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const PORT = String(3900 + Math.floor(Math.random() * 90));
const HOST = "127.0.0.1";
const PS = path.join(__dirname, "_tmp_realclick.ps1");
const realClick = (x, y) => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${PS}" -X ${Math.round(x)} -Y ${Math.round(y)}`, { encoding: "utf8" }).trim();

(async () => {
  const exe = path.join(__dirname, "node_modules", "electron", "dist", "electron.exe");
  const app = await electron.launch({ executablePath: exe, args: ["."], cwd: __dirname, env: { ...process.env, PORT, HOST } });
  let page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const win = await app.browserWindow(page);
  await win.evaluate((w) => { w.unmaximize(); w.setBounds({ x: 80, y: 60, width: 1300, height: 860 }); w.show(); w.focus(); });
  await page.waitForTimeout(600);

  const addBtn = await page.$("#addTerminal");
  const paneCount = () => page.$$eval(".terminal-pane", (e) => e.length);
  let guard = 0;
  while ((await paneCount()) < 2 && guard++ < 5) { await addBtn.click(); await page.waitForTimeout(400); }
  await page.waitForTimeout(1200);

  const scale = await page.evaluate(() => window.devicePixelRatio);
  async function geom() {
    const cb = await win.evaluate((w) => w.getContentBounds());
    const g = await page.evaluate(() => [...document.querySelectorAll(".terminal-pane")].map((p) => {
      const b = p.querySelector(".xterm").getBoundingClientRect();
      return { title: p.querySelector(".pane-title")?.value, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
    }));
    return { cb, g };
  }
  const focusPane = () => page.evaluate(() => document.activeElement?.closest?.(".terminal-pane")?.querySelector(".pane-title")?.value ?? "(none)");

  // Mark each terminal so we can tell them apart after reload.
  let { cb, g } = await geom();
  const toPhys = (cx, cy) => ({ px: (cb.x + cx) * scale, py: (cb.y + cy) * scale });
  let p = toPhys(g[0].cx, g[0].cy); realClick(p.px, p.py); await page.waitForTimeout(250);
  await page.keyboard.type("echo MARK_ONE"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  p = toPhys(g[1].cx, g[1].cy); realClick(p.px, p.py); await page.waitForTimeout(250);
  await page.keyboard.type("echo MARK_TWO"); await page.keyboard.press("Enter"); await page.waitForTimeout(500);
  console.log("Before reload, panes:", JSON.stringify(g.map(x => x.title)));

  // RELOAD renderer -> sessions reattach / websocket reconnects.
  console.log("Reloading renderer (reattach)...");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await win.evaluate((w) => { w.setBounds({ x: 80, y: 60, width: 1300, height: 860 }); w.show(); w.focus(); });
  await page.waitForTimeout(1000);
  console.log("After reload paneCount:", await paneCount());

  ({ cb, g } = await geom());
  console.log("After reload panes:", JSON.stringify(g));
  if (g.length < 2) { console.log("panes not restored; abort"); await page.screenshot({ path: path.join(__dirname, "_tmp_reattach.png") }); await app.close(); return; }

  // Establish focus in T1, type; then click T2, type. Watch for misroute.
  p = toPhys(g[0].cx, g[0].cy); realClick(p.px, p.py); await page.waitForTimeout(250);
  console.log("focus after click T1:", await focusPane());
  await page.keyboard.type("echo AFTER_T1"); await page.waitForTimeout(300);

  p = toPhys(g[1].cx, g[1].cy); realClick(p.px, p.py); await page.waitForTimeout(250);
  console.log("focus after click T2:", await focusPane(), " expected:", g[1].title);
  await page.keyboard.type("echo AFTER_T2"); await page.waitForTimeout(600);

  await page.screenshot({ path: path.join(__dirname, "_tmp_reattach.png") });
  console.log("Screenshot saved -> inspect where AFTER_T2 landed.");
  await app.close();
})().catch((e) => { console.error("PROBE ERROR:", e); process.exit(1); });
