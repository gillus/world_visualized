<script lang="ts">
  import { fly } from 'svelte/transition'
  import type { Atlas } from '../core/atlas'
  import { metricValue, timeSeries, latestAtOrBefore } from '../core/join'
  import { METRICS, unitFor, formatCompact } from '../core/metrics'
  import Sparkline from './Sparkline.svelte'
  import IntelSection from './IntelSection.svelte'

  let { atlas }: { atlas: Atlas } = $props()
  const { yearMin, yearMax } = atlas.data.meta
  const view = atlas.state

  let country = $derived($view.selected ? atlas.data.stats[$view.selected] : null)
  let value = $derived(
    $view.selected
      ? metricValue(atlas.data.stats, $view.selected, $view.metric, $view.year, $view.populationMode)
      : null,
  )
  let series = $derived(
    $view.selected
      ? timeSeries(
          atlas.data.stats,
          $view.selected,
          $view.metric,
          $view.populationMode,
          yearMin,
          yearMax,
        )
      : [],
  )

  // Percentile rank among countries that have data this year — an honest,
  // metric-agnostic comparator (no fabricated "world total").
  let percentile = $derived.by(() => {
    if (value == null) return null
    const all: number[] = []
    for (const iso of Object.keys(atlas.data.stats)) {
      const v = metricValue(atlas.data.stats, iso, $view.metric, $view.year, $view.populationMode)
      if (v != null && Number.isFinite(v)) all.push(v)
    }
    if (all.length < 2) return null
    const below = all.filter((v) => v < value!).length
    return Math.round((below / (all.length - 1)) * 100)
  })

  // Change vs ten years earlier — makes the time machine tangible.
  let trend = $derived.by(() => {
    if (value == null || !$view.selected) return null
    const refYear = $view.year - 10
    if (refYear < yearMin) return null
    const ref = metricValue(
      atlas.data.stats,
      $view.selected,
      $view.metric,
      refYear,
      $view.populationMode,
    )
    if (ref == null || ref <= 0) return null
    return { pct: Math.round((value / ref - 1) * 100), refYear }
  })

  // Country intel (World Bank WDI): latest known value at or before the
  // slider year, each labelled with its own year when it lags.
  let intel = $derived.by(() => {
    if (!country) return null
    const y = $view.year
    const gdp = latestAtOrBefore(country.gdp_per_capita, y)
    const agri = latestAtOrBefore(country.sector_agriculture, y)
    const ind = latestAtOrBefore(country.sector_industry, y)
    const srv = latestAtOrBefore(country.sector_services, y)
    const exp = latestAtOrBefore(country.exports_pct_gdp, y)
    const imp = latestAtOrBefore(country.imports_pct_gdp, y)
    const sectors =
      agri && ind && srv
        ? {
            year: Math.max(agri.year, ind.year, srv.year),
            parts: [
              { label: 'Agriculture', value: agri.value, cls: 'agri' },
              { label: 'Industry', value: ind.value, cls: 'ind' },
              { label: 'Services', value: srv.value, cls: 'srv' },
            ],
            total: agri.value + ind.value + srv.value,
          }
        : null
    if (!gdp && !sectors && !exp && !imp) return null
    return { gdp, sectors, exp, imp }
  })

  // Energy intel (OWID): totals, electricity, trade and the energy mix.
  let energyIntel = $derived.by(() => {
    if (!country) return null
    const y = $view.year
    const total = latestAtOrBefore(country.energy_total_twh, y)
    const elecGen = latestAtOrBefore(country.electricity_gen_twh, y)
    const elecShare = latestAtOrBefore(country.electricity_share_energy, y)
    const trade = latestAtOrBefore(country.net_elec_imports_share, y)
    const fos = latestAtOrBefore(country.energy_fossil_share, y)
    const nuc = latestAtOrBefore(country.energy_nuclear_share, y)
    const ren = latestAtOrBefore(country.energy_renewables_share, y)
    const mix =
      fos && nuc && ren
        ? {
            year: Math.max(fos.year, nuc.year, ren.year),
            parts: [
              { label: 'Fossil', value: fos.value, cls: 'fos' },
              { label: 'Nuclear', value: nuc.value, cls: 'nuc' },
              { label: 'Renewables', value: ren.value, cls: 'ren' },
            ],
            total: fos.value + nuc.value + ren.value,
          }
        : null
    if (!total && !elecGen && !elecShare && !trade && !mix) return null
    return { total, elecGen, elecShare, trade, mix }
  })

  // Section open/closed state lives outside the {#if}-rendered card, so it
  // survives switching countries within a session.
  let economyOpen = $state(false)
  let energyOpen = $state(false)

  // "· 2019" tag when an intel value lags the slider year.
  function lag(dataYear: number): string {
    return dataYear === $view.year ? '' : `· ${dataYear}`
  }

  /** TWh with a readable floor for small countries. */
  function fmtTwh(v: number): string {
    return v < 1 ? `${Math.round(v * 1000)} GWh` : `${formatCompact(v)} TWh`
  }
