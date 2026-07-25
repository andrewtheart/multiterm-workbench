// Reproduce the focus bug with REAL Windows mouse input (SetCursorPos + mouse_event),
// clicking dead-center INSIDE terminal 2's xterm surface, at the real DPI.
// Playwright is used ONLY to launch, size/foreground the window, and read
// document.activeElement + rendered rows. All clicks are real OS input.
const { _electron: electron } = require("playwright");
const path = require("path");
const { execSync } = require("child_process");

const PORT = String(3700 + Math.floor(Math.random() * 200));
const HOST = "127.0.0.1";
const PS = path.join(__dirname, "_tmp_realclick.ps1");

function realClick(physX, physY) {
  const out = execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -File "${PS}" -X ${Math.round(physX)} -Y ${Math.round(physY)}`,
    { encoding: "utf8" }
  );
  return out.trim();
}

(async () => {
  const exe = path.join(__dirname, "node_modules", "electron", "dist", "electron.exe");
  const app = await electron.launch({ executablePath: exe, args: ["."], cwd: __dirname, env: { ...process.env, PORT, HOST } });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const win = await app.browserWindow(page);

  // Put the window at a known ON-SCREEN position and bring it to the front so real clicks land on it.
  await win.evaluate((w) => { w.unmaximize(); w.setBounds({ x: 80, y: 60, width: 1300, height: 860 }); w.show(); w.focus(); w.moveTop(); });
  await page.waitForTimeout(600);

  // Ensure exactly 2 panes.
  const addBtn = await page.$("#addTerminal");
  const paneCount = () => page.$$eval(".terminal-pane", (els) => els.length);
  let guard = 0;
  while ((await paneCount()) < 2 && guard++ < 5) { await addBtn.click(); await page.waitForTimeout(400); }
  await page.waitForTimeout(1000);

  const scale = await page.evaluate(() => window.devicePixelRatio);
  const cb = await win.evaluate((w) => w.getContentBounds()); // DIP screen coords
  console.log("devicePixelRatio:", scale, "contentBounds(DIP):", JSON.stringify(cb));

  const g = await page.evaluate(() => {
    const panes = [...document.querySelectorAll(".terminal-pane")];
    return panes.map((p) => {
      const xterm = p.querySelector(".xterm");
      const b = xterm.getBoundingClientRect();
      return { title: p.querySelector(".pane-title")?.value, cx: b.x + b.width / 2, cy: b.y + b.height / 2, x: b.x, y: b.y, w: b.width, h: b.height };
    });
  });
  console.log("PANES(css):", JSON.stringify(g));
  if (g.length < 2) { console.log("need 2 panes"); await app.close(); return; }

  const toPhys = (cssX, cssY) => ({ px: (cb.x + cssX) * scale, py: (cb.y + cssY) * scale });

  function focusInfo() {
    return page.evaluate(() => {
      const ae = document.activeElement;
      const pane = ae && ae.closest ? ae.closest(".terminal-pane") : null;
      return { tag: ae?.tagName, cls: (ae?.className || "").slice(0, 40), pane: pane?.querySelector(".pane-title")?.value ?? "(none/body)" };
    });
  }
  function hitTest(cssX, cssY) {
    return page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const pane = el?.closest?.(".terminal-pane");
      return { tag: el?.tagName, cls: (el?.className || "").toString().slice(0, 40), inXterm: !!el?.closest?.(".xterm"), pane: pane?.querySelector(".pane-title")?.value ?? "(none)" };
    }, { x: cssX, y: cssY });
  }
  function rowsText() {
    return page.evaluate(() => {
      const panes = [...document.querySelectorAll(".terminal-pane")];
      return panes.map((p) => ({ title: p.querySelector(".pane-title")?.value, text: (p.querySelector(".xterm-rows")?.innerText || "").replace(/\s+/g, " ").trim().slice(-90) }));
    });
  }

  const t1 = g[0], t2 = g[1];

  // 1) Real-click CENTER of terminal 1 to establish focus there.
  console.log("\n[1] hit-test T1 center:", JSON.stringify(await hitTest(t1.cx, t1.cy)));
  let p = toPhys(t1.cx, t1.cy); console.log("    real click T1 ->", realClick(p.px, p.py));
  await page.waitForTimeout(300);
  console.log("    focus after T1 click:", JSON.stringify(await focusInfo()));
  await page.keyboard.type("echo FROM_T1");
  await page.waitForTimeout(300);

  // 2) Real-click CENTER of terminal 2 (inside the xterm) — the user's exact action.
  console.log("\n[2] hit-test T2 center:", JSON.stringify(await hitTest(t2.cx, t2.cy)));
  p = toPhys(t2.cx, t2.cy); console.log("    real click T2 ->", realClick(p.px, p.py));
  await page.waitForTimeout(300);
  const f2 = await focusInfo();
  console.log("    focus after T2 click:", JSON.stringify(f2), " EXPECTED pane:", t2.title);
  await page.keyboard.type("echo FROM_T2");
  await page.waitForTimeout(500);

  const rows = await rowsText();
  console.log("\nROWS:", JSON.stringify(rows, null, 2));
  const landed = rows.find(r => r.text.includes("FROM_T2"))?.title ?? "(nowhere)";
  console.log(`\nRESULT: typing after clicking inside T2 landed in -> ${landed} (expected ${t2.title})`);
  console.log(f2.pane === t2.title ? "focus OK" : "*** FOCUS DIVERGED — reproduced ***");

  await page.screenshot({ path: path.join(__dirname, "_tmp_realrepro.png") });
  await app.close();
})().catch((e) => { console.error("PROBE ERROR:", e); process.exit(1); });
