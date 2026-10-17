// ---------------------------------------------------------------------------
// The lesson spec, v0. A lesson is a small JSON document: map setup, named
// data handles (references into the catalog, never inline geometry), and a
// sequence of guided steps. The viewer owns all styling; a spec only says
// *what* to show.
//
// This file is the single source of truth: the viewer parses with it, the
// validator (and later the MCP server) checks with it, and the JSON Schema
// shown to Claude is generated from it.
// ---------------------------------------------------------------------------

import { z } from 'zod'

export const LANGS = ['it', 'en'] as const
export const Lang = z.enum(LANGS)
export type Lang = z.infer<typeof Lang>

/** Every user-facing string. Italian is required; other languages are optional
 *  unless the lesson lists them in `langs` (the validator enforces that). */
export const Text = z
  .object({
    it: z.string().min(1),
    en: z.string().min(1).optional(),
  })
  .strict()
export type Text = z.infer<typeof Text>

const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase-kebab-case')
const Key = z.string().regex(/^[a-z][a-z0-9_]*$/, 'lowercase identifier')

export const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
export type LonLat = z.infer<typeof LonLat>

/** [[west, south], [east, north]] in degrees. */
export const Extent = z
  .tuple([LonLat, LonLat])
  .refine(([[w, s], [e, n]]) => w < e && s < n, 'extent must be [[west, south], [east, north]]')
export type Extent = z.infer<typeof Extent>

export const PROJECTIONS = [
  'auto',
  'conicConformal',
  'transverseMercator',
  'mercator',
  'equalEarth',
  'azimuthalEqualArea',
  'orthographic',
] as const
export const Projection = z
  .object({
    type: z.enum(PROJECTIONS).default('auto'),
    /** Projection centre; defaults to the middle of the map extent. */
    center: LonLat.optional(),
  })
  .strict()

/** political: countries with borders; physical: relief tints (plus thin
 *  borders); plain: land and sea only. */
export const BASEMAPS = ['political', 'physical', 'plain'] as const
export const Basemap = z.enum(BASEMAPS)
export type Basemap = z.infer<typeof Basemap>

export const MapSetup = z
  .object({
    projection: Projection.default({ type: 'auto' }),
    /** Everything any step will show; step views zoom within this. */
    extent: Extent,
    basemap: Basemap.default('political'),
  })
  .strict()

/** Dataset IDs look like `ne/admin0` or `ons/itl1@2021`; see data/catalog.json. */
export const DatasetId = z.string().regex(/^[a-z0-9-]+(\/[a-z0-9_-]+)+(@[a-z0-9._-]+)?$/, 'dataset id')

const Scalar = z.union([z.string(), z.number(), z.boolean()])
/** Feature filter: property → exact value, any-of list, or numeric range. */
export const Where = z.record(
  z.string(),
  z.union([Scalar, z.array(Scalar).min(1), z.object({ min: z.number().optional(), max: z.number().optional() }).strict()]),
)
export type Where = z.infer<typeof Where>

export const DataRef = z
  .object({
    dataset: DatasetId,
    where: Where.optional(),
  })
  .strict()
export type DataRef = z.infer<typeof DataRef>

/** Okabe–Ito: a categorical palette that stays distinguishable for colour-blind readers. */
export const SWATCHES = ['orange', 'sky', 'green', 'yellow', 'blue', 'vermillion', 'purple', 'grey'] as const
export const Swatch = z.enum(SWATCHES)
export type Swatch = z.infer<typeof Swatch>

const FeatureId = z.string().min(1)

export const HighlightLayer = z
  .object({
    type: z.literal('highlight'),
    data: Key,
    groups: z
      .array(
        z
          .object({
            ids: z.array(FeatureId).min(1),
            label: Text,
            color: Swatch.optional(),
          })
          .strict(),
      )
      .min(1),
    /** Write each highlighted feature's own name on the map. */
    labels: z.boolean().default(false),
  })
  .strict()

