// ---------------------------------------------------------------------------
// The crosswalk: the small but important table that reconciles how different
// sources name and code countries. In v0 (modern era) this is light — most
// rows join cleanly on ISO 3166-1 alpha-3. It will grow a lot in v2 when we
// add historical entities (empires, dissolved states) that lack modern codes.
// ---------------------------------------------------------------------------

/** A clean ISO3 is exactly three uppercase letters. OWID aggregates
 *  ("OWID_WRL", "OWID_AFR", continents, income groups) fail this test, which
 *  is exactly how we drop non-countries without a hand-maintained blocklist. */
export function isCountryCode(code: string | null | undefined): boolean {
  return !!code && /^[A-Z]{3}$/.test(code)
}

/** OWID uses a few non-standard codes; remap them to the ISO3 we standardise on. */
export const OWID_CODE_REMAP: Record<string, string> = {
  OWID_KOS: 'KOS', // Kosovo — no official ISO; we use the common "KOS".
}

/**
 * Natural Earth marks a handful of de-facto / disputed territories as "-99"
 * in its ISO field. Map those by name so they still join. Anything left
 * unresolved is reported as a warning by the build, not silently dropped.
 */
export const NE_NAME_TO_ISO: Record<string, string> = {
  Kosovo: 'KOS',
}

/** Resolve a Natural Earth feature's properties to a clean ISO3, or null. */
export function resolveNeIso(props: Record<string, unknown>): string | null {
  const eh = String(props.ISO_A3_EH ?? '').trim()
  if (isCountryCode(eh) && eh !== '-99') return eh
  const a3 = String(props.ISO_A3 ?? '').trim()
  if (isCountryCode(a3) && a3 !== '-99') return a3
  const name = String(props.ADMIN ?? props.NAME ?? '').trim()
  return NE_NAME_TO_ISO[name] ?? null
}

/** Normalise an OWID code (apply remap, uppercase). */
export function normalizeOwidCode(code: string): string {
  const c = code.trim()
  return OWID_CODE_REMAP[c] ?? c
}
