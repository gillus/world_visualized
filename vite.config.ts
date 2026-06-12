import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Static site — builds to plain files in dist/ for GitHub / Cloudflare Pages.
// `base` can be set to '/<repo>/' later if hosting under a GitHub Pages subpath.
export default defineConfig({
  plugins: [svelte()],
  base: './',
})
