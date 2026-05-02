import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useVideoSync } from './useVideoSync'
import { findNearestFrameIdx, sessionTimeForVisibleTimeMs, visibleTimeForFrameMs } from './video-timing'

/**
 * PlaybackEngine runs inside the R3F Canvas (via useFrame).
 *
 * The master clock is visible playback time (ms), not raw session time.
 * The video and the skeletons align only if the playhead advances on the
 * video-visible timeline, then maps back to session timestamps using the
 * per-session video start offset.
 *
 * When the user seeks (frame index changed from outside), we re-derive the
 * clock from the new frame's timestamp so playback resumes from there.
 */
export function PlaybackEngine() {
  const playheadMsRef = useRef(0)
  const lastIdxRef = useRef(0)
  const lastIsPlayingRef = useRef(false)
  const appliedInitialOffsetRef = useRef(false)
  const { syncMedia } = useVideoSync()

  useFrame((_, delta) => {
    const { isPlaying, currentFrameIdx, playbackSpeed, setFrameIdx, setPlaybackTimes } = usePlaybackStore.getState()
    const { frames, videoStartOffsetMs, videoDurationMs } = useSessionStore.getState()

    if (frames.length === 0) {
      appliedInitialOffsetRef.current = false
      return
    }

    // External seek (e.g., scrub bar, keyboard) — resync playhead from idx.
    if (currentFrameIdx !== lastIdxRef.current) {
      playheadMsRef.current = visibleTimeForFrameMs(frames, currentFrameIdx, videoStartOffsetMs)
      lastIdxRef.current = currentFrameIdx
    }

    // Play/pause transition — no extra work, but tracked for symmetry with
    // any future "reset accumulator on resume" logic.
    if (isPlaying !== lastIsPlayingRef.current) {
      lastIsPlayingRef.current = isPlaying
    }

    if (!appliedInitialOffsetRef.current && videoStartOffsetMs > 0) {
      const targetTs = sessionTimeForVisibleTimeMs(frames, 0, videoStartOffsetMs)
      const idx = findNearestFrameIdx(frames, targetTs)
      playheadMsRef.current = 0
      lastIdxRef.current = idx
      appliedInitialOffsetRef.current = true
      setPlaybackTimes(targetTs, 0)
      if (idx !== currentFrameIdx) {
        setFrameIdx(idx)
        syncMedia(targetTs, isPlaying, playbackSpeed)
        return
      }
    }

    const lastVisibleFrameMs = visibleTimeForFrameMs(frames, frames.length - 1, videoStartOffsetMs)
    const lastVisibleMs = Math.max(lastVisibleFrameMs, videoDurationMs)

    if (isPlaying) {
      playheadMsRef.current = Math.min(
        playheadMsRef.current + delta * 1000 * playbackSpeed,
        lastVisibleMs,
      )
    }

    const targetTs = sessionTimeForVisibleTimeMs(frames, playheadMsRef.current, videoStartOffsetMs)
    const idx = findNearestFrameIdx(frames, targetTs)
    setPlaybackTimes(targetTs, playheadMsRef.current)

    if (idx !== currentFrameIdx) {
      setFrameIdx(idx)
      lastIdxRef.current = idx
    }

    if (isPlaying && idx >= frames.length - 1 && playheadMsRef.current >= lastVisibleMs) {
      usePlaybackStore.getState().pause()
    }

    const next = usePlaybackStore.getState()
    syncMedia(next.currentSessionTimeMs, next.isPlaying, next.playbackSpeed)
  })

  return null
}
