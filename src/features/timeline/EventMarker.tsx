import { useCallback } from 'react'
import { usePlaybackStore } from '../../stores/playbackStore'

interface EventMarkerProps {
  eventIdx: number
  pct: number
  label: string
  reached: boolean
}

export function EventMarker({ eventIdx, pct, label, reached }: EventMarkerProps) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    usePlaybackStore.getState().jumpToEvent(eventIdx)
  }, [eventIdx])

  return (
    <div
      className={`event-marker${reached ? ' reached' : ''}`}
      style={{ left: `${pct}%` }}
      onClick={handleClick}
      title={label}
    >
      <span className="event-label">{label}</span>
    </div>
  )
}
