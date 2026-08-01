import { describe, it, expect } from 'vitest'
import { boardGeometry, activeCellAt, cellHitsUpTo } from '../boardGeometry'
import type { GameEvent } from '../../../types'

const placed: GameEvent = {
  type: 'BoardPlaced',
  timestampMs: 2807,
  gridSize: [2, 2],
  boardSizeM: 1.8,
  boardOrigin: [0, -1.33, 4],
  boardRotation: [0, 0, 0, 1],
}

describe('boardGeometry', () => {
  it('returns null without a BoardPlaced event', () => {
    expect(boardGeometry([], 0.9)).toBeNull()
  })

  it('puts the four corners half a board from the origin', () => {
    const g = boardGeometry([placed], 0.9)!
    const xs = g.outline.map(p => p.x).sort((a, b) => a - b)
    const zs = g.outline.map(p => p.z).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(-0.9, 6)
    expect(xs[3]).toBeCloseTo(0.9, 6)
    expect(zs[0]).toBeCloseTo(3.1, 6)
    expect(zs[3]).toBeCloseTo(4.9, 6)
  })

  it('splits into gridSize cells', () => {
    const g = boardGeometry([placed], 0.9)!
    expect(g.cells).toHaveLength(4)
    expect(g.cells.map(c => c.pos)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]])
  })

  it('centres each cell per BoardV2 placement', () => {
    const g = boardGeometry([placed], 0.9)!
    const c00 = g.cells.find(c => c.pos[0] === 0 && c.pos[1] === 0)!
    // BoardV2.cs: x = -half + cellSide*(col+0.5); 2 cols over 1.8 m gives
    // cellSide 0.9, so cell 0 sits 0.45 m from the board centre.
    expect(Math.abs(c00.center.x)).toBeCloseTo(0.45, 6)
    expect(Math.abs(c00.center.z - 4)).toBeCloseTo(0.45, 6)
  })

  it('derives cell side from columns on both axes', () => {
    // LevelConfigV2.cs: CellSide = TotalSizeM / Cols — rows do not divide z.
    const wide = boardGeometry([{ ...placed, gridSize: [4, 1] }], 0.9)!
    expect(wide.cellRadiusM).toBeCloseTo(1.8 / 4 / 2, 6)
    expect(wide.cells).toHaveLength(4)
  })

  it('puts the user circle in front of the board, not at its centre', () => {
    // TargetUserCircleGeometry: frontRowCenterZ - tangentDistance - 0.5 m.
    const g = boardGeometry([placed], 0.9)!
    expect(g.userCircleCenter.z).toBeLessThan(g.center.z)
    const cellR = 0.45
    const userR = 0.45
    const lateral = 0.45
    const tangent = Math.sqrt((cellR + userR) ** 2 - lateral ** 2)
    expect(g.userCircleCenter.z).toBeCloseTo(4 + (-0.9 + cellR - tangent - 0.5), 5)
  })

  it('applies the board yaw to the outline', () => {
    // 90° about Y: the board footprint rotates but stays centred on origin.
    const half = Math.sqrt(0.5)
    const rotated: GameEvent = { ...placed, boardRotation: [0, half, 0, half] }
    const g = boardGeometry([rotated], 0.9)!
    for (const p of g.outline) {
      const d = Math.hypot(p.x - 0, p.z - 4)
      expect(d).toBeCloseTo(Math.hypot(0.9, 0.9), 5)
    }
  })

  it('carries the user circle radius', () => {
    const g = boardGeometry([placed], 0.9)!
    expect(g.userCircleRadiusM).toBeCloseTo(0.45, 6)
    expect(g.center).toEqual({ x: 0, z: 4 })
  })

  it('handles a 1x1 board', () => {
    const g = boardGeometry([{ ...placed, gridSize: [1, 1] }], 0.9)!
    expect(g.cells).toHaveLength(1)
    expect(g.cells[0].center).toEqual({ x: 0, z: 4 })
  })
})

describe('activeCellAt', () => {
  const rounds: GameEvent[] = [
    { type: 'RoundStarted', timestampMs: 1000, activeCellPos: [0, 0] },
    { type: 'RoundStarted', timestampMs: 5000, activeCellPos: [1, 1] },
  ]

  it('is null before the first round', () => {
    expect(activeCellAt(rounds, 500)).toBeNull()
  })

  it('takes the most recent round at or before the playhead', () => {
    expect(activeCellAt(rounds, 1000)).toEqual([0, 0])
    expect(activeCellAt(rounds, 4999)).toEqual([0, 0])
    expect(activeCellAt(rounds, 5000)).toEqual([1, 1])
    expect(activeCellAt(rounds, 99999)).toEqual([1, 1])
  })

  it('ignores rounds with no cell', () => {
    expect(activeCellAt([{ type: 'RoundStarted', timestampMs: 0 }], 10)).toBeNull()
  })
})

describe('cellHitsUpTo', () => {
  const evs: GameEvent[] = [
    { type: 'DogEnteredCell', timestampMs: 1000, worldPosition: [1, -1.3, 2], hitType: 'FullHit' },
    { type: 'DogEnteredCell', timestampMs: 9000, worldPosition: [2, -1.3, 3], hitType: 'HalfHit' },
    { type: 'RoundStarted', timestampMs: 500 },
  ]

  it('returns only hits at or before the playhead', () => {
    expect(cellHitsUpTo(evs, 999)).toHaveLength(0)
    expect(cellHitsUpTo(evs, 1000)).toHaveLength(1)
    expect(cellHitsUpTo(evs, 10_000)).toHaveLength(2)
  })

  it('carries position and hit type', () => {
    const h = cellHitsUpTo(evs, 10_000)[0]
    expect(h.x).toBe(1)
    expect(h.z).toBe(2)
    expect(h.hitType).toBe('FullHit')
  })

  it('ignores events without a world position', () => {
    expect(cellHitsUpTo([{ type: 'DogEnteredCell', timestampMs: 0 }], 10)).toHaveLength(0)
  })
})
