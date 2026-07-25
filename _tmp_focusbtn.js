// Repro per user: 5 terminals, click the FOCUS BUTTON (data-action="focus") on the
// 4th pane, then type. Uses a real OS click on the button + real OS keyboard, and
// drains the in-app diagnostic to see where focus/input actually go.
const { _electron: electron } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");
const PORT = String(3410 + Math.floor(Math.random() * 25));
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
  await page.waitForTimeout(1500);
  console.log("paneCount:", await paneCount(), "layout:", await page.evaluate(() => window.state?.settings?.layout ?? document.getElementById("layoutMode")?.value));

  const scale = await page.evaluate(() => window.devicePixelRatio);
  const cb = await win.evaluate((w) => w.getContentBounds());

  // Locate the FOCUS button on pane index 3 (the 4th terminal).
  const btn = await page.evaluate(() => {
    const pane = document.querySelectorAll(".terminal-pane")[3];
    const title = pane?.querySelector(".pane-title")?.value;
    const b = pane?.querySelector('[data-action="focus"]')?.getBoundingClientRect();
    return b ? { title, cx: b.x + b.width / 2, cy: b.y + b.height / 2 } : null;
  });
  console.log("4th pane focus-button:", JSON.stringify(btn));

  const focusInfo = () => page.evaluate(() => {
    const ae = document.activeElement;
    const pane = ae?.closest?.(".terminal-pane");
    return { pane: pane?.querySelector(".pane-title")?.value ?? "(none)", tag: ae?.tagName, cls: String(ae?.className||"").split(" ")[0], layout: window.state?.settings?.layout, activeId: window.state?.activeId?.slice?.(0,6) };
  });

  // Real click the focus button on the 4th pane.
  const px = (cb.x + btn.cx) * scale, py = (cb.y + btn.cy) * scale;
  console.log("\nreal click 4th pane FOCUS button ->", realClick(px, py));
  await page.waitForTimeout(800);
  console.log("focus AFTER clicking focus-button:", JSON.stringify(await focusInfo()), " EXPECTED active pane: PowerShell 4");

  // Now type — this is where the user says it misroutes.
  console.log("realType ->", realType(mainPid, "echo VIA_FOCUS_BTN"));
  await page.waitForTimeout(700);

  // Drain diagnostic.
  const dlog = await page.evaluate(() => { const l = window.__mtInputLog || []; window.__mtInputLog = []; return l; });
  console.log("\n__mtInputLog (per keystroke):");
  for (const e of dlog) {
    const div = e.firedForTitle !== e.focusTitle ? "  <<< DIVERGENCE" : "";
    console.log(`  key=${e.data} firedFor="${e.firedForTitle}" focus="${e.focusTitle}"[${e.focusTag}] activeId=${String(e.activeId||'').slice(0,6)} send=[${e.sendingTo.map(s=>String(s).slice(0,6)).join(",")}]${div}`);
  }

  // Which pane is displayed as the big/active one, and what does each show?
  const panesNow = await page.evaluate(() => [...document.querySelectorAll(".terminal-pane")].map((p, i) => {
    const b = p.getBoundingClientRect();
    return { i, title: p.querySelector(".pane-title")?.value, active: p.classList.contains("is-active"), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), visible: b.width > 5 && b.height > 5 };
  }));
  console.log("\nPANES NOW:", JSON.stringify(panesNow, null, 1));

  await page.screenshot({ path: path.join(__dirname, "_tmp_focusbtn.png") });
  console.log("Screenshot saved.");
  await app.close();
})().catch((e) => { console.error("PROBE ERROR:", e); process.exit(1); });
