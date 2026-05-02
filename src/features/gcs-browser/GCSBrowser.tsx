import { useCallback, useEffect, useState } from 'react'
import { loadToken, trySilentRefresh, getToken } from './auth'
import { loadFolder, type LoadFolderProgress } from './gcsApi'
import { SignIn } from './SignIn'
import { FolderTree } from './FolderTree'
import { useSessionStore } from '../../stores/sessionStore'
import { usePlaybackStore } from '../../stores/playbackStore'
import { useUIStore } from '../../stores/uiStore'

type BrowserState = 'loading' | 'signin' | 'browse' | 'loading-session'

export function GCSBrowser() {
  const [state, setState] = useState<BrowserState>('loading')
  const [env, setEnv] = useState<string>(() => {
    return new URLSearchParams(window.location.search).get('env') || 'dev'
  })
  const [progress, setProgress] = useState<LoadFolderProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  // On mount: try to restore token
  useEffect(() => {
    const init = async () => {
      // If we already have session data loaded, go straight to browse
      const hasSession = useSessionStore.getState().frames.length > 0
        || useSessionStore.getState().videoUrl !== null

      const stored = loadToken()
      if (stored) {
        if (!hasSession) {
          const params = new URLSearchParams(window.location.search)
          const folder = params.get('folder')
          if (folder) {
            await handleSelectFolder(folder)
            return
          }
        }
        setState('browse')
        return
      }

      const refreshed = await trySilentRefresh()
      if (refreshed) {
        if (!hasSession) {
          const params = new URLSearchParams(window.location.search)
          const folder = params.get('folder')
          if (folder) {
            await handleSelectFolder(folder)
            return
          }
        }
        setState('browse')
      } else {
        setState('signin')
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      const folder = params.get('folder')
      if (folder) {
        handleSelectFolder(folder)
      } else {
        // Back to browse: reset session data
        useSessionStore.getState().reset()
        usePlaybackStore.getState().reset()
        useUIStore.getState().setActivePanel('gcs')
        setState('browse')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env])

  const handleSignedIn = useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    const folder = params.get('folder')
    if (folder) {
      handleSelectFolder(folder)
    } else {
      setState('browse')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelectFolder = useCallback(async (folder: string) => {
    setState('loading-session')
    setError(null)
    setProgress(null)

    // Reset all session state before loading new one.
    // Await a microtask after reset so React flushes the cleanup effects
    // (useVideoSync tears down DOM elements on null URLs) before new data loads.
    useSessionStore.getState().reset()
    usePlaybackStore.getState().reset()
    useUIStore.getState().reset()
    await new Promise(r => setTimeout(r, 0))

    // Update URL
    const newUrl = new URL(window.location.href)
    newUrl.searchParams.set('env', env)
    newUrl.searchParams.set('folder', folder)
    window.history.pushState({}, '', newUrl)

    try {
      await loadFolder(env, folder, setProgress)
      // Check if any viewable data was loaded
      const s = useSessionStore.getState()
      const hasViewableData = s.frames.length > 0 || s.videoUrl !== null || s.audioUrl !== null
      if (hasViewableData) {
        // Adjust defaults based on available data
        if (!s.depthVideoUrl) {
          useUIStore.getState().setShow3DSkeleton(false)
          useUIStore.getState().setShowPointCloud(false)
          useUIStore.getState().setVideoAlpha(1.0)
        }
        useUIStore.getState().setActivePanel('none')
      } else {
        setError('Session loaded but contains no viewable data (no CSVs or videos found).')
        setState('browse')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load session')
      setState('browse')
    }
  }, [env])

  const handleBack = useCallback(() => {
    // Reset all stores
    useSessionStore.getState().reset()
    usePlaybackStore.getState().reset()

    // Clear URL folder param
    const newUrl = new URL(window.location.href)
    newUrl.searchParams.delete('folder')
    window.history.pushState({}, '', newUrl)

    setState('browse')
  }, [])

  const handleEnvChange = useCallback((newEnv: string) => {
    setEnv(newEnv)
  }, [])

  if (state === 'loading') {
    return (
      <div className="gcs-browser">
        <div className="gcs-loading">Authenticating...</div>
      </div>
    )
  }

  if (state === 'signin') {
    return (
      <div className="gcs-browser">
        <SignIn onSignedIn={handleSignedIn} />
      </div>
    )
  }

  if (state === 'loading-session') {
    const pct = progress ? (progress.loaded / progress.total) * 100 : 0
    return (
      <div className="gcs-browser">
        <div className="gcs-loading-session">
          <div className="loading-status">
            {progress
              ? progress.currentFile
                ? `Downloading ${progress.currentFile} (${progress.loaded + 1}/${progress.total})`
                : `Downloaded ${progress.total}/${progress.total}`
              : 'Loading...'}
          </div>
          <div className="loading-bar-wrap">
            <div className="loading-bar" style={{ width: `${pct}%` }} />
          </div>
          {error && <div className="gcs-error">{error}</div>}
        </div>
      </div>
    )
  }

  // browse
  return (
    <div className="gcs-browser">
      <div className="gcs-header">
        {getToken() && (
          <button className="btn-back" onClick={handleBack} title="Back to browser">
            &larr; Back
          </button>
        )}
        <div className="env-switch">
          <button
            className={env === 'dev' ? 'active' : ''}
            onClick={() => handleEnvChange('dev')}
          >
            Dev
          </button>
          <button
            className={env === 'prod' ? 'active' : ''}
            onClick={() => handleEnvChange('prod')}
          >
            Prod
          </button>
        </div>
      </div>
      <div className="gcs-hint">browse or drag your session files</div>
      {error && <div className="gcs-error">{error}</div>}
      <FolderTree env={env} onSelectFolder={handleSelectFolder} />
    </div>
  )
}
