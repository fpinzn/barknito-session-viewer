import { useMemo, type ReactElement } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useUIStore } from '../../stores/uiStore'
import { usePawFloorAnalysis, rayColorHex } from '../../features/paw-floor/usePawFloorAnalysis'
import { rayGeometry, correctForLift } from '../../features/paw-floor/geometry'
import { fitSingleLift } from '../../features/paw-floor/lift'
import type { PawName, PawFloorFrame } from '../../types'
import type { PawPositions } from '../../features/paw-floor/stance'

const PAW_COLORS: Record<PawName, number> = {
  left_front_paw: 0x6699ff,
  right_front_paw: 0x66ddff,
  left_back_paw: 0xff9966,
  right_back_paw: 0xffcc66,
}

/** Trailing track window, in milliseconds. */
const TRACK_WINDOW_MS = 2000
/** Pixels of landmark error the hit disc is drawn to represent. */
const DISC_PIXELS = 10
/** Where a miss stub terminates along the screen ray, in metres. */
const MISS_STUB_M = 1.5

function nearestPawFrame(
  frames: Map<number, PawFloorFrame>,
  ts: number,
): { frameId: number; frame: PawFloorFrame } | null {
  let best: { frameId: number; frame: PawFloorFrame } | null = null
  let bestDelta = Infinity
  for (const [frameId, frame] of frames) {
    const delta = Math.abs(frame.ts - ts)
    if (delta < bestDelta) {
      bestDelta = delta
      best = { frameId, frame }
    }
  }
  return bestDelta <= 100 ? best : null
}

export function PawFloorProjection() {
  const showPawFloor = useUIStore(s => s.showPawFloor)
  const showPawLift = useUIStore(s => s.showPawLift)
  const pawFloorFrameMap = useSessionStore(s => s.pawFloorFrameMap)
  const frames = useSessionStore(s => s.frames)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const analysis = usePawFloorAnalysis()

  return useMemo(() => {
    if (!showPawFloor || !analysis || !pawFloorFrameMap || frames.length === 0) return null

    const current = frames[frameIdx]
    if (!current) return null

    const match = nearestPawFrame(pawFloorFrameMap, current.ts)
    if (!match) return null

    const cam = analysis.camFor(match.frameId)
    if (!cam) return null

    const elements: ReactElement[] = []
    const positions: PawPositions = new Map()

    for (const [name, paw] of match.frame.paws) {
      const color = PAW_COLORS[name]

      if (!paw.hit || !paw.world) {
        // Miss stub: a dashed ray into the scene ending in a marker, so a
        // dropout reads as present-and-failed rather than silently absent.
        elements.push(
          <Line
            key={`miss-${name}`}
            points={[
              [cam.x, cam.y, cam.z],
              [cam.x, cam.y - MISS_STUB_M, cam.z],
            ]}
            color={color}
            lineWidth={1}
            dashed
            dashSize={0.03}
            gapSize={0.03}
            transparent
            opacity={0.35}
          />,
        )
        continue
      }

      positions.set(name, paw.world)
      const geom = rayGeometry(paw.world, cam, analysis.focalPx)
      if (!geom) continue

      elements.push(
        <Line
          key={`ray-${name}`}
          points={[
            [cam.x, cam.y, cam.z],
            [paw.world.x, paw.world.y, paw.world.z],
          ]}
          color={rayColorHex(geom.depressionDeg)}
          lineWidth={1.5}
          transparent
          opacity={Math.max(0.15, Math.min(1, paw.conf))}
        />,
      )

      // Hit disc sized to DISC_PIXELS of landmark error, drawn to scale.
      const radius = Math.max(0.005, geom.metresPerPixel * DISC_PIXELS)
      elements.push(
        <mesh
          key={`disc-${name}`}
          position={[paw.world.x, paw.world.y + 0.002, paw.world.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[radius, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>,
      )
    }

    // Trailing tracks over the last TRACK_WINDOW_MS.
    const trackPoints = new Map<PawName, Array<[number, number, number]>>()
    for (const [, frame] of pawFloorFrameMap) {
      if (frame.ts > current.ts || frame.ts < current.ts - TRACK_WINDOW_MS) continue
      for (const [name, paw] of frame.paws) {
        if (!paw.hit || !paw.world) continue
        if (!trackPoints.has(name)) trackPoints.set(name, [])
        trackPoints.get(name)!.push([paw.world.x, paw.world.y + 0.001, paw.world.z])
      }
    }
    for (const [name, points] of trackPoints) {
      if (points.length < 2) continue
      elements.push(
        <Line
          key={`track-${name}`}
          points={points}
          color={PAW_COLORS[name]}
          lineWidth={1}
          transparent
          opacity={0.4}
        />,
      )
    }

    // Derived lift stem, gated on the baseline and opted into explicitly.
    if (showPawLift && positions.size >= 2) {
      const fit = fitSingleLift(positions, cam, analysis.quality.baseline)
      if (fit) {
        const hit = positions.get(fit.paw)!
        const base = correctForLift(hit, cam, fit.liftM)
        elements.push(
          <Line
            key="lift-stem"
            points={[
              [base.x, hit.y, base.z],
              [base.x, hit.y + fit.liftM, base.z],
            ]}
            color={0xffffff}
            lineWidth={2}
            dashed
            dashSize={0.01}
            gapSize={0.01}
          />,
        )
      }
    }

    return elements.length > 0 ? <group>{elements}</group> : null
  }, [showPawFloor, showPawLift, analysis, pawFloorFrameMap, frames, frameIdx])
}
