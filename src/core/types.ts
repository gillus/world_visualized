// ---------------------------------------------------------------------------
// Core domain types. Framework-agnostic — no Svelte, no Leaflet here.
// ---------------------------------------------------------------------------

/** ISO 3166-1 alpha-3 country code, e.g. "ITA", "USA". */
export type Iso3 = string

/** The metrics the atlas can colour the map by. */
export type MetricId = 'population' | 'energy'

/**
 * How to express population on the map. The flip between these is itself a
 * lesson: the same data tells a very different story depending on what you
 * measure.
 *   - 'density'  → people per km² (fair to compare across countries)
 *   - 'logTotal' → total people, but on a log colour scale (×10 steps)
 */
export type PopulationMode = 'density' | 'logTotal'

/** A per-country record in the baked stats file. */
export interface CountryStats {
  name: string
  /** Land area in km², computed from geometry at build time. */
  area_km2: number
  /** Total population by year (persons). */
  population: Record<number, number>
  /** Primary energy use per person by year (kWh per capita). */
  energy: Record<number, number>
  /** Total primary energy consumption by year (TWh). OWID. */
  energy_total_twh?: Record<number, number>
  /** Electricity generation by year (TWh). OWID. */
  electricity_gen_twh?: Record<number, number>
  /** Electricity as % of primary energy. OWID. */
  electricity_share_energy?: Record<number, number>
  /** Net electricity imports as % of demand (negative = net exporter). OWID. */
  net_elec_imports_share?: Record<number, number>
  /** Energy mix: % of primary energy by source. OWID. */
  energy_fossil_share?: Record<number, number>
  energy_nuclear_share?: Record<number, number>
  energy_renewables_share?: Record<number, number>
  /** GDP per person by year (constant 2015 US$). World Bank WDI. */
  gdp_per_capita?: Record<number, number>
  /** Value added by sector, % of GDP. World Bank WDI. */
  sector_agriculture?: Record<number, number>
  sector_industry?: Record<number, number>
  sector_services?: Record<number, number>
  /** Trade in goods & services, % of GDP. World Bank WDI. */
  exports_pct_gdp?: Record<number, number>
  imports_pct_gdp?: Record<number, number>
}

/** The full baked stats file: ISO3 → stats. */
export type StatsData = Record<Iso3, CountryStats>

/** Metadata baked alongside the data (coverage, sources, generation note). */
export interface AtlasMeta {
  generatedNote: string
  yearMin: number
  yearMax: number
  bordersNote: string
  sources: Array<{ name: string; license: string; url: string }>
}

/** Loaded, ready-to-use dataset. */
export interface AtlasData {
  stats: StatsData
  borders: GeoJSON.FeatureCollection
  meta: AtlasMeta
}

/** The full reactive UI state of the app. */
export interface AtlasState {
  year: number
  metric: MetricId
  populationMode: PopulationMode
  /** Currently selected country (ISO3), or null. */
  selected: Iso3 | null
  /** Whether the timeline is auto-playing. */
  playing: boolean
}
