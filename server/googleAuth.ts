import { BUCKETS } from './config.js'

export interface AuthorizedUser {
  email: string
}

interface TokenInfoResponse {
  email?: string
}

export async function authorizeAccessToken(token: string, environment: string): Promise<AuthorizedUser> {
  const bucket = BUCKETS[environment]
  if (!bucket) {
    throw new Error(`Unknown environment: ${environment}`)
  }

  // Authorize with objects.list — the permission the viewer actually uses. Reading
  // bucket metadata needs storage.buckets.get, which roles/storage.objectViewer
  // does not grant, so checking it locks out legitimate viewers.
  const bucketResponse = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o?maxResults=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  if (!bucketResponse.ok) {
    throw new Error(`Bucket access denied for environment ${environment}`)
  }

  const tokenInfoResponse = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
  )

  if (!tokenInfoResponse.ok) {
    throw new Error('Unable to resolve token identity')
  }

  const tokenInfo = await tokenInfoResponse.json() as TokenInfoResponse
  if (!tokenInfo.email) {
    throw new Error('Token email is missing')
  }

  return { email: tokenInfo.email }
}
