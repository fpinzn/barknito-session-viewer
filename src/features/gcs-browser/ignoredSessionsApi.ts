import { clearToken, getAuthorizationHeader, trySilentRefresh } from './auth'
import { parseSessionIdentity, type IgnoredSessionRow } from './ignoredSessionsModel'

const IGNORED_SESSIONS_API_BASE_URL = import.meta.env.VITE_IGNORED_SESSIONS_API_BASE_URL?.replace(/\/$/, '') ?? ''

function ignoredSessionsUrl(path: string): string {
  if (!IGNORED_SESSIONS_API_BASE_URL) {
    throw new Error('Ignored sessions API base URL is not configured')
  }
  return `${IGNORED_SESSIONS_API_BASE_URL}${path}`
}

async function ignoredSessionsRequest(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: getAuthorizationHeader(),
    },
  })

  if (response.status !== 401) {
    return response
  }

  const refreshed = await trySilentRefresh()
  if (!refreshed) {
    clearToken()
    throw new Error('Token expired — please sign in again')
  }

  return fetch(input, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: getAuthorizationHeader(),
    },
  })
}

export async function listIgnoredSessions(environment: string): Promise<IgnoredSessionRow[]> {
  if (!IGNORED_SESSIONS_API_BASE_URL) return []

  const response = await ignoredSessionsRequest(
    ignoredSessionsUrl(`/api/ignored-sessions?env=${encodeURIComponent(environment)}`),
    {
      method: 'GET',
    },
  )

  if (!response.ok) {
    throw new Error(`Ignored sessions error ${response.status}: ${await response.text()}`)
  }

  return response.json() as Promise<IgnoredSessionRow[]>
}

export async function setIgnoredSession(
  environment: string,
  sessionPath: string,
  ignored: boolean,
): Promise<void> {
  const identity = parseSessionIdentity(sessionPath)
  const response = await ignoredSessionsRequest(ignoredSessionsUrl('/api/ignored-sessions'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      env: environment,
      deviceId: identity.deviceId,
      sessionId: identity.sessionId,
      sessionPath: identity.sessionPath,
      ignored,
    }),
  })

  if (!response.ok) {
    throw new Error(`Ignored sessions error ${response.status}: ${await response.text()}`)
  }
}
