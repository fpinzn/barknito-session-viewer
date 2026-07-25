import { useRef, useEffect, useCallback } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'
import { depthFrameRef, rgbFrameRef } from '../../three/environment/PointCloud'
import { computeVideoStartOffsetMs, mediaTimeForSession, sessionTimelineLastMsForFrames } from './video-timing'

const DRIFT_THRESHOLD_MS = 150
const AUDIO_VOLUME = 0.5

function destroyMediaElement(el: HTMLMediaElement) {
  el.pause()
  el.removeAttribute('src')
  el.load()
  el.remove()
}

function prepareOffscreenMediaElement(el: HTMLMediaElement) {
  el.style.position = 'fixed'
  el.style.left = '-10000px'
  el.style.top = '0'
  el.style.width = '1px'
  el.style.height = '1px'
  el.style.opacity = '0'
  el.style.pointerEvents = 'none'
}

export function useVideoSync() {
  const rgbVideoRef = useRef<HTMLVideoElement | null>(null)
  const depthVideoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rgbCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const depthCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const videoUrl = useSessionStore(s => s.videoUrl)
  const depthVideoUrl = useSessionStore(s => s.depthVideoUrl)
  const audioUrl = useSessionStore(s => s.audioUrl)
  const sessionMeta = useSessionStore(s => s.sessionMeta)
  const frames = useSessionStore(s => s.frames)
  const setVideoStartOffsetMs = useSessionStore(s => s.setVideoStartOffsetMs)
  const setVideoDurationMs = useSessionStore(s => s.setVideoDurationMs)

  function drawRgbFrame() {
    const canvas = rgbCanvasRef.current
    const el = rgbVideoRef.current
    if (!canvas || !el) return
    if (el.readyState < 2) return
    if (canvas.width === 0 || canvas.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    rgbFrameRef.current = imgData
    rgbFrameRef.width = canvas.width
    rgbFrameRef.height = canvas.height
  }

  function drawDepthFrame() {
    const canvas = depthCanvasRef.current
    const el = depthVideoRef.current
    if (!canvas || !el) return
    if (el.readyState < 2) return
    if (canvas.width === 0 || canvas.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    depthFrameRef.current = imgData
    depthFrameRef.width = canvas.width
    depthFrameRef.height = canvas.height
  }

  function clearRgbFrame() {
    rgbFrameRef.current = null
    rgbFrameRef.width = 0
    rgbFrameRef.height = 0
  }

  function clearDepthFrame() {
    depthFrameRef.current = null
    depthFrameRef.width = 0
    depthFrameRef.height = 0
  }

  // RGB video
  useEffect(() => {
    if (rgbVideoRef.current) {
      destroyMediaElement(rgbVideoRef.current)
      rgbVideoRef.current = null
      rgbCanvasRef.current = null
      clearRgbFrame()
      rgbFrameRef.canvas = null
    }

    if (!videoUrl) return

    const el = document.createElement('video')
    el.muted = true
    el.playsInline = true
    el.preload = 'auto'
    prepareOffscreenMediaElement(el)
    document.body.appendChild(el)
    rgbVideoRef.current = el

    const canvas = document.createElement('canvas')
    rgbCanvasRef.current = canvas
    rgbFrameRef.canvas = canvas

    el.addEventListener('loadedmetadata', () => {
      canvas.width = el.videoWidth
      canvas.height = el.videoHeight
      const timelineLastMs = sessionTimelineLastMsForFrames(useSessionStore.getState().frames)
      const offsetMs = computeVideoStartOffsetMs(sessionMeta, el.duration, timelineLastMs)
      setVideoStartOffsetMs(offsetMs)
      setVideoDurationMs(Math.round(el.duration * 1000))

      const frames = useSessionStore.getState().frames
      if (frames.length > 0) {
        const targetSessionTs = offsetMs
        usePlaybackStore.getState().seekTo(targetSessionTs)
      }
    })
    el.addEventListener('loadeddata', drawRgbFrame)
    el.addEventListener('seeked', drawRgbFrame)

    let cancelled = false
    if ('requestVideoFrameCallback' in el) {
      const onFrame = () => {
        if (cancelled) return
        drawRgbFrame()
        el.requestVideoFrameCallback(onFrame)
      }
      el.requestVideoFrameCallback(onFrame)
    }

    el.src = videoUrl

    return () => {
      cancelled = true
      destroyMediaElement(el)
      rgbVideoRef.current = null
      rgbCanvasRef.current = null
      clearRgbFrame()
      rgbFrameRef.canvas = null
      setVideoStartOffsetMs(0)
      setVideoDurationMs(0)
    }
  }, [sessionMeta, setVideoDurationMs, setVideoStartOffsetMs, videoUrl])

  useEffect(() => {
    const el = rgbVideoRef.current
    if (!el || !isFinite(el.duration) || el.duration <= 0) return

    const timelineLastMs = sessionTimelineLastMsForFrames(frames)
    const offsetMs = computeVideoStartOffsetMs(sessionMeta, el.duration, timelineLastMs)
    setVideoStartOffsetMs(offsetMs)
    setVideoDurationMs(Math.round(el.duration * 1000))
  }, [frames, sessionMeta, setVideoDurationMs, setVideoStartOffsetMs])

  // Depth video
  useEffect(() => {
    if (depthVideoRef.current) {
      destroyMediaElement(depthVideoRef.current)
      depthVideoRef.current = null
      depthCanvasRef.current = null
      clearDepthFrame()
    }

    if (!depthVideoUrl) return

    const el = document.createElement('video')
    el.muted = true
    el.playsInline = true
    el.preload = 'auto'
    prepareOffscreenMediaElement(el)
    document.body.appendChild(el)
    depthVideoRef.current = el

    const canvas = document.createElement('canvas')
    depthCanvasRef.current = canvas

    el.addEventListener('loadedmetadata', () => {
      canvas.width = el.videoWidth
      canvas.height = el.videoHeight
    })
    el.addEventListener('loadeddata', drawDepthFrame)
    el.addEventListener('seeked', drawDepthFrame)

    let cancelled = false
    if ('requestVideoFrameCallback' in el) {
      const onFrame = () => {
        if (cancelled) return
        drawDepthFrame()
        el.requestVideoFrameCallback(onFrame)
      }
      el.requestVideoFrameCallback(onFrame)
    }

    el.src = depthVideoUrl

    return () => {
      cancelled = true
      destroyMediaElement(el)
      depthVideoRef.current = null
      depthCanvasRef.current = null
      clearDepthFrame()
    }
  }, [depthVideoUrl])

  // Audio
  useEffect(() => {
    if (audioRef.current) {
      destroyMediaElement(audioRef.current)
      audioRef.current = null
    }

    if (!audioUrl) return

    const el = document.createElement('audio')
    el.preload = 'auto'
    prepareOffscreenMediaElement(el)
    document.body.appendChild(el)
    audioRef.current = el
    el.src = audioUrl

    return () => {
      destroyMediaElement(el)
      audioRef.current = null
    }
  }, [audioUrl])

  /**
   * Per-tick sync: mirrors play/pause and speed to video + audio elements,
   * and drift-corrects when an element's currentTime diverges from the
   * frame-derived target time by more than DRIFT_THRESHOLD_MS.
   *
   * Natural playback (small per-tick advances) does NOT trigger a seek — the
   * elements play freely via .play(). User scrubs (large frame jumps) exceed
   * the threshold and re-sync via currentTime assignment.
   *
   * Mirrors the `ReplayVideoBackground` pattern from the Unity replayer.
   */
  const syncMedia = useCallback((sessionTimeMs: number, isPlaying: boolean, speed: number) => {
    const sessionTimeSec = Math.max(0, sessionTimeMs / 1000)
    const videoStartOffsetSec = useSessionStore.getState().videoStartOffsetMs / 1000

    const syncEl = (el: HTMLMediaElement | null, canPlayWithoutGesture: boolean) => {
      if (!el) return
      const isBeforeVisibleStart = sessionTimeSec < videoStartOffsetSec

      if (isBeforeVisibleStart) {
        if (!el.paused) {
          el.pause()
        }
        if (!el.seeking && el.readyState >= 1) {
          const base = el.seekable.length > 0 ? el.seekable.start(0) : 0
          if (el.currentTime !== base) {
            el.currentTime = base
          }
        }
        return
      }

      if (isPlaying) {
        if (el.paused && (canPlayWithoutGesture || el.readyState >= 2)) {
          el.play().catch(() => { /* play() may reject during concurrent seek */ })
        }
        if (el.playbackRate !== speed) el.playbackRate = speed
      } else if (!el.paused) {
        el.pause()
      }
      // Skip drift correction while a seek is in flight — back-to-back
      // currentTime writes cancel each other and the video never settles.
      if (!el.seeking && el.readyState >= 1 && isFinite(el.duration)) {
        const target = mediaTimeForSession(el, sessionTimeSec, videoStartOffsetSec)
        const driftMs = Math.abs(el.currentTime - target) * 1000
        if (driftMs > DRIFT_THRESHOLD_MS) {
          el.currentTime = target
        }
      }
    }

    syncEl(rgbVideoRef.current, true)
    if (rgbVideoRef.current && rgbVideoRef.current.readyState >= 2 && !rgbVideoRef.current.seeking) {
      drawRgbFrame()
    }

    syncEl(depthVideoRef.current, true)
    if (depthVideoRef.current && depthVideoRef.current.readyState >= 2 && !depthVideoRef.current.seeking) {
      drawDepthFrame()
    }

    const audio = audioRef.current
    if (audio) {
      if (isPlaying && audio.paused && audio.readyState >= 2) {
        audio.volume = AUDIO_VOLUME
      }
      syncEl(audio, false)
    }
  }, [])

  return { syncMedia }
}
