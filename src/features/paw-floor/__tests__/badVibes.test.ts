import { describe, it, expect } from 'vitest'
import { liveBadVibesAt } from '../badVibes'
import type { GameEvent } from '../../../types'

describe('liveBadVibesAt', () => {
  it('is empty with no vibe events', () => {
    expect(liveBadVibesAt([], 1000).size).toBe(0)
  })

  it('places a spawned vibe on its cell', () => {
    const evs: GameEvent[] = [
      { type: 'BadVibeSpawned', timestampMs: 100, badVibeId: 'v1', cellPos: [1, 0], variant: 'sludge', hitsRequired: 2 },
    ]
    const live = liveBadVibesAt(evs, 500)
    expect(live.get('v1')).toMatchObject({ cellPos: [1, 0], variant: 'sludge', hitsRequired: 2 })
  })

  it('does not show a vibe before it spawns', () => {
    const evs: GameEvent[] = [
      { type: 'BadVibeSpawned', timestampMs: 900, badVibeId: 'v1', cellPos: [0, 0] },
    ]
    expect(liveBadVibesAt(evs, 500).size).toBe(0)
  })

  it('follows a vibe when it moves', () => {
    const evs: GameEvent[] = [
      { type: 'BadVibeSpawned', timestampMs: 100, badVibeId: 'v1', cellPos: [0, 0] },
      { type: 'BadVibeMoved', timestampMs: 300, badVibeId: 'v1', cellPos: [1, 1] },
    ]
    expect(liveBadVibesAt(evs, 200).get('v1')!.cellPos).toEqual([0, 0])
    expect(liveBadVibesAt(evs, 400).get('v1')!.cellPos).toEqual([1, 1])
  })

  it('accumulates damage from hits', () => {
    const evs: GameEvent[] = [
      { type: 'BadVibeSpawned', timestampMs: 100, badVibeId: 'v1', cellPos: [0, 0], hitsRequired: 3 },
      { type: 'BadVibeHit', timestampMs: 200, badVibeId: 'v1', cellPos: [0, 0], totalDamage: 2, defeated: false },
    ]
    expect(liveBadVibesAt(evs, 300).get('v1')!.totalDamage).toBe(2)
  })

  it('removes a vibe once defeated', () => {
    const evs: GameEvent[] = [
      { type: 'BadVibeSpawned', timestampMs: 100, badVibeId: 'v1', cellPos: [0, 0] },
      { type: 'BadVibeHit', timestampMs: 200, badVibeId: 'v1', cellPos: [0, 0], defeated: true },
    ]
    expect(liveBadVibesAt(evs, 150).has('v1')).toBe(true)
    expect(liveBadVibesAt(evs, 250).has('v1')).toBe(false)
  })

  it('tracks several vibes independently', () => {
    const evs: GameEvent[] = [
      { type: 'BadVibeSpawned', timestampMs: 100, badVibeId: 'a', cellPos: [0, 0] },
      { type: 'BadVibeSpawned', timestampMs: 110, badVibeId: 'b', cellPos: [1, 1] },
      { type: 'BadVibeHit', timestampMs: 200, badVibeId: 'a', defeated: true },
    ]
    const live = liveBadVibesAt(evs, 300)
    expect(live.has('a')).toBe(false)
    expect(live.get('b')!.cellPos).toEqual([1, 1])
  })

  it('ignores vibe events with no cell', () => {
    const evs: GameEvent[] = [{ type: 'BadVibeSpawned', timestampMs: 100, badVibeId: 'v1' }]
    expect(liveBadVibesAt(evs, 200).size).toBe(0)
  })
})
