import { useState } from 'react'
import { SessionThumbnail } from './SessionThumbnail'

interface SessionCardProps {
  env: string
  sessionPath: string
  primaryLabel: string
  secondaryLabel: string | null
  ignored: boolean
  onSelectSession: (sessionPath: string) => void
  onToggleIgnored: (sessionPath: string, ignored: boolean) => Promise<void>
}

export function SessionCard({
  env,
  sessionPath,
  primaryLabel,
  secondaryLabel,
  ignored,
  onSelectSession,
  onToggleIgnored,
}: SessionCardProps) {
  const [pending, setPending] = useState<boolean>(false)

  return (
    <div
      className={`session-card${ignored ? ' ignored' : ''}`}
      onClick={() => {
        onSelectSession(sessionPath)
      }}
    >
      <button
        type="button"
        className="session-card-ignore-toggle"
        disabled={pending}
        onClick={async (event) => {
          event.stopPropagation()
          setPending(true)
          try {
            await onToggleIgnored(sessionPath, !ignored)
          } finally {
            setPending(false)
          }
        }}
        title={ignored ? 'Restore session' : 'Ignore session'}
      >
        <input
          type="checkbox"
          checked={ignored}
          readOnly
          aria-label={ignored ? 'Ignored session' : 'Active session'}
        />
      </button>
      <SessionThumbnail env={env} sessionPath={sessionPath} />
      <div className="session-card-label">
        <span className="session-card-time">{primaryLabel}</span>
        {secondaryLabel ? <span className="session-card-device">{secondaryLabel}</span> : null}
      </div>
    </div>
  )
}
