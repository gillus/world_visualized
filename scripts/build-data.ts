// ---------------------------------------------------------------------------
// build-data.ts — the one-time data pipeline.
//
// Downloads raw sources (cached in data-sources/), joins them on ISO3, and
// emits tidy, web-friendly assets into public/data/:
//   - borders.geojson  (Natural Earth admin-0, slim properties)
//   - stats.json       (ISO3 → { name, area_km2, population{}, energy{} })
//   - meta.json        (coverage + sources + a join-warnings summary)
//
// Run with:  npm run build:data
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import area from '@turf/area'
import { isCountryCode, normalizeOwidCode, resolveNeIso } from './crosswalk'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RAW = join(ROOT, 'data-sources')
const OUT = join(ROOT, 'public', 'data')

const YEAR_MIN = 1960
const YEAR_MAX = 2022

const SOURCES = {
  borders: {
    file: 'ne_50m_admin_0_countries.geojson',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
  },
  population: {
    file: 'owid_population.csv',
    url: 'https://ourworldindata.org/grapher/population.csv?csvType=full&useColumnShortNames=true',
  },
  energy: {
    file: 'owid_energy.csv',
    url: 'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv',
  },
} as const

// World Bank WDI indicators that feed the country "intel" card (not the map).
// One API call per indicator, cached like everything else.
const WORLD_BANK_INDICATORS = {
  gdp_per_capita: 'NY.GDP.PCAP.KD', // GDP per capita, constant 2015 US$
  sector_agriculture: 'NV.AGR.TOTL.ZS', // value added, % of GDP
  sector_industry: 'NV.IND.TOTL.ZS',
  sector_services: 'NV.SRV.TOTL.ZS',
  exports_pct_gdp: 'NE.EXP.GNFS.ZS', // goods & services, % of GDP
  imports_pct_gdp: 'NE.IMP.GNFS.ZS',
} as const
type WbField = keyof typeof WORLD_BANK_INDICATORS

function wbUrl(indicator: string): string {
  return `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=25000&date=${YEAR_MIN}:${YEAR_MAX}`
}

