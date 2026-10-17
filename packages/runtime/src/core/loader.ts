// ---------------------------------------------------------------------------
// Loading: lesson spec + catalog + only the data chunks the lesson needs.
// Framework-agnostic (no Svelte here).
//
// A dataset's chunks are picked by the lesson's map extent; any feature a
// layer names explicitly (e.g. a `compare` country far outside the extent) is
// looked up in the dataset index and its chunk fetched too.
// ---------------------------------------------------------------------------

import { feature as topoFeature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { LessonLink } from './url'
import type { Feature, Geometry } from 'geojson'
import {
  BASEMAP_DATASET,
  Catalog,
  DatasetIndex,
  Lesson,
  RELIEF_DATASET,
  SeriesFile,
  chunkIntersects,
  type BBox,
  type BaseFeatureProps,
  type Dataset,
  type Layer,
  type SeriesDataset,
  type Where,
} from '@atlas/spec'

export type MapFeature = Feature<Geometry, BaseFeatureProps>

export interface LoadedSeries {
  meta: SeriesDataset
  file: SeriesFile
}

export interface LessonData {
  catalog: Catalog
  /** Basemap countries (ne/admin0) within the lesson extent. */
  basemap: MapFeature[]
  /** Relief bands, lowest first — loaded only if some step uses the physical basemap. */
  relief: MapFeature[]
  /** Data handle key → its features (after `where`), indexed by feature id.
   *  A series handle maps to the areas of the series' key dataset. */
  handles: Map<string, Map<string, MapFeature>>
  /** Series handle key → its values. */
  series: Map<string, LoadedSeries>
  /** Datasets and series this lesson draws on — for the credits. */
  datasets: (Dataset | SeriesDataset)[]
}

export class LoadError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message)
  }
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(path)
  if (!res.ok) throw new LoadError(`${path}: ${res.status} ${res.statusText}`)
  return res.json()
}

export async function loadCatalog(): Promise<Catalog> {
  try {
    return Catalog.parse(await getJson('data/catalog.json'))
  } catch (err) {
    throw new LoadError('Mancano i dati delle mappe. Esegui `npm run atlas:data` e ricarica.', [String(err)])
  }
}

/** Where drafts live: the MCP Worker that saved them (see packages/mcp). */
const DRAFTS_URL = import.meta.env.VITE_DRAFTS_URL

export async function loadLesson(link: LessonLink): Promise<Lesson> {
  let json: unknown
  let id: string
  if (link.draft !== undefined) {
    id = link.draft
    if (!/^[a-z0-9]+$/.test(id) || !DRAFTS_URL) throw new LoadError(`«${id}» non è una bozza valida.`)
    try {
      json = await getJson(`${DRAFTS_URL}/drafts/${id}`)
    } catch {
      throw new LoadError(`Non trovo la bozza «${id}»: le bozze durano 30 giorni.`)
    }
  } else {
    id = link.lesson
    if (!/^[a-z0-9-]+$/.test(id)) throw new LoadError(`«${id}» non è un nome di lezione valido.`)
    try {
      json = await getJson(`lessons/${id}.json`)
    } catch {
      throw new LoadError(`Non trovo la lezione «${id}».`)
    }
  }
  const parsed = Lesson.safeParse(json)
  if (!parsed.success) {
    throw new LoadError(
      `La lezione «${id}» contiene errori.`,
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    )
  }
  return parsed.data
}

const chunkCache = new Map<string, Promise<MapFeature[]>>()

function loadChunk(path: string): Promise<MapFeature[]> {
  let p = chunkCache.get(path)
  if (!p) {
    p = getJson(`data/${path}`).then((topo) => {
      const t = topo as Topology<{ features: GeometryCollection<BaseFeatureProps> }>
      const fc = topoFeature(t, t.objects.features)
      return fc.features as MapFeature[]
    })
    chunkCache.set(path, p)
  }
  return p
}

/** Ids each data handle's layers name explicitly. */
function referencedIds(lesson: Lesson): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (handle: string, ids: Iterable<string>) => {
    if (!out.has(handle)) out.set(handle, new Set())
    for (const id of ids) out.get(handle)!.add(id)
  }
  const visit = (layer: Layer) => {
    if (layer.type === 'highlight') add(layer.data, layer.groups.flatMap((g) => g.ids))
    else if (layer.type === 'labels' || layer.type === 'symbols' || layer.type === 'lines') add(layer.data, layer.ids ?? [])
    else if (layer.type === 'compare') add(layer.data, [layer.id])
  }
  for (const step of lesson.steps) {
    step.layers.forEach(visit)
    step.frames?.forEach((f) => f.layers.forEach(visit))
  }
  for (const q of lesson.quiz) {
    if (q.type === 'choice') q.layers.forEach(visit)
    else add(q.data, q.ids)
  }
  return out
}

