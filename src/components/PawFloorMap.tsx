import { useEffect, useMemo, useRef } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { usePlaybackStore } from '../stores/playbackStore'
import { useUIStore } from '../stores/uiStore'
import { usePawFloorAnalysis } from '../features/paw-floor/usePawFloorAnalysis'
import { collectTrackSamples, isContinuous } from '../features/paw-floor/tracks'
import { floorBounds, makeFloorProjection } from '../features/paw-floor/floorMapProjection'
import { COLLAPSE_COLOR, JERK_COLOR, trackSegmentColor } from '../features/paw-floor/visuals'
import { boardGeometry, activeCellAt, cellHitsUpTo } from '../features/paw-floor/boardGeometry'
import { levelHeader, currentAction } from '../features/paw-floor/levelProgress'
import type { PawName } from '../types'

const PAW_COLORS: Record<PawName, string> = {
  left_front_paw: '#6699ff',
  right_front_paw: '#66ddff',
  left_back_paw: '#ff9966',
  right_back_paw: '#ffcc66',
}

const PAW_LABEL: Record<PawName, string> = {
  left_front_paw: 'LF',
  right_front_paw: 'RF',
  left_back_paw: 'LB',
  right_back_paw: 'RB',
}

const PADDING_PX = 28

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`
}

/**
 * Top-down floor map in raw AR world coordinates.
 *
 * Deliberately not the scene's mirrored space: this view exists to hold still
 * while the phone moves, so it plots the unaltered world x/z and derives its
 * extent once per session rather than per frame.
 */
export function PawFloorMap() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const pawFloorFrameMap = useSessionStore(s => s.pawFloorFrameMap)
  const frames = useSessionStore(s => s.frames)
  const arPlaneEvents = useSessionStore(s => s.arPlaneEvents)
  const gameEvents = useSessionStore(s => s.gameEvents)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const confidenceThreshold = useUIStore(s => s.confidenceThreshold)
  const pawTrailSeconds = useUIStore(s => s.pawTrailSeconds)
  const analysis = usePawFloorAnalysis()

  // Session-wide extent, computed once. This is what makes the view stable.
  const bounds = useMemo(() => {
    const pts: Array<{ x: number; z: number }> = []
    if (pawFloorFrameMap) {
      for (const [, f] of pawFloorFrameMap) {
        for (const [, p] of f.paws) if (p.hit && p.world) pts.push(p.world)
      }
    }
    for (const f of frames) if (f.sensor) pts.push({ x: f.sensor.pos.x, z: f.sensor.pos.z })
    return floorBounds(pts)
  }, [pawFloorFrameMap, frames])

  const gameConfig = useSessionStore(s => s.gameConfig)
  const sessionMeta = useSessionStore(s => s.sessionMeta)

  const board = useMemo(() => {
    const cfg = gameConfig as { board?: { userCircleDiameterM?: number } } | null
    return boardGeometry(gameEvents, cfg?.board?.userCircleDiameterM ?? 0.9)
  }, [gameEvents, gameConfig])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = '#0e0e0e'
    ctx.fillRect(0, 0, w, h)

    if (!bounds || !analysis || !pawFloorFrameMap) {
      ctx.fillStyle = '#666'
      ctx.font = '12px ui-monospace, monospace'
      ctx.fillText('no paw floor data', 12, 22)
      return
    }

    const proj = makeFloorProjection(bounds, w, h, PADDING_PX)
    const current = frames[frameIdx]

    // 1 m grid, so distances are readable without a scale bar.
    ctx.strokeStyle = '#1e1e1e'
    ctx.lineWidth = 1
    for (let x = Math.ceil(bounds.minX); x <= bounds.maxX; x++) {
      const a = proj.toScreen(x, bounds.minZ)
      const b = proj.toScreen(x, bounds.maxZ)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    }
    for (let z = Math.ceil(bounds.minZ); z <= bounds.maxZ; z++) {
      const a = proj.toScreen(bounds.minX, z)
      const b = proj.toScreen(bounds.maxX, z)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
    }

    // ── Board, cells, active cell, user circle ──────────────────────
    const poly = (pts: Array<{ x: number; z: number }>) => {
      ctx.beginPath()
      pts.forEach((p, i) => {
        const s = proj.toScreen(p.x, p.z)
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y)
      })
      ctx.closePath()
    }

    if (board) {
      const active = current ? activeCellAt(gameEvents, current.ts) : null

      for (const cell of board.cells) {
        const isActive = active !== null && cell.pos[0] === active[0] && cell.pos[1] === active[1]
        poly(cell.corners)
        if (isActive) {
          ctx.fillStyle = 'rgba(68,221,136,0.13)'
          ctx.fill()
        }
        ctx.strokeStyle = isActive ? '#44dd88' : 'rgba(68,136,255,0.45)'
        ctx.lineWidth = isActive ? 2 : 1
        ctx.setLineDash(isActive ? [] : [3, 3])
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Board outline.
      poly(board.outline)
      ctx.strokeStyle = '#4488ff'
      ctx.lineWidth = 1.5
      ctx.setLineDash([5, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // User circle — where the handler is meant to stand.
      const c = proj.toScreen(board.center.x, board.center.z)
      const edge = proj.toScreen(board.center.x + board.userCircleRadiusM, board.center.z)
      ctx.strokeStyle = 'rgba(136,136,255,0.5)'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath(); ctx.arc(c.x, c.y, Math.abs(edge.x - c.x), 0, Math.PI * 2); ctx.stroke()
      ctx.setLineDash([])

      const tl = proj.toScreen(board.outline[3].x, board.outline[3].z)
      ctx.fillStyle = '#4488ff'
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillText(`board ${board.sizeM.toFixed(2)} m · ${board.cells.length} cell${board.cells.length === 1 ? '' : 's'}`, tl.x, tl.y - 5)
    }

    // Recorded cell entries so far.
    if (current) {
      for (const hit of cellHitsUpTo(gameEvents, current.ts)) {
        const p = proj.toScreen(hit.x, hit.z)
        const full = hit.hitType === 'FullHit'
        ctx.strokeStyle = full ? '#44dd88' : '#ddaa44'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y)
        ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4)
        ctx.stroke()
      }
    }

    // AR plane outlines at the current moment.
    ctx.strokeStyle = 'rgba(68,136,255,0.35)'
    const activePlanes = new Map<string, number[][]>()
    for (const evt of arPlaneEvents) {
      if (current && evt.timestampMs > current.ts) break
      const e = evt as unknown as { event?: string; boundary?: number[][]; position?: number[]; rotation?: number[] }
      if (e.event === 'removed') { activePlanes.delete(evt.planeId); continue }
      if (e.boundary && e.position && e.rotation) {
        const [px, , pz] = e.position
        const [, qy, , qw] = e.rotation
        // Yaw-only rotation about Y, which is all a horizontal plane carries.
        const ang = 2 * Math.atan2(qy, qw)
        const cos = Math.cos(ang), sin = Math.sin(ang)
        activePlanes.set(
          evt.planeId,
          e.boundary.map(([bxp, bzp]) => [px + bxp * cos + bzp * sin, pz - bxp * sin + bzp * cos]),
        )
      }
    }
    for (const [, planePoly] of activePlanes) {
      if (planePoly.length < 3) continue
      ctx.beginPath()
      planePoly.forEach(([x, z], i) => {
        const s = proj.toScreen(x, z)
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y)
      })
      ctx.closePath(); ctx.stroke()
    }

    if (!current) return

    // Paw trails over the slider's window.
    const windowMs = Math.max(100, pawTrailSeconds * 1000)
    const tracks = collectTrackSamples(
      pawFloorFrameMap, current.ts, windowMs, confidenceThreshold, analysis.quality.baseline,
    )

    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    for (const [name, samples] of tracks) {
      for (let i = 1; i < samples.length; i++) {
        if (!isContinuous(samples[i - 1], samples[i])) continue
        const age = current.ts - samples[i].ts
        const alpha = Math.max(0.12, 1 - age / windowMs)
        const flagged = samples[i].suspect || samples[i - 1].suspect
        const col = trackSegmentColor(samples[i - 1], samples[i], -1)
        ctx.strokeStyle = col === -1 ? PAW_COLORS[name] : hex(col)
        ctx.globalAlpha = flagged ? Math.max(0.6, alpha) : alpha
        const a = proj.toScreen(samples[i - 1].world.x, samples[i - 1].world.z)
        const b = proj.toScreen(samples[i].world.x, samples[i].world.z)
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }

      // Flagged points, marked on top of the trail.
      for (const s of samples) {
        if (!s.suspect) continue
        const p = proj.toScreen(s.world.x, s.world.z)
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = hex(s.suspectReason === 'jerk' ? JERK_COLOR : COLLAPSE_COLOR)
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.stroke()
      }
    }
    ctx.globalAlpha = 1

    // Current paw positions.
    const nowFrame = [...pawFloorFrameMap.entries()]
      .filter(([, f]) => Math.abs(f.ts - current.ts) <= 100)
      .sort((a, b) => Math.abs(a[1].ts - current.ts) - Math.abs(b[1].ts - current.ts))[0]
    if (nowFrame) {
      for (const [name, paw] of nowFrame[1].paws) {
        if (!paw.hit || !paw.world || paw.conf < confidenceThreshold) continue
        const p = proj.toScreen(paw.world.x, paw.world.z)
        ctx.fillStyle = PAW_COLORS[name]
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#111'
        ctx.font = 'bold 8px ui-monospace, monospace'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(PAW_LABEL[name], p.x, p.y)
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      }
    }

    // The phone, with a heading tick — the only thing that moves.
    if (current.sensor) {
      const c = proj.toScreen(current.sensor.pos.x, current.sensor.pos.z)
      const { x: qx, y: qy, z: qz, w: qw } = current.sensor.rot
      const fx = 2 * (qx * qz + qw * qy)
      const fz = 1 - 2 * (qx * qx + qy * qy)
      const len = Math.hypot(fx, fz) || 1
      ctx.strokeStyle = '#ff6644'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      // Screen y runs opposite world z on this map, so the forward component
      // is subtracted rather than added.
      ctx.lineTo(c.x + (fx / len) * 22, c.y - (fz / len) * 22)
      ctx.stroke()
      ctx.fillStyle = '#ff6644'
      ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI * 2); ctx.fill()
    }

    // ── Level and current action, top-left ──────────────────────────
    const level = levelHeader(gameConfig, sessionMeta)
    const action = current ? currentAction(gameConfig, gameEvents, current.ts) : null
    if (level || action) {
      const lines: Array<{ text: string; color: string }> = []
      if (level) {
        lines.push({
          text: level.name ? `Level ${level.number} — ${level.name}` : `Level ${level.number}`,
          color: '#eee',
        })
      }
      if (action) {
        lines.push({
          text: `${action.index + 1}/${action.total}  ${action.id}  ${action.type}${action.lure ? '  (lure)' : ''}`,
          color: '#44dd88',
        })
      } else if (level) {
        lines.push({ text: 'no round started', color: '#777' })
      }

      ctx.font = '11px ui-monospace, monospace'
      const boxW = Math.max(...lines.map(l => ctx.measureText(l.text).width)) + 16
      const boxH = lines.length * 16 + 10
      ctx.fillStyle = 'rgba(14,14,14,0.85)'
      ctx.fillRect(6, 6, boxW, boxH)
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 1
      ctx.strokeRect(6, 6, boxW, boxH)
      lines.forEach((l, i) => {
        ctx.fillStyle = l.color
        ctx.fillText(l.text, 14, 23 + i * 16)
      })
    }

    // Scale note.
    ctx.fillStyle = '#777'
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillText(`1 m grid · ${(1 / proj.metresPerPx).toFixed(0)} px/m · world-fixed · +z up, +x right`, 8, h - 8)
  }, [
    bounds, analysis, pawFloorFrameMap, frames, frameIdx,
    confidenceThreshold, pawTrailSeconds, arPlaneEvents, board, gameEvents,
    gameConfig, sessionMeta,
  ])

  return <canvas ref={canvasRef} className="paw-floor-map" />
}
