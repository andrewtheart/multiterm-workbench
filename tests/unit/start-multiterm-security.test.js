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

  it("rejects HTTP requests whose Host header is not a loopback literal", () => {
    // Without this, a DNS-rebinding page reaches the bridge as a same-origin
    // client and the Origin check above never fires.
    expect(bridgeScript).toContain("!this.allowRemote && !this.IsAllowedHttpHost(context.Request)");
    expect(bridgeScript).toContain('this.SendText(context.Response, 403, "Forbidden", "text/plain; charset=utf-8")');
    expect(bridgeScript).toContain("private bool IsAllowedHttpHost(HttpListenerRequest request)");
    expect(bridgeScript).toContain("return this.IsLoopbackHostLiteral(hostUri.Host);");
  });

  it("caps concurrent clients and sessions", () => {
    expect(bridgeScript).toContain("private const int MaxClients = 32;");
    expect(bridgeScript).toContain("private const int MaxSessions = 64;");
    expect(bridgeScript).toContain("this.clients.Count >= MaxClients");
    // Both session entry points, plain and elevated.
    expect(bridgeScript.match(/this\.sessions\.Count >= MaxSessions/g)).toHaveLength(2);
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