// The lesson schema as JSON Schema, for the authoring guide: Claude reads this
// rather than the TypeScript. Generated from the zod source, so it can't drift.

import { z } from 'zod'
import { Lesson } from './lesson'

/** JSON Schema (2020-12) of what an author writes: fields with defaults are optional. */
export function lessonJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(Lesson, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>
}
