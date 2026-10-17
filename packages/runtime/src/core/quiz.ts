// Quiz answers: a choice index, or the id of the area tapped on the map.

import type { Question } from '@atlas/spec'

export type Answer = number | string

export function isRight(q: Question, a: Answer): boolean {
  return a === q.answer
}

export function scoreOf(quiz: Question[], answers: (Answer | null)[]): number {
  return quiz.reduce((n, q, i) => n + (answers[i] !== null && answers[i] !== undefined && isRight(q, answers[i]!) ? 1 : 0), 0)
}
