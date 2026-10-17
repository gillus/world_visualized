// Drafts: validated lessons stored for 30 days so the viewer can show them at
// ?draft=<id> before anything is published. Re-previewing with the same id
// replaces the draft, so a link shared with a parent keeps working while the
// lesson is revised.

/** The subset of KVNamespace drafts and the curriculum need (a Map stands in for it in the smoke test). */
export interface KvStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

export interface Draft {
  lesson: unknown
  /** GitHub login of whoever saved it; only they can replace it. */
  owner: string
  saved: string
}

export const DRAFT_TTL_DAYS = 30
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

export function isDraftId(id: string): boolean {
  return /^[a-z2-9]{12}$/.test(id)
}

export function newDraftId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export async function getDraft(store: KvStore, id: string): Promise<Draft | null> {
  if (!isDraftId(id)) return null
  const raw = await store.get(`draft:${id}`)
  return raw ? (JSON.parse(raw) as Draft) : null
}

export async function putDraft(store: KvStore, id: string, draft: Draft): Promise<void> {
  await store.put(`draft:${id}`, JSON.stringify(draft), { expirationTtl: DRAFT_TTL_DAYS * 24 * 3600 })
}