interface WbRow {
  countryiso3code: string
  date: string
  value: number | null
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/** Fetch a file once, caching it under data-sources/ for repeat runs. */
async function fetchCached(url: string, file: string): Promise<string> {
  const path = join(RAW, file)
  if (await exists(path)) {
    console.log(`  cached  ${file}`)
    return readFile(path, 'utf8')
  }
  console.log(`  fetch   ${file}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const text = await res.text()
  await writeFile(path, text)
  return text
}

interface Row {
  [k: string]: string
}

function parseCsv(text: string): Row[] {
  const out = Papa.parse<Row>(text, { header: true, skipEmptyLines: true })
  return out.data
}

type ByYear = Record<number, number>
interface Stat {
  name: string
  area_km2: number
  population: ByYear
  energy: ByYear
  energy_total_twh: ByYear
  electricity_gen_twh: ByYear
  electricity_share_energy: ByYear
  net_elec_imports_share: ByYear
  energy_fossil_share: ByYear
  energy_nuclear_share: ByYear
  energy_renewables_share: ByYear
  gdp_per_capita: ByYear
  sector_agriculture: ByYear
  sector_industry: ByYear
  sector_services: ByYear
  exports_pct_gdp: ByYear
  imports_pct_gdp: ByYear
}

// Columns pulled from the OWID energy CSV → stats fields. `dp` = decimals
// kept in the baked file (-1 = raw). net_elec_imports_share_demand is signed:
// negative means the country is a net electricity exporter — keep the sign.
const ENERGY_COLUMNS: Array<{ col: string; field: keyof Stat & string; dp: number }> = [
  { col: 'energy_per_capita', field: 'energy', dp: -1 },
  { col: 'primary_energy_consumption', field: 'energy_total_twh', dp: 2 },
  { col: 'electricity_generation', field: 'electricity_gen_twh', dp: 2 },
  { col: 'electricity_share_energy', field: 'electricity_share_energy', dp: 1 },
  { col: 'net_elec_imports_share_demand', field: 'net_elec_imports_share', dp: 1 },
  { col: 'fossil_share_energy', field: 'energy_fossil_share', dp: 1 },
  { col: 'nuclear_share_energy', field: 'energy_nuclear_share', dp: 1 },
  { col: 'renewables_share_energy', field: 'energy_renewables_share', dp: 1 },
]

function inRange(y: number): boolean {
  return Number.isFinite(y) && y >= YEAR_MIN && y <= YEAR_MAX
}

async function main() {
  await mkdir(RAW, { recursive: true })
  await mkdir(OUT, { recursive: true })

  console.log('Downloading sources…')
  const [bordersText, popText, energyText] = await Promise.all([
    fetchCached(SOURCES.borders.url, SOURCES.borders.file),
    fetchCached(SOURCES.population.url, SOURCES.population.file),
    fetchCached(SOURCES.energy.url, SOURCES.energy.file),
  ])

  const stats: Record<string, Stat> = {}
  const ensure = (iso: string, name: string): Stat =>
    (stats[iso] ??= {
      name,
      area_km2: 0,
      population: {},
      energy: {},
      energy_total_twh: {},
      electricity_gen_twh: {},
      electricity_share_energy: {},
      net_elec_imports_share: {},
      energy_fossil_share: {},
      energy_nuclear_share: {},
      energy_renewables_share: {},
      gdp_per_capita: {},
      sector_agriculture: {},
      sector_industry: {},
      sector_services: {},
      exports_pct_gdp: {},
      imports_pct_gdp: {},
    })

  // --- Borders + area --------------------------------------------------------
  console.log('Processing borders…')
  const borders = JSON.parse(bordersText) as GeoJSON.FeatureCollection
  const slimFeatures: GeoJSON.Feature[] = []
  let unresolvedPolys = 0
  for (const f of borders.features) {
    const props = (f.properties ?? {}) as Record<string, unknown>
    const iso = resolveNeIso(props)
    if (!iso) {
      unresolvedPolys++
      continue
    }
    const name = String(props.ADMIN ?? props.NAME ?? iso)
    const s = ensure(iso, name)
    try {
      s.area_km2 += area(f as GeoJSON.Feature) / 1e6
    } catch {
      /* skip area on bad geometry */
    }
    slimFeatures.push({
      type: 'Feature',
      properties: { iso, name },
      geometry: f.geometry,
    })
  }

  // --- Population (OWID) ------------------------------------------------------
  console.log('Processing population…')
  const popRows = parseCsv(popText)
  const popValueCol =
    Object.keys(popRows[0] ?? {}).find((h) => /population/i.test(h)) ?? 'population'
  let popMatched = 0
  for (const r of popRows) {
    const iso = normalizeOwidCode(r.code ?? '')
    if (!isCountryCode(iso)) continue
    const year = Number(r.year)
    if (!inRange(year)) continue
    const val = Number(r[popValueCol])
    if (!Number.isFinite(val)) continue
    ensure(iso, r.entity ?? iso).population[year] = val
    popMatched++
  }

  // --- Energy (OWID energy-data) ----------------------------------------------
  // energy_per_capita colours the map; the rest feeds the card's energy intel.
  console.log('Processing energy…')
  const energyRows = parseCsv(energyText)
  let energyMatched = 0
  for (const r of energyRows) {
    const iso = normalizeOwidCode(r.iso_code ?? '')
    if (!isCountryCode(iso)) continue
    const year = Number(r.year)
    if (!inRange(year)) continue
    for (const { col, field, dp } of ENERGY_COLUMNS) {
      if (r[col] === '' || r[col] == null) continue
      const val = Number(r[col])
      if (!Number.isFinite(val)) continue
      const rounded = dp < 0 ? val : Math.round(val * 10 ** dp) / 10 ** dp
      ;(ensure(iso, r.country ?? iso)[field] as ByYear)[year] = rounded
      energyMatched++
    }
  }

  // --- Country intel (World Bank WDI) -----------------------------------------
  console.log('Processing World Bank indicators…')
  let wbMatched = 0
  for (const [field, indicator] of Object.entries(WORLD_BANK_INDICATORS) as Array<
    [WbField, string]
  >) {
    const text = await fetchCached(wbUrl(indicator), `wb_${indicator}.json`)
    const parsed = JSON.parse(text) as [{ total: number; per_page: number }, WbRow[] | null]
    const [page, rows] = parsed
    if (page.total > page.per_page) {
      throw new Error(`World Bank ${indicator}: ${page.total} rows exceed one page — paginate`)
    }
    for (const r of rows ?? []) {
      const iso = r.countryiso3code
      // Join only onto countries we already track — this drops World Bank
      // aggregates (WLD, EUU, ARB…), which carry ISO3-shaped codes.
      if (!isCountryCode(iso) || !stats[iso]) continue
      const year = Number(r.date)
      if (!inRange(year) || r.value == null || !Number.isFinite(r.value)) continue
      stats[iso][field][year] =
        field === 'gdp_per_capita' ? Math.round(r.value) : Math.round(r.value * 10) / 10
      wbMatched++
    }
  }

  // --- Join warnings ---------------------------------------------------------
  const polyIsos = new Set(slimFeatures.map((f) => f.properties!.iso as string))
  const statIsos = new Set(Object.keys(stats))
  const statsNoPolygon = [...statIsos].filter((iso) => !polyIsos.has(iso)).sort()
  const polygonsNoStats = [...polyIsos]
    .filter((iso) => {
      const s = stats[iso]
      return (
        !s ||
        (Object.keys(s.population).length === 0 && Object.keys(s.energy).length === 0)
      )
    })
    .sort()

  // --- Write outputs ---------------------------------------------------------
  console.log('Writing outputs…')
  const slim: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: slimFeatures }
  await writeFile(join(OUT, 'borders.geojson'), JSON.stringify(slim))
  await writeFile(join(OUT, 'stats.json'), JSON.stringify(stats))

  const meta = {
    generatedNote: `Data baked ${new Date().toISOString().slice(0, 10)} · ${YEAR_MIN}–${YEAR_MAX}`,
    yearMin: YEAR_MIN,
    yearMax: YEAR_MAX,
    bordersNote: 'Borders shown: present day — they don’t change with the year yet.',
    sources: [
      {
        name: 'Natural Earth (admin-0 boundaries)',
        license: 'Public domain',
        url: 'https://www.naturalearthdata.com/',
      },
      {
        name: 'Our World in Data — Population',
        license: 'CC BY',
        url: 'https://ourworldindata.org/population-growth',
      },
      {
        name: 'Our World in Data — Energy',
        license: 'CC BY',
        url: 'https://github.com/owid/energy-data',
      },
      {
        name: 'World Bank — World Development Indicators',
        license: 'CC BY-4.0',
        url: 'https://data.worldbank.org/',
      },
    ],
  }
  await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2))

  // --- Report ----------------------------------------------------------------
  console.log('\nDone.')
  console.log(`  countries with polygons : ${polyIsos.size}`)
  console.log(`  population rows matched  : ${popMatched}`)
  console.log(`  energy rows matched      : ${energyMatched}`)
  console.log(`  world bank rows matched  : ${wbMatched}`)
  console.log(`  unresolved polygons      : ${unresolvedPolys}`)
  console.log(`  stats w/o polygon (${statsNoPolygon.length}) : ${statsNoPolygon.join(', ') || '—'}`)
  console.log(
    `  polygons w/o stats (${polygonsNoStats.length}) : ${polygonsNoStats.join(', ') || '—'}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
