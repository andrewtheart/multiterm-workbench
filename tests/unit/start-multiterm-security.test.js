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
    expect(bridgeScript).toContain("if (!this.IsAllowedHttpHost(context.Request))");
    expect(bridgeScript).toContain('this.SendText(context.Response, 403, "Forbidden", "text/plain; charset=utf-8")');
    expect(bridgeScript).toContain("private bool IsAllowedHttpHost(HttpListenerRequest request)");
    expect(bridgeScript).toContain("return this.IsLoopbackHostLiteral(hostUri.Host);");
  });

  it("fails closed when remote mode or a non-loopback bind is requested", () => {
    expect(bridgeScript).toContain('if ($AllowRemote.IsPresent -or $env:ALLOW_REMOTE -eq "1")');
    expect(bridgeScript).toContain('throw "Remote mode is no longer supported');
    expect(bridgeScript).toContain('if ($HostName -notin @("127.0.0.1", "localhost", "::1", "[::1]"))');
    expect(bridgeScript).not.toContain("private readonly bool allowRemote;");
  });

  it("caps concurrent clients and sessions", () => {
    expect(bridgeScript).toContain("private const int MaxClients = 32;");
    expect(bridgeScript).toContain("private const int MaxSessions = 64;");
    expect(bridgeScript).toContain("this.clients.Count >= MaxClients");
    // Plain creation, elevation start, and post-UAC elevated adoption.
    expect(bridgeScript.match(/this\.sessions\.Count >= MaxSessions/g)).toHaveLength(3);
  });

  it("applies browser security headers with a Help-only framing exception", () => {
    expect(bridgeScript).toContain('this.ApplySecurityHeaders(context.Response, path == "/help.html")');
    expect(bridgeScript).toContain('response.Headers["Content-Security-Policy"]');
    expect(bridgeScript).toContain("script-src 'self'");
    expect(bridgeScript).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(bridgeScript).toContain('response.Headers["X-Content-Type-Options"] = "nosniff"');
  });

  it("permits a VS Code webview ancestor and never sends X-Frame-Options", () => {
    // A webview nests inside the workbench window and frame-ancestors is matched against
    // every ancestor, so both schemes must be named or the frame is blocked outright.
    expect(bridgeScript).toContain('private const string EmbedFrameAncestors = "vscode-webview: vscode-file:";');
    expect(bridgeScript).toContain("private static string FrameAncestorsSource(bool allowSameOriginFrame)");
    expect(bridgeScript).toContain("allowSameOriginFrame ? \"'self' \" + EmbedFrameAncestors : EmbedFrameAncestors");
    expect(bridgeScript).toContain('frame-ancestors " + frameAncestors');
    // X-Frame-Options cannot name a scheme, so a stale DENY would block the webview
    // in browsers that still honour it.
    expect(bridgeScript).not.toContain('response.Headers["X-Frame-Options"]');
  });
});