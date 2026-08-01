import { useEffect, useRef } from 'react'
import { rgbFrameRef } from '../three/environment/PointCloud'
import { useSessionStore } from '../stores/sessionStore'

/**
 * The current video frame, blitted from the canvas `useVideoSync` already
 * decodes into.
 *
 * Reusing that canvas rather than mounting a second `<video>` means the two
 * panes cannot drift apart: they are literally the same decoded frame, and
 * playback stays driven by the single `PlaybackEngine` clock.
 */
export function VideoPane() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoUrl = useSessionStore(s => s.videoUrl)

  useEffect(() => {
    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const canvas = canvasRef.current
      const src = rgbFrameRef.canvas
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#0e0e0e'
      ctx.fillRect(0, 0, w, h)

      if (!src || src.width === 0 || src.height === 0) {
        ctx.fillStyle = '#666'
        ctx.font = '12px ui-monospace, monospace'
        ctx.fillText(videoUrl ? 'decoding…' : 'no video loaded', 12, 22)
        return
      }

      // The recorder stores landscape pixels with a -90° display matrix, so the
      // frame is rotated a quarter turn to stand upright — the same correction
      // the 3D scene applies when it textures the frustum.
      const rotW = src.height
      const rotH = src.width
      const scale = Math.min(w / rotW, h / rotH)
      const dw = rotW * scale
      const dh = rotH * scale

      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.drawImage(src, -dh / 2, -dw / 2, dh, dw)
      ctx.restore()
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [videoUrl])

  return <canvas ref={canvasRef} className="video-pane" />
}
