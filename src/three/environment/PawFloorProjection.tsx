import { useMemo, useState, type ReactElement } from 'react'
import * as THREE from 'three'
import { Line, Html } from '@react-three/drei'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useUIStore } from '../../stores/uiStore'
import { usePawFloorAnalysis, rayColorHex } from '../../features/paw-floor/usePawFloorAnalysis'
import { rayGeometry, correctForLift, type Vec3 } from '../../features/paw-floor/geometry'
import { fitSingleLift } from '../../features/paw-floor/lift'
import { mirrorAboutCamera } from '../../features/paw-floor/renderSpace'
import { collectTrackSamples, isContinuous } from '../../features/paw-floor/tracks'
import { formatPawTooltip, type PawTooltipInput } from '../../features/paw-floor/tooltip'
import {
  pairDeviationColorHex,
  trackOpacityForAge,
  planeMedianY,
  planeDriftM,
  trackSegmentColor,
  PLANE_DRIFT_TINT_M,
  COLLAPSE_COLOR,
  JERK_COLOR,
} from '../../features/paw-floor/visuals'
import type { PawName, PawFloorFrame } from '../../types'
import type { PawPositions } from '../../features/paw-floor/stance'

const PAW_COLORS: Record<PawName, number> = {
  left_front_paw: 0x6699ff,
  right_front_paw: 0x66ddff,
  left_back_paw: 0xff9966,
  right_back_paw: 0xffcc66,
}

/** Pixels of landmark error the hit disc represents, drawn to scale. */
const DISC_PIXELS = 15
/** Floor on the disc radius so a very steep ray still leaves something visible. */
const MIN_DISC_RADIUS_M = 0.01
/** Where a miss stub terminates below the camera, in metres. */
const MISS_STUB_M = 1.5
/** Invisible hover target radius — larger than the mark, so it is easy to hit. */
const HOVER_RADIUS_M = 0.035
/** Trailing tracks are the thing you actually follow, so they read heaviest. */
const TRACK_LINE_WIDTH = 4

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
  const confidenceThreshold = useUIStore(s => s.confidenceThreshold)
  const pawTrailSeconds = useUIStore(s => s.pawTrailSeconds)
  const pawFloorFrameMap = useSessionStore(s => s.pawFloorFrameMap)
  const frames = useSessionStore(s => s.frames)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const analysis = usePawFloorAnalysis()

  // Hover lives outside the memo so moving the pointer never rebuilds geometry.
  const [hover, setHover] = useState<
    { at: [number, number, number]; info: PawTooltipInput } | null
  >(null)

  const scene = useMemo(() => {
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

      // Same gate as the tracks and the skeleton, so a sample the slider has
      // hidden does not still get a ray drawn to it.
      if (paw.conf < confidenceThreshold) continue

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
    // Gated on the same `Conf` slider the skeleton uses for landmarks.
    const trackWindowMs = Math.max(100, pawTrailSeconds * 1000)
    const tracks = collectTrackSamples(
      pawFloorFrameMap, current.ts, trackWindowMs, confidenceThreshold,
      analysis.quality.baseline,
    )
    for (const [name, samples] of tracks) {
      for (let i = 1; i < samples.length; i++) {
        const opacity = trackOpacityForAge(current.ts - samples[i].ts, trackWindowMs)
        if (opacity <= 0.02) continue

        // Across a detection dropout the route is simply unobserved — joining
        // the endpoints would draw a stride the dog may never have taken.
        const continuous = isContinuous(samples[i - 1], samples[i])

        // A contradicted stretch is drawn in its flag colour rather than
        // dropped, so it reads as part of the trace you can follow and inspect.
        const flagged = samples[i].suspect || samples[i - 1].suspect
        const segColor = trackSegmentColor(samples[i - 1], samples[i], PAW_COLORS[name])

        if (samples[i].suspect) {
          const s = samples[i].world
          elements.push(
            <mesh
              key={`suspect-${name}-${i}`}
              position={R({ x: s.x, y: s.y + 0.004, z: s.z })}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[0.02, 0.03, 20]} />
              <meshBasicMaterial
                color={samples[i].suspectReason === 'jerk' ? JERK_COLOR : COLLAPSE_COLOR}
                transparent opacity={opacity * 0.8} side={THREE.DoubleSide} />
            </mesh>,
          )
        }

        if (!continuous) continue

        const a = samples[i - 1].world
        const b = samples[i].world
        elements.push(
          <Line
            key={`track-${name}-${i}`}
            points={[
              R({ x: a.x, y: a.y + 0.001, z: a.z }),
              R({ x: b.x, y: b.y + 0.001, z: b.z }),
            ]}
            color={segColor}
            lineWidth={TRACK_LINE_WIDTH}
            transparent
            opacity={opacity * (flagged ? 0.85 : 0.6)}
            dashed={flagged}
            dashSize={0.02}
            gapSize={0.02}
          />,
        )
      }

      // Invisible hover targets, one per sample — including suspect ones, so a
      // flagged sample can be inspected rather than only seen.
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i]
        const at = R({ x: s.world.x, y: s.world.y + 0.002, z: s.world.z })
        elements.push(
          <mesh
            key={`hit-${name}-${i}`}
            position={at}
            onPointerOver={e => {
              e.stopPropagation()
              setHover({
                at,
                info: {
                  paw: name,
                  world: s.world,
                  frameId: s.frameId,
                  ts: s.ts,
                  suspectReason: s.suspectReason,
                },
              })
            }}
            onPointerOut={() => setHover(null)}
          >
            <sphereGeometry args={[HOVER_RADIUS_M, 8, 6]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>,
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
  }, [showPawFloor, showPawLift, confidenceThreshold, pawTrailSeconds, analysis, pawFloorFrameMap, frames, frameIdx])

  if (!scene) return null

  return (
    <>
      {scene}
      {hover && (
        <Html position={hover.at} style={{ pointerEvents: 'none' }} zIndexRange={[100, 0]}>
          <div
            style={{
              transform: 'translate(12px, -50%)',
              background: 'rgba(17,17,17,0.92)',
              border: '1px solid #444',
              borderRadius: 4,
              padding: '6px 8px',
              font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
              color: '#eee',
              whiteSpace: 'pre',
            }}
          >
            {formatPawTooltip(hover.info).lines.map((l, i) => (
              <div key={l} style={{ color: i === 0 ? '#fff' : l.startsWith('⚠') ? '#dd4444' : '#bbb' }}>
                {l}
              </div>
            ))}
          </div>
        </Html>
      )}
    </>
  )
}
