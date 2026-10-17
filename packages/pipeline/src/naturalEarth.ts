// ---------------------------------------------------------------------------
// Natural Earth 1:10m → three catalog datasets:
//   ne/admin0     countries            id = ADM0_A3 (ISO 3166-1 alpha-3 style)
//   ne/map_units  countries split into constituent units (England, Scotland,
//                 Wales, N. Ireland; Belgian regions; …)   id = GU_A3
//   ne/places     populated places     id = Wikidata QID
// All three share NE's coastlines, so layers drawn on top of the basemap line
// up exactly. Chunks follow NE's UN subregions ("northern-europe", …).
// ---------------------------------------------------------------------------

import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { Dataset } from '@atlas/spec'
import { bakeDataset, slug, type BakedFeature } from './bake'
import { fetchCached } from './fetch'

const NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'

export const NE_SOURCE = {
  name: 'Natural Earth 1:10m',
  url: 'https://www.naturalearthdata.com/',
  licence: 'Public domain',
  licenceUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
  attribution: 'Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.',
}

/** NE's de facto boundaries; disputed areas follow NE's choices. */
const NE_VALID_FOR = 'present'

export type NeProps = Record<string, string | number | null>

export async function loadNe(name: string): Promise<Feature<Geometry, NeProps>[]> {
  const text = await fetchCached(`${NE_BASE}${name}.geojson`, `${name}.geojson`)
  return (JSON.parse(text) as FeatureCollection<Geometry, NeProps>).features.filter((f) => f.geometry)
}

export const str = (v: unknown): string => (typeof v === 'string' && v.trim() && v !== '-99' ? v.trim() : '')

function names(p: NeProps): { name_it: string; name_en: string } {
  const en = str(p.NAME_EN) || str(p.NAME)
  return { name_it: str(p.NAME_IT) || en, name_en: en }
}

function labelPoint(p: NeProps): { lx: number | null; ly: number | null } {
  return {
    lx: typeof p.LABEL_X === 'number' ? Math.round(p.LABEL_X * 1000) / 1000 : null,
    ly: typeof p.LABEL_Y === 'number' ? Math.round(p.LABEL_Y * 1000) / 1000 : null,
  }
}

const subregionChunk = (f: BakedFeature) => slug(String(f.properties.subregion || 'other'))

const POLYGON_PROPS = {
  wikidata: 'Wikidata QID',
  subregion: 'UN subregion, e.g. "Northern Europe"',
  lx: 'label point longitude (Natural Earth LABEL_X)',
  ly: 'label point latitude (Natural Earth LABEL_Y)',
}

export async function buildNaturalEarth(): Promise<Dataset[]> {
  const [countries, units, places] = await Promise.all([
    loadNe('ne_10m_admin_0_countries'),
    loadNe('ne_10m_admin_0_map_units'),
    loadNe('ne_10m_populated_places'),
  ])

  const admin0: BakedFeature[] = countries.map((f) => ({
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      id: str(f.properties.ADM0_A3),
      ...names(f.properties),
      wikidata: str(f.properties.WIKIDATAID) || null,
      type: str(f.properties.TYPE),
      continent: str(f.properties.CONTINENT),
      subregion: str(f.properties.SUBREGION),
      ...labelPoint(f.properties),
    },
  }))

  const mapUnits: BakedFeature[] = units.map((f) => ({
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      id: str(f.properties.GU_A3),
      ...names(f.properties),
      country: str(f.properties.ADM0_A3),
      wikidata: str(f.properties.WIKIDATAID) || null,
      type: str(f.properties.TYPE),
      subregion: str(f.properties.SUBREGION),
      ...labelPoint(f.properties),
    },
  }))

  // Places inherit their country's subregion so a lesson loads matching chunks.
  const subregionOf = new Map(admin0.map((f) => [f.properties.id, f.properties.subregion as string]))
  const seenQids = new Set<string>()
  const placeFeatures: BakedFeature[] = places.map((f) => {
    const p = f.properties
    // A handful of NE places share a QID (or have none); fall back to NE's own id.
    let id = str(p.WIKIDATAID)
    if (!id || seenQids.has(id)) id = `ne${p.NE_ID}`
    seenQids.add(id)
    const country = str(p.ADM0_A3)
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id,
        ...names(p),
        country,
        class: str(p.FEATURECLA),
        rank: Number(p.SCALERANK),
        pop: typeof p.POP_MAX === 'number' && p.POP_MAX > 0 ? p.POP_MAX : null,
        subregion: subregionOf.get(country) ?? 'other',
      },
    }
  })

  return [
    await bakeDataset({
      id: 'ne/admin0',
      kind: 'polygons',
      title: 'Countries (Natural Earth 1:10m)',
      description: 'Present-day countries and dependencies, de facto boundaries. Also the basemap.',
      idScheme: 'Natural Earth ADM0_A3 — ISO 3166-1 alpha-3 for most countries (e.g. GBR, ITA, IRL)',
      properties: { ...POLYGON_PROPS, type: 'Sovereign country | Country | Dependency | …', continent: 'continent name' },
      validFor: NE_VALID_FOR,
      source: NE_SOURCE,
      features: admin0,
      chunkOf: subregionChunk,
      simplifyMeters: 500,
    }),
    await bakeDataset({
      id: 'ne/map_units',
      kind: 'polygons',
      title: 'Map units (Natural Earth 1:10m)',
      description:
        'Countries split into their constituent units where that matters for maps — e.g. the UK into England (ENG), Scotland (SCT), Wales (WLS) and Northern Ireland (NIR).',
      idScheme: 'Natural Earth GU_A3 (e.g. ENG, SCT, WLS, NIR); single-unit countries reuse their ADM0_A3',
      properties: { ...POLYGON_PROPS, country: 'ADM0_A3 of the country this unit belongs to', type: 'Geo unit | Sovereign country | …' },
      validFor: NE_VALID_FOR,
      source: NE_SOURCE,
      features: mapUnits,
      chunkOf: subregionChunk,
      simplifyMeters: 500,
    }),
    await bakeDataset({
      id: 'ne/places',
      kind: 'points',
      title: 'Populated places (Natural Earth 1:10m)',
      description: 'Cities and towns, with capitals marked. Population is NE’s metro estimate.',
      idScheme: 'Wikidata QID (e.g. Q84 = London); "ne<NE_ID>" when NE has no unique QID',
      properties: {
        country: 'ADM0_A3 of the country',
        class: 'Admin-0 capital | Admin-0 region capital | Admin-1 capital | Populated place | …',
        rank: 'Natural Earth scalerank, 0 = most important',
        pop: 'metro population estimate, or null',
        subregion: 'UN subregion of the country',
      },
      validFor: NE_VALID_FOR,
      source: NE_SOURCE,
      features: placeFeatures,
      chunkOf: subregionChunk,
    }),
  ]
}
