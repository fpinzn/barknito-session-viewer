import { describe, it, expect } from 'vitest'
import { decodeDepth, DEPTH_MIN, DEPTH_MAX, getSkeletonDef, DOG_BONES, HAND_BONES } from '../constants'

describe('decodeDepth', () => {
  it('returns 0 for val=0 (invalid)', () => {
    expect(decodeDepth(0)).toBe(0)
  })
  it('returns DEPTH_MIN for val=1', () => {
    expect(decodeDepth(1)).toBeCloseTo(DEPTH_MIN, 4)
  })
  it('returns DEPTH_MAX for val=255', () => {
    expect(decodeDepth(255)).toBeCloseTo(DEPTH_MAX, 4)
  })
  it('returns intermediate value for val=128', () => {
    const d = decodeDepth(128)
    expect(d).toBeGreaterThan(DEPTH_MIN)
    expect(d).toBeLessThan(DEPTH_MAX)
  })
})

describe('getSkeletonDef', () => {
  it('returns dog skeleton for "dog" model', () => {
    const def = getSkeletonDef('dog-tracker')
    expect(def.label).toBe('Dog')
    expect(def.bones).toBe(DOG_BONES)
    expect(def.bones.length).toBe(24)
  })
  it('returns dog skeleton for "animal" model', () => {
    const def = getSkeletonDef('animal-pose')
    expect(def.label).toBe('Dog')
  })
  it('returns dog skeleton for "body" model', () => {
    const def = getSkeletonDef('full-body')
    expect(def.label).toBe('Dog')
  })
  it('returns hand skeleton for model containing "hand"', () => {
    const def = getSkeletonDef('hand-left')
    expect(def.label).toBe('Hand')
    expect(def.bones).toBe(HAND_BONES)
    expect(def.bones.length).toBe(20)
  })
  it('returns dog skeleton with modelId as label for unknown model', () => {
    const def = getSkeletonDef('some-unknown')
    expect(def.label).toBe('some-unknown')
    expect(def.bones).toBe(DOG_BONES)
  })
})
