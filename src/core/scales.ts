// ---------------------------------------------------------------------------
// Colour scales. Sequential, colourblind-safe (viridis) by default — relevant
// for a classroom where ~8% of boys have red-green colour blindness.
// ---------------------------------------------------------------------------

import { scaleSequential, scaleSequentialLog } from 'd3-scale'
import { interpolateViridis } from 'd3-scale-chromatic'
import type { MetricId, PopulationMode } from './types'

/** Colour used for countries with no data. */
export const NO_DATA_COLOR = '#3a3a3a'

export interface ColorScale {
  /** Colour for a value, or NO_DATA_COLOR for null. */
  color(value: number | null): string
  /** Domain [min, max] actually used (post log/linear). */
  domain: [number, number]
  /** Whether the scale is logarithmic. */
  log: boolean
  /** Sample colour at a 0..1 position along the ramp (for the legend gradient). */
  sample(t: number): string
}

/**
 * Build a colour scale for the current view.
 * - energy & population-density → linear
 * - population total ("logTotal") → log, because populations span ×10000s
 */
export function buildColorScale(
  domain: [number, number] | null,
  metric: MetricId,
  popMode: PopulationMode,
): ColorScale {
  const useLog = metric === 'population' && popMode === 'logTotal'
  const safe: [number, number] = domain ?? [0, 1]
  // Guard log against zero/negative.
  const lo = useLog ? Math.max(safe[0], 1) : safe[0]
  const hi = Math.max(safe[1], lo + 1)

  const interp = (t: number) => interpolateViridis(t)
  const scale = useLog
    ? scaleSequentialLog(interp).domain([lo, hi])
    : scaleSequential(interp).domain([lo, hi])

  return {
    log: useLog,
    domain: [lo, hi],
    color(value) {
      if (value == null || !Number.isFinite(value) || value <= 0) return NO_DATA_COLOR
      return scale(value)
    },
    sample(t) {
      return interp(t)
    },
  }
}
