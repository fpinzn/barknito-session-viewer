import { describe, it, expect } from 'vitest'
import { collectTrackSamples, isContinuous } from '../tracks'
import type { PawFloorFrame, PawHit, PawName } from '../../../types'
import type { StanceBaseline } from '../stance'

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

describe('isContinuous', () => {
  it('joins samples one frame apart', () => {
    expect(isContinuous({ ts: 6502 }, { ts: 6536 })).toBe(true)
  })

  it('joins across a few dropped frames', () => {
    expect(isContinuous({ ts: 0 }, { ts: 100 })).toBe(true)
  })

  it('refuses to join across a real dropout', () => {
    // 20260731-174207-801b: left_front_paw unseen for 733 ms between frames
    // 1945 and 1989, reappearing 71 cm away. Joining these invents a stride.
    expect(isContinuous({ ts: 6536 }, { ts: 7269 })).toBe(false)
  })

  it('treats the threshold as inclusive', () => {
    expect(isContinuous({ ts: 0 }, { ts: 150 })).toBe(true)
    expect(isContinuous({ ts: 0 }, { ts: 151 })).toBe(false)
  })

  it('honours an explicit threshold', () => {
    expect(isContinuous({ ts: 0 }, { ts: 300 }, 400)).toBe(true)
  })
})

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

  it('marks samples not suspect when no baseline is supplied', () => {
    const m = build([frame(0, [['left_front_paw', 0.9, true]])])
    expect(collectTrackSamples(m, 0, 2000, 0.4).get('left_front_paw')![0].suspect).toBe(false)
  })

  it('marks collapsed paws suspect when a baseline is supplied', () => {
    const baseline: StanceBaseline = {
      qualified: true,
      pairs: [{
        pair: ['left_back_paw', 'right_back_paw'], median: 0.249, relIQR: 0.1, samples: 100,
      }],
    }
    // Both back paws at the same world point — `frame()` places every paw at
    // the same coordinates, so this is a collapse against a 0.249 m baseline.
    const m = build([frame(0, [['left_back_paw', 0.9, true], ['right_back_paw', 0.73, true]])])
    const out = collectTrackSamples(m, 0, 2000, 0.4, baseline)
    expect(out.get('left_back_paw')![0].suspect).toBe(true)
    expect(out.get('right_back_paw')![0].suspect).toBe(true)
  })

  it('flags a swapped paw even though its confidence is high', () => {
    // The failure this exists for: on 20260731-174207-801b the bogus sample
    // carried confidence 0.73, above the correct one it replaced.
    const baseline: StanceBaseline = {
      qualified: true,
      pairs: [{
        pair: ['left_back_paw', 'right_back_paw'], median: 0.249, relIQR: 0.1, samples: 100,
      }],
    }
    const m = build([frame(0, [['left_back_paw', 0.99, true], ['right_back_paw', 0.73, true]])])
    const out = collectTrackSamples(m, 0, 2000, 0.3, baseline)
    expect(out.get('right_back_paw')![0].suspect).toBe(true)
  })
})
