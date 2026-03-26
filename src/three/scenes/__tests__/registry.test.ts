import { describe, it, expect } from 'vitest'
import { getScenePlugin, registerScenePlugin } from '../registry'

describe('scene registry', () => {
  it('returns undefined for unknown sceneId', () => {
    expect(getScenePlugin('nonexistent')).toBeUndefined()
  })
  it('returns registered plugin', () => {
    registerScenePlugin('test-scene', {
      Component: () => null,
      configLoader: async () => ({}),
    })
    const plugin = getScenePlugin('test-scene')
    expect(plugin).toBeDefined()
    expect(plugin!.Component).toBeDefined()
  })
})
