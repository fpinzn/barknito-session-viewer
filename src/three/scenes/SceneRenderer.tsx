import { useMemo } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { getScenePlugin } from './registry'

export function SceneRenderer() {
  const sessionMeta = useSessionStore(s => s.sessionMeta)
  const gameConfig = useSessionStore(s => s.gameConfig)
  const gameEvents = useSessionStore(s => s.gameEvents)

  const sceneId = sessionMeta?.sceneId

  const plugin = useMemo(() => {
    if (!sceneId) return null
    return getScenePlugin(sceneId) ?? null
  }, [sceneId])

  if (!plugin) return null

  const { Component } = plugin

  return <Component config={gameConfig} events={gameEvents} />
}
