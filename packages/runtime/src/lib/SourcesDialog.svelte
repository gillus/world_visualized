<script lang="ts">
  // The "Fonti e note" dialog.
  import type { Dataset, Lang, Lesson, SeriesDataset } from '@atlas/spec'
  import { ui } from '../core/ui'
  import SourcesList from './SourcesList.svelte'

  let {
    lesson,
    datasets,
    lang,
    open = $bindable(false),
  }: { lesson: Lesson; datasets: (Dataset | SeriesDataset)[]; lang: Lang; open: boolean } = $props()

  const t = $derived(ui(lang))
  let dialog: HTMLDialogElement

  $effect(() => {
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  })
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="sources-title">
  <div class="head">
    <h2 id="sources-title">{t.allSources}</h2>
    <button onclick={() => (open = false)}>{t.close}</button>
  </div>

  <SourcesList {lesson} {datasets} {lang} />
</dialog>

<style>
  dialog {
    width: min(40rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: 1.25rem 1.5rem 1.5rem;
    border: 0;
    border-radius: 8px;
    color: var(--ink);
    box-shadow: 0 10px 40px rgba(22, 38, 61, 0.3);
  }
  dialog::backdrop {
    background: rgba(22, 38, 61, 0.35);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }
  h2 {
    margin: 0;
    font-size: var(--step-2);
  }
  .head button {
    border: 2px solid var(--accent);
    border-radius: 6px;
    background: none;
    color: var(--accent);
    font-weight: 700;
    padding: 0.3rem 0.9rem;
    cursor: pointer;
  }
</style>
