import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useVideoSync } from './useVideoSync'

/**
 * PlaybackEngine runs inside the R3F Canvas (via useFrame).
 * When playing, advances currentFrameIdx based on playbackSpeed and delta time.
 * Syncs video elements to the current frame.
 */
export function PlaybackEngine() {
  const lastFrameIdxRef = useRef(-1)
  const accumulatorRef = useRef(0)
  const { seekToFrame, syncAudioPlayback } = useVideoSync()

  // Sync audio on play/pause changes
  const isPlayingRef = useRef(false)
  useEffect(() => {
    return usePlaybackStore.subscribe((state) => {
      if (state.isPlaying !== isPlayingRef.current) {
        isPlayingRef.current = state.isPlaying
        syncAudioPlayback(state.isPlaying, state.playbackSpeed, 0.5)
        // Reset accumulator when starting playback
        if (state.isPlaying) accumulatorRef.current = 0
      }
    })
  }, [syncAudioPlayback])

  useFrame((_, delta) => {
    const { isPlaying, currentFrameIdx, playbackSpeed, setFrameIdx } = usePlaybackStore.getState()
    const { frames } = useSessionStore.getState()

    if (frames.length === 0) return

    if (isPlaying) {
      const frameDuration = frames.length > 1
        ? (frames[frames.length - 1].ts - frames[0].ts) / (frames.length - 1)
        : 33.33

      // Accumulate elapsed time, advance one frame at a time
      accumulatorRef.current += delta * 1000 * playbackSpeed
      let idx = currentFrameIdx
      while (accumulatorRef.current >= frameDuration && idx < frames.length - 1) {
        accumulatorRef.current -= frameDuration
        idx++
      }

      if (idx !== currentFrameIdx) {
        setFrameIdx(idx)

        // Stop at end
        if (idx >= frames.length - 1) {
          usePlaybackStore.getState().pause()
        }
      }
    }

    // Seek videos when frame changes
    const frameIdx = usePlaybackStore.getState().currentFrameIdx
    if (frameIdx !== lastFrameIdxRef.current) {
      lastFrameIdxRef.current = frameIdx
      seekToFrame(frameIdx)
    }
  })

  return null
}
