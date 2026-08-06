/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { test, expect } = require("../support/renderer-coverage");

// The composer's message box is a code editor: a real textarea with its own text
// highlighted underneath. The two layers have to stay glued together, and the
// painted layer must never become an HTML injection point.
test.describe("Terminal message code editor", () => {
  const openComposer = async (page) => {
    await page.goto("http://127.0.0.1:3199/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await page.evaluate(async () => {
      while (state.terminals.size < 2) {
        addTerminal({ reveal: true });
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      openTerminalMessages();
    });
    await expect(page.locator("#terminalMessagesOverlay")).toBeVisible();
  };

  test("paints highlighted tokens under the textarea without altering the text", async ({ page }) => {
    await openComposer(page);

    const command = "Get-ChildItem -Recurse | Where-Object { $_.Length -gt 1024 } # scan";
    await page.evaluate(() => { document.querySelector("#messageLanguage").value = "powershell"; });
    await page.locator("#messageText").fill(command);

    const paint = page.locator("#messageTextHighlight");
    // Same characters, so the caret always sits on the glyph it appears to.
    await expect.poll(() => page.evaluate(() => document.querySelector("#messageTextHighlight").textContent.replace(/\n$/, "")))
      .toBe(command);
    await expect(paint.locator(".tok-command", { hasText: "Get-ChildItem" })).toHaveCount(1);
    await expect(paint.locator(".tok-parameter", { hasText: "-Recurse" })).toHaveCount(1);
    await expect(paint.locator(".tok-variable")).not.toHaveCount(0);
    await expect(paint.locator(".tok-comment", { hasText: "# scan" })).toHaveCount(1);

    // The textarea keeps the caret; every visible glyph comes from the paint.
    const layers = await page.evaluate(() => {
      const input = document.querySelector("#messageText");
      const painted = document.querySelector("#messageTextHighlight");
      const inputStyle = getComputedStyle(input);
      const paintStyle = getComputedStyle(painted);
      const inputBox = input.getBoundingClientRect();
      const paintBox = painted.getBoundingClientRect();
      return {
        inputColour: inputStyle.color,
        metricsMatch: ["fontFamily", "fontSize", "lineHeight", "paddingTop", "paddingLeft", "whiteSpace", "wordBreak", "tabSize"]
          .every((property) => inputStyle[property] === paintStyle[property]),
        aligned: Math.abs(inputBox.left - paintBox.left) < 0.5 && Math.abs(inputBox.top - paintBox.top) < 0.5
      };
    });
    expect(layers.inputColour).toBe("rgba(0, 0, 0, 0)");
    expect(layers.metricsMatch).toBe(true);
    expect(layers.aligned).toBe(true);
  });

  test("keeps the painted layer scrolled with the textarea", async ({ page }) => {
    await openComposer(page);
    await page.locator("#messageText").fill(
      Array.from({ length: 60 }, (unused, line) => `Write-Output "line ${line}"`).join("\n")
    );
    const scrolled = await page.evaluate(async () => {
      const input = document.querySelector("#messageText");
      input.scrollTop = input.scrollHeight;
      input.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const painted = document.querySelector("#messageTextHighlight");
      return { inputTop: input.scrollTop, paintTop: painted.scrollTop };
    });
    expect(scrolled.inputTop).toBeGreaterThan(0);
    expect(scrolled.paintTop).toBe(scrolled.inputTop);
  });

  test("follows the target terminal's shell until the author overrides it", async ({ page }) => {
    await openComposer(page);
    // The target list excludes the source, so drive whichever terminal it offers.
    const targeted = await page.evaluate(() => {
      const select = document.querySelector("#messageTarget");
      const target = state.terminals.get(select.value);
      target.shell = "wsl";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { id: target.id, shell: target.shell };
    });
    expect(targeted.shell).toBe("wsl");

    await page.locator("#messageText").fill("for f in *.log; do echo \"$f\"; done");
    await expect(page.locator("#messageTextHighlight .tok-keyword").first()).toHaveText("for");

    // An explicit choice wins over the target's shell.
    await page.evaluate(() => {
      const select = document.querySelector("#messageLanguage");
      select.value = "text";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.locator("#messageTextHighlight .tok-keyword")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.querySelector("#messageTextHighlight").textContent.trim()))
      .toBe('for f in *.log; do echo "$f"; done');
  });

  test("escapes pasted markup instead of rendering it", async ({ page }) => {
    await openComposer(page);
    await page.evaluate(() => { window.__paintXss = false; });
    await page.locator("#messageText").fill('<img src=x onerror="window.__paintXss=true"> done');
    await expect.poll(() => page.evaluate(() => document.querySelector("#messageTextHighlight").querySelectorAll("img").length))
      .toBe(0);
    expect(await page.evaluate(() => window.__paintXss)).toBe(false);
  });

  test("indents with Tab instead of leaving the field", async ({ page }) => {
    await openComposer(page);
    await page.locator("#messageText").fill("echo hi");
    await page.locator("#messageText").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#messageText")).toBeFocused();
    await expect(page.locator("#messageText")).toHaveValue("echo hi  ");
    await expect.poll(() => page.evaluate(() => document.querySelector("#messageTextHighlight").textContent.replace(/\n$/, "")))
      .toBe("echo hi  ");
  });
});
