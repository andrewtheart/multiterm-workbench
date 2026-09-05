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

/*
 * Reading and driving the Copilot CLI's `/model` picker.
 *
 * Pure, DOM-free helpers shared by the renderer (loaded as a plain <script>
 * before app.js) and the vitest unit suite. Keep this file free of `window`,
 * `document` and `state` so it stays testable in Node.
 *
 * The picker is a full-screen TUI list. Everything here is derived from what
 * the shipped CLI actually renders (observed against v1.0.83):
 *
 *   ❯ Claude Opus 4.6            264K 1M    ← Medium →                        ┃
 *     Claude Opus 5 ✓            1M         Extra High                        ┃
 *   ↑/↓ to navigate · ←/→ reasoning effort · tab context window · … esc to cancel
 *
 * Two traits of that screen drive the design:
 *
 *  - The SELECTED context tier is carried ONLY by cell colour. The text reads
 *    "264K 1M" whichever tier is active, so a text-only reader is blind to it
 *    and callers must supply per-token colours.
 *  - The cursor opens on the first row of "Recent models", NOT on the active
 *    model (which is the one marked with a tick). Driving keys without first
 *    checking the cursor row edits the wrong model.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  /* v8 ignore start -- the renderer loads this as a classic script, where module is undefined */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CopilotPicker = api;
  }
  /* v8 ignore stop */
})(globalThis, function () {
  "use strict";

  // The order the TUI steps through with ←/→. Labels are what it renders.
  const EFFORT_STEPS = Object.freeze([
    { value: "none", label: "None" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra High" },
    { value: "max", label: "Max" }
  ]);

  const CURSOR_ROW = /^\s*[❯>]\s+/;
  // The footer is the only unambiguous "the picker is open" marker.
  const FOOTER = /to navigate.*reasoning effort.*context window/i;
  const ACTIVE_MARK = /\u2713/;
  const EFFORT_CELL = /[←<]\s*(.+?)\s*[→>]/;
  const CONTEXT_TOKEN = /^(?:\d+(?:\.\d+)?[KM]|\u2014|-)$/;

  function text(value) {
    return String(value == null ? "" : value);
  }

  function isPickerOpen(lines) {
    return (Array.isArray(lines) ? lines : []).some((line) => FOOTER.test(text(line)));
  }

  function effortIndex(value) {
    const wanted = text(value).trim().toLowerCase();
    return EFFORT_STEPS.findIndex((step) => (
      step.value === wanted || step.label.toLowerCase() === wanted
    ));
  }

  function effortLabel(value) {
    const at = effortIndex(value);
    return at === -1 ? "" : EFFORT_STEPS[at].label;
  }

  // `row.tokens` is [{ text, selected }] for the context column, because the
  // tier is only distinguishable by colour. Callers derive `selected` by
  // comparing each token's foreground against the row's brightest.
  function readCursorRow(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const found = list.find((row) => CURSOR_ROW.test(text(row?.text)));
    if (!found) return null;
    const line = text(found.text).replace(CURSOR_ROW, "").trim();
    const effortMatch = EFFORT_CELL.exec(line);
    const tokens = (Array.isArray(found.tokens) ? found.tokens : [])
      .map((token) => ({ text: text(token?.text).trim(), selected: Boolean(token?.selected) }))
      .filter((token) => CONTEXT_TOKEN.test(token.text));
    // The name is whatever precedes the first context figure. Only the
    // highlighted row wears the "← effort →" arrows, so nothing may depend on them.
    const nameMatch = /^(.*?)\s\s+(?:\d+(?:\.\d+)?[KM]|\u2014)/.exec(line);
    const name = (nameMatch ? nameMatch[1] : line.replace(EFFORT_CELL, ""))
      .replace(ACTIVE_MARK, "")
      .trim();
    // Without arrows the effort is the trailing cell, so fall back to matching
    // the longest known label at the end of the line.
    const trailing = EFFORT_STEPS
      .filter((step) => new RegExp(`${step.label}\\s*$`, "i").test(line))
      .sort((left, right) => right.label.length - left.label.length)[0];
    // One index for both fields: a label the ladder does not know reads as "no
    // effort" rather than as a value nothing can plan a key sequence for.
    const effortAt = effortMatch ? effortIndex(effortMatch[1]) : EFFORT_STEPS.indexOf(trailing);
    return {
      name,
      active: ACTIVE_MARK.test(line),
      effort: effortAt === -1 ? "" : EFFORT_STEPS[effortAt].label,
      effortValue: effortAt === -1 ? "" : EFFORT_STEPS[effortAt].value,
      // A model with one tier (or "—") cannot be toggled, so the control for it
      // has to disable rather than send a Tab that silently does nothing.
      tierChoices: tokens.map((token) => token.text),
      tier: tokens.find((token) => token.selected)?.text || "",
      tierToggleable: tokens.length > 1
    };
  }

  // Returns the keys needed to move `from` to `to`, or an explanation of why it
  // cannot be done. Never returns a partial plan: a caller that cannot reach the
  // target should change nothing rather than leave the session half-set.
  function planEffortKeys(from, to) {
    const at = effortIndex(from);
    const want = effortIndex(to);
    if (want === -1) return { ok: false, reason: `Unknown reasoning level "${text(to)}"`, keys: [] };
    if (at === -1) return { ok: false, reason: "The picker did not report a reasoning level", keys: [] };
    const distance = want - at;
    return {
      ok: true,
      reason: "",
      keys: new Array(Math.abs(distance)).fill(distance > 0 ? "right" : "left")
    };
  }

  function planTierKeys(row, to) {
    const wanted = text(to).trim();
    if (!wanted) return { ok: true, reason: "", keys: [] };
    if (!row) return { ok: false, reason: "The picker did not report a row", keys: [] };
    if (!row.tierChoices.includes(wanted)) {
      return { ok: false, reason: `This model does not offer a ${wanted} context window`, keys: [] };
    }
    if (!row.tier) return { ok: false, reason: "The picker did not report a context window", keys: [] };
    // Checked before `tierToggleable`: asking for the tier already selected is a
    // no-op even on a model that cannot toggle, so replaying remembered state
    // never fails the whole all-or-nothing plan and drops the model with it.
    if (row.tier === wanted) return { ok: true, reason: "", keys: [] };
    if (!row.tierToggleable) {
      return { ok: false, reason: "This model has a single context window", keys: [] };
    }
    // Tab cycles, so the distance is the offset between the two positions.
    const at = row.tierChoices.indexOf(row.tier);
    const want = row.tierChoices.indexOf(wanted);
    const steps = ((want - at) + row.tierChoices.length) % row.tierChoices.length;
    return { ok: true, reason: "", keys: new Array(steps).fill("tab") };
  }

  return {
    EFFORT_STEPS,
    effortIndex,
    effortLabel,
    isPickerOpen,
    planEffortKeys,
    planTierKeys,
    readCursorRow
  };
});
