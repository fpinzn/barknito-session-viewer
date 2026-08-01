import { describe, it, expect } from 'vitest'
import { floorBounds, makeFloorProjection } from '../floorMapProjection'

describe('floorBounds', () => {
  it('returns null with nothing to bound', () => {
    expect(floorBounds([])).toBeNull()
  })

  it('spans the supplied points', () => {
    const b = floorBounds([
      { x: -1, z: 0.5 }, { x: 2, z: -3 }, { x: 0, z: 0 },
    ])!
    expect(b).toEqual({ minX: -1, maxX: 2, minZ: -3, maxZ: 0.5 })
  })

  it('gives a single point a non-zero extent', () => {
    // Otherwise the projection divides by zero.
    const b = floorBounds([{ x: 1, z: 1 }])!
    expect(b.maxX).toBeGreaterThan(b.minX)
    expect(b.maxZ).toBeGreaterThan(b.minZ)
  })
})

describe('makeFloorProjection', () => {
  const bounds = { minX: 0, maxX: 2, minZ: 0, maxZ: 1 }

  it('keeps the aspect ratio square — a metre in x equals a metre in z', () => {
    const p = makeFloorProjection(bounds, 400, 400, 0)
    const a = p.toScreen(0, 0)
    const bx = p.toScreen(1, 0)
    const bz = p.toScreen(0, 1)
    expect(Math.abs(bx.x - a.x)).toBeCloseTo(Math.abs(bz.y - a.y), 6)
  })

  it('fits the wider axis and centres the other', () => {
    const p = makeFloorProjection(bounds, 400, 400, 0)
    // 2 m wide into 400 px = 200 px/m; the 1 m depth uses 200 of 400 px,
    // so it is inset by 100 px top and bottom. z is inverted, so maxZ is
    // at the top of the drawn band and minZ at the bottom.
    expect(p.metresPerPx).toBeCloseTo(1 / 200, 6)
    expect(p.toScreen(0, 1).y).toBeCloseTo(100, 4)
    expect(p.toScreen(0, 0).y).toBeCloseTo(300, 4)
  })

  it('maps world +x to screen right and +z to screen UP', () => {
    // The phone points along +z, so putting +z upward sets the operator at
    // the bottom of the map looking up it.
    const p = makeFloorProjection(bounds, 400, 400, 0)
    expect(p.toScreen(2, 0).x).toBeGreaterThan(p.toScreen(0, 0).x)
    expect(p.toScreen(0, 1).y).toBeLessThan(p.toScreen(0, 0).y)
  })

  it('honours padding', () => {
    const p = makeFloorProjection(bounds, 400, 400, 20)
    expect(p.toScreen(0, 0).x).toBeCloseTo(20, 4)
    expect(p.toScreen(2, 0).x).toBeCloseTo(380, 4)
  })

  it('is stable — the same bounds always give the same mapping', () => {
    // This is what "keep the floor stable" rests on: the projection depends
    // only on session-wide bounds, never on the current camera pose.
    const a = makeFloorProjection(bounds, 400, 300, 10)
    const b = makeFloorProjection(bounds, 400, 300, 10)
    expect(a.toScreen(1.3, 0.7)).toEqual(b.toScreen(1.3, 0.7))
  })

  it('survives a degenerate canvas', () => {
    const p = makeFloorProjection(bounds, 0, 0, 0)
    expect(Number.isFinite(p.toScreen(1, 0.5).x)).toBe(true)
    expect(Number.isFinite(p.toScreen(1, 0.5).y)).toBe(true)
  })
})
