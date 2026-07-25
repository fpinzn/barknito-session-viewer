import { useSessionStore } from '../stores/sessionStore'
import { usePlaybackStore } from '../stores/playbackStore'
import { findNearestPoseModels } from '../features/viewer/frame-utils'
import { useUIStore } from '../stores/uiStore'
import { visibleTimeForFrameMs } from '../features/viewer/video-timing'

export function HUD() {
  const frames = useSessionStore(s => s.frames)
  const poseEvents = useSessionStore(s => s.poseEvents)
  const models = useSessionStore(s => s.models)
  const videoStartOffsetMs = useSessionStore(s => s.videoStartOffsetMs)
  const videoDurationMs = useSessionStore(s => s.videoDurationMs)
  const sessionMeta = useSessionStore(s => s.sessionMeta)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const currentSessionTimeMs = usePlaybackStore(s => s.currentSessionTimeMs)
  const currentVisibleTimeMs = usePlaybackStore(s => s.currentVisibleTimeMs)
  const skelMsOffset = useUIStore(s => s.skelMsOffset)

  if (frames.length === 0) return null

  const frame = frames[frameIdx]
  if (!frame) return null

  const skelModels = findNearestPoseModels(poseEvents, frame.ts + skelMsOffset)
  const frameVisibleTimeMs = visibleTimeForFrameMs(frames, frameIdx, videoStartOffsetMs)
  const firstFrameTs = frames[0]?.ts ?? 0
  const lastFrameTs = frames[frames.length - 1]?.ts ?? 0
  const firstPoseTs = poseEvents[0]?.ts ?? 0
  const lastPoseTs = poseEvents[poseEvents.length - 1]?.ts ?? 0
  const sessionDurationMs = typeof sessionMeta?.startedAtMs === 'number' && typeof sessionMeta?.endedAtMs === 'number'
    ? sessionMeta.endedAtMs - sessionMeta.startedAtMs
    : 0

  // Count visible landmarks
  let landmarkCount = 0
  for (const [, landmarks] of skelModels) {
    landmarkCount += landmarks.size
  }

  return (
    <div className="hud">
      <div>Frame: <span className="val">{frameIdx + 1} / {frames.length}</span></div>
      <div>Frame ID: <span className="val">{frame.id}</span></div>
      <div>Frame Session Time: <span className="val">{(frame.ts / 1000).toFixed(2)}s</span></div>
      <div>Playhead Session Time: <span className="val">{(currentSessionTimeMs / 1000).toFixed(2)}s</span></div>
      <div>Visible Time: <span className="val">{(currentVisibleTimeMs / 1000).toFixed(2)}s</span></div>
      <div>Frame Visible Time: <span className="val">{(frameVisibleTimeMs / 1000).toFixed(2)}s</span></div>
      <div>Video Offset: <span className="val">{(videoStartOffsetMs / 1000).toFixed(3)}s</span></div>
      <div>Video Duration: <span className="val">{(videoDurationMs / 1000).toFixed(3)}s</span></div>
      <div>Frame Range: <span className="val">{(firstFrameTs / 1000).toFixed(3)}s → {(lastFrameTs / 1000).toFixed(3)}s</span></div>
      <div>Pose Range: <span className="val">{(firstPoseTs / 1000).toFixed(3)}s → {(lastPoseTs / 1000).toFixed(3)}s</span></div>
      {sessionDurationMs > 0 && (
        <div>Session Duration: <span className="val">{(sessionDurationMs / 1000).toFixed(3)}s</span></div>
      )}
      {frame.sensor && (
        <div>
          Phone: <span className="val">
            ({frame.sensor.pos.x.toFixed(2)}, {frame.sensor.pos.y.toFixed(2)}, {frame.sensor.pos.z.toFixed(2)})
          </span>
        </div>
      )}
      {models.length > 0 && (
        <div>Models: <span className="val">{models.join(', ')}</span></div>
      )}
      {landmarkCount > 0 && (
        <div>Landmarks: <span className="val">{landmarkCount}</span></div>
      )}
    </div>
  )
}
