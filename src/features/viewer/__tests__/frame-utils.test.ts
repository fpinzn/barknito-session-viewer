import { describe, it, expect } from 'vitest'
import { rebuildFrameList, findNearestPoseModels, MAX_POSE_GAP_MS } from '../frame-utils'
import type { Landmark } from '../../../types'

describe('rebuildFrameList', () => {
  it('builds frame list from sensor data sorted by timestamp', () => {
    const sensorFrameMap = new Map([
      [2, { ts: 200, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [1, { ts: 100, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [3, { ts: 300, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    const result = rebuildFrameList({ sensorFrameMap })
    expect(result.frames.length).toBe(3)
    expect(result.frames[0].ts).toBe(100)
    expect(result.frames[1].ts).toBe(200)
    expect(result.frames[2].ts).toBe(300)
  })

  it('falls back to pose data when no sensor data', () => {
    const poseFrameMap = new Map([
      [1, { ts: 50, models: new Map() }],
      [2, { ts: 150, models: new Map() }],
    ])
    const result = rebuildFrameList({ poseFrameMap, models: ['dog'] })
    expect(result.frames.length).toBe(2)
    expect(result.models).toEqual(['dog'])
  })

  it('excludes epoch timestamps when boot-relative frames exist', () => {
    const sensorFrameMap = new Map([
      [1, { ts: 100, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [2, { ts: 1700000000000, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [3, { ts: 200, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    const result = rebuildFrameList({ sensorFrameMap })
    expect(result.frames.length).toBe(2)
    expect(result.frames.every(f => f.ts < 1e12)).toBe(true)
  })

  it('keeps all-epoch timestamps if no boot-relative frames', () => {
    const sensorFrameMap = new Map([
      [1, { ts: 1700000000000, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [2, { ts: 1700000001000, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    const result = rebuildFrameList({ sensorFrameMap })
    expect(result.frames.length).toBe(2)
  })

  it('returns empty for no data', () => {
    const result = rebuildFrameList({})
    expect(result.frames.length).toBe(0)
    expect(result.models).toEqual([])
  })

  it('drops bogus startup sensor timestamps when pose starts much later', () => {
    const lm = new Map<string, Landmark>([['nose', { x: 0.5, y: 0.5, depth: 1, conf: 0.9 }]])
    const sensorFrameMap = new Map([
      [1, { ts: 1, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [2, { ts: 19258, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [3, { ts: 19281, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    const poseFrameMap = new Map([
      [10, { ts: 19411, models: new Map([['dog', lm]]) }],
      [11, { ts: 19511, models: new Map([['dog', lm]]) }],
    ])

    const result = rebuildFrameList({ sensorFrameMap, poseFrameMap, models: ['dog'] })

    expect(result.frames.length).toBe(2)
    expect(result.frames[0].ts).toBe(19258)
    expect(result.poseEvents[0].ts).toBe(19411)
  })

  it('builds sorted pose events timeline', () => {
    const lm = new Map<string, Landmark>([['nose', { x: 0.5, y: 0.5, depth: 1, conf: 0.9 }]])
    const poseFrameMap = new Map([
      [1, { ts: 200, models: new Map([['dog', lm]]) }],
      [2, { ts: 100, models: new Map([['dog', lm]]) }],
    ])
    const result = rebuildFrameList({ poseFrameMap, models: ['dog'] })
    expect(result.poseEvents.length).toBe(2)
    expect(result.poseEvents[0].ts).toBe(100)
    expect(result.poseEvents[1].ts).toBe(200)
  })
})

describe('findNearestPoseModels', () => {
  const lm = new Map<string, Landmark>([['nose', { x: 0.5, y: 0.5, depth: 1, conf: 0.9 }]])
  const poseEvents = [
    { ts: 100, models: new Map([['dog', lm]]) },
    { ts: 200, models: new Map([['dog', lm]]) },
    { ts: 300, models: new Map([['dog', lm]]) },
    { ts: 500, models: new Map([['dog', lm]]) },
  ]

  it('finds nearest frame within MAX_POSE_GAP_MS', () => {
    const models = findNearestPoseModels(poseEvents, 195)
    expect(models.size).toBe(1)
    expect(models.has('dog')).toBe(true)
  })

  it('returns empty map if gap exceeds threshold', () => {
    // Nearest event is at 500, so 500 + 101 = 601 is beyond threshold
    const models = findNearestPoseModels(poseEvents, 500 + MAX_POSE_GAP_MS + 1)
    expect(models.size).toBe(0)
  })

  it('returns empty map for empty events', () => {
    const models = findNearestPoseModels([], 100)
    expect(models.size).toBe(0)
  })

  it('finds exact match', () => {
    const models = findNearestPoseModels(poseEvents, 300)
    expect(models.size).toBe(1)
  })

  it('finds closest when between two events', () => {
    const models = findNearestPoseModels(poseEvents, 250)
    expect(models.size).toBe(1) // Should match either 200 or 300
  })
})
