import { describe, it, expect } from 'vitest'
import { detectCollapsedPaws } from '../collapse'
import type { StanceBaseline } from '../stance'
import type { PawName } from '../../../types'

const baseline: StanceBaseline = {
  qualified: true,
  pairs: [
    { pair: ['left_back_paw', 'right_back_paw'], median: 0.249, relIQR: 0.13, samples: 204 },
    { pair: ['left_front_paw', 'right_front_paw'], median: 0.212, relIQR: 0.11, samples: 223 },
  ],
}

function positions(entries: Array<[PawName, number, number]>) {
  return new Map(entries.map(([n, x, z]) => [n, { x, y: 0, z }] as const))
}

describe('detectCollapsedPaws', () => {
  it('flags both paws when a pair collapses onto one point', () => {
    // Measured on 20260731-174207-801b at ts=7519: the back paws land 0.2 cm
    // apart against a 24.9 cm baseline — the pose model swapped identities.
    const flagged = detectCollapsedPaws(
      positions([['left_back_paw', 0.390, 0.148], ['right_back_paw', 0.384, 0.134]]),
      baseline,
      0.35,
    )
    expect([...flagged].sort()).toEqual(['left_back_paw', 'right_back_paw'])
  })

  it('leaves a normal stance alone', () => {
    const flagged = detectCollapsedPaws(
      positions([['left_back_paw', 0.0, 0.0], ['right_back_paw', 0.0, 0.249]]),
      baseline,
      0.35,
    )
    expect(flagged.size).toBe(0)
  })

  it('does not flag a pair merely closer than its median', () => {
    // 0.15 m against a 0.249 m median is 0.60x — legitimate stance variation.
    const flagged = detectCollapsedPaws(
      positions([['left_back_paw', 0, 0], ['right_back_paw', 0, 0.15]]),
      baseline,
      0.35,
    )
    expect(flagged.size).toBe(0)
  })

  it('flags right at the threshold boundary', () => {
    const justUnder = 0.249 * 0.34
    const justOver = 0.249 * 0.36
    expect(detectCollapsedPaws(
      positions([['left_back_paw', 0, 0], ['right_back_paw', 0, justUnder]]), baseline, 0.35,
    ).size).toBe(2)
    expect(detectCollapsedPaws(
      positions([['left_back_paw', 0, 0], ['right_back_paw', 0, justOver]]), baseline, 0.35,
    ).size).toBe(0)
  })

  it('ignores pairs where one paw is absent', () => {
    const flagged = detectCollapsedPaws(
      positions([['left_back_paw', 0, 0]]), baseline, 0.35,
    )
    expect(flagged.size).toBe(0)
  })

  it('returns an empty set when the baseline has no pairs', () => {
    const flagged = detectCollapsedPaws(
      positions([['left_back_paw', 0, 0], ['right_back_paw', 0, 0.001]]),
      { qualified: false, pairs: [] },
      0.35,
    )
    expect(flagged.size).toBe(0)
  })

  it('flags only the offending pair, not every paw in the frame', () => {
    const flagged = detectCollapsedPaws(
      positions([
        ['left_back_paw', 0.390, 0.148], ['right_back_paw', 0.384, 0.134],
        ['left_front_paw', 0.0, 0.0], ['right_front_paw', 0.0, 0.212],
      ]),
      baseline,
      0.35,
    )
    expect([...flagged].sort()).toEqual(['left_back_paw', 'right_back_paw'])
  })
})
