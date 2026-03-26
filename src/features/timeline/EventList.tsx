import { useCallback } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'

function formatEventType(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function EventList() {
  const gameEvents = useSessionStore(s => s.gameEvents)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const frames = useSessionStore(s => s.frames)

  const handleClick = useCallback((idx: number) => {
    usePlaybackStore.getState().jumpToEvent(idx)
  }, [])

  if (gameEvents.length === 0) return null

  const currentTs = frames[frameIdx]?.ts ?? 0

  return (
    <div className="event-list">
      <h3>Events</h3>
      <div className="event-list-items">
        {gameEvents.map((evt, idx) => {
          const delta = currentTs - evt.timestampMs
          const isCurrent = delta >= 0 && delta < 1000
          const isPast = delta >= 1000

          return (
            <button
              key={idx}
              className={`event-list-item${isCurrent ? ' current' : ''}${isPast ? ' past' : ''}`}
              onClick={() => handleClick(idx)}
            >
              <span className="event-type">{formatEventType(evt.type)}</span>
              <span className="event-time">{(evt.timestampMs / 1000).toFixed(2)}s</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
