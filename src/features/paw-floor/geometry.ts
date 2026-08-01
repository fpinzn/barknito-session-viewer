export type Vec3 = { x: number; y: number; z: number }

export interface RayGeometry {
  /** Angle of the camera→hit ray below horizontal, in degrees. */
  depressionDeg: number
  /** Full 3D camera→hit distance in metres. */
  rangeM: number
  /**
   * How far the floor intersection moves per pixel of landmark error:
   * H / (sin²δ · focal). Small values mean a well-conditioned projection.
   */
  metresPerPixel: number
}

const EPS = 1e-6

export function rayGeometry(hit: Vec3, cam: Vec3, focalPx: number): RayGeometry | null {
  const height = cam.y - hit.y
  if (height <= EPS) return null

  const dx = hit.x - cam.x
  const dz = hit.z - cam.z
  const radius = Math.hypot(dx, dz)
  if (radius <= EPS) return null

  const delta = Math.atan2(height, radius)
  const sinDelta = Math.sin(delta)

  return {
    depressionDeg: (delta * 180) / Math.PI,
    rangeM: Math.hypot(radius, height),
    metresPerPixel: height / (sinDelta * sinDelta * focalPx),
  }
}

/**
 * Undo the overshoot a lifted paw introduces.
 *
 * A paw `liftM` above the plane has its view ray continue to the floor, landing
 * `liftM / tan δ` further from the camera's nadir than the paw really is. Pull
 * the recorded point back along the nadir→hit direction by that amount.
 */
export function correctForLift(hit: Vec3, cam: Vec3, liftM: number): { x: number; z: number } {
  const dx = hit.x - cam.x
  const dz = hit.z - cam.z
  const radius = Math.hypot(dx, dz)
  const height = cam.y - hit.y

  if (radius <= EPS || height <= EPS || liftM <= 0) {
    return { x: hit.x, z: hit.z }
  }

  const tanDelta = height / radius
  // Clamp so an implausible lift can never pull the point past the nadir.
  const pull = Math.min(liftM / tanDelta, radius * 0.95)

  return {
    x: hit.x - (dx / radius) * pull,
    z: hit.z - (dz / radius) * pull,
  }
}
