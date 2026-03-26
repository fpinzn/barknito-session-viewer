import { useCallback, useEffect, useState } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { generateVideoAnnotationTask, generateAudioAnnotationTask, type LSTask } from './taskGenerator'
import { pushTask, listProjects } from './lsApi'

const LS_URL_KEY = 'ls_url'
const LS_API_KEY = 'ls_api_key'
const LS_PROJECT_KEY = 'ls_project_id'

interface LSProject {
  id: number
  title: string
}

export function ExportPanel() {
  const gameEvents = useSessionStore(s => s.gameEvents)
  const sessionMeta = useSessionStore(s => s.sessionMeta)
  const videoUrl = useSessionStore(s => s.videoUrl)
  const audioUrl = useSessionStore(s => s.audioUrl)

  const [lsUrl, setLsUrl] = useState(() => localStorage.getItem(LS_URL_KEY) || '')
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_API_KEY) || '')
  const [projectId, setProjectId] = useState(() => parseInt(localStorage.getItem(LS_PROJECT_KEY) || '0'))
  const [projects, setProjects] = useState<LSProject[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Save settings to localStorage on change
  useEffect(() => { localStorage.setItem(LS_URL_KEY, lsUrl) }, [lsUrl])
  useEffect(() => { localStorage.setItem(LS_API_KEY, apiKey) }, [apiKey])
  useEffect(() => { localStorage.setItem(LS_PROJECT_KEY, projectId.toString()) }, [projectId])

  const handleFetchProjects = useCallback(async () => {
    if (!lsUrl || !apiKey) { setError('URL and API key required'); return }
    setError(null)
    try {
      const p = await listProjects(lsUrl, apiKey)
      setProjects(p)
      setStatus(`Found ${p.length} projects`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch projects')
    }
  }, [lsUrl, apiKey])

  const handlePush = useCallback(async (task: LSTask, label: string) => {
    if (!lsUrl || !apiKey || !projectId) {
      setError('Configure LS URL, API key, and select a project')
      return
    }
    setError(null)
    setStatus(`Pushing ${label}...`)
    try {
      const result = await pushTask(lsUrl, apiKey, projectId, task)
      setStatus(`${label} pushed (task #${result.id})`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Push failed')
    }
  }, [lsUrl, apiKey, projectId])

  const handleExportVideo = useCallback(() => {
    // Extract bucket/folder from URL params
    const params = new URLSearchParams(window.location.search)
    const env = params.get('env') || 'dev'
    const folder = params.get('folder') || ''
    const bucket = env === 'prod' ? 'barknito-sessions-prod' : 'barknito-sessions-dev'

    const task = generateVideoAnnotationTask({
      bucket,
      folder,
      videoFile: 'rgb.mp4',
      gameEvents,
      sessionMeta: sessionMeta || {},
    })

    handlePush(task, 'Video task')
  }, [gameEvents, sessionMeta, handlePush])

  const handleExportAudio = useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    const env = params.get('env') || 'dev'
    const folder = params.get('folder') || ''
    const bucket = env === 'prod' ? 'barknito-sessions-prod' : 'barknito-sessions-dev'

    const task = generateAudioAnnotationTask({
      bucket,
      folder,
      audioFile: 'audio.m4a',
      sessionMeta: sessionMeta || {},
    })

    handlePush(task, 'Audio task')
  }, [sessionMeta, handlePush])

  const handleDownloadJSON = useCallback((type: 'video' | 'audio') => {
    const params = new URLSearchParams(window.location.search)
    const env = params.get('env') || 'dev'
    const folder = params.get('folder') || ''
    const bucket = env === 'prod' ? 'barknito-sessions-prod' : 'barknito-sessions-dev'

    const task = type === 'video'
      ? generateVideoAnnotationTask({
          bucket, folder, videoFile: 'rgb.mp4',
          gameEvents, sessionMeta: sessionMeta || {},
        })
      : generateAudioAnnotationTask({
          bucket, folder, audioFile: 'audio.m4a',
          sessionMeta: sessionMeta || {},
        })

    const blob = new Blob([JSON.stringify(task, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ls-task-${type}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [gameEvents, sessionMeta])

  return (
    <div className="export-panel">
      <h3>Label Studio Export</h3>

      <div className="export-field">
        <label>LS URL</label>
        <input
          type="text"
          placeholder="https://your-label-studio.run.app"
          value={lsUrl}
          onChange={e => setLsUrl(e.target.value)}
        />
      </div>

      <div className="export-field">
        <label>API Key</label>
        <input
          type="password"
          placeholder="Token ..."
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
        />
      </div>

      <div className="export-field">
        <button className="btn-fetch-projects" onClick={handleFetchProjects}>
          Fetch Projects
        </button>
        {projects.length > 0 && (
          <select
            value={projectId}
            onChange={e => setProjectId(parseInt(e.target.value))}
          >
            <option value="0">Select project...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        )}
      </div>

      <div className="export-actions">
        <h4>Push to Label Studio</h4>
        <button onClick={handleExportVideo} disabled={!videoUrl}>
          Export Video Task
        </button>
        <button onClick={handleExportAudio} disabled={!audioUrl}>
          Export Audio Task
        </button>
      </div>

      <div className="export-actions">
        <h4>Download JSON</h4>
        <button onClick={() => handleDownloadJSON('video')}>
          Download Video JSON
        </button>
        <button onClick={() => handleDownloadJSON('audio')}>
          Download Audio JSON
        </button>
      </div>

      {status && <div className="export-status">{status}</div>}
      {error && <div className="export-error">{error}</div>}
    </div>
  )
}
