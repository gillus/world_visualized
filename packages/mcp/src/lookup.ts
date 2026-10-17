// Read tools over the data catalog: find datasets and feature ids by name,
// list series, describe one dataset in enough detail to write a lesson
// (ids, properties for `where` filters, series values for choosing breaks).

import { chunkIntersects, valueAtOrBefore, type BBox, type Dataset, type SeriesDataset } from '@atlas/spec'
import type { Site } from './site'

/** Lowercase, no accents: "Città" matches "citta". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** 5 exact, 4 exact but for accents, 3 prefix, 2 word prefix, 1 substring, 0 no match.
 *  `needle` is folded; `raw` is the query as typed, lowercased. */
function score(hay: string, needle: string, raw = needle): number {
  if (hay.toLowerCase() === raw) return 5
  const h = fold(hay)
  if (h === needle) return 4
  if (h.startsWith(needle)) return 3
  if (h.split(/[\s\-'’(),/]+/).some((w) => w.startsWith(needle))) return 2
  return h.includes(needle) ? 1 : 0
}

/** Datasets drawn for their own sake, not as lesson layers. */
const NOT_FOR_LAYERS = new Set(['terrain/relief'])

const toBBox = (extent: [[number, number], [number, number]]): BBox => [extent[0][0], extent[0][1], extent[1][0], extent[1][1]]

function chunkFilter(ds: Dataset, extent?: [[number, number], [number, number]]): (chunk: string) => boolean {
  if (!extent) return () => true
  const box = toBBox(extent)
  const keep = new Set(ds.chunks.filter((c) => chunkIntersects(c, box)).map((c) => c.key))
  return (chunk) => keep.has(chunk)
}

export async function findGeo(site: Site, query: string, extent?: [[number, number], [number, number]], limit = 30) {
  const raw = query.trim().toLowerCase()
  const q = fold(raw)
  const catalog = await site.catalog()
  const geo = catalog.datasets.filter((d) => !NOT_FOR_LAYERS.has(d.id))

  const datasets = geo
    .filter((d) => [d.id, d.title, d.description].some((t) => score(t, q) > 0))
    .map((d) => ({ id: d.id, kind: d.kind, title: d.title, idScheme: d.idScheme }))

  const features: { dataset: string; id: string; name_it: string; name_en: string; score: number; order: number }[] = []
  await Promise.all(
    geo.map(async (ds, order) => {
      const inExtent = chunkFilter(ds, extent)
      for (const f of await site.index(ds)) {
        if (!inExtent(f.chunk)) continue
        const s = Math.max(score(f.name_it, q, raw), score(f.name_en, q, raw), fold(f.id) === q ? 5 : 0)
        if (s > 0) features.push({ dataset: ds.id, id: f.id, name_it: f.name_it, name_en: f.name_en, score: s, order })
      }
    }),
  )
  features.sort((a, b) => b.score - a.score || a.order - b.order || a.name_it.localeCompare(b.name_it))

  return {
    datasets,
    features: features.slice(0, limit).map(({ score: _s, order: _o, ...f }) => f),
    more: Math.max(0, features.length - limit),
  }
}

export async function searchSeries(site: Site, query?: string) {
  const catalog = await site.catalog()
  const q = query ? fold(query.trim()) : ''
  return catalog.series
    .filter((s) => !q || [s.id, s.title, s.description, s.keys, s.unit.it, s.unit.en ?? ''].some((t) => score(t, q) > 0))
    .map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      unit: s.unit,
      years: s.years,
      keys: s.keys,
      source: `${s.source.name} (${s.source.licence})`,
    }))
}

export async function describeDataset(
  site: Site,
  id: string,
  opts: { extent?: [[number, number], [number, number]]; query?: string; year?: number; limit?: number } = {},
) {
  const limit = opts.limit ?? 40
  const series = await site.seriesMeta(id)
  if (series) return describeSeries(site, series, opts.year)
  const ds = await site.dataset(id)
  if (!ds) {
    const catalog = await site.catalog()
    throw new Error(
      `Unknown dataset "${id}". Datasets: ${catalog.datasets.map((d) => d.id).join(', ')}. Series: ${catalog.series.map((s) => s.id).join(', ')}.`,
    )
  }

  const q = opts.query ? fold(opts.query.trim()) : ''
  const inExtent = chunkFilter(ds, opts.extent)
  const index = (await site.index(ds)).filter(
    (f) => inExtent(f.chunk) && (!q || score(f.name_it, q) > 0 || score(f.name_en, q) > 0 || fold(f.id) === q),
  )

  // Properties come from the chunks themselves; only read them for a narrowed
  // listing (a whole world dataset is a few MB).
  const narrowed = Boolean(opts.extent || q)
  let features: Record<string, unknown>[]
  if (narrowed) {
    const wanted = new Set(index.map((f) => f.id))
    const chunks = ds.chunks.filter((c) => index.some((f) => f.chunk === c.key))
    const props = (await Promise.all(chunks.map((c) => site.chunkProperties(c.path)))).flat()
    features = props.filter((p) => wanted.has(String(p.id)))
    // Biggest first where size means something (cities by population, rivers by rank).
    if ('pop' in ds.properties) features.sort((a, b) => Number(b.pop ?? 0) - Number(a.pop ?? 0))
    else if ('rank' in ds.properties) features.sort((a, b) => Number(a.rank ?? 99) - Number(b.rank ?? 99))
  } else {
    features = index.map((f) => ({ id: f.id, name_it: f.name_it, name_en: f.name_en }))
  }

  return {
    id: ds.id,
    kind: ds.kind,
    title: ds.title,
    description: ds.description,
    idScheme: ds.idScheme,
    properties: { id: 'feature id (see idScheme)', name_it: 'Italian name', name_en: 'English name', ...ds.properties },
    validFor: ds.validFor,
    source: ds.source,
    chunks: ds.chunks.map((c) => ({ key: c.key, bbox: c.bbox, features: c.features })),
    matching: index.length,
    features: features.slice(0, limit),
    note: narrowed
      ? undefined
      : 'Names only. Pass `extent` or `query` to see every property (for `where` filters and `size`).',
  }
}

async function describeSeries(site: Site, s: SeriesDataset, year?: number) {
  const [file, keysDs] = await Promise.all([site.series(s), site.dataset(s.keys)])
  const names = new Map(keysDs ? (await site.index(keysDs)).map((f) => [f.id, f]) : [])
  const at = year ?? s.years[1]
  const values = Object.entries(file.values).map(([id, byYear]) => {
    const hit = valueAtOrBefore(byYear, at)
    const years = Object.entries(byYear)
      .filter(([, v]) => v !== null)
      .map(([y]) => Number(y))
    return {
      id,
      name_it: names.get(id)?.name_it,
      value: hit?.[0] ?? null,
      year: hit?.[1] ?? null,
      years: years.length ? [Math.min(...years), Math.max(...years)] : null,
    }
  })
  values.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
  return {
    id: s.id,
    kind: 'series',
    title: s.title,
    description: s.description,
    unit: s.unit,
    decimals: s.decimals,
    years: s.years,
    keys: `${s.keys} (use this dataset's ids; a choropleth colours its areas)`,
    source: s.source,
    valuesAt: at,
    values,
    aggregates: Object.fromEntries(
      Object.entries(file.aggregates).map(([key, a]) => [key, { name_it: a.name_it, value: valueAtOrBefore(a.values, at) }]),
    ),
  }
}
