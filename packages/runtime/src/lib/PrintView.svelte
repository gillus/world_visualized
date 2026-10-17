<script lang="ts">
  // The printable lesson: every step (and every frame) as a still map with its
  // text, then the quiz as a worksheet, the answers, and the sources.
  import type { Lang, Lesson } from '@atlas/spec'
  import { pick } from '@atlas/spec'
  import type { LessonData } from '../core/loader'
  import type { Page } from '../core/pages'
  import { legendFor, reliefBandsIn } from '../core/legend'
  import { writeUrl } from '../core/url'
  import { ui } from '../core/ui'
  import MapView from './MapView.svelte'
  import RichText from './RichText.svelte'
  import Legend from './Legend.svelte'
  import BarChart from './BarChart.svelte'
  import Cites from './Cites.svelte'
  import SourcesList from './SourcesList.svelte'

  let { lesson, data, pages, lang }: { lesson: Lesson; data: LessonData; pages: Page[]; lang: Lang } = $props()

  const t = $derived(ui(lang))
  const stepPages = $derived(pages.filter((p): p is Extract<Page, { kind: 'step' }> => p.kind === 'step'))
  const questions = $derived(pages.filter((p): p is Extract<Page, { kind: 'question' }> => p.kind === 'question'))
  const letter = (i: number) => String.fromCharCode(65 + i)

  function lettersFor(page: Extract<Page, { kind: 'question' }>): Map<string, string> | null {
    const q = page.question
    return q.type === 'locate' ? new Map(q.ids.map((id, i) => [id, letter(i)])) : null
  }

  function answerText(page: Extract<Page, { kind: 'question' }>): string {
    const q = page.question
    if (q.type === 'choice') return `${letter(q.answer)} — ${pick(q.choices[q.answer], lang)}`
    const f = data.handles.get(q.data)?.get(q.answer)
    const name = f ? (lang === 'en' ? f.properties.name_en : f.properties.name_it) : q.answer
    return `${letter(q.ids.indexOf(q.answer))} — ${name}`
  }
</script>

