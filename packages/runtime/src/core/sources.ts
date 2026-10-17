// How each kind of source is shown and linked. Wikipedia and Wikidata links
// point at the pinned revision, so the student reads exactly what we cited.

import type { Source } from '@atlas/spec'

export interface SourceView {
  label: string
  detail: string
  href: string
  licence?: { name: string; href: string }
}

const CC_BY_SA = { name: 'CC BY-SA 4.0', href: 'https://creativecommons.org/licenses/by-sa/4.0/deed.it' }
const CC0 = { name: 'CC0', href: 'https://creativecommons.org/publicdomain/zero/1.0/deed.it' }

export function describeSource(s: Source): SourceView {
  switch (s.kind) {
    case 'wikipedia':
      return {
        label: s.title,
        detail: `Wikipedia (${s.lang})`,
        href: `https://${s.lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(s.title.replace(/ /g, '_'))}&oldid=${s.revid}`,
        licence: CC_BY_SA,
      }
    case 'wikidata':
      return {
        label: s.label,
        detail: `Wikidata ${s.qid}`,
        href: `https://www.wikidata.org/w/index.php?title=${s.qid}&oldid=${s.revid}`,
        licence: CC0,
      }
    case 'web':
      return { label: s.title, detail: s.publisher ?? new URL(s.url).hostname, href: s.url }
  }
}
