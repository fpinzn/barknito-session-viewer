import { useCallback, useEffect, useState } from 'react'
import { gcsList, gcsGet, BUCKETS } from './gcsApi'

interface GcsObject {
  name: string
  size?: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(name: string): string {
  if (name.endsWith('.csv') || name.endsWith('.csv.gz')) return '\u{1F4CA}'
  if (name.endsWith('.json') || name.endsWith('.json.gz')) return '\u{1F4C4}'
  if (name.endsWith('.mp4') || name.endsWith('.mov')) return '\u{1F3AC}'
  if (name.endsWith('.m4a')) return '\u{1F3B5}'
  return '\u{1F4CE}'
}

function isTextFile(name: string): boolean {
  return /\.(csv|json|txt|log)$/i.test(name)
}

export function FileInspector() {
  const [files, setFiles] = useState<GcsObject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const params = new URLSearchParams(window.location.search)
  const env = params.get('env') || 'dev'
  const folder = params.get('folder') || ''
  const bucket = BUCKETS[env] || BUCKETS.dev

  useEffect(() => {
    if (!folder) {
      setError('No folder selected')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    gcsList(bucket, folder + '/', '').then(result => {
      if (cancelled) return
      const items = (result.items || []).filter(obj => {
        const name = obj.name.split('/').pop() || ''
        return name.length > 0 && !name.endsWith('/')
      })
      setFiles(items as GcsObject[])
      setLoading(false)
    }).catch(err => {
      if (cancelled) return
      setError(err.message)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [bucket, folder])

  const handleDownloadAll = useCallback(async () => {
    if (files.length === 0) return
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const folderName = folder.split('/').pop() || folder
    await Promise.all(files.map(async (f) => {
      try {
        const url = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(f.name)}?alt=media`
        const resp = await gcsGet(url)
        const blob = await resp.blob()
        const fname = f.name.split('/').pop() || f.name
        zip.file(fname, blob)
      } catch (err) {
        console.error(`Failed to fetch ${f.name}:`, err)
      }
    }))
    const content = await zip.generateAsync({ type: 'blob' })
    const blobUrl = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `${folderName}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  }, [bucket, folder, files])

  const handleDownload = useCallback(async (objectName: string) => {
    try {
      const url = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media`
      const resp = await gcsGet(url)
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = objectName.split('/').pop() || objectName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }, [bucket])

  const handlePreview = useCallback(async (objectName: string) => {
    const fname = objectName.split('/').pop() || ''
    if (previewFile === objectName) {
      setPreviewFile(null)
      setPreviewContent(null)
      return
    }
    if (!isTextFile(fname)) return
    setPreviewFile(objectName)
    setPreviewLoading(true)
    try {
      const url = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media`
      const resp = await gcsGet(url)
      const text = await resp.text()
      // Limit preview to first 200 lines
      const lines = text.split('\n')
      const preview = lines.length > 200
        ? lines.slice(0, 200).join('\n') + `\n\n... (${lines.length - 200} more lines)`
        : text
      setPreviewContent(preview)
    } catch (err) {
      setPreviewContent(`Error loading preview: ${err}`)
    }
    setPreviewLoading(false)
  }, [bucket, previewFile])

  if (loading) return <div className="file-inspector"><div className="gcs-loading">Loading files...</div></div>
  if (error) return <div className="file-inspector"><div className="gcs-error">{error}</div></div>

  return (
    <div className="file-inspector">
      <div className="file-inspector-header">
        <h3>Files</h3>
        <span className="file-inspector-count">{files.length} files</span>
        <button className="btn-download-all" onClick={handleDownloadAll} title="Download all as ZIP">
          {'\u2B07'} All
        </button>
      </div>
      <div className="file-inspector-list">
        {files.map(f => {
          const fname = f.name.split('/').pop() || f.name
          const size = f.size ? formatSize(parseInt(f.size, 10)) : ''
          const textable = isTextFile(fname)
          return (
            <div key={f.name} className="file-inspector-item">
              <div className="file-inspector-row">
                <span className="file-icon">{fileIcon(fname)}</span>
                <span
                  className={`file-name${textable ? ' clickable' : ''}`}
                  onClick={() => textable && handlePreview(f.name)}
                  title={textable ? 'Click to preview' : fname}
                >
                  {fname}
                </span>
                <span className="file-size">{size}</span>
                <button
                  className="btn-download"
                  onClick={() => handleDownload(f.name)}
                  title="Download"
                >
                  {'\u2B07'}
                </button>
              </div>
              {previewFile === f.name && (
                <div className="file-preview">
                  {previewLoading
                    ? <span className="gcs-loading">Loading...</span>
                    : <pre>{previewContent}</pre>
                  }
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
