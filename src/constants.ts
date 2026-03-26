import type { BoneConnection, SkeletonDef } from './types'

// ─── Depth Encoding ─────────────────────────────────────────────────
// Log encoding: val=0 → invalid; val=1..255 → log-uniform in [DEPTH_MIN, DEPTH_MAX].
// Step at DEPTH_MIN ≈ 3mm — matches LiDAR precision floor.
export const DEPTH_MIN = 0.2
export const DEPTH_MAX = 8.0
const DEPTH_LOG_RANGE = Math.log(DEPTH_MAX / DEPTH_MIN) // log(40) ≈ 3.689

export function decodeDepth(val: number): number {
  if (val === 0) return 0
  return DEPTH_MIN * Math.exp((val - 1) / 254 * DEPTH_LOG_RANGE)
}

// ─── Skeleton Definitions ───────────────────────────────────────────

export const DOG_BONES: BoneConnection[] = [
  // Head
  { from: 'nose', to: 'left_eye', color: [0.2, 0.9, 0.2] },
  { from: 'nose', to: 'right_eye', color: [0.2, 0.9, 0.2] },
  { from: 'left_eye', to: 'left_ear_bottom', color: [0.3, 0.7, 1.0] },
  { from: 'right_eye', to: 'right_ear_bottom', color: [0.3, 0.7, 1.0] },
  { from: 'left_ear_bottom', to: 'left_ear_middle', color: [0.3, 0.7, 1.0] },
  { from: 'left_ear_middle', to: 'left_ear_top', color: [0.3, 0.7, 1.0] },
  { from: 'right_ear_bottom', to: 'right_ear_middle', color: [0.3, 0.7, 1.0] },
  { from: 'right_ear_middle', to: 'right_ear_top', color: [0.3, 0.7, 1.0] },
  { from: 'nose', to: 'neck', color: [0.2, 0.9, 0.2] },
  // Spine
  { from: 'neck', to: 'tail_bottom', color: [1.0, 0.6, 0.2] },
  // Tail
  { from: 'tail_bottom', to: 'tail_middle', color: [1.0, 0.5, 0.0] },
  { from: 'tail_middle', to: 'tail_top', color: [1.0, 0.5, 0.0] },
  // Front left leg
  { from: 'neck', to: 'left_front_elbow', color: [0.8, 0.3, 0.8] },
  { from: 'left_front_elbow', to: 'left_front_knee', color: [0.8, 0.3, 0.8] },
  { from: 'left_front_knee', to: 'left_front_paw', color: [0.8, 0.3, 0.8] },
  // Front right leg
  { from: 'neck', to: 'right_front_elbow', color: [1.0, 0.4, 0.7] },
  { from: 'right_front_elbow', to: 'right_front_knee', color: [1.0, 0.4, 0.7] },
  { from: 'right_front_knee', to: 'right_front_paw', color: [1.0, 0.4, 0.7] },
  // Back left leg
  { from: 'tail_bottom', to: 'left_back_elbow', color: [0.0, 0.9, 0.9] },
  { from: 'left_back_elbow', to: 'left_back_knee', color: [0.0, 0.9, 0.9] },
  { from: 'left_back_knee', to: 'left_back_paw', color: [0.0, 0.9, 0.9] },
  // Back right leg
  { from: 'tail_bottom', to: 'right_back_elbow', color: [0.0, 0.7, 0.7] },
  { from: 'right_back_elbow', to: 'right_back_knee', color: [0.0, 0.7, 0.7] },
  { from: 'right_back_knee', to: 'right_back_paw', color: [0.0, 0.7, 0.7] },
]

export const DOG_JOINT_COLORS: Record<string, [number, number, number]> = {
  'nose':              [0.0, 0.8, 0.0],
  'left_eye':          [0.2, 0.9, 0.2], 'right_eye':          [0.2, 0.9, 0.2],
  'left_ear_bottom':   [0.3, 0.7, 1.0], 'left_ear_middle':    [0.3, 0.7, 1.0], 'left_ear_top':    [0.3, 0.7, 1.0],
  'right_ear_bottom':  [0.3, 0.7, 1.0], 'right_ear_middle':   [0.3, 0.7, 1.0], 'right_ear_top':   [0.3, 0.7, 1.0],
  'neck':              [1.0, 0.8, 0.2],
  'left_front_elbow':  [0.8, 0.3, 0.8], 'left_front_knee':    [0.8, 0.3, 0.8], 'left_front_paw':  [0.8, 0.3, 0.8],
  'right_front_elbow': [1.0, 0.4, 0.7], 'right_front_knee':   [1.0, 0.4, 0.7], 'right_front_paw': [1.0, 0.4, 0.7],
  'left_back_elbow':   [0.0, 0.9, 0.9], 'left_back_knee':     [0.0, 0.9, 0.9], 'left_back_paw':   [0.0, 0.9, 0.9],
  'right_back_elbow':  [0.0, 0.7, 0.7], 'right_back_knee':    [0.0, 0.7, 0.7], 'right_back_paw':  [0.0, 0.7, 0.7],
  'tail_bottom':       [1.0, 0.5, 0.0], 'tail_middle':        [1.0, 0.5, 0.0], 'tail_top':        [1.0, 0.5, 0.0],
}

