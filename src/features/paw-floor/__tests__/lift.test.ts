import { describe, it, expect } from 'vitest'
import { fitSingleLift } from '../lift'
import { stanceBaseline, type PawPositions } from '../stance'
import type { PawName } from '../../../types'

const cam = { x: 0, y: 1.5, z: 0 }

function plantedStance(offset = 0): PawPositions {
  return new Map<PawName, { x: number; y: number; z: number }>([
    ['left_front_paw', { x: 0.80 + offset, y: 0, z: 0.00 }],
    ['right_front_paw', { x: 0.80 + offset, y: 0, z: 0.17 }],
    ['left_back_paw', { x: 1.18 + offset, y: 0, z: 0.00 }],
    ['right_back_paw', { x: 1.18 + offset, y: 0, z: 0.17 }],
  ])
}

const planted = Array.from({ length: 30 }, (_, i) => ({ paws: plantedStance(i * 0.001), cam }))
const qualified = stanceBaseline(planted)

describe('fitSingleLift', () => {
  it('recovers a known 10 cm lift and names the right paw', () => {
    // 0.80 m radius lifted 0.10 m projects to 0.80 * 1.5/1.40 = 0.857142857.
    const frame = plantedStance()
    frame.set('left_front_paw', { x: 0.857142857, y: 0, z: 0.00 })

    const fit = fitSingleLift(frame, cam, qualified)!
    expect(fit.paw).toBe('left_front_paw')
    expect(fit.liftM).toBeCloseTo(0.10, 2)
  })

  it('reports a residual improvement', () => {
    const frame = plantedStance()
    frame.set('left_front_paw', { x: 0.857142857, y: 0, z: 0.00 })
    const fit = fitSingleLift(frame, cam, qualified)!
    expect(fit.residualAfterM).toBeLessThan(fit.residualBeforeM / 2)
  })

  it('recovers a lift on a back paw too', () => {
    // 1.18 m radius lifted 0.10 m projects to 1.18 * 1.5/1.40 = 1.264285714.
    const frame = plantedStance()
    frame.set('left_back_paw', { x: 1.264285714, y: 0, z: 0.00 })
    const fit = fitSingleLift(frame, cam, qualified)!
    expect(fit.paw).toBe('left_back_paw')
    expect(fit.liftM).toBeCloseTo(0.10, 2)
  })

  it('returns null for a fully planted frame', () => {
    expect(fitSingleLift(plantedStance(), cam, qualified)).toBeNull()
  })

  it('returns null when the baseline does not qualify', () => {
    const loose = stanceBaseline(planted.slice(0, 5))
    expect(loose.qualified).toBe(false)
    const frame = plantedStance()
    frame.set('left_front_paw', { x: 0.857142857, y: 0, z: 0.00 })
    expect(fitSingleLift(frame, cam, loose)).toBeNull()
  })

  it('never returns a lift at the search ceiling', () => {
    // Garbage geometry must not be rescued by pinning the lift at the cap —
    // this is the failure mode that got the estimator gated in the first place.
    const frame = plantedStance()
    frame.set('left_front_paw', { x: 3.0, y: 0, z: 2.0 })
    const fit = fitSingleLift(frame, cam, qualified)
    expect(fit === null || fit.liftM < 0.40).toBe(true)
  })
})
