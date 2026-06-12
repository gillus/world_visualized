<script lang="ts">
  import type { Atlas } from '../core/atlas'
  import type { MetricId } from '../core/types'
  import { METRICS, POPULATION_MODES } from '../core/metrics'

  let { atlas }: { atlas: Atlas } = $props()
  const view = atlas.state

  const metricIds = Object.keys(METRICS) as MetricId[]
</script>

<div class="switcher">
  <div class="metrics" role="tablist" aria-label="Metric">
    {#each metricIds as id}
      <button
        role="tab"
        aria-selected={$view.metric === id}
        class:active={$view.metric === id}
        onclick={() => atlas.setMetric(id)}
      >
        {METRICS[id].label}
      </button>
    {/each}
  </div>

  {#if $view.metric === 'population'}
    <div class="modes">
      {#each Object.entries(POPULATION_MODES) as [mode, def]}
        <button
          class:active={$view.populationMode === mode}
          title={def.hint}
          onclick={() => atlas.setPopulationMode(mode as 'density' | 'logTotal')}
        >
          {def.label}
        </button>
      {/each}
    </div>
  {/if}

  <p class="desc">{METRICS[$view.metric].description}</p>
</div>

<style>
  .switcher {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.6rem;
    width: 16rem;
    box-shadow: var(--shadow-panel);
    backdrop-filter: blur(6px);
  }
  .metrics {
    display: flex;
    gap: 0.3rem;
  }
  .metrics button {
    flex: 1;
    padding: 0.42rem 0.5rem;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: var(--panel-2);
    font-size: 0.82rem;
    color: var(--ink-dim);
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .metrics button:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .modes {
    display: flex;
    gap: 0.3rem;
    margin-top: 0.4rem;
  }
  .modes button {
    flex: 1;
    padding: 0.3rem 0.4rem;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: transparent;
    font-size: 0.74rem;
    color: var(--ink-dim);
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }
  .modes button:hover {
    border-color: var(--accent);
  }
  button.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, var(--panel-2));
    color: var(--ink);
  }
  .desc {
    margin: 0.55rem 0 0;
    font-size: 0.72rem;
    line-height: 1.35;
    color: var(--ink-dim);
  }
  @media (max-width: 600px) {
    .switcher {
      width: 13rem;
    }
    .desc {
      display: none;
    }
  }
</style>
