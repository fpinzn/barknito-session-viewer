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
import { createPool } from './db.js'

export interface AppDeps {
  listIgnoredSessions: (environment: string) => Promise<IgnoredSessionRow[]>
  setIgnoredSession: (input: IgnoredSessionInput) => Promise<void>
  clearIgnoredSession: (environment: string, deviceId: string, sessionId: string) => Promise<void>
  authorizeAccessToken: (token: string, environment: string) => Promise<{ email: string }>
  staticDir: string | null
}

export function createApp(deps: AppDeps): Express {
  const app = express()

  app.use(express.json())
  app.use('/api/ignored-sessions', createIgnoredSessionsRouter(deps))

  if (deps.staticDir) {
    app.use(express.static(deps.staticDir))
    app.get('*', (_request, response) => {
      response.sendFile(path.join(deps.staticDir as string, 'index.html'))
    })
  }

  return app
}

export function createProductionApp(databaseUrl: string, staticDir: string): Express {
  const pool = createPool(databaseUrl)

  return createApp({
    listIgnoredSessions: (environment) => defaultListIgnoredSessions(pool, environment),
    setIgnoredSession: (input) => defaultSetIgnoredSession(pool, input),
    clearIgnoredSession: (environment, deviceId, sessionId) =>
      defaultClearIgnoredSession(pool, environment, deviceId, sessionId),
    authorizeAccessToken: defaultAuthorizeAccessToken,
    staticDir,
  })
}
