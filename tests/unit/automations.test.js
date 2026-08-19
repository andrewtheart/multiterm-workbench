/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const automations = require("../../public/automations");

function rule(overrides = {}) {
  return {
    actions: [{ command: "npm test", id: "action-12345678", submit: true, targetName: "Tests" }],
    createdAt: "2026-08-04T10:00:00.000Z",
    enabled: true,
    id: "automation-12345678",
    name: "Run tests",
    trigger: { catchUp: "skip", intervalMinutes: 30, mode: "interval", type: "schedule" },
    ...overrides
  };
}

describe("automations model", () => {
  it("normalizes new-terminal targets while preserving legacy named targets", () => {
    expect(automations.normalizeAction({
      command: "npm test",
      id: "action-newterm1",
      pageMode: "new",
      targetMode: "new",
      targetName: "Old terminal"
    })).toMatchObject({ pageMode: "new", pageName: "", targetMode: "new", targetName: "" });
    expect(automations.normalizeAction({
      command: "npm test",
      id: "action-legacy1",
      targetName: "Tests"
    })).toMatchObject({ pageMode: "current", pageName: "", targetMode: "title", targetName: "Tests" });
    expect(automations.normalizeAction({
      command: "npm test",
      id: "action-page-name1",
      pageMode: "existing",
      pageName: "  Build output  ",
      targetMode: "new"
    })).toMatchObject({ pageMode: "existing", pageName: "Build output" });
  });

  it("normalizes PID targeting, default fallback, CWD, account, and conditional chains", () => {
    const normalized = automations.normalizeRule(rule({
      runAs: "CONTOSO\\andre",
      type: "command",
      actions: [
        {
          command: "npm test",
          cwd: "D:\\repo",
          fallbackToNew: false,
          id: "action-first123",
          inputType: "powershell",
          targetMode: "pid",
          targetPid: 4242
        },
        {
          command: "npm run report",
          condition: "failure",
          conditionOperator: "any",
          dependsOn: ["action-first123", "missing"],
          id: "action-second12",
          targetMode: "new"
        }
      ]
    }));

    expect(normalized).toMatchObject({ runAs: "CONTOSO\\andre", type: "command" });
    expect(normalized.actions[0]).toMatchObject({
      cwd: "D:\\repo",
      fallbackToNew: false,
      inputType: "powershell",
      targetMode: "pid",
      targetPid: 4242
    });
    expect(normalized.actions[1]).toMatchObject({
      condition: "failure",
      conditionOperator: "any",
      dependsOn: ["action-first123"],
      fallbackToNew: false,
      targetMode: "new"
    });
  });

  it("normalizes output match conditions without weakening existing gates", () => {
    const outputMatch = automations.normalizeAction({
      command: "publish",
      condition: "output-not-match",
      id: "action-output12",
      outputMatchAcrossLines: true,
      outputMatchCaseSensitive: true,
      outputMatchType: "regex",
      outputMatchValue: "Build\\s+failed",
      targetName: "Tests"
    });
    expect(outputMatch).toMatchObject({
      condition: "output-not-match",
      outputMatchAcrossLines: true,
      outputMatchCaseSensitive: true,
      outputMatchType: "regex",
      outputMatchValue: "Build\\s+failed"
    });

    expect(automations.normalizeAction({
      command: "publish",
      condition: "unknown",
      outputMatchType: "unknown",
      targetName: "Tests"
    })).toMatchObject({
      condition: "success",
      outputMatchAcrossLines: false,
      outputMatchCaseSensitive: false,
      outputMatchType: "contains",
      outputMatchValue: ""
    });
  });

  it("preserves Copilot automation type and repairs unsafe conditional references", () => {
    const normalized = automations.normalizeRule(rule({
      machineState: "locked",
      type: "copilot",
      actions: [
        { command: "Review the build", id: "action-prompt123", targetName: "Copilot" },
        { command: "Summarize failures", id: "action-prompt456", dependsOn: ["later-action999"], targetName: "Copilot" }
      ]
    }));

    expect(normalized).toMatchObject({ machineState: "locked", type: "copilot" });
    expect(normalized.actions[1].dependsOn).toEqual(["action-prompt123"]);
    expect(automations.normalizeRule(rule({ machineState: "unknown" })).machineState).toBe("both");
  });

  it("normalizes title-triggered appearance rules without requiring command actions", () => {
    const normalized = automations.normalizeRule(rule({
      actions: [],
      appearance: {
        background: "#102030",
        foreground: "#f0e0d0",
        fontFamily: "Cascadia Mono",
        headerBackground: {
          angle: 500,
          fontFamily: "Consolas",
          fontSize: 99,
          mode: "gradient",
          stops: [
            { color: "#112233", opacity: 150, position: -5 },
            { color: "#445566", opacity: 70, position: 120 }
          ],
          type: "linear"
        }
      },
      titleMatch: { caseSensitive: true, type: "equals", value: "Production" },
      type: "appearance"
    }));

    expect(normalized).toMatchObject({
      actions: [],
      appearance: {
        background: "#102030",
        foreground: "#F0E0D0",
        fontFamily: "Cascadia Mono",
        headerBackground: { angle: 140, fontFamily: "Consolas", fontSize: 20 }
      },
      titleMatch: { caseSensitive: true, type: "equals", value: "Production" },
      type: "appearance"
    });
    expect(normalized.appearance.headerBackground.stops).toEqual([
      { color: "#112233", opacity: 100, position: 0 },
      { color: "#445566", opacity: 70, position: 100 }
    ]);
    expect(automations.nextScheduledAt(normalized)).toBeNull();
    expect(automations.scheduleIsDue(normalized, new Date("2026-08-04T12:00:00Z"))).toBe(false);
  });

  it("matches appearance titles by contains, equality, regex, and letter case", () => {
    expect(automations.titleMatches({ type: "contains", value: "build" }, "Nightly BUILD output")).toBe(true);
    expect(automations.titleMatches({ caseSensitive: true, type: "contains", value: "build" }, "BUILD")).toBe(false);
    expect(automations.titleMatches({ type: "equals", value: "api" }, "API")).toBe(true);
    expect(automations.titleMatches({ caseSensitive: true, type: "equals", value: "api" }, "API")).toBe(false);
    expect(automations.titleMatches({ type: "regex", value: "^(prod|stage)-\\d+$" }, "PROD-42")).toBe(true);
    expect(automations.titleMatches({ type: "regex", value: "[" }, "anything")).toBe(false);
    expect(automations.titleMatchValidationError({ type: "regex", value: "^api-\\d+-\\w+$" })).toBe("");
    expect(automations.titleMatchValidationError({ type: "regex", value: "(a+)+$" })).toMatch(/ambiguous repetition/i);
    expect(automations.titleMatchValidationError({ type: "regex", value: "(a|aa)+$" })).toMatch(/ambiguous repetition/i);
    expect(automations.titleMatchValidationError({ type: "regex", value: ".*.*terminal" })).toMatch(/ambiguous repetition/i);
    expect(automations.titleMatchValidationError({ type: "regex", value: "(a+)a+$" })).toMatch(/ambiguous repetition/i);
    expect(automations.titleMatchValidationError({ type: "regex", value: "(a)\\1" })).toMatch(/backreferences/i);
    expect(automations.titleMatchValidationError({ type: "regex", value: "(a)\\1" })).not.toMatch(/lookarounds|repetition/i);
    expect(automations.titleMatchValidationError({ type: "regex", value: "(?=prod)prod" })).toMatch(/lookarounds/i);
    expect(automations.titleMatchValidationError({ type: "regex", value: "(?=prod)prod" })).not.toMatch(/backreferences|repetition/i);
    expect(automations.titleMatchValidationError({ type: "regex", value: "(a|b)*x" })).toMatch(/alternation group/i);
    expect(automations.normalizeRule(rule({ actions: [], type: "appearance", titleMatch: { value: "x" } }))).toBeNull();
    expect(automations.normalizeRule(rule({
      actions: [],
      appearance: {
        background: "#102030",
        foreground: "#F0E0D0",
        fontFamily: "Consolas",
        headerBackground: { color: "#112233", mode: "solid" }
      },
      titleMatch: { type: "regex", value: "(a+)+$" },
      type: "appearance"
    }))).toBeNull();
  });

  it("compiles a reusable title matcher that agrees with single-shot matching", () => {
    const matcher = automations.compileTitleMatcher({ type: "regex", value: "^api-\\d+$" });
    expect(matcher).toMatchObject({ caseSensitive: false, type: "regex", value: "^api-\\d+$" });
    for (const title of ["API-1", "api-22", "api-1", "other"]) {
      expect(matcher.test(title)).toBe(automations.titleMatches({ type: "regex", value: "^api-\\d+$" }, title));
    }
    expect(matcher.test("api-7")).toBe(true);
    expect(matcher.test("api-7")).toBe(true);

    expect(automations.compileTitleMatcher({ type: "contains", value: "build" }).test("Nightly BUILD")).toBe(true);
    expect(automations.compileTitleMatcher({ caseSensitive: true, type: "equals", value: "api" }).test("API")).toBe(false);
    expect(automations.compileTitleMatcher({ type: "regex", value: "(a+)+$" })).toBeNull();
    expect(automations.compileTitleMatcher({ type: "contains", value: "" })).toBeNull();
  });

  it("normalizes rules and keeps malformed persisted rules disabled or discarded", () => {
    const store = automations.normalizeStore({
      paused: true,
      rules: [
        rule(),
        { enabled: true, id: "bad", name: "No action", trigger: { mode: "daily" } },
        rule({ id: "also bad", enabled: "yes", trigger: { mode: "weekly", days: [5, 1, 5, 99], time: "7:05" } })
      ]
    });

    expect(store.paused).toBe(true);
    expect(store.rules).toHaveLength(2);
    expect(store.rules[0]).toMatchObject({ enabled: true, id: "automation-12345678" });
    expect(store.rules[1]).toMatchObject({
      enabled: false,
      id: "automation-3",
      trigger: { days: [1, 5], mode: "weekly", time: "07:05" }
    });
  });

  it("rejects overlength commands, repairs duplicate IDs, and honors zero retention", () => {
    const duplicate = rule({ id: "automation-duplicate" });
    const store = automations.normalizeStore({
      history: [{ id: "history-12345678", occurredAt: "2026-08-04T10:00:00.000Z", status: "queued", title: "Old" }],
      rules: [
        duplicate,
        { ...duplicate, name: "Second" },
        rule({ actions: [{ command: "x".repeat(8193), id: "action-too-long", targetName: "Tests" }] })
      ]
    }, 0);

    expect(store.history).toEqual([]);
    expect(store.rules).toHaveLength(2);
    expect(new Set(store.rules.map((item) => item.id)).size).toBe(2);
    expect(store.rules.map((item) => item.name)).toEqual(["Run tests", "Second"]);
  });

  it("retains only valid pending staged actions", () => {
    const store = automations.normalizeStore({
      pendingStages: [
        {
          automationId: "automation-stage1",
          createdAt: "2026-08-04T10:00:00.000Z",
          id: "stage-valid1",
          occurrenceKey: "automation-stage1:2026-08-04T10:00:00.000Z:0",
          payload: "git status",
          requiredMode: "copilot",
          targetId: "target-session1",
          title: "Stage status"
        },
        { id: "stage-missing1", payload: "git status" },
        { id: "stage-longcmd1", payload: "x".repeat(8193), targetId: "target-session1" }
      ]
    });

    expect(store.pendingStages).toHaveLength(1);
    expect(store.pendingStages[0]).toMatchObject({
      id: "stage-valid1",
      payload: "git status",
      requiredMode: "copilot",
      targetId: "target-session1"
    });
  });

  it("computes interval recurrences from their wall-clock anchor without drift", () => {
    const next = automations.nextScheduledAt(rule(), new Date("2026-08-04T11:17:00.000Z"));
    expect(next.toISOString()).toBe("2026-08-04T11:30:00.000Z");
    expect(automations.scheduleIsDue(rule(), new Date("2026-08-04T10:29:59.000Z"))).toBe(false);
    expect(automations.scheduleIsDue(rule(), new Date("2026-08-04T10:30:00.000Z"))).toBe(true);
  });

  it("computes daily and selected-weekday recurrences in local wall-clock time", () => {
    const daily = automations.nextScheduledAt(
      rule({ trigger: { mode: "daily", time: "09:15" } }),
      new Date(2026, 7, 4, 9, 15, 0)
    );
    expect([daily.getFullYear(), daily.getMonth(), daily.getDate(), daily.getHours(), daily.getMinutes()])
      .toEqual([2026, 7, 5, 9, 15]);

    const weekly = automations.nextScheduledAt(
      rule({ trigger: { days: [1, 3, 5], mode: "weekly", time: "08:30" } }),
      new Date(2026, 7, 4, 12, 0, 0)
    );
    expect(weekly.getDay()).toBe(3);
    expect([weekly.getHours(), weekly.getMinutes()]).toEqual([8, 30]);
  });

  it("extracts the latest complete handoff after a bounded marker row", () => {
    const rows = [
      { row: 100, text: "Earlier output" },
      { row: 101, text: "**HAND OFF** Old terminal" },
      { row: 102, text: "Old payload" },
      { row: 110, text: "**HAND OFF** Tests and checks" },
      { row: 111, text: "Run the focused tests." },
      { row: 112, text: "Include changed file names." },
      { row: 113, text: "← open sidebar · / commands · ? help" }
    ];

    expect(automations.extractLatestHandoff(rows, 101)).toEqual({
      markerRow: 110,
      payload: "Run the focused tests.\nInclude changed file names.",
      targetName: "Tests and checks"
    });
    expect(automations.extractLatestHandoff(rows, 110)).toBeNull();
  });

  it("supports an unnamed handoff and rejects an empty payload", () => {
    expect(automations.extractLatestHandoff([
      { row: 3, text: "**HAND OFF**" },
      { row: 4, text: "Continue from this context." }
    ])).toMatchObject({ markerRow: 3, targetName: "", payload: "Continue from this context." });
    expect(automations.extractLatestHandoff(["**HAND OFF** Consumer", "/ commands · ? help"])).toBeNull();
  });
});
