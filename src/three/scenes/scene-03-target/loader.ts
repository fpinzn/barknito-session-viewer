import type { GameEvent } from '../../../types'

export interface Scene03Config {
  beamCount: number
  proximityRadius: number
  beamStyle: 'particle' | 'cylinder' | 'marker'
  minFloorAreaToSpawn: number
}

export interface BeamScoredEvent {
  type: 'SpawningObjectsBeamScored'
  timestampMs: number
  beamNumber: number
  totalBeams: number
}

export function parseScene03Config(raw: unknown): Scene03Config {
  const obj = raw as Record<string, unknown>
  return {
    beamCount: typeof obj.beamCount === 'number' ? obj.beamCount : 5,
    proximityRadius: typeof obj.proximityRadius === 'number' ? obj.proximityRadius : 0.5,
    beamStyle: (obj.beamStyle === 'cylinder' || obj.beamStyle === 'marker' || obj.beamStyle === 'particle')
      ? obj.beamStyle : 'particle',
    minFloorAreaToSpawn: typeof obj.minFloorAreaToSpawn === 'number' ? obj.minFloorAreaToSpawn : 2.0,
  }
}

export function extractScene03Events(events: GameEvent[]): BeamScoredEvent[] {
  return events.filter(
    (e): e is BeamScoredEvent & GameEvent => e.type === 'SpawningObjectsBeamScored'
  ) as BeamScoredEvent[]
}

export async function loadScene03Config(raw: unknown): Promise<Scene03Config> {
  return parseScene03Config(raw)
}
