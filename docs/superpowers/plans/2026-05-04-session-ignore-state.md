# Session Ignore State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent ignored-session state with a same-origin API, move ignored sessions into separate active/ignored browser sections, and deploy the unified app on Cloud Run backed by Cloud SQL.

**Architecture:** Keep the React viewer as the frontend, add a small Node/Express server in the same repo to serve the built assets and expose `/api/ignored-sessions`, and store ignored-session rows in a dedicated database on the existing Cloud SQL instance. The browser keeps using the Google access token it already needs for GCS, the API authorizes per environment by probing the matching bucket, and the UI partitions sessions into active and ignored sections in both date and device views.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Zustand, Node.js, Express, PostgreSQL (`pg`), Google OAuth access token, Cloud Run, Cloud SQL, Terraform

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `package.json` | Root scripts and dependencies for frontend + server build/test/run |
| Create | `tsconfig.server.json` | TypeScript build config for the server code |
| Create | `server/app.ts` | Express app wiring, JSON middleware, static asset serving, route mounting |
| Create | `server/index.ts` | Server entrypoint |
| Create | `server/config.ts` | Required env parsing for port, DB, bucket mapping |
| Create | `server/db.ts` | PostgreSQL pool creation |
| Create | `server/ignoredSessionsRepo.ts` | SQL reads/writes for ignored sessions |
| Create | `server/googleAuth.ts` | Access-token authorization against GCS and email resolution |
| Create | `server/routes/ignoredSessions.ts` | `GET` and `PUT` route handlers |
| Create | `server/__tests__/ignoredSessionsApi.test.ts` | API route integration tests using an in-memory app dependency boundary |
| Move | `src/` → `frontend/src/` | Existing React app source |
| Move | `public/` → `frontend/public/` | Existing static frontend assets |
| Move | `index.html` → `frontend/index.html` | Vite HTML entrypoint |
| Move | `vite.config.ts` → `frontend/vite.config.ts` | Frontend Vite config |
| Move | `tsconfig.app.json` → `frontend/tsconfig.app.json` | Frontend TS config |
| Move | `src/test-setup.ts` → `frontend/src/test-setup.ts` | Frontend Vitest setup |
| Create | `frontend/src/features/gcs-browser/ignoredSessionsApi.ts` | Browser API calls for ignored-session state |
| Create | `frontend/src/features/gcs-browser/ignoredSessionsModel.ts` | Session path parsing and active/ignored partition helpers |
| Create | `frontend/src/features/gcs-browser/SessionCard.tsx` | Shared session card with checkbox overlay |
| Modify | `frontend/src/features/gcs-browser/FolderTree.tsx` | Partition active vs ignored sections and render separate device/date sections |
| Modify | `frontend/src/features/gcs-browser/GCSBrowser.tsx` | Load ignored-session state per env and handle toggle errors |
| Modify | `frontend/src/features/gcs-browser/auth.ts` | Expand Google OAuth scopes and export bearer token getter |
| Modify | `frontend/src/stores/uiStore.ts` | Default browser view mode to `date` |
| Modify | `frontend/src/app/App.css` | Styling for checkbox overlay and ignored sections |
| Create | `frontend/src/features/gcs-browser/__tests__/ignoredSessionsModel.test.ts` | Partition helper tests |
| Modify | `README.md` | Replace Cloudflare Pages deployment instructions with Cloud Run app instructions |
| Create | `Dockerfile` | Multi-stage build for frontend + server |
| Modify | `../infra/label-studio/main.tf` | Add session-viewer DB, DB user, secret, service account access, and Cloud Run service |
| Modify | `../infra/label-studio/variables.tf` | Add session-viewer DB password and image variables |
| Modify | `../infra/environments/dev/terraform.tfvars.example` | Document new DB password and image variables |
| Modify | `../infra/environments/prod/terraform.tfvars.example` | Document new DB password and image variables |

The current worktree already has unrelated modifications. Do not revert or fold those changes into this work unless a task explicitly requires touching the same file. Keep each commit scoped to the files listed in its task.

---

### Task 1: Create the server runtime and ignored-sessions API

**Files:**
- Modify: `package.json`
- Create: `tsconfig.server.json`
- Create: `server/app.ts`
- Create: `server/index.ts`
- Create: `server/config.ts`
- Create: `server/db.ts`
- Create: `server/ignoredSessionsRepo.ts`
- Create: `server/googleAuth.ts`
- Create: `server/routes/ignoredSessions.ts`
- Create: `server/__tests__/ignoredSessionsApi.test.ts`

- [ ] **Step 1: Add the server dependencies and scripts**

Update `package.json` so the root package can build both frontend and server:

