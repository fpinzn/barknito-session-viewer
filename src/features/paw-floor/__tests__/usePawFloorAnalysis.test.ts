import { describe, it, expect } from 'vitest'
import { rayColorHex, buildCamLookup } from '../usePawFloorAnalysis'

describe('rayColorHex', () => {
  it('is green at or above 55 degrees', () => {
    expect(rayColorHex(55)).toBe(0x44dd88)
    expect(rayColorHex(70)).toBe(0x44dd88)
  })

  it('is amber between 40 and 55 degrees', () => {
    expect(rayColorHex(40)).toBe(0xddaa44)
    expect(rayColorHex(54.9)).toBe(0xddaa44)
  })

  it('is red below 40 degrees', () => {
    expect(rayColorHex(39.9)).toBe(0xdd4444)
    expect(rayColorHex(10)).toBe(0xdd4444)
  })
})

describe('buildCamLookup', () => {
  const sensorMap = new Map([
    [100, { ts: 0, pos: { x: 1, y: 2, z: 3 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    [104, { ts: 33, pos: { x: 4, y: 5, z: 6 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
  ])

  it('returns the exact frame when present', () => {
    expect(buildCamLookup(sensorMap)(100)).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('falls back to the nearest frame within tolerance', () => {
    expect(buildCamLookup(sensorMap)(102)).toEqual({ x: 4, y: 5, z: 6 })
  })

  it('returns null when nothing is close enough', () => {
    expect(buildCamLookup(sensorMap)(500)).toBeNull()
  })

  it('returns null for an empty map', () => {
    expect(buildCamLookup(new Map())(100)).toBeNull()
  })
})
