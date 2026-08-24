/*
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

"use strict";

function selectRendererClient(clients) {
  let target = null;
  for (const client of clients) {
    if (!client.renderer) continue;
    if (!target
        || (client.rendererVisible && !target.rendererVisible)
        || (client.rendererVisible === target.rendererVisible
          && client.rendererActiveAt > target.rendererActiveAt)) {
      target = client;
    }
  }
  return target;
}

module.exports = { selectRendererClient };
