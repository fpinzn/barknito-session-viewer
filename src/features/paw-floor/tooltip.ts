import type { PawName } from '../../types'
import type { Vec3 } from './geometry'

export interface PawTooltipInput {
  paw: PawName
  world: Vec3
  frameId: number
  ts: number
  suspectReason: 'collapse' | 'jerk' | null
}

export interface PawTooltip {
  lines: string[]
}

const REASON_TEXT: Record<'collapse' | 'jerk', string> = {
  collapse: '⚠ collapsed onto another paw — identity swap',
  jerk: '⚠ departed and returned — single-frame teleport',
}

/**
 * Hover label for a track sample.
 *
 * Coordinates are the raw AR world position straight from the CSV, not the
 * mirrored values the scene draws — those are a rendering detail and would not
 * match anything you could grep for in the bundle.
 */
export function formatPawTooltip(input: PawTooltipInput): PawTooltip {
  const { paw, world, frameId, ts, suspectReason } = input
  const f = (v: number) => v.toFixed(3)

  const lines = [
    paw,
    `x ${f(world.x)}  y ${f(world.y)}  z ${f(world.z)}`,
    `frame ${frameId}  ·  ${ts} ms (${(ts / 1000).toFixed(3)} s)`,
  ]

  if (suspectReason) lines.push(REASON_TEXT[suspectReason])

  return { lines }
}
