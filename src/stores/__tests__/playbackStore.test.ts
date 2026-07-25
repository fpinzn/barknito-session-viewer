import { describe, it, expect, beforeEach } from 'vitest'
import { usePlaybackStore } from '../playbackStore'
import { useSessionStore } from '../sessionStore'

describe('playbackStore', () => {
  beforeEach(() => {
    usePlaybackStore.getState().reset()
    useSessionStore.getState().reset()
  })

  it('starts paused at frame 0', () => {
    const state = usePlaybackStore.getState()
    expect(state.isPlaying).toBe(false)
    expect(state.currentFrameIdx).toBe(0)
    expect(state.playbackSpeed).toBe(1)
    expect(state.currentSessionTimeMs).toBe(0)
    expect(state.currentVisibleTimeMs).toBe(0)
  })

  it('togglePlay flips isPlaying', () => {
    usePlaybackStore.getState().togglePlay()
    expect(usePlaybackStore.getState().isPlaying).toBe(true)
    usePlaybackStore.getState().togglePlay()
    expect(usePlaybackStore.getState().isPlaying).toBe(false)
  })

  it('pause sets isPlaying false', () => {
    usePlaybackStore.getState().togglePlay()
    usePlaybackStore.getState().pause()
    expect(usePlaybackStore.getState().isPlaying).toBe(false)
  })

  it('nextFrame increments currentFrameIdx', () => {
    // Load some frames
    const sensorFrameMap = new Map([
      [1, { ts: 100, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [2, { ts: 200, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [3, { ts: 300, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    useSessionStore.getState().loadSensorData(sensorFrameMap)

    usePlaybackStore.getState().nextFrame()
    expect(usePlaybackStore.getState().currentFrameIdx).toBe(1)
    usePlaybackStore.getState().nextFrame()
    expect(usePlaybackStore.getState().currentFrameIdx).toBe(2)
  })

  it('nextFrame clamps to last frame', () => {
    const sensorFrameMap = new Map([
      [1, { ts: 100, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [2, { ts: 200, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    useSessionStore.getState().loadSensorData(sensorFrameMap)

    usePlaybackStore.getState().nextFrame()
    usePlaybackStore.getState().nextFrame()
    usePlaybackStore.getState().nextFrame() // should stay at 1
    expect(usePlaybackStore.getState().currentFrameIdx).toBe(1)
  })

  it('prevFrame decrements currentFrameIdx', () => {
    const sensorFrameMap = new Map([
      [1, { ts: 100, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [2, { ts: 200, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    useSessionStore.getState().loadSensorData(sensorFrameMap)

    usePlaybackStore.getState().nextFrame()
    usePlaybackStore.getState().prevFrame()
    expect(usePlaybackStore.getState().currentFrameIdx).toBe(0)
  })

  it('prevFrame clamps to 0', () => {
    usePlaybackStore.getState().prevFrame()
    expect(usePlaybackStore.getState().currentFrameIdx).toBe(0)
  })

  it('seekTo sets currentFrameIdx by timestamp', () => {
    const sensorFrameMap = new Map([
      [1, { ts: 100, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [2, { ts: 200, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [3, { ts: 300, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    useSessionStore.getState().loadSensorData(sensorFrameMap)

    usePlaybackStore.getState().seekTo(250)
    // Should seek to nearest frame (ts=200 → idx=1 or ts=300 → idx=2)
    const idx = usePlaybackStore.getState().currentFrameIdx
    expect(idx).toBeGreaterThanOrEqual(1)
    expect(idx).toBeLessThanOrEqual(2)
  })

  it('seekTo stores visible time on the absolute session timeline', () => {
    const sensorFrameMap = new Map([
      [1, { ts: 16120, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [2, { ts: 16143, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [3, { ts: 20000, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    useSessionStore.getState().loadSensorData(sensorFrameMap)
    useSessionStore.getState().setVideoStartOffsetMs(16110)

    usePlaybackStore.getState().seekTo(20000)

    expect(usePlaybackStore.getState().currentVisibleTimeMs).toBe(3890)
  })

  it('jumpToEvent seeks to event timestamp', () => {
    const sensorFrameMap = new Map([
      [1, { ts: 100, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [2, { ts: 200, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
      [3, { ts: 300, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } }],
    ])
    useSessionStore.getState().loadSensorData(sensorFrameMap)
    useSessionStore.getState().loadGameEvents([
      { type: 'GameStarted', timestampMs: 100 },
      { type: 'BeamScored', timestampMs: 300 },
    ])

    usePlaybackStore.getState().jumpToEvent(1)
    expect(usePlaybackStore.getState().currentFrameIdx).toBe(2) // ts=300
  })

  it('setPlaybackSpeed changes speed', () => {
    usePlaybackStore.getState().setPlaybackSpeed(2)
    expect(usePlaybackStore.getState().playbackSpeed).toBe(2)
  })

  it('setFrameIdx sets frame directly', () => {
    usePlaybackStore.getState().setFrameIdx(5)
    expect(usePlaybackStore.getState().currentFrameIdx).toBe(5)
  })

  it('setPlaybackTimes updates the playhead clocks', () => {
    usePlaybackStore.getState().setPlaybackTimes(1234, 567)
    expect(usePlaybackStore.getState().currentSessionTimeMs).toBe(1234)
    expect(usePlaybackStore.getState().currentVisibleTimeMs).toBe(567)
  })
})
