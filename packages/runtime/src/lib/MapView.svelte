<script lang="ts" module>
  let instances = 0
</script>

<script lang="ts">
  // The lesson map. Geometry is projected once per size (the "base" frame,
  // fitted to the whole lesson extent); each scene zooms with a transform, so
  // moving between pages never re-projects the basemap.
  import { untrack } from 'svelte'
  import { geoPath } from 'd3-geo'
  import { interpolateZoom } from 'd3-interpolate'
  import { easeCubicInOut } from 'd3-ease'
  import type { Lang, Lesson, Swatch } from '@atlas/spec'
  import { pick } from '@atlas/spec'
  import type { LessonData, MapFeature } from '../core/loader'
  import type { Scene } from '../core/pages'
  import {
    applyTransform,
    fitBase,
    labelAnchor,
    lineAnchor,
    makeProjection,
    moveFeatureTo,
    placeLabels,
    viewTransform,
    IDENTITY,
    type LabelRequest,
    type ViewTransform,
  } from '../core/geo'
  import { groupColor } from '../core/palette'
  import { choroplethValues } from '../core/classify'
  import { layerFeatures, seriesLabel, symbolRadius, symbolValues } from '../core/legend'
  import { RELIEF_BANDS_FOR_CSS } from '../core/relief'

  let {
    lesson,
    data,
    scene,
    lang,
    label,
    still = false,
    picked = null,
    revealed = false,
    letters = null,
    onpick,
  }: {
    lesson: Lesson
    data: LessonData
    scene: Scene
    lang: Lang
    label: string
    /** Print: no animation, no hover; labels shown at once. */
    still?: boolean
    /** Locate question: the area the student chose, and whether to show the answer. */
    picked?: string | null
    revealed?: boolean
    /** Print: letter written on each candidate area of a locate question. */
    letters?: Map<string, string> | null
    onpick?: (id: string) => void
  } = $props()

  const clipId = `land-clip-${++instances}`

  let width = $state(0)
  let height = $state(0)

  const size = $derived({ width, height })
  const projection = $derived.by(() => {
    if (!(width > 0 && height > 0)) return null
    const base = fitBase(makeProjection(lesson.map), lesson.map.extent, size)
    if (!still) return base
    // A still map never zooms, so project straight into its view and cull
    // everything off-screen: print pages stay small.
    const v = viewTransform(base, scene.view, size)
    const [tx, ty] = base.translate()
    const pad = 8
    return base
      .scale(base.scale() * v.k)
      .translate([v.x + v.k * tx, v.y + v.k * ty])
      .clipExtent([[-pad, -pad], [width + pad, height + pad]])
  })
  const path = $derived(projection ? geoPath(projection).digits(still ? 1 : 3) : null)

  const nameOf = (f: MapFeature) => (lang === 'en' ? f.properties.name_en : f.properties.name_it)
  const textOf = (f: MapFeature, text: Record<string, { it: string; en?: string }> | undefined) =>
    text?.[f.properties.id] ? pick(text[f.properties.id], lang) : nameOf(f)

  // Projected outlines, cached per projection.
  const outlineCache = $derived.by(() => {
    void path
    return new Map<MapFeature, string>()
  })
  function outline(f: MapFeature): string {
    let d = outlineCache.get(f)
    if (d === undefined) {
      d = path?.(f) ?? ''
      outlineCache.set(f, d)
    }
    return d
  }

  const basemap = $derived(path ? data.basemap.map((f) => ({ f, d: outline(f) })).filter((b) => b.d) : [])
  const allLand = $derived(basemap.map((b) => b.d).join(''))
  const relief = $derived(
    path && scene.basemap === 'physical'
      ? data.relief.map((f) => ({ min: Number(f.properties.min), d: outline(f) })).filter((r) => r.d)
      : [],
  )
  const reliefFill = (min: number) => `var(--relief-${RELIEF_BANDS_FOR_CSS.includes(min) ? min : 'top'})`

  const datasetOf = (handle: string) => lesson.data[handle]?.dataset ?? handle

  interface Shape {
    key: string
    d: string
    fill: string
    name: string
    /** Base-frame centre, set when the feature is too small to see at the scene's zoom. */
    callout?: [number, number]
  }

  /** Below this on-screen size (px) a highlighted feature gets a ring around it. */
  const CALLOUT_BELOW = 9

  function callout(f: MapFeature): [number, number] | undefined {
    if (!path) return undefined
    const [[x0, y0], [x1, y1]] = path.bounds(f)
    if (Math.max(x1 - x0, y1 - y0) * target.k >= CALLOUT_BELOW) return undefined
    return [(x0 + x1) / 2, (y0 + y1) / 2]
  }

  const choropleths = $derived.by((): Shape[] => {
    if (!path) return []
    const out: Shape[] = []
    for (const layer of scene.layers) {
      if (layer.type !== 'choropleth') continue
      const series = data.series.get(layer.data)
      const features = data.handles.get(layer.data)
      if (!series || !features) continue
      const v = choroplethValues(layer, series, features.keys())
      for (const [id, f] of features) {
        const value = v.byId.get(id)
        out.push({
          key: `${datasetOf(layer.data)}:${id}`,
          d: outline(f),
          fill: v.classes.colorOf(value ? value[0] : null),
          name: `${nameOf(f)}: ${seriesLabel(data, layer.data, id, layer.year, lang)}`,
        })
      }
    }
    return out
  })

  const highlights = $derived.by((): Shape[] => {
    if (!path) return []
    const out: Shape[] = []
    for (const layer of scene.layers) {
      if (layer.type !== 'highlight') continue
      const features = data.handles.get(layer.data)
      layer.groups.forEach((g, gi) => {
        const fill = `var(--sw-${groupColor(g.color, gi)})`
        for (const id of g.ids) {
          const f = features?.get(id)
          if (f) out.push({ key: `${datasetOf(layer.data)}:${id}`, d: outline(f), fill, name: nameOf(f), callout: callout(f) })
        }
      })
    }
    return out
  })

  const compares = $derived.by(() => {
    if (!path || !projection) return []
    return scene.layers.flatMap((layer, li) => {
      if (layer.type !== 'compare') return []
      const f = data.handles.get(layer.data)?.get(layer.id)
      if (!f) return []
      return [{ key: `cmp-${li}-${layer.id}`, d: path(moveFeatureTo(f, layer.at)) ?? '', color: layer.color as Swatch, name: pick(layer.label, lang) }]
    })
  })

  const lines = $derived.by(() => {
    if (!path) return []
    return scene.layers.flatMap((layer) => {
      if (layer.type !== 'lines') return []
      return layerFeatures(data, layer.data, layer.ids).map((f) => ({
        key: `${datasetOf(layer.data)}:${f.properties.id}`,
        d: outline(f),
        style: layer.style,
        name: textOf(f, layer.text),
      }))
    })
  })

  // Locate question: candidate areas; once revealed, the answer and the student's pick.
  const candidates = $derived.by(() => {
    const p = scene.pick
    if (!path || !p) return []
    const features = data.handles.get(p.data)
    return p.ids.flatMap((id, i) => {
      const f = features?.get(id)
      if (!f) return []
      const state = !revealed ? 'idle' : id === p.answer ? 'right' : id === picked ? 'wrong' : 'idle'
      return [{ id, i, f, d: outline(f), state }]
    })
  })

  // --- zoom between scenes --------------------------------------------------

  const target = $derived(projection && !still ? viewTransform(projection, scene.view, size) : IDENTITY)
  let t = $state<ViewTransform>(IDENTITY)
  let settled = $state(false)
  let lastSize = ''
  let frame = 0

  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  $effect(() => {
    const to = target
    const sizeKey = `${width}x${height}`
    cancelAnimationFrame(frame)
    // First paint and resizes jump; scene changes fly.
    if (sizeKey !== lastSize || reducedMotion || still) {
      lastSize = sizeKey
      t = to
      settled = true
      return
    }
    const from = untrack(() => $state.snapshot(t))
    const view = (v: ViewTransform): [number, number, number] => [(width / 2 - v.x) / v.k, (height / 2 - v.y) / v.k, width / v.k]
    const interp = interpolateZoom(view(from), view(to))
    const duration = Math.min(1500, Math.max(550, interp.duration * 0.75))
    const start = performance.now()
    settled = false
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const [cx, cy, w] = interp(easeCubicInOut(p))
      const k = width / w
      t = { k, x: width / 2 - cx * k, y: height / 2 - cy * k }
      if (p < 1) frame = requestAnimationFrame(tick)
      else settled = true
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  })

  // --- proportional symbols: drawn in screen space, so circles keep their size while zooming

  const symbols = $derived.by(() => {
    if (!projection) return []
    return scene.layers.flatMap((layer, li) => {
      if (layer.type !== 'symbols') return []
      const values = symbolValues(layerFeatures(data, layer.data, layer.ids), layer.size)
      const max = Math.max(...values.values())
      return [...values]
        .flatMap(([f, v]) => {
          const base = projection(labelAnchor(f))
          if (!base) return []
          return [{ key: `s${li}-${f.properties.id}`, base, r: symbolRadius(v, max), color: layer.color, name: textOf(f, layer.text), labelled: layer.labels }]
        })
        .sort((a, b) => b.r - a.r)
    })
  })

  // --- labels (placed for the scene's final framing) -------------------------

  const FONT = { area: 15, point: 14, note: 13 }

  const labels = $derived.by(() => {
    if (!projection) return []
    const reqs: LabelRequest[] = []
    const screen = (lonlat: [number, number]) => {
      const p = projection(lonlat)
      return p ? applyTransform(target, p) : null
    }
    scene.layers.forEach((layer, li) => {
      if (layer.type === 'highlight' && layer.labels) {
        const features = data.handles.get(layer.data)
        for (const id of layer.groups.flatMap((g) => g.ids)) {
          const f = features?.get(id)
          const xy = f && screen(labelAnchor(f))
          if (f && xy) reqs.push({ key: `h${li}-${id}`, x: xy[0], y: xy[1], text: nameOf(f), kind: 'area', fontSize: FONT.area })
        }
      } else if (layer.type === 'labels') {
        const features = data.handles.get(layer.data)
        const ids = layer.ids ?? [...(features?.keys() ?? [])]
        for (const id of ids) {
          const f = features?.get(id)
          const xy = f && screen(labelAnchor(f))
          if (!f || !xy) continue
          const isPoint = f.geometry.type === 'Point'
          const marker = layer.marker ?? (isPoint ? 'city' : 'none')
          reqs.push({
            key: `l${li}-${id}`,
            x: xy[0],
            y: xy[1],
            text: textOf(f, layer.text),
            kind: 'point',
            fontSize: marker === 'none' ? FONT.area - 1 : FONT.point,
            marker: marker === 'none' ? undefined : marker,
          })
        }
      } else if (layer.type === 'note') {
        const xy = screen(layer.at)
        if (!xy) return
        const peak = layer.style === 'peak'
        reqs.push({
          key: `n${li}`,
          x: xy[0],
          y: xy[1],
          text: pick(layer.text, lang),
          kind: peak ? 'point' : 'note',
          fontSize: peak ? FONT.point - 1 : FONT.note,
          marker: peak ? 'peak' : undefined,
          style: layer.style,
        })
      } else if (layer.type === 'compare') {
        const xy = screen(layer.at)
        if (xy) reqs.push({ key: `c${li}`, x: xy[0], y: xy[1], text: pick(layer.label, lang), kind: 'area', fontSize: FONT.area, style: 'compare' })
      } else if (layer.type === 'lines' && layer.labels) {
        for (const f of layerFeatures(data, layer.data, layer.ids)) {
          const at = lineAnchor(f)
          const xy = at && screen(at)
          if (xy) reqs.push({ key: `r${li}-${f.properties.id}`, x: xy[0], y: xy[1], text: textOf(f, layer.text), kind: 'note', fontSize: FONT.note, style: layer.style })
        }
      }
    })
    // Circles keep labels off them, labelled or not.
    for (const s of symbols) {
      const [x, y] = applyTransform(target, s.base)
      reqs.push({ key: `${s.key}-label`, x, y, text: s.labelled ? s.name : '', kind: 'point', fontSize: FONT.point - 1, reserve: s.r })
    }
    for (const c of candidates) {
      const xy = screen(labelAnchor(c.f))
      if (!xy) continue
      const letter = letters?.get(c.id)
      if (letter) reqs.push({ key: `p-${c.id}`, x: xy[0], y: xy[1], text: letter, kind: 'area', fontSize: FONT.area + 3, style: 'letter' })
      else if (c.state !== 'idle') reqs.push({ key: `p-${c.id}`, x: xy[0], y: xy[1], text: nameOf(c.f), kind: 'area', fontSize: FONT.area })
    }
    return placeLabels(reqs, size).filter((l) => l.text)
  })

  // --- hover names and picking ------------------------------------------------

  let hover = $state<{ name: string; x: number; y: number } | null>(null)
  let host: HTMLDivElement

  function onPointer(e: PointerEvent) {
    if (still) return
    const el = e.target as Element
    const name = el instanceof SVGElement ? el.dataset.name : undefined
    if (!name) {
      hover = null
      return
    }
    const r = host.getBoundingClientRect()
    hover = { name, x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const pickable = $derived(Boolean(onpick) && !revealed && !still)
  function choose(id: string) {
    if (pickable) onpick?.(id)
  }
</script>

<div class="map" class:still bind:this={host} bind:clientWidth={width} bind:clientHeight={height}>
  {#if projection}
    <svg
      viewBox="0 0 {width} {height}"
      role="img"
      aria-label={label}
      onpointermove={onPointer}
      onpointerdown={onPointer}
      onpointerleave={() => (hover = null)}
    >
      <defs>
        <clipPath id={clipId}><path d={allLand} /></clipPath>
      </defs>
      <g transform="translate({t.x},{t.y}) scale({t.k})">
        <!-- Waterlining: rings drawn as wide strokes under the land, so only
             the outer half shows — the old engraved-atlas coastline. -->
        <g class="waterlines" aria-hidden="true">
          {#each [22, 15, 9] as w (w)}
            <path d={allLand} stroke-width={w} class="ring" />
            <path d={allLand} stroke-width={w - 1.6} class="gap" />
          {/each}
        </g>

        <g class="land {scene.basemap}">
          {#each basemap as b (b.f.properties.id)}
            <path d={b.d} data-name={still ? undefined : nameOf(b.f)} />
          {/each}
        </g>

        {#if relief.length}
          <!-- Elevation tints, clipped to the basemap coast so they never spill into the sea;
               borders are redrawn on top, thin, so countries stay readable. -->
          <g class="relief" clip-path="url(#{clipId})" aria-hidden="true">
            {#each relief as r (r.min)}
              <path d={r.d} style="fill: {reliefFill(r.min)}" />
            {/each}
          </g>
          <path class="borders-over-relief" d={allLand} aria-hidden="true" />
        {/if}

        <g class="choropleth">
          {#each choropleths as c (c.key)}
            <path d={c.d} style="fill: {c.fill}" data-name={c.name} />
          {/each}
        </g>

        <!-- A compared shape: its tint sits under the highlights, its dashed
             outline over them, so overlaps stay readable instead of muddy. -->
        <g class="compare-fill">
          {#each compares as c (c.key)}
            <path d={c.d} style="--c: var(--sw-{c.color})" />
          {/each}
        </g>

        <g class="highlights">
          {#each highlights as h (h.key)}
            <path d={h.d} style="--c: {h.fill}" data-name={h.name} />
          {/each}
        </g>

        <g class="compare-outline">
          {#each compares as c (c.key)}
            <path d={c.d} style="--c: var(--sw-{c.color})" data-name={c.name} />
          {/each}
        </g>

        <g class="lines">
          {#each lines as l (l.key)}
            <path d={l.d} class={l.style} data-name={l.name} />
          {/each}
        </g>

        <g class="candidates" class:pickable>
          {#each candidates as c (c.id)}
            {#if pickable}
              <path
                d={c.d}
                class={c.state}
                role="button"
                tabindex="0"
                aria-label={`${c.i + 1}`}
                onclick={() => choose(c.id)}
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    choose(c.id)
                  }
                }}
              />
            {:else}
              <path d={c.d} class={c.state} />
            {/if}
          {/each}
        </g>

        <g class="callouts">
          {#each highlights.filter((h) => h.callout) as h (h.key)}
            <circle cx={h.callout![0]} cy={h.callout![1]} r={10 / t.k} style="--c: {h.fill}" data-name={h.name} />
          {/each}
        </g>
      </g>

      <g class="symbols">
        {#each symbols as s (s.key)}
          {@const xy = applyTransform(t, s.base)}
          <circle cx={xy[0]} cy={xy[1]} r={s.r} style="--c: var(--sw-{s.color})" data-name={s.name} />
        {/each}
      </g>

      <g class="labels" class:settled aria-hidden="true">
        {#each labels as l (l.key)}
          {#if l.marker === 'peak'}
            <path d="M{l.x},{l.y - 6} l6,10 h-12 z" class="marker peak" />
          {:else if l.marker}
            <circle cx={l.x} cy={l.y} r={l.marker === 'capital' ? 4.5 : 3} class="marker {l.marker}" />
          {/if}
          {#if l.visible}
            <text
              x={l.x + l.dx}
              y={l.y + l.dy}
              text-anchor={l.anchor}
              dominant-baseline="middle"
              font-size={l.fontSize}
              class="{l.kind} {l.style ?? ''}">{l.text}</text
            >
          {/if}
        {/each}
      </g>
    </svg>
  {/if}

  {#if hover}
    <div class="tip" style="left: {hover.x}px; top: {hover.y}px">{hover.name}</div>
  {/if}
</div>

<style>
  .map {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--sea);
    touch-action: manipulation;
  }

  /* Sized by the container; the viewBox lets a stale render scale rather
     than crop (e.g. a print layout that lands before the next render). */
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  path {
    vector-effect: non-scaling-stroke;
  }

  .waterlines path {
    fill: none;
    stroke-linejoin: round;
  }
  .waterlines .ring {
    stroke: var(--waterline);
    opacity: 0.55;
  }
  .waterlines .gap {
    stroke: var(--sea);
  }

  .land path {
    fill: var(--land);
    stroke: var(--land);
    stroke-width: 0.5;
  }
  .land.political path {
    stroke: var(--border);
    stroke-width: 0.7;
  }
  .land.physical path {
    fill: var(--relief-0);
    stroke: var(--relief-0);
  }

  .relief path {
    stroke: none;
    animation: appear 0.5s ease both;
  }
  .borders-over-relief {
    fill: none;
    stroke: var(--border-on-relief);
    stroke-width: 0.6;
    pointer-events: none;
  }

  .choropleth path {
    stroke: var(--land);
    stroke-width: 0.8;
    transition: fill 0.4s ease;
    animation: appear 0.4s ease both;
  }

  .highlights path {
    fill: var(--c);
    fill-opacity: 0.88;
    stroke: var(--land);
    stroke-width: 1;
    transition: fill 0.4s ease;
    animation: appear 0.4s ease both;
  }

  .compare-fill path {
    fill: var(--c);
    fill-opacity: 0.3;
    stroke: none;
    animation: appear 0.5s ease 0.3s both;
  }
  .compare-outline path {
    fill: none;
    stroke: var(--c);
    stroke-width: 2.25;
    stroke-dasharray: 7 4;
    animation: appear 0.5s ease 0.3s both;
  }

  .lines path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: appear 0.5s ease both;
  }
  .lines .river {
    stroke: var(--river);
    stroke-width: 2;
  }
  .lines .route {
    stroke: var(--ink);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }

  .candidates path {
    fill: var(--sw-grey);
    fill-opacity: 0.3;
    stroke: var(--ink-soft);
    stroke-width: 1.5;
    transition:
      fill 0.25s ease,
      fill-opacity 0.25s ease;
  }
  .candidates.pickable path {
    cursor: pointer;
  }
  .candidates.pickable path:hover,
  .candidates.pickable path:focus-visible {
    fill: var(--accent);
    fill-opacity: 0.35;
    outline: none;
    stroke: var(--accent);
    stroke-width: 2.5;
  }
  .candidates path.right {
    fill: var(--sw-green);
    fill-opacity: 0.85;
  }
  .candidates path.wrong {
    fill: var(--sw-vermillion);
    fill-opacity: 0.85;
  }

  .callouts circle {
    fill: none;
    stroke: var(--c);
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
    animation: appear 0.4s ease both;
  }

  .symbols circle {
    fill: var(--c);
    fill-opacity: 0.72;
    stroke: var(--land);
    stroke-width: 1.25;
    animation: appear 0.4s ease both;
  }

  /* A still map (print) never animates: printing can catch an entrance
     animation at its first frame and drop the layer from the page. */
  .still :global(*) {
    animation: none !important;
    transition: none !important;
  }

  @keyframes appear {
    from {
      opacity: 0;
    }
  }

  .labels {
    opacity: 0;
    transition: opacity 0.25s ease;
    pointer-events: none;
  }
  .labels.settled {
    opacity: 1;
  }

  text {
    font-family: var(--font);
    paint-order: stroke;
    stroke: var(--halo);
    stroke-width: 3.5px;
    stroke-linejoin: round;
    fill: var(--ink);
  }
  text.area {
    font-weight: 700;
  }
  text.point {
    font-weight: 600;
  }
  text.note {
    font-style: italic;
    letter-spacing: 0.12em;
    fill: var(--water-ink);
    stroke: none;
  }
  text.note.region,
  text.note.landform {
    fill: var(--ink-soft);
    stroke: var(--halo);
  }
  text.note.river {
    letter-spacing: 0.04em;
    fill: var(--river);
    stroke: var(--halo);
    font-weight: 600;
  }
  text.compare {
    font-style: italic;
    font-weight: 600;
  }
  text.letter {
    font-weight: 800;
  }

  .marker {
    fill: var(--ink);
    stroke: var(--land);
    stroke-width: 1.5;
  }
  .marker.capital {
    fill: var(--land);
    stroke: var(--ink);
    stroke-width: 2.5;
  }
  .marker.peak {
    fill: var(--ink);
    stroke: var(--halo);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  .tip {
    position: absolute;
    transform: translate(12px, -130%);
    padding: 0.15rem 0.5rem;
    background: var(--ink);
    color: var(--land);
    font-size: 0.85rem;
    border-radius: 3px;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
