import type {
  Landmark, Intrinsics, GameEvent, SessionMeta,
  PawName, PawHit, PawFloorFrame,
} from '../../types'

// ─── CSV Detection ──────────────────────────────────────────────────

export function detectCSVType(header: string): 'pose' | 'sensor' | 'pawFloor' | 'unknown' {
  // Checked first: the paw CSV also carries `model_id`.
  if (header.includes('paw_name') && header.includes('plane_id')) return 'pawFloor'
  if (header.includes('landmark') && header.includes('model_id')) return 'pose'
  if (header.includes('cam_pos_x') && header.includes('cam_rot_x')) return 'sensor'
  return 'unknown'
}

// ─── Pose CSV ───────────────────────────────────────────────────────

export interface PoseParseResult {
  frameMap: Map<number, { ts: number; models: Map<string, Map<string, Landmark>> }>
  models: string[]
}

export function parsePoseCSV(text: string): PoseParseResult {
  const lines = text.trim().split('\n')
  const header = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim())
  const ci: Record<string, number> = {}
  header.forEach((h, i) => ci[h] = i)

  const frameMap = new Map<number, { ts: number; models: Map<string, Map<string, Landmark>> }>()

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < header.length) continue

    const frameId = parseInt(cols[ci['frame_id']])
    const modelId = cols[ci['model_id']].trim()
    const landmark = cols[ci['landmark']].trim()
    const x = parseFloat(cols[ci['x']])
    const y = parseFloat(cols[ci['y']])
    const conf = parseFloat(cols[ci['confidence']])
    const depth = ci['depth_m'] !== undefined ? parseFloat(cols[ci['depth_m']]) : NaN
    const ts = parseInt(cols[ci['timestamp_ms']])

    if (!frameMap.has(frameId)) frameMap.set(frameId, { models: new Map(), ts })

    const frame = frameMap.get(frameId)!
    if (!frame.models.has(modelId)) frame.models.set(modelId, new Map())
    frame.models.get(modelId)!.set(landmark, { x, y, depth, conf })
  }

  const allModels = new Set<string>()
  for (const [, f] of frameMap) for (const m of f.models.keys()) allModels.add(m)

  return { frameMap, models: [...allModels] }
}

// ─── Sensor CSV ─────────────────────────────────────────────────────

export interface SensorParseResult {
  frameMap: Map<number, {
    ts: number
    pos: { x: number; y: number; z: number }
    rot: { x: number; y: number; z: number; w: number }
  }>
}

export function parseSensorCSV(text: string): SensorParseResult {
  const lines = text.trim().split('\n')
  const header = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim())
  const ci: Record<string, number> = {}
  header.forEach((h, i) => ci[h] = i)

  const frameMap = new Map<number, {
    ts: number
    pos: { x: number; y: number; z: number }
    rot: { x: number; y: number; z: number; w: number }
  }>()

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < 8) continue

    const frameId = parseInt(cols[ci['frame_id']])
    const ts = parseInt(cols[ci['timestamp_ms']])
    frameMap.set(frameId, {
      ts,
      pos: {
        x: parseFloat(cols[ci['cam_pos_x']]),
        y: parseFloat(cols[ci['cam_pos_y']]),
        z: parseFloat(cols[ci['cam_pos_z']]),
      },
      rot: {
        x: parseFloat(cols[ci['cam_rot_x']]),
        y: parseFloat(cols[ci['cam_rot_y']]),
        z: parseFloat(cols[ci['cam_rot_z']]),
        w: parseFloat(cols[ci['cam_rot_w']]),
      },
    })
  }

  return { frameMap }
}

// ─── JSON Routing ───────────────────────────────────────────────────

interface ARPlaneEventRaw {
  timestampMs: number
  planeId: string
  alignment?: string
  classification?: string
  center?: { x: number; y: number; z: number }
  extent?: { x: number; z: number }
  boundary?: number[] | number[][]
  transform?: number[]
}

