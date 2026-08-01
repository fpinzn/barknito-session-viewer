import { gcsGet } from './gcsApi'
import { levelHeader } from '../paw-floor/levelProgress'

/**
 * The level caption for a session card.
 *
 * `levelHeader` already knows both places a level can hide and skips dev-menu
 * free play; a card is too narrow for `Level 3 — Weave`, so the name alone wins
 * when the bundle carries one.
 */
export function sessionLevelLabel(config: unknown, meta: unknown): string | null {
  const level = levelHeader(config, meta)
  if (!level) return null
  return level.name ? level.name : `Level ${level.number}`
}

const cache = new Map<string, Promise<string | null>>()

async function fetchJson(bucket: string, objectName: string): Promise<unknown | null> {
  const url = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media`
  try {
    const resp = await gcsGet(url)
    return await resp.json()
  } catch {
    return null
  }
}

async function fetchSessionLevel(bucket: string, sessionPath: string): Promise<string | null> {
  const config = await fetchJson(bucket, `${sessionPath}/level_config.json`)
  const fromConfig = sessionLevelLabel(config, null)
  if (fromConfig) return fromConfig

  // Bundles predating level_config.json still record levelNumber in the meta,
  // so only those pay for the second request.
  const meta = await fetchJson(bucket, `${sessionPath}/session_meta.json`)
  return sessionLevelLabel(null, meta)
}

/** Cached per session — the browser re-mounts cards on every filter toggle. */
export function getSessionLevel(bucket: string, sessionPath: string): Promise<string | null> {
  const key = `${bucket}/${sessionPath}`
  let p = cache.get(key)
  if (!p) {
    p = fetchSessionLevel(bucket, sessionPath)
    cache.set(key, p)
  }
  return p
}

export function __clearSessionLevelCache(): void {
  cache.clear()
}
