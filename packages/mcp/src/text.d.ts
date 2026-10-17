// Markdown files are bundled as strings (wrangler.jsonc `rules`).
declare module '*.md' {
  const text: string
  export default text
}
