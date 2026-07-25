// Repro per user hint: add 5 terminals, focus the 4th, type — check routing.
// Uses real OS mouse + real OS keyboard; drains the in-app diagnostic log.
const { _electron: electron } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const PORT = String(3440 + Math.floor(Math.random() * 30));
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
  await win.evaluate((w) => { w.maximize(); w.show(); w.focus(); });
  await page.waitForTimeout(1000);

  const addBtn = await page.$("#addTerminal");
  const paneCount = () => page.$$eval(".terminal-pane", (e) => e.length);
  let guard = 0;
  while ((await paneCount()) < 5 && guard++ < 10) { await addBtn.click(); await page.waitForTimeout(450); }
  await page.waitForTimeout(1800);
  console.log("paneCount:", await paneCount());

  const scale = await page.evaluate(() => window.devicePixelRatio);

  // Scroll the 4th pane (DOM index 3) into view and report geometry of all panes.
  await page.evaluate(() => { const ps = document.querySelectorAll(".terminal-pane"); ps[3]?.scrollIntoView({ block: "center", inline: "center" }); });
  await page.waitForTimeout(600);
  const cb = await win.evaluate((w) => w.getContentBounds());
  const g = await page.evaluate(() => {
    const host = document.querySelector(".terminal-host");
    return {
      hostScroll: host ? { top: host.scrollTop, height: host.clientHeight, scrollH: host.scrollHeight } : null,
      panes: [...document.querySelectorAll(".terminal-pane")].map((p, i) => {
        const b = p.querySelector(".xterm").getBoundingClientRect();
        return { i, title: p.querySelector(".pane-title")?.value, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), cx: b.x + b.width / 2, cy: b.y + b.height / 2, onscreen: b.y >= 0 && b.y < 1050 };
      }),
    };
  });
  console.log("GEOM:", JSON.stringify(g, null, 1));

  const target = g.panes[3];
  console.log("\nTarget = 4th pane:", JSON.stringify(target));

  // Confirm what is actually at that point (CSS coords) before clicking.
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const pane = el?.closest?.(".terminal-pane");
    return { tag: el?.tagName, cls: String(el?.className || "").slice(0, 40), inXterm: !!el?.closest?.(".xterm"), paneTitle: pane?.querySelector(".pane-title")?.value ?? "(none)" };
  }, { x: target.cx, y: target.cy });
  console.log("hit-test at 4th center:", JSON.stringify(hit));

  const focusInfo = () => page.evaluate(() => {
    const ae = document.activeElement;
    return { pane: ae?.closest?.(".terminal-pane")?.querySelector(".pane-title")?.value ?? "(none)", tag: ae?.tagName, cls: String(ae?.className||"").split(" ")[0], activeId: window.__lastActive };
  });

  // Real click the 4th pane center.
  const px = (cb.x + target.cx) * scale, py = (cb.y + target.cy) * scale;
  console.log("\nreal click 4th ->", realClick(px, py));
  await page.waitForTimeout(400);
  console.log("focus after clicking 4th:", JSON.stringify(await focusInfo()), " EXPECTED:", target.title);

  // Real type a distinctive marker.
  console.log("realType ->", realType(mainPid, "echo FOURTH_PANE"));
  await page.waitForTimeout(700);

  // Drain the in-app diagnostic log.
  const dlog = await page.evaluate(() => { const l = window.__mtInputLog || []; window.__mtInputLog = []; return l; });
  console.log("\n__mtInputLog (per keystroke):");
  for (const e of dlog) {
    const div = e.firedForTitle !== e.focusTitle ? "  <<< DIVERGENCE" : "";
    console.log(`  key=${e.data} firedFor="${e.firedForTitle}" focus="${e.focusTitle}"[${e.focusTag}] activeId=${String(e.activeId||'').slice(0,6)} send=[${e.sendingTo.map(s=>String(s).slice(0,6)).join(",")}]${div}`);
  }

  await page.screenshot({ path: path.join(__dirname, "_tmp_five.png"), fullPage: false });
  console.log("\nScreenshot saved -> inspect where FOURTH_PANE landed.");
  await app.close();
})().catch((e) => { console.error("PROBE ERROR:", e); process.exit(1); });
