import { useEffect, useMemo, useRef } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { usePlaybackStore } from '../stores/playbackStore'
import { useUIStore } from '../stores/uiStore'
import { usePawFloorAnalysis } from '../features/paw-floor/usePawFloorAnalysis'
import { collectTrackSamples, isContinuous } from '../features/paw-floor/tracks'
import { floorBounds, makeFloorProjection } from '../features/paw-floor/floorMapProjection'
import { COLLAPSE_COLOR, JERK_COLOR, trackSegmentColor } from '../features/paw-floor/visuals'
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

  const board = useMemo(
    () => gameEvents.find(e => e.type === 'BoardPlaced') as
      { boardOrigin?: number[]; boardSizeM?: number } | undefined,
    [gameEvents],
  )

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

    // Board footprint, if the session placed one.
    if (board?.boardOrigin && typeof board.boardSizeM === 'number') {
      const [bx, , bz] = board.boardOrigin
      const half = board.boardSizeM / 2
      const tl = proj.toScreen(bx - half, bz - half)
      const br = proj.toScreen(bx + half, bz + half)
      ctx.strokeStyle = '#4488ff'
      ctx.setLineDash([4, 4])
      ctx.strokeRect(
        Math.min(tl.x, br.x), Math.min(tl.y, br.y),
        Math.abs(br.x - tl.x), Math.abs(br.y - tl.y),
      )
      ctx.setLineDash([])
      ctx.fillStyle = '#4488ff'
      ctx.font = '10px ui-monospace, monospace'
      ctx.fillText(
        `game board ${board.boardSizeM.toFixed(2)} m`,
        Math.min(tl.x, br.x) + 4,
        Math.min(tl.y, br.y) - 4,
      )
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
    for (const [, poly] of activePlanes) {
      if (poly.length < 3) continue
      ctx.beginPath()
      poly.forEach(([x, z], i) => {
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

    // Scale note.
    ctx.fillStyle = '#777'
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillText(`1 m grid · ${(1 / proj.metresPerPx).toFixed(0)} px/m · world-fixed · +z up, +x right`, 8, h - 8)
  }, [
    bounds, analysis, pawFloorFrameMap, frames, frameIdx,
    confidenceThreshold, pawTrailSeconds, arPlaneEvents, board,
  ])

  return <canvas ref={canvasRef} className="paw-floor-map" />
}
