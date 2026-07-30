import { describe, expect, it } from 'vitest'
import {
  computeVideoStartOffsetMs,
  findNearestFrameIdx,
  sessionTimeForVisibleTimeMs,
  visibleTimeForFrameMs,
} from '../video-timing'
import type { Frame } from '../frame-utils'

describe('video timing helpers', () => {
  it('computes offset in milliseconds from session and media durations', () => {
    const offsetMs = computeVideoStartOffsetMs(
      { startedAtMs: 1000, endedAtMs: 26000 },
      10,
      null,
    )

    expect(offsetMs).toBe(15000)
  })

  it('ignores a recorded video start PTS and end-aligns regardless', () => {
    // App videos present their leading empty edit, so browser currentTime already equals
    // absolute PTS. Subtracting a recorded start PTS on top of that would seek ~163 s
    // early. This pins that the branch stays out.
    const withPts = computeVideoStartOffsetMs(
      { startedAtMs: 1000, endedAtMs: 61731, videoStartPtsMs: 162998 },
      255.035,
      417901,
    )
    const withoutPts = computeVideoStartOffsetMs(
      { startedAtMs: 1000, endedAtMs: 61731 },
      255.035,
      417901,
    )

    expect(withPts).toBe(withoutPts)
    expect(withPts).toBe(162866)
  })

  it('prefers the recorded timeline duration over session metadata duration', () => {
    const offsetMs = computeVideoStartOffsetMs(
      { startedAtMs: 1000, endedAtMs: 61731 },
      60.342,
      76419,
    )

    expect(offsetMs).toBe(16077)
  })

  it('maps visible time to session time using the video offset', () => {
    const frames: Frame[] = [
      { id: 1, ts: 16120, sensor: null },
      { id: 2, ts: 16143, sensor: null },
      { id: 3, ts: 20000, sensor: null },
    ]

    expect(sessionTimeForVisibleTimeMs(frames, 0, 16110)).toBe(16110)
    expect(sessionTimeForVisibleTimeMs(frames, 4000, 16110)).toBe(20110)
  })

  it('maps a session frame back to visible time', () => {
    const frames: Frame[] = [
      { id: 1, ts: 16120, sensor: null },
      { id: 2, ts: 16143, sensor: null },
      { id: 3, ts: 20000, sensor: null },
    ]

    expect(visibleTimeForFrameMs(frames, 0, 16110)).toBe(10)
    expect(visibleTimeForFrameMs(frames, 1, 16110)).toBe(33)
    expect(visibleTimeForFrameMs(frames, 2, 16110)).toBe(3890)
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

})
