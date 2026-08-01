import type { GameEvent } from '../../types'

export interface LevelHeader {
  number: number
  name: string | null
}

export interface ActionInfo {
  index: number
  total: number
  id: string
  type: string
  lure: boolean
}

interface LevelConfigLike {
  levelNumber?: unknown
  levelName?: unknown
  actionSequence?: unknown
}

/** Free-play sessions launched from the dev menu record this instead of a level. */
const DEV_MENU_LEVEL = -1

export function levelHeader(
  config: unknown,
  sessionMeta: unknown,
): LevelHeader | null {
  const cfg = config as LevelConfigLike | null

  if (cfg && typeof cfg.levelNumber === 'number' && cfg.levelNumber !== DEV_MENU_LEVEL) {
    return {
      number: cfg.levelNumber,
      name: typeof cfg.levelName === 'string' ? cfg.levelName : null,
    }
  }

  const metaNumber = (sessionMeta as { levelNumber?: unknown } | null)?.levelNumber
  if (typeof metaNumber === 'number' && metaNumber !== DEV_MENU_LEVEL) {
    return { number: metaNumber, name: null }
  }

  return null
}

/**
 * The action in progress at a given moment.
 *
 * Two recorder schemas are in the wild and both are supported:
 *
 * - Newer builds emit `ActionStarted` carrying `actionId`, which matches an
 *   entry's `id` in `actionSequence` directly.
 * - Older builds emit `RoundStarted` carrying a 1-based `roundNumber` that maps
 *   one-to-one onto the sequence — verified on four bundles, where a completed
 *   session's final `roundNumber` equals the sequence length exactly.
 *
 * Counting completions would work for neither cleanly: they arrive as
 * `BehaviorCompleted` for boop actions but `DogEnteredCell` for pass-through
 * ones, and the newer schema drops `BehaviorCompleted` altogether.
 */
export function currentAction(
  config: unknown,
  events: GameEvent[],
  ts: number,
): ActionInfo | null {
  const cfg = config as LevelConfigLike | null
  const seq = cfg?.actionSequence
  if (!Array.isArray(seq) || seq.length === 0) return null

  let index: number | null = null
  for (const e of events) {
    if (e.timestampMs > ts) continue

    if (e.type === 'ActionStarted' && typeof e.actionId === 'string') {
      const found = seq.findIndex(a => (a as { id?: unknown }).id === e.actionId)
      if (found >= 0) index = found
      continue
    }
    if (e.type === 'RoundStarted' && typeof e.roundNumber === 'number') {
      index = e.roundNumber - 1
    }
  }
  if (index === null || index < 0 || index >= seq.length) return null

  const action = seq[index] as { id?: unknown; type?: unknown; lure?: unknown }
  return {
    index,
    total: seq.length,
    id: typeof action.id === 'string' ? action.id : `#${index + 1}`,
    type: typeof action.type === 'string' ? action.type : 'unknown',
    lure: action.lure === true,
  }
}
