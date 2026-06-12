<script lang="ts">
  interface Point {
    year: number
    value: number | null
  }
  let {
    series,
    currentYear,
    width = 260,
    height = 64,
  }: { series: Point[]; currentYear: number; width?: number; height?: number } = $props()

  const PAD = 4

  // Build the path, breaking the line wherever data is missing.
  let geom = $derived.by(() => {
    const vals = series.map((p) => p.value).filter((v): v is number => v != null)
    if (vals.length === 0 || series.length === 0) {
      return { path: '', areaPath: '', dot: null as null | { x: number; y: number } }
    }
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const y0 = series[0].year
    const y1 = series[series.length - 1].year
    const xspan = Math.max(1, y1 - y0)
    const yspan = Math.max(1e-9, max - min)

    const px = (yr: number) => PAD + ((yr - y0) / xspan) * (width - 2 * PAD)
    const py = (v: number) => height - PAD - ((v - min) / yspan) * (height - 2 * PAD)

    // Split into contiguous runs so both the line and its area fill break
    // wherever data is missing.
    const segments: Array<Array<{ x: number; y: number }>> = []
    let run: Array<{ x: number; y: number }> = []
    for (const p of series) {
      if (p.value == null) {
        if (run.length) segments.push(run)
        run = []
        continue
      }
      run.push({ x: px(p.year), y: py(p.value) })
    }
    if (run.length) segments.push(run)

    const fmt = (n: number) => n.toFixed(1)
    const path = segments
      .map((seg) => seg.map((p, i) => `${i ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`).join(' '))
      .join(' ')
    const baseline = height - PAD
    const areaPath = segments
      .filter((seg) => seg.length > 1)
      .map(
        (seg) =>
          seg.map((p, i) => `${i ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`).join(' ') +
          ` L${fmt(seg[seg.length - 1].x)} ${fmt(baseline)} L${fmt(seg[0].x)} ${fmt(baseline)} Z`,
      )
      .join(' ')

    const cur = series.find((p) => p.year === currentYear)
    const dot = cur && cur.value != null ? { x: px(cur.year), y: py(cur.value) } : null
    return { path, areaPath, dot }
  })
</script>

<svg class="spark" viewBox="0 0 {width} {height}" width={width} height={height} role="img">
  <defs>
    <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28" />
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02" />
    </linearGradient>
  </defs>
  {#if geom.areaPath}
    <path d={geom.areaPath} fill="url(#spark-fill)" stroke="none" />
  {/if}
  {#if geom.path}
    <path d={geom.path} fill="none" stroke="var(--accent)" stroke-width="1.6" />
  {/if}
  {#if geom.dot}
    <line x1={geom.dot.x} y1={PAD} x2={geom.dot.x} y2={height - PAD} class="cursor" />
    <circle cx={geom.dot.x} cy={geom.dot.y} r="3.2" fill="var(--accent)" />
  {/if}
</svg>

<style>
  .spark {
    display: block;
    width: 100%;
    height: auto;
  }
  .cursor {
    stroke: var(--ink-dim);
    stroke-width: 1;
    stroke-dasharray: 2 2;
    opacity: 0.6;
  }
</style>
