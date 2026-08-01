/** Shortest trail the slider allows, in seconds. */
export const TRAIL_MIN_S = 0.5
/** Smallest upper bound, so the slider stays draggable on a very short session. */
export const TRAIL_MIN_MAX = 5
/** Longest trail we will draw, in seconds — a guard on map draw cost. */
export const TRAIL_CEILING_S = 300

export interface TrailBounds {
  min: number
  max: number
}

/**
 * Slider range for the paw trail length.
 *
 * The upper bound follows the session so dragging to the end shows the whole
 * route: measured sessions run 11.7 s to 79.5 s. It is rounded up so the last
 * sample is always inside the window, floored so a short session still has a
 * usable range, and capped so an unexpectedly long one cannot make the map
 * prohibitively expensive to draw.
 */
export function trailBoundsSeconds(sessionSpanMs: number): TrailBounds {
  if (!Number.isFinite(sessionSpanMs) || sessionSpanMs <= 0) {
    return { min: TRAIL_MIN_S, max: TRAIL_MIN_MAX }
  }

  const whole = Math.ceil(sessionSpanMs / 1000)
  return {
    min: TRAIL_MIN_S,
    max: Math.min(TRAIL_CEILING_S, Math.max(TRAIL_MIN_MAX, whole)),
  }
}
