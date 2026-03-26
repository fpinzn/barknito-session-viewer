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
