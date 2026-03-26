import { useMemo, type ReactElement } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useUIStore } from '../../stores/uiStore'
import { ARPlane } from './ARPlane'
import type { ARPlaneEvent } from '../../types'

interface ActivePlane extends ARPlaneEvent {
  position?: number[]
  rotation?: number[]
  event?: string
}

function computeActivePlanes(events: ARPlaneEvent[], timestampMs: number): Map<string, ActivePlane> {
  const active = new Map<string, ActivePlane>()
  for (const evt of events) {
    if (evt.timestampMs > timestampMs) break
    const e = evt as ActivePlane
    if (e.event === 'removed') {
      active.delete(evt.planeId)
    } else {
      active.set(evt.planeId, e)
    }
  }
  return active
}

export function ARPlanes() {
  const showARPlanes = useUIStore(s => s.showARPlanes)
  const arPlaneEvents = useSessionStore(s => s.arPlaneEvents)
  const frames = useSessionStore(s => s.frames)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)

  const planes = useMemo(() => {
    if (!showARPlanes || arPlaneEvents.length === 0 || frames.length === 0) return null

    const frame = frames[frameIdx]
    if (!frame?.sensor) return null

    const active = computeActivePlanes(arPlaneEvents, frame.ts)
    const elements: ReactElement[] = []

    for (const [planeId, evt] of active) {
      // Need boundary + position + rotation for rendering
      const boundary = evt.boundary as number[][] | undefined
      if (!boundary || boundary.length < 3) continue

      const position = evt.position ?? (evt.center ? [evt.center.x, evt.center.y, evt.center.z] : null)
      const rotation = evt.rotation ?? evt.transform?.slice(0, 4) ?? null
      if (!position || !rotation) continue

      elements.push(
        <ARPlane
          key={planeId}
          boundary={boundary}
          position={position as [number, number, number]}
          rotation={rotation as [number, number, number, number]}
          sensorPos={frame.sensor.pos}
          sensorRot={frame.sensor.rot}
        />,
      )
    }

    return elements.length > 0 ? <group>{elements}</group> : null
  }, [showARPlanes, arPlaneEvents, frames, frameIdx])

  return planes
}
