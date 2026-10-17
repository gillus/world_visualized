// ---------------------------------------------------------------------------
// The data catalog: what datasets exist, where their files are, and what
// licence they carry. Written by the pipeline (site/data/catalog.json), read by
// the viewer, the validator and (later) the MCP tools. Lessons refer to
// datasets only by `id`.
// ---------------------------------------------------------------------------

import { z } from 'zod'
import { Text } from './lesson'

/** Countries drawn under every lesson. */
export const BASEMAP_DATASET = 'ne/admin0'
/** Elevation bands drawn by `basemap: "physical"`. */
export const RELIEF_DATASET = 'terrain/relief'

/** [west, south, east, north] in degrees. */
export const BBox = z.tuple([z.number(), z.number(), z.number(), z.number()])
export type BBox = z.infer<typeof BBox>

export const Chunk = z
  .object({
    key: z.string(),
    /** Overall extent of the chunk (informative; may span the antimeridian). */
    bbox: BBox,
    /** Tight boxes (≈ one per country, split at the antimeridian) used to pick
     *  which chunks a lesson needs — a single bbox for Russia would cover the globe. */
    boxes: z.array(BBox).min(1),
    /** Path relative to data/, e.g. `geo/ne/admin0/northern-europe.topo.json`. */
    path: z.string(),
    bytes: z.number().int(),
    features: z.number().int(),
  })
  .strict()
export type Chunk = z.infer<typeof Chunk>

export const DatasetSource = z
  .object({
    name: z.string(),
    url: z.url(),
    licence: z.string(),
    licenceUrl: z.url(),
    attribution: z.string(),
  })
  .strict()

export const Dataset = z
  .object({
    id: z.string(),
    kind: z.enum(['polygons', 'points', 'lines']),
    title: z.string(),
    description: z.string(),
    /** What a feature `id` means for this dataset (e.g. "ISO 3166-1 alpha-3"). */
    idScheme: z.string(),
    /** Feature properties available to `where` filters, with their meaning. */
    properties: z.record(z.string(), z.string()),
    /** "present" or a date range the geometry is valid for. */
    validFor: z.string(),
    source: DatasetSource,
    chunks: z.array(Chunk).min(1),
    /** Path relative to data/ of the `DatasetIndex` (every feature id → name, chunk). */
    index: z.string(),
  })
  .strict()
export type Dataset = z.infer<typeof Dataset>

/** Numbers per feature per year (population, income…), keyed by the feature
 *  ids of a geo dataset — the areas a choropleth colours. */
export const SeriesDataset = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    /** Geo dataset whose feature ids key this series. */
    keys: z.string(),
    /** Unit as shown to students, e.g. { it: "abitanti per km²" }. */
    unit: Text,
    /** Decimal places worth showing. */
    decimals: z.number().int().min(0).max(3),
    /** First and last year with any value. */
    years: z.tuple([z.number().int(), z.number().int()]),
    source: DatasetSource,
    /** Path relative to data/ of the `SeriesFile`. */
    path: z.string(),
  })
  .strict()
export type SeriesDataset = z.infer<typeof SeriesDataset>

const YearValues = z.record(z.string(), z.number().nullable())

export const SeriesFile = z
  .object({
    /** feature id → year → value (null = no data, never 0). */
    values: z.record(z.string(), YearValues),
    /** Totals for a wider area (e.g. the whole UK), used as a reference line. */
    aggregates: z.record(z.string(), z.object({ name_it: z.string(), name_en: z.string(), values: YearValues }).strict()),
  })
  .strict()
export type SeriesFile = z.infer<typeof SeriesFile>

export const Catalog = z
  .object({
    version: z.literal(0),
    generated: z.string(),
    datasets: z.array(Dataset),
    series: z.array(SeriesDataset).default([]),
  })
  .strict()
export type Catalog = z.infer<typeof Catalog>

/** Small per-dataset lookup used for id validation and (later) MCP `describe_dataset`. */
export const DatasetIndex = z.array(
  z
    .object({
      id: z.string(),
      name_it: z.string(),
      name_en: z.string(),
      chunk: z.string(),
    })
    .strict(),
)
export type DatasetIndex = z.infer<typeof DatasetIndex>

/** Every feature the pipeline writes carries at least these properties. */
export interface BaseFeatureProps {
  id: string
  name_it: string
  name_en: string
  [prop: string]: string | number | boolean | null
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
}

/** The value for `year`, or the latest earlier one: [value, year it is from]. */
export function valueAtOrBefore(values: Record<string, number | null> | undefined, year: number): [number, number] | null {
  if (!values) return null
  let best: [number, number] | null = null
  for (const [y, v] of Object.entries(values)) {
    const yr = Number(y)
    if (v !== null && yr <= year && (!best || yr > best[1])) best = [v, yr]
  }
  return best
}

export function chunkIntersects(chunk: Chunk, box: BBox): boolean {
  return chunk.boxes.some((b) => bboxIntersects(b, box))
}
