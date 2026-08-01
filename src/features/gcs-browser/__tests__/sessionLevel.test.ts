import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionLevel, sessionLevelLabel, __clearSessionLevelCache } from '../sessionLevel'
import { gcsGet } from '../gcsApi'

vi.mock('../gcsApi', () => ({
  gcsGet: vi.fn(),
}))

const mockGcsGet = vi.mocked(gcsGet)

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as Response
}

describe('sessionLevelLabel', () => {
  it('prefers the level name from the level config', () => {
    expect(sessionLevelLabel({ levelNumber: 3, levelName: 'Weave' }, null)).toBe('Weave')
  })

  it('falls back to the level number when the config has no name', () => {
    expect(sessionLevelLabel({ levelNumber: 3 }, null)).toBe('Level 3')
  })

  it('reads the level number off session meta when there is no config', () => {
    expect(sessionLevelLabel(null, { levelNumber: 7 })).toBe('Level 7')
  })

  it('has no label for a session with no level at all', () => {
    expect(sessionLevelLabel(null, { deviceId: 'abc' })).toBeNull()
  })

  it('has no label for a dev-menu free-play session', () => {
    expect(sessionLevelLabel({ levelNumber: -1, levelName: 'Dev' }, null)).toBeNull()
  })
})

describe('getSessionLevel', () => {
  beforeEach(() => {
    __clearSessionLevelCache()
    mockGcsGet.mockReset()
  })

  it('labels a session from its level config', async () => {
    mockGcsGet.mockResolvedValueOnce(jsonResponse({ levelNumber: 2, levelName: 'Fetch' }))

    expect(await getSessionLevel('bucket', 'dev/20260801-101010')).toBe('Fetch')
    expect(mockGcsGet).toHaveBeenCalledTimes(1)
  })

  it('falls back to session meta on bundles that predate level_config.json', async () => {
    mockGcsGet
      .mockRejectedValueOnce(new Error('GCS error 404'))
      .mockResolvedValueOnce(jsonResponse({ levelNumber: 5 }))

    expect(await getSessionLevel('bucket', 'dev/20260801-101010')).toBe('Level 5')
  })

  it('resolves to null rather than throwing when neither file is there', async () => {
    mockGcsGet.mockRejectedValue(new Error('GCS error 404'))

    expect(await getSessionLevel('bucket', 'dev/20260801-101010')).toBeNull()
  })

  it('fetches each session only once', async () => {
    mockGcsGet.mockResolvedValue(jsonResponse({ levelNumber: 2, levelName: 'Fetch' }))

    await getSessionLevel('bucket', 'dev/20260801-101010')
    await getSessionLevel('bucket', 'dev/20260801-101010')

    expect(mockGcsGet).toHaveBeenCalledTimes(1)
  })
})
