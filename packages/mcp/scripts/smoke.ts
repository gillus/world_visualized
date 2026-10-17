// Smoke test: a real MCP client calls every tool of the server in-process,
// against the local site/ (run `npm run atlas:data` first). Sign-in is not
// exercised here; Wikipedia is (needs the network).
//
//   npm run smoke -w @atlas/mcp

import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webcrypto } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../src/server'
import { Site } from '../src/site'
import type { KvStore } from '../src/drafts'

globalThis.crypto ??= webcrypto as Crypto

const HERE = dirname(fileURLToPath(import.meta.url))
const SITE = join(HERE, '..', '..', '..', 'site')

const site = new Site('https://example.org/atlas/', async (path) => JSON.parse(await readFile(join(SITE, path), 'utf8')))
const kv = new Map<string, string>()
const drafts: KvStore = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) }
const guide = await readFile(join(HERE, '..', 'src', 'guide.md'), 'utf8')

async function connect(user: string): Promise<Client> {
  const server = createServer({ site, drafts, guide, user })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'smoke', version: '0' })
  await Promise.all([server.connect(a), client.connect(b)])
  return client
}

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean; json: any }> {
  const res = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[]; isError?: boolean }
  const text = res.content.map((c) => c.text).join('\n')
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { text, isError: Boolean(res.isError), json }
}

const alice = await connect('alice')
const tools = (await alice.listTools()).tools.map((t) => t.name)
check('tools listed', tools.length === 11, tools.join(', '))

const g = await call(alice, 'get_authoring_guide')
check('guide includes schema and lessons', g.text.includes('"$defs"') && g.text.includes('uk-geografia'), `${g.text.length} chars`)

const wales = await call(alice, 'find_geo', { query: 'galles' })
check('find_geo galles → WLS', wales.json.features.some((f: any) => f.id === 'WLS' && f.dataset === 'ne/map_units'))
const london = await call(alice, 'find_geo', { query: 'Londra', extent: [[-11, 49], [2, 61]] })
check('find_geo Londra in extent → Q84', london.json.features.some((f: any) => f.id === 'Q84'), JSON.stringify(london.json.features.slice(0, 3)))
const po = await call(alice, 'find_geo', { query: 'po' })
check('find_geo po → a river first', po.json.features[0]?.dataset === 'ne/rivers', JSON.stringify(po.json.features.slice(0, 2)))

const series = await call(alice, 'search_series', { query: 'density' })
check('search_series density', series.json.some((s: any) => s.id === 'ons/density-itl1'))

const rivers = await call(alice, 'describe_dataset', { id: 'ne/rivers', extent: [[-11, 49], [2, 61]], limit: 5 })
check('describe_dataset rivers with properties', rivers.json.features[0]?.country !== undefined, JSON.stringify(rivers.json.features[0]))
const places = await call(alice, 'describe_dataset', { id: 'ne/places' })
check('describe_dataset places names only', places.json.note !== undefined && places.json.features.length === 40)
const density = await call(alice, 'describe_dataset', { id: 'ons/density-itl1', year: 2025 })
check('describe_dataset series values', density.json.values.length === 12 && density.json.values[0].value > 5000, JSON.stringify(density.json.values[0]))
const unknown = await call(alice, 'describe_dataset', { id: 'nope/nope' })
check('describe_dataset unknown → error', unknown.isError && unknown.text.includes('ne/admin0'))

const lesson = await call(alice, 'get_lesson', { id: 'uk-geografia' })
check('get_lesson', lesson.json?.id === 'uk-geografia')

const valid = await call(alice, 'validate_lesson', { lesson: lesson.json })
check('validate_lesson clean', valid.json.ok && valid.json.errors.length === 0 && valid.json.warnings.length === 0)
const broken = structuredClone(lesson.json)
broken.steps[0].cite = ['nowhere']
broken.steps[1].layers.push({ type: 'highlight', data: 'units', groups: [{ ids: ['XXX'], label: { it: 'x' } }] })
const invalid = await call(alice, 'validate_lesson', { lesson: JSON.stringify(broken) })
check('validate_lesson finds errors', !invalid.json.ok && invalid.json.errors.length === 2, JSON.stringify(invalid.json.errors))
const bad = await call(alice, 'validate_lesson', { lesson: '{ not json' })
check('validate_lesson bad JSON → error', bad.isError)