```json
{
  "scripts": {
    "dev:frontend": "vite --config frontend/vite.config.ts",
    "dev:server": "PORT=8080 tsx watch server/index.ts",
    "build:frontend": "vite build --config frontend/vite.config.ts",
    "build:server": "tsc -p tsconfig.server.json",
    "build": "npm run build:frontend && npm run build:server",
    "test": "vitest run",
    "lint": "eslint ."
  },
  "dependencies": {
    "express": "^5.1.0",
    "pg": "^8.16.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.3",
    "@types/pg": "^8.15.2",
    "supertest": "^7.1.1",
    "tsx": "^4.20.6"
  }
}
```

- [ ] **Step 2: Add the server TypeScript config**

Create `tsconfig.server.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist-server",
    "rootDir": ".",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["server/**/*.ts"]
}
```

- [ ] **Step 3: Write the failing API test first**

Create `server/__tests__/ignoredSessionsApi.test.ts`:

```ts
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app'

describe('ignored sessions API', () => {
  it('returns rows for an authorized env', async () => {
    const app = createApp({
      listIgnoredSessions: vi.fn().mockResolvedValue([
        {
          environment: 'dev',
          deviceId: 'device-a',
          sessionId: '20260502-143000',
          sessionPath: 'device-a/20260502-143000',
          ignoredAt: '2026-05-02T14:31:00.000Z',
          ignoredByEmail: 'user@example.com',
        },
      ]),
      setIgnoredSession: vi.fn(),
      clearIgnoredSession: vi.fn(),
      authorizeAccessToken: vi.fn().mockResolvedValue({
        email: 'user@example.com',
      }),
      staticDir: null,
    })

    const response = await request(app)
      .get('/api/ignored-sessions?env=dev')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body).toEqual([
      {
        environment: 'dev',
        deviceId: 'device-a',
        sessionId: '20260502-143000',
        sessionPath: 'device-a/20260502-143000',
        ignoredAt: '2026-05-02T14:31:00.000Z',
        ignoredByEmail: 'user@example.com',
      },
    ])
  })

  it('upserts ignored sessions for an authorized caller', async () => {
    const setIgnoredSession = vi.fn().mockResolvedValue(undefined)
    const app = createApp({
      listIgnoredSessions: vi.fn(),
      setIgnoredSession,
      clearIgnoredSession: vi.fn(),
      authorizeAccessToken: vi.fn().mockResolvedValue({
        email: 'user@example.com',
      }),
      staticDir: null,
    })

    const response = await request(app)
      .put('/api/ignored-sessions')
      .set('Authorization', 'Bearer token')
      .send({
        env: 'dev',
        deviceId: 'device-a',
        sessionId: '20260502-143000',
        sessionPath: 'device-a/20260502-143000',
        ignored: true,
      })

    expect(response.status).toBe(204)
    expect(setIgnoredSession).toHaveBeenCalledWith({
      environment: 'dev',
      deviceId: 'device-a',
      sessionId: '20260502-143000',
      sessionPath: 'device-a/20260502-143000',
      ignoredByEmail: 'user@example.com',
    })
  })

  it('rejects callers without bucket access', async () => {
    const app = createApp({
      listIgnoredSessions: vi.fn(),
      setIgnoredSession: vi.fn(),
      clearIgnoredSession: vi.fn(),
      authorizeAccessToken: vi.fn().mockRejectedValue(new Error('forbidden')),
      staticDir: null,
    })

    const response = await request(app)
      .get('/api/ignored-sessions?env=prod')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'Forbidden' })
  })
})
```

- [ ] **Step 4: Run the test to confirm the server does not exist yet**

Run:

```bash
npm test -- server/__tests__/ignoredSessionsApi.test.ts
```

Expected: FAIL with a module resolution error for `server/app` and related server files.

- [ ] **Step 5: Implement the minimal server app and routes**

Create `server/config.ts`:

```ts
export const BUCKETS: Record<string, string> = {
  dev: 'barknito-sessions-dev',
  prod: 'barknito-sessions-prod',
}

export interface ServerConfig {
  port: number
  staticDir: string
  databaseUrl: string
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const port = Number(env.PORT || '8080')
  const staticDir = env.STATIC_DIR || 'dist'
  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }
  return { port, staticDir, databaseUrl }
}
```

Create `server/ignoredSessionsRepo.ts`:

