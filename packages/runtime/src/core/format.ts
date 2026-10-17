// Numbers for students: thousands separators in the reader's language.
// Italian groups with a narrow space (1 345, 35 400), as the lesson texts
// and school books write it, rather than Intl's dot — and from four digits up.

import type { Lang } from '@atlas/spec'

const locale = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'it-IT')

export function formatNumber(value: number, lang: Lang, decimals = 0): string {
  const nf = new Intl.NumberFormat(locale(lang), {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
    useGrouping: 'always',
  })
  if (lang === 'en') return nf.format(value)
  return nf
    .formatToParts(value)
    .map((p) => (p.type === 'group' ? '\u202f' : p.value))
    .join('')
}

/** Round to `digits` significant digits — for legend limits and circle sizes. */
export function niceRound(value: number, digits = 2): number {
  if (value === 0) return 0
  const p = 10 ** (Math.floor(Math.log10(Math.abs(value))) - digits + 1)
  return Math.round(value / p) * p
}
