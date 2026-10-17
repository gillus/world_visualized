import { SWATCHES, type Swatch } from '@atlas/spec'

// Groups without an explicit colour take the next Okabe–Ito swatch; grey is
// reserved for "context, not the point" and never assigned automatically.
const AUTO = SWATCHES.filter((s) => s !== 'grey')

export function groupColor(color: Swatch | undefined, index: number): Swatch {
  return color ?? AUTO[index % AUTO.length]
}