```ts
import type { Pool } from 'pg'

export interface IgnoredSessionRow {
  environment: string
  deviceId: string
  sessionId: string
  sessionPath: string
  ignoredAt: string
  ignoredByEmail: string
}

export interface IgnoredSessionWrite {
  environment: string
  deviceId: string
  sessionId: string
  sessionPath: string
  ignoredByEmail: string
}

export async function listIgnoredSessions(pool: Pool, environment: string): Promise<IgnoredSessionRow[]> {
  const result = await pool.query(
    `select
       environment,
       device_id as "deviceId",
       session_id as "sessionId",
       session_path as "sessionPath",
       ignored_at as "ignoredAt",
       ignored_by_email as "ignoredByEmail"
     from ignored_sessions
     where environment = $1
     order by ignored_at desc`,
    [environment],
  )
  return result.rows as IgnoredSessionRow[]
}

export async function setIgnoredSession(pool: Pool, input: IgnoredSessionWrite): Promise<void> {
  await pool.query(
    `insert into ignored_sessions (
       environment,
       device_id,
       session_id,
       session_path,
       ignored_at,
       ignored_by_email
     ) values ($1, $2, $3, $4, now(), $5)
     on conflict (environment, session_path)
     do update set
       device_id = excluded.device_id,
       session_id = excluded.session_id,
       ignored_at = now(),
       ignored_by_email = excluded.ignored_by_email`,
    [
      input.environment,
      input.deviceId,
      input.sessionId,
      input.sessionPath,
      input.ignoredByEmail,
    ],
  )
}

export async function clearIgnoredSession(pool: Pool, environment: string, sessionPath: string): Promise<void> {
  await pool.query(
    `delete from ignored_sessions where environment = $1 and session_path = $2`,
    [environment, sessionPath],
  )
}
```

Create `server/googleAuth.ts`:

```ts
import { BUCKETS } from './config'

export interface AuthorizedUser {
  email: string
}

export async function authorizeAccessToken(accessToken: string, environment: string): Promise<AuthorizedUser> {
  const bucket = BUCKETS[environment]
  if (!bucket) {
    throw new Error('invalid-env')
  }

  const bucketResponse = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (bucketResponse.status === 401) {
    throw new Error('unauthorized')
  }

  if (bucketResponse.status === 403 || bucketResponse.status === 404) {
    throw new Error('forbidden')
  }

  if (!bucketResponse.ok) {
    throw new Error(`bucket-check-failed:${bucketResponse.status}`)
  }

  const userInfoResponse = await fetch(
    'https://openidconnect.googleapis.com/v1/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!userInfoResponse.ok) {
    throw new Error(`userinfo-failed:${userInfoResponse.status}`)
  }

  const userInfo = await userInfoResponse.json() as { email?: string }
  if (!userInfo.email) {
    throw new Error('missing-email')
  }

  return { email: userInfo.email }
}
```

Create `server/routes/ignoredSessions.ts`:

```ts
import { Router } from 'express'

interface RouteDependencies {
  listIgnoredSessions: (environment: string) => Promise<unknown[]>
  setIgnoredSession: (input: {
    environment: string
    deviceId: string
    sessionId: string
    sessionPath: string
    ignoredByEmail: string
  }) => Promise<void>
  clearIgnoredSession: (environment: string, sessionPath: string) => Promise<void>
  authorizeAccessToken: (accessToken: string, environment: string) => Promise<{ email: string }>
}

function parseBearerToken(header: string | undefined): string {
  if (!header?.startsWith('Bearer ')) {
    throw new Error('unauthorized')
  }
  return header.slice('Bearer '.length)
}

function assertValidPath(deviceId: string, sessionId: string, sessionPath: string): void {
  if (sessionPath !== `${deviceId}/${sessionId}`) {
    throw new Error('bad-request')
  }
}

export function createIgnoredSessionsRouter(deps: RouteDependencies): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    try {
      const environment = String(req.query.env || '')
      const accessToken = parseBearerToken(req.header('Authorization'))
      await deps.authorizeAccessToken(accessToken, environment)
      const rows = await deps.listIgnoredSessions(environment)
      res.json(rows)
    } catch (error) {
      if (error instanceof Error && error.message === 'unauthorized') {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      if (error instanceof Error && error.message === 'forbidden') {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
      res.status(500).json({ error: 'Failed to list ignored sessions' })
    }
  })

  router.put('/', async (req, res) => {
    try {
      const accessToken = parseBearerToken(req.header('Authorization'))
      const environment = String(req.body.env || '')
      const deviceId = String(req.body.deviceId || '')
      const sessionId = String(req.body.sessionId || '')
      const sessionPath = String(req.body.sessionPath || '')
      const ignored = Boolean(req.body.ignored)

      if (!environment || !deviceId || !sessionId || !sessionPath) {
        res.status(400).json({ error: 'Missing required fields' })
        return
      }

      assertValidPath(deviceId, sessionId, sessionPath)
      const user = await deps.authorizeAccessToken(accessToken, environment)

      if (ignored) {
        await deps.setIgnoredSession({
          environment,
          deviceId,
          sessionId,
          sessionPath,
          ignoredByEmail: user.email,
        })
      } else {
        await deps.clearIgnoredSession(environment, sessionPath)
      }

      res.status(204).end()
    } catch (error) {
      if (error instanceof Error && error.message === 'unauthorized') {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }
      if (error instanceof Error && error.message === 'forbidden') {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
      if (error instanceof Error && error.message === 'bad-request') {
        res.status(400).json({ error: 'Invalid session path' })
        return
      }
      res.status(500).json({ error: 'Failed to update ignored session' })
    }
  })

  return router
}
```

