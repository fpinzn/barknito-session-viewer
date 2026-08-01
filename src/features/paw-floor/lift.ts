import type { PawName } from '../../types'
import type { Vec3 } from './geometry'
import { stanceResidualM, type PawPositions, type StanceBaseline } from './stance'

export interface LiftFit {
  paw: PawName
  liftM: number
  residualBeforeM: number
  residualAfterM: number
}

/** Search granularity and ceiling for the single-lift solver. */
const STEP_M = 0.01
const MAX_LIFT_M = 0.40
/** A fit must at least halve the residual to be reported. */
const REQUIRED_IMPROVEMENT = 0.5

/**
 * Estimate which single paw is lifted, and by how much.
 *
 * Gated behind `baseline.qualified` on purpose. Allowed to run against a loose
 * baseline the solver absorbs gait into the lift parameter and pins every paw
 * against the ceiling — measured at 21–26 cm "lifts" for a standing dog on
 * session 20260731-010534-dd26. Returns null rather than guess.
 */
export function fitSingleLift(
  paws: PawPositions,
  cam: Vec3,
  baseline: StanceBaseline,
): LiftFit | null {
  if (!baseline.qualified) return null

  const before = stanceResidualM(paws, cam, baseline)
  if (before === null) return null

  let best: LiftFit | null = null

  for (const paw of paws.keys()) {
    for (let lift = STEP_M; lift <= MAX_LIFT_M + 1e-9; lift += STEP_M) {
      const after = stanceResidualM(paws, cam, baseline, { [paw]: lift })
      if (after === null) continue
      if (best === null || after < best.residualAfterM) {
        best = { paw, liftM: lift, residualBeforeM: before, residualAfterM: after }
      }
    }
  }

  if (best === null) return null
  // Reject a fit that merely nudged the residual, and reject one that only
  // "works" by saturating the search — both mean the model does not apply.
  if (best.residualAfterM > before * REQUIRED_IMPROVEMENT) return null
  if (best.liftM >= MAX_LIFT_M - 1e-9) return null

  return best
}
