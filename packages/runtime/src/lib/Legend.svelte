<script lang="ts">
  // What the map's colours and shapes mean, for one scene.
  import type { Lang } from '@atlas/spec'
  import type { LegendItem } from '../core/legend'
  import { ui } from '../core/ui'

  let { items, relief = [], lang }: { items: LegendItem[]; relief?: number[]; lang: Lang } = $props()

  const t = $derived(ui(lang))
  const swatches = $derived(items.filter((i) => i.kind === 'swatch' || i.kind === 'line'))
  const blocks = $derived(items.filter((i) => i.kind === 'classes' || i.kind === 'circles'))
</script>

{#if items.length || relief.length}
  <div class="legend" aria-label={t.legend} role="group">
    {#if swatches.length}
      <ul class="swatches">
        {#each swatches as item, i (i)}
          <li>
            {#if item.kind === 'swatch'}
              <span class="swatch" class:dashed={item.dashed} style="--c: {item.color}"></span>
            {:else if item.kind === 'line'}
              <span class="line {item.style}"></span>
            {/if}
            {item.label}
          </li>
        {/each}
      </ul>
    {/if}

    {#each blocks as block, i (i)}
      <div class="block">
        <p class="title">{block.title}</p>
        {#if block.kind === 'classes'}
          <ul class="classes">
            {#each block.classes as c (c.label)}
              <li><span class="swatch" style="--c: {c.color}"></span>{c.label}</li>
            {/each}
          </ul>
        {:else if block.kind === 'circles'}
          {@const max = block.sizes[0].r}
          <svg class="circles" width={max * 2 + 120} height={max * 2 + 4} aria-hidden="true">
            {#each block.sizes as s (s.label)}
              <circle cx={max + 2} cy={max * 2 + 2 - s.r} r={s.r} style="--c: {block.color}" />
              <line x1={max + 2} x2={max * 2 + 14} y1={max * 2 + 2 - 2 * s.r} y2={max * 2 + 2 - 2 * s.r} />
              <text x={max * 2 + 18} y={max * 2 + 2 - 2 * s.r} dominant-baseline="middle">{s.label}</text>
            {/each}
          </svg>
        {/if}
      </div>
    {/each}

    {#if relief.length}
      <div class="block">
        <p class="title">{t.relief}</p>
        <ul class="classes">
          <li><span class="swatch" style="--c: var(--relief-0)"></span>{t.lowland(relief[0])}</li>
          {#each relief as lo, i (lo)}
            <li>
              <span class="swatch" style="--c: var(--relief-{lo})"></span>
              {i < relief.length - 1 ? t.band(lo, relief[i + 1]) : t.bandTop(lo)}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .legend {
    margin: 1.25rem 0 0;
    padding: 0.9rem 0 0;
    border-top: 1px solid var(--rule);
    display: grid;
    gap: 0.9rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    line-height: 1.3;
  }
  .classes {
    gap: 0.15rem;
  }
  .title {
    margin: 0 0 0.4rem;
    font-weight: 700;
    font-size: 0.95rem;
  }
  .swatch {
    flex: none;
    width: 1.15rem;
    height: 1.15rem;
    border-radius: 3px;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgba(22, 38, 61, 0.12);
  }
  .classes .swatch {
    width: 1.6rem;
    height: 1rem;
    border-radius: 2px;
  }
  .swatch.dashed {
    background: color-mix(in srgb, var(--c) 22%, transparent);
    border: 2px dashed var(--c);
    box-shadow: none;
  }
  .line {
    flex: none;
    width: 1.6rem;
    height: 0;
    border-top: 2.5px solid var(--river);
    border-radius: 2px;
  }
  .line.route {
    border-top: 2.5px dashed var(--ink);
  }
  .circles {
    display: block;
    overflow: visible;
  }
  .circles circle {
    fill: var(--c);
    fill-opacity: 0.72;
    stroke: var(--panel);
    stroke-width: 1.25;
  }
  .circles line {
    stroke: var(--ink-soft);
    stroke-width: 1;
  }
  .circles text {
    font-size: 0.85rem;
    fill: var(--ink);
  }
</style>
