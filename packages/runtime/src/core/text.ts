// Lesson prose is plain text with blank-line paragraphs, **bold** and *italic*.
// Parsed into tokens (never HTML), so a lesson can't inject markup.

export interface Span {
  text: string
  bold: boolean
  italic: boolean
}

export function paragraphs(text: string): Span[][] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(spans)
}

function spans(paragraph: string): Span[] {
  const out: Span[] = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let last = 0
  for (let m = re.exec(paragraph); m; m = re.exec(paragraph)) {
    if (m.index > last) out.push({ text: paragraph.slice(last, m.index), bold: false, italic: false })
    out.push({ text: m[1] ?? m[2], bold: m[1] !== undefined, italic: m[2] !== undefined })
    last = m.index + m[0].length
  }
  if (last < paragraph.length) out.push({ text: paragraph.slice(last), bold: false, italic: false })
  return out
}
