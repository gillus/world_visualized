<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { loadAtlasData } from './core/data'
  import { createAtlas, type Atlas } from './core/atlas'
  import MapView from './lib/MapView.svelte'
  import Timeline from './lib/Timeline.svelte'
  import MetricSwitcher from './lib/MetricSwitcher.svelte'
  import Legend from './lib/Legend.svelte'
  import CountryPanel from './lib/CountryPanel.svelte'
  import CaveatBanner from './lib/CaveatBanner.svelte'
  import CreditsFooter from './lib/CreditsFooter.svelte'

  let atlas = $state<Atlas | null>(null)
  let error = $state<string | null>(null)

  onMount(async () => {
    try {
      const data = await loadAtlasData()
      atlas = createAtlas(data)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  })

  onDestroy(() => atlas?.destroy())

  function onKey(e: KeyboardEvent) {
    if (!atlas) return
    const target = e.target as HTMLElement
    if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT') return
    if (e.key === 'ArrowRight') {
      atlas.stepYear(1)
      e.preventDefault()
    } else if (e.key === 'ArrowLeft') {
      atlas.stepYear(-1)
      e.preventDefault()
    } else if (e.key === ' ') {
      atlas.togglePlay()
      e.preventDefault()
    } else if (e.key === 'Escape') {
      atlas.select(null)
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="atlas-app">
  {#if error}
    <div class="error">
      <div>
        <h1>Couldn't load the atlas data</h1>
        <p>{error}</p>
        <p>Have you run <code>npm run build:data</code>?</p>
      </div>
    </div>
  {:else if !atlas}
    <div class="loading">
      <div class="loading-globe">
        <div class="rings"><span></span><span></span><span></span></div>
        <div class="label">Loading the world…</div>
      </div>
    </div>
  {:else}
    <header class="reveal" style="--d: 0ms">
      <h1 class="title">The World, <span>Visualized</span></h1>
      <CaveatBanner note={atlas.data.meta.bordersNote} />
    </header>

    <div class="atlas-map">
      <MapView {atlas} />
      <div class="overlay top-left reveal" style="--d: 120ms">
        <MetricSwitcher {atlas} />
      </div>
      <div class="overlay bottom-left reveal" style="--d: 200ms">
        <Legend {atlas} />
      </div>
      <CountryPanel {atlas} />
    </div>

    <div class="reveal" style="--d: 80ms">
      <Timeline {atlas} />
      <CreditsFooter sources={atlas.data.meta.sources} generatedNote={atlas.data.meta.generatedNote} />
    </div>
  {/if}
</div>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.55rem 1rem;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    z-index: 500;
  }
  .title {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
    letter-spacing: 0.005em;
    white-space: nowrap;
  }
  .title span {
    color: var(--accent);
    font-style: italic;
    font-weight: 500;
  }
  .reveal {
    animation: rise-in 0.5s ease both;
    animation-delay: var(--d, 0ms);
  }
  @media (prefers-reduced-motion: reduce) {
    .reveal {
      animation: none;
    }
  }
  .overlay {
    position: absolute;
    z-index: 600;
    pointer-events: none;
  }
  .overlay > :global(*) {
    pointer-events: auto;
  }
  .top-left {
    top: 0.75rem;
    left: 0.75rem;
  }
  .bottom-left {
    bottom: 0.75rem;
    left: 0.75rem;
  }
</style>
