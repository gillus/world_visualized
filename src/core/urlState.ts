// ---------------------------------------------------------------------------
// Shareable URL state: ?year=1991&metric=energy&country=DEU&pop=density
// Lets a kid send "look at Germany the year it reunified". Pure functions —
// the atlas store decides when to read/write the URL.
// ---------------------------------------------------------------------------

import type { AtlasState, MetricId, PopulationMode } from './types'

export type UrlState = Pick<AtlasState, 'year' | 'metric' | 'populationMode' | 'selected'>

export function readUrl(search: string): Partial<UrlState> {
  const p = new URLSearchParams(search)
  const out: Partial<UrlState> = {}

  const year = Number(p.get('year'))
  if (Number.isFinite(year) && year > 0) out.year = year

  const metric = p.get('metric')
  if (metric === 'population' || metric === 'energy') out.metric = metric as MetricId

  const pop = p.get('pop')
  if (pop === 'density' || pop === 'logTotal') out.populationMode = pop as PopulationMode

  const country = p.get('country')
  if (country && /^[A-Za-z]{3}$/.test(country)) out.selected = country.toUpperCase()

  return out
}

export function writeUrl(state: UrlState): string {
  const p = new URLSearchParams()
  p.set('year', String(state.year))
  p.set('metric', state.metric)
  if (state.metric === 'population') p.set('pop', state.populationMode)
  if (state.selected) p.set('country', state.selected)
  return '?' + p.toString()
}
