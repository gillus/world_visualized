// ---------------------------------------------------------------------------
// Lesson validation in two passes:
//   1. shape   — zod parse against the schema (types, required fields)
//   2. meaning — cross-references the schema can't express: data handles that
//      resolve to real datasets, feature ids that exist, citations that point
//      at declared sources, translations promised by `langs`.
// Errors block publishing; warnings are things a careful author should look at.
// ---------------------------------------------------------------------------

import { RELIEF_DATASET, chunkIntersects, type Catalog, type Dataset, type SeriesDataset } from './catalog'
import { Lesson, type Extent, type Layer, type LonLat } from './lesson'

export interface Issue {
  level: 'error' | 'warning'
  /** Dotted path into the lesson, e.g. `steps.2.layers.0.groups.1.ids`. */
  path: string
  message: string
}

export interface CheckContext {
  catalog: Catalog
  /** Feature ids of a geo dataset (from its index), or undefined if not loaded. */
  ids(datasetId: string): ReadonlySet<string> | undefined
  /** Years with at least one value in a series, or undefined if not loaded. */
  years?(seriesId: string): ReadonlySet<number> | undefined
}

export interface ValidationResult {
  lesson?: Lesson
  issues: Issue[]
}

/** Parse + check. `lesson` is set whenever the shape is valid, even if meaning-level errors remain. */
export function validateLesson(json: unknown, ctx?: CheckContext): ValidationResult {
  const parsed = Lesson.safeParse(json)
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((i) => ({ level: 'error', path: i.path.join('.'), message: i.message })),
    }
  }
  return { lesson: parsed.data, issues: checkLesson(parsed.data, ctx) }
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.level === 'error')
}

const BUILTIN_PROPS = ['id', 'name_it', 'name_en']

/** What a data handle points at: always some geometry, plus values for a series handle. */
interface Resolved {
  geo: Dataset
  series?: SeriesDataset
}