<div class="print">
  <div class="toolbar">
    <a href={writeUrl({ lesson: lesson.id, lang })}>{t.backToLesson}</a>
    <button onclick={() => window.print()}>{t.printNow}</button>
  </div>

  <header class="cover">
    <p class="meta">{t.subject[lesson.subject]} · {t.level[lesson.level]}</p>
    <h1>{pick(lesson.title, lang)}</h1>
    {#if lesson.subtitle}<p class="subtitle">{pick(lesson.subtitle, lang)}</p>{/if}
  </header>

  {#each stepPages as page (`${page.stepIndex}-${page.frameIndex}`)}
    {@const first = (page.frameIndex ?? 0) === 0}
    <article class="sheet">
      <h2>
        <span class="num">{page.stepIndex + 1}</span>
        {pick(page.step.title, lang)}{#if page.frame}<span class="frame-label"> — {pick(page.frame.label, lang)}</span>{/if}
      </h2>
      <div class="map">
        <MapView {lesson} {data} scene={page.scene} {lang} label={t.mapLabel(pick(page.step.title, lang))} still />
      </div>
      <div class="text">
        {#if first}<RichText text={pick(page.step.text, lang)} />{/if}
        {#if page.frame}
          <div class="frame"><RichText text={pick(page.frame.text, lang)} /></div>
        {/if}
        <Legend
          items={legendFor(page.scene, data, lang)}
          relief={page.scene.basemap === 'physical' ? reliefBandsIn(data.relief, page.scene.view) : []}
          {lang}
        />
        {#if page.step.chart && first}<BarChart chart={page.step.chart} {data} scene={page.scene} {lang} />{/if}
        <Cites {lesson} keys={[...(first ? page.step.cite : []), ...(page.frame?.cite ?? [])]} {lang} />
      </div>
    </article>
  {/each}

  {#if questions.length}
    <section class="quiz">
      <h2 class="section">{t.quiz}</h2>
      {#each questions as page (page.questionIndex)}
        {@const q = page.question}
        <article class="question">
          <h3><span class="num">{page.questionIndex + 1}</span> {pick(q.q, lang)}</h3>
          {#if q.type === 'choice'}
            <ol class="choices">
              {#each q.choices as c, i (i)}<li><span class="box">{letter(i)}</span> {pick(c, lang)}</li>{/each}
            </ol>
            {#if q.layers.length}
              <div class="map small">
                <MapView {lesson} {data} scene={page.scene} {lang} label={t.mapLabel(pick(q.q, lang))} still />
              </div>
            {/if}
          {:else}
            <p class="hint">{t.chooseLetter} ______</p>
            <div class="map small">
              <MapView {lesson} {data} scene={page.scene} {lang} label={t.mapLabel(pick(q.q, lang))} still letters={lettersFor(page)} />
            </div>
          {/if}
        </article>
      {/each}
    </section>

    <section class="answers">
      <h2 class="section">{t.answers}</h2>
      <ol>
        {#each questions as page (page.questionIndex)}
          <li><strong>{answerText(page)}.</strong> <RichText text={pick(page.question.explain, lang)} /></li>
        {/each}
      </ol>
    </section>
  {/if}

  <section class="sources">
    <h2 class="section">{t.allSources}</h2>
    <SourcesList {lesson} datasets={data.datasets} {lang} />
  </section>
</div>

<style>
  /* The sheet is as wide as A4 minus the @page margins on screen too, so the
     maps are drawn once at their printed size. */
  .print {
    max-width: calc(182mm + 2.5rem);
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
    background: var(--panel);
    min-height: 100%;
  }
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  .toolbar button {
    min-height: 2.5rem;
    padding: 0.4rem 1rem;
    border: 2px solid var(--accent);
    border-radius: 6px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    cursor: pointer;
  }
  .cover {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 3px solid var(--ink);
  }
  .meta {
    margin: 0;
    color: var(--ink-soft);
  }
  h1 {
    margin: 0.2rem 0 0;
    font-size: 2.4rem;
    line-height: 1.1;
    font-weight: 800;
  }
  .subtitle {
    margin: 0.2rem 0 0;
    font-size: var(--step-1);
    color: var(--ink-soft);
  }
  /* Map left in a portrait frame (the shape of most countries a lesson zooms
     to), words right: short steps fit two to a printed page. */
  .sheet {
    display: grid;
    grid-template-columns: 88mm 1fr;
    column-gap: 6mm;
    align-items: start;
    padding: 1.25rem 0;
    border-bottom: 1px solid var(--rule);
    break-inside: avoid;
  }
  .sheet h2 {
    grid-column: 1 / -1;
  }
  h2 {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin: 0 0 0.75rem;
    font-size: var(--step-2);
    line-height: 1.2;
  }
  .num {
    flex: none;
    display: inline-grid;
    place-items: center;
    min-width: 1.9rem;
    height: 1.9rem;
    border-radius: 50%;
    background: var(--ink);
    color: var(--panel);
    font-size: 1rem;
    font-weight: 800;
  }
  .frame-label {
    color: var(--accent);
  }
  .map {
    height: 110mm;
    border: 1px solid var(--rule);
  }
  .map.small {
    height: 80mm;
    margin-top: 0.75rem;
  }
  .text {
    font-size: 0.9rem;
  }
  .text > :global(:first-child) {
    margin-top: 0;
  }
  @media screen and (max-width: 700px) {
    .sheet {
      grid-template-columns: 1fr;
    }
    .text {
      margin-top: 0.9rem;
    }
  }
  .text :global(p) {
    margin: 0 0 0.75em;
  }
  .frame {
    padding-left: 0.9rem;
    border-left: 4px solid var(--accent);
  }
  .section {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 3px solid var(--ink);
  }
  .question {
    padding: 0.9rem 0;
    border-bottom: 1px solid var(--rule);
    break-inside: avoid;
  }
  h3 {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin: 0 0 0.5rem;
    font-size: var(--step-1);
  }
  .choices {
    list-style: none;
    margin: 0;
    padding: 0 0 0 2.5rem;
    display: grid;
    gap: 0.35rem;
  }
  .box {
    display: inline-grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    margin-right: 0.4rem;
    border: 2px solid var(--ink);
    border-radius: 4px;
    font-weight: 800;
  }
  .hint {
    margin: 0 0 0 2.5rem;
  }
  .answers ol {
    padding-left: 1.4rem;
  }
  .answers li {
    margin: 0.5rem 0;
  }
  .answers li :global(p) {
    display: inline;
    margin: 0;
  }

  @media print {
    .toolbar {
      display: none;
    }
    .print {
      max-width: none;
      padding: 0;
    }
    /* The quiz is a worksheet of its own; the answers follow on a fresh page. */
    .quiz,
    .answers {
      break-before: page;
    }
    .quiz .section {
      margin-top: 0;
    }
    /* Keep a step on one page: sources as one compact run. */
    .text :global(.cites ul) {
      display: flex;
      flex-wrap: wrap;
      gap: 0 1.2em;
      font-size: 0.75rem;
    }
    .text :global(.chart) {
      break-inside: avoid;
    }
  }
</style>
