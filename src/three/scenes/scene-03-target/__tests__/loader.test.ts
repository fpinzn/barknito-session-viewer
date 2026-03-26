import { describe, it, expect } from 'vitest'
import { parseScene03Config, extractScene03Events } from '../loader'

describe('scene03 loader', () => {
  it('parses spawning_objects_config.json', () => {
    const config = parseScene03Config({
      beamCount: 5,
      proximityRadius: 0.5,
      beamStyle: 'particle',
      minFloorAreaToSpawn: 2.0,
    })
    expect(config.beamCount).toBe(5)
    expect(config.beamStyle).toBe('particle')
    expect(config.proximityRadius).toBe(0.5)
    expect(config.minFloorAreaToSpawn).toBe(2.0)
  })

  it('uses defaults for missing fields', () => {
    const config = parseScene03Config({})
    expect(config.beamCount).toBe(5)
    expect(config.beamStyle).toBe('particle')
    expect(config.proximityRadius).toBe(0.5)
    expect(config.minFloorAreaToSpawn).toBe(2.0)
  })

  it('extracts beam scored events', () => {
    const events = extractScene03Events([
      { type: 'SpawningObjectsBeamScored', timestampMs: 1000, beamNumber: 1, totalBeams: 5 },
      { type: 'SomeOtherEvent', timestampMs: 2000 },
      { type: 'SpawningObjectsBeamScored', timestampMs: 3000, beamNumber: 2, totalBeams: 5 },
    ])
    expect(events).toHaveLength(2)
    expect(events[0].beamNumber).toBe(1)
    expect(events[1].beamNumber).toBe(2)
  })

  it('returns empty array when no beam events exist', () => {
    const events = extractScene03Events([
      { type: 'SomeOtherEvent', timestampMs: 2000 },
    ])
    expect(events).toHaveLength(0)
  })
})
