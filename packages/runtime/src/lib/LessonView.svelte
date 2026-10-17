<script lang="ts">
  import { onMount } from 'svelte'
  import type { Lang, Lesson } from '@atlas/spec'
  import { pick } from '@atlas/spec'
  import { loadCatalog, loadLesson, loadLessonData, LoadError, type LessonData } from '../core/loader'
  import { lessonPages, pageIndexOf, positionOf, type Page, type Position } from '../core/pages'
  import type { Answer } from '../core/quiz'
  import { writeUrl, type LessonLink } from '../core/url'
  import { ui } from '../core/ui'
  import MapView from './MapView.svelte'
  import LessonPanel from './LessonPanel.svelte'
  import PrintView from './PrintView.svelte'
  import SourcesDialog from './SourcesDialog.svelte'
  import ErrorPanel from './ErrorPanel.svelte'

  let { link, initial, lang, print = false }: { link: LessonLink; initial: Position; lang: Lang; print?: boolean } = $props()

  let lesson = $state<Lesson | null>(null)
  let data = $state<LessonData | null>(null)
  let pages = $state<Page[]>([])
  let error = $state<LoadError | null>(null)
  let index = $state(0)
  let answers = $state<(Answer | null)[]>([])
  let sourcesOpen = $state(false)

  const t = $derived(ui(lang))
  const page = $derived(pages[index])

  onMount(async () => {
    try {
      const [l, catalog] = await Promise.all([loadLesson(link), loadCatalog()])
      pages = lessonPages(l)
      index = pageIndexOf(pages, initial)
      answers = l.quiz.map(() => null)
      data = await loadLessonData(l, catalog)
      lesson = l
      document.title = `${link.draft ? `${t.draft} · ` : ''}${pick(l.title, lang)} · ${t.siteTitle}`
    } catch (err) {
      error = err instanceof LoadError ? err : new LoadError(String(err))
    }
  })

  function go(i: number) {
    if (!lesson || i < 0 || i >= pages.length) return
    index = i
    history.replaceState(null, '', writeUrl({ ...link, lang, ...positionOf(pages, index) }))
  }

  function answer(questionIndex: number, a: Answer) {
    if (answers[questionIndex] === null) answers[questionIndex] = a
  }

  function retry() {
    answers = answers.map(() => null)
    go(pages.findIndex((p) => p.kind === 'question'))
  }

  const printHref = $derived(writeUrl({ ...link, lang, print: true }))

  function onkeydown(e: KeyboardEvent) {
    if (print || sourcesOpen || e.altKey || e.ctrlKey || e.metaKey) return
    if ((e.target as HTMLElement).closest('input, textarea, select')) return
    const waiting = page?.kind === 'question' && answers[page.questionIndex] === null
    if (e.key === 'ArrowRight' && !waiting) go(index + 1)
    else if (e.key === 'ArrowLeft') go(index - 1)
  }

  const mapLabel = $derived.by(() => {
    if (!lesson || !page) return ''
    if (page.kind === 'step') return t.mapLabel(pick(page.step.title, lang))
    if (page.kind === 'question') return t.mapLabel(pick(page.question.q, lang))
    return t.mapLabel(pick(lesson.title, lang))
  })
</script>

<svelte:window {onkeydown} />

{#if error}
  <ErrorPanel {error} {lang} />
{:else if lesson && data && print}
  <PrintView {lesson} {data} {pages} {lang} {link} />
{:else if lesson && data && page}
  <main class="lesson">
    <div class="map-area">
      <MapView
        {lesson}
        {data}
        scene={page.scene}
        {lang}
        label={mapLabel}
        picked={page.kind === 'question' ? (answers[page.questionIndex] as string | null) : null}
        revealed={page.kind === 'question' && answers[page.questionIndex] !== null}
        onpick={page.kind === 'question' && page.question.type === 'locate' ? (id) => answer(page.questionIndex, id) : undefined}
      />
    </div>
    <LessonPanel
      {lesson}
      {data}
      {pages}
      {index}
      {lang}
      {answers}
      {printHref}
      draft={link.draft !== undefined}
      onnav={go}
      onanswer={answer}
      onretry={retry}
      onsources={() => (sourcesOpen = true)}
    />
  </main>
  <SourcesDialog {lesson} datasets={data.datasets} {lang} bind:open={sourcesOpen} />
{:else}
  <p class="loading" role="status">{t.loading}</p>
{/if}

<style>
  .lesson {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 25rem;
    height: 100dvh;
  }
  .map-area {
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--rule);
  }
  .loading {
    display: grid;
    place-items: center;
    height: 100dvh;
    margin: 0;
    color: var(--ink-soft);
  }

  @media (max-width: 860px) {
    .lesson {
      grid-template-columns: 1fr;
      grid-template-rows: 48dvh minmax(0, 1fr);
    }
    .map-area {
      border-right: 0;
      border-bottom: 1px solid var(--rule);
    }
  }
</style>
