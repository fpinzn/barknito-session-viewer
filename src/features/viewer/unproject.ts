import type { Intrinsics } from '../../types'

interface SensorLike {
  pos: { x: number; y: number; z: number }
  rot: { x: number; y: number; z: number; w: number }
}

/**
 * Unproject a normalized image point + depth into world space.
 * Returns null if intrinsics or sensor data not available.
 *
 * Vision coords (nx, ny) are landscape with bottom-left origin.
 * Camera quaternion is portrait-oriented (Unity camera in portrait mode).
 */
export function unproject(
  nx: number,
  ny: number,
  depth: number,
  sensor: SensorLike | null | undefined,
  intrinsics: Intrinsics | null | undefined,
): { x: number; y: number; z: number } | null {
  if (!intrinsics || !sensor) return null

  // Apply landscape→portrait intrinsics swap
  const px = ny * intrinsics.resH           // landscape y → portrait x
  const py = (1 - nx) * intrinsics.resW     // landscape x → portrait y
  const pfx = intrinsics.fy                 // portrait fx = landscape fy
  const pfy = intrinsics.fx                 // portrait fy = landscape fx
  const pcx = intrinsics.cy                 // portrait cx = landscape cy
  const pcy = intrinsics.resW - intrinsics.cx // portrait cy (flipped)

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
