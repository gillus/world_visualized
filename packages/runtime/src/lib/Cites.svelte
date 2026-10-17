<script lang="ts">
  // "Fonti": where this page's claims come from, with a door to all sources.
  import type { Lang, Lesson } from '@atlas/spec'
  import { describeSource } from '../core/sources'
  import { ui } from '../core/ui'

  let { lesson, keys, lang, onsources }: { lesson: Lesson; keys: string[]; lang: Lang; onsources?: () => void } = $props()

  const t = $derived(ui(lang))
  const cites = $derived([...new Set(keys)].map((key) => describeSource(lesson.sources[key])))
</script>

<div class="cites">
  <h3>{t.sourcesOfStep}</h3>
  <ul>
    {#each cites as c (c.href)}
      <li><a href={c.href} target="_blank" rel="noopener">{c.label}</a> <span>{c.detail}</span></li>
    {/each}
  </ul>
  {#if onsources}<button class="link" onclick={onsources}>{t.allSources}</button>{/if}
</div>

<style>
  .cites {
    margin-top: 1.25rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--rule);
    font-size: 0.875rem;
    color: var(--ink-soft);
  }
  h3 {
    margin: 0 0 0.3rem;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--ink);
  }
  ul {
    margin: 0 0 0.5rem;
    padding: 0;
    list-style: none;
  }
  li {
    margin: 0.15rem 0;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;
    font-size: inherit;
  }
</style>
