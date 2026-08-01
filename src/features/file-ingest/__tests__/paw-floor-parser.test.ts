import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectCSVType, parsePawFloorCSV } from '../parsers'

const fixture = readFileSync(
  join(__dirname, '../fixtures/paw-floor-sample.csv'),
  'utf-8',
)

describe('detectCSVType', () => {
  it('detects the paw floor projection CSV', () => {
    const header = fixture.split('\n')[0]
    expect(detectCSVType(header)).toBe('pawFloor')
  })

  it('does not confuse it with the pose CSV', () => {
    expect(detectCSVType('timestamp_ms,frame_id,model_id,landmark,x,y,confidence'))
      .toBe('pose')
  })
})

describe('parsePawFloorCSV', () => {
  it('strips the BOM and groups rows by frame id', () => {
    const frames = parsePawFloorCSV(fixture)
    expect(frames.size).toBe(3)
    expect([...frames.keys()].sort((a, b) => a - b)).toEqual([5138, 5172, 5175])
  })

  it('records the timestamp per frame', () => {
    const frames = parsePawFloorCSV(fixture)
    expect(frames.get(5175)!.ts).toBe(3634)
  })

  it('parses a hit row with world coordinates', () => {
    const paw = parsePawFloorCSV(fixture).get(5175)!.paws.get('left_front_paw')!
    expect(paw.hit).toBe(true)
    expect(paw.conf).toBeCloseTo(0.8521, 4)
    expect(paw.screenX).toBeCloseTo(901.2196, 3)
    expect(paw.planeId).toBe('9647EAEC68C9D719-F223AA98606FC2BA')
    expect(paw.world).toEqual({ x: 0.5684, y: -1.3198, z: 0.7985 })
  })

  it('parses a miss row with null world, never NaN', () => {
    const paw = parsePawFloorCSV(fixture).get(5138)!.paws.get('left_front_paw')!
    expect(paw.hit).toBe(false)
    expect(paw.world).toBeNull()
    expect(paw.planeId).toBeNull()
    expect(paw.conf).toBeCloseTo(0.7788, 4)
  })

  it('keeps all paws present in a frame', () => {
    const frame = parsePawFloorCSV(fixture).get(5175)!
    expect([...frame.paws.keys()].sort()).toEqual(
      ['left_back_paw', 'left_front_paw', 'right_front_paw'],
    )
  })

  it('does not expose paw_depth_m', () => {
    const paw = parsePawFloorCSV(fixture).get(5175)!.paws.get('left_front_paw')!
    expect('depth' in paw).toBe(false)
    expect('depthM' in paw).toBe(false)
  })
})
