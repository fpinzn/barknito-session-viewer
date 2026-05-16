/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IGNORED_SESSIONS_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
