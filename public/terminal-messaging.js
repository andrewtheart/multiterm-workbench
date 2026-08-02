/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

(function exposeTerminalMessaging(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TerminalMessaging = api;
}(typeof globalThis === "object" ? globalThis : this, () => {
  "use strict";

  const MESSAGE_KINDS = Object.freeze(["command", "text", "path", "status", "task", "result"]);
  const MESSAGE_KIND_SET = new Set(MESSAGE_KINDS);
  const ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
  const TERMINAL_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

  function utf8ByteLength(value) {
    const text = String(value ?? "");
    if (typeof Buffer === "function") return Buffer.byteLength(text, "utf8");
    return new TextEncoder().encode(text).length;
  }

  function normalizeAlias(value) {
    const alias = String(value ?? "").trim().toLowerCase();
    return alias && ALIAS_PATTERN.test(alias) ? alias : null;
  }

  function validateTerminalInsertText(value) {
    const text = typeof value === "string" ? value : "";
    if (!text) return { ok: false, error: "The terminal message has no insertable content." };
    if (TERMINAL_CONTROL_PATTERN.test(text)) {
      return { ok: false, error: "Terminal messages containing control characters cannot be inserted safely." };
    }
    return { ok: true, value: text };
  }

  function normalizeMessageRequest(input, maxBytes) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { ok: false, error: "Message must be an object." };
    }

    const kind = String(input.kind || "").trim().toLowerCase();
    if (!MESSAGE_KIND_SET.has(kind)) {
      return { ok: false, error: "Unsupported terminal message kind." };
    }

    const sourceId = typeof input.sourceId === "string" ? input.sourceId : "";
    const targetId = typeof input.targetId === "string" ? input.targetId : "";
    if (!sourceId || !targetId || sourceId === targetId) {
      return { ok: false, error: "Choose two different live terminal sessions." };
    }

    const text = typeof input.text === "string" ? input.text.trim() : "";
    const messagePath = typeof input.path === "string" ? input.path.trim() : "";
    const status = typeof input.status === "string" ? input.status.trim().toLowerCase() : "";
    if (kind === "path" ? !messagePath : kind === "status" ? !status : !text) {
      return { ok: false, error: `A ${kind} message is missing its required content.` };
    }

    const requestedLimit = Number(maxBytes);
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit <= 0) {
      return { ok: false, error: "Terminal message size setting is invalid." };
    }

    const payloadBytes = utf8ByteLength([kind, text, messagePath, status].join("\n"));
    if (payloadBytes > requestedLimit) {
      return { ok: false, error: `Terminal message exceeds the configured ${requestedLimit}-byte limit.` };
    }

    return {
      ok: true,
      value: {
        kind,
        path: messagePath,
        persist: Boolean(input.persist),
        sourceId,
        status,
        targetId,
        text
      },
      payloadBytes
    };
  }

  return Object.freeze({
    MESSAGE_KINDS,
    normalizeAlias,
    normalizeMessageRequest,
    utf8ByteLength,
    validateTerminalInsertText
  });
}));
