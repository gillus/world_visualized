<script lang="ts">
  // The end of the quiz: the score, what to go over again, and a way to retry.
  import type { Lang, Lesson } from '@atlas/spec'
  import { pick } from '@atlas/spec'
  import { isRight, scoreOf, type Answer } from '../core/quiz'
  import { ui } from '../core/ui'

  let {
    lesson,
    lang,
    answers,
    onquestion,
    onretry,
    printHref,
  }: {
    lesson: Lesson
    lang: Lang
    answers: (Answer | null)[]
    onquestion: (i: number) => void
    onretry: () => void
    printHref: string
  } = $props()

  const t = $derived(ui(lang))
  const n = $derived(lesson.quiz.length)
  const score = $derived(scoreOf(lesson.quiz, answers))
</script>

<h2>{t.scoreTitle}</h2>
<p class="score"><strong>{score}</strong><span>/{n}</span></p>
<p class="summary">{t.score(score, n)} {t.scoreNote(score, n)}</p>

<ol class="review">
  {#each lesson.quiz as q, i (i)}
    {@const a = answers[i]}
    {@const ok = a !== null && a !== undefined && isRight(q, a)}
    <li class:ok>
      <span class="mark" aria-label={ok ? t.right : t.wrong}>{ok ? '✓' : '✗'}</span>
      <button class="link" onclick={() => onquestion(i)}>{pick(q.q, lang)}</button>
    </li>
  {/each}
</ol>

<div class="actions">
  <button class="btn" onclick={onretry}>{t.retry}</button>
  <a class="btn quiet" href={printHref}>{t.printVersion}</a>
</div>

<style>
  h2 {
    margin: 0.2rem 0 0.5rem;
    font-size: var(--step-3);
    font-weight: 800;
  }
  .score {
    margin: 0;
    font-size: 3.5rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .score strong {
    font-weight: 800;
    color: var(--accent);
  }
  .score span {
    color: var(--ink-soft);
    font-size: 2rem;
  }
  .summary {
    margin: 0.75rem 0 1rem;
  }
  .review {
    list-style: none;
    margin: 0;
    padding: 0.9rem 0 0;
    border-top: 1px solid var(--rule);
    display: grid;
    gap: 0.45rem;
  }
  .review li {
    display: flex;
    gap: 0.6rem;
    align-items: baseline;
    line-height: 1.35;
  }
  .mark {
    flex: none;
    width: 1.3rem;
    font-weight: 800;
    color: var(--sw-vermillion);
  }
  .ok .mark {
    color: var(--sw-green);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    text-align: left;
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 0.2em;
    cursor: pointer;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-top: 1.25rem;
  }
  .btn {
    min-height: 2.75rem;
    padding: 0.5rem 1.1rem;
    border: 2px solid var(--accent);
    border-radius: 6px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  .btn.quiet {
    background: var(--panel);
    color: var(--accent);
  }
</style>
