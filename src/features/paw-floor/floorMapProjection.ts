export interface FloorBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface FloorProjection {
  toScreen: (x: number, z: number) => { x: number; y: number }
  metresPerPx: number
}

/** Smallest extent a bounding box may have, so the projection cannot divide by zero. */
const MIN_EXTENT_M = 0.5

export function floorBounds(points: Array<{ x: number; z: number }>): FloorBounds | null {
  if (points.length === 0) return null

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  if (!Number.isFinite(minX)) return null

  // Grow a degenerate box symmetrically rather than nudging one edge.
  if (maxX - minX < MIN_EXTENT_M) {
    const c = (minX + maxX) / 2
    minX = c - MIN_EXTENT_M / 2
    maxX = c + MIN_EXTENT_M / 2
  }
  if (maxZ - minZ < MIN_EXTENT_M) {
    const c = (minZ + maxZ) / 2
    minZ = c - MIN_EXTENT_M / 2
    maxZ = c + MIN_EXTENT_M / 2
  }

  return { minX, maxX, minZ, maxZ }
}

/**
 * Top-down world→screen mapping: world +x to the right, world +z **upward**.
 *
 * The z axis is inverted against screen y on purpose. The phone points along
 * +z, so with z increasing upward the operator sits at the bottom of the map
 * looking up it — the same way you would read a plan of the room you are
 * standing in.
 *
 * Depends only on session-wide bounds and the canvas size — never on the
 * current camera pose. That is what keeps the floor stable while the phone
 * moves through it, and it is why the map uses raw AR world coordinates
 * rather than the camera-relative mirror the 3D scene draws in.
 */
export function makeFloorProjection(
  bounds: FloorBounds,
  width: number,
  height: number,
  padding: number,
): FloorProjection {
  const worldW = bounds.maxX - bounds.minX
  const worldH = bounds.maxZ - bounds.minZ

  const usableW = Math.max(1, width - padding * 2)
  const usableH = Math.max(1, height - padding * 2)

  // One scale for both axes, so a metre is a metre in either direction.
  const pxPerM = Math.min(usableW / worldW, usableH / worldH)

  const drawnW = worldW * pxPerM
  const drawnH = worldH * pxPerM
  const offsetX = padding + (usableW - drawnW) / 2
  const offsetY = padding + (usableH - drawnH) / 2

  return {
    metresPerPx: 1 / pxPerM,
    toScreen: (x: number, z: number) => ({
      x: offsetX + (x - bounds.minX) * pxPerM,
      y: offsetY + (bounds.maxZ - z) * pxPerM,
    }),
  }
}
