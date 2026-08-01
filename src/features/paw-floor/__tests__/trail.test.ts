import { describe, it, expect } from 'vitest'
import { trailBoundsSeconds, TRAIL_MIN_S, TRAIL_MIN_MAX, TRAIL_CEILING_S } from '../trail'

describe('trailBoundsSeconds', () => {
  it('spans the whole session when it is a reasonable length', () => {
    // 20260731-010534-dd26 runs 79.2 s.
    expect(trailBoundsSeconds(79_200)).toEqual({ min: TRAIL_MIN_S, max: 80 })
  })

  it('rounds up so the slider end always covers the last sample', () => {
    expect(trailBoundsSeconds(13_891).max).toBe(14)
    expect(trailBoundsSeconds(13_001).max).toBe(14)
  })

  it('keeps a usable range for a very short session', () => {
    // 20260731-010946-eec1 is only 11.7 s; the floor keeps the slider draggable.
    expect(trailBoundsSeconds(2_000).max).toBe(TRAIL_MIN_MAX)
  })

  it('caps a very long session so the map stays drawable', () => {
    expect(trailBoundsSeconds(60 * 60 * 1000).max).toBe(TRAIL_CEILING_S)
  })

  it('handles a missing or zero span', () => {
    expect(trailBoundsSeconds(0).max).toBe(TRAIL_MIN_MAX)
    expect(trailBoundsSeconds(-5).max).toBe(TRAIL_MIN_MAX)
  })

  it('always returns max above min', () => {
    for (const span of [0, 500, 5_000, 79_200, 10_000_000]) {
      const b = trailBoundsSeconds(span)
      expect(b.max).toBeGreaterThan(b.min)
    }
  })
})
