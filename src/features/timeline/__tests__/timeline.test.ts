import { describe, it, expect, beforeEach } from 'vitest'
import { usePlaybackStore } from '../../../stores/playbackStore'
import { useSessionStore } from '../../../stores/sessionStore'
import type { GameEvent } from '../../../types'

describe('jumpToEvent', () => {
  beforeEach(() => {
    usePlaybackStore.getState().reset()
    useSessionStore.getState().reset()
  })

  it('seeks playback to event timestamp', () => {
    // Load sensor data so frames exist
    const sensorFrameMap = new Map<number, { ts: number; pos: { x: number; y: number; z: number }; rot: { x: number; y: number; z: number; w: number } }>()
    sensorFrameMap.set(100, { ts: 100, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } })
    sensorFrameMap.set(200, { ts: 200, pos: { x: 1, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } })
    sensorFrameMap.set(300, { ts: 300, pos: { x: 2, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } })
    sensorFrameMap.set(400, { ts: 400, pos: { x: 3, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } })
    sensorFrameMap.set(500, { ts: 500, pos: { x: 4, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } })
    useSessionStore.getState().loadSensorData(sensorFrameMap)

    // Load game events
    const events: GameEvent[] = [
      { type: 'gameStart', timestampMs: 150 },
      { type: 'targetSpawn', timestampMs: 350 },
      { type: 'gameEnd', timestampMs: 450 },
    ]
    useSessionStore.getState().loadGameEvents(events)

    // Jump to event 0 (gameStart at 150ms)
    usePlaybackStore.getState().jumpToEvent(0)
    const frames = useSessionStore.getState().frames
    const idx0 = usePlaybackStore.getState().currentFrameIdx
    // Should be at frame closest to 150ms (frame at 200ms, idx=1)
    expect(frames[idx0].ts).toBe(200)

    // Jump to event 1 (targetSpawn at 350ms)
    // Equidistant from 300 and 400, binary search lands on 400
    usePlaybackStore.getState().jumpToEvent(1)
    const idx1 = usePlaybackStore.getState().currentFrameIdx
    expect(frames[idx1].ts).toBe(400)

    // Jump to event 2 (gameEnd at 450ms)
    // Equidistant from 400 and 500, binary search lands on 500
    usePlaybackStore.getState().jumpToEvent(2)
    const idx2 = usePlaybackStore.getState().currentFrameIdx
    expect(frames[idx2].ts).toBe(500)
  })

  it('ignores out-of-range event index', () => {
    const sensorFrameMap = new Map<number, { ts: number; pos: { x: number; y: number; z: number }; rot: { x: number; y: number; z: number; w: number } }>()
    sensorFrameMap.set(100, { ts: 100, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } })
    useSessionStore.getState().loadSensorData(sensorFrameMap)

    const events: GameEvent[] = [{ type: 'test', timestampMs: 100 }]
    useSessionStore.getState().loadGameEvents(events)

    usePlaybackStore.getState().jumpToEvent(-1)
    expect(usePlaybackStore.getState().currentFrameIdx).toBe(0)

    usePlaybackStore.getState().jumpToEvent(5)
    expect(usePlaybackStore.getState().currentFrameIdx).toBe(0)
  })

  it('works with no events loaded', () => {
    const sensorFrameMap = new Map<number, { ts: number; pos: { x: number; y: number; z: number }; rot: { x: number; y: number; z: number; w: number } }>()
    sensorFrameMap.set(100, { ts: 100, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } })
    useSessionStore.getState().loadSensorData(sensorFrameMap)

    usePlaybackStore.getState().jumpToEvent(0)
    expect(usePlaybackStore.getState().currentFrameIdx).toBe(0)
  })
})
