const OAUTH_CLIENT_ID = '582116162882-crq4u850jgudhakqifjtscf893934dab.apps.googleusercontent.com'
const SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only'

let gcsToken: string | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

export function saveToken(token: string, expiresIn: number) {
  localStorage.setItem('gcs_token', token)
  localStorage.setItem('gcs_token_expiry', (Date.now() + (expiresIn - 60) * 1000).toString())
  gcsToken = token
  scheduleRefresh(expiresIn)
}

export function loadToken(): string | null {
  const token = localStorage.getItem('gcs_token')
  const expiry = parseInt(localStorage.getItem('gcs_token_expiry') || '0')
  if (token && Date.now() < expiry) {
    gcsToken = token
    // Schedule refresh for the remaining lifetime
    const remainingSec = Math.floor((expiry - Date.now()) / 1000)
    scheduleRefresh(remainingSec)
    return token
  }
  return null
}

export function clearToken() {
  localStorage.removeItem('gcs_token')
  localStorage.removeItem('gcs_token_expiry')
  gcsToken = null
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

export function getToken(): string | null {
  return gcsToken
}

/** Schedule a silent token refresh 5 minutes before expiry. */
function scheduleRefresh(expiresInSec: number) {
  if (refreshTimer) clearTimeout(refreshTimer)
  // Refresh 5 minutes before expiry, minimum 30 seconds from now
  const delayMs = Math.max(30_000, (expiresInSec - 300) * 1000)
  refreshTimer = setTimeout(async () => {
    const ok = await trySilentRefresh()
    if (!ok) console.warn('Auto token refresh failed — will retry on next API call')
  }, delayMs)
}

declare const google: {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string
        scope: string
        prompt?: string
        callback: (resp: { error?: string; access_token?: string; expires_in?: number }) => void
      }): { requestAccessToken(): void }
    }
  }
}

export function initGoogleSignIn(onSuccess: () => void) {
  google.accounts.oauth2.initTokenClient({
    client_id: OAUTH_CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      if (resp.error) {
        console.error('OAuth error:', resp)
        return
      }
      if (resp.access_token) {
        saveToken(resp.access_token, resp.expires_in || 3600)
        onSuccess()
      }
    },
  }).requestAccessToken()
}

export async function trySilentRefresh(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof google === 'undefined' || !google.accounts) {
      resolve(false)
      return
    }
    google.accounts.oauth2.initTokenClient({
      client_id: OAUTH_CLIENT_ID,
      scope: SCOPE,
      prompt: '',
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          resolve(false)
          return
        }
        saveToken(resp.access_token, resp.expires_in || 3600)
        resolve(true)
      },
    }).requestAccessToken()
  })
}

export function isGsiAvailable(): boolean {
  return typeof google !== 'undefined' && !!google.accounts
}
