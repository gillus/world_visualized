// Builds the validator's CheckContext from the baked site data, wherever it
// lives: the local site/data/ (check-lessons) or the published site (the MCP
// Worker). `readJson` takes a path relative to data/.

import { Catalog, DatasetIndex, SeriesFile } from './catalog'
import type { CheckContext } from './check'

export async function loadCheckContext(readJson: (path: string) => Promise<unknown>): Promise<CheckContext & { catalog: Catalog }> {
  const catalog = Catalog.parse(await readJson('catalog.json'))
  const [idSets, yearSets] = await Promise.all([
    Promise.all(
      catalog.datasets.map(async (ds) => {
        const index = DatasetIndex.parse(await readJson(ds.index))
        return [ds.id, new Set(index.map((e) => e.id))] as const
      }),
    ),
    Promise.all(
      catalog.series.map(async (s) => {
        const file = SeriesFile.parse(await readJson(s.path))
        const years = new Set<number>()
        for (const byYear of Object.values(file.values)) {
          for (const [y, v] of Object.entries(byYear)) if (v !== null) years.add(Number(y))
        }
        return [s.id, years] as const
      }),
    ),
  ])
  const ids = new Map(idSets)
  const years = new Map(yearSets)
  return { catalog, ids: (id) => ids.get(id), years: (id) => years.get(id) }
}
