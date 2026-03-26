import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'

export function ParameterPanel() {
  const hasData = useSessionStore(s => s.frames.length > 0)

  const followCam = useUIStore(s => s.followCam)
  const show2D = useUIStore(s => s.show2DSkeleton)
  const show3D = useUIStore(s => s.show3DSkeleton)
  const showPlanes = useUIStore(s => s.showARPlanes)
  const confidence = useUIStore(s => s.confidenceThreshold)
  const density = useUIStore(s => s.pointDensity)
  const zScale = useUIStore(s => s.depthZScale)
  const vidAlpha = useUIStore(s => s.videoAlpha)
  const ptAlpha = useUIStore(s => s.pointAlpha)
  const skelOffset = useUIStore(s => s.skelMsOffset)

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

      <div className="slider-group">
        <label>Conf</label>
        <input type="range" min="0" max="1" step="0.01" value={confidence}
          onChange={e => useUIStore.getState().setConfidenceThreshold(parseFloat(e.target.value))} />
        <span className="sval">{confidence.toFixed(2)}</span>
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
