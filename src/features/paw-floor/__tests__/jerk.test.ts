import { describe, it, expect } from 'vitest'
import { detectJerkSpikes } from '../jerk'
import type { TrackSample } from '../tracks'

function s(ts: number, x: number, z: number): TrackSample {
  return { ts, frameId: ts, world: { x, y: 0, z }, suspect: false, suspectReason: null }
}

describe('detectJerkSpikes', () => {
  it('flags a sample that departs and immediately returns', () => {
    // The signature of a single-frame teleport: out 30 cm, straight back.
    const flagged = detectJerkSpikes([
      s(0, 0, 0),
      s(33, 0.30, 0),
      s(66, 0.005, 0),
    ])
    expect([...flagged]).toEqual([1])
  })

  it('leaves genuine fast travel alone', () => {
    // Same per-step speed, but the paw keeps going instead of returning —
    // a real stride, not a spike.
    const flagged = detectJerkSpikes([
      s(0, 0, 0),
      s(33, 0.30, 0),
      s(66, 0.60, 0),
    ])
    expect(flagged.size).toBe(0)
  })

  it('does not flag a sustained displacement', () => {
    // The 801b collapse shape: one big step, then the paw sits still in the
    // wrong place. Intra-landmark motion looks perfectly calm here, which is
    // why the inter-landmark collapse test is what catches this case.
    const flagged = detectJerkSpikes([
      s(7236, 0.325, 0.416),
      s(7403, 0.384, 0.134),
      s(7419, 0.385, 0.132),
      s(7453, 0.391, 0.130),
      s(7519, 0.386, 0.122),
    ])
    expect(flagged.size).toBe(0)
  })

  it('ignores triples spanning too much time to judge', () => {
    const flagged = detectJerkSpikes([
      s(0, 0, 0),
      s(500, 0.30, 0),
      s(1000, 0.005, 0),
    ])
    expect(flagged.size).toBe(0)
  })

  it('ignores small wobble below the departure threshold', () => {
    const flagged = detectJerkSpikes([
      s(0, 0, 0),
      s(33, 0.03, 0),
      s(66, 0, 0),
    ])
    expect(flagged.size).toBe(0)
  })

  it('needs at least three samples', () => {
    expect(detectJerkSpikes([s(0, 0, 0), s(33, 0.3, 0)]).size).toBe(0)
    expect(detectJerkSpikes([]).size).toBe(0)
  })

  it('flags several independent spikes in one series', () => {
    const flagged = detectJerkSpikes([
      s(0, 0, 0), s(33, 0.30, 0), s(66, 0, 0),
      s(99, 0.01, 0), s(132, 0.31, 0), s(165, 0.01, 0),
    ])
    expect([...flagged].sort((a, b) => a - b)).toEqual([1, 4])
  })
})
