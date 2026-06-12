<script lang="ts">
  import { slide } from 'svelte/transition'
  import type { Snippet } from 'svelte'

  let {
    title,
    source,
    open = $bindable(true),
    children,
  }: {
    title: string
    /** Source attribution, shown as a tooltip on the header. */
    source: string
    open?: boolean
    children: Snippet
  } = $props()
</script>

<section class="intel">
  <button
    class="head"
    aria-expanded={open}
    title={source}
    onclick={() => (open = !open)}
  >
    <span class="chev" class:open aria-hidden="true">▸</span>
    {title}
  </button>
  {#if open}
    <div transition:slide={{ duration: 160 }}>
      {@render children()}
    </div>
  {/if}
</section>

<style>
  .intel {
    margin-top: 0.8rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--border);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.1rem 0;
    border: none;
    background: none;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-dim);
    text-align: left;
    transition: color 0.15s ease;
  }
  .head:hover {
    color: var(--ink);
  }
  .chev {
    display: inline-block;
    font-size: 0.7rem;
    transition: transform 0.15s ease;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
</style>
