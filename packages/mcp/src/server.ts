// The MCP server: tools Claude uses to write a lesson — read the authoring
// guide, look up data and sources, validate, and preview a draft. One server
// per request (the transport is stateless); everything slow is cached in Site.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { jsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/index.js'
import { z } from 'zod'
import { hasErrors, lessonJsonSchema, validateLesson, type Issue } from '@atlas/spec'
import type { Site } from './site'
import { describeDataset, findGeo, searchSeries } from './lookup'
import { findSources, readSource } from './wiki'
import { DRAFT_TTL_DAYS, getDraft, isDraftId, newDraftId, putDraft, type DraftStore } from './drafts'

export interface ServerDeps {
  site: Site
  drafts: DraftStore
  /** The authoring guide (Markdown). */
  guide: string
  /** GitHub login of the signed-in author. */
  user: string
  /** JSON Schema validator for the SDK; the Worker needs one that doesn't use eval. */
  jsonSchemaValidator?: jsonSchemaValidator
}

const INSTRUCTIONS = `Study Atlas: Claude writes visual study lessons (maps + short texts + a quiz) for Italian middle- and high-school students.
Always call get_authoring_guide first: it explains the lesson format, the workflow and the rules (citations, tone, data).`

const LonLat = z.tuple([z.number(), z.number()])
const ExtentArg = z.tuple([LonLat, LonLat]).describe('[[west, south], [east, north]] in degrees')
const LessonArg = z
  .union([z.record(z.string(), z.unknown()), z.string()])
  .describe('The whole lesson spec as a JSON object (a JSON string is accepted too)')

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }] }
}

function parseLesson(arg: Record<string, unknown> | string): unknown {
  if (typeof arg !== 'string') return arg
  try {
    return JSON.parse(arg)
  } catch (err) {
    throw new Error(`The lesson is not valid JSON: ${(err as Error).message}`)
  }
}

function report(issues: Issue[]) {
  const pick = (level: Issue['level']) => issues.filter((i) => i.level === level).map(({ path, message }) => ({ path, message }))
  return { ok: !hasErrors(issues), errors: pick('error'), warnings: pick('warning') }
}

