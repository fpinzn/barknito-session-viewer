import { describe, it, expect } from 'vitest'
import { confidenceFloors } from '../confidenceFloor'
import type { Landmark, PawFloorFrame, PawHit, PawName } from '../../../types'

function poseEvent(models: Record<string, number[]>) {
  const m = new Map<string, Map<string, Landmark>>()
  for (const [id, confs] of Object.entries(models)) {
    const lm = new Map<string, Landmark>()
    confs.forEach((c, i) => lm.set(`j${i}`, { x: 0, y: 0, depth: 0, conf: c }))
    m.set(id, lm)
  }
  return { ts: 0, models: m }
}

function pawMap(confs: number[]): Map<number, PawFloorFrame> {
  const out = new Map<number, PawFloorFrame>()
  confs.forEach((c, i) => {
    const paws = new Map<PawName, PawHit>()
    paws.set('left_front_paw', {
      conf: c, screenX: 0, screenY: 0, hit: true, planeId: 'A',
      world: { x: 0, y: 0, z: 0 },
    })
    out.set(i, { ts: i * 33, paws })
  })
  return out
}

describe('confidenceFloors', () => {
  it('returns null overall when nothing is loaded', () => {
    const f = confidenceFloors([], null)
    expect(f.overallMin).toBeNull()
    expect(f.sources).toEqual([])
  })

  it('reports the paw floor when only paw data is loaded', () => {
    const f = confidenceFloors([], pawMap([0.31, 0.55, 0.92]))
    expect(f.overallMin).toBeCloseTo(0.31, 6)
    expect(f.sources).toEqual([{ id: 'paw_floor_projection', min: 0.31 }])
  })

  it('reports a per-model minimum for each pose model', () => {
    const f = confidenceFloors(
      [poseEvent({ apple_animal_body_pose_v1: [0.0, 0.7], apple_hand_pose_v1: [0.24, 0.8] })],
      null,
    )
    expect(f.sources).toEqual([
      { id: 'apple_animal_body_pose_v1', min: 0 },
      { id: 'apple_hand_pose_v1', min: 0.24 },
    ])
    expect(f.overallMin).toBeCloseTo(0, 6)
  })

  it('takes the overall minimum across every source', () => {
    // Mirrors a real bundle: landmarks reach 0.00 while paws are floored at 0.30.
    const f = confidenceFloors(
      [poseEvent({ apple_animal_body_pose_v1: [0.0, 0.9] })],
      pawMap([0.3, 0.8]),
    )
    expect(f.overallMin).toBeCloseTo(0, 6)
    expect(f.sources.map(s => s.id)).toEqual([
      'apple_animal_body_pose_v1', 'paw_floor_projection',
    ])
  })

  it('sorts sources by id so the tooltip is stable between renders', () => {
    const f = confidenceFloors(
      [poseEvent({ zzz_model: [0.5], aaa_model: [0.6] })],
      null,
    )
    expect(f.sources.map(s => s.id)).toEqual(['aaa_model', 'zzz_model'])
  })

  it('ignores non-finite confidences', () => {
    const f = confidenceFloors([poseEvent({ m: [NaN, 0.42] })], null)
    expect(f.overallMin).toBeCloseTo(0.42, 6)
  })
})
