import { describe, it, expect } from 'vitest'
import { mirrorAboutCamera } from '../renderSpace'

const identityRot = { x: 0, y: 0, z: 0, w: 1 }

describe('mirrorAboutCamera', () => {
  it('leaves the camera position itself unchanged', () => {
    // The camera is a fixed point of a mirror about its own axis — this is why
    // CameraTrail can draw raw sensor positions and still line up.
    const cam = { x: 1.5, y: -0.5, z: 2.0 }
    const p = mirrorAboutCamera(cam, cam, identityRot)
    expect(p.x).toBeCloseTo(cam.x, 9)
    expect(p.y).toBeCloseTo(cam.y, 9)
    expect(p.z).toBeCloseTo(cam.z, 9)
  })

  it('negates X relative to an identity-oriented camera at the origin', () => {
    const cam = { x: 0, y: 0, z: 0 }
    const p = mirrorAboutCamera({ x: 1, y: 2, z: 3 }, cam, identityRot)
    expect(p.x).toBeCloseTo(-1, 9)
    expect(p.y).toBeCloseTo(2, 9)
    expect(p.z).toBeCloseTo(3, 9)
  })

  it('mirrors about the camera position, not the world origin', () => {
    const cam = { x: 10, y: 0, z: 0 }
    const p = mirrorAboutCamera({ x: 11, y: 0, z: 0 }, cam, identityRot)
    expect(p.x).toBeCloseTo(9, 9)
  })

  it('follows the camera orientation', () => {
    // Camera yawed 90° about Y: its local X axis now points along world -Z,
    // so the mirror should act on Z rather than X.
    const half = Math.PI / 4
    const rot = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }
    const cam = { x: 0, y: 0, z: 0 }
    const p = mirrorAboutCamera({ x: 0, y: 0, z: 5 }, cam, rot)
    expect(p.z).toBeCloseTo(-5, 6)
    expect(p.x).toBeCloseTo(0, 6)
  })

  it('is an involution — applying it twice returns the original point', () => {
    const half = 0.3
    const rot = { x: 0.1, y: Math.sin(half), z: 0.05, w: Math.cos(half) }
    const n = Math.hypot(rot.x, rot.y, rot.z, rot.w)
    const unit = { x: rot.x / n, y: rot.y / n, z: rot.z / n, w: rot.w / n }
    const cam = { x: 0.4, y: 1.2, z: -0.7 }
    const original = { x: 1.1, y: -0.3, z: 2.4 }

    const once = mirrorAboutCamera(original, cam, unit)
    const twice = mirrorAboutCamera({ ...once, y: once.y }, cam, unit)

    expect(twice.x).toBeCloseTo(original.x, 6)
    expect(twice.y).toBeCloseTo(original.y, 6)
    expect(twice.z).toBeCloseTo(original.z, 6)
  })

  it('preserves distance from the camera', () => {
    const half = 0.5
    const rot = { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }
    const cam = { x: 0.2, y: 1.4, z: 0.3 }
    const p = { x: 1.0, y: 0.0, z: 1.0 }
    const m = mirrorAboutCamera(p, cam, rot)

    const before = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z)
    const after = Math.hypot(m.x - cam.x, m.y - cam.y, m.z - cam.z)
    expect(after).toBeCloseTo(before, 6)
  })
})
