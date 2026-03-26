import { useEffect } from 'react'
import { usePlaybackStore } from '../stores/playbackStore'
import { useSessionStore } from '../stores/sessionStore'
import { useUIStore } from '../stores/uiStore'

export function KeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return

      const { frames } = useSessionStore.getState()
      if (frames.length === 0) return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          usePlaybackStore.getState().togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          usePlaybackStore.getState().prevFrame()
          break
        case 'ArrowRight':
          e.preventDefault()
          usePlaybackStore.getState().nextFrame()
          break
        case 'Home':
          e.preventDefault()
          usePlaybackStore.getState().setFrameIdx(0)
          break
        case 'End':
          e.preventDefault()
          usePlaybackStore.getState().setFrameIdx(frames.length - 1)
          break
        case 'KeyF':
          e.preventDefault()
          useUIStore.getState().setFollowCam(!useUIStore.getState().followCam)
          break
        case 'BracketLeft': {
          e.preventDefault()
          const { gameEvents } = useSessionStore.getState()
          const currentTs = frames[usePlaybackStore.getState().currentFrameIdx]?.ts ?? 0
          // Find previous event (last event before current time)
          for (let i = gameEvents.length - 1; i >= 0; i--) {
            if (gameEvents[i].timestampMs < currentTs - 50) {
              usePlaybackStore.getState().jumpToEvent(i)
              break
            }
          }
          break
        }
        case 'BracketRight': {
          e.preventDefault()
          const { gameEvents: events } = useSessionStore.getState()
          const ts = frames[usePlaybackStore.getState().currentFrameIdx]?.ts ?? 0
          // Find next event (first event after current time)
          for (let i = 0; i < events.length; i++) {
            if (events[i].timestampMs > ts + 50) {
              usePlaybackStore.getState().jumpToEvent(i)
              break
            }
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return null
}
