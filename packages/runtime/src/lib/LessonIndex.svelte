<script lang="ts">
  // Home page: the collection, grouped by subject.
  import { onMount } from 'svelte'
  import type { Lang } from '@atlas/spec'
  import { pick, SUBJECTS } from '@atlas/spec'
  import { loadLessonIndex, LoadError, type LessonSummary } from '../core/loader'
  import { ui } from '../core/ui'
  import ErrorPanel from './ErrorPanel.svelte'

  let { lang }: { lang: Lang } = $props()
  const t = $derived(ui(lang))

  let lessons = $state<LessonSummary[] | null>(null)
  let error = $state<LoadError | null>(null)

  onMount(async () => {
    try {
      lessons = await loadLessonIndex()
    } catch (err) {
      error = err instanceof LoadError ? err : new LoadError(String(err))
    }
  })

  const bySubject = $derived(
    SUBJECTS.map((s) => ({ subject: s, items: (lessons ?? []).filter((l) => l.subject === s) })).filter((g) => g.items.length),
  )
</script>

{#if error}
  <ErrorPanel {error} {lang} />
{:else}
  <main class="index">
    <header>
      <h1>{t.siteTitle}</h1>
      <p>{t.siteIntro}</p>
    </header>

    {#if lessons && !lessons.length}
      <p>{t.noLessons}</p>
    {/if}

    {#each bySubject as group (group.subject)}
      <section>
        <h2>{t.subject[group.subject]}</h2>
        <ul>
          {#each group.items as l (l.id)}
            <li>
              <a href="?lesson={l.id}">
                <span class="title">{pick(l.title, lang)}</span>
                {#if l.subtitle}<span class="sub">{pick(l.subtitle, lang)}</span>{/if}
                <span class="meta">{t.level[l.level]}, {t.steps(l.steps)}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </main>
{/if}

<style>
  .index {
    min-height: 100dvh;
    max-width: 46rem;
    margin: 0 auto;
    padding: 3.5rem 1.5rem 4rem;
  }
  header h1 {
    margin: 0;
    font-size: var(--step-3);
    line-height: 1.1;
    font-weight: 800;
  }
  header p {
    margin: 0.5rem 0 2.5rem;
    color: var(--ink-soft);
    max-width: 32em;
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: var(--step-1);
  }
  ul {
    list-style: none;
    margin: 0 0 2rem;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }
  a {
    display: grid;
    gap: 0.1rem;
    padding: 1rem 1.25rem;
    background: var(--panel);
    border-radius: 6px;
    border-left: 5px solid var(--accent);
    color: var(--ink);
    text-decoration: none;
  }
  a:hover .title {
    text-decoration: underline;
  }
  .title {
    font-size: var(--step-1);
    font-weight: 700;
    color: var(--accent);
  }
  .sub {
    color: var(--ink);
  }
  .meta {
    font-size: 0.875rem;
    color: var(--ink-soft);
  }
</style>
