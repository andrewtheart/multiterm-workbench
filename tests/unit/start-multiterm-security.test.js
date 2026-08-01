/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const fs = require("node:fs");
const path = require("node:path");

const bridgeScript = fs.readFileSync(path.resolve(__dirname, "../../Start-MultiTerm.ps1"), "utf8");

describe("installed bridge security", () => {
  it("binds browser WebSocket origins to the exact request host and port", () => {
    expect(bridgeScript).toContain("!this.IsAllowedWebSocketOrigin(context.Request)");
    expect(bridgeScript).toContain('string origin = request.Headers["Origin"]');
    expect(bridgeScript).toContain('string expectedHost = request.Headers["Host"]');
    expect(bridgeScript).toContain("originUri.Port == expectedUri.Port");
    expect(bridgeScript).toContain('String.Equals(normalized, "127.0.0.1"');
  });

  it("applies browser security headers with a Help-only framing exception", () => {
    expect(bridgeScript).toContain('this.ApplySecurityHeaders(context.Response, path == "/help.html")');
    expect(bridgeScript).toContain('response.Headers["Content-Security-Policy"]');
    expect(bridgeScript).toContain("script-src 'self'");
    expect(bridgeScript).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(bridgeScript).toContain('allowSameOriginFrame ? "SAMEORIGIN" : "DENY"');
    expect(bridgeScript).toContain('response.Headers["X-Content-Type-Options"] = "nosniff"');
  });
});