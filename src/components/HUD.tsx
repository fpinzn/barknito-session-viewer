import { useSessionStore } from '../stores/sessionStore'
import { usePlaybackStore } from '../stores/playbackStore'
import { findNearestPoseModels } from '../features/viewer/frame-utils'
import { useUIStore } from '../stores/uiStore'

export function HUD() {
  const frames = useSessionStore(s => s.frames)
  const poseEvents = useSessionStore(s => s.poseEvents)
  const models = useSessionStore(s => s.models)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const skelMsOffset = useUIStore(s => s.skelMsOffset)

  if (frames.length === 0) return null

  const frame = frames[frameIdx]
  if (!frame) return null

  const skelModels = findNearestPoseModels(poseEvents, frame.ts + skelMsOffset)

  // Count visible landmarks
  let landmarkCount = 0
  for (const [, landmarks] of skelModels) {
    landmarkCount += landmarks.size
  }

  return (
    <div className="hud">
      <div>Frame: <span className="val">{frameIdx + 1} / {frames.length}</span></div>
      <div>Time: <span className="val">{(frame.ts / 1000).toFixed(2)}s</span></div>
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
