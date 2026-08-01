import type { PawName } from '../../types'
import type { PawPositions, StanceBaseline } from './stance'

/**
 * Below this fraction of a pair's baseline separation, the two paws have
 * collapsed onto one another and at least one identity is wrong.
 *
 * Chosen from the six measured sessions: the clean ones (`…-ec14`, `…-eec1`)
 * never drop under 0.35x, so the test does not fire on legitimate stance
 * variation, while `…-801b` trips it on 4.9% of back-paw frames — including
 * ts=7403–7553, where `right_back_paw` sits 0.2 cm from `left_back_paw`
 * against a 24.9 cm baseline.
 */
export const COLLAPSE_RATIO = 0.35

/**
 * Paws whose position this frame is contradicted by the stance geometry.
 *
 * Confidence does not catch this failure: on `…-801b` the bogus
 * `right_back_paw` carried confidence 0.73, higher than the correct sample
 * 170 ms earlier. The model is confidently wrong, so only geometry can reject it.
 */
export function detectCollapsedPaws(
  positions: PawPositions,
  baseline: StanceBaseline,
  ratio: number = COLLAPSE_RATIO,
): Set<PawName> {
  const flagged = new Set<PawName>()

  for (const stat of baseline.pairs) {
    if (stat.median <= 0) continue
    const a = positions.get(stat.pair[0])
    const b = positions.get(stat.pair[1])
    if (!a || !b) continue

    const observed = Math.hypot(a.x - b.x, a.z - b.z)
    if (observed < stat.median * ratio) {
      flagged.add(stat.pair[0])
      flagged.add(stat.pair[1])
    }
  }

  return flagged
}
