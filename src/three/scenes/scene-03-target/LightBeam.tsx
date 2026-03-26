import { useMemo } from 'react'
import * as THREE from 'three'

export type BeamState = 'idle' | 'inRange' | 'scored'

interface LightBeamProps {
  position: [number, number, number]
  style: 'particle' | 'cylinder' | 'marker'
  state: BeamState
}

const STATE_COLORS: Record<BeamState, THREE.Color> = {
  idle: new THREE.Color(1, 1, 1),       // white
  inRange: new THREE.Color(0.2, 0.4, 1), // blue
  scored: new THREE.Color(0.2, 1, 0.3),  // green
}

const BEAM_HEIGHT = 2
const BEAM_RADIUS = 0.15
const MARKER_RADIUS = 0.3
const GLOW_RADIUS = 0.25

export function LightBeam({ position, style, state }: LightBeamProps) {
  const color = STATE_COLORS[state]
  const opacity = state === 'scored' ? 0.6 : 0.4

  const glowGeometry = useMemo(
    () => new THREE.CylinderGeometry(GLOW_RADIUS, GLOW_RADIUS, 0.01, 16),
    [],
  )

  return (
    <group position={position}>
      {/* Main beam shape */}
      {style === 'cylinder' && (
        <mesh position={[0, BEAM_HEIGHT / 2, 0]}>
          <cylinderGeometry args={[BEAM_RADIUS, BEAM_RADIUS, BEAM_HEIGHT, 16]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={opacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {style === 'marker' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
          <circleGeometry args={[MARKER_RADIUS, 24]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={opacity + 0.2}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {style === 'particle' && (
        <mesh position={[0, BEAM_HEIGHT / 2, 0]}>
          <cylinderGeometry args={[BEAM_RADIUS * 0.8, BEAM_RADIUS, BEAM_HEIGHT, 16]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={opacity}
            emissive={color}
            emissiveIntensity={0.5}
          />
        </mesh>
      )}

      {/* Ground glow ring */}
      <mesh geometry={glowGeometry} position={[0, 0.005, 0]}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.3}
          emissive={color}
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  )
}