export type ParseJSONResult =
  | { type: 'gameEvents'; data: { events: GameEvent[] } }
  | { type: 'arPlaneEvents'; data: { planes: ARPlaneEventRaw[] } }
  | { type: 'sessionMeta'; data: { meta: SessionMeta; intrinsics?: Intrinsics } }
  | { type: 'gameConfig'; data: unknown }
  | { type: 'unknown'; data: unknown }

export function parseJSON(text: string, filename: string): ParseJSONResult {
  const json = JSON.parse(text)

  // Game config file
  if (filename.toLowerCase().includes('game_config')) {
    return { type: 'gameConfig', data: json }
  }

  // Game events file
  if (json.events && Array.isArray(json.events)) {
    return { type: 'gameEvents', data: { events: json.events as GameEvent[] } }
  }

  // AR events file (planes)
  if (json.planes && Array.isArray(json.planes)) {
    const planes = (json.planes as ARPlaneEventRaw[])
      .slice()
      .sort((a, b) => a.timestampMs - b.timestampMs)

    // Convert flat boundary arrays [x0,z0,x1,z1,...] → [[x0,z0],[x1,z1],...]
    for (const evt of planes) {
      if (evt.boundary && evt.boundary.length >= 6 && !Array.isArray(evt.boundary[0])) {
        const flat = evt.boundary as number[]
        const pairs: number[][] = []
        for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]])
        evt.boundary = pairs
      }
    }

    return { type: 'arPlaneEvents', data: { planes } }
  }

  // Session meta with intrinsics
  if (json.focalLengthX && json.cameraResW) {
    const intrinsics: Intrinsics = {
      fx: json.focalLengthX,
      fy: json.focalLengthY,
      cx: json.principalPointX,
      cy: json.principalPointY,
      resW: json.cameraResW,
      resH: json.cameraResH,
    }
    const meta: SessionMeta = {
      sceneId: json.sceneId,
      deviceId: json.deviceId,
      sessionId: json.sessionId,
      ...json,
    }
    return { type: 'sessionMeta', data: { meta, intrinsics } }
  }

  return { type: 'unknown', data: json }
}

// ─── Paw Floor Projection CSV ───────────────────────────────────────

const PAW_NAMES: readonly string[] = [
  'left_front_paw', 'right_front_paw', 'left_back_paw', 'right_back_paw',
]

/** Parse an optional float column; empty string yields null, never NaN. */
function optFloat(raw: string | undefined): number | null {
  const t = (raw ?? '').trim()
  if (t === '') return null
  const v = parseFloat(t)
  return Number.isFinite(v) ? v : null
}

export function parsePawFloorCSV(text: string): Map<number, PawFloorFrame> {
  const lines = text.trim().split('\n')
  const header = lines[0].replace(/^﻿/, '').split(',').map(h => h.trim())
  const ci: Record<string, number> = {}
  header.forEach((h, i) => ci[h] = i)

  const frameMap = new Map<number, PawFloorFrame>()

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < header.length) continue

    const pawName = cols[ci['paw_name']].trim()
    if (!PAW_NAMES.includes(pawName)) continue

    const frameId = parseInt(cols[ci['frame_id']])
    const ts = parseInt(cols[ci['timestamp_ms']])
    if (!Number.isFinite(frameId) || !Number.isFinite(ts)) continue

    if (!frameMap.has(frameId)) frameMap.set(frameId, { ts, paws: new Map() })

    const hit = cols[ci['hit']].trim() === '1'
    const wx = optFloat(cols[ci['world_x']])
    const wy = optFloat(cols[ci['world_y']])
    const wz = optFloat(cols[ci['world_z']])
    const planeId = (cols[ci['plane_id']] ?? '').trim()

    const entry: PawHit = {
      conf: parseFloat(cols[ci['paw_confidence']]),
      screenX: parseFloat(cols[ci['screen_x_px']]),
      screenY: parseFloat(cols[ci['screen_y_px']]),
      hit,
      planeId: planeId === '' ? null : planeId,
      world: hit && wx !== null && wy !== null && wz !== null
        ? { x: wx, y: wy, z: wz }
        : null,
    }

    frameMap.get(frameId)!.paws.set(pawName as PawName, entry)
  }

  return frameMap
}
