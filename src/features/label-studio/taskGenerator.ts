import type { GameEvent, SessionMeta } from '../../types'

interface LSResult {
  from_name: string
  to_name: string
  type: string
  value: {
    start: number
    end: number
    labels: string[]
  }
}

interface LSPrediction {
  result: LSResult[]
}

export interface LSTask {
  data: Record<string, unknown>
  predictions: LSPrediction[]
}

interface VideoTaskInput {
  bucket: string
  folder: string
  videoFile: string
  gameEvents: GameEvent[]
  sessionMeta: SessionMeta | Record<string, unknown>
}

interface AudioTaskInput {
  bucket: string
  folder: string
  audioFile: string
  sessionMeta: SessionMeta | Record<string, unknown>
}

const EVENT_DURATION_S = 0.5  // each event label spans half a second

export function generateVideoAnnotationTask(input: VideoTaskInput): LSTask {
  const { bucket, folder, videoFile, gameEvents, sessionMeta } = input
  const videoUri = `gs://${bucket}/${folder}/${videoFile}`

  const predictions: LSPrediction[] = gameEvents.length > 0
    ? [{
        result: gameEvents.map(evt => ({
          from_name: 'label',
          to_name: 'video',
          type: 'labels',
          value: {
            start: evt.timestampMs / 1000,
            end: evt.timestampMs / 1000 + EVENT_DURATION_S,
            labels: [evt.type],
          },
        })),
      }]
    : []

  return {
    data: {
      video: videoUri,
      ...sessionMeta,
    },
    predictions,
  }
}

export function generateAudioAnnotationTask(input: AudioTaskInput): LSTask {
  const { bucket, folder, audioFile, sessionMeta } = input
  const audioUri = `gs://${bucket}/${folder}/${audioFile}`

  return {
    data: {
      audio: audioUri,
      ...sessionMeta,
    },
    predictions: [],
  }
}
