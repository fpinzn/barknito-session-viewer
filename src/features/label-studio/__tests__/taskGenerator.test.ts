import { describe, it, expect } from 'vitest'
import { generateVideoAnnotationTask, generateAudioAnnotationTask } from '../taskGenerator'

describe('generateVideoAnnotationTask', () => {
  it('generates LS task JSON with GCS video URI', () => {
    const task = generateVideoAnnotationTask({
      bucket: 'barknito-sessions-dev',
      folder: 'device123/session456',
      videoFile: 'rgb.mp4',
      gameEvents: [
        { type: 'SpawningObjectsBeamScored', timestampMs: 5000, beamNumber: 1, totalBeams: 5 },
      ],
      sessionMeta: { sceneId: '03', deviceId: 'device123' },
    })
    expect(task.data.video).toContain('gs://barknito-sessions-dev/')
    expect(task.predictions).toHaveLength(1)
    expect(task.predictions[0].result[0].value.start).toBeCloseTo(5.0)
  })

  it('includes session metadata in task data', () => {
    const task = generateVideoAnnotationTask({
      bucket: 'barknito-sessions-dev',
      folder: 'device123/session456',
      videoFile: 'rgb.mp4',
      gameEvents: [],
      sessionMeta: { sceneId: '03', deviceId: 'device123' },
    })
    expect(task.data.sceneId).toBe('03')
    expect(task.data.deviceId).toBe('device123')
  })

  it('generates predictions with end time offset', () => {
    const task = generateVideoAnnotationTask({
      bucket: 'barknito-sessions-dev',
      folder: 'device123/session456',
      videoFile: 'rgb.mp4',
      gameEvents: [
        { type: 'SpawningObjectsBeamScored', timestampMs: 3000, beamNumber: 1, totalBeams: 5 },
      ],
      sessionMeta: {},
    })
    const result = task.predictions[0].result[0]
    expect(result.value.end).toBeCloseTo(3.5)
    expect(result.value.labels).toContain('SpawningObjectsBeamScored')
  })

  it('handles empty events', () => {
    const task = generateVideoAnnotationTask({
      bucket: 'barknito-sessions-dev',
      folder: 'device123/session456',
      videoFile: 'rgb.mp4',
      gameEvents: [],
      sessionMeta: {},
    })
    expect(task.predictions).toHaveLength(0)
  })
})

describe('generateAudioAnnotationTask', () => {
  it('generates LS task JSON with GCS audio URI', () => {
    const task = generateAudioAnnotationTask({
      bucket: 'barknito-sessions-dev',
      folder: 'device123/session456',
      audioFile: 'audio.m4a',
      sessionMeta: {},
    })
    expect(task.data.audio).toContain('gs://barknito-sessions-dev/')
  })

  it('includes session metadata', () => {
    const task = generateAudioAnnotationTask({
      bucket: 'barknito-sessions-dev',
      folder: 'device123/session456',
      audioFile: 'audio.m4a',
      sessionMeta: { sceneId: '03', deviceId: 'device123' },
    })
    expect(task.data.sceneId).toBe('03')
    expect(task.data.deviceId).toBe('device123')
  })
})
