// ---------------------------------------------------------------------------
// Map geometry: building the lesson's projection, fitting views, the "true
// size" rotation behind `compare`, and label placement. No Svelte, no DOM.
// ---------------------------------------------------------------------------

import {
  geoAzimuthalEqualArea,
  geoCentroid,
  geoConicConformal,
  geoEqualEarth,
  geoMercator,
  geoOrthographic,
  geoTransverseMercator,
  type GeoProjection,
} from 'd3-geo'
import type { Extent, LonLat, Lesson } from '@atlas/spec'
import type { Geometry, MultiPoint, Position } from 'geojson'
import type { MapFeature } from './loader'

export type ProjectionType = Lesson['map']['projection']['type']

/** Resolve `auto` from the extent: world-sized → Equal Earth, polar → azimuthal,
 *  tropical → Mercator, otherwise a conic (the classic atlas choice for mid-latitudes). */
export function resolveProjectionType(type: ProjectionType, [[w, s], [e, n]]: Extent): Exclude<ProjectionType, 'auto'> {
  if (type !== 'auto') return type
  if (e - w >= 150) return 'equalEarth'
  if (Math.min(Math.abs(s), Math.abs(n)) >= 60) return 'azimuthalEqualArea'
  if (Math.abs((s + n) / 2) < 20) return 'mercator'
  return 'conicConformal'
}

export function makeProjection(setup: Lesson['map']): GeoProjection {
  const { extent } = setup
  const [[w, s], [e, n]] = extent
  const [lon0, lat0] = setup.projection.center ?? [(w + e) / 2, (s + n) / 2]
  switch (resolveProjectionType(setup.projection.type, extent)) {
    case 'conicConformal': {
      const p1 = s + (n - s) / 6
      const p2 = n - (n - s) / 6
      return geoConicConformal().rotate([-lon0, 0]).center([0, lat0]).parallels([p1, p2])
    }
    case 'transverseMercator':
      return geoTransverseMercator().rotate([-lon0, -lat0])
    case 'mercator':
      return geoMercator().rotate([-lon0, 0]).center([0, lat0])
    case 'equalEarth':
      return geoEqualEarth().rotate([-lon0, 0])
    case 'azimuthalEqualArea':
      return geoAzimuthalEqualArea().rotate([-lon0, -lat0])
    case 'orthographic':
      return geoOrthographic().rotate([-lon0, -lat0]).clipAngle(90)
  }
}

/** Points along the edges of an extent — fitting to these (rather than a
 *  polygon) avoids spherical winding surprises and follows curved parallels. */
export function extentOutline([[w, s], [e, n]]: Extent, perEdge = 12): MultiPoint {
  const pts: Position[] = []
  for (let i = 0; i <= perEdge; i++) {
    const t = i / perEdge
    const lon = w + (e - w) * t
    const lat = s + (n - s) * t
    pts.push([lon, s], [lon, n], [w, lat], [e, lat])
  }
  return { type: 'MultiPoint', coordinates: pts }
}

export interface Size {
  width: number
  height: number
}

/** Fit the base projection to the whole lesson extent. Steps then zoom in with a transform. */
export function fitBase(projection: GeoProjection, extent: Extent, { width, height }: Size): GeoProjection {
  const pad = Math.min(width, height) * 0.02
  projection.fitExtent([[pad, pad], [width - pad, height - pad]], extentOutline(extent))
  // Cull far-away geometry: steps only ever zoom *into* the base frame.
  return projection.clipExtent([[-width * 0.25, -height * 0.25], [width * 1.25, height * 1.25]])
}

export interface ViewTransform {
  k: number
  x: number
  y: number
}

export const IDENTITY: ViewTransform = { k: 1, x: 0, y: 0 }

/** The zoom transform that frames `view` (in base-projected pixels) inside the map. */
export function viewTransform(projection: GeoProjection, view: Extent, { width, height }: Size): ViewTransform {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of extentOutline(view).coordinates) {
    const xy = projection(p as [number, number])
    if (!xy) continue
    x0 = Math.min(x0, xy[0]); y0 = Math.min(y0, xy[1])
    x1 = Math.max(x1, xy[0]); y1 = Math.max(y1, xy[1])
  }
  if (!Number.isFinite(x0)) return IDENTITY
  const pad = Math.min(width, height) * 0.04
  const k = Math.min((width - 2 * pad) / (x1 - x0), (height - 2 * pad) / (y1 - y0))
  return { k, x: width / 2 - k * ((x0 + x1) / 2), y: height / 2 - k * ((y0 + y1) / 2) }
}

