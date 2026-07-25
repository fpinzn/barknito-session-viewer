import { describe, expect, it, vi } from 'vitest'

describe('ignoredSessionsApi', () => {
  it('loads when the ignored sessions API base URL is unset', async () => {
    vi.stubEnv('VITE_IGNORED_SESSIONS_API_BASE_URL', undefined)
    vi.resetModules()

    const api = await import('../ignoredSessionsApi')

    expect(api.listIgnoredSessions).toBeTypeOf('function')
  })

  it('returns no ignored sessions when the API base URL is unset', async () => {
    vi.stubEnv('VITE_IGNORED_SESSIONS_API_BASE_URL', undefined)
    vi.resetModules()

    const api = await import('../ignoredSessionsApi')

    await expect(api.listIgnoredSessions('dev')).resolves.toEqual([])
  })
})