const notSaved = await call(alice, 'preview_lesson', { lesson: broken })
check('preview refuses errors', notSaved.json.saved === false && kv.size === 0)
const saved = await call(alice, 'preview_lesson', { lesson: lesson.json })
check('preview saves a draft', saved.json.saved && /^https:\/\/example\.org\/atlas\/\?draft=[a-z2-9]{12}$/.test(saved.json.url), saved.json.url)
const again = await call(alice, 'preview_lesson', { lesson: lesson.json, draft: saved.json.draft })
check('preview updates the same draft', again.json.draft === saved.json.draft && kv.size === 1)
const back = await call(alice, 'get_lesson', { draft: saved.json.draft })
check('get_lesson draft', back.json?.id === 'uk-geografia')
const bob = await connect('bob')
const stolen = await call(bob, 'preview_lesson', { lesson: lesson.json, draft: saved.json.draft })
check("another author can't replace a draft", stolen.isError)

const none = await call(alice, 'get_curriculum', { student: 's' })
check('get_curriculum before any save → error', none.isError)
const snapshot = {
  student: 's',
  class: '2ª media',
  as_of: '2026-10-17',
  subjects: [
    {
      subject: 'STORIA',
      topics: [{ date: '2026-10-15', topic: "L'età comunale: pag. 112-118" }],
      upcoming: [{ date: '2026-10-22', kind: 'test', text: 'Verifica sui comuni' }],
    },
  ],
}
const stored = await call(alice, 'save_curriculum', { snapshot })
check('save_curriculum', stored.json?.saved === true && stored.json.subjects[0] === 'STORIA: 1 topics, 1 upcoming', stored.text)
await call(bob, 'save_curriculum', { snapshot: { ...snapshot, student: 'a', class: '1º liceo' } })
const one = await call(bob, 'get_curriculum', { student: 's' })
check('get_curriculum one student', one.json?.subjects[0].upcoming[0].kind === 'test' && one.json.saved_by === 'alice' && one.json.age_days === 0)
const all = await call(alice, 'get_curriculum')
check('get_curriculum every student', all.json?.length === 2)
const email = await call(alice, 'save_curriculum', {
  snapshot: { ...snapshot, subjects: [{ ...snapshot.subjects[0], upcoming: [{ date: '2026-10-22', kind: 'reminder', text: 'Scrivere a prof@scuola.it' }] }] },
})
check('save_curriculum refuses email addresses', email.isError)
const badDate = await call(alice, 'save_curriculum', { snapshot: { ...snapshot, as_of: '17/10/2026' } })
check('save_curriculum refuses non-ISO dates', badDate.isError)
check('the curriculum is not a draft', !(await call(alice, 'get_lesson', { draft: 'curriculum' })).json)

const hits = await call(alice, 'find_sources', { query: 'Ben Nevis' })
check('find_sources Ben Nevis', hits.json[0]?.source?.revid > 0 && hits.json[0].intro.length > 50, `${hits.json[0]?.title} @${hits.json[0]?.revid}`)
const dis = await call(alice, 'find_sources', { query: 'Tweed', limit: 10 })
check('find_sources flags disambiguation', dis.json.some((h: any) => h.disambiguation), dis.json.map((h: any) => h.title + (h.disambiguation ? '*' : '')).join(', '))
const article = await call(alice, 'read_source', { title: 'Severn', revid: undefined, max_chars: 4000 })
check('read_source Severn', article.json?.revid > 0 && /354/.test(article.json.text), `${article.json?.length} chars, truncated=${article.json?.truncated}`)
const pinned = await call(alice, 'read_source', { title: 'Severn', revid: article.json.revid, max_chars: 1000 })
check('read_source by revid', pinned.json?.revid === article.json.revid)

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