export function applyTransform(t: ViewTransform, [x, y]: [number, number]): [number, number] {
  return [t.x + t.k * x, t.y + t.k * y]
}

// --- "true size" -----------------------------------------------------------

type Vec3 = [number, number, number]
const RAD = Math.PI / 180

function toVec([lon, lat]: Position): Vec3 {
  const l = lon * RAD, p = lat * RAD
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]
}
function toLonLat([x, y, z]: Vec3): Position {
  return [Math.atan2(y, x) / RAD, Math.asin(Math.max(-1, Math.min(1, z))) / RAD]
}
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Rotate the sphere about unit axis `k` by the angle with this sine/cosine (Rodrigues). */
function rotation(k: Vec3, sinA: number, cosA: number): (pos: Position) => Position {
  return (pos) => {
    const v = toVec(pos)
    const kxv = cross(k, v)
    const kdv = dot(k, v) * (1 - cosA)
    return toLonLat([
      v[0] * cosA + kxv[0] * sinA + k[0] * kdv,
      v[1] * cosA + kxv[1] * sinA + k[1] * kdv,
      v[2] * cosA + kxv[2] * sinA + k[2] * kdv,
    ])
  }
}

/**
 * Move a feature across the globe so its centroid lands on `target`. Two
 * rotations of the sphere: first along its own meridian (north–south), then
 * about the polar axis (east–west). Rotations preserve area and shape exactly
 * — what makes the comparison honest, unlike dragging a shape across a flat
 * Mercator map — and doing it in this order keeps the feature's north up.
 */
export function moveFeatureTo(feature: MapFeature, target: LonLat): MapFeature {
  const [lon0, lat0] = geoCentroid(feature)
  const from = toVec([lon0, lat0])
  const via = toVec([lon0, target[1]])
  const axis = cross(from, via)
  const sinA = Math.hypot(...axis)
  const alongMeridian =
    sinA < 1e-9 ? (p: Position) => p : rotation([axis[0] / sinA, axis[1] / sinA, axis[2] / sinA], sinA, dot(from, via))
  const dLon = target[0] - lon0
  const move = (p: Position): Position => {
    const [lon, lat] = alongMeridian(p)
    return [((lon + dLon + 540) % 360) - 180, lat]
  }
  return { ...feature, geometry: mapPositions(feature.geometry, move) }
}

function mapPositions(g: Geometry, fn: (p: Position) => Position): Geometry {
  switch (g.type) {
    case 'Point':
      return { ...g, coordinates: fn(g.coordinates) }
    case 'MultiPoint':
    case 'LineString':
      return { ...g, coordinates: g.coordinates.map(fn) }
    case 'MultiLineString':
    case 'Polygon':
      return { ...g, coordinates: g.coordinates.map((r) => r.map(fn)) }
    case 'MultiPolygon':
      return { ...g, coordinates: g.coordinates.map((poly) => poly.map((r) => r.map(fn))) }
    case 'GeometryCollection':
      return { ...g, geometries: g.geometries.map((x) => mapPositions(x, fn)) }
  }
}

/** Where to name a line: halfway along its longest part. */
export function lineAnchor(f: MapFeature): LonLat | null {
  const g = f.geometry
  const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
  let best: Position[] = []
  let bestLen = 0
  for (const part of parts) {
    let len = 0
    for (let i = 1; i < part.length; i++) len += Math.hypot(part[i][0] - part[i - 1][0], part[i][1] - part[i - 1][1])
    if (len > bestLen) {
      best = part
      bestLen = len
    }
  }
  if (best.length < 2) return null
  let walked = 0
  for (let i = 1; i < best.length; i++) {
    const step = Math.hypot(best[i][0] - best[i - 1][0], best[i][1] - best[i - 1][1])
    if (walked + step >= bestLen / 2) {
      const r = step ? (bestLen / 2 - walked) / step : 0
      return [best[i - 1][0] + (best[i][0] - best[i - 1][0]) * r, best[i - 1][1] + (best[i][1] - best[i - 1][1]) * r]
    }
    walked += step
  }
  return best[best.length - 1] as LonLat
}

