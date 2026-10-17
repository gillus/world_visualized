// ---------------------------------------------------------------------------
// build — bake every dataset into site/data/ and write catalog.json.
//
// Run with:  npm run atlas:data
// ---------------------------------------------------------------------------

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Catalog } from '@atlas/spec'
import { buildNaturalEarth } from './naturalEarth'
import { buildRelief } from './relief'
import { buildRivers } from './rivers'
import { buildUkRegions } from './ukRegions'
import { DATA } from './paths'

async function main() {
  await mkdir(DATA, { recursive: true })
  console.log('Baking datasets…')
  const uk = await buildUkRegions()
  const datasets = [...(await buildNaturalEarth()), await buildRivers(), ...uk.datasets, await buildRelief()]
  const series = [...uk.series]

  const catalog = Catalog.parse({ version: 0, generated: new Date().toISOString(), datasets, series })
  await writeFile(join(DATA, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
  console.log(`\n${datasets.length} datasets, ${series.length} series → site/data/catalog.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
