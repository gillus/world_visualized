<script lang="ts">
  // A bar chart from a series, beside the map. If the scene colours the same
  // series as a choropleth, the bars use the map's colours so the two read as one.
  import type { Chart, Lang } from '@atlas/spec'
  import { pick, valueAtOrBefore } from '@atlas/spec'
  import type { LessonData } from '../core/loader'
  import type { Scene } from '../core/pages'
  import { choroplethValues } from '../core/classify'
  import { formatNumber } from '../core/format'

  let { chart, data, scene, lang }: { chart: Chart; data: LessonData; scene: Scene; lang: Lang } = $props()

  const series = $derived(data.series.get(chart.data))
  const features = $derived(data.handles.get(chart.data))

  const rows = $derived.by(() => {
    if (!series || !features) return []
    const choropleth = scene.layers.find((l) => l.type === 'choropleth' && l.data === chart.data)
    const classes =
      choropleth?.type === 'choropleth' ? choroplethValues(choropleth, series, features.keys()).classes : null
    const out = [...features].map(([id, f]) => {
      const hit = valueAtOrBefore(series.file.values[id], chart.year)
      return {
        id,
        name: lang === 'en' ? f.properties.name_en : f.properties.name_it,
        value: hit?.[0] ?? null,
        year: hit?.[1] ?? null,
        color: classes ? classes.colorOf(hit?.[0] ?? null) : 'var(--accent)',
      }
    })
    if (chart.sort !== 'none') out.sort((a, b) => ((a.value ?? -Infinity) - (b.value ?? -Infinity)) * (chart.sort === 'asc' ? 1 : -1))
    return out
  })

  const reference = $derived.by(() => {
    if (!chart.reference || !series) return null
    const [key, agg] = Object.entries(series.file.aggregates)[0] ?? []
    const hit = agg && valueAtOrBefore(agg.values, chart.year)
    return hit && key ? { name: lang === 'en' ? agg.name_en : agg.name_it, value: hit[0] } : null
  })

  const max = $derived(Math.max(...rows.map((r) => r.value ?? 0), reference?.value ?? 0))
  const years = $derived([...new Set(rows.map((r) => r.year).filter((y) => y !== null))].join('/'))
  const fmt = (v: number) => formatNumber(v, lang, series?.meta.decimals ?? 0)
</script>

{#if series && rows.length}
  <figure class="chart">
    <figcaption>
      <strong>{pick(chart.title, lang)}</strong>
      <span>{pick(series.meta.unit, lang)}, {years}</span>
    </figcaption>
    <div class="rows" class:has-ref={reference} style="--ref: {reference ? (reference.value / max) * 100 : 0}%">
      {#each rows as r (r.id)}
        <div class="name">{r.name}</div>
        <div class="track">
          {#if r.value !== null}
            <div class="bar" style="width: {(r.value / max) * 100}%; --c: {r.color}"></div>
          {/if}
        </div>
        <div class="value">{r.value === null ? '—' : fmt(r.value)}</div>
      {/each}
    </div>
    {#if reference}
      <p class="ref-note"><span class="ref-key" aria-hidden="true"></span>{reference.name}: {fmt(reference.value)}</p>
    {/if}
  </figure>
{/if}

<style>
  .chart {
    margin: 1.25rem 0 0;
    padding-top: 0.9rem;
    border-top: 1px solid var(--rule);
  }
  figcaption {
    display: grid;
    margin-bottom: 0.6rem;
    line-height: 1.3;
  }
  figcaption span {
    font-size: 0.875rem;
    color: var(--ink-soft);
  }
  .rows {
    position: relative;
    display: grid;
    grid-template-columns: minmax(6.5rem, auto) 1fr auto;
    column-gap: 0.6rem;
    row-gap: 0.2rem;
    align-items: center;
    font-size: 0.875rem;
  }
  .name {
    line-height: 1.15;
  }
  .track {
    position: relative;
    height: 0.95rem;
  }
  .bar {
    height: 100%;
    background: var(--c);
    border-radius: 0 2px 2px 0;
    box-shadow: inset 0 0 0 1px rgba(22, 38, 61, 0.12);
  }
  .value {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  /* The reference line: one dashed segment per row, overlapping the row gaps
     so they read as a single line. */
  .has-ref .track::after {
    content: '';
    position: absolute;
    left: var(--ref);
    top: -0.15rem;
    bottom: -0.15rem;
    border-left: 2px dashed var(--ink);
  }
  .ref-note {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
    color: var(--ink-soft);
  }
  .ref-key {
    width: 0;
    height: 1rem;
    border-left: 2px dashed var(--ink);
  }
</style>
