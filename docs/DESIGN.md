# Study Atlas — design

Status: v0 · 2026-10-17 · M0 built (see §10)

## 1. What this is

A toolkit that lets Claude build **visual study aids on demand** ("show me the
geography of the United Kingdom", "show me the Battle of the Bulge") for
middle- and high-school students. Instead of one front end that tries to hold
every topic, Claude writes a small **lesson spec** and a shared viewer renders it.

- **Audience:** students aged 11–18. UI and lesson text are in Italian first,
  with English added later. Each lesson declares a level (`medie` / `superiori`).
- **Authors:** two parents working in claude.ai (web or mobile) through a
  remote MCP connector.
- **Hosting:** a public GitHub Pages site. Non-commercial, family use.

## 2. Principles

1. **Spec, not code.** A lesson is a JSON document of a few KB. The viewer owns
   all styling, so every lesson looks consistent. A small escape hatch
   (`custom` layer) exists for edge cases.
2. **Data by reference.** Claude never moves geometry or long series through its
   context. Specs name datasets by ID, and the viewer fetches them from the
   static site.
3. **Missing data is `null`, never `0`.** This is carried over from the current
   app. "No data" renders as grey.
4. **Authored geometry is shown as authored.** Some features are drawn by Claude
   from sources rather than taken from a dataset: a front line, a 1707 border
   built from modern polygons. These carry `provenance` and render visibly as
   approximate (dashed or hatched, with an "approximate" badge).
5. **Every claim is cited.** Each narrative step and each authored feature
   references a source (a pinned Wikipedia revision, a Wikidata item, or a
   dataset). The validator rejects lessons with uncited steps.
6. **Bilingual from day one.** Every user-facing string is a `{ it, en? }`
   object, and the viewer falls back to `it`.

## 3. Architecture

```
          claude.ai  (Project "Study Atlas" + custom connector)
                     │
                     ▼
   Remote MCP — Cloudflare Worker
     read:   get_authoring_guide · find_geo · search_series · describe_dataset
             find_sources (Wikipedia it/en + Wikidata, pinned revisions)
     write:  validate_lesson · preview_lesson · publish_lesson   (GitHub OAuth, allowlist)
                     │                         │
              drafts in KV (TTL)        commit via GitHub API
                     ▼                         ▼
   GitHub Pages  <user>.github.io/<repo>/
     /                 index of lessons (subject · level · topic)
     /?lesson=uk-geografia            published lesson
     /?draft=<id>                     preview (spec fetched from the Worker; M2)
     /data/catalog.json               every dataset ID + coverage + licence
     /data/geo/…  /data/series/…      pre-baked TopoJSON / JSON
     /lessons/*.json                  the collection
                     ▲
   GitHub Action: data pipeline (grown from scripts/build-data.ts)
```

- The **Worker only does lookups and validation.** Heavy work (simplifying,
  clipping and chunking geometry) happens at build time in the Action.
- **One schema, three users.** The lesson schema is written once in zod
  (`packages/spec`) and used by the viewer to type and parse lessons, by the
  Worker to validate them, and to generate the JSON Schema that the authoring
  guide shows Claude.
- **Preview before publish.** `preview_lesson` stores a draft in KV and returns a
  link. `publish_lesson` commits `lessons/<id>.json`, and Pages redeploys.
  Nothing becomes public without an explicit publish.

## 4. Lesson spec v0

```jsonc
{
  "id": "uk-geografia",
  "schema": 0,
  "title":   { "it": "Il Regno Unito" },
  "subject": "geografia",
  "level":   "medie",
  "langs":   ["it"],

  "map": {
    "projection": { "type": "conicConformal", "center": [2, 50] },   // or "auto"
    "extent": [[-11, 49.5], [2.5, 61]],
    "basemap": "physical"            // physical | political | plain | historical:<date>
  },

  // Named data handles; layers refer to these keys.
  "data": {
    "units":   { "dataset": "ne/map_units" },              // ENG, SCT, WLS, NIR…
    "cities":  { "dataset": "ne/places", "where": { "country": "GBR", "pop": { "min": 250000 } } }
    "density": { "dataset": "ons/density-itl1" },          // a *series* handle: values per uk/itl1 area per year
    "rivers":  { "dataset": "ne/rivers", "where": { "country": "GBR" } }
  },

  // Guided mode: one map state + text per step. Explore mode: a free scrubber over `time`.
  "steps": [
    {
      "id": "nomi",
      "title": { "it": "Isole Britanniche, Gran Bretagna, Regno Unito" },
      "layers": [
        { "type": "highlight", "data": "units",
          "groups": [{ "ids": ["ENG", "SCT", "WLS"], "label": { "it": "Gran Bretagna" }, "color": "orange" }] }
      ],
      "text":  { "it": "Tre nomi che sembrano uguali ma non lo sono…" },
      "cite":  ["wp_regno_unito"]          // keys into "sources"; Wikipedia pinned by revid
    }
  ],

  "quiz": [
    { "q": { "it": "Qual è il fiume più lungo del Regno Unito?" },
      "choices": [{ "it": "Tamigi" }, { "it": "Severn" }, { "it": "Trent" }],
      "answer": 1, "explain": { "it": "Il Severn (~354 km) supera di poco il Tamigi." },
      "cite": ["wp_severn"] }
  ],

  "glossary": [ { "term": { "it": "Corrente nord-atlantica" }, "def": { "it": "…" } } ],
  "caveats":  [ { "it": "I confini del 1707 sono ricostruiti a partire da quelli attuali." } ],
  "sources":  { "wp_regno_unito": { "kind": "wikipedia", "lang": "it", "title": "Regno Unito", "revid": 152933098 } }
}
```

### Layer primitives (v0)

| type | for | notes |
|---|---|---|
| `choropleth` | values per area | viridis; log option; per-step domain → legend always matches |
| `highlight` | naming/grouping areas | categorical, with labels |
| `symbols` | points sized by value | cities, power plants |
| `labels` | place names | collision-avoided |
| `note` | water bodies, regions, landforms | free text at a point, atlas lettering |
| `lines` | rivers, routes, borders | |
| `authored` | front lines, historical borders, arrows | requires `provenance`; drawn dashed/hatched |
| `keyframes` | geometry that moves over time | interpolated between dated frames |
| `compare` | same-scale overlay of another country | e.g. Italy over the UK |
| `chart` | line / stacked-area / bar beside the map | linked to the map by hover |
| `custom` | escape hatch | sandboxed render function; validator warns |

Built in M0: `highlight`, `labels`, `note`, `compare`. Added in M1:
`choropleth` (series handle + year, optional explicit `breaks`), `symbols`
(circle area ∝ a numeric property), `lines` (rivers/routes), a `bars` chart per
step (coloured like the map when it shows the same series), step `frames`
(dated moments inside a step, e.g. 1542/1707/1801/1922), a per-step `basemap`
(`physical` adds baked relief bands), and quiz questions of two kinds: `choice`
and `locate` (tap the right area). The rest arrive with the lessons that need them.

Modes: **guided** (next/previous steps, the default for study), **explore**
(free pan, zoom and time scrubber), and **print** (each step as a static panel).

## 5. Viewer

- The shell is Svelte 5, carried over. The map is **d3-geo on SVG** with
  no tile server: the basemap ships from our own data and stays
  period-appropriate for historical lessons. Leaflet is dropped.
- Reused from `src/core/`: `scales.ts`, `store.ts`, the null handling in
  `join.ts`, and the `urlState.ts` pattern (step, language and mode in the URL,
  so links can be shared).
- Every lesson gets a "Fonti" (sources) panel listing all citations and dataset
  licences. This is required for CC BY-SA and good practice to show students.

## 6. Data catalogue and pipeline

Dataset IDs follow `<source>/<name>[@<version>]`. `catalog.json` records each
dataset's coverage (time, area, admin level), units, licence and attribution
text, which is what `find_geo`, `search_series` and `describe_dataset` read.

| Source | Used for | Licence (to verify on ingest) |
|---|---|---|
| Natural Earth | land, coasts, rivers, lakes, places, admin-0 | public domain |
| geoBoundaries | admin-1/2 worldwide | CC BY 4.0 (per-country source licence noted) |
| ONS Open Geography | UK ITL1/ITL2 regions | OGL v3 |
| ONS / Nomis | UK regional population (→ density) | OGL v3 |
| OECD Regional Database | household disposable income per head, TL2 (= ITL1) | CC BY 4.0 |
| Mapzen/Tilezen Terrarium tiles | elevation → relief bands (vector, baked) | mixed open; attribution in catalog |
| Met Office HadUK-Grid | UK rainfall/temperature normals | OGL v3 |
| CShapes 2.0 | country borders 1886–2019, dated | CC BY-NC-SA (believed) |
| historical-basemaps | coarse world snapshots, deep past | GPL-3 (believed) |
| OWID | national time series | CC BY 4.0 |
| World Bank WDI | national indicators | CC BY 4.0 |
| Wikipedia it/en | narrative, cited by revision | CC BY-SA 4.0 |
| Wikidata | dates, coordinates, entities | CC0 |

GADM is deliberately excluded: its terms restrict redistribution, and this site
redistributes data publicly.

Pipeline output is chunked by `source/level/region`, simplified at two
resolutions (overview and detail), and stored as TopoJSON. Rasters such as the
hillshade and rainfall are pre-cut per lesson extent into small PNG/WebP files.

## 7. MCP server

Hosted on Cloudflare Workers with the Agents SDK `McpAgent`, using
`workers-oauth-provider` and GitHub OAuth. The write tools check an allowlist of
two GitHub logins.

| tool | returns |
|---|---|
| `get_authoring_guide()` | how to write a lesson, the JSON Schema, layer cookbook, citation rules, tone |
| `find_geo(query, at?, extent?)` | matching geo dataset IDs + coverage (not geometry) |
| `search_series(query, geo?)` | candidate series IDs + units + coverage |
| `describe_dataset(id)` | full metadata + a few sample values / feature names (for writing `where` filters) |
| `find_sources(topic, lang)` | Wikipedia passages with `revid` + Wikidata facts, ready to cite |
| `validate_lesson(spec)` | errors and warnings: schema, unresolved IDs, uncited steps, dates outside coverage, missing `it` strings |
| `preview_lesson(spec)` | validates, stores the draft (KV, 30-day TTL), returns the viewer link |
| `publish_lesson(draftId)` | commits to `lessons/`, updates the index, returns the public URL |

Each parent's claude.ai account gets a "Study Atlas" Project. Its instructions
are one line, "call `get_authoring_guide` first", so the real guidance lives in
the server and only needs updating in one place.

## 8. Repo layout

```
packages/spec/      zod schema + types + validator (+ JSON Schema export, M2)
packages/runtime/   the viewer (Svelte 5 + d3-geo)
packages/pipeline/  data build → site/data/
packages/mcp/       Cloudflare Worker (M2)
site/lessons/       lesson specs (committed); site/data/ is baked (gitignored)
src/, scripts/      the original world-atlas app, untouched for now
```

The original app stays in place until M3, when it becomes a lesson ("La
popolazione del mondo"). Moving it earlier would only churn working code.

## 9. First lesson: Il Regno Unito (acceptance test)

Planned steps (level `medie`, with a `superiori` extension):

1. **Dove si trova.** Europe context, the Channel, a same-scale **Italy overlay**
   (`compare`).
2. **Tre nomi.** British Isles vs Great Britain vs United Kingdom (`highlight`).
3. **Le quattro nazioni** and their capitals (`highlight`, `labels`).
4. **Come si è formato.** Wales (1535–42), Scotland (1707), Ireland (1801), the
   Irish partition (1922). Borders are built from modern polygons, so they are
   drawn as `authored` with a caveat. The first test of time-stepped borders.
5. **Rilievi e fiumi.** Highlands, Pennines, Snowdonia, Lake District, Ben
   Nevis; Thames, Severn (`basemap: physical`, `lines`, `labels`).
6. **Clima.** The wetter west and the North Atlantic Drift (rainfall normals
   raster). This is a stretch goal for M1.
7. **Popolazione e città.** Density by ITL1, cities as `symbols`, London's
   weight.
8. *(superiori)* **Nord e Sud.** Income per head by region (`choropleth` +
   `chart`).
9. **Verifica.** A 5-question quiz.

It exercises seven of the ten primitives, plus the guided mode, the sources
panel and Italian copy.

## 10. Milestones

- **M0, spec and skeleton — done.** npm workspaces; `packages/spec` (schema +
  validator); the pipeline bakes Natural Earth 1:10m (`ne/admin0`,
  `ne/map_units`, `ne/places`); the viewer renders plan steps 1–3 as six guided
  steps (`site/lessons/uk-geografia.json`) with the `highlight`, `labels`,
  `note` and `compare` primitives; a Pages workflow. Deviation: the four
  nations come from Natural Earth map units rather than geoBoundaries, so they
  share the basemap's coastline exactly; geoBoundaries arrives when admin-1
  detail is needed.
- **M1, a complete hand-written lesson — done.** Eleven steps plus a six-question
  quiz. New in the pipeline:
  - `uk/itl1`: the 12 UK regions, dissolved from Natural Earth admin-1.
  - Series datasets: `ons/population-itl1` and `ons/density-itl1` (Nomis), and
    `oecd/income-itl1`.
  - `ne/rivers`, with ids such as `thames` and `severn-gbr`.
  - `terrain/relief`: elevation bands contoured from Terrarium tiles.

  New in the viewer: a page model (steps → frames → questions → score), the
  layers and quiz listed in §4, and legends. Print mode (`?print=1`) shows each
  step as a static map beside its text, then the quiz as a worksheet, then the
  answers and all sources.

  Deviations:
  - **Climate step (6) skipped.** The rainfall raster is left for later.
  - **The history frames use plain `highlight`, not `authored`.** They show
    modern map units, with a caveat saying so.
  - **Regional income comes from the OECD, not ONS.** ONS's API series lacked
    Scotland and Northern Ireland.
  - **Region borders are approximate.** They are dissolved from Natural Earth
    admin-1 rather than taken from ONS boundaries, and density uses those
    polygons' areas. Both are stated as caveats.
- **M2, Claude authors.** The Worker with read tools plus `validate` and
  `preview`. Write a *second* lesson end to end from claude.ai, then fix
  whatever was awkward in the spec or guide.
- **M3, collection.** `publish`, the index page, English strings, and the world
  population lesson ported.

## 11. Risks and open questions

- **Authored geometry quality:** front lines and historical borders drawn by an
  LLM can be confidently wrong. Mitigations: required provenance, visible
  "approximate" styling, and a parent reviewing the preview before publishing.
- **Wikipedia text licence:** quoting passages means CC BY-SA applies to the
  quoted text. Prefer paraphrase plus citation, and keep any quotes short.
- **Spec expressiveness:** if Claude keeps reaching for `custom`, that is the
  signal to add a primitive.
- **To decide:** the repo/site name and GitHub account; whether lesson specs also
  live in a Worker-side index (search across the collection) or only in the repo.
