import { describe, expect, it } from 'vitest'
import { computeVideoStartOffsetSec, mediaTimeForSession } from '../video-timing'

describe('computeVideoStartOffsetSec', () => {
  it('uses session duration minus media duration as fallback offset', () => {
    const offsetSec = computeVideoStartOffsetSec(
      { startedAtMs: 1000, endedAtMs: 26000 },
      10,
      null,
    )

    expect(offsetSec).toBe(15)
  })

  it('returns zero without a valid session duration', () => {
    const offsetSec = computeVideoStartOffsetSec(
      { startedAtMs: 1000 },
      10,
      null,
    )

    expect(offsetSec).toBe(0)
  })

  it('clamps negative fallback offset to zero', () => {
    const offsetSec = computeVideoStartOffsetSec(
      { startedAtMs: 1000, endedAtMs: 5000 },
      10,
      null,
    )

    expect(offsetSec).toBe(0)
  })
})

describe('mediaTimeForSession', () => {
  it('keeps video at the beginning before the start offset elapses', () => {
    const mediaEl = {
      duration: 20,
      seekable: {
        length: 1,
        start: () => 12,
      },
    } as HTMLMediaElement

    const targetSec = mediaTimeForSession(mediaEl, 5, 12, 12)

    expect(targetSec).toBe(12)
  })

  it('subtracts the video start offset from session time', () => {
    const mediaEl = {
      duration: 20,
      seekable: {
        length: 1,
        start: () => 12,
      },
    } as HTMLMediaElement

    const targetSec = mediaTimeForSession(mediaEl, 15, 12, 12)

    expect(targetSec).toBe(15)
  })

  it('seeks on the media PTS timeline when the video starts at a nonzero timestamp', () => {
    const mediaEl = {
      duration: 60.342,
      seekable: {
        length: 1,
        start: () => 0,
      },
    } as HTMLMediaElement

    const targetSec = mediaTimeForSession(mediaEl, 70.35, 16.077, 16.11)

    expect(targetSec).toBeCloseTo(70.383, 3)
  })

})
