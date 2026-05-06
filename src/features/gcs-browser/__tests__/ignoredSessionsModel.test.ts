import { describe, expect, it } from 'vitest'
import {
  createIgnoredSessionPathSet,
  parseSessionIdentity,
  partitionDateSessionEntries,
  partitionSessionPaths,
} from '../ignoredSessionsModel'

describe('ignoredSessionsModel', () => {
  it('parses device and session ids from a session path', () => {
    expect(parseSessionIdentity('device-a/20260502-143000')).toEqual({
      deviceId: 'device-a',
      sessionId: '20260502-143000',
      sessionPath: 'device-a/20260502-143000',
    })
  })

  it('partitions session paths by ignored state', () => {
    const ignored = createIgnoredSessionPathSet([
      {
        environment: 'dev',
        deviceId: 'device-a',
        sessionId: '20260502-143000',
        sessionPath: 'device-a/20260502-143000',
        ignoredAt: '2026-05-02T14:31:00.000Z',
        ignoredByEmail: 'user@example.com',
      },
    ])

    expect(
      partitionSessionPaths(
        ['device-a/20260502-143000', 'device-b/20260502-153000'],
        ignored,
      ),
    ).toEqual({
      active: ['device-b/20260502-153000'],
      ignored: ['device-a/20260502-143000'],
    })
  })

  it('partitions dated entries by ignored state', () => {
    const ignored = new Set<string>(['device-a/20260502-143000'])

    expect(partitionDateSessionEntries([
      { path: 'device-a/20260502-143000', device: 'device-a', ts: 1 },
      { path: 'device-b/20260502-153000', device: 'device-b', ts: 2 },
    ], ignored)).toEqual({
      active: [{ path: 'device-b/20260502-153000', device: 'device-b', ts: 2 }],
      ignored: [{ path: 'device-a/20260502-143000', device: 'device-a', ts: 1 }],
    })
  })
})