Create `server/app.ts`:

```ts
import express from 'express'
import path from 'node:path'
import { createIgnoredSessionsRouter } from './routes/ignoredSessions'

interface AppDependencies {
  listIgnoredSessions: (environment: string) => Promise<unknown[]>
  setIgnoredSession: (input: {
    environment: string
    deviceId: string
    sessionId: string
    sessionPath: string
    ignoredByEmail: string
  }) => Promise<void>
  clearIgnoredSession: (environment: string, sessionPath: string) => Promise<void>
  authorizeAccessToken: (accessToken: string, environment: string) => Promise<{ email: string }>
  staticDir: string | null
}

export function createApp(deps: AppDependencies) {
  const app = express()
  app.use(express.json())
  app.use('/api/ignored-sessions', createIgnoredSessionsRouter(deps))

  if (deps.staticDir) {
    app.use(express.static(deps.staticDir))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(deps.staticDir, 'index.html'))
    })
  }

  return app
}
```

Create `server/db.ts`:

```ts
import { Pool } from 'pg'

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  })
}
```

Create `server/index.ts`:

```ts
import path from 'node:path'
import { createApp } from './app'
import { loadConfig } from './config'
import { createPool } from './db'
import { authorizeAccessToken } from './googleAuth'
import {
  clearIgnoredSession,
  listIgnoredSessions,
  setIgnoredSession,
} from './ignoredSessionsRepo'

const config = loadConfig(process.env)
const pool = createPool(config.databaseUrl)

const app = createApp({
  listIgnoredSessions: (environment) => listIgnoredSessions(pool, environment),
  setIgnoredSession: (input) => setIgnoredSession(pool, input),
  clearIgnoredSession: (environment, sessionPath) => clearIgnoredSession(pool, environment, sessionPath),
  authorizeAccessToken,
  staticDir: path.resolve(config.staticDir),
})

app.listen(config.port, () => {
  console.log(`session-viewer server listening on ${config.port}`)
})
```

- [ ] **Step 6: Run the API tests**

Run:

```bash
npm test -- server/__tests__/ignoredSessionsApi.test.ts
```

Expected: PASS with 3 passing tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.server.json server
git commit -m "feat: add ignored sessions API server"
```

---

### Task 2: Move the frontend under `frontend/` and keep the build working

**Files:**
- Move: `src/` → `frontend/src/`
- Move: `public/` → `frontend/public/`
- Move: `index.html` → `frontend/index.html`
- Move: `vite.config.ts` → `frontend/vite.config.ts`
- Move: `tsconfig.app.json` → `frontend/tsconfig.app.json`
- Move: `src/test-setup.ts` → `frontend/src/test-setup.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Move the frontend files**

Run:

```bash
mkdir -p frontend
mv src frontend/src
mv public frontend/public
mv index.html frontend/index.html
mv vite.config.ts frontend/vite.config.ts
mv tsconfig.app.json frontend/tsconfig.app.json
```

Expected: the React app source and Vite entrypoint now live under `frontend/`.

- [ ] **Step 2: Fix the moved Vite config**

Update `frontend/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
```

- [ ] **Step 3: Point the root TS config at the moved frontend app**

Update `tsconfig.json` references:

```json
{
  "files": [],
  "references": [
    { "path": "./frontend/tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.server.json" }
  ]
}
```

- [ ] **Step 4: Run the build to verify the move**

Run:

```bash
npm run build
```

Expected: PASS. `dist/index.html` and `dist/assets/*` are created, plus `dist-server/*`.

- [ ] **Step 5: Commit**

```bash
git add frontend tsconfig.json
git commit -m "refactor: move viewer frontend under frontend directory"
```

---

### Task 3: Add ignored-session client logic and default the browser to date view

**Files:**
- Modify: `frontend/src/features/gcs-browser/auth.ts`
- Create: `frontend/src/features/gcs-browser/ignoredSessionsApi.ts`
- Create: `frontend/src/features/gcs-browser/ignoredSessionsModel.ts`
- Create: `frontend/src/features/gcs-browser/__tests__/ignoredSessionsModel.test.ts`
- Modify: `frontend/src/features/gcs-browser/GCSBrowser.tsx`
- Modify: `frontend/src/stores/uiStore.ts`

