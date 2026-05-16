import { describe, expect, it, vi } from 'vitest'
import { ensureIgnoredSessionsTable } from '../db.js'

describe('ensureIgnoredSessionsTable', () => {
  it('creates the ignored_sessions table when it is missing', async () => {
    const query = vi.fn().mockResolvedValue(undefined)

    await ensureIgnoredSessionsTable({ query } as never)

    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][0]).toContain('create table if not exists ignored_sessions')
    expect(query.mock.calls[0][0]).toContain('primary key (environment, device_id, session_id)')
  })
})
