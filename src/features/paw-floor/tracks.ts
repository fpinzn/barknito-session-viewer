import type { PawFloorFrame, PawName } from '../../types'
import type { Vec3 } from './geometry'
import { detectCollapsedPaws } from './collapse'
import type { PawPositions, StanceBaseline } from './stance'

export interface TrackSample {
  ts: number
  world: Vec3
  /**
   * The stance geometry contradicts this sample — typically two paws collapsed
   * onto one point after a pose-model identity swap. Drawn as a break in the
   * track rather than a real 28 cm stride.
   */
  suspect: boolean
}

/**
 * Trailing track samples per paw, gated the same way the skeleton gates
 * landmarks — on the `Conf` slider in the parameter panel.
 *
 * At the default 0.3 this drops nothing: `PawFloorRaycastCaptureSource` already
 * floors the recorder at `minConfidence = 0.3f`, so no lower-confidence sample
 * ever reaches the CSV. Raising the slider to 0.4 cuts 4–11% of hits across the
 * measured sessions.
 */
export function collectTrackSamples(
  pawFrames: Map<number, PawFloorFrame>,
  currentTs: number,
  windowMs: number,
  minConfidence: number,
  baseline?: StanceBaseline,
): Map<PawName, TrackSample[]> {
  const out = new Map<PawName, TrackSample[]>()

  for (const [, frame] of pawFrames) {
    if (frame.ts > currentTs || frame.ts < currentTs - windowMs) continue

    // Collapse is judged on the whole frame, before the confidence gate — a
    // swapped paw is often the *more* confident of the two.
    let collapsed: Set<PawName> | null = null
    if (baseline) {
      const positions: PawPositions = new Map()
      for (const [n, p] of frame.paws) {
        if (p.hit && p.world) positions.set(n, p.world)
      }
      collapsed = detectCollapsedPaws(positions, baseline)
    }

    for (const [name, paw] of frame.paws) {
      if (!paw.hit || !paw.world) continue
      if (paw.conf < minConfidence) continue
      if (!out.has(name)) out.set(name, [])
      out.get(name)!.push({
        ts: frame.ts,
        world: paw.world,
        suspect: collapsed?.has(name) ?? false,
      })
    }
  }

  for (const samples of out.values()) {
    samples.sort((a, b) => a.ts - b.ts)
  }

  return out
}
