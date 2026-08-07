const { test, expect } = require("../support/renderer-coverage");

// Layout and zoom are global settings; a page may override either for this
// session only, so nothing here may survive a reload.
test.describe("Per-page layout and zoom", () => {
  const ready = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(() => {
      closeAllTerminals();
      addTerminal({ reveal: true });
    });
    await expect.poll(() => page.evaluate(() => {
      const [terminal] = [...state.terminals.values()];
      return terminal ? terminal.status : "none";
    }), { timeout: 30000 }).toBe("live");
  };

  test("overrides the layout for the active page only", async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(() => {
      state.settings.layout = "auto";
      applySettings();
      const firstPageId = state.activePageId;
      setPageLayoutOverride("vertical");
      const onFirst = document.querySelector("#terminalHost").dataset.layout;

      addPage();
      const onSecond = document.querySelector("#terminalHost").dataset.layout;
      setActivePage(firstPageId);
      const backOnFirst = document.querySelector("#terminalHost").dataset.layout;
      return { onFirst, onSecond, backOnFirst, globalSetting: state.settings.layout };
    });
    expect(result.onFirst).toBe("vertical");
    // The new page still follows the global setting.
    expect(result.onSecond).toBe("auto");
    expect(result.backOnFirst).toBe("vertical");
    // The global setting itself is untouched.
    expect(result.globalSetting).toBe("auto");
  });

  test("returns a page to the global layout", async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(() => {
      state.settings.layout = "grid";
      applySettings();
      setPageLayoutOverride("horizontal");
      const overridden = document.querySelector("#terminalHost").dataset.layout;
      setPageLayoutOverride(null);
      return { overridden, restored: document.querySelector("#terminalHost").dataset.layout };
    });
    expect(result.overridden).toBe("horizontal");
    expect(result.restored).toBe("grid");
  });

  test("overrides the workspace zoom for the active page only", async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(() => {
      state.settings.workspaceZoom = 100;
      applySettings();
      const firstPageId = state.activePageId;
      setPageZoomOverride(150);
      const onFirst = { zoom: effectivePageZoom(), transform: document.querySelector("#terminalHost").style.transform };

      addPage();
      const onSecond = effectivePageZoom();
      setActivePage(firstPageId);
      return { onFirst, onSecond, backOnFirst: effectivePageZoom(), globalSetting: state.settings.workspaceZoom };
    });
    expect(result.onFirst.zoom).toBe(150);
    expect(result.onFirst.transform).toContain("scale(1.5)");
    expect(result.onSecond).toBe(100);
    expect(result.backOnFirst).toBe(150);
    expect(result.globalSetting).toBe(100);
  });

  test("offers both overrides from the workspace menu", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      state.settings.layout = "auto";
      state.settings.workspaceZoom = 100;
      applySettings();
      setPageLayoutOverride("spotlight");
      setPageZoomOverride(125);
    });
    const stage = page.locator(".stage");
    const box = await stage.boundingBox();
    await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30, { button: "right" });
    await expect(page.locator("#contextMenu")).toBeVisible();
    const labels = await page.evaluate(() => [...document.querySelectorAll("#contextMenu .ctx-item")]
      .map((el) => el.textContent.trim()));
    const layoutIndex = labels.findIndex((label) => label.includes("This page: Spotlight"));
    const zoomIndex = labels.findIndex((label) => label.includes("This page zoom: 125%"));
    const openFolderIndex = labels.findIndex((label) => label === "Open folder");
    const fitIndex = labels.findIndex((label) => label === "Fit all terminals");
    expect(layoutIndex).toBeGreaterThan(openFolderIndex);
    expect(zoomIndex).toBe(layoutIndex + 1);
    expect(fitIndex).toBe(zoomIndex + 1);
    await page.keyboard.press("Escape");
  });

  test("does not persist the overrides", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      setPageLayoutOverride("vertical");
      setPageZoomOverride(150);
      savePages();
    });
    const stored = await page.evaluate(() => localStorage.getItem("multiterm.pages"));
    expect(stored).not.toContain("vertical");
    expect(stored).not.toContain("150");

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    const afterReload = await page.evaluate(() => ({
      layout: document.querySelector("#terminalHost").dataset.layout,
      zoom: effectivePageZoom()
    }));
    expect(afterReload.layout).not.toBe("vertical");
    expect(afterReload.zoom).not.toBe(150);
  });
});
