import { TrackballControls, Text } from '@react-three/drei'
import { Grid } from './Grid'

export function BaseScene() {
  return (
    <>
      <Grid />
      <axesHelper args={[0.3]} />
      <Text position={[0.33, 0, 0]} fontSize={0.02} color={0xff0000} anchorX="left">+X</Text>
      <Text position={[0, 0.33, 0]} fontSize={0.02} color={0x00ff00} anchorX="center">+Y</Text>
      <Text position={[0, 0, 0.33]} fontSize={0.02} color={0x0066ff} anchorX="left">+Z</Text>
      <ambientLight intensity={0.5} />
      <TrackballControls
        makeDefault
        rotateSpeed={3.0}
        panSpeed={1.0}
        zoomSpeed={1.5}
        staticMoving={false}
        dynamicDampingFactor={0.15}
      />
    </>
  )
}
