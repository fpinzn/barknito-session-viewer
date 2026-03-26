import { useRef, useEffect, useCallback } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { depthFrameRef, rgbFrameRef } from '../../three/environment/PointCloud'

/**
 * Compute the video time (seconds) for a given frame index.
 * Session-relative recordings have small timestamps (< 5 min) and video
 * PTS starting at 0. Legacy boot-time recordings have large absolute
 * timestamps and need the first timestamp subtracted.
 */
function videoTimeForFrame(frames: Array<{ ts: number }>, frameIdx: number, videoT0Ref: { current: number | null }): number {
  if (frames.length === 0 || frameIdx >= frames.length) return 0

  if (videoT0Ref.current === null) {
    for (const f of frames) {
      if (f.ts > 0) { videoT0Ref.current = f.ts; break }
    }
    if (videoT0Ref.current === null) return 0
    if (videoT0Ref.current < 300000) videoT0Ref.current = 0
  }

  return Math.max(0, (frames[frameIdx].ts - videoT0Ref.current) / 1000)
}

export function useVideoSync() {
  const rgbVideoRef = useRef<HTMLVideoElement | null>(null)
  const depthVideoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rgbCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const depthCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoT0Ref = useRef<number | null>(null)

  const videoUrl = useSessionStore(s => s.videoUrl)
  const depthVideoUrl = useSessionStore(s => s.depthVideoUrl)
  const audioUrl = useSessionStore(s => s.audioUrl)

  function drawRgbFrame() {
    const canvas = rgbCanvasRef.current
    const el = rgbVideoRef.current
    if (!canvas || !el) return
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
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    depthFrameRef.current = imgData
    depthFrameRef.width = canvas.width
    depthFrameRef.height = canvas.height
  }

  // Create/update video elements
  useEffect(() => {
    if (videoUrl) {
      if (!rgbVideoRef.current) {
        const el = document.createElement('video')
        el.muted = true
        el.playsInline = true
        el.style.display = 'none'
        document.body.appendChild(el)
        rgbVideoRef.current = el

        const canvas = document.createElement('canvas')
        rgbCanvasRef.current = canvas
        rgbFrameRef.canvas = canvas

        el.addEventListener('loadedmetadata', () => {
          canvas.width = el.videoWidth
          canvas.height = el.videoHeight
        })

        el.addEventListener('seeked', drawRgbFrame)
      }
      rgbVideoRef.current.src = videoUrl
    }
  }, [videoUrl])

  useEffect(() => {
    if (depthVideoUrl) {
      if (!depthVideoRef.current) {
        const el = document.createElement('video')
        el.muted = true
        el.playsInline = true
        el.style.display = 'none'
        document.body.appendChild(el)
        depthVideoRef.current = el

        const canvas = document.createElement('canvas')
        depthCanvasRef.current = canvas

        el.addEventListener('loadedmetadata', () => {
          canvas.width = el.videoWidth
          canvas.height = el.videoHeight
        })

        el.addEventListener('seeked', drawDepthFrame)
      }
      depthVideoRef.current.src = depthVideoUrl
    }
  }, [depthVideoUrl])

  useEffect(() => {
    if (audioUrl) {
      if (!audioRef.current) {
        const el = document.createElement('audio')
        el.style.display = 'none'
        document.body.appendChild(el)
        audioRef.current = el
      }
      audioRef.current.src = audioUrl
    }
  }, [audioUrl])

  const seekToFrame = useCallback((frameIdx: number) => {
    const frames = useSessionStore.getState().frames
    const t = videoTimeForFrame(frames, frameIdx, videoT0Ref)

    if (depthVideoRef.current) {
      if (Math.abs(depthVideoRef.current.currentTime - t) < 0.001) {
        drawDepthFrame() // already at target time, draw immediately
      } else {
        depthVideoRef.current.currentTime = t
      }
    }
    if (rgbVideoRef.current) {
      if (Math.abs(rgbVideoRef.current.currentTime - t) < 0.001) {
        drawRgbFrame() // already at target time, draw immediately
      } else {
        rgbVideoRef.current.currentTime = t
      }
    }
    if (audioRef.current) {
      audioRef.current.currentTime = t
    }
  }, [])

  const syncAudioPlayback = useCallback((isPlaying: boolean, speed: number, volume: number) => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.playbackRate = speed
      audio.volume = volume
      audio.play().catch(() => { /* autoplay blocked */ })
    } else {
      audio.pause()
    }
  }, [])

  return { seekToFrame, syncAudioPlayback, videoT0Ref }
}
