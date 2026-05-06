import type { Pool } from 'pg'

export interface IgnoredSessionRow {
  environment: string
  deviceId: string
  sessionId: string
  sessionPath: string
  ignoredAt: string
  ignoredByEmail: string
}

export interface IgnoredSessionInput {
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
    order by device_id, session_id`,
    [environment],
  )

  return result.rows as IgnoredSessionRow[]
}

export async function setIgnoredSession(pool: Pool, input: IgnoredSessionInput): Promise<void> {
  await pool.query(
    `insert into ignored_sessions (
      environment,
      device_id,
      session_id,
      session_path,
      ignored_by_email
    ) values ($1, $2, $3, $4, $5)
    on conflict (environment, device_id, session_id)
    do update set
      session_path = excluded.session_path,
      ignored_by_email = excluded.ignored_by_email,
      ignored_at = now()`,
    [
      input.environment,
      input.deviceId,
      input.sessionId,
      input.sessionPath,
      input.ignoredByEmail,
    ],
  )
}

export async function clearIgnoredSession(
  pool: Pool,
  environment: string,
  deviceId: string,
  sessionId: string,
): Promise<void> {
  await pool.query(
    `delete from ignored_sessions
    where environment = $1 and device_id = $2 and session_id = $3`,
    [environment, deviceId, sessionId],
  )
}
