# The World, Visualized

An educational world atlas with a **time machine** — drag the year slider and
watch population and energy use change across the world. Built for teens (and
their classmates), as a static site that hosts for free.

> Borders shown are present-day. Historical population figures are estimates.
> A map always encodes a point of view — that's a thing to discuss, not hide.

## Quick start

```bash
npm install          # install deps
npm run build:data   # download sources & bake public/data/* (run this first)
npm run dev          # start the dev server
```

Then open the printed local URL. `npm run build` makes a static `dist/` for
GitHub / Cloudflare Pages.

## How it works

The browser never parses CSV or shapefiles. `scripts/build-data.ts` downloads
the raw sources once, joins them on **ISO 3166-1 alpha-3**, and bakes three
tidy files into `public/data/`:

| File | What |
|------|------|
| `borders.geojson` | Natural Earth admin-0 polygons, slim props `{iso, name}` |
| `stats.json` | `ISO3 → { name, area_km2, population{year}, energy{year} }` |
| `meta.json` | Year coverage, data sources + licenses, the borders caveat |

At runtime the app just looks up `stats[iso][metric][year]`, builds a
colourblind-safe scale, and colours the polygons. The slider re-colours; that's
the whole engine.

## Architecture

A deliberate split keeps the framework choice reversible and complex
visualisations easy to add later:

- **`src/core/`** — framework-agnostic TypeScript: the data model, the join,
  colour scales, URL state, and the app store. No Svelte, no Leaflet.
- **`src/lib/`** — thin Svelte components that subscribe to the core store and
  drive Leaflet imperatively.

## Metrics

- **Population** — toggle between **density** (people/km²) and **total** on a
  ×10 log colour scale. The flip is itself the lesson.
- **Energy use per person** (kWh/person) — fair to compare a small country with
  a huge one.

Missing data is shown as grey "no data", never `0`.

### Country intel

Clicking a country also shows **intel sections** aggregated from several
sources:

- **Economy** (World Bank WDI) — GDP per person (constant 2015 US$), the
  economy mix (agriculture / industry / services as % of GDP), and exports &
  imports as % of GDP.
- **Energy** (Our World in Data) — total primary energy, electricity
  generation, electricity's share of energy, net electricity imports/exports
  as % of demand, and the fossil / nuclear / renewables mix.

Intel series lag the slider year for recent years; the card shows the latest
known value labelled with its own year.

## Roadmap

- **v1** — CShapes 2.0 borders that morph per year; more metrics (GDP, life
  expectancy, internet users).
- **v2** — deep-time mode (historical-basemaps snapshots) + a growing
  historical name→code crosswalk.
- **v3** — curated "journeys" (guided animated stories), contested-borders
  teaching layer.

## Data sources

- [Natural Earth](https://www.naturalearthdata.com/) — boundaries (public domain)
- [Our World in Data — Population](https://ourworldindata.org/population-growth) (CC BY)
- [Our World in Data — Energy](https://github.com/owid/energy-data) (CC BY)
- [World Bank — World Development Indicators](https://data.worldbank.org/) (CC BY-4.0)

## Student browsing experience

The home page now offers three question-led explorations about population,
crowdedness, and energy. Each opens a country and updates a pair of comparison
bars from the same dataset and selected year. Bars use a zero baseline; the map
opens with total population on a logarithmic colour scale. A country picker
provides an alternative to clicking small map regions. On phones, country
stories appear below the map instead of covering it.

Density and energy explanations are visible in the country story; additional
economy and energy details are collapsed initially. The year slider, playback,
shareable URL state, source credits, and missing-data behaviour are retained.

Run `node --import tsx scripts/check-data-display.ts` for regression checks that
keep zero values distinct from missing data. Run `npm run build` for Svelte,
TypeScript, and production bundling checks.

### Review follow-ups

- Try the explorations with middle school students: can they explain the
  difference between total population and density after comparing two countries?
  The new design has not yet been validated with students.
- Linear density colours are sensitive to very dense small countries. A future
  alternative scale should explain its transformation clearly.
- Detailed economy/energy mixes currently select each series’ latest available
  value independently. Audit year alignment before using these mixes in lessons.
- The bundled dataset ends in 2022. Keep that limit visible and verify new source
  releases before expanding the timeline.
