// ---------------------------------------------------------------------------
// Relief for the physical basemap: elevation tiles → hypsometric bands.
//   terrain/relief   one MultiPolygon per region per band ("europe-500" = all
//                    land at 500 m or higher), drawn stacked by the viewer.
//
// Source: Mapzen/Tilezen terrain tiles ("Terrarium" PNG encoding) on AWS Open
// Data. Tiles are fetched once into data-sources/terrarium/, mosaicked,
// lightly blurred, contoured with d3-contour and simplified by the bake step.
// Regions must not overlap; add one to cover a new part of the world.
// ---------------------------------------------------------------------------

import { blur2 } from 'd3-array'
import { contours } from 'd3-contour'
import { PNG } from 'pngjs'
import type { MultiPolygon, Position } from 'geojson'
import type { Dataset } from '@atlas/spec'
import { RELIEF_DATASET } from '@atlas/spec'
import { bakeDataset, type BakedFeature } from './bake'
import { fetchCachedBinary } from './fetch'

interface ReliefRegion {
  key: string
  /** [west, south, east, north] in degrees. */
  bbox: [number, number, number, number]
  zoom: number
}

const REGIONS: ReliefRegion[] = [{ key: 'europe', bbox: [-32, 30, 44, 72], zoom: 6 }]

/** Lower bound of each band, in metres. Land below the first is the plain land colour. */
export const RELIEF_BANDS = [200, 500, 1000, 1500, 2000, 3000, 4000]

const TILE = 256
/** Rings smaller than this many pixels are noise at the zoom we bake. */
const MIN_RING_PX = 8

const TERRARIUM = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`

const tileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z)
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

function ringArea(ring: Position[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  return Math.abs(a / 2)
}

async function bakeRegion(region: ReliefRegion): Promise<BakedFeature[]> {
  const { zoom: z } = region
  const [w, s, e, n] = region.bbox
  const x0 = tileX(w, z), x1 = tileX(e, z), y0 = tileY(n, z), y1 = tileY(s, z)
  const cols = x1 - x0 + 1, rows = y1 - y0 + 1
  const width = cols * TILE, height = rows * TILE
  const elevation = new Float32Array(width * height)

  console.log(`  relief   ${region.key}: ${cols * rows} tiles at z${z} (${width}×${height} px)`)
  const jobs: (() => Promise<void>)[] = []
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      jobs.push(async () => {
        const png = PNG.sync.read(await fetchCachedBinary(TERRARIUM(z, tx, ty), `terrarium/${z}/${tx}/${ty}.png`))
        const ox = (tx - x0) * TILE, oy = (ty - y0) * TILE
        for (let py = 0; py < TILE; py++) {
          for (let px = 0; px < TILE; px++) {
            const i = (py * TILE + px) * 4
            const metres = png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768
            elevation[(oy + py) * width + ox + px] = metres
          }
        }
      })
    }
  }
  // A few at a time: polite to the tile host, and the cache makes reruns instant.
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8).map((j) => j()))

  blur2({ data: elevation, width, height }, 1)

  const worldPx = TILE * 2 ** z
  const toLonLat = ([x, y]: Position): Position => {
    const gx = x0 * TILE + x, gy = y0 * TILE + y
    const lon = (gx / worldPx) * 360 - 180
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / worldPx))) * 180) / Math.PI
    return [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]
  }

  const generator = contours().size([width, height]).smooth(true)
  const features: BakedFeature[] = []
  for (const min of RELIEF_BANDS) {
    const band = generator.contour(elevation as unknown as number[], min)
    const polygons: Position[][][] = []
    for (const poly of band.coordinates) {
      if (ringArea(poly[0]) < MIN_RING_PX) continue
      polygons.push(poly.filter((ring, i) => i === 0 || ringArea(ring) >= MIN_RING_PX).map((ring) => ring.map(toLonLat)))
    }
    if (!polygons.length) continue
    const geometry: MultiPolygon = { type: 'MultiPolygon', coordinates: polygons }
    features.push({
      type: 'Feature',
      geometry,
      properties: {
        id: `${region.key}-${min}`,
        name_it: `oltre ${min} m`,
        name_en: `above ${min} m`,
        min,
        region: region.key,
      },
    })
  }
  return features
}

export async function buildRelief(): Promise<Dataset> {
  const features = (await Promise.all(REGIONS.map(bakeRegion))).flat()
  return bakeDataset({
    id: RELIEF_DATASET,
    kind: 'polygons',
    title: 'Relief bands (elevation tints)',
    description: `Land above ${RELIEF_BANDS.join(', ')} m, as nested polygons per region. Drawn by basemap "physical"; not meant for layers. Coverage: ${REGIONS.map((r) => `${r.key} [${r.bbox.join(', ')}]`).join('; ')}.`,
    idScheme: '<region>-<lower bound in metres>, e.g. "europe-500"',
    properties: { min: 'lower bound of the band in metres', region: 'relief region key' },
    validFor: 'present',
    source: {
      name: 'Mapzen Terrain Tiles (AWS Open Data)',
      url: 'https://registry.opendata.aws/terrain-tiles/',
      licence: 'Open data, attribution required (see list)',
      licenceUrl: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
      attribution:
        'Elevation from Mapzen Terrain Tiles: SRTM and GMTED2010 (USGS/NASA), ETOPO1 (NOAA), EU-DEM (produced using Copernicus data and information funded by the European Union), Great Britain: contains OS data © Crown copyright and database right, and others.',
    },
    features,
    chunkOf: (f) => String(f.properties.region),
    simplifyMeters: 900,
  })
}
