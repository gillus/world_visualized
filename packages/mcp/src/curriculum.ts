// Curriculum: what each child is studying at school, so lessons can follow it.
// A scheduled Claude task on the family PC reads the school register (Argo)
// through the local school connector and saves one snapshot per child with
// save_curriculum; authors read it with get_curriculum. Only what a lesson
// needs is kept: topics taught and upcoming homework and tests — no grades,
// absences or names. All snapshots live under one key in the drafts KV, which
// the public /drafts/<id> route never reads.

import { z } from 'zod'
import type { KvStore } from './drafts'

const KEY = 'curriculum'
/** After this many days without a save, get_curriculum says the snapshot is stale. */
export const STALE_DAYS = 7

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date as YYYY-MM-DD')
// The register is copied in here by a model; refuse what looks like contact details.
const Text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/\S+@\S+\.\S+/.test(s), 'no email addresses')

export const StudentId = z
  .string()
  .regex(/^[a-z0-9_-]{1,32}$/, 'the school connector’s student id, e.g. "s"')
  .describe('The student id used by the school connector (list_students), e.g. "s"')

export const Snapshot = z.object({
  student: StudentId,
  class: Text(60).describe('Class and school level, e.g. "2ª media" or "3º liceo scientifico"'),
  school_year: Text(20).optional().describe('e.g. "2026/2027"'),
  as_of: Day.describe('Date of the register data (usually today)'),
  subjects: z
    .array(
      z.object({
        subject: Text(80).describe('As the register names it, e.g. "STORIA"'),
        topics: z
          .array(z.object({ date: Day, topic: Text(400) }))
          .max(60)
          .describe('Topics taught (argomenti di lezione), newest first, copied from the register'),
        upcoming: z
          .array(
            z.object({
              date: Day,
              kind: z.enum(['homework', 'test', 'reminder']).describe('test = a verifica, interrogazione or other assessment'),
              text: Text(400),
            }),
          )
          .max(30)
          .describe('Homework due, tests and teacher reminders from today on, soonest first'),
      }),
    )
    .max(25),
})
export type Snapshot = z.infer<typeof Snapshot>

interface Saved extends Snapshot {
  /** GitHub login of whoever saved it, and when. */
  saved_by: string
  saved: string
}

type Store = Record<string, Saved>

async function read(store: KvStore): Promise<Store> {
  const raw = await store.get(KEY)
  return raw ? (JSON.parse(raw) as Store) : {}
}

export async function saveCurriculum(store: KvStore, snapshot: Snapshot, user: string): Promise<Saved> {
  const all = await read(store)
  const saved: Saved = { ...snapshot, saved_by: user, saved: new Date().toISOString() }
  all[snapshot.student] = saved
  await store.put(KEY, JSON.stringify(all))
  return saved
}

/** One student's snapshot, or all of them, each with its age and a staleness note. */
export async function getCurriculum(store: KvStore, student?: string) {
  const all = await read(store)
  const annotate = (s: Saved) => {
    const age = Math.floor((Date.now() - Date.parse(s.saved)) / 86400000)
    return { ...s, age_days: age, ...(age > STALE_DAYS ? { stale: `Not updated for ${age} days: it may miss recent topics.` } : {}) }
  }
  if (student) {
    const s = all[student]
    if (!s) throw new Error(`No curriculum for "${student}". Saved: ${Object.keys(all).join(', ') || 'none'}.`)
    return annotate(s)
  }
  return Object.values(all).map(annotate)
}
