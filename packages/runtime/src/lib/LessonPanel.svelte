<script lang="ts">
  // The teacher beside the map: where you are in the lesson, what to notice,
  // what the colours mean, where the facts come from — and the quiz.
  import type { Lang, Lesson } from '@atlas/spec'
  import { pick } from '@atlas/spec'
  import type { LessonData } from '../core/loader'
  import type { Page } from '../core/pages'
  import type { Answer } from '../core/quiz'
  import { ui } from '../core/ui'
  import StepBody from './StepBody.svelte'
  import QuestionBody from './QuestionBody.svelte'
  import ScoreBody from './ScoreBody.svelte'

  let {
    lesson,
    data,
    pages,
    index,
    lang,
    answers,
    printHref,
    onnav,
    onanswer,
    onretry,
    onsources,
  }: {
    lesson: Lesson
    data: LessonData
    pages: Page[]
    index: number
    lang: Lang
    answers: (Answer | null)[]
    printHref: string
    onnav: (pageIndex: number) => void
    onanswer: (questionIndex: number, a: Answer) => void
    onretry: () => void
    onsources: () => void
  } = $props()

  const t = $derived(ui(lang))
  const page = $derived(pages[index])
  const next = $derived(pages[index + 1])
  const nSteps = $derived(lesson.steps.length)
  const hasQuiz = $derived(lesson.quiz.length > 0)

  /** Progress segments: one per step, plus one for the quiz. */
  const segment = $derived(page.kind === 'step' ? page.stepIndex : nSteps)
  const firstPageOf = (seg: number) =>
    pages.findIndex((p) => (seg < nSteps ? p.kind === 'step' && p.stepIndex === seg : p.kind === 'question'))

  const waitingForAnswer = $derived(page.kind === 'question' && (answers[page.questionIndex] ?? null) === null)

  // A new page starts at its title, whichever element scrolls (body on
  // desktop, the whole panel on phones).
  let panel: HTMLElement
  let body: HTMLElement
  $effect(() => {
    void index
    body?.scrollTo({ top: 0 })
    panel?.scrollTo({ top: 0 })
  })
</script>

<aside class="panel" bind:this={panel}>
  <header>
    <div class="links">
      <a href="./">{t.allLessons}</a>
      <a href={printHref}>{t.print}</a>
    </div>
    <h1>{pick(lesson.title, lang)}</h1>
    {#if lesson.subtitle}<p class="subtitle">{pick(lesson.subtitle, lang)}</p>{/if}

    <nav class="progress" aria-label={page.kind === 'step' ? t.stepOf(page.stepIndex + 1, nSteps) : t.quiz}>
      {#each lesson.steps as s, i (s.id)}
        <button
          class:done={i < segment}
          class:current={i === segment}
          aria-current={i === segment ? 'step' : undefined}
          aria-label={t.goToStep(i + 1, pick(s.title, lang))}
          title={pick(s.title, lang)}
          onclick={() => onnav(firstPageOf(i))}
        ></button>
      {/each}
      {#if hasQuiz}
        <button
          class="quiz"
          class:current={segment === nSteps}
          aria-current={segment === nSteps ? 'step' : undefined}
          title={t.quiz}
          onclick={() => onnav(firstPageOf(nSteps))}>{t.quiz}</button
        >
      {/if}
    </nav>
  </header>

  <div class="body" bind:this={body}>
    {#if page.kind === 'step'}
      <p class="count">{t.stepOf(page.stepIndex + 1, nSteps)}</p>
      <StepBody
        {lesson}
        {data}
        {page}
        {lang}
        onframe={(f) => onnav(pages.findIndex((p) => p.kind === 'step' && p.stepIndex === page.stepIndex && p.frameIndex === f))}
        {onsources}
      />
    {:else if page.kind === 'question'}
      <QuestionBody
        {lesson}
        {data}
        {page}
        {lang}
        answer={answers[page.questionIndex] ?? null}
        onanswer={(a) => onanswer(page.questionIndex, a)}
        {onsources}
      />
    {:else}
      <ScoreBody
        {lesson}
        {lang}
        {answers}
        {printHref}
        onquestion={(i) => onnav(pages.findIndex((p) => p.kind === 'question' && p.questionIndex === i))}
        {onretry}
      />
    {/if}
  </div>

  <footer>
    <button class="nav" onclick={() => onnav(index - 1)} disabled={index === 0}>{t.back}</button>
    {#if !next || page.kind === 'score'}
      <a class="nav primary" href="./">{t.allLessons}</a>
    {:else}
      <button class="nav primary" onclick={() => onnav(index + 1)} disabled={waitingForAnswer}>
        {page.kind === 'step' && next.kind === 'question' ? t.startQuiz : t.next}
      </button>
    {/if}
  </footer>
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--panel);
    min-height: 0;
  }

  header {
    padding: 1.1rem 1.5rem 0.9rem;
    border-bottom: 1px solid var(--rule);
  }
  .links {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
  }
  .links a {
    color: var(--ink-soft);
  }
  h1 {
    margin: 0.35rem 0 0;
    font-size: var(--step-1);
    line-height: 1.2;
    font-weight: 700;
  }
  .subtitle {
    margin: 0.1rem 0 0;
    color: var(--ink-soft);
  }

  .progress {
    display: flex;
    gap: 4px;
    margin-top: 0.85rem;
    align-items: center;
  }
  .progress button {
    flex: 1;
    height: 22px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    position: relative;
  }
  .progress button::before {
    content: '';
    position: absolute;
    inset: 8px 0;
    border-radius: 3px;
    background: var(--rule);
    transition: background 0.2s ease;
  }
  .progress button.done::before {
    background: var(--waterline);
  }
  .progress button.current::before {
    background: var(--accent);
    inset: 6px 0;
  }
  .progress button.quiz {
    flex: none;
    height: 24px;
    margin-left: 4px;
    padding: 0 0.6rem;
    border: 2px solid var(--rule);
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1;
    color: var(--ink-soft);
  }
  .progress button.quiz::before {
    display: none;
  }
  .progress button.quiz.current {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-ink);
  }

  .body {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem 1.5rem 1.5rem;
    min-height: 0;
  }
  .count {
    margin: 0;
    font-size: 0.875rem;
    color: var(--ink-soft);
  }

  footer {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 1.5rem;
    border-top: 1px solid var(--rule);
    background: var(--panel);
  }
  .nav {
    min-width: 7.5rem;
    min-height: 2.75rem;
    padding: 0.5rem 1.1rem;
    border: 2px solid var(--accent);
    border-radius: 6px;
    background: var(--panel);
    color: var(--accent);
    font-weight: 700;
    cursor: pointer;
    text-align: center;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .nav.primary {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .nav:disabled {
    opacity: 0.35;
    cursor: default;
  }

  /* Phones: the map takes the top of the screen, so the header scrolls away
     with the text instead of eating the little room left; only the footer
     buttons stay put. */
  @media (max-width: 860px) {
    .panel {
      overflow-y: auto;
    }
    header {
      padding: 0.75rem 1.1rem 0.6rem;
    }
    .subtitle {
      display: none;
    }
    .body {
      flex: none;
      overflow: visible;
      padding: 1rem 1.1rem 1.25rem;
    }
    footer {
      position: sticky;
      bottom: 0;
      padding: 0.6rem 1.1rem;
    }
  }
</style>
