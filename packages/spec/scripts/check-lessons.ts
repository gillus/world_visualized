// ---------------------------------------------------------------------------
// check-lessons — validate every site/lessons/*.json against the schema and
// the data catalog, then write the collection index (site/data/lessons.json)
// that the viewer's home page lists. Exits non-zero on any error, so a broken
// lesson can't reach the published site.
//
// Run with:  npm run atlas:lessons   (after `npm run atlas:data`)
// ---------------------------------------------------------------------------

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Catalog, DatasetIndex, SeriesFile, validateLesson, hasErrors, type Lesson } from '../src/index'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SITE = join(ROOT, 'site')
const DATA = join(SITE, 'data')
const LESSONS = join(SITE, 'lessons')

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function main() {
  let catalog: Catalog
  try {
    catalog = Catalog.parse(await readJson(join(DATA, 'catalog.json')))
  } catch (err) {
    console.error(`Cannot read ${join(DATA, 'catalog.json')} — run \`npm run atlas:data\` first.\n`, err)
    process.exit(1)
  }

  const idSets = new Map<string, Set<string>>()
  for (const ds of catalog.datasets) {
    const index = DatasetIndex.parse(await readJson(join(DATA, ds.index)))
    idSets.set(ds.id, new Set(index.map((e) => e.id)))
  }
  const yearSets = new Map<string, Set<number>>()
  for (const s of catalog.series) {
    const file = SeriesFile.parse(await readJson(join(DATA, s.path)))
    const years = new Set<number>()
    for (const byYear of Object.values(file.values)) {
      for (const [y, v] of Object.entries(byYear)) if (v !== null) years.add(Number(y))
    }
    yearSets.set(s.id, years)
  }
  const ctx = { catalog, ids: (id: string) => idSets.get(id), years: (id: string) => yearSets.get(id) }

  const files = (await readdir(LESSONS)).filter((f) => f.endsWith('.json')).sort()
  const valid: Lesson[] = []
  let failed = 0

  for (const file of files) {
    const { lesson, issues } = validateLesson(await readJson(join(LESSONS, file)), ctx)
    if (lesson && lesson.id !== file.replace(/\.json$/, '')) {
      issues.push({ level: 'error', path: 'id', message: `id "${lesson.id}" must match the file name` })
    }
    const ok = lesson && !hasErrors(issues)
    console.log(`${ok ? '✓' : '✗'} ${file}${issues.length ? '' : ' — clean'}`)
    for (const i of issues) console.log(`    ${i.level === 'error' ? 'error  ' : 'warning'} ${i.path || '(root)'}: ${i.message}`)
    if (ok) valid.push(lesson)
    else failed++
  }

  const index = valid.map((l) => ({
    id: l.id,
    title: l.title,
    subtitle: l.subtitle,
    subject: l.subject,
    level: l.level,
    langs: l.langs,
    steps: l.steps.length,
  }))
  await writeFile(join(DATA, 'lessons.json'), JSON.stringify(index, null, 2) + '\n')
  console.log(`\n${valid.length} lesson(s) indexed → site/data/lessons.json`)

  if (failed) {
    console.error(`${failed} lesson(s) failed validation.`)
    process.exit(1)
  }
}

main()
