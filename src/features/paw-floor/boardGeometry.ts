import type { GameEvent } from '../../types'

export interface Pt { x: number; z: number }

export interface BoardCell {
  pos: [number, number]
  center: Pt
  corners: Pt[]
}

export interface BoardGeometry {
  center: Pt
  outline: Pt[]
  cells: BoardCell[]
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
  const gx = Math.max(1, Math.round(grid[0] ?? 1))
  const gz = Math.max(1, Math.round(grid[1] ?? 1))
  const cellW = sizeM / gx
  const cellH = sizeM / gz

  const cells: BoardCell[] = []
  for (let i = 0; i < gx; i++) {
    for (let j = 0; j < gz; j++) {
      const lx = (i + 0.5) * cellW - half
      const lz = (j + 0.5) * cellH - half
      cells.push({
        pos: [i, j],
        center: place(lx, lz),
        corners: [
          place(lx - cellW / 2, lz - cellH / 2),
          place(lx + cellW / 2, lz - cellH / 2),
          place(lx + cellW / 2, lz + cellH / 2),
          place(lx - cellW / 2, lz + cellH / 2),
        ],
      })
    }
  }

  return { center, outline, cells, userCircleRadiusM: userCircleDiameterM / 2, sizeM }
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