- [ ] **Step 1: Expand the OAuth scope to include email**

Update `frontend/src/features/gcs-browser/auth.ts`:

```ts
const SCOPE = [
  'https://www.googleapis.com/auth/devstorage.read_only',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')
```

Keep `getToken()` exported. The API client will reuse it directly.

- [ ] **Step 2: Write the failing partition test first**

Create `frontend/src/features/gcs-browser/__tests__/ignoredSessionsModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { partitionSessionsByIgnoredState } from '../ignoredSessionsModel'

describe('partitionSessionsByIgnoredState', () => {
  it('splits active and ignored sessions by session path', () => {
    const result = partitionSessionsByIgnoredState(
      [
        { path: 'device-a/20260502-143000', device: 'device-a', ts: 3 },
        { path: 'device-a/20260502-142000', device: 'device-a', ts: 2 },
        { path: 'device-b/20260501-101500', device: 'device-b', ts: 1 },
      ],
      new Set(['device-a/20260502-142000']),
    )

    expect(result.active.map((entry) => entry.path)).toEqual([
      'device-a/20260502-143000',
      'device-b/20260501-101500',
    ])
    expect(result.ignored.map((entry) => entry.path)).toEqual([
      'device-a/20260502-142000',
    ])
  })
})
```

- [ ] **Step 3: Run the test to confirm the helper does not exist yet**

Run:

```bash
npm test -- frontend/src/features/gcs-browser/__tests__/ignoredSessionsModel.test.ts
```

Expected: FAIL with a module resolution error for `ignoredSessionsModel`.

- [ ] **Step 4: Implement the model and API client**

Create `frontend/src/features/gcs-browser/ignoredSessionsModel.ts`:

```ts
export interface BrowserSessionEntry {
  path: string
  device: string
  ts: number
}

export interface IgnoredSessionRecord {
  environment: string
  deviceId: string
  sessionId: string
  sessionPath: string
  ignoredAt: string
  ignoredByEmail: string
}

export function parseSessionIdentity(sessionPath: string): { deviceId: string; sessionId: string } {
  const [deviceId, sessionId] = sessionPath.split('/')
  if (!deviceId || !sessionId) {
    throw new Error(`Invalid session path: ${sessionPath}`)
  }
  return { deviceId, sessionId }
}

export function partitionSessionsByIgnoredState(
  sessions: BrowserSessionEntry[],
  ignoredPaths: Set<string>,
): { active: BrowserSessionEntry[]; ignored: BrowserSessionEntry[] } {
  const active: BrowserSessionEntry[] = []
  const ignored: BrowserSessionEntry[] = []

  for (const session of sessions) {
    if (ignoredPaths.has(session.path)) {
      ignored.push(session)
    } else {
      active.push(session)
    }
  }

  return { active, ignored }
}
```

Create `frontend/src/features/gcs-browser/ignoredSessionsApi.ts`:

```ts
import { getToken } from './auth'
import type { IgnoredSessionRecord } from './ignoredSessionsModel'

export async function fetchIgnoredSessions(environment: string): Promise<IgnoredSessionRecord[]> {
  const token = getToken()
  if (!token) {
    throw new Error('Not authenticated')
  }

  const response = await fetch(`/api/ignored-sessions?env=${encodeURIComponent(environment)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    throw new Error(`Ignored sessions fetch failed: ${response.status}`)
  }

  return response.json() as Promise<IgnoredSessionRecord[]>
}

export async function setIgnoredSession(input: {
  env: string
  deviceId: string
  sessionId: string
  sessionPath: string
  ignored: boolean
}): Promise<void> {
  const token = getToken()
  if (!token) {
    throw new Error('Not authenticated')
  }

  const response = await fetch('/api/ignored-sessions', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw new Error(`Ignored session update failed: ${response.status}`)
  }
}
```

- [ ] **Step 5: Load ignored-session state in the browser and default to date view**

Update `frontend/src/stores/uiStore.ts`:

```ts
  browserViewMode: 'date' as const,
```

Update `frontend/src/features/gcs-browser/GCSBrowser.tsx`:

```tsx
import { fetchIgnoredSessions, setIgnoredSession } from './ignoredSessionsApi'
import { parseSessionIdentity, type IgnoredSessionRecord } from './ignoredSessionsModel'

// inside component state
const [ignoredSessions, setIgnoredSessions] = useState<Record<string, IgnoredSessionRecord>>({})

