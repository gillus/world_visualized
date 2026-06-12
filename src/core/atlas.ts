// ---------------------------------------------------------------------------
// The atlas application store: holds AtlasState, exposes intent-revealing
// actions, drives the play loop, and keeps the URL in sync. Framework-agnostic
// (uses DOM globals only — no Svelte), so the Svelte shell just subscribes.
// ---------------------------------------------------------------------------

import { createStore, type WritableStore } from './store'
import { readUrl, writeUrl } from './urlState'
import type { AtlasData, AtlasState, MetricId, PopulationMode } from './types'

const PLAY_INTERVAL_MS = 900

export interface Atlas {
  state: WritableStore<AtlasState>
  data: AtlasData
  setYear(year: number): void
  stepYear(delta: number): void
  setMetric(metric: MetricId): void
  setPopulationMode(mode: PopulationMode): void
  select(iso: string | null): void
  togglePlay(): void
  destroy(): void
}

export function createAtlas(data: AtlasData): Atlas {
  const { yearMin, yearMax } = data.meta

  // Initial state: defaults, overridden by anything in the URL.
  const fromUrl = readUrl(window.location.search)
  const initial: AtlasState = {
    year: clamp(fromUrl.year ?? yearMax, yearMin, yearMax),
    metric: fromUrl.metric ?? 'population',
    populationMode: fromUrl.populationMode ?? 'density',
    selected: fromUrl.selected ?? null,
    playing: false,
  }

  const state = createStore<AtlasState>(initial)
  let timer: ReturnType<typeof setInterval> | null = null

  // Keep the URL shareable, without spamming history entries.
  const unsubUrl = state.subscribe((s) => {
    const next = writeUrl(s)
    if (next !== window.location.search) {
      window.history.replaceState(null, '', next)
    }
  })

  function clampState() {
    state.update((s) => ({ ...s, year: clamp(s.year, yearMin, yearMax) }))
  }

  function stopTimer() {
    if (timer != null) {
      clearInterval(timer)
      timer = null
    }
  }

  const atlas: Atlas = {
    state,
    data,
    setYear(year) {
      state.update((s) => ({ ...s, year: clamp(Math.round(year), yearMin, yearMax) }))
    },
    stepYear(delta) {
      state.update((s) => ({ ...s, year: clamp(s.year + delta, yearMin, yearMax) }))
    },
    setMetric(metric) {
      state.update((s) => ({ ...s, metric }))
    },
    setPopulationMode(mode) {
      state.update((s) => ({ ...s, populationMode: mode }))
    },
    select(iso) {
      state.update((s) => ({ ...s, selected: iso }))
    },
    togglePlay() {
      const playing = !state.get().playing
      state.update((s) => ({ ...s, playing }))
      stopTimer()
      if (playing) {
        timer = setInterval(() => {
          state.update((s) => {
            // Loop back to the start when we reach the end.
            const nextYear = s.year >= yearMax ? yearMin : s.year + 1
            return { ...s, year: nextYear }
          })
        }, PLAY_INTERVAL_MS)
      }
    },
    destroy() {
      stopTimer()
      unsubUrl()
    },
  }

  clampState()
  return atlas
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
