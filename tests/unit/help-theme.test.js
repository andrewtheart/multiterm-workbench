/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const scriptUrl = pathToFileURL(path.join(__dirname, "..", "..", "public", "help-theme.js")).href;

async function loadTheme(theme) {
  const dom = new JSDOM(`<!doctype html><html><body><script src="${scriptUrl}"></script></body></html>`, {
    resources: "usable",
    runScripts: "dangerously",
    url: `https://multiterm.local/help.html${theme === undefined ? "" : `?theme=${theme}`}`
  });
  await new Promise((resolve, reject) => {
    dom.window.addEventListener("load", resolve, { once: true });
    dom.window.addEventListener("error", reject, { once: true });
  });
  return dom;
}

describe("Help theme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["system", "dark"],
    [undefined, "dark"]
  ])("maps the %s query to the supported theme", async (requested, expected) => {
    const dom = await loadTheme(requested);
    expect(dom.window.document.documentElement.dataset.theme).toBe(expected);
    dom.window.close();
  });
});
