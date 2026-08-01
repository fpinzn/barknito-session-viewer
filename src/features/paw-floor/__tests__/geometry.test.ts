import { describe, it, expect } from 'vitest'
import { rayGeometry, correctForLift } from '../geometry'

// Camera 1.5 m above a plane at y=0, nadir at the origin.
const cam = { x: 0, y: 1.5, z: 0 }
const FOCAL = 1357.692626953125 // focalLengthX from a real session_meta.json

describe('rayGeometry', () => {
  it('computes a 60 degree depression for R = H/tan(60)', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180) // 0.8660254
    const g = rayGeometry({ x: R, y: 0, z: 0 }, cam, FOCAL)!
    expect(g.depressionDeg).toBeCloseTo(60, 6)
  })

  it('computes range as the full 3D distance', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180)
    const g = rayGeometry({ x: R, y: 0, z: 0 }, cam, FOCAL)!
    expect(g.rangeM).toBeCloseTo(Math.hypot(R, 1.5), 6)
  })

  it('is direction agnostic', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180)
    const a = rayGeometry({ x: R, y: 0, z: 0 }, cam, FOCAL)!
    const b = rayGeometry({ x: 0, y: 0, z: -R }, cam, FOCAL)!
    expect(b.depressionDeg).toBeCloseTo(a.depressionDeg, 9)
  })

  it('reports sub-centimetre sensitivity at steep angles', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180)
    const g = rayGeometry({ x: R, y: 0, z: 0 }, cam, FOCAL)!
    // H / (sin^2(60) * focal) = 1.5 / (0.75 * 1357.69) = 0.001473 m
    expect(g.metresPerPixel).toBeCloseTo(0.001473, 6)
  })

  it('sensitivity blows up as the ray grazes the floor', () => {
    const steep = rayGeometry({ x: 0.2, y: 0, z: 0 }, cam, FOCAL)!
    const shallow = rayGeometry({ x: 8.0, y: 0, z: 0 }, cam, FOCAL)!
    expect(shallow.metresPerPixel).toBeGreaterThan(steep.metresPerPixel * 10)
  })

  it('returns null when the camera is at or below the plane', () => {
    expect(rayGeometry({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, FOCAL)).toBeNull()
    expect(rayGeometry({ x: 1, y: 0, z: 0 }, { x: 0, y: -0.5, z: 0 }, FOCAL)).toBeNull()
  })

  it('returns null when the hit is directly under the camera', () => {
    expect(rayGeometry({ x: 0, y: 0, z: 0 }, cam, FOCAL)).toBeNull()
  })
})

describe('correctForLift', () => {
  it('is a no-op for a planted paw', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180)
    const p = correctForLift({ x: R, y: 0, z: 0 }, cam, 0)
    expect(p.x).toBeCloseTo(R, 9)
    expect(p.z).toBeCloseTo(0, 9)
  })

  it('pulls a 10 cm lift back by lift/tan(depression)', () => {
    // A paw truly at horizontal radius 0.80 m, lifted 0.10 m, projects to
    // 0.80 * 1.5/1.40 = 0.857142857 on the floor.
    const recorded = { x: 0.857142857, y: 0, z: 0 }
    const p = correctForLift(recorded, cam, 0.10)
    expect(p.x).toBeCloseTo(0.80, 6)
    expect(p.z).toBeCloseTo(0, 9)
  })

  it('matches the 5.8 cm overshoot for a 10 cm lift at 60 degrees', () => {
    const R = 1.5 / Math.tan((60 * Math.PI) / 180)
    const p = correctForLift({ x: R, y: 0, z: 0 }, cam, 0.10)
    expect(R - p.x).toBeCloseTo(0.0577350, 6)
  })

  it('corrects along the nadir direction, not an axis', () => {
    const recorded = { x: 0, y: 0, z: 0.857142857 }
    const p = correctForLift(recorded, cam, 0.10)
    expect(p.z).toBeCloseTo(0.80, 6)
    expect(p.x).toBeCloseTo(0, 9)
  })

  it('never pulls past the camera nadir', () => {
    const p = correctForLift({ x: 0.05, y: 0, z: 0 }, cam, 2.0)
    expect(p.x).toBeGreaterThan(0)
  })
})