useEffect(() => {
  if (state !== 'browse' || !getToken()) return
  let cancelled = false

  const loadIgnored = async () => {
    try {
      const rows = await fetchIgnoredSessions(env)
      if (cancelled) return
      setIgnoredSessions(
        Object.fromEntries(rows.map((row) => [row.sessionPath, row])),
      )
    } catch (e) {
      if (cancelled) return
      setError(e instanceof Error ? e.message : 'Failed to load ignored sessions')
    }
  }

  loadIgnored()
  return () => { cancelled = true }
}, [env, state])

const handleToggleIgnored = useCallback(async (sessionPath: string, ignored: boolean) => {
  const { deviceId, sessionId } = parseSessionIdentity(sessionPath)
  const previous = ignoredSessions[sessionPath]

  setIgnoredSessions((current) => {
    if (!ignored) {
      const next = { ...current }
      delete next[sessionPath]
      return next
    }
    return {
      ...current,
      [sessionPath]: {
        environment: env,
        deviceId,
        sessionId,
        sessionPath,
        ignoredAt: new Date().toISOString(),
        ignoredByEmail: previous?.ignoredByEmail || 'pending',
      },
    }
  })

  try {
    await setIgnoredSession({ env, deviceId, sessionId, sessionPath, ignored })
    const rows = await fetchIgnoredSessions(env)
    setIgnoredSessions(Object.fromEntries(rows.map((row) => [row.sessionPath, row])))
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Failed to update ignored session')
    setIgnoredSessions((current) => {
      if (previous) return { ...current, [sessionPath]: previous }
      const next = { ...current }
      delete next[sessionPath]
      return next
    })
  }
}, [env, ignoredSessions])
```

- [ ] **Step 6: Run the tests**

Run:

```bash
npm test -- frontend/src/features/gcs-browser/__tests__/ignoredSessionsModel.test.ts
```

Expected: PASS with 1 passing test.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/gcs-browser/auth.ts frontend/src/features/gcs-browser/ignoredSessionsApi.ts frontend/src/features/gcs-browser/ignoredSessionsModel.ts frontend/src/features/gcs-browser/__tests__/ignoredSessionsModel.test.ts frontend/src/features/gcs-browser/GCSBrowser.tsx frontend/src/stores/uiStore.ts
git commit -m "feat: load ignored session state in browser"
```

---

### Task 4: Partition the session browser into active and ignored sections

**Files:**
- Create: `frontend/src/features/gcs-browser/SessionCard.tsx`
- Modify: `frontend/src/features/gcs-browser/FolderTree.tsx`
- Modify: `frontend/src/app/App.css`

- [ ] **Step 1: Create the shared session card with a checkbox overlay**

Create `frontend/src/features/gcs-browser/SessionCard.tsx`:

```tsx
import { SessionThumbnail } from './SessionThumbnail'

interface SessionCardProps {
  env: string
  sessionPath: string
  label: React.ReactNode
  ignored: boolean
  onOpen: (sessionPath: string) => void
  onToggleIgnored: (sessionPath: string, ignored: boolean) => void
}

export function SessionCard({
  env,
  sessionPath,
  label,
  ignored,
  onOpen,
  onToggleIgnored,
}: SessionCardProps) {
  const href = `?env=${encodeURIComponent(env)}&folder=${encodeURIComponent(sessionPath)}`

  return (
    <a
      className="session-card"
      href={href}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey) return
        event.preventDefault()
        onOpen(sessionPath)
      }}
    >
      <label
        className="session-card-ignore"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={ignored}
          onChange={(event) => onToggleIgnored(sessionPath, event.target.checked)}
        />
        <span>Ignored</span>
      </label>
      <SessionThumbnail env={env} sessionPath={sessionPath} />
      <div className="session-card-label">{label}</div>
    </a>
  )
}
```

- [ ] **Step 2: Refactor `FolderTree.tsx` to partition active and ignored sections**

Update `frontend/src/features/gcs-browser/FolderTree.tsx`:

```tsx
import { SessionCard } from './SessionCard'
import { partitionSessionsByIgnoredState } from './ignoredSessionsModel'

interface FolderTreeProps {
  env: string
  ignoredSessionPaths: Set<string>
  onSelectFolder: (folder: string) => void
  onToggleIgnored: (sessionPath: string, ignored: boolean) => void
}

// inside device rendering
const devicePartitions = device.sessions
  ? partitionSessionsByIgnoredState(
      device.sessions.map((path) => ({
        path,
        device: device.name,
        ts: parseSessionTimestamp(path),
      })),
      ignoredSessionPaths,
    )
  : null

// active device section
{devicePartitions && devicePartitions.active.length > 0 && (
  <div className="session-grid">
    {devicePartitions.active.map((entry) => (
      <SessionCard
        key={entry.path}
        env={env}
        sessionPath={entry.path}
        ignored={false}
        onOpen={onSelectFolder}
        onToggleIgnored={onToggleIgnored}
        label={formatSessionTimestamp(entry.path)}
      />
    ))}
  </div>
)}

// ignored device section
{devicePartitions && devicePartitions.ignored.length > 0 && (
  <div className="ignored-session-block">
    <div className="ignored-session-title">Ignored Sessions</div>
    <div className="session-grid">
      {devicePartitions.ignored.map((entry) => (
        <SessionCard
          key={entry.path}
          env={env}
          sessionPath={entry.path}
          ignored
          onOpen={onSelectFolder}
          onToggleIgnored={onToggleIgnored}
          label={formatSessionTimestamp(entry.path)}
        />
      ))}
    </div>
  </div>
)}

// date rendering
const datePartitions = partitionSessionsByIgnoredState(entries, ignoredSessionPaths)
```

