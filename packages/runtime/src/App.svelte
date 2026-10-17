<script lang="ts">
  import { readUrl } from './core/url'
  import LessonView from './lib/LessonView.svelte'
  import LessonIndex from './lib/LessonIndex.svelte'

  const url = readUrl(location.search)
  const lang = url.lang ?? 'it'
  document.documentElement.lang = lang
</script>

{#if url.lesson || url.draft}
  <LessonView
    link={url.lesson ? { lesson: url.lesson } : { draft: url.draft! }}
    initial={{ step: url.step, frame: url.frame, quiz: url.quiz }}
    {lang}
    print={url.print}
  />
{:else}
  <LessonIndex {lang} />
{/if}
