import { useCallback, useRef } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useUIStore } from '../stores/uiStore'
import { ingestFile } from '../features/file-ingest/ingest'
import { SceneCanvas } from '../three/SceneCanvas'
import { ControlsBar } from '../components/ControlsBar'
import { ParameterPanel } from '../components/ParameterPanel'
import { HUD } from '../components/HUD'
import { Legend } from '../components/Legend'
import { KeyboardShortcuts } from '../components/KeyboardShortcuts'
import { EventList } from '../features/timeline/EventList'
import { GCSBrowser } from '../features/gcs-browser/GCSBrowser'
import { ExportPanel } from '../features/label-studio/ExportPanel'
import { FileInspector } from '../features/gcs-browser/FileInspector'

export function Layout() {
  const hasData = useSessionStore(s =>
    s.frames.length > 0 || s.videoUrl !== null || s.audioUrl !== null || s.sessionMeta !== null
  )
  const activePanel = useUIStore(s => s.activePanel)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAddFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    await Promise.all(files.map(f => ingestFile(f)))
    if (e.target) e.target.value = ''
  }, [])

  const handleAddFileClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Global drag-drop — always active
  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleGlobalDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    await Promise.all(files.map(f => ingestFile(f)))
  }, [])

  return (
    <div
      className="app-layout"
      onDragOver={handleGlobalDragOver}
      onDrop={handleGlobalDrop}
    >
      <KeyboardShortcuts />

      <div className="main-area">
        <div className="canvas-container" id="canvas-container">
          <SceneCanvas />
          <HUD />
          {hasData && (
            <button className="btn-inspect" title="Inspect files" onClick={() => {
              const ui = useUIStore.getState()
              ui.setActivePanel(ui.activePanel === 'files' ? 'none' : 'files')
            }}>
              &#x1F50D;
            </button>
          )}
          <Legend />
          <ParameterPanel />
        </div>
        <div className={`sidebar${activePanel === 'none' ? ' hidden' : ''}${!hasData ? ' full-width' : ''}`}>
          {activePanel === 'events' && <EventList />}
          {activePanel === 'gcs' && <GCSBrowser />}
          {activePanel === 'export' && <ExportPanel />}
          {activePanel === 'files' && <FileInspector />}
        </div>
      </div>

      <ControlsBar />

      {hasData && (
        <>
          <button
            className="btn-add-file"
            title="Add another file"
            onClick={handleAddFileClick}
          >
            +
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleAddFile}
          />
        </>
      )}
    </div>
  )
}
