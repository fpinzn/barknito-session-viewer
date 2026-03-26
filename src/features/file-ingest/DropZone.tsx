import { useState, useCallback, useRef } from 'react'
import { ingestFile } from './ingest'
import { useUIStore } from '../../stores/uiStore'

interface DropZoneProps {
  visible: boolean
  onFilesLoaded: () => void
}

export function DropZone({ visible, onFilesLoaded }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    await Promise.all(files.map(f => ingestFile(f)))
    onFilesLoaded()
  }, [onFilesLoaded])

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    await Promise.all(files.map(f => ingestFile(f)))
    onFilesLoaded()
  }, [onFilesLoaded])

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const className = `drop-zone${visible ? '' : ' hidden'}${isDragOver ? ' drag-over' : ''}`

  return (
    <div
      className={className}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <div className="inner">
        <h2>Drop session files here</h2>
        <p>
          Pose CSV, sensor CSV, session_meta.json, game_events.json,
          ar_events.json, .mp4 videos, .m4a audio, or .gz archives
        </p>
        <button
          className="btn-browse-gcs"
          onClick={(e) => {
            e.stopPropagation()
            // Clear stale folder param so GCSBrowser shows the browser, not auto-loads
            const url = new URL(window.location.href)
            url.searchParams.delete('folder')
            window.history.replaceState({}, '', url)
            useUIStore.getState().setActivePanel('gcs')
          }}
        >
          Or browse Google Cloud Storage
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />
    </div>
  )
}
