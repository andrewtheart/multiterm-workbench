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
//   * A present Origin must be an http(s) page served from a loopback LITERAL.
//     Requiring the literal (not merely a name that resolves to 127.0.0.1) also
//     defeats DNS-rebinding, because a rebinding page carries its own hostname
//     in the Origin, never "127.0.0.1"/"localhost"/"::1".
function isAllowedWebSocketOrigin(origin) {
  if (origin === undefined || origin === null || origin === "") return true;
  const parsed = URL.parse(String(origin));
  if (!parsed) return false;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  // URL keeps IPv6 hosts wrapped in brackets ("[::1]"); compare on the literal.
  const hostname = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  return LOOPBACK_ORIGIN_HOSTS.has(hostname);
}

module.exports = { LOOPBACK_ORIGIN_HOSTS, isAllowedWebSocketOrigin };
