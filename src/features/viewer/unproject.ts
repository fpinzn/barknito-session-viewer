import type { Intrinsics } from '../../types'

interface SensorLike {
  pos: { x: number; y: number; z: number }
  rot: { x: number; y: number; z: number; w: number }
}

export const VISION_NATIVE = 'vision_native_bottom_left'
export const DISPLAY_TOP_LEFT = 'display_top_left'

export type LandmarkSpace = typeof VISION_NATIVE | typeof DISPLAY_TOP_LEFT

/**
 * Which coordinate convention a session's landmarks use.
 *
 * Absent means a build that predates the declaration — i.e. every session recorded
 * before 2026-07 — whose landmarks are raw Vision output: normalized to ARKit's
 * native landscape buffer with a bottom-left origin. See
 * `ml/docs/session-bundle-contract.md`.
 */
export function landmarkSpaceFromMeta(meta: { landmarkSpace?: unknown } | null | undefined): LandmarkSpace {
  return meta?.landmarkSpace === DISPLAY_TOP_LEFT ? DISPLAY_TOP_LEFT : VISION_NATIVE
}

/**
 * Unproject a normalized image point + depth into world space.
 * Returns null if intrinsics or sensor data not available.
 *
 * Camera quaternion is portrait-oriented (Unity camera in portrait mode), so
 * vision-native coords need the landscape→portrait swap while display-space coords
 * are already upright and use the intrinsics unswapped.
 */
export function unproject(
  nx: number,
  ny: number,
  depth: number,
  sensor: SensorLike | null | undefined,
  intrinsics: Intrinsics | null | undefined,
  space: LandmarkSpace = VISION_NATIVE,
): { x: number; y: number; z: number } | null {
  if (!intrinsics || !sensor) return null

  const isVisionNative = space === VISION_NATIVE

  // Vision coords are landscape with a bottom-left origin, so they need the
  // landscape→portrait swap. display_top_left coords are already in the upright
  // frame and map straight onto the portrait intrinsics.
  const px = isVisionNative ? ny * intrinsics.resH : nx * intrinsics.resW
  const py = isVisionNative ? (1 - nx) * intrinsics.resW : ny * intrinsics.resH
  const pfx = isVisionNative ? intrinsics.fy : intrinsics.fx
  const pfy = isVisionNative ? intrinsics.fx : intrinsics.fy
  const pcx = isVisionNative ? intrinsics.cy : intrinsics.cx
  const pcy = isVisionNative ? intrinsics.resW - intrinsics.cx : intrinsics.cy

  // Local camera-space point
  let lx = -(px - pcx) / pfx * depth
  let ly = (py - pcy) / pfy * depth
  let lz = depth

  // Rotate by camera orientation (quaternion rotation)
  const { x: qx, y: qy, z: qz, w: qw } = sensor.rot

  // Apply quaternion to vector: v' = q * v * q^-1
  // Optimized formula:
  const ix = qw * lx + qy * lz - qz * ly
  const iy = qw * ly + qz * lx - qx * lz
  const iz = qw * lz + qx * ly - qy * lx
  const iw = -qx * lx - qy * ly - qz * lz

  lx = ix * qw + iw * -qx + iy * -qz - iz * -qy
  ly = iy * qw + iw * -qy + iz * -qx - ix * -qz
  lz = iz * qw + iw * -qz + ix * -qy - iy * -qx

  // Translate by camera position
  return {
    x: lx + sensor.pos.x,
    y: ly + sensor.pos.y,
    z: lz + sensor.pos.z,
  }
}
