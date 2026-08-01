import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore } from '../sessionStore'
import { ingestText } from '../../features/file-ingest/ingest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fixture = readFileSync(
  join(__dirname, '../../features/file-ingest/fixtures/paw-floor-sample.csv'),
  'utf-8',
)

describe('paw floor store wiring', () => {
  beforeEach(() => {
    useSessionStore.getState().reset()
  })

  it('starts null', () => {
    expect(useSessionStore.getState().pawFloorFrameMap).toBeNull()
  })

  it('ingests the paw floor CSV into the store', () => {
    ingestText(fixture, 'paw_floor_projection_raycasting_v1.csv')
    const map = useSessionStore.getState().pawFloorFrameMap
    expect(map).not.toBeNull()
    expect(map!.size).toBe(3)
  })

  it('does not disturb pose or sensor state', () => {
    ingestText(fixture, 'paw_floor_projection_raycasting_v1.csv')
    expect(useSessionStore.getState().poseFrameMap).toBeNull()
    expect(useSessionStore.getState().sensorFrameMap).toBeNull()
  })

  it('clears on reset', () => {
    ingestText(fixture, 'paw_floor_projection_raycasting_v1.csv')
    useSessionStore.getState().reset()
    expect(useSessionStore.getState().pawFloorFrameMap).toBeNull()
  })
})