export function checkLesson(lesson: Lesson, ctx?: CheckContext): Issue[] {
  const issues: Issue[] = []
  const error = (path: string, message: string) => issues.push({ level: 'error', path, message })
  const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message })

  if (!lesson.langs.includes('it')) error('langs', 'every lesson must be complete in Italian ("it")')

  // Data handles → datasets.
  const handles = new Map<string, Resolved>()
  for (const [key, ref] of Object.entries(lesson.data)) {
    if (!ctx) continue
    const geoById = (id: string) => ctx.catalog.datasets.find((d) => d.id === id)
    const series = ctx.catalog.series.find((s) => s.id === ref.dataset)
    const geo = series ? geoById(series.keys) : geoById(ref.dataset)
    if (!geo) {
      error(`data.${key}.dataset`, `unknown dataset "${ref.dataset}"`)
      continue
    }
    handles.set(key, { geo, series })
    for (const prop of Object.keys(ref.where ?? {})) {
      if (!BUILTIN_PROPS.includes(prop) && !(prop in geo.properties)) {
        error(`data.${key}.where.${prop}`, `"${geo.id}" has no property "${prop}" (has: ${[...BUILTIN_PROPS, ...Object.keys(geo.properties)].join(', ')})`)
      }
    }
  }

  const usedHandles = new Set<string>()
  const usedSources = new Set<string>()

  const cite = (path: string, keys: string[]) => {
    for (const key of keys) {
      usedSources.add(key)
      if (!(key in lesson.sources)) error(path, `cites "${key}", which is not in sources`)
    }
  }
  const checkView = (path: string, view: Extent | undefined) => {
    if (view && !extentInside(view, lesson.map.extent)) warn(path, 'view reaches outside map.extent; data there may not be loaded')
  }
  /** Marks the handle used; returns what it resolves to (undefined if unknown or no catalog). */
  const handle = (path: string, key: string): Resolved | undefined => {
    usedHandles.add(key)
    if (!(key in lesson.data)) {
      error(path, `unknown data handle "${key}" (declare it under "data")`)
      return undefined
    }
    return handles.get(key)
  }
  const checkIds = (path: string, r: Resolved | undefined, ids: Iterable<string>) => {
    const known = r && ctx?.ids(r.geo.id)
    if (!r || !known) return
    for (const id of ids) {
      if (!known.has(id)) error(path, `"${id}" is not a feature id in "${r.geo.id}" (${r.geo.idScheme})`)
    }
  }
  const requireKind = (path: string, r: Resolved | undefined, kinds: Dataset['kind'][]) => {
    if (r && !kinds.includes(r.geo.kind)) error(path, `this needs ${kinds.join(' or ')}, but "${r.geo.id}" is ${r.geo.kind}`)
  }
  const requireSeries = (path: string, r: Resolved | undefined): SeriesDataset | undefined => {
    if (r && !r.series) error(path, `this needs a series handle (one of: ${ctx?.catalog.series.map((s) => s.id).join(', ') || 'none'}), but "${r.geo.id}" is geometry`)
    return r?.series
  }
  const checkYear = (path: string, series: SeriesDataset | undefined, year: number) => {
    if (!series) return
    const years = ctx?.years?.(series.id)
    if (year < series.years[0]) error(path, `"${series.id}" starts in ${series.years[0]}`)
    else if (year > series.years[1]) warn(path, `"${series.id}" ends in ${series.years[1]}; that year will be shown`)
    else if (years && !years.has(year)) warn(path, `"${series.id}" has no values for ${year}; the latest earlier year will be shown`)
  }

  const checkLayer = (lp: string, layer: Layer) => {
    if (layer.type === 'note') {
      if (!pointInside(layer.at, lesson.map.extent)) warn(`${lp}.at`, 'note is outside map.extent')
      return
    }
    const r = handle(`${lp}.data`, layer.data)
    switch (layer.type) {
      case 'highlight': {
        requireKind(lp, r, ['polygons'])
        layer.groups.forEach((g, gi) => checkIds(`${lp}.groups.${gi}.ids`, r, g.ids))
        const colors = layer.groups.map((g) => g.color).filter(Boolean)
        if (new Set(colors).size !== colors.length) warn(`${lp}.groups`, 'two groups share a colour')
        break
      }
      case 'labels':
        if (layer.ids) checkIds(`${lp}.ids`, r, layer.ids)
        if (layer.text) checkIds(`${lp}.text`, r, Object.keys(layer.text))
        break
      case 'compare':
        requireKind(lp, r, ['polygons'])
        checkIds(`${lp}.id`, r, [layer.id])
        if (!pointInside(layer.at, lesson.map.extent)) warn(`${lp}.at`, 'compare target is outside map.extent')
        break
      case 'choropleth': {
        requireKind(lp, r, ['polygons'])
        checkYear(`${lp}.year`, requireSeries(lp, r), layer.year)
        if (layer.breaks?.some((b, i) => i > 0 && b <= layer.breaks![i - 1])) error(`${lp}.breaks`, 'breaks must be strictly ascending')
        break
      }
      case 'symbols':
        requireKind(lp, r, ['points'])
        if (r && !(layer.size in r.geo.properties)) error(`${lp}.size`, `"${r.geo.id}" has no property "${layer.size}"`)
        if (layer.ids) checkIds(`${lp}.ids`, r, layer.ids)
        if (layer.text) checkIds(`${lp}.text`, r, Object.keys(layer.text))
        break
      case 'lines':
        requireKind(lp, r, ['lines'])
        if (layer.ids) checkIds(`${lp}.ids`, r, layer.ids)
        if (layer.text) checkIds(`${lp}.text`, r, Object.keys(layer.text))
        break
    }
  }

  const stepIds = new Set<string>()
  const basemaps = new Set([lesson.map.basemap])
  lesson.steps.forEach((step, si) => {
    const sp = `steps.${si}`
    if (stepIds.has(step.id)) error(`${sp}.id`, `duplicate step id "${step.id}"`)
    stepIds.add(step.id)
    if (step.basemap) basemaps.add(step.basemap)
    cite(`${sp}.cite`, step.cite)
    checkView(`${sp}.view`, step.view)
    step.layers.forEach((layer, li) => checkLayer(`${sp}.layers.${li}`, layer))
    step.frames?.forEach((frame, fi) => {
      const fp = `${sp}.frames.${fi}`
      cite(`${fp}.cite`, frame.cite)
      checkView(`${fp}.view`, frame.view)
      frame.layers.forEach((layer, li) => checkLayer(`${fp}.layers.${li}`, layer))
    })
    if (step.chart) {
      const r = handle(`${sp}.chart.data`, step.chart.data)
      checkYear(`${sp}.chart.year`, requireSeries(`${sp}.chart`, r), step.chart.year)
    }
  })

  lesson.quiz.forEach((q, qi) => {
    const qp = `quiz.${qi}`
    cite(`${qp}.cite`, q.cite)
    checkView(`${qp}.view`, q.view)
    if (q.basemap) basemaps.add(q.basemap)
    if (q.type === 'choice') {
      if (q.answer >= q.choices.length) error(`${qp}.answer`, `answer ${q.answer} but only ${q.choices.length} choices (counting from 0)`)
      q.layers.forEach((layer, li) => checkLayer(`${qp}.layers.${li}`, layer))
    } else {
      const r = handle(`${qp}.data`, q.data)
      requireKind(qp, r, ['polygons'])
      checkIds(`${qp}.ids`, r, q.ids)
      if (!q.ids.includes(q.answer)) error(`${qp}.answer`, `"${q.answer}" is not one of the candidate ids`)
      if (new Set(q.ids).size !== q.ids.length) error(`${qp}.ids`, 'duplicate candidate id')
    }
  })

  if (basemaps.has('physical') && ctx) {
    const relief = ctx.catalog.datasets.find((d) => d.id === RELIEF_DATASET)
    const [[w, s], [e, n]] = lesson.map.extent
    if (!relief) error('map.basemap', `the physical basemap needs "${RELIEF_DATASET}", which is not in the catalog`)
    else if (!relief.chunks.some((c) => chunkIntersects(c, [w, s, e, n]))) {
      warn('map.basemap', `"${RELIEF_DATASET}" has no relief for this map extent yet; physical steps will look flat`)
    }
  }

  for (const key of Object.keys(lesson.data)) {
    if (!usedHandles.has(key)) warn(`data.${key}`, 'data handle is never used')
  }
  for (const key of Object.keys(lesson.sources)) {
    if (!usedSources.has(key)) warn(`sources.${key}`, 'source is never cited')
  }

  // Translations promised by `langs` must exist everywhere.
  for (const lang of lesson.langs) {
    if (lang === 'it') continue
    for (const [path, text] of texts(lesson)) {
      if (!text[lang]) error(path, `missing "${lang}" translation (lesson declares langs: ${lesson.langs.join(', ')})`)
    }
  }

  return issues
}

/** Every Text object in the lesson with its path. */
function* texts(value: unknown, path = ''): Generator<[string, Record<string, string | undefined>]> {
  if (value === null || typeof value !== 'object') return
  if (!Array.isArray(value) && typeof (value as { it?: unknown }).it === 'string') {
    yield [path, value as Record<string, string | undefined>]
    return
  }
  for (const [k, v] of Object.entries(value)) yield* texts(v, path ? `${path}.${k}` : k)
}

function pointInside([lon, lat]: LonLat, [[w, s], [e, n]]: Extent): boolean {
  return lon >= w && lon <= e && lat >= s && lat <= n
}

function extentInside([sw, ne]: Extent, outer: Extent): boolean {
  return pointInside(sw, outer) && pointInside(ne, outer)
}
