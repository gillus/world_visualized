// Download-once cache for raw sources. Files land in the repo's data-sources/
// (gitignored, shared with the legacy app); delete one to force a re-fetch.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { RAW } from './paths'

/** GET with a few retries: statistics APIs throw the odd 429/5xx under load. */
async function get(url: string, attempts = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'world-visualized-pipeline/0.1 (family study project)' } })
    if (res.ok) return res
    if (i >= attempts || (res.status !== 429 && res.status < 500)) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`)
    console.log(`  retry    ${res.status}, attempt ${i + 1} of ${attempts}`)
    await new Promise((r) => setTimeout(r, 2000 * i))
  }
}

export async function fetchCached(url: string, file: string): Promise<string> {
  const path = join(RAW, file)
  try {
    await access(path)
    console.log(`  cached   ${file}`)
    return readFile(path, 'utf8')
  } catch {
    // not cached yet
  }
  console.log(`  fetch    ${url}`)
  const body = await (await get(url)).text()
  await mkdir(RAW, { recursive: true })
  await writeFile(path, body)
  return body
}

/** Like fetchCached, for binary files (map tiles). Quiet on cache hits — there are many. */
export async function fetchCachedBinary(url: string, file: string): Promise<Buffer> {
  const path = join(RAW, file)
  try {
    return await readFile(path)
  } catch {
    // not cached yet
  }
  const body = Buffer.from(await (await get(url)).arrayBuffer())
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body)
  return body
}
