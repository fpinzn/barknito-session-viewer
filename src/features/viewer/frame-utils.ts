import type { Landmark } from '../../types'

export const MAX_POSE_GAP_MS = 100 // ~3 frames at 30fps

interface SensorEntry {
  ts: number
  pos: { x: number; y: number; z: number }
  rot: { x: number; y: number; z: number; w: number }
}

export interface Frame {
  id: number
  ts: number
  sensor: SensorEntry | null
}

export interface PoseEvent {
  ts: number
  models: Map<string, Map<string, Landmark>>
}

export interface FrameListResult {
  frames: Frame[]
  models: string[]
  poseEvents: PoseEvent[]
}

interface RebuildInput {
  sensorFrameMap?: Map<number, SensorEntry>
  poseFrameMap?: Map<number, { ts: number; models: Map<string, Map<string, Landmark>> }>
  models?: string[]
}

/**
 * Build a unified frame list from sensor and/or pose data, sorted by timestamp.
 * Sensor data is the primary timeline; pose data is fallback.
 */
export function rebuildFrameList(input: RebuildInput): FrameListResult {
  const { sensorFrameMap, poseFrameMap, models: inputModels } = input

  let entries: Array<{ id: number; ts: number; sensor: SensorEntry | null }>

  if (sensorFrameMap && sensorFrameMap.size > 0) {
    entries = [...sensorFrameMap.entries()].map(([id, s]) => ({
      id, ts: s.ts, sensor: s,
    }))
  } else if (poseFrameMap && poseFrameMap.size > 0) {
    entries = [...poseFrameMap.entries()].map(([id, p]) => ({
      id, ts: p.ts, sensor: null,
    }))
  } else {
    return { frames: [], models: [], poseEvents: [] }
  }

  // Sort by timestamp
  entries.sort((a, b) => a.ts - b.ts)

  // Filter epoch timestamps when boot-relative frames exist
  const bootRelative = entries.filter(e => e.ts > 0 && e.ts < 1e12)
  if (bootRelative.length > 0) entries = bootRelative

  const frames: Frame[] = entries.map(e => ({ id: e.id, ts: e.ts, sensor: e.sensor }))
  const models = inputModels ?? []

  // Build sorted pose events timeline for timestamp-based skeleton lookup
  const poseEvents: PoseEvent[] = []
  if (poseFrameMap) {
    for (const [, entry] of poseFrameMap) {
      if (entry.models.size > 0) {
        poseEvents.push({ ts: entry.ts, models: entry.models })
      }
    }
    poseEvents.sort((a, b) => a.ts - b.ts)
  }

  return { frames, models, poseEvents }
}

/**
 * Binary-search poseEvents for the entry whose timestamp is closest to targetTs.
 * Returns empty map if the nearest event is more than MAX_POSE_GAP_MS away.
 */
export function findNearestPoseModels(
  poseEvents: PoseEvent[],
  targetTs: number,
): Map<string, Map<string, Landmark>> {
  if (poseEvents.length === 0) return new Map()

  let lo = 0
  let hi = poseEvents.length - 1

  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (poseEvents[mid].ts < targetTs) lo = mid + 1
    else hi = mid
  }

  // Check if the previous entry is actually closer
  if (lo > 0 && Math.abs(poseEvents[lo - 1].ts - targetTs) <= Math.abs(poseEvents[lo].ts - targetTs)) {
    lo--
  }

  if (Math.abs(poseEvents[lo].ts - targetTs) > MAX_POSE_GAP_MS) return new Map()
  return poseEvents[lo].models
}
