# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"The World, Visualized" — visual study aids for middle/high-school students (Italian first, English later), published as a static GitHub Pages site. The repo is mid-pivot (see `docs/DESIGN.md`):

- **Study atlas (new, `packages/` + `site/`)** — Claude writes small JSON *lesson specs*; one viewer renders any of them. This is where new work goes.
- **Original world atlas (`src/`, `scripts/`)** — the single-page time-machine app (Svelte 5 + Leaflet). Kept as-is until it is ported to a lesson (milestone M3).

## Study atlas

```bash
npm run atlas:data     # bake datasets → site/data/ (catalog.json, chunked TopoJSON) and validate lessons
npm run atlas:dev      # viewer dev server; open /?lesson=uk-geografia
npm run atlas:lessons  # validate site/lessons/*.json + write site/data/lessons.json (fails on errors)
npm run atlas:check    # tsc (spec, pipeline) + svelte-check (runtime)
npm run atlas:build    # validate lessons + build viewer → packages/runtime/dist (deployed by .github/workflows/pages.yml)
```

- `packages/spec` — zod schema for lessons (`lesson.ts`) and the data catalog (`catalog.ts`), plus `check.ts` (cross-reference validation: data handles, feature ids, citations, promised translations). Single source of truth for the viewer, the validator and the future MCP server. Consumed as TS source (no build step).
- `packages/pipeline` — downloads sources (cached in `data-sources/`), normalises features to `{id, name_it, name_en, …}`, simplifies once globally, splits into chunks by UN subregion (very large countries get their own chunk), writes TopoJSON + per-dataset `index.json` + `catalog.json`. Chunks carry per-country `boxes` (split at the antimeridian) for selection.
- `packages/runtime` — Svelte 5 + d3-geo SVG viewer. `src/core/` is framework-agnostic (loader, pages, projection/zoom/label geometry, legend, classes, quiz, number formatting, URL). The basemap is projected once per size; steps zoom with a transform (`interpolateZoom`), so strokes use `vector-effect: non-scaling-stroke`. A lesson is a flat list of pages (`core/pages.ts`): each step or frame, each quiz question, then the score — each with a `Scene` (basemap, view, layers, pick). `MapView` with `still` (print) projects straight into the scene view and clips, and never animates.
- **Series datasets** (`catalog.series`, files in `site/data/series/`) hold values per feature id per year for a geo dataset (`keys`), plus aggregates (e.g. `GBR`). A data handle may point at a series; `choropleth` and `bars` need one. Missing values are `null`; the viewer shows the latest year at or before the requested one and labels it.
- Print mode is `?print=1` (`PrintView.svelte`): sized in mm for A4 on screen too, so maps are drawn once at their printed size.
- `site/lessons/<id>.json` — committed lesson specs; file name must equal `id`. `site/data/` is generated and gitignored.

Lesson conventions: all user-facing text is `{ it, en? }`; every step cites ≥1 key in `sources`; Wikipedia/Wikidata sources are pinned by `revid`; feature ids follow each dataset's `idScheme` (`ne/admin0` → ADM0_A3, `ne/map_units` → GU_A3 such as ENG/SCT/WLS/NIR, `ne/places` → Wikidata QID). Colours are Okabe–Ito swatch names, never hex. Adding a layer type = schema in `lesson.ts` + checks in `check.ts` + rendering in `MapView.svelte` (+ `legendFor` in `core/legend.ts` if it carries meaning, + `referencedIds` in `core/loader.ts` if it names feature ids). `ne/rivers` ids are name slugs, suffixed with the country's ADM0_A3 only when a name repeats (`severn-gbr`).

## Original world atlas

### Commands

```bash
npm run build:data   # download sources & bake public/data/* — required once before dev/build
npm run dev          # Vite dev server
npm run check        # svelte-check type checking (no separate lint; no test suite)
npm run build        # svelte-check + vite build → dist/
```

`build:data` caches raw downloads in `data-sources/`; delete a file there to force a re-fetch. The app fails at startup with a "run npm run build:data" hint if `public/data/` is missing.

### Architecture

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
