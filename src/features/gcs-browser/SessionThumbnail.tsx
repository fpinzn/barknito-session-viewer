import { useEffect, useState } from 'react'
import { BUCKETS, gcsGet } from './gcsApi'

const cache = new Map<string, Promise<string | null>>()

async function fetchThumbnail(bucket: string, sessionPath: string): Promise<string | null> {
  const objectName = `${sessionPath}/thumbnail.jpg`
  const url = `https://storage.googleapis.com/download/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media`
  try {
    const resp = await gcsGet(url)
    const blob = await resp.blob()
    if (!blob.type.startsWith('image/')) {
      const typed = new Blob([blob], { type: 'image/jpeg' })
      return URL.createObjectURL(typed)
    }
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

function getThumbnail(bucket: string, sessionPath: string): Promise<string | null> {
  const key = `${bucket}/${sessionPath}`
  let p = cache.get(key)
  if (!p) {
    p = fetchThumbnail(bucket, sessionPath)
    cache.set(key, p)
  }
  return p
}

interface Props {
  env: string
  sessionPath: string
}

export function SessionThumbnail({ env, sessionPath }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setUrl(null)
    setBroken(false)
    const bucket = BUCKETS[env]
    if (!bucket) return
    getThumbnail(bucket, sessionPath).then(u => {
      if (cancelled) return
      setUrl(u)
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [env, sessionPath])

  if (url && !broken) {
    return (
      <img
        className="session-thumb"
        src={url}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
      />
    )
  }
  return <div className={`session-thumb placeholder${loaded ? ' missing' : ''}`} />
}
