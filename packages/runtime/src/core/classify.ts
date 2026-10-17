// ---------------------------------------------------------------------------
// Choropleth classes: a handful of value ranges, each with a colour, plus the
// grey "no data" class. Viridis (colour-blind safe, ordered light → dark), the
// same family the original world atlas uses.
// ---------------------------------------------------------------------------

import { interpolateViridis } from 'd3-scale-chromatic'
import { valueAtOrBefore, type ChoroplethLayer } from '@atlas/spec'
import type { LoadedSeries } from './loader'
import { niceRound } from './format'

export const NO_DATA = 'var(--no-data)'

export interface Classes {
  /** Upper limits between classes, ascending (n classes → n − 1 breaks). */
  breaks: number[]
  colors: string[]
  colorOf(value: number | null): string
}

/** Light for low values, dark for high; skips viridis' darkest purple so labels stay readable on it. */
export function rampColors(n: number): string[] {
  return Array.from({ length: n }, (_, i) => interpolateViridis(0.95 - (0.8 * i) / Math.max(1, n - 1)))
}

/** Quantile breaks rounded to 2 significant digits (duplicates dropped). */
export function quantileBreaks(values: number[], classes = 5): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const n = Math.min(classes, sorted.length)
  const out: number[] = []
  for (let i = 1; i < n; i++) {
    const b = niceRound(sorted[Math.floor((i * sorted.length) / n)])
    if (!out.includes(b) && b > sorted[0]) out.push(b)
  }
  return out
}

export function makeClasses(values: number[], breaks?: number[]): Classes {
  const b = breaks ?? quantileBreaks(values)
  const colors = rampColors(b.length + 1)
  return {
    breaks: b,
    colors,
    colorOf(value) {
      if (value === null) return NO_DATA
      let i = 0
      while (i < b.length && value >= b[i]) i++
      return colors[i]
    },
  }
}

export interface ChoroplethValues {
  /** feature id → [value, year it is from], or null when there's no data. */
  byId: Map<string, [number, number] | null>
  classes: Classes
  /** Years the shown values come from (usually one). */
  years: number[]
  anyMissing: boolean
}

export function choroplethValues(layer: Pick<ChoroplethLayer, 'year' | 'breaks'>, series: LoadedSeries, ids: Iterable<string>): ChoroplethValues {
  const byId = new Map<string, [number, number] | null>()
  for (const id of ids) byId.set(id, valueAtOrBefore(series.file.values[id], layer.year))
  const present = [...byId.values()].filter((v): v is [number, number] => v !== null)
  return {
    byId,
    classes: makeClasses(present.map(([v]) => v), layer.breaks),
    years: [...new Set(present.map(([, y]) => y))].sort(),
    anyMissing: present.length < byId.size,
  }
}
