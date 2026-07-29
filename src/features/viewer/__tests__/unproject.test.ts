import { describe, it, expect } from 'vitest'
import { DISPLAY_TOP_LEFT, landmarkSpaceFromMeta, unproject, VISION_NATIVE } from '../unproject'
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

describe('landmarkSpaceFromMeta', () => {
  it('defaults to the vision-native convention when nothing is declared', () => {
    expect(landmarkSpaceFromMeta({ sessionId: '20260520-154443-fca8' })).toBe(VISION_NATIVE)
  })

  it('honours an explicit declaration', () => {
    expect(landmarkSpaceFromMeta({ landmarkSpace: 'display_top_left' })).toBe(DISPLAY_TOP_LEFT)
  })

  it('defaults to vision-native for a null meta', () => {
    expect(landmarkSpaceFromMeta(null)).toBe(VISION_NATIVE)
  })

  it('falls back to vision-native for an unrecognised declaration', () => {
    expect(landmarkSpaceFromMeta({ landmarkSpace: 'sideways' })).toBe(VISION_NATIVE)
  })
})

describe('unproject landmark space', () => {
  const intrinsics: Intrinsics = { fx: 500, fy: 500, cx: 360, cy: 480, resW: 720, resH: 960 }
  const identity: Pick<SensorFrame, 'pos' | 'rot'> = {
    pos: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
  }

  it('defaults to the vision-native path when no space is passed', () => {
    const implicit = unproject(0.25, 0.75, 1.0, identity, intrinsics)
    const explicit = unproject(0.25, 0.75, 1.0, identity, intrinsics, VISION_NATIVE)

    expect(implicit).toEqual(explicit)
  })

  it('treats display-space coordinates differently from vision-native ones', () => {
    const native = unproject(0.25, 0.75, 1.0, identity, intrinsics, VISION_NATIVE)
    const display = unproject(0.25, 0.75, 1.0, identity, intrinsics, DISPLAY_TOP_LEFT)

    expect(display).not.toEqual(native)
  })
})
