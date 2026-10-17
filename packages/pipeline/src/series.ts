// Write a series dataset (values per feature per year) under site/data/series/.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { SeriesFile, type SeriesDataset } from '@atlas/spec'
import { DATA } from './paths'

export async function writeSeries(meta: Omit<SeriesDataset, 'path' | 'years'>, file: SeriesFile): Promise<SeriesDataset> {
  SeriesFile.parse(file)
  const years = Object.values(file.values)
    .flatMap((byYear) => Object.entries(byYear).filter(([, v]) => v !== null).map(([y]) => Number(y)))
  if (!years.length) throw new Error(`${meta.id}: series has no values`)
  const path = `series/${meta.id}.json`
  await mkdir(dirname(join(DATA, path)), { recursive: true })
  await writeFile(join(DATA, path), JSON.stringify(file))
  const range: [number, number] = [Math.min(...years), Math.max(...years)]
  console.log(`  series   ${meta.id}: ${Object.keys(file.values).length} areas, ${range[0]}–${range[1]}`)
  return { ...meta, years: range, path }
}

/** Minimal CSV parser for the quoted, comma-separated files ONS and OECD serve. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) rows.push([...row, field])
  const [header, ...body] = rows
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}
