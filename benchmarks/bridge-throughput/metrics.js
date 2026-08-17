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

/** Small pure statistics helpers for the bridge throughput benchmark. */

"use strict";

/**
 * Nearest-rank percentile. Deliberately not interpolated: with a few thousand
 * samples the rank is unambiguous, and interpolation hides the real observed
 * value behind an average of two neighbours.
 *
 * @param {number[]} values
 * @param {number} percentile between 0 and 1
 */
function percentile(values, percentile_) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil(percentile_ * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index];
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * @param {number[]} values
 * @returns {{ count: number, min: number|null, p50: number|null, p95: number|null, p99: number|null, max: number|null, mean: number|null }}
 */
function distribution(values) {
  return {
    count: values.length,
    max: round(percentile(values, 1)),
    mean: round(mean(values)),
    min: round(percentile(values, 0)),
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    p99: round(percentile(values, 0.99))
  };
}

/**
 * Relative spread of a headline metric across repeats, used by the Phase 0
 * stability gate (0.d). Returns 0 for a single sample rather than null so a
 * caller cannot silently treat "unknown" as "stable".
 *
 * @param {number[]} values
 */
function relativeSpread(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length < 2) return 0;
  const low = Math.min(...usable);
  const high = Math.max(...usable);
  const middle = percentile(usable, 0.5);
  if (!middle) return 0;
  return round((high - low) / middle, 4);
}

module.exports = { distribution, mean, percentile, relativeSpread, round };
