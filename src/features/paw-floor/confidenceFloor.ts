import type { PawFloorFrame } from '../../types'
import type { PoseEvent } from '../viewer/frame-utils'

export const PAW_SOURCE_ID = 'paw_floor_projection'

export interface SourceFloor {
  id: string
  min: number
}

export interface ConfidenceFloors {
  /** Lowest confidence present anywhere in the loaded bundle, or null if empty. */
  overallMin: number | null
  /** Per-source minima, sorted by id. */
  sources: SourceFloor[]
}

/**
 * The lowest confidence actually present in the loaded data, overall and per
 * source.
 *
 * Sources do not share a floor. Vision's pose landmarks reach 0.00, while
 * `paw_floor_projection_raycasting_v1` is hard-floored at 0.30 by
 * `PawFloorRaycastCaptureSource`'s `minConfidence` — below that, no paw sample
 * was ever written. Dragging the slider under a source's floor reveals nothing
 * more from it, which is what the panel's tooltip explains.
 */
export function confidenceFloors(
  poseEvents: PoseEvent[],
  pawFrames: Map<number, PawFloorFrame> | null,
): ConfidenceFloors {
  const perSource = new Map<string, number>()

  for (const evt of poseEvents) {
    for (const [modelId, landmarks] of evt.models) {
      for (const [, lm] of landmarks) {
        if (!Number.isFinite(lm.conf)) continue
        const cur = perSource.get(modelId)
        if (cur === undefined || lm.conf < cur) perSource.set(modelId, lm.conf)
      }
    }
  }

  if (pawFrames) {
    for (const [, frame] of pawFrames) {
      for (const [, paw] of frame.paws) {
        if (!Number.isFinite(paw.conf)) continue
        const cur = perSource.get(PAW_SOURCE_ID)
        if (cur === undefined || paw.conf < cur) perSource.set(PAW_SOURCE_ID, paw.conf)
      }
    }
  }

  const sources = [...perSource.entries()]
    .map(([id, min]) => ({ id, min }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const overallMin = sources.length === 0
    ? null
    : sources.reduce((acc, s) => Math.min(acc, s.min), Infinity)

  return { overallMin, sources }
}
