import { useMemo } from 'react'
import { Line } from '@react-three/drei'

const BONE_WIDTH_3D = 3
const BONE_WIDTH_2D = 4

interface BoneProps {
  start: [number, number, number]
  end: [number, number, number]
  color: [number, number, number]
  avgConfidence: number
  is2D: boolean
  videoAlpha: number
}

export function Bone({ start, end, color, avgConfidence, is2D, videoAlpha }: BoneProps) {
  const lineColor = useMemo(
    () => `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`,
    [color],
  )

  return (
    <Line
      points={[start, end]}
      color={lineColor}
      lineWidth={is2D ? BONE_WIDTH_2D : BONE_WIDTH_3D}
      transparent
      opacity={is2D ? videoAlpha : (0.3 + 0.7 * avgConfidence)}
    />
  )
}
