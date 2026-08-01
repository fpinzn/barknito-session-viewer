import { useMemo, type ReactElement } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useUIStore } from '../../stores/uiStore'
import { usePawFloorAnalysis, rayColorHex } from '../../features/paw-floor/usePawFloorAnalysis'
import { rayGeometry, correctForLift, type Vec3 } from '../../features/paw-floor/geometry'
import { fitSingleLift } from '../../features/paw-floor/lift'
import { mirrorAboutCamera } from '../../features/paw-floor/renderSpace'
import {
  pairDeviationColorHex,
  trackOpacityForAge,
  planeMedianY,
  planeDriftM,
  PLANE_DRIFT_TINT_M,
} from '../../features/paw-floor/visuals'
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
/**
 * Pixels of landmark error the hit disc represents. Still drawn to scale, but
 * 10 px was too small to see against a 1.5 m scene; 30 px lands the disc at
 * roughly real paw size (~7 cm across) at typical viewing angles.
 */
const DISC_PIXELS = 30
/** Floor on the disc radius so a very steep ray still leaves something visible. */
const MIN_DISC_RADIUS_M = 0.02
/** Where a miss stub terminates below the camera, in metres. */
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
    if (!current?.sensor) return null

    const match = nearestPawFrame(pawFloorFrameMap, current.ts)
    if (!match) return null

    const cam = analysis.camFor(match.frameId)
    if (!cam) return null

    // Everything drawn goes through the same camera-relative X mirror the rest
    // of the scene uses, with the *current* frame's pose — the same pose
    // ARPlanes hands to ARPlane — so paw points sit on the plane as drawn.
    // The analysis above stays in raw AR space, where the geometry is true.
    const mirrorPos = current.sensor.pos
    const mirrorRot = current.sensor.rot
    const R = (p: Vec3): [number, number, number] => {
      const m = mirrorAboutCamera(p, mirrorPos, mirrorRot)
      return [m.x, m.y, m.z]
    }

    const elements: ReactElement[] = []
    const positions: PawPositions = new Map()
    const camRendered = R(cam)

    for (const [name, paw] of match.frame.paws) {
      const color = PAW_COLORS[name]

      if (!paw.hit || !paw.world) {
        // Miss stub: a dashed ray into the scene, so a dropout reads as
        // present-and-failed rather than silently absent.
        elements.push(
          <Line
            key={`miss-${name}`}
            points={[camRendered, R({ x: cam.x, y: cam.y - MISS_STUB_M, z: cam.z })]}
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
          points={[camRendered, R(paw.world)]}
          color={rayColorHex(geom.depressionDeg)}
          lineWidth={1.5}
          transparent
          opacity={Math.max(0.15, Math.min(1, paw.conf))}
        />,
      )

      const radius = Math.max(MIN_DISC_RADIUS_M, geom.metresPerPixel * DISC_PIXELS)
      elements.push(
        <mesh
          key={`disc-${name}`}
          position={R({ x: paw.world.x, y: paw.world.y + 0.002, z: paw.world.z })}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[radius, 24]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>,
      )
    }

    // Trailing tracks, one segment per step so opacity can fall off with age.
    const trackPoints = new Map<PawName, Array<{ p: [number, number, number]; ts: number }>>()
    for (const [, frame] of pawFloorFrameMap) {
      if (frame.ts > current.ts || frame.ts < current.ts - TRACK_WINDOW_MS) continue
      for (const [name, paw] of frame.paws) {
        if (!paw.hit || !paw.world) continue
        if (!trackPoints.has(name)) trackPoints.set(name, [])
        trackPoints.get(name)!.push({
          p: R({ x: paw.world.x, y: paw.world.y + 0.001, z: paw.world.z }),
          ts: frame.ts,
        })
      }
    }
    for (const [name, samples] of trackPoints) {
      samples.sort((m, n) => m.ts - n.ts)
      for (let i = 1; i < samples.length; i++) {
        const opacity = trackOpacityForAge(current.ts - samples[i].ts, TRACK_WINDOW_MS)
        if (opacity <= 0.02) continue
        elements.push(
          <Line
            key={`track-${name}-${i}`}
            points={[samples[i - 1].p, samples[i].p]}
            color={PAW_COLORS[name]}
            lineWidth={1}
            transparent
            opacity={opacity * 0.6}
          />,
        )
      }
    }

    // One chord per baseline pair, coloured by that pair's disagreement with
    // its session median. Shows which pair broke, not merely that one did.
    for (const stat of analysis.quality.baseline.pairs) {
      const a = positions.get(stat.pair[0])
      const b = positions.get(stat.pair[1])
      if (!a || !b) continue
      const observed = Math.hypot(a.x - b.x, a.z - b.z)
      elements.push(
        <Line
          key={`chord-${stat.pair[0]}-${stat.pair[1]}`}
          points={[
            R({ x: a.x, y: a.y + 0.003, z: a.z }),
            R({ x: b.x, y: b.y + 0.003, z: b.z }),
          ]}
          color={pairDeviationColorHex(observed, stat.median)}
          lineWidth={1}
          transparent
          opacity={0.55}
        />,
      )
    }

    // A ring turns amber when the plane the hits resolve against has moved from
    // where it sat for most of the session.
    const medianY = planeMedianY(pawFloorFrameMap)
    const currentY = [...positions.values()][0]?.y
    if (medianY !== null && currentY !== undefined) {
      if (planeDriftM(currentY, medianY) > PLANE_DRIFT_TINT_M) {
        elements.push(
          <mesh
            key="plane-drift"
            position={R({ x: cam.x, y: currentY + 0.0005, z: cam.z })}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[1.2, 1.35, 48]} />
            <meshBasicMaterial color={0xddaa44} transparent opacity={0.25} side={THREE.DoubleSide} />
          </mesh>,
        )
      }
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
              R({ x: base.x, y: hit.y, z: base.z }),
              R({ x: base.x, y: hit.y + fit.liftM, z: base.z }),
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
