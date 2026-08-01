import type { PawFloorFrame, PawName } from '../../types'
import type { Vec3 } from './geometry'

export interface TrackSample {
  ts: number
  world: Vec3
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
): Map<PawName, TrackSample[]> {
  const out = new Map<PawName, TrackSample[]>()

  for (const [, frame] of pawFrames) {
    if (frame.ts > currentTs || frame.ts < currentTs - windowMs) continue

    for (const [name, paw] of frame.paws) {
      if (!paw.hit || !paw.world) continue
      if (paw.conf < minConfidence) continue
      if (!out.has(name)) out.set(name, [])
      out.get(name)!.push({ ts: frame.ts, world: paw.world })
    }
  }

  for (const samples of out.values()) {
    samples.sort((a, b) => a.ts - b.ts)
  }

  return out
}
