// ---------------------------------------------------------------------------
// Rivers: Natural Earth 1:10m river centre-lines (global) plus NE's European
// supplement, merged so each river is one feature.
//   ne/rivers   id = slug of the English name ("thames", "great-ouse"); a
//               name shared by rivers in different countries gets the
//               country's ADM0_A3 ("severn-gbr", "severn-can"). Segments with
//               the same name in the same country are one river — that also
//               merges rivers present in both Natural Earth files.
// ---------------------------------------------------------------------------

import { geoContains } from 'd3-geo'
import type { Feature, Geometry, Position } from 'geojson'
import type { BBox, Dataset } from '@atlas/spec'
import { bakeDataset, bboxOf, slug, type BakedFeature } from './bake'
import { loadNe, str, NE_SOURCE, type NeProps } from './naturalEarth'

const lines = (g: Geometry): Position[][] =>
  g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []

/** 45° cells keep chunks small and local. */
function cellOf(parts: Position[][]): string {
  const [x, y] = parts[0][Math.floor(parts[0].length / 2)]
  return `cell-${Math.floor((x + 180) / 45)}-${Math.floor((y + 90) / 45)}`
}

/** Country (ADM0_A3) a river belongs to: the one holding its midpoint, else any vertex. */
function countryLocator(countries: Feature<Geometry, NeProps>[]): (parts: Position[][]) => string | null {
  const boxed = countries.map((f) => ({
    a3: str(f.properties.ADM0_A3),
    f,
    box: bboxOf([{ type: 'Feature', geometry: f.geometry, properties: { id: '', name_it: '', name_en: '' } }]) as BBox,
  }))
  const at = ([x, y]: Position) =>
    boxed.find((c) => x >= c.box[0] && x <= c.box[2] && y >= c.box[1] && y <= c.box[3] && geoContains(c.f, [x, y]))?.a3 ?? null
  return (parts) => {
    const longest = parts.reduce((a, b) => (b.length > a.length ? b : a))
    const mid = at(longest[Math.floor(longest.length / 2)])
    if (mid) return mid
    for (const part of parts) for (let i = 0; i < part.length; i += 5) {
      const c = at(part[i])
      if (c) return c
    }
    return null
  }
}

export async function buildRivers(): Promise<Dataset> {
  const [main, europe, countries] = await Promise.all([
    loadNe('ne_10m_rivers_lake_centerlines'),
    loadNe('ne_10m_rivers_europe'),
    loadNe('ne_10m_admin_0_countries'),
  ])
  const countryOf = countryLocator(countries)

  // Group segments by name + country: one feature per river.
  const groups = new Map<string, { p: NeProps; name: string; country: string | null; parts: Position[][] }>()
  for (const f of [...main, ...europe]) {
    const name = str(f.properties.name_en) || str(f.properties.name)
    const parts = lines(f.geometry)
    if (!name || !parts.length) continue
    const country = countryOf(parts)
    const key = `${slug(name)}|${country}`
    const g = groups.get(key) ?? { p: f.properties, name, country, parts: [] }
    if (!str(g.p.name_it) && str(f.properties.name_it)) g.p = f.properties
    g.parts.push(...parts)
    groups.set(key, g)
  }

  const bySlug = new Map<string, number>()
  for (const g of groups.values()) bySlug.set(slug(g.name), (bySlug.get(slug(g.name)) ?? 0) + 1)

  const features: BakedFeature[] = [...groups.values()]
    .sort((a, b) => `${slug(a.name)}|${a.country}`.localeCompare(`${slug(b.name)}|${b.country}`))
    .map((g) => {
      const base = slug(g.name)
      const id = bySlug.get(base)! > 1 ? `${base}-${(g.country ?? 'xxx').toLowerCase()}` : base
      return {
        type: 'Feature',
        geometry: { type: 'MultiLineString', coordinates: g.parts },
        properties: {
          id,
          name_it: str(g.p.name_it) || g.name,
          name_en: g.name,
          country: g.country,
          wikidata: str(g.p.wikidataid) || null,
          rank: Number(g.p.scalerank),
          cell: cellOf(g.parts),
        },
      }
    })

  // A name shared by two unlocated rivers would still collide; number those.
  const seen = new Map<string, number>()
  for (const f of features) {
    const n = (seen.get(f.properties.id) ?? 0) + 1
    seen.set(f.properties.id, n)
    if (n > 1) f.properties.id = `${f.properties.id}-${n}`
  }

  return bakeDataset({
    id: 'ne/rivers',
    kind: 'lines',
    title: 'Rivers (Natural Earth 1:10m + European supplement)',
    description: 'Major rivers and lake centre-lines worldwide, with extra detail for Europe. One feature per river.',
    idScheme:
      'slug of the English name, e.g. "thames", "great-ouse"; a name shared across countries gets the ADM0_A3, e.g. "severn-gbr"',
    properties: {
      country: 'ADM0_A3 of the country holding the river’s midpoint (rivers crossing borders list one country)',
      wikidata: 'Wikidata QID, when Natural Earth has one',
      rank: 'Natural Earth scalerank, lower = more important',
    },
    validFor: 'present',
    source: NE_SOURCE,
    features,
    chunkOf: (f) => String(f.properties.cell),
    simplifyMeters: 300,
  })
}
