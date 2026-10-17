// Wikipedia lookups for citations. Every result carries the revision id it was
// read from, so a lesson can pin exactly the text its claims rest on.

import type { Lang } from '@atlas/spec'

const USER_AGENT = 'world-visualized-mcp/0.1 (https://github.com/gillus/world_visualized)'

async function api(lang: Lang, params: Record<string, string>): Promise<any> {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`)
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', ...params })) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Wikipedia (${lang}) answered ${res.status} ${res.statusText}`)
  const json = (await res.json()) as any
  if (json.error) throw new Error(`Wikipedia (${lang}): ${json.error.info ?? json.error.code}`)
  return json
}

export interface SourceHit {
  title: string
  lang: Lang
  revid: number
  url: string
  wikidata?: string
  disambiguation?: true
  intro: string
  /** Paste into the lesson's `sources` as-is. */
  source: { kind: 'wikipedia'; lang: Lang; title: string; revid: number }
}

/** Search one Wikipedia; each hit with its lead section and current revision. */
export async function findSources(query: string, lang: Lang, limit = 5): Promise<SourceHit[]> {
  const json = await api(lang, {
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(limit),
    prop: 'extracts|revisions|pageprops',
    exintro: '1',
    explaintext: '1',
    exlimit: 'max',
    rvprop: 'ids',
    ppprop: 'wikibase_item|disambiguation',
  })
  const pages: any[] = json.query?.pages ?? []
  pages.sort((a, b) => a.index - b.index)
  return pages
    .filter((p) => p.revisions?.[0]?.revid)
    .map((p) => {
      const revid: number = p.revisions[0].revid
      return {
        title: p.title,
        lang,
        revid,
        url: permalink(lang, p.title, revid),
        wikidata: p.pageprops?.wikibase_item,
        ...(p.pageprops && 'disambiguation' in p.pageprops ? { disambiguation: true as const } : {}),
        intro: clip(p.extract ?? '', 1500),
        source: { kind: 'wikipedia', lang, title: p.title, revid },
      }
    })
}

/** One article as plain text (headings, lists and table rows kept), at a pinned
 *  revision or the current one. */
export async function readSource(title: string, lang: Lang, revid?: number, maxChars = 15000) {
  const json = await api(lang, {
    action: 'parse',
    ...(revid ? { oldid: String(revid) } : { page: title, redirects: '1' }),
    prop: 'text|revid|properties',
    disabletoc: '1',
    disableeditsection: '1',
  })
  const p = json.parse
  const disambiguation = 'disambiguation' in (p.properties ?? {})
  const text = htmlToText(p.text)
  return {
    title: p.title as string,
    lang,
    revid: p.revid as number,
    url: permalink(lang, p.title, p.revid),
    ...(disambiguation ? { disambiguation: true as const } : {}),
    length: text.length,
    truncated: text.length > maxChars,
    text: clip(text, maxChars),
    source: { kind: 'wikipedia' as const, lang, title: p.title as string, revid: p.revid as number },
  }
}

function permalink(lang: Lang, title: string, revid: number): string {
  return `https://${lang}.wikipedia.org/w/index.php?title=${encodeURIComponent(title.replace(/ /g, '_'))}&oldid=${revid}`
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, '')} …`
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Good enough for reading facts: drops references, styles and navigation boxes,
 *  keeps headings, list items and table cells. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<div[^>]*class="[^"]*(navbox|reflist|references|metadata|noprint)[^"]*"[\s\S]*?<\/div>/gi, '')
    .replace(/<h([2-4])[^>]*>/gi, (_m, n) => `\n\n${'#'.repeat(Number(n))} `)
    .replace(/<\/h[2-4]>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) =>
      e[0] === '#'
        ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
        : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
