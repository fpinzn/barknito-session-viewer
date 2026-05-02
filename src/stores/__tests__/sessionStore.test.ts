import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore } from '../sessionStore'
import type { Landmark } from '../../types'

describe('sessionStore', () => {
  beforeEach(() => useSessionStore.getState().reset())

  it('starts empty', () => {
    const state = useSessionStore.getState()
    expect(state.frames).toEqual([])
    expect(state.models).toEqual([])
    expect(state.gameEvents).toEqual([])
    expect(state.arPlaneEvents).toEqual([])
    expect(state.poseEvents).toEqual([])
    expect(state.intrinsics).toBeNull()
    expect(state.sessionMeta).toBeNull()
    expect(state.videoUrl).toBeNull()
    expect(state.depthVideoUrl).toBeNull()
    expect(state.audioUrl).toBeNull()
    expect(state.videoStartOffsetMs).toBe(0)
    expect(state.videoDurationMs).toBe(0)
  })

  it('loads pose data and builds frame list', () => {
    const lm = new Map<string, Landmark>([['nose', { x: 0.5, y: 0.5, depth: 1, conf: 0.9 }]])
    const poseFrameMap = new Map([
      [1, { ts: 100, models: new Map([['dog', lm]]) }],
      [2, { ts: 200, models: new Map([['dog', lm]]) }],
    ])
    useSessionStore.getState().loadPoseData(poseFrameMap, ['dog'])
    const state = useSessionStore.getState()
    expect(state.frames.length).toBe(2)
    expect(state.models).toEqual(['dog'])
    expect(state.poseEvents.length).toBe(2)
  })

  it('loads sensor data and rebuilds frame list', () => {
    const sensorFrameMap = new Map([
      [1, { ts: 100, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [2, { ts: 200, pos: { x: 1, y: 1, z: 1 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    useSessionStore.getState().loadSensorData(sensorFrameMap)
    const state = useSessionStore.getState()
    expect(state.frames.length).toBe(2)
    expect(state.frames[0].sensor).not.toBeNull()
  })

  it('loads intrinsics', () => {
    const intrinsics = { fx: 500, fy: 500, cx: 360, cy: 480, resW: 720, resH: 960 }
    useSessionStore.getState().loadIntrinsics(intrinsics)
    expect(useSessionStore.getState().intrinsics).toEqual(intrinsics)
  })

  it('loads game events', () => {
    const events = [
      { type: 'GameStarted', timestampMs: 1000 },
      { type: 'BeamScored', timestampMs: 2000, beamNumber: 1 },
    ]
    useSessionStore.getState().loadGameEvents(events)
    expect(useSessionStore.getState().gameEvents.length).toBe(2)
  })

  it('loads AR plane events', () => {
    const planes = [
      { timestampMs: 100, planeId: 'p1' },
      { timestampMs: 200, planeId: 'p2' },
    ]
    useSessionStore.getState().loadARPlaneEvents(planes)
    expect(useSessionStore.getState().arPlaneEvents.length).toBe(2)
  })

  it('loads session meta', () => {
    const meta = { sceneId: '03', deviceId: 'dev1', sessionId: 'sess1' }
    useSessionStore.getState().loadSessionMeta(meta)
    expect(useSessionStore.getState().sessionMeta).toEqual(meta)
  })

  it('sets video URL', () => {
    useSessionStore.getState().setVideoUrl('blob:http://...')
    expect(useSessionStore.getState().videoUrl).toBe('blob:http://...')
  })

  it('sets depth video URL', () => {
    useSessionStore.getState().setDepthVideoUrl('blob:http://depth')
    expect(useSessionStore.getState().depthVideoUrl).toBe('blob:http://depth')
  })

  it('sets audio URL', () => {
    useSessionStore.getState().setAudioUrl('blob:http://audio')
    expect(useSessionStore.getState().audioUrl).toBe('blob:http://audio')
  })

  it('sets video start offset', () => {
    useSessionStore.getState().setVideoStartOffsetMs(15000)
    expect(useSessionStore.getState().videoStartOffsetMs).toBe(15000)
  })

  it('sets video duration', () => {
    useSessionStore.getState().setVideoDurationMs(45000)
    expect(useSessionStore.getState().videoDurationMs).toBe(45000)
  })

  it('reset clears everything', () => {
    useSessionStore.getState().loadGameEvents([{ type: 'X', timestampMs: 0 }])
    useSessionStore.getState().reset()
    expect(useSessionStore.getState().gameEvents).toEqual([])
  })
})
