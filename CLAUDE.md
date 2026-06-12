# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"The World, Visualized" — an educational world atlas for teens with a time-machine year slider. A static Svelte 5 + Leaflet site: countries are coloured by a metric (population or energy per person) for the selected year.

## Commands

```bash
npm run build:data   # download sources & bake public/data/* — required once before dev/build
npm run dev          # Vite dev server
npm run check        # svelte-check type checking (no separate lint; no test suite)
npm run build        # svelte-check + vite build → dist/
```

`build:data` caches raw downloads in `data-sources/`; delete a file there to force a re-fetch. The app fails at startup with a "run npm run build:data" hint if `public/data/` is missing.

## Architecture

The big split (deliberate, keeps the framework choice reversible):

- **`src/core/`** — framework-agnostic TypeScript. No Svelte or Leaflet imports allowed here.
  - `store.ts` — tiny observable store that also satisfies the Svelte store contract, so components can use `$store` syntax on it.
  - `atlas.ts` — `createAtlas(data)` returns the app store + intent-revealing actions (`setYear`, `togglePlay`, `select`…), drives the play loop, and syncs state to the URL (`urlState.ts`, shareable links).
  - `join.ts` — the heart: `metricValue(stats, iso, metric, year, mode)` turns the current view into a number per country; `valueDomain` computes the per-year min/max that drives the colour scale.
  - `metrics.ts` — single source of truth for metric labels/units/descriptions. Adding a metric = an entry here + a `MetricId` in `types.ts` + a column in `scripts/build-data.ts`.
  - `scales.ts` — viridis (colourblind-safe) colour scales; log scale for population totals.
- **`src/lib/`** — thin Svelte 5 components (runes: `$props`, `$derived`, `$effect`) that subscribe to the core store and drive Leaflet imperatively (`MapView.svelte` restyles the GeoJSON layer on state change — no re-render of geometry).

Data pipeline (`scripts/build-data.ts` + `scripts/crosswalk.ts`): downloads Natural Earth borders + OWID CSVs + World Bank WDI indicators (JSON API, one call per indicator), joins everything on ISO 3166-1 alpha-3, and bakes `public/data/{borders.geojson,stats.json,meta.json}`. The browser never parses CSV/shapefiles. The crosswalk handles codes that don't join cleanly (e.g. Kosovo); unresolved features become build warnings, not silent drops. World Bank rows join only onto countries that already exist in `stats` — that's what filters out WB aggregates (WLD, EUU…), which have ISO3-shaped codes.

Two kinds of per-country data:
- **Map metrics** (`population`, `energy`) — colour the map, listed in `metrics.ts`/`MetricId`.
- **Intel series** (`gdp_per_capita`, `sector_*`, `*_pct_gdp`) — shown only in the country card via `latestAtOrBefore()` (these series lag the slider year; the card labels the value with its own year).

## Conventions that matter

- **Missing data is `null`, never `0`** — rendered as grey "no data". Preserve this distinction everywhere.
- Countries are keyed by ISO3 (`Iso3` type). OWID aggregates (`OWID_*`) are filtered out by the `isCountryCode` regex.
- App state lives in one `AtlasState` object; components call atlas actions, never mutate state directly.
- The colour-scale domain is recomputed per year/metric, so the legend always matches the current view.
- Tone of UI copy: aimed at a teen reader; data caveats (present-day borders, estimates) are surfaced honestly, not hidden.
