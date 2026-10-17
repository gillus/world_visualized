import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
/** Raw downloads (gitignored). */
export const RAW = join(ROOT, 'data-sources')
/** Baked output served by the site (gitignored, rebuilt in CI). */
export const DATA = join(ROOT, 'site', 'data')
/** Committed copies of sources whose APIs are unreliable (see fetchCached). */
export const SNAPSHOTS = join(ROOT, 'packages', 'pipeline', 'snapshots')
