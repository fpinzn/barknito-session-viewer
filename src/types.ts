export interface Landmark {
  x: number  // normalized 0-1
  y: number
  depth: number
  conf: number
}

export interface PoseFrame {
  id: number
  ts: number  // boot-relative timestamp ms
  models: Map<string, Map<string, Landmark>>
}

export interface SensorFrame {
  ts: number
  pos: { x: number; y: number; z: number }
  rot: { x: number; y: number; z: number; w: number }
}

export interface Intrinsics {
  fx: number; fy: number
  cx: number; cy: number
  resW: number; resH: number
}

export interface GameEvent {
  type: string
  timestampMs: number
  [key: string]: unknown
}

export interface ARPlaneEvent {
  timestampMs: number
  planeId: string
  alignment?: string
  classification?: string
  center?: { x: number; y: number; z: number }
  extent?: { x: number; z: number }
  boundary?: Array<{ x: number; y: number; z: number }>
  transform?: number[]
}

export interface AttentionEntry {
  timestamp_ms: number
  looking_at: string
  [key: string]: unknown
}

export interface SessionMeta {
  sceneId?: string
  deviceId?: string
  sessionId?: string
  /**
   * Coordinate convention for pose landmarks. Absent means a build predating the
   * declaration, i.e. raw Vision output in the native landscape buffer with a
   * bottom-left origin. See `ml/docs/session-bundle-contract.md`.
   */
  landmarkSpace?: string
  [key: string]: unknown
}

export interface BoneConnection {
  from: string
  to: string
  color: [number, number, number]
}

export interface SkeletonDef {
  bones: BoneConnection[]
  jointColors: Record<string, [number, number, number]>
  legend: Array<{ label: string; color: [number, number, number] }>
  label: string
}

export type PawName =
  | 'left_front_paw'
  | 'right_front_paw'
  | 'left_back_paw'
  | 'right_back_paw'

/**
 * One paw sample from `paw_floor_projection_raycasting_v1`.
 *
 * `world` is the raycast's intersection with a horizontal AR plane, so its `y`
 * is the plane's height, never a measured paw height. The CSV's `paw_depth_m`
 * column is deliberately not represented here: it is empty in every row the
 * recorder has ever written, because Vision's animal-pose request does not
 * populate the depth it is sourced from.
 */
export interface PawHit {
  conf: number
  screenX: number
  screenY: number
  hit: boolean
  planeId: string | null
  world: { x: number; y: number; z: number } | null
}

export interface PawFloorFrame {
  ts: number
  paws: Map<PawName, PawHit>
}
