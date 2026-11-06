import { inject } from 'vitest'

const mutableEnv = process.env as Record<string, string | undefined>
mutableEnv.NODE_ENV ??= 'test'
mutableEnv.DATABASE_URL ??= 'postgres://placeholder:placeholder@localhost:5432/placeholder'
mutableEnv.BASE_URL = mutableEnv.BASE_URL?.startsWith('http')
  ? mutableEnv.BASE_URL
  : 'https://alderpond.example'
mutableEnv.CHIBAN_SECRET_KEYS ??= JSON.stringify({ k1: Buffer.alloc(32, 7).toString('base64') })
mutableEnv.CHIBAN_ACTIVE_KEY_ID ??= 'k1'

function applyObjectStoreConfig(): void {
  try {
    const store = inject('testObjectStore')
    mutableEnv.S3_ENDPOINT = store.endpoint
    mutableEnv.S3_PUBLIC_ENDPOINT = store.publicEndpoint
    mutableEnv.S3_BUCKET = store.bucket
    mutableEnv.S3_ACCESS_KEY_ID = store.accessKeyId
    mutableEnv.S3_SECRET_ACCESS_KEY = store.secretAccessKey
    mutableEnv.S3_REGION = store.region
  } catch {
    return
  }
}

applyObjectStoreConfig()

class ResizeObserverStub {
  observe = (): undefined => undefined
  unobserve = (): undefined => undefined
  disconnect = (): undefined => undefined
}

if (!('ResizeObserver' in globalThis)) {
  Object.assign(globalThis, { ResizeObserver: ResizeObserverStub })
}

export {}
