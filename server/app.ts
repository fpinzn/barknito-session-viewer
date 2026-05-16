import express, { type Express } from 'express'
import path from 'node:path'
import { createIgnoredSessionsRouter } from './routes/ignoredSessions.js'
import { authorizeAccessToken as defaultAuthorizeAccessToken } from './googleAuth.js'
import {
  clearIgnoredSession as defaultClearIgnoredSession,
  listIgnoredSessions as defaultListIgnoredSessions,
  setIgnoredSession as defaultSetIgnoredSession,
  type IgnoredSessionInput,
  type IgnoredSessionRow,
} from './ignoredSessionsRepo.js'
import { createPool, ensureIgnoredSessionsTable } from './db.js'

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/session-viewer\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.session-viewer\.pages\.dev$/,
  /^http:\/\/localhost:\d+$/,
]

export interface AppDeps {
  listIgnoredSessions: (environment: string) => Promise<IgnoredSessionRow[]>
  setIgnoredSession: (input: IgnoredSessionInput) => Promise<void>
  clearIgnoredSession: (environment: string, deviceId: string, sessionId: string) => Promise<void>
  authorizeAccessToken: (token: string, environment: string) => Promise<{ email: string }>
  staticDir: string | null
}

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))
}

export function createApp(deps: AppDeps): Express {
  const app = express()

  app.use(express.json())
  app.use('/api', (request, response, next) => {
    const origin = request.header('Origin')

    if (!origin) {
      next()
      return
    }

    if (!isAllowedOrigin(origin)) {
      response.status(403).json({ error: 'Origin not allowed' })
      return
    }

    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')

    if (request.method === 'OPTIONS') {
      response.status(204).end()
      return
    }

    next()
  })
  app.use('/api/ignored-sessions', createIgnoredSessionsRouter(deps))

  if (deps.staticDir) {
    app.use(express.static(deps.staticDir))
    app.use((_request, response) => {
      response.sendFile(path.join(deps.staticDir as string, 'index.html'))
    })
  }

  return app
}

export async function createProductionApp(databaseUrl: string, staticDir: string): Promise<Express> {
  const pool = createPool(databaseUrl)
  await ensureIgnoredSessionsTable(pool)

  return createApp({
    listIgnoredSessions: (environment) => defaultListIgnoredSessions(pool, environment),
    setIgnoredSession: (input) => defaultSetIgnoredSession(pool, input),
    clearIgnoredSession: (environment, deviceId, sessionId) =>
      defaultClearIgnoredSession(pool, environment, deviceId, sessionId),
    authorizeAccessToken: defaultAuthorizeAccessToken,
    staticDir,
  })
}
