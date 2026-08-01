import type { PawName } from '../../types'
import { correctForLift, type Vec3 } from './geometry'

export type PawPositions = Map<PawName, Vec3>
export type Lifts = Partial<Record<PawName, number>>

export interface PairStat {
  pair: [PawName, PawName]
  median: number
  relIQR: number
  samples: number
}

export interface StanceBaseline {
  pairs: PairStat[]
  qualified: boolean
}

const PAW_ORDER: PawName[] = [
  'left_front_paw', 'right_front_paw', 'left_back_paw', 'right_back_paw',
]

/** A pair needs this many samples before its statistics mean anything. */
export const MIN_PAIR_SAMPLES = 20
/** A pair is "stable" below this relative interquartile range. */
export const MAX_STABLE_REL_IQR = 0.15
/** Fewer qualifying pairs than this and the baseline is not usable. */
export const MIN_QUALIFIED_PAIRS = 3

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
}

function pairKey(a: PawName, b: PawName): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function corrected(
  paws: PawPositions,
  cam: Vec3,
  lifts: Lifts,
): Map<PawName, { x: number; z: number }> {
  const out = new Map<PawName, { x: number; z: number }>()
  for (const [name, pos] of paws) {
    out.set(name, correctForLift(pos, cam, lifts[name] ?? 0))
  }
  return out
}

export function stanceBaseline(
  observations: Array<{ paws: PawPositions; cam: Vec3 }>,
): StanceBaseline {
  const samples = new Map<string, number[]>()

  for (const obs of observations) {
    const pos = corrected(obs.paws, obs.cam, {})
    for (let i = 0; i < PAW_ORDER.length; i++) {
      for (let j = i + 1; j < PAW_ORDER.length; j++) {
        const a = pos.get(PAW_ORDER[i])
        const b = pos.get(PAW_ORDER[j])
        if (!a || !b) continue
        const key = pairKey(PAW_ORDER[i], PAW_ORDER[j])
        if (!samples.has(key)) samples.set(key, [])
        samples.get(key)!.push(Math.hypot(a.x - b.x, a.z - b.z))
      }
    }
  }

  const pairs: PairStat[] = []
  for (const [key, values] of samples) {
    if (values.length < MIN_PAIR_SAMPLES) continue
    const sorted = [...values].sort((m, n) => m - n)
    const median = quantile(sorted, 0.5)
    const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25)
    const [a, b] = key.split('|') as [PawName, PawName]
    pairs.push({
      pair: [a, b],
      median,
      relIQR: median > 0 ? iqr / median : Infinity,
      samples: values.length,
    })
  }

  // Phrased over *available* pairs, not a fixed count: a session can lose a paw
  // entirely and still be usable if the pairs it does have are tight.
  const qualified =
    pairs.length >= MIN_QUALIFIED_PAIRS &&
    pairs.every(p => p.relIQR < MAX_STABLE_REL_IQR)

  return { pairs, qualified }
}

export function stanceResidualM(
  paws: PawPositions,
  cam: Vec3,
  baseline: StanceBaseline,
  lifts: Lifts = {},
): number | null {
  const pos = corrected(paws, cam, lifts)
  let sum = 0
  let count = 0

  for (const stat of baseline.pairs) {
    const a = pos.get(stat.pair[0])
    const b = pos.get(stat.pair[1])
    if (!a || !b) continue
    const observed = Math.hypot(a.x - b.x, a.z - b.z)
    const diff = observed - stat.median
    sum += diff * diff
    count++
  }

  if (count < 2) return null
  return Math.sqrt(sum / count)
}
