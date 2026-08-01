import type { GameEvent } from '../../types'

export interface LiveBadVibe {
  badVibeId: string
  cellPos: [number, number]
  variant: string | null
  hitsRequired: number | null
  totalDamage: number
}

/**
 * Bad vibes alive on the board at a given moment.
 *
 * A vibe is one entity across its lifetime: `BadVibeSpawned` places it,
 * `BadVibeMoved` relocates it to a newly active cell, and `BadVibeHit` damages
 * it until `defeated`, at which point it leaves the board.
 */
export function liveBadVibesAt(events: GameEvent[], ts: number): Map<string, LiveBadVibe> {
  const live = new Map<string, LiveBadVibe>()

  for (const e of events) {
    if (e.timestampMs > ts) continue

    const id = e.badVibeId as string | undefined
    if (!id) continue
    const pos = e.cellPos as number[] | undefined

    if (e.type === 'BadVibeSpawned') {
      if (!pos || pos.length < 2) continue
      live.set(id, {
        badVibeId: id,
        cellPos: [pos[0], pos[1]],
        variant: typeof e.variant === 'string' ? e.variant : null,
        hitsRequired: typeof e.hitsRequired === 'number' ? e.hitsRequired : null,
        totalDamage: 0,
      })
      continue
    }

    if (e.type === 'BadVibeMoved') {
      const existing = live.get(id)
      if (!existing || !pos || pos.length < 2) continue
      existing.cellPos = [pos[0], pos[1]]
      continue
    }

    if (e.type === 'BadVibeHit') {
      if (e.defeated === true) {
        live.delete(id)
        continue
      }
      const existing = live.get(id)
      if (existing && typeof e.totalDamage === 'number') existing.totalDamage = e.totalDamage
    }
  }

  return live
}
