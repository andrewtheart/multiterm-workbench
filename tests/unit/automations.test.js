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

  it("keeps background execution opt-in and refuses it for appearance rules", () => {
    expect(automations.normalizeRule(rule()).runWhenClosed).toBe("off");
    expect(automations.normalizeRule(rule({ runWhenClosed: "background", type: "copilot" })).runWhenClosed)
      .toBe("background");
    expect(automations.normalizeRule(rule({ runWhenClosed: "always" })).runWhenClosed).toBe("off");
    expect(automations.normalizeRule(rule({
      actions: [],
      appearance: {
        background: "#102030",
        foreground: "#f0e0d0",
        fontFamily: "Cascadia Mono",
        headerBackground: {
          angle: 140,
          mode: "gradient",
          stops: [
            { color: "#112233", opacity: 100, position: 0 },
            { color: "#445566", opacity: 70, position: 100 }
          ],
          type: "linear"
        }
      },
      runWhenClosed: "background",
      titleMatch: { type: "contains", value: "build" },
      type: "appearance"
    })).runWhenClosed).toBe("off");

    const store = automations.normalizeStore({
      rules: [rule({ id: "automation-bg000001", runWhenClosed: "background", type: "copilot" })]
    });
    expect(store.rules[0].runWhenClosed).toBe("background");
    expect(automations.normalizeStore(store).rules[0].runWhenClosed).toBe("background");
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

  it("accepts bounded regular-expression structures without permitting ambiguous repetition", () => {
    for (const pattern of [
      "a+?",
      "a{0}",
      "a{2}",
      "a{2,}",
      "a{2,4}",
      "a{word}",
      "(?:ab)+",
      "(?<word>ab)+",
      "[^\\]]+",
      "a+ba+"
    ]) {
      expect(automations.titleMatchValidationError({ type: "regex", value: pattern }), pattern).toBe("");
    }
    expect(automations.titleMatchValidationError(null)).toMatch(/Enter title text/i);
    expect(automations.compileTitleMatcher({ type: "contains", value: "build" }).test(null)).toBe(false);
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

  it("defaults malformed triggers and preserves one-time catch-up", () => {
    expect(automations.normalizeTrigger(null)).toMatchObject({
      catchUp: "skip",
      intervalMinutes: 60,
      mode: "interval",
      time: "09:00"
    });
    expect(automations.normalizeTrigger({
      catchUp: "once",
      days: "weekdays",
      intervalMinutes: "bad",
      mode: "unknown",
      time: "99:99"
    })).toEqual({
      catchUp: "once",
      days: [1, 2, 3, 4, 5],
      intervalMinutes: 60,
      mode: "interval",
      time: "23:59",
      type: "schedule"
    });
    expect(automations.terminalName("  Build   Output  ")).toBe("build output");
  });

  it("rejects malformed appearances and normalizes fallback header values", () => {
    expect(automations.normalizeAppearance(null)).toBeNull();
    expect(automations.normalizeAppearance([])).toBeNull();
    const appearance = {
      background: "#102030",
      foreground: "#f0e0d0",
      fontFamily: "Consolas"
    };
    expect(automations.normalizeAppearance({
      ...appearance,
      headerBackground: { mode: "solid" }
    })).toBeNull();
    expect(automations.normalizeAppearance({
      ...appearance,
      headerBackground: {
        mode: "gradient",
        stops: [null, { color: "invalid" }, { color: "#112233" }]
      }
    })).toBeNull();
    expect(automations.normalizeAppearance({
      ...appearance,
      headerBackground: {
        angle: "invalid",
        centerX: "invalid",
        centerY: "invalid",
        fontSize: "invalid",
        mode: "solid",
        shape: "circle",
        stops: [{ color: "#112233", opacity: "invalid", position: "invalid" }],
        type: "radial"
      }
    })).toMatchObject({
      headerBackground: {
        angle: 135,
        centerX: 50,
        centerY: 50,
        color: "#112233",
        fontSize: 0,
        shape: "circle",
        type: "radial"
      }
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
    expect(automations.normalizePendingStage(null)).toBeNull();
    expect(automations.normalizePendingStage({ payload: " git status ", targetId: "target-session2" }, 4))
      .toMatchObject({
        automationId: null,
        id: "stage-5",
        payload: "git status",
        requiredMode: "",
        targetId: "target-session2",
        title: "Automation"
      });
  });

  it("repairs malformed persisted history entries", () => {
    const store = automations.normalizeStore({ history: [null, {}] }, "invalid");
    expect(store.history).toHaveLength(1);
    expect(store.history[0]).toMatchObject({
      automationId: null,
      background: false,
      id: "history-2",
      status: "failed",
      title: "Automation"
    });
    expect(new Date(store.history[0].occurredAt).getTime()).not.toBeNaN();
  });

  it("keeps the background marker on history entries across a round trip", () => {
    const store = automations.normalizeStore({
      history: [
        { background: true, id: "history-bg1", status: "completed", title: "Overnight review" },
        { background: "yes", id: "history-bg2", status: "failed", title: "Coerced" }
      ]
    });
    expect(store.history.map((entry) => entry.background)).toEqual([true, false]);
    expect(automations.normalizeStore(store).history.map((entry) => entry.background)).toEqual([true, false]);
  });

  it("computes interval recurrences from their wall-clock anchor without drift", () => {
    const next = automations.nextScheduledAt(rule(), new Date("2026-08-04T11:17:00.000Z"));
    expect(next.toISOString()).toBe("2026-08-04T11:30:00.000Z");
    expect(automations.scheduleIsDue(rule(), new Date("2026-08-04T10:29:59.000Z"))).toBe(false);
    expect(automations.scheduleIsDue(rule(), new Date("2026-08-04T10:30:00.000Z"))).toBe(true);
    expect(automations.nextScheduledAt(rule({ createdAt: "2026-08-04T13:00:00.000Z" }), "2026-08-04T12:00:00.000Z")?.toISOString())
      .toBe("2026-08-04T13:00:00.000Z");
    expect(automations.nextScheduledAt(rule(), "invalid")).toBeNull();
    expect(automations.nextScheduledAt(rule({ createdAt: "invalid" }), new Date("2026-08-04T12:00:00.000Z"))?.toISOString())
      .toBe("2026-08-04T12:30:00.000Z");
    expect(automations.scheduleIsDue(rule({ lastRunAt: "2026-08-04T10:00:00.000Z" }), new Date("2026-08-04T10:30:00.000Z")))
      .toBe(true);
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
    expect(automations.extractLatestHandoff([
      { text: "**HAND OFF** Indexed" },
      { text: "Continue from this context." }
    ])).toMatchObject({ markerRow: 0, targetName: "Indexed" });
  });
});

const TOKEN = "MULTITERM_COND_TESTTOKEN";

function conditionRule(overrides = {}, condition = {}) {
  return {
    condition: {
      action: "Delete the file",
      cwd: "D:\\Incoming",
      prompt: "A new file has been written to D:\\Incoming since the last check",
      ...condition
    },
    createdAt: "2026-09-01T10:00:00.000Z",
    enabled: true,
    id: "automation-condition1",
    name: "Watch Incoming",
    trigger: { catchUp: "skip", intervalMinutes: 15, mode: "interval", type: "schedule" },
    type: "condition",
    ...overrides
  };
}

describe("conditional Copilot automations", () => {
  describe("rule normalization", () => {
    it("accepts a complete condition rule and clears the action list", () => {
      const normalized = automations.normalizeRule(conditionRule());
      expect(normalized).toMatchObject({ type: "condition", actions: [] });
      expect(normalized.condition).toMatchObject({
        action: "Delete the file",
        closeWhenDone: true,
        cwd: "D:\\Incoming",
        inheritSessionPermissions: false,
        keepState: true,
        sessionMode: "hidden",
        targetMode: "title",
        targetName: "",
        targetPid: null
      });
      expect(normalized.condition.tools.mode).toBe("all");
    });

    it("rejects a condition rule missing any of prompt, action, or working directory", () => {
      expect(automations.normalizeRule(conditionRule({}, { prompt: "" }))).toBeNull();
      expect(automations.normalizeRule(conditionRule({}, { action: "  " }))).toBeNull();
      expect(automations.normalizeRule(conditionRule({}, { cwd: "" }))).toBeNull();
      expect(automations.normalizeRule({ ...conditionRule(), condition: null })).toBeNull();
    });

    it("refuses an existing-session rule that names no terminal", () => {
      expect(automations.normalizeRule(conditionRule({}, { sessionMode: "existing" }))).toBeNull();
      expect(automations.normalizeRule(conditionRule({}, {
        sessionMode: "existing",
        targetMode: "pid",
        targetPid: 0
      }))).toBeNull();
      expect(automations.normalizeRule(conditionRule({}, {
        sessionMode: "existing",
        targetName: "Agent"
      })).condition).toMatchObject({ sessionMode: "existing", targetMode: "title", targetName: "Agent" });
      expect(automations.normalizeRule(conditionRule({}, {
        sessionMode: "existing",
        targetMode: "pid",
        targetPid: 4242
      })).condition).toMatchObject({ targetMode: "pid", targetPid: 4242, targetName: "" });
    });

    it("keeps targeting fields empty unless the session mode uses them", () => {
      const normalized = automations.normalizeRule(conditionRule({}, {
        sessionMode: "visible",
        targetMode: "pid",
        targetName: "Ignored",
        targetPid: 99
      }));
      expect(normalized.condition).toMatchObject({
        sessionMode: "visible",
        targetMode: "title",
        targetName: "",
        targetPid: null
      });
    });

    it("keeps remembered state within its byte budget and preserves the checked timestamp", () => {
      const within = automations.normalizeRule(conditionRule({
        conditionCheckedAt: "2026-09-01T11:00:00.000Z",
        conditionState: "three files seen"
      }), 0, { stateBytes: 1024 });
      expect(within.conditionState).toBe("three files seen");
      expect(within.conditionCheckedAt).toBe("2026-09-01T11:00:00.000Z");

      const oversized = automations.normalizeRule(
        conditionRule({ conditionState: "a".repeat(2000) }),
        0,
        { stateBytes: 1024 }
      );
      expect(oversized.conditionState).toBe("");
      expect(oversized.conditionCheckedAt).toBeNull();
    });

    it("leaves condition fields inert on other rule types", () => {
      const command = automations.normalizeRule({
        actions: [{ command: "npm test", id: "action-abcdefgh", targetName: "Tests" }],
        conditionState: "ignored",
        createdAt: "2026-09-01T10:00:00.000Z",
        id: "automation-command1",
        name: "Tests",
        type: "command"
      });
      expect(command).toMatchObject({ type: "command", condition: null, conditionState: "", conditionCheckedAt: null });
    });

    it("threads normalization options through the store", () => {
      const store = automations.normalizeStore({
        rules: [conditionRule({ conditionState: "b".repeat(2000) })]
      }, 200, { stateBytes: 1024 });
      expect(store.rules).toHaveLength(1);
      expect(store.rules[0].conditionState).toBe("");
    });

    it("schedules condition rules like any other timed rule", () => {
      const next = automations.nextScheduledAt(
        conditionRule({ lastRunAt: "2026-09-01T10:00:00.000Z" }),
        new Date("2026-09-01T10:05:00.000Z")
      );
      expect(next.toISOString()).toBe("2026-09-01T10:15:00.000Z");
    });
  });

  describe("tool permission specs", () => {
    it("accepts every documented permission shape", () => {
      for (const spec of [
        "shell",
        "shell(git)",
        "shell(git:*)",
        "shell(git push)",
        "shell(gh pr create)",
        "write",
        "write(.env)",
        "write(C:\\logs)",
        "write(src/index.js)",
        "url",
        "url(github.com)",
        "url(https://github.com)",
        "url(https://*.github.com)",
        "MyMCP",
        "MyMCP(my_tool)"
      ]) {
        expect({ spec, error: automations.toolSpecValidationError(spec) }).toEqual({ spec, error: "" });
      }
    });

    it("rejects shell operators, quoting, and control characters", () => {
      for (const spec of [
        "shell(rm); Remove-Item C:\\",
        'shell("rm")',
        "shell(rm) & echo",
        "shell(rm)|echo",
        "shell($env:PATH)",
        "shell(`rm`)",
        "shell(rm)\nwrite",
        "shell(<script>)",
        "shell(rm)\u0007"
      ]) {
        expect({ spec, ok: automations.toolSpecValidationError(spec) === "" }).toEqual({ spec, ok: false });
      }
    });

    it("rejects malformed shapes and out-of-grammar arguments", () => {
      expect(automations.toolSpecValidationError("")).toContain("Enter a tool permission");
      expect(automations.toolSpecValidationError("   ")).toContain("Enter a tool permission");
      expect(automations.toolSpecValidationError(42)).toContain("Enter a tool permission");
      expect(automations.toolSpecValidationError("a".repeat(400))).toContain("limited to");
      expect(automations.toolSpecValidationError("shell()")).toContain("empty parentheses");
      expect(automations.toolSpecValidationError("not a kind")).toContain("kind(argument)");
      expect(automations.toolSpecValidationError("shell(git push origin main here)")).toContain("subcommand");
      expect(automations.toolSpecValidationError("write(has\ttab)")).toContain("control characters");
      expect(automations.toolSpecValidationError("write(a?b)")).toContain("path");
      expect(automations.toolSpecValidationError("url(not a url)")).toContain("domain or URL");
      expect(automations.toolSpecValidationError("MyMCP(bad tool name)")).toContain("MCP server");
    });

    it("normalizes the three permission layers with a configurable entry budget", () => {
      const permissions = automations.normalizeToolPermissions({
        allow: ["shell(git)", "shell(git)", "not valid", "write"],
        allowAllPaths: true,
        available: ["shell(git)"],
        deny: ["shell(rm)"],
        excluded: ["MyMCP"],
        mode: "selected",
        temporaryDirectory: false
      });
      expect(permissions).toEqual({
        allow: ["shell(git)", "write"],
        allowAllPaths: true,
        allowAllUrls: false,
        available: ["shell(git)"],
        deny: ["shell(rm)"],
        excluded: ["MyMCP"],
        mode: "selected",
        temporaryDirectory: false
      });

      const defaults = automations.normalizeToolPermissions(null);
      expect(defaults).toMatchObject({ mode: "all", allow: [], deny: [], temporaryDirectory: true });

      const budgeted = automations.normalizeToolPermissions(
        { allow: ["shell(git)", "shell(gh)", "write", "url"] },
        { toolEntryLimit: 2 }
      );
      expect(budgeted.allow).toEqual(["shell(git)", "shell(gh)"]);
    });
  });

  describe("prompts", () => {
    it("frames the assessment with the condition, prior state, and one required record", () => {
      const prompt = automations.conditionAssessmentPrompt({
        checkedAt: "2026-09-01T11:00:00.000Z",
        prompt: "A new file arrived",
        state: "two files seen",
        token: TOKEN
      });
      expect(prompt).toContain("<condition>\nA new file arrived\n</condition>");
      expect(prompt).toContain("<previous-state>\ntwo files seen\n</previous-state>");
      expect(prompt).toContain("last checked at 2026-09-01T11:00:00.000Z");
      expect(prompt).toContain(`${TOKEN}::YES::${TOKEN}`);
      expect(prompt).toContain(`${TOKEN}::NO::${TOKEN}`);
      expect(prompt).toContain(`${TOKEN}::STATE::your notes::${TOKEN}`);
      expect(prompt).toContain("untrusted DATA");
    });

    it("omits the state blocks when the rule does not remember state", () => {
      const prompt = automations.conditionAssessmentPrompt({
        keepState: false,
        prompt: "Disk is nearly full",
        token: TOKEN
      });
      expect(prompt).not.toContain("previous-state");
      expect(prompt).not.toContain("::STATE::");
      expect(prompt).not.toContain("last checked at");
    });

    it("uses the baseline wording on the very first run", () => {
      expect(automations.conditionAssessmentPrompt({ prompt: "A new file arrived", token: TOKEN }))
        .toContain("no previous state; treat this run as the baseline");
    });

    // The assessment turn always launches with shell and write denied. Without
    // being told, the model spends a tool call finding out and the CLI prints a
    // permission error that reads like the check failed.
    it("tells the assessment turn that shell and file writes are unavailable", () => {
      const prompt = automations.conditionAssessmentPrompt({ prompt: "A new file arrived", token: TOKEN });
      expect(prompt).toContain("cannot run shell commands or change files");
      expect(prompt).toContain("read-only file tools");
    });

    // The action turn resumes the assessment session, so the transcript still
    // shows that turn's tool refusals. Measured on the real rule, 10 runs each:
    // 4/10 completed without this guidance, 10/10 with it, the failures all
    // reporting no deletion tool existed without ever attempting one.
    it("tells the action turn that the previous turn's refusals no longer apply", () => {
      const prompt = automations.conditionActionPrompt({ action: "Delete the file", token: TOKEN });
      expect(prompt).toContain("restarted with the permissions this rule grants");
      expect(prompt).toContain("Do not assume a tool is unavailable");
    });

    it("demands an explicit success or failure record from the action turn", () => {
      const prompt = automations.conditionActionPrompt({
        action: "Delete the file",
        state: "two files seen",
        token: TOKEN
      });
      expect(prompt).toContain("<action>\nDelete the file\n</action>");
      expect(prompt).toContain("<previous-state>\ntwo files seen\n</previous-state>");
      expect(prompt).toContain(`${TOKEN}::ACTION_OK::${TOKEN}`);
      expect(prompt).toContain(`${TOKEN}::ACTION_FAILED::${TOKEN}`);
      expect(prompt).toContain("Never report success for work you did not do.");
      expect(automations.conditionActionPrompt({ action: "Delete", keepState: false, token: TOKEN }))
        .not.toContain("::STATE::");
    });
  });

  describe("result parsing", () => {
    it("reads a single verdict and its state note", () => {
      expect(automations.parseConditionVerdict(
        `working...\n${TOKEN}::YES::${TOKEN}\n${TOKEN}::STATE::a.txt, b.txt::${TOKEN}`,
        TOKEN
      )).toEqual({ error: "", state: "a.txt, b.txt", verdict: "yes" });
      expect(automations.parseConditionVerdict(`${TOKEN}::NO::${TOKEN}`, TOKEN))
        .toEqual({ error: "", state: "", verdict: "no" });
    });

    it("accepts a repeated identical record but refuses conflicting ones", () => {
      expect(automations.parseConditionVerdict(
        `${TOKEN}::YES::${TOKEN}\nsummary\n${TOKEN}::YES::${TOKEN}`,
        TOKEN
      )).toMatchObject({ error: "", verdict: "yes" });
      const conflicting = automations.parseConditionVerdict(
        `${TOKEN}::YES::${TOKEN}\n${TOKEN}::NO::${TOKEN}`,
        TOKEN
      );
      expect(conflicting).toMatchObject({ error: "Copilot returned conflicting result records.", verdict: "" });
    });

    it("reports a missing record and an invalid token instead of guessing", () => {
      expect(automations.parseConditionVerdict("I could not tell.", TOKEN))
        .toMatchObject({ error: "Copilot did not return a result record.", verdict: "" });
      expect(automations.parseConditionVerdict(`${TOKEN}::YES::${TOKEN}`, "short"))
        .toMatchObject({ error: "A valid result token is required.", verdict: "" });
      expect(automations.conditionTokenIsValid(TOKEN)).toBe(true);
      expect(automations.conditionTokenIsValid("lowercase_token")).toBe(false);
    });

    it("captures multi-line state without letting it swallow the closing token", () => {
      const parsed = automations.parseConditionVerdict(
        [
          `${TOKEN}::NO::${TOKEN}`,
          `${TOKEN}::STATE::`,
          "a.txt",
          "b.txt",
          `::${TOKEN}`,
          "trailing chatter"
        ].join("\n"),
        TOKEN
      );
      expect(parsed.verdict).toBe("no");
      expect(parsed.state).toBe("a.txt\nb.txt");
      expect(parsed.state).not.toContain(TOKEN);
    });

    it("reads the action result independently of the verdict keywords", () => {
      expect(automations.parseActionResult(`${TOKEN}::ACTION_OK::${TOKEN}`, TOKEN))
        .toEqual({ error: "", result: "ok", state: "" });
      expect(automations.parseActionResult(
        `${TOKEN}::ACTION_FAILED::${TOKEN}\n${TOKEN}::STATE::still there::${TOKEN}`,
        TOKEN
      )).toEqual({ error: "", result: "failed", state: "still there" });
      expect(automations.parseActionResult(`${TOKEN}::YES::${TOKEN}`, TOKEN))
        .toMatchObject({ error: "Copilot did not return a result record.", result: "" });
      expect(automations.parseActionResult(
        `${TOKEN}::ACTION_OK::${TOKEN}\n${TOKEN}::ACTION_FAILED::${TOKEN}`,
        TOKEN
      )).toMatchObject({ error: "Copilot returned conflicting result records.", result: "" });
    });
  });

  describe("state budget and consent", () => {
    it("measures the state budget in UTF-8 bytes rather than characters", () => {
      expect(automations.conditionStateWithinBudget("a".repeat(1024), 1024)).toBe(true);
      expect(automations.conditionStateWithinBudget("a".repeat(1025), 1024)).toBe(false);
      // 400 characters, but 1200 bytes.
      expect(automations.conditionStateWithinBudget("\u20ac".repeat(400), 1024)).toBe(false);
      expect(automations.conditionStateWithinBudget("", 1024)).toBe(true);
    });

    it("fingerprints the security envelope and ignores cosmetic changes", () => {
      const base = conditionRule({}, { tools: { allow: ["shell(git)", "write"], deny: ["shell(rm)"], mode: "selected" } });
      const reordered = conditionRule({ name: "Renamed" }, {
        tools: { allow: ["write", "shell(git)"], deny: ["shell(rm)"], mode: "selected" }
      });
      expect(automations.conditionConsentFingerprint(base))
        .toBe(automations.conditionConsentFingerprint(reordered));

      const widened = conditionRule({}, {
        tools: { allow: ["shell(git)", "write", "shell"], deny: ["shell(rm)"], mode: "selected" }
      });
      expect(automations.conditionConsentFingerprint(widened))
        .not.toBe(automations.conditionConsentFingerprint(base));

      const denyRemoved = conditionRule({}, { tools: { allow: ["shell(git)", "write"], mode: "selected" } });
      expect(automations.conditionConsentFingerprint(denyRemoved))
        .not.toBe(automations.conditionConsentFingerprint(base));

      const allTools = conditionRule({}, { tools: { allow: ["shell(git)", "write"], deny: ["shell(rm)"], mode: "all" } });
      expect(automations.conditionConsentFingerprint(allTools))
        .not.toBe(automations.conditionConsentFingerprint(base));

      const broaderPaths = conditionRule({}, {
        tools: { allow: ["shell(git)", "write"], allowAllPaths: true, deny: ["shell(rm)"], mode: "selected" }
      });
      expect(automations.conditionConsentFingerprint(broaderPaths))
        .not.toBe(automations.conditionConsentFingerprint(base));

      expect(automations.conditionConsentFingerprint(conditionRule({}, { cwd: "" }))).toBe("");
      expect(automations.conditionConsentFingerprint(null)).toBe("");
    });

    it("re-prompts when a rule switches to inherited session permissions", () => {
      const owned = conditionRule({}, { sessionMode: "existing", targetName: "Build" });
      const inherited = conditionRule({}, {
        inheritSessionPermissions: true,
        sessionMode: "existing",
        targetName: "Build"
      });
      expect(automations.conditionConsentFingerprint(inherited))
        .not.toBe(automations.conditionConsentFingerprint(owned));
    });

    it("keeps the verdict timestamp out of the schedule anchor", () => {
      const normalized = automations.normalizeRule(conditionRule({
        conditionCheckedAt: "2026-09-01T11:45:00.000Z",
        lastRunAt: "2026-09-01T11:00:00.000Z"
      }));
      expect(normalized.lastRunAt).toBe("2026-09-01T11:00:00.000Z");
      expect(normalized.conditionCheckedAt).toBe("2026-09-01T11:45:00.000Z");

      // The next occurrence follows lastRunAt, so advancing a verdict timestamp
      // must never move the schedule forward or skip an occurrence.
      const due = automations.nextScheduledAt(normalized, new Date("2026-09-01T11:50:00.000Z"));
      expect(due.toISOString()).toBe("2026-09-01T12:00:00.000Z");

      const laterVerdict = automations.normalizeRule(conditionRule({
        conditionCheckedAt: "2026-09-01T11:59:00.000Z",
        lastRunAt: "2026-09-01T11:00:00.000Z"
      }));
      expect(automations.nextScheduledAt(laterVerdict, new Date("2026-09-01T11:50:00.000Z")).toISOString())
        .toBe("2026-09-01T12:00:00.000Z");
    });
  });

  describe("interval presets", () => {
    it("offers the documented cadences and maps a stored interval back to one", () => {
      expect(automations.INTERVAL_PRESETS).toContain(15);
      expect(automations.INTERVAL_PRESETS).toContain(45);
      expect(automations.INTERVAL_PRESETS).toContain(1440);
      expect(automations.intervalPresetFor(45)).toBe(45);
      expect(automations.intervalPresetFor("60")).toBe(60);
      expect(automations.intervalPresetFor(37)).toBeNull();
      expect(automations.intervalPresetFor("not a number")).toBeNull();
    });
  });

  describe("defaults and boundaries", () => {
    it("clamps an out-of-range entry budget instead of trusting it", () => {
      const tooMany = automations.normalizeToolPermissions(
        { allow: ["shell(git)", "write", "url"] },
        { toolEntryLimit: 0 }
      );
      expect(tooMany.allow).toEqual(["shell(git)"]);
      const unbounded = automations.normalizeToolPermissions(
        { allow: ["shell(git)", "write"] },
        { toolEntryLimit: 5000 }
      );
      expect(unbounded.allow).toEqual(["shell(git)", "write"]);
    });

    it("carries URL scope through the permission model and the fingerprint", () => {
      expect(automations.normalizeToolPermissions({ allowAllUrls: true }))
        .toMatchObject({ allowAllUrls: true, allowAllPaths: false });
      const base = conditionRule();
      const broaderUrls = conditionRule({}, { tools: { allowAllUrls: true } });
      expect(automations.conditionConsentFingerprint(broaderUrls))
        .not.toBe(automations.conditionConsentFingerprint(base));
      const noTempDirectory = conditionRule({}, { tools: { temporaryDirectory: false } });
      expect(automations.conditionConsentFingerprint(noTempDirectory))
        .not.toBe(automations.conditionConsentFingerprint(base));
    });

    it("fingerprints a bare condition object as well as a whole rule", () => {
      const rule = conditionRule();
      expect(automations.conditionConsentFingerprint(rule.condition))
        .toBe(automations.conditionConsentFingerprint(rule));
    });

    it("treats missing prompt inputs as empty rather than throwing", () => {
      expect(automations.conditionAssessmentPrompt()).toContain("::YES::");
      expect(automations.conditionActionPrompt()).toContain("::ACTION_OK::");
      expect(automations.conditionStateWithinBudget(null, undefined)).toBe(true);
    });
  });
});
