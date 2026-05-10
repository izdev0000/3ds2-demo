/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_ORIGIN: string
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
