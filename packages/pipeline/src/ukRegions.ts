// ---------------------------------------------------------------------------
// The UK's 12 ITL1 regions (the nine English regions plus Wales, Scotland and
// Northern Ireland) and statistics about them:
//   uk/itl1                  polygons, id = ONS GSS code (E12000001…)
//   ons/population-itl1      mid-year population estimates (ONS via Nomis)
//   ons/density-itl1         population ÷ area of the polygons above
//   oecd/income-itl1         household disposable income per head (OECD)
//
// The polygons are Natural Earth admin-1 units dissolved by region, so they
// share Natural Earth's coastline with the basemap. They are approximate:
// fine for colouring a map, not an official boundary product.
// ---------------------------------------------------------------------------

import { geoArea } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { Dataset, SeriesDataset } from '@atlas/spec'
import { bakeDataset, runMapshaper, type BakedFeature } from './bake'
import { fetchCached } from './fetch'
import { loadNe, str, NE_SOURCE } from './naturalEarth'
import { parseCsv, writeSeries } from './series'

interface Region {
  gss: string
  itl: string
  /** OECD's TL2 code (the old NUTS 1 code). */
  tl2: string
  name_it: string
  name_en: string
}

const REGIONS: Region[] = [
  { gss: 'E12000001', itl: 'TLC', tl2: 'UKC', name_it: 'Nord-est', name_en: 'North East' },
  { gss: 'E12000002', itl: 'TLD', tl2: 'UKD', name_it: 'Nord-ovest', name_en: 'North West' },
  { gss: 'E12000003', itl: 'TLE', tl2: 'UKE', name_it: 'Yorkshire e Humber', name_en: 'Yorkshire and The Humber' },
  { gss: 'E12000004', itl: 'TLF', tl2: 'UKF', name_it: 'Midlands orientali', name_en: 'East Midlands' },
  { gss: 'E12000005', itl: 'TLG', tl2: 'UKG', name_it: 'Midlands occidentali', name_en: 'West Midlands' },
  { gss: 'E12000006', itl: 'TLH', tl2: 'UKH', name_it: 'Inghilterra orientale', name_en: 'East of England' },
  { gss: 'E12000007', itl: 'TLI', tl2: 'UKI', name_it: 'Londra', name_en: 'London' },
  { gss: 'E12000008', itl: 'TLJ', tl2: 'UKJ', name_it: 'Sud-est', name_en: 'South East' },
  { gss: 'E12000009', itl: 'TLK', tl2: 'UKK', name_it: 'Sud-ovest', name_en: 'South West' },
  { gss: 'W92000004', itl: 'TLL', tl2: 'UKL', name_it: 'Galles', name_en: 'Wales' },
  { gss: 'S92000003', itl: 'TLM', tl2: 'UKM', name_it: 'Scozia', name_en: 'Scotland' },
  { gss: 'N92000002', itl: 'TLN', tl2: 'UKN', name_it: 'Irlanda del Nord', name_en: 'Northern Ireland' },
]

/** Natural Earth admin-1 `region` → GSS code, for English units. */
const ENGLISH_REGION: Record<string, string> = {
  'North East': 'E12000001',
  'North West': 'E12000002',
  'Yorkshire and the Humber': 'E12000003',
  'East Midlands': 'E12000004',
  'West Midlands': 'E12000005',
  East: 'E12000006',
  'Greater London': 'E12000007',
  'South East': 'E12000008',
  'South West': 'E12000009',
}
const NATION: Record<string, string> = { WLS: 'W92000004', SCT: 'S92000003', NIR: 'N92000002' }

const UK_AGGREGATE = { name_it: 'Regno Unito', name_en: 'United Kingdom' }
const EARTH_RADIUS_KM = 6371.0088

const ONS_SOURCE = {
  name: 'ONS mid-year population estimates (via Nomis)',
  url: 'https://www.nomisweb.co.uk/datasets/pestsyoala',
  licence: 'Open Government Licence v3.0',
  licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  attribution: 'Source: Office for National Statistics, licensed under the Open Government Licence v3.0.',
}

