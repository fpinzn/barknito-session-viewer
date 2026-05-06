import { clearToken, getAuthorizationHeader, trySilentRefresh } from './auth'
import { parseSessionIdentity, type IgnoredSessionRow } from './ignoredSessionsModel'

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

  if (response.status !== 401 && response.status !== 403) {
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
  const response = await ignoredSessionsRequest(
    `/api/ignored-sessions?env=${encodeURIComponent(environment)}`,
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
  const response = await ignoredSessionsRequest('/api/ignored-sessions', {
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

