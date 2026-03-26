import { registerScenePlugin } from '../registry'
import { Scene03Target } from './Scene03Target'
import { loadScene03Config } from './loader'

registerScenePlugin('03_TargetSpawningObjects', {
  Component: Scene03Target,
  configLoader: loadScene03Config,
})
