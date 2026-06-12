// ---------------------------------------------------------------------------
// The join: turn (country, metric, year, mode) into a number to colour by.
// This is the heart of the atlas — kept pure and framework-free so it's easy
// to test and reason about. Missing data returns `null` (NEVER 0 — 0 is a real
// value, "no data" is not).
// ---------------------------------------------------------------------------

import type { Iso3, MetricId, PopulationMode, StatsData } from './types'

/**
 * The value used to colour a country, given the current view.
 * @returns the metric value, or `null` if there's no data for that country/year.
 */
export function metricValue(
  stats: StatsData,
  iso: Iso3,
  metric: MetricId,
  year: number,
  popMode: PopulationMode,
): number | null {
  const c = stats[iso]
  if (!c) return null

  if (metric === 'energy') {
    const v = c.energy[year]
    return v == null ? null : v
  }

  // population
  const pop = c.population[year]
  if (pop == null) return null
  if (popMode === 'density') {
    return c.area_km2 > 0 ? pop / c.area_km2 : null
  }
  return pop // logTotal — raw total, the log handling lives in the colour scale
}

/**
 * The min/max of the chosen metric across ALL countries for a given year.
 * Drives the colour-scale domain so the legend is meaningful for that year.
 * Ignores missing values.
 */
export function valueDomain(
  stats: StatsData,
  metric: MetricId,
  year: number,
  popMode: PopulationMode,
): [number, number] | null {
  let min = Infinity
  let max = -Infinity
  for (const iso of Object.keys(stats)) {
    const v = metricValue(stats, iso, metric, year, popMode)
    if (v == null || !Number.isFinite(v) || v <= 0) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return [min, max]
}

/**
 * The most recent value at or before `year`. Intel series (GDP, trade,
 * sectors) often lag a year or two behind the slider; rather than showing
 * "no data", show the latest known value with its own year attached so the
 * UI can label it honestly.
 */
export function latestAtOrBefore(
  byYear: Record<number, number> | undefined,
  year: number,
): { year: number; value: number } | null {
  if (!byYear) return null
  let best = -Infinity
  for (const k of Object.keys(byYear)) {
    const y = Number(k)
    if (y <= year && y > best) best = y
  }
  return Number.isFinite(best) ? { year: best, value: byYear[best] } : null
}

/** A country's full time series for a metric (for the panel sparkline). */
export function timeSeries(
  stats: StatsData,
  iso: Iso3,
  metric: MetricId,
  popMode: PopulationMode,
  yearMin: number,
  yearMax: number,
): Array<{ year: number; value: number | null }> {
  const out: Array<{ year: number; value: number | null }> = []
  for (let y = yearMin; y <= yearMax; y++) {
    out.push({ year: y, value: metricValue(stats, iso, metric, y, popMode) })
  }
  return out
}
