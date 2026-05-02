import { useMemo, type ReactElement } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useUIStore } from '../../stores/uiStore'
import { findNearestPoseModels } from '../../features/viewer/frame-utils'
import { unproject } from '../../features/viewer/unproject'
import { getSkeletonDef } from '../../constants'
import type { Landmark } from '../../types'
import { Joint } from './Joint'
import { Bone } from './Bone'

/**
 * 2D skeleton overlay: landmarks placed on the frustum texture plane surface.
 * Uses a fixed depth (frustumD * 0.98) to place points just in front of the video plane.
 */
const FRUSTUM_D = 0.3 // default near plane distance for 2D overlay

export function Skeleton2D() {
  const show2D = useUIStore(s => s.show2DSkeleton)
  const confidenceThreshold = useUIStore(s => s.confidenceThreshold)
  const videoAlpha = useUIStore(s => s.videoAlpha)
  const skelMsOffset = useUIStore(s => s.skelMsOffset)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const currentSessionTimeMs = usePlaybackStore(s => s.currentSessionTimeMs)
  const frames = useSessionStore(s => s.frames)
  const poseEvents = useSessionStore(s => s.poseEvents)
  const intrinsics = useSessionStore(s => s.intrinsics)

  const elements = useMemo(() => {
    if (!show2D || frames.length === 0) return null

    const frame = frames[frameIdx]
    if (!frame) return null

    const targetTs = currentSessionTimeMs + skelMsOffset
    const skelModels = findNearestPoseModels(poseEvents, targetTs)
    if (skelModels.size === 0) return null

    // 2D skeleton needs intrinsics + sensor to place on frustum plane
    if (!intrinsics || !frame.sensor) return null

    const joints: ReactElement[] = []
    const bones: ReactElement[] = []

    const frustumDepth = FRUSTUM_D * 0.98

    function pos2D(pt: Landmark): [number, number, number] | null {
      const wp = unproject(pt.x, pt.y, frustumDepth, frame.sensor, intrinsics)
      if (!wp) return null
      return [wp.x, wp.y, wp.z]
    }

    for (const [modelId, landmarks] of skelModels) {
      const def = getSkeletonDef(modelId)

      // Joints
      for (const [name, pt] of landmarks) {
        if (pt.conf < confidenceThreshold) continue
        const pos = pos2D(pt)
        if (!pos) continue
        const jc = def.jointColors[name] || [0.6, 0.6, 0.6] as [number, number, number]
        joints.push(
          <Joint
            key={`2d-j-${modelId}-${name}`}
            position={pos}
            color={jc}
            confidence={pt.conf}
            is2D
            videoAlpha={videoAlpha}
          />,
        )
      }

      // Bones
      for (const bone of def.bones) {
        const pa = landmarks.get(bone.from)
        const pb = landmarks.get(bone.to)
        if (!pa || !pb) continue
        if (pa.conf < confidenceThreshold || pb.conf < confidenceThreshold) continue

        const p1 = pos2D(pa)
        const p2 = pos2D(pb)
        if (!p1 || !p2) continue

        bones.push(
          <Bone
            key={`2d-b-${modelId}-${bone.from}-${bone.to}`}
            start={p1}
            end={p2}
            color={bone.color}
            avgConfidence={(pa.conf + pb.conf) / 2}
            is2D
            videoAlpha={videoAlpha}
          />,
        )
      }
    }

    return <group>{joints}{bones}</group>
  }, [show2D, frameIdx, frames, poseEvents, intrinsics, confidenceThreshold, videoAlpha, skelMsOffset, currentSessionTimeMs])

  return elements
}
