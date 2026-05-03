import { describe, expect, it } from 'vitest'
import {
  computeVideoStartOffsetMs,
  findNearestFrameIdx,
  sessionTimeForVisibleTimeMs,
  skeletonSessionTimeForVisibleTimeMs,
  visibleTimeForFrameMs,
} from '../video-timing'
import type { Frame } from '../frame-utils'

describe('video timing helpers', () => {
  it('computes offset in milliseconds from session and media durations', () => {
    const offsetMs = computeVideoStartOffsetMs(
      { startedAtMs: 1000, endedAtMs: 26000 },
      10,
    )

    expect(offsetMs).toBe(15000)
  })

  it('maps visible time to session time using the video offset', () => {
    const frames: Frame[] = [
      { id: 1, ts: 1000, sensor: null },
      { id: 2, ts: 16000, sensor: null },
      { id: 3, ts: 20000, sensor: null },
    ]

    expect(sessionTimeForVisibleTimeMs(frames, 0, 15000)).toBe(16000)
    expect(sessionTimeForVisibleTimeMs(frames, 4000, 15000)).toBe(20000)
  })

  it('maps a session frame back to visible time', () => {
    const frames: Frame[] = [
      { id: 1, ts: 1000, sensor: null },
      { id: 2, ts: 16000, sensor: null },
      { id: 3, ts: 20000, sensor: null },
    ]

    expect(visibleTimeForFrameMs(frames, 0, 15000)).toBe(0)
    expect(visibleTimeForFrameMs(frames, 1, 15000)).toBe(0)
    expect(visibleTimeForFrameMs(frames, 2, 15000)).toBe(4000)
  })

  it('finds the frame nearest to the offset-adjusted session time', () => {
    const frames: Frame[] = [
      { id: 1, ts: 1000, sensor: null },
      { id: 2, ts: 16000, sensor: null },
      { id: 3, ts: 20000, sensor: null },
    ]

    const idx = findNearestFrameIdx(frames, 16000)

    expect(idx).toBe(1)
  })

  it('starts skeleton playback at visible time zero', () => {
    const frames: Frame[] = [
      { id: 1, ts: 1000, sensor: null },
      { id: 2, ts: 1400, sensor: null },
      { id: 3, ts: 1800, sensor: null },
    ]

    expect(skeletonSessionTimeForVisibleTimeMs(frames, 0, 15000)).toBe(1000)
    expect(skeletonSessionTimeForVisibleTimeMs(frames, 400, 15000)).toBe(1400)
    expect(skeletonSessionTimeForVisibleTimeMs(frames, 800, 15000)).toBe(1800)
  })
})
