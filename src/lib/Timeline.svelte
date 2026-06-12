<script lang="ts">
  import type { Atlas } from '../core/atlas'

  let { atlas }: { atlas: Atlas } = $props()
  const { yearMin, yearMax } = atlas.data.meta
  const view = atlas.state

  const span = yearMax - yearMin

  // Decade marks across the covered range, as 0..100% offsets.
  const decades: Array<{ year: number; pct: number; labelled: boolean }> = []
  for (let y = Math.ceil(yearMin / 10) * 10; y <= yearMax; y += 10) {
    decades.push({
      year: y,
      pct: ((y - yearMin) / span) * 100,
      // Label every other decade so labels never crowd on narrow screens.
      labelled: y % 20 === 0,
    })
  }

  let progress = $derived((($view.year - yearMin) / span) * 100)
</script>

<div class="timeline">
  <div class="transport">
    <button
      class="step"
      onclick={() => atlas.stepYear(-1)}
      aria-label="Previous year"
      title="Previous year (←)"
    >‹</button>
    <button
      class="play"
      class:playing={$view.playing}
      onclick={() => atlas.togglePlay()}
      aria-label={$view.playing ? 'Pause' : 'Play through the years'}
      title={$view.playing ? 'Pause (space)' : 'Play through the years (space)'}
    >
      {$view.playing ? '❚❚' : '▶'}
    </button>
    <button
      class="step"
      onclick={() => atlas.stepYear(1)}
      aria-label="Next year"
      title="Next year (→)"
    >›</button>
  </div>

  <span class="year" aria-live="polite">{$view.year}</span>

  <div class="track">
    <input
      class="slider"
      type="range"
      min={yearMin}
      max={yearMax}
      step="1"
      value={$view.year}
      style="--p: {progress}%"
      oninput={(e) => atlas.setYear(+(e.currentTarget as HTMLInputElement).value)}
      aria-label="Year"
    />
    <div class="ticks" aria-hidden="true">
      {#each decades as d}
        <span class="tick" class:labelled={d.labelled} style="left: {d.pct}%">
          {#if d.labelled}<i>{d.year}</i>{/if}
        </span>
      {/each}
    </div>
  </div>
</div>

<style>
  .timeline {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.1rem 1.15rem;
    background: var(--panel);
    border-top: 1px solid var(--border);
    z-index: 500;
  }
  .transport {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .play {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--panel-2);
    font-size: 0.85rem;
    display: grid;
    place-items: center;
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }
  .play:hover {
    border-color: var(--accent);
  }
  .play.playing {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    box-shadow: 0 0 14px rgba(79, 209, 197, 0.25);
  }
  .step {
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 50%;
    border: 1px solid transparent;
    background: none;
    color: var(--ink-dim);
    font-size: 1.15rem;
    line-height: 1;
    display: grid;
    place-items: center;
    padding-bottom: 0.15rem;
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  .step:hover {
    color: var(--ink);
    border-color: var(--border);
  }
  .year {
    flex: none;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 1.45rem;
    min-width: 4ch;
    text-align: center;
    color: var(--accent);
    text-shadow: 0 0 18px rgba(79, 209, 197, 0.35);
  }
  .track {
    flex: 1;
    position: relative;
  }
  .slider {
    -webkit-appearance: none;
    appearance: none;
    display: block;
    width: 100%;
    height: 1.4rem;
    margin: 0;
    background: none;
    cursor: pointer;
  }
  /* Filled track: elapsed years glow teal, the future stays dim. */
  .slider::-webkit-slider-runnable-track {
    height: 5px;
    border-radius: 999px;
    background: linear-gradient(
      to right,
      var(--accent) var(--p),
      var(--panel-2) var(--p)
    );
  }
  .slider::-moz-range-track {
    height: 5px;
    border-radius: 999px;
    background: var(--panel-2);
  }
  .slider::-moz-range-progress {
    height: 5px;
    border-radius: 999px;
    background: var(--accent);
  }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 17px;
    height: 17px;
    margin-top: -6px;
    border-radius: 50%;
    background: var(--ink);
    border: 3px solid var(--accent);
    box-shadow: 0 0 0 4px rgba(79, 209, 197, 0.15), 0 2px 8px rgba(0, 0, 0, 0.5);
    transition: transform 0.12s ease;
  }
  .slider::-moz-range-thumb {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--ink);
    border: 3px solid var(--accent);
    box-shadow: 0 0 0 4px rgba(79, 209, 197, 0.15), 0 2px 8px rgba(0, 0, 0, 0.5);
    transition: transform 0.12s ease;
  }
  .slider:active::-webkit-slider-thumb,
  .slider:hover::-webkit-slider-thumb {
    transform: scale(1.15);
  }
  .slider:active::-moz-range-thumb,
  .slider:hover::-moz-range-thumb {
    transform: scale(1.15);
  }
  .ticks {
    position: absolute;
    left: 8px; /* keep ticks inside the thumb's travel range */
    right: 8px;
    top: 100%;
    height: 0.9rem;
    pointer-events: none;
  }
  .tick {
    position: absolute;
    top: 0;
    width: 1px;
    height: 4px;
    background: var(--border);
    transform: translateX(-0.5px);
  }
  .tick.labelled {
    height: 6px;
    background: var(--ink-dim);
  }
  .tick i {
    position: absolute;
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    font-style: normal;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: var(--ink-dim);
    letter-spacing: 0.02em;
  }
  @media (max-width: 600px) {
    .timeline {
      gap: 0.6rem;
      padding-inline: 0.7rem;
    }
    .step {
      display: none;
    }
    .tick i {
      display: none;
    }
    .ticks {
      height: 0.4rem;
    }
  }
</style>
