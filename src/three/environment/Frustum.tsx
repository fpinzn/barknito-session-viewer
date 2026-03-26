import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useUIStore } from '../../stores/uiStore'
import { rgbFrameRef } from './PointCloud'
import type { Intrinsics } from '../../types'

function buildFrustumVerts(
  nearW: number, nearH: number,
  farW: number, farH: number, farD: number,
): Float32Array {
  const nw = nearW, nh = nearH
  const fw = farW, fh = farH, fd = farD
  return new Float32Array([
    // Near plane
    -nw, -nh, 0, nw, -nh, 0,
    nw, -nh, 0, nw, nh, 0,
    nw, nh, 0, -nw, nh, 0,
    -nw, nh, 0, -nw, -nh, 0,
    // Far plane
    -fw, -fh, fd, fw, -fh, fd,
    fw, -fh, fd, fw, fh, fd,
    fw, fh, fd, -fw, fh, fd,
    -fw, fh, fd, -fw, -fh, fd,
    // Connecting edges
    -nw, -nh, 0, -fw, -fh, fd,
    nw, -nh, 0, fw, -fh, fd,
    nw, nh, 0, fw, fh, fd,
    -nw, nh, 0, -fw, fh, fd,
  ])
}

function computeFrustumDims(intrinsics: Intrinsics | null) {
  const frustumD = 0.3
  if (!intrinsics) {
    return {
      nearW: 0.02, nearH: 0.03,
      farW: 0.04, farH: 0.06,
      frustumD: 0.08,
    }
  }
  // Intrinsics are landscape (resW > resH), but video is portrait — swap W↔H
  const farW = frustumD * (intrinsics.resH / 2) / intrinsics.fy
  const farH = frustumD * (intrinsics.resW / 2) / intrinsics.fx
  const nearD = 0.02
  const nearW = nearD * (intrinsics.resH / 2) / intrinsics.fy
  const nearH = nearD * (intrinsics.resW / 2) / intrinsics.fx
  return { nearW, nearH, farW, farH, frustumD }
}

const AXIS_LEN = 0.08

// Temp vectors for follow-cam
const _camQuat = new THREE.Quaternion()
const _followTarget = new THREE.Vector3()

