<script lang="ts">
  // One step (or one frame of a step): title, text, the frame timeline, legend,
  // chart and sources.
  import type { Lang, Lesson } from '@atlas/spec'
  import { pick } from '@atlas/spec'
  import type { LessonData } from '../core/loader'
  import type { Page } from '../core/pages'
  import { legendFor, reliefBandsIn } from '../core/legend'
  import { ui } from '../core/ui'
  import RichText from './RichText.svelte'
  import Legend from './Legend.svelte'
  import BarChart from './BarChart.svelte'
  import Cites from './Cites.svelte'

  let {
    lesson,
    data,
    page,
    lang,
    onframe,
    onsources,
  }: {
    lesson: Lesson
    data: LessonData
    page: Extract<Page, { kind: 'step' }>
    lang: Lang
    /** Jump to another frame of this step (absent in print). */
    onframe?: (frameIndex: number) => void
    onsources?: () => void
  } = $props()

  const t = $derived(ui(lang))
  const step = $derived(page.step)
  const legend = $derived(legendFor(page.scene, data, lang))
  const relief = $derived(page.scene.basemap === 'physical' ? reliefBandsIn(data.relief, page.scene.view) : [])
</script>

<h2>{pick(step.title, lang)}</h2>
<div class="prose">
  <RichText text={pick(step.text, lang)} />
</div>

{#if step.frames && page.frame}
  {#if onframe}
    <ol class="timeline" aria-label={t.timeline}>
      {#each step.frames as f, i (i)}
        <li>
          <button
            class:current={i === page.frameIndex}
            class:past={i < (page.frameIndex ?? 0)}
            aria-current={i === page.frameIndex ? 'step' : undefined}
            onclick={() => onframe(i)}>{pick(f.label, lang)}</button
          >
        </li>
      {/each}
    </ol>
  {/if}
  <section class="frame">
    <h3>{pick(page.frame.label, lang)}</h3>
    <RichText text={pick(page.frame.text, lang)} />
  </section>
{/if}

<Legend items={legend} {relief} {lang} />

{#if step.chart}
  <BarChart chart={step.chart} {data} scene={page.scene} {lang} />
{/if}

<Cites {lesson} keys={[...step.cite, ...(page.frame?.cite ?? [])]} {lang} {onsources} />

<style>
  h2 {
    margin: 0.2rem 0 0.75rem;
    font-size: var(--step-3);
    line-height: 1.12;
    font-weight: 800;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  .prose :global(p),
  .frame :global(p) {
    margin: 0 0 0.85em;
    max-width: 38em;
  }
  .prose :global(strong),
  .frame :global(strong) {
    font-weight: 700;
  }

  /* Frame timeline: dates on a rule, the current one filled. */
  .timeline {
    list-style: none;
    display: flex;
    margin: 0.5rem 0 0;
    padding: 0;
    position: relative;
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: 0.5rem;
    right: 0.5rem;
    top: 50%;
    border-top: 2px solid var(--rule);
  }
  .timeline li {
    flex: 1;
    display: flex;
    justify-content: center;
    position: relative;
  }
  .timeline li:first-child {
    justify-content: flex-start;
  }
  .timeline li:last-child {
    justify-content: flex-end;
  }
  .timeline button {
    min-height: 2.25rem;
    padding: 0.2rem 0.7rem;
    border: 2px solid var(--waterline);
    border-radius: 999px;
    background: var(--panel);
    color: var(--ink);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .timeline button.past {
    border-color: var(--accent);
    color: var(--accent);
  }
  .timeline button.current {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }

  .frame {
    margin-top: 0.9rem;
    padding: 0.8rem 1rem 0.1rem;
    border-left: 4px solid var(--accent);
    background: color-mix(in srgb, var(--sea) 45%, var(--panel));
    border-radius: 0 6px 6px 0;
  }
  .frame h3 {
    margin: 0 0 0.3rem;
    font-size: var(--step-1);
    font-variant-numeric: tabular-nums;
  }
</style>
