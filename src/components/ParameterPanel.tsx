import { useMemo } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { confidenceFloors, PAW_SOURCE_ID } from '../features/paw-floor/confidenceFloor'
import { trailBoundsSeconds } from '../features/paw-floor/trail'

export function ParameterPanel() {
  const hasData = useSessionStore(s => s.frames.length > 0)
  const poseEvents = useSessionStore(s => s.poseEvents)
  const pawFloorFrameMap = useSessionStore(s => s.pawFloorFrameMap)

  const followCam = useUIStore(s => s.followCam)
  const show2D = useUIStore(s => s.show2DSkeleton)
  const show3D = useUIStore(s => s.show3DSkeleton)
  const showPlanes = useUIStore(s => s.showARPlanes)
  const showPawFloor = useUIStore(s => s.showPawFloor)
  const showPawLift = useUIStore(s => s.showPawLift)
  const confidence = useUIStore(s => s.confidenceThreshold)
  const density = useUIStore(s => s.pointDensity)
  const zScale = useUIStore(s => s.depthZScale)
  const vidAlpha = useUIStore(s => s.videoAlpha)
  const ptAlpha = useUIStore(s => s.pointAlpha)
  const skelOffset = useUIStore(s => s.skelMsOffset)
  const pawTrailSeconds = useUIStore(s => s.pawTrailSeconds)
  const frames = useSessionStore(s => s.frames)

  const trailBounds = useMemo(() => {
    const span = frames.length > 1 ? frames[frames.length - 1].ts - frames[0].ts : 0
    return trailBoundsSeconds(span)
  }, [frames])

  const trail = Math.min(Math.max(pawTrailSeconds, trailBounds.min), trailBounds.max)

  const floors = useMemo(
    () => confidenceFloors(poseEvents, pawFloorFrameMap),
    [poseEvents, pawFloorFrameMap],
  )

  // Floor the slider at the lowest confidence any loaded source actually
  // contains — below it the slider does nothing. Rounded down so the lowest
  // sample itself stays selectable.
  const sliderMin = floors.overallMin === null
    ? 0
    : Math.floor(floors.overallMin * 100) / 100

  const confTooltip = floors.sources.length === 0
    ? 'Hide landmarks and paw marks below this confidence.'
    : [
        'Hide landmarks and paw marks below this confidence.',
        '',
        'Each source has its own hard floor — nothing below it was ever recorded,',
        'so lowering the slider past it reveals nothing more:',
        ...floors.sources.map(s => `  • ${s.id}: ${s.min.toFixed(2)}`
          + (s.id === PAW_SOURCE_ID ? '  (recorder minConfidence)' : '')),
        '',
        `Slider stops at ${sliderMin.toFixed(2)}, the lowest across all loaded sources.`,
      ].join('\n')

  if (!hasData) return null

  return (
    <div className="param-panel">
      <div className="check-group">
        <input type="checkbox" id="chk-follow" checked={followCam}
          onChange={e => useUIStore.getState().setFollowCam(e.target.checked)} />
        <label htmlFor="chk-follow">Follow cam</label>
      </div>
      <div className="check-group">
        <input type="checkbox" id="chk-skel2d" checked={show2D}
          onChange={e => useUIStore.getState().setShow2DSkeleton(e.target.checked)} />
        <label htmlFor="chk-skel2d">2D skeleton</label>
      </div>
      <div className="check-group">
        <input type="checkbox" id="chk-skel3d" checked={show3D}
          onChange={e => useUIStore.getState().setShow3DSkeleton(e.target.checked)} />
        <label htmlFor="chk-skel3d">3D skeleton</label>
      </div>
      <div className="check-group">
        <input type="checkbox" id="chk-planes" checked={showPlanes}
          onChange={e => useUIStore.getState().setShowARPlanes(e.target.checked)} />
        <label htmlFor="chk-planes">AR planes</label>
      </div>
      <div className="check-group">
        <input type="checkbox" id="chk-pawfloor" checked={showPawFloor}
          onChange={e => useUIStore.getState().setShowPawFloor(e.target.checked)} />
        <label htmlFor="chk-pawfloor">Paw floor</label>
      </div>
      <div className="check-group">
        <input type="checkbox" id="chk-pawlift" checked={showPawLift}
          onChange={e => useUIStore.getState().setShowPawLift(e.target.checked)} />
        <label htmlFor="chk-pawlift" title="Derived from stance geometry, not measured. Only drawn when the session's stance baseline is stable.">Paw lift (derived)</label>
      </div>

      <div
        className="slider-group"
        title={`How much paw history to draw, in seconds.\n\nDrag to ${trailBounds.max.toFixed(0)} s to show the whole session.\nApplies to both the 3D scene and the floor map.`}
      >
        <label>Trail</label>
        <input
          type="range"
          min={trailBounds.min}
          max={trailBounds.max}
          step="0.5"
          value={trail}
          onChange={e => useUIStore.getState().setPawTrailSeconds(parseFloat(e.target.value))}
        />
        <span className="sval">
          {trail >= trailBounds.max ? 'all' : `${trail.toFixed(1)}s`}
        </span>
      </div>

      <div className="slider-group" title={confTooltip}>
        <label>Conf</label>
        <input type="range" min={sliderMin} max="1" step="0.01"
          value={Math.max(confidence, sliderMin)}
          onChange={e => useUIStore.getState().setConfidenceThreshold(parseFloat(e.target.value))} />
        <span className="sval">{Math.max(confidence, sliderMin).toFixed(2)}</span>
      </div>
      <div className="slider-group">
        <label>Density</label>
        <input type="range" min="1" max="4" step="1" value={density}
          onChange={e => useUIStore.getState().setPointDensity(parseInt(e.target.value))} />
        <span className="sval">{density}</span>
      </div>
      <div className="slider-group">
        <label>Z scale</label>
        <input type="range" min="0.01" max="3" step="0.01" value={zScale}
          onChange={e => useUIStore.getState().setDepthZScale(parseFloat(e.target.value))} />
        <span className="sval">{zScale.toFixed(2)}</span>
      </div>
      <div className="slider-group">
        <label>Vid &alpha;</label>
        <input type="range" min="0" max="1" step="0.05" value={vidAlpha}
          onChange={e => useUIStore.getState().setVideoAlpha(parseFloat(e.target.value))} />
        <span className="sval">{vidAlpha.toFixed(2)}</span>
      </div>
      <div className="slider-group">
        <label>Pt &alpha;</label>
        <input type="range" min="0" max="1" step="0.05" value={ptAlpha}
          onChange={e => useUIStore.getState().setPointAlpha(parseFloat(e.target.value))} />
        <span className="sval">{ptAlpha.toFixed(2)}</span>
      </div>
      <div className="slider-group">
        <label>Skel &Delta;t</label>
        <input type="range" min="-500" max="500" step="5" value={skelOffset}
          onChange={e => useUIStore.getState().setSkelMsOffset(parseInt(e.target.value))} />
        <span className="sval">{skelOffset} ms</span>
      </div>
    </div>
  )
}
