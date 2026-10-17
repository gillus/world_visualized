// Shareable state: ?lesson=uk-geografia&step=quattro-nazioni&lang=it
// (+ &frame=2 inside a step with frames, ?quiz=3 for a quiz question,
// &print=1 for the printable version). Pure functions — the app decides when
// to read and write.

import { LANGS, type Lang } from '@atlas/spec'
import type { Position } from './pages'

export interface UrlState extends Position {
  lesson?: string
  lang?: Lang
  print?: boolean
}

const positiveInt = (v: string | null) => (v && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : undefined)

export function readUrl(search: string): UrlState {
  const p = new URLSearchParams(search)
  const lang = p.get('lang')
  return {
    lesson: p.get('lesson') ?? undefined,
    step: p.get('step') ?? undefined,
    frame: positiveInt(p.get('frame')),
    quiz: positiveInt(p.get('quiz')),
    lang: (LANGS as readonly string[]).includes(lang ?? '') ? (lang as Lang) : undefined,
    print: p.get('print') === '1',
  }
}

export function writeUrl(state: UrlState): string {
  const p = new URLSearchParams()
  if (state.lesson) p.set('lesson', state.lesson)
  if (state.quiz !== undefined) p.set('quiz', String(state.quiz))
  else if (state.step) {
    p.set('step', state.step)
    if (state.frame !== undefined) p.set('frame', String(state.frame))
  }
  if (state.lang && state.lang !== 'it') p.set('lang', state.lang)
  if (state.print) p.set('print', '1')
  const s = p.toString()
  return s ? `?${s}` : location.pathname
}
