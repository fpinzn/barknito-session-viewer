import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { detectCSVType, parsePoseCSV, parseSensorCSV, parseJSON } from '../parsers'

const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf-8')

describe('detectCSVType', () => {
  it('detects pose CSV by header', () => {
    const csv = fixture('pose-sample.csv')
    const header = csv.split('\n')[0]
    expect(detectCSVType(header)).toBe('pose')
  })
  it('detects sensor CSV by header', () => {
    const csv = fixture('sensor-sample.csv')
    const header = csv.split('\n')[0]
    expect(detectCSVType(header)).toBe('sensor')
  })
  it('returns unknown for unrecognized CSV', () => {
    expect(detectCSVType('foo,bar,baz')).toBe('unknown')
  })
})

describe('parsePoseCSV', () => {
  it('parses frames with models and landmarks', () => {
    const csv = fixture('pose-sample.csv')
    const result = parsePoseCSV(csv)
    expect(result.frameMap.size).toBe(3)
    expect(result.models).toContain('dog-tracker')
  })
  it('preserves landmark data correctly', () => {
    const csv = fixture('pose-sample.csv')
    const result = parsePoseCSV(csv)
    const frame1 = result.frameMap.get(1)!
    expect(frame1.ts).toBe(100)
    const dogModel = frame1.models.get('dog-tracker')!
    const nose = dogModel.get('nose')!
    expect(nose.x).toBeCloseTo(0.5)
    expect(nose.y).toBeCloseTo(0.3)
    expect(nose.conf).toBeCloseTo(0.95)
    expect(nose.depth).toBeCloseTo(1.2)
  })
  it('handles multiple frames', () => {
    const csv = fixture('pose-sample.csv')
    const result = parsePoseCSV(csv)
    const frame3 = result.frameMap.get(3)!
    expect(frame3.ts).toBe(166)
    expect(frame3.models.get('dog-tracker')!.size).toBe(4)
  })
})

describe('parseSensorCSV', () => {
  it('parses sensor frames with position and rotation', () => {
    const csv = fixture('sensor-sample.csv')
    const result = parseSensorCSV(csv)
    expect(result.frameMap.size).toBe(3)
  })
  it('preserves sensor data correctly', () => {
    const csv = fixture('sensor-sample.csv')
    const result = parseSensorCSV(csv)
    const frame = result.frameMap.get(1)!
    expect(frame.ts).toBe(100)
    expect(frame.pos.x).toBeCloseTo(0.1)
    expect(frame.pos.y).toBeCloseTo(0.2)
    expect(frame.pos.z).toBeCloseTo(0.3)
    expect(frame.rot.x).toBeCloseTo(0.0)
    expect(frame.rot.w).toBeCloseTo(1.0)
  })
})

describe('parseJSON', () => {
  it('routes game_events correctly', () => {
    const json = fixture('game-events-sample.json')
    const result = parseJSON(json, 'game_events.json')
    expect(result.type).toBe('gameEvents')
    expect(result.data.events.length).toBe(3)
  })
  it('routes ar_events correctly', () => {
    const json = fixture('ar-events-sample.json')
    const result = parseJSON(json, 'ar_events.json')
    expect(result.type).toBe('arPlaneEvents')
    expect(result.data.planes.length).toBe(2)
  })
  it('converts flat boundary arrays to pairs', () => {
    const json = fixture('ar-events-sample.json')
    const result = parseJSON(json, 'ar_events.json')
    const plane1 = result.data.planes[0]
    // boundary was flat [0.5, 0.5, -0.5, 0.5, ...] → [[0.5, 0.5], [-0.5, 0.5], ...]
    expect(Array.isArray(plane1.boundary[0])).toBe(true)
    expect(plane1.boundary.length).toBe(4)
  })
  it('routes session_meta correctly', () => {
    const json = fixture('session-meta-sample.json')
    const result = parseJSON(json, 'session_meta.json')
    expect(result.type).toBe('sessionMeta')
    expect(result.data.meta.sceneId).toBe('03_TargetSpawningObjects')
  })
  it('extracts intrinsics from session meta', () => {
    const json = fixture('session-meta-sample.json')
    const result = parseJSON(json, 'session_meta.json')
    expect(result.data.intrinsics).toBeDefined()
    expect(result.data.intrinsics!.fx).toBeCloseTo(1428.57)
    expect(result.data.intrinsics!.resW).toBe(720)
  })
})
