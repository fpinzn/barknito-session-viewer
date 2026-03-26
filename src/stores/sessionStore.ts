import { create } from 'zustand'
import type { Intrinsics, GameEvent, ARPlaneEvent, SessionMeta, Landmark } from '../types'
import { rebuildFrameList, type Frame, type PoseEvent } from '../features/viewer/frame-utils'

interface PoseFrameEntry {
  ts: number
  models: Map<string, Map<string, Landmark>>
}

interface SensorEntry {
  ts: number
  pos: { x: number; y: number; z: number }
  rot: { x: number; y: number; z: number; w: number }
}

interface SessionState {
  // Parsed data
  frames: Frame[]
  models: string[]
  poseEvents: PoseEvent[]
  poseFrameMap: Map<number, PoseFrameEntry> | null
  sensorFrameMap: Map<number, SensorEntry> | null

  // JSON data
  gameEvents: GameEvent[]
  arPlaneEvents: ARPlaneEvent[]
  sessionMeta: SessionMeta | null
  gameConfig: unknown | null
  intrinsics: Intrinsics | null

  // Media URLs
  videoUrl: string | null
  depthVideoUrl: string | null
  audioUrl: string | null

  // Actions
  loadPoseData: (frameMap: Map<number, PoseFrameEntry>, models: string[]) => void
  loadSensorData: (frameMap: Map<number, SensorEntry>) => void
  loadIntrinsics: (intrinsics: Intrinsics) => void
  loadGameEvents: (events: GameEvent[]) => void
  loadARPlaneEvents: (events: ARPlaneEvent[]) => void
  loadSessionMeta: (meta: SessionMeta) => void
  loadGameConfig: (config: unknown) => void
  setVideoUrl: (url: string) => void
  setDepthVideoUrl: (url: string) => void
  setAudioUrl: (url: string) => void
  reset: () => void
}

const initialState = {
  frames: [] as Frame[],
  models: [] as string[],
  poseEvents: [] as PoseEvent[],
  poseFrameMap: null as Map<number, PoseFrameEntry> | null,
  sensorFrameMap: null as Map<number, SensorEntry> | null,
  gameEvents: [] as GameEvent[],
  arPlaneEvents: [] as ARPlaneEvent[],
  sessionMeta: null as SessionMeta | null,
  gameConfig: null as unknown | null,
  intrinsics: null as Intrinsics | null,
  videoUrl: null as string | null,
  depthVideoUrl: null as string | null,
  audioUrl: null as string | null,
}

function rebuild(state: Pick<SessionState, 'poseFrameMap' | 'sensorFrameMap' | 'models'>) {
  return rebuildFrameList({
    sensorFrameMap: state.sensorFrameMap ?? undefined,
    poseFrameMap: state.poseFrameMap ?? undefined,
    models: state.models,
  })
}

export const useSessionStore = create<SessionState>((set, get) => ({
  ...initialState,

  loadPoseData: (frameMap, models) => {
    const updated = { ...get(), poseFrameMap: frameMap, models }
    const result = rebuild(updated)
    set({ ...result, poseFrameMap: frameMap, models })
  },

  loadSensorData: (frameMap) => {
    const updated = { ...get(), sensorFrameMap: frameMap }
    const result = rebuild(updated)
    set({ sensorFrameMap: frameMap, ...result })
  },

  loadIntrinsics: (intrinsics) => set({ intrinsics }),
  loadGameEvents: (events) => set({ gameEvents: events }),
  loadARPlaneEvents: (events) => set({ arPlaneEvents: events }),
  loadSessionMeta: (meta) => set({ sessionMeta: meta }),
  loadGameConfig: (config) => set({ gameConfig: config }),
  setVideoUrl: (url) => set({ videoUrl: url }),
  setDepthVideoUrl: (url) => set({ depthVideoUrl: url }),
  setAudioUrl: (url) => set({ audioUrl: url }),
  reset: () => set(initialState),
}))
