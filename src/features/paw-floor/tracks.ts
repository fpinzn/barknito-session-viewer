import type { PawFloorFrame, PawName } from '../../types'
import type { Vec3 } from './geometry'
import { detectCollapsedPaws } from './collapse'
import { detectJerkSpikes } from './jerk'
import type { PawPositions, StanceBaseline } from './stance'

export interface TrackSample {
  ts: number
  world: Vec3
  /**
   * Something contradicts this sample, so it is drawn as a break in the track
   * rather than a real stride. Two independent tests set it:
   *
   * - `collapse` — this paw shares a point with another, an identity swap that
   *   persists for several frames while the paw appears stationary.
   * - `jerk` — this paw departed and immediately returned, a single-frame
   *   teleport that leaves the stance geometry intact.
   *
   * Neither test subsumes the other.
   */
  suspect: boolean
  suspectReason: 'collapse' | 'jerk' | null
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
      const isCollapsed = collapsed?.has(name) ?? false
      out.get(name)!.push({
        ts: frame.ts,
        world: paw.world,
        suspect: isCollapsed,
        suspectReason: isCollapsed ? 'collapse' : null,
      })
    }
  }

  for (const samples of out.values()) {
    samples.sort((a, b) => a.ts - b.ts)

    // Second, independent pass: single-frame teleports the collapse test cannot
    // see, because they leave the rest of the stance untouched.
    for (const i of detectJerkSpikes(samples)) {
      if (samples[i].suspect) continue
      samples[i].suspect = true
      samples[i].suspectReason = 'jerk'
    }
  }

  return out
}
