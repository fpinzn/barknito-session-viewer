import type { SessionMeta } from '../../types'
import type { Frame } from './frame-utils'

export function computeVideoStartOffsetSec(
  sessionMeta: SessionMeta | null,
  mediaDurationSec: number,
): number {
  const startedAtMs = sessionMeta?.startedAtMs
  const endedAtMs = sessionMeta?.endedAtMs
  if (typeof startedAtMs !== 'number' || typeof endedAtMs !== 'number') return 0
  if (!isFinite(mediaDurationSec) || mediaDurationSec <= 0) return 0

  const sessionDurationSec = Math.max(0, (endedAtMs - startedAtMs) / 1000)
  return Math.max(0, sessionDurationSec - mediaDurationSec)
}

export function computeVideoStartOffsetMs(
  sessionMeta: SessionMeta | null,
  mediaDurationSec: number,
): number {
  return Math.round(computeVideoStartOffsetSec(sessionMeta, mediaDurationSec) * 1000)
}

export function mediaTimeForSession(
  el: Pick<HTMLMediaElement, 'duration' | 'seekable'>,
  sessionTimeSec: number,
  videoStartOffsetSec: number,
): number {
  const base = el.seekable.length > 0 ? el.seekable.start(0) : 0
  const max = isFinite(el.duration) ? el.duration : Infinity
  return Math.min(base + Math.max(0, sessionTimeSec - videoStartOffsetSec), max)
}

export function findNearestFrameIdx(frames: Frame[], targetTs: number): number {
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid].ts < targetTs) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(frames[lo - 1].ts - targetTs) < Math.abs(frames[lo].ts - targetTs)) {
    lo--
  }
  return lo
}

export function visibleTimeForFrameMs(frames: Frame[], frameIdx: number, videoStartOffsetMs: number): number {
  if (frames.length === 0 || frameIdx >= frames.length) return 0
  return Math.max(0, (frames[frameIdx].ts - frames[0].ts) - videoStartOffsetMs)
}

export function sessionTimeForVisibleTimeMs(frames: Frame[], visibleTimeMs: number, videoStartOffsetMs: number): number {
  if (frames.length === 0) return 0
  return frames[0].ts + videoStartOffsetMs + Math.max(0, visibleTimeMs)
}

export function visibleTimeForSessionTimeMs(frames: Frame[], sessionTimeMs: number, videoStartOffsetMs: number): number {
  if (frames.length === 0) return 0
  return Math.max(0, sessionTimeMs - frames[0].ts - videoStartOffsetMs)
}
