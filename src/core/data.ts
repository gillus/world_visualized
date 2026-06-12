// ---------------------------------------------------------------------------
// Loads the pre-baked, web-friendly data assets. The browser NEVER parses CSV
// or shapefiles at runtime — `scripts/build-data.ts` does that once and emits
// these tidy files into public/data/.
// ---------------------------------------------------------------------------

import type { AtlasData, AtlasMeta, StatsData } from './types'

const base = import.meta.env.BASE_URL // respects Vite `base` for subpath hosting

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(base + path)
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export async function loadAtlasData(): Promise<AtlasData> {
  const [stats, borders, meta] = await Promise.all([
    getJson<StatsData>('data/stats.json'),
    getJson<GeoJSON.FeatureCollection>('data/borders.geojson'),
    getJson<AtlasMeta>('data/meta.json'),
  ])
  return { stats, borders, meta }
}
