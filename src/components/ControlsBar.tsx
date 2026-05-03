import { useCallback, useMemo, useRef, useState } from 'react'
import { usePlaybackStore } from '../stores/playbackStore'
import { useSessionStore } from '../stores/sessionStore'
import { useUIStore } from '../stores/uiStore'
import { EventMarker } from '../features/timeline/EventMarker'
import { sessionTimeForVisibleTimeMs, visibleTimeForFrameMs, visibleTimeForSessionTimeMs } from '../features/viewer/video-timing'

export function ControlsBar() {
  const isPlaying = usePlaybackStore(s => s.isPlaying)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)
  const currentSessionTimeMs = usePlaybackStore(s => s.currentSessionTimeMs)
  const currentVisibleTimeMs = usePlaybackStore(s => s.currentVisibleTimeMs)
  const playbackSpeed = usePlaybackStore(s => s.playbackSpeed)
  const frames = useSessionStore(s => s.frames)
  const gameEvents = useSessionStore(s => s.gameEvents)
  const videoStartOffsetMs = useSessionStore(s => s.videoStartOffsetMs)
  const videoDurationMs = useSessionStore(s => s.videoDurationMs)
  const totalFrames = frames.length

  const [volume, setVolume] = useState(0.5)
  const [muted, setMuted] = useState(false)
  const progressRef = useRef<HTMLDivElement>(null)

  const lastVisibleFrameMs = totalFrames > 1
    ? visibleTimeForFrameMs(frames, totalFrames - 1, videoStartOffsetMs)
    : 0
  const visibleRangeMs = Math.max(1, videoDurationMs, lastVisibleFrameMs)
  const pct = (currentVisibleTimeMs / visibleRangeMs) * 100

  const handlePlayPause = useCallback(() => {
    usePlaybackStore.getState().togglePlay()
  }, [])

  const handlePrev = useCallback(() => {
    usePlaybackStore.getState().prevFrame()
  }, [])

  const handleNext = useCallback(() => {
    usePlaybackStore.getState().nextFrame()
  }, [])

  const seekFromEvent = useCallback((clientX: number) => {
    const wrap = progressRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const sessionTimeMs = sessionTimeForVisibleTimeMs(frames, p * visibleRangeMs, videoStartOffsetMs)
    usePlaybackStore.getState().seekTo(sessionTimeMs)
  }, [frames, videoStartOffsetMs, visibleRangeMs])

  const handleProgressClick = useCallback((e: React.MouseEvent) => {
    seekFromEvent(e.clientX)
  }, [seekFromEvent])

  const handleMouseDown = useCallback(() => {
    const handleMouseMove = (e: MouseEvent) => seekFromEvent(e.clientX)
    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [seekFromEvent])

  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    usePlaybackStore.getState().setPlaybackSpeed(parseFloat(e.target.value))
  }, [])

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value))
  }, [])

  const handleMuteToggle = useCallback(() => {
    setMuted(m => !m)
  }, [])

  const handleHome = useCallback(() => {
    useSessionStore.getState().reset()
    usePlaybackStore.getState().reset()
    const url = new URL(window.location.href)
    url.searchParams.delete('folder')
    window.history.pushState({}, '', url)
    useUIStore.getState().setActivePanel('gcs')
  }, [])

  const currentTs = currentSessionTimeMs
  const range = Math.max(1, visibleRangeMs)

  const eventMarkers = useMemo(() => {
    if (range <= 0 || gameEvents.length === 0) return []
    return gameEvents.map((evt, idx) => {
      const markerPct = (visibleTimeForSessionTimeMs(frames, evt.timestampMs, videoStartOffsetMs) / range) * 100
      if (markerPct < 0 || markerPct > 100) return null
      const name = evt.type.replace(/([a-z])([A-Z])/g, '$1 $2')
      return { idx, pct: markerPct, label: name, ts: evt.timestampMs }
    }).filter((m): m is NonNullable<typeof m> => m !== null)
  }, [frames, gameEvents, range, videoStartOffsetMs])

  return (
    <div className={`controls-bar${totalFrames > 0 ? '' : ' hidden'}`}>
      <button onClick={handleHome} title="Back to browser">
        {'\u2302'}
      </button>
      <button
        onClick={handlePlayPause}
        className={isPlaying ? 'active' : ''}
      >
        {isPlaying ? '\u23F8' : '\u25B6'}
      </button>
      <button onClick={handlePrev} title="Previous frame">{'\u25C0\u25C0'}</button>
      <button onClick={handleNext} title="Next frame">{'\u25B6\u25B6'}</button>

      <div
        className="progress-wrap"
        ref={progressRef}
        onClick={handleProgressClick}
        onMouseDown={handleMouseDown}
      >
        <div className="progress-bar" style={{ width: `${pct}%` }} />
        <div className="progress-thumb" style={{ left: `${pct}%` }} />
        {eventMarkers.map(m => {
          const delta = currentTs - m.ts
          const reached = delta >= 0 && delta < 1000
          return (
            <EventMarker
              key={m.idx}
              eventIdx={m.idx}
              pct={m.pct}
              label={m.label}
              reached={reached}
            />
          )
        })}
        <span className="progress-label">
          {frameIdx + 1} / {totalFrames}
        </span>
      </div>

      <div className="volume-group">
        <button className="btn-mute" onClick={handleMuteToggle} title="Mute/unmute">
          {muted ? '\uD83D\uDD07' : '\uD83D\uDD08'}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={muted ? 0 : volume}
          onChange={handleVolumeChange}
        />
      </div>

      <div className="speed-group">
        <label>Speed</label>
        <select value={playbackSpeed} onChange={handleSpeedChange}>
          <option value="0.25">0.25x</option>
          <option value="0.5">0.5x</option>
          <option value="1">1x</option>
          <option value="2">2x</option>
          <option value="4">4x</option>
        </select>
      </div>
    </div>
  )
}
