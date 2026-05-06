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
