import { Router } from 'express'
import type { IgnoredSessionInput, IgnoredSessionRow } from '../ignoredSessionsRepo.js'
import type { AuthorizedUser } from '../googleAuth.js'

export interface IgnoredSessionsRouteDeps {
  listIgnoredSessions: (environment: string) => Promise<IgnoredSessionRow[]>
  setIgnoredSession: (input: IgnoredSessionInput) => Promise<void>
  clearIgnoredSession: (environment: string, deviceId: string, sessionId: string) => Promise<void>
  authorizeAccessToken: (token: string, environment: string) => Promise<AuthorizedUser>
}

interface IgnoredSessionRequestBody {
  env?: unknown
  deviceId?: unknown
  sessionId?: unknown
  sessionPath?: unknown
  ignored?: unknown
}

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null
  const match = authorizationHeader.match(/^Bearer (.+)$/)
  return match ? match[1] : null
}

function getRequiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required`)
  }
  return value
}

export function createIgnoredSessionsRouter(deps: IgnoredSessionsRouteDeps): Router {
  const router = Router()

  router.get('/', async (request, response) => {
    const env = request.query.env
    const environment = typeof env === 'string' ? env : ''
    const token = getBearerToken(request.header('Authorization'))

    if (!environment || !token) {
      response.status(400).json({ error: 'Missing env or bearer token' })
      return
    }

    try {
      await deps.authorizeAccessToken(token, environment)
    } catch {
      response.status(403).json({ error: 'Forbidden' })
      return
    }

    const rows = await deps.listIgnoredSessions(environment)
    response.status(200).json(rows)
  })

  router.put('/', async (request, response) => {
    const token = getBearerToken(request.header('Authorization'))
    const body = request.body as IgnoredSessionRequestBody

    try {
      const environment = getRequiredString(body.env, 'env')
      const deviceId = getRequiredString(body.deviceId, 'deviceId')
      const sessionId = getRequiredString(body.sessionId, 'sessionId')
      const sessionPath = getRequiredString(body.sessionPath, 'sessionPath')

      if (typeof body.ignored !== 'boolean') {
        throw new Error('ignored is required')
      }
      if (!token) {
        throw new Error('bearer token is required')
      }

      let authorizedUser: AuthorizedUser
      try {
        authorizedUser = await deps.authorizeAccessToken(token, environment)
      } catch {
        response.status(403).json({ error: 'Forbidden' })
        return
      }

      if (body.ignored) {
        await deps.setIgnoredSession({
          environment,
          deviceId,
          sessionId,
          sessionPath,
          ignoredByEmail: authorizedUser.email,
        })
      } else {
        await deps.clearIgnoredSession(environment, deviceId, sessionId)
      }

      response.status(204).send()
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid request',
      })
    }
  })

  return router
}