Render two top-level date blocks:

```tsx
{viewMode === 'date' && !dateLoading && datePartitions.active.length > 0 && (
  <div className="date-section">
    <div className="date-section-title">Active Sessions</div>
    {groupByDate(datePartitions.active).map(([date, dateEntries]) => (
      <div key={date} className="date-group">
        <div className="date-header">{formatDateHeader(date)}</div>
        <div className="session-grid">
          {dateEntries.map((entry) => (
            <SessionCard
              key={entry.path}
              env={env}
              sessionPath={entry.path}
              ignored={false}
              onOpen={onSelectFolder}
              onToggleIgnored={onToggleIgnored}
              label={
                <>
                  <span className="session-card-time">{sessionTimePart(entry.path)}</span>
                  <span className="session-card-device">{entry.device}</span>
                </>
              }
            />
          ))}
        </div>
      </div>
    ))}
  </div>
)}
```

Mirror the same structure for `datePartitions.ignored` with title `Ignored Sessions`.

- [ ] **Step 3: Add the minimal CSS for the new sections**

Update `frontend/src/app/App.css`:

```css
.session-card-ignore {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.85);
  color: #ddd;
  font-size: 11px;
}

.ignored-session-block,
.date-section {
  margin-top: 16px;
}

.ignored-session-title,
.date-section-title {
  margin-bottom: 10px;
  color: #888;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
```

- [ ] **Step 4: Run the frontend tests and production build**

Run:

```bash
npm test -- frontend/src/features/gcs-browser/__tests__/ignoredSessionsModel.test.ts
npm run build
```

Expected: PASS for the test and PASS for the build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/gcs-browser/SessionCard.tsx frontend/src/features/gcs-browser/FolderTree.tsx frontend/src/app/App.css
git commit -m "feat: split session browser into active and ignored sections"
```

---

### Task 5: Add unified deployment artifacts and Terraform resources

**Files:**
- Create: `Dockerfile`
- Modify: `README.md`
- Modify: `../infra/label-studio/main.tf`
- Modify: `../infra/label-studio/variables.tf`
- Modify: `../infra/environments/dev/terraform.tfvars.example`
- Modify: `../infra/environments/prod/terraform.tfvars.example`

- [ ] **Step 1: Add the container build**

Create `Dockerfile`:

```dockerfile
FROM node:20-bookworm AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
CMD ["node", "dist-server/server/index.js"]
```

- [ ] **Step 2: Replace the deployment docs**

Update `README.md` deployment section to:

```md
## Deployment

This app now deploys as a single Cloud Run service that serves both the frontend and the `/api` routes.

### Required environment variables

- `DATABASE_URL`
- `PORT`
- `STATIC_DIR=/app/dist`

### Local development

Run the frontend and server in separate terminals:

```bash
npm run dev:frontend
npm run dev:server
```
```

- [ ] **Step 3: Add the new DB and Cloud Run resources in Terraform**

Update `../infra/label-studio/variables.tf`:

```tf
variable "session_viewer_db_password" {
  type      = string
  sensitive = true
}

variable "session_viewer_image" {
  type = string
}
```

Add to `../infra/label-studio/main.tf`:

```tf
resource "google_sql_database" "session_viewer_db" {
  name     = "sessionviewer"
  instance = google_sql_database_instance.label_studio.name
  project  = var.project_id
}

resource "google_sql_user" "session_viewer_user" {
  name     = "sessionviewer"
  instance = google_sql_database_instance.label_studio.name
  password = var.session_viewer_db_password
  project  = var.project_id
}

resource "google_secret_manager_secret" "session_viewer_database_url" {
  secret_id = "session-viewer-database-url-${var.environment}"
  project   = var.project_id
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "session_viewer_database_url" {
  secret      = google_secret_manager_secret.session_viewer_database_url.id
  secret_data = "postgres://sessionviewer:${var.session_viewer_db_password}@/sessionviewer?host=/cloudsql/${google_sql_database_instance.label_studio.connection_name}"
}
```

Add a new Cloud Run service:

```tf
resource "google_service_account" "session_viewer" {
  account_id   = "session-viewer-${var.environment}"
  display_name = "Session Viewer ${var.environment}"
  project      = var.project_id
}

resource "google_project_iam_member" "session_viewer_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.session_viewer.email}"
}