export const HAND_BONES: BoneConnection[] = [
  { from: 'wrist', to: 'thumb_c_m_c', color: [1.0, 0.3, 0.3] },
  { from: 'thumb_c_m_c', to: 'thumb_m_p', color: [1.0, 0.3, 0.3] },
  { from: 'thumb_m_p', to: 'thumb_i_p', color: [1.0, 0.3, 0.3] },
  { from: 'thumb_i_p', to: 'thumb_tip', color: [1.0, 0.3, 0.3] },

  { from: 'wrist', to: 'index_m_c_p', color: [1.0, 0.6, 0.2] },
  { from: 'index_m_c_p', to: 'index_p_i_p', color: [1.0, 0.6, 0.2] },
  { from: 'index_p_i_p', to: 'index_d_i_p', color: [1.0, 0.6, 0.2] },
  { from: 'index_d_i_p', to: 'index_tip', color: [1.0, 0.6, 0.2] },

  { from: 'wrist', to: 'middle_m_c_p', color: [0.2, 0.9, 0.2] },
  { from: 'middle_m_c_p', to: 'middle_p_i_p', color: [0.2, 0.9, 0.2] },
  { from: 'middle_p_i_p', to: 'middle_d_i_p', color: [0.2, 0.9, 0.2] },
  { from: 'middle_d_i_p', to: 'middle_tip', color: [0.2, 0.9, 0.2] },

  { from: 'wrist', to: 'ring_m_c_p', color: [0.3, 0.7, 1.0] },
  { from: 'ring_m_c_p', to: 'ring_p_i_p', color: [0.3, 0.7, 1.0] },
  { from: 'ring_p_i_p', to: 'ring_d_i_p', color: [0.3, 0.7, 1.0] },
  { from: 'ring_d_i_p', to: 'ring_tip', color: [0.3, 0.7, 1.0] },

  { from: 'wrist', to: 'little_m_c_p', color: [0.8, 0.3, 0.8] },
  { from: 'little_m_c_p', to: 'little_p_i_p', color: [0.8, 0.3, 0.8] },
  { from: 'little_p_i_p', to: 'little_d_i_p', color: [0.8, 0.3, 0.8] },
  { from: 'little_d_i_p', to: 'little_tip', color: [0.8, 0.3, 0.8] },
]

export const HAND_JOINT_COLORS: Record<string, [number, number, number]> = (() => {
  const colors: Record<string, [number, number, number]> = {}
  for (const { from, to, color } of HAND_BONES) {
    colors[from] = color
    colors[to] = color
  }
  colors['wrist'] = [1.0, 1.0, 0.4]
  return colors
})()

const DOG_LEGEND: Array<{ label: string; color: [number, number, number] }> = [
  { label: 'Head', color: [0.2, 0.9, 0.2] },
  { label: 'Ears', color: [0.3, 0.7, 1.0] },
  { label: 'Neck/Spine', color: [1.0, 0.6, 0.2] },
  { label: 'Tail', color: [1.0, 0.5, 0.0] },
  { label: 'Front Left', color: [0.8, 0.3, 0.8] },
  { label: 'Front Right', color: [1.0, 0.4, 0.7] },
  { label: 'Back Left', color: [0.0, 0.9, 0.9] },
  { label: 'Back Right', color: [0.0, 0.7, 0.7] },
]

const HAND_LEGEND: Array<{ label: string; color: [number, number, number] }> = [
  { label: 'Thumb', color: [1.0, 0.3, 0.3] },
  { label: 'Index', color: [1.0, 0.6, 0.2] },
  { label: 'Middle', color: [0.2, 0.9, 0.2] },
  { label: 'Ring', color: [0.3, 0.7, 1.0] },
  { label: 'Little', color: [0.8, 0.3, 0.8] },
]

export function getSkeletonDef(modelId: string): SkeletonDef {
  if (modelId.includes('dog') || modelId.includes('animal') || modelId.includes('body')) {
    return { bones: DOG_BONES, jointColors: DOG_JOINT_COLORS, legend: DOG_LEGEND, label: 'Dog' }
  }
  if (modelId.includes('hand')) {
    return { bones: HAND_BONES, jointColors: HAND_JOINT_COLORS, legend: HAND_LEGEND, label: 'Hand' }
  }
  return { bones: DOG_BONES, jointColors: DOG_JOINT_COLORS, legend: DOG_LEGEND, label: modelId }
}
