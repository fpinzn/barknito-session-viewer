import { Pool } from 'pg'

export function createPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 2,
  })
}

export async function ensureIgnoredSessionsTable(pool: Pool): Promise<void> {
  await pool.query(`create table if not exists ignored_sessions (
    environment text not null,
    device_id text not null,
    session_id text not null,
    session_path text not null,
    ignored_at timestamptz not null default now(),
    ignored_by_email text not null,
    primary key (environment, device_id, session_id)
  )`)
}
