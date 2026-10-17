// The published site as a read-only data source: catalog, dataset indexes,
// series, chunks and lessons, fetched from GitHub Pages (or read from disk in
// the smoke test). The Worker never bakes data; it only reads what the
// pipeline published.

import {
  Catalog,
  DatasetIndex,
  SeriesFile,
  loadCheckContext,
  type CheckContext,
  type Dataset,
  type SeriesDataset,
} from '@atlas/spec'

/** Reads a JSON file by path relative to the site root, e.g. `data/catalog.json`. */
export type ReadJson = (path: string) => Promise<unknown>

export interface LessonSummary {
  id: string
  title: { it: string; en?: string }
  subject: string
  level: string
  steps: number
}

/** How long one isolate trusts what it fetched: a Pages deploy shows up within this. */
const TTL_MS = 5 * 60 * 1000

export class Site {
  private cache = new Map<string, { at: number; value: Promise<unknown> }>()

  constructor(
    /** Base URL of the viewer, ending in `/`; draft and lesson links are built on it. */
    readonly url: string,
    private readonly read: ReadJson,
  ) {}

  /** Memoised per isolate for TTL_MS; a failed read is forgotten at once. */
  private memo<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>
    const value = load()
    this.cache.set(key, { at: Date.now(), value })
    value.catch(() => this.cache.delete(key))
    return value
  }

  catalog(): Promise<Catalog> {
    return this.memo('catalog', async () => Catalog.parse(await this.read('data/catalog.json')))
  }

  async dataset(id: string): Promise<Dataset | undefined> {
    return (await this.catalog()).datasets.find((d) => d.id === id)
  }

  async seriesMeta(id: string): Promise<SeriesDataset | undefined> {
    return (await this.catalog()).series.find((s) => s.id === id)
  }

  index(ds: Dataset): Promise<DatasetIndex> {
    return this.memo(`index:${ds.id}`, async () => DatasetIndex.parse(await this.read(`data/${ds.index}`)))
  }

  series(s: SeriesDataset): Promise<SeriesFile> {
    return this.memo(`series:${s.id}`, async () => SeriesFile.parse(await this.read(`data/${s.path}`)))
  }

  /** Feature properties of one chunk (geometry is ignored). */
  chunkProperties(path: string): Promise<Record<string, unknown>[]> {
    return this.memo(`chunk:${path}`, async () => {
      const topo = (await this.read(`data/${path}`)) as {
        objects: Record<string, { geometries: { properties?: Record<string, unknown> }[] }>
      }
      return Object.values(topo.objects).flatMap((o) => o.geometries.map((g) => g.properties ?? {}))
    })
  }

  checkContext(): Promise<CheckContext> {
    return this.memo('check', () => loadCheckContext((path) => this.read(`data/${path}`)))
  }

  lessons(): Promise<LessonSummary[]> {
    return this.memo('lessons', async () => (await this.read('data/lessons.json')) as LessonSummary[])
  }

  async lesson(id: string): Promise<unknown> {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new Error(`"${id}" is not a lesson id`)
    return this.read(`lessons/${id}.json`)
  }

  lessonUrl(id: string, print = false): string {
    return `${this.url}?lesson=${id}${print ? '&print=1' : ''}`
  }

  draftUrl(id: string, print = false): string {
    return `${this.url}?draft=${id}${print ? '&print=1' : ''}`
  }
}

/** A Site backed by `fetch` against the published viewer. */
export function remoteSite(url: string): Site {
  const base = url.endsWith('/') ? url : `${url}/`
  return new Site(base, async (path) => {
    const res = await fetch(base + path, { cf: { cacheTtl: 300 } } as RequestInit)
    if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`)
    return res.json()
  })
}
