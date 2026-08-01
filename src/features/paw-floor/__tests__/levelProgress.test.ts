import { describe, it, expect } from 'vitest'
import { levelHeader, currentAction } from '../levelProgress'
import type { GameEvent } from '../../../types'

const config = {
  levelNumber: 2,
  levelName: 'World 1-2 Boop with lure intro',
  actionSequence: [
    { id: 'B1', type: 'targetBoop', stage: 'B1', lure: true },
    { id: 'B2', type: 'passThroughCell' },
    { id: 'B3', type: 'targetBoop', stage: 'B1', lure: true },
  ],
}

describe('levelHeader', () => {
  it('prefers the level config', () => {
    expect(levelHeader(config, null)).toEqual({
      number: 2, name: 'World 1-2 Boop with lure intro',
    })
  })

  it('falls back to session meta when no config is loaded', () => {
    expect(levelHeader(null, { levelNumber: 7 })).toEqual({ number: 7, name: null })
  })

  it('returns null when neither knows the level', () => {
    expect(levelHeader(null, null)).toBeNull()
    expect(levelHeader(null, {})).toBeNull()
  })

  it('ignores the dev-menu sentinel level', () => {
    // Free-play sessions record levelNumber -1.
    expect(levelHeader(null, { levelNumber: -1 })).toBeNull()
  })
})

describe('currentAction', () => {
  const rounds: GameEvent[] = [
    { type: 'RoundStarted', timestampMs: 1000, roundNumber: 1 },
    { type: 'RoundStarted', timestampMs: 5000, roundNumber: 2 },
    { type: 'RoundStarted', timestampMs: 9000, roundNumber: 3 },
  ]

  it('is null before the first round', () => {
    expect(currentAction(config, rounds, 500)).toBeNull()
  })

  it('indexes the action sequence by roundNumber', () => {
    // roundNumber is 1-based and maps 1:1 onto actionSequence — verified across
    // four bundles, where the final roundNumber equals the sequence length.
    expect(currentAction(config, rounds, 1000)).toMatchObject({ index: 0, id: 'B1', type: 'targetBoop' })
    expect(currentAction(config, rounds, 6000)).toMatchObject({ index: 1, id: 'B2', type: 'passThroughCell' })
    expect(currentAction(config, rounds, 99_999)).toMatchObject({ index: 2, id: 'B3' })
  })

  it('reports the sequence length', () => {
    expect(currentAction(config, rounds, 1000)!.total).toBe(3)
  })

  it('carries the lure flag', () => {
    expect(currentAction(config, rounds, 1000)!.lure).toBe(true)
    expect(currentAction(config, rounds, 6000)!.lure).toBe(false)
  })

  it('survives a round number past the end of the sequence', () => {
    const overrun: GameEvent[] = [{ type: 'RoundStarted', timestampMs: 0, roundNumber: 99 }]
    expect(currentAction(config, overrun, 10)).toBeNull()
  })

  it('returns null without a config', () => {
    expect(currentAction(null, rounds, 2000)).toBeNull()
  })
})

describe('currentAction — ActionStarted schema', () => {
  // Recorded by newer builds, e.g. 20260801-134725-c2f6, which emit
  // ActionStarted with an actionId and no RoundStarted at all.
  const actions: GameEvent[] = [
    { type: 'ActionStarted', timestampMs: 4271, actionId: 'B1', activeCellPos: [0, 0] },
    { type: 'ActionStarted', timestampMs: 11823, actionId: 'B2', activeCellPos: [1, 0] },
    { type: 'ActionStarted', timestampMs: 12557, actionId: 'B3', activeCellPos: [0, 1] },
  ]

  it('resolves the action by id', () => {
    expect(currentAction(config, actions, 4271)).toMatchObject({ index: 0, id: 'B1' })
    expect(currentAction(config, actions, 12000)).toMatchObject({ index: 1, id: 'B2' })
    expect(currentAction(config, actions, 30_000)).toMatchObject({ index: 2, id: 'B3' })
  })

  it('is null before the first action', () => {
    expect(currentAction(config, actions, 4270)).toBeNull()
  })

  it('ignores an actionId absent from the sequence', () => {
    const stray: GameEvent[] = [{ type: 'ActionStarted', timestampMs: 0, actionId: 'ZZ' }]
    expect(currentAction(config, stray, 10)).toBeNull()
  })

  it('carries the action type from the config', () => {
    expect(currentAction(config, actions, 4271)!.type).toBe('targetBoop')
  })
})
