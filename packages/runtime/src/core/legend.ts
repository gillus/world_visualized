// ---------------------------------------------------------------------------
// What the colours and shapes on the map mean, for one scene. Pure data; the
// Legend component draws it (on screen and in print).
// ---------------------------------------------------------------------------

import { pick, type Extent, type Lang, valueAtOrBefore } from '@atlas/spec'
import type { LessonData, MapFeature } from './loader'
import type { Scene } from './pages'
import { choroplethValues } from './classify'
import { formatNumber, niceRound } from './format'
import { groupColor } from './palette'
import { ui } from './ui'

export type LegendItem =
  | { kind: 'swatch'; label: string; color: string; dashed?: boolean }
  | { kind: 'classes'; title: string; classes: { color: string; label: string }[] }
  | { kind: 'circles'; title: string; color: string; sizes: { r: number; label: string }[] }
  | { kind: 'line'; label: string; style: 'river' | 'route' }

/** Biggest circle, in screen pixels. Circle *area* is proportional to the value. */
export const SYMBOL_MAX_R = 24

export const symbolRadius = (value: number, max: number) => SYMBOL_MAX_R * Math.sqrt(Math.max(0, value) / max)

/** The numeric `size` values of a symbols layer's features. */
export function symbolValues(features: MapFeature[], size: string): Map<MapFeature, number> {
  const out = new Map<MapFeature, number>()
  for (const f of features) {
    const v = f.properties[size]
    if (typeof v === 'number' && v > 0) out.set(f, v)
  }
  return out
}

/** Features a layer draws: its `ids` (in that order) or everything the handle selects. */
export function layerFeatures(data: LessonData, handle: string, ids?: string[]): MapFeature[] {
  const features = data.handles.get(handle)
  if (!features) return []
  return ids ? ids.map((id) => features.get(id)).filter((f): f is MapFeature => Boolean(f)) : [...features.values()]
}

export function legendFor(scene: Scene, data: LessonData, lang: Lang): LegendItem[] {
  const t = ui(lang)
  const fmt = (v: number, decimals = 0) => formatNumber(v, lang, decimals)
  const items: LegendItem[] = []
  for (const layer of scene.layers) {
    switch (layer.type) {
      case 'highlight':
        layer.groups.forEach((g, i) =>
          items.push({ kind: 'swatch', label: pick(g.label, lang), color: `var(--sw-${groupColor(g.color, i)})` }),
        )
        break
      case 'compare':
        items.push({ kind: 'swatch', label: pick(layer.label, lang), color: `var(--sw-${layer.color})`, dashed: true })
        break
      case 'choropleth': {
        const series = data.series.get(layer.data)
        if (!series) break
        const v = choroplethValues(layer, series, data.handles.get(layer.data)?.keys() ?? [])
        const { breaks, colors } = v.classes
        const d = series.meta.decimals
        const classes = colors.map((color, i) => ({
          color,
          label:
            i === 0
              ? t.below(fmt(breaks[0], d))
              : i === colors.length - 1
                ? t.atLeast(fmt(breaks[i - 1], d))
                : `${fmt(breaks[i - 1], d)} – ${fmt(breaks[i], d)}`,
        }))
        if (v.anyMissing) classes.push({ color: 'var(--no-data)', label: t.noData })
        const unit = pick(series.meta.unit, lang)
        items.push({ kind: 'classes', title: `${pick(layer.title, lang)} — ${unit}, ${v.years.join('/')}`, classes })
        break
      }
      case 'symbols': {
        const values = [...symbolValues(layerFeatures(data, layer.data, layer.ids), layer.size).values()]
        if (!values.length) break
        const max = Math.max(...values)
        const big = niceRound(max, 1)
        const small = niceRound(max / 8, 1)
        items.push({
          kind: 'circles',
          title: pick(layer.title, lang),
          color: `var(--sw-${layer.color})`,
          sizes: [big, small].map((v) => ({ r: symbolRadius(v, max), label: t.compactNumber(v) })),
        })
        break
      }
      case 'lines':
        items.push({ kind: 'line', label: layer.style === 'river' ? t.rivers : t.routes, style: layer.style })
        break
    }
  }
  return items
}

/** Relief bands that appear inside `view`, lowest first (for the physical legend). */
export function reliefBandsIn(relief: MapFeature[], [[w, s], [e, n]]: Extent): number[] {
  const bands: number[] = []
  for (const f of relief) {
    const g = f.geometry
    const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : []
    const hit = polys.some((poly) => poly[0].some(([x, y]) => x >= w && x <= e && y >= s && y <= n))
    if (hit) bands.push(Number(f.properties.min))
  }
  return bands
}

/** A value for the hover tooltip of a choropleth area. */
export function seriesLabel(data: LessonData, handle: string, id: string, year: number, lang: Lang): string | null {
  const series = data.series.get(handle)
  const hit = series && valueAtOrBefore(series.file.values[id], year)
  if (!series) return null
  if (!hit) return ui(lang).noData
  return `${formatNumber(hit[0], lang, series.meta.decimals)} ${pick(series.meta.unit, lang)} (${hit[1]})`
}
