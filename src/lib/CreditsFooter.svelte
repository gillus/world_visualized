<script lang="ts">
  import type { AtlasMeta } from '../core/types'
  let {
    sources,
    generatedNote,
  }: { sources: AtlasMeta['sources']; generatedNote: string } = $props()
  let open = $state(false)
</script>

<footer>
  <span class="note">{generatedNote}</span>
  <button class="link" onclick={() => (open = !open)}>Sources &amp; credits</button>
</footer>

{#if open}
  <div class="sheet" role="dialog" aria-label="Sources and credits">
    <button class="close" onclick={() => (open = false)} aria-label="Close">×</button>
    <h3>Sources &amp; credits</h3>
    <ul>
      {#each sources as s}
        <li>
          <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
          <span class="lic">{s.license}</span>
        </li>
      {/each}
    </ul>
    <p class="tiny">
      Built as an educational project. Data is shown for learning, with all the caveats that come
      with historical estimates.
    </p>
  </div>
{/if}

<style>
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.3rem 1rem;
    background: var(--bg);
    border-top: 1px solid var(--border);
    font-size: 0.7rem;
    color: var(--ink-dim);
  }
  .link {
    border: none;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    font-size: 0.7rem;
  }
  .sheet {
    position: fixed;
    right: 1rem;
    bottom: 2.4rem;
    width: 22rem;
    max-width: calc(100vw - 2rem);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem 1.1rem;
    z-index: 800;
    box-shadow: 0 6px 26px rgba(0, 0, 0, 0.5);
  }
  .close {
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    border: none;
    background: none;
    color: var(--ink-dim);
    font-size: 1.3rem;
    line-height: 1;
  }
  h3 {
    margin: 0 0 0.6rem;
    font-size: 1rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.45rem;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    font-size: 0.8rem;
  }
  .lic {
    color: var(--ink-dim);
    flex: none;
    font-size: 0.72rem;
  }
  .tiny {
    margin: 0.8rem 0 0;
    font-size: 0.72rem;
    color: var(--ink-dim);
    line-height: 1.4;
  }
</style>
