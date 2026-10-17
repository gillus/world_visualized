<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'
  import type { Atlas } from '../core/atlas'
  import { metricValue, valueDomain } from '../core/join'
  import { buildColorScale } from '../core/scales'
  import { unitFor, formatCompact } from '../core/metrics'

  let { atlas }: { atlas: Atlas } = $props()

  // Our core store implements the Svelte store contract, so `$view` works.
  const view = atlas.state

  let mapEl: HTMLDivElement
  let map: L.Map | undefined
  let geoLayer: L.GeoJSON | undefined

  function tooltipHtml(iso: string, name: string): string {
    const val = metricValue(atlas.data.stats, iso, $view.metric, $view.year, $view.populationMode)
    const unit = unitFor($view.metric, $view.populationMode)
    const valueStr =
      val == null
        ? `<span class="tt-nodata">no data · ${$view.year}</span>`
        : `<span class="tt-value">${formatCompact(val)}</span> <span class="tt-unit">${unit} · ${$view.year}</span>`
    return `<b>${name}</b><br>${valueStr}`
  }

  function restyle() {
    if (!geoLayer) return
    const { stats } = atlas.data
    const { year, metric, populationMode, selected } = $view
    const domain = valueDomain(stats, metric, year, populationMode)
    const scale = buildColorScale(domain, metric, populationMode)

    geoLayer.setStyle((feature) => {
      const iso = feature?.properties?.iso as string | undefined
      const val = iso ? metricValue(stats, iso, metric, year, populationMode) : null
      const isSel = iso === selected
      return {
        fillColor: scale.color(val),
        fillOpacity: 0.88,
        weight: isSel ? 2.5 : 0.5,
        color: isSel ? '#ffffff' : '#0c0f14',
      }
    })
  }

  onMount(() => {
    map = L.map(mapEl, {
      center: [25, 10],
      zoom: 2,
      minZoom: 2,
      maxZoom: 6,
      worldCopyJump: true,
      attributionControl: false,
      zoomControl: false,
      scrollWheelZoom: false,
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    const resizeObserver = new ResizeObserver(() => map?.invalidateSize())
    resizeObserver.observe(mapEl)

    geoLayer = L.geoJSON(atlas.data.borders, {
      onEachFeature: (feature, layer) => {
        const iso = feature.properties?.iso as string
        const name = (feature.properties?.name as string) ?? iso
        layer.bindTooltip('', { sticky: true, direction: 'top', opacity: 0.97 })
        layer.on('mouseover', () => {
          const path = layer as L.Path
          path.setTooltipContent(tooltipHtml(iso, name))
          // Lift the hovered country: brighter outline, drawn on top.
          if (iso !== $view.selected) {
            path.setStyle({ weight: 1.6, color: '#9aa7b4' })
          }
          path.bringToFront()
        })
        layer.on('mouseout', () => {
          const path = layer as L.Path
          if (iso !== $view.selected) {
            path.setStyle({ weight: 0.5, color: '#0c0f14' })
          }
        })
        layer.on('click', () => atlas.select(iso === $view.selected ? null : iso))
      },
    }).addTo(map)

    restyle()
    return () => resizeObserver.disconnect()
  })

  // Re-colour whenever the view changes. Reading these fields registers the deps.
  $effect(() => {
    void [$view.year, $view.metric, $view.populationMode, $view.selected]
    restyle()
  })

  onDestroy(() => map?.remove())
</script>

<div class="map" bind:this={mapEl}></div>

<style>
  .map {
    position: absolute;
    inset: 0;
  }
  :global(.leaflet-tooltip) {
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.4rem 0.6rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
    font-size: 0.8rem;
    line-height: 1.45;
  }
  :global(.leaflet-tooltip .tt-value) {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--accent);
  }
  :global(.leaflet-tooltip .tt-unit),
  :global(.leaflet-tooltip .tt-nodata) {
    color: var(--ink-dim);
    font-size: 0.72rem;
  }
  :global(.leaflet-tooltip-top::before) {
    border-top-color: var(--border);
  }
</style>
