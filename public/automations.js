/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Accept only plain-data automation definitions at this boundary.
// Normalize persisted shapes before runtime code consumes them.

(function exposeAutomations(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MultiTermAutomations = api;
}(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const DAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
  const HANDOFF_MARKER = /^\s*\*\*HAND OFF\*\*(?:\s+(.+?))?\s*$/i;
  const COPILOT_FOOTER = /(?:^\s*|[·•]\s*)\/\s*commands\s*[·•]\s*\?\s*help\b/i;
  const FONT_FAMILIES = new Set([
    "Cascadia Mono", "Cascadia Code", "Consolas", "JetBrains Mono", "Fira Code",
    "Source Code Pro", "IBM Plex Mono", "Roboto Mono", "Ubuntu Mono", "Noto Sans Mono",
    "DejaVu Sans Mono", "Liberation Mono", "Hack", "Inconsolata", "Menlo", "Monaco",
    "SFMono-Regular", "Lucida Console", "Droid Sans Mono", "Courier New"
  ]);
  const HEADER_GRADIENT_TYPES = new Set(["linear", "radial", "conic"]);
  const HEADER_GRADIENT_SHAPES = new Set(["ellipse", "circle"]);
  const MAX_COMMAND_LENGTH = 8192;
  const MAX_OUTPUT_MATCH_LENGTH = 4096;
  const MAX_TITLE_MATCH_LENGTH = 512;

  function text(value, limit = 8192) {
    return typeof value === "string" ? value.trim().slice(0, limit) : "";
  }

  function matchText(value, limit = MAX_OUTPUT_MATCH_LENGTH) {
    return typeof value === "string" ? value.slice(0, limit) : "";
  }

  function identifier(value) {
    const candidate = text(value, 96);
    return /^[a-zA-Z0-9_-]{8,96}$/.test(candidate) ? candidate : "";
  }

  function terminalName(value) {
    return text(value, 160).replace(/\s+/g, " ").toLocaleLowerCase();
  }

  function normalizeTime(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
    if (!match) return "09:00";
    const hour = Math.min(23, Math.max(0, Number(match[1])));
    const minute = Math.min(59, Math.max(0, Number(match[2])));
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function normalizeDays(value) {
    const values = Array.isArray(value) ? value : [];
    const days = [...new Set(values.map(Number).filter((day) => DAYS.includes(day)))].sort((a, b) => a - b);
    return days.length ? days : [1, 2, 3, 4, 5];
  }

  function normalizeTrigger(value) {
    const source = value && typeof value === "object" ? value : {};
    const mode = ["interval", "daily", "weekly"].includes(source.mode) ? source.mode : "interval";
    const intervalMinutes = Number(source.intervalMinutes);
    return {
      catchUp: source.catchUp === "once" ? "once" : "skip",
      days: normalizeDays(source.days),
      intervalMinutes: Number.isFinite(intervalMinutes) && intervalMinutes >= 1
        ? Math.round(intervalMinutes)
        : 60,
      mode,
      time: normalizeTime(source.time),
      type: "schedule"
    };
  }

  function color(value) {
    const candidate = String(value || "").trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(candidate) ? candidate : "";
  }

  function titleRegexStructure(pattern) {
    const source = String(pattern || "");
    let index = 0;

    function quantifier() {
      const start = index;
      const character = source[index];
      if (character === "*" || character === "+" || character === "?") {
        index += 1;
        if (source[index] === "?") index += 1;
        return {
          optional: character === "*" || character === "?",
          quantified: true,
          openEnded: character === "*" || character === "+"
        };
      }
      if (character !== "{") return { optional: false, quantified: false, openEnded: false };
      const match = /^\{(\d+)(?:,(\d*))?\}(\?)?/.exec(source.slice(index));
      if (!match) return { optional: false, quantified: false, openEnded: false };
      index += match[0].length;
      return {
        optional: Number(match[1]) === 0,
        quantified: true,
        openEnded: match[2] === "" || (match[2] !== undefined && Number(match[2]) > Number(match[1]))
      };
    }

    function expression(endCharacter = "") {
      const alternatives = [[]];
      while (index < source.length && source[index] !== endCharacter) {
        if (source[index] === "|") {
          alternatives.push([]);
          index += 1;
          continue;
        }
        if (source[index] === "^") {
          index += 1;
          continue;
        }
        if (source[index] === "$" && source[index - 1] !== "\\") {
          index += 1;
          continue;
        }

        let group = null;
        if (source[index] === "(") {
          index += 1;
          if (source.startsWith("?:", index)) index += 2;
          else if (source.startsWith("?<", index)) {
            const nameEnd = source.indexOf(">", index + 2);
            if (nameEnd < 0) return null;
            index = nameEnd + 1;
          }
          group = expression(")");
          if (!group || source[index] !== ")") return null;
          index += 1;
        } else if (source[index] === "[") {
          index += 1;
          if (source[index] === "^") index += 1;
          while (index < source.length && source[index] !== "]") {
            if (source[index] === "\\") index += 1;
            index += 1;
          }
          if (source[index] !== "]") return null;
          index += 1;
        } else if (source[index] === "\\") {
          index += Math.min(2, source.length - index);
        } else {
          index += 1;
        }

        const repeat = quantifier();
        if (group && repeat.quantified && (group.hasAlternation || group.hasQuantifier)) return null;
        const openEnded = repeat.openEnded || (!repeat.quantified && group?.hasOpenEnded === true);
        alternatives.at(-1).push({
          mandatory: !repeat.optional && !openEnded,
          openEnded,
          quantified: repeat.quantified || Boolean(group?.hasQuantifier)
        });
      }

      for (const sequence of alternatives) {
        let openEndedWithoutSeparator = false;
        for (const atom of sequence) {
          if (atom.openEnded && openEndedWithoutSeparator) return null;
          if (atom.openEnded) openEndedWithoutSeparator = true;
          else if (atom.mandatory) openEndedWithoutSeparator = false;
        }
      }
      return {
        hasAlternation: alternatives.length > 1,
        hasOpenEnded: alternatives.some((sequence) => sequence.some((atom) => atom.openEnded)),
        hasQuantifier: alternatives.some((sequence) => sequence.some((atom) => atom.quantified))
      };
    }

    const structure = expression();
    return structure && index === source.length ? structure : null;
  }

  function titleMatchValidationError(value) {
    const source = value && typeof value === "object" ? value : {};
    const pattern = typeof source.value === "string" ? source.value.slice(0, MAX_TITLE_MATCH_LENGTH) : "";
    if (!pattern) return "Enter title text or a regular expression.";
    if (source.type !== "regex") return "";
    try {
      new RegExp(pattern, source.caseSensitive === true ? "" : "i");
    } catch {
      return "Enter a valid regular expression.";
    }
    if (/\\(?:[1-9]\d*|k<)/.test(pattern)) return "Use a regular expression without backreferences.";
    if (/\(\?(?:[=!]|<[=!])/.test(pattern)) return "Use a regular expression without lookarounds.";
    if (!titleRegexStructure(pattern)) {
      return "Use a regular expression without ambiguous repetition: no nested quantifiers such as (a+)+, no adjacent open-ended quantifiers such as .*.*, and no quantifier on an alternation group such as (a|b)*.";
    }
    return "";
  }

  function normalizeTitleMatch(value) {
    const source = value && typeof value === "object" ? value : {};
    const pattern = typeof source.value === "string" ? source.value.slice(0, MAX_TITLE_MATCH_LENGTH) : "";
    const type = ["equals", "regex"].includes(source.type) ? source.type : "contains";
    if (titleMatchValidationError({ ...source, type, value: pattern })) return null;
    return { caseSensitive: source.caseSensitive === true, type, value: pattern };
  }

  // Validating a matcher parses and compiles its pattern, so callers that test many
  // titles against the same rule should compile once and reuse the result.
  function compileTitleMatcher(value) {
    const matcher = normalizeTitleMatch(value);
    if (!matcher) return null;
    const regex = matcher.type === "regex"
      ? new RegExp(matcher.value, matcher.caseSensitive ? "" : "i")
      : null;
    const needle = matcher.caseSensitive ? matcher.value : matcher.value.toLocaleLowerCase();
    return {
      ...matcher,
      test(title) {
        const candidate = String(title || "");
        if (regex) return regex.test(candidate);
        const left = matcher.caseSensitive ? candidate : candidate.toLocaleLowerCase();
        return matcher.type === "equals" ? left === needle : left.includes(needle);
      }
    };
  }

  function titleMatches(value, title) {
    return compileTitleMatcher(value)?.test(title) === true;
  }

  function normalizeAppearanceHeader(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const mode = value.mode === "solid" ? "solid" : "gradient";
    const stops = (Array.isArray(value.stops) ? value.stops : [])
      .map((stop) => {
        if (!stop || typeof stop !== "object") return null;
        const stopColor = color(stop.color);
        if (!stopColor) return null;
        const position = Number(stop.position);
        const opacity = Number(stop.opacity);
        return {
          color: stopColor,
          opacity: Number.isFinite(opacity) ? Math.min(100, Math.max(0, Math.round(opacity))) : 100,
          position: Number.isFinite(position) ? Math.min(100, Math.max(0, Math.round(position))) : 0
        };
      })
      .filter(Boolean)
      .slice(0, 6)
      .sort((left, right) => left.position - right.position);
    const solidColor = color(value.color) || stops[0]?.color || "";
    if (mode === "solid" && !solidColor) return null;
    if (mode === "gradient" && stops.length < 2) return null;
    const rawAngle = Number(value.angle);
    const rawCenterX = Number(value.centerX);
    const rawCenterY = Number(value.centerY);
    const rawFontSize = Number(value.fontSize);
    return {
      angle: Number.isFinite(rawAngle) ? ((Math.round(rawAngle) % 360) + 360) % 360 : 135,
      centerX: Number.isFinite(rawCenterX) ? Math.min(100, Math.max(0, Math.round(rawCenterX))) : 50,
      centerY: Number.isFinite(rawCenterY) ? Math.min(100, Math.max(0, Math.round(rawCenterY))) : 50,
      color: solidColor,
      fontFamily: FONT_FAMILIES.has(value.fontFamily) ? value.fontFamily : "",
      fontSize: Number.isFinite(rawFontSize) && rawFontSize > 0 ? Math.min(20, Math.max(9, Math.round(rawFontSize))) : 0,
      mode,
      shape: HEADER_GRADIENT_SHAPES.has(value.shape) ? value.shape : "ellipse",
      stops,
      type: HEADER_GRADIENT_TYPES.has(value.type) ? value.type : "linear"
    };
  }

  function normalizeAppearance(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const background = color(value.background);
    const foreground = color(value.foreground);
    const fontFamily = FONT_FAMILIES.has(value.fontFamily) ? value.fontFamily : "";
    const headerBackground = normalizeAppearanceHeader(value.headerBackground);
    if (!background || !foreground || !fontFamily || !headerBackground) return null;
    return { background, foreground, fontFamily, headerBackground };
  }

  function normalizeAction(value, index = 0, previousIds = []) {
    const source = value && typeof value === "object" ? value : {};
    const command = typeof source.command === "string" ? source.command.trim() : "";
    if (!command || command.length > MAX_COMMAND_LENGTH) return null;
    const pageMode = ["existing", "new"].includes(source.pageMode) ? source.pageMode : "current";
    const targetMode = source.targetMode === "new"
      ? "new"
      : source.targetMode === "pid"
        ? "pid"
        : "title";
    const targetPid = Number(source.targetPid);
    const availableDependencies = new Set(previousIds);
    const dependsOn = (Array.isArray(source.dependsOn) ? source.dependsOn : [])
      .map(identifier)
      .filter((id, dependencyIndex, values) => id && availableDependencies.has(id) && values.indexOf(id) === dependencyIndex);
    if (!dependsOn.length && index > 0 && previousIds.length) dependsOn.push(previousIds[previousIds.length - 1]);
    return {
      command,
      condition: ["always", "failure", "output-match", "output-not-match"].includes(source.condition) ? source.condition : "success",
      conditionOperator: source.conditionOperator === "any" ? "any" : "all",
      cwd: text(source.cwd, 1024),
      dependsOn,
      fallbackToNew: targetMode === "new" ? false : source.fallbackToNew !== false,
      id: identifier(source.id) || `action-${index + 1}`,
      inputType: ["powershell", "script"].includes(source.inputType) ? source.inputType : "shell",
      outputMatchAcrossLines: source.outputMatchAcrossLines === true,
      outputMatchCaseSensitive: source.outputMatchCaseSensitive === true,
      outputMatchType: ["exact", "regex"].includes(source.outputMatchType) ? source.outputMatchType : "contains",
      outputMatchValue: matchText(source.outputMatchValue),
      pageMode,
      pageName: pageMode === "existing" ? text(source.pageName, 160) : "",
      submit: source.submit !== false,
      targetMode,
      targetName: targetMode === "title" ? text(source.targetName, 160) : "",
      targetPid: targetMode === "pid" && Number.isInteger(targetPid) && targetPid > 0 ? targetPid : null
    };
  }

  function normalizeRule(value, index = 0) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const type = value.type === "copilot" ? "copilot" : value.type === "appearance" ? "appearance" : "command";
    const appearance = type === "appearance" ? normalizeAppearance(value.appearance) : null;
    const titleMatch = type === "appearance" ? normalizeTitleMatch(value.titleMatch) : null;
    const actions = [];
    for (const sourceAction of (Array.isArray(value.actions) ? value.actions : [])) {
      const action = normalizeAction(sourceAction, actions.length, actions.map((item) => item.id));
      if (action) actions.push(action);
    }
    if (type === "appearance" ? !appearance || !titleMatch : !actions.length) return null;
    const now = new Date().toISOString();
    return {
      actions: type === "appearance" ? [] : actions,
      appearance,
      createdAt: text(value.createdAt, 64) || now,
      enabled: value.enabled === true,
      id: identifier(value.id) || `automation-${index + 1}`,
      lastRunAt: text(value.lastRunAt, 64) || null,
      machineState: ["locked", "unlocked"].includes(value.machineState) ? value.machineState : "both",
      name: text(value.name, 160) || `Automation ${index + 1}`,
      runAs: text(value.runAs, 320),
      snoozedUntil: text(value.snoozedUntil, 64) || null,
      trigger: normalizeTrigger(value.trigger),
      titleMatch,
      type,
      updatedAt: text(value.updatedAt, 64) || now
    };
  }

  function normalizeHistoryEntry(value, index = 0) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const status = ["blocked", "completed", "failed", "queued", "skipped", "staged"].includes(value.status)
      ? value.status
      : "failed";
    return {
      automationId: identifier(value.automationId) || null,
      detail: text(value.detail, 500),
      id: identifier(value.id) || `history-${index + 1}`,
      occurredAt: text(value.occurredAt, 64) || new Date().toISOString(),
      status,
      title: text(value.title, 160) || "Automation"
    };
  }

  function normalizePendingStage(value, index = 0) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const payload = typeof value.payload === "string" ? value.payload.trim() : "";
    const targetId = identifier(value.targetId);
    if (!payload || payload.length > MAX_COMMAND_LENGTH || !targetId) return null;
    return {
      automationId: identifier(value.automationId) || null,
      createdAt: text(value.createdAt, 64) || new Date().toISOString(),
      id: identifier(value.id) || `stage-${index + 1}`,
      occurrenceKey: text(value.occurrenceKey, 320),
      payload,
      requiredMode: value.requiredMode === "copilot" ? "copilot" : "",
      targetId,
      title: text(value.title, 160) || "Automation"
    };
  }

  function normalizeStore(value, historyLimit = 200) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const limit = Number.isFinite(Number(historyLimit)) && Number(historyLimit) >= 0
      ? Math.round(Number(historyLimit))
      : 200;
    const usedRuleIds = new Set();
    const rules = (Array.isArray(source.rules) ? source.rules : [])
      .map(normalizeRule)
      .filter(Boolean)
      .map((rule, index) => {
        let id = rule.id;
        let suffix = index + 1;
        while (usedRuleIds.has(id)) id = `automation-${suffix++}`;
        usedRuleIds.add(id);
        return id === rule.id ? rule : { ...rule, id };
      });
    const history = (Array.isArray(source.history) ? source.history : [])
        .map(normalizeHistoryEntry)
        .filter(Boolean);
    const pendingStages = (Array.isArray(source.pendingStages) ? source.pendingStages : [])
      .map(normalizePendingStage)
      .filter(Boolean);
    return {
      history: limit === 0 ? [] : history.slice(-limit),
      paused: source.paused === true,
      pendingStages,
      rules,
      version: 1
    };
  }

  function timeParts(value) {
    const [hour, minute] = normalizeTime(value).split(":").map(Number);
    return { hour, minute };
  }

  function nextScheduledAt(rule, from = new Date()) {
    const normalized = normalizeRule(rule);
    if (!normalized || normalized.type === "appearance") return null;
    const trigger = normalized.trigger;
    const start = from instanceof Date ? new Date(from.getTime()) : new Date(from);
    if (!Number.isFinite(start.getTime())) return null;

    if (trigger.mode === "interval") {
      const intervalMs = trigger.intervalMinutes * 60 * 1000;
      const anchorValue = normalized.lastRunAt || normalized.createdAt;
      const anchor = new Date(anchorValue);
      const anchorMs = Number.isFinite(anchor.getTime()) ? anchor.getTime() : start.getTime();
      if (anchorMs > start.getTime()) return new Date(anchorMs);
      const elapsed = start.getTime() - anchorMs;
      return new Date(anchorMs + (Math.floor(elapsed / intervalMs) + 1) * intervalMs);
    }

    const { hour, minute } = timeParts(trigger.time);
    for (let offset = 0; offset <= 7; offset += 1) {
      const candidate = new Date(start.getTime());
      candidate.setDate(start.getDate() + offset);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate.getTime() <= start.getTime()) continue;
      if (trigger.mode === "daily" || trigger.days.includes(candidate.getDay())) return candidate;
    }
    return null;
  }

  function scheduleIsDue(rule, now = new Date()) {
    const normalized = normalizeRule(rule);
    if (!normalized?.enabled || normalized.type === "appearance") return false;
    const last = normalized.lastRunAt ? new Date(normalized.lastRunAt) : new Date(normalized.createdAt);
    if (!Number.isFinite(last.getTime())) return false;
    const next = nextScheduledAt({ ...normalized, lastRunAt: null, createdAt: last.toISOString() }, new Date(last.getTime() + 1));
    return Boolean(next && next.getTime() <= new Date(now).getTime());
  }

  function cleanHandoffLine(value) {
    return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+$/, "");
  }

  function extractLatestHandoff(rows, minimumRow = -1) {
    const values = (Array.isArray(rows) ? rows : []).map((entry, index) => (
      entry && typeof entry === "object"
        ? { row: Number.isInteger(entry.row) ? entry.row : index, text: cleanHandoffLine(entry.text) }
        : { row: index, text: cleanHandoffLine(entry) }
    ));
    let markerIndex = -1;
    let markerMatch = null;
    for (let index = values.length - 1; index >= 0; index -= 1) {
      if (values[index].row <= minimumRow) break;
      const match = HANDOFF_MARKER.exec(values[index].text);
      if (!match) continue;
      markerIndex = index;
      markerMatch = match;
      break;
    }
    if (markerIndex < 0) return null;

    const payloadLines = [];
    for (let index = markerIndex + 1; index < values.length; index += 1) {
      const line = values[index].text;
      if (COPILOT_FOOTER.test(line)) break;
      payloadLines.push(line);
    }
    while (payloadLines.length && !payloadLines[0].trim()) payloadLines.shift();
    while (payloadLines.length && !payloadLines[payloadLines.length - 1].trim()) payloadLines.pop();
    const payload = payloadLines.join("\n").trim();
    if (!payload) return null;
    return {
      markerRow: values[markerIndex].row,
      payload,
      targetName: text(markerMatch[1], 160)
    };
  }

  return Object.freeze({
    DAYS,
    compileTitleMatcher,
    extractLatestHandoff,
    nextScheduledAt,
    normalizeAction,
    normalizeAppearance,
    normalizeRule,
    normalizePendingStage,
    normalizeStore,
    normalizeTrigger,
    scheduleIsDue,
    terminalName,
    titleMatchValidationError,
    titleMatches
  });
}));
