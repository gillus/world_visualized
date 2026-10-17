// ---------------------------------------------------------------------------
// A lesson as a flat sequence of pages: every step (or each frame of a step
// with frames), then one page per quiz question, then the score. "Next" and
// "Back" walk this list; each page carries the map scene it shows.
// ---------------------------------------------------------------------------

import type { Basemap, Extent, Frame, Layer, Lesson, Question, Step } from '@atlas/spec'

/** What the map shows. */
export interface Scene {
  basemap: Basemap
  view: Extent
  layers: Layer[]
  /** A "find it on the map" question: tappable candidates (the answer shows once revealed). */
  pick?: { data: string; ids: string[]; answer: string }
}

export type Page =
  | { kind: 'step'; stepIndex: number; step: Step; frameIndex: number | null; frame: Frame | null; scene: Scene }
  | { kind: 'question'; questionIndex: number; question: Question; scene: Scene }
  | { kind: 'score'; scene: Scene }

export function lessonPages(lesson: Lesson): Page[] {
  const pages: Page[] = []
  lesson.steps.forEach((step, stepIndex) => {
    const basemap = step.basemap ?? lesson.map.basemap
    const view = step.view ?? lesson.map.extent
    if (!step.frames) {
      pages.push({ kind: 'step', stepIndex, step, frameIndex: null, frame: null, scene: { basemap, view, layers: step.layers } })
      return
    }
    step.frames.forEach((frame, frameIndex) => {
      pages.push({
        kind: 'step',
        stepIndex,
        step,
        frameIndex,
        frame,
        scene: { basemap, view: frame.view ?? view, layers: [...step.layers, ...frame.layers] },
      })
    })
  })
  lesson.quiz.forEach((question, questionIndex) => {
    const scene: Scene = {
      basemap: question.basemap ?? lesson.map.basemap,
      view: question.view ?? lesson.map.extent,
      layers: question.type === 'choice' ? question.layers : [],
      pick: question.type === 'locate' ? { data: question.data, ids: question.ids, answer: question.answer } : undefined,
    }
    pages.push({ kind: 'question', questionIndex, question, scene })
  })
  if (lesson.quiz.length) {
    pages.push({ kind: 'score', scene: { basemap: lesson.map.basemap, view: lesson.map.extent, layers: [] } })
  }
  return pages
}

/** URL position ↔ page index. Steps use their id (+ frame number from 1);
 *  quiz pages their number from 1. The score has no URL of its own (answers
 *  aren't kept), so it maps to the last question. */
export interface Position {
  step?: string
  frame?: number
  quiz?: number
}

export function pageIndexOf(pages: Page[], pos: Position): number {
  const i = pages.findIndex((p) =>
    pos.quiz !== undefined
      ? p.kind === 'question' && p.questionIndex === pos.quiz - 1
      : p.kind === 'step' && p.step.id === pos.step && (p.frameIndex ?? 0) === Math.max(0, (pos.frame ?? 1) - 1),
  )
  return Math.max(0, i)
}

export function positionOf(pages: Page[], index: number): Position {
  const page = pages[index]
  if (page.kind === 'step') return { step: page.step.id, frame: page.frameIndex === null ? undefined : page.frameIndex + 1 }
  if (page.kind === 'question') return { quiz: page.questionIndex + 1 }
  return { quiz: pages.filter((p) => p.kind === 'question').length }
}
