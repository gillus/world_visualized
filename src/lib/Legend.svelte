<script lang="ts">
  import type { Atlas } from '../core/atlas'
  import { valueDomain } from '../core/join'
  import { buildColorScale, NO_DATA_COLOR } from '../core/scales'
  import { unitFor, formatCompact } from '../core/metrics'

  let { atlas }: { atlas: Atlas } = $props()
  const view = atlas.state

  // Recomputed reactively from the current view.
  let scale = $derived(
    buildColorScale(
      valueDomain(atlas.data.stats, $view.metric, $view.year, $view.populationMode),
      $view.metric,
      $view.populationMode,
    ),
  )
  let unit = $derived(unitFor($view.metric, $view.populationMode))

  // Midpoint tick: geometric mean on log scales (the visual centre of the
  // ramp), arithmetic mean otherwise.
  let mid = $derived(
    scale.log
      ? Math.sqrt(scale.domain[0] * scale.domain[1])
      : (scale.domain[0] + scale.domain[1]) / 2,
  )

  // CSS gradient sampled across the ramp.
  let gradient = $derived(
    'linear-gradient(to right,' +
      Array.from({ length: 9 }, (_, i) => scale.sample(i / 8)).join(',') +
      ')',
  )
</script>

<div class="legend">
  <div class="head">
    <span class="unit">{unit}</span>
    {#if scale.log}<span class="log-badge">×10 scale</span>{/if}
  </div>
  <div class="bar" style:background={gradient}></div>
  <div class="ticks">
    <span>{formatCompact(scale.domain[0])}</span>
    <span class="mid">{formatCompact(mid)}</span>
    <span>{formatCompact(scale.domain[1])}</span>
  </div>
  <div class="nodata">
    <span class="swatch" style:background={NO_DATA_COLOR}></span> no data
  </div>
</div>

<style>
  .legend {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.55rem 0.65rem 0.5rem;
    width: 15rem;
    box-shadow: var(--shadow-panel);
    backdrop-filter: blur(6px);
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem;
    margin-bottom: 0.35rem;
  }
  .unit {
    color: var(--ink-dim);
    font-size: 0.72rem;
    letter-spacing: 0.03em;
  }
  .log-badge {
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: var(--accent);
    border: 1px solid var(--accent-soft);
    background: var(--accent-soft);
    border-radius: 999px;
    padding: 0.05rem 0.4rem;
  }
  .bar {
    height: 12px;
    border-radius: 4px;
    border: 1px solid var(--border);
  }
  .ticks {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.4rem;
    margin-top: 0.25rem;
    font-family: var(--font-mono);
    font-size: 0.68rem;
  }
  .mid {
    color: var(--ink-dim);
  }
  .nodata {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.4rem;
    font-size: 0.7rem;
    color: var(--ink-dim);
  }
  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid var(--border);
    display: inline-block;
  }
  @media (max-width: 600px) {
    .legend {
      width: 11.5rem;
    }
  }
</style>
