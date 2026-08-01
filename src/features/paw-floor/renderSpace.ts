import * as THREE from 'three'
import type { Vec3 } from './geometry'

interface Quat { x: number; y: number; z: number; w: number }

// Scratch objects — this runs per drawn point, per frame.
const _p = new THREE.Vector3()
const _camP = new THREE.Vector3()
const _camQ = new THREE.Quaternion()
const _invQ = new THREE.Quaternion()

/**
 * Put a raw AR world point into the space this scene actually draws in.
 *
 * The viewer renders every AR-derived point with X mirrored in the *camera's*
 * local frame, compensating the video's rotation. `ARPlane` does this explicitly
 * per boundary vertex, `unproject` bakes the same flip into its `-(px - pcx)`
 * term for skeleton points, and `Frustum` says so in a comment. Anything drawn
 * without it lands in a different space from the plane — and because the
 * transform depends on camera pose, the discrepancy drifts as the camera moves.
 *
 * `CameraTrail` needs no mirror because the camera position is a fixed point of
 * a mirror about its own axis.
 *
 * Analysis stays in raw AR space, where the geometry is physically true; only
 * presentation passes through here.
 */
export function mirrorAboutCamera(point: Vec3, camPos: Vec3, camRot: Quat): Vec3 {
  _p.set(point.x, point.y, point.z)
  _camP.set(camPos.x, camPos.y, camPos.z)
  _camQ.set(camRot.x, camRot.y, camRot.z, camRot.w)
  _invQ.copy(_camQ).invert()

  _p.sub(_camP)
  _p.applyQuaternion(_invQ)
  _p.x = -_p.x
  _p.applyQuaternion(_camQ)
  _p.add(_camP)

  return { x: _p.x, y: _p.y, z: _p.z }
}