async function loadDataset(ds: Dataset, extent: BBox, mustHave: Set<string>): Promise<MapFeature[]> {
  const chunks = new Set(ds.chunks.filter((c) => chunkIntersects(c, extent)))
  const loadAll = async () => (await Promise.all([...chunks].map((c) => loadChunk(c.path)))).flat()

  let features = await loadAll()
  const have = new Set(features.map((f) => f.properties.id))
  const missing = [...mustHave].filter((id) => !have.has(id))
  if (missing.length) {
    const index = DatasetIndex.parse(await getJson(`data/${ds.index}`))
    const chunkOf = new Map(index.map((e) => [e.id, e.chunk]))
    for (const id of missing) {
      const chunk = ds.chunks.find((c) => c.key === chunkOf.get(id))
      if (chunk) chunks.add(chunk)
    }
    features = await loadAll()
  }
  return features
}

export function matchesWhere(props: BaseFeatureProps, where: Where | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    const v = props[key]
    if (v === null || v === undefined) return false
    if (Array.isArray(cond)) return cond.includes(v)
    if (typeof cond === 'object') {
      return typeof v === 'number' && (cond.min === undefined || v >= cond.min) && (cond.max === undefined || v <= cond.max)
    }
    return v === cond
  })
}

export function usesPhysical(lesson: Lesson): boolean {
  return (
    lesson.map.basemap === 'physical' ||
    lesson.steps.some((s) => s.basemap === 'physical') ||
    lesson.quiz.some((q) => q.basemap === 'physical')
  )
}

export async function loadLessonData(lesson: Lesson, catalog: Catalog): Promise<LessonData> {
  const [[w, s], [e, n]] = lesson.map.extent
  const extent: BBox = [w, s, e, n]
  const datasetById = new Map(catalog.datasets.map((d) => [d.id, d]))
  const seriesById = new Map(catalog.series.map((d) => [d.id, d]))
  const refs = referencedIds(lesson)
  /** A series handle draws the areas of its key dataset. */
  const geoIdOf = (datasetId: string) => seriesById.get(datasetId)?.keys ?? datasetId

  // Per dataset: the union of ids any handle on it names.
  const mustHave = new Map<string, Set<string>>()
  const need = (id: string) => {
    if (!datasetById.has(id)) throw new LoadError(`Il dataset «${id}» non esiste nel catalogo.`)
    if (!mustHave.has(id)) mustHave.set(id, new Set())
    return mustHave.get(id)!
  }
  need(BASEMAP_DATASET)
  const physical = usesPhysical(lesson) && datasetById.has(RELIEF_DATASET)
  if (physical) need(RELIEF_DATASET)
  for (const [key, ref] of Object.entries(lesson.data)) {
    const set = need(geoIdOf(ref.dataset))
    for (const id of refs.get(key) ?? []) set.add(id)
  }

  const series = new Map<string, LoadedSeries>()
  await Promise.all(
    Object.entries(lesson.data).map(async ([key, ref]) => {
      const meta = seriesById.get(ref.dataset)
      if (!meta) return
      try {
        series.set(key, { meta, file: SeriesFile.parse(await getJson(`data/${meta.path}`)) })
      } catch (err) {
        throw new LoadError(`Non riesco a leggere i dati «${meta.id}».`, [String(err)])
      }
    }),
  )

  const loaded = new Map<string, MapFeature[]>()
  await Promise.all(
    [...mustHave].map(async ([id, ids]) => loaded.set(id, await loadDataset(datasetById.get(id)!, extent, ids))),
  )

  const handles = new Map<string, Map<string, MapFeature>>()
  for (const [key, ref] of Object.entries(lesson.data)) {
    const byId = new Map<string, MapFeature>()
    const values = series.get(key)?.file.values
    for (const f of loaded.get(geoIdOf(ref.dataset))!) {
      if (matchesWhere(f.properties, ref.where) && (!values || f.properties.id in values)) byId.set(f.properties.id, f)
    }
    handles.set(key, byId)
  }

  const relief = physical
    ? [...loaded.get(RELIEF_DATASET)!].sort((a, b) => Number(a.properties.min) - Number(b.properties.min))
    : []

  return {
    catalog,
    basemap: loaded.get(BASEMAP_DATASET)!,
    relief,
    handles,
    series,
    datasets: [
      ...[...mustHave.keys()].map((id) => datasetById.get(id)!),
      ...[...series.values()].map((s) => s.meta),
    ],
  }
}

export interface LessonSummary {
  id: string
  title: Lesson['title']
  subtitle?: Lesson['subtitle']
  subject: Lesson['subject']
  level: Lesson['level']
  langs: Lesson['langs']
  steps: number
}

export async function loadLessonIndex(): Promise<LessonSummary[]> {
  try {
    return (await getJson('data/lessons.json')) as LessonSummary[]
  } catch (err) {
    throw new LoadError("Manca l'elenco delle lezioni. Esegui `npm run atlas:data` e ricarica.", [String(err)])
  }
}