const OECD_SOURCE = {
  name: 'OECD Regional Database — Income, regions',
  url: 'https://data-explorer.oecd.org/',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'OECD Regional Database: household disposable income per head, current prices (CC BY 4.0).',
}

const NOMIS_URL =
  'https://www.nomisweb.co.uk/api/v01/dataset/NM_2002_1.data.csv?geography=TYPE480&date=latestMINUS14-latest&gender=0&c_age=200&measures=20100&select=date_name,geography_code,obs_value'
const OECD_URL =
  'https://sdmx.oecd.org/public/rest/data/OECD.CFE.EDS,DSD_REG_ECO@DF_INC,/A..' +
  [...REGIONS.map((r) => r.tl2), 'GBR'].join('+') +
  '..B6N._T.V.XDC_PS?startPeriod=2010&dimensionAtObservation=AllDimensions&format=csvfilewithlabels'

/** Winding conventions differ between tools, so measure each part and take
 *  the smaller side: no island or region is bigger than a hemisphere. */
function areaKm2Of(g: Geometry): number {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
  let sr = 0
  for (const coordinates of polys) {
    const a = geoArea({ type: 'Polygon', coordinates })
    sr += Math.min(a, 4 * Math.PI - a)
  }
  return sr * EARTH_RADIUS_KM ** 2
}

