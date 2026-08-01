import { usePawFloorAnalysis, PAW_MATCH_TOLERANCE_MS } from '../features/paw-floor/usePawFloorAnalysis'
import { useSessionStore } from '../stores/sessionStore'
import { usePlaybackStore } from '../stores/playbackStore'
import type { PawName } from '../types'

const VERDICT_COLOR: Record<string, string> = {
  TRUSTWORTHY: '#44dd88',
  DEGRADED: '#ddaa44',
  UNRELIABLE: '#dd4444',
}

const PAW_LABEL: Record<PawName, string> = {
  left_front_paw: 'LF',
  right_front_paw: 'RF',
  left_back_paw: 'LB',
  right_back_paw: 'RB',
}

export function PawFloorVerdict() {
  const analysis = usePawFloorAnalysis()
  const pawFloorFrameMap = useSessionStore(s => s.pawFloorFrameMap)
  const frames = useSessionStore(s => s.frames)
  const frameIdx = usePlaybackStore(s => s.currentFrameIdx)

  if (!analysis) return null

  // Whether there is anything to draw *right now*. Without this, scrubbing into
  // a stretch with no detections is indistinguishable from the layer being broken.
  const nowTs = frames[frameIdx]?.ts
  let hasSampleHere = false
  if (nowTs !== undefined && pawFloorFrameMap) {
    for (const [, f] of pawFloorFrameMap) {
      if (Math.abs(f.ts - nowTs) <= PAW_MATCH_TOLERANCE_MS) { hasSampleHere = true; break }
    }
  }

  const q = analysis.quality
  const counts = (Object.entries(q.pawCounts) as Array<[PawName, number]>)
    .map(([name, n]) => `${PAW_LABEL[name]} ${n}`)
    .join('  ')

  // Depression percentiles are NaN when no paw sample could be matched to a
  // camera pose. Show that as unknown rather than printing "NaN°".
  const deg = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)}°` : 'n/a')

  return (
    <div data-testid="paw-floor-verdict" style={{ marginTop: 8, lineHeight: 1.5 }}>
      <div>
        <strong>paw floor projection</strong>{' '}
        <span style={{ color: VERDICT_COLOR[q.verdict] ?? '#ccc' }}>{q.verdict}</span>
      </div>
      <div>
        hits {(q.hitRate * 100).toFixed(0)}% of {q.sampleCount} &middot;{' '}
        depression p5 {deg(q.depressionP5)} / p50 {deg(q.depressionP50)}
      </div>
      <div>
        plane span {(q.planeYSpanM * 100).toFixed(1)} cm across {q.planeCount} plane
        {q.planeCount === 1 ? '' : 's'} &middot;{' '}
        residual p50{' '}
        {Number.isFinite(q.residualP50M) ? `${(q.residualP50M * 100).toFixed(1)} cm` : 'n/a'}
      </div>
      <div>{counts}</div>
      <div>
        timeline coverage{' '}
        <span style={{ color: analysis.coverage < 0.6 ? '#ddaa44' : '#ccc' }}>
          {(analysis.coverage * 100).toFixed(0)}%
        </span>
        {analysis.coverage < 0.6 && ' — most of this session has no paw detections'}
      </div>
      <div style={{ color: hasSampleHere ? '#44dd88' : '#dd4444' }}>
        {hasSampleHere ? '● paw sample at this frame' : '○ no paw sample at this frame'}
      </div>
      <div>
        stance baseline {q.baseline.qualified ? 'stable' : 'loose'} ({q.baseline.pairs.length} pairs)
        {q.baseline.qualified ? '' : ' — lift estimate unavailable'}
      </div>
      {q.reasons.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 16, color: '#bbb' }}>
          {q.reasons.map(r => <li key={r}>{r}</li>)}
        </ul>
      )}
    </div>
  )
}
