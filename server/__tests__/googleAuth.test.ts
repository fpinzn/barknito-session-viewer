import { afterEach, describe, expect, it, vi } from 'vitest'
import { authorizeAccessToken } from '../googleAuth.js'

const BUCKET = 'barknito-sessions-dev'
const BUCKET_METADATA_URL = `https://storage.googleapis.com/storage/v1/b/${BUCKET}`
const OBJECT_LIST_PREFIX = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`

/** Real GCS 403 body when the caller lacks the permission for the call. */
const INSUFFICIENT_PERMISSION = {
  error: {
    code: 403,
    message: 'Insufficient Permission',
    errors: [
      {
        message: 'Insufficient Permission',
        domain: 'global',
        reason: 'insufficientPermissions',
      },
    ],
  },
}

/** Real storage.objects.list body, trimmed to one item. */
const OBJECT_LISTING = {
  kind: 'storage#objects',
  items: [
    {
      kind: 'storage#object',
      id: `${BUCKET}/device-a/20260502-143000/meta.json/1746195060000000`,
      selfLink: `https://www.googleapis.com/storage/v1/b/${BUCKET}/o/device-a%2F20260502-143000%2Fmeta.json`,
      name: 'device-a/20260502-143000/meta.json',
      bucket: BUCKET,
      generation: '1746195060000000',
      metageneration: '1',
      contentType: 'application/json',
      storageClass: 'STANDARD',
      size: '482',
      md5Hash: 'y1RiKZ0nT7hFrDCXW1PJ2g==',
      crc32c: 'HcKmJw==',
      etag: 'CIC0zqHl4v0CEAE=',
      timeCreated: '2026-05-02T14:31:00.000Z',
      updated: '2026-05-02T14:31:00.000Z',
    },
  ],
}

/** Real oauth2 tokeninfo body for a token carrying the devstorage.read_only scope. */
const TOKEN_INFO = {
  azp: '582116162882-crq4u850jgudhakqifjtscf893934dab.apps.googleusercontent.com',
  aud: '582116162882-crq4u850jgudhakqifjtscf893934dab.apps.googleusercontent.com',
  sub: '104721037492018374625',
  scope: 'openid https://www.googleapis.com/auth/devstorage.read_only https://www.googleapis.com/auth/userinfo.email',
  exp: '1785000000',
  expires_in: '3521',
  email: 'diana@barknito.com',
  email_verified: 'true',
  access_type: 'online',
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Stands in for Google's endpoints. `bucketMetadataStatus` models the caller's
 * storage.buckets.get permission; `objectListStatus` models storage.objects.list.
 */
function stubGoogle(options: { bucketMetadataStatus: number; objectListStatus: number }) {
  const fetchStub = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()

    if (url.startsWith(OBJECT_LIST_PREFIX)) {
      return options.objectListStatus === 200
        ? jsonResponse(OBJECT_LISTING, 200)
        : jsonResponse(INSUFFICIENT_PERMISSION, options.objectListStatus)
    }
    if (url.startsWith(BUCKET_METADATA_URL)) {
      return options.bucketMetadataStatus === 200
        ? jsonResponse({ kind: 'storage#bucket', id: BUCKET, name: BUCKET }, 200)
        : jsonResponse(INSUFFICIENT_PERMISSION, options.bucketMetadataStatus)
    }
    if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
      return jsonResponse(TOKEN_INFO, 200)
    }

    throw new Error(`Unexpected fetch: ${url}`)
  })

  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('authorizeAccessToken', () => {
  it('authorizes a viewer who can list objects but cannot read bucket metadata', async () => {
    stubGoogle({ bucketMetadataStatus: 403, objectListStatus: 200 })

    await expect(authorizeAccessToken('viewer-token', 'dev')).resolves.toEqual({
      email: 'diana@barknito.com',
    })
  })

  it('rejects a token that cannot list objects in the bucket', async () => {
    stubGoogle({ bucketMetadataStatus: 200, objectListStatus: 403 })

    await expect(authorizeAccessToken('outsider-token', 'dev')).rejects.toThrow(
      /access denied for environment dev/i,
    )
  })

  it('rejects an unknown environment before calling Google', async () => {
    const fetchStub = stubGoogle({ bucketMetadataStatus: 200, objectListStatus: 200 })

    await expect(authorizeAccessToken('viewer-token', 'staging')).rejects.toThrow(
      /unknown environment: staging/i,
    )
    expect(fetchStub).not.toHaveBeenCalled()
  })
})
