/**
 * Fraction of the session timeline that has a paw sample close enough to draw.
 *
 * The scene layer only renders when a paw frame sits within its match tolerance
 * of the current frame. Sessions vary enormously here — measured 31% to 96%
 * across six bundles — so a session with sparse detections looks broken when it
 * is merely empty. Surfacing this number is what tells those two apart.
 */
export function timelineCoverage(
  pawTs: number[],
  sensorTs: number[],
  toleranceMs: number,
): number {
  if (pawTs.length === 0 || sensorTs.length === 0) return 0

  const paw = [...pawTs].sort((a, b) => a - b)
  let covered = 0

  for (const t of sensorTs) {
    // Binary search for the insertion point, then check both neighbours.
    let lo = 0
    let hi = paw.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (paw[mid] < t) lo = mid + 1
      else hi = mid
    }
    const near = Math.min(
      Math.abs(paw[lo] - t),
      lo > 0 ? Math.abs(paw[lo - 1] - t) : Infinity,
    )
    if (near <= toleranceMs) covered++
  }

  return covered / sensorTs.length
}
