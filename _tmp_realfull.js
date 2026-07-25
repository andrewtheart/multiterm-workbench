// Fully-real repro: REAL OS mouse clicks AND REAL OS keyboard input.
// Playwright only launches, positions the window, and reads geometry/focus.
const { _electron: electron } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const PORT = String(3550 + Math.floor(Math.random() * 40));
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
  await win.evaluate((w) => { w.unmaximize(); w.setBounds({ x: 80, y: 60, width: 1300, height: 860 }); w.show(); w.focus(); });
  await page.waitForTimeout(700);

  const addBtn = await page.$("#addTerminal");
  const paneCount = () => page.$$eval(".terminal-pane", (e) => e.length);
  let guard = 0;
  while ((await paneCount()) < 2 && guard++ < 5) { await addBtn.click(); await page.waitForTimeout(400); }
  await page.waitForTimeout(1500);

  const scale = await page.evaluate(() => window.devicePixelRatio);
  const cb = await win.evaluate((w) => w.getContentBounds());
  const g = await page.evaluate(() => [...document.querySelectorAll(".terminal-pane")].map((p) => {
    const b = p.querySelector(".xterm").getBoundingClientRect();
    return { title: p.querySelector(".pane-title")?.value, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
  }));
  console.log("mainPid:", mainPid, "scale:", scale, "panes:", JSON.stringify(g.map(x => x.title)));
  const toPhys = (cx, cy) => ({ px: (cb.x + cx) * scale, py: (cb.y + cy) * scale });
  const focusPane = () => page.evaluate(() => document.activeElement?.closest?.(".terminal-pane")?.querySelector(".pane-title")?.value ?? "(none)");

  // Real click inside T1, real-type.
  let p = toPhys(g[0].cx, g[0].cy); realClick(p.px, p.py); await page.waitForTimeout(300);
  console.log("focus after real-click T1:", await focusPane());
  console.log("realType T1 ->", realType(mainPid, "echo REALONE")); await page.waitForTimeout(400);

  // Real click inside T2, real-type — the user's exact action, all-real input.
  p = toPhys(g[1].cx, g[1].cy); realClick(p.px, p.py); await page.waitForTimeout(300);
  console.log("focus after real-click T2:", await focusPane(), " expected:", g[1].title);
  console.log("realType T2 ->", realType(mainPid, "echo REALTWO")); await page.waitForTimeout(600);

  await page.screenshot({ path: path.join(__dirname, "_tmp_realfull.png") });
  console.log("Screenshot saved -> inspect where REALTWO landed.");
  await app.close();
})().catch((e) => { console.error("PROBE ERROR:", e); process.exit(1); });