/** Where to write a feature's name: NE's hand-placed label point if present, else the centroid. */
export function labelAnchor(f: MapFeature): LonLat {
  const { lx, ly } = f.properties
  if (typeof lx === 'number' && typeof ly === 'number') return [lx, ly]
  if (f.geometry.type === 'Point') return f.geometry.coordinates as LonLat
  return geoCentroid(f) as LonLat
}

// --- label placement --------------------------------------------------------

export interface LabelRequest {
  key: string
  /** Screen position of the anchor (marker or area centre). */
  x: number
  y: number
  text: string
  /** Point labels sit beside a marker; area and note labels are centred on the anchor. */
  kind: 'point' | 'area' | 'note'
  fontSize: number
  marker?: 'capital' | 'city' | 'peak'
  /** Radius of something already drawn at the anchor (a symbol circle) to keep clear of. */
  reserve?: number
  /** Extra styling hook for the renderer (note style, compare…). */
  style?: string
}

export interface PlacedLabel extends LabelRequest {
  dx: number
  dy: number
  anchor: 'start' | 'middle' | 'end'
  visible: boolean
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/**
 * Greedy placement. Markers are reserved first, so no label covers a city
 * dot. Area and note labels go next, centred on their anchor if possible
 * (else nudged up or down); point labels then try right, left, above,
 * below and the four diagonals, bigger symbols first. A label that can't fit
 * without overlap is hidden rather than drawn on top of another.
 */
export function placeLabels(requests: LabelRequest[], size: Size): PlacedLabel[] {
  const taken: Box[] = requests
    .filter((r) => r.marker || r.reserve)
    .map((r) => {
      const half = r.reserve ?? 5
      return { x0: r.x - half, y0: r.y - half, x1: r.x + half, y1: r.y + half }
    })
  const out: PlacedLabel[] = []
  const order = [...requests].sort(
    (a, b) => Number(a.kind === 'point') - Number(b.kind === 'point') || (b.reserve ?? 0) - (a.reserve ?? 0),
  )
  for (const r of order) {
    const w = r.text.length * r.fontSize * 0.56
    const h = r.fontSize * 1.2
    const gap = r.reserve ? r.reserve + 4 : r.marker ? 7 : 10
    const centred = (dy: number) => ({
      dx: 0,
      dy,
      anchor: 'middle' as const,
      box: { x0: r.x - w / 2, y0: r.y + dy - h / 2, x1: r.x + w / 2, y1: r.y + dy + h / 2 },
    })
    const candidates: { dx: number; dy: number; anchor: PlacedLabel['anchor']; box: Box }[] =
      r.kind === 'point'
        ? [
            { dx: gap, dy: 0, anchor: 'start', box: { x0: r.x + gap, y0: r.y - h / 2, x1: r.x + gap + w, y1: r.y + h / 2 } },
            { dx: -gap, dy: 0, anchor: 'end', box: { x0: r.x - gap - w, y0: r.y - h / 2, x1: r.x - gap, y1: r.y + h / 2 } },
            centred(-(r.reserve ?? 0) - h * 0.95),
            centred((r.reserve ?? 0) + h * 0.95),
            ...[-1, 1].flatMap((sy) => {
              const dy = sy * ((r.reserve ?? 0) * 0.7 + h * 0.6)
              const dx = (r.reserve ?? 0) * 0.7 + 3
              const y0 = r.y + dy - h / 2
              return [
                { dx, dy, anchor: 'start' as const, box: { x0: r.x + dx, y0, x1: r.x + dx + w, y1: y0 + h } },
                { dx: -dx, dy, anchor: 'end' as const, box: { x0: r.x - dx - w, y0, x1: r.x - dx, y1: y0 + h } },
              ]
            }),
          ]
        : [centred(0), centred(-h), centred(h)]
    const inside = (b: Box) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= size.width && b.y1 <= size.height
    const fit = candidates.find((c) => inside(c.box) && !taken.some((t) => overlaps(t, c.box)))
    if (fit) taken.push(fit.box)
    const c = fit ?? candidates[0]
    out.push({ ...r, dx: c.dx, dy: c.dy, anchor: c.anchor, visible: Boolean(fit) })
  }
  return out
}
