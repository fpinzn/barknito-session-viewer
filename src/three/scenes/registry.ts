import type { ComponentType } from 'react'

export interface ScenePlugin {
  Component: ComponentType<{ config: unknown; events: unknown[] }>
  configLoader: (raw: unknown) => Promise<unknown>
}

const plugins = new Map<string, ScenePlugin>()

export function registerScenePlugin(sceneId: string, plugin: ScenePlugin) {
  plugins.set(sceneId, plugin)
}

export function getScenePlugin(sceneId: string): ScenePlugin | undefined {
  return plugins.get(sceneId)
}