export const LabelsLayer = z
  .object({
    type: z.literal('labels'),
    data: Key,
    /** Which features to label; default: every feature the data handle selects. */
    ids: z.array(FeatureId).min(1).optional(),
    marker: z.enum(['capital', 'city', 'none']).optional(),
    /** Replace a feature's catalog name. */
    text: z.record(FeatureId, Text).optional(),
  })
  .strict()

export const NoteLayer = z
  .object({
    type: z.literal('note'),
    at: LonLat,
    text: Text,
    /** `peak` adds a summit marker (a small triangle) beside the text. */
    style: z.enum(['water', 'region', 'landform', 'peak', 'plain']).default('plain'),
  })
  .strict()

/** "True size" overlay: move a feature (keeping its real size and shape) onto `at`. */
export const CompareLayer = z
  .object({
    type: z.literal('compare'),
    data: Key,
    id: FeatureId,
    at: LonLat,
    label: Text,
    color: Swatch.default('vermillion'),
  })
  .strict()

const Year = z.number().int().min(-5000).max(2100)

/** Areas coloured by a value. `data` must be a series handle (see the catalog's
 *  `series`); its areas come from the series' key dataset. */
export const ChoroplethLayer = z
  .object({
    type: z.literal('choropleth'),
    data: Key,
    /** If the series has no value for this year, the latest earlier one is used and shown. */
    year: Year,
    /** Legend heading, e.g. "Abitanti per km²". */
    title: Text,
    /** Class limits, ascending: [200, 400, 800] makes four classes. Default: five
     *  classes with about the same number of areas each. */
    breaks: z.array(z.number()).min(1).max(7).optional(),
  })
  .strict()

/** Points drawn as circles whose *area* is proportional to a numeric property. */
export const SymbolsLayer = z
  .object({
    type: z.literal('symbols'),
    data: Key,
    /** Numeric feature property that sets the circle size, e.g. `pop`. */
    size: z.string().min(1),
    ids: z.array(FeatureId).min(1).optional(),
    title: Text,
    color: Swatch.default('vermillion'),
    /** Write each point's name beside its circle. */
    labels: z.boolean().default(true),
    text: z.record(FeatureId, Text).optional(),
  })
  .strict()

/** Lines such as rivers or routes. */
export const LinesLayer = z
  .object({
    type: z.literal('lines'),
    data: Key,
    ids: z.array(FeatureId).min(1).optional(),
    style: z.enum(['river', 'route']).default('river'),
    labels: z.boolean().default(true),
    text: z.record(FeatureId, Text).optional(),
  })
  .strict()

export const Layer = z.discriminatedUnion('type', [
  HighlightLayer,
  LabelsLayer,
  NoteLayer,
  CompareLayer,
  ChoroplethLayer,
  SymbolsLayer,
  LinesLayer,
])
export type Layer = z.infer<typeof Layer>
export type HighlightLayer = z.infer<typeof HighlightLayer>
export type LabelsLayer = z.infer<typeof LabelsLayer>
export type NoteLayer = z.infer<typeof NoteLayer>
export type CompareLayer = z.infer<typeof CompareLayer>
export type ChoroplethLayer = z.infer<typeof ChoroplethLayer>
export type SymbolsLayer = z.infer<typeof SymbolsLayer>
export type LinesLayer = z.infer<typeof LinesLayer>

/** A bar chart beside the map, from a series handle. If the step also has a
 *  choropleth of the same handle, the bars take its colours. */
export const Chart = z
  .object({
    type: z.literal('bars'),
    data: Key,
    year: Year,
    title: Text,
    sort: z.enum(['desc', 'asc', 'none']).default('desc'),
    /** Draw the series' aggregate (e.g. the whole country) as a reference line. */
    reference: z.boolean().default(true),
  })
  .strict()
export type Chart = z.infer<typeof Chart>

