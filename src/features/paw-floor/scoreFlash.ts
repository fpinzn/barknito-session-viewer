import type { GameEvent } from '../../types'

/** How long a scored cell keeps flashing, in session milliseconds. */
export const SCORE_FADE_MS = 900

export function cellKey(pos: number[] | readonly number[]): string {
  return `${pos[0]},${pos[1]}`
}

/**
 * Per-cell flash intensity at a given moment, 1 at the instant of the score
 * decaying to 0 across `SCORE_FADE_MS`.
 *
 * Keyed to session time rather than wall-clock, so the flash animates during
 * playback, holds still when paused, and reproduces exactly when you scrub back
 * to the same moment.
 */
export function scoreFlash(
  events: GameEvent[],
  ts: number,
  fadeMs: number = SCORE_FADE_MS,
): Map<string, number> {
  const out = new Map<string, number>()

  for (const e of events) {
    if (e.type !== 'DogEnteredCell') continue
    if (e.timestampMs > ts) continue

    const pos = e.nearestCellPos as number[] | undefined
    if (!pos || pos.length < 2) continue

    const age = ts - e.timestampMs
    if (age >= fadeMs) {
      // A later scrub may have left a stale entry from an earlier score.
      out.delete(cellKey(pos))
      continue
    }
    out.set(cellKey(pos), 1 - age / fadeMs)
  }

  return out
}
