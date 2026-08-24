/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const messaging = require("../../public/terminal-messaging.js");

describe("terminal messaging contract", () => {
  it("normalizes stable aliases without imposing a hidden length ceiling", () => {
    expect(messaging.normalizeAlias(" API.Worker-1 ")).toBe("api.worker-1");
    expect(messaging.normalizeAlias(`a${"b".repeat(200)}`)).toBe(`a${"b".repeat(200)}`);
    expect(messaging.normalizeAlias("has spaces")).toBeNull();
    expect(messaging.normalizeAlias("_leading")).toBeNull();
    expect(messaging.normalizeAlias("")).toBeNull();
    expect(messaging.normalizeAlias(null)).toBeNull();
  });

  it("measures UTF-8 payloads in Node and browser-like runtimes", () => {
    expect(messaging.utf8ByteLength(null)).toBe(0);
    expect(messaging.utf8ByteLength("é")).toBe(2);
    const savedBuffer = global.Buffer;
    try {
      global.Buffer = undefined;
      expect(messaging.utf8ByteLength("é")).toBe(2);
    } finally {
      global.Buffer = savedBuffer;
    }
  });

  it.each([
    ["command", { text: "npm test" }],
    ["text", { text: "Build is ready for review." }],
    ["path", { path: "D:\\build\\artifact.zip" }],
    ["status", { status: "ready", text: "Listening on 8080" }],
    ["task", { text: "Review the updater changes." }],
    ["result", { text: "Review passed.", path: "D:\\reports\\review.md" }]
  ])("accepts a flat %s payload", (kind, payload) => {
    const result = messaging.normalizeMessageRequest({
      kind,
      sourceId: "source-1",
      targetId: "target-1",
      ...payload
    }, 64 * 1024);

    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({ kind, sourceId: "source-1", targetId: "target-1" });
    expect(result.payloadBytes).toBeGreaterThan(0);
  });

  it("rejects malformed, self-targeted, incomplete, and oversized messages", () => {
    expect(messaging.normalizeMessageRequest(null, 100).ok).toBe(false);
    expect(messaging.normalizeMessageRequest({ kind: "unknown", sourceId: "a", targetId: "b", text: "x" }, 100).ok).toBe(false);
    expect(messaging.normalizeMessageRequest({ kind: "text", sourceId: "a", targetId: "a", text: "x" }, 100).ok).toBe(false);
    expect(messaging.normalizeMessageRequest({ kind: "path", sourceId: "a", targetId: "b" }, 100).ok).toBe(false);
    expect(messaging.normalizeMessageRequest({ kind: "text", sourceId: "a", targetId: "b", text: "éé" }, 3).ok).toBe(false);
    expect(messaging.normalizeMessageRequest({ kind: "text", sourceId: "a", targetId: "b", text: "x" }, 0).ok).toBe(false);
    expect(messaging.normalizeMessageRequest({ kind: "text", persist: "false", sourceId: "a", targetId: "b", text: "x" }, 100))
      .toMatchObject({ ok: false, error: expect.stringMatching(/boolean/i) });
  });

  it("allows printable insertion text and rejects terminal controls", () => {
    expect(messaging.validateTerminalInsertText(undefined)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no insertable content/i)
    });
    expect(messaging.validateTerminalInsertText("Review \u2713 complete")).toEqual({
      ok: true,
      value: "Review \u2713 complete"
    });
    for (const control of ["\r", "\n", "\t", "\u0000", "\u001b[A", "\u007f", "\u0085"]) {
      expect(messaging.validateTerminalInsertText(`before${control}after`)).toMatchObject({
        ok: false,
        error: expect.stringMatching(/control characters/i)
      });
    }
  });

  it("preserves deferred delivery requests", () => {
    expect(messaging.normalizeMessageRequest({
      delivery: "whenReady",
      kind: "text",
      sourceId: "source-1",
      targetId: "target-1",
      text: "Run after the prompt returns."
    }, 1024)).toMatchObject({ ok: true, value: { delivery: "whenReady" } });
  });
});
