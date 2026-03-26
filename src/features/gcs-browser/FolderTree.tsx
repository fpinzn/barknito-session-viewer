import { useCallback, useState } from 'react'
import { gcsList, BUCKETS } from './gcsApi'

interface FolderTreeProps {
  env: string
  onSelectFolder: (folder: string) => void
}

interface DeviceNode {
  name: string
  sessions: string[] | null  // null = not yet loaded
  loading: boolean
  error: string | null
  open: boolean
}

export function FolderTree({ env, onSelectFolder }: FolderTreeProps) {
  const [devices, setDevices] = useState<DeviceNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const loadDevices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const bucket = BUCKETS[env]
      const result = await gcsList(bucket, '', '/')
      const deviceNames = (result.prefixes || []).map((p: string) => p.replace(/\/$/, ''))
      setDevices(deviceNames.map((name: string) => ({
        name,
        sessions: null,
        loading: false,
        error: null,
        open: false,
      })))
      setLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load devices')
    } finally {
      setLoading(false)
    }
  }, [env])

  // Load on first render or env change
  if (!loaded && !loading && !error) {
    loadDevices()
  }

  const toggleDevice = useCallback(async (deviceIdx: number) => {
    setDevices(prev => {
      const next = [...prev]
      const device = { ...next[deviceIdx] }
      device.open = !device.open
      next[deviceIdx] = device
      return next
    })

    const device = devices[deviceIdx]
    if (!device.open && device.sessions === null) {
      // Load sessions for this device
      setDevices(prev => {
        const next = [...prev]
        next[deviceIdx] = { ...next[deviceIdx], loading: true, open: true }
        return next
      })

      try {
        const bucket = BUCKETS[env]
        const result = await gcsList(bucket, device.name + '/', '/')
        const sessionPrefixes = (result.prefixes || [])
          .map((p: string) => p.replace(/\/$/, ''))
          .sort()
          .reverse()  // newest first
        setDevices(prev => {
          const next = [...prev]
          next[deviceIdx] = { ...next[deviceIdx], sessions: sessionPrefixes, loading: false }
          return next
        })
      } catch (e) {
        setDevices(prev => {
          const next = [...prev]
          next[deviceIdx] = {
            ...next[deviceIdx],
            error: e instanceof Error ? e.message : 'Error',
            loading: false,
          }
          return next
        })
      }
    }
  }, [devices, env])

  if (loading) {
    return <div className="folder-tree-status">Loading...</div>
  }

  if (error) {
    return <div className="folder-tree-error">{error}</div>
  }

  if (devices.length === 0 && loaded) {
    return <div className="folder-tree-status">No recordings found.</div>
  }

  return (
    <div className="folder-tree">
      {devices.map((device, idx) => (
        <div key={device.name}>
          <div
            className={`device-row${device.open ? ' open' : ''}`}
            onClick={() => toggleDevice(idx)}
          >
            <span className="chevron">{device.open ? '\u25BC' : '\u25B6'}</span>
            {' '}{device.name}
          </div>
          {device.open && (
            <div className="session-list open">
              {device.loading && (
                <div className="session-row loading">Loading...</div>
              )}
              {device.error && (
                <div className="session-row error">{device.error}</div>
              )}
              {device.sessions && device.sessions.length === 0 && (
                <div className="session-row empty">No sessions</div>
              )}
              {device.sessions?.map(sessionPath => {
                const sessionName = sessionPath.split('/').pop()
                const href = `?env=${encodeURIComponent(env)}&folder=${encodeURIComponent(sessionPath)}`
                return (
                  <a
                    key={sessionPath}
                    className="session-row"
                    href={href}
                    onClick={(e) => {
                      // Let middle-click / ctrl-click / cmd-click open in new tab natively
                      if (e.button !== 0 || e.metaKey || e.ctrlKey) return
                      e.preventDefault()
                      e.stopPropagation()
                      onSelectFolder(sessionPath)
                    }}
                  >
                    {sessionName}
                  </a>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
