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
 * `RoundStarted.roundNumber` is 1-based and maps one-to-one onto
 * `actionSequence` — measured across four bundles, where a completed session's
 * final `roundNumber` equals the sequence length exactly. That is a more direct
 * signal than counting completions, which arrive as `BehaviorCompleted` for
 * boop actions but `DogEnteredCell` for pass-through ones.
 */
export function currentAction(
  config: unknown,
  events: GameEvent[],
  ts: number,
): ActionInfo | null {
  const cfg = config as LevelConfigLike | null
  const seq = cfg?.actionSequence
  if (!Array.isArray(seq) || seq.length === 0) return null

  let roundNumber: number | null = null
  for (const e of events) {
    if (e.type !== 'RoundStarted' || e.timestampMs > ts) continue
    if (typeof e.roundNumber === 'number') roundNumber = e.roundNumber
  }
  if (roundNumber === null) return null

  const index = roundNumber - 1
  if (index < 0 || index >= seq.length) return null

  const action = seq[index] as { id?: unknown; type?: unknown; lure?: unknown }
  return {
    index,
    total: seq.length,
    id: typeof action.id === 'string' ? action.id : `#${roundNumber}`,
    type: typeof action.type === 'string' ? action.type : 'unknown',
    lure: action.lure === true,
  }
}
