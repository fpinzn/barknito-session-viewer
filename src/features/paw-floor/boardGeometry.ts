import type { GameEvent } from '../../types'

export interface Pt { x: number; z: number }

/** TargetUserCircleGeometry.DefaultBoardBorderGapM */
const BOARD_BORDER_GAP_M = 0.5

export interface BoardCell {
  pos: [number, number]
  center: Pt
}

export interface BoardGeometry {
  center: Pt
  outline: Pt[]
  cells: BoardCell[]
  /** Cells are circles; the hit test is distance-to-centre vs this radius. */
  cellRadiusM: number
  userCircleCenter: Pt
  userCircleRadiusM: number
  sizeM: number
}

export interface CellHit extends Pt {
  timestampMs: number
  hitType: string
  distanceToCenter?: number
}

/** Rotate a board-local offset by the board's yaw, matching ARPlane's convention. */
function yawRotate(lx: number, lz: number, ang: number): Pt {
  const cos = Math.cos(ang)
  const sin = Math.sin(ang)
  return { x: lx * cos + lz * sin, z: -lx * sin + lz * cos }
}

/**
 * Board footprint, cells and user circle in world coordinates.
 *
 * `boardRotation` is a yaw-only quaternion — a horizontal board carries no
 * other rotation — so only its y and w components matter.
 */
export function boardGeometry(
  events: GameEvent[],
  userCircleDiameterM: number,
): BoardGeometry | null {
  const placed = events.find(e => e.type === 'BoardPlaced')
  if (!placed) return null

  const origin = placed.boardOrigin as number[] | undefined
  const sizeM = placed.boardSizeM as number | undefined
  if (!origin || typeof sizeM !== 'number') return null

  const rot = (placed.boardRotation as number[] | undefined) ?? [0, 0, 0, 1]
  const ang = 2 * Math.atan2(rot[1] ?? 0, rot[3] ?? 1)
  const center: Pt = { x: origin[0], z: origin[2] }
  const half = sizeM / 2

  const place = (lx: number, lz: number): Pt => {
    const r = yawRotate(lx, lz, ang)
    return { x: center.x + r.x, z: center.z + r.z }
  }

  const outline = [
    place(-half, -half), place(half, -half), place(half, half), place(-half, half),
  ]

  const grid = (placed.gridSize as number[] | undefined) ?? [1, 1]
  const cols = Math.max(1, Math.round(grid[0] ?? 1))
  const rows = Math.max(1, Math.round(grid[1] ?? 1))

  // BoardV2.cs: cellSide is totalSize/cols on BOTH axes — cells stay square
  // even when the grid is not, so a wide grid does not fill the board in z.
  const cellSide = sizeM / cols
  const cellRadiusM = cellSide / 2

  const cells: BoardCell[] = []
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      cells.push({
        pos: [col, row],
        center: place(-half + cellSide * (col + 0.5), -half + cellSide * (row + 0.5)),
      })
    }
  }

  // TargetUserCircleGeometry.GetUserCircleLocalCenter: the handler's circle sits
  // in front of the front row, tangent to it, plus a border gap — not at the
  // board's centre.
  const userCircleRadiusM = userCircleDiameterM / 2
  const frontRowCenterZ = -half + cellRadiusM
  const lateralOffset = cols > 1 ? cellSide / 2 : 0
  const tangentDistance = Math.sqrt(Math.max(
    0,
    Math.pow(cellRadiusM + userCircleRadiusM, 2) - Math.pow(lateralOffset, 2),
  ))
  const userCircleCenter = place(0, frontRowCenterZ - tangentDistance - BOARD_BORDER_GAP_M)

  return {
    center, outline, cells, cellRadiusM, userCircleCenter, userCircleRadiusM, sizeM,
  }
}

/** The cell the game had active at a given moment, from the last RoundStarted. */
export function activeCellAt(events: GameEvent[], ts: number): [number, number] | null {
  let best: [number, number] | null = null
  for (const e of events) {
    if (e.type !== 'RoundStarted' || e.timestampMs > ts) continue
    const pos = e.activeCellPos as number[] | undefined
    if (!pos || pos.length < 2) continue
    best = [pos[0], pos[1]]
  }
  return best
}

/** Recorded cell entries up to the playhead. */
export function cellHitsUpTo(events: GameEvent[], ts: number): CellHit[] {
  const out: CellHit[] = []
  for (const e of events) {
    if (e.type !== 'DogEnteredCell' || e.timestampMs > ts) continue
    const wp = e.worldPosition as number[] | undefined
    if (!wp || wp.length < 3) continue
    out.push({
      x: wp[0],
      z: wp[2],
      timestampMs: e.timestampMs,
      hitType: (e.hitType as string) ?? 'unknown',
      distanceToCenter: e.distanceToCenter as number | undefined,
    })
  }
  return out
}
