import { describe, it, expect } from 'vitest'
import { sessionQuality } from '../quality'
import type { PawFloorFrame, PawName, PawHit } from '../../../types'

const cam = { x: 0, y: 1.5, z: 0 }
const FOCAL = 1357.692626953125
const camFor = () => cam

/** Build N frames of a rigid, well-observed, steeply-viewed stance. */
function goodFrames(n: number, planeY = 0): Map<number, PawFloorFrame> {
  const coords: Array<[PawName, number, number]> = [
    ['left_front_paw', 0.80, 0.00],
    ['right_front_paw', 0.80, 0.17],
    ['left_back_paw', 1.18, 0.00],
    ['right_back_paw', 1.18, 0.17],
  ]
  const frames = new Map<number, PawFloorFrame>()
  for (let i = 0; i < n; i++) {
    const paws = new Map<PawName, PawHit>()
    for (const [name, x, z] of coords) {
      paws.set(name, {
        conf: 0.8, screenX: 500, screenY: 900, hit: true,
        planeId: 'PLANE_A',
        world: { x: x + i * 0.001, y: planeY, z },
      })
    }
    frames.set(i, { ts: i * 33, paws })
  }
  return frames
}

describe('sessionQuality', () => {
  it('returns null with no usable frames', () => {
    expect(sessionQuality({ pawFrames: new Map(), camFor, focalPx: FOCAL })).toBeNull()
  })

  it('rates a clean session TRUSTWORTHY', () => {
    const q = sessionQuality({ pawFrames: goodFrames(60), camFor, focalPx: FOCAL })!
    expect(q.verdict).toBe('TRUSTWORTHY')
    expect(q.reasons).toEqual([])
    expect(q.hitRate).toBeCloseTo(1, 6)
    expect(q.sampleCount).toBe(240)
  })

  it('counts per-paw samples', () => {
    const q = sessionQuality({ pawFrames: goodFrames(60), camFor, focalPx: FOCAL })!
    expect(q.pawCounts.left_front_paw).toBe(60)
    expect(q.pawCounts.right_back_paw).toBe(60)
  })

  it('flags a session that used more than one plane as UNRELIABLE', () => {
    const frames = goodFrames(60)
    for (const [id, f] of frames) {
      if (id < 20) {
        for (const paw of f.paws.values()) {
          paw.planeId = 'PLANE_B'
          paw.world = { ...paw.world!, y: -0.09 }
        }
      }
    }
    const q = sessionQuality({ pawFrames: frames, camFor, focalPx: FOCAL })!
    expect(q.verdict).toBe('UNRELIABLE')
    expect(q.planeCount).toBe(2)
    expect(q.reasons.join(' ')).toMatch(/plane/i)
  })

  it('flags a low hit rate as UNRELIABLE', () => {
    const frames = goodFrames(60)
    for (const [id, f] of frames) {
      if (id < 40) {
        for (const paw of f.paws.values()) {
          paw.hit = false
          paw.world = null
          paw.planeId = null
        }
      }
    }
    const q = sessionQuality({ pawFrames: frames, camFor, focalPx: FOCAL })!
    expect(q.hitRate).toBeCloseTo(1 / 3, 2)
    expect(q.verdict).toBe('UNRELIABLE')
  })

  it('flags an under-observed paw as DEGRADED', () => {
    const frames = goodFrames(60)
    for (const [id, f] of frames) {
      if (id >= 3) f.paws.delete('right_back_paw')
    }
    const q = sessionQuality({ pawFrames: frames, camFor, focalPx: FOCAL })!
    expect(q.pawCounts.right_back_paw).toBe(3)
    expect(q.verdict).toBe('DEGRADED')
    expect(q.reasons.join(' ')).toMatch(/right_back_paw/)
  })

  it('flags plane drift beyond 5 cm as UNRELIABLE', () => {
    const frames = goodFrames(60)
    let i = 0
    for (const [, f] of frames) {
      for (const paw of f.paws.values()) paw.world = { ...paw.world!, y: i * 0.002 }
      i++
    }
    const q = sessionQuality({ pawFrames: frames, camFor, focalPx: FOCAL })!
    expect(q.planeYSpanM).toBeGreaterThan(0.05)
    expect(q.verdict).toBe('UNRELIABLE')
  })

  it('reports depression percentiles', () => {
    const q = sessionQuality({ pawFrames: goodFrames(60), camFor, focalPx: FOCAL })!
    expect(q.depressionP50).toBeGreaterThan(45)
    expect(q.depressionP50).toBeLessThan(90)
  })
})