resource "google_cloud_run_v2_service" "session_viewer" {
  name     = "session-viewer-${var.environment}"
  location = var.region
  project  = var.project_id

  template {
    service_account = google_service_account.session_viewer.email

    containers {
      image = var.session_viewer_image

      env {
        name  = "STATIC_DIR"
        value = "/app/dist"
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.session_viewer_database_url.secret_id
            version = "latest"
          }
        }
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.label_studio.connection_name]
      }
    }
  }
}
```

Also add explicit backup configuration to `google_sql_database_instance.label_studio.settings`:

```tf
    backup_configuration {
      enabled = true
    }
```

- [ ] **Step 4: Document the new variable in both env examples**

Add to `../infra/environments/dev/terraform.tfvars.example` and `../infra/environments/prod/terraform.tfvars.example`:

```tf
session_viewer_db_password = "replace-me"
session_viewer_image       = "us-docker.pkg.dev/replace-me/session-viewer:replace-me"
```

- [ ] **Step 5: Validate the Terraform and app build**

Run:

```bash
npm run build
cd ../infra
terraform fmt -recursive
terraform validate
```

Expected: app build PASS, Terraform format completes, and `terraform validate` PASSes from the infra repo root after required variables are provided.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile README.md
git commit -m "build: add unified Cloud Run deployment artifacts"

cd ../infra
git add label-studio/main.tf label-studio/variables.tf environments/dev/terraform.tfvars.example environments/prod/terraform.tfvars.example
git commit -m "infra: add session viewer database and Cloud Run service"
```

---

### Task 6: End-to-end verification

**Files:**
- No new files required

- [ ] **Step 1: Start the local server against a disposable local Postgres**

Run:

```bash
docker run --rm --name session-viewer-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sessionviewer -p 5432:5432 postgres:15
```

In a second terminal:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sessionviewer STATIC_DIR=dist PORT=8080 npm run dev:server
```

Expected: the server starts on port `8080`.

- [ ] **Step 2: Create the ignored sessions table locally**

Run:

```bash
psql postgres://postgres:postgres@localhost:5432/sessionviewer <<'SQL'
create table if not exists ignored_sessions (
  environment text not null,
  device_id text not null,
  session_id text not null,
  session_path text not null,
  ignored_at timestamptz not null default now(),
  ignored_by_email text not null,
  primary key (environment, session_path)
);
SQL
```

Expected: `CREATE TABLE`.

- [ ] **Step 3: Run the frontend and verify active/ignored partitioning**

Run:

```bash
npm run dev:frontend
```

Manual verification:

- sign in with a Google account that can read the selected environment bucket
- confirm the frontend is served from `http://localhost:5173` and `/api` requests proxy to `http://localhost:8080`
- confirm the browser opens in `By Date`
- check a session in the active section and confirm it moves into the ignored section
- uncheck the same session and confirm it moves back into the active section

- [ ] **Step 4: Verify database persistence**

Run:

```bash
psql postgres://postgres:postgres@localhost:5432/sessionviewer -c "select environment, device_id, session_id, session_path, ignored_by_email from ignored_sessions order by ignored_at desc;"
```

Expected: one row after ignoring, zero rows after unignoring.

- [ ] **Step 5: Verify production artifacts**

Run:

```bash
npm test
npm run build
```

Expected: all tests PASS and the production build PASSes.

---

## Self-Review

### Spec coverage

- Unified deployment: covered in Task 5 (`Dockerfile`, Cloud Run, README).
- Cloud SQL persistence in a dedicated DB: covered in Task 5 and Task 6.
- API in this repo: covered in Task 1.
- Authorization by bucket access: covered in Task 1 via `authorizeAccessToken`.
- Store path, id, device id, ignored-by email: covered in Task 1 schema and repo.
- Separate active and ignored sections in device/date modes: covered in Task 4.
- Default `By Date` browser mode: covered in Task 3.

### Placeholder scan

- No `TODO` or `TBD` markers remain.
- Each file path is explicit.
- Each command is explicit.
- Each code step includes concrete code.

### Type consistency

- The plan consistently uses `environment`, `deviceId`, `sessionId`, `sessionPath`, `ignoredAt`, and `ignoredByEmail`.
- The frontend API payload uses `env`, which is mapped to `environment` server-side in the route handler.
- The UI partitions by `sessionPath` everywhere, matching the DB key.
