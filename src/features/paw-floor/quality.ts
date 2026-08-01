import type { PawFloorFrame, PawName } from '../../types'
import { rayGeometry, type Vec3 } from './geometry'
import { stanceBaseline, stanceResidualM, type PawPositions, type StanceBaseline } from './stance'

export type Verdict = 'TRUSTWORTHY' | 'DEGRADED' | 'UNRELIABLE'

export interface SessionQuality {
  verdict: Verdict
  reasons: string[]
  hitRate: number
  sampleCount: number
  pawCounts: Record<PawName, number>
  depressionP5: number
  depressionP50: number
  planeYSpanM: number
  planeCount: number
  residualP50M: number
  baseline: StanceBaseline
}

export interface QualityInput {
  pawFrames: Map<number, PawFloorFrame>
  camFor: (frameId: number) => Vec3 | null
  focalPx: number
}

const MIN_HIT_RATE = 0.80
const MIN_DEPRESSION_P5_UNRELIABLE = 30
const MIN_DEPRESSION_P5_DEGRADED = 45
const MAX_PLANE_Y_SPAN_M = 0.05
const MAX_RESIDUAL_P50_M = 0.03
const MIN_PAW_SHARE = 0.10

function percentile(values: number[], q: number): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
}

export function sessionQuality(input: QualityInput): SessionQuality | null {
  const { pawFrames, camFor, focalPx } = input
  if (pawFrames.size === 0) return null

  const pawCounts: Record<PawName, number> = {
    left_front_paw: 0, right_front_paw: 0, left_back_paw: 0, right_back_paw: 0,
  }
  const depressions: number[] = []
  const planeIds = new Set<string>()
  const planeYs: number[] = []
  const observations: Array<{ paws: PawPositions; cam: Vec3 }> = []

  let sampleCount = 0
  let hitCount = 0

  for (const [frameId, frame] of pawFrames) {
    const cam = camFor(frameId)
    const positions: PawPositions = new Map()

    for (const [name, paw] of frame.paws) {
      sampleCount++
      if (!paw.hit || !paw.world) continue
      hitCount++
      pawCounts[name]++
      planeYs.push(paw.world.y)
      if (paw.planeId) planeIds.add(paw.planeId)
      positions.set(name, paw.world)

      if (cam) {
        const geom = rayGeometry(paw.world, cam, focalPx)
        if (geom) depressions.push(geom.depressionDeg)
      }
    }

    if (cam && positions.size >= 2) observations.push({ paws: positions, cam })
  }

  if (sampleCount === 0) return null

  const baseline = stanceBaseline(observations)
  const residuals: number[] = []
  for (const obs of observations) {
    const r = stanceResidualM(obs.paws, obs.cam, baseline)
    if (r !== null) residuals.push(r)
  }

  const hitRate = hitCount / sampleCount
  const depressionP5 = percentile(depressions, 0.05)
  const depressionP50 = percentile(depressions, 0.5)
  const planeYSpanM = planeYs.length > 0 ? Math.max(...planeYs) - Math.min(...planeYs) : 0
  const residualP50M = residuals.length > 0 ? percentile(residuals, 0.5) : NaN

  const unreliable: string[] = []
  const degraded: string[] = []

  if (hitRate < MIN_HIT_RATE) {
    unreliable.push(`hit rate ${(hitRate * 100).toFixed(0)}% below ${MIN_HIT_RATE * 100}%`)
  }
  if (Number.isFinite(depressionP5) && depressionP5 < MIN_DEPRESSION_P5_UNRELIABLE) {
    unreliable.push(`rays graze the floor (p5 depression ${depressionP5.toFixed(0)}°)`)
  }
  if (planeIds.size > 1) {
    unreliable.push(`${planeIds.size} planes used — hits sit on disagreeing heights`)
  }
  if (planeYSpanM > MAX_PLANE_Y_SPAN_M) {
    unreliable.push(`plane height moved ${(planeYSpanM * 100).toFixed(1)} cm`)
  }

  if (!baseline.qualified) {
    degraded.push('stance baseline not stable enough to validate frames')
  }
  if (Number.isFinite(residualP50M) && residualP50M > MAX_RESIDUAL_P50_M) {
    degraded.push(`median stance residual ${(residualP50M * 100).toFixed(1)} cm`)
  }
  if (Number.isFinite(depressionP5) && depressionP5 < MIN_DEPRESSION_P5_DEGRADED) {
    degraded.push(`shallow viewing angle (p5 depression ${depressionP5.toFixed(0)}°)`)
  }

  const bestPawCount = Math.max(...Object.values(pawCounts))
  if (bestPawCount > 0) {
    for (const [name, count] of Object.entries(pawCounts) as Array<[PawName, number]>) {
      if (count < bestPawCount * MIN_PAW_SHARE) {
        degraded.push(`${name} barely observed (${count} vs ${bestPawCount})`)
      }
    }
  }

  const verdict: Verdict =
    unreliable.length > 0 ? 'UNRELIABLE' : degraded.length > 0 ? 'DEGRADED' : 'TRUSTWORTHY'

  return {
    verdict,
    reasons: [...unreliable, ...degraded],
    hitRate,
    sampleCount,
    pawCounts,
    depressionP5,
    depressionP50,
    planeYSpanM,
    planeCount: planeIds.size,
    residualP50M,
    baseline,
  }
}
