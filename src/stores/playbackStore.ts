import { create } from 'zustand'
import { useSessionStore } from './sessionStore'

interface PlaybackState {
  isPlaying: boolean
  currentFrameIdx: number
  playbackSpeed: number

  togglePlay: () => void
  pause: () => void
  nextFrame: () => void
  prevFrame: () => void
  seekTo: (timestampMs: number) => void
  jumpToEvent: (eventIdx: number) => void
  setPlaybackSpeed: (speed: number) => void
  setFrameIdx: (idx: number) => void
  reset: () => void
}

const initialState = {
  isPlaying: false,
  currentFrameIdx: 0,
  playbackSpeed: 1,
}

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  ...initialState,

  togglePlay: () => set(s => ({ isPlaying: !s.isPlaying })),
  pause: () => set({ isPlaying: false }),

  nextFrame: () => {
    const maxIdx = useSessionStore.getState().frames.length - 1
    set(s => ({ currentFrameIdx: Math.min(s.currentFrameIdx + 1, Math.max(0, maxIdx)) }))
  },

  prevFrame: () => {
    set(s => ({ currentFrameIdx: Math.max(s.currentFrameIdx - 1, 0) }))
  },

  seekTo: (timestampMs: number) => {
    const { frames } = useSessionStore.getState()
    if (frames.length === 0) return

    // Binary search for nearest frame
    let lo = 0
    let hi = frames.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (frames[mid].ts < timestampMs) lo = mid + 1
      else hi = mid
    }
    if (lo > 0 && Math.abs(frames[lo - 1].ts - timestampMs) < Math.abs(frames[lo].ts - timestampMs)) {
      lo--
    }
    set({ currentFrameIdx: lo })
  },

  jumpToEvent: (eventIdx: number) => {
    const { gameEvents } = useSessionStore.getState()
    if (eventIdx < 0 || eventIdx >= gameEvents.length) return
    get().seekTo(gameEvents[eventIdx].timestampMs)
  },

  setPlaybackSpeed: (speed: number) => set({ playbackSpeed: speed }),
  setFrameIdx: (idx: number) => set({ currentFrameIdx: idx }),
  reset: () => set(initialState),
}))
