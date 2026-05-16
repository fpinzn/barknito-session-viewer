import { useCallback, useMemo, useState } from 'react'
import { gcsList, BUCKETS } from './gcsApi'
import { SessionCard } from './SessionCard'
import {
  createIgnoredSessionPathSet,
  partitionDateSessionEntries,
  partitionSessionPaths,
  type IgnoredSessionRow,
} from './ignoredSessionsModel'
import { useUIStore } from '../../stores/uiStore'

interface FolderTreeProps {
  env: string
  ignoredSessions: IgnoredSessionRow[]
  onSelectFolder: (folder: string) => void
  onToggleIgnored: (sessionPath: string, ignored: boolean) => Promise<void>
}

interface DeviceNode {
  name: string
  sessions: string[] | null  // null = not yet loaded
  loading: boolean
  error: string | null
  open: boolean
}

const SESSION_RE = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/

function parseSessionTimestamp(sessionPath: string): number {
  const name = sessionPath.split('/').pop() || ''
  const m = name.match(SESSION_RE)
  if (!m) return 0
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).getTime()
}

function formatSessionTimestamp(sessionPath: string): string {
  const name = sessionPath.split('/').pop() || ''
  const m = name.match(SESSION_RE)
  if (!m) return name
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`
}

function sessionDatePart(sessionPath: string): string {
  const name = sessionPath.split('/').pop() || ''
  const m = name.match(SESSION_RE)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}

function sessionTimePart(sessionPath: string): string {
  const name = sessionPath.split('/').pop() || ''
  const m = name.match(SESSION_RE)
  return m ? `${m[4]}:${m[5]}` : name
}

function formatDateHeader(dateStr: string): string {
  if (!dateStr) return 'Unknown date'
  const d = new Date(`${dateStr}T00:00:00`)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
}

export function FolderTree({ env, ignoredSessions, onSelectFolder, onToggleIgnored }: FolderTreeProps) {
  const [devices, setDevices] = useState<DeviceNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [dateLoading, setDateLoading] = useState(false)

  const viewMode = useUIStore(s => s.browserViewMode)
  const setViewMode = useUIStore(s => s.setBrowserViewMode)
  const sessionVisibility = useUIStore(s => s.browserSessionVisibility)
  const setSessionVisibility = useUIStore(s => s.setBrowserSessionVisibility)
  const ignoredSessionPaths = useMemo(
    () => createIgnoredSessionPathSet(ignoredSessions),
    [ignoredSessions],
  )

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

  const loadAllSessions = useCallback(async () => {
    const unloaded = devices.filter(d => d.sessions === null)
    if (unloaded.length === 0) return
    setDateLoading(true)
    try {
      const bucket = BUCKETS[env]
      const results = await Promise.all(
        unloaded.map(async (d) => {
          const result = await gcsList(bucket, d.name + '/', '/')
          return {
            name: d.name,
            sessions: (result.prefixes || [])
              .map((p: string) => p.replace(/\/$/, ''))
              .sort()
              .reverse(),
          }
        })
      )
      setDevices(prev => {
        const next = [...prev]
        for (const r of results) {
          const idx = next.findIndex(d => d.name === r.name)
          if (idx >= 0) {
            next[idx] = { ...next[idx], sessions: r.sessions, loading: false }
          }
        }
        return next
      })
    } finally {
      setDateLoading(false)
    }
  }, [devices, env])

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

  const allSessions = useMemo(() => {
    if (viewMode !== 'date') return []
    const entries: { path: string; device: string; ts: number }[] = []
    for (const d of devices) {
      if (!d.sessions) continue
      for (const s of d.sessions) {
        entries.push({ path: s, device: d.name, ts: parseSessionTimestamp(s) })
      }
    }
    entries.sort((a, b) => b.ts - a.ts)
    return entries
  }, [devices, viewMode])

  const partitionedDateSessions = useMemo(
    () => partitionDateSessionEntries(allSessions, ignoredSessionPaths),
    [allSessions, ignoredSessionPaths],
  )

  const activeSessionsByDate = useMemo(() => {
    const groups = new Map<string, typeof partitionedDateSessions.active>()
    for (const entry of partitionedDateSessions.active) {
      const date = sessionDatePart(entry.path)
      const arr = groups.get(date) || []
      arr.push(entry)
      groups.set(date, arr)
    }
    return Array.from(groups.entries())
  }, [partitionedDateSessions.active])

  const ignoredSessionsByDate = useMemo(() => {
    const groups = new Map<string, typeof partitionedDateSessions.ignored>()
    for (const entry of partitionedDateSessions.ignored) {
      const date = sessionDatePart(entry.path)
      const arr = groups.get(date) || []
      arr.push(entry)
      groups.set(date, arr)
    }
    return Array.from(groups.entries())
  }, [partitionedDateSessions.ignored])

  const visibleSessionsByDate = sessionVisibility === 'active'
    ? activeSessionsByDate
    : ignoredSessionsByDate

  // Trigger fetch when switching to date view
  if (viewMode === 'date' && loaded && !dateLoading && devices.some(d => d.sessions === null)) {
    loadAllSessions()
  }

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
      <div className="browser-toggle-row">
        <div className="view-mode-toggle">
          <button
            className={sessionVisibility === 'active' ? 'active' : ''}
            onClick={() => setSessionVisibility('active')}
          >
            Active
          </button>
          <button
            className={sessionVisibility === 'hidden' ? 'active' : ''}
            onClick={() => setSessionVisibility('hidden')}
          >
            Hidden
          </button>
        </div>

        <div className="view-mode-toggle">
          <button
            className={viewMode === 'device' ? 'active' : ''}
            onClick={() => setViewMode('device')}
          >
            By Device
          </button>
          <button
            className={viewMode === 'date' ? 'active' : ''}
            onClick={() => setViewMode('date')}
          >
            By Date
          </button>
        </div>
      </div>

      {viewMode === 'device' && devices.map((device, idx) => (
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
              {device.sessions && device.sessions.length > 0 && (() => {
                const partitioned = partitionSessionPaths(device.sessions, ignoredSessionPaths)
                const visibleSessionPaths = sessionVisibility === 'active'
                  ? partitioned.active
                  : partitioned.ignored

                if (visibleSessionPaths.length === 0) {
                  return (
                    <div className="session-row empty">
                      {sessionVisibility === 'active' ? 'No active sessions' : 'No hidden sessions'}
                    </div>
                  )
                }

                return (
                  <div className="session-grid">
                    {visibleSessionPaths.map((sessionPath) => (
                      <SessionCard
                        key={sessionPath}
                        env={env}
                        sessionPath={sessionPath}
                        primaryLabel={formatSessionTimestamp(sessionPath)}
                        secondaryLabel={null}
                        ignored={sessionVisibility === 'hidden'}
                        onSelectSession={onSelectFolder}
                        onToggleIgnored={onToggleIgnored}
                      />
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      ))}

      {viewMode === 'date' && dateLoading && (
        <div className="folder-tree-status">Loading all sessions...</div>
      )}

      {viewMode === 'date' && !dateLoading && allSessions.length === 0 && (
        <div className="folder-tree-status">No sessions found.</div>
      )}

      {viewMode === 'date' && !dateLoading && allSessions.length > 0 && visibleSessionsByDate.length === 0 && (
        <div className="folder-tree-status">
          {sessionVisibility === 'active' ? 'No active sessions found.' : 'No hidden sessions found.'}
        </div>
      )}

      {viewMode === 'date' && !dateLoading && visibleSessionsByDate.length > 0 && (
        <div className={`session-section${sessionVisibility === 'hidden' ? ' ignored' : ''}`}>
          <div className="session-section-header">
            {sessionVisibility === 'active' ? 'Active Sessions' : 'Hidden Sessions'}
          </div>
          {visibleSessionsByDate.map(([date, entries]) => (
            <div key={date} className="date-group">
              <div className="date-header">{formatDateHeader(date)}</div>
              <div className="session-grid">
                {entries.map((entry) => (
                  <SessionCard
                    key={entry.path}
                    env={env}
                    sessionPath={entry.path}
                    primaryLabel={sessionTimePart(entry.path)}
                    secondaryLabel={entry.device}
                    ignored={sessionVisibility === 'hidden'}
                    onSelectSession={onSelectFolder}
                    onToggleIgnored={onToggleIgnored}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
