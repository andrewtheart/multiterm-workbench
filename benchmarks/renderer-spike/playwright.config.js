/*
 * MultiTerm Workbench — Terminal Renderer Spike: Playwright Configuration
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

'use strict';

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: ['bench.spec.js'],
  fullyParallel: false,
  workers: 1,
  // Each variant has 2 warm runs (WARM_RUNS × ~15 s per run) + prep time.
  // 12 variants × 2 runs × 15 s ≈ 360 s + margin → 600 s total.
  timeout: 600_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    headless: true,
    // Disable hardware acceleration: force software rendering so all variants
    // are measured on the same GPU/CPU surface.  Remove this flag if you want
    // true hardware GPU numbers.
    launchOptions: {
      args: [
        '--disable-gpu-vsync',
        '--disable-frame-rate-limit',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
