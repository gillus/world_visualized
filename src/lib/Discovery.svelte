<script lang="ts">
  import type { Atlas } from '../core/atlas'
  import { metricValue } from '../core/join'
  import { formatCompact, unitFor } from '../core/metrics'

  let { atlas }: { atlas: Atlas } = $props()
  const view = atlas.state
  let active = $state(atlas.state.get().metric === 'energy' ? 2 : atlas.state.get().populationMode === 'density' ? 1 : 0)
  const journeys = [
    { tag: '01 / PEOPLE', title: 'Big country. More people?', text: 'Compare India and Canada. Does more space mean more people?', countries: ['IND', 'CAN'], metric: 'population', mode: 'logTotal', color: '#c8ed79' },
    { tag: '02 / SPACE', title: 'How crowded is crowded?', text: 'Compare Bangladesh and Australia, one square kilometre at a time.', countries: ['BGD', 'AUS'], metric: 'population', mode: 'density', color: '#9edbff' },
    { tag: '03 / ENERGY', title: 'Who uses more energy?', text: 'Compare the United States and India. What changes when we count per person?', countries: ['USA', 'IND'], metric: 'energy', mode: 'density', color: '#d7b6ff' },
  ] as const
  let journey = $derived(journeys[active])
  let matches = $derived($view.metric === journey.metric && ($view.metric === 'energy' || $view.populationMode === journey.mode))
  let comparisons = $derived(journey.countries.map(iso => ({ iso, name: atlas.data.stats[iso]?.name ?? iso, value: metricValue(atlas.data.stats, iso, $view.metric, $view.year, $view.populationMode) })))
  let max = $derived(Math.max(1, ...comparisons.map(c => c.value ?? 0)))
  function explore(index: number) {
    active = index
    atlas.setMetric(journeys[index].metric)
    atlas.setPopulationMode(journeys[index].mode)
    atlas.select(journeys[index].countries[0])
  }
</script>

<section class="discovery" aria-labelledby="discovery-title">
  <div class="section-heading"><h2 id="discovery-title">Start with a question.</h2><span>Pick a mini exploration ↓</span></div>
  <div class="journeys">
    {#each journeys as item, i}
      <button class="journey" class:active={active === i} style="--card-accent: {item.color}" aria-pressed={active === i} onclick={() => explore(i)}>
        <span class="tag">{item.tag}<span aria-hidden="true">↗</span></span>
        <strong>{item.title}</strong><span class="description">{item.text}</span>
        <span class="action">{active === i ? 'Exploring now' : 'Let’s find out'} <span aria-hidden="true">→</span></span>
      </button>
    {/each}
  </div>
  <div class="comparison">
    <div class="prompt"><span class="eyebrow">YOUR SIDE-BY-SIDE · {$view.year}</span><h3>{matches ? journey.title : 'A new way to compare.'}</h3><p>Bars show {$view.metric === 'energy' ? 'yearly energy use per person' : $view.populationMode === 'density' ? 'people per square kilometre' : 'total population'}. Try changing the year below.</p></div>
    <div class="bars">
      {#each comparisons as country}
        <button class="comparison-row" onclick={() => atlas.select(country.iso)} aria-label={`Explore ${country.name}`}>
          <span class="bar-label"><b>{country.name}</b><span>{country.value == null ? 'No data' : formatCompact(country.value)} <small>{country.value == null ? '' : unitFor($view.metric, $view.populationMode)}</small></span></span>
          <span class="track"><span class="fill" style="width: {country.value == null ? 0 : country.value / max * 100}%"></span></span>
        </button>
      {/each}
      <span class="bar-note">Bars start at zero. Missing data is never counted as zero.</span>
    </div>
  </div>
</section>

<style>
  .discovery { max-width: 1440px; margin: auto; padding: 0 2rem 2rem; }
  .section-heading { display:flex; align-items:baseline; justify-content:space-between; gap:1rem; margin-bottom:1rem; }
  h2 { font-size:1.35rem; margin:0; } .section-heading > span { color:var(--ink-dim); font-size:.85rem; }
  .journeys { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; }
  .journey { text-align:left; display:flex; flex-direction:column; gap:.8rem; border:1px solid var(--border); border-radius:16px; background:var(--panel); padding:1.3rem; transition: border-color .15s, transform .15s; }
  .journey:hover { transform:translateY(-3px); border-color:var(--card-accent); }
  .journey.active { border-color:var(--card-accent); background:color-mix(in srgb,var(--card-accent) 7%,var(--panel)); }
  .tag { display:flex; justify-content:space-between; color:var(--card-accent); font: .7rem var(--font-mono); letter-spacing:.08em; }
  strong { font-size:1.35rem; letter-spacing:-.03em; } .description { color:var(--ink-dim); line-height:1.55; font-size:.9rem; }
  .action { color:var(--card-accent); font-size:.8rem; margin-top:auto; padding-top:.3rem; }
  .comparison { display:grid; grid-template-columns:1fr 1.4fr; gap:3rem; padding:1.6rem 0 0; align-items:center; }
  .eyebrow { color:var(--accent); font:.68rem var(--font-mono); letter-spacing:.08em; }
  h3 { margin:.5rem 0; font-size:1.25rem; } p { color:var(--ink-dim); font-size:.85rem; line-height:1.5; margin:0; }
  .comparison-row { display:block; width:100%; border:0; background:transparent; text-align:left; padding:.5rem 0; }
  .bar-label { display:flex; justify-content:space-between; gap:1rem; font-size:.85rem; margin-bottom:.5rem; } small { color:var(--ink-dim); }
  .track { display:block; height:12px; background:var(--panel-2); border-radius:4px; overflow:hidden; }
  .fill { display:block; height:100%; background:var(--accent); border-radius:4px; }
  .comparison-row:nth-child(2) .fill { background:#9edbff; }
  .bar-note { color:var(--ink-dim); font-size:.7rem; }
  @media(max-width:700px) { .discovery { padding:0 1rem 1.5rem; } .journeys { grid-template-columns:1fr; gap:.6rem; } .journey { padding:1rem; gap:.5rem; } .comparison { grid-template-columns:1fr; gap:1rem; } .section-heading > span { display:none; } }
  @media(prefers-reduced-motion:reduce) { .journey { transition:none; } .journey:hover { transform:none; } }
</style>
