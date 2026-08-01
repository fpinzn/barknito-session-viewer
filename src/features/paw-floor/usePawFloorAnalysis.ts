import { useMemo } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { sessionQuality, type SessionQuality } from './quality'
import type { Vec3 } from './geometry'

/** Nearest-frame tolerance when a paw sample has no exact sensor row. */
const MAX_FRAME_GAP = 3

export function rayColorHex(depressionDeg: number): number {
  if (depressionDeg >= 55) return 0x44dd88
  if (depressionDeg >= 40) return 0xddaa44
  return 0xdd4444
}

interface SensorEntry {
  ts: number
  pos: { x: number; y: number; z: number }
  rot: { x: number; y: number; z: number; w: number }
}

/**
 * Camera position by paw-sample frame id. The paw CSV stamps `Time.frameCount`,
 * which matches `sensors.csv.gz` on 2 727 of 2 728 measured frames, so the
 * nearest-frame fallback is a rare path rather than the norm.
 */
export function buildCamLookup(
  sensorMap: Map<number, SensorEntry>,
): (frameId: number) => Vec3 | null {
  const frameIds = [...sensorMap.keys()].sort((a, b) => a - b)

  return (frameId: number) => {
    const exact = sensorMap.get(frameId)
    if (exact) return exact.pos
    if (frameIds.length === 0) return null

    let lo = 0
    let hi = frameIds.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (frameIds[mid] < frameId) lo = mid + 1
      else hi = mid
    }
    const candidates = [frameIds[lo], frameIds[Math.max(0, lo - 1)]]
    let best: number | null = null
    for (const c of candidates) {
      if (best === null || Math.abs(c - frameId) < Math.abs(best - frameId)) best = c
    }
    if (best === null || Math.abs(best - frameId) > MAX_FRAME_GAP) return null
    return sensorMap.get(best)!.pos
  }
}

export interface PawFloorAnalysis {
  quality: SessionQuality
  camFor: (frameId: number) => Vec3 | null
  focalPx: number
}

export function usePawFloorAnalysis(): PawFloorAnalysis | null {
  const pawFloorFrameMap = useSessionStore(s => s.pawFloorFrameMap)
  const sensorFrameMap = useSessionStore(s => s.sensorFrameMap)
  const intrinsics = useSessionStore(s => s.intrinsics)

  return useMemo(() => {
    if (!pawFloorFrameMap || pawFloorFrameMap.size === 0) return null
    if (!sensorFrameMap || sensorFrameMap.size === 0) return null

    const focalPx = intrinsics?.fx ?? 1357.7
    const camFor = buildCamLookup(sensorFrameMap)
    const quality = sessionQuality({ pawFrames: pawFloorFrameMap, camFor, focalPx })
    if (!quality) return null

    return { quality, camFor, focalPx }
  }, [pawFloorFrameMap, sensorFrameMap, intrinsics])
}
