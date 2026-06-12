<script lang="ts">
  let { note }: { note: string } = $props()
  let open = $state(false)
</script>

<button class="caveat" onclick={() => (open = !open)} title="Why borders look like this">
  ⓘ {note}
</button>

{#if open}
  <div class="popover" role="note">
    <p>
      A map always shows a point of view. The borders here are <b>present-day</b> outlines — they
      don't yet morph as countries split or merge (that's coming). Historical population figures are
      <b>estimates</b> with real uncertainty. Treat contested borders as something to discuss, not a
      settled fact.
    </p>
  </div>
{/if}

<style>
  .caveat {
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--ink-dim);
    border-radius: 999px;
    padding: 0.25rem 0.7rem;
    font-size: 0.74rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 60vw;
  }
  .caveat {
    transition: border-color 0.15s ease, color 0.15s ease;
  }
  .caveat:hover {
    border-color: var(--accent);
    color: var(--ink);
  }
  .popover {
    position: absolute;
    top: 3rem;
    left: 1rem;
    right: 1rem;
    max-width: 34rem;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.8rem 1rem;
    font-size: 0.82rem;
    line-height: 1.45;
    color: var(--ink-dim);
    z-index: 700;
    box-shadow: 0 6px 26px rgba(0, 0, 0, 0.45);
  }
  .popover b {
    color: var(--ink);
  }
</style>
