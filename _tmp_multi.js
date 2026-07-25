// Multi-pane routing test: 4 terminals, real OS click + real OS type into each,
// verify every marker lands in the pane that was clicked. Tests indexing/wrapping.
const { _electron: electron } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const PORT = String(3480 + Math.floor(Math.random() * 40));
const HOST = "127.0.0.1";
const CLICK_PS = path.join(__dirname, "_tmp_realclick.ps1");
const TYPE_PS = path.join(__dirname, "_tmp_realtype.ps1");
const realClick = (x, y) => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${CLICK_PS}" -X ${Math.round(x)} -Y ${Math.round(y)}`, { encoding: "utf8" }).trim();
const realType = (procId, text) => execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${TYPE_PS}" -ProcId ${procId} -Text "${text}"`, { encoding: "utf8" }).trim();

(async () => {
  const exe = path.join(__dirname, "node_modules", "electron", "dist", "electron.exe");
  const app = await electron.launch({ executablePath: exe, args: ["."], cwd: __dirname, env: { ...process.env, PORT, HOST } });
  const mainPid = app.process().pid;
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const win = await app.browserWindow(page);
  await win.evaluate((w) => { w.unmaximize(); w.setBounds({ x: 40, y: 40, width: 1520, height: 940 }); w.show(); w.focus(); });
  await page.waitForTimeout(700);

  const addBtn = await page.$("#addTerminal");
  const paneCount = () => page.$$eval(".terminal-pane", (e) => e.length);
  let guard = 0;
  while ((await paneCount()) < 4 && guard++ < 8) { await addBtn.click(); await page.waitForTimeout(400); }
  await page.waitForTimeout(1500);

  const scale = await page.evaluate(() => window.devicePixelRatio);
  const cb = await win.evaluate((w) => w.getContentBounds());
  // Report panes in DOM order with their on-screen position (to see wrapping).
  const g = await page.evaluate(() => [...document.querySelectorAll(".terminal-pane")].map((p, i) => {
    const b = p.querySelector(".xterm").getBoundingClientRect();
    return { domIndex: i, title: p.querySelector(".pane-title")?.value, x: Math.round(b.x), y: Math.round(b.y), cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
  }));
  console.log("PANES (DOM order):", JSON.stringify(g, null, 1));
  const toPhys = (cx, cy) => ({ px: (cb.x + cx) * scale, py: (cb.y + cy) * scale });
  const focusPane = () => page.evaluate(() => document.activeElement?.closest?.(".terminal-pane")?.querySelector(".pane-title")?.value ?? "(none)");

  const markers = ["ALPHA", "BRAVO", "CHARLIE", "DELTA"];
  for (let i = 0; i < g.length; i++) {
    const p = toPhys(g[i].cx, g[i].cy);
    realClick(p.px, p.py);
    await page.waitForTimeout(300);
    const fp = await focusPane();
    realType(mainPid, "echo " + markers[i]);
    await page.waitForTimeout(400);
    const ok = fp === g[i].title ? "focus-OK" : "FOCUS-MISMATCH";
    console.log(`click pane#${i} (${g[i].title}) -> focus=${fp} [${ok}] typed ${markers[i]}`);
  }

  await page.screenshot({ path: path.join(__dirname, "_tmp_multi.png") });
  console.log("Screenshot saved -> verify each marker is in its own pane.");
  await app.close();
})().catch((e) => { console.error("PROBE ERROR:", e); process.exit(1); });
