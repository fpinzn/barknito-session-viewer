import { describe, it, expect } from 'vitest'
import { scoreFlash, SCORE_FADE_MS } from '../scoreFlash'
import type { GameEvent } from '../../../types'

const events: GameEvent[] = [
  { type: 'DogEnteredCell', timestampMs: 11822, nearestCellPos: [1, 1], hitType: 'FullHit' },
  { type: 'DogEnteredCell', timestampMs: 12556, nearestCellPos: [1, 0], hitType: 'FullHit' },
  { type: 'ActionStarted', timestampMs: 12557, actionId: 'B3' },
]

describe('scoreFlash', () => {
  it('is empty before any score', () => {
    expect(scoreFlash(events, 11_000).size).toBe(0)
  })

  it('is full intensity at the moment of the score', () => {
    expect(scoreFlash(events, 11822).get('1,1')).toBeCloseTo(1, 6)
  })

  it('decays linearly over the fade window', () => {
    expect(scoreFlash(events, 11822 + SCORE_FADE_MS / 2).get('1,1')).toBeCloseTo(0.5, 6)
  })

  it('drops the cell once the window elapses', () => {
    expect(scoreFlash(events, 11822 + SCORE_FADE_MS).has('1,1')).toBe(false)
    expect(scoreFlash(events, 11822 + SCORE_FADE_MS + 1).has('1,1')).toBe(false)
  })

  it('never looks into the future', () => {
    // Scrubbing back before a score must not light the cell.
    expect(scoreFlash(events, 12_000).has('1,0')).toBe(false)
  })

  it('tracks several cells at once when scores overlap', () => {
    const overlapping: GameEvent[] = [
      { type: 'DogEnteredCell', timestampMs: 1000, nearestCellPos: [0, 0] },
      { type: 'DogEnteredCell', timestampMs: 1100, nearestCellPos: [1, 1] },
    ]
    const f = scoreFlash(overlapping, 1200)
    expect(f.has('0,0')).toBe(true)
    expect(f.has('1,1')).toBe(true)
    expect(f.get('1,1')!).toBeGreaterThan(f.get('0,0')!)
  })

  it('keeps the most recent score for a repeated cell', () => {
    const repeated: GameEvent[] = [
      { type: 'DogEnteredCell', timestampMs: 1000, nearestCellPos: [0, 0] },
      { type: 'DogEnteredCell', timestampMs: 1400, nearestCellPos: [0, 0] },
    ]
    expect(scoreFlash(repeated, 1400).get('0,0')).toBeCloseTo(1, 6)
  })

  it('ignores entries with no cell position', () => {
    expect(scoreFlash([{ type: 'DogEnteredCell', timestampMs: 0 }], 10).size).toBe(0)
  })
})
