<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { loadAtlasData } from './core/data'
  import { createAtlas, type Atlas } from './core/atlas'
  import CountryPicker from './lib/CountryPicker.svelte'
  import Discovery from './lib/Discovery.svelte'
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
    if (target?.closest('input, select, textarea, button, a, [contenteditable], [role=button]') || e.altKey || e.ctrlKey || e.metaKey) return
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

<div class="atlas-app" id="top">
  {#if error}
    <div class="error">
      <div>
        <h1>Couldn't load the atlas data</h1>
        <p>{error}</p>
        <p>Please check your connection and try again.</p>
        <button onclick={() => window.location.reload()}>Try again</button>
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
    <header>
      <a class="brand" href="#top"><span class="brand-icon" aria-hidden="true">◎</span> The World, <b>Visualized</b></a>
      <span class="header-note">A little curiosity. A whole planet.</span>
    </header>
    <main>
      <section class="hero">
        <div class="eyebrow">THE PLANET HAS STORIES. FIND YOURS.</div>
        <h1>Small questions.<br /><span>World-sized discoveries.</span></h1>
        <p>Where do people live? Who uses the most energy? Explore real data, compare countries, and travel through time.</p>
        <a class="explore-link" href="#explore">Explore the world <span aria-hidden="true">↓</span></a>
        <div class="hero-orbit" aria-hidden="true"><span>PEOPLE</span><span>PLANET</span><span>POSSIBILITIES</span></div>
      </section>
      <Discovery {atlas} />
      <section class="explorer" id="explore" aria-labelledby="map-heading">
        <div class="explorer-heading"><div><span class="eyebrow">YOUR INTERACTIVE ATLAS</span><h2 id="map-heading">Follow your curiosity.</h2></div>
          <CountryPicker {atlas} />
        </div>
        <p class="map-help">Tap a country to open its story. Switch what the colours measure, then drag the year to see what changes.</p>
        <div class="explorer-body">
          <div class="atlas-map">
            <MapView {atlas} />
            <div class="overlay top-left"><MetricSwitcher {atlas} /></div>
            <div class="overlay bottom-left"><Legend {atlas} /></div>
          </div>
          <CountryPanel {atlas} />
        </div>
        <div class="time-heading"><span>↶ TIME MACHINE</span><span>Press play or drag to a different year</span></div>
        <Timeline {atlas} />
        <div class="map-context"><CaveatBanner note={atlas.data.meta.bordersNote} /><span>Historical figures are estimates. Colours rescale each year; compare the numbers to track change.</span></div>
      </section>
    </main>
    <CreditsFooter sources={atlas.data.meta.sources} generatedNote={atlas.data.meta.generatedNote} />
  {/if}
</div>

<style>
  header { display:flex; justify-content:space-between; align-items:center; padding:1.2rem 2rem; border-bottom:1px solid var(--border); }
  .brand { color:var(--ink); text-decoration:none; font-size:1.05rem; } .brand b { color:var(--accent); } .brand-icon { font-size:1.7rem; vertical-align:middle; margin-right:.5rem; color:var(--accent); }
  .header-note { color:var(--ink-dim); font-size:.8rem; }
  .hero { max-width:1440px; margin:auto; padding:3.5rem 2rem 3rem; position:relative; overflow:hidden; }
  .eyebrow { color:var(--accent); font:.7rem var(--font-mono); letter-spacing:.12em; }
  h1 { font-size:clamp(2.6rem,5.5vw,4.8rem); line-height:1.06; letter-spacing:-.055em; margin:1rem 0; position:relative; z-index:1; }
  h1 span { color:var(--accent); } .hero p { max-width:530px; line-height:1.7; color:var(--ink-dim); font-size:1rem; position:relative; z-index:1; }
  .explore-link { display:inline-flex; gap:2rem; background:var(--accent); color:var(--bg); border-radius:8px; padding:.8rem 1.1rem; text-decoration:none; font-weight:650; margin-top:.6rem; }
  .hero-orbit { position:absolute; right:7%; top:3rem; width:260px; height:260px; border:1px solid #c8ed7933; border-radius:50%; background:repeating-radial-gradient(ellipse at center,transparent 0 30px,#c8ed7915 31px 32px); transform:rotate(-15deg); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1.5rem; color:#c8ed7966; font:.75rem var(--font-mono); letter-spacing:.3em; }
  .explorer { max-width:1376px; margin:0 auto 2rem; border:1px solid var(--border); border-radius:18px; overflow:hidden; background:var(--panel); scroll-margin-top:1rem; }
  .explorer-heading { padding:1.5rem 1.5rem 0; display:flex; justify-content:space-between; align-items:center; gap:1rem; } h2 { margin:.5rem 0 0; font-size:1.5rem; letter-spacing:-.03em; }

  .map-help { margin:.8rem 1.5rem 1.3rem; font-size:.85rem; color:var(--ink-dim); line-height:1.5; }
  .explorer-body { display:flex; align-items:stretch; } .atlas-map { min-width:0; height:530px; flex:1; position:relative; }
  .time-heading { display:flex; justify-content:space-between; padding:1rem 1.1rem .2rem; font-size:.7rem; color:var(--ink-dim); } .time-heading span:first-child { color:var(--accent); font-family:var(--font-mono); }
  .map-context { padding:1rem; display:flex; flex-wrap:wrap; gap:.5rem 1rem; color:var(--ink-dim); font-size:.72rem; line-height:1.5; }
  .overlay { position:absolute; z-index:600; pointer-events:none; } .overlay > :global(*) { pointer-events:auto; } .top-left { top:.75rem; left:.75rem; } .bottom-left { bottom:.75rem; left:.75rem; }
  @media(max-width:1000px) { .hero-orbit { right:-100px; opacity:.5; } .explorer { margin-inline:1rem; } }
  @media(max-width:700px) { header { padding:.8rem 1rem; } .header-note { display:none; } .hero { padding:2rem 1rem; } .hero-orbit { display:none; } .explorer-heading { align-items:stretch; flex-direction:column; padding:1rem 1rem 0; } .map-help { margin:1rem; } .explorer-body { flex-direction:column; } .atlas-map { flex:auto; height:440px; } .time-heading { gap:1rem; font-size:.65rem; } }
</style>
