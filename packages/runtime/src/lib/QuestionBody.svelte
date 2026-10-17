<script lang="ts">
  // One quiz question. Choices are buttons; "find it on the map" questions are
  // answered by tapping the map. Either way, the answer is final and followed
  // by an explanation, right or wrong.
  import type { Lang, Lesson } from '@atlas/spec'
  import { pick } from '@atlas/spec'
  import type { LessonData } from '../core/loader'
  import type { Page } from '../core/pages'
  import { isRight, type Answer } from '../core/quiz'
  import { legendFor } from '../core/legend'
  import { ui } from '../core/ui'
  import RichText from './RichText.svelte'
  import Legend from './Legend.svelte'
  import Cites from './Cites.svelte'

  let {
    lesson,
    data,
    page,
    lang,
    answer,
    onanswer,
    onsources,
  }: {
    lesson: Lesson
    data: LessonData
    page: Extract<Page, { kind: 'question' }>
    lang: Lang
    answer: Answer | null
    onanswer: (a: Answer) => void
    onsources?: () => void
  } = $props()

  const t = $derived(ui(lang))
  const q = $derived(page.question)
  const n = $derived(lesson.quiz.length)
  const answered = $derived(answer !== null)
  const right = $derived(answered && isRight(q, answer!))

  const nameOf = (id: string) => {
    if (q.type !== 'locate') return id
    const f = data.handles.get(q.data)?.get(id)
    return f ? (lang === 'en' ? f.properties.name_en : f.properties.name_it) : id
  }
  const rightText = $derived(q.type === 'choice' ? pick(q.choices[q.answer], lang) : nameOf(q.answer))
  const chosenText = $derived(
    answer === null ? '' : q.type === 'choice' ? pick(q.choices[answer as number], lang) : nameOf(answer as string),
  )
</script>

<p class="count">{t.questionOf(page.questionIndex + 1, n)}</p>
<h2>{pick(q.q, lang)}</h2>

{#if q.type === 'choice'}
  <ol class="choices">
    {#each q.choices as c, i (i)}
      <li>
        <button
          disabled={answered}
          class:right={answered && i === q.answer}
          class:wrong={answered && i === answer && i !== q.answer}
          aria-pressed={answer === i}
          onclick={() => onanswer(i)}
        >
          <span class="letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span>{pick(c, lang)}
        </button>
      </li>
    {/each}
  </ol>
  <Legend items={legendFor(page.scene, data, lang)} {lang} />
{:else if !answered}
  <p class="hint">{t.tapOnMap}</p>
{/if}

{#if answered}
  <section class="feedback" class:right aria-live="polite">
    <p class="verdict">{right ? t.right : t.wrong}</p>
    {#if !right}
      <p>{t.youChose(chosenText)} {t.rightAnswerWas(rightText)}</p>
    {/if}
    <RichText text={pick(q.explain, lang)} />
  </section>
  <Cites {lesson} keys={q.cite} {lang} {onsources} />
{/if}

<style>
  .count {
    margin: 0;
    font-size: 0.875rem;
    color: var(--ink-soft);
  }
  h2 {
    margin: 0.2rem 0 0.9rem;
    font-size: var(--step-2);
    line-height: 1.2;
    font-weight: 800;
    text-wrap: balance;
  }
  .choices {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .choices button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 3rem;
    padding: 0.5rem 0.8rem;
    border: 2px solid var(--rule);
    border-radius: 8px;
    background: var(--panel);
    text-align: left;
    cursor: pointer;
  }
  .choices button:not(:disabled):hover {
    border-color: var(--accent);
  }
  .choices button:disabled {
    cursor: default;
    color: var(--ink-soft);
  }
  .letter {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 50%;
    background: var(--rule);
    color: var(--ink);
    font-weight: 800;
  }
  .choices button.right {
    border-color: var(--sw-green);
    color: var(--ink);
  }
  .choices button.right .letter {
    background: var(--sw-green);
    color: #fff;
  }
  .choices button.wrong {
    border-color: var(--sw-vermillion);
    color: var(--ink);
  }
  .choices button.wrong .letter {
    background: var(--sw-vermillion);
    color: #fff;
  }
  .hint {
    padding: 0.7rem 0.9rem;
    border: 2px dashed var(--waterline);
    border-radius: 8px;
    color: var(--ink-soft);
  }
  .feedback {
    margin-top: 1rem;
    padding: 0.8rem 1rem 0.1rem;
    border-left: 4px solid var(--sw-vermillion);
    background: color-mix(in srgb, var(--sw-vermillion) 8%, var(--panel));
    border-radius: 0 6px 6px 0;
  }
  .feedback.right {
    border-left-color: var(--sw-green);
    background: color-mix(in srgb, var(--sw-green) 9%, var(--panel));
  }
  .feedback :global(p) {
    margin: 0 0 0.75em;
  }
  .verdict {
    font-weight: 800;
    font-size: var(--step-1);
  }
</style>
