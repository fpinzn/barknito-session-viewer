import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'

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