export function Frustum() {
  const groupRef = useRef<THREE.Group>(null)
  const texPlaneRef = useRef<THREE.Mesh>(null)
  const intrinsics = useSessionStore(s => s.intrinsics)
  const frames = useSessionStore(s => s.frames)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const followCam = useUIStore(s => s.followCam)
  const videoAlpha = useUIStore(s => s.videoAlpha)
  const prevFollowCam = useRef(followCam)
  const { camera } = useThree()
  const controls = useThree(s => s.controls) as any

  const dims = useMemo(() => computeFrustumDims(intrinsics), [intrinsics])

  // Offscreen canvas + texture for frustum video overlay
  const { frustumCanvas, frustumCtx, frustumTexture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 960
    const ctx = canvas.getContext('2d', { willReadFrequently: false })!
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    return { frustumCanvas: canvas, frustumCtx: ctx, frustumTexture: texture }
  }, [])

  const frustumVerts = useMemo(
    () => buildFrustumVerts(dims.nearW, dims.nearH, dims.farW, dims.farH, dims.frustumD),
    [dims],
  )

  const axisLines = useMemo(() => {
    const makeAxis = (verts: Float32Array, color: number) => {
      const geom = new THREE.BufferGeometry()
      geom.setAttribute('position', new THREE.BufferAttribute(verts, 3))
      return new THREE.Line(geom, new THREE.LineBasicMaterial({ color }))
    }
    return {
      x: makeAxis(new Float32Array([0, 0, 0, AXIS_LEN, 0, 0]), 0xff0000),
      y: makeAxis(new Float32Array([0, 0, 0, 0, AXIS_LEN, 0]), 0x00ff00),
      z: makeAxis(new Float32Array([0, 0, 0, 0, 0, AXIS_LEN]), 0x0066ff),
    }
  }, [])

  useFrame(() => {
    const group = groupRef.current
    if (!group || frames.length === 0) {
      if (group) group.visible = false
      return
    }

    const frame = frames[frameIdx]
    if (!frame?.sensor) {
      group.visible = false
      return
    }

    const s = frame.sensor
    group.visible = true
    group.position.set(s.pos.x, s.pos.y, s.pos.z)
    group.quaternion.set(s.rot.x, s.rot.y, s.rot.z, s.rot.w)

    // Update frustum texture plane from RGB video frame
    const texPlane = texPlaneRef.current
    if (texPlane) {
      if (rgbFrameRef.current && rgbFrameRef.canvas) {
        // Draw mirrored: video rotation (M_PI_2) mirrors x relative to camera frame
        frustumCtx.save()
        frustumCtx.translate(frustumCanvas.width, 0)
        frustumCtx.scale(-1, 1)
        frustumCtx.drawImage(
          rgbFrameRef.canvas!,
          0, 0, frustumCanvas.width, frustumCanvas.height,
        )
        frustumCtx.restore()
        frustumTexture.needsUpdate = true
        texPlane.visible = true
      } else {
        texPlane.visible = false
      }
    }

    // Follow-cam: disable controls input and explicitly set camera orientation
    if (followCam) {
      if (controls) {
        controls.enabled = false
        controls.noRotate = true
        controls.noPan = true
        controls.noZoom = true
      }

      _camQuat.set(s.rot.x, s.rot.y, s.rot.z, s.rot.w)
      camera.up.set(0, 1, 0).applyQuaternion(_camQuat)

      const halfFovY = (camera as THREE.PerspectiveCamera).fov / 2 * Math.PI / 180
      const aspect = (camera as THREE.PerspectiveCamera).aspect
      const needDist = Math.max(
        dims.farH / Math.tan(halfFovY),
        dims.farW / (Math.tan(halfFovY) * aspect),
      )
      const pullBack = Math.max(0, needDist - dims.frustumD) + 0.02

      _followTarget.set(0, 0, -pullBack)
      _followTarget.applyQuaternion(_camQuat)
      _followTarget.add(group.position)
      camera.position.copy(_followTarget)

      // Compute look target at the far frustum plane
      _followTarget.set(0, 0, dims.frustumD)
      _followTarget.applyQuaternion(_camQuat)
      _followTarget.add(group.position)

      if (controls) {
        controls.target.copy(_followTarget)
      }

      // Explicitly set camera rotation — prevents one-frame lag from controls.lookAt
      camera.lookAt(_followTarget)
    }

    // Restore controls when follow-cam is toggled off
    if (prevFollowCam.current && !followCam) {
      camera.up.set(0, 1, 0)
      if (controls) {
        controls.enabled = true
        controls.noRotate = false
        controls.noPan = false
        controls.noZoom = false
      }
    }
    prevFollowCam.current = followCam
  })

  return (
    <group ref={groupRef} visible={false}>
      {/* Wireframe frustum */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[frustumVerts, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={0xff6644} />
      </lineSegments>

      {/* Frustum texture plane (video overlay) */}
      <mesh ref={texPlaneRef} position={[0, 0, dims.frustumD * 0.99]} visible={false}>
        <planeGeometry args={[dims.farW * 2, dims.farH * 2]} />
        <meshBasicMaterial
          map={frustumTexture}
          transparent
          opacity={videoAlpha}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Phone dot */}
      <mesh>
        <sphereGeometry args={[0.001, 6, 6]} />
        <meshBasicMaterial color={0xff6644} transparent opacity={0.5} />
      </mesh>

      {/* Axis arrows + labels */}
      <primitive object={axisLines.x} />
      <primitive object={axisLines.y} />
      <primitive object={axisLines.z} />
      <Text position={[AXIS_LEN + 0.008, 0, 0]} fontSize={0.01} color={0xff0000} anchorX="left">+X</Text>
      <Text position={[0, AXIS_LEN + 0.008, 0]} fontSize={0.01} color={0x00ff00} anchorX="center">+Y</Text>
      <Text position={[0, 0, AXIS_LEN + 0.008]} fontSize={0.01} color={0x0066ff} anchorX="left">+Z</Text>
    </group>
  )
}
