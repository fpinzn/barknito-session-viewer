import { Canvas } from '@react-three/fiber'
import { BaseScene } from './environment/BaseScene'
import { Skeleton3D } from './skeleton/Skeleton3D'
import { Skeleton2D } from './skeleton/Skeleton2D'
import { Frustum } from './environment/Frustum'
import { CameraTrail } from './environment/CameraTrail'
import { PointCloud } from './environment/PointCloud'
import { ARPlanes } from './environment/ARPlanes'
import { PawFloorProjection } from './environment/PawFloorProjection'
import { PlaybackEngine } from '../features/viewer/PlaybackEngine'
import { SceneRenderer } from './scenes/SceneRenderer'

export function SceneCanvas() {
  return (
    <Canvas
      camera={{
        position: [0.5, 0.5, 1.5],
        up: [0, 1, 0],
        fov: 50,
        near: 0.01,
        far: 100,
      }}
      gl={{ antialias: true }}
      style={{ background: '#111' }}
    >
      <BaseScene />
      <Skeleton3D />
      <Skeleton2D />
      <Frustum />
      <CameraTrail />
      <PointCloud />
      <ARPlanes />
      <PawFloorProjection />
      <SceneRenderer />
      <PlaybackEngine />
    </Canvas>
  )
}
