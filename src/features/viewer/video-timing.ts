import type { SessionMeta } from '../../types'
import type { Frame } from './frame-utils'

export function computeVideoStartOffsetSec(
  sessionMeta: SessionMeta | null,
  mediaDurationSec: number,
  sessionTimelineLastMs: number | null,
): number {
  if (!isFinite(mediaDurationSec) || mediaDurationSec <= 0) return 0

  // Deliberately does NOT read a recorded video start PTS. A branch preferring
  // sessionMeta.videoStartPtsMs was added and removed: subtracting it is only correct if
  // the media timeline base equals the empty-edit duration, and app videos *present*
  // that empty edit, so browser currentTime already equals absolute PTS. Subtracting
  // would seek ~163 s early on 20260520-154443-fca8. The end-alignment below, plus the
  // seekable/currentTime base in mediaTimeForSession, handles both browser behaviours.
  // See ml/docs/label-studio-alignment-verification-2026-07-29.md.
  if (typeof sessionTimelineLastMs === 'number' && isFinite(sessionTimelineLastMs) && sessionTimelineLastMs > 0) {
    return Math.max(0, (sessionTimelineLastMs / 1000) - mediaDurationSec)
  }

  const startedAtMs = sessionMeta?.startedAtMs
  const endedAtMs = sessionMeta?.endedAtMs
  if (typeof startedAtMs !== 'number' || typeof endedAtMs !== 'number') return 0

  return Math.max(0, ((endedAtMs - startedAtMs) / 1000) - mediaDurationSec)
}

export function computeVideoStartOffsetMs(
  sessionMeta: SessionMeta | null,
  mediaDurationSec: number,
  sessionTimelineLastMs: number | null,
): number {
  return Math.round(computeVideoStartOffsetSec(sessionMeta, mediaDurationSec, sessionTimelineLastMs) * 1000)
}

export function sessionTimelineLastMsForFrames(frames: Frame[]): number | null {
  if (frames.length === 0) return null
  return frames[frames.length - 1].ts
}

export function mediaTimeForSession(
  el: Pick<HTMLMediaElement, 'duration' | 'seekable'>,
  sessionTimeSec: number,
  videoStartOffsetSec: number,
  mediaTimelineStartSec: number,
): number {
  const seekableBase = el.seekable.length > 0 ? el.seekable.start(0) : 0
  const base = Math.max(seekableBase, mediaTimelineStartSec)
  const max = isFinite(el.duration) ? base + el.duration : Infinity
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
  return Math.max(0, frames[frameIdx].ts - videoStartOffsetMs)
}

export function sessionTimeForVisibleTimeMs(frames: Frame[], visibleTimeMs: number, videoStartOffsetMs: number): number {
  if (frames.length === 0) return 0
  return videoStartOffsetMs + Math.max(0, visibleTimeMs)
}

export function visibleTimeForSessionTimeMs(frames: Frame[], sessionTimeMs: number, videoStartOffsetMs: number): number {
  if (frames.length === 0) return 0
  return Math.max(0, sessionTimeMs - videoStartOffsetMs)
}
