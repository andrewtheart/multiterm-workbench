/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Page groups are a second level above pages: a named band of page tabs in the
// pager. These tests pin down that membership lives on the page, that a group
// always draws as one contiguous band, that collapsing can never hide the page
// you are on, and that explicitly empty drop-target groups remain available.

const { test, expect, startRendererCoverage, stopRendererCoverage } = require("../support/renderer-coverage");

test.describe.configure({ mode: "serial" });

test.describe("Page groups", () => {
  let context;
  let page;
  const errors = [];

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: "http://127.0.0.1:3199",
      viewport: { width: 1400, height: 900 }
    });
    page = await context.newPage();
    await startRendererCoverage(page);
    page.on("pageerror", (err) => errors.push(String(err.stack || err.message || err)));
    await page.goto("/");
    await expect(page.locator("#statusConn")).toHaveText("Connected");
  });

  test.afterAll(async () => {
    // Storage is shared with every later spec file on this origin, so the bar has
    // to go back to a stock single page before this one finishes.
    await page.evaluate(() => {
      state.pageGroups = [];
      state.pages = [{ id: "page-1", name: "Page 1", groupId: null }];
      state.activePageId = "page-1";
      savePages();
      renderPager();
    });
    await page.evaluate(() => closeAllTerminals());
    await stopRendererCoverage(page, "page-groups");
    await context.close();
  });

  // Groups are pure renderer state, so every test can start from a known bar
  // without touching the shared bridge.
  test.beforeEach(async () => {
    await page.evaluate(() => {
      state.pageGroups = [];
      state.pages = [
        { id: "page-1", name: "Alpha", groupId: null },
        { id: "page-2", name: "Beta", groupId: null },
        { id: "page-3", name: "Gamma", groupId: null }
      ];
      state.activePageId = "page-1";
      savePages();
      renderPager();
    });
  });

  const groupIds = () => page.evaluate(() => state.pages.map((entry) => entry.groupId));

  test("collects pages into one named band and drops the group when it empties", async () => {
    await page.evaluate(() => createPageGroup("Release", ["page-1", "page-3"]));

    const band = page.locator(".pager-group");
    await expect(band).toHaveCount(1);
    await expect(band.locator(".pager-group-name")).toHaveText("Release");
    await expect(band.locator(".pager-chip")).toHaveCount(2);

    // Gamma was third; joining a group whose first member is Alpha has to pull
    // it up beside Alpha or the band could not be drawn in one piece.
    expect(await page.evaluate(() => state.pages.map((entry) => entry.name))).toEqual(["Alpha", "Gamma", "Beta"]);
    await expect(page.locator(".pager-list > .pager-chip")).toHaveCount(1);

    await page.evaluate(() => assignPagesToGroup(["page-1", "page-3"], null));
    await expect(page.locator(".pager-group")).toHaveCount(0);
    expect(await page.evaluate(() => state.pageGroups)).toEqual([]);
  });

  test("creates an empty drop-target group from blank space in every pager position", async () => {
    for (const placement of ["top", "bottom", "left", "right"]) {
      await page.evaluate((nextPlacement) => {
        state.settings.pagerPlacement = nextPlacement;
        applyPagerPlacement();
        elements.pagerList.dispatchEvent(new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 40
        }));
      }, placement);
      await expect(page.getByRole("menuitem", { name: "Create new group", exact: true })).toBeVisible();
      await page.evaluate(() => hideContextMenu());
    }

    await page.evaluate(() => {
      state.settings.pagerPlacement = "top";
      applyPagerPlacement();
      elements.pagerList.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 40
      }));
    });
    await page.getByRole("menuitem", { name: "Create new group", exact: true }).click();
    const rename = page.locator(".pager-group-rename");
    await expect(rename).toBeVisible();
    await rename.fill("Drop zone");
    await rename.press("Enter");
    await expect(page.locator(".pager-group.is-empty .pager-group-empty")).toHaveText("Drop pages here");
    expect(await page.evaluate(() => state.pageGroups[0])).toMatchObject({ name: "Drop zone", keepEmpty: true });

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");
    await expect(page.locator(".pager-group.is-empty .pager-group-empty")).toHaveText("Drop pages here");
    const groupId = await page.evaluate(() => state.pageGroups[0].id);

    await page.evaluate((targetGroupId) => {
      const source = document.querySelector('[data-page-id="page-2"]');
      const zone = document.querySelector(`[data-group-id="${CSS.escape(targetGroupId)}"] .pager-group-chips`);
      const sourceRect = source.getBoundingClientRect();
      const zoneRect = zone.getBoundingClientRect();
      const start = { x: sourceRect.right - 4, y: sourceRect.top + sourceRect.height / 2 };
      const end = { x: zoneRect.left + zoneRect.width / 2, y: zoneRect.top + zoneRect.height / 2 };
      const transfer = new DataTransfer();
      const dispatch = (target, type, point) => target.dispatchEvent(new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        dataTransfer: transfer
      }));

      dispatch(source, "dragstart", start);
      for (let step = 1; step <= 15; step += 1) {
        const point = {
          x: start.x + ((end.x - start.x) * step / 15),
          y: start.y + ((end.y - start.y) * step / 15)
        };
        dispatch(document.elementFromPoint(point.x, point.y), "dragover", point);
      }
      dispatch(document.elementFromPoint(end.x, end.y), "drop", end);
      dispatch(source, "dragend", end);
    }, groupId);
    expect(await page.evaluate(() => pageById("page-2").groupId)).toBe(groupId);

    const transfer = await page.evaluateHandle(() => new DataTransfer());
    const groupedBeta = page.locator('[data-page-id="page-2"]');
    await groupedBeta.dispatchEvent("dragstart", { dataTransfer: transfer });
    await page.locator("#pagerList").dispatchEvent("dragover", { dataTransfer: transfer });
    await page.locator("#pagerList").dispatchEvent("drop", { dataTransfer: transfer });
    await groupedBeta.dispatchEvent("dragend", { dataTransfer: transfer });
    expect(await page.evaluate(() => pageById("page-2").groupId)).toBeNull();
    await expect(page.locator(".pager-group.is-empty .pager-group-empty")).toHaveText("Drop pages here");

    await page.locator(".pager-group-header").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete group", exact: true }).click();
    await expect(page.locator(".pager-group")).toHaveCount(0);
  });

  test("keeps the active page visible when its group is collapsed", async () => {
    const id = await page.evaluate(() => createPageGroup("Release", ["page-1", "page-2"]));
    await page.evaluate((groupId) => setPageGroupCollapsed(groupId, true), id);

    // page-1 is active, so exactly one of the two members stays on the bar.
    await expect(page.locator(".pager-group .pager-chip")).toHaveCount(1);
    await expect(page.locator(".pager-group .pager-chip.is-active .pager-name")).toHaveText("Alpha");

    await page.evaluate(() => setActivePage("page-3"));
    await expect(page.locator(".pager-group .pager-chip")).toHaveCount(0);
    await expect(page.locator(".pager-group-count")).toHaveText("2");

    // Collapsed membership must never be written back as the new page order.
    expect(await page.evaluate(() => state.pages.length)).toBe(3);
  });

  test("toggles a group from its header and renames it from the group menu", async () => {
    await page.evaluate(() => createPageGroup("Release", ["page-1", "page-2"]));
    const header = page.locator(".pager-group-header");

    await header.click();
    await expect(page.locator(".pager-group-header")).toHaveAttribute("aria-expanded", "false");
    await page.locator(".pager-group-header").click();
    await expect(page.locator(".pager-group-header")).toHaveAttribute("aria-expanded", "true");

    await page.locator(".pager-group-header").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename group\u2026", exact: true }).click();
    const input = page.locator(".pager-group-rename");
    await expect(input).toBeVisible();
    await input.fill("Shipping");
    await input.press("Enter");
    await expect(page.locator(".pager-group-name")).toHaveText("Shipping");
    expect(await page.evaluate(() => state.pageGroups[0].name)).toBe("Shipping");
  });

  test("carries membership and order through a reload", async () => {
    const id = await page.evaluate(() => {
      const groupId = createPageGroup("Release", ["page-1", "page-2"]);
      setPageGroupCollapsed(groupId, true);
      return groupId;
    });

    await page.reload();
    await expect(page.locator("#statusConn")).toHaveText("Connected");

    await expect(page.locator(".pager-group")).toHaveCount(1);
    await expect(page.locator(".pager-group-name")).toHaveText("Release");
    expect(await page.evaluate(() => state.pageGroups[0].collapsed)).toBe(true);
    expect(await groupIds()).toEqual([id, id, null]);
  });

  test("joins and leaves a group when a tab is moved across its edge", async () => {
    const id = await page.evaluate(() => createPageGroup("Release", ["page-1"]));

    // Beta sits directly after the one-member band, so stepping left over Alpha
    // lands it inside the group.
    await page.evaluate(() => movePageByOffset("page-2", -1));
    expect(await groupIds()).toEqual([id, id, null]);

    // Stepping right once only swaps it with the other member; it takes a second
    // step, past the group's last member, to leave.
    await page.evaluate(() => movePageByOffset("page-2", 1));
    expect(await groupIds()).toEqual([id, id, null]);
    await page.evaluate(() => movePageByOffset("page-2", 1));
    expect(await groupIds()).toEqual([id, null, null]);
    expect(await page.evaluate(() => state.pages.map((entry) => entry.name))).toEqual(["Alpha", "Gamma", "Beta"]);
  });

  test("only offers AI page grouping once there are at least two pages", async () => {
    const button = page.locator("#pagerGroupPages");
    await expect(button).toHaveAttribute("aria-label", /Group pages into page groups|not signed in/);

    await page.evaluate(() => {
      state.pages = [{ id: "page-1", name: "Alpha", groupId: null }];
      state.activePageId = "page-1";
      state.pageGroups = [];
      savePages();
      renderPager();
    });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-label", /at least two pages|not signed in/);
  });

  test("normalizes persisted groups and rejects invalid manual operations", async () => {
    const result = await page.evaluate(() => {
      const storage = localStorage.getItem("multiterm.pages");
      localStorage.setItem("multiterm.pages", JSON.stringify({
        pages: [
          { id: "page-1", name: "", groupId: "group-1" },
          { id: "page-2", name: "Two", groupId: 7 },
          null,
          { id: "", name: "Ignored" }
        ],
        pageGroups: [
          { id: "group-1", name: "", collapsed: true },
          { id: "group-1", name: "Duplicate" },
          { id: "orphan", name: "Orphan" },
          { id: "empty", name: "Inbox", keepEmpty: true },
          { id: "", name: "Invalid empty", keepEmpty: true },
          null
        ]
      }));
      const loadedPages = loadPages();
      const loadedGroups = loadPageGroups(loadedPages);
      const groupsWithoutPages = loadPageGroups(null);
      localStorage.setItem("multiterm.pages", "{broken");
      const brokenPages = loadPages();
      const brokenGroups = loadPageGroups(brokenPages);
      if (storage == null) localStorage.removeItem("multiterm.pages");
      else localStorage.setItem("multiterm.pages", storage);

      state.pages = [
        { id: "page-1", name: "One", groupId: null },
        { id: "page-2", name: "Two", groupId: "missing" }
      ];
      state.activePageId = "page-1";
      state.pageGroups = [];
      const invalidAssign = assignPagesToGroup(["page-1"], "missing");
      pruneEmptyPageGroups();
      const staleMembership = state.pages[1].groupId;
      const emptyCreate = createPageGroup("", []);
      const groupId = createPageGroup("", ["page-1"]);
      const duplicateCreate = createPageGroup("Other", ["missing"]);
      const noChange = assignPagesToGroup(["page-1", "missing"], groupId);
      const renameMissing = renamePageGroup("missing", "Name");
      const renameNull = renamePageGroup(groupId, null);
      const renameEmpty = renamePageGroup(groupId, "  ");
      const renameSame = renamePageGroup(groupId, pageGroupById(groupId).name);
      const collapseMissing = setPageGroupCollapsed("missing", true);
      const collapseSame = setPageGroupCollapsed(groupId, false);
      const ungroupMissing = ungroupPageGroup("missing");
      const ungrouped = ungroupPageGroup(groupId);
      return {
        loadedPages,
        loadedGroups,
        groupsWithoutPages,
        brokenPages,
        brokenGroups,
        invalidAssign,
        staleMembership,
        emptyCreate,
        groupId,
        duplicateCreate,
        noChange,
        renameMissing,
        renameNull,
        renameEmpty,
        renameSame,
        collapseMissing,
        collapseSame,
        ungroupMissing,
        ungrouped,
        missingGroup: pageGroupById("missing"),
        noPageGroup: pageGroupOf(null)
      };
    });

    expect(result.loadedPages).toEqual([
      { id: "page-1", name: "Page", groupId: "group-1" },
      { id: "page-2", name: "Two", groupId: null }
    ]);
    expect(result.loadedGroups).toEqual([
      { id: "group-1", name: "Group", collapsed: true },
      { id: "empty", name: "Inbox", collapsed: false, keepEmpty: true }
    ]);
    expect(result.groupsWithoutPages).toEqual([
      { id: "empty", name: "Inbox", collapsed: false, keepEmpty: true }
    ]);
    expect(result.brokenPages).toEqual([{ id: "page-1", name: "Page 1", groupId: null }]);
    expect(result.brokenGroups).toEqual([]);
    expect(result).toMatchObject({
      invalidAssign: false,
      staleMembership: null,
      emptyCreate: "",
      duplicateCreate: "",
      noChange: false,
      renameMissing: false,
      renameNull: false,
      renameEmpty: false,
      renameSame: false,
      collapseMissing: false,
      collapseSame: false,
      ungroupMissing: false,
      ungrouped: true,
      missingGroup: null,
      noPageGroup: null
    });
    expect(result.groupId).toMatch(/^group-/);
  });

  test("samples start middle and latest output within the configured budget", async () => {
    const result = await page.evaluate(() => {
      const fakeTerm = (values) => ({
        buffer: {
          active: {
            length: values.length,
            getLine: (index) => values[index] == null ? null : {
              translateToString: () => values[index]
            }
          }
        }
      });
      const many = Array.from({ length: 24 }, (_, index) => `line ${index}`);
      const originalPages = state.pages;
      const originalGroups = state.pageGroups;
      const originalTerminals = state.terminals;
      state.pages = [
        { id: "page-1", name: "Build", groupId: "group-1" },
        { id: "page-2", name: "Empty", groupId: null }
      ];
      state.pageGroups = [{ id: "group-1", name: "Release", collapsed: false }];
      state.terminals = new Map([
        ["live-1", { id: "live-1", status: "live", pageId: "page-1", shell: "pwsh", cwd: "D:\\repo", titleInput: { value: "API" }, term: fakeTerm(many) }],
        ["live-2", { id: "live-2", status: "live", pageId: "page-1", shell: "pwsh", cwd: "D:\\repo", titleInput: { value: "API" }, term: fakeTerm(["short", "", "tail"]) }],
        ["live-empty", { id: "live-empty", status: "live", pageId: "missing", shell: "", cwd: "", titleInput: { value: "" }, term: fakeTerm([]) }],
        ["dead", { id: "dead", status: "exited", pageId: "page-1", shell: "cmd", cwd: "D:\\old", titleInput: { value: "Dead" }, term: fakeTerm(["ignored"]) }]
      ]);
      const catalog = buildPageCatalog();
      const terminalCatalog = buildTerminalGroupCatalog();
      state.pages = [];
      const emptyCatalog = buildPageCatalog();
      state.pages = originalPages;
      state.pageGroups = originalGroups;
      state.terminals = originalTerminals;
      return {
        zero: clampSampleToBudget(["x"], 0),
        emptyParts: clampSampleToBudget([], 10),
        complete: clampSampleToBudget(["ab", "cd"], 20),
        clipped: clampSampleToBudget(["🙂🙂", "abcdef"], 6),
        emptySample: sampleTerminalOutput(fakeTerm(["", "  "]), 100),
        shortSample: sampleTerminalOutput(fakeTerm([" a ", "", " b "]), 100, 2),
        longSample: sampleTerminalOutput(fakeTerm(many), 240, 2),
        catalog,
        terminalCatalog,
        emptyCatalog
      };
    });

    expect(result.zero).toBe("");
    expect(result.emptyParts).toBe("");
    expect(result.complete).toBe("ab cd");
    expect(result.clipped).not.toContain("�");
    expect(result.emptySample).toBe("");
    expect(result.shortSample).toBe("a | b");
    expect(result.longSample).toContain("[start]");
    expect(result.longSample).toContain("[middle]");
    expect(result.longSample).toContain("[latest]");
    expect(result.catalog.pages).toHaveLength(2);
    expect(result.catalog.catalog[0]).toMatchObject({
      title: "Build",
      shell: "pwsh",
      cwd: "D:\\repo",
      page: "Release",
      members: "API"
    });
    expect(result.catalog.catalog[1].excerpt).toBe("");
    expect(result.terminalCatalog.terminals).toHaveLength(3);
    expect(result.terminalCatalog.catalog[2]).toMatchObject({ title: "", shell: "", cwd: "", page: "", excerpt: "" });
    expect(result.emptyCatalog).toEqual({ pages: [], catalog: [] });
  });

  test("handles AI page-group proposals, bridge failures, and stale membership", async () => {
    const result = await page.evaluate(async () => {
      state.pages = [
        { id: "page-1", name: "Alpha", groupId: null },
        { id: "page-2", name: "Beta", groupId: null }
      ];
      state.activePageId = "page-1";
      state.pageGroups = [];
      pageGrouping.active = false;
      pageGrouping.mode = "pages";

      const normalizedInvalid = normalizePageGroupResponse(null, new Set());
      const normalizedPartial = normalizePageGroupResponse([
        { name: "", terminals: ["page-1"] },
        { name: "A".repeat(50), terminals: ["page-1", "page-1", "invented"] }
      ], new Set(["page-1", "page-2"]));
      const originalRequest = window.requestBridge;
      window.requestBridge = async () => null;
      const silent = await runCopilotGrouping({
        mode: "pages", ids: ["page-1", "page-2"], catalog: [], working: "working", subject: "pages", unit: "page"
      });
      const silentText = elements.pageGroupStatus.textContent;
      window.requestBridge = async () => ({ error: "provider failed" });
      const errored = await runCopilotGrouping({
        mode: "pages", ids: ["page-1", "page-2"], catalog: [], working: "working", subject: "pages", unit: "page"
      });
      const errorText = elements.pageGroupStatus.textContent;
      window.requestBridge = async () => ({ groups: [{ name: "Only", terminals: ["page-1"] }] });
      const partial = await runCopilotGrouping({
        mode: "pages", ids: ["page-1", "page-2"], catalog: [], working: "working", subject: "pages", unit: "page"
      });
      const partialText = elements.pageGroupStatus.textContent;
      window.requestBridge = async () => ({ groups: [{ name: "Both", terminals: ["page-1", "page-2"] }] });
      const proposed = await runCopilotGrouping({
        mode: "pages", ids: ["page-1", "page-2"], catalog: [], working: "working", subject: "pages", unit: "page"
      });
      const proposal = elements.pageGroupList.textContent;
      window.requestBridge = originalRequest;

      const current = pageGroupPagesProposalIsCurrent(["page-1", "page-2"]);
      const stale = pageGroupPagesProposalIsCurrent(["page-1"]);
      const staleApply = applyAiPageGroups([{ name: "Nope", terminals: ["page-1"] }], ["page-1"]);
      state.pageGroups.push({ id: "existing", name: "Both", collapsed: false });
      const applied = applyAiPageGroups([
        { name: "Both", terminals: ["page-1"] },
        { name: "New", terminals: ["page-2", "missing"] }
      ], ["page-1", "page-2"]);
      const groupNames = state.pageGroups.map((group) => group.name);
      const memberships = state.pages.map((entry) => entry.groupId);

      pageGrouping.groups = [];
      const emptyConfirm = confirmPageGroupProposal();
      pageGrouping.mode = "pages";
      pageGrouping.groups = [{ name: "Stale", terminals: ["page-1"] }];
      pageGrouping.memberIds = ["page-1"];
      const staleConfirm = confirmPageGroupProposal();
      const staleStatus = elements.pageGroupStatus.textContent;
      closePageGroupFlyout({ restoreFocus: false });
      return {
        normalizedInvalid,
        normalizedPartial,
        silent,
        silentText,
        errored,
        errorText,
        partial,
        partialText,
        proposed,
        proposal,
        current,
        stale,
        staleApply,
        applied,
        groupNames,
        memberships,
        emptyConfirm,
        staleConfirm,
        staleStatus
      };
    });

    expect(result.normalizedInvalid).toEqual([]);
    expect(result.normalizedPartial).toEqual([]);
    expect(result.silent).toBe(false);
    expect(result.silentText).toMatch(/bridge|connected/i);
    expect(result.errored).toBe(false);
    expect(result.errorText).toBe("provider failed");
    expect(result.partial).toBe(false);
    expect(result.partialText).toContain("every page");
    expect(result.proposed).toBe(true);
    expect(result.proposal).toContain("Both");
    expect(result.current).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.staleApply).toBe(false);
    expect(result.applied).toBe(true);
    expect(result.groupNames).toEqual(expect.arrayContaining(["Both", "New"]));
    expect(result.memberships.every(Boolean)).toBe(true);
    expect(result.emptyConfirm).toBe(false);
    expect(result.staleConfirm).toBe(false);
    expect(result.staleStatus).toContain("changed");
  });

  test("renders unknown proposal members and both confirmation plural forms", async () => {
    const result = await page.evaluate(() => {
      pageGrouping.mode = "terminals";
      renderPageGroupProposal([{ name: "Unknown", terminals: ["missing-terminal"] }]);
      const fallbackMember = elements.pageGroupList.textContent;

      // One terminal page exercises the singular terminal confirmation text.
      const originalTerminalApply = window.applyTerminalPageGroups;
      const originalPageApply = window.applyAiPageGroups;
      window.applyTerminalPageGroups = () => true;
      window.applyAiPageGroups = () => true;
      pageGrouping.mode = "terminals";
      pageGrouping.groups = [{ name: "One terminal page", terminals: ["only"] }];
      pageGrouping.memberIds = ["only"];
      const terminalConfirmed = confirmPageGroupProposal();

      pageGrouping.mode = "pages";
      pageGrouping.groups = [
        { name: "First", terminals: ["page-1"] },
        { name: "Second", terminals: ["page-2"] }
      ];
      pageGrouping.memberIds = ["page-1", "page-2"];
      const pagesConfirmed = confirmPageGroupProposal();
      window.applyTerminalPageGroups = originalTerminalApply;
      window.applyAiPageGroups = originalPageApply;
      return { fallbackMember, terminalConfirmed, pagesConfirmed };
    });
    expect(result).toEqual({ fallbackMember: "Unknownmissing-terminal", terminalConfirmed: true, pagesConfirmed: true });
  });

  test("exercises group menus and inline creation controls", async () => {
    const groupId = await page.evaluate(() => createPageGroup("Release", ["page-1", "page-2"]));
    await page.locator(".pager-group-header").click({ button: "right" });
    await page.getByRole("menuitem", { name: "New page in group", exact: true }).click();
    expect(await page.evaluate((id) => pagesInGroup(id).length, groupId)).toBe(3);

    await page.locator(".pager-group-header").click({ button: "right" });
    await page.getByRole("menuitem", { name: /Ungroup 3 pages/ }).click();
    await expect(page.locator(".pager-group")).toHaveCount(0);

    await page.locator('.pager-chip[data-page-id="page-1"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Add to group", exact: true }).hover();
    await expect(page.locator("#contextSubmenu")).toBeVisible();
    await page.locator("#contextSubmenu").getByRole("menuitem", { name: "New group…", exact: true }).click();
    const input = page.locator(".pager-group-rename");
    await expect(input).toBeVisible();
    await input.fill("Created inline");
    await input.press("Escape");
    await expect(page.locator(".pager-group-name")).not.toHaveText("Created inline");
  });

  test("covers page-group wrapper gates and successful confirmation", async () => {
    const result = await page.evaluate(async () => {
      const originalRequest = window.requestBridge;
      const originalProviders = state.aiProviders;
      state.aiProviders = [{
        id: "copilot",
        available: true,
        interactiveAvailable: true,
        titleAvailable: true,
        models: [{ id: "auto", name: "Auto", efforts: [] }]
      }];

      pageGrouping.active = true;
      const busy = await groupPageBandsWithAi();
      pageGrouping.active = false;
      const savedPages = state.pages;
      state.pages = [{ id: "page-1", name: "One", groupId: null }];
      const tooFew = await groupPageBandsWithAi();
      state.pages = savedPages;
      state.aiProviders = [];
      const unavailable = await groupPageBandsWithAi();
      state.aiProviders = originalProviders.length ? originalProviders : [{
        id: "copilot", available: true, interactiveAvailable: true, titleAvailable: true, models: []
      }];
      window.requestBridge = async () => ({
        groups: [{ name: "All pages", terminals: state.pages.map((entry) => entry.id) }]
      });
      const proposed = await groupPageBandsWithAi();
      const confirmed = confirmPageGroupProposal();
      const groups = state.pageGroups.map((entry) => entry.name);
      window.requestBridge = originalRequest;
      state.aiProviders = originalProviders;
      return { busy, tooFew, unavailable, proposed, confirmed, groups };
    });

    expect(result).toMatchObject({ busy: false, tooFew: false, unavailable: false, proposed: true, confirmed: true });
    expect(result.groups).toContain("All pages");
  });

  test("covers terminal-group wrapper gates and creates proposed pages", async () => {
    await page.evaluate(() => {
      closeAllTerminals();
      addTerminal({ title: "API", runStartup: false });
      addTerminal({ title: "Docs", runStartup: false });
    });
    await expect(page.locator(".terminal-pane")).toHaveCount(2);

    const result = await page.evaluate(async () => {
      const originalRequest = window.requestBridge;
      const originalProviders = state.aiProviders;
      pageGrouping.active = true;
      const busy = await groupPagesWithAi();
      pageGrouping.active = false;

      const terminals = [...state.terminals.values()];
      const savedStatus = terminals[1].status;
      terminals[1].status = "exited";
      const tooFew = await groupPagesWithAi();
      terminals[1].status = savedStatus;

      state.aiProviders = [];
      const unavailable = await groupPagesWithAi();
      state.aiProviders = [{ id: "copilot", available: true, interactiveAvailable: true, titleAvailable: true, models: [] }];
      window.requestBridge = async () => ({
        groups: [
          { name: "New API page", terminals: [terminals[0].id] },
          { name: "New Docs page", terminals: [terminals[1].id] }
        ]
      });
      const proposed = await groupPagesWithAi();
      const confirmed = confirmPageGroupProposal();
      const pageNames = state.pages.map((entry) => entry.name);
      window.requestBridge = originalRequest;
      state.aiProviders = originalProviders;
      return { busy, tooFew, unavailable, proposed, confirmed, pageNames };
    });

    expect(result).toMatchObject({ busy: false, tooFew: false, unavailable: false, proposed: true, confirmed: true });
    expect(result.pageNames).toEqual(expect.arrayContaining(["New API page", "New Docs page"]));
  });

  test("executes existing-group, remove, and failed-create menu callbacks", async () => {
    const result = await page.evaluate(() => {
      const groupId = createPageGroup("Release", ["page-1"]);
      const beta = pageById("page-2");
      const ungroupedMenu = pageGroupMenuItems(beta);
      const existing = ungroupedMenu[0].submenu.find((item) => item.label === "Release");
      existing.run();
      const groupedMenu = pageGroupMenuItems(beta);
      const remove = groupedMenu.find((item) => item.label === "Remove from group");
      remove.run();
      const missingCreate = startPageGroupCreation("missing-page");

      // The group still exists through page-1. Remove the rendered header to hit
      // the defensive rename callback path, then execute the remaining menu rows.
      renderPager();
      elements.pagerList.querySelector(`[data-group-toggle="${groupId}"]`)?.remove();
      showPageGroupMenu(pageGroupById(groupId), 10, 10);
      const callbacks = [...elements.contextMenu.querySelectorAll(".ctx-item")];
      const rename = callbacks.find((row) => row.textContent.includes("Rename group"));
      rename.click();
      return {
        joined: beta.groupId === groupId,
        removed: beta.groupId === null,
        missingCreate,
        menuText: elements.contextMenu.textContent
      };
    });

    expect(result.joined).toBe(false); // joined first, then removed by the second callback
    expect(result.removed).toBe(true);
    expect(result.missingCreate).toBeUndefined();
    expect(result.menuText).toContain("Collapse group");
  });

  test("commits an inline rename on blur and protects duplicate editor starts", async () => {
    await page.evaluate(() => createPageGroup("Release", ["page-1"]));
    const header = page.locator(".pager-group-header");
    await page.evaluate(() => {
      const element = document.querySelector(".pager-group-header");
      startPageGroupRename(element);
      startPageGroupRename(element);
    });
    const input = page.locator(".pager-group-rename");
    await input.fill("Blurred name");
    await input.evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await input.blur();
    await expect(page.locator(".pager-group-name")).toHaveText("Blurred name");

    await page.evaluate(() => startPageGroupRename(document.querySelector(".pager-group-header")));
    await page.locator(".pager-group-rename").press("ArrowLeft");
    await page.locator(".pager-group-rename").press("Escape");
    await expect(page.locator(".pager-group-name")).toHaveText("Blurred name");

    await page.evaluate(() => startPageRename(document.querySelector(".pager-chip")));
    await page.locator(".pager-rename:not(.pager-group-rename)").fill("Do not keep");
    await page.locator(".pager-rename:not(.pager-group-rename)").press("Escape");
    await expect(page.locator(".pager-name").first()).not.toHaveText("Do not keep");
  });

  test("covers missing controls and collapsed group menu actions", async () => {
    const result = await page.evaluate(() => {
      const groupId = createPageGroup("Release", ["page-1"]);
      const originalButton = elements.pagerGroup;
      const originalBands = elements.pagerGroupPages;
      elements.pagerGroup = null;
      updatePageGroupButton();
      elements.pagerGroup = originalButton;
      elements.pagerGroupPages = null;
      updatePageGroupButton();
      elements.pagerGroupPages = originalBands;

      const originalQuery = elements.pagerList.querySelector.bind(elements.pagerList);
      elements.pagerList.querySelector = () => null;
      startPageGroupCreation("page-2");
      elements.pagerList.querySelector = originalQuery;

      setPageGroupCollapsed(groupId, true);
      showPageGroupMenu(pageGroupById(groupId), 10, 10);
      const expand = [...elements.contextMenu.querySelectorAll(".ctx-item")]
        .find((row) => row.textContent.includes("Expand group"));
      expand.click();

      const fake = document.createElement("button");
      fake.dataset.groupToggle = "missing";
      elements.pagerList.append(fake);
      fake.click();
      fake.remove();
      return {
        expanded: pageGroupById(groupId).collapsed === false,
        secondGroup: Boolean(pageById("page-2").groupId)
      };
    });
    expect(result).toEqual({ expanded: true, secondGroup: true });
  });

  test("covers drag guards, accepted movement, and rollback", async () => {
    const result = await page.evaluate(() => {
      renderPager();
      const first = elements.pagerList.querySelector('[data-page-id="page-1"]');
      const second = elements.pagerList.querySelector('[data-page-id="page-2"]');
      draggedPageId = "missing";
      moveDraggedPage(second, true);
      draggedPageId = "page-1";
      moveDraggedPage(first, true);
      const beforeAdjacent = state.pages.map((entry) => entry.id);
      moveDraggedPage(second, false);
      const moved = state.pages.map((entry) => entry.id);

      // Roll the changed DOM order back through the same dragend path the browser uses.
      originalPageOrder = beforeAdjacent.map((id) => ({ id, groupId: null }));
      pageDragChanged = true;
      pageDropAccepted = false;
      first.dispatchEvent(new DragEvent("dragend", { bubbles: true }));
      const rolledBack = state.pages.map((entry) => entry.id);

      draggedPageId = "page-1";
      originalPageOrder = rolledBack.map((id) => ({ id, groupId: null }));
      pageDragChanged = true;
      pageDropAccepted = true;
      elements.pagerList.querySelector('[data-page-id="page-1"]')
        .dispatchEvent(new DragEvent("dragend", { bubbles: true }));
      return { beforeAdjacent, moved, rolledBack, accepted: pageDropAccepted };
    });

    expect(result.moved).not.toEqual(result.beforeAdjacent);
    expect(result.rolledBack).toEqual(result.beforeAdjacent);
    expect(result.accepted).toBe(false); // dragend resets its state
  });

  test("moves a dragged tab into group and bar drop zones", async () => {
    const groupId = await page.evaluate(() => createPageGroup("Drop group", ["page-1"]));
    const beta = page.locator('[data-page-id="page-2"]');
    const groupZone = page.locator(`[data-group-id="${groupId}"] .pager-group-chips`);
    const transfer = await page.evaluateHandle(() => new DataTransfer());

    await beta.dispatchEvent("dragstart", { dataTransfer: transfer });
    await groupZone.dispatchEvent("dragover", { dataTransfer: transfer });
    await groupZone.dispatchEvent("dragover", { dataTransfer: transfer });
    await groupZone.dispatchEvent("drop", { dataTransfer: transfer });
    await beta.dispatchEvent("dragend", { dataTransfer: transfer });
    expect(await page.evaluate(() => pageById("page-2").groupId)).toBe(groupId);

    const freshBeta = page.locator('[data-page-id="page-2"]');
    await freshBeta.dispatchEvent("dragstart", { dataTransfer: transfer });
    await page.locator("#pagerList").dispatchEvent("dragover", { dataTransfer: transfer });
    await page.locator("#pagerList").dispatchEvent("drop", { dataTransfer: transfer });
    await freshBeta.dispatchEvent("dragend", { dataTransfer: transfer });
    expect(await page.evaluate(() => pageById("page-2").groupId)).toBeNull();

    const before = await page.evaluate(() => pageGroupById("group-1")?.collapsed ?? false);
    await page.evaluate(() => document.querySelector(".pager-group-header")
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    await page.evaluate(() => elements.pagerList
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(await page.evaluate(() => pageGroupById("group-1")?.collapsed ?? false)).toBe(before);
  });

  test("labels singular and plural minimized counts", async () => {
    const result = await page.evaluate(() => {
      const original = state.terminals;
      const page = { id: "parked", name: "Parked", groupId: null };
      const terminal = (id) => ({ id, pageId: page.id, minimized: true });
      state.terminals = new Map([["one", terminal("one")]]);
      const singular = buildPageChip(page).querySelector(".pager-parked").title;
      state.terminals.set("two", terminal("two"));
      const plural = buildPageChip(page).querySelector(".pager-parked").title;
      state.terminals = original;
      return { singular, plural };
    });
    expect(result).toEqual({ singular: "1 minimized terminal", plural: "2 minimized terminals" });
  });

  test("covers partial pager sync, missing rollback pages, and button context menus", async () => {
    const result = await page.evaluate(() => {
      const groupId = createPageGroup("Collapsed", ["page-1", "page-2"]);
      setPageGroupCollapsed(groupId, true);
      const before = state.pages.map((entry) => entry.id);
      syncPageOrderFromPager();
      const after = state.pages.map((entry) => entry.id);
      setPageGroupCollapsed(groupId, false);

      originalPageOrder = [
        { id: "missing", groupId: null },
        ...state.pages.map((entry) => ({ id: entry.id, groupId: entry.groupId }))
      ];
      pageDragChanged = true;
      pageDropAccepted = false;
      elements.pagerList.querySelector(".pager-chip").dispatchEvent(new DragEvent("dragend", { bubbles: true }));

      elements.pagerAdd.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      return { before, after, pageCount: state.pages.length };
    });
    expect(result.after).toEqual(result.before);
    expect(result.pageCount).toBe(3);
  });

  test("saves and restores page groups with a workspace", async () => {
    const result = await page.evaluate(() => {
      state.workspaces = {};
      const groupId = createPageGroup("Workspace group", ["page-1", "page-2"]);
      setPageGroupCollapsed(groupId, true);
      saveWorkspace("Grouped workspace");
      const saved = structuredClone(state.workspaces["Grouped workspace"]);
      state.pages = [{ id: "other", name: "Other", groupId: null }];
      state.pageGroups = [];
      state.activePageId = "other";
      restoreWorkspace("Grouped workspace");
      const restored = {
        pages: state.pages.map((entry) => ({ ...entry })),
        groups: state.pageGroups.map((entry) => ({ ...entry })),
        activePageId: state.activePageId
      };
      delete state.workspaces["Grouped workspace"];
      saveWorkspaces();
      return { saved, restored };
    });

    expect(result.saved.pages.filter((entry) => entry.groupId)).toHaveLength(2);
    expect(result.saved.pageGroups).toEqual([{ id: expect.any(String), name: "Workspace group", collapsed: true }]);
    expect(result.restored.groups).toEqual(result.saved.pageGroups);
    expect(result.restored.pages.map((entry) => entry.groupId)).toEqual(result.saved.pages.map((entry) => entry.groupId));
    expect(result.restored.activePageId).toBe(result.saved.activePageId);
  });

  test("restores legacy workspace page and group defaults", async () => {
    const result = await page.evaluate(() => {
      state.workspaces = {
        "No groups": {
          settings: {},
          pages: [{ id: "legacy", name: "", groupId: null }],
          pageGroups: null,
          activePageId: "missing",
          terminals: []
        },
        "Default group": {
          settings: {},
          pages: [{ id: "grouped", name: "Grouped", groupId: "g" }],
          pageGroups: [{ id: "g", name: "", collapsed: false }, null, { id: "", name: "ignored" }],
          activePageId: "grouped",
          terminals: []
        }
      };
      restoreWorkspace("No groups");
      const noGroups = {
        page: { ...state.pages[0] },
        groups: [...state.pageGroups],
        active: state.activePageId
      };
      restoreWorkspace("Default group");
      const defaultGroup = { ...state.pageGroups[0] };
      state.workspaces = {};
      saveWorkspaces();
      return { noGroups, defaultGroup };
    });
    expect(result.noGroups).toEqual({
      page: { id: "legacy", name: "Page", groupId: null },
      groups: [],
      active: "legacy"
    });
    expect(result.defaultGroup).toEqual({ id: "g", name: "Group", collapsed: false });
  });

  test("reports no page errors", () => {
    expect(errors).toEqual([]);
  });
});
