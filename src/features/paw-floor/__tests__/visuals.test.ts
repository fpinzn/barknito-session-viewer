import { describe, it, expect } from 'vitest'
import {
  pairDeviationColorHex,
  trackOpacityForAge,
  planeMedianY,
  planeDriftM,
} from '../visuals'
import type { PawFloorFrame, PawHit, PawName } from '../../../types'

describe('pairDeviationColorHex', () => {
  it('is green when the pair matches its baseline', () => {
    expect(pairDeviationColorHex(0.170, 0.170)).toBe(0x44dd88)
    expect(pairDeviationColorHex(0.185, 0.170)).toBe(0x44dd88)
  })

  it('is amber for a 2-5 cm disagreement', () => {
    expect(pairDeviationColorHex(0.200, 0.170)).toBe(0xddaa44)
  })

  it('is red beyond 5 cm, in either direction', () => {
    expect(pairDeviationColorHex(0.250, 0.170)).toBe(0xdd4444)
    expect(pairDeviationColorHex(0.090, 0.170)).toBe(0xdd4444)
  })
})

describe('trackOpacityForAge', () => {
  it('is fully opaque at the current moment', () => {
    expect(trackOpacityForAge(0, 2000)).toBeCloseTo(1, 6)
  })

  it('fades to zero at the window edge', () => {
    expect(trackOpacityForAge(2000, 2000)).toBeCloseTo(0, 6)
  })

  it('is half way through the window', () => {
    expect(trackOpacityForAge(1000, 2000)).toBeCloseTo(0.5, 6)
  })

  it('clamps outside the window', () => {
    expect(trackOpacityForAge(5000, 2000)).toBe(0)
    expect(trackOpacityForAge(-10, 2000)).toBe(1)
  })
})

describe('planeMedianY and planeDriftM', () => {
  function framesWithYs(ys: number[]): Map<number, PawFloorFrame> {
    const frames = new Map<number, PawFloorFrame>()
    ys.forEach((y, i) => {
      const paws = new Map<PawName, PawHit>()
      paws.set('left_front_paw', {
        conf: 0.8, screenX: 0, screenY: 0, hit: true,
        planeId: 'A', world: { x: 0.8, y, z: 0 },
      })
      frames.set(i, { ts: i * 33, paws })
    })
    return frames
  }

  it('returns null with no hits', () => {
    expect(planeMedianY(new Map())).toBeNull()
  })

  it('takes the median plane height', () => {
    expect(planeMedianY(framesWithYs([-1.30, -1.32, -1.34]))!).toBeCloseTo(-1.32, 6)
  })

  it('measures absolute deviation from the median', () => {
    expect(planeDriftM(-1.35, -1.32)).toBeCloseTo(0.03, 6)
    expect(planeDriftM(-1.29, -1.32)).toBeCloseTo(0.03, 6)
  })
})