/** A moment inside a step — e.g. one date in a history sequence. "Next" walks
 *  through a step's frames before moving on. */
export const Frame = z
  .object({
    /** Short tab label, e.g. "1707". */
    label: Text,
    text: Text,
    view: Extent.optional(),
    /** Drawn on top of the step's own layers. */
    layers: z.array(Layer).default([]),
    cite: z.array(Key).default([]),
  })
  .strict()
export type Frame = z.infer<typeof Frame>

export const Step = z
  .object({
    id: Slug,
    title: Text,
    /** Paragraphs separated by a blank line; **bold** and *italic* allowed. */
    text: Text,
    /** Where the map looks during this step; defaults to the lesson extent. */
    view: Extent.optional(),
    /** Overrides `map.basemap` for this step. */
    basemap: Basemap.optional(),
    layers: z.array(Layer).default([]),
    frames: z.array(Frame).min(2).optional(),
    chart: Chart.optional(),
    /** Keys into `sources`. Every step must say where its claims come from. */
    cite: z.array(Key).min(1),
  })
  .strict()
export type Step = z.infer<typeof Step>

const QuestionBase = {
  q: Text,
  /** Shown after answering, right or wrong: why the answer is what it is. */
  explain: Text,
  cite: z.array(Key).min(1),
  view: Extent.optional(),
  basemap: Basemap.optional(),
}

/** Multiple choice; the map shows `layers` (or just the basemap). */
export const ChoiceQuestion = z
  .object({
    type: z.literal('choice'),
    ...QuestionBase,
    choices: z.array(Text).min(2).max(5),
    /** Index into `choices`. */
    answer: z.number().int().min(0),
    layers: z.array(Layer).default([]),
  })
  .strict()

/** "Find it on the map": the student taps one of the candidate areas. */
export const LocateQuestion = z
  .object({
    type: z.literal('locate'),
    ...QuestionBase,
    data: Key,
    /** Candidate areas, outlined and tappable. */
    ids: z.array(FeatureId).min(2).max(12),
    answer: FeatureId,
  })
  .strict()

export const Question = z.discriminatedUnion('type', [ChoiceQuestion, LocateQuestion])
export type Question = z.infer<typeof Question>
export type ChoiceQuestion = z.infer<typeof ChoiceQuestion>
export type LocateQuestion = z.infer<typeof LocateQuestion>

export const Source = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('wikipedia'),
      lang: Lang,
      title: z.string().min(1),
      /** Pinned revision, so the citation never drifts. */
      revid: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('wikidata'),
      qid: z.string().regex(/^Q\d+$/),
      revid: z.number().int().positive(),
      label: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('web'),
      url: z.url(),
      title: z.string().min(1),
      publisher: z.string().optional(),
      accessed: z.iso.date(),
    })
    .strict(),
])
export type Source = z.infer<typeof Source>

export const SUBJECTS = ['geografia', 'storia', 'scienze', 'economia', 'educazione-civica'] as const
export const LEVELS = ['medie', 'superiori'] as const

export const Lesson = z
  .object({
    schema: z.literal(0),
    id: Slug,
    title: Text,
    subtitle: Text.optional(),
    subject: z.enum(SUBJECTS),
    level: z.enum(LEVELS),
    /** Languages this lesson is complete in. Must include `it`. */
    langs: z.array(Lang).min(1).default(['it']),
    map: MapSetup,
    data: z.record(Key, DataRef).default({}),
    steps: z.array(Step).min(1),
    /** "Verifica": a short self-check after the last step. */
    quiz: z.array(Question).max(10).default([]),
    /** Honest limits of what the map shows, surfaced to the student. */
    caveats: z.array(Text).default([]),
    sources: z.record(Key, Source),
  })
  .strict()
export type Lesson = z.infer<typeof Lesson>
/** What a lesson author writes (defaults not yet applied). */
export type LessonInput = z.input<typeof Lesson>
