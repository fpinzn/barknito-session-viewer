import { describe, it, expect } from 'vitest'
import { collectTrackSamples } from '../tracks'
import type { PawFloorFrame, PawHit, PawName } from '../../../types'

function frame(ts: number, entries: Array<[PawName, number, boolean]>): PawFloorFrame {
  const paws = new Map<PawName, PawHit>()
  for (const [name, conf, hit] of entries) {
    paws.set(name, {
      conf, screenX: 0, screenY: 0, hit,
      planeId: hit ? 'A' : null,
      world: hit ? { x: 0.8, y: 0, z: ts / 1000 } : null,
    })
  }
  return { ts, paws }
}

function build(frames: PawFloorFrame[]): Map<number, PawFloorFrame> {
  const m = new Map<number, PawFloorFrame>()
  frames.forEach((f, i) => m.set(i, f))
  return m
}

describe('collectTrackSamples', () => {
  it('keeps samples at or above the confidence threshold', () => {
    const m = build([
      frame(0, [['left_front_paw', 0.8, true]]),
      frame(100, [['left_front_paw', 0.35, true]]),
      frame(200, [['left_front_paw', 0.9, true]]),
    ])
    const out = collectTrackSamples(m, 200, 2000, 0.4)
    expect(out.get('left_front_paw')!.map(s => s.ts)).toEqual([0, 200])
  })

  it('is a no-op at the recorder floor of 0.3', () => {
    // The recorder never writes a sample below 0.3, so a 0.3 gate drops nothing.
    const m = build([
      frame(0, [['left_front_paw', 0.31, true]]),
      frame(100, [['left_front_paw', 0.99, true]]),
    ])
    expect(collectTrackSamples(m, 100, 2000, 0.3).get('left_front_paw')).toHaveLength(2)
  })

  it('drops misses regardless of confidence', () => {
    const m = build([
      frame(0, [['left_front_paw', 0.99, false]]),
      frame(100, [['left_front_paw', 0.99, true]]),
    ])
    expect(collectTrackSamples(m, 100, 2000, 0.4).get('left_front_paw')).toHaveLength(1)
  })

  it('keeps only samples inside the trailing window', () => {
    const m = build([
      frame(0, [['left_front_paw', 0.9, true]]),
      frame(5000, [['left_front_paw', 0.9, true]]),
      frame(5900, [['left_front_paw', 0.9, true]]),
    ])
    const out = collectTrackSamples(m, 6000, 2000, 0.4)
    expect(out.get('left_front_paw')!.map(s => s.ts)).toEqual([5000, 5900])
  })

  it('excludes samples from the future', () => {
    const m = build([
      frame(0, [['left_front_paw', 0.9, true]]),
      frame(500, [['left_front_paw', 0.9, true]]),
    ])
    const out = collectTrackSamples(m, 200, 2000, 0.4)
    expect(out.get('left_front_paw')!.map(s => s.ts)).toEqual([0])
  })

  it('returns samples sorted by timestamp', () => {
    const m = new Map<number, PawFloorFrame>([
      [2, frame(200, [['left_front_paw', 0.9, true]])],
      [0, frame(0, [['left_front_paw', 0.9, true]])],
      [1, frame(100, [['left_front_paw', 0.9, true]])],
    ])
    expect(collectTrackSamples(m, 200, 2000, 0.4).get('left_front_paw')!.map(s => s.ts))
      .toEqual([0, 100, 200])
  })

  it('separates paws', () => {
    const m = build([
      frame(0, [['left_front_paw', 0.9, true], ['right_back_paw', 0.2, true]]),
    ])
    const out = collectTrackSamples(m, 0, 2000, 0.4)
    expect(out.has('left_front_paw')).toBe(true)
    expect(out.has('right_back_paw')).toBe(false)
  })
})
