import { getToken, clearToken, trySilentRefresh } from './auth'
import { ingestFile } from '../file-ingest/ingest'
import { useSessionStore } from '../../stores/sessionStore'

export const BUCKETS: Record<string, string> = {
  dev: 'barknito-sessions-dev',
  prod: 'barknito-sessions-prod',
}

export async function gcsGet(url: string): Promise<Response> {
  let token = getToken()
  if (!token) throw new Error('Not authenticated')

  let resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  // On 401, try a silent refresh and retry once before giving up
  if (resp.status === 401) {
    const refreshed = await trySilentRefresh()
    if (refreshed) {
      token = getToken()
      resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
    }
    if (resp.status === 401) {
      clearToken()
      throw new Error('Token expired — please sign in again')
    }
  }

  if (!resp.ok) {
    throw new Error(`GCS error ${resp.status}: ${await resp.text()}`)
  }

  return resp
}

interface GcsListResult {
  prefixes?: string[]
  items?: Array<{ name: string; [key: string]: unknown }>
}

export async function gcsList(bucket: string, prefix: string, delimiter: string): Promise<GcsListResult> {
  const params = new URLSearchParams({ prefix, delimiter })
  const resp = await gcsGet(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o?${params}`
  )
  return resp.json()
}

export async function fetchAndIngest(bucket: string, objectName: string) {
  const url = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media`
  const resp = await gcsGet(url)
  const filename = objectName.split('/').pop() || objectName
  console.log(`GCS: fetching ${filename} (${objectName})`)

  if (filename.endsWith('.mp4') || filename.endsWith('.mov')) {
    const mimeType = filename.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'
    const rawBlob = await resp.blob()
    const blob = new Blob([rawBlob], { type: mimeType })
    const blobUrl = URL.createObjectURL(blob)

    if (filename.toLowerCase().includes('depth')) {
      useSessionStore.getState().setDepthVideoUrl(blobUrl)
    } else {
      useSessionStore.getState().setVideoUrl(blobUrl)
    }
    return
  }

  if (filename.endsWith('.m4a')) {
    const rawBlob = await resp.blob()
    const blob = new Blob([rawBlob], { type: 'audio/mp4' })
    const blobUrl = URL.createObjectURL(blob)
    useSessionStore.getState().setAudioUrl(blobUrl)
    return
  }

  if (filename.endsWith('.gz')) {
    const innerName = filename.replace(/\.gz$/i, '')
    const ds = new DecompressionStream('gzip')
    const chunks: BlobPart[] = []
    await resp.body!.pipeThrough(ds).pipeTo(new WritableStream({
      write(chunk: Uint8Array) { chunks.push(chunk as BlobPart) },
    }))
    const text = await new Blob(chunks).text()
    // Create a synthetic file to pass through the ingest pipeline
    const file = new File([text], innerName, { type: 'text/plain' })
    await ingestFile(file)
    return
  }

  const text = await resp.text()
  const file = new File([text], filename, { type: 'text/plain' })
  await ingestFile(file)
}

export interface LoadFolderProgress {
  total: number
  loaded: number
  currentFile: string
}

export async function loadFolder(
  env: string,
  folder: string,
  onProgress?: (p: LoadFolderProgress) => void,
): Promise<void> {
  const bucket = BUCKETS[env]
  if (!bucket) throw new Error(`Unknown environment: ${env}`)

  // List all objects (paginate if needed)
  const allObjects: Array<{ name: string; [key: string]: unknown }> = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({ prefix: folder + '/', delimiter: '' })
    if (pageToken) params.set('pageToken', pageToken)
    const resp = await gcsGet(
      `https://storage.googleapis.com/storage/v1/b/${bucket}/o?${params}`
    )
    const result = await resp.json()
    if (result.items) allObjects.push(...result.items)
    pageToken = result.nextPageToken
  } while (pageToken)

  if (allObjects.length === 0) {
    throw new Error('No files found in this folder.')
  }

  console.log(`GCS: found ${allObjects.length} objects in ${folder}:`, allObjects.map(o => o.name))

  let loaded = 0
  for (const obj of allObjects) {
    const fname = obj.name.split('/').pop() || obj.name
    // Skip "directory" markers (trailing slash, zero-length)
    if (!fname || fname.endsWith('/')) {
      loaded++
      continue
    }
    onProgress?.({ total: allObjects.length, loaded, currentFile: fname })
    try {
      await fetchAndIngest(bucket, obj.name)
    } catch (e) {
      console.warn(`Failed to fetch ${obj.name}:`, e)
    }
    loaded++
  }
  onProgress?.({ total: allObjects.length, loaded, currentFile: '' })
}
