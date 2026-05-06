export interface IgnoredSessionRow {
  environment: string
  deviceId: string
  sessionId: string
  sessionPath: string
  ignoredAt: string
  ignoredByEmail: string
}

export interface SessionIdentity {
  deviceId: string
  sessionId: string
  sessionPath: string
}

export interface DateSessionEntry {
  path: string
  device: string
  ts: number
}

export interface PartitionedSessions<T> {
  active: T[]
  ignored: T[]
}

export function parseSessionIdentity(sessionPath: string): SessionIdentity {
  const [deviceId, sessionId] = sessionPath.split('/')
  if (!deviceId || !sessionId) {
    throw new Error(`Invalid session path: ${sessionPath}`)
  }

  return {
    deviceId,
    sessionId,
    sessionPath,
  }
}

export function createIgnoredSessionPathSet(rows: IgnoredSessionRow[]): Set<string> {
  return new Set(rows.map((row) => row.sessionPath))
}

export function partitionSessionPaths(
  sessionPaths: string[],
  ignoredSessionPaths: ReadonlySet<string>,
): PartitionedSessions<string> {
  const active: string[] = []
  const ignored: string[] = []

  for (const sessionPath of sessionPaths) {
    if (ignoredSessionPaths.has(sessionPath)) {
      ignored.push(sessionPath)
      continue
    }
    active.push(sessionPath)
  }

  return { active, ignored }
}

export function partitionDateSessionEntries(
  entries: DateSessionEntry[],
  ignoredSessionPaths: ReadonlySet<string>,
): PartitionedSessions<DateSessionEntry> {
  const active: DateSessionEntry[] = []
  const ignored: DateSessionEntry[] = []

  for (const entry of entries) {
    if (ignoredSessionPaths.has(entry.path)) {
      ignored.push(entry)
      continue
    }
    active.push(entry)
  }

  return { active, ignored }
}
