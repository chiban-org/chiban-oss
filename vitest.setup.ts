import { inject } from 'vitest'

const mutableEnv = process.env as Record<string, string | undefined>
mutableEnv.NODE_ENV ??= 'test'
mutableEnv.DATABASE_URL ??= 'postgres://placeholder:placeholder@localhost:5432/placeholder'
mutableEnv.BASE_URL = mutableEnv.BASE_URL?.startsWith('http')
  ? mutableEnv.BASE_URL
  : 'https://alderpond.example'
mutableEnv.CHIBAN_SECRET_KEYS ??= JSON.stringify({ k1: Buffer.alloc(32, 7).toString('base64') })
mutableEnv.CHIBAN_ACTIVE_KEY_ID ??= 'k1'

function applyMinioConfig(): void {
  try {
    const minio = inject('testMinio')
    mutableEnv.S3_ENDPOINT = minio.endpoint
    mutableEnv.S3_PUBLIC_ENDPOINT = minio.publicEndpoint
    mutableEnv.S3_BUCKET = minio.bucket
    mutableEnv.S3_ACCESS_KEY_ID = minio.accessKeyId
    mutableEnv.S3_SECRET_ACCESS_KEY = minio.secretAccessKey
    mutableEnv.S3_REGION = minio.region
  } catch {
    return
  }
}

applyMinioConfig()

export {}
