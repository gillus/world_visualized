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
      'How many people live in a country. Shown as people per km² (density) or total people on a ×10 colour scale.',
  },
  energy: {
    id: 'energy',
    label: 'Energy use per person',
    unit: 'kWh / person',
    description:
      'How much energy an average person uses in a year. A fair way to compare a small country with a huge one.',
  },
}

export const POPULATION_MODES: Record<PopulationMode, { label: string; hint: string }> = {
  density: { label: 'Density', hint: 'people per km²' },
  logTotal: { label: 'Total (×10 scale)', hint: 'total people, log colour scale' },
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
