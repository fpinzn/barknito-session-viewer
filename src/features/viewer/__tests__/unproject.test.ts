import { describe, it, expect } from 'vitest'
import { unproject } from '../unproject'
import type { Intrinsics, SensorFrame } from '../../../types'

describe('unproject', () => {
  const intrinsics: Intrinsics = { fx: 500, fy: 500, cx: 360, cy: 480, resW: 720, resH: 960 }
  const identity: Pick<SensorFrame, 'pos' | 'rot'> = {
    pos: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
  }

  it('returns null if intrinsics missing', () => {
    const p = unproject(0.5, 0.5, 1.0, identity, null)
    expect(p).toBeNull()
  })

  it('returns null if sensor missing', () => {
    const p = unproject(0.5, 0.5, 1.0, null, intrinsics)
    expect(p).toBeNull()
  })

  it('returns a point for valid inputs', () => {
    const p = unproject(0.5, 0.5, 1.0, identity, intrinsics)
    expect(p).not.toBeNull()
    expect(p!.x).toBeDefined()
    expect(p!.y).toBeDefined()
    expect(p!.z).toBeDefined()
  })

  it('projects deeper for larger depth values', () => {
    const near = unproject(0.5, 0.5, 1.0, identity, intrinsics)!
    const far = unproject(0.5, 0.5, 3.0, identity, intrinsics)!
    expect(Math.abs(far.z)).toBeGreaterThan(Math.abs(near.z))
  })

  it('z component equals depth for identity rotation at center', () => {
    const p = unproject(0.5, 0.5, 2.0, identity, intrinsics)!
    // At center pixel with identity rotation, z should be roughly the depth
    expect(p.z).toBeCloseTo(2.0, 0)
  })

  it('applies camera position offset', () => {
    const sensor = { pos: { x: 10, y: 20, z: 30 }, rot: { x: 0, y: 0, z: 0, w: 1 } }
    const p = unproject(0.5, 0.5, 1.0, sensor, intrinsics)!
    expect(p.x).toBeCloseTo(10, 0)
    expect(p.y).toBeCloseTo(20, 0)
    expect(p.z).toBeCloseTo(31, 0)
  })
})
