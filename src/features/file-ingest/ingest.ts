import { useSessionStore } from '../../stores/sessionStore'
import { detectCSVType, parsePoseCSV, parseSensorCSV, parseJSON } from './parsers'
import { decompressGz } from './decompress'
import type { ARPlaneEvent } from '../../types'

/**
 * Ingest a text file (CSV or JSON) into the session store.
 */
export function ingestText(text: string, filename: string): void {
  const store = useSessionStore.getState()

  // JSON files
  if (filename.endsWith('.json')) {
    try {
      const result = parseJSON(text, filename)
      switch (result.type) {
        case 'gameEvents':
          store.loadGameEvents(result.data.events)
          return
        case 'arPlaneEvents':
          store.loadARPlaneEvents(result.data.planes as unknown as ARPlaneEvent[])
          return
        case 'sessionMeta':
          store.loadSessionMeta(result.data.meta)
          if (result.data.intrinsics) {
            store.loadIntrinsics(result.data.intrinsics)
          }
          return
        case 'gameConfig':
          store.loadGameConfig(result.data)
          return
        case 'unknown':
          console.warn(`Unknown JSON shape in ${filename}`)
          return
      }
    } catch {
      // Not JSON, fall through to CSV
    }
  }

  // CSV files
  const firstLine = text.split('\n')[0].replace(/^\uFEFF/, '')
  const csvType = detectCSVType(firstLine)

  switch (csvType) {
    case 'pose': {
      const { frameMap, models } = parsePoseCSV(text)
      store.loadPoseData(frameMap, models)
      break
    }
    case 'sensor': {
      const { frameMap } = parseSensorCSV(text)
      store.loadSensorData(frameMap)
      break
    }
    default:
      console.warn(`Unknown CSV type in ${filename}`)
  }
}

/**
 * Ingest a File object — handles routing by extension including gz decompression.
 */
export async function ingestFile(file: File): Promise<void> {
  const name = file.name.toLowerCase()
  const store = useSessionStore.getState()

  // Video files
  if (name.endsWith('.mp4') || name.endsWith('.mov')) {
    const url = URL.createObjectURL(file)
    if (name.includes('depth')) {
      store.setDepthVideoUrl(url)
    } else {
      store.setVideoUrl(url)
    }
    return
  }

  // Audio files
  if (name.endsWith('.m4a')) {
    const url = URL.createObjectURL(file)
    store.setAudioUrl(url)
    return
  }

  // Gzipped files — decompress then ingest inner file
  if (name.endsWith('.gz')) {
    const innerName = file.name.replace(/\.gz$/i, '')
    const text = await decompressGz(file)
    ingestText(text, innerName)
    return
  }

  // Plain text files (CSV, JSON)
  const text = await file.text()
  ingestText(text, file.name)
}
