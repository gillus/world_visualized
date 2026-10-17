export * from './lesson'
export * from './catalog'
export * from './check'
export * from './context'
export * from './jsonSchema'

import type { Lang, Text } from './lesson'

/** The string for `lang`, falling back to Italian (always present). */
export function pick(text: Text, lang: Lang): string {
  return text[lang] ?? text.it
}
