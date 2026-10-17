<script lang="ts">
  // Everything a lesson stands on: the honest limits of what the map shows,
  // cited texts, and map data with their licences. Used by the sources dialog
  // and the printable version.
  import type { Dataset, Lang, Lesson, SeriesDataset } from '@atlas/spec'
  import { pick } from '@atlas/spec'
  import { describeSource } from '../core/sources'
  import { ui } from '../core/ui'

  let { lesson, datasets, lang }: { lesson: Lesson; datasets: (Dataset | SeriesDataset)[]; lang: Lang } = $props()

  const t = $derived(ui(lang))
</script>

{#if lesson.caveats.length}
  <h3>{t.caveats}</h3>
  <ul>
    {#each lesson.caveats as c, i (i)}<li>{pick(c, lang)}</li>{/each}
  </ul>
{/if}

<h3>{t.lessonSources}</h3>
<ul>
  {#each Object.values(lesson.sources).map(describeSource) as s (s.href)}
    <li>
      <a href={s.href} target="_blank" rel="noopener">{s.label}</a>, {s.detail}{#if s.licence}
        (<a href={s.licence.href} target="_blank" rel="noopener">{s.licence.name}</a>){/if}
    </li>
  {/each}
</ul>
<p class="note">{t.textLicence}</p>

<h3>{t.mapData}</h3>
<ul>
  {#each datasets as d (d.id)}
    <li>
      <a href={d.source.url} target="_blank" rel="noopener">{d.title}</a>:
      {d.source.attribution}
      (<a href={d.source.licenceUrl} target="_blank" rel="noopener">{d.source.licence}</a>)
    </li>
  {/each}
</ul>

<style>
  h3 {
    margin: 1.25rem 0 0.4rem;
    font-size: var(--step-0);
  }
  ul {
    margin: 0;
    padding-left: 1.2rem;
  }
  li {
    margin: 0.3rem 0;
  }
  .note {
    margin: 0.5rem 0 0;
    font-size: 0.875rem;
    color: var(--ink-soft);
  }
</style>
