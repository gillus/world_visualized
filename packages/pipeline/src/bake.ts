// ---------------------------------------------------------------------------
// Turn a normalised GeoJSON FeatureCollection into a catalog dataset:
// simplify once (globally, so borders shared across chunks stay identical),
// split into regional chunks, write each chunk as quantised TopoJSON, and
// write the id → name index used by the validator.
// ---------------------------------------------------------------------------

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import mapshaper from 'mapshaper'
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import type { BBox, BaseFeatureProps, Chunk, Dataset, DatasetIndex } from '@atlas/spec'
import { DATA } from './paths'

export type BakedFeature = Feature<Geometry, BaseFeatureProps>

export interface BakeInput extends Omit<Dataset, 'chunks' | 'index'> {
  features: BakedFeature[]
  /** Which chunk a feature goes to (a stable, file-name-safe key). */
  chunkOf(f: BakedFeature): string
  /** Simplification tolerance in metres; omit for points. */
  simplifyMeters?: number
}

/** A country with more simplified vertices (or places) than this gets its own chunk. */
const OWN_CHUNK_VERTICES = 12_000
const OWN_CHUNK_POINTS = 300

/** Features of one country stay together: map units group by their country. */
const groupOf = (f: BakedFeature) => String(f.properties.country || f.properties.id)

export async function runMapshaper(commands: string, input: unknown): Promise<string> {
  const out = await mapshaper.applyCommands(commands, { 'in.json': JSON.stringify(input) })
  const file = out['out.json']
  if (file == null) throw new Error(`mapshaper produced no output for: ${commands}`)
  return typeof file === 'string' ? file : Buffer.from(file).toString('utf8')
}

export async function bakeDataset(input: BakeInput): Promise<Dataset> {
  const { features, chunkOf, simplifyMeters, ...meta } = input
  assertUniqueIds(meta.id, features)

  let simplified: BakedFeature[] = features
  if (simplifyMeters) {
    const fc: FeatureCollection = { type: 'FeatureCollection', features }
    const text = await runMapshaper(
      `-i in.json -simplify interval=${simplifyMeters} keep-shapes -o out.json format=geojson`,
      fc,
    )
    simplified = (JSON.parse(text) as FeatureCollection<Geometry, BaseFeatureProps>).features
  }

  // Very large countries get a chunk of their own, so a lesson about Europe
  // doesn't download Canada because Greenland shares its subregion.
  const vertices = new Map<string, number>()
  for (const f of simplified) {
    const g = groupOf(f)
    vertices.set(g, (vertices.get(g) ?? 0) + parts(f.geometry).reduce((n, p) => n + p.length, 0))
  }
  const limit = meta.kind === 'points' ? OWN_CHUNK_POINTS : OWN_CHUNK_VERTICES
  const byChunk = new Map<string, BakedFeature[]>()
  for (const f of simplified) {
    const g = groupOf(f)
    const key = vertices.get(g)! > limit ? `${chunkOf(f)}--${slug(g)}` : chunkOf(f)
    if (!byChunk.has(key)) byChunk.set(key, [])
    byChunk.get(key)!.push(f)
  }

  const dir = join(DATA, 'geo', meta.id)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  const chunks: Chunk[] = []
  const index: DatasetIndex = []
  for (const [key, fs] of [...byChunk].sort(([a], [b]) => a.localeCompare(b))) {
    const topo = await runMapshaper(
      '-i in.json -rename-layers features -o out.json format=topojson quantization=100000',
      { type: 'FeatureCollection', features: fs },
    )
    const path = `geo/${meta.id}/${key}.topo.json`
    await writeFile(join(DATA, path), topo)
    chunks.push({ key, bbox: bboxOf(fs), boxes: chunkBoxes(fs), path, bytes: Buffer.byteLength(topo), features: fs.length })
    for (const f of fs) index.push({ id: f.properties.id, name_it: f.properties.name_it, name_en: f.properties.name_en, chunk: key })
  }

  const indexPath = `geo/${meta.id}/index.json`
  index.sort((a, b) => a.id.localeCompare(b.id))
  await writeFile(join(DATA, indexPath), JSON.stringify(index))

  const total = chunks.reduce((s, c) => s + c.bytes, 0)
  console.log(`  baked    ${meta.id}: ${features.length} features, ${chunks.length} chunks, ${(total / 1024).toFixed(0)} KB`)
  return { ...meta, chunks, index: indexPath }
}

function assertUniqueIds(datasetId: string, features: BakedFeature[]) {
  const seen = new Set<string>()
  for (const f of features) {
    if (seen.has(f.properties.id)) throw new Error(`${datasetId}: duplicate feature id "${f.properties.id}"`)
    seen.add(f.properties.id)
  }
}

/** Outer rings / lines / points of a geometry, one position list per part. */
function parts(g: Geometry): Position[][] {
  switch (g.type) {
    case 'Point':
      return [[g.coordinates]]
    case 'MultiPoint':
      return g.coordinates.map((p) => [p])
    case 'LineString':
      return [g.coordinates]
    case 'MultiLineString':
      return g.coordinates
    case 'Polygon':
      return [g.coordinates[0]]
    case 'MultiPolygon':
      return g.coordinates.map((poly) => poly[0])
    case 'GeometryCollection':
      return g.geometries.flatMap(parts)
  }
}

function boxOf(positions: Position[]): BBox {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of positions) {
    if (x < b[0]) b[0] = x
    if (y < b[1]) b[1] = y
    if (x > b[2]) b[2] = x
    if (y > b[3]) b[3] = y
  }
  return b
}

const union = (boxes: BBox[]): BBox => boxOf(boxes.flatMap((b) => [[b[0], b[1]], [b[2], b[3]]]))

/** Round outwards so the box still contains everything. */
const roundOut = (b: BBox): BBox => [
  Math.floor(b[0] * 1000) / 1000,
  Math.floor(b[1] * 1000) / 1000,
  Math.ceil(b[2] * 1000) / 1000,
  Math.ceil(b[3] * 1000) / 1000,
]

export function bboxOf(features: BakedFeature[]): BBox {
  return roundOut(union(features.flatMap((f) => parts(f.geometry).map(boxOf))))
}

/**
 * Tight boxes for chunk selection: one per country (or feature), split in two
 * when the country straddles the antimeridian (Russia, the USA, Fiji…), with
 * boxes already covered by another dropped.
 */
export function chunkBoxes(features: BakedFeature[]): BBox[] {
  const groups = new Map<string, BBox[]>()
  for (const f of features) {
    const key = groupOf(f)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(...parts(f.geometry).map(boxOf))
  }
  const boxes: BBox[] = []
  for (const partBoxes of groups.values()) {
    const whole = union(partBoxes)
    if (whole[2] - whole[0] <= 180) {
      boxes.push(whole)
      continue
    }
    const west = partBoxes.filter((b) => (b[0] + b[2]) / 2 < 0)
    const east = partBoxes.filter((b) => (b[0] + b[2]) / 2 >= 0)
    if (west.length) boxes.push(union(west))
    if (east.length) boxes.push(union(east))
  }
  const contains = (a: BBox, b: BBox) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3]
  return boxes
    .filter((b, i) => !boxes.some((a, j) => j !== i && contains(a, b) && (!contains(b, a) || j < i)))
    .map(roundOut)
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
