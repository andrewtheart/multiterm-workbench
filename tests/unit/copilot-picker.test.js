/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const picker = require("../../public/copilot-picker");

// Captured verbatim from Copilot CLI 1.0.83 driving a real /model picker.
const FOOTER = " \u2191/\u2193 to navigate \u00b7 \u2190/\u2192 reasoning effort \u00b7 tab context window "
  + "\u00b7 shift+tab group: recommended \u00b7 enter to select \u00b7 esc to cancel";

// The context column is colour-coded, so rows carry tokens as well as text.
const row = (text, tokens = []) => ({ text, tokens });

const OPUS_46 = (selectedTier) => row(
  " \u276f Claude Opus 4.6            264K 1M    \u2190 Medium \u2192",
  [{ text: "264K", selected: selectedTier === "264K" }, { text: "1M", selected: selectedTier === "1M" }]
);

describe("Copilot /model picker", () => {
  test("recognises the picker only by its own footer", () => {
    expect(picker.isPickerOpen([FOOTER])).toBe(true);
    expect(picker.isPickerOpen(["  Claude Opus 5 \u2713            1M         Extra High"])).toBe(false);
    expect(picker.isPickerOpen([])).toBe(false);
    // A screen reader that has nothing to offer is "closed", not a crash.
    expect(picker.isPickerOpen(null)).toBe(false);
  });

  test("maps every rung of the reasoning ladder to the label the TUI renders", () => {
    expect(picker.EFFORT_STEPS.map((step) => step.value)).toEqual([
      "none", "minimal", "low", "medium", "high", "xhigh", "max"
    ]);
    expect(picker.effortLabel("xhigh")).toBe("Extra High");
    expect(picker.effortLabel("Extra High")).toBe("Extra High");
    expect(picker.effortIndex("MEDIUM")).toBe(3);
    // An unknown rung reads as absent so nothing plans keys towards it.
    expect(picker.effortLabel("turbo")).toBe("");
    expect(picker.effortIndex("turbo")).toBe(-1);
  });

  test("reads the cursor row the TUI actually renders", () => {
    const read = picker.readCursorRow([
      row("   Recent models"),
      OPUS_46("264K"),
      row("   Claude Opus 5 \u2713            1M         Extra High")
    ]);
    expect(read.name).toBe("Claude Opus 4.6");
    expect(read.effort).toBe("Medium");
    expect(read.effortValue).toBe("medium");
    expect(read.tierChoices).toEqual(["264K", "1M"]);
    expect(read.tier).toBe("264K");
    expect(read.tierToggleable).toBe(true);
    // The cursor opens on a Recent row, not on the model actually in use.
    expect(read.active).toBe(false);
  });

  test("sees the tier move when only the colour changed", () => {
    // Both screens carry byte-identical text; only the colour differs.
    const before = picker.readCursorRow([OPUS_46("264K")]);
    const after = picker.readCursorRow([OPUS_46("1M")]);
    expect(before.tier).toBe("264K");
    expect(after.tier).toBe("1M");
  });

  test("treats a single-tier model as not toggleable", () => {
    const read = picker.readCursorRow([
      row(" \u276f Claude Opus 5 \u2713            1M         Extra High", [{ text: "1M", selected: true }])
    ]);
    expect(read.name).toBe("Claude Opus 5");
    expect(read.active).toBe(true);
    expect(read.effortValue).toBe("xhigh");
    expect(read.tierToggleable).toBe(false);
  });

  test("reports no row when the cursor is absent", () => {
    expect(picker.readCursorRow([row("   Claude Opus 4.8            264K       Medium")])).toBe(null);
    expect(picker.readCursorRow(null)).toBe(null);
  });

  test("reads a row that carries no context column and no effort", () => {
    const read = picker.readCursorRow([
      // A blank spacer row the TUI paints above the list carries no text at all.
      {},
      { text: " \u276f Search models\u2026" }
    ]);
    expect(read.name).toBe("Search models\u2026");
    expect(read.effort).toBe("");
    expect(read.effortValue).toBe("");
    expect(read.tierChoices).toEqual([]);
    expect(read.tier).toBe("");
    expect(read.tierToggleable).toBe(false);
  });

  test("reads an effort the ladder does not know as no effort", () => {
    // A future CLI rung must not be reported as a value nothing can plan for.
    const read = picker.readCursorRow([row(" \u276f Claude Opus 4.6            264K 1M    \u2190 Turbo \u2192")]);
    expect(read.name).toBe("Claude Opus 4.6");
    expect(read.effort).toBe("");
    expect(read.effortValue).toBe("");
  });

  test("reports an unknown tier when no context token is highlighted", () => {
    // Colour extraction can fail; the tier is then unknown rather than guessed.
    const read = picker.readCursorRow([OPUS_46("")]);
    expect(read.tierChoices).toEqual(["264K", "1M"]);
    expect(read.tier).toBe("");
    expect(read.tierToggleable).toBe(true);
    expect(picker.planTierKeys(read, "1M")).toMatchObject({ ok: false, keys: [] });
  });

  test("steps reasoning effort the short way in each direction", () => {
    expect(picker.planEffortKeys("medium", "high").keys).toEqual(["right"]);
    expect(picker.planEffortKeys("Medium", "Extra High").keys).toEqual(["right", "right"]);
    expect(picker.planEffortKeys("xhigh", "low").keys).toEqual(["left", "left", "left"]);
    expect(picker.planEffortKeys("high", "high").keys).toEqual([]);
  });

  test("refuses an effort plan it cannot express", () => {
    expect(picker.planEffortKeys("medium", "turbo")).toMatchObject({ ok: false });
    expect(picker.planEffortKeys("", "high")).toMatchObject({ ok: false });
  });

  test("plans the tier toggle and refuses what the model cannot do", () => {
    const two = picker.readCursorRow([OPUS_46("264K")]);
    expect(picker.planTierKeys(two, "1M").keys).toEqual(["tab"]);
    expect(picker.planTierKeys(two, "264K").keys).toEqual([]);
    expect(picker.planTierKeys(two, "512K")).toMatchObject({ ok: false });

    const one = picker.readCursorRow([
      row(" \u276f Claude Opus 5 \u2713            1M         Extra High", [{ text: "1M", selected: true }])
    ]);
    // Asserting `ok` and not just the empty key list: both contracts produce no
    // keys here, so only `ok` can catch a regression back to refusing this.
    expect(picker.planTierKeys(one, "1M")).toMatchObject({ ok: true, keys: [] });
    expect(picker.planTierKeys(one, "264K")).toMatchObject({ ok: false });
  });

  test("leaves the context window alone when no tier was asked for", () => {
    const two = picker.readCursorRow([OPUS_46("264K")]);
    expect(picker.planTierKeys(two, "")).toMatchObject({ ok: true, reason: "", keys: [] });
    expect(picker.planTierKeys(null, "  ")).toMatchObject({ ok: true, keys: [] });
  });

  test("refuses to Tab a row whose context window cannot be toggled", () => {
    // Built by hand: the guard defends `planTierKeys` against any row descriptor
    // that offers a choice the TUI will not actually step through.
    const locked = { tierChoices: ["264K", "1M"], tier: "264K", tierToggleable: false };
    expect(picker.planTierKeys(locked, "1M")).toMatchObject({
      ok: false,
      reason: "This model has a single context window",
      keys: []
    });
  });

  test("never returns a partial plan", () => {
    // A half-applied plan would leave the session in a state nobody asked for.
    for (const plan of [
      picker.planEffortKeys("medium", "turbo"),
      picker.planTierKeys(null, "1M"),
      picker.planTierKeys(picker.readCursorRow([OPUS_46("264K")]), "9M")
    ]) {
      expect(plan.ok).toBe(false);
      expect(plan.keys).toEqual([]);
      expect(plan.reason).not.toBe("");
    }
  });
});
