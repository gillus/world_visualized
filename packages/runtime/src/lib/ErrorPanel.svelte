<script lang="ts">
  import type { Lang } from '@atlas/spec'
  import type { LoadError } from '../core/loader'
  import { ui } from '../core/ui'

  let { error, lang }: { error: LoadError; lang: Lang } = $props()
  const t = $derived(ui(lang))
</script>

<main class="error">
  <h1>{error.message}</h1>
  {#if error.details.length}
    <ul>
      {#each error.details as d, i (i)}<li><code>{d}</code></li>{/each}
    </ul>
  {/if}
  <a href="./">{t.allLessons}</a>
</main>

<style>
  .error {
    max-width: 40rem;
    margin: 0 auto;
    padding: 3rem 1.5rem;
  }
  h1 {
    font-size: var(--step-2);
    line-height: 1.2;
  }
  ul {
    padding-left: 1.2rem;
    color: var(--ink-soft);
    font-size: 0.9rem;
  }
</style>
