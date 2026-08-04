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
      { row: 113, text: "/ commands · ? help" }
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
