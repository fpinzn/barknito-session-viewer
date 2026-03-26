import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'

const MAX_TRAIL = 4000

export function CameraTrail() {
  const lineRef = useRef<THREE.Line>(null)
  const frames = useSessionStore(s => s.frames)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)

  const positions = useMemo(() => new Float32Array(MAX_TRAIL * 3), [])

  const lineObj = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.LineBasicMaterial({ color: 0xff6644, opacity: 0.3, transparent: true })
    const line = new THREE.Line(geometry, material)
    line.visible = false
    line.frustumCulled = false
    return line
  }, [positions])

  useEffect(() => {
    lineRef.current = lineObj
    return () => {
      lineObj.geometry.dispose()
      ;(lineObj.material as THREE.Material).dispose()
    }
  }, [lineObj])

  useFrame(() => {
    const line = lineRef.current
    if (!line) return

    if (frames.length === 0) {
      line.visible = false
      return
    }

    let count = 0
    for (let i = 0; i <= frameIdx && i < frames.length && count < MAX_TRAIL; i++) {
      const sf = frames[i].sensor
      if (!sf) continue
      const idx = count * 3
      positions[idx] = sf.pos.x
      positions[idx + 1] = sf.pos.y
      positions[idx + 2] = sf.pos.z
      count++
    }

    if (count === 0) {
      line.visible = false
      return
    }

    line.visible = true
    const posAttr = line.geometry.attributes.position as THREE.BufferAttribute
    posAttr.needsUpdate = true
    line.geometry.setDrawRange(0, count)
  })

  return <primitive object={lineObj} />
}