export function createServer({ site, drafts, guide, user, jsonSchemaValidator }: ServerDeps): McpServer {
  const server = new McpServer(
    { name: 'study-atlas', title: 'Study Atlas', version: '0.2.0' },
    { instructions: INSTRUCTIONS, ...(jsonSchemaValidator ? { jsonSchemaValidator } : {}) },
  )
  const readOnly = { readOnlyHint: true, openWorldHint: false }

  server.registerTool(
    'get_authoring_guide',
    {
      title: 'Authoring guide',
      description:
        'How to write a Study Atlas lesson: workflow, structure, tone, layer cookbook, citation rules, the published lessons, and the JSON Schema of a lesson. Read it before anything else.',
      annotations: readOnly,
    },
    async () => {
      const lessons = await site.lessons().catch(() => [])
      const list = lessons.length
        ? lessons.map((l) => `- \`${l.id}\` — ${l.title.it} (${l.subject}, ${l.level}, ${l.steps} steps): ${site.lessonUrl(l.id)}`).join('\n')
        : '- (none yet)'
      const text = [
        guide.trim(),
        `## Published lessons\n\nRead one with \`get_lesson\` to see a complete, working example.\n\n${list}`,
        `## Lesson JSON Schema\n\nGenerated from the validator's own schema. Fields with a \`default\` may be omitted.\n\n\`\`\`json\n${JSON.stringify(lessonJsonSchema())}\n\`\`\``,
      ].join('\n\n')
      return { content: [{ type: 'text', text }] }
    },
  )

  server.registerTool(
    'find_geo',
    {
      title: 'Find places and map datasets',
      description:
        'Search the map datasets by place name (Italian or English, accents optional) and return feature ids to use in layers, plus datasets whose description matches. Example: "Galles" → ne/map_units WLS. Optionally limit to a map extent.',
      inputSchema: { query: z.string().min(2), extent: ExtentArg.optional(), limit: z.number().int().min(1).max(100).optional() },
      annotations: readOnly,
    },
    async ({ query, extent, limit }) => json(await findGeo(site, query, extent, limit)),
  )

  server.registerTool(
    'search_series',
    {
      title: 'Find statistics',
      description:
        'List the statistical series (values per area per year, e.g. population density) that choropleth and bar-chart layers can show. Titles are in English; leave query empty to list them all.',
      inputSchema: { query: z.string().optional() },
      annotations: readOnly,
    },
    async ({ query }) => json(await searchSeries(site, query)),
  )

  server.registerTool(
    'describe_dataset',
    {
      title: 'Describe a dataset',
      description:
        'Everything needed to use one dataset or series in a lesson. For map datasets: id scheme, properties for `where` filters, and features (narrow with `extent` or `query` to see all their properties). For series: unit, years, and every area\'s value in `year` (default: the latest), which helps choose choropleth breaks.',
      inputSchema: {
        id: z.string().describe('Dataset or series id, e.g. "ne/places" or "ons/density-itl1"'),
        extent: ExtentArg.optional(),
        query: z.string().optional().describe('Only features whose name matches'),
        year: z.number().int().optional().describe('Series only: the year to show values for'),
        limit: z.number().int().min(1).max(300).optional().describe('Most features to list (default 40)'),
      },
      annotations: readOnly,
    },
    async ({ id, ...opts }) => json(await describeDataset(site, id, opts)),
  )

  server.registerTool(
    'find_sources',
    {
      title: 'Find Wikipedia sources',
      description:
        'Search Italian (default) or English Wikipedia. Each hit has its lead section, the current revision id and a ready-made `source` object to put in the lesson. Skip hits marked `disambiguation`. Use read_source for the full article.',
      inputSchema: {
        query: z.string().min(2),
        lang: z.enum(['it', 'en']).optional(),
        limit: z.number().int().min(1).max(10).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, lang, limit }) => json(await findSources(query, lang ?? 'it', limit)),
  )

  server.registerTool(
    'read_source',
    {
      title: 'Read a Wikipedia article',
      description:
        'The full text of one Wikipedia article (headings, lists and tables kept), at a pinned revision if `revid` is given, otherwise the current one. Check every fact you put in a lesson against the revision you cite.',
      inputSchema: {
        title: z.string().min(1),
        lang: z.enum(['it', 'en']).optional(),
        revid: z.number().int().positive().optional(),
        max_chars: z.number().int().min(1000).max(60000).optional().describe('Default 15000'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ title, lang, revid, max_chars }) => json(await readSource(title, lang ?? 'it', revid, max_chars)),
  )

  server.registerTool(
    'get_lesson',
    {
      title: 'Get a lesson',
      description: 'The JSON of a published lesson (`id`) or of a draft (`draft`), to learn from or to revise.',
      inputSchema: { id: z.string().optional(), draft: z.string().optional() },
      annotations: readOnly,
    },
    async ({ id, draft }) => {
      if (draft) {
        const d = await getDraft(drafts, draft)
        if (!d) throw new Error(`No draft "${draft}" (drafts expire after ${DRAFT_TTL_DAYS} days).`)
        return json(d.lesson)
      }
      if (!id) throw new Error('Pass `id` (a published lesson) or `draft`.')
      return json(await site.lesson(id).catch(() => Promise.reject(new Error(`No published lesson "${id}".`))))
    },
  )

  server.registerTool(
    'validate_lesson',
    {
      title: 'Validate a lesson',
      description:
        'Check a lesson against the schema and the data: unknown datasets or feature ids, uncited steps, missing translations, years outside a series. Errors must be fixed; warnings deserve a look.',
      inputSchema: { lesson: LessonArg },
      annotations: readOnly,
    },
    async ({ lesson }) => {
      const { issues } = validateLesson(parseLesson(lesson), await site.checkContext())
      return json(report(issues))
    },
  )

  server.registerTool(
    'preview_lesson',
    {
      title: 'Preview a lesson',
      description: `Validate a lesson and, if it has no errors, save it as a draft (kept ${DRAFT_TTL_DAYS} days) and return the viewer link. Pass the \`draft\` id from an earlier preview to update that draft and keep its link. Nothing is published.`,
      inputSchema: { lesson: LessonArg, draft: z.string().optional().describe('Id of a draft to replace') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ lesson, draft }) => {
      const spec = parseLesson(lesson)
      const { issues } = validateLesson(spec, await site.checkContext())
      const result = report(issues)
      if (!result.ok) return json({ ...result, saved: false, note: 'Not saved: fix the errors and preview again.' })

      let id = draft
      if (id) {
        if (!isDraftId(id)) throw new Error(`"${id}" is not a draft id.`)
        const existing = await getDraft(drafts, id)
        if (existing && existing.owner !== user) throw new Error(`Draft "${id}" belongs to someone else; preview without \`draft\` to make a new one.`)
      } else {
        id = newDraftId()
      }
      await putDraft(drafts, id, { lesson: spec, owner: user, saved: new Date().toISOString() })
      const expires = new Date(Date.now() + DRAFT_TTL_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10)
      return json({
        ...result,
        saved: true,
        draft: id,
        url: site.draftUrl(id),
        printUrl: site.draftUrl(id, true),
        expires,
      })
    },
  )

  return server
}
