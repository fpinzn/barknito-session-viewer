import { useMemo } from 'react'
import * as THREE from 'three'

interface ARPlaneProps {
  boundary: number[][]
  position: [number, number, number]
  rotation: [number, number, number, number]
  sensorPos: { x: number; y: number; z: number }
  sensorRot: { x: number; y: number; z: number; w: number }
}

// Temp vectors for X mirror transform
const _planeQ = new THREE.Quaternion()
const _planeP = new THREE.Vector3()
const _planeV = new THREE.Vector3()
const _camQ = new THREE.Quaternion()
const _camP = new THREE.Vector3()
const _mirrorInvQ = new THREE.Quaternion()

export function ARPlane({ boundary, position: pos, rotation: rot, sensorPos, sensorRot }: ARPlaneProps) {
  const { meshPositions, outlinePositions, indices } = useMemo(() => {
    if (boundary.length < 3) return { meshPositions: new Float32Array(0), outlinePositions: new Float32Array(0), indices: [] }

    _planeQ.set(rot[0], rot[1], rot[2], rot[3])
    _planeP.set(pos[0], pos[1], pos[2])
    _camQ.set(sensorRot.x, sensorRot.y, sensorRot.z, sensorRot.w)
    _camP.set(sensorPos.x, sensorPos.y, sensorPos.z)
    _mirrorInvQ.copy(_camQ).invert()

    const n = boundary.length
    const meshPos = new Float32Array(n * 3)
    const olPos = new Float32Array(n * 3)

    for (let i = 0; i < n; i++) {
      _planeV.set(boundary[i][0], 0, boundary[i][1])
      _planeV.applyQuaternion(_planeQ)
      _planeV.add(_planeP)

      // Camera-relative X mirror
      _planeV.sub(_camP)
      _planeV.applyQuaternion(_mirrorInvQ)
      _planeV.x = -_planeV.x
      _planeV.applyQuaternion(_camQ)
      _planeV.add(_camP)

      meshPos[i * 3] = _planeV.x
      meshPos[i * 3 + 1] = _planeV.y
      meshPos[i * 3 + 2] = _planeV.z
      olPos[i * 3] = _planeV.x
      olPos[i * 3 + 1] = _planeV.y
      olPos[i * 3 + 2] = _planeV.z
    }

    // Triangulate
    const contour = boundary.map(p => new THREE.Vector2(p[0], p[1]))
    const triangles = THREE.ShapeUtils.triangulateShape(contour, [])
    const idx: number[] = []
    for (const tri of triangles) idx.push(tri[0], tri[1], tri[2])

    return { meshPositions: meshPos, outlinePositions: olPos, indices: idx }
  }, [boundary, pos, rot, sensorPos, sensorRot])

  if (meshPositions.length === 0) return null

  return (
    <group>
      {/* Fill mesh */}
      <mesh>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[meshPositions, 3]}
          />
          <bufferAttribute
            attach="index"
            args={[new Uint16Array(indices), 1]}
          />
        </bufferGeometry>
        <meshBasicMaterial
          color={0x4488ff}
          transparent
          opacity={0.12}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Outline */}
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[outlinePositions, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={0x4488ff} opacity={0.4} transparent />
      </lineLoop>
    </group>
  )
}
