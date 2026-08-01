import type { TrackSample } from './tracks'

/** A sample must depart at least this far to be a spike candidate, in metres. */
export const JERK_DEPART_M = 0.08
/** ...and the trajectory must close back up to within this, in metres. */
export const JERK_RETURN_M = 0.04
/** Only judge a triple that spans at most this long, in milliseconds. */
export const JERK_SPAN_MS = 200

/**
 * Indices of samples that depart from the trajectory and immediately return —
 * single-frame teleports, where the pose model put the paw somewhere impossible
 * for one frame.
 *
 * This is deliberately an *out-and-back* test rather than a speed threshold.
 * Raw speed does not separate the two cases: the boundary steps of a genuine
 * identity swap run 1.7–2.3 m/s, which is p95–p99 of legitimate motion in the
 * same session, and 18.4% of `…-dd26`'s steps exceed 1.5 m/s while the dog is
 * simply moving. Requiring the trajectory to close back up is what makes the
 * test specific: measured 0.39–0.56% on `…-eec1` and `…-ec14`, the sessions
 * whose per-step speeds top out at 34 and 47 m/s.
 *
 * It does not catch a *sustained* wrong position — inside the `…-801b` collapse
 * the paw sits still to within 0.6 cm for 116 ms, so nothing here looks wrong.
 * `detectCollapsedPaws` covers that case; the two tests are complementary.
 */
export function detectJerkSpikes(samples: TrackSample[]): Set<number> {
  const flagged = new Set<number>()

  for (let i = 1; i < samples.length - 1; i++) {
    const prev = samples[i - 1]
    const cur = samples[i]
    const next = samples[i + 1]

    if (next.ts - prev.ts > JERK_SPAN_MS) continue

    const out = Math.hypot(cur.world.x - prev.world.x, cur.world.z - prev.world.z)
    if (out < JERK_DEPART_M) continue

    const back = Math.hypot(next.world.x - cur.world.x, next.world.z - cur.world.z)
    if (back < JERK_DEPART_M) continue

    const across = Math.hypot(next.world.x - prev.world.x, next.world.z - prev.world.z)
    if (across < JERK_RETURN_M) flagged.add(i)
  }

  return flagged
}
