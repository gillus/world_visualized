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
import { loadCheckContext, validateLesson, hasErrors, type Lesson } from '../src/index'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SITE = join(ROOT, 'site')
const DATA = join(SITE, 'data')
const LESSONS = join(SITE, 'lessons')

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function main() {
  let ctx: Awaited<ReturnType<typeof loadCheckContext>>
  try {
    ctx = await loadCheckContext((path) => readJson(join(DATA, path)))
  } catch (err) {
    console.error(`Cannot read the baked data in ${DATA} — run \`npm run atlas:data\` first.\n`, err)
    process.exit(1)
  }

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
