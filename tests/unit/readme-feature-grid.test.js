/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const readme = fs.readFileSync(path.resolve(__dirname, "../../README.md"), "utf8");

const gridHeadings = [
  "📊 Per-terminal bridge and process statistics",
  "🔗 Attach running WSL tmux sessions",
  "🧹 Copy and prepare selected text",
  "🔒 Locked down by default",
  "🖱️ Deep right-click context menu",
  "📝 PID-bound notes and command queues",
  "🔔 Activity and input alerts"
];

function containingCell(heading) {
  const marker = `<h3>${heading}</h3>`;
  const headingIndex = readme.indexOf(marker);
  const cellStart = readme.lastIndexOf("<td", headingIndex);
  const cellEnd = readme.indexOf("</td>", headingIndex);
  return {
    count: readme.split(marker).length - 1,
    html: readme.slice(cellStart, cellEnd + "</td>".length)
  };
}

describe("README feature grid", () => {
  it("centers the icon with the title and leads with the workbench screenshot", () => {
    expect(readme).toMatch(
      /^<h1 align="center">\s*<img src="public\/icon-192\.png" alt="MultiTerm Workbench icon" width="96" align="middle">\s*&nbsp;MultiTerm Workbench\s*<\/h1>/
    );

    const downloadIndex = readme.indexOf("Download the latest MultiTerm Workbench installer");
    const screenshotIndex = readme.indexOf('src="docs/images/workbench-grid.png"');
    const featuresIndex = readme.indexOf("## Why MultiTerm?");
    expect(downloadIndex).toBeGreaterThan(-1);
    expect(screenshotIndex).toBeGreaterThan(downloadIndex);
    expect(screenshotIndex).toBeLessThan(featuresIndex);
  });

  it.each(gridHeadings)("keeps %s as one compact three-column card", (heading) => {
    const cell = containingCell(heading);

    expect(cell.count).toBe(1);
    expect(cell.html).toMatch(/^<td align="center" width="33%">/);
    expect(cell.html).not.toContain("colspan");
  });

  it("places statistics, tmux attachment, and Copy and prepare in one complete row", () => {
    expect(readme).toMatch(
      /<tr>\s*<td[^>]*>\s*<h3>📊[^]*?<\/td>\s*<td[^>]*>\s*<h3>🔗[^]*?<\/td>\s*<td[^>]*>\s*<h3>🧹[^]*?<\/td>\s*<\/tr>/
    );
  });

  it("places PID-bound notes in the former hamburger slot", () => {
    expect(readme).toMatch(
      /<tr>\s*<td[^>]*>\s*<h3>📝[^]*?<\/td>\s*<td[^>]*>\s*<h3>⌨️[^]*?<\/td>\s*<td[^>]*>\s*<h3>🗂️[^]*?<\/td>\s*<\/tr>/
    );
    expect(readme).not.toContain("Always-on pane hamburger");
  });

  it("places security, context menu, and activity alerts in one complete row", () => {
    expect(readme).toMatch(
      /<tr>\s*<td[^>]*>\s*<h3>🔒[^]*?<\/td>\s*<td[^>]*>\s*<h3>🖱️[^]*?<\/td>\s*<td[^>]*>\s*<h3>🔔[^]*?<\/td>\s*<\/tr>/
    );
  });

  it.each([
    "docs/images/context-menu.png",
    "docs/images/notes-command-queue.png"
  ])("keeps %s only in the Screenshot tour", (imagePath) => {
    const tourIndex = readme.indexOf("## Screenshot tour");
    const imageIndex = readme.indexOf(`src="${imagePath}"`);

    expect(readme.split(`src="${imagePath}"`).length - 1).toBe(1);
    expect(imageIndex).toBeGreaterThan(tourIndex);
  });
});
