import { useMemo } from 'react'
import { usePlaybackStore } from '../../../stores/playbackStore'
import { useSessionStore } from '../../../stores/sessionStore'
import { LightBeam, type BeamState } from './LightBeam'
import { extractScene03Events, parseScene03Config } from './loader'
import type { GameEvent } from '../../../types'

interface Scene03TargetProps {
  config: unknown
  events: unknown[]
}

export function Scene03Target({ config, events }: Scene03TargetProps) {
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const frames = useSessionStore(s => s.frames)

  const parsedConfig = useMemo(() => parseScene03Config(config), [config])
  const beamEvents = useMemo(() => extractScene03Events(events as GameEvent[]), [events])

  const currentTs = frames[frameIdx]?.ts ?? 0

  // Derive beam states from events up to current time
  const beamStates = useMemo(() => {
    const states: BeamState[] = Array(parsedConfig.beamCount).fill('idle')

    for (const evt of beamEvents) {
      if (evt.timestampMs <= currentTs && evt.beamNumber >= 1 && evt.beamNumber <= parsedConfig.beamCount) {
        states[evt.beamNumber - 1] = 'scored'
      }
    }

    return states
  }, [beamEvents, currentTs, parsedConfig.beamCount])

  // Place beams in a circle (visualization placeholder since
  // actual positions come from AR plane detection at runtime)
  const beamPositions = useMemo((): [number, number, number][] => {
    const positions: [number, number, number][] = []
    const radius = 1.0
    for (let i = 0; i < parsedConfig.beamCount; i++) {
      const angle = (i / parsedConfig.beamCount) * Math.PI * 2
      positions.push([
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      ])
    }
    return positions
  }, [parsedConfig.beamCount])

  // Don't render until we have beam events (means the game actually ran)
  if (beamEvents.length === 0) return null

  return (
    <group>
      {beamPositions.map((pos, i) => (
        <LightBeam
          key={i}
          position={pos}
          style={parsedConfig.beamStyle}
          state={beamStates[i]}
        />
      ))}
    </group>
  )
}
