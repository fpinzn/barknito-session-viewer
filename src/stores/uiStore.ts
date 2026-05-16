import { create } from 'zustand'

interface UIState {
  show3DSkeleton: boolean
  show2DSkeleton: boolean
  showPointCloud: boolean
  showARPlanes: boolean
  confidenceThreshold: number
  pointDensity: number
  depthZScale: number
  videoAlpha: number
  pointAlpha: number
  skelMsOffset: number
  followCam: boolean
  activePanel: 'none' | 'gcs' | 'export' | 'events' | 'files'
  browserViewMode: 'device' | 'date'
  browserSessionVisibility: 'active' | 'hidden'

  setShow3DSkeleton: (v: boolean) => void
  setShow2DSkeleton: (v: boolean) => void
  setShowPointCloud: (v: boolean) => void
  setShowARPlanes: (v: boolean) => void
  setConfidenceThreshold: (v: number) => void
  setPointDensity: (v: number) => void
  setDepthZScale: (v: number) => void
  setVideoAlpha: (v: number) => void
  setPointAlpha: (v: number) => void
  setSkelMsOffset: (v: number) => void
  setFollowCam: (v: boolean) => void
  setActivePanel: (v: 'none' | 'gcs' | 'export' | 'events' | 'files') => void
  setBrowserViewMode: (v: 'device' | 'date') => void
  setBrowserSessionVisibility: (v: 'active' | 'hidden') => void
  reset: () => void
}

const initialState = {
  show3DSkeleton: true,
  show2DSkeleton: true,
  showPointCloud: true,
  showARPlanes: true,
  confidenceThreshold: 0.3,
  pointDensity: 4,
  depthZScale: 1.0,
  videoAlpha: 0.8,
  pointAlpha: 0.6,
  skelMsOffset: 0,
  followCam: true,
  activePanel: 'gcs' as const,
  browserViewMode: 'date' as const,
  browserSessionVisibility: 'active' as const,
}

export const useUIStore = create<UIState>((set) => ({
  ...initialState,

  setShow3DSkeleton: (v) => set({ show3DSkeleton: v }),
  setShow2DSkeleton: (v) => set({ show2DSkeleton: v }),
  setShowPointCloud: (v) => set({ showPointCloud: v }),
  setShowARPlanes: (v) => set({ showARPlanes: v }),
  setConfidenceThreshold: (v) => set({ confidenceThreshold: v }),
  setPointDensity: (v) => set({ pointDensity: v }),
  setDepthZScale: (v) => set({ depthZScale: v }),
  setVideoAlpha: (v) => set({ videoAlpha: v }),
  setPointAlpha: (v) => set({ pointAlpha: v }),
  setSkelMsOffset: (v) => set({ skelMsOffset: v }),
  setFollowCam: (v) => set({ followCam: v }),
  setActivePanel: (v) => set({ activePanel: v }),
  setBrowserViewMode: (v) => set({ browserViewMode: v }),
  setBrowserSessionVisibility: (v) => set({ browserSessionVisibility: v }),
  reset: () => set(initialState),
}))
