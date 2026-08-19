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

"use strict";

// Only these host LITERALS may originate a browser WebSocket handshake.
const LOOPBACK_ORIGIN_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

// URL keeps IPv6 hosts wrapped in brackets ("[::1]"); compare on the literal.
function normalizeHostLiteral(value) {
  return String(value).replace(/^\[/, "").replace(/\]$/, "");
}

// Split an HTTP `Host` header into its hostname and port. Anything carrying extra
// URL structure (credentials, a path, a query, a fragment) is not a real authority
// and is rejected rather than parsed leniently.
function parseHostHeader(value) {
  if (typeof value !== "string" || value === "") return null;
  const parsed = URL.parse(`multiterm://${value}`);
  if (!parsed || parsed.username || parsed.password
    || (parsed.pathname !== "" && parsed.pathname !== "/")
    || parsed.search || parsed.hash) return null;
  return { hostname: normalizeHostLiteral(parsed.hostname), port: parsed.port || "80" };
}

// Gate ordinary HTTP requests on their Host header to stop DNS rebinding. Binding
// to loopback does not help here: an attacker page served from a name that later
// re-resolves to 127.0.0.1 reaches this server as SAME-ORIGIN, so the browser stops
// enforcing CORS and the custom-header guard on /api/update-preferences no longer
// applies — the page could then read every response, including /health and the
// stored update preferences. Such a request always carries the attacker's own
// hostname in Host, never a loopback literal, so this rejects it outright.
function isAllowedHttpHost(hostHeader) {
  const parsed = parseHostHeader(hostHeader);
  return parsed !== null && LOOPBACK_ORIGIN_HOSTS.has(parsed.hostname);
}

// Gate the WebSocket upgrade on its Origin to stop Cross-Site WebSocket
// Hijacking. Binding to loopback is not enough on its own: a browser tab on the
// same machine also connects from 127.0.0.1, so without this check any web page
// the user visits could open ws://127.0.0.1:<port>/ws and drive real shells —
// arbitrary command execution, at administrator privilege if the app is elevated.
//
// A browser always attaches an Origin to a WebSocket handshake and JavaScript
// cannot forge it, so:
//   * A missing Origin means a non-browser client (our own tests, CLI tools).
//     That can never be a cross-site browser request, so it is allowed.
//   * A present Origin must be an http(s) page served from the exact loopback
//     hostname and port in the WebSocket Host header. Allowing every localhost
//     port would let an unrelated local web app drive real shells.
//     Requiring the literal (not merely a name that resolves to 127.0.0.1) also
//     defeats DNS-rebinding, because a rebinding page carries its own hostname
//     in the Origin, never "127.0.0.1"/"localhost"/"::1".
function isAllowedWebSocketOrigin(origin, expectedHost) {
  if (origin === undefined || origin === null || origin === "") return true;
  const parsed = URL.parse(String(origin));
  if (!parsed) return false;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const hostname = normalizeHostLiteral(parsed.hostname);
  if (!LOOPBACK_ORIGIN_HOSTS.has(hostname)) return false;

  const expected = parseHostHeader(expectedHost);
  if (expected === null || !LOOPBACK_ORIGIN_HOSTS.has(expected.hostname)) return false;
  const originPort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return hostname === expected.hostname && originPort === expected.port;
}

module.exports = { LOOPBACK_ORIGIN_HOSTS, isAllowedHttpHost, isAllowedWebSocketOrigin };
