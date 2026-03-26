import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useUIStore } from '../../stores/uiStore'
import { decodeDepth } from '../../constants'

const PC_MAX_W = 256
const PC_MAX_H = 192
const PC_MAX_POINTS = PC_MAX_W * PC_MAX_H

/**
 * Point cloud rendered from depth video frames.
 *
 * Requires external code to decode depth/rgb video frames and provide
 * ImageData via the shared refs. This component handles the 3D rendering:
 * reading depth values, unprojecting to world space, and coloring from RGB.
 */
export const depthFrameRef: { current: ImageData | null; width: number; height: number } = {
  current: null,
  width: 0,
  height: 0,
}

export const rgbFrameRef: { current: ImageData | null; width: number; height: number; canvas: HTMLCanvasElement | null } = {
  current: null,
  width: 0,
  height: 0,
  canvas: null,
}

// Temp vectors
const _camQuat = new THREE.Quaternion()
const _camPos = new THREE.Vector3()
const _localPt = new THREE.Vector3()

export function PointCloud() {
  const pointsRef = useRef<THREE.Points>(null)
  const showPointCloud = useUIStore(s => s.showPointCloud)
  const pointDensity = useUIStore(s => s.pointDensity)
  const depthZScale = useUIStore(s => s.depthZScale)
  const pointAlpha = useUIStore(s => s.pointAlpha)
  const frames = useSessionStore(s => s.frames)
  const intrinsics = useSessionStore(s => s.intrinsics)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)

  const positions = useMemo(() => new Float32Array(PC_MAX_POINTS * 3), [])
  const colors = useMemo(() => new Float32Array(PC_MAX_POINTS * 3), [])

  useFrame(() => {
    const points = pointsRef.current
    if (!points) return

    if (!showPointCloud || !intrinsics || frames.length === 0 || !depthFrameRef.current) {
      points.visible = false
      return
    }

    const frame = frames[frameIdx]
    if (!frame?.sensor) {
      points.visible = false
      return
    }

    const depthImg = depthFrameRef.current
    const dW = depthFrameRef.width
    const dH = depthFrameRef.height

    // Intrinsics are landscape, depth video is portrait — swap axes
    const natDepthW = dH
    const natScale = natDepthW / intrinsics.resW
    const fx = intrinsics.fy * natScale
    const fy = intrinsics.fx * natScale
    const cx = intrinsics.cy * natScale
    const cy = intrinsics.cx * natScale

    const rgbImg = rgbFrameRef.current
    const rgbW = rgbFrameRef.width
    const rgbH = rgbFrameRef.height

    const s = frame.sensor
    _camQuat.set(s.rot.x, s.rot.y, s.rot.z, s.rot.w)
    _camPos.set(s.pos.x, s.pos.y, s.pos.z)

    const posAttr = points.geometry.attributes.position as THREE.BufferAttribute
    const colAttr = points.geometry.attributes.color as THREE.BufferAttribute
    const step = pointDensity
    let idx = 0

    for (let py = 0; py < dH; py += step) {
      for (let px = 0; px < dW; px += step) {
        const di = (py * dW + px) * 4
        const val = depthImg.data[di]
        if (val === 0) continue
        const depth = decodeDepth(val) * depthZScale

        // Unproject in portrait camera-local space
        const lx = -(px - cx) / fx * depth
        const ly = -(py - cy) / fy * depth
        const lz = depth
        _localPt.set(lx, ly, lz)

        _localPt.applyQuaternion(_camQuat)
        _localPt.add(_camPos)

        posAttr.setXYZ(idx, _localPt.x, _localPt.y, _localPt.z)

        if (rgbImg && rgbW > 0 && rgbH > 0) {
          const rgbPx = Math.floor(px / dW * rgbW)
          const rgbPy = Math.floor(py / dH * rgbH)
          const ri = (rgbPy * rgbW + rgbPx) * 4
          colAttr.setXYZ(idx, rgbImg.data[ri] / 255, rgbImg.data[ri + 1] / 255, rgbImg.data[ri + 2] / 255)
        } else {
          const t = Math.min(1, depth / 5)
          colAttr.setXYZ(idx, t, 0.2, 1 - t)
        }

        idx++
        if (idx >= PC_MAX_POINTS) break
      }
      if (idx >= PC_MAX_POINTS) break
    }

    points.geometry.setDrawRange(0, idx)
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
    points.visible = idx > 0

    // Update opacity
    ;(points.material as THREE.PointsMaterial).opacity = pointAlpha
  })

  return (
    <points ref={pointsRef} visible={false} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.005}
        sizeAttenuation
        vertexColors
        depthTest={false}
        transparent
        opacity={pointAlpha}
      />
    </points>
  )
}
