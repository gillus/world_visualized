<script lang="ts">
  import type { Atlas } from '../core/atlas'
  let { atlas }: { atlas: Atlas } = $props()
  const view = atlas.state
  const countries = Object.entries(atlas.data.stats).sort((a, b) => a[1].name.localeCompare(b[1].name))
</script>
<label>Find a country
  <select aria-label="Find a country" value={$view.selected ?? ''} onchange={(e) => atlas.select(e.currentTarget.value || null)}>
    <option value="">Choose a country…</option>
    {#each countries as [iso, country]}<option value={iso}>{country.name}</option>{/each}
  </select>
</label>
<style>
  label { display:grid; gap:.35rem; color:var(--ink-dim); font-size:.8rem; }
  select { background:var(--panel-2); border:1px solid var(--border); color:var(--ink); border-radius:8px; padding:.65rem; max-width:260px; font:inherit; min-height:44px; }
  @media(max-width:700px) { select { max-width:100%; width:100%; } }
</style>
