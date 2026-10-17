// ---------------------------------------------------------------------------
// Metric definitions — the single source of truth for how each metric is
// labelled, formatted, and scaled. Adding a new metric (GDP, life expectancy,
// internet users) is just adding an entry here + a column in build-data.ts.
// ---------------------------------------------------------------------------

import type { MetricId, PopulationMode } from './types'

export interface MetricDef {
  id: MetricId
  label: string
  /** Short unit shown in the legend / panel. */
  unit: string
  /** One-line explanation aimed at a teen reader. */
  description: string
}

export const METRICS: Record<MetricId, MetricDef> = {
  population: {
    id: 'population',
    label: 'Population',
    unit: 'people',
    description:
      'Count everyone, or see how crowded a country is on average. A square kilometre is a square 1 km on each side.',
  },
  energy: {
    id: 'energy',
    label: 'Energy use per person',
    unit: 'kWh / person',
    description:
      'A country’s yearly energy use divided by its population. Includes homes, transport, and industry. kWh is a unit of energy.',
  },
}

export const POPULATION_MODES: Record<PopulationMode, { label: string; hint: string }> = {
  density: { label: 'How crowded?', hint: 'people per km²' },
  logTotal: { label: 'How many people?', hint: 'total people, log colour scale' },
}

/** The unit label for the current view (depends on population mode). */
export function unitFor(metric: MetricId, popMode: PopulationMode): string {
  if (metric === 'energy') return 'kWh / person'
  return popMode === 'density' ? 'people / km²' : 'people'
}

/** Compact human-readable number, e.g. 1_234_567 → "1.2M". */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e9) return (value / 1e9).toFixed(1) + 'B'
  if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M'
  if (abs >= 1e3) return (value / 1e3).toFixed(1) + 'k'
  if (abs >= 10) return value.toFixed(0)
  return value.toFixed(1)
}
