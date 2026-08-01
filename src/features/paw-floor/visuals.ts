import type { PawFloorFrame } from '../../types'
import type { TrackSample } from './tracks'

/** Flag colours, shared by the track segments and their point markers. */
export const COLLAPSE_COLOR = 0xdd4444
export const JERK_COLOR = 0xff8800

/** Pair-distance deviation bands, in metres. */
const DEVIATION_GOOD_M = 0.02
const DEVIATION_WARN_M = 0.05

/** Plane height deviation past which the AR plane is tinted, in metres. */
export const PLANE_DRIFT_TINT_M = 0.01

export function pairDeviationColorHex(observedM: number, baselineMedianM: number): number {
  const deviation = Math.abs(observedM - baselineMedianM)
  if (deviation <= DEVIATION_GOOD_M) return 0x44dd88
  if (deviation <= DEVIATION_WARN_M) return 0xddaa44
  return 0xdd4444
}

/** Linear fade from 1 at the present to 0 at the trailing edge of the window. */
export function trackOpacityForAge(ageMs: number, windowMs: number): number {
  if (windowMs <= 0) return 0
  const t = ageMs / windowMs
  if (t <= 0) return 1
  if (t >= 1) return 0
  return 1 - t
}

/**
 * The height the session's hits mostly resolved to.
 *
 * For an even-length list this takes the lower of the two middle values rather
 * than averaging them: plane heights are quantised to the handful of values
 * ARKit reports, and averaging would invent a height no plane ever had.
 */
export function planeMedianY(pawFrames: Map<number, PawFloorFrame>): number | null {
  const ys: number[] = []
  for (const [, frame] of pawFrames) {
    for (const [, paw] of frame.paws) {
      if (paw.hit && paw.world) ys.push(paw.world.y)
    }
  }
  if (ys.length === 0) return null
  ys.sort((a, b) => a - b)
  return ys[Math.floor((ys.length - 1) / 2)]
}

export function planeDriftM(currentY: number, medianY: number): number {
  return Math.abs(currentY - medianY)
}

/**
 * Colour for the track segment between two samples.
 *
 * A segment touching a flagged sample is drawn in that flag's colour rather
 * than the paw's, so a contradicted stretch stands out as part of the trace
 * instead of vanishing from it. Collapse outranks jerk: it is the stronger
 * claim, since it is corroborated by a second paw.
 */
export function trackSegmentColor(
  a: Pick<TrackSample, 'suspectReason'>,
  b: Pick<TrackSample, 'suspectReason'>,
  pawColor: number,
): number {
  if (a.suspectReason === 'collapse' || b.suspectReason === 'collapse') return COLLAPSE_COLOR
  if (a.suspectReason === 'jerk' || b.suspectReason === 'jerk') return JERK_COLOR
  return pawColor
}
