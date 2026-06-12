import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // `atlas` is a set-once application object passed unchanged to every
    // component, so capturing `atlas.state` once is intended — not a bug.
    // Honored by both `svelte-check` and the Vite build.
    warningFilter: (w) => w.code !== 'state_referenced_locally',
  },
}
