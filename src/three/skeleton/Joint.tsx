import { useMemo } from 'react'
import * as THREE from 'three'

const JOINT_RADIUS = 0.008

interface JointProps {
  position: [number, number, number]
  color: [number, number, number]
  confidence: number
  is2D: boolean
  videoAlpha: number
}

export function Joint({ position, color, confidence, is2D, videoAlpha }: JointProps) {
  const scale = (0.6 + 0.4 * confidence) * (is2D ? 0.4 : 1.0)
  const threeColor = useMemo(() => new THREE.Color(color[0], color[1], color[2]), [color])

  return (
    <mesh position={position} scale={scale}>
      <sphereGeometry args={[JOINT_RADIUS, 8, 8]} />
      <meshBasicMaterial
        color={threeColor}
        transparent={is2D}
        opacity={is2D ? videoAlpha : 1.0}
      />
    </mesh>
  )
}
