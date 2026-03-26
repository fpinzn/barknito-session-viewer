import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ingestText } from '../ingest'
import { useSessionStore } from '../../../stores/sessionStore'

const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf-8')

describe('ingestText', () => {
  beforeEach(() => useSessionStore.getState().reset())

  it('routes pose CSV to sessionStore', () => {
    const csv = fixture('pose-sample.csv')
    ingestText(csv, 'pose_data.csv')
    const state = useSessionStore.getState()
    expect(state.frames.length).toBeGreaterThan(0)
    expect(state.models).toContain('dog-tracker')
  })

  it('routes sensor CSV to sessionStore', () => {
    const csv = fixture('sensor-sample.csv')
    ingestText(csv, 'sensor_data.csv')
    const state = useSessionStore.getState()
    expect(state.frames.length).toBe(3)
    expect(state.frames[0].sensor).not.toBeNull()
  })

  it('routes game_events.json to sessionStore', () => {
    const json = fixture('game-events-sample.json')
    ingestText(json, 'game_events.json')
    expect(useSessionStore.getState().gameEvents.length).toBe(3)
  })

  it('routes ar_events.json to sessionStore', () => {
    const json = fixture('ar-events-sample.json')
    ingestText(json, 'ar_events.json')
    expect(useSessionStore.getState().arPlaneEvents.length).toBe(2)
  })

  it('routes session_meta.json to sessionStore with intrinsics', () => {
    const json = fixture('session-meta-sample.json')
    ingestText(json, 'session_meta.json')
    const state = useSessionStore.getState()
    expect(state.sessionMeta).not.toBeNull()
    expect(state.sessionMeta!.sceneId).toBe('03_TargetSpawningObjects')
    expect(state.intrinsics).not.toBeNull()
    expect(state.intrinsics!.fx).toBeCloseTo(1428.57)
  })

  it('ignores unknown CSV types', () => {
    const csv = 'foo,bar,baz\n1,2,3'
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ingestText(csv, 'unknown.csv')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
