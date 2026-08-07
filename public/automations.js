/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

(function exposeAutomations(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MultiTermAutomations = api;
}(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const DAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
  const HANDOFF_MARKER = /^\s*\*\*HAND OFF\*\*(?:\s+(.+?))?\s*$/i;
  const COPILOT_FOOTER = /^\s*\/\s*commands\s*[·•]\s*\?\s*help\b/i;
  const MAX_COMMAND_LENGTH = 8192;

  function text(value, limit = 8192) {
    return typeof value === "string" ? value.trim().slice(0, limit) : "";
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

  function normalizeAction(value, index = 0) {
    const source = value && typeof value === "object" ? value : {};
    const command = typeof source.command === "string" ? source.command.trim() : "";
    if (!command || command.length > MAX_COMMAND_LENGTH) return null;
    const targetMode = source.targetMode === "new" ? "new" : "terminal";
    return {
      command,
      id: identifier(source.id) || `action-${index + 1}`,
      submit: source.submit !== false,
      targetMode,
      targetName: targetMode === "new" ? "" : text(source.targetName, 160)
    };
  }

  function normalizeRule(value, index = 0) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const actions = (Array.isArray(value.actions) ? value.actions : [])
      .map(normalizeAction)
      .filter(Boolean);
    if (!actions.length) return null;
    const now = new Date().toISOString();
    return {
      actions,
      createdAt: text(value.createdAt, 64) || now,
      enabled: value.enabled === true,
      id: identifier(value.id) || `automation-${index + 1}`,
      lastRunAt: text(value.lastRunAt, 64) || null,
      name: text(value.name, 160) || `Automation ${index + 1}`,
      trigger: normalizeTrigger(value.trigger),
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
    if (!normalized) return null;
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
    if (!normalized?.enabled) return false;
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
    extractLatestHandoff,
    nextScheduledAt,
    normalizeAction,
    normalizeRule,
    normalizePendingStage,
    normalizeStore,
    normalizeTrigger,
    scheduleIsDue,
    terminalName
  });
}));
