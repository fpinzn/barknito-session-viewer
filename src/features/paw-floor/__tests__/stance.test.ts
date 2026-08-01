import { describe, it, expect } from 'vitest'
import { stanceBaseline, stanceResidualM, type PawPositions } from '../stance'
import type { PawName } from '../../../types'

const cam = { x: 0, y: 1.5, z: 0 }

/** A planted stance: 0.17 m across, 0.38 m front-to-back. */
function plantedStance(offset = 0): PawPositions {
  return new Map<PawName, { x: number; y: number; z: number }>([
    ['left_front_paw', { x: 0.80 + offset, y: 0, z: 0.00 }],
    ['right_front_paw', { x: 0.80 + offset, y: 0, z: 0.17 }],
    ['left_back_paw', { x: 1.18 + offset, y: 0, z: 0.00 }],
    ['right_back_paw', { x: 1.18 + offset, y: 0, z: 0.17 }],
  ])
}

const planted = Array.from({ length: 30 }, (_, i) => ({
  paws: plantedStance(i * 0.001),
  cam,
}))

describe('stanceBaseline', () => {
  it('recovers the pairwise medians of a rigid stance', () => {
    const b = stanceBaseline(planted)
    const find = (a: PawName, c: PawName) =>
      b.pairs.find(p =>
        (p.pair[0] === a && p.pair[1] === c) || (p.pair[0] === c && p.pair[1] === a))!
    expect(find('left_front_paw', 'right_front_paw').median).toBeCloseTo(0.17, 3)
    expect(find('left_front_paw', 'left_back_paw').median).toBeCloseTo(0.38, 3)
  })

  it('qualifies a rigid stance', () => {
    expect(stanceBaseline(planted).qualified).toBe(true)
  })

  it('reports near-zero relative IQR for a rigid stance', () => {
    for (const p of stanceBaseline(planted).pairs) {
      expect(p.relIQR).toBeLessThan(0.05)
    }
  })

  it('does not qualify when pairs have too few samples', () => {
    expect(stanceBaseline(planted.slice(0, 5)).qualified).toBe(false)
  })

  it('qualifies on three stable pairs when a paw is missing entirely', () => {
    // Mirrors session 8410: right_back_paw is almost never detected, leaving
    // only three pairs, but the three are tight and the session is usable.
    const threePaw = planted.map(o => {
      const paws = new Map(o.paws)
      paws.delete('right_back_paw')
      return { paws, cam }
    })
    const b = stanceBaseline(threePaw)
    expect(b.pairs.length).toBe(3)
    expect(b.qualified).toBe(true)
  })

  it('does not qualify a loose stance', () => {
    // Mirrors the moving sessions: front paws swing between 0.05 and 0.35 m.
    const loose = planted.map((o, i) => {
      const paws = new Map(o.paws)
      paws.set('right_front_paw', { x: 0.80, y: 0, z: i % 2 === 0 ? 0.05 : 0.35 })
      return { paws, cam }
    })
    expect(stanceBaseline(loose).qualified).toBe(false)
  })
})

describe('stanceResidualM', () => {
  it('is ~zero for a frame matching the baseline', () => {
    const b = stanceBaseline(planted)
    expect(stanceResidualM(plantedStance(), cam, b)!).toBeLessThan(0.005)
  })

  it('grows when a paw is displaced', () => {
    const b = stanceBaseline(planted)
    const bad = plantedStance()
    bad.set('left_front_paw', { x: 1.10, y: 0, z: 0.00 })
    const good = stanceResidualM(plantedStance(), cam, b)!
    const worse = stanceResidualM(bad, cam, b)!
    expect(worse).toBeGreaterThan(good + 0.05)
  })

  it('applies a lift correction before measuring', () => {
    const b = stanceBaseline(planted)
    // left_front_paw lifted 0.10 m projects from 0.80 to 0.857142857.
    const lifted = plantedStance()
    lifted.set('left_front_paw', { x: 0.857142857, y: 0, z: 0.00 })
    const uncorrected = stanceResidualM(lifted, cam, b)!
    const corrected = stanceResidualM(lifted, cam, b, { left_front_paw: 0.10 })!
    expect(corrected).toBeLessThan(uncorrected / 2)
  })

  it('returns null with fewer than two usable pairs', () => {
    const b = stanceBaseline(planted)
    const one = new Map(plantedStance())
    one.delete('left_back_paw')
    one.delete('right_back_paw')
    one.delete('right_front_paw')
    expect(stanceResidualM(one, cam, b)).toBeNull()
  })
})