</script>

{#if $view.selected && country}
  <aside class="panel" transition:fly={{ x: 24, duration: 220 }}>
    <button class="close" onclick={() => atlas.select(null)} aria-label="Close">×</button>
    <h2>{country.name}</h2>

    <div class="metric-line">
      <span class="big">{value == null ? '—' : formatCompact(value)}</span>
      <span class="unit">{unitFor($view.metric, $view.populationMode)}</span>
    </div>
    <div class="sub">{METRICS[$view.metric].label} · {$view.year}</div>

    {#if value == null}
      <p class="nodata">No data recorded for {country.name} in {$view.year}.</p>
    {:else}
      {#if trend != null && trend.pct !== 0}
        <p class="trend" class:up={trend.pct > 0} class:down={trend.pct < 0}>
          {trend.pct > 0 ? '▲' : '▼'}
          {Math.abs(trend.pct)}% since {trend.refYear}
        </p>
      {/if}
      {#if percentile != null}
        <p class="rank">Higher than <b>{percentile}%</b> of countries this year.</p>
      {/if}
    {/if}

    <p class="reading-tip">{ $view.metric === 'energy' ? 'Energy powers homes, transport, and industry. This is the country’s energy use divided by its population, not a household electricity bill.' : $view.populationMode === 'density' ? 'Imagine spreading everyone evenly across the country. This is how many people would share each 1 km × 1 km square. Real neighbourhoods vary!' : 'k means thousand, M means million, and B means billion. Try the crowdedness view to see how much space people share.' }</p>

    <div class="spark-wrap">
      <div class="spark-label">{yearMin}–{yearMax}</div>
      <Sparkline {series} currentYear={$view.year} />
    </div>

    {#if intel}
      <IntelSection
        title="Economy"
        source="World Bank — World Development Indicators"
        bind:open={economyOpen}
      >
        {#if intel.gdp}
          <div class="row" title="Gross domestic product per person, constant 2015 US$">
            <span class="label">GDP / person</span>
            <span class="val">${formatCompact(intel.gdp.value)} <i>{lag(intel.gdp.year)}</i></span>
          </div>
        {/if}

        {#if intel.sectors}
          <div class="row" title="Value added by sector, % of GDP">
            <span class="label">Economy mix</span>
            <span class="val"><i>{lag(intel.sectors.year)}</i></span>
          </div>
          <div class="stack" role="img" aria-label="Economy sector shares">
            {#each intel.sectors.parts as p}
              <span class="seg {p.cls}" style="flex-grow: {p.value / intel.sectors.total}"></span>
            {/each}
          </div>
          <div class="stack-legend">
            {#each intel.sectors.parts as p}
              <span class="key"><span class="dot {p.cls}"></span>{p.label} {Math.round(p.value)}%</span>
            {/each}
          </div>
        {/if}

        {#if intel.exp}
          <div class="row" title="Exports of goods and services, % of GDP">
            <span class="label">Exports</span>
            <span class="val">{intel.exp.value}% of GDP <i>{lag(intel.exp.year)}</i></span>
          </div>
        {/if}
        {#if intel.imp}
          <div class="row" title="Imports of goods and services, % of GDP">
            <span class="label">Imports</span>
            <span class="val">{intel.imp.value}% of GDP <i>{lag(intel.imp.year)}</i></span>
          </div>
        {/if}
      </IntelSection>
    {/if}

    {#if energyIntel}
      <IntelSection title="Energy" source="Our World in Data — Energy" bind:open={energyOpen}>
        {#if energyIntel.total}
          <div class="row" title="Total primary energy consumption">
            <span class="label">Total energy</span>
            <span class="val">{fmtTwh(energyIntel.total.value)} <i>{lag(energyIntel.total.year)}</i></span>
          </div>
        {/if}

        {#if energyIntel.elecGen}
          <div class="row" title="Electricity generated">
            <span class="label">Electricity gen.</span>
            <span class="val">{fmtTwh(energyIntel.elecGen.value)} <i>{lag(energyIntel.elecGen.year)}</i></span>
          </div>
        {/if}

        {#if energyIntel.elecShare}
          <div class="row" title="Share of primary energy consumed as electricity">
            <span class="label">Electricity share</span>
            <span class="val">{energyIntel.elecShare.value}% of energy <i>{lag(energyIntel.elecShare.year)}</i></span>
          </div>
        {/if}

        {#if energyIntel.trade}
          <div class="row" title="Net electricity imports as a share of demand">
            <span class="label">Electricity trade</span>
            <span class="val">
              {#if energyIntel.trade.value > 0}
                imports {energyIntel.trade.value}% of demand
              {:else if energyIntel.trade.value < 0}
                exports {Math.abs(energyIntel.trade.value)}% of demand
              {:else}
                balanced
              {/if}
              <i>{lag(energyIntel.trade.year)}</i>
            </span>
          </div>
        {/if}

        {#if energyIntel.mix}
          <div class="row" title="Share of primary energy by source">
            <span class="label">Energy mix</span>
            <span class="val"><i>{lag(energyIntel.mix.year)}</i></span>
          </div>
          <div class="stack" role="img" aria-label="Energy mix by source">
            {#each energyIntel.mix.parts as p}
              <span class="seg {p.cls}" style="flex-grow: {p.value / energyIntel.mix.total}"></span>
            {/each}
          </div>
          <div class="stack-legend">
            {#each energyIntel.mix.parts as p}
              <span class="key"><span class="dot {p.cls}"></span>{p.label} {Math.round(p.value)}%</span>
            {/each}
          </div>
        {/if}
      </IntelSection>
    {/if}
  </aside>
{/if}

<style>
  .panel {
    /* Okabe–Ito hues — colourblind-safe, like the map ramp. */
    --c-agri: #009e73;
    --c-ind: #e69f00;
    --c-srv: #56b4e9;
    --c-fos: #d55e00;
    --c-nuc: #cc79a7;
    --c-ren: #009e73;
    position: relative;
    flex: 0 0 19rem;
    width: 19rem;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem 1.1rem 1.1rem;
    z-index: 650;
    box-shadow: 0 6px 26px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
    max-height: 530px;
    overflow-y: auto;
  }
  .reading-tip { font-size:.85rem; line-height:1.6; color:var(--ink-dim); padding:.8rem; background:var(--panel-2); border-radius:8px; }
  .close {
    min-width: 44px;
    min-height: 44px;
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    border: none;
    background: none;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--ink-dim);
  }
  .close:hover {
    color: var(--ink);
  }
  h2 {
    margin: 0 1.5rem 0.6rem 0;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.3rem;
    line-height: 1.15;
  }
  .metric-line {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }
  .big {
    font-family: var(--font-mono);
    font-size: 1.8rem;
    font-weight: 600;
    color: var(--accent);
  }
  .unit {
    font-size: 0.8rem;
    color: var(--ink-dim);
  }
  .sub {
    font-size: 0.78rem;
    color: var(--ink-dim);
    margin-top: 0.15rem;
  }
  .trend {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    margin: 0.7rem 0 0;
  }
  .trend.up {
    color: #8fd17a;
  }
  .trend.down {
    color: #f0a48c;
  }
  .rank,
  .nodata {
    font-size: 0.8rem;
    margin: 0.45rem 0 0;
    color: var(--ink-dim);
  }
  .nodata {
    margin-top: 0.7rem;
  }
  .rank b {
    color: var(--ink);
  }
  .spark-wrap {
    margin-top: 0.9rem;
  }
  .spark-label {
    font-family: var(--font-mono);
    font-size: 0.64rem;
    color: var(--ink-dim);
    margin-bottom: 0.2rem;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.6rem;
    font-size: 0.78rem;
    margin-top: 0.3rem;
  }
  .row .label {
    color: var(--ink-dim);
  }
  .row .val {
    font-family: var(--font-mono);
    font-size: 0.76rem;
  }
  .row .val i {
    font-style: normal;
    color: var(--ink-dim);
    font-size: 0.64rem;
  }
  .stack {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 0.35rem;
    border: 1px solid var(--border);
  }
  .seg {
    min-width: 2px;
  }
  .seg.agri {
    background: var(--c-agri);
  }
  .seg.ind {
    background: var(--c-ind);
  }
  .seg.srv {
    background: var(--c-srv);
  }
  .seg.fos {
    background: var(--c-fos);
  }
  .seg.nuc {
    background: var(--c-nuc);
  }
  .seg.ren {
    background: var(--c-ren);
  }
  .stack-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.7rem;
    margin-top: 0.35rem;
    font-size: 0.68rem;
    color: var(--ink-dim);
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
  }
  .dot.agri {
    background: var(--c-agri);
  }
  .dot.ind {
    background: var(--c-ind);
  }
  .dot.srv {
    background: var(--c-srv);
  }
  .dot.fos {
    background: var(--c-fos);
  }
  .dot.nuc {
    background: var(--c-nuc);
  }
  .dot.ren {
    background: var(--c-ren);
  }
  @media (max-width: 700px) {
    .panel {
      flex: auto;
      max-height: none;
      width: auto;
    }
  }
</style>
