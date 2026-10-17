<script lang="ts">
  import { paragraphs } from '../core/text'

  let { text }: { text: string } = $props()
  const paras = $derived(paragraphs(text))
</script>

{#each paras as spans, i (i)}
  <p>
    {#each spans as s, j (j)}{#if s.bold}<strong>{s.text}</strong>{:else if s.italic}<em>{s.text}</em>{:else}{s.text}{/if}{/each}
  </p>
{/each}
