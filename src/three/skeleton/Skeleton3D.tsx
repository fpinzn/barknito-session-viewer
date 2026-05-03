import { useMemo, type ReactElement } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useUIStore } from '../../stores/uiStore'
import { findNearestPoseModels } from '../../features/viewer/frame-utils'
import { skeletonSessionTimeForVisibleTimeMs } from '../../features/viewer/video-timing'
import { unproject } from '../../features/viewer/unproject'
import { getSkeletonDef } from '../../constants'
import type { Landmark } from '../../types'
import { Joint } from './Joint'
import { Bone } from './Bone'

function getPosition(
  pt: Landmark,
  medianDepth: number,
  sensor: { pos: { x: number; y: number; z: number }; rot: { x: number; y: number; z: number; w: number } } | null,
  intrinsics: Parameters<typeof unproject>[4],
): [number, number, number] {
  const d = (!isNaN(pt.depth) && pt.depth > 0) ? pt.depth : medianDepth
  if (intrinsics && sensor) {
    const wp = unproject(pt.x, pt.y, d, sensor, intrinsics)
    if (wp) return [wp.x, wp.y, wp.z]
  }
  return [pt.x, pt.y, d]
}

export function Skeleton3D() {
  const show3D = useUIStore(s => s.show3DSkeleton)
  const confidenceThreshold = useUIStore(s => s.confidenceThreshold)
  const skelMsOffset = useUIStore(s => s.skelMsOffset)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const currentVisibleTimeMs = usePlaybackStore(s => s.currentVisibleTimeMs)
  const frames = useSessionStore(s => s.frames)
  const poseEvents = useSessionStore(s => s.poseEvents)
  const intrinsics = useSessionStore(s => s.intrinsics)
  const videoStartOffsetMs = useSessionStore(s => s.videoStartOffsetMs)

  const elements = useMemo(() => {
    if (!show3D || frames.length === 0) return null

    const frame = frames[frameIdx]
    if (!frame) return null

    const skeletonTimeMs = skeletonSessionTimeForVisibleTimeMs(
      frames,
      currentVisibleTimeMs,
      videoStartOffsetMs,
    )
    if (skeletonTimeMs === null) return null

    const targetTs = skeletonTimeMs + skelMsOffset
    const skelModels = findNearestPoseModels(poseEvents, targetTs)
    if (skelModels.size === 0) return null

    const joints: ReactElement[] = []
    const bones: ReactElement[] = []

    for (const [modelId, landmarks] of skelModels) {
      const def = getSkeletonDef(modelId)

      // Compute median depth
      const depths: number[] = []
      for (const [, v] of landmarks) {
        if (!isNaN(v.depth) && v.depth > 0) depths.push(v.depth)
      }
      depths.sort((a, b) => a - b)
      const medianDepth = depths.length > 0 ? depths[Math.floor(depths.length / 2)] : 0.5

      // Joints
      for (const [name, pt] of landmarks) {
        if (pt.conf < confidenceThreshold) continue
        const pos = getPosition(pt, medianDepth, frame.sensor, intrinsics)
        const jc = def.jointColors[name] || [0.6, 0.6, 0.6] as [number, number, number]
        joints.push(
          <Joint
            key={`3d-j-${modelId}-${name}`}
            position={pos}
            color={jc}
            confidence={pt.conf}
            is2D={false}
            videoAlpha={1}
          />,
        )
      }

      // Bones
      for (const bone of def.bones) {
        const pa = landmarks.get(bone.from)
        const pb = landmarks.get(bone.to)
        if (!pa || !pb) continue
        if (pa.conf < confidenceThreshold || pb.conf < confidenceThreshold) continue

        const p1 = getPosition(pa, medianDepth, frame.sensor, intrinsics)
        const p2 = getPosition(pb, medianDepth, frame.sensor, intrinsics)

        bones.push(
          <Bone
            key={`3d-b-${modelId}-${bone.from}-${bone.to}`}
            start={p1}
            end={p2}
            color={bone.color}
            avgConfidence={(pa.conf + pb.conf) / 2}
            is2D={false}
            videoAlpha={1}
          />,
        )
      }
    }

    return <group>{joints}{bones}</group>
  }, [show3D, frameIdx, frames, poseEvents, intrinsics, confidenceThreshold, skelMsOffset, currentVisibleTimeMs, videoStartOffsetMs])

  return elements
}
