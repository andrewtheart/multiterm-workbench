/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

const { test, expect } = require("../support/renderer-coverage");

// Model discovery and sign-in state are separate facts. Losing the catalogue is
// routine (a slow or rate-limited probe); losing the session-resume entry point
// with it forced a manual re-sign-in to get the button back.
test.describe("AI assistant availability", () => {
  const applyProviders = (page, providers) => page.evaluate((catalog) => {
    window.__aiProviderSnapshot = {
      providers: state.aiProviders,
      sessionProvider: state.settings.aiSessionProvider
    };
    state.settings.aiSessionProvider = "copilot";
    state.aiProviders = catalog;
    syncAiSessionControls();
    const toggle = document.querySelector("#copilotSessionsToggle");
    return { disabled: toggle.disabled, title: toggle.title };
  }, providers);

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      const snapshot = window.__aiProviderSnapshot;
      if (!snapshot) return;
      state.aiProviders = snapshot.providers;
      state.settings.aiSessionProvider = snapshot.sessionProvider;
      syncAiSessionControls();
      delete window.__aiProviderSnapshot;
    });
  });

  test("keeps session resume available when the model catalogue is empty", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const withModels = await applyProviders(page, [{
      id: "copilot", available: true, interactiveAvailable: true, models: [{ id: "gpt-5" }]
    }]);
    expect(withModels.disabled).toBe(false);

    // Signed in and installed, but discovery returned nothing this time.
    const withoutModels = await applyProviders(page, [{
      id: "copilot", available: true, interactiveAvailable: true, models: []
    }]);
    expect(withoutModels.disabled, "an empty catalogue must not disable resume").toBe(false);
    expect(withoutModels.title).toContain("Resume a GitHub Copilot session");
  });

  test("still disables session resume when the provider is genuinely unavailable", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const unavailable = await applyProviders(page, [{
      id: "copilot", available: false, interactiveAvailable: false, models: [{ id: "gpt-5" }]
    }]);
    expect(unavailable.disabled).toBe(true);
  });

  // The probe takes seconds and can fail. Starting every launch with an empty
  // catalogue left resume dead until it answered, and permanently when it did not.
  test("remembers the last known catalogue across a reload", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const saved = await page.evaluate(() => {
      const previous = localStorage.getItem("multiterm.aiProviders");
      saveAiProviderCatalog([{ id: "copilot", available: true, interactiveAvailable: true, models: [] }]);
      return { previous, stored: localStorage.getItem("multiterm.aiProviders") };
    });
    expect(saved.stored).toContain("copilot");

    const rehydrated = await page.evaluate(() => loadAiProviderCatalog().map((provider) => provider.id));
    expect(rehydrated).toContain("copilot");

    const malformed = await page.evaluate((previous) => {
      localStorage.setItem("multiterm.aiProviders", "{not json");
      const recovered = loadAiProviderCatalog();
      if (previous === null) localStorage.removeItem("multiterm.aiProviders");
      else localStorage.setItem("multiterm.aiProviders", previous);
      return recovered;
    }, saved.previous);
    expect(malformed, "unreadable storage must not throw during startup").toEqual([]);
  });

  test("filters invalid cached providers and tolerates storage write failures", async ({ page }) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    const result = await page.evaluate(() => {
      const previous = localStorage.getItem("multiterm.aiProviders");
      localStorage.setItem("multiterm.aiProviders", JSON.stringify([
        null,
        {},
        { id: 4 },
        { id: "copilot", models: [] }
      ]));
      const filtered = loadAiProviderCatalog();
      localStorage.setItem("multiterm.aiProviders", JSON.stringify({ id: "copilot" }));
      const wrongShape = loadAiProviderCatalog();

      const originalSetItem = Storage.prototype.setItem;
      const originalWarn = log.warn;
      const warnings = [];
      try {
        log.warn = (...args) => warnings.push(args);
        Storage.prototype.setItem = () => { throw new Error("storage denied"); };
        saveAiProviderCatalog([{ id: "copilot" }]);
        Storage.prototype.setItem = () => { throw "storage unavailable"; }; // eslint-disable-line no-throw-literal
        saveAiProviderCatalog([{ id: "copilot" }]);
      } finally {
        Storage.prototype.setItem = originalSetItem;
        log.warn = originalWarn;
        if (previous === null) localStorage.removeItem("multiterm.aiProviders");
        else localStorage.setItem("multiterm.aiProviders", previous);
      }
      return { filtered, wrongShape, warnings };
    });

    expect(result.filtered).toEqual([{ id: "copilot", models: [] }]);
    expect(result.wrongShape).toEqual([]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0][2].error).toContain("storage denied");
    expect(result.warnings[1][2].error).toBe("storage unavailable");
  });
});
