import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// The viewer is a static site. `site/` (lessons + baked data) is served as-is
// next to the app, so a lesson is just `?lesson=<id>` → fetch lessons/<id>.json.
// Relative `base` lets it live under a GitHub Pages subpath.
export default defineConfig({
  plugins: [svelte()],
  base: './',
  publicDir: '../../site',
})