export async function buildUkRegions(): Promise<{ datasets: Dataset[]; series: SeriesDataset[] }> {
  const admin1 = (await loadNe('ne_10m_admin_1_states_provinces')).filter((f) => f.properties.adm0_a3 === 'GBR')
  const tagged: Feature<Geometry, { gss: string }>[] = admin1.map((f) => {
    const gu = str(f.properties.gu_a3)
    const gss = gu === 'ENG' ? ENGLISH_REGION[str(f.properties.region)] : NATION[gu]
    if (!gss) throw new Error(`uk/itl1: no region for admin-1 unit ${f.properties.name} (${gu}, ${f.properties.region})`)
    return { type: 'Feature', geometry: f.geometry, properties: { gss } }
  })

  // Dissolve units into regions; keep mapshaper's "inner point" as the label point.
  const dissolved = JSON.parse(
    await runMapshaper(
      '-i in.json -dissolve gss -each "lx=this.innerX, ly=this.innerY" -o out.json format=geojson',
      { type: 'FeatureCollection', features: tagged },
    ),
  ) as FeatureCollection<Geometry, { gss: string; lx: number; ly: number }>

  const areaKm2 = new Map<string, number>()
  const features: BakedFeature[] = dissolved.features.map((f) => {
    const r = REGIONS.find((x) => x.gss === f.properties.gss)!
    areaKm2.set(r.gss, areaKm2Of(f.geometry))
    return {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        id: r.gss,
        name_it: r.name_it,
        name_en: r.name_en,
        itl: r.itl,
        country: 'GBR',
        lx: Math.round(f.properties.lx * 1000) / 1000,
        ly: Math.round(f.properties.ly * 1000) / 1000,
      },
    }
  })
  if (features.length !== REGIONS.length) throw new Error(`uk/itl1: expected ${REGIONS.length} regions, got ${features.length}`)

  const itl1 = await bakeDataset({
    id: 'uk/itl1',
    kind: 'polygons',
    title: 'UK regions, ITL1 (from Natural Earth)',
    description:
      'The 12 statistical regions of the UK: the nine regions of England, plus Wales, Scotland and Northern Ireland. Built by merging Natural Earth admin-1 units — approximate boundaries, same coastline as the basemap.',
    idScheme: 'ONS GSS code (E12000001…E12000009, W92000004, S92000003, N92000002)',
    properties: {
      itl: 'ITL1 code (TLC…TLN)',
      country: 'always GBR',
      lx: 'label point longitude',
      ly: 'label point latitude',
    },
    validFor: 'present (ITL 2021 regions)',
    source: NE_SOURCE,
    features,
    chunkOf: () => 'gbr',
    simplifyMeters: 500,
  })

  // --- population (ONS) -------------------------------------------------------
  const popRows = parseCsv(await fetchCached(NOMIS_URL, 'nomis-population-itl1.csv'))
  const population: Record<string, Record<string, number | null>> = {}
  for (const row of popRows) {
    const gss = row.GEOGRAPHY_CODE
    if (!REGIONS.some((r) => r.gss === gss)) continue
    population[gss] ??= {}
    population[gss][row.DATE_NAME] = row.OBS_VALUE === '' ? null : Number(row.OBS_VALUE)
  }
  // Regions tile the UK exactly, so the UK figure is their sum (only for years every region has).
  const ukPopulation: Record<string, number | null> = {}
  for (const year of Object.keys(population[REGIONS[0].gss] ?? {})) {
    const vals = REGIONS.map((r) => population[r.gss]?.[year] ?? null)
    ukPopulation[year] = vals.every((v) => v !== null) ? vals.reduce((a, b) => a! + b!, 0) : null
  }

  const popSeries = await writeSeries(
    {
      id: 'ons/population-itl1',
      title: 'Population by UK region (ITL1)',
      description: 'Mid-year population estimates for the 12 UK regions, from the Office for National Statistics.',
      keys: 'uk/itl1',
      unit: { it: 'abitanti', en: 'people' },
      decimals: 0,
      source: ONS_SOURCE,
    },
    { values: population, aggregates: { GBR: { ...UK_AGGREGATE, values: ukPopulation } } },
  )

  // --- density (derived) ------------------------------------------------------
  const perKm2 = (pop: Record<string, number | null>, area: number) =>
    Object.fromEntries(Object.entries(pop).map(([y, v]) => [y, v === null ? null : Math.round((v / area) * 10) / 10]))
  const ukArea = [...areaKm2.values()].reduce((a, b) => a + b, 0)
  const density = Object.fromEntries(REGIONS.map((r) => [r.gss, perKm2(population[r.gss] ?? {}, areaKm2.get(r.gss)!)]))
  for (const r of REGIONS) console.log(`           ${r.name_en.padEnd(26)} ${areaKm2.get(r.gss)!.toFixed(0).padStart(7)} km²`)

  const densitySeries = await writeSeries(
    {
      id: 'ons/density-itl1',
      title: 'Population density by UK region (ITL1)',
      description:
        'People per km²: ONS mid-year population divided by the area of the uk/itl1 polygons (so areas are approximate, within a few per cent).',
      keys: 'uk/itl1',
      unit: { it: 'abitanti per km²', en: 'people per km²' },
      decimals: 0,
      source: ONS_SOURCE,
    },
    { values: density, aggregates: { GBR: { ...UK_AGGREGATE, values: perKm2(ukPopulation, ukArea) } } },
  )

  // --- income (OECD) ----------------------------------------------------------
  const incomeRows = parseCsv(await fetchCached(OECD_URL, 'oecd-income-itl1.csv'))
  const income: Record<string, Record<string, number | null>> = {}
  const ukIncome: Record<string, number | null> = {}
  for (const row of incomeRows) {
    const value = row.OBS_VALUE === '' ? null : Math.round(Number(row.OBS_VALUE))
    if (row.REF_AREA === 'GBR') {
      ukIncome[row.TIME_PERIOD] = value
      continue
    }
    const r = REGIONS.find((x) => x.tl2 === row.REF_AREA)
    if (!r) continue
    income[r.gss] ??= {}
    income[r.gss][row.TIME_PERIOD] = value
  }
  const incomeSeries = await writeSeries(
    {
      id: 'oecd/income-itl1',
      title: 'Household disposable income per head by UK region (ITL1)',
      description:
        'What households have left to spend or save after taxes and benefits, per person, in pounds at current prices. OECD Regional Database (TL2 = ITL1).',
      keys: 'uk/itl1',
      unit: { it: 'sterline a testa all’anno', en: 'pounds per person per year' },
      decimals: 0,
      source: OECD_SOURCE,
    },
    { values: income, aggregates: { GBR: { ...UK_AGGREGATE, values: ukIncome } } },
  )

  return { datasets: [itl1], series: [popSeries, densitySeries, incomeSeries] }
}
